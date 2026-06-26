function formatGoogleCalendarDateTime(instant: string | Date, timeZone?: string): string {
  const date = instant instanceof Date ? instant : new Date(instant)
  const parts = new Intl.DateTimeFormat('en-US', {
    ...(timeZone ? { timeZone } : {}),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}${value('month')}${value('day')}T${value('hour')}${value('minute')}${value('second')}`
}

export function buildGoogleCalendarUrl({
  title,
  kickoff,
  durationMinutes,
  details,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
}: {
  title: string
  kickoff: string
  durationMinutes: number
  details?: string
  timeZone?: string
}): string {
  const start = new Date(kickoff)
  const end = new Date(start.getTime() + durationMinutes * 60_000)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${formatGoogleCalendarDateTime(start, timeZone)}/${formatGoogleCalendarDateTime(end, timeZone)}`,
  })

  if (details) params.set('details', details)
  if (timeZone) params.set('ctz', timeZone)

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
