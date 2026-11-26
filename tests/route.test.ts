import { describe, expect, it } from 'vitest'
import { GRID } from '../src/model/geometry'
import { assignLanes, DOWN, exitDir, LANE, LEFT, orthoPath, RIGHT, routeWire, UP } from '../src/model/route'
import type { Point } from '../src/model/types'

/** Every segment of a route must be exactly horizontal or vertical. */
const isOrthogonal = (pts: Point[]) =>
  pts.every((p, i) => i === 0 || Math.abs(p.x - pts[i - 1].x) < 1e-6 || Math.abs(p.y - pts[i - 1].y) < 1e-6)
const onLane = (v: number) => Math.abs(v / LANE - Math.round(v / LANE)) < 1e-6

describe('exitDir', () => {
  const box = { x: 0, y: 0, w: 27.94, h: 51.5 }
  it('sends a column of pins out through the nearer side', () => {
    const left = [0, 1, 2].map((i) => ({ x: 1.27, y: 8 + i * GRID }))
    const right = [0, 1, 2].map((i) => ({ x: 26.67, y: 8 + i * GRID }))
    const all = [...left, ...right]
    expect(exitDir(left[1], box, all.filter((p) => p !== left[1]), 'v')).toEqual(LEFT)
    expect(exitDir(right[1], box, all.filter((p) => p !== right[1]), 'v')).toEqual(RIGHT)
  })
  it('sends the edge row of a 2x4 header outward and the inner row the other way', () => {
    const radio = { x: 0, y: 0, w: 15.24, h: 29 }
    const inner = [0, 1, 2, 3].map((i) => ({ x: 3.81 + i * GRID, y: 24 }))
    const edge = [0, 1, 2, 3].map((i) => ({ x: 3.81 + i * GRID, y: 26.54 }))
    const all = [...inner, ...edge]
    expect(exitDir(edge[0], radio, all.filter((p) => p !== edge[0]), 'h')).toEqual(DOWN)
    expect(exitDir(inner[0], radio, all.filter((p) => p !== inner[0]), 'h')).toEqual(UP)
  })
  it('uses the nearest edge for a pin with no row', () => {
    expect(exitDir({ x: 1, y: 6 }, { x: 0, y: 0, w: 20, h: 12 }, [], null)).toEqual(LEFT)
    expect(exitDir({ x: 10, y: 11 }, { x: 0, y: 0, w: 20, h: 12 }, [], null)).toEqual(DOWN)
  })
})

describe('assignLanes', () => {
  it('lets the pin nearest the direction of travel turn first', () => {
    // Three pins on one side, all heading toward larger coordinates.
    const lanes = assignLanes([
      { id: 'top', group: 'g', along: 10, toward: 50 },
      { id: 'mid', group: 'g', along: 12.54, toward: 50 },
      { id: 'low', group: 'g', along: 15.08, toward: 50 },
    ])
    expect(lanes).toEqual({ low: 0, mid: 1, top: 2 })
  })
  it('shares a lane only between runs that are well clear of each other', () => {
    const lanes = assignLanes([
      { id: 'up', group: 'g', along: 10, toward: 0 },
      { id: 'up2', group: 'g', along: 12.54, toward: 0 },
      { id: 'down', group: 'g', along: 40, toward: 99 },
      { id: 'otherSide', group: 'other', along: 10, toward: 0 },
    ])
    // "down" runs from 40 to 99, far from the two going up, so it reuses lane 0.
    expect(lanes).toEqual({ down: 0, up: 0, up2: 1, otherSide: 0 })
  })
  it('never shares a lane between runs that pass each other', () => {
    // An upper pin heading down and a lower pin heading up cover the same stretch.
    const lanes = assignLanes([
      { id: 'upperGoingDown', group: 'g', along: 10, toward: 40 },
      { id: 'lowerGoingUp', group: 'g', along: 30, toward: 5 },
    ])
    expect(lanes.upperGoingDown).not.toBe(lanes.lowerGoingUp)
  })
})

