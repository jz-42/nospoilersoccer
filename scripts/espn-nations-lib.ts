import { nationalTeams, pickNationalTeams } from '../src/data/national-teams'
import type { OfficialUnlFixture } from '../src/data/nations/unl-2026-official'
import type {
  Group,
  GroupMatch,
  QualificationSection,
  TeamId,
  Tournament,
} from '../src/data/types'

interface RawStandings {
  children?: Array<{
    name?: string
    standings?: { entries?: Array<{ team?: { id?: string } }> }
  }>
}

interface RawEvent {
  id?: string
  date?: string
  season?: { year?: number; slug?: string }
  competitions?: Array<{
    status?: { type?: { completed?: boolean; detail?: string; state?: string } }
    competitors?: Array<{
      homeAway?: 'home' | 'away'
      score?: string
      team?: { id?: string; displayName?: string }
    }>
    details?: Array<{
      scoringPlay?: boolean
      penaltyKick?: boolean
      ownGoal?: boolean
      clock?: { displayValue?: string }
      team?: { id?: string }
      athletesInvolved?: Array<{ displayName?: string }>
    }>
  }>
}

export interface NationsBuildInput {
  standings: RawStandings
  events: RawEvent[]
  official: readonly OfficialUnlFixture[]
  previous?: Tournament
}

export interface NationsBuildResult {
  tournament: Tournament
  audit: { errors: string[]; notices: string[] }
}

const teamIdByEspnId = new Map(
  Object.values(nationalTeams).flatMap((team) => team.espnId ? [[team.espnId, team.id] as const] : []),
)

const qualificationSections: QualificationSection[] = [
  { sectionId: 'A', rules: [
    { groupRank: 1, outcome: { kind: 'qualify', label: 'Quarter-finals' } },
    { groupRank: 2, outcome: { kind: 'qualify', label: 'Quarter-finals' } },
    { groupRank: 3, outcome: { kind: 'stay', label: 'Stay in League A' }, crossGroup: {
      top: 2,
      topOutcome: { kind: 'stay', label: 'Stay in League A' },
      bottomOutcome: { kind: 'playoff', label: 'A/B play-off' },
    } },
    { groupRank: 4, outcome: { kind: 'relegate', label: 'Relegated to League B' }, crossGroup: {
      top: 2,
      topOutcome: { kind: 'playoff', label: 'A/B play-off' },
      bottomOutcome: { kind: 'relegate', label: 'Relegated to League B' },
    } },
  ] },
  { sectionId: 'B', rules: [
    { groupRank: 1, outcome: { kind: 'promote', label: 'Promoted to League A' } },
    { groupRank: 2, outcome: { kind: 'playoff', label: 'A/B play-off' } },
    { groupRank: 3, outcome: { kind: 'stay', label: 'Stay in League B' } },
    { groupRank: 4, outcome: { kind: 'playoff', label: 'B/C play-off' } },
  ] },
  { sectionId: 'C', rules: [
    { groupRank: 1, outcome: { kind: 'promote', label: 'Promoted to League B' } },
    { groupRank: 2, outcome: { kind: 'playoff', label: 'B/C play-off' } },
    { groupRank: 3, outcome: { kind: 'stay', label: 'Stay in League C' } },
    { groupRank: 4, outcome: { kind: 'stay', label: 'Stay in League C' } },
  ] },
  { sectionId: 'D', rules: [1, 2, 3].map((groupRank) => ({
    groupRank,
    outcome: { kind: 'promote' as const, label: 'Promoted to League C' },
  })) },
]

function tournamentShell(groups: Group[], groupMatches: GroupMatch[]): Tournament {
  const teamIds = [...new Set(groups.flatMap((group) => group.teams))]
  const sectionIds = ['A', 'B', 'C', 'D']
  return {
    id: 'unl-2026',
    name: 'UEFA Nations League 2026/27',
    year: 2026,
    advancingRanks: [1, 2],
    tiebreakers: [
      'head-to-head', 'goal-difference', 'goals-for', 'away-goals',
      'wins', 'away-wins', 'disciplinary', 'access-list',
    ],
    teams: pickNationalTeams(teamIds),
    groups,
    groupSections: sectionIds.map((id) => ({
      id,
      label: `League ${id}`,
      groupIds: groups.filter((group) => group.sectionId === id).map((group) => group.id),
    })),
    qualificationSections,
    groupMatches,
    knockoutRounds: [],
    knockoutTracks: [
      {
        id: 'championship',
        label: 'Championship',
        roundIds: ['qf', 'sf', 'third-place', 'final'],
        pendingStages: [
          { id: 'qf', label: 'Quarter-finals', window: '25–30 Mar 2027', pools: [{ label: 'League A group winners' }, { label: 'League A group runners-up' }] },
          { id: 'sf', label: 'Semi-finals', window: '9–13 Jun 2027', pools: [{ label: 'Quarter-final winners' }] },
          { id: 'third-place', label: 'Third-place match', window: '13 Jun 2027', pools: [{ label: 'Semi-final losers' }] },
          { id: 'final', label: 'Final', window: '13 Jun 2027', pools: [{ label: 'Semi-final winners' }] },
        ],
      },
      {
        id: 'promotion',
        label: 'Promotion / relegation',
        roundIds: ['ab-playoff', 'bc-playoff'],
        pendingStages: [
          { id: 'ab-playoff', label: 'League A/B play-offs', window: '25–30 Mar 2027', pools: [{ label: 'League A play-off teams' }, { label: 'League B runners-up' }] },
          { id: 'bc-playoff', label: 'League B/C play-offs', window: '25–30 Mar 2027', pools: [{ label: 'League B fourth-place teams' }, { label: 'League C runners-up' }] },
        ],
      },
    ],
  }
}

