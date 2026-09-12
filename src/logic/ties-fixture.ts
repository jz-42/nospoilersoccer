/**
 * A miniature two-legged competition, shared by the logic, validator and modal
 * tests. Four teams in one league table, one two-legged semi-final (a 2-1 home
 * win then a 1-1 draw, so the tie is decided 3-2 on aggregate without needing
 * a shootout) feeding a single-leg final.
 *
 * Returned fresh on each call: callers mutate it to build failure cases, and a
 * shared mutable object would leak those between assertions.
 */
import type { Tournament } from '../data/types'

export function twoLeggedFixture(): Tournament {
  const team = (id: string) => ({ id, name: id.toUpperCase(), shortName: id.toUpperCase() })
  return {
    id: 'test-ties',
    name: 'Test',
    year: 2026,
    advancingRanks: [1, 2, 3, 4],
    tableLabel: 'League phase',
    teams: { a: team('a'), b: team('b'), c: team('c'), d: team('d') },
    groups: [{ id: 'L', teams: ['a', 'b', 'c', 'd'] }],
    groupMatches: [
      { id: 'g1', group: 'L', matchday: 1, date: '2026-09-01', home: 'a', away: 'b', score: { home: 1, away: 0 } },
      { id: 'g2', group: 'L', matchday: 1, date: '2026-09-01', home: 'c', away: 'd', score: { home: 1, away: 0 } },
      { id: 'g3', group: 'L', matchday: 2, date: '2026-09-08', home: 'a', away: 'c', score: { home: 1, away: 0 } },
      { id: 'g4', group: 'L', matchday: 2, date: '2026-09-08', home: 'b', away: 'd', score: { home: 1, away: 0 } },
      { id: 'g5', group: 'L', matchday: 3, date: '2026-09-15', home: 'a', away: 'd', score: { home: 1, away: 0 } },
      { id: 'g6', group: 'L', matchday: 3, date: '2026-09-15', home: 'b', away: 'c', score: { home: 1, away: 0 } },
    ],
    ties: [
      {
        id: 'sf-1',
        legs: ['sf-1-l1', 'sf-1-l2'],
        homeTeam: 'a',
        awayTeam: 'b',
        aggregate: { home: 3, away: 2 },
        winner: 'a',
      },
    ],
    knockoutRounds: [
      {
        id: 'sf',
        name: 'Semi-finals',
        matches: [
          {
            id: 'sf-1-l1', tie: { id: 'sf-1', leg: 1 }, date: '2026-10-01',
            home: { type: 'group-rank', group: 'L', rank: 1 },
            away: { type: 'group-rank', group: 'L', rank: 2 },
            homeTeam: 'a', awayTeam: 'b', score: { home: 2, away: 1 },
          },
          {
            id: 'sf-1-l2', tie: { id: 'sf-1', leg: 2 }, date: '2026-10-08',
            home: { type: 'group-rank', group: 'L', rank: 2 },
            away: { type: 'group-rank', group: 'L', rank: 1 },
            homeTeam: 'b', awayTeam: 'a', score: { home: 1, away: 1 },
          },
        ],
      },
      {
        id: 'final',
        name: 'Final',
        matches: [
          {
            id: 'f', date: '2026-10-20',
            home: { type: 'match-winner', match: 'sf-1' },
            away: { type: 'group-rank', group: 'L', rank: 3 },
            homeTeam: 'a', awayTeam: 'c', score: { home: 1, away: 0 },
          },
        ],
      },
    ],
  }
}
