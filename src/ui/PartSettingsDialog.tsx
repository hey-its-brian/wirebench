// Settings for one library part: its image, where each existing pin sits on
// that image, and the "checked against the real part" flag.

import { useEffect, useMemo, useRef, useState } from 'react'
import { pinTypeColor } from '../model/colors'
import { partGeometry } from '../model/geometry'
import { applyFillRow, fillableRows, isImageComplete, nextUnplacedPin, placedCount } from '../model/placement'
import type { ImageSide, PartDef, PartImage, PlacedPart } from '../model/types'
import { api } from '../store/api'
import { useStore } from '../store/store'
import { PartBody, PartPins } from './PartView'

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

async function imageSize(file: Blob): Promise<{ w: number; h: number }> {
  const bitmap = await createImageBitmap(file)
  const size = { w: bitmap.width, h: bitmap.height }
  bitmap.close()
  return size
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

function sideName(def: PartDef, side: ImageSide) {
  const top = (def.face === 'top') === (side === 'front')
  return top ? 'Top view' : 'Back view'
}

export function PartSettingsDialog({ partId }: { partId: string }) {
  const def = useStore((s) => s.library[partId])
  const settings = useStore((s) => s.settings)
  const [side, setSide] = useState<ImageSide>('front')
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)
  const [dragging, setDragging] = useState<{ pin: string; u: number; v: number } | null>(null)
  const [dropHot, setDropHot] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const close = () => useStore.getState().openPartSettings(null)
  const img = def?.images?.[side]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Keep a sensible pin selected: the first one that still needs a spot.
  useEffect(() => {
    if (!def || !img) {
      setSelected(null)
      return
    }
    setSelected((cur) => (cur && def.pins.some((p) => p.id === cur) && !img.pins[cur] ? cur : nextUnplacedPin(def, img)))
    // Only when the part, the face or the image file changes, not on every placement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partId, side, img?.file])

  const preview: PlacedPart = useMemo(
    () => ({ id: 'preview', partId, x: 0, y: 0, rotation: 0, flipped: side === 'flipped' }),
    [partId, side],
  )

  if (!def) return null

  async function save(next: PartDef) {
    setError(null)
    try {
      await useStore.getState().updatePart(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function withImage(next: PartImage | undefined): PartDef {
    const images = { ...def.images, [side]: next }
    if (!images.front) delete images.front
    if (!images.flipped) delete images.flipped
    const { images: _old, ...rest } = def
    return Object.keys(images).length ? { ...rest, images } : rest
  }

  async function upload(file: File | undefined) {
    if (!file) return
    const ext = EXT[file.type]
    if (!ext) {
      setError('That file is not a PNG, JPG or WebP image.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { w, h } = await imageSize(file)
      const name = `${def.id}-${side}.${ext}`
      if (img && img.file !== name) await api.deleteImage(img.file)
      await api.uploadImage(name, file)
      const aspect = h / w
      // Start at the part's real size; match the long side if the photo is turned the other way.
      const g = partGeometry({ ...def, images: undefined }, false)
      const widthMm = aspect > 1 === g.h / g.w > 1 ? g.w : g.h
      await save(withImage({ file: name, widthMm: Math.round(widthMm * 10) / 10, aspect, pins: {} }))
      setVersion((n) => n + 1)
      setSelected(def.pins[0]?.id ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function removeImage() {
    if (!img) return
    if (!window.confirm(`Remove this image and its ${placedCount(def, img)} placed pins? The part goes back to its placeholder.`)) return
    setBusy(true)
    try {
      await api.deleteImage(img.file)
      await save(withImage(undefined))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function spotFrom(e: { clientX: number; clientY: number }) {
    const r = imgRef.current!.getBoundingClientRect()
    return { u: clamp01((e.clientX - r.left) / r.width), v: clamp01((e.clientY - r.top) / r.height) }
  }

  function placeAt(e: React.MouseEvent) {
    if (!img || !selected) return
    const next = { ...img, pins: { ...img.pins, [selected]: spotFrom(e) } }
    void save(withImage(next))
    setSelected(nextUnplacedPin(def, next, selected))
  }

  function clearPin(id: string) {
    if (!img) return
    const pins = { ...img.pins }
    delete pins[id]
    void save(withImage({ ...img, pins }))
    setSelected(id)
  }

  const done = img ? placedCount(def, img) : 0
  const complete = isImageComplete(def, img)
  const rows = img ? fillableRows(def, img) : []
  const g = partGeometry({ ...def, images: undefined }, side === 'flipped')
  const selectedPin = def.pins.find((p) => p.id === selected)

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-label={`Settings for ${def.name}`}>
        <header>
          <h2>{def.name}</h2>
          <div className="tabs" role="tablist">
            {(['front', 'flipped'] as ImageSide[]).map((s) => (
              <button key={s} role="tab" aria-selected={side === s} className={`toggle${side === s ? ' is-on' : ''}`} onClick={() => setSide(s)}>
                {sideName(def, s)}
                {s === 'front' ? '' : ' (other side)'}
              </button>
            ))}
          </div>
          <span className="tb-spacer" />
          <button onClick={close}>Done</button>
        </header>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="ps-body">
          <div
            className={`ps-stage${dropHot ? ' is-hot' : ''}`}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('Files')) {
                e.preventDefault()
                setDropHot(true)
              }
            }}
            onDragLeave={() => setDropHot(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDropHot(false)
              void upload(e.dataTransfer.files[0])
            }}
          >
            {img ? (
              <div className="ps-image">
                <img
                  ref={imgRef}
                  src={`/images/${img.file}?v=${version}`}
                  alt={`${def.name}, ${sideName(def, side).toLowerCase()}`}
                  draggable={false}
                  onClick={placeAt}
                  className={selected ? 'is-placing' : ''}
                />
                {def.pins.map((pin) => {
                  const spot = dragging?.pin === pin.id ? dragging : img.pins[pin.id]
                  if (!spot) return null
                  return (
                    <button
                      key={pin.id}
                      className={`ps-marker${selected === pin.id ? ' is-selected' : ''}`}
                      style={{ left: `${spot.u * 100}%`, top: `${spot.v * 100}%`, ['--pin' as string]: pinTypeColor(pin.type, settings) }}
                      title={`${pin.name}: drag to adjust`}
                      onPointerDown={(e) => {
                        e.currentTarget.setPointerCapture(e.pointerId)
                        setSelected(pin.id)
                        setDragging({ pin: pin.id, ...spot })
                      }}
                      onPointerMove={(e) => {
                        if (dragging?.pin === pin.id) setDragging({ pin: pin.id, ...spotFrom(e) })
                      }}
                      onPointerUp={() => {
                        if (dragging?.pin !== pin.id) return
                        const moved = dragging.u !== img.pins[pin.id]?.u || dragging.v !== img.pins[pin.id]?.v
                        if (moved) void save(withImage({ ...img, pins: { ...img.pins, [pin.id]: { u: dragging.u, v: dragging.v } } }))
                        setDragging(null)
                      }}
                    >
                      <span>{pin.name}</span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="ps-drop">
                <strong>No image for the {sideName(def, side).toLowerCase()} yet</strong>
                <span>
                  Drop a PNG, JPG or WebP here, or choose a file. A straight-down, tightly cropped photo works best. The part keeps its placeholder
                  until every pin is placed.
                </span>
                <button disabled={busy} onClick={() => fileRef.current?.click()}>
                  Choose an image
                </button>
              </div>
            )}
          </div>

          <div className="ps-side">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = '' }} />

            {img && (
              <section>
                <p className={`ps-progress${complete ? ' is-done' : ''}`}>
                  {done} of {def.pins.length} pins placed.{' '}
                  {complete ? 'This image is now used on the desk.' : selectedPin ? `Click the image where ${selectedPin.name} is.` : 'Pick a pin below.'}
                </p>
                {rows.map((r) => (
                  <button key={r.row} className="wide" onClick={() => void save(withImage(applyFillRow(img, r.pins)))}>
                    Fill row "{r.row}": space {r.pins.filter((id) => !img.pins[id]).length} pins between its two ends
                  </button>
                ))}
                <label className="field field-inline">
                  <span>Width on the desk</span>
                  <input
                    type="number"
                    min={2}
                    max={400}
                    step={0.5}
                    value={img.widthMm}
                    onChange={(e) => {
                      const widthMm = Number(e.target.value)
                      if (widthMm >= 2 && widthMm <= 400) void save(withImage({ ...img, widthMm }))
                    }}
                  />
                  <span>mm</span>
                </label>
                <div className="btn-row">
                  <button disabled={busy} onClick={() => fileRef.current?.click()}>
                    Replace image
                  </button>
                  <button disabled={busy} onClick={removeImage}>
                    Remove image
                  </button>
                  <button disabled={!done} onClick={() => { void save(withImage({ ...img, pins: {} })); setSelected(def.pins[0]?.id ?? null) }}>
                    Clear all pins
                  </button>
                </div>
              </section>
            )}

            <section>
              <h3>Pin map, {sideName(def, side).toLowerCase()}</h3>
              <svg className="ps-preview" viewBox={`-9 -9 ${g.w + 18} ${g.h + 18}`} role="img" aria-label="Placeholder pin map">
                <PartBody placed={preview} def={{ ...def, images: undefined }} title="" selected={false} />
                <PartPins placed={preview} def={{ ...def, images: undefined }} wired={NO_WIRES} activePin={selected ? `preview:${selected}` : null} />
              </svg>
            </section>

            <section className="ps-pins">
              <h3>Pins</h3>
              <ul>
                {def.pins.map((pin) => {
                  const placed = !!img?.pins[pin.id]
                  return (
                    <li key={pin.id} className={selected === pin.id ? 'is-selected' : ''}>
                      <button className="ps-pin" disabled={!img} onClick={() => setSelected(pin.id)}>
                        <i className="dot" style={{ background: pinTypeColor(pin.type, settings) }} />
                        <b>{pin.name}</b>
                        <span>{pin.row ?? ''}</span>
                        <em>{!img ? '' : placed ? 'placed' : 'to place'}</em>
                      </button>
                      {placed && (
                        <button className="ps-clear" onClick={() => clearPin(pin.id)} aria-label={`Clear ${pin.name}`}>
                          Clear
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>

            <section>
              <h3>About this part</h3>
              <label className="check">
                <input type="checkbox" checked={def.onHand} onChange={(e) => void save({ ...def, onHand: e.target.checked })} />I have this part
              </label>
              <p className="note">
                <b>Where the pin map came from:</b> {def.source}
              </p>
              {def.verified ? (
                <p className="note">
                  Checked against the real part on {def.verifiedOn}.{' '}
                  <button className="link" onClick={() => { const { verifiedOn: _v, ...rest } = def; void save({ ...rest, verified: false }) }}>
                    Mark as unchecked
                  </button>
                </p>
              ) : (
                <>
                  <p className="note">Not yet checked. Compare the pin map with the part in your hand, then mark it.</p>
                  <button className="wide" onClick={() => void save({ ...def, verified: true, verifiedOn: new Date().toISOString().slice(0, 10) })}>
                    Mark as checked
                  </button>
                </>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

const NO_WIRES: Record<string, string> = {}
