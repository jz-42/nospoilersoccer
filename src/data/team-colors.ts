import { clubColors } from './club-colors'
import type { TeamId } from './types'

/**
 * Per-team identity palettes, used to tint match surfaces with a two-team
 * color field (home on the left, away on the right).
 *
 * Each entry is `[lead, accent, deep?]`. `lead` is the field color that
 * carries the team's whole side; `accent` is the small asymmetric cap at that
 * side's top corner (never a band — accents are seasoning, so two "stripey"
 * countries can't produce plaid); `deep` is an optional third tone the side
 * falls into toward the bottom of the surface. When `deep` is omitted the CSS
 * derives it by darkening the lead — override it only where a *different hue*
 * at depth is part of the identity (USA red falling into navy, Germany's red
 * into flag-black), which is what makes a side read as a country rather than
 * a color. White is never stored: light lives in the glow layer, not paint.
 *
 * Keep this exhaustive for every team across all tournaments — the smoke test
 * fails the build if a roster team is missing. A missing team simply renders a
 * neutral (untinted) modal, so the failure mode is graceful, not broken.
 */
export const teamColors: Record<
  TeamId,
  readonly [string, string] | readonly [string, string, string]
> = {
  ALG: ['#2a8f5e', '#1f6f49'],
  ARG: ['#7cb8e6', '#4f93cc'],
  AUS: ['#3a5da8', '#d8b54a'],
  AUT: ['#d6435a', '#c0c6d2'],
  BEL: ['#e0b53e', '#c43a3a'],
  BIH: ['#3f6fb5', '#e6c352'],
  BRA: ['#e6c84a', '#2f9e63', '#1e6f47'],
  CAN: ['#e0544e', '#c0c6d2'],
  CIV: ['#e08a3c', '#2a9e6a'],
  CMR: ['#2a9e5e', '#d9b441'],
  COD: ['#4aa3d6', '#d6b441'],
  COL: ['#e6c44a', '#3a5fb0'],
  CPV: ['#3a5fa8', '#d94a52'],
  CRC: ['#3a5fb0', '#d6454f'],
  CRO: ['#d6454f', '#3a5fb0'],
  CUW: ['#2f57a0', '#e6c44a'],
  CZE: ['#3a5fa8', '#d6454f'],
  DEN: ['#d6454f', '#c0c6d2'],
  ECU: ['#e6c44a', '#3a5fa8'],
  EGY: ['#d6454f', '#d4b04a'],
  ENG: ['#e0544e', '#c0c6d2'],
  ESP: ['#d6454f', '#e6c44a'],
  FRA: ['#3a5fb0', '#d6454f'],
  GER: ['#d6454f', '#e0b53e', '#23262c'],
  GHA: ['#2a9e5e', '#d6454f'],
  HAI: ['#3a5fb0', '#d6454f'],
  IRN: ['#2a9e5e', '#d6454f'],
  IRQ: ['#d6454f', '#2a9e5e'],
  JOR: ['#2a9e5e', '#d6454f'],
  JPN: ['#dc4b50', '#c0c6d2'],
  KOR: ['#d6454f', '#3a5fb0'],
  KSA: ['#2a9e5e', '#1f7a48'],
  MAR: ['#c43a3f', '#2a8f57'],
  MEX: ['#2a9e5e', '#d6454f'],
  NED: ['#e0843c', '#3a5fb0', '#243c74'],
  NOR: ['#d6454f', '#3a5fb0'],
  NZL: ['#3a5fb0', '#d6454f'],
  PAN: ['#d6454f', '#3a5fb0'],
  PAR: ['#d6454f', '#3a5fb0'],
  POL: ['#d6454f', '#c0c6d2'],
  POR: ['#2a8f57', '#d6454f'],
  QAT: ['#8a2e44', '#6e2236'],
  RSA: ['#2a9e5e', '#d6b441'],
  SCO: ['#3a6fc0', '#2f5aa0'],
  SEN: ['#2a9e5e', '#e6c44a'],
  SRB: ['#d6454f', '#3a5fa8'],
  SUI: ['#d6454f', '#c0c6d2'],
  SWE: ['#3a6fb5', '#e6c44a'],
  TUN: ['#d6454f', '#c0c6d2'],
  TUR: ['#d6454f', '#c0c6d2'],
  URU: ['#5a9fd6', '#e6c44a'],
  // Red-led with navy at depth (plus the white of the glow layer): the
  // red-white-blue read, not "generic blue team".
  USA: ['#c9504c', '#3a5fb0', '#2c4a8c'],
  UZB: ['#3a8fd0', '#2a9e5e'],
  WAL: ['#d6454f', '#2a8f57'],
}

/**
 * Perceptual color math (OKLab) for the collision rule below. Hex parsing is
 * safe here because every input comes from the curated palette above.
 */
function hexToOklab(hex: string): { L: number; a: number; b: number } {
  const n = parseInt(hex.slice(1), 16)
  const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const r = toLinear(((n >> 16) & 0xff) / 255)
  const g = toLinear(((n >> 8) & 0xff) / 255)
  const b = toLinear((n & 0xff) / 255)
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  }
}

function deltaE(x: string, y: string): number {
  const p = hexToOklab(x)
  const q = hexToOklab(y)
  return Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b)
}

function chroma(hex: string): number {
  const c = hexToOklab(hex)
  return Math.hypot(c.a, c.b)
}

