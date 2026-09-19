import assert from 'node:assert/strict'

import { loadTargetedUploads } from './highlight-candidate'

let listed = 0
let fetched = 0
const list = async () => {
  listed += 1
  return [{ id: 'listed00001', title: 'Listed title' }]
}
const metadata = async (id: string) => {
  fetched += 1
  return {
    id,
    title: 'Target title',
    durationSeconds: 300,
    channelId: 'channel',
    channelTitle: 'Channel',
    publishedAt: '2026-09-19T20:00:00Z',
  }
}

const targeted = await loadTargetedUploads('target00001', list, metadata)
assert.deepEqual(targeted.uploads, [{ id: 'target00001', title: 'Target title' }])
assert.equal(targeted.metadata?.id, 'target00001')
assert.equal(listed, 0, 'targeted curation never scans the uploads playlist')
assert.equal(fetched, 1, 'targeted curation fetches exactly one metadata record')

const regular = await loadTargetedUploads(null, list, metadata)
assert.deepEqual(regular.uploads, [{ id: 'listed00001', title: 'Listed title' }])
assert.equal(regular.metadata, null)
assert.equal(listed, 1)
assert.equal(fetched, 1)

console.log('ALL TARGETED CURATION TESTS PASS')
