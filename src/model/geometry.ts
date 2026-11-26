// Positions, rotation, flipping and snapping. All in millimetres.

import { isImageComplete } from './placement'
import type { PartDef, PartImage, PlacedPart, Point, Rotation } from './types'

/** Header pitch, 0.1 inch. Snapping to it lines parts up pin to pin. */
export const GRID = 2.54

export interface Size {
  w: number
  h: number
}

export function snapTo(v: number, grid = GRID): number {
  return Math.round(v / grid) * grid
}

export interface PartGeometry extends Size {
  /** Pin positions in the part's own unrotated box. */
  pins: Record<string, Point>
  /** Present when an uploaded image stands in for the placeholder. */
  image?: PartImage
  /** True when this is the placeholder seen from the other face. */
  mirrored: boolean
}

/** What a part looks like before rotation: its box and where its pins are. */
export function partGeometry(def: PartDef, flipped: boolean): PartGeometry {
  const img = flipped ? def.images?.flipped : def.images?.front
  if (isImageComplete(def, img)) {
    const w = img.widthMm
    const h = img.widthMm * img.aspect
    const pins: Record<string, Point> = {}
    for (const p of def.pins) {
      const spot = img.pins[p.id]
      pins[p.id] = { x: spot.u * w, y: spot.v * h }
    }
    return { w, h, pins, image: img, mirrored: false }
  }
  const pins: Record<string, Point> = {}
  for (const p of def.pins) {
    pins[p.id] = { x: flipped ? def.width - p.x : p.x, y: p.y }
  }
  return { w: def.width, h: def.height, pins, mirrored: flipped }
}

export function rotatedSize(size: Size, r: Rotation): Size {
  return r === 90 || r === 270 ? { w: size.h, h: size.w } : { w: size.w, h: size.h }
}

/** Clockwise rotation inside the rotated bounding box, measured from its top-left. */
export function rotatePoint(p: Point, size: Size, r: Rotation): Point {
  switch (r) {
    case 90:
      return { x: size.h - p.y, y: p.x }
    case 180:
      return { x: size.w - p.x, y: size.h - p.y }
    case 270:
      return { x: p.y, y: size.w - p.x }
    default:
      return { x: p.x, y: p.y }
  }
}

export function localToWorld(p: Point, size: Size, placed: { x: number; y: number; rotation: Rotation }): Point {
  const q = rotatePoint(p, size, placed.rotation)
  return { x: placed.x + q.x, y: placed.y + q.y }
}

export function pinWorld(def: PartDef | undefined, placed: PlacedPart, pinId: string): Point | null {
  if (!def) return null
  const g = partGeometry(def, placed.flipped)
  const p = g.pins[pinId]
  if (!p) return null
  return localToWorld(p, g, placed)
}

/** Size of a missing part's stub, so the desk can still draw and select it. */
export const MISSING_SIZE: Size = { w: 20.32, h: 10.16 }

export function placedBounds(def: PartDef | undefined, placed: PlacedPart): { x: number; y: number; w: number; h: number } {
  const g = def ? partGeometry(def, placed.flipped) : MISSING_SIZE
  const s = rotatedSize(g, placed.rotation)
  return { x: placed.x, y: placed.y, w: s.w, h: s.h }
}

/**
 * The position that puts the part's first pin on a grid point. Snapping the pin,
 * not the board corner, is what lines headers of different parts up.
 */
export function snapPlaced(def: PartDef | undefined, placed: PlacedPart, grid = GRID): Point {
  const first = def?.pins[0]
  const anchor = def && first ? pinWorld(def, placed, first.id) : null
  if (!anchor) return { x: snapTo(placed.x, grid), y: snapTo(placed.y, grid) }
  return {
    x: placed.x + (snapTo(anchor.x, grid) - anchor.x),
    y: placed.y + (snapTo(anchor.y, grid) - anchor.y),
  }
}

/** Turn 90 degrees clockwise, keeping the centre of the bounding box where it is. */
export function rotatePlaced(def: PartDef | undefined, placed: PlacedPart): PlacedPart {
  const b = placedBounds(def, placed)
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  const rotation = ((placed.rotation + 90) % 360) as Rotation
  // After a quarter turn the box's width and height swap.
  return { ...placed, rotation, x: cx - b.h / 2, y: cy - b.w / 2 }
}

/** Flip to the other face, keeping the centre where it is (the image may differ in size). */
export function flipPlaced(def: PartDef | undefined, placed: PlacedPart): PlacedPart {
  const before = placedBounds(def, placed)
  const next = { ...placed, flipped: !placed.flipped }
  const after = placedBounds(def, next)
  return {
    ...next,
    x: before.x + before.w / 2 - after.w / 2,
    y: before.y + before.h / 2 - after.h / 2,
  }
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
