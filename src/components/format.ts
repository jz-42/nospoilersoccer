import type { HighlightVideo } from '../data/types'

export function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

/** Kickoff instant shown in Pacific Time, e.g. "12:00 PM PT". */
export function formatKickoffPT(iso?: string): string | null {
  if (!iso) return null
  const time = new Date(iso).toLocaleTimeString('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: '2-digit',
  })
  return `${time} PT`
}

/** Compact kickoff for pills, e.g. "9:00 AM" (PT implied by context). */
export function formatKickoffShort(iso?: string): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: '2-digit',
  })
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
 * Glanceable runtime badge for a match card: rounded minutes, quick cut first
 * then extended (short→long), e.g. "8m · 20m". Falls back to a single value
 * when only one cut exists; null when there are no videos.
 */
export function formatRuntimeBadge(videos?: HighlightVideo[]): string | null {
  if (!videos || videos.length === 0) return null
  const quick = videos.find((v) => v.kind === 'normal')?.durationSeconds
  const extended = videos.find((v) => v.kind === 'extended')?.durationSeconds
  const mins = [quick, extended]
    .filter((s): s is number => typeof s === 'number' && s > 0)
    .map((s) => `${Math.round(s / 60)}m`)
  if (mins.length > 0) return mins.join(' · ')
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
