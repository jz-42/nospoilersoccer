/** Conservative FOX and TUDN USA highlight curator for UEFA Nations League 2026/27. */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { nationalTeams } from '../src/data/national-teams'
import { unl2026 } from '../src/data/nations/unl-2026'
import { unl2026Videos } from '../src/data/nations/unl-2026-videos'
import type { GroupMatch, HighlightVideo, KnockoutMatch, TeamId, Tournament } from '../src/data/types'
import { isPlayed } from '../src/logic/spoilers'
import { checkEmbeddable, getVideoMeta, getVideoMetaFromFeed } from './youtube'
import { loadTargetedMetadata, parseTargetedMetadata } from './highlight-candidate'

export const FOX_SOCCER_CHANNEL_ID = 'UCooTLkxcpnTNx6vfOovfBFA'
export const FOX_SOCCER_UPLOADS_PLAYLIST = 'UUooTLkxcpnTNx6vfOovfBFA'
export const FOX_SPORTS_CHANNEL_ID = 'UCwNqHDsnBCKT-olwJwIFyfg'
export const TUDN_USA_CHANNEL_ID = 'UCSo19KhHogXxu3sFsOpqrcQ'
export const NATIONS_HIGHLIGHT_TRUST: 'quarantine' | 'trusted' = 'trusted'
export const NATIONS_PUBLICATION_HORIZON_HOURS = 72
const TUDN_MIN_SECONDS = 12 * 60
const TUDN_MAX_SECONDS = 18 * 60

const VIDEOS_FILE = 'src/data/nations/unl-2026-videos.ts'
const SKIP_FILE = 'scripts/curate-skip.json'
const targetResultFile = process.env.HIGHLIGHT_RESULT_FILE
const dryRun = process.argv.includes('--dry-run')
const argumentValue = (name: string): string | null => {
  const index = process.argv.indexOf(name)
  return index < 0 ? null : (process.argv[index + 1] ?? null)
}

const normalize = (value: string) => value
  .toLowerCase()
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .replace(/[^a-z0-9]/g, '')

const aliases = new Map<string, TeamId>()
for (const team of Object.values(nationalTeams)) {
  aliases.set(normalize(team.name), team.id)
  aliases.set(normalize(team.id), team.id)
}
for (const [name, id] of Object.entries({
  'Czech Republic': 'CZE', Turkey: 'TUR', 'Bosnia & Herzegovina': 'BIH',
  Ireland: 'IRL', Macedonia: 'MKD', 'North Macedonia': 'MKD',
  'Países Bajos': 'NED', Alemania: 'GER', Grecia: 'GRE', Irlanda: 'IRL',
  'Irlanda del Norte': 'NIR', Inglaterra: 'ENG', Escocia: 'SCO', Gales: 'WAL',
  España: 'ESP', Francia: 'FRA', Italia: 'ITA', Bélgica: 'BEL', Dinamarca: 'DEN',
  Noruega: 'NOR', Suecia: 'SWE', Finlandia: 'FIN', Islandia: 'ISL', 'Islas Feroe': 'FRO',
  Polonia: 'POL', Chequia: 'CZE', 'República Checa': 'CZE', Croacia: 'CRO',
  Eslovenia: 'SVN', Eslovaquia: 'SVK', Hungría: 'HUN', Rumanía: 'ROU', Bulgaria: 'BUL',
  Ucrania: 'UKR', Bielorrusia: 'BLR', Suiza: 'SUI', Turquía: 'TUR',
  'Bosnia y Herzegovina': 'BIH', 'Macedonia del Norte': 'MKD', Moldavia: 'MDA',
  Chipre: 'CYP', Lituania: 'LTU', Letonia: 'LVA', Luxemburgo: 'LUX',
  Kazajistán: 'KAZ', Azerbaiyán: 'AZE',
})) aliases.set(normalize(name), id)

export interface NationsTitle {
  home: TeamId
  away: TeamId
  kindHint: 'normal' | 'extended'
  broadcaster: 'fox' | 'tudn'
}

function teamsFrom(
  homeName: string,
  awayName: string,
  kindHint: 'normal' | 'extended',
  broadcaster: NationsTitle['broadcaster'],
): NationsTitle | null {
  const home = aliases.get(normalize(homeName))
  const away = aliases.get(normalize(awayName))
  if (!home || !away || home === away) return null
  return { home, away, kindHint, broadcaster }
}

