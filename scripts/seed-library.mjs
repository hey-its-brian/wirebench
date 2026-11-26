// Writes the starter parts library to data/library/, one JSON file per part.
// It skips any file that already exists, so it never overwrites image
// placements or "checked" flags. Pass --force to rewrite everything.
//
// Every part ships unverified. The source line says where its pin map came from.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'data', 'library')
const force = process.argv.includes('--force')
// --only=id,id rewrites just those parts, leaving every other file alone.
const only = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7).split(',').filter(Boolean)
const P = 2.54

const r3 = (n) => Math.round(n * 1000) / 1000
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** One pin: name, type, and optional extras (id, gpio, caps, internalUse, note). */
const p = (name, type, extra = {}) => ({ name, type, ...extra })
const io = (n, extra = {}) => p(`IO${n}`, 'gpio', { gpio: n, ...extra })
const gnd = (extra = {}) => p('GND', 'gnd', extra)

/** A vertical header, top to bottom. */
const col = (x, y0, row, pins, pitch = P) => pins.map((pin, i) => ({ ...pin, x: r3(x), y: r3(y0 + i * pitch), row }))
/** A horizontal header, left to right. */
const line = (x0, y, row, pins, pitch = P) => pins.map((pin, i) => ({ ...pin, x: r3(x0 + i * pitch), y: r3(y), row }))

function withIds(pins) {
  const seen = new Map()
  return pins.map((pin) => {
    const base = pin.id ?? (slug(pin.name) || 'pin')
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    const { name, type, x, y, row, id: _id, ...rest } = pin
    return { id: n === 1 ? base : `${base}-${n}`, name, type, x, y, ...(row ? { row } : {}), ...rest }
  })
}

const idsNamed = (pins, name) => pins.filter((x) => x.name === name).map((x) => x.id)

function part(def) {
  const pins = withIds(def.pins)
  const links = typeof def.links === 'function' ? def.links(pins) : def.links
  return {
    id: def.id,
    name: def.name,
    category: def.category,
    tags: def.tags ?? [],
    onHand: def.onHand ?? false,
    face: def.face ?? 'top',
    verified: false,
    source: def.source,
    width: def.width,
    height: def.height,
    color: def.color,
    pins,
    ...(links && links.length ? { links: links.filter((g) => g.length > 1) } : {}),
    ...(def.captions ? { captions: def.captions } : {}),
    ...(def.outlines ? { outlines: def.outlines } : {}),
    ...(def.rail ? { rail: def.rail } : {}),
    ...(def.notes ? { notes: def.notes } : {}),
  }
}

const allGnd = (pins) => [idsNamed(pins, 'GND')]

const NOTES_SOURCE = "Brian's vault notes"
const MEMORY = 'Common pinout, from memory. Check against the physical part.'

const BLACK = '#23262b'
const BLUE = '#1c4f9c'
const GREEN = '#1d6b3a'
const RED = '#a8271f'
const YELLOW = '#d1ad1f'
const PURPLE = '#4b2a7a'
const TAN = '#b89b6a'
const GRAY = '#5b6068'

// ADC2 pins cannot be read while Wi-Fi is on (classic ESP32).
const adc2 = { caps: ['adc2'] }
const inputOnly = { caps: ['input_only'] }

// ---------------------------------------------------------------- ESP32 modules
// The castellated module that sits on a dev board. Pads run down the left side,
// across the bottom from left to right, then up the right side, at 1.27 mm pitch.
// A number is a GPIO; a string is a named pad.

const MODULE_W = 18
const MODULE_H = 25.5
const FINE = 1.27

const WROOM32 = {
  name: 'ESP32-WROOM-32',
  left: ['GND', '3V3', 'EN', 36, 39, 34, 35, 32, 33, 25, 26, 27, 14, 12],
  bottom: ['GND', 13, 9, 10, 11, 6, 7, 8, 15, 2],
  rightUp: [0, 4, 16, 17, 5, 18, 19, 'NC', 21, 3, 1, 22, 23, 'GND'],
  tx: 1,
  rx: 3,
  inputOnly: [34, 35, 36, 39],
  strapping: [0, 2, 5, 12, 15],
  adc2: [0, 2, 4, 12, 13, 14, 15, 25, 26, 27],
  internal: { 6: 'module flash, do not use', 7: 'module flash, do not use', 8: 'module flash, do not use', 9: 'module flash, do not use', 10: 'module flash, do not use', 11: 'module flash, do not use' },
}

const S3_WROOM1 = {
  name: 'ESP32-S3-WROOM-1',
  left: ['GND', '3V3', 'EN', 4, 5, 6, 7, 15, 16, 17, 18, 8, 19, 20],
  bottom: [3, 46, 9, 10, 11, 12, 13, 14, 21, 47, 48, 45],
  rightUp: [0, 35, 36, 37, 38, 39, 40, 41, 42, 44, 43, 2, 1, 'GND'],
  tx: 43,
  rx: 44,
  inputOnly: [],
  strapping: [0, 3, 45, 46],
  adc2: [],
  internal: { 35: 'octal flash and PSRAM (N16R8)', 36: 'octal flash and PSRAM (N16R8)', 37: 'octal flash and PSRAM (N16R8)' },
}

/** One module pad. uses says what the host board already does with a GPIO. */
function modulePad(chip, spec, uses) {
  if (typeof spec === 'string') {
    const type = spec === 'GND' ? 'gnd' : spec === '3V3' ? '3v3' : spec === 'EN' ? 'enable' : 'other'
    return p(spec, type, { id: `m-${slug(spec)}`, ...(spec === 'EN' && uses.EN ? { note: uses.EN } : {}) })
  }
  const caps = [
    ...(chip.inputOnly.includes(spec) ? ['input_only'] : []),
    ...(chip.strapping.includes(spec) ? ['strapping'] : []),
    ...(chip.adc2.includes(spec) ? ['adc2'] : []),
    ...(chip.internal[spec] ? ['flash'] : []),
  ]
  const internalUse = chip.internal[spec] ?? uses[spec]
  const type = chip.internal[spec] ? 'other' : spec === chip.tx ? 'uart_tx' : spec === chip.rx ? 'uart_rx' : 'gpio'
  return p(`IO${spec}`, type, { id: `m-io${spec}`, gpio: spec, ...(caps.length ? { caps } : {}), ...(internalUse ? { internalUse } : {}) })
}

