/**
 * Automatic spoiler-free highlight curator for the club competitions.
 *
 *   npx tsx scripts/curate-club-videos.ts               # curate + write
 *   npx tsx scripts/curate-club-videos.ts --dry-run     # decide, write nothing
 *   npx tsx scripts/curate-club-videos.ts --competition ucl
 *
 * Source is CBS Sports Golazo on YouTube, one cut per match, `kind: 'normal'`.
 *
 * There is deliberately NO AI review on this path. The site never shows a
 * YouTube thumbnail — club highlights sit behind neutral cards — so the half of
 * the World Cup AI gate that judged thumbnails was protecting against nothing
 * here. Its replacement is the deterministic, fail-closed gate in
 * `acceptCandidate()`: a video is added only when ALL of
 *
 *   1. the channel is CBS Sports Golazo
 *   2. the title matches the full-match highlight pattern and names two clubs
 *   3. both clubs resolve to teams in *this* competition
 *   4. they map to EXACTLY ONE finished fixture still missing a cut
 *      (zero, or two or more, means skip)
 *   5. it was published after that fixture's kickoff
 *   6. it is embeddable
 *
 * hold. Everything else is skipped and retried on the next cycle — there is no
 * persistent skip-list, because with no AI call in the loop re-judging a
 * candidate is free and stale state is the thing most likely to go wrong.
 * Writes are APPEND ONLY: an existing entry is never edited or replaced.
 *
 * The invariant, which predates this work and does not bend: the worst case is
 * a late or missing video, NEVER a spoiler.
 *
 * NO DURATIONS, EVER. A club cut must not carry `durationSeconds`. That
 * omission is how "no runtime shown anywhere on a club match" is enforced — in
 * the data, not the UI — so adding the field back here would silently
 * reintroduce a runtime badge. `serializeVideo()` cannot emit it.
 *
 * Coverage note: Golazo carries the Champions League, Serie A and the English
 * cups, but CBS holds no Premier League or La Liga highlight rights, so in
 * practice eng1/esp1 find no candidates. They are still scanned — the gate is
 * what decides, not an assumption about the channel's schedule.
 */
import { appendFileSync, writeFileSync } from 'fs'
import type { GroupMatch, HighlightVideo, KnockoutMatch, TeamId, Tournament } from '../src/data/types'
import { clubIdByName } from '../src/data/club/clubs'
import { isPlayed } from '../src/logic/spoilers'
import { CLUB_COMPETITIONS, SEASON_YEAR, pairKey, videosExportName, videosModulePath } from './espn-club'
import type { ClubCompetitionConfig } from './espn-club'
import { checkEmbeddable, getVideoMeta } from './youtube'

/** CBS Sports Golazo; the uploads playlist is the channel id with UC→UU. */
export const GOLAZO_CHANNEL_ID = 'UCET00YnetHT7tOpu12v8jxg'
export const GOLAZO_UPLOADS_PLAYLIST = 'UU' + GOLAZO_CHANNEL_ID.slice(2)

const API_KEY = process.env.YOUTUBE_API_KEY
const API = 'https://www.googleapis.com/youtube/v3'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'

const dryRun = process.argv.includes('--dry-run')
const onlyCompetition = (() => {
  const i = process.argv.indexOf('--competition')
  return i === -1 ? null : process.argv[i + 1]
})()

// ---- title screening -------------------------------------------------------

/**
 * Golazo's one trustworthy shape, e.g.
 *   "PSV vs. Arsenal: Extended Highlights | UCL Round Of 16 Leg 1 | CBS Sports Golazo"
 *   "Inter vs. Napoli: Extended Highlights | Serie A | CBS Sports Golazo"
 *
 * "Extended" is Golazo's word for its single full-match cut, not a second
 * length: club matches get exactly one video and it is always `kind: 'normal'`.
 * Everything else the channel posts — reaction shows, interviews, goal clips,
 * "UCL Today BEST BITS" — fails this pattern and is dropped before any fetch.
 */
const HIGHLIGHT_RE = /^(.+?)\s+vs\.?\s+(.+?):\s+(?:Extended\s+)?Highlights\b(.*)$/i