function parseGroups(standings: RawStandings, errors: string[]): {
  groups: Group[]
  groupByTeam: Map<TeamId, string>
} {
  const groups: Group[] = []
  const groupByTeam = new Map<TeamId, string>()
  for (const child of standings.children ?? []) {
    const match = /^Group ([A-D][1-4])$/.exec(child.name ?? '')
    if (!match) {
      errors.push(`unknown standings group ${child.name ?? '(missing)'}`)
      continue
    }
    const groupId = match[1]
    const teamIds: TeamId[] = []
    for (const entry of child.standings?.entries ?? []) {
      const espnId = entry.team?.id
      const teamId = espnId ? teamIdByEspnId.get(espnId) : undefined
      if (!teamId) {
        errors.push(`unknown team ${espnId ?? '(missing)'} in ${groupId} standings`)
        continue
      }
      if (groupByTeam.has(teamId)) errors.push(`team ${teamId} appears in multiple groups`)
      groupByTeam.set(teamId, groupId)
      teamIds.push(teamId)
    }
    groups.push({ id: groupId, label: `Group ${groupId}`, sectionId: groupId[0], teams: teamIds })
  }
  groups.sort((a, b) => a.id.localeCompare(b.id))
  return { groups, groupByTeam }
}

function normaliseKickoff(value: string): string {
  return new Date(value).toISOString().replace(/:00\.000Z$/, 'Z')
}

export function buildNationsSeason(input: NationsBuildInput): NationsBuildResult {
  const errors: string[] = []
  const notices: string[] = []
  const { groups, groupByTeam } = parseGroups(input.standings, errors)
  const officialById = new Map(input.official.map((fixture) => [fixture.espnEventId, fixture]))
  const candidates = input.events.filter((event) => {
    if (event.id && officialById.has(event.id)) return true
    const kickoff = event.date ?? ''
    return event.season?.year === 2026
      && event.season.slug === 'group-stage'
      && kickoff >= '2026-09-24'
      && kickoff < '2026-11-18'
  })
  const seen = new Set<string>()
  const matches: GroupMatch[] = []

  for (const raw of candidates) {
    const id = raw.id
    if (!id) {
      errors.push('event missing id')
      continue
    }
    if (seen.has(id)) {
      errors.push(`duplicate event ${id}`)
      continue
    }
    seen.add(id)
    const competition = raw.competitions?.[0]
    const home = competition?.competitors?.find((team) => team.homeAway === 'home')
    const away = competition?.competitors?.find((team) => team.homeAway === 'away')
    const homeId = home?.team?.id ? teamIdByEspnId.get(home.team.id) : undefined
    const awayId = away?.team?.id ? teamIdByEspnId.get(away.team.id) : undefined
    if (!homeId || !awayId) {
      errors.push(`event ${id} has unknown team ${!homeId ? home?.team?.id ?? '(missing)' : away?.team?.id ?? '(missing)'}`)
      continue
    }
    const group = groupByTeam.get(homeId)
    if (!group || groupByTeam.get(awayId) !== group) {
      errors.push(`event ${id} teams do not share a standings group`)
      continue
    }
    if (!raw.date) {
      errors.push(`event ${id} has no kickoff`)
      continue
    }
    const official = officialById.get(id)
    if (!official) {
      errors.push(`event ${id} is absent from the official fixture manifest`)
      continue
    }
    const kickoff = normaliseKickoff(raw.date)
    const differences = [
      official.group !== group ? `group ${group}` : '',
      official.home !== homeId || official.away !== awayId ? `pair ${homeId}-${awayId}` : '',
      official.kickoff !== kickoff ? `kickoff ${kickoff}` : '',
    ].filter(Boolean)
    if (differences.length) errors.push(`event ${id} disagrees with official manifest: ${differences.join(', ')}`)

    const match: GroupMatch = {
      id: `unl-${id}`,
      group,
      matchday: official.matchday,
      date: kickoff.slice(0, 10),
      kickoff,
      home: homeId,
      away: awayId,
    }
    const completed = Boolean(competition?.status?.type?.completed)
    if (completed) {
      match.score = { home: Number(home.score ?? 0), away: Number(away.score ?? 0) }
      const goals = []
      for (const detail of competition?.details ?? []) {
        if (!detail.scoringPlay) continue
        const credited = detail.team?.id === home.team?.id ? homeId : awayId
        goals.push({
          team: credited,
          player: detail.athletesInvolved?.[0]?.displayName ?? 'Unknown',
          minute: (detail.clock?.displayValue ?? '').replace(/\s/g, ''),
          ...(detail.penaltyKick ? { penalty: true } : {}),
          ...(detail.ownGoal ? { ownGoal: true } : {}),
        })
      }
      if (goals.length === match.score.home + match.score.away) match.goals = goals
    } else if (competition?.status?.type?.state === 'in') {
      match.liveStatus = { kind: 'live' }
    } else if (/delay|suspend|postpone/i.test(competition?.status?.type?.detail ?? '')) {
      match.liveStatus = { kind: 'delayed' }
    }
    matches.push(match)
  }

  if (matches.length !== input.official.length) {
    errors.push(`fixture count ${matches.length}; expected ${input.official.length}`)
  }
  for (const fixture of input.official) {
    if (!seen.has(fixture.espnEventId)) errors.push(`official fixture ${fixture.espnEventId} missing from ESPN feed`)
  }
  matches.sort((a, b) => (a.kickoff ?? '').localeCompare(b.kickoff ?? '') || a.id.localeCompare(b.id))

  return { tournament: tournamentShell(groups, matches), audit: { errors, notices } }
}
