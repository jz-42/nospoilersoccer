import type { MatchLiveStatus } from '../src/data/types'

export interface LiveStatusAuditEntry {
  code:
    | 'live_status_apply_failed'
    | 'live_status_unmapped_match'
    | 'live_status_fetch_failed'
  day: string
  matchId?: string
  note?: string
}

export interface ParsedLiveStatusEvent {
  day: string
  matchId: string
  liveStatus?: MatchLiveStatus
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

function insertLiveStatusProperty(properties: string[], liveStatus: MatchLiveStatus): string[] {
  const prop = `liveStatus: { kind: '${liveStatus.kind}' }`
  const insertAfter = properties.findIndex((candidate) => {
    const name = propertyName(candidate)
    return name === 'awayTeam' || name === 'away'
  })
  if (insertAfter === -1) return [...properties, prop]
  return [...properties.slice(0, insertAfter + 1), prop, ...properties.slice(insertAfter + 1)]
}

function existingLiveStatusKind(objectText: string): MatchLiveStatus['kind'] | null {
  return objectText.match(/liveStatus:\s*\{\s*kind:\s*'(live|delayed)'\s*\}/)?.[1] ?? null
}

function applyLiveStatusToMatch(
  sourceText: string,
  matchId: string,
  liveStatus?: MatchLiveStatus,
): { sourceText: string; changed: boolean } {
  const idIdx = sourceText.indexOf(`id: '${matchId}',`)
  if (idIdx === -1) throw new Error(`live_status_match_not_found:${matchId}`)
  const start = sourceText.lastIndexOf('{', idIdx)
  if (start === -1) throw new Error(`live_status_match_start_not_found:${matchId}`)
  const span = readObjectSpan(sourceText, start)
  if (!span) throw new Error(`live_status_match_close_not_found:${matchId}`)

  const currentKind = existingLiveStatusKind(span.text)
  if (currentKind === (liveStatus?.kind ?? null)) {
    return { sourceText, changed: false }
  }

  const existing = splitTopLevelProperties(span.text).filter((prop) => propertyName(prop) !== 'liveStatus')
  const updated = liveStatus ? insertLiveStatusProperty(existing, liveStatus) : existing
  const lineStart = sourceText.lastIndexOf('\n', start) + 1
  const outerIndent = sourceText.slice(lineStart, start)
  const replacement = renderObject(updated, !span.text.includes('\n'), outerIndent)

  return {
    sourceText: sourceText.slice(0, start) + replacement + sourceText.slice(span.end),
    changed: true,
  }
}

export function applyParsedStatuses({
  sourceText,
  events,
}: {
  sourceText: string
  events: ParsedLiveStatusEvent[]
}): { sourceText: string; updatedIds: string[]; audit: LiveStatusAuditEntry[] } {
  let nextSource = sourceText
  const updatedIds: string[] = []
  const audit: LiveStatusAuditEntry[] = []

  for (const event of events) {
    try {
      const applied = applyLiveStatusToMatch(nextSource, event.matchId, event.liveStatus)
      nextSource = applied.sourceText
      if (applied.changed) updatedIds.push(event.matchId)
    } catch (error) {
      const note = error instanceof Error ? error.message : String(error)
      audit.push({
        code: 'live_status_apply_failed',
        day: event.day,
        matchId: event.matchId,
        note,
      })
    }
  }

  return { sourceText: nextSource, updatedIds, audit }
}

export function summarizeLiveStatusAudit(audit: LiveStatusAuditEntry[]): string {
  if (audit.length === 0) return ''
  return audit
    .map((entry) => {
      const parts = [`- day: ${entry.day}`, `code: ${entry.code}`]
      if (entry.matchId) parts.push(`matchId: ${entry.matchId}`)
      if (entry.note) parts.push(`note: ${entry.note}`)
      return parts.join(', ')
    })
    .join('\n')
}
