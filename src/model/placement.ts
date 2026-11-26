// Helpers for placing a part's existing pins on an uploaded image.

import type { PartDef, PartImage } from './types'

export type UV = { u: number; v: number }

/** An image is used on the desk only once every pin has a spot on it. */
export function isImageComplete(def: PartDef, img?: PartImage): img is PartImage {
  if (!img || !img.file || !(img.widthMm > 0) || !(img.aspect > 0)) return false
  if (def.pins.length === 0) return true
  return def.pins.every((p) => img.pins[p.id] !== undefined)
}

export function placedCount(def: PartDef, img: PartImage): number {
  return def.pins.filter((p) => img.pins[p.id] !== undefined).length
}

/** The first pin, in pin map order, that has no spot yet. */
export function nextUnplacedPin(def: PartDef, img: PartImage, after?: string): string | null {
  const ids = def.pins.map((p) => p.id)
  const start = after ? ids.indexOf(after) + 1 : 0
  // Look forward from the current pin first, then wrap, so placing runs down a header.
  const order = [...ids.slice(start), ...ids.slice(0, start)]
  return order.find((id) => img.pins[id] === undefined) ?? null
}

/** count evenly spaced points from a to b, both included. */
export function fillRow(a: UV, b: UV, count: number): UV[] {
  if (count <= 0) return []
  if (count === 1) return [{ ...a }]
  const out: UV[] = []
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1)
    out.push({ u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t })
  }
  return out
}

/** Pins grouped by their header, in pin map order. Pins with no row are left out. */
export function rowsOf(def: PartDef): { row: string; pins: string[] }[] {
  const rows: { row: string; pins: string[] }[] = []
  for (const p of def.pins) {
    if (!p.row) continue
    let r = rows.find((x) => x.row === p.row)
    if (!r) {
      r = { row: p.row, pins: [] }
      rows.push(r)
    }
    r.pins.push(p.id)
  }
  return rows
}

/** Rows whose first and last pins are placed but which still have gaps between them. */
export function fillableRows(def: PartDef, img: PartImage): { row: string; pins: string[] }[] {
  return rowsOf(def).filter((r) => {
    if (r.pins.length < 3) return false
    const first = img.pins[r.pins[0]]
    const last = img.pins[r.pins[r.pins.length - 1]]
    return !!first && !!last && r.pins.some((id) => img.pins[id] === undefined)
  })
}

/** Place the unplaced pins of a row at even spacing between its two ends. */
export function applyFillRow(img: PartImage, rowPins: string[]): PartImage {
  const first = img.pins[rowPins[0]]
  const last = img.pins[rowPins[rowPins.length - 1]]
  if (!first || !last) return img
  const spots = fillRow(first, last, rowPins.length)
  const pins = { ...img.pins }
  rowPins.forEach((id, i) => {
    if (pins[id] === undefined) pins[id] = spots[i]
  })
  return { ...img, pins }
}
