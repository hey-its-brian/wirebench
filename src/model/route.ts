// Grid wires: every run is horizontal or vertical. A wire leaves its pin
// straight out from the part, wires that share a side fan out into separate
// lanes so they never sit on top of each other, and manual bends are joined
// with right-angle elbows.

import { GRID, snapTo } from './geometry'
import type { Point } from './types'

export interface Dir {
  x: -1 | 0 | 1
  y: -1 | 0 | 1
}

export const LEFT: Dir = { x: -1, y: 0 }
export const RIGHT: Dir = { x: 1, y: 0 }
export const UP: Dir = { x: 0, y: -1 }
export const DOWN: Dir = { x: 0, y: 1 }

/** Lanes and bend points sit on a half grid, so a wire can pass between two header pins. */
export const LANE = GRID / 2
const STUB = GRID
const EPS = 1e-6

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Which way a wire leaves a pin. A row of pins exits across the row, toward
 * the nearer board edge, unless a neighbouring row is in the way (the inner
 * row of a 2x4 header), in which case it exits the other way.
 */
export function exitDir(pin: Point, box: Box, others: Point[], rowAxis: 'h' | 'v' | null): Dir {
  const dl = pin.x - box.x
  const dr = box.x + box.w - pin.x
  const dt = pin.y - box.y
  const db = box.y + box.h - pin.y
  const vertical = rowAxis === 'h' || (rowAxis === null && Math.min(dt, db) < Math.min(dl, dr))

  if (vertical) {
    const first = dt <= db ? UP : DOWN
    const blocked = (d: Dir) =>
      others.some((o) => Math.abs(o.x - pin.x) < GRID * 0.6 && (o.y - pin.y) * d.y > EPS && (o.y - pin.y) * d.y < GRID * 1.6)
    const other = first === UP ? DOWN : UP
    return blocked(first) && !blocked(other) ? other : first
  }
  const first = dl <= dr ? LEFT : RIGHT
  const blocked = (d: Dir) =>
    others.some((o) => Math.abs(o.y - pin.y) < GRID * 0.6 && (o.x - pin.x) * d.x > EPS && (o.x - pin.x) * d.x < GRID * 1.6)
  const other = first === LEFT ? RIGHT : LEFT
  return blocked(first) && !blocked(other) ? other : first
}

export interface LaneEnd {
  /** Unique per wire end. */
  id: string
  /** Wire ends that leave the same side of the same part share a group. */
  group: string
  /** The pin's position along that side. */
  along: number
  /** Where the wire is heading, on the same axis. */
  toward: number
}

/**
 * Gives each wire end a lane number, 0 being the shortest stub. Within a side,
 * the pin nearest the direction of travel turns first, so the wires nest
 * instead of crossing. Two wires share a lane only when their runs along the
 * side are well clear of each other, so no wire ever lies on top of another.
 */
export function assignLanes(ends: LaneEnd[]): Record<string, number> {
  const lanes: Record<string, number> = {}
  const groups = new Map<string, LaneEnd[]>()
  for (const e of ends) {
    if (!groups.has(e.group)) groups.set(e.group, [])
    groups.get(e.group)!.push(e)
  }
  // The run ends at the other pin's stub, not at the pin, so keep a margin.
  const margin = GRID * 2
  for (const group of groups.values()) {
    const plus = group.filter((e) => e.toward >= e.along).sort((p, q) => q.along - p.along || p.id.localeCompare(q.id))
    const minus = group.filter((e) => e.toward < e.along).sort((p, q) => p.along - q.along || p.id.localeCompare(q.id))
    const taken: { lo: number; hi: number }[][] = []
    for (const e of [...plus, ...minus]) {
      const lo = Math.min(e.along, e.toward) - margin
      const hi = Math.max(e.along, e.toward) + margin
      let lane = 0
      while (taken[lane]?.some((t) => t.lo < hi && t.hi > lo)) lane++
      ;(taken[lane] ??= []).push({ lo, hi })
      lanes[e.id] = lane
    }
  }
  return lanes
}

export interface RouteEnd {
  pos: Point
  dir: Dir
  lane: number
}

export interface Route {
  /** Corner points of the wire, both pins included. */
  pts: Point[]
  /** For each segment of pts, which hop between waypoints it belongs to. Used when adding a bend. */
  hops: number[]
}

function stub(e: RouteEnd): Point {
  const len = STUB + e.lane * LANE
  const p = { x: e.pos.x + e.dir.x * len, y: e.pos.y + e.dir.y * len }
  if (e.dir.x !== 0) {
    p.x = snapTo(p.x, LANE)
    // Snapping must never pull the turn back onto the pin itself.
    if ((p.x - e.pos.x) * e.dir.x < LANE) p.x += e.dir.x * LANE
  } else {
    p.y = snapTo(p.y, LANE)
    if ((p.y - e.pos.y) * e.dir.y < LANE) p.y += e.dir.y * LANE
  }
  return p
}

const same = (p: Point, q: Point) => Math.abs(p.x - q.x) < EPS && Math.abs(p.y - q.y) < EPS
const collinear = (p: Point, q: Point, r: Point) =>
  (Math.abs(p.x - q.x) < EPS && Math.abs(q.x - r.x) < EPS) || (Math.abs(p.y - q.y) < EPS && Math.abs(q.y - r.y) < EPS)

