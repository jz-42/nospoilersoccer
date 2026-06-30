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
  /** Flag emoji, e.g. "🇦🇷". */
  flag: string
}

export type VideoKind = 'normal' | 'extended'
export type HighlightSource = 'youtube' | 'fox'

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

export interface KnockoutRound {
  /** e.g. 'r32', 'r16', 'qf', 'sf', 'third-place', 'final' */
  id: string
  name: string
  matches: KnockoutMatch[]
}

export interface Group {
  id: GroupId
  teams: TeamId[]
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
  groupMatches: GroupMatch[]
  /** Ordered first round → final (third-place playoff before the final). */
  knockoutRounds: KnockoutRound[]
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
