// App state. The project is the only thing with undo history; every change to
// it goes through commit() so undo, redo and autosave stay in one place.

import { create } from 'zustand'
import { DEFAULT_SETTINGS } from '../model/defaults'
import { flipPlaced, GRID, partGeometry, MISSING_SIZE, rotatePlaced, rotatedSize, snapPlaced } from '../model/geometry'
import { RAIL_MAX, RAIL_MIN, railCount, railPinId, resolveDef } from '../model/parts'
import type { Library, PartDef, PinRef, PlacedPart, Point, Project, ProjectSummary, Settings, Wire } from '../model/types'
import { api } from './api'

export interface Selection {
  parts: string[]
  wires: string[]
}

export interface View {
  /** Pixels per millimetre. */
  zoom: number
  /** Screen position of the desk origin, in pixels. */
  x: number
  y: number
}

export type SaveState = 'saved' | 'saving' | 'error'

const HISTORY_LIMIT = 100
const SAVE_DELAY = 500
const LAST_PROJECT_KEY = 'wirebench:last-project'
const EMPTY: Selection = { parts: [], wires: [] }

export const uid = () => Math.random().toString(36).slice(2, 10)

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'project'

function blankProject(name: string): Project {
  return { id: `${slug(name)}-${uid().slice(0, 4)}`, name, parts: [], wires: [] }
}

const samePin = (a: PinRef, b: PinRef) => a.part === b.part && a.pin === b.pin

function remember(id: string) {
  try {
    localStorage.setItem(LAST_PROJECT_KEY, id)
  } catch {
    // No localStorage (tests, private mode): opening the newest project is fine.
  }
}

function recall(): string | null {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY)
  } catch {
    return null
  }
}

interface State {
  loaded: boolean
  loadError: string | null
  library: Library
  settings: Settings
  project: Project
  projects: ProjectSummary[]
  selection: Selection
  /** 'auto' follows the pin types; a hex color is applied to wires drawn next. */
  wireColor: string
  view: View
  past: Project[]
  future: Project[]
  saveState: SaveState
  partSettingsId: string | null
  settingsOpen: boolean

