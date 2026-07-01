import type { MatchLiveStatus } from '../data/types'

export function LiveStatusBadge({
  status,
  className = '',
}: {
  status: MatchLiveStatus
  className?: string
}) {
  const label = status.kind === 'live' ? 'Live' : 'Delayed'
  return (
    <span className={`live-status-badge live-status-${status.kind} ${className}`.trim()}>
      <span className="live-status-dot" aria-hidden="true" />
      <span>{label}</span>
    </span>
  )
}
