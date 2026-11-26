// Works out where every pin on the desk is and how every wire runs. Pure, so
// the desk can draw from it and tests can check it.

import { GRID, localToWorld, partGeometry, pinWorld, placedBounds } from './geometry'
import { resolveDef } from './parts'
import { assignLanes, type Box, type Dir, exitDir, LANE, type LaneEnd, orthoPath, RIGHT, routeWire } from './route'
import type { Library, PartDef, PlacedPart, Point, Project, Wire } from './types'
import { wirePath } from './wirepath'

export interface PinLayout {
  /** World position of every pin, keyed `part:pin`. */
  pos: Map<string, Point>
  /** Which way a wire leaves each pin. */
  dir: Map<string, Dir>
  /** Pins with no fixed side (rail pins): a wire leaves them toward its other end. */
  twoSided: Set<string>
}

/** Where each of a part's outlines (a module drawn on a board) sits on the desk. */
function outlineBoxes(def: PartDef, placed: PlacedPart): Box[] {
  const g = partGeometry(def, placed.flipped)
  // An uploaded image has its own layout, so the placeholder's outlines no longer apply.
  if (g.image || !def.outlines?.length) return []
  return def.outlines.map((o) => {
    const x = placed.flipped ? g.w - o.x - o.w : o.x
    const a = localToWorld({ x, y: o.y }, g, placed)
    const b = localToWorld({ x: x + o.w, y: o.y + o.h }, g, placed)
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }
  })
}

const inside = (p: Point, b: Box) => p.x >= b.x - 0.01 && p.x <= b.x + b.w + 0.01 && p.y >= b.y - 0.01 && p.y <= b.y + b.h + 0.01

export function layoutPins(project: Project, lib: Library): PinLayout {
  const pos = new Map<string, Point>()
  const dir = new Map<string, Dir>()
  const twoSided = new Set<string>()
  for (const placed of project.parts) {
    const def = resolveDef(lib, placed)
    if (!def) continue
    const box = placedBounds(def, placed)
    const modules = outlineBoxes(def, placed)
    const here: { id: string; row?: string; p: Point }[] = []
    for (const pin of def.pins) {
      const p = pinWorld(def, placed, pin.id)
      if (p) here.push({ id: pin.id, row: pin.row, p })
    }
    for (const pin of here) {
      const key = `${placed.id}:${pin.id}`
      pos.set(key, pin.p)
      const mates = pin.row ? here.filter((o) => o !== pin && o.row === pin.row) : []
      const spreadX = Math.max(0, ...mates.map((o) => Math.abs(o.p.x - pin.p.x)))
      const spreadY = Math.max(0, ...mates.map((o) => Math.abs(o.p.y - pin.p.y)))
      const rowAxis = mates.length ? (spreadX > spreadY ? 'h' : 'v') : null
      // A pad on a module leaves outward from the module, not from the whole board,
      // and only the module's own pads can be in its way.
      const home = modules.find((m) => inside(pin.p, m))
      const others = here.filter((o) => o !== pin && (!home || inside(o.p, home))).map((o) => o.p)
      dir.set(key, exitDir(pin.p, home ?? box, others, rowAxis))
      if (def.rail) twoSided.add(key)
    }
  }
  return { pos, dir, twoSided }
}

export interface WireLayout {
  wire: Wire
  /** SVG path; empty when an end of the wire cannot be found. */
  d: string
  /** Corner points of the drawn wire, or null when it cannot be drawn. */
  poly: Point[] | null
  /** For each segment of poly, the index a new bend there should be inserted at. */
  hops: number[]
}

export function layoutWires(project: Project, pins: PinLayout, style: 'grid' | 'curved'): WireLayout[] {
  const grid = style !== 'curved'
  const ends = project.wires.map((w) => {
    const ka = `${w.a.part}:${w.a.pin}`
    const kb = `${w.b.part}:${w.b.pin}`
    const a = pins.pos.get(ka)
    const b = pins.pos.get(kb)
    return { w, a, b, da: facing(pins, ka, a, b), db: facing(pins, kb, b, a) }
  })

  // Wires leaving the same side of a part fan out into lanes. Wires with manual bends are left alone.
  let lanes: Record<string, number> = {}
  if (grid) {
    const laneEnds: LaneEnd[] = []
    for (const { w, a, b, da, db } of ends) {
      if (!a || !b || w.points?.length) continue
      laneEnds.push({ id: `${w.id}:a`, group: `${w.a.part}:${da.x},${da.y}`, along: da.x !== 0 ? a.y : a.x, toward: da.x !== 0 ? b.y : b.x })
      laneEnds.push({ id: `${w.id}:b`, group: `${w.b.part}:${db.x},${db.y}`, along: db.x !== 0 ? b.y : b.x, toward: db.x !== 0 ? a.y : a.x })
    }
    lanes = assignLanes(laneEnds)
  }

  if (!grid) {
    return ends.map(({ w, a, b }) => {
      if (!a || !b) return { wire: w, d: '', poly: null, hops: [] }
      const poly = [a, ...(w.points ?? []), b]
      return { wire: w, d: wirePath(poly), poly, hops: poly.slice(1).map((_, i) => i) }
    })
  }

  const routed = ends.map(({ w, a, b, da, db }) => {
    if (!a || !b) return { wire: w, poly: null as Point[] | null, hops: [] as number[] }
    const route = routeWire({ pos: a, dir: da, lane: lanes[`${w.id}:a`] ?? 0 }, { pos: b, dir: db, lane: lanes[`${w.id}:b`] ?? 0 }, w.points)
    return { wire: w, poly: route.pts, hops: route.hops }
  })
  separate(routed)
  return routed.map((r) => ({ ...r, d: r.poly ? orthoPath(r.poly) : '' }))
}

