import type { GroupId, TeamId, Tiebreak, Tournament } from './types'

export interface StandingRow {
  team: TeamId
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  points: number
}

const DEFAULT_TIEBREAKERS: readonly Tiebreak[] = ['goal-difference', 'goals-for']

const goalDiff = (r: StandingRow) => r.goalsFor - r.goalsAgainst

/**
 * Compare two teams on the matches played *between the teams level on points*
 * — a mini-league, not a single head-to-head result, so a three-way tie is
 * settled the way the competition actually settles it. Ranked by mini-league
 * points, then mini goal difference, then mini goals scored.
 *
 * Teams that haven't yet met inside the block simply score 0 across the board,
 * which is the correct "nothing separates them yet" answer for a live table.
 */
function headToHead(
  t: Tournament,
  group: GroupId,
  block: readonly TeamId[],
  include?: (matchId: string) => boolean,
): Map<TeamId, { points: number; gd: number; gf: number }> {
  const inBlock = new Set(block)
  const mini = new Map(block.map((team) => [team, { points: 0, gd: 0, gf: 0 }]))
  for (const m of t.groupMatches) {
    if (m.group !== group || m.score === undefined) continue
    if (!inBlock.has(m.home) || !inBlock.has(m.away)) continue
    if (include && !include(m.id)) continue
    const home = mini.get(m.home)!
    const away = mini.get(m.away)!
    home.gf += m.score.home
    away.gf += m.score.away
    home.gd += m.score.home - m.score.away
    away.gd += m.score.away - m.score.home
    if (m.score.home > m.score.away) home.points += 3
    else if (m.score.home < m.score.away) away.points += 3
    else {
      home.points += 1
      away.points += 1
    }
  }
  return mini
}

/**
 * Standings from group results, ordered by points then the competition's
 * tiebreakers (default goal difference → goals scored, which is FIFA's and the
 * Premier League's; La Liga settles level teams head-to-head first). The data
 * validator flags groups where the configured chain doesn't settle the
 * advancing ranks, so ambiguity can't slip through silently.
 *
 * Pass `include` to restrict which matches count — the UI uses this to build
 * "live" standings from only the matches the user has already revealed, so
 * the table grows as you watch without ever leaking unseen results.
 */
export function groupStandings(
  t: Tournament,
  group: GroupId,
  include?: (matchId: string) => boolean,
): StandingRow[] {
  const groupDef = t.groups.find((g) => g.id === group)
  if (!groupDef) return []
  const rows = new Map<TeamId, StandingRow>(
    groupDef.teams.map((team) => [
      team,
      { team, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
    ]),
  )
  for (const m of t.groupMatches) {
    if (m.group !== group || m.score === undefined) continue
    if (include && !include(m.id)) continue
    const home = rows.get(m.home)
    const away = rows.get(m.away)
    if (!home || !away) continue
    home.played++
    away.played++
    home.goalsFor += m.score.home
    home.goalsAgainst += m.score.away
    away.goalsFor += m.score.away
    away.goalsAgainst += m.score.home
    if (m.score.home > m.score.away) {
      home.won++
      away.lost++
      home.points += 3
    } else if (m.score.home < m.score.away) {
      away.won++
      home.lost++
      away.points += 3
    } else {
      home.drawn++
      away.drawn++
      home.points++
      away.points++
    }
  }
  // Sort by points, then settle each level block with the configured chain.
  // With the default chain this produces exactly the same order as a single
  // lexicographic points → GD → GF sort, so existing tournaments are unmoved.
  const chain = t.tiebreakers ?? DEFAULT_TIEBREAKERS
  const ordered = [...rows.values()].sort((a, b) => b.points - a.points)

  for (let start = 0; start < ordered.length; ) {
    let end = start + 1
    while (end < ordered.length && ordered[end].points === ordered[start].points) end++
    if (end - start > 1) {
      const block = ordered.slice(start, end)
      const mini = chain.includes('head-to-head')
        ? headToHead(t, group, block.map((r) => r.team), include)
        : null
      block.sort((a, b) => {
        for (const rule of chain) {
          let d = 0
          switch (rule) {
            case 'head-to-head': {
              const ma = mini!.get(a.team)!
              const mb = mini!.get(b.team)!
              d = mb.points - ma.points || mb.gd - ma.gd || mb.gf - ma.gf
              break
            }
            case 'goal-difference':
              d = goalDiff(b) - goalDiff(a)
              break
            case 'goals-for':
              d = b.goalsFor - a.goalsFor
              break
            case 'wins':
              d = b.won - a.won
              break
          }
          if (d !== 0) return d
        }
        return 0
      })
      ordered.splice(start, block.length, ...block)
    }
    start = end
  }
  return ordered
}
