import { groupStandings, type StandingRow } from './standings'
import type { GroupId, GroupSection, StandingOutcome, Tournament } from './types'

export function groupSection(t: Tournament, groupId: GroupId): GroupSection | null {
  const group = t.groups.find((candidate) => candidate.id === groupId)
  if (!group) return null
  return t.groupSections?.find((section) =>
    section.id === group.sectionId || section.groupIds.includes(groupId),
  ) ?? null
}

function sectionIsComplete(
  t: Tournament,
  section: GroupSection,
  include?: (matchId: string) => boolean,
): boolean {
  return section.groupIds.every((groupId) => {
    const matches = t.groupMatches.filter((match) => match.group === groupId)
    return matches.length > 0 && matches.every((match) =>
      match.score !== undefined && (!include || include(match.id)),
    )
  })
}

interface RankedAcrossGroups {
  groupId: GroupId
  row: StandingRow
  disciplinary: number
  accessRank: number
}

function compareAcrossGroups(a: RankedAcrossGroups, b: RankedAcrossGroups): number {
  return b.row.points - a.row.points
    || (b.row.goalsFor - b.row.goalsAgainst) - (a.row.goalsFor - a.row.goalsAgainst)
    || b.row.goalsFor - a.row.goalsFor
    || b.row.awayGoals - a.row.awayGoals
    || b.row.won - a.row.won
    || b.row.awayWins - a.row.awayWins
    || a.disciplinary - b.disciplinary
    || a.accessRank - b.accessRank
}

export function positionOutcome(
  t: Tournament,
  groupId: GroupId,
  rank: number,
  include?: (matchId: string) => boolean,
): StandingOutcome | null {
  const section = groupSection(t, groupId)
  if (!section) return null
  const sectionRules = t.qualificationSections?.find((candidate) => candidate.sectionId === section.id)
  const rule = sectionRules?.rules.find((candidate) => candidate.groupRank === rank)
  if (!rule) return null
  if (!rule.crossGroup) return rule.outcome
  if (!sectionIsComplete(t, section, include)) return null

  const ranked = section.groupIds.map((candidateGroupId): RankedAcrossGroups | null => {
    const row = groupStandings(t, candidateGroupId, include)[rank - 1]
    const group = t.groups.find((candidate) => candidate.id === candidateGroupId)
    if (!row || !group) return null
    return {
      groupId: candidateGroupId,
      row,
      disciplinary: group.disciplinary?.[row.team] ?? 0,
      accessRank: t.teams[row.team]?.accessRank ?? Number.MAX_SAFE_INTEGER,
    }
  })
  if (ranked.some((entry) => entry === null)) return null

  const ordered = (ranked as RankedAcrossGroups[]).sort(compareAcrossGroups)
  const index = ordered.findIndex((entry) => entry.groupId === groupId)
  if (index < 0) return null
  return index < rule.crossGroup.top ? rule.crossGroup.topOutcome : rule.crossGroup.bottomOutcome
}
