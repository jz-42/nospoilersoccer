import { ucl_2026 } from './club/ucl-2026'
import { unl2026 } from './nations/unl-2026'
import type { HighlightVideo, Tournament } from './types'
import { highlightKey, preferredHighlightVideos } from './videos'
import { wc2026Entertainment } from './wc2026-entertainment'
import { wc2026 as wc2026Base } from './wc2026'
import { wc2026Videos } from './wc2026-videos'
import { isNationsLeaguePriorityWindow } from '../navigation'

/**
 * Fold the auto-curated highlight cuts (scripts/curate-videos.ts writes them
 * to wc2026-videos.ts) into the tournament. Provider duplicates are collapsed
 * to one cut per kind for the user, preferring YouTube over FOX when both are
 * available. Doing the merge here means the curator bot only ever writes its
 * own file, never the hand- and results-bot-maintained wc2026.ts.
 */
function withVideos(t: Tournament, extra: Record<string, HighlightVideo[]>): Tournament {
  const attach = <M extends { id: string; videos?: HighlightVideo[] }>(m: M): M => {
    const add = extra[m.id]
    if (!add?.length) return m
    const have = new Set((m.videos ?? []).map(highlightKey))
    const merged = preferredHighlightVideos([...(m.videos ?? []), ...add.filter((v) => !have.has(highlightKey(v)))])
    return { ...m, videos: merged }
  }
  return {
    ...t,
    groupMatches: t.groupMatches.map(attach),
    knockoutRounds: t.knockoutRounds.map((r) => ({ ...r, matches: r.matches.map(attach) })),
  }
}

function withEntertainment(
  t: Tournament,
  extra: Record<string, { entertainmentSummary: string; entertainmentRating: 1 | 2 | 3 | 4 | 5 }>,
): Tournament {
  const attach = <M extends { id: string; entertainmentSummary?: string; entertainmentRating?: 1 | 2 | 3 | 4 | 5 }>(m: M): M => {
    const add = extra[m.id]
    if (!add) return m
    return { ...m, entertainmentSummary: add.entertainmentSummary, entertainmentRating: add.entertainmentRating }
  }
  return {
    ...t,
    groupMatches: t.groupMatches.map(attach),
    knockoutRounds: t.knockoutRounds.map((r) => ({ ...r, matches: r.matches.map(attach) })),
  }
}

const wc2026 = withEntertainment(withVideos(wc2026Base, wc2026Videos), wc2026Entertainment)

/**
 * Tournaments that ship inside the main bundle. Only the default lives here:
 * it has to paint with no spinner, so it can't be a lazy chunk. Everything
 * else loads on demand (see `Season.load`).
 *
 * wc2022 is deliberately absent — the dataset stays in the repo but the
 * tournament was only ever a test and is no longer offered in the app.
 */
export const tournaments: Record<string, Tournament> = { wc2026 }

export interface Season {
  /** Globally unique, e.g. 'wc2026' or 'eng1-2026'. Keys stored progress. */
  id: string
  /** Shown in the season picker, e.g. '2026' or '26/27'. */
  label: string
  /** Season start year; seasons sort newest-first on this. */
  year: number
  /** Set when the season is bundled eagerly. Exactly one of these two is set. */
  tournament?: Tournament
  /** Set when the season is a lazy chunk. */
  load?: () => Promise<Tournament>
}

export interface Competition {
  id: string
  name: string
  /** Compact label for the picker pill, e.g. 'PL'. */
  shortName: string
  seasons: Season[]
  /**
   * Lives under Archive in the header menu instead of in the season picker.
   * Set by hand rather than derived from dates: a competition moves there
   * because we chose to retire it from the everyday list, not because its
   * last match happened to pass.
   */
  archived?: boolean
}

/**
 * Club competitions we intend to show, in display order. This table carries
 * only naming — which *seasons* exist is discovered from the data files below,
 * so adding a season is a matter of dropping in one generated file.
 */
const CLUB_COMPETITIONS: readonly { id: string; name: string; shortName: string }[] = [
  { id: 'ucl', name: 'Champions League', shortName: 'UCL' },
  { id: 'eng1', name: 'Premier League', shortName: 'PL' },
  { id: 'esp1', name: 'La Liga', shortName: 'La Liga' },
]

/**
 * Lazy chunks, one per club season. Vite code-splits each, so the bundle does
 * not grow as seasons accumulate — which is the whole reason club data isn't
 * imported the way the World Cup is.
 *
 * import.meta.glob is Vite-only and throws under plain Node (tsx), where the
 * smoke tests run; there the map stays empty and only the World Cup and the
 * eagerly bundled default season (EAGER_CLUB_SEASONS below) are offered. Same pattern, and same reason, as src/components/Flag.tsx — note
 * that a `typeof` guard does not work, the try/catch is required.
 */
let clubSeasonModules: Record<string, () => Promise<unknown>> = {}
try {
  clubSeasonModules = import.meta.glob('./club/*-*.ts')
} catch {
  // Node: no bundler, no chunks — World Cup and eager seasons only.
}

