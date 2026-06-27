/**
 * The spoiler engine.
 *
 * The dataset knows everything; the user's "marks" decide what the UI may
 * show. A match is marked 'watched' or 'skipped' — both reveal its score and
 * count toward unlocking whatever depends on it:
 *
 *   - group standings are "live": they only count marked matches, so they
 *     grow as you watch and never leak unseen results
 *   - a knockout slot reveals its team when its source is settled
 *     (feeder group complete, or feeder match marked)
 *   - the user may also force-reveal a knockout match's teams ("jump ahead")
 *     without finishing the games that feed it
 *   - a match can only be marked once it has a result (live tournaments
 *     ship with future fixtures that have no score yet)
 *
 * Everything here is a pure function of (tournament, marks, revealed) so the
 * UI and the persistence layer stay trivial.
 */
import type { GroupId, KnockoutMatch, SlotRef, TeamId, Tournament } from '../data/types'
import { matchWinner, matchLoser } from '../data/types'
import { groupStandings } from '../data/standings'
import type { StandingRow } from '../data/standings'

export type Mark = 'watched' | 'skipped'
export type Marks = Record<string, Mark>
export type Revealed = ReadonlySet<string>

const NONE: Revealed = new Set()

/** A match with no score yet can't be watched or marked. */
export function isPlayed(m: { score?: unknown }): boolean {
  return m.score !== undefined
}

/** True while any match is still unplayed — a tournament in progress. */
export function isLive(t: Tournament): boolean {
  return (
    t.groupMatches.some((m) => !isPlayed(m)) ||
    t.knockoutRounds.some((r) => r.matches.some((m) => !isPlayed(m)))
  )
}

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

function findKnockout(t: Tournament, id: string): KnockoutMatch | null {
  for (const r of t.knockoutRounds) {
    const m = r.matches.find((x) => x.id === id)
    if (m) return m
  }
  return null
}

function groupOfTeam(t: Tournament, team: TeamId): GroupId | null {
  for (const g of t.groups) {
    if (g.teams.includes(team)) return g.id
  }
  return null
}

function liveBestThirds(
  t: Tournament,
  marks: Marks,
): { group: string; row: StandingRow }[] {
  const include = (id: string) => marks[id] !== undefined
  const rows: { group: string; row: StandingRow }[] = []
  for (const g of t.groups) {
    const s = groupStandings(t, g.id, include)
    if (s[2]) rows.push({ group: g.id, row: s[2] })
  }
  const gd = (r: StandingRow) => r.goalsFor - r.goalsAgainst
  rows.sort(
    (a, b) =>
      b.row.points - a.row.points || gd(b.row) - gd(a.row) || b.row.goalsFor - a.row.goalsFor,
  )
  return rows
}

export function bestThirdSlotGroups(t: Tournament, marks: Marks): Map<string, string> {
  if (!t.bestThirdCount) return new Map()
  const thirds = liveBestThirds(t, marks)
  const advancing = thirds.slice(0, t.bestThirdCount).map((r) => r.group)
  const allGroupsComplete = t.groups.every((g) => groupComplete(t, g.id, marks))

  const allSlots: {
    matchId: string
    side: 'home' | 'away'
    candidates: ReadonlySet<string>
    fixed: string | null
  }[] = []
  for (const r of t.knockoutRounds) {
    for (const km of r.matches) {
      for (const s of ['home', 'away'] as const) {
        const sl = s === 'home' ? km.home : km.away
        if (sl.type === 'best-third') {
          const storedTeam = s === 'home' ? km.homeTeam : km.awayTeam
          const fixedGroup = storedTeam
            ? allGroupsComplete
              ? t.groups.find((g) => g.teams.includes(storedTeam))?.id ?? null
              : null
            : null
          allSlots.push({
            matchId: km.id,
            side: s,
            candidates: new Set(sl.groups),
            fixed: fixedGroup,
          })
        }
      }
    }
  }

  const key = (s: { matchId: string; side: string }) => `${s.matchId}-${s.side}`
  const groupOfSlot = new Map<string, string>()
  const slotOfGroup = new Map<string, string>()
  const locked = new Set<string>()
  for (const s of allSlots) {
    const k = key(s)
    if (s.fixed && advancing.includes(s.fixed) && !groupOfSlot.has(k)) {
      groupOfSlot.set(k, s.fixed)
      slotOfGroup.set(s.fixed, k)
      locked.add(k)
    }
  }
  const augment = (group: string, seen: Set<string>): boolean => {
    for (const s of allSlots) {
      const k = key(s)
      if (locked.has(k) || !s.candidates.has(group) || seen.has(k)) continue
      seen.add(k)
      const held = groupOfSlot.get(k)
      if (held === undefined || augment(held, seen)) {
        groupOfSlot.set(k, group)
        slotOfGroup.set(group, k)
        return true
      }
    }
    return false
  }
  for (const g of advancing) if (!slotOfGroup.has(g)) augment(g, new Set())
  return groupOfSlot
}

