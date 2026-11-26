import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { layoutPins, layoutWires } from '../src/model/layout'
import type { Library, PartDef, Point, Project } from '../src/model/types'

const libDir = path.join(__dirname, '..', 'data', 'library')
const library: Library = {}
for (const f of fs.readdirSync(libDir).filter((n) => n.endsWith('.json'))) {
  const def = JSON.parse(fs.readFileSync(path.join(libDir, f), 'utf8')) as PartDef
  library[def.id] = def
}

const wire = (id: string, a: string, b: string) => {
  const [ap, an] = a.split(':')
  const [bp, bn] = b.split(':')
  return { id, a: { part: ap, pin: an }, b: { part: bp, pin: bn } }
}

/** A DevKit with an nRF24 and a CC1101 to its right and an OLED to its left, as in a typical build. */
const build: Project = {
  id: 't',
  name: 't',
  parts: [
    { id: 'dk', partId: 'esp32-devkit-v1', x: 20.32, y: 20.32, rotation: 0, flipped: false },
    { id: 'rf', partId: 'nrf24l01', x: 81.28, y: 30.48, rotation: 0, flipped: false },
    { id: 'cc', partId: 'cc1101', x: 81.28, y: 76.2, rotation: 0, flipped: false },
    { id: 'ol', partId: 'ssd1306-oled-096', x: -30.48, y: 25.4, rotation: 0, flipped: false },
  ],
  wires: [
    wire('w1', 'dk:d18', 'rf:sck'), wire('w2', 'dk:d23', 'rf:mosi'), wire('w3', 'dk:d19', 'rf:miso'), wire('w4', 'dk:d5', 'rf:csn'),
    wire('w5', 'dk:3v3', 'rf:vcc'), wire('w6', 'dk:gnd-2', 'rf:gnd'), wire('w7', 'dk:tx2', 'rf:ce'), wire('w8', 'dk:d18', 'cc:sck'),
    wire('w9', 'dk:d4', 'cc:csn'), wire('w10', 'dk:d33', 'ol:sda'), wire('w11', 'dk:d32', 'ol:scl'), wire('w12', 'dk:gnd', 'ol:gnd'),
  ],
}

/** The ESP32-DIV loadout: a CYD above two nRF24 modules and a CC1101, all sharing the SPI bus taps. */
const div: Project = {
  id: 'd',
  name: 'd',
  parts: [
    { id: 'cyd', partId: 'cyd-2432s028r', x: 0, y: 0, rotation: 0, flipped: false },
    { id: 'n1', partId: 'nrf24l01-pa-lna', x: 5.08, y: 76.2, rotation: 0, flipped: false },
    { id: 'n2', partId: 'nrf24l01-pa-lna', x: 35.56, y: 76.2, rotation: 0, flipped: false },
    { id: 'cc', partId: 'cc1101', x: 66.04, y: 76.2, rotation: 90, flipped: false },
  ],
  wires: [
    wire('a1', 'cyd:tap-io18', 'n1:sck'), wire('a2', 'cyd:tap-io23', 'n1:mosi'), wire('a3', 'cyd:tap-io19', 'n1:miso'),
    wire('a4', 'cyd:tap-io4', 'n1:csn'), wire('a5', 'cyd:tap-io16', 'n1:ce'), wire('a6', 'cyd:cn1-3v3', 'n1:vcc'), wire('a7', 'cyd:cn1-gnd', 'n1:gnd'),
    wire('b1', 'cyd:tap-io18', 'n2:sck'), wire('b2', 'cyd:tap-io23', 'n2:mosi'), wire('b3', 'cyd:tap-io19', 'n2:miso'),
    wire('b4', 'cyd:tap-io26', 'n2:csn'), wire('b5', 'cyd:tap-io17', 'n2:ce'), wire('b6', 'cyd:cn1-3v3', 'n2:vcc'), wire('b7', 'cyd:p3-gnd', 'n2:gnd'),
    wire('c1', 'cyd:tap-io18', 'cc:sck'), wire('c2', 'cyd:tap-io23', 'cc:mosi'), wire('c3', 'cyd:tap-io19', 'cc:miso'),
    wire('c4', 'cyd:cn1-io27', 'cc:csn'), wire('c5', 'cyd:p3-io22', 'cc:gdo0'), wire('c6', 'cyd:p3-io35', 'cc:gdo2'),
  ],
}

interface Seg { wire: string; horizontal: boolean; line: number; lo: number; hi: number }

function segments(poly: Point[], wireId: string): Seg[] {
  const out: Seg[] = []
  for (let i = 1; i < poly.length; i++) {
    const p = poly[i - 1]
    const q = poly[i]
    const horizontal = Math.abs(p.y - q.y) < 1e-6
    out.push({
      wire: wireId,
      horizontal,
      line: horizontal ? p.y : p.x,
      lo: horizontal ? Math.min(p.x, q.x) : Math.min(p.y, q.y),
      hi: horizontal ? Math.max(p.x, q.x) : Math.max(p.y, q.y),
    })
  }
  return out
}

