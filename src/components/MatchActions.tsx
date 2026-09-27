/**
 * Lab looks (src/looks.ts) for the match sheet's own controls: the Watch
 * Later clock, the Reveal Result button, and the ball that holds the peeks.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ClockIcon } from './ClockIcon'
import { playRevealFx, type RevealFx, type ThawClear, type Winner } from '../reveal-fx'

/**
 * `save: 'bare'`: the clock on its own, no disc, sized and placed as the
 * mirror image of Close. Saving works the way SF Symbols toggle (bookmark →
 * bookmark.fill): the outline clock fills amber, its hand sweeps round once
 * and a ring goes out. Removing plays the same beat backwards. A short toast
 * says which happened; tapping again is the undo.
 */
export function WatchLaterClock({
  saved,
  compact,
  onToggle,
}: {
  saved: boolean
  compact: boolean
  onToggle: () => void
}) {
  // Only a change made here animates, not a sheet that opens already saved.
  const [fx, setFx] = useState<{ kind: 'save' | 'unsave'; at: number } | null>(null)
  useEffect(() => {
    if (!fx) return
    const id = setTimeout(() => setFx(null), 2600)
    return () => clearTimeout(id)
  }, [fx])

  return (
    <>
      <button
        type="button"
        className={`modal-clock${compact ? ' is-compact' : ''}${saved ? ' is-saved' : ''}${fx ? ` is-${fx.kind}` : ''}`}
        aria-label={saved ? 'Remove from Watch Later' : 'Watch Later'}
        aria-pressed={saved}
        data-tip={saved ? 'In Watch Later' : 'Watch Later'}
        onClick={() => {
          setFx({ kind: saved ? 'unsave' : 'save', at: Date.now() })
          onToggle()
        }}
      >
        <svg key={fx?.at ?? 0} className="modal-clock-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle className="modal-clock-ring" cx="8" cy="8" r="6.15" />
          <circle className="modal-clock-face" cx="8" cy="8" r="6.15" />
          <path className="modal-clock-hands" d="M8 4.5v3.7l2.5 1.5" />
        </svg>
      </button>
      {fx &&
        createPortal(
          <div key={fx.at} className={`ma-toast is-${fx.kind}`} role="status">
            <ClockIcon size={15} filled={fx.kind === 'save'} />
            <span>{fx.kind === 'save' ? 'Added to Watch Later' : 'Removed from Watch Later'}</span>
          </div>,
          document.body,
        )}
    </>
  )
}

/**
 * `result`: the one button that ends the spoiler-free state. 'frost' is
 * white with the kits showing faintly through it; 'tint' mixes the kits into
 * the white on purpose, home on the left and away on the right, the way
 * Apple Music tints its buttons from the artwork. `fx` is what the tap does
 * before the score rolls in (see src/reveal-fx.ts).
 */
