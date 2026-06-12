/**
 * User progress, persisted in localStorage so it survives tab closes,
 * restarts, and — crucially — site deploys.
 *
 * The stored blob carries a schema version. Any future change to its shape
 * must bump CURRENT_VERSION and add a migration step in `migrate`, never
 * change the shape silently: old saves must keep loading forever.
 *
 *   v1 → v2: tournaments gained `revealed` (jump-ahead matchups)
 *   v2 → v3: tournaments gained `pins`, `favorites`, `favAuto`
 */
import { useCallback, useMemo, useState } from 'react'
import type { TeamId, Tournament } from '../data/types'
import type { Mark, Marks } from '../logic/spoilers'
import { withUnmarked } from '../logic/spoilers'

const STORAGE_KEY = 'nss-progress'
const CURRENT_VERSION = 3

interface TournamentProgress {
  marks: Marks
  /** Knockout matches whose teams the user force-revealed ("jump ahead"). */
  revealed: string[]
  /** Manually highlighted matches — independent of favorites. */
  pins: string[]
  /** Favorite teams, in the user's chosen order. */
  favorites: TeamId[]
  /** Auto-highlight matches involving favorite teams. */
  favAuto: boolean
}

interface ProgressState {
  version: number
  tournaments: Record<string, TournamentProgress>
}

function emptyState(): ProgressState {
  return { version: CURRENT_VERSION, tournaments: {} }
}

function migrate(raw: unknown): ProgressState {
  if (typeof raw !== 'object' || raw === null) return emptyState()
  const state = raw as ProgressState
  if (typeof state.version !== 'number' || typeof state.tournaments !== 'object') {
    return emptyState()
  }
  if (state.version === 1) {
    for (const tp of Object.values(state.tournaments)) tp.revealed ??= []
    state.version = 2
  }
  if (state.version === 2) {
    for (const tp of Object.values(state.tournaments)) {
      tp.pins ??= []
      tp.favorites ??= []
      tp.favAuto ??= true
    }
    state.version = 3
  }
  if (state.version > CURRENT_VERSION) {
    // Saved by a newer build (e.g. another tab). Keep what we understand.
    return { ...state, version: CURRENT_VERSION }
  }
  return state
}

function load(): ProgressState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return emptyState()
    return migrate(JSON.parse(raw))
  } catch {
    return emptyState()
  }
}

function save(state: ProgressState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage full or blocked (private browsing): the app still works,
    // progress just won't survive the session.
  }
}

const EMPTY: TournamentProgress = { marks: {}, revealed: [], pins: [], favorites: [], favAuto: true }

export interface Progress {
  marks: Marks
  revealed: ReadonlySet<string>
  pins: ReadonlySet<string>
  favorites: readonly TeamId[]
  favAuto: boolean
  setMark: (matchId: string, mark: Mark) => void
  unmark: (matchId: string) => void
  reveal: (matchId: string) => void
  togglePin: (matchId: string) => void
  toggleFavorite: (teamId: TeamId) => void
  moveFavorite: (teamId: TeamId, dir: -1 | 1) => void
  setFavAuto: (on: boolean) => void
  reset: () => void
}

export function useProgress(t: Tournament): Progress {
  const [state, setState] = useState<ProgressState>(load)

  const update = useCallback(
    (updater: (tp: TournamentProgress) => TournamentProgress) => {
      setState((prev) => {
        const tp = updater({ ...EMPTY, ...prev.tournaments[t.id] })
        const next: ProgressState = {
          ...prev,
          tournaments: { ...prev.tournaments, [t.id]: tp },
        }
        save(next)
        return next
      })
    },
    [t.id],
  )

  const setMark = useCallback(
    (matchId: string, mark: Mark) =>
      update((tp) => ({ ...tp, marks: { ...tp.marks, [matchId]: mark } })),
    [update],
  )
  const unmark = useCallback(
    (matchId: string) =>
      update((tp) => ({ ...tp, marks: withUnmarked(t, tp.marks, matchId, new Set(tp.revealed)) })),
    [update, t],
  )
  const reveal = useCallback(
    (matchId: string) =>
      update((tp) =>
        tp.revealed.includes(matchId) ? tp : { ...tp, revealed: [...tp.revealed, matchId] },
      ),
    [update],
  )
  const togglePin = useCallback(
    (matchId: string) =>
      update((tp) => ({
        ...tp,
        pins: tp.pins.includes(matchId)
          ? tp.pins.filter((x) => x !== matchId)
          : [...tp.pins, matchId],
      })),
    [update],
  )
  const toggleFavorite = useCallback(
    (teamId: TeamId) =>
      update((tp) => ({
        ...tp,
        favorites: tp.favorites.includes(teamId)
          ? tp.favorites.filter((x) => x !== teamId)
          : [...tp.favorites, teamId],
      })),
    [update],
  )
  const moveFavorite = useCallback(
    (teamId: TeamId, dir: -1 | 1) =>
      update((tp) => {
        const i = tp.favorites.indexOf(teamId)
        const j = i + dir
        if (i < 0 || j < 0 || j >= tp.favorites.length) return tp
        const favorites = [...tp.favorites]
        ;[favorites[i], favorites[j]] = [favorites[j], favorites[i]]
        return { ...tp, favorites }
      }),
    [update],
  )
  const setFavAuto = useCallback((on: boolean) => update((tp) => ({ ...tp, favAuto: on })), [update])
  const reset = useCallback(
    () => update((tp) => ({ ...EMPTY, favorites: tp.favorites, favAuto: tp.favAuto })),
    [update],
  )

  const tp = { ...EMPTY, ...state.tournaments[t.id] }
  const revealed = useMemo(() => new Set(tp.revealed), [tp.revealed])
  const pins = useMemo(() => new Set(tp.pins), [tp.pins])

  return {
    marks: tp.marks,
    revealed,
    pins,
    favorites: tp.favorites,
    favAuto: tp.favAuto,
    setMark,
    unmark,
    reveal,
    togglePin,
    toggleFavorite,
    moveFavorite,
    setFavAuto,
    reset,
  }
}
