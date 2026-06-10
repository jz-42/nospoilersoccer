/**
 * User progress, persisted in localStorage so it survives tab closes,
 * restarts, and — crucially — site deploys.
 *
 * The stored blob carries a schema version. Any future change to its shape
 * must bump CURRENT_VERSION and add a migration step in `migrate`, never
 * change the shape silently: old saves must keep loading forever.
 */
import { useCallback, useState } from 'react'
import type { Tournament } from '../data/types'
import type { Mark, Marks } from '../logic/spoilers'
import { withUnmarked } from '../logic/spoilers'

const STORAGE_KEY = 'nss-progress'
const CURRENT_VERSION = 1

interface ProgressState {
  version: number
  tournaments: Record<string, { marks: Marks }>
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
  // Future: if (state.version === 1) { ...upgrade to 2... }
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

export interface Progress {
  marks: Marks
  setMark: (matchId: string, mark: Mark) => void
  unmark: (matchId: string) => void
  reset: () => void
}

export function useProgress(t: Tournament): Progress {
  const [state, setState] = useState<ProgressState>(load)

  const update = useCallback(
    (updater: (marks: Marks) => Marks) => {
      setState((prev) => {
        const marks = updater(prev.tournaments[t.id]?.marks ?? {})
        const next: ProgressState = {
          ...prev,
          tournaments: { ...prev.tournaments, [t.id]: { marks } },
        }
        save(next)
        return next
      })
    },
    [t.id],
  )

  const setMark = useCallback(
    (matchId: string, mark: Mark) => update((marks) => ({ ...marks, [matchId]: mark })),
    [update],
  )
  const unmark = useCallback(
    (matchId: string) => update((marks) => withUnmarked(t, marks, matchId)),
    [update, t],
  )
  const reset = useCallback(() => update(() => ({})), [update])

  return { marks: state.tournaments[t.id]?.marks ?? {}, setMark, unmark, reset }
}
