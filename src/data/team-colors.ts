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
 * at depth is part of the identity (USA red falling into navy, Wales's red
 * into flag green), which is what makes a side read as a country rather than
 * a color.
 *
 * The lead is the colour a nation plays in, which is usually its flag's but
 * not always: Japan play in Samurai Blue, Sweden and Australia in yellow,
 * England, Germany, Poland and Georgia in white, New Zealand are the All
 * Whites, Iraq are green. Paper white is never stored, since light lives in
 * the glow layer, not paint; a white side leads with the pale platinum
 * `WHITE`, the same one the white clubs use.
 *
 * Keep this exhaustive for every team across all tournaments — the smoke test
 * fails the build if a roster team is missing. A missing team simply renders a
 * neutral (untinted) modal, so the failure mode is graceful, not broken.
 */
const WHITE = '#c9cfda'

// Four reds instead of one. Real flag reds sit within ten degrees of hue of
// each other, too close to tell apart under the wash, so the ladder
// stretches them: poppy leans to orange (Croatia, Turkey), crimson to rose
// (Austria, Serbia), garnet sinks deep (Spain, Norway), scarlet holds the
// middle. Each nation takes its flag's own step, or the one beside it where
// that keeps two nations that play the same days apart. None goes below
// crimson's hue: a lighter red that leans any further toward rose reads as
// pink once the match sheet lights it.
const POPPY = '#ed521f'
const SCARLET = '#db332c'
const CRIMSON = '#bf1a39'
const GARNET = '#921f2b'

export const teamColors: Record<
  TeamId,
  readonly [string, string] | readonly [string, string, string]
> = {
  // Red falling into the black of the eagle.
  ALB: [SCARLET, '#c0c6d2', '#23262c'],
  ALG: ['#2a8f5e', '#1f6f49'],
  AND: ['#3a5fb0', '#e6c44a'],
  ARG: ['#7cb8e6', '#4f93cc'],
  ARM: [SCARLET, '#e0843c', '#2c4a8c'],
  AUS: ['#e3b945', '#1f7a48'],
  AUT: [CRIMSON, '#c0c6d2'],
  AZE: ['#3aa0d6', '#d6454f'],
  BEL: ['#e0b53e', '#c43a3a'],
  BIH: ['#3f6fb5', '#e6c352'],
  BLR: [CRIMSON, '#2a9e5e', '#1f6f49'],
  BRA: ['#e6c84a', '#2f9e63', '#1e6f47'],
  BUL: ['#2a9e5e', '#d6454f'],
  CAN: [POPPY, '#c0c6d2'],
  CIV: ['#e08a3c', '#2a9e6a'],
  CMR: ['#2a9e5e', '#d9b441'],
  COD: ['#4aa3d6', '#d6b441'],
  COL: ['#e6c44a', '#3a5fb0'],
  CPV: ['#3a5fa8', '#d94a52'],
  CRC: ['#3a5fb0', '#d6454f'],
  CRO: [POPPY, '#3a5fb0', '#243c74'],
  CUW: ['#2f57a0', '#e6c44a'],
  CYP: ['#3a6fc0', '#e0843c'],
  CZE: ['#3a5fa8', '#d6454f'],
  DEN: [SCARLET, '#c0c6d2'],
  ECU: ['#e6c44a', '#3a5fa8'],
  EGY: [CRIMSON, '#d4b04a', '#23262c'],
  // White shirt, navy shorts, the red of St George as the cap.
  ENG: [WHITE, SCARLET, '#233a70'],
  ESP: [GARNET, '#e6c44a'],
  EST: ['#3a7fc8', '#c0c6d2', '#23262c'],
  FIN: ['#2f5fb0', '#c0c6d2'],
  FRA: ['#3a5fb0', '#d6454f'],
  FRO: ['#3a6fc0', '#d6454f'],
  // White over red, top to bottom, like the flag.
  GEO: [WHITE, POPPY, '#9e2f33'],
  // White shirts, the flag's gold as the cap and its black at the foot.
  GER: [WHITE, '#e0b53e', '#23262c'],
  GHA: ['#2a9e5e', '#d6454f'],
  GIB: [POPPY, '#e6c44a'],
  GRE: ['#3a74c4', '#c0c6d2'],
  HAI: ['#3a5fb0', '#d6454f'],
  HUN: [CRIMSON, '#2a8f57', '#1f6f49'],
  IRL: ['#2a9e5e', '#e0843c'],
  IRN: ['#2a9e5e', '#d6454f'],
  IRQ: ['#2a8f57', SCARLET],
  ISL: ['#3a5fb0', '#d6454f'],
  ISR: ['#3a6fc0', '#c0c6d2'],
  ITA: ['#3a6fc0', '#2a9e5e', '#243c74'],
  JOR: ['#2a9e5e', '#d6454f'],
  JPN: ['#26418d', SCARLET],
  KAZ: ['#4ab0d6', '#e6c44a'],
  KOR: [CRIMSON, '#3a5fb0'],
  KOS: ['#3a5fb0', '#e6c44a'],
  KSA: ['#2a9e5e', '#1f7a48'],
  LIE: ['#2f4fa0', '#d6454f'],
  LTU: ['#e6c44a', '#2a8f57', '#8a2e34'],
  LUX: [POPPY, '#6fb3e0'],
  LVA: ['#9e2f3f', '#c0c6d2'],
  MAR: [GARNET, '#2a8f57', '#1f6f49'],
  MDA: ['#3a5fb0', '#e6c44a', '#8a2e34'],
  MEX: ['#2a9e5e', '#d6454f'],
  MKD: [SCARLET, '#e6c44a'],
  MLT: [CRIMSON, '#c0c6d2'],
  MNE: [CRIMSON, '#d9b441'],
  NED: ['#e0843c', '#3a5fb0', '#243c74'],
  NIR: ['#2a9e5e', '#c0c6d2'],
  NOR: [GARNET, '#3a5fb0', '#243c74'],
  NZL: [WHITE, '#23262c'],
  PAN: [SCARLET, '#3a5fb0'],
  PAR: [SCARLET, '#3a5fb0', '#243c74'],
  POL: [WHITE, CRIMSON, '#a52a41'],
  POR: ['#2a8f57', '#d6454f'],
  QAT: ['#8a2e44', '#6e2236'],
  ROU: ['#e6c44a', '#3a5fb0'],
  RSA: ['#e6c44a', '#2a8f57'],
  SCO: ['#3a6fc0', '#2f5aa0'],
  SEN: ['#2a9e5e', '#e6c44a'],
  SMR: ['#6fb3e0', '#c0c6d2'],
  SRB: [CRIMSON, '#3a5fa8', '#2c4a8c'],
  SUI: [SCARLET, '#c0c6d2'],
  SVK: ['#3a5fb0', '#d6454f'],
  SVN: ['#2f9e6a', '#3a6fc0'],
  SWE: ['#eac25a', '#2f63b8'],
  TUN: [SCARLET, '#c0c6d2'],
  TUR: [POPPY, '#c0c6d2'],
  UKR: ['#e6c44a', '#3a6fc0'],
  URU: ['#5a9fd6', '#e6c44a'],
  // Red-led with navy at depth (plus the white of the glow layer): the
  // red-white-blue read, not "generic blue team".
  USA: ['#c9504c', '#3a5fb0', '#2c4a8c'],
  UZB: ['#3a8fd0', '#2a9e5e'],
  WAL: [SCARLET, '#2a8f57', '#1f6f49'],
}

