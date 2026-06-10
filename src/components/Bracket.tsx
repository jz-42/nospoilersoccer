import type { KnockoutMatch, KnockoutRound, Tournament } from '../data/types'
import { knockoutReady, resolveSlot, slotLabel } from '../logic/spoilers'
import type { Progress } from '../state/progress'
import { MarkBadge, MarkButtons } from './MatchControls'

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function SlotRow({
  t,
  m,
  side,
  progress,
}: {
  t: Tournament
  m: KnockoutMatch
  side: 'home' | 'away'
  progress: Progress
}) {
  const mark = progress.marks[m.id]
  const teamId = resolveSlot(t, m, side, progress.marks)
  const slot = side === 'home' ? m.home : m.away

  if (teamId === null) {
    return (
      <div className="ko-row">
        <span className="ko-placeholder">{slotLabel(t, slot)}</span>
      </div>
    )
  }

  const team = t.teams[teamId]
  const myGoals = side === 'home' ? m.score.home : m.score.away
  const theirGoals = side === 'home' ? m.score.away : m.score.home
  const myPens = m.penalties ? (side === 'home' ? m.penalties.home : m.penalties.away) : null
  const theirPens = m.penalties ? (side === 'home' ? m.penalties.away : m.penalties.home) : null
  const won = mark
    ? myPens !== null && theirPens !== null
      ? myPens > theirPens
      : myGoals > theirGoals
    : false

  return (
    <div className={`ko-row ${won ? 'winner' : ''}`}>
      <span className="ko-team">
        <span className="flag">{team.flag}</span> {team.name}
      </span>
      {mark && (
        <span className="ko-score">
          {myGoals}
          {myPens !== null ? <span className="pens"> ({myPens})</span> : null}
        </span>
      )}
    </div>
  )
}

function KnockoutCard({ t, m, progress }: { t: Tournament; m: KnockoutMatch; progress: Progress }) {
  const mark = progress.marks[m.id]
  const ready = knockoutReady(t, m, progress.marks)

  return (
    <div className={`ko-card ${ready ? '' : 'locked'}`}>
      <div className="ko-meta">{formatDate(m.date)}</div>
      <SlotRow t={t} m={m} side="home" progress={progress} />
      <SlotRow t={t} m={m} side="away" progress={progress} />
      <div className="ko-footer">
        {mark ? (
          <>
            {m.afterExtraTime && (
              <span className="ko-note">{m.penalties ? 'pens, after extra time' : 'after extra time'}</span>
            )}
            <MarkBadge mark={mark} onUndo={() => progress.unmark(m.id)} />
          </>
        ) : ready ? (
          <MarkButtons onMark={(x) => progress.setMark(m.id, x)} />
        ) : (
          <span className="ko-note">🔒 finish the games that feed this match</span>
        )}
      </div>
    </div>
  )
}

export function Bracket({ t, progress }: { t: Tournament; progress: Progress }) {
  const mainRounds = t.knockoutRounds.filter((r) => r.id !== 'third-place')
  const thirdPlace: KnockoutRound | undefined = t.knockoutRounds.find((r) => r.id === 'third-place')

  return (
    <div className="bracket">
      {mainRounds.map((round) => (
        <div key={round.id} className="bracket-round">
          <h3>{round.name}</h3>
          <div className="bracket-matches">
            {round.matches.map((m) => (
              <KnockoutCard key={m.id} t={t} m={m} progress={progress} />
            ))}
            {round.id === 'final' &&
              thirdPlace?.matches.map((m) => (
                <div key={m.id} className="third-place">
                  <h4>{thirdPlace.name}</h4>
                  <KnockoutCard t={t} m={m} progress={progress} />
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}
