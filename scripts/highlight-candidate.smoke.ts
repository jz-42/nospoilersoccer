import assert from 'node:assert/strict'

import { loadTargetedMetadata, loadTargetedUploads } from './highlight-candidate'
import { getVideoMetaFromFeed } from './youtube'

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

const feedMeta = await getVideoMetaFromFeed(
  'target00001',
  'UCexpectedChannel0000000',
  async (url) => {
    assert.match(String(url), /channel_id=UCexpectedChannel0000000$/)
    return new Response(`
      <feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">
        <entry>
          <yt:videoId>target00001</yt:videoId>
          <yt:channelId>UCexpectedChannel0000000</yt:channelId>
          <title>Alpha &amp; Beta vs. Gamma | Highlights</title>
          <published>2026-09-19T20:00:00Z</published>
        </entry>
      </feed>
    `, { status: 200 })
  },
)
assert.deepEqual(feedMeta, {
  id: 'target00001',
  title: 'Alpha & Beta vs. Gamma | Highlights',
  durationSeconds: 0,
  channelId: 'UCexpectedChannel0000000',
  channelTitle: null,
  publishedAt: '2026-09-19T20:00:00Z',
})

await assert.rejects(
  getVideoMetaFromFeed(
    'target00001',
    'UCwrongChannel0000000000',
    async () => new Response(`
      <feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"><entry>
        <yt:videoId>target00001</yt:videoId>
        <yt:channelId>UCexpectedChannel0000000</yt:channelId>
        <title>Title</title><published>2026-09-19T20:00:00Z</published>
      </entry></feed>
    `),
  ),
  /not present on expected channel feed/,
)

let apiFallbackCalls = 0
const feedFirst = await loadTargetedMetadata(
  'target00001',
  'UCexpectedChannel0000000',
  async () => feedMeta,
  async () => {
    apiFallbackCalls += 1
    return metadata('target00001')
  },
)
assert.equal(feedFirst.title, feedMeta.title)
assert.equal(apiFallbackCalls, 0, 'a successful public feed lookup uses no Data API quota')

const fallback = await loadTargetedMetadata(
  'target00001',
  'UCexpectedChannel0000000',
  async () => { throw new Error('feed temporarily unavailable') },
  async (id) => {
    apiFallbackCalls += 1
    return metadata(id)
  },
)
assert.equal(fallback.title, 'Target title')
assert.equal(apiFallbackCalls, 1, 'the Data API is retained only as a recovery fallback')

console.log('ALL TARGETED CURATION TESTS PASS')
