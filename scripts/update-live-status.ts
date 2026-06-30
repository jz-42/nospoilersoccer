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

interface LiveStatusMatchCandidate {
  id: string
  date: string
  kickoff?: string
  homeTeam: string
  awayTeam: string
  played: boolean
}

function buildLiveStatusCandidates(tournament = t): LiveStatusMatchCandidate[] {
  const candidates: LiveStatusMatchCandidate[] = []

  for (const match of tournament.groupMatches) {
    candidates.push({
      id: match.id,
      date: match.date,
      kickoff: match.kickoff,
      homeTeam: match.home,
      awayTeam: match.away,
      played: match.score !== undefined,
    })
  }
  for (const round of tournament.knockoutRounds) {
    for (const match of round.matches) {
      if (!match.homeTeam || !match.awayTeam) continue
      candidates.push({
        id: match.id,
        date: match.date,
        kickoff: match.kickoff,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        played: match.score !== undefined,
      })
    }
  }

  return candidates
}

function matchInstant(candidate: LiveStatusMatchCandidate): number {
  return candidate.kickoff
    ? new Date(candidate.kickoff).getTime()
    : new Date(`${candidate.date}T12:00:00Z`).getTime()
}

export function resolveLiveStatusMatchId(
  tournament: typeof t,
  parsed: { homeTeam: string; awayTeam: string; kickoff: string },
): string | null {
  const candidates = buildLiveStatusCandidates(tournament).filter(
    (candidate) => candidate.homeTeam === parsed.homeTeam && candidate.awayTeam === parsed.awayTeam,
  )
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0].id

  const unplayed = candidates.filter((candidate) => !candidate.played)
  if (unplayed.length === 1) return unplayed[0].id

  const ranked = (unplayed.length > 0 ? unplayed : candidates)
    .map((candidate) => ({
      candidate,
      distance: Math.abs(matchInstant(candidate) - new Date(parsed.kickoff).getTime()),
    }))
    .sort((a, b) => a.distance - b.distance)
  if (ranked.length === 1) return ranked[0].candidate.id
  if (ranked[0].distance !== ranked[1].distance) return ranked[0].candidate.id
  return null
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
      const matchId = resolveLiveStatusMatchId(t, parsed)
      if (!matchId) {
        audit.push({
          code: 'live_status_unmapped_match',
          day,
          note: `${parsed.homeTeam}-${parsed.awayTeam}@${parsed.kickoff}`,
        })
        continue
      }
      if (parsed.liveStatusMode === 'ignore') {
        const statusType = event.competitions?.[0]?.status?.type
        audit.push({
          code: 'live_status_unmapped_match',
          day,
          matchId,
          note: `unrecognized_status:${statusType?.state ?? 'unknown'}:${statusType?.detail ?? 'unknown'}`,
        })
        continue
      }
      if (parsed.liveStatusMode === 'clear') {
        mapped.push({ day, matchId, action: 'clear' })
        continue
      }
      mapped.push({ day, matchId, action: 'set', liveStatus: parsed.liveStatus! })
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
