/**
 * Spoiler-safe embedded highlight player.
 *
 * Leak vectors and how each is closed:
 *  - thumbnails/titles: we never render YouTube's thumbnail — videos sit
 *    behind neutral buttons and the iframe only mounts on click
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

/** Seconds before the end at which we cover the player. */
const END_GUARD_SECONDS = 9

const KIND_LABEL: Record<HighlightVideo['kind'], string> = {
  normal: 'Quick Highlights',
  extended: 'Extended Highlights',
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
  const hostRef = useRef<HTMLDivElement>(null)

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
        playerVars: { autoplay: 1, rel: 0, iv_load_policy: 3, playsinline: 1 },
        events: {
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
            {KIND_LABEL[v.kind]}
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
                  {KIND_LABEL[v.kind]}
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
      <div className="player-wrap">
        {isFoxHighlight(active) ? (
          <iframe
            className="player-host player-host-fox"
            src={highlightEmbedUrl(active)}
            title={KIND_LABEL[active.kind]}
            scrolling="no"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div ref={hostRef} className="player-host" />
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