/** Drop repeated points and points in the middle of a straight run. */
function simplify(pts: Point[], hops: number[]): Route {
  const outPts: Point[] = [pts[0]]
  const outHops: number[] = []
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]
    const hop = hops[i - 1]
    if (same(p, outPts[outPts.length - 1])) continue
    if (outPts.length >= 2 && collinear(outPts[outPts.length - 2], outPts[outPts.length - 1], p)) {
      outPts[outPts.length - 1] = p
      continue
    }
    outPts.push(p)
    outHops.push(hop)
  }
  if (outPts.length === 1) return { pts: [pts[0], pts[pts.length - 1]], hops: [0] }
  return { pts: outPts, hops: outHops }
}

export function routeWire(a: RouteEnd, b: RouteEnd, points?: Point[]): Route {
  if (points?.length) {
    // The user has placed bends: join the waypoints with right-angle elbows.
    const way = [a.pos, ...points, b.pos]
    const pts: Point[] = [a.pos]
    const hops: number[] = []
    for (let i = 0; i < way.length - 1; i++) {
      const p = way[i]
      const q = way[i + 1]
      const aligned = Math.abs(p.x - q.x) < EPS || Math.abs(p.y - q.y) < EPS
      if (!aligned) {
        // Leave the first pin and arrive at the last one along that pin's own axis.
        const horizontalFirst = i === 0 ? a.dir.x !== 0 : i === way.length - 2 ? b.dir.y !== 0 : true
        pts.push(horizontalFirst ? { x: q.x, y: p.y } : { x: p.x, y: q.y })
        hops.push(i)
      }
      pts.push(q)
      hops.push(i)
    }
    return simplify(pts, hops)
  }

  const a1 = stub(a)
  const b1 = stub(b)
  const mid = connect(a1, a.dir, b1, b.dir)
  const pts = [a.pos, a1, ...mid, b1, b.pos]
  return simplify(pts, pts.slice(1).map(() => 0))
}

/**
 * True when a path between the two stub ends would double back over a stub:
 * leaving A's stub the way it came, or arriving at B's stub from the pin's side.
 * Such a path would run straight over the pin (and any pin behind it).
 */
function doublesBack(path: Point[], da: Dir, db: Dir): boolean {
  const moves: Point[] = []
  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x
    const dy = path[i].y - path[i - 1].y
    if (Math.abs(dx) > EPS || Math.abs(dy) > EPS) moves.push({ x: Math.sign(dx), y: Math.sign(dy) })
  }
  if (!moves.length) return false
  const first = moves[0]
  const last = moves[moves.length - 1]
  const leavesBackward = first.x === -da.x && first.y === -da.y
  const arrivesFromPinSide = last.x === db.x && last.y === db.y
  return leavesBackward || arrivesFromPinSide
}

/** The corner points that join stub end p to stub end q. */
function connect(p: Point, da: Dir, q: Point, db: Dir): Point[] {
  const toward = (from: number, to: number) => Math.sign(to - from) || 1
  const turnAtA = da.x !== 0 ? { x: p.x, y: q.y } : { x: q.x, y: p.y }
  const turnAtB = da.x !== 0 ? { x: q.x, y: p.y } : { x: p.x, y: q.y }

  // When one turn is not enough, step half a pitch sideways first, so the long
  // run passes between two pin columns instead of over them.
  const sideStep = (at: Point, d: Dir): Point[] => {
    if (d.y !== 0) {
      const x = at.x + toward(at.x, at === p ? q.x : p.x) * LANE
      return [{ x, y: p.y }, { x, y: q.y }]
    }
    const y = at.y + toward(at.y, at === p ? q.y : p.y) * LANE
    return [{ x: p.x, y }, { x: q.x, y }]
  }

  const options: Point[][] = [[turnAtA], [turnAtB], sideStep(q, db), sideStep(p, da)]
  return options.find((mid) => !doublesBack([p, ...mid, q], da, db)) ?? options[0]
}

const f = (n: number) => n.toFixed(2)

/** An SVG path through the corner points, with each corner slightly rounded. */
export function orthoPath(pts: Point[], radius = 0.7): string {
  if (pts.length < 2) return ''
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]
    const prev = pts[i - 1]
    const next = pts[i + 1]
    const d1 = Math.hypot(p.x - prev.x, p.y - prev.y)
    const d2 = Math.hypot(next.x - p.x, next.y - p.y)
    const r = Math.min(radius, d1 / 2, d2 / 2)
    if (r < 0.05) {
      d += ` L${f(p.x)} ${f(p.y)}`
      continue
    }
    const inX = p.x + ((prev.x - p.x) / d1) * r
    const inY = p.y + ((prev.y - p.y) / d1) * r
    const outX = p.x + ((next.x - p.x) / d2) * r
    const outY = p.y + ((next.y - p.y) / d2) * r
    d += ` L${f(inX)} ${f(inY)} Q${f(p.x)} ${f(p.y)} ${f(outX)} ${f(outY)}`
  }
  const last = pts[pts.length - 1]
  return `${d} L${f(last.x)} ${f(last.y)}`
}
