import type { ParsedEvent } from './espn'
import {
  applyParsedEvents,
  findKnockoutUpdateTarget,
  summarizeResultsAudit,
  type ResultsAuditEntry,
} from './update-results-lib'
import type { Tournament } from '../src/data/types'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

function makeTournament(): Tournament {
  return {
    id: 'smoke',
    name: 'Smoke Cup',
    year: 2026,
    advancingRanks: [1, 2],
    bestThirdCount: 1,
    teams: {
      A1T: { id: 'A1T', name: 'Alpha One', flag: 'A1' },
      A2T: { id: 'A2T', name: 'Alpha Two', flag: 'A2' },
      A3T: { id: 'A3T', name: 'Alpha Three', flag: 'A3' },
      B1T: { id: 'B1T', name: 'Bravo One', flag: 'B1' },
      B2T: { id: 'B2T', name: 'Bravo Two', flag: 'B2' },
      B3T: { id: 'B3T', name: 'Bravo Three', flag: 'B3' },
      C1T: { id: 'C1T', name: 'Charlie One', flag: 'C1' },
      C2T: { id: 'C2T', name: 'Charlie Two', flag: 'C2' },
      C3T: { id: 'C3T', name: 'Charlie Three', flag: 'C3' },
      D1T: { id: 'D1T', name: 'Delta One', flag: 'D1' },
      D2T: { id: 'D2T', name: 'Delta Two', flag: 'D2' },
      D3T: { id: 'D3T', name: 'Delta Three', flag: 'D3' },
    },
    groups: [
      { id: 'A', teams: ['A1T', 'A2T', 'A3T'] },
      { id: 'B', teams: ['B1T', 'B2T', 'B3T'] },
      { id: 'C', teams: ['C1T', 'C2T', 'C3T'] },
      { id: 'D', teams: ['D1T', 'D2T', 'D3T'] },
    ],
    groupMatches: [
      { id: 'A1', group: 'A', matchday: 1, date: '2026-06-01', kickoff: '2026-06-01T18:00Z', home: 'A1T', away: 'A2T', score: { home: 2, away: 0 } },
      { id: 'A2', group: 'A', matchday: 2, date: '2026-06-02', kickoff: '2026-06-02T18:00Z', home: 'A2T', away: 'A3T', score: { home: 1, away: 0 } },
      { id: 'A3', group: 'A', matchday: 3, date: '2026-06-03', kickoff: '2026-06-03T18:00Z', home: 'A1T', away: 'A3T', score: { home: 1, away: 0 } },
      { id: 'B1', group: 'B', matchday: 1, date: '2026-06-01', kickoff: '2026-06-01T21:00Z', home: 'B1T', away: 'B2T', score: { home: 2, away: 0 } },
      { id: 'B2', group: 'B', matchday: 2, date: '2026-06-02', kickoff: '2026-06-02T21:00Z', home: 'B2T', away: 'B3T', score: { home: 1, away: 0 } },
      { id: 'B3', group: 'B', matchday: 3, date: '2026-06-03', kickoff: '2026-06-03T21:00Z', home: 'B1T', away: 'B3T', score: { home: 1, away: 0 } },
      { id: 'C1', group: 'C', matchday: 1, date: '2026-06-01', kickoff: '2026-06-01T23:00Z', home: 'C1T', away: 'C2T', score: { home: 2, away: 0 } },
      { id: 'C2', group: 'C', matchday: 2, date: '2026-06-02', kickoff: '2026-06-02T23:00Z', home: 'C2T', away: 'C3T', score: { home: 1, away: 0 } },
      { id: 'C3', group: 'C', matchday: 3, date: '2026-06-03', kickoff: '2026-06-03T23:00Z', home: 'C1T', away: 'C3T', score: { home: 1, away: 0 } },
      { id: 'D1', group: 'D', matchday: 1, date: '2026-06-01', kickoff: '2026-06-01T15:00Z', home: 'D1T', away: 'D2T', score: { home: 2, away: 0 } },
      { id: 'D2', group: 'D', matchday: 2, date: '2026-06-02', kickoff: '2026-06-02T15:00Z', home: 'D2T', away: 'D3T', score: { home: 1, away: 0 } },
      { id: 'D3', group: 'D', matchday: 3, date: '2026-06-03', kickoff: '2026-06-03T15:00Z', home: 'D1T', away: 'D3T', score: { home: 1, away: 0 } },
    ],
    knockoutRounds: [
      {
        id: 'r32',
        name: 'Round of 32',
        matches: [
          { id: 'm1', date: '2026-06-10', kickoff: '2026-06-10T18:00Z', home: { type: 'group-rank', group: 'A', rank: 2 }, away: { type: 'group-rank', group: 'B', rank: 2 } },
          { id: 'm2', date: '2026-06-10', kickoff: '2026-06-10T22:00Z', home: { type: 'group-rank', group: 'C', rank: 1 }, away: { type: 'best-third', groups: ['A', 'B', 'D'] } },
        ],
      },
      {
        id: 'r16',
        name: 'Round of 16',
        matches: [
          { id: 'm3', date: '2026-06-14', kickoff: '2026-06-14T18:00Z', home: { type: 'match-winner', match: 'm1' }, away: { type: 'match-winner', match: 'm2' } },
        ],
      },
      {
        id: 'qf',
        name: 'Quarterfinals',
        matches: [
          { id: 'm4', date: '2026-06-18', kickoff: '2026-06-18T18:00Z', home: { type: 'match-winner', match: 'm3' }, away: { type: 'group-rank', group: 'D', rank: 1 } },
        ],
      },
      {
        id: 'sf',
        name: 'Semifinals',
        matches: [
          { id: 'm5', date: '2026-06-22', kickoff: '2026-06-22T18:00Z', home: { type: 'match-winner', match: 'm4' }, away: { type: 'group-rank', group: 'A', rank: 1 } },
          { id: 'm6', date: '2026-06-22', kickoff: '2026-06-22T22:00Z', home: { type: 'group-rank', group: 'B', rank: 1 }, away: { type: 'group-rank', group: 'C', rank: 2 } },
        ],
      },
      {
        id: 'third',
        name: 'Third Place',
        matches: [
          { id: 'm7', date: '2026-06-25', kickoff: '2026-06-25T18:00Z', home: { type: 'match-loser', match: 'm5' }, away: { type: 'match-loser', match: 'm6' } },
        ],
      },
      {
        id: 'final',
        name: 'Final',
        matches: [
          { id: 'm8', date: '2026-06-26', kickoff: '2026-06-26T18:00Z', home: { type: 'match-winner', match: 'm5' }, away: { type: 'match-winner', match: 'm6' } },
        ],
      },
    ],
  }
}

