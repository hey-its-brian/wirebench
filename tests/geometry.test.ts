import { describe, expect, it } from 'vitest'
import {
  flipPlaced, GRID, localToWorld, partGeometry, pinWorld, placedBounds, rotatePlaced, snapPlaced, snapTo,
} from '../src/model/geometry'
import type { PartDef, Rotation } from '../src/model/types'
import { board, place, radio } from './fixtures'

const onGrid = (v: number) => Math.abs(v / GRID - Math.round(v / GRID)) < 1e-9

describe('snapTo', () => {
  it('rounds to the nearest 2.54 mm', () => {
    expect(snapTo(3.0)).toBeCloseTo(2.54)
    expect(snapTo(3.9)).toBeCloseTo(5.08)
    expect(snapTo(-1.0)).toBeCloseTo(0)
  })
})

describe('localToWorld', () => {
  const size = { w: 10, h: 4 }
  const cases: [Rotation, number, number][] = [
    [0, 101, 51],
    [90, 103, 51],
    [180, 109, 53],
    [270, 101, 59],
  ]
  for (const [rotation, x, y] of cases) {
    it(`maps a pin at (1, 1) under rotation ${rotation}`, () => {
      expect(localToWorld({ x: 1, y: 1 }, size, { x: 100, y: 50, rotation })).toEqual({ x, y })
    })
  }
})

describe('partGeometry', () => {
  it('mirrors the placeholder left to right when flipped', () => {
    const g = partGeometry(radio, true)
    expect(g.mirrored).toBe(true)
    expect(g.pins.gnd).toEqual({ x: 9, y: 1 })
    expect(partGeometry(radio, false).pins.gnd).toEqual({ x: 1, y: 1 })
  })

  it('uses an image only once every pin is placed on it', () => {
    const partial: PartDef = {
      ...radio,
      images: { front: { file: 'r.png', widthMm: 30, aspect: 0.5, pins: { gnd: { u: 0.1, v: 0.2 } } } },
    }
    expect(partGeometry(partial, false).image).toBeUndefined()
    expect(partGeometry(partial, false).w).toBe(10)

    const pins = Object.fromEntries(radio.pins.map((p, i) => [p.id, { u: 0.1 * (i + 1), v: 0.5 }]))
    const full: PartDef = { ...radio, images: { front: { file: 'r.png', widthMm: 30, aspect: 0.5, pins } } }
    const g = partGeometry(full, false)
    expect(g.image?.file).toBe('r.png')
    expect(g.w).toBe(30)
    expect(g.h).toBe(15)
    expect(g.pins.gnd.x).toBeCloseTo(3)
    expect(g.pins.gnd.y).toBeCloseTo(7.5)
    // The other face has no image, so it falls back to the mirrored placeholder.
    expect(partGeometry(full, true).mirrored).toBe(true)
  })
})

describe('pinWorld', () => {
  it('returns null for an unknown pin or a missing part', () => {
    expect(pinWorld(radio, place('r', 'radio'), 'nope')).toBeNull()
    expect(pinWorld(undefined, place('r', 'gone'), 'gnd')).toBeNull()
  })
})

describe('rotatePlaced', () => {
  it('returns to where it started after four turns', () => {
    let p = place('r', 'radio', { x: 12, y: 7 })
    for (let i = 0; i < 4; i++) p = rotatePlaced(radio, p)
    expect(p.rotation).toBe(0)
    expect(p.x).toBeCloseTo(12)
    expect(p.y).toBeCloseTo(7)
  })
  it('keeps the centre of the bounding box fixed', () => {
    const before = placedBounds(radio, place('r', 'radio', { x: 12, y: 7 }))
    const after = placedBounds(radio, rotatePlaced(radio, place('r', 'radio', { x: 12, y: 7 })))
    expect(after.x + after.w / 2).toBeCloseTo(before.x + before.w / 2)
    expect(after.y + after.h / 2).toBeCloseTo(before.y + before.h / 2)
  })
  it('gives a missing part a stub box instead of throwing', () => {
    expect(() => rotatePlaced(undefined, place('x', 'gone'))).not.toThrow()
    expect(placedBounds(undefined, place('x', 'gone')).w).toBeGreaterThan(0)
  })
})

describe('snapPlaced', () => {
  it('puts the first pin on the grid under every rotation and flip', () => {
    for (const rotation of [0, 90, 180, 270] as Rotation[]) {
      for (const flipped of [false, true]) {
        const p = place('b', 'board', { x: 13.3, y: 41.9, rotation, flipped })
        const snapped = { ...p, ...snapPlaced(board, p) }
        const pin = pinWorld(board, snapped, 'io18')!
        expect(onGrid(pin.x), `x r${rotation} f${flipped}`).toBe(true)
        expect(onGrid(pin.y), `y r${rotation} f${flipped}`).toBe(true)
      }
    }
  })
  it('snaps the corner of a part that has no pins or is missing', () => {
    const s = snapPlaced(undefined, place('x', 'gone', { x: 3.0, y: 3.9 }))
    expect(s.x).toBeCloseTo(2.54)
    expect(s.y).toBeCloseTo(5.08)
  })
})

describe('flipPlaced', () => {
  it('toggles the face and keeps the centre', () => {
    const p = place('r', 'radio', { x: 5, y: 5 })
    const f = flipPlaced(radio, p)
    expect(f.flipped).toBe(true)
    expect(f.x).toBeCloseTo(5)
    expect(flipPlaced(radio, f).flipped).toBe(false)
  })
})
