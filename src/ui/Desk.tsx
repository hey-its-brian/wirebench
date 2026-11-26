// The desk: one SVG in millimetres. Handles panning, zooming, selecting,
// moving parts and drawing wires.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { resolveWireColor } from '../model/colors'
import { dist, GRID, placedBounds, snapPlaced, snapTo } from '../model/geometry'
import { layoutPins, layoutWires } from '../model/layout'
import { resolveDef } from '../model/parts'
import { LANE } from '../model/route'
import type { PinRef, Point } from '../model/types'
import { partDisplayNames } from '../model/wirelist'
import { nearestSegment } from '../model/wirepath'
import { useStore } from '../store/store'
import { PartBody, PartPins } from './PartView'
import { WireView } from './WireView'

export const PART_MIME = 'application/x-wirebench-part'
const MIN_ZOOM = 1.2
const MAX_ZOOM = 60

type Drag =
  | { type: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { type: 'marquee'; start: Point; additive: boolean }
  | { type: 'move'; start: Point; grabbed: string; orig: Record<string, Point>; moved: boolean }
  | { type: 'wire'; from: PinRef; origin: Point; sticky: boolean }
  | { type: 'bend'; wire: string; index: number; moved: boolean }

interface Draft {
  from: PinRef
  to: Point
  target: PinRef | null
}

const refOf = (key: string): PinRef => {
  const i = key.indexOf(':')
  return { part: key.slice(0, i), pin: key.slice(i + 1) }
}

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

export function Desk() {
  const project = useStore((s) => s.project)
  const library = useStore((s) => s.library)
  const settings = useStore((s) => s.settings)
  const selection = useStore((s) => s.selection)
  const view = useStore((s) => s.view)

  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<Drag | null>(null)
  const space = useRef(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [marquee, setMarquee] = useState<{ a: Point; b: Point } | null>(null)
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null)

  const names = useMemo(() => partDisplayNames(project, library), [project, library])

  /** World position of every pin on the desk, and which way a wire leaves it. */
  const pins = useMemo(() => layoutPins(project, library), [project.parts, library])
  const pinPos = pins.pos

  /** Each wire with its drawn path and color. */
  const wires = useMemo(
    () =>
      layoutWires(project, pins, settings.wireStyle).map((w) => ({ ...w, color: resolveWireColor(w.wire, project, library, settings) })),
    [project, library, settings, pins],
  )

  /** For each part, which pins have a wire and in what color. */
  const wiredByPart = useMemo(() => {
    const out: Record<string, Record<string, string>> = {}
    for (const { wire, color } of wires) {
      for (const end of [wire.a, wire.b]) (out[end.part] ??= {})[end.pin] = color
    }
    return out
  }, [wires])

  /**
   * Double-click detection on pointer down. The svg captures the pointer, so the
   * browser's own dblclick event arrives at the svg and cannot tell which wire was hit.
   */
  const lastDown = useRef<{ key: string; t: number } | null>(null)
  function isDoubleDown(key: string): boolean {
    const now = performance.now()
    const hit = !!lastDown.current && lastDown.current.key === key && now - lastDown.current.t < 450
    lastDown.current = hit ? null : { key, t: now }
    return hit
  }

  const toWorld = useCallback((clientX: number, clientY: number): Point => {
    const rect = svgRef.current!.getBoundingClientRect()
    const v = useStore.getState().view
    return { x: (clientX - rect.left - v.x) / v.zoom, y: (clientY - rect.top - v.y) / v.zoom }
  }, [])

  const nearestPin = useCallback(
    (p: Point, exclude?: PinRef): PinRef | null => {
      const reach = Math.max(2.2, 12 / useStore.getState().view.zoom)
      let best: string | null = null
      let bestD = reach
      for (const [key, pos] of pinPos) {
        if (exclude && key === `${exclude.part}:${exclude.pin}`) continue
        const d = dist(p, pos)
        if (d < bestD) {
          bestD = d
          best = key
        }
      }
      return best ? refOf(best) : null
    },
    [pinPos],
  )

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const rect = svgRef.current!.getBoundingClientRect()
    const v = useStore.getState().view
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor))
    const px = clientX - rect.left
    const py = clientY - rect.top
    // Keep the point under the cursor fixed while the scale changes.
    useStore.getState().setView({ zoom, x: px - ((px - v.x) / v.zoom) * zoom, y: py - ((py - v.y) / v.zoom) * zoom })
  }, [])

  const fitView = useCallback(() => {
    const s = useStore.getState()
    const rect = svgRef.current!.getBoundingClientRect()
    if (!s.project.parts.length) {
      s.setView({ zoom: 6, x: 40, y: 40 })
      return
    }
    const boxes = s.project.parts.map((p) => placedBounds(resolveDef(s.library, p), p))
    const x0 = Math.min(...boxes.map((b) => b.x)) - 8
    const y0 = Math.min(...boxes.map((b) => b.y)) - 10
    const x1 = Math.max(...boxes.map((b) => b.x + b.w)) + 8
    const y1 = Math.max(...boxes.map((b) => b.y + b.h)) + 8
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(rect.width / (x1 - x0), rect.height / (y1 - y0), 14)))
    s.setView({ zoom, x: (rect.width - (x1 - x0) * zoom) / 2 - x0 * zoom, y: (rect.height - (y1 - y0) * zoom) / 2 - y0 * zoom })
  }, [])

  // Wheel needs a non-passive listener so the page itself never scrolls or zooms.
  useEffect(() => {
    const el = svgRef.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01))
      } else {
        const v = useStore.getState().view
        useStore.getState().setView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY })
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const s = useStore.getState()
      if (isTyping(e.target) || s.partSettingsId || s.settingsOpen) return
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      if (e.key === ' ') {
        space.current = true
        e.preventDefault()
      } else if (mod && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
      } else if (mod && key === 'd') {
        e.preventDefault()
        s.duplicateSelected()
      } else if (mod && key === 'a') {
        e.preventDefault()
        s.select({ parts: s.project.parts.map((p) => p.id), wires: s.project.wires.map((w) => w.id) })
      } else if (mod) {
        return
      } else if (key === 'r') {
        s.rotateSelected()
      } else if (key === 'f') {
        s.flipSelected()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        s.deleteSelected()
      } else if (e.key === 'Escape') {
        drag.current = null
        setDraft(null)
        setMarquee(null)
        s.clearSelection()
      } else if (e.key.startsWith('Arrow') && s.selection.parts.length) {
        e.preventDefault()
        // Shift moves in tenths of a grid step for fine placement.
        const step = e.shiftKey ? GRID / 10 : GRID
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        s.moveParts(s.selection.parts, dx, dy, false)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') space.current = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const s = useStore.getState()
    const target = e.target as Element
    const world = toWorld(e.clientX, e.clientY)
    setHover(null)

    // Second click of a click-then-click wire.
    const current = drag.current
    if (current?.type === 'wire' && current.sticky) {
      const end = nearestPin(world, current.from)
      if (end) s.addWire(current.from, end)
      drag.current = null
      setDraft(null)
      return
    }

    if (e.button === 1 || (e.button === 0 && space.current)) {
      drag.current = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: s.view.x, vy: s.view.y }
      svgRef.current!.setPointerCapture(e.pointerId)
      return
    }
    if (e.button !== 0) return
    svgRef.current!.setPointerCapture(e.pointerId)

    const pinEl = target.closest('[data-pin]')
    if (pinEl) {
      const from = refOf(pinEl.getAttribute('data-pin')!)
      const origin = pinPos.get(`${from.part}:${from.pin}`) ?? world
      drag.current = { type: 'wire', from, origin, sticky: false }
      setDraft({ from, to: world, target: null })
      return
    }

    const bendEl = target.closest('[data-bend]')
    if (bendEl) {
      const key = bendEl.getAttribute('data-bend')!
      const [wire, index] = key.split(':')
      if (isDoubleDown(`bend:${key}`)) {
        const w = s.project.wires.find((x) => x.id === wire)
        if (w?.points) s.setWirePoints(wire, w.points.filter((_, i) => i !== Number(index)))
        return
      }
      drag.current = { type: 'bend', wire, index: Number(index), moved: false }
      return
    }

    const wireEl = target.closest('[data-wire]')
    if (wireEl) {
      const id = wireEl.getAttribute('data-wire')!
      if (isDoubleDown(`wire:${id}`)) {
        const entry = wires.find((w) => w.wire.id === id)
        if (entry?.poly) {
          const points = [...(entry.wire.points ?? [])]
          // The drawn path has extra corners; hops says which pair of waypoints the clicked segment lies between.
          const hop = entry.hops[nearestSegment(entry.poly, world)] ?? 0
          points.splice(hop, 0, snapBend(world, e.altKey))
          s.setWirePoints(id, points)
          s.select({ wires: [id] })
        }
        return
      }
      s.select({ wires: [id] }, e.shiftKey)
      return
    }

    const partEl = target.closest('[data-part]')
    if (partEl) {
      const id = partEl.getAttribute('data-part')!
      if (e.shiftKey) {
        s.select({ parts: [id] }, true)
        return
      }
      if (!s.selection.parts.includes(id)) s.select({ parts: [id] })
      const moving = useStore.getState().selection.parts
      const orig: Record<string, Point> = {}
      for (const p of s.project.parts) if (moving.includes(p.id)) orig[p.id] = { x: p.x, y: p.y }
      drag.current = { type: 'move', start: world, grabbed: id, orig, moved: false }
      return
    }

    drag.current = { type: 'marquee', start: world, additive: e.shiftKey }
    if (!e.shiftKey) s.clearSelection()
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current
    const s = useStore.getState()
    const world = toWorld(e.clientX, e.clientY)

    if (!d) {
      const pinEl = (e.target as Element).closest?.('[data-pin]')
      if (pinEl) {
        const rect = wrapRef.current!.getBoundingClientRect()
        setHover({ key: pinEl.getAttribute('data-pin')!, x: e.clientX - rect.left, y: e.clientY - rect.top })
      } else if (hover) {
        setHover(null)
      }
      return
    }

    if (d.type === 'pan') {
      s.setView({ ...s.view, x: d.vx + (e.clientX - d.sx), y: d.vy + (e.clientY - d.sy) })
    } else if (d.type === 'wire') {
      setDraft({ from: d.from, to: world, target: nearestPin(world, d.from) })
    } else if (d.type === 'marquee') {
      setMarquee({ a: d.start, b: world })
    } else if (d.type === 'move') {
      let dx = world.x - d.start.x
      let dy = world.y - d.start.y
      if (!d.moved) {
        if (Math.hypot(dx, dy) * s.view.zoom < 4) return
        d.moved = true
        s.beginDrag()
      }
      // Alt inverts the snap setting for this drag.
      if (s.settings.snap !== e.altKey) {
        const grabbed = s.project.parts.find((p) => p.id === d.grabbed)
        if (grabbed) {
          const want = { ...grabbed, x: d.orig[d.grabbed].x + dx, y: d.orig[d.grabbed].y + dy }
          const snapped = snapPlaced(resolveDef(s.library, grabbed), want)
          // Snap the grabbed part; the rest of the selection keeps its offset from it.
          dx = snapped.x - d.orig[d.grabbed].x
          dy = snapped.y - d.orig[d.grabbed].y
        }
      }
      const positions: Record<string, Point> = {}
      for (const [id, o] of Object.entries(d.orig)) positions[id] = { x: o.x + dx, y: o.y + dy }
      s.setPartPositions(positions)
    } else if (d.type === 'bend') {
      const wire = s.project.wires.find((w) => w.id === d.wire)
      if (!wire?.points) return
      if (!d.moved) {
        d.moved = true
        s.beginDrag()
      }
      const to = snapBend(world, e.altKey)
      s.setWirePoints(d.wire, wire.points.map((p, i) => (i === d.index ? to : p)), false)
    }
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current
    const s = useStore.getState()
    if (svgRef.current!.hasPointerCapture(e.pointerId)) svgRef.current!.releasePointerCapture(e.pointerId)
    if (!d) return
    const world = toWorld(e.clientX, e.clientY)

    if (d.type === 'wire') {
      if (d.sticky) return
      const end = nearestPin(world, d.from)
      if (end) {
        s.addWire(d.from, end)
      } else if (dist(world, d.origin) < Math.max(1.6, 8 / s.view.zoom)) {
        // Released on the pin it started from: switch to click, then click.
        d.sticky = true
        return
      }
      setDraft(null)
    } else if (d.type === 'marquee') {
      if (marquee) {
        const x0 = Math.min(marquee.a.x, marquee.b.x)
        const x1 = Math.max(marquee.a.x, marquee.b.x)
        const y0 = Math.min(marquee.a.y, marquee.b.y)
        const y1 = Math.max(marquee.a.y, marquee.b.y)
        const parts = s.project.parts
          .filter((p) => {
            const b = placedBounds(resolveDef(s.library, p), p)
            return b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0
          })
          .map((p) => p.id)
        if (parts.length) s.select({ parts }, d.additive)
      }
      setMarquee(null)
    }
    drag.current = null
  }

  function onDrop(e: React.DragEvent) {
    const partId = e.dataTransfer.getData(PART_MIME)
    if (!partId) return
    e.preventDefault()
    useStore.getState().addPart(partId, toWorld(e.clientX, e.clientY))
  }

  const draftFrom = draft ? pinPos.get(`${draft.from.part}:${draft.from.pin}`) : undefined
  const draftTo = draft?.target ? pinPos.get(`${draft.target.part}:${draft.target.pin}`) : draft?.to
  const activeKeys = new Set<string>()
  if (draft) {
    activeKeys.add(`${draft.from.part}:${draft.from.pin}`)
    if (draft.target) activeKeys.add(`${draft.target.part}:${draft.target.pin}`)
  }
  if (hover) activeKeys.add(hover.key)
  const activeFor = (partId: string) => [...activeKeys].find((k) => k.startsWith(`${partId}:`)) ?? null

  const hoverInfo = (() => {
    if (!hover) return null
    const ref = refOf(hover.key)
    const placed = project.parts.find((p) => p.id === ref.part)
    const def = placed ? resolveDef(library, placed) : undefined
    const pin = def?.pins.find((p) => p.id === ref.pin)
    if (!pin) return null
    const type = settings.pinTypes.find((t) => t.id === pin.type)
    return { pin, type, part: names[ref.part] }
  })()

  const gridStep = GRID * view.zoom
  const showGrid = gridStep >= 7

  return (
    <div
      className="desk"
      ref={wrapRef}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(PART_MIME)) e.preventDefault()
      }}
      onDrop={onDrop}
    >
      <svg
        ref={svgRef}
        className={`desk-svg${draft ? ' is-wiring' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <pattern id="grid-dots" width={gridStep} height={gridStep} patternUnits="userSpaceOnUse" x={view.x - gridStep / 2} y={view.y - gridStep / 2}>
            <circle cx={gridStep / 2} cy={gridStep / 2} r={1} className="grid-dot" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" className="mat" />
        {showGrid && <rect width="100%" height="100%" fill="url(#grid-dots)" pointerEvents="none" />}

        <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
          {project.parts.map((placed) => (
            <PartBody
              key={placed.id}
              placed={placed}
              def={resolveDef(library, placed)}
              title={names[placed.id]}
              selected={selection.parts.includes(placed.id)}
            />
          ))}
          {wires.map(({ wire, d, color }) =>
            d ? (
              <WireView key={wire.id} id={wire.id} d={d} handles={wire.points ?? NO_POINTS} color={color} selected={selection.wires.includes(wire.id)} />
            ) : null,
          )}
          {project.parts.map((placed) => (
            <PartPins
              key={placed.id}
              placed={placed}
              def={resolveDef(library, placed)}
              wired={wiredByPart[placed.id] ?? EMPTY_WIRED}
              activePin={activeFor(placed.id)}
            />
          ))}
          {draft && draftFrom && draftTo && (
            <line x1={draftFrom.x} y1={draftFrom.y} x2={draftTo.x} y2={draftTo.y} className={`wire-draft${draft.target ? ' has-target' : ''}`} />
          )}
          {marquee && (
            <rect
              x={Math.min(marquee.a.x, marquee.b.x)}
              y={Math.min(marquee.a.y, marquee.b.y)}
              width={Math.abs(marquee.a.x - marquee.b.x)}
              height={Math.abs(marquee.a.y - marquee.b.y)}
              className="marquee"
            />
          )}
        </g>
      </svg>

      {!project.parts.length && (
        <div className="desk-empty">
          <strong>The desk is empty.</strong>
          <span>Drag a part here from the library, or double-click one to drop it in.</span>
        </div>
      )}

      {hoverInfo && hover && (
        <div className="pin-tip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <strong>{hoverInfo.pin.name}</strong>
          <span>
            <i style={{ background: hoverInfo.type?.color ?? '#8a8f98' }} />
            {hoverInfo.type?.label ?? hoverInfo.pin.type}
            {hoverInfo.pin.gpio !== undefined ? `, GPIO ${hoverInfo.pin.gpio}` : ''}
          </span>
          {hoverInfo.pin.internalUse && <span className="pin-tip-warn">Board uses this pin: {hoverInfo.pin.internalUse}</span>}
          {hoverInfo.pin.note && <span>{hoverInfo.pin.note}</span>}
          <span className="pin-tip-part">{hoverInfo.part}</span>
        </div>
      )}

      <div className="desk-zoom">
        <button onClick={() => zoomBy(svgRef.current, zoomAt, 1 / 1.25)} title="Zoom out" aria-label="Zoom out">
          −
        </button>
        <button onClick={fitView} title="Fit everything in view">
          Fit
        </button>
        <button onClick={() => zoomBy(svgRef.current, zoomAt, 1.25)} title="Zoom in" aria-label="Zoom in">
          +
        </button>
      </div>
    </div>
  )
}

const EMPTY_WIRED: Record<string, string> = {}
const NO_POINTS: Point[] = []

/** Bend points snap to the half grid when snapping is on; Alt does the opposite. */
function snapBend(p: Point, alt: boolean): Point {
  const snap = useStore.getState().settings.snap !== alt
  return snap ? { x: snapTo(p.x, LANE), y: snapTo(p.y, LANE) } : p
}

function zoomBy(svg: SVGSVGElement | null, zoomAt: (x: number, y: number, f: number) => void, factor: number) {
  if (!svg) return
  const r = svg.getBoundingClientRect()
  zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor)
}

/**
 * Where a part added by double-click should go: the middle of what is visible,
 * moved right past anything already there so parts never land in a pile.
 */
export function freeSpot(partId: string): Point {
  const el = document.querySelector('.desk-svg')
  const s = useStore.getState()
  const v = s.view
  if (!el) return { x: 40, y: 40 }
  const r = el.getBoundingClientRect()
  const spot = { x: (r.width / 2 - v.x) / v.zoom, y: (r.height / 2 - v.y) / v.zoom }
  const size = placedBounds(resolveDef(s.library, { partId }), { id: '', partId, x: 0, y: 0, rotation: 0, flipped: false })
  const boxes = s.project.parts.map((p) => placedBounds(resolveDef(s.library, p), p))
  const gap = GRID * 3
  for (let tries = 0; tries < 50; tries++) {
    const x0 = spot.x - size.w / 2
    const y0 = spot.y - size.h / 2
    const hit = boxes.find((b) => b.x < x0 + size.w + gap && b.x + b.w + gap > x0 && b.y < y0 + size.h && b.y + b.h > y0)
    if (!hit) break
    spot.x = hit.x + hit.w + gap + size.w / 2
  }
  return spot
}
