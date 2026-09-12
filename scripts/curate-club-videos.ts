/**
 * Automatic spoiler-free highlight curator for the club competitions.
 *
 *   npx tsx scripts/curate-club-videos.ts               # curate + write
 *   npx tsx scripts/curate-club-videos.ts --dry-run     # decide, write nothing
 *   npx tsx scripts/curate-club-videos.ts --competition ucl
 *
 * One cut per match, `kind: 'normal'`, from whichever rights holder publishes
 * that competition:
 *
 *   ucl   CBS Sports Golazo   "Arsenal vs. Napoli: Extended Highlights | UCL …"
 *   eng1  NBC Sports          "Everton v. Manchester United | PREMIER LEAGUE HIGHLIGHTS | 9/6/2026 | NBC Sports"
 *   esp1  ESPN FC             "Athletic Club vs. Sevilla | LALIGA Highlights | ESPN FC"
 *
 * A source is trusted for the competitions it actually holds rights to and no
 * others, so an NBC upload can never be offered to La Liga however its title
 * reads. Each source owns its own title parser because the three shapes have
 * nothing in common; everything downstream of the parse is shared.
 *
 * There is deliberately NO AI review on this path. The site never shows a
 * YouTube thumbnail — club highlights sit behind neutral cards — so the half of
 * the World Cup AI gate that judged thumbnails was protecting against nothing
 * here. Its replacement is the deterministic, fail-closed gate in
 * `acceptCandidate()`: a video is added only when ALL of
 *
 *   1. the channel is the source we scanned, and that source covers this
 *      competition
 *   2. the title matches that source's full-match highlight shape and names
 *      two clubs
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
 * ESPN FC and the editorial prefix. Golazo and NBC title their cuts to a fixed
 * template; ESPN FC sometimes leads with a headline — "TITLE CLINCHER 🏆
 * Espanyol vs. Barcelona | LALIGA Highlights | ESPN FC" — and that headline can
 * hint at a result. Those prefixed titles are rejected outright. The visible
 * player still covers YouTube's title bar (see HighlightPlayer), but an iframe
 * cover is not an absolute boundary for accessibility or native media surfaces,
 * so it is defense in depth rather than permission to ingest a spoiler title.
 *
 * NO DURATIONS, EVER. A club cut must not carry `durationSeconds`. That
 * omission is how "no runtime shown anywhere on a club match" is enforced — in
 * the data, not the UI — so adding the field back here would silently
 * reintroduce a runtime badge. `serializeVideo()` cannot emit it.
 */
import { appendFileSync, writeFileSync } from 'fs'
import type { GroupMatch, HighlightVideo, KnockoutMatch, TeamId, Tournament } from '../src/data/types'
import { clubIdByName, clubs } from '../src/data/club/clubs'
import { isPlayed } from '../src/logic/spoilers'
import { CLUB_COMPETITIONS, SEASON_YEAR, pairKey, videosExportName, videosModulePath } from './espn-club'
import type { ClubCompetitionConfig } from './espn-club'
import { checkEmbeddable, getVideoMeta } from './youtube'

const API_KEY = process.env.YOUTUBE_API_KEY
const API = 'https://www.googleapis.com/youtube/v3'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'

const dryRun = process.argv.includes('--dry-run')
const onlyCompetition = (() => {
  const i = process.argv.indexOf('--competition')
  return i === -1 ? null : process.argv[i + 1]
})()

// ---- sources ---------------------------------------------------------------

/** A matchup and its surroundings, as one source's titles express them. */
export interface TitleParse {
  homeName: string
  awayName: string
  /** Everything after the matchup, minus the source's own branding. */
  context: string
  /** `YYYY-MM-DD` when the title dates the fixture, else null. */
  dateHint: string | null
}

