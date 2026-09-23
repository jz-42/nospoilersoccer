import { strict as assert } from 'node:assert'
import { shouldRunNationsIngest } from './nations-ingest-gate'

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

console.log('NATIONS INGEST GATE TESTS PASS')
