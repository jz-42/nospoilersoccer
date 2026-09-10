import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
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
import { competitions, defaultSeasonId, findSeason } from './data'
import type { Competition, Season } from './data'
import type { Tournament } from './data/types'
import {
  applyHotStatePollFailure,
  applyTournamentHotState,
  parseTournamentHotState,
  type FetchedTournamentHotState,
} from './data/hot-state'
import { catchUpMatchIds, totalMatches } from './logic/spoilers'
import {
  availableViews,
  dayTabLabel,
  defaultTournamentView,
  tableTabLabel,
  type View,
} from './navigation'
import { useProgress } from './state/progress'

const TOURNAMENT_KEY = 'nss-tournament'
const ONBOARDED_KEY = 'nss-onboarded'
const HOT_STATE_BASE_URL =
  import.meta.env.VITE_HOT_STATE_BASE_URL ??
  (import.meta.env.PROD
    ? 'https://nospoilersoccer-scheduler.jerryzhan42.workers.dev/api/hot-state'
    : '')
const HOT_STATE_POLL_MS = 5 * 60 * 1000
const HOT_STATE_STALE_MS = 15 * 60 * 1000

/**
 * Hot state is per season. `VITE_HOT_STATE_URL` stays honoured for wc2026 so an
 * existing deploy override keeps pointing exactly where it did before; every
 * other season derives its path from the base. This mirrors the same override
 * rule in the Worker.
 */
function hotStateUrl(seasonId: string): string {
  if (seasonId === 'wc2026' && import.meta.env.VITE_HOT_STATE_URL) {
    return import.meta.env.VITE_HOT_STATE_URL
  }
  return HOT_STATE_BASE_URL ? `${HOT_STATE_BASE_URL}/${seasonId}` : ''
}

/**
 * Season picker. Competition first, then season within it — most people choose
 * once and never come back, so the competition list is the primary control and
 * the season row only appears when that competition actually has more than one.
 */
function SeasonPicker({
  seasonId,
  onSelect,
}: {
  seasonId: string
  onSelect: (id: string) => void
}) {
  const current = findSeason(seasonId)
  const competition: Competition | undefined = current?.competition
  return (
    <div className="season-picker">
      <nav className="seg seg-mini" aria-label="Competition">
        {competitions.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`seg-btn ${competition?.id === c.id ? 'active' : ''}`}
            onClick={() => onSelect(c.seasons[0].id)}
          >
            {c.shortName}
          </button>
        ))}
      </nav>
      {competition && competition.seasons.length > 1 && (
        <nav className="seg seg-mini" aria-label="Season">
          {competition.seasons.map((s: Season) => (
            <button
              key={s.id}
              type="button"
              className={`seg-btn ${seasonId === s.id ? 'active' : ''}`}
              onClick={() => onSelect(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}

/**
 * Owns which season is selected and resolving it to a tournament. Club seasons
 * are lazy chunks, so this is the one place that can be without a tournament;
 * everything below it is guaranteed a loaded one, which keeps every
 * tournament-dependent hook unconditional.
 */
function App() {
  const [seasonId, setSeasonId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(TOURNAMENT_KEY)
      return saved && findSeason(saved) ? saved : defaultSeasonId
    } catch {
      return defaultSeasonId
    }
  })
  const season = (findSeason(seasonId) ?? findSeason(defaultSeasonId))?.season
  // Tagged with the season it belongs to, so a slow chunk that resolves after
  // the user has already moved on is ignored rather than rendered.
  const [lazy, setLazy] = useState<{ id: string; tournament: Tournament } | null>(null)
  const tournament = season?.tournament ?? (lazy?.id === season?.id ? lazy?.tournament ?? null : null)

  useEffect(() => {
    if (!season?.load) return
    let cancelled = false
    void season.load().then((loaded) => {
      if (!cancelled) setLazy({ id: season.id, tournament: loaded })
    })
    return () => {
      cancelled = true
    }
  }, [season])

  const selectSeason = (id: string) => {
    setSeasonId(id)
    try {
      localStorage.setItem(TOURNAMENT_KEY, id)
    } catch {
      // Private browsing: selection just won't persist.
    }
  }

  const picker = <SeasonPicker seasonId={seasonId} onSelect={selectSeason} />

  if (!tournament) {
    return (
      <div className="app">
        <header className="app-header">
          <div className="app-brand">
            <Logo size={26} />
            <span className="app-name">No Spoiler Soccer</span>
            {picker}
          </div>
        </header>
        <main className="app-main" />
      </div>
    )
  }

  // Keyed by season so switching competitions remounts rather than carrying
  // one competition's open modal or scroll position into another.
  return (
    <TournamentApp key={seasonId} seasonId={seasonId} baseTournament={tournament} picker={picker} />
  )
}

function TournamentApp({
  seasonId,
  baseTournament,
  picker,
}: {
  seasonId: string
  baseTournament: Tournament
  picker: ReactNode
}) {
  const [hotState, setHotState] = useState<FetchedTournamentHotState | null>(null)
  // No reset on season change: `seasonId` is also this component's key, so a
  // different season remounts with a fresh null rather than clearing in place.
  useEffect(() => {
    let cancelled = false
    const url = hotStateUrl(seasonId)
    if (!url) return

    const loadHotState = async () => {
      try {
        const response = await fetch(url, {
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

    void loadHotState()
    const pollId = window.setInterval(() => {
      void loadHotState()
    }, HOT_STATE_POLL_MS)

    return () => {
      cancelled = true
      window.clearInterval(pollId)
    }
  }, [seasonId])
  const t = useMemo(
    () => applyTournamentHotState(baseTournament, hotState),
    [baseTournament, hotState],
  )
  const progress = useProgress(t)
  const [tab, setTab] = useState<View>(() => defaultTournamentView(baseTournament))
  const view = tab
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
          {picker}
        </div>

        <nav className="seg" aria-label="View">
          {availableViews(t).map((v) => (
            <button
              key={v}
              type="button"
              className={`seg-btn ${view === v ? 'active' : ''}`}
              onClick={() => setTab(v)}
            >
              {v === 'day' ? dayTabLabel(t) : v === 'groups' ? tableTabLabel(t) : 'Knockouts'}
            </button>
          ))}
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
