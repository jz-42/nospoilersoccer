import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import './App.css'
import { analytics } from './analytics'
import { Bracket } from './components/Bracket'
import { ConfirmDialog, Onboarding } from './components/Dialogs'
import { FavoritesPanel } from './components/FavoritesPanel'
import { formatDate } from './components/format'
import { GroupStage } from './components/GroupStage'
import { Logo } from './components/Logo'
import { MatchModal } from './components/MatchModal'
import type { ModalTarget } from './components/MatchModal'
import { Rail } from './components/Rail'
import { SettingsMenu, type ArchiveEntry } from './components/SettingsMenu'
import { WatchLater } from './components/WatchLater'
import {
  archivedCompetitions,
  defaultSeasonIdAt,
  findSeason,
  pickerCompetitionsAt,
  resolveInitialSeason,
} from './data'
import type { Competition, Season } from './data'
import type { Tournament } from './data/types'
import {
  applyRuntimeHighlightState,
  fetchRuntimeHighlightState,
  type FetchedRuntimeHighlightState,
} from './data/highlight-state'
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
  tournamentMatchDates,
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
const HIGHLIGHT_STATE_BASE_URL = HOT_STATE_BASE_URL
  ? HOT_STATE_BASE_URL.replace(/\/api\/hot-state$/, '/api/highlights')
  : ''
const HIGHLIGHT_STATE_POLL_MS = 30 * 1000
const HIGHLIGHT_STATE_STALE_MS = 5 * 60 * 1000

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
 * Season picker — a menu, not a row of pills.
 *
 * Which competition you're in is a *setting*, not a navigation choice: people
 * pick once and stay. A row of pills spent the header's widest real estate
 * shouting four options at someone who wants one, and it could not grow. The
 * menu states the current competition in one line and keeps the rest one click
 * away, which is also the only shape that survives adding competitions.
 *
 * A competition with a single season collapses to one row under its own name;
 * one with several lists its seasons under a heading, so the menu never
 * mentions a season count that doesn't exist.
 *
 * Archived competitions are not listed — they live under Archive in the header
 * menu. While you are in one, the trigger says so with a tag, and the menu is
 * the way back to the live competitions.
 */
