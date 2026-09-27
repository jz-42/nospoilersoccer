/**
 * Spoiler-safe embedded highlight player.
 *
 * Leak vectors and how each is closed:
 *  - thumbnails/titles: we never render YouTube's thumbnail — videos sit
 *    behind neutral buttons and the iframe only mounts on click
 *  - the player's own title bar (YouTube draws the video title + channel over
 *    the top of the frame on hover, on pause and while the controls are up):
 *    there is no player var that turns it off — showinfo/modestbranding were
 *    both retired — so we cover that strip with our own title shield while
 *    leaving YouTube's reserved top-right control cluster exposed. Because a
 *    fullscreen iframe would escape that shield, YouTube's fullscreen button
 *    is disabled (fs=0, allowfullscreen stripped) and our own expand control
 *    fullscreens the wrapper — shield included. Picture-in-picture is dropped
 *    from the iframe's permissions for the same reason: it is a surface we
 *    cannot paint over.
 *  - end-screen suggestion grid (often shows *later* matches): YouTube uses
 *    the IFrame API playhead so we can cover the final seconds with our own
 *    reveal prompt. FOX embeds are cross-origin and ad-enabled, so there is no
 *    reliable playhead; users reveal manually after watching. (Lab look
 *    `autoReveal: 'countdown'` counts down in the corner over the last
 *    seconds instead, covers only the last beat, so no play is lost, and
 *    reveals by itself unless you stop it.)
 *  - annotations/cards: iv_load_policy=3
 *  - related videos: rel=0 (restricts them to the same channel)
 *  - cookies/tracking: youtube-nocookie.com host
 *
 * Embed-blocked videos (error 101/150) fall back to an external link with a
 * spoiler warning.
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { analytics, describeYouTubeFailure, getHighlightFallbackCopy } from '../analytics'
import type { Phase } from '../analytics'
import type { HighlightVideo } from '../data/types'
import {
  highlightEmbedUrl,
  highlightExternalUrl,
  highlightKey,
  isFoxHighlight,
  isYouTubeHighlight,
} from '../data/videos'
import { formatHighlightDuration } from './format'
import { usePlayerSettings } from '../player-settings'
import { PlayerControls, type ControlledPlayer } from './PlayerControls'
import { PlayerTitlebar } from './PlayerTitlebar'
import { SpoilerCoversButton } from './SpoilerCovers'
import { useLooks } from '../looks'
import { playRevealFx } from '../reveal-fx'

interface YTPlayer extends ControlledPlayer {
  destroy(): void
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string
      host?: string
      playerVars?: Record<string, string | number>
      events?: {
        onReady?: (e: { target: YTPlayer }) => void
        onError?: (e: { data: number }) => void
        onStateChange?: (e: { data: number }) => void
      }
    },
  ) => YTPlayer
  PlayerState: { ENDED: number }
}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

let ytApi: Promise<YTNamespace> | null = null

function loadYouTubeApi(): Promise<YTNamespace> {
  if (ytApi) return ytApi
  ytApi = new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve(window.YT)
      return
    }
    window.onYouTubeIframeAPIReady = () => resolve(window.YT!)
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
  })
  return ytApi
}

/**
 * Closes the escape hatches out of our title cover: a fullscreen or
 * picture-in-picture iframe paints itself, and YouTube puts the title back on
 * top the moment it does. Permissions are read when the frame navigates, so
 * this runs on the freshly built iframe as well as on ready.
 */
function sealFrame(frame: HTMLIFrameElement | null | undefined) {
  if (!frame) return
  frame.removeAttribute('allowfullscreen')
  frame.setAttribute('allow', 'autoplay; encrypted-media')
}

/** Seconds before the end at which we cover the player. */
const END_GUARD_SECONDS = 9
/**
 * With the countdown, only the last beat: highlights often run play right up
 * to the end, so the cover waits for the closing fade, just soon enough to
 * beat YouTube's suggestion grid.
 */
