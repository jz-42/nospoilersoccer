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

export function formatDuration(s?: number): string | null {
  if (!s) return null
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function formatDateLong(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}
