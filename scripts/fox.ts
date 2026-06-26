import { foxEmbedUrl, foxWatchUrl } from '../src/data/videos'

export const FOX_QUICK_RECAP_TOPIC = 'topics/fifa-world-cup---4-minute-game-recaps'
const FOX_FEED_API = 'https://prod-api.foxsports.com/fs/feed'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'

export interface FoxVideoMeta {
  id: string
  title: string
  durationSeconds: number
  publishedAt: string
  thumbnailUrl: string
  watchUrl: string
  embedUrl: string
}

interface FoxFeedItem {
  external_id?: unknown
  title?: unknown
  publication_date?: unknown
  canonical_url?: unknown
  thumbnail?: { url?: unknown }
  mcvod?: { duration?: unknown }
}

const FMC_ID_RE = /^fmc-[a-z0-9]+$/i
const FOX_TITLE_RE = /^.+?\s+vs\.?\s+.+?\s+Highlights\b.*World Cup/i

export function foxFeedUrl({
  topic = FOX_QUICK_RECAP_TOPIC,
  from = 0,
  size = 25,
}: {
  topic?: string
  from?: number
  size?: number
} = {}): string {
  const params = new URLSearchParams({
    component_type: 'video',
    content_type: 'external_media_cloud',
    uri: topic,
    size: String(size),
    from: String(from),
  })
  return `${FOX_FEED_API}?${params.toString()}`
}

function absoluteFoxUrl(url: string): string {
  if (url.startsWith('https://')) return url
  if (url.startsWith('http://')) return url.replace(/^http:\/\//, 'https://')
  if (url.startsWith('foxsports.com/')) return `https://www.${url}`
  if (url.startsWith('www.foxsports.com/')) return `https://${url}`
  return `https://www.foxsports.com/${url.replace(/^\/+/, '')}`
}

export function foxFeedItemToMeta(item: FoxFeedItem): FoxVideoMeta | null {
  const id = typeof item.external_id === 'string' ? item.external_id : ''
  const title = typeof item.title === 'string' ? item.title : ''
  const publishedAt = typeof item.publication_date === 'string' ? item.publication_date : ''
  const thumbnailUrl = typeof item.thumbnail?.url === 'string' ? item.thumbnail.url : ''
  const rawDuration = item.mcvod?.duration
  const durationSeconds = typeof rawDuration === 'number' ? Math.round(rawDuration) : 0

  if (!FMC_ID_RE.test(id)) return null
  if (!FOX_TITLE_RE.test(title)) return null
  if (!publishedAt || Number.isNaN(new Date(publishedAt).getTime())) return null
  if (!thumbnailUrl) return null
  if (durationSeconds <= 0) return null

  const canonical = typeof item.canonical_url === 'string' ? item.canonical_url : ''
  return {
    id,
    title,
    durationSeconds,
    publishedAt,
    thumbnailUrl,
    watchUrl: canonical ? absoluteFoxUrl(canonical) : foxWatchUrl(id),
    embedUrl: foxEmbedUrl(id),
  }
}

export function parseFoxFeedPayload(payload: unknown): { total: number; videos: FoxVideoMeta[] } {
  const data =
    payload && typeof payload === 'object' && 'data' in payload
      ? (payload as { data?: unknown }).data
      : payload
  const body = data && typeof data === 'object' ? data as { existing_total?: unknown; results?: unknown } : {}
  const total = typeof body.existing_total === 'number' ? body.existing_total : 0
  const rows = Array.isArray(body.results) ? body.results : []
  return {
    total,
    videos: rows.map((row) => foxFeedItemToMeta(row as FoxFeedItem)).filter((v): v is FoxVideoMeta => v !== null),
  }
}

export async function listFoxQuickRecaps(max = 100): Promise<FoxVideoMeta[]> {
  const out: FoxVideoMeta[] = []
  let from = 0
  let total = Infinity
  const size = 25

  while (from < total && out.length < max) {
    const res = await fetch(foxFeedUrl({ from, size }), {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`FOX feed ${res.status}`)
    const parsed = parseFoxFeedPayload(await res.json())
    total = parsed.total
    out.push(...parsed.videos)
    if (parsed.videos.length === 0 && from > 0) break
    from += size
  }

  return out.slice(0, max)
}

export async function checkFoxEmbed(foxId: string): Promise<'yes' | 'no' | 'unknown'> {
  try {
    const res = await fetch(foxEmbedUrl(foxId), {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    })
    if (res.ok) return 'yes'
    if (res.status === 404 || res.status === 410) return 'no'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}
