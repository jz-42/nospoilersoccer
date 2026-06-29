/**
 * Smoke test for the spoiler engine. Run with `npm run test:logic`
 * (also part of `npm run build`, so a regression fails the deploy).
 */
import { wc2022 } from '../data/wc2022'
import { wc2026 } from '../data/wc2026'
import type { GroupId, Tournament } from '../data/types'
import type { Marks } from './spoilers'
import {
  bestThirdSlotGroups,
  canForceReveal,
  groupComplete,
  isPlayed,
  knockoutReady,
  resolveSlot,
  slotLabel,
  totalMatches,
  withUnmarked,
} from './spoilers'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
  console.log(`ok - ${msg}`)
}

function stable2026Fixture(): Tournament {
  const fixture = structuredClone(wc2026)
  // Preserve the official 12-group, 32-team knockout shape while making the
  // standings deterministic instead of dependent on live/generated results.
  for (const group of fixture.groups) {
    const order = new Map(group.teams.map((team, index) => [team, index]))
    for (const match of fixture.groupMatches.filter((m) => m.group === group.id)) {
      const homeRank = order.get(match.home)
      const awayRank = order.get(match.away)
      if (homeRank === undefined || awayRank === undefined) continue
      match.score = homeRank < awayRank ? { home: 3, away: 0 } : { home: 0, away: 3 }
      match.goals = []
      match.videos = undefined
    }
  }
  for (const round of fixture.knockoutRounds) {
    for (const match of round.matches) {
      match.score = undefined
      match.goals = undefined
      match.homeTeam = undefined
      match.awayTeam = undefined
      match.penalties = undefined
      match.afterExtraTime = undefined
      match.videos = undefined
    }
  }
  return fixture
}

function groupTeams(tournament: Tournament, group: GroupId): readonly string[] {
  const teams = tournament.groups.find((g) => g.id === group)?.teams
  if (!teams) throw new Error(`Fixture error: expected group ${group}`)
  return teams
}

function marksForGroups(t: Tournament, groups: readonly string[]): Marks {
  const marks: Marks = {}
  const picked = new Set(groups)
  for (const m of t.groupMatches) {
    if (picked.has(m.group)) marks[m.id] = 'watched'
  }
  return marks
}

function bestThirdEntries(t: Tournament) {
  return t.knockoutRounds.flatMap((round) =>
    round.matches.flatMap((match) =>
      (['home', 'away'] as const).flatMap((side) => {
        const slot = side === 'home' ? match.home : match.away
        return slot.type === 'best-third' ? [{ match, side }] : []
      }),
    ),
  )
}

function knockoutMatchById(tournament: Tournament, matchId: string) {
  const match = tournament.knockoutRounds.flatMap((round) => round.matches).find((m) => m.id === matchId)
  if (!match) throw new Error(`Fixture error: expected knockout match ${matchId}`)
  return match
}

const t = wc2022
const m49 = t.knockoutRounds[0].matches[0] // NED vs USA (1A v 2B)
const m58 = t.knockoutRounds[1].matches[1] // winner m49 vs winner m50
const final = t.knockoutRounds[4].matches[0]

const marks: Marks = {}
assert(!groupComplete(t, 'A', marks), 'group A incomplete with no marks')
assert(resolveSlot(t, m49, 'home', marks) === null, 'R16 slot hidden before group done')
assert(slotLabel(t, m49.home) === 'Winner Group A', 'placeholder label for group winner')
assert(slotLabel(t, m58.home) === 'Winner of R16 1', 'placeholder label for match winner')
assert(slotLabel(t, final.home) === 'Winner of SF 1', 'placeholder label for final')

// Mark all of group A (mix of watched and skipped)
for (const m of t.groupMatches.filter((x) => x.group === 'A')) {
  marks[m.id] = m.id === 'A1' ? 'watched' : 'skipped'
}
assert(groupComplete(t, 'A', marks), 'group A complete after 6 marks')
assert(resolveSlot(t, m49, 'home', marks) === 'NED', 'NED revealed as group A winner')
assert(resolveSlot(t, m49, 'away', marks) === null, 'USA still hidden (group B not done)')
assert(!knockoutReady(t, m49, marks), 'm49 not markable until both groups done')

// Complete group B too, then walk the bracket arm
for (const m of t.groupMatches.filter((x) => x.group === 'B')) marks[m.id] = 'skipped'
assert(knockoutReady(t, m49, marks), 'm49 ready after groups A+B')
marks['m49'] = 'watched'
assert(resolveSlot(t, m58, 'home', marks) === 'NED', 'QF home slot reveals after R16 marked')
assert(resolveSlot(t, m58, 'away', marks) === null, 'QF away slot waits for m50')