/** Result-leaking wording. The title shape already excludes it; belt and braces. */
const TITLE_SPOILER_RE =
  /\d\s*[-–]\s*\d|\b(beat|beats|win|wins|won|loss|lose|loses|drew|draws|advance|advances|eliminat|knock(?:ed)? out|stunn|thrash|comeback)\b/i

/**
 * Competitions Golazo covers that are NOT ours. Two clubs can be in our UCL
 * registry and still meet in Serie A or the Carabao Cup, so a domestic cut
 * could otherwise be mistaken for a European one. Rejection-only, so it can
 * never open the gate — it only closes it further.
 */
const FOREIGN_COMPETITION_RE =
  /\b(Serie A|Coppa Italia|Carabao Cup|EFL|League One|League Two|Championship|FA Cup|Copa del Rey|Supercopa|Bundesliga|Ligue 1|Eredivisie|Primeira|Europa League|Conference League|Nations League|Club World Cup|World Cup|MLS|Liga MX|Friendly|Friendlies|NWSL|WSL|Women)\b/i

/** An unmistakable name for the competition — enough on its own. */
const COMPETITION_TAG_RE: Record<string, RegExp> = {
  eng1: /\bPremier League\b|\bEPL\b/i,
  esp1: /\bLa\s?Liga\b/i,
  ucl: /\bUCL\b|\bChampions League\b/i,
}

/**
 * Round labels as Golazo writes them. A generic label ("Round of 16") is a weak
 * signal on its own — plenty of competitions have one — so a title carrying
 * only a round label is accepted just for the round it names, and the fixture
 * lookup then has to find the pair in exactly that round. A title carrying
 * `UCL` needs no such corroboration.
 */
const ROUND_TITLE_RE: Record<string, RegExp> = {
  'ko-playoff': /\bKnockout\s+(?:Round\s+)?Play-?offs?\b/i,
  r16: /\bRound\s+of\s+16\b/i,
  qf: /\bQuarter-?\s?Finals?\b/i,
  sf: /\bSemi-?\s?Finals?\b/i,
  final: /\bFinal\b/i,
}

export interface TitleScreen {
  homeName: string
  awayName: string
  /** Everything after "Highlights", minus CBS's own branding segments. */
  context: string
  /** Leg number when the title names one, else null. */
  leg: 1 | 2 | null
  /** Knockout round id when the title names one of this competition's, else null. */
  round: string | null
  /** The title named this competition outright, rather than only a round. */
  strongTag: boolean
}

export type ScreenResult =
  | { status: 'ok'; screen: TitleScreen }
  /** Not a candidate for this competition at all — not worth logging. */
  | { status: 'ignore'; reason: string }
  /** Looked like one of ours and failed a gate. Logged; retried next cycle. */
  | { status: 'skip'; reason: string }

/**
 * Everything decidable from the playlist title alone. Run first so the ~90% of
 * uploads that are talk shows and interviews cost no network calls at all.
 */
export function screenTitle(config: ClubCompetitionConfig, title: string): ScreenResult {
  const m = title.match(HIGHLIGHT_RE)
  if (!m) return { status: 'ignore', reason: 'not a full-match highlight title' }
  const [, homeName, awayName, tail] = m

  const context = tail
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^CBS\s+Sport/i.test(s))
    .join(' | ')

  if (FOREIGN_COMPETITION_RE.test(context)) {
    return { status: 'ignore', reason: 'another competition' }
  }

  const strongTag = COMPETITION_TAG_RE[config.id]?.test(context) ?? false
  const round =
    config.knockoutRounds.find((r) => ROUND_TITLE_RE[r.id]?.test(context))?.id ?? null
  // A round-label-only title is trusted no further than the round it names, so
  // a same-pair league-phase fixture can never absorb a knockout cut.
  if (!strongTag && !round) return { status: 'ignore', reason: 'not this competition' }

  if (TITLE_SPOILER_RE.test(title)) {
    // Never echo the title back — that is exactly where a score would be.
    return { status: 'skip', reason: 'title failed the spoiler check' }
  }

  const legMatch = context.match(/\bLeg\s*([12])\b/i)
  return {
    status: 'ok',
    screen: {
      homeName: homeName.trim(),
      awayName: awayName.trim(),
      context,
      leg: legMatch ? (Number(legMatch[1]) as 1 | 2) : null,
      round,
      strongTag,
    },
  }
}