function parsed(
  homeTeam: string,
  awayTeam: string,
  kickoff: string,
  score = { home: 1, away: 0 },
): ParsedEvent {
  return {
    homeTeam,
    awayTeam,
    kickoff,
    completed: true,
    afterExtraTime: false,
    score,
    goals: [],
  }
}

const tournament = makeTournament()

let pendingKnockout = tournament.knockoutRounds.flatMap((round) => round.matches).filter((match) => match.score === undefined)

const unresolvedR16 = findKnockoutUpdateTarget(tournament, pendingKnockout, parsed('A2T', 'C1T', '2026-06-14T18:00Z'))
assert(
  unresolvedR16.status === 'unresolved',
  'R16 remains unresolved until the feeder Round of 32 matches are decided',
)

const round32A = findKnockoutUpdateTarget(tournament, pendingKnockout, parsed('A2T', 'B2T', '2026-06-10T18:00Z'))
assert(round32A.status === 'ok' && round32A.match.id === 'm1', 'R32 mapping resolves group-rank slots')

const round32B = findKnockoutUpdateTarget(tournament, pendingKnockout, parsed('C1T', 'A3T', '2026-06-10T22:00Z'))
assert(round32B.status === 'ok' && round32B.match.id === 'm2', 'R32 mapping resolves best-third slots')

tournament.knockoutRounds[0].matches[0].homeTeam = 'A2T'
tournament.knockoutRounds[0].matches[0].awayTeam = 'B2T'
tournament.knockoutRounds[0].matches[0].score = { home: 1, away: 0 }
tournament.knockoutRounds[0].matches[1].homeTeam = 'C1T'
tournament.knockoutRounds[0].matches[1].awayTeam = 'A3T'
tournament.knockoutRounds[0].matches[1].score = { home: 2, away: 0 }
pendingKnockout = tournament.knockoutRounds.flatMap((round) => round.matches).filter((match) => match.score === undefined)

const round16 = findKnockoutUpdateTarget(tournament, pendingKnockout, parsed('A2T', 'C1T', '2026-06-14T18:00Z'))
assert(round16.status === 'ok' && round16.match.id === 'm3', 'R16 mapping resolves winner-vs-winner slots')

tournament.knockoutRounds[1].matches[0].homeTeam = 'A2T'
tournament.knockoutRounds[1].matches[0].awayTeam = 'C1T'
tournament.knockoutRounds[1].matches[0].score = { home: 0, away: 1 }
pendingKnockout = tournament.knockoutRounds.flatMap((round) => round.matches).filter((match) => match.score === undefined)

