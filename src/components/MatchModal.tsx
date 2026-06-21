import { useEffect } from 'react'
import type { GroupMatch, HighlightVideo, KnockoutMatch, Tournament } from '../data/types'
import {
  canForceReveal,
  isPlayed,
  knockoutReady,
  resolveSlot,
  slotLabel,
} from '../logic/spoilers'
import type { Progress } from '../state/progress'
import { HighlightPlayer } from './HighlightPlayer'
import { OddsBar } from './OddsBar'
import { formatMatchDateLong } from './format'
import { KickoffTime } from './KickoffTime'

export type ModalTarget =
  | { kind: 'group'; match: GroupMatch }
  | { kind: 'knockout'; match: KnockoutMatch; roundName: string }

const FOX_WC_HUB = 'https://www.foxsports.com/soccer/fifa-world-cup'
const FOX_REGIONAL_WARNING =
  'Videos from the FOX Sports YouTube channel may only be available in the U.S.'

/**
 * Where to watch this match live (US). FOX publishes a per-match "How to Watch"
 * page — TV channel + live stream, and crucially spoiler-free (it's pre-match
 * info, no score). Its URL is constructable for group games from the team names
 * and group letter. Knockout pages don't follow this pattern, so those fall back
 * to FOX's World Cup hub.
 */
function foxWatchUrl(t: Tournament, target: ModalTarget): string {
  if (target.kind !== 'group') return FOX_WC_HUB
  const slug = (id: string) =>
    t.teams[id].name
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
  const { home, away, group } = target.match
  return `https://www.foxsports.com/stories/soccer/how-to-watch-${slug(home)}-vs-${slug(away)}-tv-channel-live-stream-${t.year}-fifa-world-cup-group-${group.toLowerCase()}`
}

function TeamSide({
  t,
  teamId,
  placeholder,
}: {
  t: Tournament
  teamId: string | null
  placeholder?: string
}) {
  if (teamId === null) {
    return (
      <div className="modal-team">
        <span className="modal-flag modal-flag-unknown">?</span>
        <span className="modal-team-name modal-team-hidden">{placeholder}</span>
      </div>
    )
  }
  const team = t.teams[teamId]
  return (
    <div className="modal-team">
      <span className="modal-flag">{team.flag}</span>
      <span className="modal-team-name">{team.name}</span>
    </div>
  )
}

function MatchHighlights({
  videos,
  marked,
  onReveal,
  showFoxWarning,
}: {
  videos: HighlightVideo[]
  marked: boolean
  onReveal: () => void
  showFoxWarning: boolean
}) {
  return (
    <>
      <HighlightPlayer videos={videos} marked={marked} onReveal={onReveal} />
      {showFoxWarning && <p className="highlight-region-warning">{FOX_REGIONAL_WARNING}</p>}
    </>
  )
}

