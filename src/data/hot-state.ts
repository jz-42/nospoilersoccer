import type { Goal, GroupMatch, KnockoutMatch, MatchLiveStatus, Score, Tournament } from './types'

export interface HotStateMatch {
  liveStatus: MatchLiveStatus | null
  score: Score | null
  goals: Goal[] | null
  penalties?: Score | null
  afterExtraTime?: boolean | null
  homeTeam?: string | null
  awayTeam?: string | null
}

export interface TournamentHotState {
  tournamentId: string
  matches: Record<string, HotStateMatch>
}

export interface FetchedTournamentHotState extends TournamentHotState {
  fetchedAt: number
}

function hasOwn(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function isLiveStatus(value: unknown): value is MatchLiveStatus {
  return (
    typeof value === 'object' &&
    value !== null &&
    hasOwn(value, 'kind') &&
    (((value as { kind?: unknown }).kind === 'live') || (value as { kind?: unknown }).kind === 'delayed')
  )
}

function isScore(value: unknown): value is Score {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { home?: unknown }).home === 'number' &&
    typeof (value as { away?: unknown }).away === 'number'
  )
}

function isGoals(value: unknown): value is Goal[] {
  return Array.isArray(value)
}

function isNullableField<T>(
  value: unknown,
  validator: (candidate: unknown) => candidate is T,
): value is T | null {
  return value === null || validator(value)
}

function isHotStateMatch(matchId: string, value: unknown): value is HotStateMatch {
  if (typeof value !== 'object' || value === null) return false
  if (!hasOwn(value, 'liveStatus') || !hasOwn(value, 'score') || !hasOwn(value, 'goals')) return false
  if (!isNullableField((value as { liveStatus?: unknown }).liveStatus, isLiveStatus)) return false
  if (!isNullableField((value as { score?: unknown }).score, isScore)) return false
  if (!isNullableField((value as { goals?: unknown }).goals, isGoals)) return false

  if (!matchId.startsWith('m')) return true

  if (!hasOwn(value, 'penalties') || !hasOwn(value, 'afterExtraTime') || !hasOwn(value, 'homeTeam') || !hasOwn(value, 'awayTeam')) {
    return false
  }
  if (!isNullableField((value as { penalties?: unknown }).penalties, isScore)) return false
  const afterExtraTime = (value as { afterExtraTime?: unknown }).afterExtraTime
  if (afterExtraTime !== null && typeof afterExtraTime !== 'boolean') return false
  const homeTeam = (value as { homeTeam?: unknown }).homeTeam
  if (homeTeam !== null && typeof homeTeam !== 'string') return false
  const awayTeam = (value as { awayTeam?: unknown }).awayTeam
  if (awayTeam !== null && typeof awayTeam !== 'string') return false
  return true
}

export function parseTournamentHotState(value: unknown): TournamentHotState | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as { tournamentId?: unknown; matches?: unknown }
  if (typeof candidate.tournamentId !== 'string') return null
  if (typeof candidate.matches !== 'object' || candidate.matches === null) return null
  for (const [matchId, hotMatch] of Object.entries(candidate.matches)) {
    if (!isHotStateMatch(matchId, hotMatch)) return null
  }
  return candidate as TournamentHotState
}

function groupMatchHotState(match: GroupMatch): HotStateMatch {
  return {
    liveStatus: match.liveStatus ?? null,
    score: match.score ?? null,
    goals: match.goals ?? null,
  }
}

function knockoutMatchHotState(match: KnockoutMatch): HotStateMatch {
  return {
    liveStatus: match.liveStatus ?? null,
    score: match.score ?? null,
    goals: match.goals ?? null,
    penalties: match.penalties ?? null,
    afterExtraTime: match.afterExtraTime ?? null,
    homeTeam: match.homeTeam ?? null,
    awayTeam: match.awayTeam ?? null,
  }
}

export function buildTournamentHotState(tournament: Tournament): TournamentHotState {
  const matches: Record<string, HotStateMatch> = {}

  for (const match of tournament.groupMatches) {
    matches[match.id] = groupMatchHotState(match)
  }
  for (const round of tournament.knockoutRounds) {
    for (const match of round.matches) {
      matches[match.id] = knockoutMatchHotState(match)
    }
  }

  return {
    tournamentId: tournament.id,
    matches,
  }
}

function applyGroupMatchHotState(match: GroupMatch, hot: HotStateMatch | undefined): GroupMatch {
  if (!hot) return match
  return {
    ...match,
    liveStatus: hasOwn(hot, 'liveStatus') ? (hot.liveStatus ?? undefined) : match.liveStatus,
    score: hasOwn(hot, 'score') ? (hot.score ?? undefined) : match.score,
    goals: hasOwn(hot, 'goals') ? (hot.goals ?? undefined) : match.goals,
  }
}

function applyKnockoutMatchHotState(match: KnockoutMatch, hot: HotStateMatch | undefined): KnockoutMatch {
  if (!hot) return match
  return {
    ...match,
    liveStatus: hasOwn(hot, 'liveStatus') ? (hot.liveStatus ?? undefined) : match.liveStatus,
    score: hasOwn(hot, 'score') ? (hot.score ?? undefined) : match.score,
    goals: hasOwn(hot, 'goals') ? (hot.goals ?? undefined) : match.goals,
    penalties: hasOwn(hot, 'penalties') ? (hot.penalties ?? undefined) : match.penalties,
    afterExtraTime: hasOwn(hot, 'afterExtraTime') ? (hot.afterExtraTime ?? undefined) : match.afterExtraTime,
    homeTeam: hasOwn(hot, 'homeTeam') ? (hot.homeTeam ?? undefined) : match.homeTeam,
    awayTeam: hasOwn(hot, 'awayTeam') ? (hot.awayTeam ?? undefined) : match.awayTeam,
  }
}

export function applyTournamentHotState(
  tournament: Tournament,
  hotState: TournamentHotState | null | undefined,
): Tournament {
  if (!hotState || hotState.tournamentId !== tournament.id) return tournament

  return {
    ...tournament,
    groupMatches: tournament.groupMatches.map((match) => applyGroupMatchHotState(match, hotState.matches[match.id])),
    knockoutRounds: tournament.knockoutRounds.map((round) => ({
      ...round,
      matches: round.matches.map((match) => applyKnockoutMatchHotState(match, hotState.matches[match.id])),
    })),
  }
}

export function applyHotStatePollFailure(
  hotState: FetchedTournamentHotState | null,
  now: number,
  staleMs: number,
): FetchedTournamentHotState | null {
  if (!hotState) return null
  return now - hotState.fetchedAt >= staleMs ? null : hotState
}
