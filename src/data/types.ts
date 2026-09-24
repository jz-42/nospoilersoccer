/**
 * Tournament data schema.
 *
 * One Tournament object describes everything the site knows about a World Cup:
 * teams, groups, every match with its real result, and curated highlight
 * videos. The schema is config-driven so both shapes fit:
 *   - 2022: 32 teams, 8 groups, R16 knockout
 *   - 2026: 48 teams, 12 groups, R32 knockout, 8 best third-placed teams advance
 *
 * Results are stored in full. The app decides what to *show* based on the
 * user's progress — the data file itself is maximally spoiled by design.
 */

export type TeamId = string
export type GroupId = string

export interface Team {
  id: TeamId
  name: string
  /**
   * Flag emoji, e.g. "🇦🇷". National teams only — clubs carry a crest asset
   * instead and fall back to a `shortName` monogram, so this is optional.
   */
  flag?: string
  /** Compact label for tight surfaces and the monogram fallback, e.g. "LIV". */
  shortName?: string
  /** ESPN's numeric team id. Ingest-only; nothing in the UI reads it. */
  espnId?: string
  /** Stable seed used only after every footballing tiebreak remains level. */
  accessRank?: number
}

export type VideoKind = 'normal' | 'extended'
export type HighlightSource = 'youtube' | 'fox'
export type YouTubeHighlightPublisher = 'espn-fc' | 'espn-deportes'

interface HighlightVideoBase {
  kind: VideoKind
  /** Shown on the match card so viewers can pick a length. */
  durationSeconds?: number
  /**
   * Fan/community upload rather than an official broadcaster cut. Some 2022
   * extended highlights only exist as community re-uploads; these are surfaced
   * with a small disclaimer in the player.
   */
  community?: boolean
}

export interface YouTubeHighlightVideo extends HighlightVideoBase {
  /** Existing data omits source; absence means YouTube for compatibility. */
  source?: 'youtube'
  /** YouTube video id (the part after `v=`). */
  youtubeId: string
  /** Exact ESPN channel when La Liga has more than one trusted provider. */
  publisher?: YouTubeHighlightPublisher
  foxId?: never
}

export interface FoxHighlightVideo extends HighlightVideoBase {
  source: 'fox'
  /** FOX MediaCloud id, e.g. `fmc-...`. */
  foxId: string
  youtubeId?: never
}

export type HighlightVideo = YouTubeHighlightVideo | FoxHighlightVideo

export interface Score {
  home: number
  away: number
}

export type MatchLiveStatus = { kind: 'live' } | { kind: 'delayed' }

/**
 * Pre-match win probabilities (0..1), snapshotted at curation time from a
 * prediction market — never fetched live, so a resolved market can't leak a
 * result to someone catching up days later.
 */
export interface MatchOdds {
  home: number
  draw?: number
  away: number
  /** Credit/source link, e.g. the Polymarket event page. */
  url: string
}

/** One goal. `team` is the side credited (own goals count for the opponent). */
export interface Goal {
  team: TeamId
  player: string
  /** Display minute as broadcast, e.g. "23'" or "45'+7'". */
  minute: string
  penalty?: boolean
  ownGoal?: boolean
}

export type EntertainmentRating = 1 | 2 | 3 | 4 | 5

export interface GroupMatch {
  id: string
  group: GroupId
  matchday: number
  /** Published schedule date, YYYY-MM-DD. UI dates derive from `kickoff`. */
  date: string
  /** Exact kickoff as UTC instant, e.g. "2022-11-20T16:00Z". */
  kickoff?: string
  home: TeamId
  away: TeamId
  liveStatus?: MatchLiveStatus
  /** Absent while the match hasn't been played yet (live tournaments). */
  score?: Score
  goals?: Goal[]
  /** Spoiler-safe 1-2 sentence summary of public reaction to the match's entertainment value. */
  entertainmentSummary?: string
  /** Entertainment rating derived from public reaction, 1..5 stars. */
  entertainmentRating?: EntertainmentRating
  odds?: MatchOdds
  videos?: HighlightVideo[]
}

/**
 * Where a knockout slot's team comes from. Until the user unlocks the slot,
 * it renders as a placeholder label derived from this ref ("Winner Group A",
 * "Winner of QF1", ...).
 */