export function RevealResultButton({
  look,
  fx,
  clear,
  winner,
  onReveal,
}: {
  look: 'green' | 'frost' | 'tint'
  fx: RevealFx
  clear: ThawClear
  /** For the thaw to paint in; it never reaches the page. */
  winner: Winner | null
  onReveal: () => void
}) {
  const [going, setGoing] = useState(false)
  const className =
    look === 'green' ? 'btn-primary modal-pre-reveal-cta' : `reveal-btn is-${look} modal-pre-reveal-cta`
  return (
    <button
      type="button"
      className={`${className}${going ? ' is-going' : ''}`}
      onClick={(e) => {
        if (going) return
        const button = e.currentTarget
        // A keyboard press has no pointer, so it starts from the middle.
        const r = button.getBoundingClientRect()
        const point = e.detail ? { x: e.clientX, y: e.clientY } : { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        setGoing(true)
        playRevealFx(fx, button, point, onReveal, { clear, winner })
      }}
    >
      <span className="reveal-btn-label">Reveal Result</span>
    </button>
  )
}

/**
 * `peeks: 'pill' | 'card'`: the goal count and Worth watching? behind one
 * ball in the bottom-left corner of the highlights, the mirror of the Spoiler
 * Covers mark in the other corner (`inPoster`), or of the sheet's own corner
 * when there are no highlights yet. Pointing at the ball slides the peeks out
 * of it, as a pill beside it or as a card above it. Clicking the ball (or, on
 * touch, tapping it) pins them out until it's clicked again. The values are
 * blurred until tapped, and pointing never unblurs anything, so a passing
 * mouse can't spoil the match. The blur is drawn over a stand-in, not the
 * real value, so the shape of the text gives nothing away.
 */
export function MatchPeek({
  look,
  goals,
  rating,
  summary,
  inPoster = false,
}: {
  look: 'pill' | 'card'
  goals: number | null
  rating?: 1 | 2 | 3 | 4 | 5
  summary?: string
  inPoster?: boolean
}) {
  const [hover, setHover] = useState(false)
  const [pinned, setPinned] = useState(false)
  const open = hover || pinned
  const [shown, setShown] = useState({ goals: false, worth: false })
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const trayId = useId()

  useEffect(() => {
    if (!open) return
    // Capture, and stop it there: Escape folds the peeks, not the sheet.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setPinned(false)
      setHover(false)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open])
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
    },
    [],
  )

  const hasWorth = rating !== undefined && summary !== undefined
  if (goals === null && !hasWorth) return null

  const hold = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = null
  }
  const toggle = (key: 'goals' | 'worth') => setShown((s) => ({ ...s, [key]: !s[key] }))

  const goalsItem = goals !== null && (
    <button
      type="button"
      className={`match-peek-item is-goals${shown.goals ? ' is-shown' : ''}`}
      aria-pressed={shown.goals}
      aria-label={shown.goals ? `${goals} ${goals === 1 ? 'goal' : 'goals'}. Blur again` : 'Show total goals'}
      data-tip={look === 'pill' ? 'Total goals' : undefined}
      onClick={() => toggle('goals')}
    >
      {look === 'card' && <span className="match-peek-label">Total goals</span>}
      <span className="match-peek-value">{shown.goals ? goals : 0}</span>
    </button>
  )
  const stars = rating !== undefined && (
    <span className="match-peek-stars" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <StarIcon key={i} on={shown.worth && i < rating} />
      ))}
    </span>
  )
  const worthItem = hasWorth && (
    <button
      type="button"
      className={`match-peek-item is-worth${shown.worth ? ' is-shown' : ''}`}
      aria-pressed={shown.worth}
      aria-label={shown.worth ? `Worth watching: ${rating} out of 5. Blur again` : 'Show whether it’s worth watching'}
      data-tip={look === 'pill' ? 'Worth watching?' : undefined}
      onClick={() => toggle('worth')}
    >
      {look === 'pill' ? (
        <>
          <StarIcon on={shown.worth} />
          <span className="match-peek-value">{shown.worth ? rating : 3}</span>
        </>
      ) : (
        <>
          <span className="match-peek-label">Worth watching?</span>
          {stars}
        </>
      )}
    </button>
  )
  const verdict = hasWorth && (
    <div className={`match-peek-verdict${shown.worth ? ' is-shown' : ''}`} aria-hidden={!shown.worth}>
      <div>
        <p className="entertainment-summary-copy">{summary}</p>
        <p className="entertainment-disclaimer">AI generated — take with a grain of salt.</p>
      </div>
    </div>
  )

  return (
    <div
      className={`match-peek is-${look}${inPoster ? ' in-poster' : ''}${open ? ' is-open' : ''}${pinned ? ' is-pinned' : ''}`}
      onPointerEnter={(e) => {
        if (e.pointerType !== 'mouse') return
        hold()
        setHover(true)
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== 'mouse') return
        hold()
        closeTimer.current = setTimeout(() => setHover(false), 260)
      }}
    >
      <div className="match-peek-surface" id={trayId} inert={!open}>
        {look === 'card' ? (
          <>
            {worthItem}
            {verdict}
            {goalsItem}
          </>
        ) : (
          <>
            {goalsItem}
            {goalsItem && worthItem && <span className="match-peek-rule" aria-hidden="true" />}
            {worthItem}
          </>
        )}
      </div>
      {look === 'pill' && verdict}
      <button
        type="button"
        className="match-peek-ball"
        aria-label="Goals and worth watching"
        aria-expanded={open}
        aria-pressed={pinned}
        aria-controls={trayId}
        onClick={() => {
          // Unpinning folds them now, even under the pointer; pointing
          // again opens them again.
          if (pinned) setHover(false)
          setPinned(!pinned)
        }}
      >
        <BallIcon />
      </button>
    </div>
  )
}

/**
 * A football: Material Symbols' sports_soccer (Apache 2.0), the classic
 * face-on ball, its panels cut out so the poster shows through them.
 */
function BallIcon() {
  return (
    <svg className="match-peek-ball-icon" viewBox="0 -960 960 960" aria-hidden="true" focusable="false">
      <path d={BALL} />
    </svg>
  )
}

const BALL =
  'M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm200-500 54-18 16-54q-32-48-77-82.5T574-786l-54 38v56l160 112Zm-400 0 160-112v-56l-54-38q-54 17-99 51.5T210-652l16 54 54 18Zm-42 308 46-4 30-54-58-174-56-20-40 30q0 65 18 118.5T238-272Zm242 112q26 0 51-4t49-12l28-60-26-44H378l-26 44 28 60q24 8 49 12t51 4Zm-90-200h180l56-160-146-102-144 102 54 160Zm332 88q42-50 60-103.5T800-494l-40-28-56 18-58 174 30 54 46 4Z'

function StarIcon({ on }: { on: boolean }) {
  return (
    <svg className={`match-peek-star${on ? ' is-on' : ''}`} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M8 1.6l1.93 3.92 4.32.63-3.13 3.05.74 4.3L8 11.47 4.14 13.5l.74-4.3L1.75 6.15l4.32-.63z" />
    </svg>
  )
}

/**
 * `scoreIn: 'roll'`: each side's number rolls up into place out of a blur,
 * like a stadium scoreboard's flaps, the away side a beat behind.
 */
export function RollingScore({ home, away }: { home: number; away: number }) {
  const side = (n: number, delay: number) => (
    <span className="score-roll" style={{ ['--n' as string]: n, ['--d' as string]: `${delay}ms` }}>
      <span className="score-roll-strip">
        {Array.from({ length: n + 1 }, (_, i) => (
          <span key={i}>{i}</span>
        ))}
      </span>
    </span>
  )
  return (
    <span className="score-rolling" aria-label={`${home}–${away}`}>
      {side(home, 0)}
      <span className="score-roll-dash">–</span>
      {side(away, 120)}
    </span>
  )
}
