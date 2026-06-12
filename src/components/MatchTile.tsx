/**
 * Compact row tile for a group match. The right-hand pill carries the
 * state — Watch (green), FT, kickoff time, or the revealed score — so
 * "can I watch this?" is answerable without clicking.
 */
import type { GroupMatch, Tournament } from '../data/types'
import type { Progress } from '../state/progress'
import type { ModalTarget } from './MatchModal'
import { matchState } from './status'
import { formatKickoffShort } from './format'

export function MatchTile({
  t,
  m,
  progress,
  onOpen,
}: {
  t: Tournament
  m: GroupMatch
  progress: Progress
  onOpen: (target: ModalTarget) => void
}) {
  const state = matchState(t, { kind: 'group', match: m }, progress)
  const home = t.teams[m.home]
  const away = t.teams[m.away]
  const mark = progress.marks[m.id]
  const homeWon = mark && m.score && m.score.home > m.score.away
  const awayWon = mark && m.score && m.score.away > m.score.home
  const pinned = progress.pins.has(m.id)
  const fav =
    progress.favAuto &&
    (progress.favorites.includes(m.home) || progress.favorites.includes(m.away))

  const pill =
    state === 'seen' && m.score ? (
      <span className="tile-pill pill-seen">
        {m.score.home}–{m.score.away}
        <span className="pill-check">✓</span>
      </span>
    ) : state === 'watch' ? (
      <span className="tile-pill pill-watch">
        <svg viewBox="0 0 24 24" width="9" height="9" fill="currentColor" aria-hidden="true">
          <path d="M8 5.5v13l11-6.5z" />
        </svg>
        Watch
      </span>
    ) : state === 'ft' ? (
      <span className="tile-pill pill-ft">FT</span>
    ) : (
      <span className="tile-pill pill-upcoming">{formatKickoffShort(m.kickoff) ?? '—'}</span>
    )

  return (
    <button
      type="button"
      className={`tile state-${state} ${pinned ? 'is-pinned' : fav ? 'is-fav' : ''}`}
      onClick={() => onOpen({ kind: 'group', match: m })}
    >
      <span className="tile-flags" aria-hidden="true">
        <span>{home.flag}</span>
        <span>{away.flag}</span>
      </span>
      <span className="tile-teams">
        <span className={`tile-team ${homeWon ? 'won' : ''}`}>{home.name}</span>
        <span className="tile-sep">v</span>
        <span className={`tile-team ${awayWon ? 'won' : ''}`}>{away.name}</span>
      </span>
      {pill}
    </button>
  )
}
