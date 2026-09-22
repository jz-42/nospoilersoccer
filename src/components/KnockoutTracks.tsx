import { useState } from 'react'
import type { KnockoutRound, PendingStage, Tournament } from '../data/types'
import type { Progress } from '../state/progress'
import { ConnectedBracket, KnockoutCard } from './Bracket'
import type { ModalTarget } from './MatchModal'
import { roundsForTrack } from './knockout-tracks-helpers'

export function PendingStageCard({ stage }: { stage: PendingStage }) {
  return (
    <article className="pending-stage-card">
      <div className="pending-stage-state">Draw pending</div>
      <h3>{stage.label}</h3>
      <p className="pending-stage-window">{stage.window}</p>
      <ul className="pending-stage-pools">
        {stage.pools.map((pool) => <li key={pool.label}>{pool.label}</li>)}
      </ul>
    </article>
  )
}

function TieGrid({
  t,
  rounds,
  progress,
  onOpen,
}: {
  t: Tournament
  rounds: KnockoutRound[]
  progress: Progress
  onOpen: (target: ModalTarget) => void
}) {
  return (
    <div className="tie-rounds">
      {rounds.map((round) => (
        <section className="tie-round" key={round.id}>
          <h2>{round.name}</h2>
          <div className="tie-grid">
            {round.matches.map((match) => (
              <KnockoutCard
                key={match.id}
                t={t}
                m={match}
                roundName={round.name}
                progress={progress}
                onOpen={onOpen}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export function KnockoutTracks({
  t,
  progress,
  onOpen,
}: {
  t: Tournament
  progress: Progress
  onOpen: (target: ModalTarget) => void
}) {
  const tracks = t.knockoutTracks ?? []
  const [trackId, setTrackId] = useState(() => tracks[0]?.id ?? '')
  const track = tracks.find((candidate) => candidate.id === trackId) ?? tracks[0]
  if (!track) return null
  const rounds = roundsForTrack(t, track.id)
  const filtered: Tournament = { ...t, knockoutRounds: rounds, knockoutTracks: undefined }
  const championship = track.id === 'championship'

  return (
    <div className="knockout-tracks">
      <div className="knockout-track-tabs" role="tablist" aria-label="Knockout competitions">
        {tracks.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            role="tab"
            aria-selected={candidate.id === track.id}
            className={`knockout-track-tab ${candidate.id === track.id ? 'active' : ''}`}
            onClick={() => setTrackId(candidate.id)}
          >
            {candidate.label}
          </button>
        ))}
      </div>

      {rounds.length > 0 && (championship
        ? <ConnectedBracket t={filtered} progress={progress} onOpen={onOpen} />
        : <TieGrid t={t} rounds={rounds} progress={progress} onOpen={onOpen} />)}

      {(track.pendingStages?.length ?? 0) > 0 && (
        <div className="pending-stage-grid">
          {track.pendingStages!.map((stage) => <PendingStageCard key={stage.id} stage={stage} />)}
        </div>
      )}
    </div>
  )
}
