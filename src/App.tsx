import { useState } from 'react'
import './App.css'
import { Bracket } from './components/Bracket'
import { GroupStage } from './components/GroupStage'
import { defaultTournamentId, tournaments } from './data'
import { totalMatches } from './logic/spoilers'
import { useProgress } from './state/progress'

type Tab = 'groups' | 'bracket'

function App() {
  const t = tournaments[defaultTournamentId]
  const progress = useProgress(t)
  const [tab, setTab] = useState<Tab>('groups')

  const marked = Object.keys(progress.marks).length
  const total = totalMatches(t)

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <h1>⚽ No Spoiler Soccer</h1>
          <span className="tournament-name">{t.name}</span>
        </div>
        <nav className="tabs">
          <button
            type="button"
            className={`tab ${tab === 'groups' ? 'active' : ''}`}
            onClick={() => setTab('groups')}
          >
            Groups
          </button>
          <button
            type="button"
            className={`tab ${tab === 'bracket' ? 'active' : ''}`}
            onClick={() => setTab('bracket')}
          >
            Bracket
          </button>
        </nav>
        <span className="progress-pill" title="Matches you've marked watched or skipped">
          {marked} / {total} caught up
        </span>
      </header>

      <main className="app-main">
        {tab === 'groups' ? <GroupStage t={t} progress={progress} /> : <Bracket t={t} progress={progress} />}
      </main>

      <footer className="app-footer">
        <span>Progress is saved in this browser only — no account, no tracking.</span>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            if (window.confirm('Hide every score again and start over?')) progress.reset()
          }}
        >
          Reset progress
        </button>
      </footer>
    </div>
  )
}

export default App