// ---- fixture lookup --------------------------------------------------------

type AnyMatch = (GroupMatch | KnockoutMatch) & { videos?: HighlightVideo[] }

export type FixtureResult =
  | { status: 'ok'; match: AnyMatch }
  /** No fixture between these two clubs in this competition. */
  | { status: 'none' }
  /** The fixture exists but hasn't finished, or the video predates kickoff. */
  | { status: 'early' }
  /** Every candidate already has a cut. */
  | { status: 'have' }
  /** Two or more candidates, or a tie leg the title didn't identify. */
  | { status: 'ambiguous' }

const kickoffMs = (m: AnyMatch): number =>
  new Date(m.kickoff ?? `${m.date}T00:00:00Z`).getTime()

/**
 * The two clubs a fixture is between, or null while unknown. Knockout slots are
 * read only from the explicit `homeTeam`/`awayTeam` the ingest writes once the
 * draw is out — never guessed from a slot ref, because a guessed pairing is how
 * a cut would land on the wrong match.
 */
function pairOf(m: AnyMatch): [TeamId, TeamId] | null {
  if ('group' in m) return [m.home, m.away]
  return m.homeTeam && m.awayTeam ? [m.homeTeam, m.awayTeam] : null
}

function roundIdOf(t: Tournament, m: AnyMatch): string | null {
  if ('group' in m) return null
  return t.knockoutRounds.find((r) => r.matches.some((k) => k.id === m.id))?.id ?? null
}

/**
 * The one fixture this video belongs to, or why we won't commit to one.
 *
 * `existing` is the curated map being appended to, so a cut added earlier in
 * this same run still counts as taken.
 */
export function findClubFixture(
  t: Tournament,
  screen: Pick<TitleScreen, 'leg' | 'round' | 'strongTag'>,
  home: TeamId,
  away: TeamId,
  publishedMs: number,
  existing: Record<string, HighlightVideo[]>,
): FixtureResult {
  const key = pairKey(home, away)
  const all: AnyMatch[] = [
    ...t.groupMatches,
    ...t.knockoutRounds.flatMap((r) => r.matches),
  ]
  let candidates = all.filter((m) => {
    const p = pairOf(m)
    return p !== null && pairKey(p[0], p[1]) === key
  })
  if (candidates.length === 0) return { status: 'none' }

  // A title that only named a round is trusted for that round and nothing else.
  if (screen.round !== null) {
    const inRound = candidates.filter((m) => roundIdOf(t, m) === screen.round)
    if (!screen.strongTag) {
      if (inRound.length === 0) return { status: 'none' }
      candidates = inRound
    } else if (inRound.length > 0) {
      candidates = inRound
    }
  }

  // Two legs of the same tie are two different results. Attaching leg 2 to
  // leg 1 would reveal a result the viewer hasn't reached, so a tie leg is
  // only ever matched when the title says which leg it is.
  if (candidates.some((m) => 'tie' in m && m.tie)) {
    if (screen.leg === null) return { status: 'ambiguous' }
    candidates = candidates.filter((m) => 'tie' in m && m.tie?.leg === screen.leg)
    if (candidates.length === 0) return { status: 'none' }
  }

  const played = candidates.filter(isPlayed)
  if (played.length === 0) return { status: 'early' }

  // A highlight is published after its match, never before.
  const after = played.filter((m) => publishedMs > kickoffMs(m))
  if (after.length === 0) return { status: 'early' }

  const need = after.filter(
    (m) => (m.videos?.length ?? 0) === 0 && (existing[m.id]?.length ?? 0) === 0,
  )
  if (need.length === 0) return { status: 'have' }
  if (need.length > 1) return { status: 'ambiguous' }
  return { status: 'ok', match: need[0] }
}