const quarterfinal = findKnockoutUpdateTarget(tournament, pendingKnockout, parsed('C1T', 'D1T', '2026-06-18T18:00Z'))
assert(quarterfinal.status === 'ok' && quarterfinal.match.id === 'm4', 'quarterfinal mapping resolves after R16 results land')

tournament.knockoutRounds[2].matches[0].homeTeam = 'C1T'
tournament.knockoutRounds[2].matches[0].awayTeam = 'D1T'
tournament.knockoutRounds[2].matches[0].score = { home: 0, away: 1 }
tournament.knockoutRounds[3].matches[1].homeTeam = 'B1T'
tournament.knockoutRounds[3].matches[1].awayTeam = 'C2T'
tournament.knockoutRounds[3].matches[1].score = { home: 2, away: 0 }
pendingKnockout = tournament.knockoutRounds.flatMap((round) => round.matches).filter((match) => match.score === undefined)

const semifinal = findKnockoutUpdateTarget(tournament, pendingKnockout, parsed('D1T', 'A1T', '2026-06-22T18:00Z'))
assert(semifinal.status === 'ok' && semifinal.match.id === 'm5', 'semifinal mapping resolves after quarterfinal results land')

tournament.knockoutRounds[3].matches[0].homeTeam = 'D1T'
tournament.knockoutRounds[3].matches[0].awayTeam = 'A1T'
tournament.knockoutRounds[3].matches[0].score = { home: 0, away: 1 }
pendingKnockout = tournament.knockoutRounds.flatMap((round) => round.matches).filter((match) => match.score === undefined)

const thirdPlace = findKnockoutUpdateTarget(tournament, pendingKnockout, parsed('D1T', 'C2T', '2026-06-25T18:00Z'))
assert(thirdPlace.status === 'ok' && thirdPlace.match.id === 'm7', 'third-place mapping resolves loser slots from the semifinals')

const final = findKnockoutUpdateTarget(tournament, pendingKnockout, parsed('A1T', 'B1T', '2026-06-26T18:00Z'))
assert(final.status === 'ok' && final.match.id === 'm8', 'final mapping resolves winner slots from the semifinals')

const source = `
export const tournament = {
  groupMatches: [
    { id: 'X1', group: 'X', matchday: 1, date: '2026-06-01', kickoff: '2026-06-01T18:00Z', home: 'A1T', away: 'A2T' },
  ],
}
`

const isolationTournament: Tournament = {
  ...makeTournament(),
  groups: [{ id: 'X', teams: ['A1T', 'A2T', 'B1T'] }],
  groupMatches: [
    { id: 'MISSING', group: 'X', matchday: 1, date: '2026-06-01', kickoff: '2026-06-01T15:00Z', home: 'B1T', away: 'A2T' },
    { id: 'X1', group: 'X', matchday: 2, date: '2026-06-01', kickoff: '2026-06-01T18:00Z', home: 'A1T', away: 'A2T' },
  ],
  knockoutRounds: [],
}

const applied = applyParsedEvents({
  tournament: isolationTournament,
  sourceText: source,
  events: [
    parsed('B1T', 'A2T', '2026-06-01T15:00Z'),
    parsed('A1T', 'A2T', '2026-06-01T18:00Z'),
  ],
  pendingGroup: [...isolationTournament.groupMatches],
  pendingKnockout: [],
})

assert(applied.updatedIds.includes('X1'), 'a later clean match still applies after an earlier match fails')
assert(
  applied.audit.some((entry) => entry.code === 'group_apply_failed' && entry.matchId === 'MISSING'),
  'per-match apply failures become spoiler-safe audit entries',
)
assert(
  applied.sourceText.includes(`score: { home: 1, away: 0 }`),
  'successful matches still update the source text in the same run',
)

const oneRunTournament = makeTournament()
const oneRunSource = `
export const bracket = {
  matches: [
        { id: 'm1', date: '2026-06-10', kickoff: '2026-06-10T18:00Z', home: { type: 'group-rank', group: 'A', rank: 2 }, away: { type: 'group-rank', group: 'B', rank: 2 }
        },
        { id: 'm2', date: '2026-06-10', kickoff: '2026-06-10T22:00Z', home: { type: 'group-rank', group: 'C', rank: 1 }, away: { type: 'best-third', groups: ['A', 'B', 'D'] }
        },
        { id: 'm3', date: '2026-06-14', kickoff: '2026-06-14T18:00Z', home: { type: 'match-winner', match: 'm1' }, away: { type: 'match-winner', match: 'm2' }
        },
  ],
}
`
const oneRun = applyParsedEvents({
  tournament: oneRunTournament,
  sourceText: oneRunSource,
  events: [
    parsed('A2T', 'B2T', '2026-06-10T18:00Z'),
    parsed('C1T', 'A3T', '2026-06-10T22:00Z', { home: 2, away: 0 }),
    parsed('A2T', 'C1T', '2026-06-14T18:00Z'),
  ],
  pendingGroup: [],
  pendingKnockout: oneRunTournament.knockoutRounds.flatMap((round) => round.matches),
})
assert(
  oneRun.updatedIds.includes('m3'),
  'later knockout rounds can resolve within the same run after earlier feeder matches land',
)