export type SlotRef =
  | { type: 'group-rank'; group: GroupId; rank: number }
  /** 2026: one of the best third-placed teams, drawn from several groups. */
  | { type: 'best-third'; groups: GroupId[] }
  | { type: 'match-winner'; match: string }
  /** Third-place playoff slots. */
  | { type: 'match-loser'; match: string }

export interface KnockoutMatch {
  id: string
  /**
   * Set only on a leg of a two-legged tie. Legs stay separate matches so each
   * keeps its own date and lands on its own day in the Today view; the `Tie`
   * holds whatever is only true of the pair (aggregate, who advanced).
   */
  tie?: { id: string; leg: 1 | 2 }
  /** Published schedule date, YYYY-MM-DD. UI dates derive from `kickoff`. */
  date: string
  /** Exact kickoff as UTC instant, e.g. "2022-12-18T15:00Z". */
  kickoff?: string
  home: SlotRef
  away: SlotRef
  liveStatus?: MatchLiveStatus
  /**
   * The teams that actually filled the slots. Derivable from refs + results,
   * but stored explicitly: best-third resolution isn't derivable from scores
   * alone, and the redundancy lets the validator cross-check the bracket.
   * Absent while the feeding games haven't decided them (live tournaments).
   */
  homeTeam?: TeamId
  awayTeam?: TeamId
  /** Result after 90' (or 120' when afterExtraTime is set). Absent = unplayed. */
  score?: Score
  goals?: Goal[]
  /** Spoiler-safe 1-2 sentence summary of public reaction to the match's entertainment value. */
  entertainmentSummary?: string
  /** Entertainment rating derived from public reaction, 1..5 stars. */
  entertainmentRating?: EntertainmentRating
  odds?: MatchOdds
  afterExtraTime?: boolean
  penalties?: Score
  videos?: HighlightVideo[]
}

/**
 * A two-legged knockout tie (European club competitions). The two legs are
 * ordinary `KnockoutMatch` entries carrying a `tie` back-reference; this holds
 * only what the pair decides together.
 *
 * A `SlotRef` of `{ type: 'match-winner', match }` may name a tie id instead of
 * a match id — the tie is what advances a team, not either individual leg.
 */
export interface Tie {
  id: string
  /** Leg match ids, in playing order. */
  legs: [string, string]
  /** Combined score across both legs. Absent until the tie is decided. */
  aggregate?: Score
  /** Shootout at the end of leg 2, when the aggregate finished level. */
  penalties?: Score
  /** Teams as they lined up in leg 1 (home = leg 1's home side). */
  homeTeam?: TeamId
  awayTeam?: TeamId
  /**
   * Stored rather than derived, for the same reason `KnockoutMatch.homeTeam`
   * is: it lets the validator cross-check the aggregate instead of trusting
   * our reading of it.
   */
  winner?: TeamId
}

export interface KnockoutRound {
  /** e.g. 'r32', 'r16', 'qf', 'sf', 'third-place', 'final' */
  id: string
  name: string
  matches: KnockoutMatch[]
}

/** Ordered comparisons applied after points to separate level teams. */
export type Tiebreak =
  | 'head-to-head'
  | 'goal-difference'
  | 'goals-for'
  | 'away-goals'
  | 'wins'
  | 'away-wins'
  | 'disciplinary'
  | 'access-list'

export type StandingOutcomeKind = 'qualify' | 'promote' | 'playoff' | 'stay' | 'relegate'

export interface StandingOutcome {
  kind: StandingOutcomeKind
  label: string
}

export interface GroupSection {
  id: string
  label: string
  groupIds: GroupId[]
}

export interface QualificationRule {
  groupRank: number
  outcome: StandingOutcome
  crossGroup?: {
    top: number
    topOutcome: StandingOutcome
    bottomOutcome: StandingOutcome
  }
}

export interface QualificationSection {
  sectionId: string
  rules: QualificationRule[]
}

export interface PendingStage {
  id: string
  label: string
  window: string
  pools: { label: string }[]
}

export interface KnockoutTrack {
  id: string
  label: string
  roundIds: string[]
  pendingStages?: PendingStage[]
}

