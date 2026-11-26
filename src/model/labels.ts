// Where pin name labels go on a placeholder so they stay readable at tight
// pitch and never sit on top of a neighbouring pin.

import type { Point } from './types'
import type { Size } from './geometry'

export interface LabelPin {
  id: string
  name: string
  row?: string
  pos: Point
}

export interface PinLabel {
  x: number
  y: number
  anchor: 'start' | 'middle' | 'end'
  rotate: 0 | -90
  /** True when the label hangs outside the board outline. */
  outside: boolean
}

export interface PartMetrics {
  pitch: number
  font: number
  padR: number
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Pad and label sizes for each pin, from the distance to its nearest neighbour.
 * Sizing per pin lets a board carry a fine-pitch module beside 2.54 mm headers
 * without shrinking the header labels.
 */
export function pinMetrics(pins: Point[]): PartMetrics[] {
  return pins.map((p, i) => {
    let pitch = Infinity
    for (let j = 0; j < pins.length; j++) {
      if (j === i) continue
      const d = Math.hypot(p.x - pins[j].x, p.y - pins[j].y)
      if (d > 0.01 && d < pitch) pitch = d
    }
    if (!Number.isFinite(pitch)) pitch = 2.54
    pitch = Math.min(pitch, 2.54)
    return { pitch, font: clamp(pitch * 0.56, 0.75, 1.5), padR: clamp(pitch * 0.34, 0.38, 0.9) }
  })
}

/** Rough text width for the condensed label face. */
export const labelWidth = (name: string, font: number) => name.length * font * 0.46 + 0.3

export function layoutLabels(pins: LabelPin[], size: Size, metrics: PartMetrics[]): { labels: Record<string, PinLabel>; topExtent: number } {
  const labels: Record<string, PinLabel> = {}
  let topExtent = 0

  for (const [index, pin] of pins.entries()) {
    const m = metrics[index]
    const gap = m.padR + 0.4
    const mates = pin.row ? pins.filter((o) => o !== pin && o.row === pin.row) : []
    const spreadX = Math.max(0, ...mates.map((o) => Math.abs(o.pos.x - pin.pos.x)))
    const spreadY = Math.max(0, ...mates.map((o) => Math.abs(o.pos.y - pin.pos.y)))
    const horizontalRow = mates.length > 0 && spreadX > spreadY
    const tw = labelWidth(pin.name, m.font)

    if (!horizontalRow) {
      // Pins stacked in a column: the name reads sideways, toward the middle of the board.
      let dir = pin.pos.x < size.w / 2 ? 1 : -1
      const blocked = (q: LabelPin, d: number) => {
        const qm = metrics[pins.indexOf(q)]
        const reach = labelWidth(q.name, qm.font) + qm.padR * 2 + 0.4
        return pins.some((o) => o !== q && Math.abs(o.pos.y - q.pos.y) < qm.font * 0.8 && (o.pos.x - q.pos.x) * d > 0 && (o.pos.x - q.pos.x) * d < reach)
      }
      // The whole column flips together, so its labels never end up half inside and half outside.
      const column = [pin, ...mates]
      if (column.some((q) => blocked(q, dir)) && !column.some((q) => blocked(q, -dir))) dir = -dir
      const far = pin.pos.x + dir * (gap + tw)
      labels[pin.id] = {
        x: pin.pos.x + dir * gap,
        y: pin.pos.y,
        anchor: dir > 0 ? 'start' : 'end',
        rotate: 0,
        outside: far < 0 || far > size.w,
      }
      continue
    }

    const rowPitch = Math.min(...mates.map((o) => Math.abs(o.pos.x - pin.pos.x)).filter((d) => d > 0.01))
    let dir = pin.pos.y < size.h / 2 ? 1 : -1
    // One orientation per row: upright only when every name in the row fits its pitch.
    const widest = Math.max(tw, ...mates.map((o) => labelWidth(o.name, m.font)))
    const upright = rowPitch >= widest + 0.2
    const reach = upright ? m.font + gap + m.padR : tw + gap + m.padR
    const halfWidth = upright ? tw / 2 + m.padR : m.font * 0.8
    const blocked = (q: LabelPin, d: number) =>
      pins.some((o) => o !== q && Math.abs(o.pos.x - q.pos.x) < halfWidth && (o.pos.y - q.pos.y) * d > 0 && (o.pos.y - q.pos.y) * d < reach)
    const row = [pin, ...mates]
    if (row.some((q) => blocked(q, dir)) && !row.some((q) => blocked(q, -dir))) dir = -dir
    const length = upright ? m.font : tw
    const far = pin.pos.y + dir * (gap + length)
    const outside = far < 0 || far > size.h
    if (outside && dir < 0) topExtent = Math.max(topExtent, -far)

    labels[pin.id] = upright
      ? { x: pin.pos.x, y: pin.pos.y + dir * (gap + m.font / 2), anchor: 'middle', rotate: 0, outside }
      : // Rotated text reads bottom to top, so anchoring flips with the direction.
        { x: pin.pos.x, y: pin.pos.y + dir * gap, anchor: dir < 0 ? 'start' : 'end', rotate: -90, outside }
  }
  return { labels, topExtent }
}
