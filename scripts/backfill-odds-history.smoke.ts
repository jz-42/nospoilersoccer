import {
  eligibleHistoricalOddsFixtures,
  recoverHistoricalOddsSource,
} from './backfill-odds-history'
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
  groups: [{ id: 'A', teams: ['AAA', 'BBB', 'CCC', 'DDD'] }],
  groupMatches: [
    {
      id: 'A1',
      group: 'A',
      matchday: 1,
      date: '2026-06-01',
      kickoff: '2026-06-01T18:00Z',
      home: 'AAA',
      away: 'BBB',
      score: { home: 1, away: 0 },
    },
    {
      id: 'A2',
      group: 'A',
      matchday: 1,
      date: '2026-06-01',
      kickoff: '2026-06-01T20:00Z',
      home: 'CCC',
      away: 'DDD',
      score: { home: 0, away: 0 },
      odds: { home: 0.33, draw: 0.34, away: 0.33, url: 'https://polymarket.com/event/old' },
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
          score: { home: 2, away: 1 },
        },
      ],
    },
  ],
}

const historicalFixtures = eligibleHistoricalOddsFixtures(fixtureTournament)
assert(
  historicalFixtures.map((fixture) => fixture.id).join(',') === 'A1,m1',
  'historical odds fixtures include played group and knockout matches still missing odds',
)

const sourceText = `
export const wc2026 = {
  groupMatches: [
    { id: 'A1', group: 'A', matchday: 1, date: '2026-06-01', kickoff: '2026-06-01T18:00Z', home: 'AAA', away: 'BBB', score: { home: 1, away: 0 } },
  ],
  knockoutRounds: [
    {
      id: 'final',
      name: 'Final',
      matches: [
        { id: 'm1', date: '2026-06-10', kickoff: '2026-06-10T20:00Z', home: { type: 'group-rank', group: 'A', rank: 1 }, away: { type: 'group-rank', group: 'A', rank: 2 }, homeTeam: 'AAA', awayTeam: 'BBB', score: { home: 2, away: 1 } },
      ],
    },
  ],
}
`

const errors: string[] = []
const updates: string[] = []
const recovered = await recoverHistoricalOddsSource(
  sourceText,
  historicalFixtures,
  new Map([
    [
      'AAA|BBB',
      [
        {
          slug: 'broken-group',
          date: '2026-06-01',
          byTeam: { AAA: 'tok-home-a1', BBB: 'tok-away-a1' },
          drawToken: 'tok-draw-a1',
          requiresDraw: true,
        },
        {
          slug: 'good-final',
          date: '2026-06-10',
          byTeam: { AAA: 'tok-home-m1', BBB: 'tok-away-m1' },
          requiresDraw: false,
        },
      ],
    ],
  ]),
  async (token) => {
    if (token === 'tok-home-a1') return 0.61
    if (token === 'tok-away-a1') return 0.24
    if (token === 'tok-draw-a1') throw new Error('broken draw history')
    if (token === 'tok-home-m1') return 0.57
    if (token === 'tok-away-m1') return 0.43
    return null
  },
  (message) => errors.push(message),
  (message) => updates.push(message),
)

assert(
  errors.some((message) => message.includes('A1')),
  'historical backfill logs the broken played match by id',
)
assert(
  recovered.updated === 1,
  'one broken historical fixture does not block later historical odds recovery',
)
assert(
  recovered.sourceText.includes("https://polymarket.com/event/good-final"),
  'historical backfill still writes a later recovered odds snapshot',
)
assert(
  updates.some((message) => message.includes('m1')),
  'historical backfill logs the successful later recovery',
)

console.log('ALL PASS')
