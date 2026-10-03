import { strict as assert } from 'node:assert'
import { reachedFinalThirty, matchesToRevealOnClose, pendingRevealKey, readPendingReveal, takePendingReveal, writePendingReveal } from './player-reveal'

assert.equal(reachedFinalThirty(100, 69.9), false)
assert.equal(reachedFinalThirty(100, 70), true)
assert.equal(reachedFinalThirty(100, 100), true)
assert.equal(reachedFinalThirty(0, 0), false)
assert.equal(reachedFinalThirty(100, Number.NaN), false)

assert.deepEqual(matchesToRevealOnClose(new Set(), {}), [])
assert.deepEqual(matchesToRevealOnClose(new Set(['first', 'second']), { second: 'watched' }), ['first'])
assert.deepEqual(
  matchesToRevealOnClose(new Set(['first', 'second']), {}, new Set(['first'])),
  [],
  'Hide Result should suppress auto reveal for every leg in this sheet',
)

const values = new Map<string, string>()
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value) },
  removeItem: (key: string) => { values.delete(key) },
}
assert.notEqual(pendingRevealKey('cup/a', 'match-1'), pendingRevealKey('cup', 'a/match-1'))
writePendingReveal(storage, 'cup/a', 'match-1')
assert.equal(readPendingReveal(storage, 'cup/a', 'match-1'), true)
assert.equal(readPendingReveal(storage, 'cup/a', 'match-2'), false)
assert.equal(takePendingReveal(storage, 'cup/a', 'match-1'), true)
assert.equal(takePendingReveal(storage, 'cup/a', 'match-1'), false)

console.log('ALL PLAYER REVEAL TESTS PASS')
