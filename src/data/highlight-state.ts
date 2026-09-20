import type { HighlightVideo, Tournament } from './types'
import { highlightKey } from './videos'

export interface RuntimeHighlightState {
  schemaVersion: 1
  tournamentId: string
  version: number
  generatedAt: string
  matches: Record<string, HighlightVideo[]>
}

export interface FetchedRuntimeHighlightState extends RuntimeHighlightState {
  fetchedAt: number
}

export interface RuntimeHighlightFetchResult {
  state: FetchedRuntimeHighlightState | null
  etag: string | null
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isHighlightVideo(value: unknown): value is HighlightVideo {
  if (!isPlainObject(value)) return false
  if (value.kind !== 'normal' && value.kind !== 'extended') return false
  if (value.source === 'fox') {
    return typeof value.foxId === 'string' && value.foxId.length > 0 && value.youtubeId === undefined
  }
  const publisherValid =
    value.publisher === undefined ||
    value.publisher === 'espn-fc' ||
    value.publisher === 'espn-deportes'
  return (
    (value.source === undefined || value.source === 'youtube') &&
    typeof value.youtubeId === 'string' &&
    /^[A-Za-z0-9_-]{11}$/.test(value.youtubeId) &&
    publisherValid &&
    value.foxId === undefined
  )
}

export function parseRuntimeHighlightState(value: unknown): RuntimeHighlightState | null {
  if (!isPlainObject(value)) return null
  if (value.schemaVersion !== 1) return null
  if (typeof value.tournamentId !== 'string' || value.tournamentId.length === 0) return null
  if (!Number.isSafeInteger(value.version) || (value.version as number) < 0) return null
  if (typeof value.generatedAt !== 'string' || !Number.isFinite(Date.parse(value.generatedAt))) return null
  if (!isPlainObject(value.matches)) return null

  for (const [matchId, videos] of Object.entries(value.matches)) {
    if (!matchId || !Array.isArray(videos) || !videos.every(isHighlightVideo)) return null
  }
  return value as unknown as RuntimeHighlightState
}

function appendRuntimeVideos<M extends { id: string; videos?: HighlightVideo[] }>(
  match: M,
  additions: Record<string, HighlightVideo[]>,
): M {
  const incoming = additions[match.id]
  if (!incoming?.length) return match

  const videos = [...(match.videos ?? [])]
  const keys = new Set(videos.map(highlightKey))
  const kinds = new Set(videos.map((video) => video.kind))
  for (const video of incoming) {
    const key = highlightKey(video)
    if (keys.has(key) || kinds.has(video.kind)) continue
    videos.push(video)
    keys.add(key)
    kinds.add(video.kind)
  }
  return videos.length === (match.videos?.length ?? 0) ? match : { ...match, videos }
}

export function applyRuntimeHighlightState(
  tournament: Tournament,
  state: RuntimeHighlightState | null | undefined,
): Tournament {
  if (!state || state.tournamentId !== tournament.id) return tournament
  return {
    ...tournament,
    groupMatches: tournament.groupMatches.map((match) => appendRuntimeVideos(match, state.matches)),
    knockoutRounds: tournament.knockoutRounds.map((round) => ({
      ...round,
      matches: round.matches.map((match) => appendRuntimeVideos(match, state.matches)),
    })),
  }
}

export function buildRuntimeHighlightState(
  tournament: Tournament,
  version: number,
  generatedAt = new Date().toISOString(),
): RuntimeHighlightState {
  const matches: Record<string, HighlightVideo[]> = {}
  for (const match of [
    ...tournament.groupMatches,
    ...tournament.knockoutRounds.flatMap((round) => round.matches),
  ]) {
    if (match.videos?.length) matches[match.id] = [...match.videos]
  }
  return {
    schemaVersion: 1,
    tournamentId: tournament.id,
    version,
    generatedAt,
    matches,
  }
}

export function applyHighlightStatePollFailure(
  state: FetchedRuntimeHighlightState | null,
  now: number,
  staleMs: number,
): FetchedRuntimeHighlightState | null {
  if (!state) return null
  return now - state.fetchedAt >= staleMs ? null : state
}

export async function fetchRuntimeHighlightState(
  url: string,
  current: FetchedRuntimeHighlightState | null,
  etag: string | null,
  now: number,
  staleMs: number,
  fetchImpl: FetchLike = fetch,
): Promise<RuntimeHighlightFetchResult> {
  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        ...(etag ? { 'If-None-Match': etag } : {}),
      },
    })
    if (response.status === 304 && current) {
      return { state: { ...current, fetchedAt: now }, etag }
    }
    if (!response.ok) {
      const state = applyHighlightStatePollFailure(current, now, staleMs)
      return { state, etag: state ? etag : null }
    }
    const parsed = parseRuntimeHighlightState(await response.json())
    if (!parsed) {
      const state = applyHighlightStatePollFailure(current, now, staleMs)
      return { state, etag: state ? etag : null }
    }
    return {
      state: { ...parsed, fetchedAt: now },
      etag: response.headers.get('etag'),
    }
  } catch {
    const state = applyHighlightStatePollFailure(current, now, staleMs)
    return { state, etag: state ? etag : null }
  }
}
