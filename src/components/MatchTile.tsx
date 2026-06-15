/**
 * Compact match row for the group stage — a horizontal echo of the Today-tab
 * preview card so the two views share one visual language. A pitch thumb holds
 * the two flags; a watchable match gets the same white play button (no "Watch"
 * label — the button says it), sitting right on the thumb next to the flags.
 * The right-hand badge carries state: FT, kickoff time, or the revealed score.
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

  const badge =
    state === 'seen' && m.score ? (
      <span className="tile-badge badge-seen">
        {m.score.home}–{m.score.away} <span className="tile-badge-check">✓</span>
      </span>
    ) : state === 'watch' || state === 'ft' ? (
      <span className="tile-badge badge-ft">FT</span>
    ) : (
      <span className="tile-badge badge-upcoming">{formatKickoffShort(m.kickoff) ?? '—'}</span>
    )

  return (
    <button
      type="button"
      className={`tile state-${state} ${pinned ? 'is-pinned' : fav ? 'is-fav' : ''}`}
      onClick={() => onOpen({ kind: 'group', match: m })}
    >
      <span className="tile-thumb" aria-hidden="true">
        <span className="tile-thumb-flag">{home.flag}</span>
        <span className="tile-thumb-flag">{away.flag}</span>
        {state === 'watch' && (
          <span className="tile-play">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor">
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
          </span>
        )}
      </span>
      <span className="tile-teams">
        <span className={`tile-team ${homeWon ? 'won' : ''}`}>{home.name}</span>
        <span className="tile-sep">v</span>
        <span className={`tile-team ${awayWon ? 'won' : ''}`}>{away.name}</span>
      </span>
      {badge}
    </button>
  )
}
