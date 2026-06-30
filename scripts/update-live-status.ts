import { readFileSync, writeFileSync } from 'fs'
import { tournaments } from '../src/data'
import type { GroupMatch, KnockoutMatch } from '../src/data/types'
import { fetchDay, parseEvent } from './espn'
import {
  applyParsedStatuses,
  summarizeLiveStatusAudit,
  type LiveStatusAuditEntry,
  type ParsedLiveStatusEvent,
} from './update-live-status-lib'

const FILE = 'src/data/wc2026.ts'
const t = tournaments.wc2026

function matchLookupKey(kickoff: string | undefined, home: string | undefined, away: string | undefined): string | null {
  if (!kickoff || !home || !away) return null
  return `${kickoff}|${home}|${away}`
}

function buildMatchLookup() {
  const lookup = new Map<string, string>()

  for (const match of t.groupMatches) {
    const key = matchLookupKey(match.kickoff, match.home, match.away)
    if (key) lookup.set(key, match.id)
  }
  for (const round of t.knockoutRounds) {
    for (const match of round.matches) {
      const key = matchLookupKey(match.kickoff, match.homeTeam, match.awayTeam)
      if (key) lookup.set(key, match.id)
    }
  }

  return lookup
}

function daysToPoll(today: string) {
  const eligible: Array<GroupMatch | KnockoutMatch> = [
    ...t.groupMatches.filter((match) => match.date <= today),
    ...t.knockoutRounds.flatMap((round) => round.matches).filter((match) => match.date <= today),
  ]
  return [...new Set(eligible.map((match) => match.date.replaceAll('-', '')))].sort()
}

export async function runUpdateLiveStatus({
  today = new Date().toISOString().slice(0, 10),
  liveStatusAuditFile = process.env.LIVE_STATUS_AUDIT_FILE,
}: {
  today?: string
  liveStatusAuditFile?: string
} = {}): Promise<{ updated: string[]; audit: LiveStatusAuditEntry[] }> {
  let sourceText = readFileSync(FILE, 'utf8')
  const updated: string[] = []
  const audit: LiveStatusAuditEntry[] = []
  const lookup = buildMatchLookup()

  for (const day of daysToPoll(today)) {
    let events
    try {
      events = await fetchDay(day)
    } catch (error) {
      const note = error instanceof Error ? error.message : String(error)
      audit.push({ code: 'live_status_fetch_failed', day, note })
      continue
    }

    const mapped: ParsedLiveStatusEvent[] = []
    for (const event of events) {
      const parsed = parseEvent(t, event)
      if (!parsed) continue
      const key = matchLookupKey(parsed.kickoff, parsed.homeTeam, parsed.awayTeam)
      const matchId = key ? lookup.get(key) : undefined
      if (!matchId) {
        audit.push({
          code: 'live_status_unmapped_match',
          day,
          note: `${parsed.homeTeam}-${parsed.awayTeam}@${parsed.kickoff}`,
        })
        continue
      }
      mapped.push({ day, matchId, liveStatus: parsed.liveStatus })
    }

    const applied = applyParsedStatuses({ sourceText, events: mapped })
    sourceText = applied.sourceText
    updated.push(...applied.updatedIds)
    audit.push(...applied.audit)
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  if (updated.length > 0) {
    writeFileSync(FILE, sourceText)
    console.log(`updated live status for ${updated.length} match(es):`)
    for (const id of updated) console.log(`  ${id}`)
  } else {
    console.log('no live-status changes')
  }

  if (audit.length > 0) {
    const summary = summarizeLiveStatusAudit(audit)
    for (const entry of audit) {
      const id = entry.matchId ?? 'none'
      console.log(`live-status audit ${entry.day} ${id}: ${entry.code}${entry.note ? ` (${entry.note})` : ''}`)
    }
    if (liveStatusAuditFile && summary) writeFileSync(liveStatusAuditFile, `${summary}\n`)
  }

  return { updated, audit }
}

if (import.meta.main) {
  await runUpdateLiveStatus()
}
