/**
 * The spoiler engine.
 *
 * The dataset knows everything; the user's "marks" decide what the UI may
 * show. A match is marked 'watched' or 'skipped' — both reveal its score and
 * count toward unlocking whatever depends on it:
 *
 *   - a group's standings unlock when all of its matches are marked
 *   - a knockout slot reveals its team when its source is settled
 *     (feeder group complete, or feeder match marked)
 *   - a knockout match can only be marked once both its slots are revealed
 *
 * Everything here is a pure function of (tournament, marks) so the UI and the
 * persistence layer stay trivial.
 */
import type { GroupId, KnockoutMatch, SlotRef, TeamId, Tournament } from '../data/types'

export type Mark = 'watched' | 'skipped'
export type Marks = Record<string, Mark>

export function groupComplete(t: Tournament, group: GroupId, marks: Marks): boolean {
  return t.groupMatches.every((m) => m.group !== group || marks[m.id] !== undefined)
}

export function slotUnlocked(t: Tournament, slot: SlotRef, marks: Marks): boolean {
  switch (slot.type) {
    case 'group-rank':
      return groupComplete(t, slot.group, marks)
    case 'best-third':
      // Which third-placed teams advance (and where they're slotted) depends
      // on results across all groups, so the conservative unlock is the whole
      // group stage being marked.
      return t.groups.every((g) => groupComplete(t, g.id, marks))
    case 'match-winner':
    case 'match-loser':
      return marks[slot.match] !== undefined
  }
}

/** The revealed team for a slot, or null while it's still locked. */
export function resolveSlot(
  t: Tournament,
  m: KnockoutMatch,
  side: 'home' | 'away',
  marks: Marks,
): TeamId | null {
  const slot = side === 'home' ? m.home : m.away
  if (!slotUnlocked(t, slot, marks)) return null
  return side === 'home' ? m.homeTeam : m.awayTeam
}

/** Both teams revealed — the match can be watched and marked. */
export function knockoutReady(t: Tournament, m: KnockoutMatch, marks: Marks): boolean {
  return slotUnlocked(t, m.home, marks) && slotUnlocked(t, m.away, marks)
}

const ROUND_SHORT: Record<string, string> = {
  r32: 'R32',
  r16: 'R16',
  qf: 'QF',
  sf: 'SF',
  'third-place': '3rd place match',
  final: 'the final',
}

/** Spoiler-free placeholder for a locked slot, e.g. "Winner Group A". */
export function slotLabel(t: Tournament, slot: SlotRef): string {
  switch (slot.type) {
    case 'group-rank': {
      const what = slot.rank === 1 ? 'Winner' : slot.rank === 2 ? 'Runner-up' : `${slot.rank}rd place`
      return `${what} Group ${slot.group}`
    }
    case 'best-third':
      return `Best 3rd (${slot.groups.join('/')})`
    case 'match-winner':
    case 'match-loser': {
      const role = slot.type === 'match-winner' ? 'Winner' : 'Loser'
      for (const round of t.knockoutRounds) {
        const i = round.matches.findIndex((m) => m.id === slot.match)
        if (i >= 0) {
          const short = ROUND_SHORT[round.id] ?? round.name
          return round.matches.length > 1 ? `${role} of ${short} ${i + 1}` : `${role} of ${short}`
        }
      }
      return `${role} of ${slot.match}`
    }
  }
}

/**
 * Remove a mark, then keep removing marks from knockout matches whose slots
 * are no longer unlocked, until everything is consistent again. Undoing a
 * group game can therefore re-hide a whole arm of the bracket — which is
 * exactly what "I didn't want to know that yet" means.
 */
export function withUnmarked(t: Tournament, marks: Marks, matchId: string): Marks {
  const next: Marks = { ...marks }
  delete next[matchId]
  let changed = true
  while (changed) {
    changed = false
    for (const round of t.knockoutRounds) {
      for (const m of round.matches) {
        if (next[m.id] !== undefined && !knockoutReady(t, m, next)) {
          delete next[m.id]
          changed = true
        }
      }
    }
  }
  return next
}

export function totalMatches(t: Tournament): number {
  return t.groupMatches.length + t.knockoutRounds.reduce((n, r) => n + r.matches.length, 0)
}
