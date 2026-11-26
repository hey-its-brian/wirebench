import { memo } from 'react'
import { luminance } from '../model/colors'
import type { Point } from '../model/types'

interface Props {
  id: string
  /** The finished SVG path, in desk millimetres. */
  d: string
  /** The bend points the user placed, shown as handles while the wire is selected. */
  handles: Point[]
  color: string
  selected: boolean
}

/** Black needs a light edge to show on the mat; every other color gets a dark one. */
export const outlineFor = (color: string) => (luminance(color) < 0.05 ? '#a9b0b8' : '#0e1114')

export const WireView = memo(function WireView({ id, d, handles, color, selected }: Props) {
  if (!d) return null
  return (
    <g className="wire">
      {selected && <path d={d} className="wire-halo" />}
      <path d={d} className="wire-edge" stroke={outlineFor(color)} />
      <path d={d} className="wire-core" stroke={color} />
      <path d={d} className="wire-hit" data-wire={id} />
      {selected && handles.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={1} className="wire-bend" data-bend={`${id}:${i}`} />)}
    </g>
  )
})