// Undo cascade: unmark a group B game -> m49 must re-hide, m58 re-locks
for (const m of t.groupMatches.filter((x) => ['C', 'D'].includes(x.group))) {
  marks[m.id] = 'skipped'
}
marks['m50'] = 'watched'
marks['m58'] = 'watched'
const after = withUnmarked(t, marks, 'B1')
assert(after['B1'] === undefined, 'B1 unmarked')
assert(after['m49'] === undefined, 'cascade unmarked m49 (group B incomplete)')
assert(after['m58'] === undefined, 'cascade unmarked m58 (depends on m49)')
assert(after['m50'] === 'watched', 'm50 untouched (groups C+D still complete)')
assert(totalMatches(t) === 64, '64 total matches')

// Jump-ahead: force-revealing a match shows its teams without feeder progress
const fresh: Marks = {}
const revealed = new Set(['m58'])
assert(canForceReveal(m58), 'm58 teams are in the data, so it can be force-revealed')
assert(resolveSlot(t, m58, 'home', fresh, revealed) === 'NED', 'force-reveal shows home team')
assert(resolveSlot(t, m58, 'away', fresh, revealed) === 'ARG', 'force-reveal shows away team')
assert(knockoutReady(t, m58, fresh, revealed), 'force-revealed match is markable')
assert(resolveSlot(t, m49, 'home', fresh, revealed) === null, 'other matches stay hidden')

// Live tournaments: a match without a score can't be marked or force-revealed
const future = { ...m49, score: undefined, penalties: undefined, homeTeam: undefined, awayTeam: undefined }
assert(!isPlayed(future), 'match without score is not played')
assert(!knockoutReady(t, future, fresh, new Set([future.id])), 'unplayed match is never ready')
assert(!canForceReveal(future), 'unplayed match with unknown teams cannot be force-revealed')

const live2026 = stable2026Fixture()
const r32Direct = live2026.knockoutRounds[0].matches[0] // 2A v 2B
const r32BestThird = live2026.knockoutRounds[0].matches[6] // 1A v best 3rd
const r32BestThirdFromB = live2026.knockoutRounds[0].matches[8] // 1D v best 3rd
const liveMarks: Marks = {}
const groupA = groupTeams(live2026, 'A')
const groupB = groupTeams(live2026, 'B')
const bestThird2026 = bestThirdEntries(live2026)
assert(bestThird2026.length > 0, '2026 has best-third knockout slots to protect')

for (const m of live2026.groupMatches.filter((x) => ['A', 'B'].includes(x.group))) {
  liveMarks[m.id] = 'watched'
}

assert(groupComplete(live2026, 'A', liveMarks), '2026 group A complete after 6 marks')
assert(groupComplete(live2026, 'B', liveMarks), '2026 group B complete after 6 marks')
assert(
  resolveSlot(live2026, r32Direct, 'home', liveMarks) === groupA[1],
  '2026 R32 reveals 2A once group A is complete',
)
assert(
  resolveSlot(live2026, r32Direct, 'away', liveMarks) === groupB[1],
  '2026 R32 reveals 2B once group B is complete',
)
assert(
  resolveSlot(live2026, r32BestThird, 'home', liveMarks) === groupA[0],
  '2026 R32 reveals 1A once group A is complete',
)
assert(
  resolveSlot(live2026, r32BestThirdFromB, 'away', liveMarks) === null,
  '2026 best-third slot stays hidden before every group is revealed, even when the projection points at a completed group',
)
assert(
  resolveSlot(live2026, r32BestThird, 'away', liveMarks) === null,
  '2026 best-third slot stays hidden while its projected team group is incomplete',
)

let partial2026:
  | { marks: Marks; completeGroups: Set<string>; projected: Map<string, string> }
  | null = null
for (let n = 1; n < live2026.groups.length; n++) {
  const complete = live2026.groups.slice(0, n).map((g) => g.id)
  const marks = marksForGroups(live2026, complete)
  const projected = bestThirdSlotGroups(live2026, marks)
  if ([...projected.values()].some((g) => complete.includes(g))) {
    partial2026 = { marks, completeGroups: new Set(complete), projected }
    break
  }
}

assert(partial2026 !== null, '2026 partial progress can project a best-third qualifier before the full group stage is revealed')

const partialMarks2026 = partial2026!.marks
assert(
  live2026.knockoutRounds[0].matches.some((match) => {
    const home = resolveSlot(live2026, match, 'home', partialMarks2026)
    const away = resolveSlot(live2026, match, 'away', partialMarks2026)
    return (home === null) !== (away === null)
  }),
  '2026 partial progress can show one confirmed knockout team plus one placeholder',
)
assert(
  [...partial2026!.projected.values()].some((g) => partial2026!.completeGroups.has(g)),
  '2026 partial progress includes at least one best-third projection from a fully revealed group',
)
for (const { match, side } of bestThird2026) {
  assert(
    resolveSlot(live2026, match, side, partialMarks2026) === null,
    `2026 best-third slot ${match.id}-${side} stays hidden before every group is revealed`,
  )
}

