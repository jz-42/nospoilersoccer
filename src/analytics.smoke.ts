import {
  describeYouTubeFailure,
  getHighlightFallbackCopy,
  initAnalytics,
  isRegionRestrictedYouTubeError,
  trackHighlightEvent,
  type HighlightEventName,
} from './analytics'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
  console.log(`ok - ${msg}`)
}

assert(describeYouTubeFailure(101) === 'embed_blocked', '101 maps to embed_blocked')
assert(describeYouTubeFailure(150) === 'embed_blocked', '150 maps to embed_blocked')
assert(describeYouTubeFailure(100) === 'video_unavailable', '100 maps to video_unavailable')
assert(describeYouTubeFailure(2) === 'invalid_video_id', '2 maps to invalid_video_id')
assert(describeYouTubeFailure(5) === 'html5_error', '5 maps to html5_error')
assert(describeYouTubeFailure(153) === 'embed_playback_blocked', '153 maps to embed_playback_blocked')
assert(describeYouTubeFailure(999) === 'unknown', 'unknown code maps to unknown')
assert(isRegionRestrictedYouTubeError(101) === true, '101 is treated as region-restricted')
assert(isRegionRestrictedYouTubeError(150) === true, '150 is treated as region-restricted')
assert(isRegionRestrictedYouTubeError(153) === false, '153 is not treated as region-restricted')
assert(isRegionRestrictedYouTubeError(100) === false, '100 is not treated as region-restricted')

const regionalCopy = getHighlightFallbackCopy(150)
assert(regionalCopy.title === 'Highlight unavailable in your region.', 'regional fallback title is specific')
assert(
  regionalCopy.body === 'FOX Sports highlights may only be available in the U.S.',
  'regional fallback body mentions U.S.-only availability',
)

const genericCopy = getHighlightFallbackCopy(5)
assert(genericCopy.title === 'Highlight unavailable.', 'generic fallback title is neutral')
assert(genericCopy.body === 'This video could not be played.', 'generic fallback body is neutral')

const calls: { name: HighlightEventName; props: Record<string, unknown> }[] = []
globalThis.window = {
  umami: {
    track: (name: HighlightEventName, props: Record<string, unknown>) => {
      calls.push({ name, props })
    },
  },
} as unknown as Window & typeof globalThis

trackHighlightEvent('highlight_player_error', {
  tournament: 2026,
  match_id: 'C1',
  home: 'Brazil',
  away: 'Morocco',
  provider: 'fox_youtube',
  video_id: '0rih2fCaXF4',
  video_kind: 'extended',
  error_code: 150,
})

assert(calls.length === 1, 'trackHighlightEvent calls umami when available')
assert(calls[0].name === 'highlight_player_error', 'event name passed to umami')
assert(calls[0].props.failure_reason === 'embed_blocked', 'failure reason is included')
assert(calls[0].props.teams === 'Brazil vs Morocco', 'teams label is included')

delete (globalThis as { window?: unknown }).window
trackHighlightEvent('highlight_play_clicked', {
  tournament: 2026,
  match_id: 'C1',
  home: 'Brazil',
  away: 'Morocco',
  provider: 'fox_youtube',
  video_id: '0rih2fCaXF4',
  video_kind: 'extended',
})

assert(calls.length === 1, 'missing umami is a no-op')

const appendedScripts: Array<{
  src: string
  defer?: boolean
  dataset: Record<string, string>
}> = []
const existingScripts = new Set<string>()

globalThis.document = {
  createElement: (tagName: string) => ({
    tagName,
    dataset: {},
  }),
  head: {
    appendChild: (node: { src?: string; defer?: boolean; dataset?: Record<string, string> }) => {
      appendedScripts.push({
        src: node.src ?? '',
        defer: node.defer,
        dataset: node.dataset ?? {},
      })
      existingScripts.add(`${node.src}::${node.dataset?.websiteId ?? ''}`)
    },
  },
  querySelector: (selector: string) => {
    const match = selector.match(/script\[src="(.+)"\]\[data-website-id="(.+)"\]/)
    if (!match) return null
    return existingScripts.has(`${match[1]}::${match[2]}`) ? {} : null
  },
} as unknown as Document

assert(
  initAnalytics({
    VITE_UMAMI_WEBSITE_ID: 'site-123',
  }) === true,
  'initAnalytics boots Umami for cloud when website id is configured',
)
assert(appendedScripts.length === 1, 'Umami script is appended once')
assert(appendedScripts[0].src === 'https://cloud.umami.is/script.js', 'Umami script URL is preserved')
assert(appendedScripts[0].dataset.websiteId === 'site-123', 'Umami website id is attached')
assert(appendedScripts[0].defer === true, 'Umami script loads deferred')
assert(
  initAnalytics({
    VITE_UMAMI_WEBSITE_ID: 'site-123',
  }) === true,
  'initAnalytics reports configured when script already exists',
)
assert(appendedScripts.length === 1, 'Umami bootstrap does not append duplicates')
assert(
  initAnalytics({
    VITE_UMAMI_SCRIPT_URL: 'https://self-hosted.example/script.js',
    VITE_UMAMI_WEBSITE_ID: 'site-456',
  }) === true,
  'initAnalytics accepts an explicit script URL override',
)
assert(appendedScripts[1].src === 'https://self-hosted.example/script.js', 'explicit script URL override is used')
assert(initAnalytics({}) === false, 'initAnalytics is a no-op without website id')

console.log('ALL PASS')
