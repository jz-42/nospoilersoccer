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
 *   v3 → v4: `favorites` and `favAuto` moved up out of the tournaments and
 *            became global, and `spotlight` joined them. A team you follow is
 *            the same team in every competition it plays in — club ids are
 *            shared across competitions by design (see data/club/clubs.ts).
 */
import { useCallback, useMemo, useState } from 'react'
import type { TeamId, Tournament } from '../data/types'
import type { Mark, Marks } from '../logic/spoilers'
import { withUnmarked } from '../logic/spoilers'
import {
  emptyTournamentProgress,
  resetTournamentProgressForViewing,
  type TournamentProgress,
} from './reset'

const STORAGE_KEY = 'nss-progress'
const CURRENT_VERSION = 4

interface ProgressState {
  version: number
  tournaments: Record<string, TournamentProgress>
  /** Followed teams, across every competition, in the order you arranged them. */
  favorites: TeamId[]
  /** Decorate matches your teams play in. */
  favAuto: boolean
  /** On a day your teams play, let every other match step back. */
  spotlight: boolean
}

/** A tournament entry as saved by v3, before favorites went global. */
type V3TournamentProgress = TournamentProgress & { favorites?: TeamId[]; favAuto?: boolean }

function emptyState(): ProgressState {
  return { version: CURRENT_VERSION, tournaments: {}, favorites: [], favAuto: true, spotlight: false }
}

export function migrate(raw: unknown): ProgressState {
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
    for (const tp of Object.values(state.tournaments) as V3TournamentProgress[]) {
      tp.pins ??= []
      tp.favorites ??= []
      tp.favAuto ??= true
    }
    state.version = 3
  }
  if (state.version === 3) {
    // Each competition kept its own list. Merge them in the order they were
    // saved, so Arsenal followed in the Premier League is now followed in the
    // Champions League too. Highlighting stays on unless every competition
    // you followed anyone in had it switched off.
    const favorites: TeamId[] = []
    const withFavorites: V3TournamentProgress[] = []
    for (const tp of Object.values(state.tournaments) as V3TournamentProgress[]) {
      if (tp.favorites && tp.favorites.length > 0) withFavorites.push(tp)
      for (const id of tp.favorites ?? []) if (!favorites.includes(id)) favorites.push(id)
    }
    state.favorites = favorites
    state.favAuto = withFavorites.length === 0 || withFavorites.some((tp) => tp.favAuto !== false)
    state.spotlight = false
    for (const tp of Object.values(state.tournaments) as V3TournamentProgress[]) {
      delete tp.favorites
      delete tp.favAuto
    }
    state.version = 4
  }
  // Saved by a newer build (e.g. another tab): keep what we understand, and
  // never let a missing field crash a render.
  state.favorites = Array.isArray(state.favorites) ? state.favorites : []
  state.favAuto = typeof state.favAuto === 'boolean' ? state.favAuto : true
  state.spotlight = typeof state.spotlight === 'boolean' ? state.spotlight : false
  if (state.version > CURRENT_VERSION) return { ...state, version: CURRENT_VERSION }
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

const EMPTY = emptyTournamentProgress()

export interface Progress {
  marks: Marks
  revealed: ReadonlySet<string>
  pins: ReadonlySet<string>
  /** The saved matches in queue order — what the watch-later grid renders. */
  pinOrder: readonly string[]
  /** Global: the same list in every competition. Test with `includes`. */
  favorites: readonly TeamId[]
  favAuto: boolean
  spotlight: boolean
  setMark: (matchId: string, mark: Mark) => void
  unmark: (matchId: string) => void
  reveal: (matchId: string) => void
  togglePin: (matchId: string) => void
  /** Replace the whole queue: reorder and drop in one write. */
  setPinOrder: (matchIds: readonly string[]) => void
  toggleFavorite: (teamId: TeamId) => void
  setFavorites: (order: readonly TeamId[]) => void
  setFavAuto: (on: boolean) => void
  setSpotlight: (on: boolean) => void
  catchUp: (matchIds: string[]) => void
  reset: () => void
}

export function useProgress(t: Tournament): Progress {
  const [state, setState] = useState<ProgressState>(load)

  const updateState = useCallback((updater: (prev: ProgressState) => ProgressState) => {
    setState((prev) => {
      const next = updater(prev)
      if (next !== prev) save(next)
      return next
    })
  }, [])

  const update = useCallback(
    (updater: (tp: TournamentProgress) => TournamentProgress) =>
      updateState((prev) => ({
        ...prev,
        tournaments: { ...prev.tournaments, [t.id]: updater({ ...EMPTY, ...prev.tournaments[t.id] }) },
      })),
    [t.id, updateState],
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
  /**
   * One setter for both jobs the queue needs — a drag reorders the list, and
   * closing it drops the matches you watched. Sending the whole array keeps
   * those from racing each other through two separate writes.
   */
  const setPinOrder = useCallback(
    (matchIds: readonly string[]) => update((tp) => ({ ...tp, pins: [...new Set(matchIds)] })),
    [update],
  )
  const toggleFavorite = useCallback(
    (teamId: TeamId) =>
      updateState((prev) => ({
        ...prev,
        favorites: prev.favorites.includes(teamId)
          ? prev.favorites.filter((x) => x !== teamId)
          : [...prev.favorites, teamId],
      })),
    [updateState],
  )
  /**
   * Commit a new order for some of your teams — what drag-to-reorder
   * produces. The panel only lists the teams in the competition you're
   * looking at, so `order` is usually a subset: those teams trade places
   * among the slots they already hold, and everyone else stays put. An id
   * that isn't followed any more voids the whole commit, so a stale drag
   * landing after an unfollow can't bring the team back.
   */
  const setFavorites = useCallback(
    (order: readonly TeamId[]) =>
      updateState((prev) => {
        if (!order.every((id) => prev.favorites.includes(id))) return prev
        const moving = new Set(order)
        let k = 0
        return { ...prev, favorites: prev.favorites.map((id) => (moving.has(id) ? order[k++] : id)) }
      }),
    [updateState],
  )
  const setFavAuto = useCallback(
    (on: boolean) => updateState((prev) => ({ ...prev, favAuto: on })),
    [updateState],
  )
  const setSpotlight = useCallback(
    (on: boolean) => updateState((prev) => ({ ...prev, spotlight: on })),
    [updateState],
  )
  const catchUp = useCallback(
    (matchIds: string[]) =>
      update((tp) => {
        const merged = { ...tp.marks }
        for (const id of matchIds) {
          if (!merged[id]) merged[id] = 'skipped'
        }
        return { ...tp, marks: merged }
      }),
    [update],
  )
  const reset = useCallback(
    () => update((tp) => resetTournamentProgressForViewing(tp)),
    [update],
  )

  const tp = { ...EMPTY, ...state.tournaments[t.id] }
  const revealed = useMemo(() => new Set(tp.revealed), [tp.revealed])
  const pins = useMemo(() => new Set(tp.pins), [tp.pins])

  return {
    marks: tp.marks,
    revealed,
    pins,
    pinOrder: tp.pins,
    favorites: state.favorites,
    favAuto: state.favAuto,
    spotlight: state.spotlight,
    setMark,
    unmark,
    reveal,
    togglePin,
    setPinOrder,
    toggleFavorite,
    setFavorites,
    setFavAuto,
    setSpotlight,
    catchUp,
    reset,
  }
}
