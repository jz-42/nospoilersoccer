import type { GroupId, KnockoutMatch, TeamId, Tournament } from './types'
import { matchLoser, matchWinner } from './types'

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
 * modeled — the validator flags groups where these three don't settle the
 * advancing ranks, so ambiguity can't slip through silently).
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

/** Returns a list of problems; an empty list means the dataset is consistent. */
export function validateTournament(t: Tournament): string[] {
  const errors: string[] = []
  const err = (msg: string) => errors.push(`[${t.id}] ${msg}`)

  const teamIds = new Set(Object.keys(t.teams))
  const groupIds = new Set(t.groups.map((g) => g.id))
  const seenMatchIds = new Set<string>()
  const knockoutById = new Map<string, KnockoutMatch>()

  for (const [id, team] of Object.entries(t.teams)) {
    if (team.id !== id) err(`team key ${id} disagrees with team.id ${team.id}`)
  }

  const groupedTeams = new Set<TeamId>()
  for (const g of t.groups) {
    for (const team of g.teams) {
      if (!teamIds.has(team)) err(`group ${g.id} lists unknown team ${team}`)
      if (groupedTeams.has(team)) err(`team ${team} appears in more than one group`)
      groupedTeams.add(team)
    }
  }
  for (const team of teamIds) {
    if (!groupedTeams.has(team)) err(`team ${team} is not in any group`)
  }

  for (const m of t.groupMatches) {
    if (seenMatchIds.has(m.id)) err(`duplicate match id ${m.id}`)
    seenMatchIds.add(m.id)
    const g = t.groups.find((x) => x.id === m.group)
    if (!g) {
      err(`match ${m.id} references unknown group ${m.group}`)
      continue
    }
    for (const side of [m.home, m.away]) {
      if (!g.teams.includes(side)) err(`match ${m.id}: ${side} is not in group ${m.group}`)
    }
  }

  // Every pair in a group should meet exactly once.
  for (const g of t.groups) {
    const expected = (g.teams.length * (g.teams.length - 1)) / 2
    const actual = t.groupMatches.filter((m) => m.group === g.id).length
    if (actual !== expected) err(`group ${g.id} has ${actual} matches, expected ${expected}`)
  }

  for (const round of t.knockoutRounds) {
    for (const m of round.matches) {
      if (seenMatchIds.has(m.id)) err(`duplicate match id ${m.id}`)
      seenMatchIds.add(m.id)
      knockoutById.set(m.id, m)
    }
  }

  for (const round of t.knockoutRounds) {
    for (const m of round.matches) {
      for (const [label, side, actualTeam] of [
        ['home', m.home, m.homeTeam],
        ['away', m.away, m.awayTeam],
      ] as const) {
        if (!teamIds.has(actualTeam)) err(`match ${m.id} ${label}Team ${actualTeam} is unknown`)
        switch (side.type) {
          case 'group-rank': {
            if (!groupIds.has(side.group)) {
              err(`match ${m.id} ${label} slot references unknown group ${side.group}`)
              break
            }
            if (!t.advancingRanks.includes(side.rank))
              err(`match ${m.id} ${label} slot rank ${side.rank} is not an advancing rank`)
            const standings = groupStandings(t, side.group)
            const expected = standings[side.rank - 1]
            const rival = standings[side.rank] // row below the cut-off
            if (
              expected &&
              rival &&
              expected.points === rival.points &&
              expected.goalsFor - expected.goalsAgainst === rival.goalsFor - rival.goalsAgainst &&
              expected.goalsFor === rival.goalsFor
            ) {
              err(
                `group ${side.group}: rank ${side.rank} is not decided by points/GD/goals — ` +
                  `verify ${expected.team} vs ${rival.team} manually`,
              )
            } else if (expected && expected.team !== actualTeam) {
              err(
                `match ${m.id} ${label}: computed rank ${side.rank} of group ${side.group} is ` +
                  `${expected.team}, but data says ${actualTeam}`,
              )
            }
            break
          }
          case 'best-third': {
            for (const g of side.groups) {
              if (!groupIds.has(g)) err(`match ${m.id} ${label} slot references unknown group ${g}`)
            }
            const standings = side.groups.map((g) => groupStandings(t, g)[2]?.team)
            if (!standings.includes(actualTeam))
              err(`match ${m.id} ${label}: ${actualTeam} is not third in any of groups ${side.groups.join('/')}`)
            break
          }
          case 'match-winner':
          case 'match-loser': {
            const source = knockoutById.get(side.match)
            if (!source) {
              err(`match ${m.id} ${label} slot references unknown match ${side.match}`)
              break
            }
            const resolved = side.type === 'match-winner' ? matchWinner(source) : matchLoser(source)
            if (resolved !== actualTeam)
              err(
                `match ${m.id} ${label}: ${side.type} of ${side.match} is ${resolved}, ` +
                  `but data says ${actualTeam}`,
              )
            break
          }
        }
      }
      if (m.penalties && m.score.home !== m.score.away)
        err(`match ${m.id} has penalties but was not level (${m.score.home}-${m.score.away})`)
      if (m.penalties && !m.afterExtraTime)
        err(`match ${m.id} has penalties but afterExtraTime is not set`)
      if (m.penalties && m.penalties.home === m.penalties.away)
        err(`match ${m.id} penalties are level (${m.penalties.home}-${m.penalties.away})`)
      if (!m.penalties && m.score.home === m.score.away)
        err(`knockout match ${m.id} is level (${m.score.home}-${m.score.away}) with no penalties`)
    }
  }

  return errors
}
