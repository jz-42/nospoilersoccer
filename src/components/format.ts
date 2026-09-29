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

export function formatDateLong(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}