export interface Group {
  id: GroupId
  teams: TeamId[]
  /** Explicit display name for formats whose ids already carry a league. */
  label?: string
  /** Parent `groupSections` id, e.g. A for group A1. */
  sectionId?: string
  /** Lower is better. Used only after all match-result criteria remain level. */
  disciplinary?: Partial<Record<TeamId, number>>
  /** Authoritative final order; never consulted for a partially revealed table. */
  officialOrder?: TeamId[]
}

export interface Tournament {
  id: string
  name: string
  year: number
  /** Group ranks that advance directly to the knockouts (e.g. [1, 2]). */
  advancingRanks: number[]
  /** 2026: how many best third-placed teams also advance. */
  bestThirdCount?: number
  /**
   * 2026: FIFA's official Annexe C allocation of the best third-placed teams.
   * Key is the sorted set of advancing third-place groups (e.g. 'BDEFIJKL');
   * value maps each group winner to the group whose third it faces. When set,
   * the spoiler engine uses this exact table instead of guessing a pairing.
   */
  bestThirdAllocation?: Record<string, Record<string, GroupId>>
  teams: Record<TeamId, Team>
  groups: Group[]
  /** Optional navigation sections for multi-league group phases. */
  groupSections?: GroupSection[]
  /** Competition-specific meanings for positions within each section. */
  qualificationSections?: QualificationSection[]
  groupMatches: GroupMatch[]
  /** Ordered first round → final (third-place playoff before the final). */
  knockoutRounds: KnockoutRound[]
  /** Independent championship/play-off surfaces sharing `knockoutRounds`. */
  knockoutTracks?: KnockoutTrack[]
  /** Two-legged ties, flat across all rounds. Single-leg rounds don't appear. */
  ties?: Tie[]
  /**
   * Applied after points. Absent means ['goal-difference', 'goals-for'], which
   * is what the World Cup and the Premier League both use. La Liga is the
   * outlier: it settles level teams head-to-head first.
   */
  tiebreakers?: Tiebreak[]
  /**
   * Heading for a single-table competition, e.g. 'Table' or 'League phase'.
   * Absent means the tournament is played in groups. Nothing else configures
   * shape: a single table is `groups.length === 1`, and the knockouts tab
   * appears when `knockoutRounds` is non-empty — derived, so config can never
   * contradict the data.
   */
  tableLabel?: string
  /**
   * What one round of a single-table competition is called: 'Matchweek' in the
   * Premier League, 'Matchday' for UEFA and La Liga. Absent means 'Matchday'.
   */
  roundLabel?: string
}

/** Winner of a knockout match (null while unplayed), accounting for shootouts. */
export function matchWinner(m: KnockoutMatch): TeamId | null {
  const decider = m.penalties ?? m.score
  if (!decider || m.homeTeam === undefined || m.awayTeam === undefined) return null
  return decider.home > decider.away ? m.homeTeam : m.awayTeam
}

export function matchLoser(m: KnockoutMatch): TeamId | null {
  const winner = matchWinner(m)
  if (winner === null) return null
  return winner === m.homeTeam ? m.awayTeam! : m.homeTeam!
}

export function findTie(t: Tournament, id: string): Tie | null {
  return t.ties?.find((x) => x.id === id) ?? null
}

/** The tie a match is a leg of, or null for single-leg matches. */
export function tieOf(t: Tournament, m: KnockoutMatch): Tie | null {
  return m.tie ? findTie(t, m.tie.id) : null
}

/**
 * Winner of a two-legged tie (null while undecided): aggregate first, then the
 * leg-2 shootout when it finished level. Prefers the stored `winner` so a
 * competition with its own rules (away goals, in the years those applied)
 * doesn't depend on us re-deriving them.
 */
export function tieWinner(tie: Tie): TeamId | null {
  if (tie.winner !== undefined) return tie.winner
  if (tie.homeTeam === undefined || tie.awayTeam === undefined) return null
  const decider = tie.penalties ?? tie.aggregate
  if (!decider || decider.home === decider.away) return null
  return decider.home > decider.away ? tie.homeTeam : tie.awayTeam
}

export function tieLoser(tie: Tie): TeamId | null {
  const winner = tieWinner(tie)
  if (winner === null) return null
  return winner === tie.homeTeam ? tie.awayTeam! : tie.homeTeam!
}
