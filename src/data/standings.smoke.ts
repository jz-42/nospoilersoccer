/**
 * Standings tiebreakers.
 *
 * The default chain (goal difference → goals scored) is what the World Cup and
 * the Premier League use and must keep producing exactly the order it produces
 * today. La Liga is the outlier: it separates level teams head-to-head first,
 * which can invert the table relative to goal difference.
 */
import { groupStandings } from './standings'
import type { Tiebreak, Tournament } from './types'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
  console.log(`ok - ${msg}`)
}

const team = (id: string) => ({ id, name: id.toUpperCase() })

/**
 * Built so the two tiebreak rules disagree:
 *   p — 6 pts, GD +9, but LOST to q
 *   q — 6 pts, GD +1, but BEAT p
 *   r — 3 pts, GD −5, GF 1, lost to s
 *   s — 3 pts, GD −5, GF 1, beat r   (identical on every full-table stat)
 * Goal difference ranks p over q; head-to-head ranks q over p. And r/s are
 * separable *only* head-to-head.
 */
function tournament(tiebreakers?: Tiebreak[]): Tournament {
  return {
    id: 'test-standings',
    name: 'Test',
    year: 2026,
    advancingRanks: [1, 2],
    ...(tiebreakers ? { tiebreakers } : {}),
    teams: { p: team('p'), q: team('q'), r: team('r'), s: team('s') },
    groups: [{ id: 'L', teams: ['p', 'q', 'r', 's'] }],
    groupMatches: [
      { id: 'm1', group: 'L', matchday: 1, date: '2026-09-01', home: 'p', away: 'r', score: { home: 5, away: 0 } },
      { id: 'm2', group: 'L', matchday: 1, date: '2026-09-01', home: 'p', away: 's', score: { home: 5, away: 0 } },
      { id: 'm3', group: 'L', matchday: 2, date: '2026-09-08', home: 'q', away: 'p', score: { home: 1, away: 0 } },
      { id: 'm4', group: 'L', matchday: 2, date: '2026-09-08', home: 'r', away: 'q', score: { home: 1, away: 0 } },
      { id: 'm5', group: 'L', matchday: 3, date: '2026-09-15', home: 'q', away: 's', score: { home: 1, away: 0 } },
      { id: 'm6', group: 'L', matchday: 3, date: '2026-09-15', home: 's', away: 'r', score: { home: 1, away: 0 } },
    ],
    knockoutRounds: [],
  }
}

const order = (t: Tournament, include?: (id: string) => boolean) =>
  groupStandings(t, 'L', include).map((r) => r.team).join(',')

// --- sanity: the fixture really is a tie on points --------------------------

const rows = groupStandings(tournament(), 'L')
assert(rows[0].points === 6 && rows[1].points === 6, 'p and q are level on points')
assert(rows[2].points === 3 && rows[3].points === 3, 'r and s are level on points')

// --- default chain ----------------------------------------------------------

assert(order(tournament()) === 'p,q,r,s', 'the default chain ranks level teams by goal difference')

// --- head-to-head first (La Liga) -------------------------------------------

const h2h: Tiebreak[] = ['head-to-head', 'goal-difference', 'goals-for']
assert(
  order(tournament(h2h)) === 'q,p,s,r',
  `head-to-head inverts both level pairs, got "${order(tournament(h2h))}"`,
)

// --- head-to-head respects the user's revealed canon ------------------------
// With q v p unrevealed there is no head-to-head record between them, so the
// chain must fall through to goal difference rather than invent an order.

const withoutM3 = (id: string) => id !== 'm3'
const partial = groupStandings(tournament(h2h), 'L', withoutM3)
assert(
  partial.find((r) => r.team === 'p')!.points === 6,
  'p keeps its points from the still-revealed matches',
)
assert(
  partial.findIndex((r) => r.team === 'p') < partial.findIndex((r) => r.team === 'q'),
  'an unrevealed head-to-head falls through to goal difference instead of guessing',
)

// --- other rules -------------------------------------------------------------

assert(
  order(tournament(['wins'])) === 'p,q,s,r' || order(tournament(['wins'])) === 'p,q,r,s',
  'a wins-based chain runs without throwing',
)

console.log('ALL STANDINGS TESTS PASS')

// --- UEFA Nations League chain ---------------------------------------------

const uefa: Tiebreak[] = [
  'head-to-head',
  'goal-difference',
  'goals-for',
  'away-goals',
  'wins',
  'away-wins',
  'disciplinary',
  'access-list',
]