const flippedPenaltyTournament = makeTournament()
const flippedPenaltySource = `
export const bracket = {
  matches: [
        { id: 'm1', date: '2026-06-10', kickoff: '2026-06-10T18:00Z', home: { type: 'group-rank', group: 'A', rank: 2 }, away: { type: 'group-rank', group: 'B', rank: 2 }
        },
        { id: 'm2', date: '2026-06-10', kickoff: '2026-06-10T22:00Z', home: { type: 'group-rank', group: 'C', rank: 1 }, away: { type: 'best-third', groups: ['A', 'B', 'D'] }
        },
        { id: 'm3', date: '2026-06-14', kickoff: '2026-06-14T18:00Z', home: { type: 'match-winner', match: 'm1' }, away: { type: 'match-winner', match: 'm2' }
        },
  ],
}
`
const flippedPenaltyRun = applyParsedEvents({
  tournament: flippedPenaltyTournament,
  sourceText: flippedPenaltySource,
  events: [
    {
      homeTeam: 'B2T',
      awayTeam: 'A2T',
      kickoff: '2026-06-10T18:00Z',
      completed: true,
      afterExtraTime: true,
      score: { home: 1, away: 1 },
      penalties: { home: 3, away: 4 },
      goals: [],
    },
    parsed('C1T', 'A3T', '2026-06-10T22:00Z', { home: 2, away: 0 }),
    parsed('A2T', 'C1T', '2026-06-14T18:00Z'),
  ],
  pendingGroup: [],
  pendingKnockout: flippedPenaltyTournament.knockoutRounds.flatMap((round) => round.matches),
})
assert(
  flippedPenaltyRun.updatedIds.includes('m3'),
  'same-run feeder resolution survives flipped knockout shootouts',
)

const singleLineKnockoutTournament = makeTournament()
singleLineKnockoutTournament.knockoutRounds = [
  {
    id: 'r32',
    name: 'Round of 32',
    matches: [
      {
        id: 'm1',
        date: '2026-06-10',
        kickoff: '2026-06-10T18:00Z',
        home: { type: 'group-rank', group: 'A', rank: 2 },
        away: { type: 'group-rank', group: 'B', rank: 2 },
        homeTeam: 'A2T',
        awayTeam: 'B2T',
      },
    ],
  },
]
const singleLineKnockoutSource = `
export const bracket = {
  matches: [
        { id: 'm1', date: '2026-06-10', kickoff: '2026-06-10T18:00Z', home: { type: 'group-rank', group: 'A', rank: 2 }, away: { type: 'group-rank', group: 'B', rank: 2 }, homeTeam: 'A2T', awayTeam: 'B2T' },
  ],
}
`
const singleLineKnockoutRun = applyParsedEvents({
  tournament: singleLineKnockoutTournament,
  sourceText: singleLineKnockoutSource,
  events: [parsed('A2T', 'B2T', '2026-06-10T18:00Z', { home: 3, away: 1 })],
  pendingGroup: [],
  pendingKnockout: singleLineKnockoutTournament.knockoutRounds.flatMap((round) => round.matches),
})
assert(
  singleLineKnockoutRun.updatedIds.includes('m1'),
  'single-line knockout entries still update end-to-end',
)
assert(
  (singleLineKnockoutRun.sourceText.match(/homeTeam:/g) ?? []).length === 1,
  'single-line knockout update does not duplicate homeTeam fields',
)
assert(
  (singleLineKnockoutRun.sourceText.match(/awayTeam:/g) ?? []).length === 1,
  'single-line knockout update does not duplicate awayTeam fields',
)
assert(
  singleLineKnockoutRun.sourceText.includes(`score: { home: 3, away: 1 }`),
  'single-line knockout update writes the score',
)

const summary = summarizeResultsAudit([
  { code: 'group_apply_failed', day: '20260601', matchId: 'X1' },
  { code: 'knockout_unresolved', day: '20260614', matchId: 'm3', note: 'waiting_for_feeders' },
] satisfies ResultsAuditEntry[])
assert(summary.includes('group_apply_failed'), 'audit summary includes stable reason codes')
assert(summary.includes('m3'), 'audit summary includes match ids without scores or team names')

console.log('ALL PASS')
