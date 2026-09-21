/**
 * Custom video-forward match card — our artwork, zero YouTube pixels.
 *
 * The card is a state machine the eye can read before the brain does:
 * a solid green FT badge + play button means "watch this now", a quiet
 * kickoff time means "not played yet", a big score means "you've seen it".
 */
import type { CSSProperties } from 'react'
import { matchTint } from '../data/team-colors'
import type { Tournament } from '../data/types'
import type { GroupMatch, KnockoutMatch } from '../data/types'
import { resolveSlot, slotLabel } from '../logic/spoilers'
import { hasGroups } from '../navigation'
import type { Progress } from '../state/progress'
import { Flag } from './Flag'
import { ClockIcon } from './ClockIcon'
import { Heart } from './Heart'
import { LiveStatusBadge } from './live-status'
import type { ModalTarget } from './MatchModal'
import { matchLiveStatus, matchState } from './status'
import { formatRuntimeBadge } from './format'
import { KickoffTime } from './KickoffTime'
import { FINISHED_PENDING_CARD_COPY } from './highlight-copy'

export interface RailEntry {
  target: ModalTarget
  date: string
}

export function PreviewCard({
  t,
  entry,
  progress,
  onOpen,
}: {
  t: Tournament
  entry: RailEntry
  progress: Progress
  onOpen: (target: ModalTarget) => void
}) {
  const { target } = entry
  const m = target.match
  const state = matchState(t, target, progress)
  const liveStatus = matchLiveStatus(target, progress)

  let homeLabel: string
  let awayLabel: string
  /** The chip on the art, or null when it would say the same on every card. */
  let context: string | null

  if (target.kind === 'group') {
    const gm = m as GroupMatch
    homeLabel = t.teams[gm.home].name
    awayLabel = t.teams[gm.away].name
    // A cup's group is a real name people use ("Group F"), and a day mixes
    // several of them, so the chip tells the cards apart. A single-table
    // competition has only the matchweek number, which is the same on every
    // card of the day — ten chips reading MATCHDAY 30 that distinguish
    // nothing. The modal still carries it for the one match you opened.
    context = hasGroups(t) ? `Group ${gm.group}` : null
  } else {
    const km = m as KnockoutMatch
    const home = resolveSlot(t, km, 'home', progress.marks, progress.revealed)
    const away = resolveSlot(t, km, 'away', progress.marks, progress.revealed)
    homeLabel = home ? t.teams[home].name : slotLabel(t, km.home)
    awayLabel = away ? t.teams[away].name : slotLabel(t, km.away)
    context = target.roundName
  }

  const badge =
    liveStatus ? (
      <LiveStatusBadge status={liveStatus} className="preview-badge" />
    ) : state === 'watch' || state === 'ft'
      ? 'FT'
      : state === 'upcoming'
        ? (m.kickoff ? <KickoffTime kickoff={m.kickoff} /> : 'Upcoming')
        : state === 'locked'
          ? 'Locked'
          : null

  const runtimeBadge = formatRuntimeBadge(m.videos)

  /**
   * The caption's second line, and only when the card cannot say it in
   * pictures. 'Highlights ready' is the play button, 'Not played yet' is the
   * kickoff time, 'Watched' is the ✓ and the score — printing those was
   * captioning an image with its own contents. What survives are the two
   * states with nothing to look at: a finished match whose highlights haven't
   * landed (FT badge, no play button, and otherwise no explanation for the
   * absence) and a knockout slot still waiting on its feeder ties.
   */
  const sub =
    liveStatus
      ? null
      : state === 'ft'
        ? FINISHED_PENDING_CARD_COPY
        : state === 'locked'
          ? 'Finish the games that decide it'
          : null

  const pinned = progress.pins.has(m.id)
  const homeId =
    target.kind === 'group'
      ? (m as GroupMatch).home
      : resolveSlot(t, m as KnockoutMatch, 'home', progress.marks, progress.revealed)
  const awayId =
    target.kind === 'group'
      ? (m as GroupMatch).away
      : resolveSlot(t, m as KnockoutMatch, 'away', progress.marks, progress.revealed)
  // Tracked per side, not just per match: the card's whole job here is to
  // answer "is one of mine in this?" — and when the answer is yes, "which
  // one?". A ring around the card could only ever answer the first.
  const followsHome = homeId !== null && progress.favorites.includes(homeId)
  const followsAway = awayId !== null && progress.favorites.includes(awayId)
  const favHome = progress.favAuto && followsHome
  const favAway = progress.favAuto && followsAway
  const fav = favHome || favAway
  // Spotlight has its own switch, so it keys off following alone: dimming the
  // rest of the day must still work with the card decoration turned off.
  const followed = followsHome || followsAway

  // Same flag tint as the match modal, dialed down for the thumbnail. The vars
  // land on the .preview-media art via CSS; unknown (locked) slots set nothing
  // and the card stays neutral.
  const tintStyle = matchTint(homeId, awayId) as CSSProperties

  return (
    <button
      type="button"
      className={`preview-card state-${state} ${fav ? 'is-fav' : ''} ${
        followed ? 'is-followed' : ''
      }`}
      style={tintStyle}
      onClick={() => onOpen(target)}
    >
      <div className="preview-media">
        <span className="match-fabric" aria-hidden="true">
          <span />
        </span>
        {context && <span className="preview-tag">{context}</span>}
        {liveStatus
          ? badge
          : badge && <span className={`preview-badge badge-${state}`}>{badge}</span>}
        {state === 'seen' && (
          <span className="preview-badge badge-seen" aria-label="Watched">
            ✓
          </span>
        )}
        <div className="preview-matchup">
          {homeId !== null ? (
            <Flag team={t.teams[homeId]} className="preview-flag" />
          ) : (
            <span className="preview-flag preview-flag-tbd">?</span>
          )}
          {state === 'seen' && m.score ? (
            <span className="preview-score">
              {m.score.home}–{m.score.away}
            </span>
          ) : !liveStatus && state === 'watch' ? (
            <span className="preview-play" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                <path d="M8.3 5.5v13l11-6.5z" />
              </svg>
            </span>
          ) : (
            <span className="preview-vs">vs</span>
          )}
          {awayId !== null ? (
            <Flag team={t.teams[awayId]} className="preview-flag" />
          ) : (
            <span className="preview-flag preview-flag-tbd">?</span>
          )}
        </div>
        {!liveStatus && state === 'watch' && runtimeBadge && (
          <span className="preview-duration">{runtimeBadge}</span>
        )}
        {pinned && (
          <span className="preview-saved" aria-label="Watch later" title="Watch later">
            <ClockIcon />
          </span>
        )}
      </div>
      <div className="preview-meta">
        <span className="preview-teams">
          <span className={`preview-team ${favHome ? 'is-fav' : ''}`.trim()}>
            {favHome && <Heart size={14} className="preview-team-heart" />}
            {homeLabel}
          </span>{' '}
          <span className="preview-vs-text">v</span>{' '}
          <span className={`preview-team ${favAway ? 'is-fav' : ''}`.trim()}>
            {awayLabel}
            {favAway && <Heart size={14} className="preview-team-heart is-trailing" />}
          </span>
        </span>
        {sub && <span className="preview-sub">{sub}</span>}
      </div>
    </button>
  )
}
