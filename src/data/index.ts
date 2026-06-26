import type { HighlightVideo, Tournament } from './types'
import { highlightKey, preferredHighlightVideos } from './videos'
import { wc2022 } from './wc2022'
import { wc2026Entertainment } from './wc2026-entertainment'
import { wc2026 as wc2026Base } from './wc2026'
import { wc2026Videos } from './wc2026-videos'

/**
 * Fold the auto-curated highlight cuts (scripts/curate-videos.ts writes them
 * to wc2026-videos.ts) into the tournament. Provider duplicates are collapsed
 * to one cut per kind for the user, preferring YouTube over FOX when both are
 * available. Doing the merge here means the curator bot only ever writes its
 * own file, never the hand- and results-bot-maintained wc2026.ts.
 */
function withVideos(t: Tournament, extra: Record<string, HighlightVideo[]>): Tournament {
  const attach = <M extends { id: string; videos?: HighlightVideo[] }>(m: M): M => {
    const add = extra[m.id]
    if (!add?.length) return m
    const have = new Set((m.videos ?? []).map(highlightKey))
    const merged = preferredHighlightVideos([...(m.videos ?? []), ...add.filter((v) => !have.has(highlightKey(v)))])
    return { ...m, videos: merged }
  }
  return {
    ...t,
    groupMatches: t.groupMatches.map(attach),
    knockoutRounds: t.knockoutRounds.map((r) => ({ ...r, matches: r.matches.map(attach) })),
  }
}

function withEntertainment(
  t: Tournament,
  extra: Record<string, { entertainmentSummary: string; entertainmentRating: 1 | 2 | 3 | 4 | 5 }>,
): Tournament {
  const attach = <M extends { id: string; entertainmentSummary?: string; entertainmentRating?: 1 | 2 | 3 | 4 | 5 }>(m: M): M => {
    const add = extra[m.id]
    if (!add) return m
    return { ...m, entertainmentSummary: add.entertainmentSummary, entertainmentRating: add.entertainmentRating }
  }
  return {
    ...t,
    groupMatches: t.groupMatches.map(attach),
    knockoutRounds: t.knockoutRounds.map((r) => ({ ...r, matches: r.matches.map(attach) })),
  }
}

const wc2026 = withEntertainment(withVideos(wc2026Base, wc2026Videos), wc2026Entertainment)

export const tournaments: Record<string, Tournament> = {
  wc2026,
  wc2022,
}

export const defaultTournamentId = 'wc2026'

export * from './types'