/**
 * Perceptual color math (OKLab, and its polar form OKLCh) for the clash rule
 * below. Hex parsing is safe here because every input comes from the curated
 * palettes.
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

function oklch(hex: string): { L: number; C: number; h: number } {
  const { L, a, b } = hexToOklab(hex)
  return { L, C: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 }
}

const CHROMATIC = 0.05

/**
 * Whether two fields read as two colours: ≥ 1 does, below 1 is a clash. What
 * survives the wash over the dark panel is hue — a maroon beside a red reads
 * as one red with a shadow, however far apart their lightness — so chromatic
 * fields need 40° of hue between them, or a big step in lightness (sky
 * against navy). A colourless field (white, graphite) is judged on lightness
 * alone against another colourless one, and against a colour it stands apart
 * unless that colour is pale and washed out (City's sky against white).
 */
export function separation(x: string, y: string): number {
  const p = oklch(x)
  const q = oklch(y)
  const light = Math.abs(p.L - q.L) / 0.2
  const pc = p.C >= CHROMATIC
  const qc = q.C >= CHROMATIC
  if (pc && qc) {
    const gap = Math.abs(p.h - q.h)
    return Math.max(Math.min(gap, 360 - gap) / 40, light)
  }
  if (!pc && !qc) return Math.abs(p.L - q.L) / 0.35
  return Math.max((pc ? p.C : q.C) / 0.1, light)
}

/**
 * Leads that would look wrong on anyone else's terms (Dutch orange, Italian
 * blue, Spurs white). The clash rule moves the other side first; a pinned
 * team only leaves its lead when both sides are pinned or nothing else
 * separates them.
 */
const pinned: ReadonlySet<TeamId> = new Set([
  'ARG', 'BRA', 'ESP', 'FRA', 'ITA', 'JPN', 'MEX', 'NED', 'SCO', 'SWE', 'URU',
  'arsenal', 'barcelona', 'chelsea', 'dortmund', 'inter', 'liverpool', 'manchester-city',
  'manchester-united', 'napoli', 'psg', 'real-madrid', 'tottenham', 'villarreal',
])