const canon2026 = stable2026Fixture()
const storedBestThirdSlot = canon2026.knockoutRounds[0].matches[1] // m74 away
const groupBThird = groupTeams(canon2026, 'B')[2]
storedBestThirdSlot.awayTeam = groupBThird

const groupBMarks: Marks = {}
for (const m of canon2026.groupMatches.filter((x) => x.group === 'B')) {
  groupBMarks[m.id] = 'watched'
}

const projectedSlots = bestThirdSlotGroups(canon2026, groupBMarks)
assert(
  projectedSlots.get('m81-away') === 'B',
  '2026 projection still routes group B to its live slot before the whole best-third picture is known',
)
assert(
  projectedSlots.get('m74-away') !== 'B',
  '2026 stored slot does not override the live projection early',
)
assert(
  resolveSlot(canon2026, storedBestThirdSlot, 'away', groupBMarks) === null,
  '2026 stored best-third team stays hidden when the live projection puts it elsewhere',
)

// Degenerate fixture: every group is identical, so all 12 third-placed teams
// tie exactly. FIFA breaks that with data we don't carry, so a best-third slot
// must stay a placeholder even with the whole group stage marked — never a guess.
const fullGroupMarks = marksForGroups(
  canon2026,
  canon2026.groups.map((g) => g.id),
)
for (const { match, side } of bestThirdEntries(canon2026)) {
  const stored = side === 'home' ? match.homeTeam : match.awayTeam
  if (stored) continue // m74 away was given a stored team above
  assert(
    resolveSlot(canon2026, match, side, fullGroupMarks) === null,
    `2026 best-third slot ${match.id}-${side} stays a placeholder when the third-place ranking is an exact tie`,
  )
}

// Real dataset: the eight advancing thirds are unambiguous, so best-third slots
// resolve to their official Annexe C teams — and from the table alone, even with
// every stored homeTeam/awayTeam stripped (no manual backfill required).
const official2026 = new Map<string, string>()
for (const { match, side } of bestThirdEntries(wc2026)) {
  const stored = side === 'home' ? match.homeTeam : match.awayTeam
  if (stored) official2026.set(`${match.id}-${side}`, stored)
}
const tableOnly2026 = structuredClone(wc2026)
for (const round of tableOnly2026.knockoutRounds) {
  for (const km of round.matches) {
    km.homeTeam = undefined
    km.awayTeam = undefined
    km.score = undefined
    km.goals = undefined
    km.penalties = undefined
    km.afterExtraTime = undefined
  }
}
const fullMarks2026 = marksForGroups(
  tableOnly2026,
  tableOnly2026.groups.map((g) => g.id),
)
assert(official2026.size === bestThirdEntries(wc2026).length, '2026 every best-third slot has an official team to check against')
for (const { match, side } of bestThirdEntries(tableOnly2026)) {
  const key = `${match.id}-${side}`
  assert(
    resolveSlot(tableOnly2026, match, side, fullMarks2026) === official2026.get(key),
    `2026 ${key} resolves to its official Annexe C team without any stored backfill`,
  )
}
assert(
  bestThirdSlotGroups(wc2026, fullMarks2026).get('m74-away') === 'D',
  '2026 full group stage uses the official Annexe C allocation (1E faces the 3rd from D)',
)

const publishedGroupStageMarks2026 = marksForGroups(
  wc2026,
  wc2026.groups.map((g) => g.id),
)
const publishedRoundOf32Teams2026: Record<string, readonly [string, string]> = {
  m73: ['RSA', 'CAN'],
  m74: ['GER', 'PAR'],
  m75: ['NED', 'MAR'],
  m76: ['BRA', 'JPN'],
  m77: ['FRA', 'SWE'],
  m78: ['CIV', 'NOR'],
  m79: ['MEX', 'ECU'],
  m80: ['ENG', 'COD'],
  m81: ['USA', 'BIH'],
  m82: ['BEL', 'SEN'],
  m83: ['POR', 'CRO'],
  m84: ['ESP', 'AUT'],
  m85: ['SUI', 'ALG'],
  m86: ['ARG', 'CPV'],
  m87: ['COL', 'GHA'],
  m88: ['AUS', 'EGY'],
}

for (const [matchId, [homeTeam, awayTeam]] of Object.entries(publishedRoundOf32Teams2026)) {
  const match = knockoutMatchById(wc2026, matchId)
  assert(
    resolveSlot(wc2026, match, 'home', publishedGroupStageMarks2026) === homeTeam,
    `2026 published Round of 32 ${matchId} home team stays canonical`,
  )
  assert(
    resolveSlot(wc2026, match, 'away', publishedGroupStageMarks2026) === awayTeam,
    `2026 published Round of 32 ${matchId} away team stays canonical`,
  )
}

console.log('ALL PASS')