  load(): Promise<void>
  addPart(partId: string, center: Point): string
  setPartPositions(positions: Record<string, Point>): void
  moveParts(ids: string[], dx: number, dy: number, snap: boolean): void
  setPartLabel(id: string, label: string): void
  /** Sets how many pins a rail has. Returns false when a pin that would go still has a wire. */
  setRailPins(id: string, count: number): boolean
  rotateSelected(): void
  flipSelected(): void
  duplicateSelected(): void
  deleteSelected(): void
  addWire(a: PinRef, b: PinRef): string | null
  setWireColor(id: string, color: string | undefined): void
  setWirePoints(id: string, points: Point[], record?: boolean): void
  select(sel: Partial<Selection>, additive?: boolean): void
  clearSelection(): void
  beginDrag(): void
  undo(): void
  redo(): void
  newProject(name: string): Promise<void>
  openProject(id: string): Promise<void>
  renameProject(name: string): void
  deleteProject(id: string): Promise<void>
  updateSettings(s: Settings): void
  updatePart(def: PartDef): Promise<void>
  setWireColorMode(color: string): void
  setView(v: View): void
  openPartSettings(id: string | null): void
  setSettingsOpen(open: boolean): void
  flushSave(): Promise<void>
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
let loading: Promise<void> | undefined

export const useStore = create<State>((set, get) => {
  async function saveNow() {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = undefined
    const project = { ...get().project, updated: new Date().toISOString() }
    try {
      await api.putProject(project)
      // Only report "saved" if nothing changed while the request was in flight.
      if (!saveTimer) set({ saveState: 'saved' })
      set((s) => ({
        projects: [
          { id: project.id, name: project.name, updated: project.updated },
          ...s.projects.filter((p) => p.id !== project.id),
        ],
      }))
    } catch {
      set({ saveState: 'error' })
    }
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer)
    set({ saveState: 'saving' })
    saveTimer = setTimeout(() => {
      saveTimer = undefined
      void saveNow()
    }, SAVE_DELAY)
  }

  /** Apply a change to the project as one undo step. */
  function commit(change: (p: Project) => Project) {
    const before = get().project
    const after = change(before)
    if (after === before) return
    set((s) => ({ project: after, past: [...s.past, before].slice(-HISTORY_LIMIT), future: [] }))
    scheduleSave()
  }

  /** Apply a change without a new undo step (used while a drag is in progress). */
  function amend(change: (p: Project) => Project) {
    const before = get().project
    const after = change(before)
    if (after === before) return
    set({ project: after })
    scheduleSave()
  }

  const def = (placed: PlacedPart) => resolveDef(get().library, placed)

  function movedProject(p: Project, positions: Record<string, Point>): Project {
    const delta: Record<string, Point> = {}
    const parts = p.parts.map((part) => {
      const to = positions[part.id]
      if (!to || (to.x === part.x && to.y === part.y)) return part
      delta[part.id] = { x: to.x - part.x, y: to.y - part.y }
      return { ...part, x: to.x, y: to.y }
    })
    if (!Object.keys(delta).length) return p
    // A wire's bend points travel with it when both of its ends moved by the same amount.
    const wires = p.wires.map((w) => {
      const da = delta[w.a.part]
      const db = delta[w.b.part]
      if (!w.points?.length || !da || !db || da.x !== db.x || da.y !== db.y) return w
      return { ...w, points: w.points.map((pt) => ({ x: pt.x + da.x, y: pt.y + da.y })) }
    })
    return { ...p, parts, wires }
  }

  function transformSelected(fn: (placed: PlacedPart) => PlacedPart) {
    const ids = new Set(get().selection.parts)
    if (!ids.size) return
    const snap = get().settings.snap
    commit((p) => ({
      ...p,
      parts: p.parts.map((part) => {
        if (!ids.has(part.id)) return part
        const next = fn(part)
        return snap ? { ...next, ...snapPlaced(def(next), next) } : next
      }),
    }))
  }

  async function switchTo(project: Project) {
    await get().flushSave()
    set({ project, past: [], future: [], selection: EMPTY, saveState: 'saved' })
    remember(project.id)
  }

  return {
    loaded: false,
    loadError: null,
    library: {},
    settings: DEFAULT_SETTINGS,
    project: blankProject('Untitled'),
    projects: [],
    selection: EMPTY,
    wireColor: 'auto',
    view: { zoom: 6, x: 40, y: 40 },
    past: [],
    future: [],
    saveState: 'saved',
    partSettingsId: null,
    settingsOpen: false,

    async load() {
      // React's development mode runs effects twice; one load is enough.
      if (loading) return loading
      loading = (async () => {
      try {
        const [parts, settings, projects] = await Promise.all([api.getLibrary(), api.getSettings(), api.listProjects()])
        const library: Library = {}
        for (const part of parts) library[part.id] = part
        set({ library, settings, projects })
        const wanted = recall()
        const pick = projects.find((p) => p.id === wanted) ?? projects[0]
        if (pick) {
          const project = await api.getProject(pick.id)
          set({ project: { ...project, parts: project.parts ?? [], wires: project.wires ?? [] } })
          remember(project.id)
        } else {
          const project = blankProject('Untitled')
          set({ project })
          await api.putProject(project)
          set({ projects: [{ id: project.id, name: project.name }] })
          remember(project.id)
        }
        set({ loaded: true, loadError: null })
      } catch (err) {
        set({ loadError: err instanceof Error ? err.message : String(err) })
      } finally {
        loading = undefined
      }
      })()
      return loading
    },

    addPart(partId, center) {
      const id = uid()
      const d = resolveDef(get().library, { partId })
      const size = d ? rotatedSize(partGeometry(d, false), 0) : MISSING_SIZE
      let placed: PlacedPart = { id, partId, x: center.x - size.w / 2, y: center.y - size.h / 2, rotation: 0, flipped: false }
      if (get().settings.snap) placed = { ...placed, ...snapPlaced(d, placed) }
      commit((p) => ({ ...p, parts: [...p.parts, placed] }))
      set({ selection: { parts: [id], wires: [] } })
      return id
    },

    setPartPositions(positions) {
      amend((p) => movedProject(p, positions))
    },

    moveParts(ids, dx, dy, snap) {
      const positions: Record<string, Point> = {}
      for (const part of get().project.parts) {
        if (!ids.includes(part.id)) continue
        const moved = { ...part, x: part.x + dx, y: part.y + dy }
        positions[part.id] = snap ? snapPlaced(def(moved), moved) : { x: moved.x, y: moved.y }
      }
      commit((p) => movedProject(p, positions))
    },

    setPartLabel(id, label) {
      const clean = label.trim()
      commit((p) => ({
        ...p,
        parts: p.parts.map((part) => {
          if (part.id !== id) return part
          const { label: _old, ...rest } = part
          return clean ? { ...rest, label: clean } : rest
        }),
      }))
    },

    setRailPins(id, count) {
      const placed = get().project.parts.find((p) => p.id === id)
      if (!placed || !get().library[placed.partId]?.rail) return false
      const next = Math.min(RAIL_MAX, Math.max(RAIL_MIN, Math.round(count)))
      const current = railCount(placed)
      if (next === current) return true
      // Never drop a pin that still has a wire: the wire would vanish without a trace.
      const going = new Set(Array.from({ length: Math.max(0, current - next) }, (_, i) => railPinId(next + i)))
      const wired = get().project.wires.some((w) => [w.a, w.b].some((e) => e.part === id && going.has(e.pin)))
      if (wired) return false
      commit((p) => ({ ...p, parts: p.parts.map((part) => (part.id === id ? { ...part, pins: next } : part)) }))
      return true
    },

    rotateSelected() {
      transformSelected((part) => rotatePlaced(def(part), part))
    },

    flipSelected() {
      transformSelected((part) => flipPlaced(def(part), part))
    },

    duplicateSelected() {
      const sel = get().selection
      if (!sel.parts.length) return
      const idMap = new Map<string, string>()
      const offset = GRID * 2
      commit((p) => {
        const copies = p.parts
          .filter((part) => sel.parts.includes(part.id))
          .map((part) => {
            const id = uid()
            idMap.set(part.id, id)
            return { ...part, id, x: part.x + offset, y: part.y + offset }
          })
        // Wires come along only when both of their ends were copied.
        const wires = p.wires
          .filter((w) => idMap.has(w.a.part) && idMap.has(w.b.part))
          .map((w) => ({
            ...w,
            id: uid(),
            a: { ...w.a, part: idMap.get(w.a.part)! },
            b: { ...w.b, part: idMap.get(w.b.part)! },
            points: w.points?.map((pt) => ({ x: pt.x + offset, y: pt.y + offset })),
          }))
        return { ...p, parts: [...p.parts, ...copies], wires: [...p.wires, ...wires] }
      })
      set({ selection: { parts: [...idMap.values()], wires: [] } })
    },

    deleteSelected() {
      const sel = get().selection
      if (!sel.parts.length && !sel.wires.length) return
      const parts = new Set(sel.parts)
      const wires = new Set(sel.wires)
      commit((p) => ({
        ...p,
        parts: p.parts.filter((part) => !parts.has(part.id)),
        // A wire cannot outlive either of its ends.
        wires: p.wires.filter((w) => !wires.has(w.id) && !parts.has(w.a.part) && !parts.has(w.b.part)),
      }))
      set({ selection: EMPTY })
    },

    addWire(a, b) {
      if (samePin(a, b)) return null
      const { project, wireColor } = get()
      const exists = project.wires.some(
        (w) => (samePin(w.a, a) && samePin(w.b, b)) || (samePin(w.a, b) && samePin(w.b, a)),
      )
      if (exists) return null
      const wire: Wire = { id: uid(), a, b, ...(wireColor !== 'auto' ? { color: wireColor } : {}) }
      commit((p) => ({ ...p, wires: [...p.wires, wire] }))
      set({ selection: { parts: [], wires: [wire.id] } })
      return wire.id
    },

    setWireColor(id, color) {
      commit((p) => ({
        ...p,
        wires: p.wires.map((w) => {
          if (w.id !== id) return w
          const { color: _old, ...rest } = w
          return color ? { ...rest, color } : rest
        }),
      }))
    },

    setWirePoints(id, points, record = true) {
      const change = (p: Project): Project => ({
        ...p,
        wires: p.wires.map((w) => {
          if (w.id !== id) return w
          const { points: _old, ...rest } = w
          return points.length ? { ...rest, points } : rest
        }),
      })
      if (record) commit(change)
      else amend(change)
    },

    select(sel, additive = false) {
      const next: Selection = { parts: sel.parts ?? [], wires: sel.wires ?? [] }
      if (!additive) {
        set({ selection: next })
        return
      }
      // Shift-click toggles membership.
      const toggle = (have: string[], add: string[]) => {
        const out = new Set(have)
        for (const id of add) {
          if (out.has(id)) out.delete(id)
          else out.add(id)
        }
        return [...out]
      }
      const cur = get().selection
      set({ selection: { parts: toggle(cur.parts, next.parts), wires: toggle(cur.wires, next.wires) } })
    },

    clearSelection() {
      set({ selection: EMPTY })
    },

    beginDrag() {
      const before = get().project
      set((s) => ({ past: [...s.past, before].slice(-HISTORY_LIMIT), future: [] }))
    },

    undo() {
      const { past, project, future } = get()
      if (!past.length) return
      set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future], selection: EMPTY })
      scheduleSave()
    },

    redo() {
      const { past, project, future } = get()
      if (!future.length) return
      set({ project: future[0], past: [...past, project], future: future.slice(1), selection: EMPTY })
      scheduleSave()
    },

    async newProject(name) {
      const project = blankProject(name.trim() || 'Untitled')
      await switchTo(project)
      await api.putProject({ ...project, updated: new Date().toISOString() })
      set((s) => ({ projects: [{ id: project.id, name: project.name }, ...s.projects] }))
    },

    async openProject(id) {
      if (id === get().project.id) return
      await get().flushSave()
      const project = await api.getProject(id)
      await switchTo({ ...project, parts: project.parts ?? [], wires: project.wires ?? [] })
    },

    renameProject(name) {
      const clean = name.trim()
      if (!clean || clean === get().project.name) return
      // The file keeps its id; only the display name changes. Not an undo step.
      set((s) => ({ project: { ...s.project, name: clean } }))
      scheduleSave()
    },

    async deleteProject(id) {
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = undefined
      await api.deleteProject(id)
      const remaining = get().projects.filter((p) => p.id !== id)
      set({ projects: remaining })
      if (id !== get().project.id) return
      if (remaining[0]) {
        const next = await api.getProject(remaining[0].id)
        set({ project: next, past: [], future: [], selection: EMPTY, saveState: 'saved' })
        remember(next.id)
      } else {
        const fresh = blankProject('Untitled')
        set({ project: fresh, past: [], future: [], selection: EMPTY, saveState: 'saved' })
        await api.putProject(fresh)
        set({ projects: [{ id: fresh.id, name: fresh.name }] })
        remember(fresh.id)
      }
    },

    updateSettings(s) {
      set({ settings: s })
      void api.putSettings(s).catch(() => set({ saveState: 'error' }))
    },

    async updatePart(d) {
      set((s) => ({ library: { ...s.library, [d.id]: d } }))
      await api.putPart(d)
    },

    setWireColorMode(color) {
      set({ wireColor: color })
    },

    setView(v) {
      set({ view: v })
    },

    openPartSettings(id) {
      set({ partSettingsId: id })
    },

    setSettingsOpen(open) {
      set({ settingsOpen: open })
    },

    async flushSave() {
      if (saveTimer) await saveNow()
    },
  }
})
