import { formatKickoffLocalParts } from '../time/local'

export function KickoffTime({ kickoff }: { kickoff?: string }) {
  const parts = formatKickoffLocalParts(kickoff)
  if (!parts) return null
  return (
    <>
      {parts.time}{' '}
      <span className={parts.offsetZone ? 'kickoff-zone kickoff-zone-offset' : 'kickoff-zone'}>
        {parts.zone}
      </span>
    </>
  )
}