function uefaTournament(
  ids: string[],
  matches: Tournament['groupMatches'],
  extras: Partial<Tournament> = {},
): Tournament {
  return {
    id: 'uefa-test',
    name: 'UEFA Test',
    year: 2026,
    advancingRanks: [],
    tiebreakers: uefa,
    teams: Object.fromEntries(ids.map((id, index) => [id, { ...team(id), accessRank: index + 1 }])),
    groups: [{ id: 'U', teams: ids }],
    groupMatches: matches,
    knockoutRounds: [],
    ...extras,
  }
}

const recursive = uefaTournament(['a', 'b', 'c'], [
  { id: 'r1', group: 'U', matchday: 1, date: '2026-01-01', home: 'a', away: 'b', score: { home: 0, away: 0 } },
  { id: 'r2', group: 'U', matchday: 2, date: '2026-01-02', home: 'b', away: 'a', score: { home: 0, away: 1 } },
  { id: 'r3', group: 'U', matchday: 3, date: '2026-01-03', home: 'a', away: 'c', score: { home: 0, away: 0 } },
  { id: 'r4', group: 'U', matchday: 4, date: '2026-01-04', home: 'c', away: 'a', score: { home: 2, away: 1 } },
  { id: 'r5', group: 'U', matchday: 5, date: '2026-01-05', home: 'b', away: 'c', score: { home: 0, away: 0 } },
  { id: 'r6', group: 'U', matchday: 6, date: '2026-01-06', home: 'c', away: 'b', score: { home: 0, away: 1 } },
])
assert(
  groupStandings(recursive, 'U').map((r) => r.team).join() === 'c,a,b',
  'UEFA recursively reapplies head-to-head to the teams still tied',
)

const awayGoals = uefaTournament(['home', 'away'], [
  { id: 'ag1', group: 'U', matchday: 1, date: '2026-02-01', home: 'home', away: 'away', score: { home: 1, away: 1 } },
  { id: 'ag2', group: 'U', matchday: 2, date: '2026-02-02', home: 'away', away: 'home', score: { home: 0, away: 0 } },
])
assert(
  groupStandings(awayGoals, 'U').map((r) => r.team).join() === 'away,home',
  'away goals settle an otherwise level pair',
)

const awayWinScores: Array<[string, string, number, number]> = [
  ['a', 'b', 0, 1], ['b', 'a', 0, 1], ['a', 'c', 1, 0], ['c', 'a', 1, 1],
  ['a', 'd', 0, 2], ['d', 'a', 0, 0], ['b', 'c', 1, 1], ['c', 'b', 2, 0],
  ['b', 'd', 0, 0], ['d', 'b', 0, 1], ['c', 'd', 1, 1], ['d', 'c', 1, 0],
]
const awayWins = uefaTournament(
  ['a', 'b', 'c', 'd'],
  awayWinScores.map(([home, away, h, a], index) => ({
    id: `aw${index + 1}`,
    group: 'U',
    matchday: index + 1,
    date: `2026-03-${String(index + 1).padStart(2, '0')}`,
    home,
    away,
    score: { home: h, away: a },
  })),
  { tiebreakers: ['goal-difference', 'goals-for', 'away-goals', 'wins', 'away-wins'] },
)
const awayWinOrder = groupStandings(awayWins, 'U').map((r) => r.team)
assert(
  awayWinOrder.indexOf('b') < awayWinOrder.indexOf('a'),
  'away wins follow total wins in the chain',
)

const disciplinary = uefaTournament(['clean', 'booked'], [], {
  tiebreakers: ['disciplinary', 'access-list'],
  groups: [{ id: 'U', teams: ['clean', 'booked'], disciplinary: { clean: 2, booked: 5 } }],
})
assert(
  groupStandings(disciplinary, 'U').map((r) => r.team).join() === 'clean,booked',
  'lower disciplinary score ranks first',
)

const accessList = uefaTournament(['unseeded', 'seeded'], [], {
  tiebreakers: ['access-list'],
  teams: {
    unseeded: { ...team('unseeded'), accessRank: 20 },
    seeded: { ...team('seeded'), accessRank: 4 },
  },
})
assert(
  groupStandings(accessList, 'U').map((r) => r.team).join() === 'seeded,unseeded',
  'access list is the final fallback',
)

const officialOrder = uefaTournament(['x', 'y'], [], {
  groups: [{ id: 'U', teams: ['x', 'y'], officialOrder: ['y', 'x'] }],
})
assert(
  groupStandings(officialOrder, 'U', () => false).map((r) => r.team).join() === 'x,y',
  'a partial revealed table does not consult official final order',
)

console.log('ALL UEFA STANDINGS TESTS PASS')
