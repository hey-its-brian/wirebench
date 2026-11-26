import { useMemo, useState } from 'react'
import { buildWireList, wireListMarkdown } from '../model/wirelist'
import { useStore } from '../store/store'

export function WireList() {
  const project = useStore((s) => s.project)
  const library = useStore((s) => s.library)
  const settings = useStore((s) => s.settings)
  const selected = useStore((s) => s.selection.wires)
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle')
  const rows = useMemo(() => buildWireList(project, library, settings), [project, library, settings])

  async function copy() {
    try {
      await navigator.clipboard.writeText(wireListMarkdown(rows))
      setCopied('done')
    } catch {
      setCopied('failed')
    }
    setTimeout(() => setCopied('idle'), 2000)
  }

  return (
    <div className="wirelist">
      <div className="wirelist-head">
        <h2>
          Wires <span className="count">{rows.length}</span>
        </h2>
        <button disabled={!rows.length} onClick={copy}>
          {copied === 'done' ? 'Copied' : copied === 'failed' ? 'Copy failed' : 'Copy as Markdown'}
        </button>
      </div>
      {rows.length ? (
        <div className="wirelist-scroll">
          <table>
            <thead>
              <tr>
                <th>From</th>
                <th>To</th>
                <th>Function</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.wireId}
                  className={selected.includes(r.wireId) ? 'is-selected' : ''}
                  onClick={() => useStore.getState().select({ wires: [r.wireId] })}
                >
                  <td>
                    <i className="dot" style={{ background: r.hex }} title={r.color} />
                    {r.fromPart} <b>{r.fromPin}</b>
                  </td>
                  <td>
                    {r.toPart} <b>{r.toPin}</b>
                  </td>
                  <td>{r.fn}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty-note">No wires yet. Drag from one pin to another to draw the first.</p>
      )}
    </div>
  )
}
