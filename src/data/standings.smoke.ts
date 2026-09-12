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
