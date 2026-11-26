// A part on the desk, drawn in two layers: the body (under the wires) and the
// pins (over the wires, so a pin is always easy to grab).

import { memo, useMemo } from 'react'
import { luminance } from '../model/colors'
import { MISSING_SIZE, partGeometry, rotatedSize, rotatePoint } from '../model/geometry'
import { layoutLabels, pinMetrics } from '../model/labels'
import type { PartDef, PlacedPart, Rotation } from '../model/types'

const ROTATION_MATRIX: Record<Rotation, (w: number, h: number) => string> = {
  0: () => 'matrix(1 0 0 1 0 0)',
  90: (_w, h) => `matrix(0 1 -1 0 ${h} 0)`,
  180: (w, h) => `matrix(-1 0 0 -1 ${w} ${h})`,
  270: (w) => `matrix(0 -1 1 0 0 ${w})`,
}

export function faceLabel(def: PartDef, flipped: boolean): string {
  const face = flipped ? (def.face === 'top' ? 'bottom' : 'top') : def.face
  return face === 'top' ? 'top view' : 'back view'
}

/** Everything about a placed part that only changes when the part itself does. */
function useLayout(def: PartDef | undefined, placed: PlacedPart) {
  return useMemo(() => {
    if (!def) return null
    const g = partGeometry(def, placed.flipped)
    const size = rotatedSize(g, placed.rotation)
    const pins = def.pins.map((p) => ({
      id: p.id,
      name: p.name,
      row: p.row,
      pos: rotatePoint(g.pins[p.id], g, placed.rotation),
    }))
    // Captions only belong to the placeholder; an uploaded image carries its own silkscreen.
    const captions = g.image
      ? []
      : (def.captions ?? []).map((c) => ({
          text: c.text,
          anchor: c.anchor ?? 'start',
          pos: rotatePoint({ x: placed.flipped ? g.w - c.x : c.x, y: c.y }, g, placed.rotation),
        }))
    const metrics = pinMetrics(pins.map((p) => p.pos))
    const { labels } = layoutLabels(pins, size, metrics)
    // Outlines are stored unrotated; mirror them for the other face, then let the body's rotation turn them.
    const outlines = g.image
      ? []
      : (def.outlines ?? []).map((o) => {
          const x = placed.flipped ? g.w - o.x - o.w : o.x
          return { ...o, x, label: rotatePoint({ x: x + o.w / 2, y: o.y + Math.min(3.4, o.h / 2) }, g, placed.rotation) }
        })
    return { g, size, pins, metrics, labels, captions, outlines }
  }, [def, placed.flipped, placed.rotation])
}

interface BodyProps {
  placed: PlacedPart
  def: PartDef | undefined
  title: string
  selected: boolean
}

export const PartBody = memo(function PartBody({ placed, def, title, selected }: BodyProps) {
  const layout = useLayout(def, placed)

  if (!def || !layout) {
    return (
      <g data-part={placed.id} transform={`translate(${placed.x} ${placed.y})`} className="part">
        <rect width={MISSING_SIZE.w} height={MISSING_SIZE.h} rx={0.8} className={`part-missing${selected ? ' is-selected' : ''}`} />
        <text x={MISSING_SIZE.w / 2} y={MISSING_SIZE.h / 2 - 0.9} className="part-missing-text" fontSize={1.5}>
          Missing part
        </text>
        <text x={MISSING_SIZE.w / 2} y={MISSING_SIZE.h / 2 + 1.3} className="part-missing-text" fontSize={1.2}>
          {placed.partId}
        </text>
      </g>
    )
  }

  const { g, size, outlines } = layout
  const dark = luminance(def.color) < 0.3
  return (
    <g data-part={placed.id} transform={`translate(${placed.x} ${placed.y})`} className="part">
      {/* No label on the desk: the name shows as a tooltip on hover, and in the inspector when selected. */}
      {title && <title>{`${title}, ${faceLabel(def, placed.flipped)}`}</title>}
      <g transform={ROTATION_MATRIX[placed.rotation](g.w, g.h)}>
        {g.image ? (
          <image href={`/images/${g.image.file}`} width={g.w} height={g.h} preserveAspectRatio="none" />
        ) : (
          <rect
            width={g.w}
            height={g.h}
            rx={0.9}
            fill={def.color}
            className={`part-board${luminance(def.color) < 0.12 ? ' is-dark' : ''}${g.mirrored ? ' is-mirrored' : ''}`}
          />
        )}
        {outlines.map((o, i) => (
          <rect key={i} x={o.x} y={o.y} width={o.w} height={o.h} rx={0.5} className={`part-outline ${dark ? 'on-dark' : 'on-light'}`} />
        ))}
      </g>
      {outlines.map((o, i) =>
        o.text ? (
          <text key={i} x={o.label.x} y={o.label.y} fontSize={1.25} className={`part-outline-text ${dark ? 'on-dark' : 'on-light'}`}>
            {o.text}
          </text>
        ) : null,
      )}
      {/* A wide transparent frame so thin parts are still easy to grab. */}
      <rect x={-0.6} y={-0.6} width={size.w + 1.2} height={size.h + 1.2} fill="transparent" />
      {selected && <rect x={-0.8} y={-0.8} width={size.w + 1.6} height={size.h + 1.6} rx={1.2} className="part-selection" />}
    </g>
  )
})

interface PinsProps {
  placed: PlacedPart
  def: PartDef | undefined
  /** Pin ids with a wire on them, mapped to that wire's color. */
  wired: Record<string, string>
  activePin: string | null
}

export const PartPins = memo(function PartPins({ placed, def, wired, activePin }: PinsProps) {
  const layout = useLayout(def, placed)
  if (!def || !layout) return null
  const { g, pins, metrics, labels, captions } = layout
  const lightBoard = luminance(def.color) > 0.3

  return (
    <g transform={`translate(${placed.x} ${placed.y})`} className="pins">
      {captions.map((c) => (
        <text key={c.text} x={c.pos.x} y={c.pos.y} fontSize={def.rail ? 1.5 : 1.7} textAnchor={c.anchor} className={`part-caption ${lightBoard ? 'on-light' : 'on-dark'}`}>
          {c.text}
        </text>
      ))}
      {pins.map((pin, index) => {
        const m = metrics[index]
        // The grab area is bigger than the pad but never reaches the next pin.
        const hitR = Math.max(m.padR * 1.2, Math.min(m.pitch * 0.5, 1.6))
        const label = labels[pin.id]
        const key = `${placed.id}:${pin.id}`
        const active = activePin === key
        const wire = wired[pin.id]
        return (
          <g key={pin.id}>
            <circle
              cx={pin.pos.x}
              cy={pin.pos.y}
              r={active ? m.padR * 1.5 : m.padR}
              className={`pad${g.image ? ' on-image' : lightBoard ? ' on-light' : ''}${active ? ' is-active' : ''}`}
            />
            {wire && <circle cx={pin.pos.x} cy={pin.pos.y} r={m.padR * 0.5} fill={wire} className="pad-wire" />}
            {!g.image && !def.rail && label && (
              <text
                transform={`translate(${label.x} ${label.y}) rotate(${label.rotate})`}
                textAnchor={label.anchor}
                fontSize={m.font}
                className={`pin-label ${label.outside ? 'is-outside' : lightBoard ? 'on-light' : 'on-dark'}`}
              >
                {pin.name}
              </text>
            )}
            <circle data-pin={key} cx={pin.pos.x} cy={pin.pos.y} r={hitR} className="pad-hit" />
          </g>
        )
      })}
    </g>
  )
})