export interface ClubVideoSource {
  id: string
  label: string
  channelId: string
  /** Competition ids this source holds highlight rights to, and no others. */
  competitions: string[]
  /**
   * How many recent uploads to scan. A soccer-only channel needs a shallow
   * window; a general-sports channel posting all day needs a deep one, or a
   * Saturday's worth of football falls off the end before we look.
   */
  scanDepth: number
  /** See the header — true for ESPN FC alone. */
  rejectsLeadingPrefix: boolean
  parse(title: string): TitleParse | null
}

/** Branding segments that are the channel signing its own work, not context. */
function joinContext(tail: string, branding: RegExp): string {
  return tail
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !branding.test(s))
    .join(' | ')
}

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

/**
 * The match date a title prints, as `YYYY-MM-DD`, in either shape a US
 * broadcaster uses: `9/6/2026` or `September 6, 2026`. Null when the title
 * doesn't date the fixture, which is the common case and costs nothing — the
 * date is a disambiguator, never a requirement.
 */
function titleDate(text: string): string | null {
  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/)
  if (slash) return iso(slash[3], Number(slash[1]), Number(slash[2]))

  const long = text.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/)
  if (long) {
    const month = MONTHS.findIndex((m) => m.startsWith(long[1].toLowerCase()))
    if (month >= 0) return iso(long[3], month + 1, Number(long[2]))
  }
  return null
}

function iso(year: string, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const text = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return Number.isFinite(Date.parse(`${text}T00:00:00Z`)) ? text : null
}

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
const GOLAZO_RE = /^(.+?)\s+vs\.?\s+(.+?):\s+(?:Extended\s+)?Highlights\b(.*)$/i

/**
 * NBC's Premier League template, e.g.
 *   "Everton v. Manchester United | PREMIER LEAGUE HIGHLIGHTS | 9/6/2026 | NBC Sports"
 *
 * The competition segment is part of the pattern rather than a check further
 * down, because NBC posts the same `A v. B | <COMPETITION> HIGHLIGHTS` shape for
 * the NFL, NASCAR and the NWSL — matching the words "PREMIER LEAGUE" here is
 * what keeps those out, and it costs no network call.
 */
const NBC_RE = /^([^|]+?)\s+vs?\.?\s+([^|]+?)\s*\|\s*(PREMIER\s+LEAGUE(?:\s+EXTENDED)?\s+HIGHLIGHTS\b.*)$/i

/**
 * ESPN FC's La Liga template, e.g.
 *   "Athletic Club vs. Sevilla | LALIGA Highlights | ESPN FC"
 *   "LALIGA SEASON OPENER 🚨 Getafe vs. Alaves | LALIGA Highlights | ESPN FC"
 *
 * The leading headline in the second form is rejected — see the header. The
 * matchup is confined to one `|` segment, so a headline in its own segment does
 * not parse either.
 */
const ESPNFC_RE = /^([^|]+?)\s+vs?\.?\s+([^|]+?)\s*\|\s*(LA\s?LIGA\s+(?:EXTENDED\s+)?HIGHLIGHTS\b.*)$/i

export const GOLAZO_CHANNEL_ID = 'UCET00YnetHT7tOpu12v8jxg'
export const NBC_CHANNEL_ID = 'UCqZQlzSHbVJrwrn5XvzrzcA'
export const ESPNFC_CHANNEL_ID = 'UC6c1z7bA__85CIWZ_jpCK-Q'

