import { useEffect } from 'react'
import { useStore } from './store/store'
import { Desk } from './ui/Desk'
import { Inspector } from './ui/Inspector'
import { LibraryPanel } from './ui/LibraryPanel'
import { PartSettingsDialog } from './ui/PartSettingsDialog'
import { SettingsDialog } from './ui/SettingsDialog'
import { Toolbar } from './ui/Toolbar'
import { WireList } from './ui/WireList'

export default function App() {
  const loaded = useStore((s) => s.loaded)
  const loadError = useStore((s) => s.loadError)
  const partSettingsId = useStore((s) => s.partSettingsId)
  const settingsOpen = useStore((s) => s.settingsOpen)

  useEffect(() => {
    void useStore.getState().load()
    const flush = () => void useStore.getState().flushSave()
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [])

  if (loadError) {
    return (
      <div className="splash">
        <h1>Wirebench could not load its files</h1>
        <p>{loadError}</p>
        <p>Start it with "npm run dev" in the wirebench folder, then reload this page.</p>
        <button onClick={() => void useStore.getState().load()}>Try again</button>
      </div>
    )
  }
  if (!loaded) return <div className="splash">Loading the bench</div>

  return (
    <div className="app">
      <Toolbar />
      <main className="main">
        <LibraryPanel />
        <Desk />
        <aside className="panel side">
          <Inspector />
          <WireList />
        </aside>
      </main>
      {settingsOpen && <SettingsDialog />}
      {partSettingsId && <PartSettingsDialog partId={partSettingsId} />}
    </div>
  )
}