const END_BEAT_SECONDS = 0.4
/**
 * The countdown runs over the video's last this-many seconds, while it plays
 * on. Highlights mostly finish well before their video does, and where they
 * don't, a pill in the corner costs nothing.
 */
const COUNTDOWN_SECONDS = 20
/** Too briefly on screen to have been seen: the result doesn't follow by itself. */
const COUNTDOWN_SEEN_MS = 1500

/** YouTube's own play button, the rounded lozenge, as its SVG draws it. */
const YOUTUBE_PLAY_PILLOW =
  'M66.52,7.74c-0.78-2.93-2.49-5.41-5.42-6.19C55.79,.13,34,0,34,0S12.21,.13,6.9,1.55C3.97,2.33,2.27,4.81,1.48,7.74C0.06,13.05,0,24,0,24s0.06,10.95,1.48,16.26c0.78,2.93,2.49,5.41,5.42,6.19C12.21,47.87,34,48,34,48s21.79-0.13,27.1-1.55c2.93-0.78,4.64-3.26,5.42-6.19C67.94,34.95,68,24,68,24S67.94,13.05,66.52,7.74z'

/**
 * Lab look `play`: YouTube's button, red ('yt-real'), the embed's smoke grey
 * that turns red when pointed at ('yt-dark'), or the red as tinted glass,
 * lit from above with a fine rim ('yt-glass').
 */
function YouTubePlay({ look }: { look: 'yt-real' | 'yt-dark' | 'yt-glass' }) {
  const sheen = useId()
  return (
    <span className={`poster-play poster-play-yt is-${look}`} aria-hidden="true">
      <svg viewBox="0 0 68 48">
        <path className="poster-play-pillow" d={YOUTUBE_PLAY_PILLOW} />
        {look === 'yt-glass' && (
          <>
            <linearGradient id={sheen} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0.34" />
              <stop offset="0.5" stopColor="#fff" stopOpacity="0.06" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <path className="poster-play-sheen" d={YOUTUBE_PLAY_PILLOW} fill={`url(#${sheen})`} />
            <path className="poster-play-rim" d={YOUTUBE_PLAY_PILLOW} />
          </>
        )}
        <path className="poster-play-glyph" d="M45 24 27 14v20z" />
      </svg>
    </span>
  )
}

const KIND_LABEL: Record<HighlightVideo['kind'], string> = {
  normal: 'Quick Highlights',
  extended: 'Extended Highlights',
}

const CLUB_PROVIDER_BY_MATCH_PREFIX = {
  'eng1-': 'NBC',
  'esp1-': 'ESPN',
  'ucl-': 'CBS',
} as const

const PUBLISHER_LABEL = {
  'espn-fc': 'ESPN FC',
  'espn-deportes': 'ESPN Deportes',
} as const

function highlightLabel(matchId: string, video: HighlightVideo): string {
  if ('publisher' in video && video.publisher) {
    return `Highlights (${PUBLISHER_LABEL[video.publisher]})`
  }
  const provider = Object.entries(CLUB_PROVIDER_BY_MATCH_PREFIX)
    .find(([prefix]) => matchId.startsWith(prefix))?.[1]
  return provider ? `Highlights (${provider})` : KIND_LABEL[video.kind]
}

