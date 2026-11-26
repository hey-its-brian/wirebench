import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/store/api', () => ({
  api: {
    getLibrary: vi.fn(async () => []),
    putPart: vi.fn(async () => ({ ok: true })),
    getSettings: vi.fn(async () => ({})),
    putSettings: vi.fn(async () => ({ ok: true })),
    listProjects: vi.fn(async () => []),
    getProject: vi.fn(async () => ({})),
    putProject: vi.fn(async () => ({ ok: true })),
    deleteProject: vi.fn(async () => ({ ok: true })),
    uploadImage: vi.fn(async () => ({ file: 'x.png' })),
    deleteImage: vi.fn(async () => ({ ok: true })),
  },
}))

import { GRID, pinWorld } from '../src/model/geometry'
import { computeNets } from '../src/model/nets'
import { useStore } from '../src/store/store'
import { lib, settings } from './fixtures'

const s = () => useStore.getState()
const onGrid = (v: number) => Math.abs(v / GRID - Math.round(v / GRID)) < 1e-9

beforeEach(() => {
  useStore.setState({
    library: lib,
    settings: { ...settings, snap: true },
    project: { id: 'p', name: 'Test', parts: [], wires: [] },
    past: [],
    future: [],
    selection: { parts: [], wires: [] },
    wireColor: 'auto',
  })
})

describe('parts', () => {
  it('adds a part snapped so its first pin is on the grid', () => {
    const id = s().addPart('board', { x: 51.3, y: 33.7 })
    const placed = s().project.parts.find((p) => p.id === id)!
    const pin = pinWorld(lib.board, placed, 'io18')!
    expect(onGrid(pin.x) && onGrid(pin.y)).toBe(true)
    expect(s().selection.parts).toEqual([id])
  })

  it('leaves the position alone when snap is off', () => {
    useStore.setState({ settings: { ...settings, snap: false } })
    const id = s().addPart('radio', { x: 51.3, y: 33.7 })
    const placed = s().project.parts.find((p) => p.id === id)!
    expect(placed.x).toBeCloseTo(51.3 - 5)
    expect(placed.y).toBeCloseTo(33.7 - 2)
  })

  it('still places a part whose id is not in the library', () => {
    const id = s().addPart('gone', { x: 10, y: 10 })
    expect(s().project.parts.some((p) => p.id === id)).toBe(true)
    expect(() => computeNets(s().project, s().library)).not.toThrow()
    expect(() => s().rotateSelected()).not.toThrow()
    expect(() => s().flipSelected()).not.toThrow()
  })

  it('undoes and redoes a move', () => {
    const id = s().addPart('radio', { x: 20, y: 20 })
    const before = { ...s().project.parts[0] }
    s().moveParts([id], GRID * 3, 0, true)
    expect(s().project.parts[0].x).toBeCloseTo(before.x + GRID * 3)
    s().undo()
    expect(s().project.parts[0].x).toBeCloseTo(before.x)
    s().redo()
    expect(s().project.parts[0].x).toBeCloseTo(before.x + GRID * 3)
  })

  it('treats a drag as one undo step', () => {
    const id = s().addPart('radio', { x: 20, y: 20 })
    const start = s().project.parts[0].x
    s().beginDrag()
    s().setPartPositions({ [id]: { x: start + 1, y: 0 } })
    s().setPartPositions({ [id]: { x: start + 2, y: 0 } })
    s().setPartPositions({ [id]: { x: start + 3, y: 0 } })
    s().undo()
    expect(s().project.parts[0].x).toBeCloseTo(start)
  })

  it('rotates and flips the selection', () => {
    s().addPart('radio', { x: 20, y: 20 })
    s().rotateSelected()
    expect(s().project.parts[0].rotation).toBe(90)
    s().flipSelected()
    expect(s().project.parts[0].flipped).toBe(true)
  })
})

