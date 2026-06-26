import type { HighlightVideo } from './types'
import {
  highlightEmbedUrl,
  highlightExternalUrl,
  highlightKey,
  preferredHighlightVideos,
  highlightSource,
  isFoxHighlight,
  isYouTubeHighlight,
} from './videos'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const legacyYoutube: HighlightVideo = { youtubeId: 'abc123XYZ_0', kind: 'extended' }
const explicitYoutube: HighlightVideo = { source: 'youtube', youtubeId: 'def456XYZ_0', kind: 'normal' }
const fox: HighlightVideo = { source: 'fox', foxId: 'fmc-oldfixture123', kind: 'normal' }

assert(highlightSource(legacyYoutube) === 'youtube', 'legacy YouTube videos default to YouTube source')
assert(highlightSource(explicitYoutube) === 'youtube', 'explicit YouTube source is recognized')
assert(highlightSource(fox) === 'fox', 'FOX source is recognized')

assert(isYouTubeHighlight(legacyYoutube), 'legacy YouTube video narrows as YouTube')
assert(isYouTubeHighlight(explicitYoutube), 'explicit YouTube video narrows as YouTube')
assert(!isYouTubeHighlight(fox), 'FOX video does not narrow as YouTube')
assert(isFoxHighlight(fox), 'FOX video narrows as FOX')
assert(!isFoxHighlight(legacyYoutube), 'legacy YouTube video does not narrow as FOX')

assert(highlightKey(legacyYoutube) === 'youtube:abc123XYZ_0', 'legacy YouTube key is provider-qualified')
assert(highlightKey(fox) === 'fox:fmc-oldfixture123', 'FOX key is provider-qualified')

const preferredWithFallback = preferredHighlightVideos([fox, explicitYoutube, legacyYoutube])
assert(preferredWithFallback.length === 2, 'provider preference keeps one video per kind')
assert(preferredWithFallback.some((v) => v.kind === 'normal' && isYouTubeHighlight(v)), 'YouTube quick wins over FOX quick')
assert(preferredWithFallback.some((v) => v.kind === 'extended'), 'extended highlight is preserved')

const preferredFoxOnly = preferredHighlightVideos([fox, legacyYoutube])
assert(preferredFoxOnly.some((v) => v.kind === 'normal' && isFoxHighlight(v)), 'FOX quick remains fallback without YouTube quick')

assert(
  highlightExternalUrl(legacyYoutube) === 'https://www.youtube.com/watch?v=abc123XYZ_0',
  'legacy YouTube external URL points to YouTube',
)
assert(
  highlightExternalUrl(fox) === 'https://www.foxsports.com/watch/fmc-oldfixture123',
  'FOX external URL points to the FOX watch page',
)
assert(
  highlightEmbedUrl(fox) ===
    'https://statics.foxsports.com/static/orion/player-embed.html?id=fmc-oldfixture123',
  'FOX embed URL points to the FOX embed player',
)

console.log('ALL PASS')
