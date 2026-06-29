import { groupStandings } from '../src/data/standings'
import { matchLoser, matchWinner } from '../src/data/types'
import type { Goal, KnockoutMatch, SlotRef, TeamId, Tournament } from '../src/data/types'
import type { ParsedEvent } from './espn'

export interface ResultsAuditEntry {
  code:
    | 'fetch_day_failed'
    | 'group_apply_failed'
    | 'knockout_apply_failed'
    | 'knockout_unresolved'
    | 'knockout_ambiguous'
  day: string
  matchId?: string
  matchIds?: string[]
  note?: string
}

function tsGoals(goals: Goal[]): string {
  const items = goals.map((g) => {
    const parts = [
      `team: '${g.team}'`,
      `player: ${JSON.stringify(g.player)}`,
      `minute: ${JSON.stringify(g.minute)}`,
    ]
    if (g.penalty) parts.push('penalty: true')
    if (g.ownGoal) parts.push('ownGoal: true')
    return `{ ${parts.join(', ')} }`
  })
  return `goals: [${items.join(', ')}]`
}

function readObjectSpan(sourceText: string, start: number): { text: string; end: number } | null {
  let depth = 0
  let quote: string | null = null
  let escaped = false

  for (let i = start; i < sourceText.length; i += 1) {
    const ch = sourceText[i]

    if (quote) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === quote) {
        quote = null
      }
      continue
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      continue
    }
    if (ch === '{') depth += 1
    if (ch === '}') {
      depth -= 1
      if (depth === 0) return { text: sourceText.slice(start, i + 1), end: i + 1 }
    }
  }

  return null
}

function splitTopLevelProperties(objectText: string): string[] {
  const body = objectText.slice(1, -1)
  const parts: string[] = []
  let start = 0
  let braceDepth = 0
  let bracketDepth = 0
  let parenDepth = 0
  let quote: string | null = null
  let escaped = false

  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i]

    if (quote) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === quote) {
        quote = null
      }
      continue
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      continue
    }

    if (ch === '{') braceDepth += 1
    else if (ch === '}') braceDepth -= 1
    else if (ch === '[') bracketDepth += 1
    else if (ch === ']') bracketDepth -= 1
    else if (ch === '(') parenDepth += 1
    else if (ch === ')') parenDepth -= 1
    else if (ch === ',' && braceDepth === 0 && bracketDepth === 0 && parenDepth === 0) {
      const chunk = body.slice(start, i).trim()
      if (chunk) parts.push(chunk)
      start = i + 1
    }
  }

  const tail = body.slice(start).trim()
  if (tail) parts.push(tail)
  return parts
}

function propertyName(prop: string): string | null {
  return prop.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:/)?.[1] ?? null
}

function renderObject(properties: string[], singleLine: boolean, outerIndent: string): string {
  if (singleLine) return `{ ${properties.join(', ')} }`
  const innerIndent = `${outerIndent}  `
  return `{\n${innerIndent}${properties.join(`,\n${innerIndent}`)}\n${outerIndent}}`
}

type SlotMatchStatus = 'yes' | 'no' | 'undecided'

function findKnockout(tt: Tournament, id: string): KnockoutMatch | null {
  for (const round of tt.knockoutRounds) {
    const match = round.matches.find((candidate) => candidate.id === id)
    if (match) return match
  }
  return null
}

function slotMatchStatus(slot: SlotRef, team: TeamId, tt: Tournament): SlotMatchStatus {
  switch (slot.type) {
    case 'group-rank': {
      const rows = groupStandings(tt, slot.group)
      return rows[slot.rank - 1]?.team === team ? 'yes' : 'no'
    }
    case 'best-third':
      return slot.groups.some((group) => groupStandings(tt, group)[2]?.team === team) ? 'yes' : 'no'
    case 'match-winner': {
      const source = findKnockout(tt, slot.match)
      if (!source) return 'no'
      const winner = matchWinner(source)
      if (winner === null) return 'undecided'
      return winner === team ? 'yes' : 'no'
    }
    case 'match-loser': {
      const source = findKnockout(tt, slot.match)
      if (!source) return 'no'
      const loser = matchLoser(source)
      if (loser === null) return 'undecided'
      return loser === team ? 'yes' : 'no'
    }
  }
}

