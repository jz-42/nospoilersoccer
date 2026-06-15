/**
 * Automatic spoiler-free highlight curator for World Cup 2026.
 *
 *   npx tsx scripts/curate-videos.ts            # curate + write
 *   npx tsx scripts/curate-videos.ts --dry-run  # show decisions, write nothing
 *   npx tsx scripts/curate-videos.ts --validate # re-check the known-good
 *                                                # inline videos (regression)
 *
 * Pipeline for every recent FOX upload:
 *   1. title must match "<A> vs <B> [Extended ]Highlights … World Cup"
 *      (drops every spoiler-y goal clip / reaction in one step)
 *   2. names → team ids; find the one PLAYED fixture for that pair that is
 *      still missing this cut and kicked off before the video was published
 *   3. deterministic guards: FOX channel, embeddable, clean title, post-kickoff
 *   4. AI gate: title + thumbnail must reveal no result and be the right match
 *   5. append to src/data/wc2026-videos.ts
 *
 * FAIL CLOSED throughout: anything ambiguous or unverifiable is skipped, so the
 * worst outcome is a late/absent video, never a spoiler. APPEND ONLY: existing
 * entries are never edited or replaced. A persistent skip-list
 * (scripts/curate-skip.json) records rejected ids so each video is judged once.
 */
import { appendFileSync, readFileSync, writeFileSync } from 'fs'
import { tournaments } from '../src/data'
import { wc2026Videos } from '../src/data/wc2026-videos'
import type { GroupMatch, HighlightVideo, KnockoutMatch, TeamId } from '../src/data/types'
import { isPlayed } from '../src/logic/spoilers'
import { checkEmbeddable, FOX_CHANNEL_ID, getVideoMeta, listFoxUploads, parseHighlightTitle } from './youtube'
import { aiEnabled, checkVideoForSpoilers } from './spoiler-check'

const VIDEOS_FILE = 'src/data/wc2026-videos.ts'
const SKIP_FILE = 'scripts/curate-skip.json'
/** Plain "Highlights" cuts at/over this length are really extended (the openers). */
const EXTENDED_MIN_SECONDS = 720
/** Obvious result-leaking patterns; the title format already excludes these. */
const TITLE_SPOILER_RE = /\d\s*[-–]\s*\d|\b(beat|beats|win|wins|won|loss|lose|loses|drew|advance|advances|eliminat|knock(?:ed)? out)\b/i

const t = tournaments.wc2026
const dryRun = process.argv.includes('--dry-run')
const validate = process.argv.includes('--validate')

// ---- team-name resolution --------------------------------------------------

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z]/g, '')
const nameToId: Record<string, string> = {}
for (const team of Object.values(t.teams)) nameToId[norm(team.name)] = team.id
// FOX display names that could differ from ours (most already match exactly).
Object.assign(nameToId, {
  unitedstates: 'USA',
  usa: 'USA',
  korearepublic: 'KOR',
  southkorea: 'KOR',
  bosniaherzegovina: 'BIH',
  turkiye: 'TUR',
  caboverde: 'CPV',
  capeverde: 'CPV',
  cotedivoire: 'CIV',
  ivorycoast: 'CIV',
  drcongo: 'COD',
  congodr: 'COD',
  czechrepublic: 'CZE',
  iran: 'IRN',
})

// ---- fixtures --------------------------------------------------------------

type AnyMatch = (GroupMatch | KnockoutMatch) & { videos?: HighlightVideo[] }

function pairOf(m: AnyMatch): [TeamId, TeamId] | null {
  if ('group' in m) return [m.home, m.away]
  return m.homeTeam && m.awayTeam ? [m.homeTeam, m.awayTeam] : null
}
const pairKey = (a: TeamId, b: TeamId) => [a, b].sort().join('|')
function kickoffMs(m: AnyMatch): number {
  return new Date(m.kickoff ?? `${m.date}T00:00:00Z`).getTime()
}

/**
 * A log-safe label. Group fixtures are public knowledge (the site shows the
 * schedule), so the teams are fine to print; a knockout matchup reveals who
 * advanced, so those show the match id only — never spoil the maintainer.
 */
function matchLabel(m: AnyMatch): string {
  if ('group' in m) return `${m.id} ${t.teams[m.home].name} v ${t.teams[m.away].name}`
  return `${m.id} (knockout)`
}

