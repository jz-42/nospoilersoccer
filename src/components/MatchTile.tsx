/**
 * Compact match row for the group stage — a horizontal echo of the Today-tab
 * preview card so the two views share one visual language. A thumb in the two
 * team colours holds the two flags; a watchable match gets the same white play
 * button (no "Watch" label — the button says it), sitting between the flags.
 * The names stack, home over away.
 * The right-hand badge carries state: FT, kickoff time, or the revealed score.
 */
import type { CSSProperties } from 'react'
import type { GroupMatch, Tournament } from '../data/types'
import { matchTint } from '../data/team-colors'
import type { Progress } from '../state/progress'
import { Flag } from './Flag'
import { ClockIcon } from './ClockIcon'
import { Heart } from './Heart'
import { LiveStatusBadge } from './live-status'
import type { ModalTarget } from './MatchModal'
import { matchLiveStatus, matchState } from './status'
import { KickoffTime } from './KickoffTime'

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
  const liveStatus = matchLiveStatus({ kind: 'group', match: m }, progress)
  const home = t.teams[m.home]
  const away = t.teams[m.away]
  const mark = progress.marks[m.id]
  const homeWon = mark && m.score && m.score.home > m.score.away
  const awayWon = mark && m.score && m.score.away > m.score.home
  const pinned = progress.pins.has(m.id)
  // Per side, as on the preview card. `.tile-team.won` already brightens a
  // winner's name, so the mark here has to be the heart itself, not weight.
  const favHome = progress.favAuto && progress.favorites.includes(m.home)
  const favAway = progress.favAuto && progress.favorites.includes(m.away)
  const fav = favHome || favAway

  const badge =
    liveStatus ? (
      <LiveStatusBadge status={liveStatus} className="tile-badge" />
    ) : state === 'seen' && m.score ? (
      <span className="tile-badge badge-seen">
        {m.score.home}–{m.score.away} <span className="tile-badge-check">✓</span>
      </span>
    ) : state === 'watch' || state === 'ft' ? (
      <span className="tile-badge badge-ft">FT</span>
    ) : (
      <span className="tile-badge badge-upcoming">
        {m.kickoff ? <KickoffTime kickoff={m.kickoff} /> : '—'}
      </span>
    )

  return (
    <button
      type="button"
      className={`tile state-${state} ${fav ? 'is-fav' : ''}`}
      // The two team colours, as on the preview card: the thumb's art.
      style={matchTint(m.home, m.away) as CSSProperties}
      onClick={() => onOpen({ kind: 'group', match: m })}
    >
      <span className="tile-thumb" aria-hidden="true">
        <Flag team={home} className="tile-thumb-flag" />
        <Flag team={away} className="tile-thumb-flag" />
        {!liveStatus && state === 'watch' && (
          <span className="tile-play">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor">
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
          </span>
        )}
      </span>
      <span className="tile-teams">
        <span className={`tile-team ${homeWon ? 'won' : ''}`}>
          {favHome && <Heart size={10} className="tile-team-heart" />}
          {home.name}
        </span>
        <span className="tile-sep">v</span>
        <span className={`tile-team ${awayWon ? 'won' : ''}`}>
          {favAway && <Heart size={10} className="tile-team-heart" />}
          {away.name}
        </span>
      </span>
      {pinned && (
        <span className="tile-saved" aria-label="Watch Later" title="Watch Later">
          <ClockIcon />
        </span>
      )}
      {badge}
    </button>
  )
}
