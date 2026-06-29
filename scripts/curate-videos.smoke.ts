import type { Tournament } from '../src/data/types'
import * as curateVideos from './curate-videos'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const findFixtureForCandidate = (curateVideos as Record<string, unknown>).findFixtureForCandidate
const shouldRetrySkippedId = (curateVideos as Record<string, unknown>).shouldRetrySkippedId

assert(typeof findFixtureForCandidate === 'function', 'curate-videos exports fixture lookup for regression tests')
assert(typeof shouldRetrySkippedId === 'function', 'curate-videos exports retryable-skip helper for regression tests')

const tournament: Tournament = {
  id: 'smoke',
  name: 'Smoke Cup',
  year: 2026,
  advancingRanks: [1, 2],
  teams: {
    MEX: { id: 'MEX', name: 'Mexico', flag: 'MX' },
    RSA: { id: 'RSA', name: 'South Africa', flag: 'ZA' },
    SUI: { id: 'SUI', name: 'Switzerland', flag: 'CH' },
    CAN: { id: 'CAN', name: 'Canada', flag: 'CA' },
  },
  groups: [
    { id: 'A', teams: ['MEX', 'RSA'] },
    { id: 'B', teams: ['SUI', 'CAN'] },
  ],
  groupMatches: [
    {
      id: 'A1',
      group: 'A',
      matchday: 1,
      date: '2026-06-20',
      kickoff: '2026-06-20T19:00Z',
      home: 'MEX',
      away: 'RSA',
      score: { home: 1, away: 0 },
    },
    {
      id: 'B1',
      group: 'B',
      matchday: 1,
      date: '2026-06-20',
      kickoff: '2026-06-20T22:00Z',
      home: 'SUI',
      away: 'CAN',
      score: { home: 1, away: 0 },
    },
  ],
  knockoutRounds: [
    {
      id: 'r32',
      name: 'Round of 32',
      matches: [
        {
          id: 'm73',
          date: '2026-06-28',
          kickoff: '2026-06-28T19:00Z',
          home: { type: 'group-rank', group: 'A', rank: 2 },
          away: { type: 'group-rank', group: 'B', rank: 2 },
        },
      ],
    },
  ],
}

const result = (
  findFixtureForCandidate as (
    tournament: Tournament,
    home: string,
    away: string,
    kind: 'normal' | 'extended',
    publishedMs: number,
    source?: 'youtube' | 'fox',
  ) => { status: string }
)(tournament, 'RSA', 'CAN', 'normal', Date.parse('2026-06-28T22:00:00Z'))

assert(
  result.status === 'early',
  'unresolved knockout pair is held for retry instead of being skip-listed as missing',
)

assert(
  (shouldRetrySkippedId as (reason: string) => boolean)('no matching played fixture'),
  'no matching played fixture skips are retried after bracket slots become resolvable',
)
assert(
  !(shouldRetrySkippedId as (reason: string) => boolean)('already have a normal cut'),
  'stable skip reasons remain permanent',
)

console.log('ALL PASS')
