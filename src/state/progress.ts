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
 *   v4 → v5: Watch Later gained one global order. Each tournament keeps its
 *            local pins so existing match cards and saves retain their state.
 *   v5 → v6: add a write revision and keep a last-good copy so stale tabs and
 *            interrupted writes cannot replace the newest saved progress.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TeamId, Tournament } from '../data/types'
import type { Mark, Marks } from '../logic/spoilers'
import { withUnmarked } from '../logic/spoilers'
import {
  emptyTournamentProgress,
  resetTournamentProgressForViewing,
  type TournamentProgress,
} from './reset'

const STORAGE_KEY = 'nss-progress'
const BACKUP_KEY = 'nss-progress-last-good'
const CURRENT_VERSION = 6

/** Include the season in a saved match's identity; match ids can overlap. */
export const watchLaterKey = (tournamentId: string, matchId: string): string =>
  `${encodeURIComponent(tournamentId)}/${encodeURIComponent(matchId)}`

export function watchLaterParts(key: string): { tournamentId: string; matchId: string } | null {
  const divider = key.indexOf('/')
  if (divider < 1 || divider === key.length - 1) return null
  try {
    return {
      tournamentId: decodeURIComponent(key.slice(0, divider)),
      matchId: decodeURIComponent(key.slice(divider + 1)),
    }
  } catch {
    return null
  }
}

/** Reorder a visible subset without shifting saved matches still loading. */
export function reorderSavedMatches(current: readonly string[], visibleOrder: readonly string[]): string[] {
  const visible = new Set(visibleOrder)
  if (visible.size !== visibleOrder.length || !visibleOrder.every((key) => current.includes(key))) {
    return [...current]
  }
  let index = 0
  return current.map((key) => (visible.has(key) ? visibleOrder[index++] : key))
}

interface ProgressState {
  version: number
  /** Increases with each write so an older tab cannot displace a newer save. */
  revision: number
  tournaments: Record<string, TournamentProgress>
  /** Saved matches from every tournament, in the user's queue order. */
  pinOrder: string[]
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
  return { version: CURRENT_VERSION, revision: 0, tournaments: {}, pinOrder: [], favorites: [], favAuto: true, spotlight: false }
}

export function migrate(raw: unknown): ProgressState {
  if (typeof raw !== 'object' || raw === null) return emptyState()
  const incoming = raw as ProgressState
  if (!Number.isInteger(incoming.version) || incoming.version < 1) return emptyState()
  // One malformed season must never discard valid saves in the others.
  const rawTournaments = incoming.tournaments && typeof incoming.tournaments === 'object' && !Array.isArray(incoming.tournaments)
    ? incoming.tournaments
    : {}
  const tournaments: Record<string, TournamentProgress> = {}
  for (const [id, value] of Object.entries(rawTournaments)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const tp = value as TournamentProgress
    tournaments[id] = {
      ...tp,
      marks: tp.marks && typeof tp.marks === 'object' && !Array.isArray(tp.marks) ? tp.marks : {},
      revealed: Array.isArray(tp.revealed) ? tp.revealed.filter((x): x is string => typeof x === 'string') : [],
      pins: Array.isArray(tp.pins) ? [...new Set(tp.pins.filter((x): x is string => typeof x === 'string'))] : [],
      ...(incoming.version <= 3 ? {
        favorites: Array.isArray((tp as V3TournamentProgress).favorites)
          ? (tp as V3TournamentProgress).favorites!.filter((x): x is TeamId => typeof x === 'string')
          : [],
      } : {}),
    }
  }
  const state: ProgressState = { ...incoming, tournaments }
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
  if (state.version === 4) {
    state.pinOrder = Object.entries(state.tournaments).flatMap(([tournamentId, tp]) =>
      (tp.pins ?? []).map((matchId) => watchLaterKey(tournamentId, matchId)),
    )
    state.version = 5
  }
  if (state.version === 5) {
    state.revision = 0
    state.version = 6
  }
  // Saved by a newer build (e.g. another tab): keep what we understand, and
  // never let a missing field crash a render.
  state.favorites = Array.isArray(state.favorites) ? state.favorites : []
  state.favAuto = typeof state.favAuto === 'boolean' ? state.favAuto : true
  state.spotlight = typeof state.spotlight === 'boolean' ? state.spotlight : false
  const indexed = Array.isArray(state.pinOrder)
    ? [...new Set(state.pinOrder.filter((key): key is string => typeof key === 'string' && watchLaterParts(key) !== null))]
    : []
  const fromSeasons = Object.entries(state.tournaments).flatMap(([tournamentId, tp]) =>
    tp.pins.map((matchId) => watchLaterKey(tournamentId, matchId)),
  )
  state.pinOrder = [...new Set([...indexed, ...fromSeasons])]
  state.revision = Number.isSafeInteger(state.revision) && state.revision >= 0 ? state.revision : 0
  // A tab running older code may read this state. Never claim it is our
  // version and then write over fields the newer code understands.
  return state
}

