import { fetchGammaEvents } from './polymarket'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const seenUrls: string[] = []
const events = await fetchGammaEvents<{ slug: string }>(
  'https://gamma-api.polymarket.com/events?tag_slug=fifa-world-cup&closed=false',
  async (input) => {
    const url = String(input)
    seenUrls.push(url)
    const offset = Number(new URL(url).searchParams.get('offset') ?? '0')
    const page =
      offset === 0
        ? Array.from({ length: 100 }, (_, i) => ({ slug: `page-1-${i}` }))
        : offset === 100
          ? [
              { slug: 'fifwc-ger-par-2026-06-29' },
              { slug: 'fifwc-fra-swe-2026-06-30' },
            ]
          : []
    return {
      ok: true,
      json: async () => page,
    } as Response
  },
)

assert(events.length === 102, 'paginated Gamma fetch merges later pages into one event list')
assert(
  events.some((event) => event.slug === 'fifwc-ger-par-2026-06-29'),
  'paginated Gamma fetch includes knockout events that only appear after the first page',
)
assert(
  seenUrls[0]?.includes('limit=100') && seenUrls[0]?.includes('offset=0'),
  'first Gamma page request uses explicit limit and offset',
)
assert(
  seenUrls[1]?.includes('offset=100'),
  'second Gamma page request advances the offset by one page',
)

console.log('ALL PASS')