function SeasonPicker({
  seasonId,
  onSelect,
  competitions,
}: {
  seasonId: string
  onSelect: (id: string) => void
  competitions: Competition[]
}) {
  const current = findSeason(seasonId)
  const competition: Competition | undefined = current?.competition
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Dismissal is on the document so a click anywhere else — including on the
  // view tabs right next to it — closes the menu before it does its own job.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // Opening with the keyboard should land you *in* the menu, not behind it.
  useEffect(() => {
    if (!open) return
    // In an archived competition nothing here is active; start at the top.
    const menu = menuRef.current
    const item =
      menu?.querySelector<HTMLButtonElement>('.picker-item.is-active') ??
      menu?.querySelector<HTMLButtonElement>('.picker-item')
    item?.focus()
  }, [open])

  const choose = (id: string) => {
    onSelect(id)
    setOpen(false)
  }

  const multiSeason = (competition?.seasons.length ?? 0) > 1
  const label = competition?.name ?? 'Choose a competition'

  return (
    <div className={`season-picker ${open ? 'is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="picker-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="picker-trigger-label">{label}</span>
        {multiSeason && current && <span className="picker-trigger-season">{current.season.label}</span>}
        {competition?.archived && <span className="picker-trigger-tag">Archive</span>}
        <svg className="picker-chevron" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path
            d="M3 4.6 6 7.6l3-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="picker-menu" role="menu" aria-label="Competition" ref={menuRef}>
          {competitions.map((c) =>
            c.seasons.length === 1 ? (
              <PickerItem
                key={c.id}
                label={c.name}
                active={seasonId === c.seasons[0].id}
                onSelect={() => choose(c.seasons[0].id)}
              />
            ) : (
              <div className="picker-group" key={c.id}>
                <span className="picker-group-label">{c.name}</span>
                {c.seasons.map((s: Season) => (
                  <PickerItem
                    key={s.id}
                    label={s.label}
                    active={seasonId === s.id}
                    onSelect={() => choose(s.id)}
                  />
                ))}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  )
}

function PickerItem({
  label,
  active,
  onSelect,
}: {
  label: string
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      className={`picker-item ${active ? 'is-active' : ''}`}
      onClick={onSelect}
    >
      <span className="picker-item-label">{label}</span>
      <svg className="picker-check" viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
        <path
          d="M2.6 7.4 5.4 10.2l6-6.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

const trophyUrl = new URL('./assets/world-cup-trophy.png', import.meta.url).href

/** 'Jun 11 – Jul 19': the span an archived season ran over. */
function archiveDates(t: Tournament): string | undefined {
  const dates = tournamentMatchDates(t)
  const first = dates[0]
  const last = dates.at(-1)
  return first && last ? `${formatDate(first)} – ${formatDate(last)}` : undefined
}

/**
 * Owns which season is selected and resolving it to a tournament. Club seasons
 * are lazy chunks, so this is the one place that can be without a tournament;
 * everything below it is guaranteed a loaded one, which keeps every
 * tournament-dependent hook unconditional.
 */
function App() {
  const [now] = useState(() => new Date())
  const pickerCompetitions = useMemo(() => pickerCompetitionsAt(now), [now])
  const [seasonId, setSeasonId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(TOURNAMENT_KEY)
      return resolveInitialSeason(saved, now)
    } catch {
      return defaultSeasonIdAt(now)
    }
  })
  const found = findSeason(seasonId) ?? findSeason(defaultSeasonIdAt(now))
  const season = found?.season
  // Only the World Cup gets a completion meter (see `showProgress` below).
  const showProgress = found?.competition.id === 'wc'
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

  const picker = (
    <SeasonPicker
      seasonId={seasonId}
      onSelect={selectSeason}
      competitions={pickerCompetitions}
    />
  )
  const archive: ArchiveEntry[] = archivedCompetitions.flatMap((c) =>
    c.seasons.map((s) => ({
      id: s.id,
      label: c.name,
      season: s.label,
      dates: s.tournament ? archiveDates(s.tournament) : undefined,
      art: c.id === 'wc' ? trophyUrl : undefined,
      active: s.id === seasonId,
      onSelect: () => selectSeason(s.id),
    })),
  )

  if (!tournament) {
    return (
      <div className="app">
        <header className="app-header">
          <div className="app-brand">
            <Logo size={32} />
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
    <TournamentApp
      key={seasonId}
      seasonId={seasonId}
      baseTournament={tournament}
      picker={picker}
      archive={archive}
      showProgress={showProgress}
    />
  )
}

function TournamentApp({
  seasonId,
  baseTournament,
  picker,
  archive,
  showProgress,
}: {
  seasonId: string
  baseTournament: Tournament
  picker: ReactNode
  archive: ArchiveEntry[]
  /**
   * The meter counts matches you've revealed out of the whole competition.
   * That is a real, finishable goal for a 104-match World Cup and a
   * meaningless one for a 380-match league season nobody sets out to clear —
   * there it was just a number ticking in the corner. So: World Cup only.
   */
  showProgress: boolean
}) {
  const [hotState, setHotState] = useState<FetchedTournamentHotState | null>(null)
  const [highlightState, setHighlightState] = useState<FetchedRuntimeHighlightState | null>(null)
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

  useEffect(() => {
    if (!HIGHLIGHT_STATE_BASE_URL) return
    let cancelled = false
    let current: FetchedRuntimeHighlightState | null = null
    let etag: string | null = null
    const url = `${HIGHLIGHT_STATE_BASE_URL}/${seasonId}`

    const loadHighlightState = async () => {
      const result = await fetchRuntimeHighlightState(
        url,
        current,
        etag,
        Date.now(),
        HIGHLIGHT_STATE_STALE_MS,
      )
      current = result.state
      etag = result.etag
      if (!cancelled) setHighlightState(result.state)
    }

    void loadHighlightState()
    const pollId = window.setInterval(() => {
      void loadHighlightState()
    }, HIGHLIGHT_STATE_POLL_MS)

    return () => {
      cancelled = true
      window.clearInterval(pollId)
    }
  }, [seasonId])
  const t = useMemo(
    () => applyRuntimeHighlightState(applyTournamentHotState(baseTournament, hotState), highlightState),
    [baseTournament, hotState, highlightState],
  )
  const progress = useProgress(t)
  const [tab, setTab] = useState<View>(defaultTournamentView)
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
          <Logo size={32} />
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
              {v === 'day' ? dayTabLabel() : v === 'groups' ? tableTabLabel(t) : 'Knockouts'}
            </button>
          ))}
        </nav>

        {/* Everything from here right is the utility cluster, pushed to the far
            edge as a group so removing the meter can't reflow the rest. Its
            order is a ramp from the tournament to the app: how far along you
            are, the one thing to do next, your saved matches, your teams, and
            the menu for everything that isn't football. */}
        <div className="app-header-end">
          {showProgress && (
            <div className="app-progress" title="Matches you've revealed">
              <span className="app-progress-num">
                {marked}
                <span className="app-progress-total">/{total}</span>
              </span>
              <div className="app-progress-bar">
                <div className="app-progress-fill" style={{ width: `${(marked / total) * 100}%` }} />
              </div>
            </div>
          )}

          {catchUpIds.length > 0 && (
            <button
              type="button"
              className="btn-ghost btn-small btn-catch-up"
              onClick={() => setConfirmCatchUp(true)}
            >
              Catch up
            </button>
          )}

          <WatchLater t={t} progress={progress} onOpen={setModal} covered={modal !== null} />

          <FavoritesPanel t={t} progress={progress} />

          <SettingsMenu
            archive={archive}
            onHowThisWorks={() => setShowOnboarding(true)}
            onReset={() => setConfirmReset(true)}
          />
        </div>
      </header>

      <main className={`app-main ${view === 'bracket' ? 'app-main-wide' : ''}`}>
        {view === 'day' && <Rail t={t} progress={progress} onOpen={setModal} />}
        {view === 'groups' && <GroupStage t={t} progress={progress} onOpen={setModal} />}
        {view === 'bracket' && <Bracket t={t} progress={progress} onOpen={setModal} />}
      </main>


      {modal && <MatchModal t={t} target={modal} progress={progress} onClose={() => setModal(null)} />}
      {confirmReset && (
        <ConfirmDialog
          title="Start over?"
          body={`Every revealed score in ${t.name} will be hidden again. Your watch-later queue and favorite teams stay put.`}
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
