import type { GroupId, KnockoutMatch, Tournament } from './types'
import { findTie, matchLoser, matchWinner, tieLoser, tieWinner } from './types'
import { groupStandings } from './standings'
import { FIFA_WC2026_KICKOFFS } from './wc2026-official-schedule'
import { UNL_2026_OFFICIAL_FIXTURES } from './nations/unl-2026-official'
import { localDateKey } from '../time/local'

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

  if (t.groupSections) {
    const sectionIds = new Set<string>()
    const sectionGroups = new Set<GroupId>()
    for (const section of t.groupSections) {
      if (sectionIds.has(section.id)) err(`duplicate group section ${section.id}`)
      sectionIds.add(section.id)
      for (const groupId of section.groupIds) {
        if (!groupIds.has(groupId)) err(`section ${section.id} lists unknown group ${groupId}`)
        if (sectionGroups.has(groupId)) err(`group ${groupId} appears in multiple sections`)
        sectionGroups.add(groupId)
        const group = t.groups.find((candidate) => candidate.id === groupId)
        if (group?.sectionId && group.sectionId !== section.id) {
          err(`group ${groupId} says section ${group.sectionId}, listed under ${section.id}`)
        }
      }
    }
    for (const group of t.groups) {
      if (!sectionGroups.has(group.id)) err(`group ${group.id} is not in a group section`)
    }
    for (const section of t.qualificationSections ?? []) {
      if (!sectionIds.has(section.sectionId)) err(`qualification rules reference unknown section ${section.sectionId}`)
      const ranks = new Set<number>()
      for (const rule of section.rules) {
        if (ranks.has(rule.groupRank)) err(`section ${section.sectionId} repeats qualification rank ${rule.groupRank}`)
        ranks.add(rule.groupRank)
      }
    }
  }

  for (const group of t.groups) {
    if (group.officialOrder) {
      if (group.officialOrder.length !== group.teams.length ||
        new Set(group.officialOrder).size !== group.teams.length ||
        group.officialOrder.some((team) => !group.teams.includes(team))) {
        err(`group ${group.id} officialOrder is not a permutation of its teams`)
      }
    }
  }

  if (t.knockoutTracks) {
    const roundIds = new Set(t.knockoutRounds.map((round) => round.id))
    const trackIds = new Set<string>()
    const pendingIds = new Set<string>()
    for (const track of t.knockoutTracks) {
      if (trackIds.has(track.id)) err(`duplicate knockout track ${track.id}`)
      trackIds.add(track.id)
      for (const roundId of track.roundIds) {
        if (!roundIds.has(roundId) && !track.pendingStages?.some((stage) => stage.id === roundId)) {
          err(`track ${track.id} references neither materialized nor pending round ${roundId}`)
        }
      }
      for (const stage of track.pendingStages ?? []) {
        if (pendingIds.has(stage.id)) err(`duplicate pending stage ${stage.id}`)
        pendingIds.add(stage.id)
        if (!track.roundIds.includes(stage.id)) err(`pending stage ${stage.id} is outside track ${track.id}`)
        if (roundIds.has(stage.id)) err(`stage ${stage.id} is both pending and materialized`)
      }
    }
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

  const allMatches = [
    ...t.groupMatches,
    ...t.knockoutRounds.flatMap((r) => r.matches),
  ]
  const utcInstant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/
  for (const m of allMatches) {
    if (
      m.kickoff &&
      (!utcInstant.test(m.kickoff) || Number.isNaN(new Date(m.kickoff).getTime()))
    ) {
      err(`match ${m.id}: invalid UTC kickoff ${m.kickoff}`)
    }
    const liveStatus = m.liveStatus
    if (
      liveStatus !== undefined &&
      liveStatus.kind !== 'live' &&
      liveStatus.kind !== 'delayed'
    ) {
      err(`match ${m.id}: invalid liveStatus ${(liveStatus as { kind: string }).kind}`)
    }
    const entertainmentRating = m.entertainmentRating
    if ((m.entertainmentSummary ?? null) !== null && entertainmentRating === undefined) {
      err(`match ${m.id}: entertainmentSummary exists without entertainmentRating`)
    }
    if (
      entertainmentRating !== undefined &&
      (!Number.isInteger(entertainmentRating) || entertainmentRating < 1 || entertainmentRating > 5)
    ) {
      err(`match ${m.id}: invalid entertainmentRating ${entertainmentRating}`)
    }
    if (entertainmentRating !== undefined && !m.entertainmentSummary) {
      err(`match ${m.id}: entertainmentRating exists without entertainmentSummary`)
    }
  }

  if (t.id === 'wc2026') {
    if (allMatches.length !== 104) err(`expected 104 matches, found ${allMatches.length}`)

    const actualIds = new Set(allMatches.map((m) => m.id))
    for (const m of allMatches) {
      const official = FIFA_WC2026_KICKOFFS[m.id]
      if (!official) {
        err(`match ${m.id}: not present in the official FIFA schedule`)
      } else if (!m.kickoff) {
        err(`match ${m.id}: missing kickoff (official kickoff is ${official})`)
      } else if (m.kickoff !== official) {
        err(`match ${m.id}: kickoff ${m.kickoff} disagrees with official kickoff ${official}`)
      } else if (localDateKey(m.kickoff, 'America/New_York') !== m.date) {
        err(
          `match ${m.id}: published date ${m.date} disagrees with Eastern kickoff date ` +
            `${localDateKey(m.kickoff, 'America/New_York')}`,
        )
      }
    }
    for (const id of Object.keys(FIFA_WC2026_KICKOFFS)) {
      if (!actualIds.has(id)) err(`official FIFA schedule match ${id} is missing`)
    }
  }

  if (t.id === 'unl-2026') {
    const expectedGroups = [
      'A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4',
      'C1', 'C2', 'C3', 'C4', 'D1', 'D2',
    ]
    if (teamIds.size !== 54) err(`expected 54 teams, found ${teamIds.size}`)
    if (t.groups.length !== 14 || expectedGroups.some((id) => !groupIds.has(id))) {
      err(`expected exact groups ${expectedGroups.join(', ')}`)
    }
    if (t.groupMatches.length !== 156) err(`expected 156 league fixtures, found ${t.groupMatches.length}`)

    for (const group of t.groups) {
      const expectedTeams = group.id.startsWith('D') ? 3 : 4
      const expectedFixtures = group.id.startsWith('D') ? 6 : 12
      if (group.teams.length !== expectedTeams) err(`group ${group.id} has ${group.teams.length} teams; expected ${expectedTeams}`)
      const fixtures = t.groupMatches.filter((match) => match.group === group.id)
      if (fixtures.length !== expectedFixtures) err(`group ${group.id} has ${fixtures.length} fixtures; expected ${expectedFixtures}`)
      for (const home of group.teams) for (const away of group.teams) {
        if (home === away) continue
        const meetings = fixtures.filter((match) => match.home === home && match.away === away)
        if (meetings.length !== 1) err(`group ${group.id} requires one ${home} home meeting with ${away}; found ${meetings.length}`)
      }
    }

    const officialById = new Map(UNL_2026_OFFICIAL_FIXTURES.map((fixture) => [`unl-${fixture.espnEventId}`, fixture]))
    for (const match of t.groupMatches) {
      const official = officialById.get(match.id)
      if (!official) {
        err(`match ${match.id} is absent from the official UEFA manifest`)
        continue
      }
      if (match.group !== official.group || match.home !== official.home || match.away !== official.away ||
        match.kickoff !== official.kickoff || match.matchday !== official.matchday) {
        err(`match ${match.id} disagrees with the official UEFA manifest`)
      }
    }
    for (const fixture of UNL_2026_OFFICIAL_FIXTURES) {
      if (!seenMatchIds.has(`unl-${fixture.espnEventId}`)) err(`official UEFA fixture ${fixture.espnEventId} is missing`)
    }

    const sectionSignature = (t.groupSections ?? []).map((section) => `${section.id}:${section.groupIds.join(',')}`).join('|')
    const expectedSections = 'A:A1,A2,A3,A4|B:B1,B2,B3,B4|C:C1,C2,C3,C4|D:D1,D2'
    if (sectionSignature !== expectedSections) err(`group sections disagree with the official league structure`)
    const qualificationRanks = new Map((t.qualificationSections ?? []).map((section) => [section.sectionId, section.rules.map((rule) => rule.groupRank).join(',')]))
    for (const section of ['A', 'B', 'C']) {
      if (qualificationRanks.get(section) !== '1,2,3,4') err(`section ${section} must define outcomes for ranks 1–4`)
    }
    if (qualificationRanks.get('D') !== '1,2,3') err(`section D must define promotion for ranks 1–3`)
    const tracks = new Map((t.knockoutTracks ?? []).map((track) => [track.id, track.roundIds.join(',')]))
    if (tracks.get('championship') !== 'qf,sf,third-place,final') err(`championship track has the wrong rounds`)
    if (tracks.get('promotion') !== 'ab-playoff,bc-playoff') err(`promotion track has the wrong rounds`)
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

  // A group's fixture list has to be balanced: every team plays the same
  // number of matches. That is the rule all three shapes share — a World Cup
  // group plays a single round robin, a league a double one, and the Champions
  // League league phase gives all 36 teams eight opponents out of 35 — so it
  // is checked instead of any one formula. It still catches what matters: a
  // dropped or duplicated fixture leaves some team's count off.
  for (const g of t.groups) {
    const played = new Map(g.teams.map((id) => [id, 0]))
    for (const m of t.groupMatches) {
      if (m.group !== g.id) continue
      played.set(m.home, (played.get(m.home) ?? 0) + 1)
      played.set(m.away, (played.get(m.away) ?? 0) + 1)
    }
    const counts = [...played.values()]
    const most = Math.max(...counts)
    if (counts.some((n) => n !== most)) {
      const short = [...played.entries()]
        .filter(([, n]) => n !== most)
        .map(([id, n]) => `${id} ${n}`)
        .join(', ')
      err(`group ${g.id} fixtures are unbalanced: most teams play ${most}, but ${short}`)
    }
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
            // The ref may name a tie instead of a match: what advances a team
            // out of a two-legged round is the tie, not either leg. Same rule,
            // resolved one level up.
            const sourceTie = findTie(t, side.match)
            const source = sourceTie ? null : knockoutById.get(side.match)
            if (!source && !sourceTie) {
              err(`match ${m.id} ${label} slot references unknown match ${side.match}`)
              break
            }
            const resolved = sourceTie
              ? side.type === 'match-winner'
                ? tieWinner(sourceTie)
                : tieLoser(sourceTie)
              : side.type === 'match-winner'
                ? matchWinner(source!)
                : matchLoser(source!)
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
      // A single-leg knockout must produce a winner on the day. A leg of a
      // two-legged tie must not: a drawn first leg is the most ordinary result
      // in the competition, and only the aggregate has to separate the sides.
      if (!m.penalties && !m.tie && m.score.home === m.score.away)
        err(`knockout match ${m.id} is level (${m.score.home}-${m.score.away}) with no penalties`)
    }
  }

  validateTies(t, knockoutById, teamIds, err)

  return errors
}

