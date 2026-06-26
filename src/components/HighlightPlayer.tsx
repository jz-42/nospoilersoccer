/**
 * Spoiler-safe embedded highlight player.
 *
 * Leak vectors and how each is closed:
 *  - thumbnails/titles: we never render YouTube's thumbnail — videos sit
 *    behind neutral buttons and the iframe only mounts on click
 *  - end-screen suggestion grid (often shows *later* matches): we watch the
 *    YouTube: we watch the playhead via the IFrame API and slide our own
 *    overlay over the player for the final seconds — which doubles as the
 *    "reveal the result?" prompt. FOX embeds are cross-origin and ad-enabled,
 *    so there is no reliable playhead; users reveal manually after watching.
 *  - annotations/cards: iv_load_policy=3
 *  - related videos: rel=0 (restricts them to the same channel)
 *  - cookies/tracking: youtube-nocookie.com host
 *
 * Embed-blocked videos (error 101/150) fall back to an external link with a
 * spoiler warning.
 */
import { useEffect, useRef, useState } from 'react'
import { analytics } from '../analytics'
import type { Phase } from '../analytics'
import type { HighlightVideo } from '../data/types'
import {
  highlightEmbedUrl,
  highlightExternalUrl,
  highlightKey,
  isFoxHighlight,
  isYouTubeHighlight,
} from '../data/videos'
import { formatDuration } from './format'

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
  normal: 'Quick highlights',
  extended: 'Extended highlights',
}

export function HighlightPlayer({
  videos,
  tournamentYear,
  tournamentPhase,
  marked,
  onReveal,
}: {
  videos: HighlightVideo[]
  tournamentYear: number
  tournamentPhase: Phase
  marked: boolean
  onReveal: () => void
}) {
  // Extended is the default experience; brief is the catch-up option.
  const defaultVideo = videos.find((v) => v.kind === 'extended') ?? videos[0]
  const [selected, setSelected] = useState<HighlightVideo>(defaultVideo)
  const [active, setActive] = useState<HighlightVideo | null>(null)
  const [atEnd, setAtEnd] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [failed, setFailed] = useState(false)
  const hostRef = useRef<HTMLDivElement>(null)

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
            if (e.data === 101 || e.data === 150) {
              setFailed(true)
              analytics.videoFailed({
                tournament_year: tournamentYear,
                tournament_phase: tournamentPhase,
                reason: 'embed_blocked',
              })
            }
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
  }, [active, tournamentYear, tournamentPhase])

  if (videos.length === 0) return null

  if (failed && active) {
    return (
      <div className="video-fallback">
        <p>This video can't be embedded here.</p>
        <a
          className="btn-ghost"
          href={highlightExternalUrl(active)}
          target="_blank"
          rel="noreferrer"
        >
          Open video ↗
        </a>
        <p className="modal-hint-small modal-hint">
          Careful over there — comments and suggested videos may contain spoilers.
        </p>
      </div>
    )
  }

  const play = (v: HighlightVideo) => {
    setSelected(v)
    setActive(v)
    setAtEnd(false)
    setDismissed(false)
    setFailed(false)
    analytics.highlightStarted({
      tournament_year: tournamentYear,
      tournament_phase: tournamentPhase,
      highlight_kind: v.kind === 'extended' ? 'extended' : 'quick',
    })
  }

  const kindToggle = videos.length > 1 && (
    <div className="kind-toggle" role="tablist">
      {videos.map((v) => (
        <button
          key={highlightKey(v)}
          type="button"
          className={`kind-chip ${highlightKey(selected) === highlightKey(v) ? 'active' : ''}`}
          onClick={() => play(v)}
        >
          {KIND_LABEL[v.kind]}
          {formatDuration(v.durationSeconds) && (
            <span className="kind-chip-time">{formatDuration(v.durationSeconds)}</span>
          )}
        </button>
      ))}
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
            const dur = formatDuration(v.durationSeconds)
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
