import type { HighlightVideo, Tournament } from './types'
import { wc2022 } from './wc2022'
import { wc2026 as wc2026Base } from './wc2026'
import { wc2026Videos } from './wc2026-videos'

/**
 * Fold the auto-curated highlight cuts (scripts/curate-videos.ts writes them to
 * wc2026-videos.ts) into the tournament. Any video already inline in the data
 * wins; new cuts are unioned in, deduped by youtube id. Doing the merge here
 * means the curator bot only ever writes its own file, never the hand- and
 * results-bot-maintained wc2026.ts.
 */
function withVideos(t: Tournament, extra: Record<string, HighlightVideo[]>): Tournament {
  const attach = <M extends { id: string; videos?: HighlightVideo[] }>(m: M): M => {
    const add = extra[m.id]
    if (!add?.length) return m
    const have = new Set((m.videos ?? []).map((v) => v.youtubeId))
    const merged = [...(m.videos ?? []), ...add.filter((v) => !have.has(v.youtubeId))]
    return { ...m, videos: merged }
  }
  return {
    ...t,
    groupMatches: t.groupMatches.map(attach),
    knockoutRounds: t.knockoutRounds.map((r) => ({ ...r, matches: r.matches.map(attach) })),
  }
}

const wc2026 = withVideos(wc2026Base, wc2026Videos)

export const tournaments: Record<string, Tournament> = {
  wc2026,
  wc2022,
}

export const defaultTournamentId = 'wc2026'

export * from './types'
