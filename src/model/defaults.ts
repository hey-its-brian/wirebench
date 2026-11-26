import type { PaletteColor, PinType, Settings } from './types.ts'

const C = {
  black: '#1a1a1a',
  brown: '#795548',
  red: '#e53935',
  orange: '#fb8c00',
  yellow: '#fdd835',
  green: '#43a047',
  blue: '#1e88e5',
  purple: '#8e44ad',
  gray: '#9e9e9e',
  white: '#f5f5f5',
}

/** The ten colors of a standard jumper ribbon. */
export const JUMPER_PALETTE: PaletteColor[] = [
  { name: 'black', color: C.black },
  { name: 'brown', color: C.brown },
  { name: 'red', color: C.red },
  { name: 'orange', color: C.orange },
  { name: 'yellow', color: C.yellow },
  { name: 'green', color: C.green },
  { name: 'blue', color: C.blue },
  { name: 'purple', color: C.purple },
  { name: 'gray', color: C.gray },
  { name: 'white', color: C.white },
]

export const DEFAULT_PIN_TYPES: PinType[] = [
  { id: '3v3', label: '3V3', color: C.red },
  { id: '5v', label: '5V / VIN', color: C.orange },
  { id: 'vbat', label: 'Battery +', color: C.red },
  { id: 'gnd', label: 'GND', color: C.black },
  { id: 'spi_sck', label: 'SPI SCK', color: C.purple },
  { id: 'spi_mosi', label: 'SPI MOSI', color: C.blue },
  { id: 'spi_miso', label: 'SPI MISO', color: C.green },
  { id: 'spi_cs', label: 'SPI CS', color: C.yellow },
  { id: 'i2c_sda', label: 'I2C SDA', color: C.blue },
  { id: 'i2c_scl', label: 'I2C SCL', color: C.yellow },
  { id: 'uart_tx', label: 'UART TX', color: C.green },
  { id: 'uart_rx', label: 'UART RX', color: C.white },
  { id: 'irq', label: 'Interrupt / data-ready', color: C.brown },
  { id: 'enable', label: 'Enable / reset', color: C.gray },
  { id: 'analog', label: 'Analog', color: C.brown },
  { id: 'gpio', label: 'Plain GPIO', color: C.gray },
  { id: 'other', label: 'Antenna / no-connect / other', color: C.gray },
]

/** Used when a pin type is unknown, for example after it was removed in Settings. */
export const FALLBACK_COLOR = '#8a8f98'

export const DEFAULT_SETTINGS: Settings = {
  pinTypes: DEFAULT_PIN_TYPES,
  palette: JUMPER_PALETTE,
  snap: true,
  wireStyle: 'grid',
}
