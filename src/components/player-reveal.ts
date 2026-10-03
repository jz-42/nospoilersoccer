/** A match counts as watched once its playhead has entered the final 30 seconds. */
export function reachedFinalThirty(duration: number, current: number): boolean {
  return Number.isFinite(duration) && duration > 0 && Number.isFinite(current) && current >= duration - 30
}

export function matchesToRevealOnClose(
  reached: ReadonlySet<string>,
  marks: Readonly<Record<string, unknown>>,
  explicitlyHidden: ReadonlySet<string> = new Set(),
): string[] {
  // Unmarking one leg can hide dependent results too. An explicit hide in
  // this sheet takes precedence over every automatic reveal on close.
  if (explicitlyHidden.size > 0) return []
  return [...reached].filter((id) => !marks[id])
}

type RevealStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Save the animation alongside progress so the next open can be in a later visit. */
export function pendingRevealStorage(): RevealStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function pendingRevealKey(tournamentId: string, matchId: string): string {
  return `nss-pending-score-reveal:${encodeURIComponent(tournamentId)}/${encodeURIComponent(matchId)}`
}

export function readPendingReveal(storage: RevealStorage | null, tournamentId: string, matchId: string): boolean {
  try {
    return storage?.getItem(pendingRevealKey(tournamentId, matchId)) === '1'
  } catch {
    return false
  }
}

export function writePendingReveal(storage: RevealStorage | null, tournamentId: string, matchId: string): void {
  try {
    storage?.setItem(pendingRevealKey(tournamentId, matchId), '1')
  } catch {
    // Progress still saves if storage for this optional animation is unavailable.
  }
}

export function takePendingReveal(storage: RevealStorage | null, tournamentId: string, matchId: string): boolean {
  const pending = readPendingReveal(storage, tournamentId, matchId)
  if (pending) {
    try {
      storage?.removeItem(pendingRevealKey(tournamentId, matchId))
    } catch {
      // A blocked store can only replay the animation on a later open.
    }
  }
  return pending
}
