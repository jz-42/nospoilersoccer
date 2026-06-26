import {
  FOX_QUICK_RECAP_TOPIC,
  foxFeedItemToMeta,
  foxFeedUrl,
  parseFoxFeedPayload,
} from './fox'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const feedItem = {
  external_id: 'fmc-oldfixture123',
  title: 'Mexico vs South Africa Highlights | 2026 FIFA World Cup™',
  publication_date: '2026-06-11T22:49:31Z',
  canonical_url: 'foxsports.com/watch/fmc-oldfixture123',
  thumbnail: {
    url: 'https://static-media.fox.com/fmc/prod/sports/VX-example/poster.jpg',
  },
  mcvod: {
    duration: 277.2,
  },
}

const meta = foxFeedItemToMeta(feedItem)
assert(meta !== null, 'valid FOX feed item maps to metadata')
assert(meta?.id === 'fmc-oldfixture123', 'metadata keeps FOX id')
assert(meta?.durationSeconds === 277, 'metadata rounds duration to whole seconds')
assert(meta?.publishedAt === '2026-06-11T22:49:31Z', 'metadata keeps publish instant')
assert(meta?.watchUrl === 'https://www.foxsports.com/watch/fmc-oldfixture123', 'metadata normalizes watch URL')
assert(
  meta?.embedUrl === 'https://statics.foxsports.com/static/orion/player-embed.html?id=fmc-oldfixture123',
  'metadata builds FOX embed URL',
)

assert(
  foxFeedItemToMeta({ ...feedItem, title: 'Mexico wins a match' }) === null,
  'non-generic title is rejected before curation',
)
assert(
  foxFeedItemToMeta({ ...feedItem, external_id: 'not-fox-id' }) === null,
  'non-FMC ids are rejected',
)

const payload = {
  data: {
    existing_total: 2,
    results: [feedItem, { ...feedItem, external_id: 'bad-id' }],
  },
}
const parsed = parseFoxFeedPayload(payload)
assert(parsed.total === 2, 'feed parser reads total count')
assert(parsed.videos.length === 1, 'feed parser keeps only valid videos')
assert(parsed.videos[0].id === 'fmc-oldfixture123', 'feed parser returns mapped metadata')

assert(
  foxFeedUrl({ topic: FOX_QUICK_RECAP_TOPIC, from: 25, size: 25 }) ===
    'https://prod-api.foxsports.com/fs/feed?component_type=video&content_type=external_media_cloud&uri=topics%2Ffifa-world-cup---4-minute-game-recaps&size=25&from=25',
  'feed URL points to the paginated FOX API',
)

console.log('ALL PASS')
