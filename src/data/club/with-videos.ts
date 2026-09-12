import type { HighlightVideo, Tournament } from '../types'

/**
 * Fold the curator's cuts into a generated season.
 *
 * Same split as the World Cup (see src/data/wc2026-videos.ts): the fixtures
 * file belongs to the results bot, the videos file to the curator, and neither
 * ever writes the other's. That is what lets scripts/espn-club.ts rewrite a
 * whole season from the feed without a curated highlight ever going missing.
 *
 * Club cuts carry no `durationSeconds` on purpose — one cut per match, and no
 * runtime shown anywhere on a club match. That is enforced in the data rather
 * than the UI, so nothing here should ever add the field back.
 *
 * Append-only, like the curator that writes the map: a match that already
 * carries a video keeps it.
 */
export function withClubVideos(
  t: Tournament,
  videos: Record<string, HighlightVideo[]>,
): Tournament {
  const attach = <M extends { id: string; videos?: HighlightVideo[] }>(m: M): M => {
    const add = videos[m.id]
    if (!add?.length || m.videos?.length) return m
    return { ...m, videos: add }
  }
  return {
    ...t,
    groupMatches: t.groupMatches.map(attach),
    knockoutRounds: t.knockoutRounds.map((r) => ({ ...r, matches: r.matches.map(attach) })),
  }
}
