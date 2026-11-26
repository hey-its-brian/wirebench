import { useMemo, useState } from 'react'
import { isImageComplete } from '../model/placement'
import type { PartDef } from '../model/types'
import { useStore } from '../store/store'
import { freeSpot, PART_MIME } from './Desk'

const CATEGORY_ORDER = ['Boards', 'Radios', 'Displays', 'Sensors', 'Power and passives']

function matches(def: PartDef, q: string) {
  if (!q) return true
  const hay = [def.name, def.id, def.category, ...(def.tags ?? [])].join(' ').toLowerCase()
  return q.split(/\s+/).every((word) => hay.includes(word))
}

export function LibraryPanel() {
  const library = useStore((s) => s.library)
  const [query, setQuery] = useState('')
  const [onHandOnly, setOnHandOnly] = useState(false)

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const parts = Object.values(library)
      .filter((d) => matches(d, q) && (!onHandOnly || d.onHand || !!d.rail))
      .sort((a, b) => a.name.localeCompare(b.name))
    const cats = [...new Set(parts.map((p) => p.category))].sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a)
      const ib = CATEGORY_ORDER.indexOf(b)
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b)
    })
    return cats.map((cat) => ({ cat, parts: parts.filter((p) => p.category === cat) }))
  }, [library, query, onHandOnly])

  const total = groups.reduce((n, g) => n + g.parts.length, 0)

  return (
    <aside className="panel library">
      <h2>Parts</h2>
      <input
        className="search"
        type="search"
        placeholder="Search parts"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search parts"
      />
      <label className="check">
        <input type="checkbox" checked={onHandOnly} onChange={(e) => setOnHandOnly(e.target.checked)} />
        Only parts I have
      </label>
      <div className="library-list">
        {groups.map(({ cat, parts }) => (
          <section key={cat}>
            <h3>{cat}</h3>
            <ul>
              {parts.map((def) => {
                const hasImage = isImageComplete(def, def.images?.front)
                return (
                  <li
                    key={def.id}
                    className="lib-item"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(PART_MIME, def.id)
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    onDoubleClick={() => useStore.getState().addPart(def.id, freeSpot(def.id))}
                    title="Drag onto the desk, or double-click"
                  >
                    {hasImage ? (
                      <img className="lib-thumb" src={`/images/${def.images!.front!.file}`} alt="" draggable={false} />
                    ) : (
                      <span className="lib-chip" style={{ background: def.color }} />
                    )}
                    <span className="lib-text">
                      <span className="lib-name">{def.name}</span>
                      <span className="lib-meta">
                        {def.rail ? 'add pins as you need them' : `${def.pins.length} pins`}
                        {!def.onHand && !def.rail && ', not on hand'}
                        {!def.verified && !def.rail && <em className="badge-unverified">unverified</em>}
                      </span>
                    </span>
                    {!def.rail && (
                      <button
                      className="lib-gear"
                      onClick={() => useStore.getState().openPartSettings(def.id)}
                      onDoubleClick={(e) => e.stopPropagation()}
                      title={`Settings for ${def.name}`}
                      aria-label={`Settings for ${def.name}`}
                    >
                      Edit
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
        {!total && <p className="empty-note">No parts match. Clear the search or the filter.</p>}
      </div>
    </aside>
  )
}
