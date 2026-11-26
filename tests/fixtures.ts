import { DEFAULT_SETTINGS } from '../src/model/defaults'
import type { Library, PartDef, PlacedPart, Project, Settings } from '../src/model/types'

export const settings: Settings = structuredClone(DEFAULT_SETTINGS)

const base = { onHand: true, face: 'top' as const, verified: false, source: 'test', color: '#222' }

export const board: PartDef = {
  ...base,
  id: 'board',
  name: 'Board',
  category: 'Boards',
  width: 20,
  height: 10,
  pins: [
    { id: 'io18', name: 'IO18', type: 'gpio', x: 2.54, y: 2.54, row: 'left' },
    { id: 'tx', name: 'TX', type: 'uart_tx', x: 2.54, y: 5.08, row: 'left' },
    { id: '3v3', name: '3V3', type: '3v3', x: 2.54, y: 7.62, row: 'left' },
    { id: 'gnd1', name: 'GND', type: 'gnd', x: 17.46, y: 2.54, row: 'right' },
    { id: 'gnd2', name: 'GND', type: 'gnd', x: 17.46, y: 5.08, row: 'right' },
    { id: 'io5', name: 'IO5', type: 'gpio', x: 17.46, y: 7.62, row: 'right' },
  ],
  links: [['gnd1', 'gnd2']],
}

export const radio: PartDef = {
  ...base,
  id: 'radio',
  name: 'nRF24L01+',
  category: 'Radios',
  width: 10,
  height: 4,
  pins: [
    { id: 'gnd', name: 'GND', type: 'gnd', x: 1, y: 1 },
    { id: 'vcc', name: 'VCC', type: '3v3', x: 3, y: 1 },
    { id: 'sck', name: 'SCK', type: 'spi_sck', x: 5, y: 1 },
    { id: 'ce', name: 'CE', type: 'enable', x: 7, y: 1 },
  ],
}

export const gps: PartDef = {
  ...base,
  id: 'gps',
  name: 'GPS',
  category: 'Radios',
  width: 12,
  height: 6,
  pins: [
    { id: 'rx', name: 'RX', type: 'uart_rx', x: 2, y: 2 },
    { id: 'gnd', name: 'GND', type: 'gnd', x: 4, y: 2 },
  ],
}

export const lib: Library = { board, radio, gps }

export function place(id: string, partId: string, extra: Partial<PlacedPart> = {}): PlacedPart {
  return { id, partId, x: 0, y: 0, rotation: 0, flipped: false, ...extra }
}

export function project(extra: Partial<Project> = {}): Project {
  return {
    id: 'p',
    name: 'Test',
    parts: [place('b', 'board'), place('r1', 'radio'), place('r2', 'radio'), place('g', 'gps')],
    wires: [],
    ...extra,
  }
}