export function applyGroupResult(src: string, id: string, ev: ParsedEvent, flipped: boolean): string {
  const score = flipped ? { home: ev.score!.away, away: ev.score!.home } : ev.score!
  const insertion = `, score: { home: ${score.home}, away: ${score.away} }${ev.goals ? `, ${tsGoals(ev.goals)}` : ''}`
  const re = new RegExp(`(\\{ id: '${id}',[^\\n]*?away: '[A-Z0-9]{3}')`)
  if (!re.test(src)) throw new Error(`group_match_not_found:${id}`)
  return src.replace(re, (match) => match + insertion)
}

export function applyKnockoutResult(
  src: string,
  match: KnockoutMatch,
  ev: ParsedEvent,
  flipped: boolean,
): string {
  const homeTeam = flipped ? ev.awayTeam : ev.homeTeam
  const awayTeam = flipped ? ev.homeTeam : ev.awayTeam
  const score = flipped ? { home: ev.score!.away, away: ev.score!.home } : ev.score!
  const penalties = ev.penalties
    ? flipped
      ? { home: ev.penalties.away, away: ev.penalties.home }
      : ev.penalties
    : null

  const idIdx = src.indexOf(`id: '${match.id}',`)
  if (idIdx === -1) throw new Error(`knockout_match_not_found:${match.id}`)
  const start = src.lastIndexOf('{', idIdx)
  if (start === -1) throw new Error(`knockout_match_start_not_found:${match.id}`)
  const span = readObjectSpan(src, start)
  if (!span) throw new Error(`knockout_match_close_not_found:${match.id}`)

  const existing = splitTopLevelProperties(span.text).filter((prop) => {
    const name = propertyName(prop)
    return !['homeTeam', 'awayTeam', 'score', 'afterExtraTime', 'penalties', 'goals', 'kickoff'].includes(
      name ?? '',
    )
  })

  const updated = [...existing]
  updated.push(`kickoff: '${match.kickoff ?? ev.kickoff}'`)
  updated.push(`homeTeam: '${homeTeam}'`)
  updated.push(`awayTeam: '${awayTeam}'`)
  updated.push(`score: { home: ${score.home}, away: ${score.away} }`)
  if (ev.afterExtraTime || penalties) updated.push('afterExtraTime: true')
  if (penalties) updated.push(`penalties: { home: ${penalties.home}, away: ${penalties.away} }`)
  if (ev.goals) updated.push(tsGoals(ev.goals))

  const lineStart = src.lastIndexOf('\n', start) + 1
  const outerIndent = src.slice(lineStart, start)
  const replacement = renderObject(updated, !span.text.includes('\n'), outerIndent)
  return src.slice(0, start) + replacement + src.slice(span.end)
}

export type KnockoutTargetResult =
  | { status: 'ok'; match: KnockoutMatch; flipped: boolean }
  | { status: 'no_candidate_window' }
  | { status: 'unresolved'; matchId?: string; matchIds: string[] }
  | { status: 'ambiguous'; matchIds: string[] }

export function findKnockoutUpdateTarget(
  tt: Tournament,
  pendingKnockout: KnockoutMatch[],
  parsed: ParsedEvent,
): KnockoutTargetResult {
  const evDay = parsed.kickoff.slice(0, 10)
  const candidates = pendingKnockout.filter(
    (match) => Math.abs(new Date(match.date).getTime() - new Date(evDay).getTime()) < 2 * 86400e3,
  )
  if (candidates.length === 0) return { status: 'no_candidate_window' }

  const fits: Array<{ match: KnockoutMatch; flipped: boolean }> = []
  let unresolved = false

  for (const match of candidates) {
    const directHome = slotMatchStatus(match.home, parsed.homeTeam, tt)
    const directAway = slotMatchStatus(match.away, parsed.awayTeam, tt)
    const flippedHome = slotMatchStatus(match.home, parsed.awayTeam, tt)
    const flippedAway = slotMatchStatus(match.away, parsed.homeTeam, tt)

    if (directHome === 'yes' && directAway === 'yes') fits.push({ match, flipped: false })
    if (flippedHome === 'yes' && flippedAway === 'yes') fits.push({ match, flipped: true })

    if (
      fits.length === 0 &&
      [directHome, directAway, flippedHome, flippedAway].some((status) => status === 'undecided')
    ) {
      unresolved = true
    }
  }

  if (fits.length === 1) return { status: 'ok', match: fits[0].match, flipped: fits[0].flipped }
  if (fits.length === 0 && unresolved) {
    const matchIds = candidates.map((candidate) => candidate.id)
    return { status: 'unresolved', matchId: matchIds.length === 1 ? matchIds[0] : undefined, matchIds }
  }
  return { status: 'ambiguous', matchIds: candidates.map((candidate) => candidate.id) }
}

