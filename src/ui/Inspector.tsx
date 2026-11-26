import { useMemo } from 'react'
import { pinTypeColor, wireAutoType } from '../model/colors'
import { connectionsOf } from '../model/nets'
import { RAIL_MAX, RAIL_MIN, railCount, railPinId, resolveDef } from '../model/parts'
import type { PlacedPart, Wire } from '../model/types'
import { partDisplayNames } from '../model/wirelist'
import { useStore } from '../store/store'
import { faceLabel } from './PartView'
import { Swatches } from './Swatches'

function PartInspector({ placed }: { placed: PlacedPart }) {
  const library = useStore((s) => s.library)
  const project = useStore((s) => s.project)
  const settings = useStore((s) => s.settings)
  const def = resolveDef(library, placed)
  const names = useMemo(() => partDisplayNames(project, library), [project, library])
  const s = useStore.getState

  if (!def) {
    return (
      <div className="insp">
        <h3>Missing part</h3>
        <p className="note">
          This project uses a part with the id <code>{placed.partId}</code>, but there is no such file in data/library. Put the file back, or
          delete this part from the desk.
        </p>
        <button onClick={() => s().deleteSelected()}>Delete from desk</button>
      </div>
    )
  }

  const pinName = (part: string, pin: string) => {
    const other = project.parts.find((p) => p.id === part)
    const otherDef = other ? resolveDef(library, other) : undefined
    return `${names[part] ?? 'Missing part'} ${otherDef?.pins.find((p) => p.id === pin)?.name ?? pin}`
  }

  return (
    <div className="insp">
      <h3>{def.name}</h3>
      <p className="insp-sub">
        {def.rail ? `${def.pins.length} pins, all joined` : faceLabel(def, placed.flipped)}, turned {placed.rotation}°
        {!def.verified && !def.rail && <em className="badge-unverified">unverified</em>}
      </p>
      {def.rail && <RailPins placed={placed} />}
      <label className="field">
        <span>Label on the desk</span>
        <input
          type="text"
          key={placed.id}
          defaultValue={placed.label ?? ''}
          placeholder={names[placed.id]}
          onBlur={(e) => {
            if ((e.target.value.trim() || undefined) !== placed.label) s().setPartLabel(placed.id, e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
      </label>
      <div className="btn-row">
        <button onClick={() => s().rotateSelected()} title="Rotate (R)">
          Rotate
        </button>
        <button onClick={() => s().flipSelected()} title="Flip to the other face (F)">
          Flip
        </button>
        <button onClick={() => s().duplicateSelected()} title="Duplicate (Cmd D)">
          Duplicate
        </button>
        <button onClick={() => s().deleteSelected()} title="Delete (Backspace)">
          Delete
        </button>
      </div>
      {!def.rail && (
        <button className="wide" onClick={() => s().openPartSettings(def.id)}>
          Part settings and image
        </button>
      )}
      {def.notes && <p className="note">{def.notes}</p>}
      <table className="pin-table">
        <thead>
          <tr>
            <th>Pin</th>
            <th>Connected to</th>
          </tr>
        </thead>
        <tbody>
          {def.pins.map((pin) => {
            const links = connectionsOf(project, library, { part: placed.id, pin: pin.id }).filter((r) => r.part !== placed.id)
            return (
              <tr key={pin.id}>
                <td>
                  <i className="dot" style={{ background: pinTypeColor(pin.type, settings) }} />
                  {pin.name}
                </td>
                <td className={links.length ? '' : 'is-open'}>
                  {links.length ? links.map((r) => pinName(r.part, r.pin)).join(', ') : 'open'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Add or remove pins on one rail. */
function RailPins({ placed }: { placed: PlacedPart }) {
  const wires = useStore((s) => s.project.wires)
  const count = railCount(placed)
  const lastPin = railPinId(count - 1)
  const lastIsWired = wires.some((w) => [w.a, w.b].some((e) => e.part === placed.id && e.pin === lastPin))
  const set = (n: number) => useStore.getState().setRailPins(placed.id, n)
  return (
    <div className="field">
      <span>Pins on this rail</span>
      <div className="stepper">
        <button
          onClick={() => set(count - 1)}
          disabled={count <= RAIL_MIN || lastIsWired}
          title={lastIsWired ? 'The last pin has a wire. Remove the wire first.' : 'Remove the last pin'}
          aria-label="Remove a pin"
        >
          −
        </button>
        <output aria-live="polite">{count}</output>
        <button onClick={() => set(count + 1)} disabled={count >= RAIL_MAX} title="Add a pin" aria-label="Add a pin">
          +
        </button>
        {lastIsWired && <span className="stepper-note">The last pin has a wire, so it cannot be removed.</span>}
      </div>
    </div>
  )
}

function WireInspector({ wire }: { wire: Wire }) {
  const library = useStore((s) => s.library)
  const project = useStore((s) => s.project)
  const settings = useStore((s) => s.settings)
  const names = useMemo(() => partDisplayNames(project, library), [project, library])
  const s = useStore.getState

  const end = (ref: Wire['a']) => {
    const placed = project.parts.find((p) => p.id === ref.part)
    const pin = placed ? resolveDef(library, placed)?.pins.find((p) => p.id === ref.pin) : undefined
    return `${names[ref.part] ?? 'Missing part'} ${pin?.name ?? ref.pin}`
  }
  const type = wireAutoType(wire, project, library)
  const typeLabel = settings.pinTypes.find((t) => t.id === type)?.label

  return (
    <div className="insp">
      <h3>Wire</h3>
      <p className="insp-sub">
        {end(wire.a)} to {end(wire.b)}
      </p>
      <div className="field">
        <span>Color</span>
        <div className="color-row">
          <button
            className={`toggle${wire.color ? '' : ' is-on'}`}
            aria-pressed={!wire.color}
            onClick={() => s().setWireColor(wire.id, undefined)}
            title="Follow the pin type color"
          >
            <i className="dot" style={{ background: pinTypeColor(type, settings) }} />
            Auto{typeLabel ? `: ${typeLabel}` : ''}
          </button>
          <Swatches palette={settings.palette} value={wire.color} onPick={(c) => s().setWireColor(wire.id, c)} />
        </div>
      </div>
      <p className="note">
        Double-click the wire to add a bend and route it yourself. Drag a bend to move it; double-click a bend to remove it. Bends snap to
        the grid while Snap is on.
      </p>
      <div className="btn-row">
        {!!wire.points?.length && <button onClick={() => s().setWirePoints(wire.id, [])}>Remove bends</button>}
        <button onClick={() => s().deleteSelected()}>Delete wire</button>
      </div>
    </div>
  )
}

export function Inspector() {
  const selection = useStore((s) => s.selection)
  const project = useStore((s) => s.project)
  const count = selection.parts.length + selection.wires.length

  if (count === 1 && selection.parts.length === 1) {
    const placed = project.parts.find((p) => p.id === selection.parts[0])
    if (placed) return <PartInspector placed={placed} />
  }
  if (count === 1 && selection.wires.length === 1) {
    const wire = project.wires.find((w) => w.id === selection.wires[0])
    if (wire) return <WireInspector wire={wire} />
  }
  if (count > 1) {
    return (
      <div className="insp">
        <h3>
          {selection.parts.length} parts, {selection.wires.length} wires selected
        </h3>
        <div className="btn-row">
          <button onClick={() => useStore.getState().rotateSelected()}>Rotate</button>
          <button onClick={() => useStore.getState().duplicateSelected()}>Duplicate</button>
          <button onClick={() => useStore.getState().deleteSelected()}>Delete</button>
        </div>
      </div>
    )
  }
  return (
    <div className="insp">
      <h3>Nothing selected</h3>
      <dl className="keys">
        <dt>Drag from a pin</dt>
        <dd>draw a wire to another pin</dd>
        <dt>Click a pin, then another</dt>
        <dd>same, without holding the button</dd>
        <dt>R, F</dt>
        <dd>rotate, flip to the other face</dd>
        <dt>Alt while dragging</dt>
        <dd>do the opposite of the snap setting</dd>
        <dt>Arrow keys</dt>
        <dd>nudge one grid step (Shift for a tenth)</dd>
        <dt>Scroll, pinch</dt>
        <dd>pan, zoom (Space and drag also pans)</dd>
        <dt>Backspace</dt>
        <dd>delete the selection</dd>
      </dl>
    </div>
  )
}
