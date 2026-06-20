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

/** Temporary compatibility name while schedule surfaces migrate together. */
export const formatKickoffPT = formatKickoff

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
