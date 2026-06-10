import type { GroupId, TeamId, Tournament } from './types'

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

/**
 * Standings from group results, ordered by points → goal difference → goals
 * scored (FIFA's first three tiebreakers; later ones like head-to-head aren't
 * modeled — the data validator flags groups where these three don't settle
 * the advancing ranks, so ambiguity can't slip through silently).
 */
export function groupStandings(t: Tournament, group: GroupId): StandingRow[] {
  const groupDef = t.groups.find((g) => g.id === group)
  if (!groupDef) return []
  const rows = new Map<TeamId, StandingRow>(
    groupDef.teams.map((team) => [
      team,
      { team, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
    ]),
  )
  for (const m of t.groupMatches) {
    if (m.group !== group) continue
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
  return [...rows.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
      b.goalsFor - a.goalsFor,
  )
}