/** Every pad of a module whose top-left corner sits at x0, y0, antenna at the top. */
function modulePins(chip, x0, y0, uses = {}) {
  const top = y0 + 7
  const left = chip.left.map((spec, i) => ({ ...modulePad(chip, spec, uses), x: r3(x0 + 0.5), y: r3(top + i * FINE), row: 'module left' }))
  const bx = x0 + (MODULE_W - (chip.bottom.length - 1) * FINE) / 2
  const bottom = chip.bottom.map((spec, i) => ({ ...modulePad(chip, spec, uses), x: r3(bx + i * FINE), y: r3(y0 + MODULE_H - 0.5), row: 'module bottom' }))
  const last = chip.rightUp.length - 1
  const right = chip.rightUp.map((spec, i) => ({ ...modulePad(chip, spec, uses), x: r3(x0 + MODULE_W - 0.5), y: r3(top + (last - i) * FINE), row: 'module right' }))
  return [...left, ...bottom, ...right]
}

const moduleOutline = (chip, x0, y0) => ({ x: x0, y: y0, w: MODULE_W, h: MODULE_H, text: chip.name })

/**
 * Joins pins that are the same net inside a board: every pin with the same
 * GPIO number (a header pin and the module pad behind it), all grounds, all
 * 3V3 pins, and the reset line.
 */
function linkSameNets(pins) {
  const groups = new Map()
  const add = (key, id) => groups.set(key, [...(groups.get(key) ?? []), id])
  for (const pin of pins) {
    if (pin.gpio !== undefined) add(`gpio${pin.gpio}`, pin.id)
    else if (pin.type === 'gnd') add('gnd', pin.id)
    else if (pin.type === '3v3') add('3v3', pin.id)
    else if (pin.name === 'EN' || pin.name === 'RST') add('en', pin.id)
  }
  return [...groups.values()].filter((g) => g.length > 1)
}

const CYD_NOTE = "Brian's vault note CYD WROOM ESP32 Chip Pinout"

