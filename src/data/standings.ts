import type { GroupId, TeamId, Tiebreak, Tournament } from './types'

export interface StandingRow {
  team: TeamId
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  awayGoals: number
  awayWins: number
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
 * UEFA treats its three head-to-head measurements as a bundle. If that bundle
 * separates one team but leaves two or more level, it is recalculated using
 * only those teams before the table moves on to overall goal difference.
 */
function headToHeadPartitions(
  t: Tournament,
  group: GroupId,
  block: StandingRow[],
  include?: (matchId: string) => boolean,
): StandingRow[][] {
  const mini = headToHead(t, group, block.map((row) => row.team), include)
  const ordered = [...block].sort((a, b) => {
    const ma = mini.get(a.team)!
    const mb = mini.get(b.team)!
    return mb.points - ma.points || mb.gd - ma.gd || mb.gf - ma.gf
  })
  const partitions: StandingRow[][] = []
  for (const row of ordered) {
    const current = partitions.at(-1)
    if (!current) {
      partitions.push([row])
      continue
    }
    const first = mini.get(current[0].team)!
    const value = mini.get(row.team)!
    if (first.points === value.points && first.gd === value.gd && first.gf === value.gf) current.push(row)
    else partitions.push([row])
  }

  return partitions.flatMap((partition) =>
    partition.length > 1 && partition.length < block.length
      ? headToHeadPartitions(t, group, partition, include)
      : [partition],
  )
}

function groupFullyIncluded(
  t: Tournament,
  group: GroupId,
  include?: (matchId: string) => boolean,
): boolean {
  const matches = t.groupMatches.filter((match) => match.group === group)
  if (matches.length === 0) return include === undefined
  return matches.every((match) => match.score !== undefined && (!include || include(match.id)))
}

function rankLevelBlock(
  t: Tournament,
  group: GroupId,
  block: StandingRow[],
  chain: readonly Tiebreak[],
  include?: (matchId: string) => boolean,
  ruleIndex = 0,
): StandingRow[] {
  if (block.length < 2) return block
  if (ruleIndex >= chain.length) {
    if (!groupFullyIncluded(t, group, include)) return block
    const official = t.groups.find((candidate) => candidate.id === group)?.officialOrder
    if (!official) return block
    return [...block].sort((a, b) => official.indexOf(a.team) - official.indexOf(b.team))
  }

  const rule = chain[ruleIndex]
  if (rule === 'head-to-head') {
    return headToHeadPartitions(t, group, block, include).flatMap((partition) =>
      partition.length > 1
        ? rankLevelBlock(t, group, partition, chain, include, ruleIndex + 1)
        : partition,
    )
  }

  const groupDef = t.groups.find((candidate) => candidate.id === group)
  const full = groupFullyIncluded(t, group, include)
  const value = (row: StandingRow): number | null => {
    switch (rule) {
      case 'goal-difference':
        return goalDiff(row)
      case 'goals-for':
        return row.goalsFor
      case 'away-goals':
        return row.awayGoals
      case 'wins':
        return row.won
      case 'away-wins':
        return row.awayWins
      case 'disciplinary':
        return full ? (groupDef?.disciplinary?.[row.team] ?? null) : null
      case 'access-list':
        return t.teams[row.team].accessRank ?? null
    }
  }
  const ascending = rule === 'disciplinary' || rule === 'access-list'
  const ordered = [...block].sort((a, b) => {
    const av = value(a)
    const bv = value(b)
    if (av === null || bv === null) return 0
    return ascending ? av - bv : bv - av
  })
  const partitions: StandingRow[][] = []
  for (const row of ordered) {
    const current = partitions.at(-1)
    if (!current || value(current[0]) !== value(row)) partitions.push([row])
    else current.push(row)
  }
  return partitions.flatMap((partition) =>
    partition.length > 1
      ? rankLevelBlock(t, group, partition, chain, include, ruleIndex + 1)
      : partition,
  )
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
      {
        team,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        awayGoals: 0,
        awayWins: 0,
        points: 0,
      },
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
    away.awayGoals += m.score.away
    if (m.score.home > m.score.away) {
      home.won++
      away.lost++
      home.points += 3
    } else if (m.score.home < m.score.away) {
      away.won++
      away.awayWins++
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
      const ranked = rankLevelBlock(t, group, ordered.slice(start, end), chain, include)
      ordered.splice(start, ranked.length, ...ranked)
    }
    start = end
  }
  return ordered
}