const allMatches: AnyMatch[] = [
  ...t.groupMatches,
  ...t.knockoutRounds.flatMap((r) => r.matches),
]

type FixtureResult =
  | { status: 'ok'; match: AnyMatch }
  | { status: 'none' } // no such pairing in the tournament
  | { status: 'early' } // pairing exists but hasn't been played yet
  | { status: 'have' } // already have this cut for the (only) played fixture
  | { status: 'ambiguous' } // genuine rematch we can't disambiguate

function findFixture(home: TeamId, away: TeamId, kind: HighlightVideo['kind'], publishedMs: number): FixtureResult {
  const key = pairKey(home, away)
  const byPair = allMatches.filter((m) => {
    const p = pairOf(m)
    return p && pairKey(p[0], p[1]) === key
  })
  if (byPair.length === 0) return { status: 'none' }
  const played = byPair.filter(isPlayed)
  if (played.length === 0) return { status: 'early' }
  // A highlight is published after its match; use that to disambiguate rematches.
  const after = played.filter((m) => publishedMs > kickoffMs(m))
  const pool = after.length > 0 ? after : played
  const need = pool.filter((m) => !(m.videos ?? []).some((v) => v.kind === kind))
  if (need.length === 0) return { status: 'have' }
  if (need.length === 1) return { status: 'ok', match: need[0] }
  need.sort((a, b) => kickoffMs(b) - kickoffMs(a))
  if (kickoffMs(need[0]) !== kickoffMs(need[1])) return { status: 'ok', match: need[0] }
  return { status: 'ambiguous' }
}

// ---- skip-list (persistent so each id is judged once) ----------------------

interface SkipEntry {
  reason: string
  at: string
}
function loadSkip(): Record<string, SkipEntry> {
  try {
    return JSON.parse(readFileSync(SKIP_FILE, 'utf8')) as Record<string, SkipEntry>
  } catch {
    return {}
  }
}

// ---- serialization ---------------------------------------------------------

function serializeVideo(v: HighlightVideo): string {
  const parts = [`youtubeId: '${v.youtubeId}'`, `kind: '${v.kind}'`]
  if (v.durationSeconds !== undefined) parts.push(`durationSeconds: ${v.durationSeconds}`)
  if (v.community) parts.push('community: true')
  return `{ ${parts.join(', ')} }`
}
function serializeMap(map: Record<string, HighlightVideo[]>): string {
  const header = `import type { HighlightVideo } from './types'

/**
 * Auto-curated FOX highlight cuts, keyed by match id.
 *
 * GENERATED by scripts/curate-videos.ts — do not edit by hand. Entries are
 * appended automatically as FOX publishes spoiler-free highlights and each one
 * clears the curator's deterministic guards + AI spoiler check. Kept separate
 * from wc2026.ts so the bot owns one file end-to-end and never has to edit the
 * hand-maintained tournament data. src/data/index.ts merges these in.
 */
`
  const ids = Object.keys(map).sort()
  if (ids.length === 0) {
    return `${header}export const wc2026Videos: Record<string, HighlightVideo[]> = {}\n`
  }
  const body = ids
    .map((id) => `  '${id}': [${map[id].map(serializeVideo).join(', ')}],`)
    .join('\n')
  return `${header}export const wc2026Videos: Record<string, HighlightVideo[]> = {\n${body}\n}\n`
}

// ---- run report (visible in GitHub Actions) --------------------------------

/**
 * Writes a per-run report to the GitHub Actions step summary (the nice page you
 * see after a run), and — if anything errored — emits a loud annotation and a
 * step output the workflow turns into a failed run (so you get an email). All
 * a no-op when run locally outside Actions.
 */
function writeReport(added: string[], rejected: string[], errors: string[]) {
  const summary = process.env.GITHUB_STEP_SUMMARY
  if (summary) {
    const lines = [
      `## 🎬 Highlight curator — ${new Date().toISOString()}`,
      '',
      `**Added ${added.length} · Skipped ${rejected.length} · Errors ${errors.length}**`,
    ]
    if (added.length) lines.push('', '### ✅ Added', ...added.map((a) => `- ${a}`))
    if (rejected.length) lines.push('', '### ⏭️ Skipped (won’t reconsider)', ...rejected.map((r) => `- ${r}`))
    if (errors.length) lines.push('', '### ⚠️ Errors (will retry next run)', ...errors.map((e) => `- ${e}`))
    appendFileSync(summary, lines.join('\n') + '\n')
  }
  for (const e of errors) console.log(`::warning::curator: ${e}`)
  if (errors.length) {
    console.log(`::error::Highlight curator hit ${errors.length} error(s) this run — see the run summary.`)
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'has_errors=true\n')
  }
}

