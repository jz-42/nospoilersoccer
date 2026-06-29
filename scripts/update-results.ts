/**
 * Daily results updater for World Cup 2026 — run by the scheduled GitHub
 * Action (or by hand: `npx tsx scripts/update-results.ts`).
 *
 * Fetches finished matches from ESPN's public scoreboard and writes scores,
 * goals, penalties, and resolved knockout teams into src/data/wc2026.ts.
 * Only matches that don't have a score yet are touched, and `npm run check`
 * must pass afterwards (the workflow refuses to commit otherwise).
 *
 * Knockout events are matched to bracket slots by checking which slot each
 * team can legally fill (group winner/runner-up via recomputed standings,
 * best-third membership, or feeder-match winner/loser).
 */
import { readFileSync, writeFileSync } from 'fs'
import { tournaments } from '../src/data'
import { fetchDay, parseEvent } from './espn'
import {
  applyParsedEvents,
  summarizeResultsAudit,
  type ResultsAuditEntry,
} from './update-results-lib'

const FILE = 'src/data/wc2026.ts'
const t = tournaments.wc2026

export async function runUpdateResults({
  today = new Date().toISOString().slice(0, 10),
  resultsAuditFile = process.env.RESULTS_AUDIT_FILE,
}: {
  today?: string
  resultsAuditFile?: string
} = {}): Promise<{ updated: string[]; audit: ResultsAuditEntry[] }> {
  let sourceText = readFileSync(FILE, 'utf8')
  const updated: string[] = []
  const audit: ResultsAuditEntry[] = []

  const pendingGroup = t.groupMatches.filter((match) => match.score === undefined && match.date <= today)
  const pendingKnockout = t.knockoutRounds
    .flatMap((round) => round.matches)
    .filter((match) => match.score === undefined && match.date <= today)

  const days = new Set([...pendingGroup, ...pendingKnockout].map((match) => match.date.replaceAll('-', '')))

  for (const day of [...days].sort()) {
    let events
    try {
      events = await fetchDay(day)
    } catch (error) {
      const note = error instanceof Error ? error.message : String(error)
      console.error(`results audit ${day}: fetch_day_failed`)
      audit.push({ code: 'fetch_day_failed', day, note })
      continue
    }

    const parsedEvents = events
      .map((event) => parseEvent(t, event))
      .filter((event): event is NonNullable<typeof event> => event !== null)

    const applied = applyParsedEvents({
      tournament: t,
      sourceText,
      events: parsedEvents,
      pendingGroup,
      pendingKnockout,
    })

    sourceText = applied.sourceText
    updated.push(...applied.updatedIds)
    audit.push(...applied.audit)
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  if (updated.length > 0) {
    writeFileSync(FILE, sourceText)
    console.log(`updated ${updated.length} match(es):`)
    for (const id of updated) console.log(`  ${id}`)
  } else {
    console.log('no new results')
  }

  if (audit.length > 0) {
    const summary = summarizeResultsAudit(audit)
    for (const entry of audit) {
      const ids = entry.matchId ?? entry.matchIds?.join(', ') ?? 'none'
      console.log(`results audit ${entry.day} ${ids}: ${entry.code}${entry.note ? ` (${entry.note})` : ''}`)
    }
    if (resultsAuditFile && summary) writeFileSync(resultsAuditFile, `${summary}\n`)
  }

  return { updated, audit }
}

if (import.meta.main) {
  await runUpdateResults()
}
