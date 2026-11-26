// Turns a part on the desk into the part definition it should be drawn and
// wired with. For most parts that is the library file unchanged. A rail is the
// exception: its pins are made here, as many as that one rail on the desk asks for.

import { GRID } from './geometry'
import type { Library, PartDef, PinDef, PlacedPart } from './types'

export const RAIL_MIN = 2
export const RAIL_MAX = 40
export const RAIL_DEFAULT = 4

/** Room at the left of a rail for its name. */
const RAIL_LABEL = GRID * 3
const RAIL_HEIGHT = GRID * 1.5

const clampCount = (n: number) => Math.min(RAIL_MAX, Math.max(RAIL_MIN, Math.round(n)))

/** How many pins a rail on the desk has. */
export function railCount(placed: Pick<PlacedPart, 'pins'>): number {
  return clampCount(placed.pins ?? RAIL_DEFAULT)
}

export const railPinId = (index: number) => `p${index + 1}`

// One generated definition per library part and pin count, so the same object
// comes back each time and React can skip redrawing.
const cache = new WeakMap<PartDef, Map<number, PartDef>>()

function railDef(base: PartDef, count: number): PartDef {
  let byCount = cache.get(base)
  if (!byCount) cache.set(base, (byCount = new Map()))
  const hit = byCount.get(count)
  if (hit) return hit

  const rail = base.rail!
  const pins: PinDef[] = Array.from({ length: count }, (_, i) => ({
    id: railPinId(i),
    name: `${i + 1}`,
    type: rail.type,
    x: RAIL_LABEL + i * GRID,
    y: RAIL_HEIGHT / 2,
    row: 'rail',
  }))
  const { images: _images, ...rest } = base
  const def: PartDef = {
    ...rest,
    width: RAIL_LABEL + (count - 1) * GRID + GRID * 0.75,
    height: RAIL_HEIGHT,
    pins,
    // Every pin of a rail is the same net.
    links: [pins.map((p) => p.id)],
    // Centred in the space before the first pin, so it still fits when the rail is turned upright.
    captions: [{ text: rail.label, x: (RAIL_LABEL - GRID / 2) / 2, y: RAIL_HEIGHT / 2, anchor: 'middle' }],
  }
  byCount.set(count, def)
  return def
}

/** The definition to use for a part on the desk, or undefined when its library file is missing. */
export function resolveDef(lib: Library, placed: Pick<PlacedPart, 'partId' | 'pins'>): PartDef | undefined {
  const base = lib[placed.partId]
  if (!base || !base.rail) return base
  return railDef(base, railCount(placed))
}
