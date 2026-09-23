/**
 * Our own playback controls, drawn over a live YouTube embed (controls=1).
 *
 * YouTube keeps its top-right cluster (volume, captions, settings/quality).
 * Everything else it shows can give a result away: the title, `elapsed /
 * total`, the chapter name, the progress bar and the "More videos"
 * thumbnails. The title shield (HighlightPlayer's) is up the whole time; the
 * rest each get their own cover, sized to what it hides and shown only while
 * YouTube's own could be on screen. What the viewer has turned on (see
 * player-settings.ts) goes uncovered, and we redraw the time and bar
 * ourselves, so they stay usable when YouTube's fade.
 *
 * The iframe is cross-origin, so we cannot see when YouTube's own chrome is
 * up. Measured against the real player (Sep 2026): it shows on any pointer
 * activity inside the iframe, and for ~4.2s after every play, seek or
 * buffering change even with the pointer elsewhere; pause alone and volume
 * changes do not show it, but while paused nothing hides it again. So the
 * covers are up ("guarded") whenever it might be:
 *   - for GUARD_MS after every YouTube state change and every seek we make
 *   - before playback starts, while paused (once up, YouTube's chrome
 *     stays up until playback resumes) and after it ends
 *   - the whole time the pointer may be over the part of the iframe we leave
 *     uncovered (the top strip, where YouTube's cluster lives), and for
 *     GUARD_MS after it comes back. Chrome sends the page no event at all
 *     when the pointer slides into a cross-origin iframe, whether from our
 *     layer or straight in from the page around the player, so "may be"
 *     means: last seen anywhere on the page close to that strip
 * Our own controls come and go separately (pointer activity, pause), so
 * dismissing them can never unmask YouTube's.
 *
 * A transparent stage catches pointer input over the rest of the frame. That
 * gives us idle-hide, click to play/pause and double-click to fullscreen, and
 * keeps keyboard focus on our page so the arrow keys work. When the viewer
 * clicks into YouTube's cluster the browser moves focus into the iframe; we
 * then let pointer input through (YouTube's settings open as a sheet over the
 * middle of the player) while the covers stay up.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlayerSettings } from '../player-settings'

export interface ControlledPlayer {
  getCurrentTime(): number
  getDuration(): number
  getPlayerState(): number
  getVideoLoadedFraction(): number
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  getIframe(): HTMLIFrameElement
}

const UNSTARTED = -1
const ENDED = 0
const PLAYING = 1
const PAUSED = 2
const BUFFERING = 3
const CUED = 5

/** Longer than YouTube's measured 4.2s chrome flash after a play or seek. */
const GUARD_MS = 5000
/** YouTube's own idle-hide delay for pointer movement. */
const IDLE_MS = 3000
const DOUBLE_TAP_MS = 300
/** Presses closer together than this add up in one "+15s" label. */
const FLASH_MS = 900
/** Must match --yt-top-strip in PlayerControls.css. */
const TOP_STRIP_PX = 56
/** How close to the strip, from below (on our layer) and from outside the
 *  player, the pointer last seen counts as maybe inside it. A mouse moving
 *  fast still reports every ~16ms, well inside these. */
const NEAR_STRIP_PX = 32
const APPROACH_PX = 48

/** YouTube's format: m:ss, or h:mm:ss past an hour. */
function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

function SkipIcon({ seconds, forward, spin }: { seconds: number; forward: boolean; spin: number }) {
  // In the manner of SF Symbols' goforward / gobackward: a ring whose open
  // chevron at the top points into the gap it is about to close, the number
  // inside. The back glyph is the same ring mirrored; the number stays
  // upright. Each press winds the ring a little in its direction (a new
  // `spin` remounts it, restarting the animation).
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <g key={spin} className={spin ? 'yt-skip-ring is-spinning' : 'yt-skip-ring'}>
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          transform={forward ? undefined : 'matrix(-1 0 0 1 24 0)'}
        >
          <path d="M12 3.5A9 9 0 1 0 18.36 6.14" />
          <path d="M9.5 0.9L12.3 3.5L9.5 6.1" />
        </g>
      </g>
      <text
        x="12"
        y="15.8"
        textAnchor="middle"
        fontSize={seconds >= 10 ? 8 : 9}
        fontWeight="650"
        fill="currentColor"
        letterSpacing={seconds >= 10 ? '-0.3' : undefined}
      >
        {seconds}
      </text>
    </svg>
  )
}

/** How far the latest run of presses moved, beside the button that did it:
 *  on its outer side and on its centre line, whatever the player's size. */
