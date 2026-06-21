const DATE_KEY_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}

function dateTimeFormat(
  options: Intl.DateTimeFormatOptions,
  timeZone?: string,
): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', {
    ...options,
    ...(timeZone ? { timeZone } : {}),
  })
}

function asDate(instant: string | Date): Date {
  const date = instant instanceof Date ? instant : new Date(instant)
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${String(instant)}`)
  return date
}

/** Calendar date for an instant in the requested (or browser) timezone. */
export function localDateKey(instant: string | Date, timeZone?: string): string {
  const parts = dateTimeFormat(DATE_KEY_FORMAT, timeZone).formatToParts(asDate(instant))
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value
  return `${value('year')}-${value('month')}-${value('day')}`
}

/** Add whole calendar days to a YYYY-MM-DD key without involving local DST. */
export function addLocalDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date key: ${dateKey}`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function relativeDayLabel(
  dateKey: string,
  now = new Date(),
  timeZone?: string,
): 'Yesterday' | 'Today' | 'Tomorrow' | null {
  const today = localDateKey(now, timeZone)
  if (dateKey === today) return 'Today'
  if (dateKey === addLocalDays(today, -1)) return 'Yesterday'
  if (dateKey === addLocalDays(today, 1)) return 'Tomorrow'
  return null
}

/** Format an instant's local calendar date with caller-selected fields. */
export function formatLocalDate(
  instant: string,
  options: Intl.DateTimeFormatOptions,
  timeZone?: string,
): string {
  return dateTimeFormat(options, timeZone).format(asDate(instant))
}

export interface LocalKickoffParts {
  time: string
  zone: string
  offsetZone: boolean
}

function zoneName(
  date: Date,
  style: 'shortGeneric' | 'long' | 'shortOffset',
  timeZone?: string,
): string {
  return (
    dateTimeFormat({ timeZoneName: style }, timeZone)
      .formatToParts(date)
      .find((part) => part.type === 'timeZoneName')?.value ?? ''
  )
}

function acronym(longName: string): string | null {
  if (!/\bTime\b/.test(longName) || /^(Greenwich|Coordinated Universal)/.test(longName)) return null
  const letters = longName
    .split(/\s+/)
    .filter((word) => /^[A-Za-z]/.test(word))
    .map((word) => word[0].toUpperCase())
    .join('')
  return /^[A-Z]{3,5}$/.test(letters) ? letters : null
}

function compactOffset(offset: string): string {
  return offset.replace(/^GMT/, 'UTC').replace(/([+-])0(\d)/, '$1$2').replace(/:00$/, '')
}

/**
 * Local kickoff split into time and timezone. Familiar generic labels such as
 * PT/ET stay generic; longer named zones become CEST/JST/AEST where possible.
 */
export function formatKickoffLocalParts(
  iso?: string,
  timeZone?: string,
): LocalKickoffParts | null {
  if (!iso) return null
  const date = asDate(iso)
  const time = dateTimeFormat(
    {
      hour: 'numeric',
      minute: '2-digit',
    },
    timeZone,
  ).format(date)
  const generic = zoneName(date, 'shortGeneric', timeZone)
  if (generic && !/\bTime\b/.test(generic) && !/^GMT/.test(generic)) {
    return { time, zone: generic, offsetZone: false }
  }
  const named = acronym(zoneName(date, 'long', timeZone))
  if (named) return { time, zone: named, offsetZone: false }
  return {
    time,
    zone: compactOffset(zoneName(date, 'shortOffset', timeZone)),
    offsetZone: true,
  }
}

/** Local kickoff with a compact timezone label. */
export function formatKickoffLocal(iso?: string, timeZone?: string): string | null {
  const parts = formatKickoffLocalParts(iso, timeZone)
  return parts ? `${parts.time} ${parts.zone}` : null
}
