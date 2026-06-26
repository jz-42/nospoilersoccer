import type { VideoKind } from './data/types'

export type HighlightProvider = 'fox_youtube'

export type HighlightEventName =
  | 'highlight_play_clicked'
  | 'highlight_player_error'
  | 'highlight_external_opened'
  | 'highlight_result_revealed_after_error'

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

export interface AnalyticsEnv {
  VITE_UMAMI_SCRIPT_URL?: string
  VITE_UMAMI_WEBSITE_ID?: string
  VITE_UMAMI_HOST_URL?: string
}

declare global {
  interface Window {
    umami?: {
      track?: (eventName: string, eventData?: Record<string, unknown>) => void
    }
  }
}

const WARNING_COPY = 'Careful — comments and suggested videos may contain spoilers.'
const DEFAULT_UMAMI_SCRIPT_URL = 'https://cloud.umami.is/script.js'

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
      body: 'FOX Sports highlights may only be available in the U.S.',
      warning: WARNING_COPY,
    }
  }

  return {
    title: 'Highlight unavailable.',
    body: 'This video could not be played.',
    warning: WARNING_COPY,
  }
}

export function initAnalytics(env: AnalyticsEnv): boolean {
  if (typeof document === 'undefined') return false

  const websiteId = env.VITE_UMAMI_WEBSITE_ID?.trim()
  if (!websiteId) return false

  const scriptUrl = env.VITE_UMAMI_SCRIPT_URL?.trim() || DEFAULT_UMAMI_SCRIPT_URL

  const selector = `script[src="${scriptUrl}"][data-website-id="${websiteId}"]`
  if (document.querySelector(selector)) return true

  const script = document.createElement('script')
  script.defer = true
  script.src = scriptUrl
  script.dataset.websiteId = websiteId

  const hostUrl = env.VITE_UMAMI_HOST_URL?.trim()
  if (hostUrl) {
    script.dataset.hostUrl = hostUrl
  }

  document.head.appendChild(script)
  return true
}

export function trackHighlightEvent(eventName: HighlightEventName, context: HighlightEventContext) {
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

  try {
    window.umami?.track?.(eventName, props)
  } catch {
    // Analytics must never affect the spoiler-safe viewing flow.
  }
}