function SkipLabel({ flash }: { flash: { side: 'back' | 'fwd'; seconds: number; leaving: boolean } }) {
  return (
    <span className={`yt-skip-label yt-skip-label-${flash.side}${flash.leaving ? ' is-leaving' : ''}`} aria-hidden="true">
      {flash.side === 'back' ? '−' : '+'}
      {flash.seconds}s
    </span>
  )
}

export function PlayerControls({
  player,
  stateChangedAt,
  settings,
  onToggleExpanded,
}: {
  player: ControlledPlayer | null
  /** Date.now() of YouTube's latest onStateChange (0 before the first). */
  stateChangedAt: number
  settings: PlayerSettings
  onToggleExpanded: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const [time, setTime] = useState({ current: 0, duration: 0, loaded: 0, state: -1 })
  const [stageHover, setStageHover] = useState(false)
  const [wrapHover, setWrapHover] = useState(false)
  const [nearStrip, setNearStrip] = useState(false)
  const [frameFocused, setFrameFocused] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [scrub, setScrub] = useState<number | null>(null)
  const [hover, setHover] = useState<{ left: number; fraction: number } | null>(null)
  // The latest run of skips in one direction: its total, when the last press
  // landed (also the key that restarts the ring), and whether it is fading.
  const [flash, setFlash] = useState<{ side: 'back' | 'fwd'; seconds: number; at: number; leaving: boolean } | null>(
    null,
  )

  const rootRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  // Deadlines, not booleans: guard = YouTube may be showing (mandatory),
  // active = our controls are wanted (dismissable).
  const [guardUntil, setGuardUntil] = useState(() => Date.now() + GUARD_MS)
  const [activeUntil, setActiveUntil] = useState(() => Date.now() + IDLE_MS)
  const lastTap = useRef<{ at: number; side: 'back' | 'mid' | 'fwd' } | null>(null)

  const guard = useCallback((ms = GUARD_MS) => {
    const t = Date.now()
    setGuardUntil((g) => Math.max(g, t + ms))
    setNow(t)
  }, [])
  const activate = useCallback((ms = IDLE_MS) => {
    const t = Date.now()
    setActiveUntil(t + ms)
    setNow(t)
  }, [])

  // Poll the playhead; YouTube's API has no timeupdate event.
  useEffect(() => {
    if (!player) return
    const tick = () => {
      try {
        setTime({
          current: player.getCurrentTime(),
          duration: player.getDuration(),
          loaded: player.getVideoLoadedFraction(),
          state: player.getPlayerState(),
        })
      } catch {
        // Player torn down between ticks.
      }
      setNow(Date.now())
    }
    tick()
    const id = setInterval(tick, 200)
    return () => clearInterval(id)
  }, [player])

  // Pointer over the uncovered top strip means pointer inside YouTube's
  // iframe: its chrome is up the whole time, and for a while after. Every
  // way out of that state guards.
  const pointerInFrame = (wrapHover && !stageHover) || nearStrip
  const inFrameRef = useRef(false)
  useEffect(() => {
    inFrameRef.current = pointerInFrame
  }, [pointerInFrame])

  useEffect(() => {
    const wrap = rootRef.current?.parentElement
    if (!wrap) return
    const enter = () => setWrapHover(true)
    const leave = () => {
      if (inFrameRef.current) guard()
      setWrapHover(false)
      // Done with YouTube's menus: take the stage back, or our controls would
      // stay away until the viewer happened to click elsewhere on the page.
      setFrameFocused(false)
    }
    wrap.addEventListener('pointerenter', enter)
    wrap.addEventListener('pointerleave', leave)
    return () => {
      wrap.removeEventListener('pointerenter', enter)
      wrap.removeEventListener('pointerleave', leave)
    }
  }, [guard])

  // Where the pointer was last seen, from every move on the page: over our
  // layer below the strip, or outside the player above or beside it.
  useEffect(() => {
    const wrap = rootRef.current?.parentElement
    if (!wrap) return
    let near = false
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      const r = wrap.getBoundingClientRect()
      const n =
        e.clientX > r.left - APPROACH_PX &&
        e.clientX < r.right + APPROACH_PX &&
        e.clientY > r.top - APPROACH_PX &&
        e.clientY < r.top + TOP_STRIP_PX + NEAR_STRIP_PX
      if (n === near) return
      if (near) guard()
      near = n
      setNearStrip(n)
    }
    document.addEventListener('pointermove', onMove)
    return () => document.removeEventListener('pointermove', onMove)
  }, [guard])

  // A click inside YouTube's cluster moves focus into the iframe. Let pointer
  // input through until focus comes back to our page, so its menus work.
  useEffect(() => {
    if (!player) return
    const onBlur = () => {
      // activeElement settles after the blur event.
      setTimeout(() => {
        if (document.activeElement === player.getIframe()) {
          setFrameFocused(true)
          guard()
        }
      }, 0)
    }
    const onFocus = () => setFrameFocused(false)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
    }
  }, [player, guard])

  const duration = time.duration
  const playing = time.state === PLAYING || time.state === BUFFERING
  const current = scrub ?? time.current

  const togglePlay = useCallback(() => {
    if (!player) return
    guard()
    activate()
    if (playing) player.pauseVideo()
    else player.playVideo()
  }, [player, playing, guard, activate])

  const skip = useCallback(
    (dir: 1 | -1) => {
      if (!player) return
      guard()
      activate()
      const d = player.getDuration()
      const target = Math.min(Math.max(player.getCurrentTime() + dir * settings.skipSeconds, 0), Math.max(d - 0.25, 0))
      player.seekTo(target, true)
      setTime((t) => ({ ...t, current: target }))
      const side = dir > 0 ? 'fwd' : 'back'
      const at = Date.now()
      setFlash((f) => ({
        side,
        seconds: f && f.side === side && !f.leaving && at - f.at < FLASH_MS ? f.seconds + settings.skipSeconds : settings.skipSeconds,
        at,
        leaving: false,
      }))
    },
    [player, settings.skipSeconds, guard, activate],
  )

  // The label holds while presses keep coming, then fades out and goes.
  useEffect(() => {
    if (!flash) return
    const id = flash.leaving
      ? setTimeout(() => setFlash(null), 250)
      : setTimeout(() => setFlash((f) => f && { ...f, leaving: true }), FLASH_MS)
    return () => clearTimeout(id)
  }, [flash])

  // Arrow keys skip like YouTube's. Ignored while typing, and while focus is
  // inside YouTube's iframe (those key presses never reach our page anyway).
  useEffect(() => {
    if (!player) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        skip(e.key === 'ArrowRight' ? 1 : -1)
      } else if ((e.key === ' ' || e.key === 'k') && rootRef.current?.parentElement?.contains(el)) {
        e.preventDefault()
        togglePlay()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [player, skip, togglePlay])

  // Every YouTube state change (play, pause, buffering, end) may flash its
  // chrome, and it stays up before the first frame and on the end screen.
  // While paused YouTube never hides it again once it is up, however it got
  // there (a quick pause after play, a pass through the top strip), so a
  // paused player stays guarded until it plays.
  const chromeState = time.state === UNSTARTED || time.state === ENDED || time.state === CUED || time.state === PAUSED
  const guarded =
    chromeState || now < Math.max(guardUntil, stateChangedAt + GUARD_MS) || pointerInFrame || frameFocused
  const wanted = now < activeUntil || !playing || dragging
  // Our time and bar show when wanted, and always along with the covers (the
  // time pill is one of them). Our buttons never while YouTube's menu may be open.
  const shown = guarded || wanted
  const controlsUp = wanted && !frameFocused

  const seekFromPointer = (clientX: number, commit: boolean) => {
    const bar = barRef.current
    if (!bar || !player || !duration) return
    const r = bar.getBoundingClientRect()
    const t = Math.min(Math.max((clientX - r.left) / r.width, 0), 1) * duration
    if (commit) {
      guard()
      player.seekTo(t, true)
      setTime((s) => ({ ...s, current: t }))
      setScrub(null)
    } else {
      setScrub(t)
    }
  }

  const sideOf = (clientX: number): 'back' | 'mid' | 'fwd' => {
    const r = rootRef.current!.getBoundingClientRect()
    const x = (clientX - r.left) / r.width
    return x < 1 / 3 ? 'back' : x > 2 / 3 ? 'fwd' : 'mid'
  }

  const onStageUp = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') {
      if (e.button === 0) togglePlay()
      return
    }
    // Touch: tap shows or hides our controls (never below the guard); a
    // double tap on either side skips, like YouTube's mobile player.
    const side = sideOf(e.clientX)
    const prev = lastTap.current
    if (prev && Date.now() - prev.at < DOUBLE_TAP_MS && prev.side === side && side !== 'mid') {
      skip(side === 'fwd' ? 1 : -1)
      lastTap.current = null
      return
    }
    lastTap.current = { at: Date.now(), side }
    if (now < activeUntil) {
      setActiveUntil(0)
    } else {
      activate(IDLE_MS + 1000)
    }
  }

  const fraction = duration > 0 ? Math.min(current / duration, 1) : 0

  return (
    <div
      ref={rootRef}
      className={[
        'yt-controls',
        guarded && 'is-guarded',
        shown && 'is-shown',
        controlsUp && 'is-up',
        frameFocused && 'is-frame-focused',
        settings.showTitle && 'is-title-shown',
      ]
        .filter(Boolean)
        .join(' ')}
      // Hover anywhere on our layer (stage, buttons, bar) means the pointer is
      // not inside YouTube's iframe.
      onPointerEnter={() => {
        if (pointerInFrame) guard()
        setStageHover(true)
        activate()
      }}
      onPointerLeave={() => setStageHover(false)}
    >
      <div
        className="yt-stage"
        tabIndex={-1}
        onPointerMove={(e) => {
          if (e.pointerType !== 'mouse') return
          activate()
        }}
        onPointerUp={onStageUp}
        onDoubleClick={onToggleExpanded}
      />

      <div className="yt-time-row">
        {/* The pill spans YouTube's (an invisible `elapsed / total`, the
            total sized for the longest one, dd:dd, so the width says
            nothing) and shows only what the viewer wants to see, centred. */}
        <div
          className={`yt-time${settings.showElapsed || settings.showTotal ? '' : ' is-empty'}`}
          aria-label="Playback time"
        >
          <span className="yt-time-size" aria-hidden="true">
            {formatClock(current)}
            <span className="yt-time-sep">/</span>
            {settings.showTotal && duration > 0 ? formatClock(duration) : '00:00'}
          </span>
          {(settings.showElapsed || settings.showTotal) && (
            <span className="yt-time-text">
              {settings.showElapsed && formatClock(current)}
              {settings.showTotal && (
                <span className="yt-time-total">
                  <span className="yt-time-sep">/</span>
                  {duration > 0 ? formatClock(duration) : '--:--'}
                </span>
              )}
            </span>
          )}
        </div>
        {/* YouTube writes the chapter name right after its time. */}
        <span className="yt-chapter-cover" aria-hidden="true" />
      </div>

      {!settings.showProgress && (
        // Paint order matters: the solid line hides YouTube's red before the
        // glass samples what is under it, so the blur can't smear it pink.
        <div className="yt-bar-cover" aria-hidden="true">
          <span className="yt-bar-cover-mute" />
          <span className="yt-bar-cover-glass" />
          <span className="yt-bar-cover-track" />
        </div>
      )}

      {/* YouTube's "More videos": a thumbnail of another match's highlights. */}
      {!settings.showMoreVideos && <div className="yt-more-cover" aria-hidden="true" />}

      {settings.showProgress && (
        <div
          ref={barRef}
          className={`yt-bar${dragging ? ' is-dragging' : ''}`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            setDragging(true)
            seekFromPointer(e.clientX, false)
          }}
          onPointerMove={(e) => {
            activate()
            if (e.pointerType === 'mouse') {
              const r = e.currentTarget.getBoundingClientRect()
              setHover({ left: e.clientX - r.left, fraction: Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1) })
            }
            if (dragging) seekFromPointer(e.clientX, false)
          }}
          onPointerUp={(e) => {
            setDragging(false)
            seekFromPointer(e.clientX, true)
          }}
          onPointerCancel={() => {
            setDragging(false)
            setScrub(null)
          }}
          onPointerLeave={() => setHover(null)}
        >
          <div className="yt-bar-line">
            <div className="yt-bar-loaded" style={{ width: `${Math.max(time.loaded, fraction) * 100}%` }} />
            <div className="yt-bar-played" style={{ width: `${fraction * 100}%` }} />
          </div>
          <div className="yt-bar-head" style={{ left: `${fraction * 100}%` }} />
          {/* Hover time at the far end is the total, so it follows that setting. */}
          {hover && settings.showTotal && duration > 0 && (
            <div className="yt-bar-tip" style={{ left: hover.left }}>
              {formatClock(hover.fraction * duration)}
            </div>
          )}
        </div>
      )}

      <div className="yt-center">
        <span className="yt-skip-slot">
          <button type="button" className="yt-btn yt-skip" onClick={() => skip(-1)} aria-label={`Back ${settings.skipSeconds} seconds`}>
            <SkipIcon seconds={settings.skipSeconds} forward={false} spin={flash?.side === 'back' ? flash.at : 0} />
          </button>
          {flash?.side === 'back' && <SkipLabel key={flash.at} flash={flash} />}
        </span>
        <button type="button" className="yt-btn yt-play" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
            {playing ? (
              <path d="M7 4.5h3.2v15H7zM13.8 4.5H17v15h-3.2z" />
            ) : (
              <path d="M8.3 4.8v14.4l11.2-7.2z" />
            )}
          </svg>
        </button>
        <span className="yt-skip-slot">
          <button type="button" className="yt-btn yt-skip" onClick={() => skip(1)} aria-label={`Forward ${settings.skipSeconds} seconds`}>
            <SkipIcon seconds={settings.skipSeconds} forward spin={flash?.side === 'fwd' ? flash.at : 0} />
          </button>
          {flash?.side === 'fwd' && <SkipLabel key={flash.at} flash={flash} />}
        </span>
      </div>
    </div>
  )
}
