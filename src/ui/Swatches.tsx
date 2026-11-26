import type { PaletteColor } from '../model/types'

interface Props {
  palette: PaletteColor[]
  value: string | undefined
  onPick: (color: string) => void
  /** Show a custom color well after the palette. */
  custom?: boolean
}

/** The ten jumper colors as a row of buttons. */
export function Swatches({ palette, value, onPick, custom = true }: Props) {
  const v = value?.toLowerCase()
  const isCustom = !!v && !palette.some((p) => p.color.toLowerCase() === v)
  return (
    <span className="swatches">
      {palette.map((p) => (
        <button
          key={p.name}
          type="button"
          className={`swatch${v === p.color.toLowerCase() ? ' is-on' : ''}`}
          style={{ background: p.color }}
          title={p.name}
          aria-label={p.name}
          aria-pressed={v === p.color.toLowerCase()}
          onClick={() => onPick(p.color)}
        />
      ))}
      {custom && (
        <label className={`swatch swatch-custom${isCustom ? ' is-on' : ''}`} title="Custom color">
          <input type="color" value={isCustom ? v : '#00bcd4'} onChange={(e) => onPick(e.target.value)} aria-label="Custom color" />
        </label>
      )}
    </span>
  )
}
