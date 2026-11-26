import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/store/api', () => ({
  api: {
    getLibrary: vi.fn(async () => []), putPart: vi.fn(async () => ({ ok: true })), getSettings: vi.fn(async () => ({})),
    putSettings: vi.fn(async () => ({ ok: true })), listProjects: vi.fn(async () => []), getProject: vi.fn(async () => ({})),
    putProject: vi.fn(async () => ({ ok: true })), deleteProject: vi.fn(async () => ({ ok: true })),
    uploadImage: vi.fn(async () => ({ file: 'x.png' })), deleteImage: vi.fn(async () => ({ ok: true })),
  },
}))

import { resolveWireColor } from '../src/model/colors'
import { GRID, pinWorld } from '../src/model/geometry'
import { layoutPins, layoutWires } from '../src/model/layout'
import { computeNets, pinKey } from '../src/model/nets'
import { RAIL_DEFAULT, RAIL_MAX, RAIL_MIN, railCount, resolveDef } from '../src/model/parts'
import type { Library, PartDef, Project } from '../src/model/types'
import { buildWireList } from '../src/model/wirelist'
import { useStore } from '../src/store/store'
import { lib as baseLib, place, settings } from './fixtures'

const rail: PartDef = {
  id: 'rail-gnd', name: 'GND rail', category: 'Power and passives', onHand: true, face: 'top', verified: false, source: 'test',
  width: 15.24, height: 3.81, color: '#222', pins: [], rail: { type: 'gnd', label: 'GND' },
}
const lib: Library = { ...baseLib, 'rail-gnd': rail }

describe('resolveDef', () => {
  it('gives a rail its default pins, all joined, on the 2.54 mm pitch', () => {
    const def = resolveDef(lib, { partId: 'rail-gnd' })!
    expect(def.pins).toHaveLength(RAIL_DEFAULT)
    expect(def.pins.every((p) => p.type === 'gnd')).toBe(true)
    expect(def.pins[1].x - def.pins[0].x).toBeCloseTo(GRID)
    expect(def.links).toEqual([def.pins.map((p) => p.id)])
    expect(def.pins.every((p) => p.x > 0 && p.x < def.width)).toBe(true)
  })

  it('follows the pin count of the rail on the desk, within limits', () => {
    expect(resolveDef(lib, { partId: 'rail-gnd', pins: 9 })!.pins).toHaveLength(9)
    expect(railCount({ pins: 0 })).toBe(RAIL_MIN)
    expect(railCount({ pins: 999 })).toBe(RAIL_MAX)
    expect(resolveDef(lib, { partId: 'rail-gnd', pins: 9 })!.width).toBeGreaterThan(resolveDef(lib, { partId: 'rail-gnd', pins: 4 })!.width)
  })

  it('keeps pin ids stable as a rail grows, and returns the same object for the same count', () => {
    const four = resolveDef(lib, { partId: 'rail-gnd', pins: 4 })!
    const six = resolveDef(lib, { partId: 'rail-gnd', pins: 6 })!
    expect(six.pins.slice(0, 4).map((p) => p.id)).toEqual(four.pins.map((p) => p.id))
    expect(resolveDef(lib, { partId: 'rail-gnd', pins: 4 })).toBe(four)
  })

  it('passes ordinary parts through unchanged and reports a missing part', () => {
    expect(resolveDef(lib, { partId: 'board' })).toBe(lib.board)
    expect(resolveDef(lib, { partId: 'gone' })).toBeUndefined()
  })
})