/**
 * Two-legged ties. The legs are validated as ordinary knockout matches above;
 * this checks only what the pair has to agree on — that both legs exist, name
 * this tie back, are played in order by the same two teams with home advantage
 * swapped, and that the recorded aggregate and winner match the legs' scores.
 *
 * The redundancy is deliberate, the same bet `KnockoutMatch.homeTeam` makes:
 * storing the aggregate *and* deriving it means a bad ingest is caught here
 * rather than shown to someone as a result.
 */
function validateTies(
  t: Tournament,
  knockoutById: Map<string, KnockoutMatch>,
  teamIds: Set<string>,
  err: (msg: string) => void,
): void {
  const tieIds = new Set<string>()
  for (const tie of t.ties ?? []) {
    if (tieIds.has(tie.id)) err(`duplicate tie id ${tie.id}`)
    tieIds.add(tie.id)

    for (const side of ['homeTeam', 'awayTeam'] as const) {
      const id = tie[side]
      if (id !== undefined && !teamIds.has(id)) err(`tie ${tie.id} ${side} ${id} is not a team`)
    }
    if (tie.winner !== undefined && tie.winner !== tie.homeTeam && tie.winner !== tie.awayTeam)
      err(`tie ${tie.id} winner ${tie.winner} did not play in the tie`)

    const legs = tie.legs.map((id) => knockoutById.get(id))
    legs.forEach((leg, i) => {
      if (!leg) {
        err(`tie ${tie.id} leg ${i + 1} references unknown match ${tie.legs[i]}`)
        return
      }
      if (leg.tie?.id !== tie.id) err(`match ${leg.id} is a leg of ${tie.id} but does not say so`)
      if (leg.tie?.leg !== i + 1) err(`match ${leg.id} is leg ${i + 1} of ${tie.id} but says ${leg.tie?.leg}`)
    })

    const [first, second] = legs
    if (!first || !second) continue
    if (second.date < first.date) err(`tie ${tie.id} leg 2 (${second.date}) is before leg 1 (${first.date})`)
    // Home advantage swaps between legs — if it doesn't, we have the same
    // fixture twice rather than a tie.
    if (
      first.homeTeam !== undefined &&
      second.awayTeam !== undefined &&
      first.homeTeam !== second.awayTeam
    )
      err(`tie ${tie.id} leg 1 host ${first.homeTeam} is not leg 2's visitor ${second.awayTeam}`)
    if (
      first.awayTeam !== undefined &&
      second.homeTeam !== undefined &&
      first.awayTeam !== second.homeTeam
    )
      err(`tie ${tie.id} leg 1 visitor ${first.awayTeam} is not leg 2's host ${second.homeTeam}`)
    if (tie.homeTeam !== undefined && first.homeTeam !== undefined && tie.homeTeam !== first.homeTeam)
      err(`tie ${tie.id} homeTeam ${tie.homeTeam} is not leg 1's host ${first.homeTeam}`)

    if (!first.score || !second.score) {
      if (tie.aggregate) err(`tie ${tie.id} has an aggregate before both legs were played`)
      if (tie.winner !== undefined) err(`tie ${tie.id} has a winner before both legs were played`)
      continue
    }
    // Aggregate is stated from leg 1's perspective, so leg 2's away score is
    // the tie's home side.
    const aggHome = first.score.home + second.score.away
    const aggAway = first.score.away + second.score.home
    if (tie.aggregate && (tie.aggregate.home !== aggHome || tie.aggregate.away !== aggAway))
      err(
        `tie ${tie.id} aggregate ${tie.aggregate.home}-${tie.aggregate.away} ` +
          `does not match its legs (${aggHome}-${aggAway})`,
      )
    if (aggHome === aggAway && !tie.penalties)
      err(`tie ${tie.id} finished level on aggregate (${aggHome}-${aggAway}) with no shootout`)
    if (aggHome !== aggAway && tie.penalties)
      err(`tie ${tie.id} has a shootout but was not level on aggregate (${aggHome}-${aggAway})`)
    if (tie.penalties && tie.penalties.home === tie.penalties.away)
      err(`tie ${tie.id} penalties are level (${tie.penalties.home}-${tie.penalties.away})`)
    if (tie.winner !== undefined) {
      const decider = tie.penalties ?? { home: aggHome, away: aggAway }
      const derived = decider.home > decider.away ? tie.homeTeam : tie.awayTeam
      if (derived !== undefined && derived !== tie.winner)
        err(`tie ${tie.id} winner ${tie.winner} disagrees with its scores (${derived} won)`)
    }
  }

  // A leg that no tie claims would never unlock, because the leg gate resolves
  // through the tie.
  for (const m of knockoutById.values()) {
    if (m.tie && !tieIds.has(m.tie.id)) err(`match ${m.id} references unknown tie ${m.tie.id}`)
  }
}