function deriveBestThird(
  t: Tournament,
  m: KnockoutMatch,
  side: 'home' | 'away',
  marks: Marks,
): TeamId | null {
  if (!t.bestThirdCount) return null
  const thirds = liveBestThirds(t, marks)
  const thisKey = `${m.id}-${side}`
  const assignedGroup = bestThirdSlotGroups(t, marks).get(thisKey)
  if (!assignedGroup) return null
  const third = thirds.find((r) => r.group === assignedGroup)
  return third?.row.team ?? null
}

function deriveSlotTeam(
  t: Tournament,
  m: KnockoutMatch,
  side: 'home' | 'away',
  slot: SlotRef,
  marks: Marks,
): TeamId | null {
  switch (slot.type) {
    case 'group-rank': {
      const include = (id: string) => marks[id] !== undefined
      const rows = groupStandings(t, slot.group, include)
      return rows[slot.rank - 1]?.team ?? null
    }
    case 'best-third':
      return deriveBestThird(t, m, side, marks)
    case 'match-winner': {
      const src = findKnockout(t, slot.match)
      return src ? matchWinner(src) : null
    }
    case 'match-loser': {
      const src = findKnockout(t, slot.match)
      return src ? matchLoser(src) : null
    }
  }
}

/**
 * The revealed team for a slot, or null while it's still hidden.
 * A slot shows its team when its feeders are settled, or when the user
 * force-revealed this match — and the data actually knows the team.
 * For unplayed matches whose feeders are decided, derives the team
 * from group standings or feeder-match results.
 */
export function resolveSlot(
  t: Tournament,
  m: KnockoutMatch,
  side: 'home' | 'away',
  marks: Marks,
  revealed: Revealed = NONE,
): TeamId | null {
  const slot = side === 'home' ? m.home : m.away
  const stored = side === 'home' ? m.homeTeam : m.awayTeam
  if (revealed.has(m.id)) return stored ?? deriveSlotTeam(t, m, side, slot, marks)

  if (slot.type === 'best-third') {
    if (slotUnlocked(t, slot, marks)) return stored ?? deriveSlotTeam(t, m, side, slot, marks)
    const team = deriveSlotTeam(t, m, side, slot, marks)
    if (team === null) return null
    const group = groupOfTeam(t, team)
    return group && groupComplete(t, group, marks) ? team : null
  }

  if (!slotUnlocked(t, slot, marks)) return null
  return stored ?? deriveSlotTeam(t, m, side, slot, marks)
}

/** Both teams visible — the match can be watched and marked (if played). */
export function knockoutReady(
  t: Tournament,
  m: KnockoutMatch,
  marks: Marks,
  revealed: Revealed = NONE,
): boolean {
  if (!isPlayed(m)) return false
  return (
    resolveSlot(t, m, 'home', marks, revealed) !== null &&
    resolveSlot(t, m, 'away', marks, revealed) !== null
  )
}

/** Whether the "jump ahead" reveal is even possible (teams known to the data). */
export function canForceReveal(m: KnockoutMatch): boolean {
  return m.homeTeam !== undefined && m.awayTeam !== undefined
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
 * exactly what "I didn't want to know that yet" means. Force-revealed
 * matches keep their marks (the user opted into seeing those teams).
 */
export function withUnmarked(
  t: Tournament,
  marks: Marks,
  matchId: string,
  revealed: Revealed = NONE,
): Marks {
  const next: Marks = { ...marks }
  delete next[matchId]
  let changed = true
  while (changed) {
    changed = false
    for (const round of t.knockoutRounds) {
      for (const m of round.matches) {
        if (next[m.id] !== undefined && !knockoutReady(t, m, next, revealed)) {
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

/**
 * IDs of played matches whose kickoff (local time) was before midnight today
 * and that the user hasn't marked yet. Group matches are added first, then
 * knockout matches cascade as their feeder slots unlock.
 */
export function catchUpMatchIds(
  t: Tournament,
  marks: Marks,
  revealed: Revealed = NONE,
): string[] {
  const midnight = new Date()
  midnight.setHours(0, 0, 0, 0)
  const cutoff = midnight.getTime()

  function beforeToday(m: { kickoff?: string; date: string }): boolean {
    const ts = m.kickoff ? new Date(m.kickoff).getTime() : new Date(m.date + 'T00:00').getTime()
    return ts < cutoff
  }

  const next: Marks = { ...marks }

  for (const m of t.groupMatches) {
    if (isPlayed(m) && beforeToday(m) && !next[m.id]) {
      next[m.id] = 'skipped'
    }
  }

  let changed = true
  while (changed) {
    changed = false
    for (const round of t.knockoutRounds) {
      for (const m of round.matches) {
        if (!next[m.id] && isPlayed(m) && beforeToday(m) && knockoutReady(t, m, next, revealed)) {
          next[m.id] = 'skipped'
          changed = true
        }
      }
    }
  }

  return Object.keys(next).filter((id) => !marks[id])
}

/** Matches that can currently be marked (played, and not waiting on feeders). */
export function totalMarkable(t: Tournament, marks: Marks, revealed: Revealed = NONE): number {
  let n = t.groupMatches.filter(isPlayed).length
  for (const round of t.knockoutRounds) {
    for (const m of round.matches) {
      if (marks[m.id] !== undefined || knockoutReady(t, m, marks, revealed)) n++
    }
  }
  return n
}
