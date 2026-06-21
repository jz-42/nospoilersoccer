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

function track(name: string, props?: object) {
  if (!ENABLED) return
  const w = window as unknown as UmamiWindow
  w.umami?.track(name, props)
}

export const analytics = {
  init(): void {
    if (!ENABLED) return
    if (document.querySelector('script[data-nss-analytics]')) return
    const script = document.createElement('script')
    script.defer = true
    script.src = 'https://cloud.umami.is/script.js'
    script.dataset.websiteId = WEBSITE_ID!
    script.dataset.autoTrack = 'false'
    script.dataset.nssAnalytics = '1'
    document.head.appendChild(script)
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

export type { Phase }
