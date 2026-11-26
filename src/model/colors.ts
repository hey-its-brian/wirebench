// The wire color rule. A manual color wins; otherwise the wire takes the color
// of its more specific end, so a wire from IO18 to SCK is the SCK color.

import { FALLBACK_COLOR } from './defaults'
import { resolveDef } from './parts'
import type { Library, PinDef, PinRef, PinTypeId, Project, Settings, Wire } from './types'

export const BOARD_CATEGORY = 'Boards'

export interface ResolvedEnd {
  pin: PinDef
  isBoard: boolean
}

export function resolveEnd(ref: PinRef, project: Project, lib: Library): ResolvedEnd | null {
  const placed = project.parts.find((p) => p.id === ref.part)
  const def = placed ? resolveDef(lib, placed) : undefined
  const pin = def?.pins.find((p) => p.id === ref.pin)
  if (!def || !pin) return null
  return { pin, isBoard: def.category === BOARD_CATEGORY }
}

/** Which pin type gives this wire its color. Null when an end cannot be found. */
export function wireAutoType(wire: Wire, project: Project, lib: Library): PinTypeId | null {
  const a = resolveEnd(wire.a, project, lib)
  const b = resolveEnd(wire.b, project, lib)
  if (!a || !b) return null
  const aSpecific = a.pin.type !== 'gpio'
  const bSpecific = b.pin.type !== 'gpio'
  if (aSpecific && !bSpecific) return a.pin.type
  if (bSpecific && !aSpecific) return b.pin.type
  if (!aSpecific && !bSpecific) return 'gpio'
  if (a.pin.type === b.pin.type) return a.pin.type
  // Both specific and different (TX to RX): the module's view wins over the board's.
  if (a.isBoard && !b.isBoard) return b.pin.type
  return a.pin.type
}

export function pinTypeColor(type: PinTypeId | null, settings: Settings): string {
  return settings.pinTypes.find((t) => t.id === type)?.color ?? FALLBACK_COLOR
}

export function resolveWireColor(wire: Wire, project: Project, lib: Library, settings: Settings): string {
  if (wire.color) return wire.color
  return pinTypeColor(wireAutoType(wire, project, lib), settings)
}

/** Relative luminance, 0 (black) to 1 (white), for picking a readable outline. */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return 0.5
  const n = parseInt(m[1], 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}