// ---- the gate ---------------------------------------------------------------

export interface CandidateInput {
  config: ClubCompetitionConfig
  tournament: Tournament
  /** YouTube video id. */
  id: string
  title: string
  channelId: string | null
  publishedAt: string | null
  embeddable: 'yes' | 'no' | 'unknown'
  existing: Record<string, HighlightVideo[]>
}

export type GateResult =
  | { status: 'accept'; matchId: string; video: HighlightVideo }
  | { status: 'ignore'; reason: string }
  | { status: 'skip'; reason: string }

/**
 * The whole accept/reject decision, pure and side-effect free so the smoke test
 * can drive every branch without touching the network. Fail closed: every path
 * that isn't a positive answer to all six conditions returns ignore or skip.
 */
export function acceptCandidate(input: CandidateInput): GateResult {
  const screened = screenTitle(input.config, input.title)
  if (screened.status !== 'ok') return screened
  const { screen } = screened

  // 1. channel
  if (input.channelId !== GOLAZO_CHANNEL_ID) {
    return { status: 'skip', reason: `channel ${input.channelId ?? '?'} is not CBS Sports Golazo` }
  }

  // 3. both clubs resolve, and to teams in *this* competition
  const home = clubIdByName(screen.homeName)
  const away = clubIdByName(screen.awayName)
  if (!home || !away) return { status: 'skip', reason: 'title did not map to two known clubs' }
  if (home === away) return { status: 'skip', reason: 'title named the same club twice' }
  if (!input.tournament.teams[home] || !input.tournament.teams[away]) {
    return { status: 'ignore', reason: 'clubs are not both in this competition' }
  }

  // 5. published after kickoff (checked inside the fixture lookup)
  if (!input.publishedAt) return { status: 'skip', reason: 'no publish date' }
  const publishedMs = new Date(input.publishedAt).getTime()
  if (!Number.isFinite(publishedMs)) return { status: 'skip', reason: 'unreadable publish date' }

  // 4. exactly one finished fixture still missing a cut
  const fixture = findClubFixture(
    input.tournament,
    screen,
    home,
    away,
    publishedMs,
    input.existing,
  )
  switch (fixture.status) {
    case 'none':
      return { status: 'ignore', reason: 'no such fixture in this competition' }
    case 'early':
      return { status: 'skip', reason: 'fixture not finished yet' }
    case 'have':
      return { status: 'skip', reason: 'already have a cut' }
    case 'ambiguous':
      return { status: 'skip', reason: 'more than one candidate fixture' }
  }

  // 6. embeddable. 'unknown' is a transient failure, and fails closed like 'no'
  // — the only difference is that both come back around next cycle anyway.
  if (input.embeddable !== 'yes') {
    return {
      status: 'skip',
      reason: input.embeddable === 'no' ? 'not embeddable' : 'embeddability check did not complete',
    }
  }

  // One cut, kind 'normal', and no durationSeconds — see the file header.
  return {
    status: 'accept',
    matchId: fixture.match.id,
    video: { youtubeId: input.id, kind: 'normal' },
  }
}

// ---- serialization ---------------------------------------------------------

/**
 * A club cut is a YouTube id and `kind: 'normal'`, and nothing else. There is
 * deliberately no branch here that can emit `durationSeconds`.
 */
export function serializeVideo(v: HighlightVideo): string {
  if (!('youtubeId' in v) || !v.youtubeId) throw new Error('club cuts are YouTube only')
  return `{ youtubeId: '${v.youtubeId}', kind: 'normal' }`
}