interface StoredProgress {
  state: ProgressState
  sourceVersion: number
}

function decode(raw: string | null): StoredProgress | null {
  if (raw === null) return null
  try {
    const value = JSON.parse(raw)
    if (!value || typeof value !== 'object' || !Number.isInteger(value.version)) return null
    return { state: migrate(value), sourceVersion: value.version }
  } catch {
    return null
  }
}

/** Prefer the newest intact copy if a stale tab overwrites the legacy key. */
function readStored(): ProgressState | null {
  try {
    const primary = decode(localStorage.getItem(STORAGE_KEY))
    const backup = decode(localStorage.getItem(BACKUP_KEY))
    if (!primary) return backup?.state ?? null
    if (!backup) return primary.state
    if (primary.state.version > CURRENT_VERSION) return primary.state
    if (backup.state.version > CURRENT_VERSION) return backup.state
    if (backup.state.revision > primary.state.revision) return backup.state
    if (backup.state.revision === primary.state.revision && backup.sourceVersion > primary.sourceVersion) {
      return backup.state
    }
    return primary.state
  } catch {
    return null
  }
}

function load(): ProgressState {
  const state = readStored() ?? emptyState()
  try {
    const backup = decode(localStorage.getItem(BACKUP_KEY))
    if (state.version <= CURRENT_VERSION && (!backup || backup.state.revision < state.revision)) {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(state))
    }
  } catch {
    // The viewer can still use the in-memory state if storage is blocked.
  }
  return state
}

function save(state: ProgressState): boolean {
  const value = JSON.stringify(state)
  let saved = false
  // Keep an independent last-good copy. Older deployed tabs only know the
  // legacy key and cannot erase this one when they write a stale v4 save.
  for (const key of [BACKUP_KEY, STORAGE_KEY]) {
    try {
      localStorage.setItem(key, value)
      saved = true
    } catch {
      // One key can still succeed if a single write was interrupted.
    }
  }
  return saved
}

const EMPTY = emptyTournamentProgress()

function withGlobalPinOrder(state: ProgressState, pinOrder: string[]): ProgressState {
  const tournaments = { ...state.tournaments }
  for (const [tournamentId, tp] of Object.entries(tournaments)) {
    tournaments[tournamentId] = {
      ...tp,
      pins: pinOrder.flatMap((key) => {
        const parts = watchLaterParts(key)
        return parts?.tournamentId === tournamentId ? [parts.matchId] : []
      }),
    }
  }
  return { ...state, pinOrder, tournaments }
}

export interface Progress {
  marks: Marks
  revealed: ReadonlySet<string>
  pins: ReadonlySet<string>
  /** Saved matches in this tournament, in their queue order. */
  pinOrder: readonly string[]
  /** Saved matches across every season, each keyed by season and match id. */
  allPinOrder: readonly string[]
  /** Global: the same list in every competition. Test with `includes`. */
  favorites: readonly TeamId[]
  favAuto: boolean
  spotlight: boolean
  setMark: (matchId: string, mark: Mark) => void
  unmark: (matchId: string) => void
  reveal: (matchId: string) => void
  togglePin: (matchId: string) => void
  /** Replace this tournament's saved matches without touching other seasons. */
  setPinOrder: (matchIds: readonly string[]) => void
  reorderAllPins: (visibleOrder: readonly string[]) => void
  removePins: (keys: readonly string[]) => void
  /** Build the same spoiler-safe progress view for a saved match's season. */
  forTournament: (tournament: Tournament) => Progress
  toggleFavorite: (teamId: TeamId) => void
  setFavorites: (order: readonly TeamId[]) => void
  setFavAuto: (on: boolean) => void
  setSpotlight: (on: boolean) => void
  catchUp: (matchIds: string[]) => void
  reset: () => void
}

