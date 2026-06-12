/**
 * One visual vocabulary for match state, shared by every card, tile and
 * bracket node so "can I watch this?" is answerable at a glance anywhere:
 *
 *   seen     — you revealed this result; the score may be shown, the card recedes
 *   watch    — played, unwatched, highlights ready: the "go" state (green)
 *   ft       — played, unwatched, no highlights yet: the result is in
 *   upcoming — kickoff is in the future
 *   locked   — played, but the games that decide this matchup are still unseen
 */
import type { Tournament } from '../data/types'
import { isPlayed, knockoutReady } from '../logic/spoilers'
import type { Progress } from '../state/progress'
import type { ModalTarget } from './MatchModal'

export type MatchState = 'seen' | 'watch' | 'ft' | 'upcoming' | 'locked'

export function matchState(t: Tournament, target: ModalTarget, progress: Progress): MatchState {
  const m = target.match
  if (progress.marks[m.id] !== undefined) return 'seen'
  if (!isPlayed(m)) return 'upcoming'
  if (
    target.kind === 'knockout' &&
    !knockoutReady(t, target.match, progress.marks, progress.revealed)
  ) {
    return 'locked'
  }
  return m.videos?.length ? 'watch' : 'ft'
}