/**
 * Away kits: colours a team really wears but that are neither its lead nor
 * its cap. The clash rule may use them as a field; they're never shown as a
 * cap.
 */
const awayKits: Record<TeamId, readonly string[]> = {
  ALG: [WHITE],
  BEL: ['#23262c'],
  BRA: ['#2f5fb0'],
  FRA: [WHITE],
  GER: [WHITE],
  ITA: [WHITE],
  KSA: [WHITE],
  POR: [WHITE],
  liverpool: [WHITE],
  'manchester-united': [WHITE],
}

/**
 * The colour a crest is drawn in when it's one flat ink. A field that close to
 * it swallows the crest (Spurs' navy cockerel on navy), so the clash rule
 * never picks it.
 */
const crestInk: Record<TeamId, string> = {
  tottenham: '#1e2a52',
}

/** A near-black field is a hole in the dark panel; it plays as graphite. */
const GRAPHITE = '#2e333c'

function asField(hex: string): string {
  const c = oklch(hex)
  return c.C < CHROMATIC && c.L < 0.3 ? GRAPHITE : hex
}

type Option = { field: string; cap: string; cost: number }

/**
 * Every colour a side may wear, with what it costs the team's identity: the
 * lead is free, an away kit costs least (it's what the team really changes
 * into), then the cap, then the deep tone. Colourless fields cost extra, so a
 * real colour wins where one works (Italy green against France before Italy
 * white): white is the fallback, graphite the last resort, since under the
 * wash it reads as half a sheet left empty. A pinned team pays heavily to
 * leave its lead, and a field in the crest's own ink is never offered.
 */
function options(id: TeamId, pal: readonly string[]): Option[] {
  const out: Option[] = []
  const pin = pinned.has(id) ? 0.8 : 0
  const ink = crestInk[id]
  const add = (hex: string, cost: number, cap: string) => {
    if (ink && separation(hex, ink) < 1) return
    const c = oklch(hex)
    const neutral = c.C < CHROMATIC ? (c.L < 0.5 ? 0.35 : 0.15) : 0
    out.push({ field: asField(hex), cap, cost: cost === 0 ? 0 : cost + neutral + pin })
  }
  add(pal[0], 0, pal[1])
  add(pal[1], 0.35, pal[0])
  if (pal[2]) add(pal[2], 0.45, pal[0])
  for (const hex of awayKits[id] ?? []) add(hex, 0.25, pal[0])
  return out
}

/** Moving the home side costs a little extra: the away team changes kit. */
const HOME_MOVE = 0.15

/**
 * Pick which of a team's tones fills its side (`field`) and which becomes the
 * top-corner cap. Normally the lead fills, but when the two fields would read
 * as one colour, a side moves to another colour it really wears, the way
 * Apple Sports moves a team to its alternate kit when the home kits clash.
 * Every combination is scored, and the cheapest pair that reads as two
 * colours wins; where none does (two white clubs), the clearest pair does.
 */
function resolveFields(
  home: TeamId,
  hPal: readonly string[],
  away: TeamId,
  aPal: readonly string[],
): { home: [string, string]; away: [string, string] } {
  const hs = options(home, hPal)
  const as = options(away, aPal)
  let best: { h: Option; a: Option; score: number } | undefined
  let fallback: { h: Option; a: Option; score: number } | undefined
  for (const h of hs) {
    for (const a of as) {
      const cost = h.cost + (h.cost > 0 ? HOME_MOVE : 0) + a.cost
      const sep = separation(h.field, a.field)
      // Cheapest pair that reads as two colours; ties go to the clearer one.
      const score = -cost + Math.min(sep, 3) * 0.001
      if (sep >= 1 && (!best || score > best.score)) best = { h, a, score }
      const loose = sep - cost * 0.3
      if (!fallback || loose > fallback.score) fallback = { h, a, score: loose }
    }
  }
  const pick = best ?? fallback!
  return { home: [pick.h.field, pick.h.cap], away: [pick.a.field, pick.a.cap] }
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
 * When both teams are known, their field colors go through the clash rule
 * above so a matchup never reads as one undifferentiated color.
 */
export function matchTint(home: TeamId | null, away: TeamId | null): Record<string, string> {
  const vars: Record<string, string> = {}
  const hPal = home ? paletteFor(home) : undefined
  const aPal = away ? paletteFor(away) : undefined
  const resolved = hPal && aPal ? resolveFields(home!, hPal, away!, aPal) : undefined
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
 * clash rule moved it to another colour, the curated deep was tuned for the
 * wrong hue, so we derive a darkened version of the resolved field instead
 * (England-gone-red deepens into dark red, not into the navy of its shorts).
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
