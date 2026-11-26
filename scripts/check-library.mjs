// Validates every file in data/library/. Exits non-zero if any part has a fault.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_PIN_TYPES } from '../src/model/defaults.ts'
import { validatePart } from '../src/model/validate.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dir = path.join(root, 'data', 'library')
const known = new Set(DEFAULT_PIN_TYPES.map((t) => t.id))

let faults = 0
let pins = 0
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
for (const f of files) {
  let def
  try {
    def = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
  } catch (err) {
    console.log(`${f}: does not parse (${err.message})`)
    faults++
    continue
  }
  const errors = validatePart(def)
  if (`${def.id}.json` !== f) errors.push(`id "${def.id}" does not match the file name`)
  if (!def.source) errors.push('no source line')
  // A rail gets its pins on the desk, so it has none in its file.
  if (!def.pins.length && !def.rail) errors.push('no pins')
  for (const p of def.pins) {
    // Custom pin types added in Settings are allowed; this only flags typos in the seed.
    if (!known.has(p.type)) errors.push(`pin "${p.id}" has unknown type "${p.type}"`)
  }
  pins += def.pins.length
  for (const e of errors) console.log(`${f}: ${e}`)
  faults += errors.length
}
console.log(`check-library: ${files.length} parts, ${pins} pins, ${faults} faults`)
process.exit(faults ? 1 : 0)
