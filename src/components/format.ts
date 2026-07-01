import type { HighlightVideo } from '../data/types'
import { formatKickoffLocal, formatLocalDate } from '../time/local'

export function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

/** Kickoff instant shown in the visitor's local timezone, e.g. "12:00 PM PT". */
export function formatKickoff(iso?: string): string | null {
  return formatKickoffLocal(iso)
}

/** Compact kickoff for pills, including the visitor's timezone label. */
export function formatKickoffShort(iso?: string): string | null {
  return formatKickoffLocal(iso)
}

export function formatKickoffDate(iso: string): string {
  return formatLocalDate(iso, { month: 'short', day: 'numeric' })
}

export function formatKickoffWeekdayLong(iso: string): string {
  return formatLocalDate(iso, { weekday: 'long', month: 'long', day: 'numeric' })
}

export function formatKickoffWeekday(iso: string): string {
  return formatLocalDate(iso, { weekday: 'long' })
}

export function formatKickoffDateLong(iso: string): string {
  return formatLocalDate(iso, {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatMatchDate(date: string, kickoff?: string, timeZone?: string): string {
  return kickoff
    ? formatLocalDate(kickoff, { month: 'short', day: 'numeric' }, timeZone)
    : formatDate(date)
}

export function formatMatchWeekday(date: string, kickoff?: string, timeZone?: string): string {
  return kickoff
    ? formatLocalDate(kickoff, { weekday: 'long' }, timeZone)
    : formatWeekday(date)
}

export function formatMatchWeekdayLong(date: string, kickoff?: string, timeZone?: string): string {
  return kickoff
    ? formatLocalDate(
        kickoff,
        { weekday: 'long', month: 'long', day: 'numeric' },
        timeZone,
      )
    : formatWeekdayLong(date)
}

export function formatMatchDateLong(date: string, kickoff?: string, timeZone?: string): string {
  return kickoff
    ? formatLocalDate(
        kickoff,
        { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' },
        timeZone,
      )
    : formatDateLong(date)
}

/** "Wednesday, June 11" — the matchday headline. */
export function formatWeekdayLong(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

/** Just the weekday, e.g. "Tuesday". */
export function formatWeekday(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' })
}

export function formatDuration(s?: number): string | null {
  if (!s) return null
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Extended runtimes are hidden because the longer cut can reveal that a match
 * went beyond regulation. Quick-cut runtimes remain safe to show.
 */
export function formatHighlightDuration(s?: number, kind?: HighlightVideo['kind']): string | null {
  if (kind === 'extended') return null
  return formatDuration(s)
}

/**
 * Glanceable runtime badge for a match card: rounded minutes, quick cut first
 * then a neutral extended label, e.g. "8m · Extended". Falls back to the
 * prior single-value behavior when no extended cut exists; null when there are
 * no videos.
 */
export function formatRuntimeBadge(videos?: HighlightVideo[]): string | null {
  if (!videos || videos.length === 0) return null
  const quick = videos.find((v) => v.kind === 'normal')?.durationSeconds
  const hasExtended = videos.some((v) => v.kind === 'extended')
  const parts: string[] = []
  if (typeof quick === 'number' && quick > 0) parts.push(`${Math.round(quick / 60)}m`)
  if (hasExtended) parts.push('Extended')
  if (parts.length > 0) return parts.join(' · ')
  const any = videos[0]?.durationSeconds
  return any ? `${Math.round(any / 60)}m` : null
}

export function formatDateLong(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}
