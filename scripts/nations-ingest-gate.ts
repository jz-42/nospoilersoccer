import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { unl2026 } from '../src/data/nations/unl-2026'
import { unl2026Videos } from '../src/data/nations/unl-2026-videos'
import { buildWindowReport, parseMatchKickoffs } from '../cloudflare-scheduler/index.mjs'

const HIGHLIGHT_GAP_START_MINUTES = 105
const HIGHLIGHT_GAP_HOURS = 72

type GapMatch = { id: string; kickoff?: string; score?: unknown }
type GapTournament = {
  groupMatches: readonly GapMatch[]
  knockoutRounds?: readonly { matches: readonly GapMatch[] }[]
}

/** A finished fixture still waiting for a cut, from full time through 72 hours. */
export function hasNationsHighlightGap(
  tournament: GapTournament,
  videos: Readonly<Record<string, readonly unknown[]>>,
  now: Date,
): boolean {
  const earliest = now.getTime() - HIGHLIGHT_GAP_HOURS * 60 * 60 * 1000
  const latest = now.getTime() - HIGHLIGHT_GAP_START_MINUTES * 60 * 1000
  const matches = [
    ...tournament.groupMatches,
    ...(tournament.knockoutRounds ?? []).flatMap((round) => round.matches),
  ]
  return matches.some((match) => {
    if (!match.kickoff || match.score == null) return false
    const kickoff = Date.parse(match.kickoff)
    if (!Number.isFinite(kickoff) || kickoff < earliest || kickoff > latest) return false
    return (videos[match.id]?.length ?? 0) === 0
  })
}

export function shouldRunNationsIngest(input: {
  insideWindow: boolean
  pendingStageCount: number
  highlightGap?: boolean
  cycle: number
  now: Date
}): boolean {
  if (input.insideWindow) return true
  if (input.cycle !== 1) return false
  if (input.highlightGap) return true
  return input.pendingStageCount > 0 && input.now.getUTCHours() % 6 === 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cycle = Number(process.argv[2])
  if (!Number.isSafeInteger(cycle) || cycle < 1) throw new Error('expected a positive updater cycle number')
  const now = new Date()
  const source = readFileSync(new URL('../src/data/nations/unl-2026.ts', import.meta.url), 'utf8')
  const insideWindow = buildWindowReport(parseMatchKickoffs(source, 'unl-2026'), now).insideWindow
  const pendingStageCount = unl2026.knockoutTracks?.reduce(
    (count, track) => count + (track.pendingStages?.length ?? 0), 0,
  ) ?? 0
  const highlightGap = hasNationsHighlightGap(unl2026, unl2026Videos, now)
  process.exitCode = shouldRunNationsIngest({ insideWindow, pendingStageCount, highlightGap, cycle, now }) ? 0 : 1
}
