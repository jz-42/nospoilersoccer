import { useState } from 'react'
import './App.css'
import { Bracket } from './components/Bracket'
import { ConfirmDialog, Onboarding } from './components/Dialogs'
import { FavoritesPanel } from './components/FavoritesPanel'
import { GroupStage } from './components/GroupStage'
import { Logo } from './components/Logo'
import { MatchModal } from './components/MatchModal'
import type { ModalTarget } from './components/MatchModal'
import { Rail } from './components/Rail'
import { defaultTournamentId, tournaments } from './data'
import { totalMatches } from './logic/spoilers'
import { useProgress } from './state/progress'

type Tab = 'day' | 'groups' | 'bracket'

const TOURNAMENT_KEY = 'nss-tournament'
const ONBOARDED_KEY = 'nss-onboarded'

function App() {
  const [tournamentId, setTournamentId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(TOURNAMENT_KEY)
      return saved && tournaments[saved] ? saved : defaultTournamentId
    } catch {
      return defaultTournamentId
    }
  })
  const t = tournaments[tournamentId]
  const progress = useProgress(t)
  const [tab, setTab] = useState<Tab>('day')
  const [modal, setModal] = useState<ModalTarget | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    try {
      return localStorage.getItem(ONBOARDED_KEY) === null
    } catch {
      return false
    }
  })

  const selectTournament = (id: string) => {
    setTournamentId(id)
    setModal(null)
    try {
      localStorage.setItem(TOURNAMENT_KEY, id)
    } catch {
      // Private browsing: selection just won't persist.
    }
  }

  const dismissOnboarding = () => {
    setShowOnboarding(false)
    try {
      localStorage.setItem(ONBOARDED_KEY, '1')
    } catch {
      // Fine — it'll show again next visit.
    }
  }

  const marked = Object.keys(progress.marks).length
  const total = totalMatches(t)

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">
          <Logo size={26} />
          <span className="app-name">No Spoiler Soccer</span>
          <nav className="seg seg-mini" aria-label="Tournament">
            {Object.values(tournaments).map((tt) => (
              <button
                key={tt.id}
                type="button"
                className={`seg-btn ${tournamentId === tt.id ? 'active' : ''}`}
                onClick={() => selectTournament(tt.id)}
              >
                {tt.year}
              </button>
            ))}
          </nav>
        </div>

        <nav className="seg" aria-label="View">
          <button
            type="button"
            className={`seg-btn ${tab === 'day' ? 'active' : ''}`}
            onClick={() => setTab('day')}
          >
            Today
          </button>
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
            {marked}
            <span className="app-progress-total">/{total}</span>
          </span>
          <div className="app-progress-bar">
            <div className="app-progress-fill" style={{ width: `${(marked / total) * 100}%` }} />
          </div>
        </div>

        <FavoritesPanel t={t} progress={progress} />

        <button
          type="button"
          className="help-btn"
          aria-label="How this works"
          title="How this works"
          onClick={() => setShowOnboarding(true)}
        >
          ?
        </button>
      </header>

      <main className={`app-main ${tab === 'bracket' ? 'app-main-wide' : ''}`}>
        {tab === 'day' && <Rail t={t} progress={progress} onOpen={setModal} />}
        {tab === 'groups' && <GroupStage t={t} progress={progress} onOpen={setModal} />}
        {tab === 'bracket' && <Bracket t={t} progress={progress} onOpen={setModal} />}
      </main>

      <footer className="app-footer">
        {tab === 'bracket' && (
          <div className="ko-legend" aria-hidden="true">
            <span className="lg-head">Key</span>
            <span className="lg-row">
              <i className="lg-dot lg-green" />
              through
            </span>
            <span className="lg-row">
              <i className="lg-dot lg-gold" />
              maybe
            </span>
            <span className="lg-tip">click a name to keep its path on</span>
          </div>
        )}
        <button type="button" className="btn-ghost btn-danger btn-small" onClick={() => setConfirmReset(true)}>
          Reset progress
        </button>
      </footer>

      {modal && <MatchModal t={t} target={modal} progress={progress} onClose={() => setModal(null)} />}
      {confirmReset && (
        <ConfirmDialog
          title="Start over?"
          body={`Every revealed score in ${t.name} will be hidden again.`}
          confirmLabel="Hide everything"
          danger
          onConfirm={() => {
            progress.reset()
            setConfirmReset(false)
          }}
          onCancel={() => setConfirmReset(false)}
        />
      )}
      {showOnboarding && <Onboarding onClose={dismissOnboarding} />}
    </div>
  )
}

export default App