export const CLUB_VIDEO_SOURCES: Record<string, ClubVideoSource> = {
  golazo: {
    id: 'golazo',
    label: 'CBS Sports Golazo',
    channelId: GOLAZO_CHANNEL_ID,
    competitions: ['ucl'],
    scanDepth: 150,
    rejectsLeadingPrefix: false,
    parse(title) {
      const m = title.match(GOLAZO_RE)
      if (!m) return null
      return {
        homeName: m[1].trim(),
        awayName: m[2].trim(),
        context: joinContext(m[3], /^CBS\s+Sport/i),
        dateHint: null,
      }
    },
  },
  nbc: {
    id: 'nbc',
    label: 'NBC Sports',
    channelId: NBC_CHANNEL_ID,
    competitions: ['eng1'],
    // NBC posts every American sport it holds, all day; a weekend of Premier
    // League is a thin slice of that.
    scanDepth: 600,
    rejectsLeadingPrefix: false,
    parse(title) {
      const m = title.match(NBC_RE)
      if (!m) return null
      return {
        homeName: m[1].trim(),
        awayName: m[2].trim(),
        context: joinContext(m[3], /^NBC\s+Sport/i),
        dateHint: titleDate(m[3]),
      }
    },
  },
  espnfc: {
    id: 'espnfc',
    label: 'ESPN FC',
    channelId: ESPNFC_CHANNEL_ID,
    competitions: ['esp1'],
    scanDepth: 400,
    rejectsLeadingPrefix: true,
    parse(title) {
      const m = title.match(ESPNFC_RE)
      if (!m) return null
      return {
        homeName: m[1].trim(),
        awayName: m[2].trim(),
        context: joinContext(m[3], /^ESPN(\s+FC)?$/i),
        // ESPN FC dates only some of its cuts; when it does, that date picks
        // the right half of a home-and-away pair out on its own.
        dateHint: titleDate(m[3]),
      }
    },
  },
}

export const sourcesForCompetition = (competitionId: string): ClubVideoSource[] =>
  Object.values(CLUB_VIDEO_SOURCES).filter((s) => s.competitions.includes(competitionId))

/** The uploads playlist of a channel is its id with UC→UU. */
export const uploadsPlaylistOf = (source: ClubVideoSource): string =>
  'UU' + source.channelId.slice(2)

// ---- title screening -------------------------------------------------------

/** Result-leaking wording. The title shape already excludes it; belt and braces. */
const TITLE_SPOILER_RE =
  /\d\s*[-–]\s*\d|\b(beat|beats|win|wins|won|loss|lose|loses|drew|draws|advance|advances|eliminat|knock(?:ed)? out|stunn|thrash|comeback)\b/i

/**
 * Competitions a source covers that are NOT ours. Two clubs can be in our UCL
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
 * Round labels as the sources write them. A generic label ("Round of 16") is a
 * weak signal on its own — plenty of competitions have one — so a title
 * carrying only a round label is accepted just for the round it names, and the
 * fixture lookup then has to find the pair in exactly that round. A title
 * carrying `UCL` needs no such corroboration.
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
  /** Everything after the matchup, minus the source's own branding. */
  context: string
  /** Leg number when the title names one, else null. */
  leg: 1 | 2 | null
  /** Knockout round id when the title names one of this competition's, else null. */
  round: string | null
  /** The title named this competition outright, rather than only a round. */
  strongTag: boolean
  /** `YYYY-MM-DD` when the title dates the fixture, else null. */
  dateHint: string | null
}

export type ScreenResult =
  | { status: 'ok'; screen: TitleScreen }
  /** Not a candidate for this competition at all — not worth logging. */
  | { status: 'ignore'; reason: string }
  /** Looked like one of ours and failed a gate. Logged; retried next cycle. */
  | { status: 'skip'; reason: string }

/**
 * The club named by the longest suffix of `raw` that resolves, as the registry
 * writes it — the club name with any editorial headline in front of it
 * stripped. Longest-first so "REAL MADRID SHOCKER 🚨 Espanyol" can only ever
 * come back as Espanyol, and null when nothing in the tail is a club we know,
 * which fails closed exactly like an unrecognised name.
 */
export function clubNameFromTail(raw: string): string | null {
  const words = raw.trim().split(/\s+/)
  for (let i = 0; i < words.length; i += 1) {
    const id = clubIdByName(words.slice(i).join(' '))
    if (id) return clubs[id].name
  }
  return null
}

/**
 * Everything decidable from the playlist title alone. Run first so the ~90% of
 * uploads that are talk shows and interviews cost no network calls at all.
 */
