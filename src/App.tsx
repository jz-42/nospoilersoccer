import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { analytics } from './analytics'
import { Bracket } from './components/Bracket'
import { ConfirmDialog, Onboarding } from './components/Dialogs'
import { FavoritesPanel } from './components/FavoritesPanel'
import { GroupStage } from './components/GroupStage'
import { Logo } from './components/Logo'
import { MatchModal } from './components/MatchModal'
import type { ModalTarget } from './components/MatchModal'
import { Rail } from './components/Rail'
import { defaultTournamentId, tournaments } from './data'
import {
  applyHotStatePollFailure,
  applyTournamentHotState,
  parseTournamentHotState,
  type FetchedTournamentHotState,
} from './data/hot-state'
import { catchUpMatchIds, isLive, totalMatches } from './logic/spoilers'
import { useProgress } from './state/progress'

type Tab = 'day' | 'groups' | 'bracket'

const TOURNAMENT_KEY = 'nss-tournament'
const ONBOARDED_KEY = 'nss-onboarded'
const HOT_STATE_URL =
  import.meta.env.VITE_HOT_STATE_URL ??
  (import.meta.env.PROD
    ? 'https://nospoilersoccer-scheduler.jerryzhan42.workers.dev/api/hot-state/wc2026'
    : '')
const HOT_STATE_POLL_MS = 5 * 60 * 1000
const HOT_STATE_STALE_MS = 15 * 60 * 1000

function App() {
  const [tournamentId, setTournamentId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(TOURNAMENT_KEY)
      return saved && tournaments[saved] ? saved : defaultTournamentId
    } catch {
      return defaultTournamentId
    }
  })
  const baseTournament = tournaments[tournamentId]
  const [hotState, setHotState] = useState<FetchedTournamentHotState | null>(null)
  useEffect(() => {
    let cancelled = false
    if (tournamentId !== 'wc2026' || !HOT_STATE_URL) {
      setHotState(null)
      return
    }

    const loadHotState = async () => {
      try {
        const response = await fetch(HOT_STATE_URL, {
          headers: { Accept: 'application/json' },
        })
        if (!response.ok) {
          setHotState((current) => applyHotStatePollFailure(current, Date.now(), HOT_STATE_STALE_MS))
          return
        }
        const parsed = parseTournamentHotState(await response.json())
        if (!parsed) {
          setHotState((current) => applyHotStatePollFailure(current, Date.now(), HOT_STATE_STALE_MS))
          return
        }
        if (cancelled) return
        setHotState({
          ...parsed,
          fetchedAt: Date.now(),
        })
      } catch {
        setHotState((current) => applyHotStatePollFailure(current, Date.now(), HOT_STATE_STALE_MS))
      }
    }

    setHotState(null)
    void loadHotState()
    const pollId = window.setInterval(() => {
      void loadHotState()
    }, HOT_STATE_POLL_MS)

    return () => {
      cancelled = true
      window.clearInterval(pollId)
    }
  }, [tournamentId])
  const t = useMemo(
    () => applyTournamentHotState(baseTournament, hotState),
    [baseTournament, hotState],
  )
  const progress = useProgress(t)
  const [tab, setTab] = useState<Tab>('day')
  // A finished tournament has no "today" — there the day tab is hidden and the
  // group stage / knockout views (with their embedded videos) are the way in.
  const live = isLive(t)
  const view: Tab = live || tab !== 'day' ? tab : 'groups'
  useEffect(() => {
    analytics.viewChanged({ view })
  }, [view])
  const [modal, setModal] = useState<ModalTarget | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmCatchUp, setConfirmCatchUp] = useState(false)
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
  const catchUpIds = useMemo(
    () => catchUpMatchIds(t, progress.marks, progress.revealed),
    [t, progress.marks, progress.revealed],
  )

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
          {live && (
            <button
              type="button"
              className={`seg-btn ${view === 'day' ? 'active' : ''}`}
              onClick={() => setTab('day')}
            >
              Today
            </button>
          )}
          <button
            type="button"
            className={`seg-btn ${view === 'groups' ? 'active' : ''}`}
            onClick={() => setTab('groups')}
          >
            Group stage
          </button>
          <button
            type="button"
            className={`seg-btn ${view === 'bracket' ? 'active' : ''}`}
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

        {catchUpIds.length > 0 && (
          <button
            type="button"
            className="btn-ghost btn-small btn-catch-up"
            onClick={() => setConfirmCatchUp(true)}
          >
            Catch up
          </button>
        )}

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

      <main className={`app-main ${view === 'bracket' ? 'app-main-wide' : ''}`}>
        {view === 'day' && <Rail t={t} progress={progress} onOpen={setModal} />}
        {view === 'groups' && <GroupStage t={t} progress={progress} onOpen={setModal} />}
        {view === 'bracket' && <Bracket t={t} progress={progress} onOpen={setModal} />}
      </main>

      <footer className="app-footer">
        <button type="button" className="btn-ghost btn-danger btn-small" onClick={() => setConfirmReset(true)}>
          Reset progress
        </button>
      </footer>

      {modal && <MatchModal t={t} target={modal} progress={progress} onClose={() => setModal(null)} />}
      {confirmReset && (
        <ConfirmDialog
          title="Start over?"
          body={`Every revealed score in ${t.name} will be hidden again. Saved matches and favorite teams stay put.`}
          confirmLabel="Hide everything"
          danger
          onConfirm={() => {
            progress.reset()
            setConfirmReset(false)
          }}
          onCancel={() => setConfirmReset(false)}
        />
      )}
      {confirmCatchUp && (
        <ConfirmDialog
          title="Catch up?"
          body={`This will reveal ${catchUpIds.length} match ${catchUpIds.length === 1 ? 'score' : 'scores'} through yesterday. Today's matches stay hidden.`}
          confirmLabel="Reveal all"
          onConfirm={() => {
            const ids = catchUpMatchIds(t, progress.marks, progress.revealed)
            progress.catchUp(ids)
            analytics.catchUp({ tournament_year: t.year, match_count: ids.length })
            setConfirmCatchUp(false)
          }}
          onCancel={() => setConfirmCatchUp(false)}
        />
      )}
      {showOnboarding && <Onboarding onClose={dismissOnboarding} />}
    </div>
  )
}

export default App
