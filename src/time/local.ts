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

/**
 * Local kickoff with a compact timezone label. North America uses generic
 * labels such as PT/ET; verbose generic labels elsewhere fall back to GMT±N.
 */
export function formatKickoffLocal(iso?: string, timeZone?: string): string | null {
  if (!iso) return null
  const date = asDate(iso)
  const baseOptions: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
  }
  const generic = dateTimeFormat(
    { ...baseOptions, timeZoneName: 'shortGeneric' },
    timeZone,
  ).format(date)
  if (!/\bTime\b/.test(generic)) return generic
  return dateTimeFormat({ ...baseOptions, timeZoneName: 'shortOffset' }, timeZone).format(date)
}
