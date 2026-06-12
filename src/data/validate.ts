import type { GroupId, KnockoutMatch, Tournament } from './types'
import { matchLoser, matchWinner } from './types'
import { groupStandings } from './standings'

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

  const groupedTeams = new Set<string>()
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

  /*
   * `date` must agree with `kickoff`. We pick the timezone that *any* match
   * in the tournament uses (the one that makes the date/kickoff prefix match)
   * and require every other match to use the same one — so a single typo
   * like "06-12 19:00Z but date 06-12" (when PT day is 06-13) is rejected
   * before the data ever ships. The check works for both 2022 (UTC-aligned,
   * Qatar) and 2026 (PT-aligned, US/MEX/CAN) without per-tournament config.
   */
  const datedMatches = [
    ...t.groupMatches,
    ...t.knockoutRounds.flatMap((r) => r.matches),
  ].filter((m): m is typeof m & { kickoff: string } => Boolean(m.kickoff))
  const tzFor = (iso: string, tz: string) =>
    new Date(iso).toLocaleDateString('en-CA', { timeZone: tz })
  const candidates = ['UTC', 'America/Los_Angeles', 'America/New_York']
  const consistentTz = candidates.find((tz) =>
    datedMatches.every((m) => tzFor(m.kickoff, tz) === m.date),
  )
  if (!consistentTz && datedMatches.length > 0) {
    for (const m of datedMatches) {
      const offending = candidates.every((tz) => tzFor(m.kickoff, tz) !== m.date)
      if (offending) err(`match ${m.id}: date=${m.date} disagrees with kickoff ${m.kickoff} in every timezone we check`)
    }
  }

  // Goal lists must reconcile with scores.
  const checkGoals = (
    m: { id: string; score?: { home: number; away: number }; goals?: { team: string }[] },
    homeTeam?: string,
    awayTeam?: string,
  ) => {
    if (!m.goals) return
    if (!m.score || homeTeam === undefined || awayTeam === undefined) {
      err(`match ${m.id} has goals but no score/teams`)
      return
    }
    const h = m.goals.filter((g) => g.team === homeTeam).length
    const a = m.goals.filter((g) => g.team === awayTeam).length
    if (h !== m.score.home || a !== m.score.away)
      err(`match ${m.id}: goals tally ${h}-${a} disagrees with score ${m.score.home}-${m.score.away}`)
    for (const g of m.goals) {
      if (g.team !== homeTeam && g.team !== awayTeam)
        err(`match ${m.id}: goal credited to ${g.team}, who isn't playing`)
    }
  }
  for (const m of t.groupMatches) checkGoals(m, m.home, m.away)
  for (const r of t.knockoutRounds) for (const m of r.matches) checkGoals(m, m.homeTeam, m.awayTeam)

  // Every pair in a group should meet exactly once.
  for (const g of t.groups) {
    const expected = (g.teams.length * (g.teams.length - 1)) / 2
    const actual = t.groupMatches.filter((m) => m.group === g.id).length
    if (actual !== expected) err(`group ${g.id} has ${actual} matches, expected ${expected}`)
  }

  // A group's final standings are only checkable once all its games are played.
  const groupDecided = (g: GroupId) =>
    t.groupMatches.every((m) => m.group !== g || m.score !== undefined)
  const allGroupsDecided = t.groups.every((g) => groupDecided(g.id))

  for (const round of t.knockoutRounds) {
    for (const m of round.matches) {
      if (seenMatchIds.has(m.id)) err(`duplicate match id ${m.id}`)
      seenMatchIds.add(m.id)
      knockoutById.set(m.id, m)
    }
  }

  for (const round of t.knockoutRounds) {
    for (const m of round.matches) {
      if (m.score !== undefined && (m.homeTeam === undefined || m.awayTeam === undefined)) {
        err(`match ${m.id} has a score but is missing homeTeam/awayTeam`)
      }
      for (const [label, side, actualTeam] of [
        ['home', m.home, m.homeTeam],
        ['away', m.away, m.awayTeam],
      ] as const) {
        if (actualTeam !== undefined && !teamIds.has(actualTeam)) {
          err(`match ${m.id} ${label}Team ${actualTeam} is unknown`)
        }
        switch (side.type) {
          case 'group-rank': {
            if (!groupIds.has(side.group)) {
              err(`match ${m.id} ${label} slot references unknown group ${side.group}`)
              break
            }
            if (!t.advancingRanks.includes(side.rank))
              err(`match ${m.id} ${label} slot rank ${side.rank} is not an advancing rank`)
            if (!groupDecided(side.group)) {
              if (actualTeam !== undefined)
                err(`match ${m.id} ${label}: team ${actualTeam} set before group ${side.group} finished`)
              break
            }
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
            } else if (expected && actualTeam !== undefined && expected.team !== actualTeam) {
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
            if (actualTeam === undefined) break
            if (!allGroupsDecided) {
              err(`match ${m.id} ${label}: team ${actualTeam} set before the group stage finished`)
              break
            }
            const thirds = side.groups.map((g) => groupStandings(t, g)[2]?.team)
            if (!thirds.includes(actualTeam))
              err(
                `match ${m.id} ${label}: ${actualTeam} is not third in any of groups ${side.groups.join('/')}`,
              )
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
            if (resolved === null) {
              if (actualTeam !== undefined)
                err(`match ${m.id} ${label}: team ${actualTeam} set before ${side.match} was decided`)
              break
            }
            if (actualTeam !== undefined && resolved !== actualTeam)
              err(
                `match ${m.id} ${label}: ${side.type} of ${side.match} is ${resolved}, ` +
                  `but data says ${actualTeam}`,
              )
            if (actualTeam === undefined && m.score !== undefined)
              err(`match ${m.id} ${label}: has a score but ${side.match}'s outcome wasn't recorded`)
            break
          }
        }
      }
      if (m.score === undefined) {
        if (m.penalties) err(`match ${m.id} has penalties but no score`)
        if (m.afterExtraTime) err(`match ${m.id} has afterExtraTime but no score`)
        continue
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
