import { useEffect } from 'react'
import { DEFAULT_PIN_TYPES } from '../model/defaults'
import type { PinType } from '../model/types'
import { useStore } from '../store/store'
import { Swatches } from './Swatches'

export function SettingsDialog() {
  const settings = useStore((s) => s.settings)
  const library = useStore((s) => s.library)
  const close = () => useStore.getState().setSettingsOpen(false)
  const save = (pinTypes: PinType[]) => useStore.getState().updateSettings({ ...settings, pinTypes })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const usage = (id: string) => Object.values(library).reduce((n, d) => n + d.pins.filter((p) => p.type === id).length, 0)
  const patch = (id: string, change: Partial<PinType>) => save(settings.pinTypes.map((t) => (t.id === id ? { ...t, ...change } : t)))

  function addType() {
    const label = window.prompt('Name for the new pin type', 'PWM')
    if (!label?.trim()) return
    const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'type'
    let id = base
    for (let n = 2; settings.pinTypes.some((t) => t.id === id); n++) id = `${base}_${n}`
    save([...settings.pinTypes, { id, label: label.trim(), color: '#9e9e9e' }])
  }

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Pin colors">
        <header>
          <h2>Pin colors</h2>
          <button onClick={close}>Done</button>
        </header>
        <p className="note">
          One color per pin type, used by every part in the library. A wire takes the color of the pin type it connects unless you give that
          wire its own color. Changes save as you make them.
        </p>
        <div className="types">
          {settings.pinTypes.map((t) => {
            const used = usage(t.id)
            return (
              <div className="type-row" key={t.id}>
                <input type="text" value={t.label} onChange={(e) => patch(t.id, { label: e.target.value })} aria-label={`Name of ${t.label}`} />
                <Swatches palette={settings.palette} value={t.color} onPick={(color) => patch(t.id, { color })} />
                <span className="type-used">{used ? `${used} pins` : 'unused'}</span>
                <button
                  onClick={() => {
                    const warn = used
                      ? `${used} pins in the library use "${t.label}". They will turn gray until you add the type back. Remove it?`
                      : `Remove the pin type "${t.label}"?`
                    if (window.confirm(warn)) save(settings.pinTypes.filter((x) => x.id !== t.id))
                  }}
                >
                  Remove
                </button>
              </div>
            )
          })}
        </div>
        <footer>
          <button onClick={addType}>Add a pin type</button>
          <button
            onClick={() => {
              if (window.confirm('Put every pin type back to its starting color and name? Types you added are removed.')) save(DEFAULT_PIN_TYPES)
            }}
          >
            Reset to defaults
          </button>
        </footer>
      </div>
    </div>
  )
}
