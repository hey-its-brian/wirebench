// Checks one part file. Used by the library check script and by tests.

import type { PartDef } from './types.ts'

export function validatePart(def: PartDef): string[] {
  const errors: string[] = []
  const ids = new Set<string>()
  const spots = new Set<string>()
  for (const p of def.pins) {
    if (ids.has(p.id)) errors.push(`duplicate pin id "${p.id}"`)
    ids.add(p.id)
    const spot = `${p.x.toFixed(3)},${p.y.toFixed(3)}`
    if (spots.has(spot)) errors.push(`pin "${p.id}" shares a position with another pin`)
    spots.add(spot)
    if (p.x < 0 || p.y < 0 || p.x > def.width || p.y > def.height) {
      errors.push(`pin "${p.id}" is outside the part`)
    }
  }
  for (const group of def.links ?? []) {
    for (const id of group) {
      if (!ids.has(id)) errors.push(`link names unknown pin "${id}"`)
    }
  }
  if (def.verified && !def.verifiedOn) errors.push('verified is true but verifiedOn is missing')
  return errors
}
