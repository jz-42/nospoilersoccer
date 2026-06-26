import {
  createAnalytics,
  describeYouTubeFailure,
  getHighlightFallbackCopy,
  isRegionRestrictedYouTubeError,
  type HighlightEventName,
} from './analytics'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

type TrackedEvent = { name: string; props?: Record<string, unknown> }

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

const events: TrackedEvent[] = []
const provider: { tracker?: (name: string, props?: object) => void } = {}
let onLoad: (() => void) | undefined
const scriptLoads: Array<{ websiteId: string; scriptUrl: string; hostUrl?: string }> = []

const analytics = createAnalytics({
  websiteId: 'test-site',
  getTracker: () => provider.tracker,
  loadScript: (handleLoad, config) => {
    onLoad = handleLoad
    scriptLoads.push(config)
  },
})

analytics.init()
analytics.viewChanged({ view: 'groups' })

assert(scriptLoads.length === 1, 'analytics script is requested when configured')
assert(scriptLoads[0].scriptUrl === 'https://cloud.umami.is/script.js', 'Umami Cloud script is the default')
assert(events.length === 0, 'event waits while the analytics script is loading')

provider.tracker = (name, props) => events.push({ name, props: props as Record<string, unknown> | undefined })
onLoad?.()

assert(events.length === 1, 'queued event is sent when analytics becomes ready')
assert(events[0]?.name === 'view_changed', 'queued event keeps its name')
assert(events[0]?.props?.view === 'groups', 'queued event keeps its properties')

analytics.viewChanged({ view: 'bracket' })
assert(events.length === 2, 'later events are sent immediately')

analytics.trackHighlightEvent('highlight_player_error', {
  tournament: 2026,
  match_id: 'C1',
  home: 'Brazil',
  away: 'Morocco',
  provider: 'fox_youtube',
  video_id: '0rih2fCaXF4',
  video_kind: 'extended',
  error_code: 150,
})

const highlightEvent = events[2]
assert(highlightEvent?.name === 'highlight_player_error', 'highlight error event is tracked')
assert(highlightEvent.props?.failure_reason === 'embed_blocked', 'failure reason is included')
assert(highlightEvent.props?.teams === 'Brazil vs Morocco', 'teams label is included')

const explicitScriptLoads: Array<{ websiteId: string; scriptUrl: string; hostUrl?: string }> = []
const explicitAnalytics = createAnalytics({
  websiteId: 'self-hosted-site',
  scriptUrl: 'https://self-hosted.example/script.js',
  hostUrl: 'https://analytics.example',
  getTracker: () => undefined,
  loadScript: (_handleLoad, config) => {
    explicitScriptLoads.push(config)
  },
})

explicitAnalytics.init()
assert(
  explicitScriptLoads[0].scriptUrl === 'https://self-hosted.example/script.js',
  'explicit script URL override is used',
)
assert(explicitScriptLoads[0].hostUrl === 'https://analytics.example', 'explicit host URL override is used')

const disabledLoads: unknown[] = []
createAnalytics({
  getTracker: () => undefined,
  loadScript: () => {
    disabledLoads.push(true)
  },
}).init()
assert(disabledLoads.length === 0, 'analytics is a no-op without website id')

const eventName: HighlightEventName = 'highlight_play_clicked'
assert(eventName === 'highlight_play_clicked', 'highlight event names are exported')

console.log('ALL ANALYTICS TESTS PASS')