export function screenTitle(
  config: ClubCompetitionConfig,
  source: ClubVideoSource,
  title: string,
): ScreenResult {
  if (!source.competitions.includes(config.id)) {
    return { status: 'ignore', reason: `${source.label} does not cover ${config.id}` }
  }

  const parsed = source.parse(title)
  if (!parsed) return { status: 'ignore', reason: 'not a full-match highlight title' }

  const { homeName } = parsed
  const { awayName, context, dateHint } = parsed
  if (source.rejectsLeadingPrefix && !clubIdByName(homeName)) {
    const tail = clubNameFromTail(homeName)
    if (tail) return { status: 'skip', reason: 'editorial prefix is not spoiler-safe' }
    return { status: 'skip', reason: 'title did not map to two known clubs' }
  }

  if (FOREIGN_COMPETITION_RE.test(context)) {
    return { status: 'ignore', reason: 'another competition' }
  }

  const strongTag = COMPETITION_TAG_RE[config.id]?.test(context) ?? false
  const round = config.knockoutRounds.find((r) => ROUND_TITLE_RE[r.id]?.test(context))?.id ?? null
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
      homeName,
      awayName: awayName.trim(),
      context,
      leg: legMatch ? (Number(legMatch[1]) as 1 | 2) : null,
      round,
      strongTag,
      dateHint,
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

const DAY_MS = 24 * 60 * 60 * 1000

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
  screen: Pick<TitleScreen, 'leg' | 'round' | 'strongTag' | 'dateHint'>,
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

  // A dated title picks its own fixture out of a home-and-away pair. The window
  // is a day either side because the date a broadcaster prints is its own local
  // one, which straddles midnight UTC in both directions.
  if (screen.dateHint) {
    const hintMs = Date.parse(`${screen.dateHint}T00:00:00Z`)
    const near = candidates.filter(
      (m) => Math.abs(Date.parse(`${m.date}T00:00:00Z`) - hintMs) <= DAY_MS,
    )
    if (near.length === 0) return { status: 'none' }
    candidates = near
  }

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
  // Existing cuts are not evidence about which fixture a new upload depicts.
  // Resolve the title to one match first; otherwise a late re-upload of the
  // first meeting could be attached to the return fixture simply because the
  // first slot is already occupied.
  if (after.length > 1) return { status: 'ambiguous' }

  const need = after.filter(
    (m) => (m.videos?.length ?? 0) === 0 && (existing[m.id]?.length ?? 0) === 0,
  )
  if (need.length === 0) return { status: 'have' }
  return { status: 'ok', match: need[0] }
}

// ---- the gate ---------------------------------------------------------------

export interface CandidateInput {
  config: ClubCompetitionConfig
  /** The source whose uploads this came from; its channel id must match. */
  source: ClubVideoSource
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
  const screened = screenTitle(input.config, input.source, input.title)
  if (screened.status !== 'ok') return screened
  const { screen } = screened