export function parseNationsHighlightTitle(title: string): NationsTitle | null {
  if ((title.match(/\bvs?\.?\b/gi) ?? []).length !== 1) return null
  if (!/\bHighlights\b/i.test(title)) return null
  if (/\b(?:preview|goals?|winner|reaction|best of)\b/i.test(title.replace(/\bHighlights\b/i, ''))) return null
  const fox = title.match(/^(.+?)\s+vs?\.?\s+(.+?)\s+(?:(?:UEFA\s+Nations\s+League)\s+)?(Extended\s+)?Highlights\b/i)
  if (fox && (/UEFA\s+Nations\s+League/i.test(title) || /\|\s*FOX\s+Soccer\s*$/i.test(title))) {
    return teamsFrom(fox[1], fox[2], fox[3] ? 'extended' : 'normal', 'fox')
  }
  if (/\b(?:SUPER\s+)?EXTENDED\s+HIGHLIGHTS\b/i.test(title)) return null
  const tudn = title.match(/^HIGHLIGHTS\s+-\s+(.+?)\s+vs?\.?\s+(.+?)\s+\|\s+UEFA\s+Nations\s+League\b.*\|\s*TUDN\s*$/i)
  if (!tudn) return null
  return teamsFrom(tudn[1], tudn[2], 'normal', 'tudn')
}

type AnyMatch = (GroupMatch | KnockoutMatch) & { videos?: HighlightVideo[] }
const allMatches = (tournament: Tournament): AnyMatch[] => [
  ...tournament.groupMatches,
  ...tournament.knockoutRounds.flatMap((round) => round.matches),
]
const pairOf = (match: AnyMatch): [TeamId, TeamId] | null =>
  'group' in match ? [match.home, match.away] :
    match.homeTeam && match.awayTeam ? [match.homeTeam, match.awayTeam] : null
const pairKey = (a: TeamId, b: TeamId) => [a, b].sort().join('|')

export interface NationsCandidate {
  id: string
  title: string
  channelId: string | null
  publishedAt: string | null
  durationSeconds: number | null
  embeddable: 'yes' | 'no' | 'unknown'
  isShort: boolean
  trustMode: 'quarantine' | 'trusted'
  tournament: Tournament
  existing: Record<string, HighlightVideo[]>
}

export type NationsCandidateResult =
  | { status: 'accepted'; matchId: string; video: HighlightVideo }
  | { status: 'duplicate'; reason: string }
  | { status: 'quarantined'; reason: string; matchId?: string }
  | { status: 'retry'; reason: string }
  | { status: 'rejected'; reason: string }

