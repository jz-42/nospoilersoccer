import type { HighlightVideo } from '../data/types'
import { formatRuntimeBadge } from './format'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const quick: HighlightVideo = { youtubeId: 'quick-video', kind: 'normal', durationSeconds: 300 }
const extended: HighlightVideo = {
  youtubeId: 'extended-video',
  kind: 'extended',
  durationSeconds: 960,
}

assert(
  formatRuntimeBadge([quick, extended]) === '5m · Extended',
  'runtime badge masks the extended duration when quick and extended cuts both exist',
)
assert(
  formatRuntimeBadge([extended]) === 'Extended',
  'runtime badge shows a neutral extended label when only an extended cut exists',
)
assert(
  formatRuntimeBadge([quick]) === '5m',
  'runtime badge keeps the quick-highlight minute count when no extended cut exists',
)
