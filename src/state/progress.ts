/**
 * User progress, persisted in localStorage so it survives tab closes,
 * restarts, and — crucially — site deploys.
 *
 * The stored blob carries a schema version. Any future change to its shape
 * must bump CURRENT_VERSION and add a migration step in `migrate`, never
 * change the shape silently: old saves must keep loading forever.
 */
import { useCallback, useMemo, useState } from 'react'
import type { Tournament } from '../data/types'
import type { Mark, Marks } from '../logic/spoilers'
import { withUnmarked } from '../logic/spoilers'

const STORAGE_KEY = 'nss-progress'
const CURRENT_VERSION = 2

interface TournamentProgress {
  marks: Marks
  /** Knockout matches whose teams the user force-revealed ("jump ahead"). */
  revealed: string[]
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
    // v1 → v2: tournaments gained the `revealed` list.
    for (const tp of Object.values(state.tournaments)) {
      tp.revealed ??= []
    }
    state.version = 2
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

const EMPTY: TournamentProgress = { marks: {}, revealed: [] }

export interface Progress {
  marks: Marks
  revealed: ReadonlySet<string>
  setMark: (matchId: string, mark: Mark) => void
  unmark: (matchId: string) => void
  reveal: (matchId: string) => void
  reset: () => void
}

export function useProgress(t: Tournament): Progress {
  const [state, setState] = useState<ProgressState>(load)

  const update = useCallback(
    (updater: (tp: TournamentProgress) => TournamentProgress) => {
      setState((prev) => {
        const tp = updater(prev.tournaments[t.id] ?? EMPTY)
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
  const reset = useCallback(() => update(() => ({ marks: {}, revealed: [] })), [update])

  const tp = state.tournaments[t.id] ?? EMPTY
  const revealed = useMemo(() => new Set(tp.revealed), [tp.revealed])

  return { marks: tp.marks, revealed, setMark, unmark, reveal, reset }
}