// ---- validate mode: regression-check the known-good inline videos ----------

async function runValidate() {
  console.log(`Validating known-good inline videos${aiEnabled ? '' : ' (deterministic only — no OPENAI_API_KEY)'}…\n`)
  let problems = 0
  for (const m of allMatches) {
    // Only the ORIGINAL inline cuts (skip ones the bot may have merged in).
    const inline = (wc2026Videos[m.id] ?? []).map((v) => v.youtubeId)
    for (const v of m.videos ?? []) {
      if (inline.includes(v.youtubeId)) continue
      const p = pairOf(m)
      if (!p) continue
      const home = t.teams[p[0]].name
      const away = t.teams[p[1]].name
      const meta = await getVideoMeta(v.youtubeId).catch((e) => ({ error: String(e) }) as const)
      if ('error' in meta) {
        console.log(`  ✗ ${m.id} ${v.youtubeId}: meta fetch failed (${meta.error})`)
        problems++
        continue
      }
      const issues: string[] = []
      if (meta.channelId && meta.channelId !== FOX_CHANNEL_ID) issues.push('not FOX channel')
      if ((await checkEmbeddable(v.youtubeId)) === 'no') issues.push('not embeddable')
      if (TITLE_SPOILER_RE.test(meta.title)) issues.push('title failed spoiler check')
      if (aiEnabled) {
        const verdict = await checkVideoForSpoilers({ videoId: v.youtubeId, title: meta.title, homeName: home, awayName: away })
        // Generic notes only — the verdict text can quote the score.
        if (verdict.transient) issues.push('AI check did not complete')
        else if (verdict.spoiler) issues.push('AI flagged possible spoiler')
        else if (!verdict.teamsMatch) issues.push('AI: not the full-match highlights')
      }
      if (issues.length > 0) {
        console.log(`  ✗ ${matchLabel(m)} [${v.kind}] ${v.youtubeId}: ${issues.join('; ')}`)
        problems++
      } else {
        console.log(`  ✓ ${matchLabel(m)} [${v.kind}] ${v.youtubeId}`)
      }
    }
  }
  console.log(`\n${problems === 0 ? 'All known-good videos pass.' : `${problems} known-good video(s) flagged — investigate before trusting the curator.`}`)
}

// ---- main curation ---------------------------------------------------------

