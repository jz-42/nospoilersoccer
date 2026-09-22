import { nationalTeams, pickNationalTeams } from '../src/data/national-teams'
import type { OfficialUnlFixture } from '../src/data/nations/unl-2026-official'
import type {
  Group,
  GroupMatch,
  KnockoutMatch,
  KnockoutRound,
  QualificationSection,
  SlotRef,
  TeamId,
  Tie,
  Tournament,
} from '../src/data/types'
import { groupStandings } from '../src/data/standings'

interface RawStandings {
  children?: Array<{
    name?: string
    standings?: { entries?: Array<{ team?: { id?: string } }> }
  }>
}

interface RawEvent {
  id?: string
  name?: string
  date?: string
  season?: { year?: number; slug?: string }
  competitions?: Array<{
    altGameNote?: string
    leg?: { value?: number }
    series?: { title?: string; completed?: boolean; competitors?: Array<{ id?: string; winner?: boolean; aggregateScore?: number }> }
    status?: { type?: { completed?: boolean; detail?: string; state?: string } }
    competitors?: Array<{
      homeAway?: 'home' | 'away'
      score?: string
      shootoutScore?: number
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

export type NationsStageId = 'qf' | 'ab-playoff' | 'bc-playoff' | 'sf' | 'third-place' | 'final'

/** Classify only explicit ESPN calendar/series labels; never infer a stage from its date. */
export function stageIdForEvent(event: RawEvent): NationsStageId | null {
  const competition = event.competitions?.[0]
  const label = [
    event.name,
    event.season?.slug,
    competition?.altGameNote,
    competition?.series?.title,
  ].filter(Boolean).join(' ').toLowerCase()
  if (/league\s*a\s*[/–-]\s*b|a\s*[/–-]\s*b\s*play/.test(label)) return 'ab-playoff'
  if (/league\s*b\s*[/–-]\s*c|b\s*[/–-]\s*c\s*play/.test(label)) return 'bc-playoff'
  if (/quarter[ -]?final/.test(label)) return 'qf'
  if (/semi[ -]?final/.test(label)) return 'sf'
  if (/third[ -]?place/.test(label)) return 'third-place'
  if (/\bfinals?\b/.test(label)) return 'final'
  return null
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

const stageConfig: Record<NationsStageId, { name: string; expected: number; twoLegged: boolean }> = {
  qf: { name: 'Quarter-finals', expected: 8, twoLegged: true },
  'ab-playoff': { name: 'League A/B play-offs', expected: 8, twoLegged: true },
  'bc-playoff': { name: 'League B/C play-offs', expected: 8, twoLegged: true },
  sf: { name: 'Semi-finals', expected: 2, twoLegged: false },
  'third-place': { name: 'Third-place match', expected: 1, twoLegged: false },
  final: { name: 'Final', expected: 1, twoLegged: false },
}

const stageOrder: NationsStageId[] = ['qf', 'ab-playoff', 'bc-playoff', 'sf', 'third-place', 'final']

interface ParsedKnockoutEvent {
  id: string
  kickoff: string
  home: TeamId
  away: TeamId
  leg?: 1 | 2
  score?: { home: number; away: number }
  penalties?: { home: number; away: number }
  afterExtraTime?: boolean
  liveStatus?: { kind: 'live' | 'delayed' }
}

function parseKnockoutEvent(raw: RawEvent): ParsedKnockoutEvent | null {
  const competition = raw.competitions?.[0]
  const home = competition?.competitors?.find((team) => team.homeAway === 'home')
  const away = competition?.competitors?.find((team) => team.homeAway === 'away')
  const homeId = home?.team?.id ? teamIdByEspnId.get(home.team.id) : undefined
  const awayId = away?.team?.id ? teamIdByEspnId.get(away.team.id) : undefined
  if (!raw.id || !raw.date || !homeId || !awayId) return null
  const parsed: ParsedKnockoutEvent = {
    id: `unl-${raw.id}`,
    kickoff: normaliseKickoff(raw.date),
    home: homeId,
    away: awayId,
  }
  const leg = competition?.leg?.value
  if (leg === 1 || leg === 2) parsed.leg = leg
  if (competition?.status?.type?.completed) {
    parsed.score = { home: Number(home.score ?? 0), away: Number(away.score ?? 0) }
    if (home.shootoutScore !== undefined && away.shootoutScore !== undefined) {
      parsed.penalties = { home: home.shootoutScore, away: away.shootoutScore }
      parsed.afterExtraTime = true
    } else if (/AET|pen/i.test(competition.status.type.detail ?? '')) {
      parsed.afterExtraTime = true
    }
  } else if (competition?.status?.type?.state === 'in') {
    parsed.liveStatus = { kind: 'live' }
  } else if (/delay|suspend|postpone/i.test(competition?.status?.type?.detail ?? '')) {
    parsed.liveStatus = { kind: 'delayed' }
  }
  return parsed
}

function groupRankRef(tournament: Tournament, team: TeamId): SlotRef | null {
  const group = tournament.groups.find((candidate) => candidate.teams.includes(team))
  if (!group) return null
  if (tournament.groupMatches.some((match) => match.group === group.id && !match.score)) return null
  const rank = groupStandings(tournament, group.id).findIndex((row) => row.team === team) + 1
  return rank > 0 ? { type: 'group-rank', group: group.id, rank } : null
}

function sourceRef(
  tournament: Tournament,
  team: TeamId,
  sourceRoundId: string,
  result: 'winner' | 'loser',
): SlotRef | null {
  const sourceRound = tournament.knockoutRounds.find((round) => round.id === sourceRoundId)
  if (!sourceRound) return null
  const ties = (tournament.ties ?? []).filter((tie) =>
    tie.legs.some((id) => sourceRound.matches.some((match) => match.id === id)) &&
    (tie.homeTeam === team || tie.awayTeam === team),
  )
  const singles = sourceRound.matches.filter((match) => !match.tie && (match.homeTeam === team || match.awayTeam === team))
  if (ties.length + singles.length !== 1) return null
  const source = ties[0]?.id ?? singles[0].id
  return { type: result === 'winner' ? 'match-winner' : 'match-loser', match: source }
}

function slotRef(tournament: Tournament, stage: NationsStageId, team: TeamId): SlotRef | null {
  if (stage === 'qf' || stage === 'ab-playoff' || stage === 'bc-playoff') return groupRankRef(tournament, team)
  if (stage === 'sf') return sourceRef(tournament, team, 'qf', 'winner')
  return sourceRef(tournament, team, 'sf', stage === 'third-place' ? 'loser' : 'winner')
}

function materializeStage(
  tournament: Tournament,
  stage: NationsStageId,
  rawEvents: RawEvent[],
): { round: KnockoutRound; ties: Tie[] } | null {
  const config = stageConfig[stage]
  if (rawEvents.length !== config.expected) return null
  const events = rawEvents.map(parseKnockoutEvent)
  if (events.some((event) => !event)) return null
  const parsed = events as ParsedKnockoutEvent[]
  const matches: KnockoutMatch[] = []
  const ties: Tie[] = []

  if (config.twoLegged) {
    const pairs = new Map<string, ParsedKnockoutEvent[]>()
    for (const event of parsed) {
      const key = [event.home, event.away].sort().join('|')
      pairs.set(key, [...(pairs.get(key) ?? []), event])
    }
    if (pairs.size !== config.expected / 2) return null
    for (const [pair, legs] of pairs) {
      legs.sort((a, b) => (a.leg ?? 0) - (b.leg ?? 0) || a.kickoff.localeCompare(b.kickoff))
      if (legs.length !== 2 || legs[0].leg !== 1 || legs[1].leg !== 2 ||
        legs[0].home !== legs[1].away || legs[0].away !== legs[1].home) return null
      const tieId = `unl-${stage}-${pair.toLowerCase().replace('|', '-')}`
      const tie: Tie = {
        id: tieId,
        legs: [legs[0].id, legs[1].id],
        homeTeam: legs[0].home,
        awayTeam: legs[0].away,
      }
      if (legs[0].score && legs[1].score) {
        tie.aggregate = {
          home: legs[0].score.home + legs[1].score.away,
          away: legs[0].score.away + legs[1].score.home,
        }
        if (tie.aggregate.home === tie.aggregate.away && legs[1].penalties) {
          tie.penalties = legs[1].home === tie.homeTeam
            ? legs[1].penalties
            : { home: legs[1].penalties.away, away: legs[1].penalties.home }
        }
        if (tie.aggregate.home !== tie.aggregate.away || tie.penalties) {
          const decider = tie.penalties ?? tie.aggregate
          tie.winner = decider.home > decider.away ? tie.homeTeam : tie.awayTeam
        }
      }
      for (const event of legs) {
        const home = slotRef(tournament, stage, event.home)
        const away = slotRef(tournament, stage, event.away)
        if (!home || !away) return null
        matches.push({
          id: event.id,
          tie: { id: tieId, leg: event.leg! },
          date: event.kickoff.slice(0, 10),
          kickoff: event.kickoff,
          home,
          away,
          homeTeam: event.home,
          awayTeam: event.away,
          ...(event.score ? { score: event.score } : {}),
          ...(event.liveStatus ? { liveStatus: event.liveStatus } : {}),
          ...(event.afterExtraTime ? { afterExtraTime: true } : {}),
        })
      }
      ties.push(tie)
    }
  } else {
    for (const event of parsed) {
      const home = slotRef(tournament, stage, event.home)
      const away = slotRef(tournament, stage, event.away)
      if (!home || !away) return null
      matches.push({
        id: event.id,
        date: event.kickoff.slice(0, 10),
        kickoff: event.kickoff,
        home,
        away,
        homeTeam: event.home,
        awayTeam: event.away,
        ...(event.score ? { score: event.score } : {}),
        ...(event.penalties ? { penalties: event.penalties } : {}),
        ...(event.afterExtraTime ? { afterExtraTime: true } : {}),
        ...(event.liveStatus ? { liveStatus: event.liveStatus } : {}),
      })
    }
  }
  matches.sort((a, b) => (a.kickoff ?? '').localeCompare(b.kickoff ?? '') || a.id.localeCompare(b.id))
  return { round: { id: stage, name: config.name, matches }, ties }
}

function addKnockoutStages(
  tournament: Tournament,
  events: RawEvent[],
  previous: Tournament | undefined,
  errors: string[],
  notices: string[],
): void {
  const byStage = new Map<NationsStageId, RawEvent[]>()
  for (const event of events) {
    const stage = stageIdForEvent(event)
    if (stage) byStage.set(stage, [...(byStage.get(stage) ?? []), event])
  }
  for (const stage of stageOrder) {
    const candidates = byStage.get(stage) ?? []
    const materialized = materializeStage(tournament, stage, candidates)
    const previousRound = previous?.knockoutRounds.find((round) => round.id === stage)
    if (materialized) {
      tournament.knockoutRounds.push(materialized.round)
      tournament.ties = [...(tournament.ties ?? []), ...materialized.ties]
    } else if (previousRound) {
      errors.push(`previously published ${stage} stage is incomplete or missing from the new snapshot`)
      tournament.knockoutRounds.push(previousRound)
      const ids = new Set(previousRound.matches.map((match) => match.tie?.id).filter(Boolean))
      tournament.ties = [...(tournament.ties ?? []), ...(previous?.ties ?? []).filter((tie) => ids.has(tie.id))]
    } else if (candidates.length > 0) {
      notices.push(`${stage} draw is incomplete (${candidates.length}/${stageConfig[stage].expected}); stage remains pending`)
    }
    if (tournament.knockoutRounds.some((round) => round.id === stage)) {
      for (const track of tournament.knockoutTracks ?? []) {
        track.pendingStages = track.pendingStages?.filter((pending) => pending.id !== stage)
      }
    }
  }
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

  if (input.previous) {
    const previousById = new Map(input.previous.groupMatches.map((match) => [match.id, match]))
    const currentById = new Map(matches.map((match) => [match.id, match]))
    for (const previous of input.previous.groupMatches) {
      const current = currentById.get(previous.id)
      if (!current) {
        errors.push(`previously known fixture ${previous.id} is missing from the new snapshot`)
        if (officialById.has(previous.id.replace(/^unl-/, ''))) matches.push(previous)
        continue
      }
      if (previous.score && !current.score) {
        errors.push(`event ${previous.id} lost finished score from the previous snapshot`)
        Object.assign(current, previous)
      }
    }
    for (const match of matches) {
      const previous = previousById.get(match.id)
      if (previous?.score && !match.score) Object.assign(match, previous)
    }
  }
  matches.sort((a, b) => (a.kickoff ?? '').localeCompare(b.kickoff ?? '') || a.id.localeCompare(b.id))

  const tournament = tournamentShell(groups, matches)
  addKnockoutStages(tournament, input.events, input.previous, errors, notices)
  return { tournament, audit: { errors, notices } }
}
