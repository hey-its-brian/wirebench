import { describe, expect, it } from 'vitest'
import { computeNets, connectionsOf, pinKey } from '../src/model/nets'
import { lib, place, project } from './fixtures'

describe('computeNets', () => {
  it('joins modules grounded to different linked GND pins into one net', () => {
    const p = project({
      wires: [
        { id: 'w1', a: { part: 'b', pin: 'gnd1' }, b: { part: 'r1', pin: 'gnd' } },
        { id: 'w2', a: { part: 'b', pin: 'gnd2' }, b: { part: 'r2', pin: 'gnd' } },
      ],
    })
    const nets = computeNets(p, lib)
    expect(nets).toHaveLength(1)
    expect(nets[0].map(pinKey).sort()).toEqual(['b:gnd1', 'b:gnd2', 'r1:gnd', 'r2:gnd'])
  })

  it('reports what a pin connects to, and nothing for an open pin', () => {
    const p = project({ wires: [{ id: 'w1', a: { part: 'b', pin: 'io18' }, b: { part: 'r1', pin: 'sck' } }] })
    expect(connectionsOf(p, lib, { part: 'r1', pin: 'sck' })).toEqual([{ part: 'b', pin: 'io18' }])
    expect(connectionsOf(p, lib, { part: 'r1', pin: 'ce' })).toEqual([])
  })

  it('does not throw when a placed part is missing from the library', () => {
    const p = project({
      parts: [place('b', 'board'), place('x', 'gone')],
      wires: [{ id: 'w1', a: { part: 'b', pin: 'io18' }, b: { part: 'x', pin: 'p1' } }],
    })
    expect(() => computeNets(p, lib)).not.toThrow()
  })
})
