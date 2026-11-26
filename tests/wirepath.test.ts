import { describe, expect, it } from 'vitest'
import { layoutLabels, pinMetrics } from '../src/model/labels'
import { nearestSegment, wirePath } from '../src/model/wirepath'

describe('wirePath', () => {
  it('draws a quadratic curve for two points and cubics through bends', () => {
    expect(wirePath([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toMatch(/^M0\.00 0\.00 Q5\.00 1\.40 10\.00 0\.00$/)
    const bent = wirePath([{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }])
    expect(bent.match(/C/g)).toHaveLength(2)
    expect(wirePath([{ x: 0, y: 0 }])).toBe('')
  })
  it('finds the segment nearest a point', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]
    expect(nearestSegment(pts, { x: 4, y: 1 })).toBe(0)
    expect(nearestSegment(pts, { x: 9, y: 6 })).toBe(1)
  })
})

describe('label layout', () => {
  it('sends the edge row of a 2x4 header outside and the inner row inside', () => {
    const size = { w: 15.24, h: 29 }
    const names = [['VCC', 'CSN', 'MOSI', 'IRQ'], ['GND', 'CE', 'SCK', 'MISO']]
    const pins = names.flatMap((row, r) =>
      row.map((name, c) => ({ id: name, name, row: `r${r}`, pos: { x: 3.81 + c * 2.54, y: 24 + r * 2.54 } })),
    )
    const m = pinMetrics(pins.map((p) => p.pos))
    expect(m[0].pitch).toBeCloseTo(2.54)
    const { labels } = layoutLabels(pins, size, m)
    expect(labels.GND.outside).toBe(true)
    expect(labels.GND.rotate).toBe(-90)
    expect(labels.VCC.outside).toBe(false)
    expect(labels.VCC.y).toBeLessThan(24)
  })
  it('reads column pins sideways toward the middle of the board', () => {
    const pins = [0, 1, 2].flatMap((i) => [
      { id: `l${i}`, name: `D${i}`, row: 'left', pos: { x: 1.27, y: 5 + i * 2.54 } },
      { id: `r${i}`, name: `D${i}`, row: 'right', pos: { x: 26.67, y: 5 + i * 2.54 } },
    ])
    const { labels } = layoutLabels(pins, { w: 27.94, h: 20 }, pinMetrics(pins.map((p) => p.pos)))
    expect(labels.l0.anchor).toBe('start')
    expect(labels.r0.anchor).toBe('end')
    expect(labels.l0.outside).toBe(false)
  })
  it('sizes each pin from its own neighbours, so a fine-pitch module does not shrink header labels', () => {
    const header = [0, 1, 2].map((i) => ({ x: 1.27, y: 8 + i * 2.54 }))
    const module = [0, 1, 2].map((i) => ({ x: 10, y: 8 + i * 1.27 }))
    const m = pinMetrics([...header, ...module])
    expect(m[0].pitch).toBeCloseTo(2.54)
    expect(m[3].pitch).toBeCloseTo(1.27)
    expect(m[0].font).toBeGreaterThan(m[3].font)
    expect(m[3].padR).toBeLessThan(1.27 / 2)
  })
})
