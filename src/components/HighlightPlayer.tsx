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
 *    reliable playhead; users reveal manually after watching.
 *  - annotations/cards: iv_load_policy=3
 *  - related videos: rel=0 (restricts them to the same channel)
 *  - cookies/tracking: youtube-nocookie.com host
 *
 * Embed-blocked videos (error 101/150) fall back to an external link with a
 * spoiler warning.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
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

interface YTPlayer {
  getCurrentTime(): number
  getDuration(): number
  getIframe(): HTMLIFrameElement
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
}: {
  videos: HighlightVideo[]
  tournamentYear: number
  tournamentPhase: Phase
  marked: boolean
  onReveal: () => void
  matchId: string
  homeName: string
  awayName: string
}) {
  // Extended is the default experience; brief is the catch-up option.
  const defaultVideo = videos.find((v) => v.kind === 'extended') ?? videos[0]
  const [selected, setSelected] = useState<HighlightVideo>(defaultVideo)
  const [active, setActive] = useState<HighlightVideo | null>(null)
  const [atEnd, setAtEnd] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [failedCode, setFailedCode] = useState<number | null>(null)
  const [expanded, setExpanded] = useState(false)
  const hostRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

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
          onReady: (e) => sealFrame(e.target.getIframe()),
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
          if (duration > 0 && duration - current <= END_GUARD_SECONDS) setAtEnd(true)
        } catch {
          // Player not ready yet.
        }
      }, 500)
    })

    return () => {
      cancelled = true
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
                <span className="poster-play" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M8.3 5.5v13l11-6.5z" />
                  </svg>
                </span>
                <span className="poster-label">
                  {highlightLabel(matchId, v)}
                  {dur && <span className="poster-time"> · {dur}</span>}
                </span>
                {v.community && <span className="poster-note">Community upload</span>}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const showOverlay = atEnd && !dismissed && !marked

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
            {/* Spoiler-safe glass over YouTube's title line — see the file
                header. It stops before the player's top-right control cluster
                and stays out of the pointer path. */}
            <div className="player-titlebar">
              <span className="player-titlebar-label">{highlightLabel(matchId, active)}</span>
            </div>
            <button
              type="button"
              className="player-expand"
              onClick={toggleExpanded}
              aria-label={expanded ? 'Exit full screen' : 'Full screen'}
            >
              <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="currentColor">
                {expanded ? (
                  <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
                ) : (
                  <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
                )}
              </svg>
            </button>
          </>
        )}
        {showOverlay && (
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
      {kindToggle}
    </div>
  )
}