async function runCurate() {
  const skip = loadSkip()
  const seen = new Set<string>()
  for (const m of allMatches) for (const v of m.videos ?? []) seen.add(v.youtubeId)
  for (const id of Object.keys(skip)) seen.add(id)

  // Working copy of the map to append into.
  const map: Record<string, HighlightVideo[]> = {}
  for (const [id, vids] of Object.entries(wc2026Videos)) map[id] = [...vids]

  const added: string[] = []
  const rejected: string[] = []
  const errors: string[] = []
  const note = (msg: string) => console.log(`  ${msg}`)
  const recordSkip = (id: string, reason: string) => {
    skip[id] = { reason, at: new Date().toISOString() }
    seen.add(id)
    rejected.push(`${id}: ${reason}`)
  }

  const uploads = await listFoxUploads(100)
  console.log(`Scanning ${uploads.length} FOX uploads (AI ${aiEnabled ? 'on' : 'OFF'}${dryRun ? ', dry-run' : ''})…`)

  for (const up of uploads) {
    const parsed = parseHighlightTitle(up.title)
    if (!parsed) continue // not a match-highlight upload
    if (seen.has(up.id)) continue

    const home = nameToId[norm(parsed.homeName)]
    const away = nameToId[norm(parsed.awayName)]
    if (!home || !away) {
      recordSkip(up.id, 'title did not map to two known teams')
      continue
    }

    let meta
    try {
      meta = await getVideoMeta(up.id)
    } catch (e) {
      errors.push(`${up.id}: metadata fetch failed (${e})`)
      note(`! ${up.id}: meta fetch failed, will retry next run (${e})`)
      continue // transient; don't skip-list
    }

    const kind: HighlightVideo['kind'] =
      parsed.kindHint === 'extended' || meta.durationSeconds >= EXTENDED_MIN_SECONDS ? 'extended' : 'normal'

    // Deterministic guards (fail closed).
    if (meta.channelId !== FOX_CHANNEL_ID) {
      recordSkip(up.id, `channel ${meta.channelId ?? '?'} is not FOX`)
      continue
    }
    const emb = await checkEmbeddable(up.id)
    if (emb === 'unknown') {
      errors.push(`${up.id}: embeddability check didn't complete`)
      note(`! ${up.id}: embeddability check failed, will retry next run`)
      continue // transient; don't skip-list
    }
    if (emb === 'no') {
      recordSkip(up.id, 'not embeddable')
      continue
    }
    if (TITLE_SPOILER_RE.test(meta.title)) {
      // Don't echo the title — that's where the score would be.
      recordSkip(up.id, 'title failed the spoiler check')
      continue
    }
    if (!meta.publishedAt) {
      note(`skip ${up.id}: no publish date — will retry next run`)
      continue
    }
    const publishedMs = new Date(meta.publishedAt).getTime()

    // Past here we avoid echoing team names: the pair could be a knockout
    // (which would reveal who advanced) and we don't yet have a safe label.
    const fixture = findFixture(home, away, kind, publishedMs)
    if (fixture.status === 'none') {
      recordSkip(up.id, 'no matching played fixture')
      continue
    }
    if (fixture.status === 'early') {
      note(`hold ${up.id}: match not played yet — will retry`)
      continue // not yet; revisit when the match is in the data
    }
    if (fixture.status === 'have') {
      recordSkip(up.id, `already have a ${kind} cut`)
      continue
    }
    if (fixture.status === 'ambiguous') {
      recordSkip(up.id, 'ambiguous fixture — skipped to be safe')
      continue
    }
    const match = fixture.match

    // AI gate. Without a key we can't truly verify, so in real runs we add
    // nothing (and don't skip-list, so it gets checked once a key exists).
    if (aiEnabled) {
      const verdict = await checkVideoForSpoilers({ videoId: up.id, title: meta.title, homeName: t.teams[home].name, awayName: t.teams[away].name })
      if (verdict.transient) {
        // The check didn't get a clean answer (bad key, outage). Retry next
        // run — never skip-list, or a fixed key would leave it blacklisted.
        errors.push(`${up.id}: AI check didn't complete (${verdict.reason})`)
        note(`! ${up.id}: AI check failed, will retry next run (${verdict.reason})`)
        continue
      }
      if (verdict.spoiler || !verdict.teamsMatch) {
        // Generic on purpose — the model's wording can quote the score itself.
        recordSkip(up.id, `AI rejected: ${verdict.spoiler ? 'possible spoiler in title/thumbnail' : 'not the full-match highlights'}`)
        continue
      }
    } else if (!dryRun) {
      note(`hold ${up.id}: no OPENAI_API_KEY, refusing to add unverified — set the secret`)
      continue
    }

    const video: HighlightVideo = { youtubeId: up.id, kind, durationSeconds: meta.durationSeconds }
    map[match.id] = [...(map[match.id] ?? []), video]
    seen.add(up.id)
    added.push(`${matchLabel(match)} [${kind}] ${up.id}`)
    note(`+ ${added[added.length - 1]}`)
  }

  console.log(`\nAdded ${added.length}, rejected ${rejected.length}, errors ${errors.length}.`)
  for (const r of rejected) note(`✗ ${r}`)
  writeReport(added, rejected, errors)

  if (dryRun) {
    if (added.length > 0) {
      console.log(`\n--- ${VIDEOS_FILE} would become: ---`)
      console.log(serializeMap(map))
    }
    console.log('(dry-run — nothing written)')
    return
  }
  if (added.length > 0) writeFileSync(VIDEOS_FILE, serializeMap(map))
  writeFileSync(SKIP_FILE, JSON.stringify(skip, null, 2) + '\n')
}

try {
  if (validate) await runValidate()
  else await runCurate()
} catch (e) {
  // Never fail the workflow over curation — log and move on.
  console.error(`curate-videos failed: ${e}`)
}
