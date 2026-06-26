/**
 * Privacy-respecting analytics adapter (Umami Cloud).
 *
 * Provider-independent surface. Components call typed functions here; no
 * provider-specific code lives in the UI.
 *
 * No-op when `VITE_UMAMI_WEBSITE_ID` is unset: no script tag is injected,
 * no requests are made, no console noise. The Umami snippet is loaded with
 * `data-auto-track="false"` so it does not send automatic pageviews.
 */
import type { VideoKind } from './data/types'

const WEBSITE_ID = import.meta.env?.VITE_UMAMI_WEBSITE_ID as string | undefined
const SCRIPT_URL = import.meta.env?.VITE_UMAMI_SCRIPT_URL as string | undefined
const HOST_URL = import.meta.env?.VITE_UMAMI_HOST_URL as string | undefined
const ENABLED = typeof WEBSITE_ID === 'string' && WEBSITE_ID.length > 0
const DEFAULT_UMAMI_SCRIPT_URL = 'https://cloud.umami.is/script.js'
const WARNING_COPY = 'Careful — comments and suggested videos may contain spoilers.'

export type Phase = 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'third-place' | 'final'
export type HighlightProvider = 'fox_youtube' | 'fox_site'

type MatchState = 'upcoming' | 'ready' | 'locked' | 'revealed'
type RevealSource = 'manual' | 'video_end'
type HighlightKind = 'quick' | 'extended'

export type HighlightEventName =
  | 'highlight_play_clicked'
  | 'highlight_player_error'
  | 'highlight_external_opened'
  | 'highlight_result_revealed_after_error'

interface TournamentProps {
  tournament_year: number
  tournament_phase: Phase
}

export interface HighlightEventContext {
  tournament: number
  match_id: string
  home: string
  away: string
  provider: HighlightProvider
  video_id: string
  video_kind: VideoKind
  error_code?: number
}

export interface HighlightFallbackCopy {
  title: string
  body: string
  warning: string
}

interface UmamiWindow {
  umami?: {
    track: (eventName: string, data?: object) => void
  }
}

type Tracker = (eventName: string, data?: object) => void

interface AnalyticsOptions {
  websiteId?: string
  scriptUrl?: string
  hostUrl?: string
  getTracker: () => Tracker | undefined
  loadScript: (onLoad: () => void, config: { websiteId: string; scriptUrl: string; hostUrl?: string }) => void
}

interface PendingEvent {
  name: string
  props?: object
}

export function describeYouTubeFailure(code: number | undefined): string {
  switch (code) {
    case 2:
      return 'invalid_video_id'
    case 5:
      return 'html5_error'
    case 100:
      return 'video_unavailable'
    case 101:
    case 150:
      return 'embed_blocked'
    case 153:
      return 'embed_playback_blocked'
    case undefined:
      return 'unknown'
    default:
      return 'unknown'
  }
}

export function isRegionRestrictedYouTubeError(code: number | undefined): boolean {
  return code === 101 || code === 150
}

export function getHighlightFallbackCopy(code: number | undefined): HighlightFallbackCopy {
  if (isRegionRestrictedYouTubeError(code)) {
    return {
      title: 'Highlight unavailable in your region.',
      body: 'FOX Sports highlights may only be available in the U.S. You may need a VPN to watch.',
      warning: WARNING_COPY,
    }
  }

  return {
    title: 'Highlight unavailable.',
    body: 'This video could not be played.',
    warning: WARNING_COPY,
  }
}

function highlightProps(context: HighlightEventContext): Record<string, unknown> {
  const props: Record<string, unknown> = {
    tournament: context.tournament,
    match_id: context.match_id,
    home: context.home,
    away: context.away,
    teams: `${context.home} vs ${context.away}`,
    provider: context.provider,
    video_id: context.video_id,
    video_kind: context.video_kind,
  }

  if (context.error_code !== undefined) {
    props.error_code = context.error_code
    props.failure_reason = describeYouTubeFailure(context.error_code)
  }

  return props
}

export function createAnalytics(options: AnalyticsOptions) {
  const websiteId = options.websiteId?.trim()
  const enabled = typeof websiteId === 'string' && websiteId.length > 0
  const pending: PendingEvent[] = []

  const flush = () => {
    const tracker = options.getTracker()
    if (!tracker) return
    for (const event of pending.splice(0)) tracker(event.name, event.props)
  }

  const track = (name: string, props?: object) => {
    if (!enabled) return
    try {
      const tracker = options.getTracker()
      if (tracker) {
        tracker(name, props)
        return
      }
      pending.push({ name, props })
    } catch {
      // Analytics must never affect the spoiler-safe viewing flow.
    }
  }

  return {
    init(): void {
      if (!websiteId) return
      options.loadScript(flush, {
        websiteId,
        scriptUrl: options.scriptUrl?.trim() || DEFAULT_UMAMI_SCRIPT_URL,
        hostUrl: options.hostUrl?.trim() || undefined,
      })
    },

    viewChanged(props: { view: 'day' | 'groups' | 'bracket' }): void {
      track('view_changed', props)
    },

    matchOpened(props: TournamentProps & { match_state: MatchState }): void {
      track('match_opened', props)
    },

    highlightStarted(
      props: TournamentProps & { highlight_kind: HighlightKind },
    ): void {
      track('highlight_started', props)
    },

    resultRevealed(
      props: TournamentProps & {
        reveal_source: RevealSource
        highlight_kind?: HighlightKind
      },
    ): void {
      track('result_revealed', props)
    },

    catchUp(props: { tournament_year: number; match_count: number }): void {
      track('catch_up', props)
    },

    videoFailed(
      props: TournamentProps & { reason: string },
    ): void {
      track('video_failed', props)
    },

    trackHighlightEvent(eventName: HighlightEventName, context: HighlightEventContext): void {
      track(eventName, highlightProps(context))
    },
  }
}

export const analytics = createAnalytics({
  websiteId: ENABLED ? WEBSITE_ID : undefined,
  scriptUrl: SCRIPT_URL,
  hostUrl: HOST_URL,
  getTracker: () => {
    const w = window as unknown as UmamiWindow
    return w.umami?.track
  },
  loadScript: (onLoad, config) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-nss-analytics]')
    if (existing) {
      existing.addEventListener('load', onLoad, { once: true })
      onLoad()
      return
    }

    const script = document.createElement('script')
    script.defer = true
    script.src = config.scriptUrl
    script.dataset.websiteId = config.websiteId
    script.dataset.autoTrack = 'false'
    script.dataset.nssAnalytics = '1'
    if (config.hostUrl) script.dataset.hostUrl = config.hostUrl
    script.addEventListener('load', onLoad, { once: true })
    document.head.appendChild(script)
  },
})
