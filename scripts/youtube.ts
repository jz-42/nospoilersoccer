/**
 * YouTube source layer for the automatic highlight curator.
 *
 * Lists FOX Sports' uploads and fetches per-video metadata. Prefers the
 * official YouTube Data API v3 (set YOUTUBE_API_KEY) — robust and the right
 * choice in CI. Falls back to scraping the public watch/playlist pages (no
 * key) so local dry-runs work out of the box; the scrape mirrors the proven
 * regexes in scripts/curate.mjs.
 *
 * Why FOX only: their World Cup highlight uploads follow one rigid, spoiler-
 * free title format. Their *other* uploads (goal clips, reactions, "Japan
 * draws level LATE!") are full of spoilers — but none of them match the
 * highlight title pattern below, so they're filtered out before anything
 * fetches metadata or calls an AI.
 */

/** FOX Sports' channel; the uploads playlist is the channel id with UC→UU. */
export const FOX_CHANNEL_ID = 'UCwNqHDsnBCKT-olwJwIFyfg'
export const FOX_UPLOADS_PLAYLIST = 'UU' + FOX_CHANNEL_ID.slice(2)

const API_KEY = process.env.YOUTUBE_API_KEY
const API = 'https://www.googleapis.com/youtube/v3'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'

export interface PlaylistVideo {
  id: string
  title: string
}

export interface VideoMeta {
  id: string
  title: string
  durationSeconds: number
  embeddable: boolean
  channelId: string | null
  channelTitle: string | null
  /** Upload time as an ISO instant, or null if it couldn't be read. */
  publishedAt: string | null
}

export type VideoKind = 'normal' | 'extended'

export interface ParsedTitle {
  homeName: string
  awayName: string
  /** From the title alone; duration can still promote 'normal' → 'extended'. */
  kindHint: VideoKind
}

/**
 * The one title shape we trust, e.g.
 *   "Canada vs Bosnia and Herzegovina Extended Highlights 🌎🏆 2026 FIFA World Cup™"
 *   "Netherlands vs Japan Highlights 🌎🏆2026 FIFA World Cup™"
 * Anything that isn't "<A> vs <B> [Extended ]Highlights … World Cup" is ignored,
 * which is exactly how the spoiler-laden clips get dropped.
 */
const HIGHLIGHT_RE = /^(.+?)\s+vs\.?\s+(.+?)\s+(Extended\s+)?Highlights\b.*World Cup/i

export function parseHighlightTitle(title: string): ParsedTitle | null {
  const m = title.match(HIGHLIGHT_RE)
  if (!m) return null
  return {
    homeName: m[1].trim(),
    awayName: m[2].trim(),
    kindHint: m[3] ? 'extended' : 'normal',
  }
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`YouTube API ${res.status} for ${url.replace(API_KEY ?? '', '***')}`)
  return res.json()
}

async function getText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US' } })
  if (!res.ok) throw new Error(`${res.status} for ${url}`)
  return res.text()
}

/** ISO 8601 duration ("PT1H2M33S", "PT4M17S") → seconds. */
function isoDurationToSeconds(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return 0
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

// ---- Data API path ---------------------------------------------------------

async function listUploadsApi(max: number): Promise<PlaylistVideo[]> {
  const out: PlaylistVideo[] = []
  let pageToken = ''
  while (out.length < max) {
    const url =
      `${API}/playlistItems?part=snippet&maxResults=50&playlistId=${FOX_UPLOADS_PLAYLIST}` +
      `&key=${API_KEY}${pageToken ? `&pageToken=${pageToken}` : ''}`
    const data = (await getJson(url)) as {
      nextPageToken?: string
      items?: { snippet?: { title?: string; resourceId?: { videoId?: string } } }[]
    }
    for (const it of data.items ?? []) {
      const id = it.snippet?.resourceId?.videoId
      const title = it.snippet?.title
      if (id && title) out.push({ id, title })
    }
    if (!data.nextPageToken) break
    pageToken = data.nextPageToken
  }
  return out.slice(0, max)
}

async function getMetaApi(id: string): Promise<VideoMeta> {
  const url = `${API}/videos?part=snippet,contentDetails,status&id=${id}&key=${API_KEY}`
  const data = (await getJson(url)) as {
    items?: {
      snippet?: { title?: string; channelId?: string; channelTitle?: string; publishedAt?: string }
      contentDetails?: { duration?: string }
      status?: { embeddable?: boolean }
    }[]
  }
  const it = data.items?.[0]
  if (!it) throw new Error(`no video ${id}`)
  return {
    id,
    title: it.snippet?.title ?? '',
    durationSeconds: isoDurationToSeconds(it.contentDetails?.duration ?? ''),
    embeddable: it.status?.embeddable ?? false,
    channelId: it.snippet?.channelId ?? null,
    channelTitle: it.snippet?.channelTitle ?? null,
    publishedAt: it.snippet?.publishedAt ?? null,
  }
}

// ---- Scrape fallback (no key) ---------------------------------------------

function extract(re: RegExp, html: string): string | null {
  const m = html.match(re)
  return m ? m[1] : null
}

async function listUploadsScrape(max: number): Promise<PlaylistVideo[]> {
  const html = await getText(`https://www.youtube.com/playlist?list=${FOX_UPLOADS_PLAYLIST}`)
  const out: PlaylistVideo[] = []
  const seen = new Set<string>()
  for (const block of html.split('"lockupViewModel":').slice(1)) {
    const id = block.match(/"contentId":"([^"]{11})"/)
    const title = block.match(/"title":\{"content":"((?:[^"\\]|\\.)*)"/)
    if (!id || !title || seen.has(id[1])) continue
    seen.add(id[1])
    out.push({ id: id[1], title: JSON.parse(`"${title[1]}"`) })
    if (out.length >= max) break
  }
  return out
}

async function getMetaScrape(id: string): Promise<VideoMeta> {
  const html = await getText(`https://www.youtube.com/watch?v=${id}`)
  const rawTitle = extract(/"videoDetails":\{[^]*?"title":"((?:[^"\\]|\\.)*)"/, html)
  const seconds = extract(/"lengthSeconds":"(\d+)"/, html)
  const embeddable = extract(/"playableInEmbed":(true|false)/, html)
  const channelId = extract(/"channelId":"(UC[\w-]+)"/, html)
  const channelTitle = extract(/"ownerChannelName":"((?:[^"\\]|\\.)*)"/, html)
  const publishDate = extract(/"publishDate":"([^"]+)"/, html) ?? extract(/"uploadDate":"([^"]+)"/, html)
  return {
    id,
    title: rawTitle ? JSON.parse(`"${rawTitle}"`) : '',
    durationSeconds: seconds ? Number(seconds) : 0,
    embeddable: embeddable === 'true',
    channelId,
    channelTitle: channelTitle ? JSON.parse(`"${channelTitle}"`) : null,
    publishedAt: publishDate ? new Date(publishDate).toISOString() : null,
  }
}

// ---- Public API ------------------------------------------------------------

/** Recent FOX uploads (newest first), via the Data API or a scrape fallback. */
export function listFoxUploads(max = 100): Promise<PlaylistVideo[]> {
  return API_KEY ? listUploadsApi(max) : listUploadsScrape(max)
}

/** Full metadata for one video, via the Data API or a scrape fallback. */
export function getVideoMeta(id: string): Promise<VideoMeta> {
  return API_KEY ? getMetaApi(id) : getMetaScrape(id)
}

export const usingApi = Boolean(API_KEY)