  // 1. channel — the video really is from the source we scanned
  if (input.channelId !== input.source.channelId) {
    return {
      status: 'skip',
      reason: `channel ${input.channelId ?? '?'} is not ${input.source.label}`,
    }
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
  const sources = sourcesForCompetition(competitionId)
    .map((s) => s.label)
    .join(', ')
  const header = `// Generated — do not hand-edit
import type { HighlightVideo } from '../types'

/**
 * Auto-curated ${sources || 'club'} highlight cuts for ${competitionId} ${year}-${String(year + 1).slice(2)}, keyed by match id.
 *
 * GENERATED by scripts/curate-club-videos.ts — do not edit by hand. Entries are
 * appended as the rights holder publishes a full-match cut that clears every
 * one of the curator's deterministic gates; nothing is ever edited or removed.
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

// ---- YouTube uploads -------------------------------------------------------

export interface PlaylistVideo {
  id: string
  title: string
}

/**
 * A cut we haven't picked up within a month is gone — the fixture is far behind
 * the carousel by then — so paging further back only spends quota. It also
 * bounds the cost of the deep scans the general-sports channels need.
 */
const LOOKBACK_DAYS = 30

async function listUploadsApi(
  playlistId: string,
  max: number,
  sinceMs: number,
): Promise<PlaylistVideo[]> {
  const out: PlaylistVideo[] = []
  let pageToken = ''
  while (out.length < max) {
    const url =
      `${API}/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}` +
      `&key=${API_KEY}${pageToken ? `&pageToken=${pageToken}` : ''}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`YouTube API ${res.status} listing ${playlistId}`)
    const data = (await res.json()) as {
      nextPageToken?: string
      items?: {
        snippet?: { title?: string; publishedAt?: string; resourceId?: { videoId?: string } }
      }[]
    }
    // An uploads playlist is strictly newest-first, so the first item past the
    // floor means every later page is too.
    let reachedFloor = false
    for (const it of data.items ?? []) {
      const published = Date.parse(it.snippet?.publishedAt ?? '')
      if (Number.isFinite(published) && published < sinceMs) {
        reachedFloor = true
        continue
      }
      const id = it.snippet?.resourceId?.videoId
      const title = it.snippet?.title
      if (id && title) out.push({ id, title })
    }
    if (reachedFloor || !data.nextPageToken) break
    pageToken = data.nextPageToken
  }
  return out.slice(0, max)
}

/** Keyless fallback: one page of the playlist's HTML, no pagination, no dates. */
async function listUploadsScrape(playlistId: string, max: number): Promise<PlaylistVideo[]> {
  const res = await fetch(`https://www.youtube.com/playlist?list=${playlistId}`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US' },
  })
  if (!res.ok) throw new Error(`${res.status} listing ${playlistId}`)
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

/** A source's recent uploads, newest first — Data API when keyed, scrape when not. */
export function listSourceUploads(
  source: ClubVideoSource,
  now = Date.now(),
): Promise<PlaylistVideo[]> {
  const playlist = uploadsPlaylistOf(source)
  const sinceMs = now - LOOKBACK_DAYS * DAY_MS
  return API_KEY
    ? listUploadsApi(playlist, source.scanDepth, sinceMs)
    : listUploadsScrape(playlist, source.scanDepth)
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

  const added: string[] = []
  const skipped: string[] = []
  const errors: string[] = []
  /** Fetched at most once per video, however many competitions screen it in. */
  const metaCache = new Map<
    string,
    { channelId: string | null; publishedAt: string | null; embeddable: 'yes' | 'no' | 'unknown' }
  >()
  /** One list per source, however many competitions that source covers. */
  const uploadsCache = new Map<string, PlaylistVideo[]>()

  for (const config of configs) {
    const { tournament, videos } = await loadSeason(config.id)
    if (!tournament || !videos) {
      errors.push(`${config.id}: season files not generated yet — run scripts/espn-club.ts first`)
      continue
    }
    const map: Record<string, HighlightVideo[]> = {}
    for (const [id, vids] of Object.entries(videos)) map[id] = [...vids]
    let addedHere = 0

    const sources = sourcesForCompetition(config.id)
    if (sources.length === 0) {
      errors.push(`${config.id}: no highlight source is configured for this competition`)
      continue
    }

    for (const source of sources) {
      let uploads = uploadsCache.get(source.id)
      if (!uploads) {
        try {
          uploads = await listSourceUploads(source)
          uploadsCache.set(source.id, uploads)
        } catch (e) {
          errors.push(`${source.label}: could not list uploads (${e})`)
          continue // transient — retried next cycle
        }
      }
      console.log(
        `Scanning ${uploads.length} ${source.label} uploads for ${config.id}${dryRun ? ' (dry-run)' : ''}…`,
      )

      for (const up of uploads) {
        // Cheap pass first: no network for the reaction shows and interviews.
        const screened = screenTitle(config, source, up.title)
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
          source,
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
        added.push(`${config.id} ${matchLabel(tournament, match)} ${up.id} (${source.label})`)
        addedHere++
        console.log(`  + ${added[added.length - 1]}`)
      }
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
