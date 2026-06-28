import { eligibleOddsFixtures, refreshOddsSource } from './fetch-odds'
import type { Tournament } from '../src/data/types'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const fixtureTournament: Tournament = {
  id: 'fixture',
  name: 'Fixture Cup',
  year: 2026,
  advancingRanks: [1, 2],
  bestThirdCount: 0,
  teams: {
    AAA: { id: 'AAA', name: 'Alpha', flag: 'A' },
    BBB: { id: 'BBB', name: 'Beta', flag: 'B' },
    CCC: { id: 'CCC', name: 'Gamma', flag: 'C' },
    DDD: { id: 'DDD', name: 'Delta', flag: 'D' },
  },
  groups: [
    { id: 'A', teams: ['AAA', 'BBB', 'CCC', 'DDD'] },
  ],
  groupMatches: [
    {
      id: 'A1',
      group: 'A',
      matchday: 1,
      date: '2026-06-01',
      kickoff: '2026-06-01T18:00Z',
      home: 'AAA',
      away: 'BBB',
    },
    {
      id: 'A2',
      group: 'A',
      matchday: 1,
      date: '2026-06-01',
      kickoff: '2026-06-01T20:00Z',
      home: 'CCC',
      away: 'DDD',
      odds: { home: 0.4, draw: 0.3, away: 0.3, url: 'https://polymarket.com/event/old' },
    },
  ],
  knockoutRounds: [
    {
      id: 'final',
      name: 'Final',
      matches: [
        {
          id: 'm1',
          date: '2026-06-10',
          kickoff: '2026-06-10T20:00Z',
          home: { type: 'group-rank', group: 'A', rank: 1 },
          away: { type: 'group-rank', group: 'A', rank: 2 },
          homeTeam: 'AAA',
          awayTeam: 'BBB',
          odds: { home: 0.5, away: 0.5, url: 'https://polymarket.com/event/old-ko' },
        },
        {
          id: 'm2',
          date: '2026-06-11',
          kickoff: '2026-06-11T20:00Z',
          home: { type: 'match-winner', match: 'm1' },
          away: { type: 'group-rank', group: 'A', rank: 2 },
        },
      ],
    },
  ],
}

const beforeGroupKickoff = eligibleOddsFixtures(
  fixtureTournament,
  new Date('2026-06-01T17:00:00Z'),
)
assert(
  beforeGroupKickoff.map((f) => f.id).join(',') === 'A1,A2,m1',
  'eligible fixtures include all pre-kickoff groups and resolved knockouts, including existing odds',
)

const afterGroupKickoff = eligibleOddsFixtures(
  fixtureTournament,
  new Date('2026-06-01T19:00:00Z'),
)
assert(
  afterGroupKickoff.map((f) => f.id).join(',') === 'A2,m1',
  'eligible fixtures exclude matches once kickoff has passed',
)

assert(
  afterGroupKickoff.find((f) => f.id === 'm1')?.home === 'AAA' &&
    afterGroupKickoff.find((f) => f.id === 'm1')?.away === 'BBB',
  'eligible knockout fixtures expose resolved home and away teams',
)

assert(
  !afterGroupKickoff.some((f) => f.id === 'm2'),
  'eligible fixtures exclude unresolved knockout matchups',
)

const oddsSource = `
export const wc2026 = {
  groupMatches: [
    { id: 'A1', group: 'A', matchday: 1, date: '2026-06-01', kickoff: '2026-06-01T18:00Z', home: 'AAA', away: 'BBB' },
    { id: 'A2', group: 'A', matchday: 1, date: '2026-06-01', kickoff: '2026-06-01T20:00Z', home: 'CCC', away: 'DDD' },
  ],
}
`

const fixtureErrors: string[] = []
const fixtureUpdates: string[] = []
const refreshed = refreshOddsSource(
  oddsSource,
  [
    {
      id: 'A1',
      date: '2026-06-01',
      kickoff: '2026-06-01T18:00Z',
      home: 'AAA',
      away: 'BBB',
      kind: 'group',
    },
    {
      id: 'A2',
      date: '2026-06-01',
      kickoff: '2026-06-01T20:00Z',
      home: 'CCC',
      away: 'DDD',
      kind: 'group',
    },
  ],
  new Map([
    [
      'AAA|BBB',
      [{ slug: 'broken-a1', date: '2026-06-01', byTeam: { AAA: 0.6 } as Record<string, number> }],
    ],
    [
      'CCC|DDD',
      [{ slug: 'good-a2', date: '2026-06-01', byTeam: { CCC: 0.55, DDD: 0.45 } }],
    ],
  ]),
  (message) => fixtureErrors.push(message),
  (message) => fixtureUpdates.push(message),
)

assert(
  fixtureErrors.some((message) => message.includes('A1')),
  'one broken fixture logs an error with its match id',
)
assert(
  refreshed.updated === 1,
  'one broken fixture does not prevent later fixtures from updating',
)
assert(
  refreshed.sourceText.includes("https://polymarket.com/event/good-a2"),
  'later fixtures still write odds after an earlier fixture fails',
)
assert(
  fixtureUpdates.some((message) => message.includes('A2')),
  'successful later fixtures still log their update',
)

console.log('ALL PASS')
