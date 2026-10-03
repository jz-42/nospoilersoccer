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
 *   - before playback starts and after it ends
 *   - while paused, if the pause began (or was joined) with YouTube's chrome
 *     up: once up, it stays until playback resumes. A pause made while it
 *     is down brings up nothing, so that one idles out like playback
 *   - the whole time the pointer may be over the part of the iframe we leave
 *     uncovered (the top strip, where YouTube's cluster lives), and for
 *     GUARD_MS after it comes back. Chrome sends the page no event at all
 *     when the pointer slides into a cross-origin iframe, whether from our
 *     layer or straight in from the page around the player, so "may be"
 *     means: last seen anywhere on the page close to that strip
 * The bottom row follows pointer activity; the center buttons come up only
 * while the pointer moves close to them (or briefly after a skip), and both
 * idle out alike. Dismissing them cannot unmask YouTube's own chrome.
 *
 * YouTube draws a 56px play/pause disc of its own in the middle of the frame
 * whenever its chrome is up: the flash after a play or a seek, a pointer in
 * the frame, and the whole of any pause that began with the chrome up. That
 * one is left to acknowledge a toggle. A pause made from our layer while
 * YouTube's chrome is hidden brings up nothing of theirs (measured Oct 2026),
 * so ours (a quiet disc in the time pill's smoke) just blinks.
 *
 * `ownDisc` (off; the player lab can turn it on) also stands ours on
 * YouTube's for as long as it predicts theirs is up. Only a prediction: we
 * cannot see YouTube's chrome, so ours can outstay or undershoot it (the
 * pointer leaving the frame, a rebuffer, YouTube changing its timings).
 *
 * A click toggles at once, like YouTube's (a double click therefore pauses
 * and resumes on its way to fullscreen, as YouTube's does too), and the icon
 * flips before YouTube confirms.
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
/** YouTube's chrome flash after a play: measured gone (abruptly, no fade)
 *  4.3s after the play call. */
const CHROME_MS = 4400
/** How long past our model of that flash a pause still counts as made with
 *  YouTube's chrome up: the guard's own margin, plus one poll. */
const STUCK_SLACK_MS = GUARD_MS - CHROME_MS + 200
/** YouTube's own idle-hide delay for pointer movement. */
const IDLE_MS = 3000
const DOUBLE_TAP_MS = 300
/** Pointer this close to the center buttons (px past their group's box)
 *  brings them up; once up, they stay until it is LEAVE_PX away. */
const NEAR_PX = 36
const LEAVE_PX = 72
/** How long the icon trusts a toggle before YouTube's state confirms it. */
const PENDING_MS = 1200
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

export function SkipIcon({ seconds, forward, spin }: { seconds: number; forward: boolean; spin: number }) {
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

/** Pause bars while playing, the play triangle while not. */
function PlayGlyph({ playing }: { playing: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      {playing ? <path d="M7 4.5h3.2v15H7zM13.8 4.5H17v15h-3.2z" /> : <path d="M8.3 4.8v14.4l11.2-7.2z" />}
    </svg>
  )
}

export function PlayerControls({
  player,
  stateChangedAt,
  settings,
  ownDisc = false,
}: {
  player: ControlledPlayer | null
  /** Date.now() of YouTube's latest onStateChange (0 before the first). */
  stateChangedAt: number
  settings: PlayerSettings
  /** Stand our disc on YouTube's while it may be up (see the header). */
  ownDisc?: boolean
}) {
  const [now, setNow] = useState(() => Date.now())
  const [time, setTime] = useState({ current: 0, duration: 0, loaded: 0, state: -1 })
  const [stageHover, setStageHover] = useState(false)
  const [wrapHover, setWrapHover] = useState(false)
  const [nearStrip, setNearStrip] = useState(false)
  const [nearCenter, setNearCenter] = useState(false)
  const [overButton, setOverButton] = useState(false)
  // A toggle not yet reflected in YouTube's polled state, and the glyph that
  // acknowledges it (a new `at` remounts it, restarting its animation).
  const [pending, setPending] = useState<{ playing: boolean; at: number } | null>(null)
  // A pause that brings up nothing of YouTube's: our disc just blinks.
  const [blink, setBlink] = useState<number | null>(null)
  // Our model of YouTube's chrome: when its flash after a play or seek ends,
  // and whether a pause began (or was joined) with it up, which keeps it up
  // until playback resumes.
  const [flashUntil, setFlashUntil] = useState(() => Date.now() + CHROME_MS)
  const [stuck, setStuck] = useState(false)
  // Hovered, YouTube's chrome adds seek buttons beside its disc, where our
  // skips sit; they linger a little after the pointer leaves.
  const [hoverUntil, setHoverUntil] = useState(0)
  const flashUntilRef = useRef(flashUntil)
  const playingRef = useRef(false)
  const inFrameRef = useRef(false)
  const frameFocusedRef = useRef(false)
  const [touchControlsUntil, setTouchControlsUntil] = useState(0)
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
  const centerRef = useRef<HTMLDivElement>(null)
  const lastTap = useRef<{ at: number; side: 'back' | 'mid' | 'fwd' } | null>(null)
  const lastClick = useRef(0)

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
  // YouTube's chrome just came up (or was last seen up).
  const chromeFlash = useCallback(() => {
    const until = Date.now() + CHROME_MS
    flashUntilRef.current = until
    setFlashUntil(until)
    if (!playingRef.current) setStuck(true)
  }, [])
  const leftFrame = useCallback(() => {
    guard()
    chromeFlash()
    setHoverUntil(Date.now() + IDLE_MS)
  }, [guard, chromeFlash])
  // Whether YouTube's chrome may be up as a pause lands, keeping it up.
  const chromeMayBeUp = useCallback(
    (t: number) => t < flashUntilRef.current + STUCK_SLACK_MS || inFrameRef.current || frameFocusedRef.current,
    [],
  )

  // Poll the playhead; YouTube's API has no timeupdate event.
  useEffect(() => {
    if (!player) return
    let last = UNSTARTED
    const tick = () => {
      try {
        const state = player.getPlayerState()
        if (state !== last) {
          last = state
          const t = Date.now()
          if (state === PAUSED) {
            // Whatever was up when it paused stays up.
            if (chromeMayBeUp(t)) setStuck(true)
          } else if (state === PLAYING || state === BUFFERING) {
            setStuck(false)
            flashUntilRef.current = Math.max(flashUntilRef.current, t + CHROME_MS)
            setFlashUntil(flashUntilRef.current)
          } else {
            setStuck(true)
          }
        }
        setTime({
          current: player.getCurrentTime(),
          duration: player.getDuration(),
          loaded: player.getVideoLoadedFraction(),
          state,
        })
        // YouTube caught up with a toggle.
        const isPlaying = state === PLAYING || state === BUFFERING
        setPending((p) => (p && p.playing === isPlaying ? null : p))
      } catch {
        // Player torn down between ticks.
      }
      setNow(Date.now())
    }
    tick()
    const id = setInterval(tick, 200)
    return () => clearInterval(id)
  }, [player, chromeMayBeUp])

  // Pointer over the uncovered top strip means pointer inside YouTube's
  // iframe: its chrome is up the whole time, and for a while after. Every
  // way out of that state guards.
  const pointerInFrame = (wrapHover && !stageHover) || nearStrip
  useEffect(() => {
    inFrameRef.current = pointerInFrame
  }, [pointerInFrame])
  useEffect(() => {
    frameFocusedRef.current = frameFocused
  }, [frameFocused])
  // Handing the stage back after YouTube's menus: its chrome was up in there.
  const unfocusFrame = useCallback(() => {
    if (frameFocusedRef.current) leftFrame()
    setFrameFocused(false)
  }, [leftFrame])

  useEffect(() => {
    const wrap = rootRef.current?.parentElement
    if (!wrap) return
    const enter = () => {
      setWrapHover(true)
      activate()
    }
    const leave = () => {
      if (inFrameRef.current) leftFrame()
      setWrapHover(false)
      setNearCenter(false)
      // Done with YouTube's menus: take the stage back, or our controls would
      // stay away until the viewer happened to click elsewhere on the page.
      unfocusFrame()
    }
    // Over anything of ours in the player (our layer, full screen, the Blur
    // button) means not inside YouTube's iframe, which sends us nothing.
    const over = (e: PointerEvent) => {
      if (inFrameRef.current) leftFrame()
      setStageHover(true)
      if (e.pointerType !== 'mouse') activate()
    }
    const out = (e: PointerEvent) => {
      const to = e.relatedTarget as Node | null
      if (!to || !wrap.contains(to) || to instanceof HTMLIFrameElement) setStageHover(false)
    }
    wrap.addEventListener('pointerenter', enter)
    wrap.addEventListener('pointerleave', leave)
    wrap.addEventListener('pointerover', over)
    wrap.addEventListener('pointerout', out)
    return () => {
      wrap.removeEventListener('pointerenter', enter)
      wrap.removeEventListener('pointerleave', leave)
      wrap.removeEventListener('pointerover', over)
      wrap.removeEventListener('pointerout', out)
    }
  }, [activate, leftFrame, unfocusFrame])

  // Where the pointer was last seen, from every move on the page: over our
  // layer below the strip, or outside the player above or beside it. Only
  // real moves count: the browser also sends a move, at the same spot, when
  // what is under a resting pointer changes (our buttons fading out, say),
  // which would wake the controls it just idled out.
  useEffect(() => {
    const wrap = rootRef.current?.parentElement
    if (!wrap) return
    let near = false
    let center = false
    let lastX = NaN
    let lastY = NaN
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      if (e.clientX === lastX && e.clientY === lastY) return
      lastX = e.clientX
      lastY = e.clientY
      const r = wrap.getBoundingClientRect()
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
      // Measured from the buttons themselves (back skip to forward skip), so
      // the reach follows them at any player size.
      const first = centerRef.current?.firstElementChild?.getBoundingClientRect()
      const last = centerRef.current?.lastElementChild?.getBoundingClientRect()
      const reach = center ? LEAVE_PX : NEAR_PX
      const c =
        inside &&
        !!first &&
        !!last &&
        e.clientX > first.left - reach &&
        e.clientX < last.right + reach &&
        e.clientY > first.top - reach &&
        e.clientY < first.bottom + reach
      if (c !== center) {
        center = c
        setNearCenter(c)
      }
      if (inside) activate()
      const n =
        e.clientX > r.left - APPROACH_PX &&
        e.clientX < r.right + APPROACH_PX &&
        e.clientY > r.top - APPROACH_PX &&
        e.clientY < r.top + TOP_STRIP_PX + NEAR_STRIP_PX
      if (n === near) return
      if (near) leftFrame()
      near = n
      setNearStrip(n)
    }
    document.addEventListener('pointermove', onMove)
    return () => document.removeEventListener('pointermove', onMove)
  }, [activate, leftFrame])

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
    const onFocus = () => unfocusFrame()
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
    }
  }, [player, guard, unfocusFrame])

  const duration = time.duration
  const reportedPlaying = time.state === PLAYING || time.state === BUFFERING
  const playing = pending && now - pending.at < PENDING_MS ? pending.playing : reportedPlaying
  const current = scrub ?? time.current

  useEffect(() => {
    playingRef.current = playing
  }, [playing])

  const togglePlay = useCallback(() => {
    if (!player) return
    guard()
    activate()
    const at = Date.now()
    setPending({ playing: !playing, at })
    if (playing) {
      player.pauseVideo()
      // With YouTube's chrome up, its disc stays for the whole pause and so
      // does ours; with it down, ours just blinks.
      if (chromeMayBeUp(at)) setStuck(true)
      else setBlink(at)
    } else {
      player.playVideo()
      setBlink(null)
      setStuck(false)
      flashUntilRef.current = at + CHROME_MS
      setFlashUntil(flashUntilRef.current)
    }
  }, [player, playing, guard, activate, chromeMayBeUp])

  // Go with YouTube's disc to the frame, not on the next 200ms poll.
  useEffect(() => {
    const wait = flashUntil - Date.now()
    if (wait <= 0) return
    const id = setTimeout(() => setNow(Date.now()), wait + 1)
    return () => clearTimeout(id)
  }, [flashUntil])

  useEffect(() => {
    if (!blink) return
    const id = setTimeout(() => setBlink(null), 450)
    return () => clearTimeout(id)
  }, [blink])

  const skip = useCallback(
    (dir: 1 | -1) => {
      if (!player) return
      guard()
      activate()
      const d = player.getDuration()
      const target = Math.min(Math.max(player.getCurrentTime() + dir * settings.skipSeconds, 0), Math.max(d - 0.25, 0))
      player.seekTo(target, true)
      if (playingRef.current) chromeFlash()
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
    [player, settings.skipSeconds, guard, activate, chromeFlash],
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

  // Every YouTube state change (play, buffering, end) may flash its chrome,
  // and it stays up before the first frame and on the end screen. While
  // paused YouTube never hides it again once it is up, however it got there
  // (a quick pause after play, a pass through the top strip), so such a pause
  // stays guarded until it plays.
  const chromeState =
    time.state === UNSTARTED || time.state === ENDED || time.state === CUED || (time.state === PAUSED && stuck)
  const guarded =
    chromeState || now < Math.max(guardUntil, stateChangedAt + GUARD_MS) || pointerInFrame || frameFocused
  const wanted = now < activeUntil || dragging
  // Guarded covers stay over YouTube's spoiler-bearing chrome even after our
  // progress bar and controls fade. Buttons stay away while its menu is open.
  const shown = guarded || wanted
  const centerUp =
    ((nearCenter && now < activeUntil) ||
      (overButton && now < activeUntil) ||
      now < touchControlsUntil ||
      flash !== null ||
      dragging ||
      pointerInFrame ||
      now < hoverUntil) &&
    !frameFocused
  // YouTube's own center disc may be up (not under its settings sheet), or
  // ours is blinking. The center buttons cover both.
  const discUp =
    (ownDisc && (now < flashUntil || (stuck && !playing) || pointerInFrame) && !frameFocused) || blink !== null
  const discShown = discUp && !centerUp

  const seekFromPointer = (clientX: number, commit: boolean) => {
    const bar = barRef.current
    if (!bar || !player || !duration) return
    const r = bar.getBoundingClientRect()
    const t = Math.min(Math.max((clientX - r.left) / r.width, 0), 1) * duration
    if (commit) {
      guard()
      player.seekTo(t, true)
      if (playing) chromeFlash()
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
      if (e.button !== 0) return
      // The second click of a double click resumes on its way to fullscreen,
      // and takes the first one's glyph with it, so it reads as one gesture.
      const t = Date.now()
      const second = t - lastClick.current < DOUBLE_TAP_MS
      lastClick.current = second ? 0 : t
      togglePlay()
      if (second) setBlink(null)
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
      setTouchControlsUntil(0)
    } else {
      activate(IDLE_MS + 1000)
      setTouchControlsUntil(Date.now() + IDLE_MS + 1000)
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
        wanted && 'is-active',
        centerUp && 'is-center',
        discShown && 'is-disc',
        frameFocused && 'is-frame-focused',
        settings.showTitle && 'is-title-shown',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="yt-title-stage" onPointerUp={onStageUp} />
      <div className="yt-stage" tabIndex={-1} onPointerUp={onStageUp} />

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
            <span className={`yt-time-text${settings.showElapsed ? '' : ' is-total-only'}`}>
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
        {!settings.showChapters && <span className="yt-chapter-cover" aria-hidden="true" />}
      </div>

      {/* YouTube's line and playhead are covered even when the viewer keeps
          the bar: ours is drawn on top, and YouTube's playhead only moves
          once a seek lands, so left showing it would be a second dot that
          stays behind while ours is dragged.
          Paint order matters: the solid line hides YouTube's red before the
          glass samples what is under it, so the blur can't smear it pink. */}
      <div className="yt-bar-cover" aria-hidden="true">
        <span className="yt-bar-cover-mute" />
        <span className="yt-bar-cover-glass" />
        <span className="yt-bar-cover-track" />
      </div>

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
            // A mouse is already seen by the page-wide listener above.
            if (e.pointerType !== 'mouse') activate()
            else {
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

      <div className="yt-disc" aria-hidden="true">
        <PlayGlyph playing={playing} />
      </div>

      <div
        ref={centerRef}
        className="yt-center"
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse') setOverButton(true)
        }}
        onPointerLeave={() => setOverButton(false)}
      >
        <span className="yt-skip-slot">
          <button type="button" className="yt-btn yt-skip" onClick={() => skip(-1)} aria-label={`Back ${settings.skipSeconds} seconds`}>
            <SkipIcon seconds={settings.skipSeconds} forward={false} spin={flash?.side === 'back' ? flash.at : 0} />
          </button>
          {flash?.side === 'back' && <SkipLabel key={flash.at} flash={flash} />}
        </span>
        <button type="button" className="yt-btn yt-play" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
          <PlayGlyph playing={playing} />
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