export function acceptNationsCandidate(input: NationsCandidate): NationsCandidateResult {
  const parsed = parseNationsHighlightTitle(input.title)
  if (!parsed) return { status: 'rejected', reason: 'title is not an exact Nations League highlight matchup' }
  if (parsed.broadcaster === 'tudn') {
    if (input.channelId !== TUDN_USA_CHANNEL_ID) {
      return { status: 'rejected', reason: 'TUDN title requires the TUDN USA channel' }
    }
  } else if (input.channelId !== FOX_SOCCER_CHANNEL_ID && input.channelId !== FOX_SPORTS_CHANNEL_ID) {
    return { status: 'rejected', reason: 'wrong YouTube channel' }
  }
  if (input.isShort || /(?:#shorts|youtube\.com\/shorts)/i.test(input.title)) return { status: 'rejected', reason: 'Shorts are not full-match highlights' }
  if (input.embeddable === 'unknown') return { status: 'retry', reason: 'embeddability check did not complete' }
  if (input.embeddable === 'no') return { status: 'rejected', reason: 'video is not embeddable' }
  if (!input.publishedAt || !Number.isFinite(Date.parse(input.publishedAt))) return { status: 'retry', reason: 'publish time is unavailable' }
  if (input.durationSeconds === null || input.durationSeconds <= 0) return { status: 'retry', reason: 'duration is unavailable' }
  if (input.durationSeconds < 90) return { status: 'rejected', reason: 'video is too short to be a full-match highlight cut' }
  if (
    parsed.broadcaster === 'tudn' &&
    (input.durationSeconds < TUDN_MIN_SECONDS || input.durationSeconds > TUDN_MAX_SECONDS)
  ) {
    return { status: 'rejected', reason: 'TUDN cuts outside the 15-minute range are rejected' }
  }

  const published = Date.parse(input.publishedAt)
  const key = pairKey(parsed.home, parsed.away)
  const matching = allMatches(input.tournament).filter((match) => {
    const pair = pairOf(match)
    if (!pair || pairKey(pair[0], pair[1]) !== key || !isPlayed(match)) return false
    const kickoff = Date.parse(match.kickoff ?? `${match.date}T00:00:00Z`)
    const delay = published - kickoff
    return delay > 0 && delay <= NATIONS_PUBLICATION_HORIZON_HOURS * 60 * 60 * 1000
  })
  if (matching.length === 0) {
    const heldPair = allMatches(input.tournament).some((match) => {
      const pair = pairOf(match)
      if (!pair || pairKey(pair[0], pair[1]) !== key) return false
      const kickoff = Date.parse(match.kickoff ?? `${match.date}T00:00:00Z`)
      return !isPlayed(match) || published <= kickoff
    })
    return heldPair
      ? { status: 'retry', reason: 'fixture is not finished or video predates kickoff' }
      : { status: 'rejected', reason: 'no unique completed fixture inside the publication horizon' }
  }
  if (matching.length !== 1) return { status: 'quarantined', reason: 'matchup resolves to multiple fixtures' }

  const match = matching[0]
  const kind = parsed.broadcaster === 'tudn'
    ? 'normal'
    : parsed.kindHint === 'extended' || input.durationSeconds >= 600 ? 'extended' : 'normal'
  const current = [...(match.videos ?? []), ...(input.existing[match.id] ?? [])]
  if (current.some((video) => video.kind === kind)) return { status: 'duplicate', reason: 'accepted cut already exists' }
  if (input.trustMode === 'quarantine') {
    return { status: 'quarantined', reason: 'FOX Soccer source awaits matchday-1 manual verification', matchId: match.id }
  }
  return {
    status: 'accepted',
    matchId: match.id,
    video: {
      youtubeId: input.id,
      kind,
      durationSeconds: input.durationSeconds,
      ...(parsed.broadcaster === 'tudn' ? { publisher: 'tudn' as const } : {}),
    },
  }
}

function serializeVideo(video: HighlightVideo): string {
  if (!('youtubeId' in video) || !video.youtubeId) throw new Error('Nations League curator accepts YouTube only')
  const duration = video.durationSeconds === undefined ? '' : `, durationSeconds: ${video.durationSeconds}`
  const publisher = video.publisher ? `, publisher: '${video.publisher}'` : ''
  return `{ youtubeId: '${video.youtubeId}', kind: '${video.kind}'${duration}${publisher} }`
}

export function serializeNationsVideos(map: Record<string, HighlightVideo[]>): string {
  const header = `import type { HighlightVideo } from '../types'\n\n/**\n * Auto-curated FOX and TUDN USA Nations League cuts. Append-only; generated by\n * scripts/curate-nations-videos.ts after deterministic and trust gates pass.\n */\n`
  const ids = Object.keys(map).sort()
  if (ids.length === 0) return `${header}export const unl2026Videos: Record<string, HighlightVideo[]> = {}\n`
  const body = ids.map((id) => `  '${id}': [${map[id].map(serializeVideo).join(', ')}],`).join('\n')
  return `${header}export const unl2026Videos: Record<string, HighlightVideo[]> = {\n${body}\n}\n`
}

export function recordNationsCandidateResult(
  map: Record<string, HighlightVideo[]>,
  result: NationsCandidateResult,
): boolean {
  if (result.status !== 'accepted') return false
  map[result.matchId] = [...(map[result.matchId] ?? []), result.video]
  return true
}

interface FeedCandidate { id: string; title: string; publishedAt: string }
const decodeXml = (value: string) => value
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
const element = (xml: string, name: string) => {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))
  return match ? decodeXml(match[1].trim()) : null
}

