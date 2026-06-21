/**
 * Privacy-respecting analytics adapter (Umami Cloud).
 *
 * Provider-independent surface. Components call typed functions here; no
 * provider-specific code lives in the UI.
 *
 * No-op when `VITE_UMAMI_WEBSITE_ID` is unset — no script tag is injected,
 * no requests are made, no console noise. This is the configuration the site
 * ships in environments without the env var (local dev, forks).
 *
 * What is *never* sent: team identifiers, scores, opponent identity, the
 * progress payload, persistent user identifiers, the full URL, the user-agent.
 * The Umami snippet is loaded with `data-auto-track="false"` so it does not
 * send automatic pageviews — every event below is explicit.
 */

// `import.meta.env` is Vite-injected at build time. Under node (the smoke-test
// runner uses `tsx`) it doesn't exist, so we guard the access — the adapter
// just stays a no-op in that environment.
const WEBSITE_ID = import.meta.env?.VITE_UMAMI_WEBSITE_ID as string | undefined
const ENABLED = typeof WEBSITE_ID === 'string' && WEBSITE_ID.length > 0

type Phase = 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'third-place' | 'final'

type MatchState = 'upcoming' | 'ready' | 'locked' | 'revealed'
type RevealSource = 'manual' | 'video_end'
type HighlightKind = 'quick' | 'extended'

interface TournamentProps {
  tournament_year: number
  tournament_phase: Phase
}

interface UmamiWindow {
  umami?: {
    track: (eventName: string, data?: object) => void
  }
}

type Tracker = (eventName: string, data?: object) => void

interface AnalyticsOptions {
  websiteId?: string
  getTracker: () => Tracker | undefined
  loadScript: (onLoad: () => void) => void
}

interface PendingEvent {
  name: string
  props?: object
}

export function createAnalytics(options: AnalyticsOptions) {
  const enabled = typeof options.websiteId === 'string' && options.websiteId.length > 0
  const pending: PendingEvent[] = []

  const flush = () => {
    const tracker = options.getTracker()
    if (!tracker) return
    for (const event of pending.splice(0)) tracker(event.name, event.props)
  }

  const track = (name: string, props?: object) => {
    if (!enabled) return
    const tracker = options.getTracker()
    if (tracker) {
      tracker(name, props)
      return
    }
    pending.push({ name, props })
  }

  return {
    init(): void {
      if (!enabled) return
      options.loadScript(flush)
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

    videoFailed(
      props: TournamentProps & { reason: 'embed_blocked' },
    ): void {
      track('video_failed', props)
    },
  }
}

export const analytics = createAnalytics({
  websiteId: ENABLED ? WEBSITE_ID : undefined,
  getTracker: () => {
    const w = window as unknown as UmamiWindow
    return w.umami?.track
  },
  loadScript: (onLoad) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-nss-analytics]')
    if (existing) {
      existing.addEventListener('load', onLoad, { once: true })
      onLoad()
      return
    }

    const script = document.createElement('script')
    script.defer = true
    script.src = 'https://cloud.umami.is/script.js'
    script.dataset.websiteId = WEBSITE_ID!
    script.dataset.autoTrack = 'false'
    script.dataset.nssAnalytics = '1'
    script.addEventListener('load', onLoad, { once: true })
    document.head.appendChild(script)
  },
})

export type { Phase }
