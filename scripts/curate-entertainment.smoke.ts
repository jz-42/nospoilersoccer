import {
  initializeEntertainmentMap,
  ENTERTAINMENT_PROMPT_VERSION,
  isCurrentEntertainmentEntry,
  isSafeSummary,
  loadEntertainment,
  parseVerdict,
  shouldRetryReason,
  shouldCurate,
} from './curate-entertainment'
import { tournaments } from '../src/data'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const existing = loadEntertainment()
assert(typeof existing === 'object', 'curator loads generated entertainment entries')

assert(
  parseVerdict('{"suitable":true,"rating":4,"summary":"A lively watch.","reason":"usable"}').rating === 4,
  'curator accepts integer entertainment ratings',
)

let rejectedFractionalRating = false
try {
  parseVerdict('{"suitable":true,"rating":3.5,"summary":"A lively watch.","reason":"usable"}')
} catch {
  rejectedFractionalRating = true
}
assert(rejectedFractionalRating, 'curator rejects fractional entertainment ratings')

assert(
  !isSafeSummary('A goalless but tense watch with long spells of pressure.'),
  'curator rejects textual goal-count spoilers',
)

assert(
  !isSafeSummary('It sounded fairly lively, but the contest was one-sided for long stretches.'),
  'curator rejects match-shape spoilers',
)

assert(
  !isSafeSummary('The Saudi support seemed to add more than the suspense did.'),
  'curator rejects team-specific summaries',
)

assert(
  isSafeSummary('Lively and open-feeling, with enough rhythm to sound more engaging than routine.'),
  'curator accepts agnostic entertainment texture',
)

assert(
  !isCurrentEntertainmentEntry({ entertainmentSummary: 'A lively watch.', entertainmentRating: 3 }),
  'curator treats unversioned generated entries as stale',
)

assert(
  isCurrentEntertainmentEntry({
    entertainmentSummary: 'A lively watch.',
    entertainmentRating: 3,
    promptVersion: ENTERTAINMENT_PROMPT_VERSION,
  }),
  'curator recognizes current prompt-version entries',
)

const playedMatch = tournaments.wc2026.groupMatches.find((match) => match.score)
if (!playedMatch) throw new Error('Fixture error: expected a played match')
assert(
  shouldCurate(playedMatch, {}, {
    aiEnabled: true,
    now: new Date('2026-06-26T23:00:00Z').getTime(),
  }),
  'curator can backfill older played matches without a max-age cutoff',
)

assert(
  shouldCurate(
    playedMatch,
    {
      [playedMatch.id]: {
        entertainmentSummary: 'A lively watch.',
        entertainmentRating: 3,
      },
    },
    {
      aiEnabled: true,
      now: new Date('2026-06-26T23:00:00Z').getTime(),
    },
  ),
  'curator retries stale entertainment entries from older prompt versions',
)

const initialized = initializeEntertainmentMap(existing)
assert(
  Object.keys(initialized).length === Object.keys(existing).length,
  'curator preserves existing generated entries while replacing them in later batches',
)

assert(
  !shouldCurate(
    playedMatch,
    {
      [playedMatch.id]: {
        entertainmentSummary: 'A lively watch.',
        entertainmentRating: 3,
        promptVersion: ENTERTAINMENT_PROMPT_VERSION,
      },
    },
    {
      aiEnabled: true,
      now: new Date('2026-06-26T23:00:00Z').getTime(),
    },
  ),
  'curator leaves current-version entertainment entries untouched',
)

assert(shouldRetryReason('safety_rejected'), 'curator retries safety-rejected summaries once')
assert(shouldRetryReason('model_unsuitable'), 'curator retries model-unsuitable summaries once')
assert(!shouldRetryReason('insufficient_signal'), 'curator does not retry weak-signal skips in the same run')

console.log('ALL PASS')