/** A pin's exit direction, turned to face the wire's other end when the pin has no fixed side. */
function facing(pins: PinLayout, key: string, from: Point | undefined, to: Point | undefined): Dir {
  const d = pins.dir.get(key) ?? RIGHT
  if (!from || !to || !pins.twoSided.has(key)) return d
  if (d.y !== 0) return to.y < from.y ? { x: 0, y: -1 } : { x: 0, y: 1 }
  return to.x < from.x ? { x: -1, y: 0 } : { x: 1, y: 0 }
}

interface Run {
  wire: Wire
  horizontal: boolean
  line: number
  lo: number
  hi: number
}

const sharesPin = (a: Wire, b: Wire) => {
  const keys = (w: Wire) => [`${w.a.part}:${w.a.pin}`, `${w.b.part}:${w.b.pin}`]
  return keys(a).some((k) => keys(b).includes(k))
}

function runOf(wire: Wire, p: Point, q: Point): Run {
  const horizontal = Math.abs(p.y - q.y) < 1e-6
  return {
    wire,
    horizontal,
    line: horizontal ? p.y : p.x,
    lo: horizontal ? Math.min(p.x, q.x) : Math.min(p.y, q.y),
    hi: horizontal ? Math.max(p.x, q.x) : Math.max(p.y, q.y),
  }
}

/** True when the run lies on top of a run of another wire for more than a pad's width. */
function collides(run: Run, placed: Run[]): boolean {
  return placed.some(
    (o) =>
      o.horizontal === run.horizontal &&
      Math.abs(o.line - run.line) < 0.6 &&
      Math.min(o.hi, run.hi) - Math.max(o.lo, run.lo) > 1 &&
      !sharesPin(o.wire, run.wire),
  )
}

/**
 * Lanes keep wires apart where they leave a part, but a long run can still land
 * on another part's pin column, because snapping lines pins up across parts.
 * This pass moves such a run half a pitch sideways. Earlier wires keep their
 * place and later ones step aside. The short stub at each pin never moves, and
 * wires the user has bent by hand are left exactly as they are.
 */
function separate(routed: { wire: Wire; poly: Point[] | null; hops: number[] }[]) {
  const placed: Run[] = []
  const stub = GRID
  const steps = [1, -1, 2, -2, 3, -3, 4, -4]

  for (const r of routed) {
    if (!r.poly) continue
    if (!r.wire.points?.length) {
      for (let pass = 0; pass < 8; pass++) {
        const pts: Point[] = r.poly
        const last = pts.length - 2
        const i = pts.findIndex((p, k) => k <= last && collides(runOf(r.wire, p, pts[k + 1]), placed))
        if (i < 0) break
        const p = pts[i]
        const q = pts[i + 1]
        const horizontal = Math.abs(p.y - q.y) < 1e-6
        const length = Math.hypot(q.x - p.x, q.y - p.y)
        const isFirst = i === 0
        const isLast = i === last
        // A single straight wire, or a run that is nothing but the stub at a pin, has nowhere to go.
        if ((isFirst && isLast) || ((isFirst || isLast) && length < stub + LANE)) break

        // Keep the stub at a pin and move only the part of the run beyond it.
        const ux = (q.x - p.x) / length
        const uy = (q.y - p.y) / length
        const from = isFirst ? { x: p.x + ux * stub, y: p.y + uy * stub } : p
        const to = isLast ? { x: q.x - ux * stub, y: q.y - uy * stub } : q
        const shifted = (k: number) => {
          const d = k * LANE
          return horizontal
            ? [{ x: from.x, y: from.y + d }, { x: to.x, y: to.y + d }]
            : [{ x: from.x + d, y: from.y }, { x: to.x + d, y: to.y }]
        }
        const k = steps.find((n) => {
          const [m, n2] = shifted(n)
          return !collides(runOf(r.wire, m, n2), placed)
        })
        if (k === undefined) break
        const [m, n2] = shifted(k)
        r.poly = [...pts.slice(0, i), ...(isFirst ? [p, from] : []), m, n2, ...(isLast ? [to, q] : []), ...pts.slice(i + 2)]
      }
      r.hops = r.poly.slice(1).map(() => 0)
    }
    for (let k = 0; k < r.poly.length - 1; k++) placed.push(runOf(r.wire, r.poly[k], r.poly[k + 1]))
  }
}