export function serializeVideoMap(
  competitionId: string,
  year: number,
  map: Record<string, HighlightVideo[]>,
): string {
  const name = videosExportName(competitionId, year)
  const header = `// Generated — do not hand-edit
import type { HighlightVideo } from '../types'

/**
 * Auto-curated CBS Sports Golazo highlight cuts for ${competitionId} ${year}-${String(year + 1).slice(2)}, keyed by match id.
 *
 * GENERATED by scripts/curate-club-videos.ts — do not edit by hand. Entries are
 * appended as Golazo publishes a full-match cut that clears every one of the
 * curator's deterministic gates; nothing is ever edited or removed.
 *
 * No entry carries \`durationSeconds\`, and none ever should: that omission is
 * what keeps a runtime badge off club matches.
 */
`
  const ids = Object.keys(map).sort()
  if (ids.length === 0) {
    return `${header}export const ${name}: Record<string, HighlightVideo[]> = {}\n`
  }
  const body = ids
    .map((id) => `  '${id}': [${map[id].map(serializeVideo).join(', ')}],`)
    .join('\n')
  return `${header}export const ${name}: Record<string, HighlightVideo[]> = {\n${body}\n}\n`
}

// ---- YouTube uploads (Golazo's own playlist) -------------------------------

export interface PlaylistVideo {
  id: string
  title: string
}

async function listUploadsApi(max: number): Promise<PlaylistVideo[]> {
  const out: PlaylistVideo[] = []
  let pageToken = ''
  while (out.length < max) {
    const url =
      `${API}/playlistItems?part=snippet&maxResults=50&playlistId=${GOLAZO_UPLOADS_PLAYLIST}` +
      `&key=${API_KEY}${pageToken ? `&pageToken=${pageToken}` : ''}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`YouTube API ${res.status} listing Golazo uploads`)
    const data = (await res.json()) as {
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

async function listUploadsScrape(max: number): Promise<PlaylistVideo[]> {
  const res = await fetch(`https://www.youtube.com/playlist?list=${GOLAZO_UPLOADS_PLAYLIST}`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US' },
  })
  if (!res.ok) throw new Error(`${res.status} listing Golazo uploads`)
  const html = await res.text()
  const out: PlaylistVideo[] = []
  const seen = new Set<string>()
  for (const block of html.split('"lockupViewModel":').slice(1)) {
    const id = block.match(/"contentId":"([^"]{11})"/)
    const title = block.match(/"title":\{"content":"((?:[^"\\]|\\.)*)"/)
    if (!id || !title || seen.has(id[1])) continue
    seen.add(id[1])
    out.push({ id: id[1], title: JSON.parse(`"${title[1]}"`) as string })
    if (out.length >= max) break
  }
  return out
}

/** Recent Golazo uploads, newest first — Data API when keyed, scrape when not. */
export function listGolazoUploads(max = 150): Promise<PlaylistVideo[]> {
  return API_KEY ? listUploadsApi(max) : listUploadsScrape(max)
}

// ---- run report ------------------------------------------------------------

function writeReport(added: string[], skipped: string[], errors: string[]) {
  const summary = process.env.GITHUB_STEP_SUMMARY
  if (summary) {
    const lines = [
      `## ⚽ Club highlight curator — ${new Date().toISOString()}`,
      '',
      `**Added ${added.length} · Skipped ${skipped.length} · Errors ${errors.length}**`,
    ]
    if (added.length) lines.push('', '### ✅ Added', ...added.map((a) => `- ${a}`))
    if (skipped.length) lines.push('', '### ⏭️ Skipped (retried next cycle)', ...skipped.map((s) => `- ${s}`))
    if (errors.length) lines.push('', '### ⚠️ Errors (will retry next run)', ...errors.map((e) => `- ${e}`))
    appendFileSync(summary, lines.join('\n') + '\n')
  }
  for (const e of errors) console.log(`::warning::club curator: ${e}`)
}

// ---- main ------------------------------------------------------------------

/**
 * A log-safe label. League fixtures are public knowledge — the site shows the
 * schedule — so naming the clubs is fine; a knockout leg would reveal who
 * advanced, so those print the match id alone.
 */
function matchLabel(t: Tournament, m: AnyMatch): string {
  if ('group' in m) return `${m.id} ${t.teams[m.home].name} v ${t.teams[m.away].name}`
  return `${m.id} (knockout)`
}