export function useProgress(t: Tournament): Progress {
  const [state, setState] = useState<ProgressState>(load)
  const stateRef = useRef(state)
  const warnedRef = useRef(false)

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== BACKUP_KEY) return
      const latest = readStored()
      if (!latest) return
      if (stateRef.current.version > CURRENT_VERSION && latest.version <= CURRENT_VERSION) return
      if (latest.version <= CURRENT_VERSION && latest.revision < stateRef.current.revision) return
      stateRef.current = latest
      setState(latest)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const updateState = useCallback((updater: (prev: ProgressState) => ProgressState) => {
    const persisted = readStored()
    const base = persisted && (persisted.version > CURRENT_VERSION ||
      (stateRef.current.version <= CURRENT_VERSION && persisted.revision >= stateRef.current.revision))
      ? persisted
      : stateRef.current
    if (base.version > CURRENT_VERSION) {
      if (!warnedRef.current) {
        warnedRef.current = true
        window.alert('This tab is running an older version. Reload before changing saved matches or preferences.')
      }
      stateRef.current = base
      setState(base)
      return
    }
    const next = updater(base)
    if (next === base) return
    const revised = { ...next, revision: base.revision + 1 }
    if (!save(revised) && !warnedRef.current) {
      warnedRef.current = true
      window.alert('Your changes cannot be saved in this browser right now. Check browser storage before closing this tab.')
    }
    stateRef.current = revised
    setState(revised)
  }, [])

  const updateTournament = useCallback(
    (tournamentId: string, updater: (tp: TournamentProgress) => TournamentProgress) =>
      updateState((prev) => ({
        ...prev,
        tournaments: {
          ...prev.tournaments,
          [tournamentId]: updater({ ...EMPTY, ...prev.tournaments[tournamentId] }),
        },
      })),
    [updateState],
  )
  const update = useCallback(
    (updater: (tp: TournamentProgress) => TournamentProgress) => updateTournament(t.id, updater),
    [t.id, updateTournament],
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
  // A match you just saved goes to the front: newest first is the order the
  // queue starts from, before any dragging.
  const togglePinFor = useCallback(
    (tournamentId: string, matchId: string) =>
      updateState((prev) => {
        const key = watchLaterKey(tournamentId, matchId)
        const nextOrder = prev.pinOrder.includes(key)
          ? prev.pinOrder.filter((saved) => saved !== key)
          : [key, ...prev.pinOrder]
        const tournaments = {
          ...prev.tournaments,
          [tournamentId]: { ...EMPTY, ...prev.tournaments[tournamentId] },
        }
        return withGlobalPinOrder({ ...prev, tournaments }, nextOrder)
      }),
    [updateState],
  )
  const togglePin = useCallback((matchId: string) => togglePinFor(t.id, matchId), [t.id, togglePinFor])

  const setPinOrderFor = useCallback(
    (tournamentId: string, matchIds: readonly string[]) =>
      updateState((prev) => {
        const desired = [...new Set(matchIds)].map((matchId) => watchLaterKey(tournamentId, matchId))
        let position = 0
        const order = prev.pinOrder.flatMap((key) => {
          if (watchLaterParts(key)?.tournamentId !== tournamentId) return [key]
          return position < desired.length ? [desired[position++]] : []
        })
        order.push(...desired.slice(position))
        const tournaments = {
          ...prev.tournaments,
          [tournamentId]: { ...EMPTY, ...prev.tournaments[tournamentId] },
        }
        return withGlobalPinOrder({ ...prev, tournaments }, order)
      }),
    [updateState],
  )
  const setPinOrder = useCallback(
    (matchIds: readonly string[]) => setPinOrderFor(t.id, matchIds),
    [t.id, setPinOrderFor],
  )
  const reorderAllPins = useCallback(
    (visibleOrder: readonly string[]) =>
      updateState((prev) => withGlobalPinOrder(prev, reorderSavedMatches(prev.pinOrder, visibleOrder))),
    [updateState],
  )
  const removePins = useCallback(
    (keys: readonly string[]) =>
      updateState((prev) => {
        const removed = new Set(keys)
        return withGlobalPinOrder(prev, prev.pinOrder.filter((key) => !removed.has(key)))
      }),
    [updateState],
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

  const forTournament = (other: Tournament): Progress => {
    if (other.id === t.id) return current
    const otherProgress = { ...EMPTY, ...state.tournaments[other.id] }
    const change = (updater: (entry: TournamentProgress) => TournamentProgress) =>
      updateTournament(other.id, updater)
    return {
      ...current,
      marks: otherProgress.marks,
      revealed: new Set(otherProgress.revealed),
      pins: new Set(otherProgress.pins),
      pinOrder: otherProgress.pins,
      setMark: (matchId, mark) => change((entry) => ({
        ...entry, marks: { ...entry.marks, [matchId]: mark },
      })),
      unmark: (matchId) => change((entry) => ({
        ...entry,
        marks: withUnmarked(other, entry.marks, matchId, new Set(entry.revealed)),
      })),
      reveal: (matchId) => change((entry) =>
        entry.revealed.includes(matchId)
          ? entry
          : { ...entry, revealed: [...entry.revealed, matchId] },
      ),
      togglePin: (matchId) => togglePinFor(other.id, matchId),
      setPinOrder: (matchIds) => setPinOrderFor(other.id, matchIds),
      catchUp: (matchIds) => change((entry) => {
        const marks = { ...entry.marks }
        for (const id of matchIds) if (!marks[id]) marks[id] = 'skipped'
        return { ...entry, marks }
      }),
      reset: () => change(resetTournamentProgressForViewing),
    }
  }

  const current: Progress = {
    marks: tp.marks,
    revealed,
    pins,
    pinOrder: tp.pins,
    allPinOrder: state.pinOrder,
    favorites: state.favorites,
    favAuto: state.favAuto,
    spotlight: state.spotlight,
    setMark,
    unmark,
    reveal,
    togglePin,
    setPinOrder,
    reorderAllPins,
    removePins,
    forTournament,
    toggleFavorite,
    setFavorites,
    setFavAuto,
    setSpotlight,
    catchUp,
    reset,
  }
  return current
}