describe('wires', () => {
  function twoParts() {
    const b = s().addPart('board', { x: 20, y: 20 })
    const r = s().addPart('radio', { x: 60, y: 20 })
    return { b, r }
  }

  it('refuses a wire from a pin to itself', () => {
    const { b } = twoParts()
    expect(s().addWire({ part: b, pin: 'io18' }, { part: b, pin: 'io18' })).toBeNull()
    expect(s().project.wires).toHaveLength(0)
  })

  it('refuses a duplicate wire in either direction', () => {
    const { b, r } = twoParts()
    expect(s().addWire({ part: b, pin: 'io18' }, { part: r, pin: 'sck' })).not.toBeNull()
    expect(s().addWire({ part: b, pin: 'io18' }, { part: r, pin: 'sck' })).toBeNull()
    expect(s().addWire({ part: r, pin: 'sck' }, { part: b, pin: 'io18' })).toBeNull()
    expect(s().project.wires).toHaveLength(1)
  })

  it('allows several wires on one pin', () => {
    const { b, r } = twoParts()
    s().addWire({ part: b, pin: '3v3' }, { part: r, pin: 'vcc' })
    s().addWire({ part: b, pin: '3v3' }, { part: r, pin: 'ce' })
    expect(s().project.wires).toHaveLength(2)
  })

  it('applies the chosen wire color to new wires and none in auto mode', () => {
    const { b, r } = twoParts()
    s().addWire({ part: b, pin: 'io18' }, { part: r, pin: 'sck' })
    expect(s().project.wires[0].color).toBeUndefined()
    s().setWireColorMode('#fb8c00')
    s().addWire({ part: b, pin: 'io5' }, { part: r, pin: 'ce' })
    expect(s().project.wires[1].color).toBe('#fb8c00')
    s().setWireColor(s().project.wires[1].id, undefined)
    expect(s().project.wires[1].color).toBeUndefined()
  })

  it('removes attached wires with a deleted part, and one undo restores both', () => {
    const { b, r } = twoParts()
    s().addWire({ part: b, pin: 'io18' }, { part: r, pin: 'sck' })
    s().addWire({ part: b, pin: '3v3' }, { part: r, pin: 'vcc' })
    s().select({ parts: [r] })
    s().deleteSelected()
    expect(s().project.parts.map((p) => p.id)).toEqual([b])
    expect(s().project.wires).toHaveLength(0)
    s().undo()
    expect(s().project.parts).toHaveLength(2)
    expect(s().project.wires).toHaveLength(2)
  })

  it('duplicates wires only when both ends were copied', () => {
    const { b, r } = twoParts()
    s().addWire({ part: b, pin: 'io18' }, { part: r, pin: 'sck' })
    s().select({ parts: [b, r] })
    s().duplicateSelected()
    expect(s().project.parts).toHaveLength(4)
    expect(s().project.wires).toHaveLength(2)
    s().select({ parts: [b] })
    s().duplicateSelected()
    expect(s().project.wires).toHaveLength(2)
  })

  it('moves bend points with a wire when both ends move together', () => {
    const { b, r } = twoParts()
    const id = s().addWire({ part: b, pin: 'io18' }, { part: r, pin: 'sck' })!
    s().setWirePoints(id, [{ x: 40, y: 40 }])
    s().moveParts([b, r], GRID, GRID * 2, false)
    expect(s().project.wires[0].points![0].x).toBeCloseTo(40 + GRID)
    expect(s().project.wires[0].points![0].y).toBeCloseTo(40 + GRID * 2)
    s().moveParts([b], GRID, 0, false)
    expect(s().project.wires[0].points![0].x).toBeCloseTo(40 + GRID)
  })
})

describe('selection', () => {
  it('toggles with additive select', () => {
    const a = s().addPart('radio', { x: 10, y: 10 })
    const b = s().addPart('radio', { x: 40, y: 10 })
    s().select({ parts: [a] })
    s().select({ parts: [b] }, true)
    expect(s().selection.parts.sort()).toEqual([a, b].sort())
    s().select({ parts: [a] }, true)
    expect(s().selection.parts).toEqual([b])
  })
})