export function MatchModal({
  t,
  target,
  progress,
  onClose,
}: {
  t: Tournament
  target: ModalTarget
  progress: Progress
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const m = target.match
  const mark = progress.marks[m.id]
  const played = isPlayed(m)
  const km = target.kind === 'knockout' ? target.match : null

  const homeTeam = km
    ? resolveSlot(t, km, 'home', progress.marks, progress.revealed)
    : (target.match as GroupMatch).home
  const awayTeam = km
    ? resolveSlot(t, km, 'away', progress.marks, progress.revealed)
    : (target.match as GroupMatch).away
  const homePlaceholder = km ? slotLabel(t, km.home) : ''
  const awayPlaceholder = km ? slotLabel(t, km.away) : ''
  const ready = km ? knockoutReady(t, km, progress.marks, progress.revealed) : played
  const context =
    target.kind === 'group' ? `Group ${target.match.group}` : target.roundName
  const locked = km !== null && (homeTeam === null || awayTeam === null)
  const score = m.score
  const showFoxWarning = t.year === 2026

  let summary: string | null = null
  if (mark && score && homeTeam && awayTeam) {
    const homeName = t.teams[homeTeam].name
    const awayName = t.teams[awayTeam].name
    if (km?.penalties) {
      const winner = km.penalties.home > km.penalties.away ? homeName : awayName
      summary = `${winner} win on penalties`
    } else if (score.home === score.away) {
      summary = 'Draw'
    } else {
      const winner = score.home > score.away ? homeName : awayName
      summary = km ? `${winner} advance` : `${winner} win`
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
        <button
          type="button"
          className={`modal-pin ${progress.pins.has(m.id) ? 'pinned' : ''}`}
          aria-label={progress.pins.has(m.id) ? 'Unpin this match' : 'Pin this match'}
          title={progress.pins.has(m.id) ? 'Unpin this match' : 'Pin this match'}
          onClick={() => progress.togglePin(m.id)}
        >
          {progress.pins.has(m.id) ? '★' : '☆'}
        </button>

        <div className="modal-context">
          <span className="modal-context-strong">{context}</span>
          <span className="modal-context-date">
            {formatMatchDateLong(m.date, m.kickoff)}
            {m.kickoff && (
              <>
                {' · '}
                <KickoffTime kickoff={m.kickoff} />
              </>
            )}
          </span>
        </div>

        <div className="modal-teams">
          <TeamSide t={t} teamId={homeTeam} placeholder={homePlaceholder} />
          <div className="modal-mid">
            {mark && score ? (
              <div className="modal-score">
                <span>
                  {score.home}–{score.away}
                </span>
                {km?.penalties && (
                  <span className="modal-score-note">
                    {km.penalties.home}–{km.penalties.away} on penalties
                  </span>
                )}
                {km?.afterExtraTime && !km.penalties && (
                  <span className="modal-score-note">after extra time</span>
                )}
              </div>
            ) : (
              <span className="modal-vs">vs</span>
            )}
          </div>
          <TeamSide t={t} teamId={awayTeam} placeholder={awayPlaceholder} />
        </div>

        {!mark && m.odds && homeTeam && awayTeam && (
          <OddsBar
            odds={m.odds}
            homeCode={t.teams[homeTeam].id}
            awayCode={t.teams[awayTeam].id}
            showLink={!played}
          />
        )}
        {!mark && !m.odds && target.kind === 'group' && (
          <p className="odds-none">No pre-match odds available</p>
        )}

        {mark && m.goals && m.goals.length > 0 && (
          <div className="modal-goals">
            <div className="goals-side goals-home">
              {m.goals
                .filter((g) => g.team === homeTeam)
                .map((g, i) => (
                  <span key={i}>
                    {g.player} {g.minute}
                    {g.penalty ? ' (P)' : ''}
                    {g.ownGoal ? ' (OG)' : ''}
                  </span>
                ))}
            </div>
            <span className="goals-ball">⚽</span>
            <div className="goals-side goals-away">
              {m.goals
                .filter((g) => g.team === awayTeam)
                .map((g, i) => (
                  <span key={i}>
                    {g.player} {g.minute}
                    {g.penalty ? ' (P)' : ''}
                    {g.ownGoal ? ' (OG)' : ''}
                  </span>
                ))}
            </div>
          </div>
        )}

        <div className="modal-body">
          {locked && km ? (
            canForceReveal(km) ? (
              <>
                <p className="modal-hint">
                  These teams are hidden because you haven't finished the games that decide them.
                  You can jump ahead anyway — it reveals who made it this far.
                </p>
                <button type="button" className="btn-primary" onClick={() => progress.reveal(m.id)}>
                  Reveal this matchup
                </button>
              </>
            ) : (
              <p className="modal-hint">This matchup hasn't been decided yet.</p>
            )
          ) : !played ? (
            <>
              <p className="modal-hint">This match hasn't been played yet.</p>
              <a
                className="btn-ghost"
                href={foxWatchUrl(t, target)}
                target="_blank"
                rel="noreferrer"
              >
                Watch live on FOX ↗
              </a>
            </>
          ) : mark ? (
            <>
              {summary && <div className="modal-summary">{summary}</div>}
              {m.videos && m.videos.length > 0 && (
                <MatchHighlights
                  videos={m.videos}
                  marked
                  onReveal={() => {}}
                  showFoxWarning={showFoxWarning}
                />
              )}
              <button
                type="button"
                className="btn-ghost btn-subtle"
                onClick={() => progress.unmark(m.id)}
                title="Anything that depended on this result will be hidden again too"
              >
                Hide Result
              </button>
            </>
          ) : ready ? (
            <>
              {m.videos && m.videos.length > 0 ? (
                <MatchHighlights
                  videos={m.videos}
                  marked={false}
                  onReveal={() => progress.setMark(m.id, 'watched')}
                  showFoxWarning={showFoxWarning}
                />
              ) : (
                <div className="modal-video-placeholder">
                  <span className="modal-video-icon">🎬</span>
                  <span>Highlights coming soon</span>
                </div>
              )}
              <button
                type="button"
                className="btn-primary"
                onClick={() => progress.setMark(m.id, 'watched')}
              >
                Reveal Result
              </button>
              {Object.keys(progress.marks).length < 3 && (
                <p className="modal-hint modal-hint-small">Reveals the score and team progression.</p>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
