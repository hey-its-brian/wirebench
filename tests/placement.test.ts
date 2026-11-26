import { describe, expect, it } from 'vitest'
import { applyFillRow, fillableRows, fillRow, isImageComplete, nextUnplacedPin, placedCount, rowsOf } from '../src/model/placement'
import type { PartImage } from '../src/model/types'
import { board, radio } from './fixtures'

const img = (pins: PartImage['pins']): PartImage => ({ file: 'x.png', widthMm: 20, aspect: 0.5, pins })

describe('fillRow', () => {
  it('spaces points evenly, ends included', () => {
    const pts = fillRow({ u: 0, v: 0 }, { u: 1, v: 0 }, 5)
    expect(pts.map((p) => p.u)).toEqual([0, 0.25, 0.5, 0.75, 1])
  })
  it('handles one point and none', () => {
    expect(fillRow({ u: 0.2, v: 0.3 }, { u: 1, v: 1 }, 1)).toEqual([{ u: 0.2, v: 0.3 }])
    expect(fillRow({ u: 0, v: 0 }, { u: 1, v: 1 }, 0)).toEqual([])
  })
})

describe('image completeness', () => {
  it('is false until every pin is placed', () => {
    expect(isImageComplete(radio, undefined)).toBe(false)
    expect(isImageComplete(radio, img({ gnd: { u: 0, v: 0 }, vcc: { u: 0, v: 0 }, sck: { u: 0, v: 0 } }))).toBe(false)
    const all = Object.fromEntries(radio.pins.map((p) => [p.id, { u: 0.5, v: 0.5 }]))
    expect(isImageComplete(radio, img(all))).toBe(true)
    expect(placedCount(radio, img(all))).toBe(4)
  })
  it('is false for an image with no usable size', () => {
    const all = Object.fromEntries(radio.pins.map((p) => [p.id, { u: 0.5, v: 0.5 }]))
    expect(isImageComplete(radio, { file: 'x.png', widthMm: 0, aspect: 0.5, pins: all })).toBe(false)
  })
})

describe('nextUnplacedPin', () => {
  it('walks the pin map in order and wraps', () => {
    expect(nextUnplacedPin(radio, img({}))).toBe('gnd')
    expect(nextUnplacedPin(radio, img({ gnd: { u: 0, v: 0 } }), 'gnd')).toBe('vcc')
    expect(nextUnplacedPin(radio, img({ ce: { u: 0, v: 0 } }), 'sck')).toBe('gnd')
    const all = Object.fromEntries(radio.pins.map((p) => [p.id, { u: 0.5, v: 0.5 }]))
    expect(nextUnplacedPin(radio, img(all))).toBeNull()
  })
})

describe('rows', () => {
  it('groups pins by header', () => {
    expect(rowsOf(board)).toEqual([
      { row: 'left', pins: ['io18', 'tx', '3v3'] },
      { row: 'right', pins: ['gnd1', 'gnd2', 'io5'] },
    ])
    expect(rowsOf(radio)).toEqual([])
  })
  it('offers to fill a row once both ends are placed, and fills only the gaps', () => {
    const start = img({ io18: { u: 0.1, v: 0.2 }, '3v3': { u: 0.1, v: 0.8 } })
    expect(fillableRows(board, start).map((r) => r.row)).toEqual(['left'])
    const filled = applyFillRow(start, ['io18', 'tx', '3v3'])
    expect(filled.pins.tx.u).toBeCloseTo(0.1)
    expect(filled.pins.tx.v).toBeCloseTo(0.5)
    expect(filled.pins.io18).toEqual({ u: 0.1, v: 0.2 })
    expect(fillableRows(board, filled)).toEqual([])
  })
})
