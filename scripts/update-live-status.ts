import { readFileSync, writeFileSync } from 'fs'
import { tournaments } from '../src/data'
import { groupStandings, type StandingRow } from '../src/data/standings'
import {
  matchLoser,
  matchWinner,
  type GroupId,
  type GroupMatch,
  type KnockoutMatch,
  type SlotRef,
} from '../src/data/types'
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

function findKnockoutMatch(tournament: typeof t, id: string): KnockoutMatch | null {
  for (const round of tournament.knockoutRounds) {
    const match = round.matches.find((candidate) => candidate.id === id)
    if (match) return match
  }
  return null
}

function groupIsSettled(tournament: typeof t, group: string): boolean {
  return tournament.groupMatches.every((match) => match.group !== group || match.score !== undefined)
}

function thirdRowsTied(a: StandingRow, b: StandingRow): boolean {
  const goalDifference = (row: StandingRow) => row.goalsFor - row.goalsAgainst
  return a.points === b.points && goalDifference(a) === goalDifference(b) && a.goalsFor === b.goalsFor
}

function bestThirdSlotTeam(tournament: typeof t, match: KnockoutMatch, side: 'home' | 'away'): string | null {
  const count = tournament.bestThirdCount
  const allocation = tournament.bestThirdAllocation
  if (!count || !allocation || !tournament.groups.every((group) => groupIsSettled(tournament, group.id))) return null

  const thirds = tournament.groups
    .map((group) => ({ group: group.id, row: groupStandings(tournament, group.id)[2] }))
    .filter((entry): entry is { group: GroupId; row: NonNullable<typeof entry.row> } => entry.row !== undefined)
    .sort((a, b) => {
      const goalDifference = (row: typeof a.row) => row.goalsFor - row.goalsAgainst
      return (
        b.row.points - a.row.points ||
        goalDifference(b.row) - goalDifference(a.row) ||
        b.row.goalsFor - a.row.goalsFor
      )
    })
  if (thirds.length < count) return null
  if (thirds.length > count && thirdRowsTied(thirds[count - 1].row, thirds[count].row)) return null

  const allocationRow = allocation[thirds.slice(0, count).map((entry) => entry.group).sort().join('')]
  if (!allocationRow) return null

  const otherSlot = side === 'home' ? match.away : match.home
  if (otherSlot.type !== 'group-rank') return null

  const assignedGroup = allocationRow[otherSlot.group]
  if (!assignedGroup) return null
  return groupStandings(tournament, assignedGroup)[2]?.team ?? null
}

function resolveCandidateSlotTeam(tournament: typeof t, match: KnockoutMatch, side: 'home' | 'away'): string | null {
  const slot = side === 'home' ? match.home : match.away
  switch (slot.type) {
    case 'group-rank':
      if (!groupIsSettled(tournament, slot.group)) return null
      return groupStandings(tournament, slot.group)[slot.rank - 1]?.team ?? null
    case 'match-winner': {
      const match = findKnockoutMatch(tournament, slot.match)
      return match ? matchWinner(match) : null
    }
    case 'match-loser': {
      const match = findKnockoutMatch(tournament, slot.match)
      return match ? matchLoser(match) : null
    }
    case 'best-third':
      return bestThirdSlotTeam(tournament, match, side)
  }
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
      const homeTeam = match.homeTeam ?? resolveCandidateSlotTeam(tournament, match, 'home')
      const awayTeam = match.awayTeam ?? resolveCandidateSlotTeam(tournament, match, 'away')
      if (!homeTeam || !awayTeam) continue
      candidates.push({
        id: match.id,
        date: match.date,
        kickoff: match.kickoff,
        homeTeam,
        awayTeam,
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

export function liveStatusDaysToPoll(tournament: typeof t, today: string) {
  const eligible: Array<GroupMatch | KnockoutMatch> = [
    ...tournament.groupMatches.filter(
      (match) => match.date <= today && (match.score === undefined || match.liveStatus !== undefined),
    ),
    ...tournament.knockoutRounds
      .flatMap((round) => round.matches)
      .filter((match) => match.date <= today && (match.score === undefined || match.liveStatus !== undefined)),
  ]
  return [...new Set(eligible.map((match) => match.date.replaceAll('-', '')))].sort()
}

function statusTypeNote(event: Awaited<ReturnType<typeof fetchDay>>[number]): string {
  const statusType = event.competitions?.[0]?.status?.type
  return `${statusType?.state ?? 'unknown'}:${statusType?.detail ?? 'unknown'}`
}

export function mapLiveStatusEventsForDay(
  tournament: typeof t,
  day: string,
  events: Awaited<ReturnType<typeof fetchDay>>,
): { events: ParsedLiveStatusEvent[]; audit: LiveStatusAuditEntry[] } {
  const mapped: ParsedLiveStatusEvent[] = []
  const audit: LiveStatusAuditEntry[] = []

  for (const event of events) {
    const parsed = parseEvent(tournament, event)
    if (!parsed) {
      audit.push({
        code: 'live_status_parse_failed',
        day,
        note: statusTypeNote(event),
      })
      continue
    }
    const matchId = resolveLiveStatusMatchId(tournament, parsed)
    if (!matchId) {
      audit.push({
        code: 'live_status_unmapped_match',
        day,
        note: `${parsed.homeTeam}-${parsed.awayTeam}@${parsed.kickoff}`,
      })
      continue
    }
    if (parsed.liveStatusMode === 'ignore') {
      audit.push({
        code: 'live_status_unmapped_match',
        day,
        matchId,
        note: `unrecognized_status:${statusTypeNote(event)}`,
      })
      continue
    }
    if (parsed.liveStatusMode === 'clear') {
      mapped.push({ day, matchId, action: 'clear' })
      continue
    }
    mapped.push({ day, matchId, action: 'set', liveStatus: parsed.liveStatus! })
  }

  return { events: mapped, audit }
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

  for (const day of liveStatusDaysToPoll(t, today)) {
    let events
    try {
      events = await fetchDay(day)
    } catch (error) {
      const note = error instanceof Error ? error.message : String(error)
      audit.push({ code: 'live_status_fetch_failed', day, note })
      continue
    }

    const mappedDay = mapLiveStatusEventsForDay(t, day, events)
    const applied = applyParsedStatuses({ sourceText, events: mappedDay.events })
    sourceText = applied.sourceText
    updated.push(...applied.updatedIds)
    audit.push(...mappedDay.audit)
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
      console.log(`live-status audit ${entry.day} ${id}: ${entry.code}`)
    }
    if (liveStatusAuditFile && summary) writeFileSync(liveStatusAuditFile, `${summary}\n`)
  }

  return { updated, audit }
}

if (import.meta.main) {
  await runUpdateLiveStatus()
}
