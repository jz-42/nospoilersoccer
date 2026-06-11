/**
 * Custom video-forward match card — our artwork, zero YouTube pixels.
 * Used in the rail and as the player poster in the match modal.
 */
import type { Tournament } from '../data/types'
import type { GroupMatch, KnockoutMatch } from '../data/types'
import { isPlayed, knockoutReady, resolveSlot, slotLabel } from '../logic/spoilers'
import type { Progress } from '../state/progress'
import type { ModalTarget } from './MatchModal'
import { formatDate, formatDuration, formatKickoffPT } from './format'

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
  const mark = progress.marks[m.id]
  const played = isPlayed(m)

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

  const best =
    m.videos?.find((v) => v.kind === 'extended') ?? m.videos?.[0] ?? null
  const watchable =
    played && (target.kind === 'group' || knockoutReady(t, m as KnockoutMatch, progress.marks, progress.revealed))

  const status = mark
    ? m.score
      ? `${m.score.home}–${m.score.away}`
      : null
    : !played
      ? (formatKickoffPT(m.kickoff) ?? 'Upcoming')
      : best
        ? `${best.kind === 'extended' ? 'Extended' : 'Highlights'}${formatDuration(best.durationSeconds) ? ` · ${formatDuration(best.durationSeconds)}` : ''}`
        : watchable
          ? 'Result in'
          : 'Locked'

  return (
    <button type="button" className={`preview-card ${mark ? 'is-done' : ''}`} onClick={() => onOpen(target)}>
      <div className="preview-media">
        <span className="preview-flag">{homeFlag ?? '·'}</span>
        <span className="preview-vs">vs</span>
        <span className="preview-flag">{awayFlag ?? '·'}</span>
        {!mark && watchable && best && (
          <span className="preview-play" aria-hidden="true">
            ▶
          </span>
        )}
        {mark && <span className="preview-check">✓</span>}
      </div>
      <div className="preview-meta">
        <span className="preview-teams">
          {homeLabel} <span className="preview-vs-text">v</span> {awayLabel}
        </span>
        <span className="preview-sub">
          {context} · {formatDate(entry.date)}
          {status ? ` · ${status}` : ''}
        </span>
      </div>
    </button>
  )
}
