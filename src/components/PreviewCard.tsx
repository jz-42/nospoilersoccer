/**
 * Custom video-forward match card — our artwork, zero YouTube pixels.
 *
 * The card is a state machine the eye can read before the brain does:
 * a solid green FT badge + play button means "watch this now", a quiet
 * kickoff time means "not played yet", a big score means "you've seen it".
 */
import type { Tournament } from '../data/types'
import type { GroupMatch, KnockoutMatch } from '../data/types'
import { resolveSlot, slotLabel } from '../logic/spoilers'
import type { Progress } from '../state/progress'
import type { ModalTarget } from './MatchModal'
import { matchState } from './status'
import { formatDate, formatDuration, formatKickoffShort } from './format'

export interface RailEntry {
  target: ModalTarget
  date: string
}

export function PreviewCard({
  t,
  entry,
  progress,
  onOpen,
  showDate = false,
}: {
  t: Tournament
  entry: RailEntry
  progress: Progress
  onOpen: (target: ModalTarget) => void
  showDate?: boolean
}) {
  const { target } = entry
  const m = target.match
  const state = matchState(t, target, progress)

  let homeLabel: string
  let awayLabel: string
  let homeFlag: string | null
  let awayFlag: string | null
  let context: string

  if (target.kind === 'group') {
    const gm = m as GroupMatch
    homeLabel = t.teams[gm.home].name
    awayLabel = t.teams[gm.away].name
    homeFlag = t.teams[gm.home].flag
    awayFlag = t.teams[gm.away].flag
    context = `Group ${gm.group}`
  } else {
    const km = m as KnockoutMatch
    const home = resolveSlot(t, km, 'home', progress.marks, progress.revealed)
    const away = resolveSlot(t, km, 'away', progress.marks, progress.revealed)
    homeLabel = home ? t.teams[home].name : slotLabel(t, km.home)
    awayLabel = away ? t.teams[away].name : slotLabel(t, km.away)
    homeFlag = home ? t.teams[home].flag : null
    awayFlag = away ? t.teams[away].flag : null
    context = target.roundName
  }

  const best = m.videos?.find((v) => v.kind === 'extended') ?? m.videos?.[0] ?? null
  const kickoff = formatKickoffShort(m.kickoff)

  const badge =
    state === 'watch' || state === 'ft'
      ? 'FT'
      : state === 'upcoming'
        ? (kickoff ? `${kickoff} PT` : 'Upcoming')
        : state === 'locked'
          ? 'Locked'
          : null

  const sub =
    state === 'watch'
      ? `Highlights${formatDuration(best?.durationSeconds) ? ` · ${formatDuration(best?.durationSeconds)}` : ''}`
      : state === 'ft'
        ? 'Result in · highlights soon'
        : state === 'upcoming'
          ? (kickoff ? `Kicks off ${kickoff} PT` : 'Not played yet')
          : state === 'locked'
            ? 'Finish the games that decide it'
            : 'Watched'

  const pinned = progress.pins.has(m.id)
  const homeId =
    target.kind === 'group'
      ? (m as GroupMatch).home
      : resolveSlot(t, m as KnockoutMatch, 'home', progress.marks, progress.revealed)
  const awayId =
    target.kind === 'group'
      ? (m as GroupMatch).away
      : resolveSlot(t, m as KnockoutMatch, 'away', progress.marks, progress.revealed)
  const fav =
    progress.favAuto &&
    ((homeId !== null && progress.favorites.includes(homeId)) ||
      (awayId !== null && progress.favorites.includes(awayId)))

  return (
    <button
      type="button"
      className={`preview-card state-${state} ${pinned ? 'is-pinned' : fav ? 'is-fav' : ''}`}
      onClick={() => onOpen(target)}
    >
      <div className="preview-media">
        <span className="preview-tag">{context}</span>
        {badge && <span className={`preview-badge badge-${state}`}>{badge}</span>}
        {state === 'seen' && (
          <span className="preview-badge badge-seen" aria-label="Watched">
            ✓
          </span>
        )}
        <div className="preview-matchup">
          {homeFlag ? (
            <span className="preview-flag">{homeFlag}</span>
          ) : (
            <span className="preview-flag preview-flag-tbd">?</span>
          )}
          {state === 'seen' && m.score ? (
            <span className="preview-score">
              {m.score.home}–{m.score.away}
            </span>
          ) : (
            <span className="preview-vs">vs</span>
          )}
          {awayFlag ? (
            <span className="preview-flag">{awayFlag}</span>
          ) : (
            <span className="preview-flag preview-flag-tbd">?</span>
          )}
        </div>
        {state === 'watch' && (
          <span className="preview-play" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
          </span>
        )}
      </div>
      <div className="preview-meta">
        <span className="preview-teams">
          {homeLabel} <span className="preview-vs-text">v</span> {awayLabel}
        </span>
        <span className="preview-sub">
          {showDate ? `${formatDate(entry.date)} · ` : ''}
          {sub}
        </span>
      </div>
    </button>
  )
}
