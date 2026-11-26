import { useState } from 'react'
import { useStore } from '../store/store'
import { Swatches } from './Swatches'

function ProjectMenu() {
  const project = useStore((s) => s.project)
  const projects = useStore((s) => s.projects)
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  // The current project may not be in the list yet if it was just created.
  const list = projects.some((p) => p.id === project.id) ? projects : [{ id: project.id, name: project.name }, ...projects]

  return (
    <div className="tb-group">
      <select
        className="project-select"
        value={project.id}
        disabled={busy}
        aria-label="Project"
        onChange={(e) => run(() => useStore.getState().openProject(e.target.value))}
      >
        {list.map((p) => (
          <option key={p.id} value={p.id}>
            {p.id === project.id ? project.name : p.name}
          </option>
        ))}
      </select>
      <button
        disabled={busy}
        onClick={() => {
          const name = window.prompt('Name for the new project', 'Untitled')
          if (name !== null) void run(() => useStore.getState().newProject(name))
        }}
      >
        New
      </button>
      <button
        disabled={busy}
        onClick={() => {
          const name = window.prompt('Rename project', project.name)
          if (name) useStore.getState().renameProject(name)
        }}
      >
        Rename
      </button>
      <button
        disabled={busy}
        onClick={() => {
          if (window.confirm(`Delete the project "${project.name}"? This removes its file and cannot be undone.`)) {
            void run(() => useStore.getState().deleteProject(project.id))
          }
        }}
      >
        Delete
      </button>
    </div>
  )
}

export function Toolbar() {
  const settings = useStore((s) => s.settings)
  const wireColor = useStore((s) => s.wireColor)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const saveState = useStore((s) => s.saveState)
  const s = useStore.getState

  return (
    <header className="toolbar">
      <span className="brand">Wirebench</span>
      <ProjectMenu />
      <div className="tb-group">
        <button disabled={!canUndo} onClick={() => s().undo()} title="Undo (Cmd Z)">
          Undo
        </button>
        <button disabled={!canRedo} onClick={() => s().redo()} title="Redo (Shift Cmd Z)">
          Redo
        </button>
      </div>
      <div className="tb-group">
        <button
          className={`toggle${settings.snap ? ' is-on' : ''}`}
          aria-pressed={settings.snap}
          onClick={() => s().updateSettings({ ...settings, snap: !settings.snap })}
          title="Snap parts to the 2.54 mm grid. Hold Alt while dragging to do the opposite."
        >
          Snap {settings.snap ? 'on' : 'off'}
        </button>
        <button
          className={`toggle${settings.wireStyle !== 'curved' ? ' is-on' : ''}`}
          aria-pressed={settings.wireStyle !== 'curved'}
          onClick={() => s().updateSettings({ ...settings, wireStyle: settings.wireStyle === 'curved' ? 'grid' : 'curved' })}
          title="Grid wires run straight with square corners. Turn this off for loose, curved jumpers."
        >
          Grid wires {settings.wireStyle !== 'curved' ? 'on' : 'off'}
        </button>
      </div>
      <div className="tb-group">
        <span className="tb-label">New wires</span>
        <button
          className={`toggle${wireColor === 'auto' ? ' is-on' : ''}`}
          aria-pressed={wireColor === 'auto'}
          onClick={() => s().setWireColorMode('auto')}
          title="Color each wire by the type of pin it connects"
        >
          Auto
        </button>
        <Swatches palette={settings.palette} value={wireColor === 'auto' ? undefined : wireColor} onPick={(c) => s().setWireColorMode(c)} />
      </div>
      <span className="tb-spacer" />
      <span className={`save-state is-${saveState}`} role="status">
        {saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving' : 'Could not save'}
      </span>
      <button onClick={() => s().setSettingsOpen(true)}>Pin colors</button>
    </header>
  )
}
