import { describe, expect, it } from 'vitest'
import { buildWireList, partDisplayNames, wireListMarkdown } from '../src/model/wirelist'
import { lib, place, project, settings } from './fixtures'

describe('wire list', () => {
  const p = project({
    wires: [
      // Drawn module to board: the board end should still read first.
      { id: 'w1', a: { part: 'r1', pin: 'sck' }, b: { part: 'b', pin: 'io18' } },
      { id: 'w2', a: { part: 'b', pin: '3v3' }, b: { part: 'r2', pin: 'vcc' } },
      { id: 'w3', a: { part: 'r1', pin: 'gnd' }, b: { part: 'r2', pin: 'gnd' }, color: '#abcdef' },
    ],
  })
  const rows = buildWireList(p, lib, settings)

  it('puts the board end first', () => {
    expect(rows[0]).toMatchObject({ fromPart: 'Board', fromPin: 'IO18', toPart: 'nRF24L01+', toPin: 'SCK', fn: 'SPI SCK', color: 'purple' })
  })

  it('numbers repeats of the same part', () => {
    expect(partDisplayNames(p, lib)).toMatchObject({ r1: 'nRF24L01+', r2: 'nRF24L01+ #2' })
    expect(rows[1]).toMatchObject({ toPart: 'nRF24L01+ #2', toPin: 'VCC', color: 'red' })
  })

  it('lists a module to module wire as drawn, with a custom color as hex', () => {
    expect(rows[2]).toMatchObject({ fromPart: 'nRF24L01+', toPart: 'nRF24L01+ #2', color: '#abcdef' })
  })

  it('uses a label when the placed part has one', () => {
    const labelled = project({ parts: [place('b', 'board', { label: 'CYD' })] })
    expect(partDisplayNames(labelled, lib).b).toBe('CYD')
  })

  it('writes a Markdown table with six columns and one row per wire', () => {
    const md = wireListMarkdown(rows)
    const lines = md.trim().split('\n')
    expect(lines[0]).toBe('| From part | From pin | Function | To part | To pin | Wire color |')
    expect(lines).toHaveLength(2 + rows.length)
    // The export must never contain an em dash (character 0x2014).
    expect(md).not.toContain(String.fromCharCode(0x2014))
  })

  it('names a missing part instead of throwing', () => {
    const broken = project({
      parts: [place('b', 'board'), place('x', 'gone')],
      wires: [{ id: 'w', a: { part: 'b', pin: 'io18' }, b: { part: 'x', pin: 'p1' } }],
    })
    expect(buildWireList(broken, lib, settings)[0].toPart).toBe('Missing part (gone)')
  })
})