describe('a rail in a project', () => {
  const project: Project = {
    id: 'p', name: 'p',
    parts: [place('b', 'board'), place('r1', 'radio', { x: 40 }), place('r2', 'radio', { x: 60 }), { ...place('g', 'rail-gnd', { x: 30, y: 40 }), pins: 5 }],
    wires: [
      { id: 'w1', a: { part: 'b', pin: 'gnd1' }, b: { part: 'g', pin: 'p1' } },
      { id: 'w2', a: { part: 'r1', pin: 'gnd' }, b: { part: 'g', pin: 'p2' } },
      { id: 'w3', a: { part: 'r2', pin: 'gnd' }, b: { part: 'g', pin: 'p5' } },
    ],
  }

  it('puts everything wired to the rail on one net', () => {
    const net = computeNets(project, lib).find((n) => n.some((r) => pinKey(r) === 'g:p1'))!
    const keys = net.map(pinKey)
    for (const k of ['b:gnd1', 'b:gnd2', 'r1:gnd', 'r2:gnd', 'g:p3', 'g:p5']) expect(keys, k).toContain(k)
  })

  it('colors and lists rail wires by the rail type', () => {
    const gnd = settings.pinTypes.find((t) => t.id === 'gnd')!.color
    expect(resolveWireColor(project.wires[1], project, lib, settings)).toBe(gnd)
    const row = buildWireList(project, lib, settings)[1]
    expect([row.fromPart, row.toPart]).toContain('GND rail')
    expect(row.fn).toBe('GND')
  })

  it('sends a rail wire out of the side facing whatever it connects to', () => {
    const pins = layoutPins(project, lib)
    expect(pins.twoSided.has('g:p1')).toBe(true)
    const above = layoutWires(project, pins, 'grid').find((w) => w.wire.id === 'w1')!
    // The board is above the rail, so the wire arrives at the rail pin from above.
    const end = above.poly![above.poly!.length - 1]
    const before = above.poly![above.poly!.length - 2]
    expect(before.y).toBeLessThan(end.y)

    const below: Project = { ...project, parts: project.parts.map((p) => (p.id === 'g' ? { ...p, y: -40 } : p)) }
    const w = layoutWires(below, layoutPins(below, lib), 'grid').find((x) => x.wire.id === 'w1')!
    expect(w.poly![w.poly!.length - 2].y).toBeGreaterThan(w.poly![w.poly!.length - 1].y)
  })
})

describe('setRailPins', () => {
  const s = () => useStore.getState()
  beforeEach(() => {
    useStore.setState({
      library: lib, settings: { ...settings, snap: true }, project: { id: 'p', name: 'p', parts: [], wires: [] },
      past: [], future: [], selection: { parts: [], wires: [] }, wireColor: 'auto',
    })
  })

  it('adds and removes pins as one undo step each', () => {
    const id = s().addPart('rail-gnd', { x: 20, y: 20 })
    expect(s().setRailPins(id, 7)).toBe(true)
    expect(s().project.parts[0].pins).toBe(7)
    expect(pinWorld(resolveDef(lib, s().project.parts[0]), s().project.parts[0], 'p7')).not.toBeNull()
    s().undo()
    expect(s().project.parts[0].pins).toBeUndefined()
  })

  it('refuses to remove a pin that still has a wire', () => {
    const rid = s().addPart('rail-gnd', { x: 20, y: 20 })
    const bid = s().addPart('board', { x: 60, y: 20 })
    s().setRailPins(rid, 6)
    s().addWire({ part: bid, pin: 'gnd1' }, { part: rid, pin: 'p6' })
    expect(s().setRailPins(rid, 5)).toBe(false)
    expect(s().project.parts.find((p) => p.id === rid)!.pins).toBe(6)
    expect(s().project.wires).toHaveLength(1)
  })

  it('stays within the limits and ignores parts that are not rails', () => {
    const rid = s().addPart('rail-gnd', { x: 20, y: 20 })
    s().setRailPins(rid, 999)
    expect(s().project.parts[0].pins).toBe(RAIL_MAX)
    s().setRailPins(rid, 0)
    expect(s().project.parts[0].pins).toBe(RAIL_MIN)
    const bid = s().addPart('board', { x: 60, y: 20 })
    expect(s().setRailPins(bid, 5)).toBe(false)
  })
})
