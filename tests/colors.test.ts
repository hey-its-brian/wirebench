import { describe, expect, it } from 'vitest'
import { resolveWireColor, wireAutoType } from '../src/model/colors'
import { FALLBACK_COLOR } from '../src/model/defaults'
import type { Wire } from '../src/model/types'
import { lib, place, project, settings } from './fixtures'

const color = (id: string) => settings.pinTypes.find((t) => t.id === id)!.color
const p = project()

describe('wire color rule', () => {
  it('takes the color of the more specific end', () => {
    const w: Wire = { id: 'w', a: { part: 'b', pin: 'io18' }, b: { part: 'r1', pin: 'sck' } }
    expect(wireAutoType(w, p, lib)).toBe('spi_sck')
    expect(resolveWireColor(w, p, lib, settings)).toBe(color('spi_sck'))
    const reversed: Wire = { id: 'w', a: w.b, b: w.a }
    expect(wireAutoType(reversed, p, lib)).toBe('spi_sck')
  })

  it('lets the module end win when both ends are specific and differ', () => {
    const w: Wire = { id: 'w', a: { part: 'b', pin: 'tx' }, b: { part: 'g', pin: 'rx' } }
    expect(wireAutoType(w, p, lib)).toBe('uart_rx')
    expect(wireAutoType({ id: 'w', a: w.b, b: w.a }, p, lib)).toBe('uart_rx')
  })

  it('falls back to the start end when neither or both are boards', () => {
    const w: Wire = { id: 'w', a: { part: 'r1', pin: 'ce' }, b: { part: 'r2', pin: 'sck' } }
    expect(wireAutoType(w, p, lib)).toBe('enable')
  })

  it('is plain GPIO when both ends are plain GPIO', () => {
    const w: Wire = { id: 'w', a: { part: 'b', pin: 'io18' }, b: { part: 'b', pin: 'io5' } }
    expect(wireAutoType(w, p, lib)).toBe('gpio')
  })

  it('lets a manual color win', () => {
    const w: Wire = { id: 'w', a: { part: 'b', pin: 'io18' }, b: { part: 'r1', pin: 'sck' }, color: '#123456' }
    expect(resolveWireColor(w, p, lib, settings)).toBe('#123456')
  })

  it('falls back to gray when the pin type was removed from settings', () => {
    const w: Wire = { id: 'w', a: { part: 'b', pin: 'io18' }, b: { part: 'r1', pin: 'sck' } }
    const trimmed = { ...settings, pinTypes: settings.pinTypes.filter((t) => t.id !== 'spi_sck') }
    expect(resolveWireColor(w, p, lib, trimmed)).toBe(FALLBACK_COLOR)
  })

  it('gives a wire to a missing part no type and the fallback color', () => {
    const broken = project({ parts: [place('b', 'board'), place('x', 'gone')] })
    const w: Wire = { id: 'w', a: { part: 'b', pin: 'io18' }, b: { part: 'x', pin: 'p1' } }
    expect(wireAutoType(w, broken, lib)).toBeNull()
    expect(resolveWireColor(w, broken, lib, settings)).toBe(FALLBACK_COLOR)
  })
})