describe('routeWire', () => {
  it('joins two facing pins with one vertical run on the half grid', () => {
    const r = routeWire({ pos: { x: 10, y: 10 }, dir: RIGHT, lane: 0 }, { pos: { x: 40, y: 20 }, dir: LEFT, lane: 0 })
    expect(isOrthogonal(r.pts)).toBe(true)
    expect(r.pts).toHaveLength(4)
    expect(r.pts[0]).toEqual({ x: 10, y: 10 })
    expect(r.pts[3]).toEqual({ x: 40, y: 20 })
    expect(r.pts[1].x).toBe(r.pts[2].x)
    expect(onLane(r.pts[1].x)).toBe(true)
    expect(r.pts[1].x).toBeGreaterThan(10)
  })

  it('gives each lane its own vertical run', () => {
    const run = (lane: number) => routeWire({ pos: { x: 10, y: 10 }, dir: RIGHT, lane }, { pos: { x: 60, y: 30 }, dir: LEFT, lane: 0 }).pts[1].x
    expect(run(1) - run(0)).toBeCloseTo(LANE)
    expect(run(2) - run(1)).toBeCloseTo(LANE)
  })

  it('goes straight across when the pins are level', () => {
    const r = routeWire({ pos: { x: 10, y: 10 }, dir: RIGHT, lane: 0 }, { pos: { x: 40, y: 10 }, dir: LEFT, lane: 0 })
    expect(r.pts).toEqual([{ x: 10, y: 10 }, { x: 40, y: 10 }])
    expect(r.hops).toEqual([0])
  })

  it('comes up into a pin that faces down', () => {
    const r = routeWire({ pos: { x: 10, y: 10 }, dir: RIGHT, lane: 0 }, { pos: { x: 40, y: 20 }, dir: DOWN, lane: 0 })
    expect(isOrthogonal(r.pts)).toBe(true)
    const last = r.pts[r.pts.length - 1]
    const before = r.pts[r.pts.length - 2]
    expect(before.x).toBeCloseTo(last.x)
    expect(before.y).toBeGreaterThan(last.y)
  })

  it('stays orthogonal for every pairing of directions, even off the grid', () => {
    const dirs = [LEFT, RIGHT, UP, DOWN]
    for (const da of dirs) {
      for (const db of dirs) {
        const r = routeWire({ pos: { x: 3.33, y: 7.77 }, dir: da, lane: 1 }, { pos: { x: 41.1, y: -12.9 }, dir: db, lane: 2 })
        expect(isOrthogonal(r.pts), `${JSON.stringify(da)} ${JSON.stringify(db)}`).toBe(true)
        expect(r.hops).toHaveLength(r.pts.length - 1)
      }
    }
  })

  it('joins manual bends with elbows and reports which hop each segment belongs to', () => {
    const r = routeWire({ pos: { x: 0, y: 0 }, dir: RIGHT, lane: 0 }, { pos: { x: 30, y: 20 }, dir: DOWN, lane: 0 }, [{ x: 10.16, y: 5.08 }])
    expect(isOrthogonal(r.pts)).toBe(true)
    expect(r.pts.some((p) => p.x === 10.16 && p.y === 5.08)).toBe(true)
    expect(r.pts[1]).toEqual({ x: 10.16, y: 0 })
    expect(r.hops[0]).toBe(0)
    expect(r.hops[r.hops.length - 1]).toBe(1)
  })
})

describe('orthoPath', () => {
  it('draws a plain line for two points and rounds each corner', () => {
    expect(orthoPath([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBe('M0.00 0.00 L10.00 0.00')
    const d = orthoPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }])
    expect(d.match(/Q/g)).toHaveLength(1)
    expect(d.endsWith('L10.00 10.00')).toBe(true)
    expect(orthoPath([{ x: 0, y: 0 }])).toBe('')
  })
})