export async function listFoxSoccerAtom(fetchImpl: typeof fetch = fetch): Promise<FeedCandidate[]> {
  const response = await fetchImpl(`https://www.youtube.com/feeds/videos.xml?channel_id=${FOX_SOCCER_CHANNEL_ID}`)
  if (!response.ok) throw new Error(`FOX Soccer Atom feed returned ${response.status}`)
  const xml = await response.text()
  return (xml.match(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi) ?? []).flatMap((entry) => {
    const id = element(entry, 'yt:videoId')
    const channelId = element(entry, 'yt:channelId')
    const title = element(entry, 'title')
    const publishedAt = element(entry, 'published')
    return id && channelId === FOX_SOCCER_CHANNEL_ID && title && publishedAt ? [{ id, title, publishedAt }] : []
  })
}

function writeTargetResult(result: NationsCandidateResult['status']) {
  if (!targetResultFile) return
  const disposition = result === 'accepted' || result === 'duplicate'
    ? 'accepted'
    : result === 'retry' ? 'retry' : 'quarantined'
  writeFileSync(targetResultFile, `${disposition}\n`)
}

async function run() {
  const targetVideoId = argumentValue('--video-id')
  if (targetVideoId !== null && !/^[A-Za-z0-9_-]{11}$/.test(targetVideoId)) {
    throw new Error('--video-id requires an 11-character YouTube id')
  }
  const provided = targetVideoId ? parseTargetedMetadata(targetVideoId, {
    title: process.env.HIGHLIGHT_CANDIDATE_TITLE,
    channelId: process.env.HIGHLIGHT_CANDIDATE_CHANNEL_ID,
    publishedAt: process.env.HIGHLIGHT_CANDIDATE_PUBLISHED_AT,
  }) : null
  const feed = targetVideoId
    ? [await loadTargetedMetadata(targetVideoId, provided?.channelId ?? FOX_SOCCER_CHANNEL_ID, provided, getVideoMetaFromFeed, getVideoMeta)]
    : await listFoxSoccerAtom()
  const map = Object.fromEntries(Object.entries(unl2026Videos).map(([id, videos]) => [id, [...videos]]))
  let last: NationsCandidateResult = { status: 'rejected', reason: 'no matching candidate' }
  let acceptedAny = false

  for (const candidate of feed) {
    if (!parseNationsHighlightTitle(candidate.title)) continue
    let metadata
    try {
      metadata = await getVideoMeta(candidate.id)
    } catch (error) {
      console.warn(`${candidate.id}: metadata unavailable (${String(error)})`)
      last = { status: 'retry', reason: 'metadata unavailable' }
      continue
    }
    const result = acceptNationsCandidate({
      id: candidate.id,
      title: candidate.title,
      channelId: metadata.channelId,
      publishedAt: candidate.publishedAt ?? metadata.publishedAt,
      durationSeconds: metadata.durationSeconds,
      embeddable: await checkEmbeddable(candidate.id),
      isShort: /(?:#shorts|youtube\.com\/shorts)/i.test(candidate.title),
      trustMode: NATIONS_HIGHLIGHT_TRUST,
      tournament: unl2026,
      existing: map,
    })
    last = result
    console.log(`${candidate.id}: ${result.status}${'reason' in result ? ` (${result.reason})` : ''}`)
    acceptedAny = recordNationsCandidateResult(map, result) || acceptedAny
    if (result.status === 'rejected' && !dryRun) {
      let skip: Record<string, { source?: string; reason: string; at: string }> = {}
      try { skip = JSON.parse(readFileSync(SKIP_FILE, 'utf8')) as typeof skip } catch { /* start empty */ }
      const source = metadata.channelId === TUDN_USA_CHANNEL_ID
        ? 'tudn'
        : metadata.channelId === FOX_SPORTS_CHANNEL_ID ? 'foxnations' : 'foxsoccer'
      skip[candidate.id] = { source, reason: result.reason, at: new Date().toISOString() }
      writeFileSync(SKIP_FILE, `${JSON.stringify(skip, null, 2)}\n`)
    }
  }
  if (!dryRun && acceptedAny) writeFileSync(VIDEOS_FILE, serializeNationsVideos(map))
  writeTargetResult(last.status)
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Nations League curator\n\n- result: ${last.status}\n- trust: ${NATIONS_HIGHLIGHT_TRUST}\n`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run()
}
