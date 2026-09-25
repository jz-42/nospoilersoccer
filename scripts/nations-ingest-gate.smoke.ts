import { strict as assert } from 'node:assert'
import { hasNationsHighlightGap, shouldRunNationsIngest } from './nations-ingest-gate'

const base = {
  insideWindow: false,
  pendingStageCount: 1,
  cycle: 1,
  now: new Date('2026-11-20T06:10:00Z'),
}

assert.equal(shouldRunNationsIngest(base), true, 'a pending draw is discovered off-window')
assert.equal(shouldRunNationsIngest({ ...base, now: new Date('2026-11-20T07:10:00Z') }), false, 'discovery is limited to six-hour UTC opportunities')
assert.equal(shouldRunNationsIngest({ ...base, cycle: 2 }), false, 'discovery runs only in the first cycle')
assert.equal(shouldRunNationsIngest({ ...base, pendingStageCount: 0 }), false, 'completed stages do not need discovery')
assert.equal(shouldRunNationsIngest({ ...base, insideWindow: true, cycle: 2 }), true, 'a known match window stays on the fast path')
assert.equal(shouldRunNationsIngest({ ...base, pendingStageCount: 0, highlightGap: true, now: new Date('2026-11-20T07:10:00Z') }), true, 'a missing highlight keeps the hourly catch-up running off-window')
assert.equal(shouldRunNationsIngest({ ...base, pendingStageCount: 0, highlightGap: true, cycle: 2 }), false, 'highlight catch-up stays on the first cycle')
assert.equal(shouldRunNationsIngest({ ...base, pendingStageCount: 0, highlightGap: false }), false, 'a covered matchday does not scan off-window')

const now = new Date('2026-09-25T21:02:00Z')
const gapTournament = {
  groupMatches: [
    { id: 'open', kickoff: '2026-09-25T18:45:00Z', score: { home: 1, away: 0 } },
    { id: 'covered', kickoff: '2026-09-25T16:00:00Z', score: { home: 0, away: 1 } },
    { id: 'old', kickoff: '2026-09-20T18:45:00Z', score: { home: 1, away: 0 } },
    { id: 'just-finished', kickoff: '2026-09-25T20:30:00Z', score: { home: 0, away: 0 } },
  ],
  knockoutRounds: [],
}
assert.equal(hasNationsHighlightGap(gapTournament, { covered: [{}] }, now), true, 'a finished match without a cut is a highlight gap')
assert.equal(
  hasNationsHighlightGap(
    { ...gapTournament, groupMatches: gapTournament.groupMatches.filter((match) => match.id !== 'open') },
    { covered: [{}] },
    now,
  ),
  false,
  'covered, old, and still-live matches are not a highlight gap',
)

console.log('NATIONS INGEST GATE TESTS PASS')