export function applyParsedEvents({
  tournament,
  sourceText,
  events,
  pendingGroup,
  pendingKnockout,
}: {
  tournament: Tournament
  sourceText: string
  events: ParsedEvent[]
  pendingGroup: Tournament['groupMatches']
  pendingKnockout: KnockoutMatch[]
}): { sourceText: string; updatedIds: string[]; audit: ResultsAuditEntry[] } {
  let nextSource = sourceText
  const updatedIds: string[] = []
  const audit: ResultsAuditEntry[] = []

  for (const parsed of events) {
    if (!parsed.completed || !parsed.score) continue

    const groupHit = pendingGroup.find(
      (match) =>
        (match.home === parsed.homeTeam && match.away === parsed.awayTeam) ||
        (match.home === parsed.awayTeam && match.away === parsed.homeTeam),
    )
    if (groupHit) {
      try {
        nextSource = applyGroupResult(nextSource, groupHit.id, parsed, groupHit.home !== parsed.homeTeam)
        groupHit.score = groupHit.home === parsed.homeTeam ? parsed.score : { home: parsed.score.away, away: parsed.score.home }
        if (parsed.goals) groupHit.goals = parsed.goals
        updatedIds.push(groupHit.id)
        pendingGroup.splice(pendingGroup.indexOf(groupHit), 1)
      } catch (error) {
        audit.push({
          code: 'group_apply_failed',
          day: parsed.kickoff.slice(0, 10).replaceAll('-', ''),
          matchId: groupHit.id,
          note: error instanceof Error ? error.message.split(':')[0] : 'group_apply_failed',
        })
      }
      continue
    }

    const target = findKnockoutUpdateTarget(tournament, pendingKnockout, parsed)
    if (target.status === 'no_candidate_window') continue
    if (target.status === 'unresolved') {
      audit.push({
        code: 'knockout_unresolved',
        day: parsed.kickoff.slice(0, 10).replaceAll('-', ''),
        matchId: target.matchId,
        matchIds: target.matchIds,
        note: 'waiting_for_feeders',
      })
      continue
    }
    if (target.status === 'ambiguous') {
      audit.push({
        code: 'knockout_ambiguous',
        day: parsed.kickoff.slice(0, 10).replaceAll('-', ''),
        matchIds: target.matchIds,
      })
      continue
    }

    try {
      nextSource = applyKnockoutResult(nextSource, target.match, parsed, target.flipped)
      target.match.homeTeam = target.flipped ? parsed.awayTeam : parsed.homeTeam
      target.match.awayTeam = target.flipped ? parsed.homeTeam : parsed.awayTeam
      target.match.score = target.flipped ? { home: parsed.score.away, away: parsed.score.home } : parsed.score
      target.match.afterExtraTime = parsed.afterExtraTime || undefined
      target.match.penalties = parsed.penalties
        ? target.flipped
          ? { home: parsed.penalties.away, away: parsed.penalties.home }
          : parsed.penalties
        : undefined
      if (parsed.goals) target.match.goals = parsed.goals
      if (!target.match.kickoff) target.match.kickoff = parsed.kickoff
      updatedIds.push(target.match.id)
      pendingKnockout.splice(pendingKnockout.indexOf(target.match), 1)
    } catch (error) {
      audit.push({
        code: 'knockout_apply_failed',
        day: parsed.kickoff.slice(0, 10).replaceAll('-', ''),
        matchId: target.match.id,
        note: error instanceof Error ? error.message.split(':')[0] : 'knockout_apply_failed',
      })
    }
  }

  return { sourceText: nextSource, updatedIds, audit }
}

export function summarizeResultsAudit(entries: ResultsAuditEntry[]): string {
  if (entries.length === 0) return ''
  return entries
    .map((entry) => {
      const ids = entry.matchId
        ? entry.matchId
        : entry.matchIds && entry.matchIds.length > 0
          ? entry.matchIds.join(', ')
          : 'none'
      const note = entry.note ? ` ${entry.note}` : ''
      return `- ${entry.day} ${ids} ${entry.code}${note}`
    })
    .join('\n')
}
