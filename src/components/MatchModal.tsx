import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { analytics } from '../analytics'
import type { Phase } from '../analytics'
import { buildGoogleCalendarUrl } from '../calendar/google'
import type { GroupMatch, KnockoutMatch, Tournament } from '../data/types'
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

const KNOCKOUT_PHASES: ReadonlySet<Phase> = new Set([
  'r32',
  'r16',
  'qf',
  'sf',
  'third-place',
  'final',
])

/**
 * Map a knockout match to a low-cardinality analytics phase. Round IDs in
 * the data already match the Phase enum, so this is just a lookup with a
 * conservative fallback if a tournament ever introduces a new round id.
 */
function knockoutPhase(t: Tournament, matchId: string): Phase {
  for (const round of t.knockoutRounds) {
    if (round.matches.some((m) => m.id === matchId)) {
      if (KNOCKOUT_PHASES.has(round.id as Phase)) return round.id as Phase
    }
  }
  return 'final'
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

function CalendarIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="modal-calendar-icon">
      <rect x="3" y="4" width="14" height="13" rx="3" />
      <path d="M6 2.75V6M14 2.75V6M3 7.25H17" />
      <rect x="6.25" y="9.75" width="3" height="3" rx="0.8" className="modal-calendar-icon-accent" />
    </svg>
  )
}

function DisclosureRow({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="modal-disclosure">
      <button
        type="button"
        className="modal-disclosure-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="modal-disclosure-head">
          <span className="modal-disclosure-label">{label}</span>
          {hint && (
            <span
              className="modal-disclosure-hint"
              aria-label={hint}
              title={hint}
            >
              i
            </span>
          )}
        </span>
        <span className="modal-disclosure-action">{open ? 'Hide' : 'Tap to reveal'}</span>
      </button>
      {open && <div className="modal-disclosure-copy">{children}</div>}
    </div>
  )
}

function EntertainmentDisclosureRow({
  summary,
  rating,
}: {
  summary: string
  rating: 1 | 2 | 3 | 4 | 5
}) {
  return (
    <DisclosureRow
      label="AI Entertainment Summary"
      hint="AI synthesis of public reaction. Take with a grain of salt."
    >
      <div className="entertainment-disclosure">
        <div className="entertainment-rating">
          <span className="entertainment-rating-label">Entertainment rating</span>
          <span className="entertainment-stars" aria-label={`${rating} out of 5 stars`}>
            {Array.from({ length: 5 }, (_, i) => (
              <span
                key={i}
                className={`entertainment-star ${i < rating ? 'filled' : ''}`}
                aria-hidden="true"
              >
                ★
              </span>
            ))}
          </span>
        </div>
        <p className="entertainment-summary-copy">{summary}</p>
      </div>
    </DisclosureRow>
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
  const homeNameForAnalytics = homeTeam ? t.teams[homeTeam].name : homePlaceholder || 'Home'
  const awayNameForAnalytics = awayTeam ? t.teams[awayTeam].name : awayPlaceholder || 'Away'
  const phase: Phase = target.kind === 'group' ? 'group' : knockoutPhase(t, m.id)
  const totalGoals = score ? score.home + score.away : null
  const calendarUrl =
    !played && m.kickoff
      ? buildGoogleCalendarUrl({
          title: `${homeNameForAnalytics} vs ${awayNameForAnalytics}`,
          kickoff: m.kickoff,
          durationMinutes: target.kind === 'group' ? 120 : 150,
          details: 'Watch: https://www.fox.com/home',
        })
      : null

  const openedRef = useRef(false)
  useEffect(() => {
    if (openedRef.current) return
    openedRef.current = true
    const matchState = mark
      ? 'revealed'
      : locked
        ? 'locked'
        : ready
          ? 'ready'
          : 'upcoming'
    analytics.matchOpened({
      tournament_year: t.year,
      tournament_phase: phase,
      match_state: matchState,
    })
  }, [t.year, phase, mark, locked, ready])

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

  const entertainmentDisclosure =
    m.entertainmentSummary && m.entertainmentRating ? (
      <EntertainmentDisclosureRow
        summary={m.entertainmentSummary}
        rating={m.entertainmentRating}
      />
    ) : null

  const goalCountDisclosure = totalGoals !== null && !mark ? (
    <DisclosureRow label="Total goals">{`${totalGoals} total goals`}</DisclosureRow>
  ) : null

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
          <div className="modal-context-meta">
            <span className="modal-context-date">
              {formatMatchDateLong(m.date, m.kickoff)}
              {m.kickoff && (
                <>
                  {' · '}
                  <KickoffTime kickoff={m.kickoff} />
                </>
              )}
            </span>
            {calendarUrl && (
              <a
                className="modal-calendar-link"
                href={calendarUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Add to Google Calendar"
                title="Add to Google Calendar"
              >
                <CalendarIcon />
              </a>
            )}
          </div>
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
            </>
          ) : mark ? (
            <>
              {summary && <div className="modal-summary">{summary}</div>}
              {m.videos && m.videos.length > 0 && (
                <HighlightPlayer
                  videos={m.videos}
                  tournamentYear={t.year}
                  tournamentPhase={phase}
                  matchId={m.id}
                  homeName={homeNameForAnalytics}
                  awayName={awayNameForAnalytics}
                  marked
                  onReveal={() => {}}
                />
              )}
              {(entertainmentDisclosure || totalGoals !== null) && (
                <div className="modal-disclosures">
                  {entertainmentDisclosure}
                  {totalGoals !== null && (
                    <DisclosureRow label="Total goals">{`${totalGoals} total goals`}</DisclosureRow>
                  )}
                </div>
              )}
              {m.goals && m.goals.length > 0 && (
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
                <HighlightPlayer
                  videos={m.videos}
                  tournamentYear={t.year}
                  tournamentPhase={phase}
                  matchId={m.id}
                  homeName={homeNameForAnalytics}
                  awayName={awayNameForAnalytics}
                  marked={false}
                  onReveal={() => {
                    analytics.resultRevealed({
                      tournament_year: t.year,
                      tournament_phase: phase,
                      reveal_source: 'video_end',
                    })
                    progress.setMark(m.id, 'watched')
                  }}
                />
              ) : (
                <div className="modal-video-placeholder">
                  <span className="modal-video-icon">🎬</span>
                  <span>Highlights coming soon</span>
                </div>
              )}
              {(entertainmentDisclosure || goalCountDisclosure) && (
                <div className="modal-disclosures">
                  {entertainmentDisclosure}
                  {goalCountDisclosure}
                </div>
              )}
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  analytics.resultRevealed({
                    tournament_year: t.year,
                    tournament_phase: phase,
                    reveal_source: 'manual',
                  })
                  progress.setMark(m.id, 'watched')
                }}
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