/** './club/eng1-2026.ts' → { competition: 'eng1', year: 2026 } */
function parseSeasonPath(path: string): { competition: string; year: number } | null {
  const file = path.split('/').pop()?.replace(/\.ts$/, '')
  const m = file?.match(/^(.+)-(\d{4})$/)
  if (!m) return null
  return { competition: m[1], year: Number(m[2]) }
}

/** A club season spans two calendar years: 2026 → '26/27'. */
function seasonLabel(year: number): string {
  return `${String(year).slice(2)}/${String(year + 1).slice(2)}`
}

/**
 * Club seasons baked into the main bundle instead of code-split. Only the
 * default belongs here: it is what paints on a cold load, and a lazy chunk
 * cannot paint without showing a spinner first. Every other season stays a
 * chunk, so the bundle does not grow as seasons accumulate.
 *
 * A static import also works under plain Node, where the glob below does not —
 * so the default season is offered even in the smoke tests.
 */
const EAGER_CLUB_SEASONS: Record<string, Tournament> = { 'ucl-2026': ucl_2026 }

function clubSeasons(competitionId: string): Season[] {
  const seasons: Season[] = []
  const seen = new Set<string>()
  for (const [path, load] of Object.entries(clubSeasonModules)) {
    const parsed = parseSeasonPath(path)
    if (!parsed || parsed.competition !== competitionId) continue
    const id = `${competitionId}-${parsed.year}`
    seen.add(id)
    const eager = EAGER_CLUB_SEASONS[id]
    seasons.push({
      id,
      label: seasonLabel(parsed.year),
      year: parsed.year,
      ...(eager
        ? { tournament: eager }
        : {
            // Each season file default-exports nothing; it names its export
            // after the file (eng1_2026). Take whichever export is the
            // Tournament.
            load: async () => {
              const mod = (await load()) as Record<string, Tournament>
              const found = Object.values(mod).find((v) => v && typeof v === 'object' && 'groupMatches' in v)
              if (!found) throw new Error(`${path} does not export a Tournament`)
              return found
            },
          }),
    })
  }
  // Node has no glob, so an eager season would otherwise go missing entirely.
  for (const [id, tournament] of Object.entries(EAGER_CLUB_SEASONS)) {
    const parsed = parseSeasonPath(`./club/${id}.ts`)
    if (!parsed || parsed.competition !== competitionId || seen.has(id)) continue
    seasons.push({ id, label: seasonLabel(parsed.year), year: parsed.year, tournament })
  }
  return seasons.sort((a, b) => b.year - a.year)
}

/**
 * Picker order: the club competitions people follow week to week. The World
 * Cup is finished and archived — it is reached from Archive in the header
 * menu, not the picker (see `pickerCompetitions` / `archivedCompetitions`).
 */
export const competitions: Competition[] = [
  {
    id: 'unl',
    name: 'UEFA Nations League',
    shortName: 'Nations League',
    seasons: [{ id: 'unl-2026', label: '26/27', year: 2026, tournament: unl2026 }],
  },
  ...CLUB_COMPETITIONS.map((c) => ({ ...c, seasons: clubSeasons(c.id) })),
  {
    id: 'wc',
    name: 'World Cup',
    shortName: 'World Cup',
    seasons: [{ id: 'wc2026', label: '2026', year: 2026, tournament: wc2026 }],
    archived: true,
  },
  // A competition with no season files yet would render an empty picker entry.
].filter((c) => c.seasons.length > 0)

/** What the season picker lists, with the currently active competition first. */
export function pickerCompetitionsAt(now: Date = new Date()): Competition[] {
  const live = competitions.filter((competition) => !competition.archived)
  const priority = isNationsLeaguePriorityWindow(now)
    ? ['unl', 'ucl', 'eng1', 'esp1']
    : ['ucl', 'unl', 'eng1', 'esp1']
  return [...live].sort((a, b) => priority.indexOf(a.id) - priority.indexOf(b.id))
}

/** What Archive in the header menu lists. */
export const archivedCompetitions = competitions.filter((c) => c.archived)

/**
 * The competition the app opens on for a first-time visitor. It is the one
 * people follow week to week, and the one bundled eagerly above so it paints
 * with no spinner.
 */
export function defaultSeasonIdAt(now: Date = new Date()): string {
  return isNationsLeaguePriorityWindow(now) ? 'unl-2026' : 'ucl-2026'
}

export const defaultSeasonId = defaultSeasonIdAt()

/** A valid explicit user choice always outranks date-driven merchandising. */
export function resolveInitialSeason(saved: string | null, now: Date = new Date()): string {
  return saved && findSeason(saved) ? saved : defaultSeasonIdAt(now)
}

export function findSeason(id: string): { competition: Competition; season: Season } | null {
  for (const competition of competitions) {
    const season = competition.seasons.find((s) => s.id === id)
    if (season) return { competition, season }
  }
  return null
}

/** Resolve a season to its tournament. Bundled seasons return synchronously. */
export function loadSeason(season: Season): Tournament | Promise<Tournament> {
  return season.tournament ?? season.load!()
}

export * from './types'