async function loadSeason(competitionId: string) {
  const season = (await import(`../src/data/club/${competitionId}-${SEASON_YEAR}`)) as Record<
    string,
    Tournament
  >
  const videos = (await import(`../src/data/club/${competitionId}-${SEASON_YEAR}-videos`)) as Record<
    string,
    Record<string, HighlightVideo[]>
  >
  return {
    tournament: season[`${competitionId}_${SEASON_YEAR}`],
    videos: videos[videosExportName(competitionId, SEASON_YEAR)],
  }
}

async function run() {
  const configs = Object.values(CLUB_COMPETITIONS).filter(
    (c) => onlyCompetition === null || c.id === onlyCompetition,
  )
  if (configs.length === 0) throw new Error(`unknown competition ${onlyCompetition}`)

  const uploads = await listGolazoUploads()
  console.log(
    `Scanning ${uploads.length} CBS Sports Golazo uploads across ${configs.map((c) => c.id).join(', ')}` +
      `${dryRun ? ' (dry-run)' : ''}…`,
  )

  const added: string[] = []
  const skipped: string[] = []
  const errors: string[] = []
  /** Fetched at most once per video, however many competitions screen it in. */
  const metaCache = new Map<
    string,
    { channelId: string | null; publishedAt: string | null; embeddable: 'yes' | 'no' | 'unknown' }
  >()

  for (const config of configs) {
    const { tournament, videos } = await loadSeason(config.id)
    if (!tournament || !videos) {
      errors.push(`${config.id}: season files not generated yet — run scripts/espn-club.ts first`)
      continue
    }
    const map: Record<string, HighlightVideo[]> = {}
    for (const [id, vids] of Object.entries(videos)) map[id] = [...vids]
    let addedHere = 0

    for (const up of uploads) {
      // Cheap pass first: no network for the reaction shows and interviews.
      const screened = screenTitle(config, up.title)
      if (screened.status === 'ignore') continue
      if (screened.status === 'skip') {
        skipped.push(`${config.id} ${up.id}: ${screened.reason}`)
        continue
      }

      let meta = metaCache.get(up.id)
      if (!meta) {
        try {
          const m = await getVideoMeta(up.id)
          meta = {
            channelId: m.channelId,
            publishedAt: m.publishedAt,
            embeddable: await checkEmbeddable(up.id),
          }
          metaCache.set(up.id, meta)
        } catch (e) {
          errors.push(`${up.id}: metadata fetch failed (${e})`)
          continue // transient — retried next cycle
        }
      }

      const verdict = acceptCandidate({
        config,
        tournament,
        id: up.id,
        title: up.title,
        channelId: meta.channelId,
        publishedAt: meta.publishedAt,
        embeddable: meta.embeddable,
        existing: map,
      })
      if (verdict.status === 'ignore') continue
      if (verdict.status === 'skip') {
        skipped.push(`${config.id} ${up.id}: ${verdict.reason}`)
        continue
      }

      // Append only: findClubFixture already refused any match that has a cut.
      map[verdict.matchId] = [...(map[verdict.matchId] ?? []), verdict.video]
      const all: AnyMatch[] = [
        ...tournament.groupMatches,
        ...tournament.knockoutRounds.flatMap((r) => r.matches),
      ]
      const match = all.find((m) => m.id === verdict.matchId)!
      added.push(`${config.id} ${matchLabel(tournament, match)} ${up.id}`)
      addedHere++
      console.log(`  + ${added[added.length - 1]}`)
    }

    if (addedHere > 0 && !dryRun) {
      writeFileSync(videosModulePath(config.id, SEASON_YEAR), serializeVideoMap(config.id, SEASON_YEAR, map))
      console.log(`  wrote ${videosModulePath(config.id, SEASON_YEAR)}`)
    }
  }

  console.log(`\nAdded ${added.length}, skipped ${skipped.length}, errors ${errors.length}.`)
  for (const s of skipped) console.log(`  ✗ ${s}`)
  writeReport(added, skipped, errors)
  if (dryRun) console.log('(dry-run — nothing written)')
}

if (import.meta.main) {
  try {
    await run()
  } catch (e) {
    // Never fail the workflow over curation — log and move on.
    console.error(`curate-club-videos failed: ${e}`)
  }
}
