import { describe, expect, it } from 'vitest'
import { validatePart } from '../src/model/validate'
import type { PartDef } from '../src/model/types'
import { board, radio } from './fixtures'

describe('validatePart', () => {
  it('passes clean parts', () => {
    expect(validatePart(board)).toEqual([])
    expect(validatePart(radio)).toEqual([])
  })
  it('reports each kind of fault', () => {
    const bad: PartDef = {
      ...radio,
      verified: true,
      pins: [
        { id: 'a', name: 'A', type: 'gpio', x: 1, y: 1 },
        { id: 'a', name: 'A2', type: 'gpio', x: 2, y: 1 },
        { id: 'b', name: 'B', type: 'gpio', x: 1, y: 1 },
        { id: 'c', name: 'C', type: 'gpio', x: 99, y: 1 },
      ],
      links: [['a', 'zz']],
    }
    const errors = validatePart(bad)
    expect(errors).toContain('duplicate pin id "a"')
    expect(errors).toContain('pin "b" shares a position with another pin')
    expect(errors).toContain('pin "c" is outside the part')
    expect(errors).toContain('link names unknown pin "zz"')
    expect(errors).toContain('verified is true but verifiedOn is missing')
  })
})
