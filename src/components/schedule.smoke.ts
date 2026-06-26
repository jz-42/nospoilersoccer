import type { GroupMatch } from '../data/types'
import { groupMatchesByLocalDate, matchLocalDate } from './schedule'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const lateMatch: GroupMatch = {
  id: 'late',
  group: 'A',
  matchday: 1,
  date: '2026-06-20',
  kickoff: '2026-06-21T00:30Z',
  home: 'AAA',
  away: 'BBB',
}
const earlyMatch: GroupMatch = {
  ...lateMatch,
  id: 'early',
  kickoff: '2026-06-20T19:00Z',
}

assert(
  matchLocalDate(lateMatch, 'America/Los_Angeles') === '2026-06-20',
  'late UTC match stays on June 20 in Los Angeles',
)
assert(
  matchLocalDate(lateMatch, 'Europe/Amsterdam') === '2026-06-21',
  'late UTC match moves to June 21 in Amsterdam',
)

const newYork = groupMatchesByLocalDate([lateMatch, earlyMatch], 'America/New_York')
assert(newYork.length === 1, 'New York groups both examples on one local day')
assert(newYork[0].matches[0].id === 'early', 'matches sort by kickoff within a local day')

const amsterdam = groupMatchesByLocalDate([lateMatch, earlyMatch], 'Europe/Amsterdam')
assert(amsterdam.length === 2, 'Amsterdam splits examples across local days')
assert(amsterdam[1].matches[0].id === 'late', 'local day groups sort chronologically')

console.log('ALL LOCAL GROUPING TESTS PASS')
