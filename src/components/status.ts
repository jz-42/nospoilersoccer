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
import type { MatchLiveStatus, Tournament } from '../data/types'
import type { Marks } from '../logic/spoilers'
import { isPlayed, knockoutReady } from '../logic/spoilers'
import type { ModalTarget } from './MatchModal'

/** The two fields of progress that decide whether a result may be shown. */
export interface MatchView {
  marks: Marks
  revealed: ReadonlySet<string>
}

export type MatchState = 'seen' | 'watch' | 'ft' | 'upcoming' | 'locked'

export function matchState(t: Tournament, target: ModalTarget, progress: MatchView): MatchState {
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

/**
 * Dev-only: `?live=<matchId>[,<matchId>]` puts those fixtures in a live state,
 * and `?live=<id>:delayed` in the delayed one.
 *
 * The live badge is the one piece of this UI that cannot be reviewed on demand
 * — it shows for the ninety minutes a match is actually being played, and the
 * seeded dev data is a finished season, so it is never on screen. Faking it
 * through devtools styles the badge but not its surroundings, which is exactly
 * where it looked wrong last time. This renders the real component in the real
 * layout.
 *
 * `import.meta.env?.DEV` is a literal `false` in any production build, so the
 * whole branch is dropped by the minifier and no query parameter reaches the
 * live site. The `?.` is for the Node smoke tests, where `import.meta.env`
 * does not exist at all (same reason `analytics.ts` writes it that way).
 */
function devForcedLiveStatus(matchId: string): MatchLiveStatus | undefined {
  if (!import.meta.env?.DEV) return undefined
  if (typeof location === 'undefined') return undefined
  const param = new URLSearchParams(location.search).get('live')
  if (!param) return undefined
  for (const entry of param.split(',')) {
    const [id, kind] = entry.split(':')
    if (id.trim() !== matchId) continue
    return kind?.trim() === 'delayed' ? { kind: 'delayed' } : { kind: 'live' }
  }
  return undefined
}

export function matchLiveStatus(target: ModalTarget, progress: MatchView): MatchLiveStatus | undefined {
  const m = target.match
  if (progress.marks[m.id] !== undefined) return undefined
  const forced = devForcedLiveStatus(m.id)
  if (forced) return forced
  if (m.score !== undefined) return undefined
  return m.liveStatus
}

function targetFor(t: Tournament, matchId: string): ModalTarget | null {
  const group = t.groupMatches.find((m) => m.id === matchId)
  if (group) return { kind: 'group', match: group }
  for (const round of t.knockoutRounds) {
    const match = round.matches.find((m) => m.id === matchId)
    if (match) return { kind: 'knockout', match, roundName: round.name }
  }
  return null
}

/**
 * The same test as the white play button on a card: played, unwatched,
 * unlocked, highlights attached, and not currently live.
 */
export function showsPlayButton(t: Tournament, matchId: string, view: MatchView): boolean {
  const target = targetFor(t, matchId)
  if (!target) return false
  return matchState(t, target, view) === 'watch' && matchLiveStatus(target, view) === undefined
}
