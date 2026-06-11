import { useState } from 'react'
import './App.css'
import { Bracket } from './components/Bracket'
import { GroupStage } from './components/GroupStage'
import { MatchModal } from './components/MatchModal'
import type { ModalTarget } from './components/MatchModal'
import { defaultTournamentId, tournaments } from './data'
import { totalMatches } from './logic/spoilers'
import { useProgress } from './state/progress'

type Tab = 'groups' | 'bracket'

function BallMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="#f2f5f9" />
      <polygon points="16,11 20.8,14.5 19,20 13,20 11.2,14.5" fill="#0c0f14" />
      <g stroke="#0c0f14" strokeWidth="1.8" strokeLinecap="round">
        <line x1="16" y1="11" x2="16" y2="2.5" />
        <line x1="20.8" y1="14.5" x2="28.8" y2="11.9" />
        <line x1="19" y1="20" x2="23.9" y2="26.8" />
        <line x1="13" y1="20" x2="8.1" y2="26.8" />
        <line x1="11.2" y1="14.5" x2="3.2" y2="11.9" />
      </g>
    </svg>
  )
}

function App() {
  const t = tournaments[defaultTournamentId]
  const progress = useProgress(t)
  const [tab, setTab] = useState<Tab>('groups')
  const [modal, setModal] = useState<ModalTarget | null>(null)

  const marked = Object.keys(progress.marks).length
  const total = totalMatches(t)

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">
          <BallMark />
          <span className="app-name">No Spoiler Soccer</span>
          <span className="app-tournament">{t.name}</span>
        </div>

        <nav className="seg" aria-label="View">
          <button
            type="button"
            className={`seg-btn ${tab === 'groups' ? 'active' : ''}`}
            onClick={() => setTab('groups')}
          >
            Group stage
          </button>
          <button
            type="button"
            className={`seg-btn ${tab === 'bracket' ? 'active' : ''}`}
            onClick={() => setTab('bracket')}
          >
            Knockouts
          </button>
        </nav>

        <div className="app-progress" title="Matches you've revealed">
          <span className="app-progress-num">
            {marked}<span className="app-progress-total">/{total}</span>
          </span>
          <div className="app-progress-bar">
            <div className="app-progress-fill" style={{ width: `${(marked / total) * 100}%` }} />
          </div>
        </div>
      </header>

      <main className="app-main">
        {tab === 'groups' ? (
          <GroupStage t={t} progress={progress} onOpen={setModal} />
        ) : (
          <Bracket t={t} progress={progress} onOpen={setModal} />
        )}
      </main>

      <footer className="app-footer">
        <span>Progress is saved in this browser only — no account, no tracking.</span>
        <button
          type="button"
          className="btn-ghost btn-danger"
          onClick={() => {
            if (window.confirm('Hide every score again and start over?')) progress.reset()
          }}
        >
          Reset progress
        </button>
      </footer>

      {modal && <MatchModal t={t} target={modal} progress={progress} onClose={() => setModal(null)} />}
    </div>
  )
}

export default App
