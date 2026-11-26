// Shared data shapes. Everything positional is in millimetres.

export type PinTypeId = string

export interface PinType {
  id: PinTypeId
  label: string
  color: string
}

export interface PaletteColor {
  name: string
  color: string
}

export interface Settings {
  pinTypes: PinType[]
  palette: PaletteColor[]
  snap: boolean
  /** grid: straight runs with square corners. curved: loose hanging jumpers. */
  wireStyle: 'grid' | 'curved'
}

export interface Point {
  x: number
  y: number
}

export interface PinDef {
  id: string
  /** What the silkscreen says: IO18, VCC, CSN. */
  name: string
  /** What the pin does; keys into Settings.pinTypes. */
  type: PinTypeId
  /** Position in mm from the part's top-left, seen from the part's stated face. */
  x: number
  y: number
  /** Header or connector this pin belongs to; used by "Fill row". */
  row?: string
  gpio?: number
  /** Facts for later phases: input_only, strapping, adc1, adc2, flash. */
  caps?: string[]
  voltage?: number
  /** Set when the board already uses this pin for something on board. */
  internalUse?: string
  note?: string
}

/** Where each pin sits on one uploaded image. u and v are fractions of width and height. */
export interface PartImage {
  file: string
  widthMm: number
  /** Image height divided by image width. */
  aspect: number
  pins: Record<string, { u: number; v: number }>
}

export type Face = 'top' | 'bottom'
export type ImageSide = 'front' | 'flipped'

export interface PartPower {
  draws?: { rail: PinTypeId; typicalMa: number; peakMa: number }[]
  supplies?: { pins: string[]; rail: PinTypeId; maxMa: number }[]
}

export interface PartDef {
  id: string
  name: string
  category: string
  tags?: string[]
  onHand: boolean
  /** The face the pin map is drawn from. */
  face: Face
  /** Only ever set by the "Mark as checked" button. */
  verified: boolean
  verifiedOn?: string
  /** Where the pin map came from. */
  source: string
  width: number
  height: number
  color: string
  pins: PinDef[]
  /** Groups of pin ids joined inside the part. */
  links?: string[][]
  power?: PartPower
  /** Short labels printed on the placeholder, such as connector names. */
  captions?: { text: string; x: number; y: number; anchor?: 'start' | 'middle' }[]
  /**
   * Marks a power or ground rail. A rail has no pins of its own in the library;
   * each one on the desk says how many it has, and they are all one net.
   */
  rail?: { type: PinTypeId; label: string }
  /** Boxes drawn on the placeholder to mark a sub-part, such as the ESP32 module on a dev board. */
  outlines?: { x: number; y: number; w: number; h: number; text?: string }[]
  notes?: string
  /** front is the stated face, flipped is the other one. */
  images?: { front?: PartImage; flipped?: PartImage }
}

export type Rotation = 0 | 90 | 180 | 270

export interface PlacedPart {
  id: string
  partId: string
  /** Top-left of the rotated bounding box. */
  x: number
  y: number
  rotation: Rotation
  flipped: boolean
  label?: string
  /** For a rail: how many pins this one has. */
  pins?: number
}

export interface PinRef {
  part: string
  pin: string
}

export interface Wire {
  id: string
  a: PinRef
  b: PinRef
  /** Manual color; when absent the color comes from the pin types. */
  color?: string
  points?: Point[]
}

export interface Project {
  id: string
  name: string
  parts: PlacedPart[]
  wires: Wire[]
  updated?: string
}

export interface ProjectSummary {
  id: string
  name: string
  updated?: string
}

export type Library = Record<string, PartDef>
