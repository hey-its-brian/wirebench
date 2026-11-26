// How a wire is drawn: a hanging curve between two pins, or a smooth curve
// through its bend points.

import type { Point } from './types'

const f = (n: number) => n.toFixed(2)

export function wirePath(pts: Point[]): string {
  if (pts.length < 2) return ''
  if (pts.length === 2) {
    const [a, b] = pts
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    // A little sag, like a real jumper, also keeps parallel wires apart from straight board edges.
    const sag = Math.min(len * 0.14, 5)
    const cx = (a.x + b.x) / 2
    const cy = (a.y + b.y) / 2 + sag
    return `M${f(a.x)} ${f(a.y)} Q${f(cx)} ${f(cy)} ${f(b.x)} ${f(b.y)}`
  }
  // Catmull-Rom through every point, written as cubic Beziers.
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }
    d += ` C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p2.x)} ${f(p2.y)}`
  }
  return d
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Index of the segment of the polyline closest to p. */
export function nearestSegment(pts: Point[], p: Point): number {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distToSegment(p, pts[i], pts[i + 1])
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}