const parts = [
  // ---------------------------------------------------------------- Boards
  part({
    id: 'esp32-devkit-v1',
    name: 'ESP32 DevKit V1 (30-pin)',
    category: 'Boards',
    tags: ['esp32', 'wroom', 'doit'],
    onHand: true,
    source: `${MEMORY} DOIT 30-pin layout, antenna at the top, USB at the bottom. Module pad order from ${CYD_NOTE} (the same ESP32-WROOM-32); where the module sits on the board is approximate.`,
    width: 27.94,
    height: 51.5,
    color: BLACK,
    notes: 'IO34 to IO39 are input only. IO0, IO2, IO5, IO12 and IO15 are strapping pins. IO18, IO19 and IO23 are the default VSPI bus; IO21 and IO22 the default I2C pins.',
    pins: [
      ...col(1.27, 7.97, 'left', [
        p('EN', 'enable'),
        p('VP', 'analog', { gpio: 36, ...inputOnly }),
        p('VN', 'analog', { gpio: 39, ...inputOnly }),
        p('D34', 'gpio', { gpio: 34, ...inputOnly }),
        p('D35', 'gpio', { gpio: 35, ...inputOnly }),
        p('D32', 'gpio', { gpio: 32 }),
        p('D33', 'gpio', { gpio: 33 }),
        p('D25', 'gpio', { gpio: 25, ...adc2 }),
        p('D26', 'gpio', { gpio: 26, ...adc2 }),
        p('D27', 'gpio', { gpio: 27, ...adc2 }),
        p('D14', 'gpio', { gpio: 14, ...adc2 }),
        p('D12', 'gpio', { gpio: 12, caps: ['adc2', 'strapping'] }),
        p('D13', 'gpio', { gpio: 13, ...adc2 }),
        gnd(),
        p('VIN', '5v'),
      ]),
      ...col(26.67, 7.97, 'right', [
        p('D23', 'gpio', { gpio: 23, note: 'VSPI MOSI by default' }),
        p('D22', 'gpio', { gpio: 22, note: 'I2C SCL by default' }),
        p('TX0', 'uart_tx', { gpio: 1, note: 'USB serial' }),
        p('RX0', 'uart_rx', { gpio: 3, note: 'USB serial' }),
        p('D21', 'gpio', { gpio: 21, note: 'I2C SDA by default' }),
        p('D19', 'gpio', { gpio: 19, note: 'VSPI MISO by default' }),
        p('D18', 'gpio', { gpio: 18, note: 'VSPI SCK by default' }),
        p('D5', 'gpio', { gpio: 5, caps: ['strapping'], note: 'VSPI CS by default' }),
        p('TX2', 'gpio', { gpio: 17, note: 'UART2 TX by default' }),
        p('RX2', 'gpio', { gpio: 16, note: 'UART2 RX by default' }),
        p('D4', 'gpio', { gpio: 4, ...adc2 }),
        p('D2', 'gpio', { gpio: 2, caps: ['adc2', 'strapping'], note: 'onboard LED' }),
        p('D15', 'gpio', { gpio: 15, caps: ['adc2', 'strapping'] }),
        gnd(),
        p('3V3', '3v3'),
      ]),
      ...modulePins(WROOM32, 4.97, 0.6, { 0: 'BOOT button', 2: 'onboard LED', EN: 'EN button' }),
    ],
    outlines: [moduleOutline(WROOM32, 4.97, 0.6)],
    links: linkSameNets,
  }),

  part({
    id: 'esp32-s3-devkitc-1',
    name: 'ESP32-S3 DevKitC-1 style (N16R8, 2 USB-C)',
    category: 'Boards',
    tags: ['esp32', 's3', 'usb-c', 'devkitc', 'n16r8', 'esp32-div capy'],
    onHand: true,
    source: `${MEMORY} Espressif J1 and J3 header order, antenna at the top, USB at the bottom. ESP32-S3-WROOM-1 pad order is also from memory; where the module sits on the board is approximate.`,
    width: 27.94,
    height: 69,
    color: BLACK,
    notes: 'Two USB-C ports: one is the USB-to-serial port (IO43 and IO44), the other is the chip\'s own USB (IO19 and IO20). The silkscreen says which is which. Clone boards do not all use the same pin order: wire by the GPIO number printed next to each pin, not by its position here. On the N16R8, IO35, IO36 and IO37 belong to the octal flash and PSRAM: leave them alone. IO0, IO3, IO45 and IO46 are strapping pins.',
    pins: [
      ...col(2.54, 7.83, 'J1 left', [
        p('3V3', '3v3'),
        p('3V3', '3v3'),
        p('RST', 'enable'),
        io(4), io(5), io(6), io(7), io(15), io(16), io(17), io(18), io(8),
        io(3, { caps: ['strapping'] }),
        io(46, { caps: ['strapping'] }),
        io(9), io(10), io(11), io(12), io(13), io(14),
        p('5V', '5v'),
        gnd(),
      ]),
      ...col(25.4, 7.83, 'J3 right', [
        gnd(),
        p('TX', 'uart_tx', { gpio: 43 }),
        p('RX', 'uart_rx', { gpio: 44 }),
        io(1), io(2), io(42), io(41), io(40), io(39), io(38),
        io(37, { internalUse: 'octal flash and PSRAM (N16R8)' }),
        io(36, { internalUse: 'octal flash and PSRAM (N16R8)' }),
        io(35, { internalUse: 'octal flash and PSRAM (N16R8)' }),
        io(0, { caps: ['strapping'], note: 'BOOT button' }),
        io(45, { caps: ['strapping'] }),
        io(48, { note: 'RGB LED on v1.0 boards' }),
        io(47), io(21),
        io(20, { internalUse: 'native USB D+' }),
        io(19, { internalUse: 'native USB D-' }),
        gnd(),
        gnd(),
      ]),
      ...modulePins(S3_WROOM1, 4.97, 0.6, { 0: 'BOOT button', 19: 'native USB D-', 20: 'native USB D+', 48: 'RGB LED on v1.0 boards', EN: 'RST button' }),
    ],
    outlines: [
      moduleOutline(S3_WROOM1, 4.97, 0.6),
      { x: 5.6, y: 61.5, w: 7.4, h: 7, text: 'USB-C' },
      { x: 14.94, y: 61.5, w: 7.4, h: 7, text: 'USB-C' },
    ],
    links: linkSameNets,
  }),

  part({
    id: 'esp32-c3-super-mini',
    name: 'ESP32-C3 Super Mini',
    category: 'Boards',
    tags: ['esp32', 'c3'],
    onHand: true,
    source: `${MEMORY} USB-C at the top.`,
    width: 18,
    height: 22.5,
    color: BLACK,
    notes: 'IO8 drives the onboard LED and is a strapping pin. IO9 is the BOOT button and a strapping pin. IO2 is a strapping pin.',
    pins: [
      ...col(1.38, 2.36, 'left', [
        io(5), io(6), io(7),
        io(8, { caps: ['strapping'], internalUse: 'onboard LED' }),
        io(9, { caps: ['strapping'], internalUse: 'BOOT button' }),
        io(10),
        p('IO20', 'uart_rx', { gpio: 20, note: 'RX' }),
        p('IO21', 'uart_tx', { gpio: 21, note: 'TX' }),
      ]),
      ...col(16.62, 2.36, 'right', [
        p('5V', '5v'),
        gnd(),
        p('3V3', '3v3'),
        io(4), io(3),
        io(2, { caps: ['strapping'] }),
        io(1), io(0),
      ]),
    ],
  }),

  part({
    id: 'xiao-esp32-c6',
    name: 'Seeed XIAO ESP32-C6',
    category: 'Boards',
    tags: ['esp32', 'c6', 'xiao'],
    onHand: true,
    source: `${MEMORY} USB-C at the top.`,
    width: 17.8,
    height: 21,
    color: BLACK,
    pins: [
      ...col(1.28, 2.88, 'left', [
        p('D0', 'gpio', { gpio: 0 }),
        p('D1', 'gpio', { gpio: 1 }),
        p('D2', 'gpio', { gpio: 2 }),
        p('D3', 'gpio', { gpio: 21 }),
        p('D4', 'gpio', { gpio: 22, note: 'I2C SDA by default' }),
        p('D5', 'gpio', { gpio: 23, note: 'I2C SCL by default' }),
        p('D6', 'gpio', { gpio: 16, note: 'UART TX by default' }),
      ]),
      ...col(16.52, 2.88, 'right', [
        p('5V', '5v'),
        gnd(),
        p('3V3', '3v3'),
        p('D10', 'gpio', { gpio: 18, note: 'SPI MOSI by default' }),
        p('D9', 'gpio', { gpio: 20, note: 'SPI MISO by default' }),
        p('D8', 'gpio', { gpio: 19, note: 'SPI SCK by default' }),
        p('D7', 'gpio', { gpio: 17, note: 'UART RX by default' }),
      ]),
    ],
  }),

  part({
    id: 'cyd-2432s028r',
    name: 'CYD 2.8 inch (ESP32-2432S028R)',
    category: 'Boards',
    tags: ['esp32', 'cyd', 'cheap yellow display'],
    onHand: true,
    face: 'bottom',
    source: `${NOTES_SOURCE} (Cheap Yellow Display, HaleHound wiring) for the connectors, and ${CYD_NOTE} for all 38 module pads and what the board uses each for. Positions here are a schematic layout, not the real board: the connectors are 1.25 mm JST and the module sits elsewhere. Upload a photo of the back and place the pins to fix that.`,
    width: 86,
    height: 50,
    color: YELLOW,
    notes: 'Back view. P1, P3 and CN1 are the JST connectors. The ESP32-WROOM-32 module is drawn with every pad, so you can wire straight to the chip. The tap pins are easier solder points for the same signals (RGB LED pads, SD slot legs, speaker) and are joined to their module pads. Free pins: IO22, IO27 and IO35 (input only). IO21 is on P3 but drives the backlight. IO6 to IO11 belong to the module flash: do not use them. IO12 is a boot strap pin and must not be high at reset. The RGB LED is active low.',
    pins: [
      ...line(6, 44, 'P1', [
        p('VIN', '5v', { id: 'p1-vin' }),
        p('TX', 'uart_tx', { id: 'p1-tx', gpio: 1, note: 'USB serial' }),
        p('RX', 'uart_rx', { id: 'p1-rx', gpio: 3, note: 'USB serial' }),
        gnd({ id: 'p1-gnd' }),
      ]),
      ...line(24, 44, 'P3', [
        gnd({ id: 'p3-gnd' }),
        p('IO35', 'gpio', { id: 'p3-io35', gpio: 35, ...inputOnly }),
        p('IO22', 'gpio', { id: 'p3-io22', gpio: 22 }),
        p('IO21', 'gpio', { id: 'p3-io21', gpio: 21, internalUse: 'display backlight' }),
      ]),
      ...line(42, 44, 'CN1', [
        gnd({ id: 'cn1-gnd' }),
        p('IO22', 'gpio', { id: 'cn1-io22', gpio: 22 }),
        p('IO27', 'gpio', { id: 'cn1-io27', gpio: 27 }),
        p('3V3', '3v3', { id: 'cn1-3v3' }),
      ]),
      ...line(6, 12, 'RGB LED taps', [
        p('IO4', 'gpio', { id: 'tap-io4', gpio: 4, internalUse: 'RGB LED red' }),
        p('IO16', 'gpio', { id: 'tap-io16', gpio: 16, internalUse: 'RGB LED green' }),
        p('IO17', 'gpio', { id: 'tap-io17', gpio: 17, internalUse: 'RGB LED blue' }),
      ], 7.62),
      ...line(32, 12, 'SD slot taps', [
        p('IO5', 'spi_cs', { id: 'tap-io5', gpio: 5, internalUse: 'SD card CS', caps: ['strapping'] }),
        p('IO18', 'spi_sck', { id: 'tap-io18', gpio: 18, internalUse: 'SD card SCK (shared bus)' }),
        p('IO23', 'spi_mosi', { id: 'tap-io23', gpio: 23, internalUse: 'SD card MOSI (shared bus)' }),
        p('IO19', 'spi_miso', { id: 'tap-io19', gpio: 19, internalUse: 'SD card MISO (shared bus)' }),
      ], 7.62),
      ...line(6, 27, 'Other taps', [
        p('IO26', 'gpio', { id: 'tap-io26', gpio: 26, internalUse: 'speaker amplifier' }),
        p('IO34', 'gpio', { id: 'tap-io34', gpio: 34, internalUse: 'light sensor (LDR)', ...inputOnly }),
        p('IO0', 'gpio', { id: 'tap-io0', gpio: 0, internalUse: 'BOOT button', caps: ['strapping'] }),
      ], 7.62),
      ...modulePins(WROOM32, 63, 3, {
        EN: 'RST button',
        36: 'touch IRQ', 39: 'touch MISO', 34: 'light sensor (LDR)', 32: 'touch MOSI', 33: 'touch CS', 25: 'touch CLK',
        26: 'speaker amplifier', 14: 'display SCK', 12: 'display MISO', 13: 'display MOSI', 15: 'display CS', 2: 'display DC',
        0: 'BOOT button', 4: 'RGB LED red', 16: 'RGB LED green', 17: 'RGB LED blue',
        5: 'SD card CS', 18: 'SD card SCK (shared bus)', 19: 'SD card MISO (shared bus)', 23: 'SD card MOSI (shared bus)',
        21: 'display backlight', 3: 'USB serial RX', 1: 'USB serial TX',
      }),
    ],
    outlines: [moduleOutline(WROOM32, 63, 3)],
    links: linkSameNets,
    captions: [
      { text: 'P1', x: 4.7, y: 47.4 },
      { text: 'P3', x: 22.7, y: 47.4 },
      { text: 'CN1', x: 40.7, y: 47.4 },
      { text: 'RGB LED taps', x: 4.7, y: 8.2 },
      { text: 'SD slot taps', x: 30.7, y: 8.2 },
      { text: 'Other taps', x: 4.7, y: 23.2 },
    ],
  }),

  part({
    id: 'esp32-wroom-32',
    name: 'ESP32-WROOM-32 module (bare)',
    category: 'Boards',
    tags: ['esp32', 'wroom', 'module'],
    onHand: false,
    source: `Pad order from ${CYD_NOTE}. Top view, shield up, antenna at the top; pad 1 (GND) is at the top left. Pad 39 (GND) is under the module and is not drawn.`,
    width: MODULE_W,
    height: MODULE_H,
    color: BLACK,
    notes: 'Pads are 1.27 mm pitch. IO6 to IO11 connect to the flash inside the module: do not use them. IO34 to IO39 are input only. IO0, IO2, IO5, IO12 and IO15 are strapping pins.',
    pins: modulePins(WROOM32, 0, 0),
    links: linkSameNets,
  }),

  part({
    id: 'esp32-s3-wroom-1',
    name: 'ESP32-S3-WROOM-1 module (bare)',
    category: 'Boards',
    tags: ['esp32', 's3', 'wroom', 'module'],
    onHand: false,
    source: `${MEMORY} Top view, shield up, antenna at the top; pad 1 (GND) is at the top left. Pad 41 (GND) is under the module and is not drawn.`,
    width: MODULE_W,
    height: MODULE_H,
    color: BLACK,
    notes: 'Pads are 1.27 mm pitch. On N16R8 modules IO35, IO36 and IO37 belong to the octal flash and PSRAM. IO19 and IO20 are native USB. IO0, IO3, IO45 and IO46 are strapping pins.',
    pins: modulePins(S3_WROOM1, 0, 0),
    links: linkSameNets,
  }),

  part({
    id: 'raspberry-pi-zero-w',
    name: 'Raspberry Pi Zero W',
    category: 'Boards',
    tags: ['raspberry pi', '40-pin'],
    onHand: true,
    source: `${MEMORY} Standard 40-pin header, pin 1 at the SD card end of the inner row.`,
    width: 65,
    height: 30,
    color: GREEN,
    notes: 'GPIO pins are 3.3 V only. The 5V pins are fed straight from USB power.',
    pins: (() => {
      // Odd pins are the inner row, even pins the row at the board edge.
      const odd = [
        p('3V3', '3v3'), p('GPIO2', 'i2c_sda', { gpio: 2 }), p('GPIO3', 'i2c_scl', { gpio: 3 }), p('GPIO4', 'gpio', { gpio: 4 }), gnd(),
        p('GPIO17', 'gpio', { gpio: 17 }), p('GPIO27', 'gpio', { gpio: 27 }), p('GPIO22', 'gpio', { gpio: 22 }), p('3V3', '3v3'),
        p('GPIO10', 'spi_mosi', { gpio: 10 }), p('GPIO9', 'spi_miso', { gpio: 9 }), p('GPIO11', 'spi_sck', { gpio: 11 }), gnd(),
        p('GPIO0', 'other', { gpio: 0, note: 'ID EEPROM SDA' }), p('GPIO5', 'gpio', { gpio: 5 }), p('GPIO6', 'gpio', { gpio: 6 }),
        p('GPIO13', 'gpio', { gpio: 13 }), p('GPIO19', 'gpio', { gpio: 19 }), p('GPIO26', 'gpio', { gpio: 26 }), gnd(),
      ]
      const even = [
        p('5V', '5v'), p('5V', '5v'), gnd(), p('GPIO14', 'uart_tx', { gpio: 14 }), p('GPIO15', 'uart_rx', { gpio: 15 }),
        p('GPIO18', 'gpio', { gpio: 18 }), gnd(), p('GPIO23', 'gpio', { gpio: 23 }), p('GPIO24', 'gpio', { gpio: 24 }), gnd(),
        p('GPIO25', 'gpio', { gpio: 25 }), p('GPIO8', 'spi_cs', { gpio: 8, note: 'CE0' }), p('GPIO7', 'spi_cs', { gpio: 7, note: 'CE1' }),
        p('GPIO1', 'other', { gpio: 1, note: 'ID EEPROM SCL' }), gnd(), p('GPIO12', 'gpio', { gpio: 12 }), gnd(),
        p('GPIO16', 'gpio', { gpio: 16 }), p('GPIO20', 'gpio', { gpio: 20 }), p('GPIO21', 'gpio', { gpio: 21 }),
      ]
      return [...line(8.37, 4.77, 'odd pins (inner row)', odd), ...line(8.37, 2.23, 'even pins (edge row)', even)]
    })(),
    links: (pins) => [idsNamed(pins, 'GND'), idsNamed(pins, '3V3'), idsNamed(pins, '5V')],
  }),

  // ---------------------------------------------------------------- Radios
  part({
    id: 'nrf24l01',
    name: 'nRF24L01+',
    category: 'Radios',
    tags: ['nrf24', '2.4 ghz', 'spi'],
    onHand: true,
    source: `${NOTES_SOURCE}: NRF-24 (Generic) Pinout. Top view, chip side up, antenna away from you; pin 1 (GND) is the square pad.`,
    width: 15.24,
    height: 29,
    color: BLACK,
    notes: 'Supply 1.9 to 3.6 V: never connect 5 V to VCC. Signal pins accept 5 V logic. Put a 10 uF capacitor across VCC and GND near the module. The 2x4 header has no labels, so flip the part if you are looking at the pin side.',
    pins: [
      ...line(3.81, 24, 'antenna-side row', [p('VCC', '3v3'), p('CSN', 'spi_cs'), p('MOSI', 'spi_mosi'), p('IRQ', 'irq')]),
      ...line(3.81, 26.54, 'edge row', [gnd(), p('CE', 'enable'), p('SCK', 'spi_sck'), p('MISO', 'spi_miso')]),
    ],
  }),

  part({
    id: 'nrf24l01-pa-lna',
    name: 'nRF24L01+ PA/LNA (GT-24)',
    category: 'Radios',
    tags: ['nrf24', '2.4 ghz', 'spi', 'pa lna'],
    onHand: true,
    source: `${NOTES_SOURCE}: NRF-24 (Generic) Pinout says the GT-24 uses the same header order. Top view, chip side up, antenna connector away from you.`,
    width: 15.24,
    height: 41,
    color: BLACK,
    notes: 'Supply 1.9 to 3.6 V. Draws far more current than the plain module when transmitting: solder a 10 uF capacitor across VCC and GND at the module if you see random resets.',
    pins: [
      ...line(3.81, 36, 'antenna-side row', [p('VCC', '3v3'), p('CSN', 'spi_cs'), p('MOSI', 'spi_mosi'), p('IRQ', 'irq')]),
      ...line(3.81, 38.54, 'edge row', [gnd(), p('CE', 'enable'), p('SCK', 'spi_sck'), p('MISO', 'spi_miso')]),
    ],
  }),

  part({
    id: 'ebyte-e01-2g4m27sx',
    name: 'Ebyte E01-2G4M27SX',
    category: 'Radios',
    tags: ['nrf24', '2.4 ghz', 'spi', 'pa lna', 'ebyte', 'rf sentinel'],
    onHand: true,
    source: `${NOTES_SOURCE}: Ebyte E01 (nrf24) Pinout, read off the pinout image. Top view, shield up, pin 1 (VCC) at the right of the top edge. Pads are 1.27 mm pitch.`,
    width: 14.5,
    height: 18,
    color: BLACK,
    notes: 'Must run from its own 3.3 V buck supply, not a dev board rail: a CYD cannot supply enough current for it. Supply 2.3 to 3.6 V. IPEX antenna connector at the bottom left.',
    pins: [
      ...line(2.805, 1, 'top edge', [
        gnd({ id: 'gnd-8' }), p('IRQ', 'irq'), p('MISO', 'spi_miso'), p('MOSI', 'spi_mosi'),
        p('SCK', 'spi_sck'), p('CSN', 'spi_cs'), p('CE', 'enable'), p('VCC', '3v3'),
      ], 1.27),
      { ...gnd({ id: 'gnd-9' }), x: 0.8, y: 9 },
      { ...gnd({ id: 'gnd-10' }), x: 13.7, y: 9 },
    ],
    links: [['gnd-8', 'gnd-9', 'gnd-10']],
  }),

  part({
    id: 'cc1101',
    name: 'CC1101 module (2x4 header)',
    category: 'Radios',
    tags: ['cc1101', 'sub-ghz', 'spi'],
    onHand: true,
    source: `${NOTES_SOURCE}: CC1101 (Generic) Pinout, read off the pinout image. Top view, chip side up, antenna away from you; pin 1 (GND) is the square pad.`,
    width: 15.24,
    height: 28,
    color: GREEN,
    notes: 'Supply 1.8 to 3.6 V. MISO doubles as GDO1. HaleHound uses GDO0 as TX (to the radio) and GDO2 as RX (from the radio); older ESP32-DIV diagrams have them swapped.',
    pins: [
      ...line(3.81, 23, 'antenna-side row', [p('VCC', '3v3'), p('CSN', 'spi_cs'), p('MOSI', 'spi_mosi'), p('GDO2', 'irq')]),
      ...line(3.81, 25.54, 'edge row', [gnd(), p('GDO0', 'irq'), p('SCK', 'spi_sck'), p('MISO', 'spi_miso', { note: 'also GDO1' })]),
    ],
  }),

  part({
    id: 'ebyte-e07-433m20s',
    name: 'Ebyte E07-433M20S',
    category: 'Radios',
    tags: ['cc1101', 'sub-ghz', 'spi', 'pa lna', 'ebyte', 'rf sentinel'],
    onHand: true,
    source: `${NOTES_SOURCE}: RF-Modules E07-433M20S pinout drawing. Top view, shield up, pin 1 (GND) at the right of the top edge. Board size, pad pitch and the left to right order of the bottom pads are approximate.`,
    width: 20,
    height: 14,
    color: BLACK,
    notes: 'CC1101 with a power amplifier. TX_EN and RX_EN switch the amplifier. Run it from an independent 3.3 V supply.',
    pins: [
      ...line(3.015, 1, 'top edge', [
        gnd({ id: 'gnd-12' }), p('VCC', '3v3'), p('NC', 'other'), p('RX_EN', 'enable'), p('TX_EN', 'enable'),
        p('CSN', 'spi_cs'), p('GDO0', 'irq'), p('GDO2', 'irq'), p('MISO', 'spi_miso', { note: 'also GDO1' }),
        p('SCK', 'spi_sck'), p('MOSI', 'spi_mosi'), gnd({ id: 'gnd-1' }),
      ], 1.27),
      ...line(3.015, 13, 'bottom edge', [
        p('ANT', 'other'), gnd({ id: 'gnd-14' }), gnd({ id: 'gnd-15' }), gnd({ id: 'gnd-16' }),
      ], 1.27),
    ],
    links: [['gnd-12', 'gnd-1', 'gnd-14', 'gnd-15', 'gnd-16']],
  }),

  part({
    id: 'pn532-v3',
    name: 'PN532 NFC module V3',
    category: 'Radios',
    tags: ['nfc', 'rfid', 'spi', 'i2c'],
    onHand: false,
    source: `${MEMORY} Brian's PN532 note warns that the silkscreen differs by revision, so check the header order on your board.`,
    width: 43,
    height: 41,
    color: RED,
    captions: [
      { text: 'SPI', x: 6.5, y: 8.4 },
      { text: 'I2C', x: 33, y: 13.5 },
    ],
    notes: 'DIP switches pick the bus. SPI: switch 1 OFF, switch 2 ON. I2C: switch 1 ON, switch 2 OFF. HSU: both OFF. HaleHound drives it over SPI; Bruce uses I2C.',
    pins: [
      ...col(2.5, 11.6, 'SPI header', [
        p('SCK', 'spi_sck'), p('MISO', 'spi_miso'), p('MOSI', 'spi_mosi'), p('SS', 'spi_cs'),
        p('VCC', '3v3', { id: 'vcc-spi' }), gnd({ id: 'gnd-spi' }), p('IRQ', 'irq'), p('RSTO', 'enable'),
      ]),
      ...col(40.5, 16.7, 'I2C header', [
        gnd({ id: 'gnd-i2c' }), p('VCC', '3v3', { id: 'vcc-i2c' }), p('SDA', 'i2c_sda'), p('SCL', 'i2c_scl'),
      ]),
    ],
    links: [['gnd-spi', 'gnd-i2c'], ['vcc-spi', 'vcc-i2c']],
  }),

  part({
    id: 'gps-atgm336h',
    name: 'GPS module (ATGM336H class)',
    category: 'Radios',
    tags: ['gps', 'gnss', 'uart'],
    onHand: true,
    source: `Pin names and board size from the Hardware Inventory note (5V GND TX RX PPS). The order along the header is assumed to follow that list and is not confirmed.`,
    width: 13.75,
    height: 16,
    color: BLUE,
    notes: '9600 baud by default. Module TX goes to the board RX. HaleHound only uses the GPS TX line.',
    pins: line(1.795, 14, 'header', [
      p('VCC', '5v'), gnd(), p('TX', 'uart_tx'), p('RX', 'uart_rx'), p('PPS', 'irq'),
    ]),
  }),

  // ---------------------------------------------------------------- Displays
  part({
    id: 'ssd1306-oled-096',
    name: 'SSD1306 0.96 inch OLED (I2C)',
    category: 'Displays',
    tags: ['oled', 'i2c'],
    onHand: true,
    source: `${MEMORY} Display side up, header at the top. Some boards swap VCC and GND: read the silkscreen.`,
    width: 27,
    height: 27,
    color: BLUE,
    notes: 'I2C address is usually 0x3C. Check the VCC and GND order on your board before powering it.',
    pins: line(9.69, 2, 'header', [gnd(), p('VCC', '3v3'), p('SCL', 'i2c_scl'), p('SDA', 'i2c_sda')]),
  }),

  part({
    id: 'ili9341-tft-28',
    name: 'ILI9341 2.8 inch SPI TFT',
    category: 'Displays',
    tags: ['tft', 'spi', 'touch'],
    onHand: false,
    source: `${MEMORY} Typical red 2.8 inch board with a 14-pin display and touch header and a 4-pin SD header. Header positions are schematic.`,
    width: 86,
    height: 50,
    color: RED,
    notes: 'LED is the backlight supply. The T_ pins are the resistive touch controller and can share the SPI bus with their own chip select.',
    pins: [
      ...col(2.5, 8.49, 'display header', [
        p('VCC', '3v3'), gnd(), p('CS', 'spi_cs'), p('RESET', 'enable'), p('DC', 'gpio'),
        p('SDI', 'spi_mosi', { note: 'MOSI' }), p('SCK', 'spi_sck'), p('LED', '3v3', { note: 'backlight' }),
        p('SDO', 'spi_miso', { note: 'MISO' }), p('T_CLK', 'spi_sck'), p('T_CS', 'spi_cs'),
        p('T_DIN', 'spi_mosi'), p('T_DO', 'spi_miso'), p('T_IRQ', 'irq'),
      ]),
      ...col(83.5, 21.19, 'SD header', [
        p('SD_CS', 'spi_cs'), p('SD_MOSI', 'spi_mosi'), p('SD_MISO', 'spi_miso'), p('SD_SCK', 'spi_sck'),
      ]),
    ],
  }),

  // ---------------------------------------------------------------- Sensors
  part({
    id: 'bme280',
    name: 'BME280 breakout (I2C)',
    category: 'Sensors',
    tags: ['temperature', 'humidity', 'pressure', 'i2c'],
    onHand: false,
    source: `${MEMORY} 4-pin GY-BME280 style board. Six-pin boards add CSB and SDO.`,
    width: 13,
    height: 10.5,
    color: PURPLE,
    notes: 'I2C address 0x76 or 0x77.',
    pins: line(2.69, 8.5, 'header', [p('VIN', '3v3'), gnd(), p('SCL', 'i2c_scl'), p('SDA', 'i2c_sda')]),
  }),

  // ---------------------------------------------------------------- Power and passives
  part({
    id: 'buck-3v3',
    name: '3.3 V buck module',
    category: 'Power and passives',
    tags: ['power', 'regulator'],
    onHand: false,
    source: 'Generic four-terminal buck converter. Terminal positions vary by module: check yours.',
    width: 17.78,
    height: 12.7,
    color: BLUE,
    notes: 'Use one of these to feed high-power radios such as the E01-2G4M27SX. Input and output ground are common.',
    pins: [
      { ...p('IN+', '5v', { id: 'in-pos' }), x: 1.27, y: 2.54 },
      { ...p('IN-', 'gnd', { id: 'in-neg' }), x: 1.27, y: 10.16 },
      { ...p('OUT+', '3v3', { id: 'out-pos' }), x: 16.51, y: 2.54 },
      { ...p('OUT-', 'gnd', { id: 'out-neg' }), x: 16.51, y: 10.16 },
    ],
    links: [['in-neg', 'out-neg']],
  }),

  // Rails have no pins here: each rail on the desk is given as many as it needs.
  ...[
    { id: 'rail-5v', name: '5V rail', type: '5v', label: '5V', color: '#b35c00' },
    { id: 'rail-3v3', name: '3V3 rail', type: '3v3', label: '3V3', color: '#a8271f' },
    { id: 'rail-gnd', name: 'GND rail', type: 'gnd', label: 'GND', color: BLACK },
  ].map((r) =>
    part({
      id: r.id,
      name: r.name,
      category: 'Power and passives',
      tags: ['power', 'rail', 'bus', r.label.toLowerCase()],
      onHand: true,
      source: 'A drawing aid, not a physical part: a strip of pins that are all joined together.',
      width: 15.24,
      height: 3.81,
      color: r.color,
      notes: 'Every pin on a rail is the same net. Add or remove pins in the inspector. Rotate the rail to run it vertically.',
      pins: [],
      rail: { type: r.type, label: r.label },
    }),
  ),

  part({
    id: 'lipo-charger-4pad',
    name: 'LiPo charger with 5 V out, 4 pad',
    category: 'Power and passives',
    tags: ['power', 'battery', 'charger', 'boost', 'lipo', '5v'],
    onHand: true,
    source: 'Pads as Brian described his module: battery + and -, and 5 V out + and -. Charging power comes in through the USB socket, so there are no input pads. Pad positions are a guess: check them against your board.',
    width: 26,
    height: 17,
    color: BLUE,
    notes: 'Charges one LiPo cell through its USB socket and gives 5 V on OUT+. BAT- and OUT- are taken to be the same ground, as on most of these boards: confirm with a meter before relying on it.',
    pins: [
      { ...p('OUT+', '5v', { id: 'out-pos', note: '5 V out' }), x: 6.5, y: 1.6 },
      { ...p('OUT-', 'gnd', { id: 'out-neg' }), x: 6.5, y: 15.4 },
      { ...p('BAT+', 'vbat', { id: 'bat-pos' }), x: 24.4, y: 1.6 },
      { ...p('BAT-', 'gnd', { id: 'bat-neg' }), x: 24.4, y: 15.4 },
    ],
    links: [['out-neg', 'bat-neg']],
    outlines: [{ x: 0, y: 4.5, w: 7, h: 8, text: 'USB' }],
  }),

  part({
    id: 'lipo-battery',
    name: 'LiPo battery, 1 cell',
    category: 'Power and passives',
    tags: ['power', 'battery', 'lipo'],
    onHand: false,
    source: 'Generic two-lead part. Check the polarity of your connector: JST leads are not wired the same way by every seller.',
    width: 30,
    height: 20,
    color: GRAY,
    notes: '3.7 V nominal, 4.2 V full. Not a 3.3 V or 5 V supply: feed a board through its battery input or a regulator.',
    pins: [
      { ...p('+', 'vbat', { id: 'pos' }), x: 28.4, y: 7.46 },
      { ...p('-', 'gnd', { id: 'neg' }), x: 28.4, y: 12.54 },
    ],
  }),

  part({
    id: 'resistor',
    name: 'Resistor',
    category: 'Power and passives',
    tags: ['passive'],
    onHand: true,
    source: 'Generic two-lead part.',
    width: 10.16,
    height: 2.54,
    color: TAN,
    notes: 'Give it a label with its value, for example 330R or 10k.',
    pins: [
      { ...p('1', 'other', { id: 'a' }), x: 1.27, y: 1.27 },
      { ...p('2', 'other', { id: 'b' }), x: 8.89, y: 1.27 },
    ],
  }),

  part({
    id: 'capacitor',
    name: 'Capacitor (ceramic)',
    category: 'Power and passives',
    tags: ['passive'],
    onHand: true,
    source: 'Generic two-lead part.',
    width: 5.08,
    height: 3.81,
    color: TAN,
    notes: 'Not polarised. Give it a label with its value, for example 100 nF.',
    pins: [
      { ...p('1', 'other', { id: 'a' }), x: 1.27, y: 1.905 },
      { ...p('2', 'other', { id: 'b' }), x: 3.81, y: 1.905 },
    ],
  }),

  part({
    id: 'capacitor-electrolytic',
    name: 'Capacitor (electrolytic)',
    category: 'Power and passives',
    tags: ['passive', 'polarised'],
    onHand: false,
    source: 'Generic two-lead part.',
    width: 5.08,
    height: 5.08,
    color: GRAY,
    notes: 'Polarised: the stripe marks the negative lead. A 10 uF one across VCC and GND steadies an nRF24 module.',
    pins: [
      { ...p('+', '3v3', { id: 'pos' }), x: 1.27, y: 2.54 },
      { ...p('-', 'gnd', { id: 'neg' }), x: 3.81, y: 2.54 },
    ],
  }),

  part({
    id: 'led',
    name: 'LED',
    category: 'Power and passives',
    tags: ['passive', 'polarised'],
    onHand: false,
    source: 'Generic two-lead part.',
    width: 5.08,
    height: 5.08,
    color: RED,
    notes: 'The longer lead is the anode (A). Needs a series resistor.',
    pins: [
      { ...p('A', 'other', { id: 'anode' }), x: 1.27, y: 2.54 },
      { ...p('K', 'gnd', { id: 'cathode' }), x: 3.81, y: 2.54 },
    ],
  }),

  part({
    id: 'rgb-led-pl9823',
    name: 'Addressable RGB LED, 5 mm (PL9823)',
    category: 'Power and passives',
    tags: ['led', 'addressable', 'rf sentinel'],
    onHand: true,
    source: `${MEMORY} PL9823-F5 and APA106-F5 lead order. The WS2812D-F5 uses a different order: check the datasheet for the part in your hand.`,
    width: 10.16,
    height: 5.08,
    color: GRAY,
    notes: 'One data wire in, one out. A 330R resistor in series with DIN is usual.',
    pins: line(1.27, 2.54, 'leads', [p('DIN', 'gpio'), p('VDD', '5v'), gnd(), p('DOUT', 'gpio')]),
  }),

  part({
    id: 'push-button',
    name: 'Push button (tactile, 4 leg)',
    category: 'Power and passives',
    tags: ['input', 'switch'],
    onHand: false,
    source: `${MEMORY} Standard 6 mm tactile switch: the two legs on each long side are joined inside.`,
    width: 7.62,
    height: 7.62,
    color: GRAY,
    notes: 'A1 and A2 are always joined, as are B1 and B2. Pressing the button joins A to B.',
    pins: [
      { ...p('A1', 'other'), x: 1.27, y: 1.27 },
      { ...p('A2', 'other'), x: 6.35, y: 1.27 },
      { ...p('B1', 'other'), x: 1.27, y: 6.35 },
      { ...p('B2', 'other'), x: 6.35, y: 6.35 },
    ],
    links: [['a1', 'a2'], ['b1', 'b2']],
  }),

  part({
    id: 'ir-receiver',
    name: 'IR receiver (VS1838B)',
    category: 'Sensors',
    tags: ['ir', 'infrared'],
    onHand: false,
    source: `${MEMORY} Seen from the front (the domed side), leads down.`,
    width: 7.62,
    height: 6.35,
    color: BLACK,
    notes: 'OUT idles high and pulses low. On a CYD, IO34 is taken by the light sensor, so it cannot be used for IR receive.',
    pins: line(1.27, 5, 'leads', [p('OUT', 'gpio'), gnd(), p('VCC', '3v3')]),
  }),

  part({
    id: 'microsd-breakout',
    name: 'microSD breakout (SPI)',
    category: 'Power and passives',
    tags: ['storage', 'spi'],
    onHand: false,
    source: `${MEMORY} Common six-pin order; boards vary, so read the silkscreen.`,
    width: 18,
    height: 24,
    color: BLUE,
    notes: 'Boards with a regulator and level shifter want 5 V on VCC; bare ones want 3.3 V.',
    pins: line(2.65, 22, 'header', [
      gnd(), p('VCC', '3v3'), p('MISO', 'spi_miso'), p('MOSI', 'spi_mosi'), p('SCK', 'spi_sck'), p('CS', 'spi_cs'),
    ]),
  }),
]

fs.mkdirSync(outDir, { recursive: true })
let written = 0
let skipped = 0
for (const def of parts) {
  const file = path.join(outDir, `${def.id}.json`)
  const wanted = only.length ? only.includes(def.id) : force
  if (fs.existsSync(file) && !wanted) {
    skipped++
    continue
  }
  fs.writeFileSync(file, JSON.stringify(def, null, 2) + '\n')
  written++
}
console.log(`seed-library: wrote ${written}, kept ${skipped} existing, ${parts.length} parts in the seed`)