/** Pairs of wires that run on top of each other for more than a pad's width. */
function overlaps(project: Project): string[] {
  const pins = layoutPins(project, library)
  const segs = layoutWires(project, pins, 'grid').flatMap((w) => (w.poly ? segments(w.poly, w.wire.id) : []))
  const found: string[] = []
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const s = segs[i]
      const t = segs[j]
      if (s.wire === t.wire || s.horizontal !== t.horizontal || Math.abs(s.line - t.line) > 0.3) continue
      const shared = Math.min(s.hi, t.hi) - Math.max(s.lo, t.lo)
      // Two wires on one pin legitimately share the first stretch out of that pin.
      const ws = project.wires.find((w) => w.id === s.wire)!
      const wt = project.wires.find((w) => w.id === t.wire)!
      const keys = (w: typeof ws) => [`${w.a.part}:${w.a.pin}`, `${w.b.part}:${w.b.pin}`]
      const samePin = keys(ws).some((k) => keys(wt).includes(k))
      if (shared > 1 && !samePin) found.push(`${s.wire}/${t.wire} ${s.horizontal ? 'y' : 'x'}=${s.line.toFixed(2)} for ${shared.toFixed(1)} mm`)
    }
  }
  return found
}

describe('grid wiring of a typical build', () => {
  const pins = layoutPins(build, library)
  const wires = layoutWires(build, pins, 'grid')

  it('draws every wire with only horizontal and vertical runs', () => {
    for (const w of wires) {
      expect(w.poly, w.wire.id).not.toBeNull()
      for (let i = 1; i < w.poly!.length; i++) {
        const p = w.poly![i - 1]
        const q = w.poly![i]
        expect(Math.abs(p.x - q.x) < 1e-6 || Math.abs(p.y - q.y) < 1e-6, `${w.wire.id} segment ${i}`).toBe(true)
      }
    }
  })

  it('starts and ends every wire exactly on its pins', () => {
    for (const w of wires) {
      expect(w.poly![0]).toEqual(pins.pos.get(`${w.wire.a.part}:${w.wire.a.pin}`))
      expect(w.poly![w.poly!.length - 1]).toEqual(pins.pos.get(`${w.wire.b.part}:${w.wire.b.pin}`))
    }
  })

  it('never lays one wire on top of another', () => {
    expect(overlaps(build)).toEqual([])
  })

  it('keeps wires apart in the denser ESP32-DIV loadout, bar the odd short jog', () => {
    // Twenty wires onto two-row headers: a jog of a millimetre or two may touch, a long shared run may not.
    const long = overlaps(div).filter((line) => Number(/for ([\d.]+) mm/.exec(line)![1]) > 3)
    expect(long).toEqual([])
  })

  it('keeps every wire in the dense layout orthogonal and on its pins after wires are moved apart', () => {
    const p2 = layoutPins(div, library)
    for (const w of layoutWires(div, p2, 'grid')) {
      expect(w.poly![0]).toEqual(p2.pos.get(`${w.wire.a.part}:${w.wire.a.pin}`))
      expect(w.poly![w.poly!.length - 1]).toEqual(p2.pos.get(`${w.wire.b.part}:${w.wire.b.pin}`))
      expect(w.hops).toHaveLength(w.poly!.length - 1)
      for (let i = 1; i < w.poly!.length; i++) {
        const a = w.poly![i - 1]
        const b = w.poly![i]
        expect(Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6, `${w.wire.id} segment ${i}`).toBe(true)
      }
    }
  })

  it('leaves a wire the user has bent exactly where they put it', () => {
    const bent: Project = { ...build, wires: build.wires.map((w) => (w.id === 'w3' ? { ...w, points: [{ x: 60.96, y: 35.56 }] } : w)) }
    const w3 = layoutWires(bent, layoutPins(bent, library), 'grid').find((w) => w.wire.id === 'w3')!
    expect(w3.poly!.some((p) => p.x === 60.96 && p.y === 35.56)).toBe(true)
  })

  it('sends module pads outward from the module drawn on a board', () => {
    const cyd: Project = { id: 'c', name: 'c', parts: [{ id: 'cyd', partId: 'cyd-2432s028r', x: 0, y: 0, rotation: 0, flipped: false }], wires: [] }
    const p3 = layoutPins(cyd, library)
    // On the CYD the module sits at the right, so the board's nearest edge is to the right of every pad.
    expect(p3.dir.get('cyd:m-3v3')).toEqual({ x: -1, y: 0 })
    expect(p3.dir.get('cyd:m-io23')).toEqual({ x: 1, y: 0 })
    expect(p3.dir.get('cyd:m-io13')).toEqual({ x: 0, y: 1 })
    // Turned a quarter turn, the same pads still point away from the module.
    const turned: Project = { ...cyd, parts: [{ ...cyd.parts[0], rotation: 90 }] }
    const p4 = layoutPins(turned, library)
    expect(p4.dir.get('cyd:m-3v3')).toEqual({ x: 0, y: -1 })
    expect(p4.dir.get('cyd:m-io13')).toEqual({ x: -1, y: 0 })
  })

  it('still draws curved wires when grid wires are off', () => {
    const curved = layoutWires(build, pins, 'curved')
    expect(curved[0].d).toContain('Q')
    expect(curved[0].poly).toHaveLength(2)
  })

  it('skips a wire whose part is missing instead of throwing', () => {
    const broken: Project = { ...build, wires: [wire('x', 'dk:d18', 'gone:p1')] }
    expect(layoutWires(broken, layoutPins(broken, library), 'grid')[0].poly).toBeNull()
  })
})