/**
 * Two primaries closer than this (OKLab ΔE) read as "the same color" once
 * washed over the dark panel; the matchup then needs an alternate. Tuned so
 * Spain–Austria (red vs red) and USA–Bosnia (blue vs blue) resolve, while
 * Qatar–Switzerland (dark maroon vs bright red) keeps both primaries.
 */
const COLLISION_DELTA_E = 0.12

/**
 * Pick which of a team's tones fills its side (`field`) and which becomes the
 * top-corner accent (`cap`). Normally the lead fills — but when the two leads
 * collide, one team moves to another of its colours, the way Apple Sports
 * moves a team to its alternate kit colour when the home kits clash (their
 * Scotland-goes-yellow / Haiti-is-blue behavior).
 *
 * The away side changes, as the away team changes kit: it takes whichever of
 * its colours — its curated deep tone included — stands farthest from the
 * home lead, with a small cost for leaving its own lead so identity survives
 * when it can. The home side only moves if none of the away team's colours
 * can stand apart. A colourless field (white, silver, black) is penalized
 * hard: side by side in solid halves, a silver side reads as grey rather
 * than white, and over the near-black panel a black side is not a colour but
 * a hole. So Atlético goes navy against Liverpool, the colour of its shorts,
 * rather than silver.
 */
const HOME_MOVE_COST = 0.1

function resolveFields(
  hPal: readonly string[],
  aPal: readonly string[],
): { home: [string, string]; away: [string, string] } {
  const pair = (pal: readonly string[], i: number): [string, string] => [
    pal[i],
    i === 0 ? pal[1] : pal[0],
  ]
  if (deltaE(hPal[0], aPal[0]) >= COLLISION_DELTA_E) return { home: pair(hPal, 0), away: pair(aPal, 0) }
  const penalty = (hex: string) => (chroma(hex) >= 0.04 ? 0 : 0.2)
  // The best colour for one side to move to while the other keeps its lead.
  const pick = (fixed: string, pal: readonly string[], cost: number) => {
    let i = 0
    let score = -Infinity
    pal.forEach((c, j) => {
      const s = deltaE(fixed, c) - penalty(c) - (j > 0 ? cost : 0)
      if (s > score) {
        score = s
        i = j
      }
    })
    return { i, score }
  }
  const away = pick(hPal[0], aPal, 0.04)
  const home = pick(aPal[0], hPal, HOME_MOVE_COST)
  return away.score >= home.score
    ? { home: pair(hPal, 0), away: pair(aPal, away.i) }
    : { home: pair(hPal, home.i), away: pair(aPal, 0) }
}

/**
 * The palette for any team the site can show, national or club. The two tables
 * are kept apart because they're maintained against different references, but
 * their key spaces can't collide — countries are three-letter uppercase codes,
 * clubs are lowercase slugs — so one lookup over both is unambiguous.
 *
 * Undefined for an unknown team, which every caller must treat as "no tint"
 * rather than an error: a missing palette should mute a surface, not break it.
 */
export function paletteFor(
  id: TeamId,
): readonly [string, string] | readonly [string, string, string] | undefined {
  return teamColors[id] ?? clubColors[id]
}

/**
 * CSS custom properties that tint the match modal for a given matchup. Only the
 * sides whose team is known are set, so a not-yet-decided knockout slot leaves
 * that half of the modal neutral until it's revealed — keeping the color reveal
 * in lockstep with the spoiler-safe flag reveal. Returns an empty object when
 * neither team is known (or lacks a palette), yielding the plain dark modal.
 *
 * When both teams are known, their field colors go through the collision rule
 * above so a matchup never reads as one undifferentiated color.
 */
export function matchTint(home: TeamId | null, away: TeamId | null): Record<string, string> {
  const vars: Record<string, string> = {}
  const hPal = home ? paletteFor(home) : undefined
  const aPal = away ? paletteFor(away) : undefined
  const resolved = hPal && aPal ? resolveFields(hPal, aPal) : undefined
  const sides = [
    ['home', hPal, resolved?.home],
    ['away', aPal, resolved?.away],
  ] as const
  for (const [side, pal, fields] of sides) {
    if (!pal) continue
    const [field, cap] = fields ?? [pal[0], pal[1]]
    vars[`--${side}-1`] = field
    vars[`--${side}-2`] = cap
    vars[`--${side}-glow`] = glowColor(field)
    vars[`--${side}-deep`] = deepTone(pal, field)
  }
  return vars
}

/**
 * The tone a side falls into toward the bottom of the surface. A curated deep
 * only applies while the team still leads with its curated lead — if the
 * collision rule moved it to another colour, the curated deep was tuned for
 * the wrong hue, so we derive a darkened version of the resolved field
 * instead (Spain-gone-gold deepens into dark gold, not into dark red).
 */
function deepTone(
  palette: readonly [string, string] | readonly [string, string, string],
  resolvedField: string,
): string {
  if (palette.length === 3 && resolvedField === palette[0]) return palette[2]
  return `color-mix(in oklab, ${resolvedField} 62%, #05080d)`
}

/**
 * Whitened version of a field color for the "stage light" radial that sits
 * behind that team's flag disc. Emitted here rather than as a nested
 * color-mix in the CSS because the CSS fallback for an unknown side must be
 * fully transparent — mixing white into a transparent fallback would leave a
 * ghost glow on locked knockout cards.
 */
function glowColor(hex: string): string {
  return `color-mix(in srgb, ${hex} 78%, #fff 22%)`
}