export function HighlightPlayer({
  videos,
  tournamentYear,
  tournamentPhase,
  marked,
  onReveal,
  matchId,
  homeName,
  awayName,
  customControls = true,
  posterCorner,
}: {
  videos: HighlightVideo[]
  tournamentYear: number
  tournamentPhase: Phase
  marked: boolean
  onReveal: () => void
  matchId: string
  homeName: string
  awayName: string
  /** Our own controls over YouTube's bottom row; the player lab can turn them off to compare. */
  customControls?: boolean
  /** Rides the posters' bottom-left corner, opposite the Spoiler Covers mark. */
  posterCorner?: ReactNode
}) {
  // Extended is the default experience; brief is the catch-up option.
  const defaultVideo = videos.find((v) => v.kind === 'extended') ?? videos[0]
  const [selected, setSelected] = useState<HighlightVideo>(defaultVideo)
  const [active, setActive] = useState<HighlightVideo | null>(null)
  const [atEnd, setAtEnd] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  // Lab look `autoReveal`: the full-time countdown is running, and the
  // video is into the seconds it runs over.
  const [counting, setCounting] = useState(true)
  const [closing, setClosing] = useState(false)
  const [failedCode, setFailedCode] = useState<number | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [ytPlayer, setYtPlayer] = useState<YTPlayer | null>(null)
  const [stateChangedAt, setStateChangedAt] = useState(0)
  const playerSettings = usePlayerSettings()
  const looks = useLooks()
  const hostRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const revealing = useRef(false)
  const endGuard = useRef(END_GUARD_SECONDS)
  useEffect(() => {
    endGuard.current = looks.autoReveal === 'countdown' ? END_BEAT_SECONDS : END_GUARD_SECONDS
  }, [looks.autoReveal])

  const analyticsContext = useCallback(
    (v: HighlightVideo, errorCode?: number) => ({
      tournament: tournamentYear,
      match_id: matchId,
      home: homeName,
      away: awayName,
      provider: isFoxHighlight(v) ? 'fox_site' as const : 'fox_youtube' as const,
      video_id: isFoxHighlight(v) ? v.foxId : v.youtubeId,
      video_kind: v.kind,
      error_code: errorCode,
    }),
    [awayName, homeName, matchId, tournamentYear],
  )

  useEffect(() => {
    if (!active || !hostRef.current || !isYouTubeHighlight(active)) return
    let player: YTPlayer | null = null
    let interval: ReturnType<typeof setInterval> | null = null
    let cancelled = false

    // The API replaces the mount node, so give it a disposable child.
    const mount = document.createElement('div')
    hostRef.current.appendChild(mount)

    loadYouTubeApi().then((YT) => {
      if (cancelled) return
      player = new YT.Player(mount, {
        videoId: active.youtubeId,
        host: 'https://www.youtube-nocookie.com',
        playerVars: { autoplay: 1, rel: 0, iv_load_policy: 3, playsinline: 1, fs: 0, disablekb: 1 },
        events: {
          onReady: (e) => {
            sealFrame(e.target.getIframe())
            if (!cancelled) setYtPlayer(e.target)
          },
          onError: (e) => {
            setFailedCode(e.data)
            analytics.videoFailed({
              tournament_year: tournamentYear,
              tournament_phase: tournamentPhase,
              reason: describeYouTubeFailure(e.data),
            })
            analytics.trackHighlightEvent('highlight_player_error', analyticsContext(active, e.data))
          },
          onStateChange: (e) => {
            setStateChangedAt(Date.now())
            if (e.data === YT.PlayerState.ENDED) setAtEnd(true)
          },
        },
      })
      sealFrame(hostRef.current?.querySelector('iframe'))
      interval = setInterval(() => {
        if (!player) return
        try {
          const duration = player.getDuration()
          const current = player.getCurrentTime()
          if (duration > 0 && duration - current <= endGuard.current) setAtEnd(true)
          setClosing(duration > 0 && duration - current <= END_BEAT_SECONDS + COUNTDOWN_SECONDS)
        } catch {
          // Player not ready yet.
        }
      }, 200)
    })

    return () => {
      cancelled = true
      setYtPlayer(null)
      if (interval) clearInterval(interval)
      try {
        player?.destroy()
      } catch {
        // Already gone.
      }
      mount.remove()
    }
  }, [active, analyticsContext, tournamentPhase, tournamentYear])

  // Escape / the system fullscreen chrome can leave fullscreen without us.
  useEffect(() => {
    const sync = () => setExpanded(document.fullscreenElement === wrapRef.current)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  // We fullscreen the wrapper, not the iframe, so the title cover comes along.
  // iOS Safari has no element fullscreen, so fall back to a fixed-position
  // blow-up of the same wrapper.
  const toggleExpanded = () => {
    const wrap = wrapRef.current
    if (!wrap) return
    if (document.fullscreenElement) {
      void document.exitFullscreen()
      return
    }
    if (expanded) {
      setExpanded(false)
      return
    }
    if (wrap.requestFullscreen) {
      wrap.requestFullscreen().catch(() => setExpanded(true))
    } else {
      setExpanded(true)
    }
  }

  if (videos.length === 0) return null

  if (failedCode !== null && active) {
    const fallbackCopy = getHighlightFallbackCopy(failedCode)
    const revealAfterError = () => {
      analytics.trackHighlightEvent('highlight_result_revealed_after_error', analyticsContext(active, failedCode))
      onReveal()
    }

    return (
      <div className="video-fallback">
        <span className="video-fallback-icon" aria-hidden="true">
          🌍
        </span>
        <p className="video-fallback-title">{fallbackCopy.title}</p>
        <p className="video-fallback-copy">{fallbackCopy.body}</p>
        {!marked && (
          <button type="button" className="btn-primary" onClick={revealAfterError}>
            Reveal Result
          </button>
        )}
        <a
          className="btn-ghost"
          href={highlightExternalUrl(active)}
          target="_blank"
          rel="noreferrer"
          onClick={() => analytics.trackHighlightEvent('highlight_external_opened', analyticsContext(active, failedCode))}
        >
          Open video ↗
        </a>
        <p className="modal-hint-small modal-hint">{fallbackCopy.warning}</p>
      </div>
    )
  }

  const play = (v: HighlightVideo) => {
    setSelected(v)
    setActive(v)
    setAtEnd(false)
    setDismissed(false)
    setCounting(true)
    setClosing(false)
    setFailedCode(null)
    analytics.highlightStarted({
      tournament_year: tournamentYear,
      tournament_phase: tournamentPhase,
      highlight_kind: v.kind === 'extended' ? 'extended' : 'quick',
    })
    analytics.trackHighlightEvent('highlight_play_clicked', analyticsContext(v))
  }

  const kindToggle = videos.length > 1 && (
    <div className="kind-toggle" role="tablist">
      {videos.map((v) => {
        const dur = formatHighlightDuration(v.durationSeconds, v.kind)
        return (
          <button
            key={highlightKey(v)}
            type="button"
            className={`kind-chip ${highlightKey(selected) === highlightKey(v) ? 'active' : ''}`}
            onClick={() => play(v)}
          >
            {highlightLabel(matchId, v)}
            {dur && <span className="kind-chip-time">{dur}</span>}
          </button>
        )
      })}
    </div>
  )

  // The Spoiler Covers mark sits under the video, at the end of the cut
  // chips' row. FOX's player is cross-origin and ours can't cover it, so
  // there is nothing to set there.
  const covers = customControls && (active ? isYouTubeHighlight(active) : videos.some(isYouTubeHighlight))
  // Lab looks: the settings can also open from inside the player, and then
  // the mark can step aside while a video plays, so there is one entry at a
  // time: the mark before, the player's own button during.
  const inPlayer = covers && looks.blurInPlayer !== 'none'
  const markBelow = covers && (!inPlayer || looks.blurOutside === 'always' || !active)
  const foot = (markBelow || kindToggle) && (
    <div className="player-foot">
      {kindToggle}
      {markBelow && (
        <span className="player-foot-end">
          <SpoilerCoversButton />
        </span>
      )}
    </div>
  )

  if (!active) {
    // Each highlight cut is its own poster — extended first, then the quick
    // cut — so choosing what to watch is one tap, no hidden toggle.
    const order: Record<HighlightVideo['kind'], number> = { extended: 0, normal: 1 }
    const posters = [...videos].sort((a, b) => order[a.kind] - order[b.kind])
    return (
      <div className="player-block">
        <div className="poster-list">
          {posters.map((v) => {
            const dur = formatHighlightDuration(v.durationSeconds, v.kind)
            return (
              <button
                key={highlightKey(v)}
                type="button"
                className="player-poster"
                onClick={() => play(v)}
              >
                {looks.play === 'youtube' ? (
                  <span className="poster-play" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                      <path d="M8.3 5.5v13l11-6.5z" />
                    </svg>
                  </span>
                ) : (
                  <YouTubePlay look={looks.play} />
                )}
                <span className="poster-label">
                  {highlightLabel(matchId, v)}
                  {dur && <span className="poster-time"> · {dur}</span>}
                </span>
                {v.community && <span className="poster-note">Community upload</span>}
              </button>
            )
          })}
          {/* Before anything plays, the mark rides the posters' last corner
              rather than taking a row of its own. */}
          {markBelow && (
            <span className="poster-covers">
              <SpoilerCoversButton />
            </span>
          )}
          {posterCorner && <span className="poster-peek">{posterCorner}</span>}
        </div>
      </div>
    )
  }

  const showOverlay = atEnd && !dismissed && !marked
  const countdown = looks.autoReveal === 'countdown'

  // The countdown doesn't start over if the result is hidden again.
  const reveal = () => {
    revealing.current = false
    setCounting(false)
    onReveal()
  }
  // Back in the sheet first, so the score arrives where you can see it. In
  // the sheet, the pill goes the way Reveal Result does (src/reveal-fx.ts).
  const revealFromPlayer = (pill: HTMLElement | null, point?: { x: number; y: number }) => {
    if (revealing.current) return
    revealing.current = true
    if (document.fullscreenElement) {
      void document.exitFullscreen().finally(reveal)
      return
    }
    if (expanded || !pill) {
      setExpanded(false)
      reveal()
      return
    }
    const r = pill.getBoundingClientRect()
    playRevealFx(looks.revealFx, pill, point ?? { x: r.left + r.width / 2, y: r.top + r.height / 2 }, reveal, {
      clear: looks.thawClear,
    })
  }
  const watchAgain = () => {
    ytPlayer?.seekTo(0, true)
    ytPlayer?.playVideo()
    setAtEnd(false)
    setCounting(true)
    setClosing(false)
  }
  const cornerCountdown = countdown && counting && !marked && (closing || atEnd)

  return (
    <div className="player-block">
      <div ref={wrapRef} className={`player-wrap${expanded ? ' is-expanded' : ''}`}>
        {isFoxHighlight(active) ? (
          <iframe
            className="player-host player-host-fox"
            src={highlightEmbedUrl(active)}
            title={highlightLabel(matchId, active)}
            scrolling="no"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <>
            <div ref={hostRef} className="player-host" />
            {customControls && (
              <PlayerControls
                player={ytPlayer}
                stateChangedAt={stateChangedAt}
                settings={playerSettings}
                onToggleExpanded={toggleExpanded}
              />
            )}
            {/* Spoiler-safe frosted glass over YouTube's title line — see the file
                header. It stops before the player's top-right control cluster
                and stays out of the pointer path. */}
            <PlayerTitlebar label={highlightLabel(matchId, active)} />
            {inPlayer && <SpoilerCoversButton inPlayer />}
            <button
              type="button"
              className="player-expand"
              onClick={toggleExpanded}
              aria-label={expanded ? 'Exit full screen' : 'Full screen'}
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {expanded ? (
                  <>
                    <path className="player-expand-arrow" d="M14 10l6-6M14 5v5h5" />
                    <path className="player-expand-arrow" d="M10 14l-6 6M10 19v-5H5" />
                  </>
                ) : (
                  <>
                    <path className="player-expand-arrow" d="M13.5 10.5L19 5M14 5h5v5" />
                    <path className="player-expand-arrow" d="M10.5 13.5L5 19M10 19H5v-5" />
                  </>
                )}
              </svg>
            </button>
          </>
        )}
        {atEnd && countdown && (
          /* Lab look `autoReveal: 'countdown'`: full time. Only now does
             anything cover the player, opaque, over YouTube's end screen,
             and it stays after the reveal too, since that screen can show
             later matches; the sheet keeps the player through the reveal.
             If the countdown was stopped, or never seen, the result waits
             for a tap here. */
          <div className="player-overlay player-fulltime">
            <span className="fulltime-eyebrow">Full time</span>
            {!marked && !counting && (
              <button
                type="button"
                className="fulltime-reveal"
                onClick={(e) => revealFromPlayer(e.currentTarget, e.detail ? { x: e.clientX, y: e.clientY } : undefined)}
              >
                <span className="reveal-btn-label">Reveal Result</span>
              </button>
            )}
            <button type="button" className="fulltime-quiet" onClick={watchAgain}>
              Watch again
            </button>
          </div>
        )}
        {cornerCountdown && (
          <FullTimeCountdown
            player={ytPlayer}
            atEnd={atEnd}
            onReveal={revealFromPlayer}
            onStop={() => setCounting(false)}
          />
        )}
        {showOverlay && !countdown && (
          <div className="player-overlay">
            <p>That's the match.</p>
            <button type="button" className="btn-primary" onClick={onReveal}>
              Reveal Result
            </button>
            <button type="button" className="btn-ghost btn-subtle" onClick={() => setDismissed(true)}>
              Keep watching
            </button>
          </div>
        )}
      </div>
      {foot}
    </div>
  )
}

/**
 * Lab look `autoReveal: 'countdown'`: over the video's last seconds, Reveal
 * Result counts down in the corner while the video plays on, the way
 * Netflix's next episode does, and × stops it. The ring runs on the video's
 * own clock, so it waits while the video is paused. At the whistle the
 * result follows by itself, but only from a countdown that was on screen long
 * enough to be seen: skip straight to the end and it stands down.
 */
function FullTimeCountdown({
  player,
  atEnd,
  onReveal,
  onStop,
}: {
  player: ControlledPlayer | null
  atEnd: boolean
  onReveal: (pill: HTMLElement | null, point?: { x: number; y: number }) => void
  onStop: () => void
}) {
  const pill = useRef<HTMLButtonElement>(null)
  const ring = useRef<SVGCircleElement>(null)
  const since = useRef(0)
  const done = useRef(false)
  // Revealing: × goes with the pill instead of staying on alone.
  const [going, setGoing] = useState(false)
  const latest = useRef({ onReveal, onStop })
  useEffect(() => {
    latest.current = { onReveal, onStop }
  })

  useEffect(() => {
    since.current = performance.now()
  }, [])

  useEffect(() => {
    let frame = 0
    const tick = () => {
      try {
        const duration = player?.getDuration() ?? 0
        const left = (duration - END_BEAT_SECONDS - (player?.getCurrentTime() ?? 0)) / COUNTDOWN_SECONDS
        if (duration > 0 && ring.current) ring.current.style.strokeDashoffset = String(Math.min(1, Math.max(0, left)))
      } catch {
        // Closed since.
      }
      frame = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [player])

  useEffect(() => {
    if (!atEnd || done.current) return
    done.current = true
    if (performance.now() - since.current >= COUNTDOWN_SEEN_MS) {
      setGoing(true)
      latest.current.onReveal(pill.current)
    } else latest.current.onStop()
  }, [atEnd])

  return (
    <div className={`fulltime-corner${going ? ' is-going' : ''}`}>
      <button type="button" className="fulltime-stop" onClick={onStop} aria-label="Not now" title="Not now">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
        </svg>
      </button>
      <button
        ref={pill}
        type="button"
        className="fulltime-reveal is-corner"
        onClick={(e) => {
          setGoing(true)
          onReveal(e.currentTarget, e.detail ? { x: e.clientX, y: e.clientY } : undefined)
        }}
      >
        <svg className="fulltime-ring" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="7.5" />
          <circle ref={ring} cx="10" cy="10" r="7.5" pathLength="1" />
        </svg>
        <span className="reveal-btn-label">Reveal Result</span>
      </button>
    </div>
  )
}
