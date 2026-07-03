import type { TeamId } from './types'

/**
 * Per-team flag color palettes, used to tint the match modal background with a
 * soft two-team gradient (home color on the left, away on the right).
 *
 * Each entry is `[primary, secondary]`: two representative flag tones. They are
 * stored at full strength and intentionally a little muted — the CSS that
 * consumes them washes them over the dark panel at low alpha, so the result
 * reads as a tasteful tint, never a flag. Order matters: `primary` is the
 * edge-hugging field that carries a team's whole side (it decays to the dark
 * base before the midline, so the two teams' hues never mix into mud), and
 * `secondary` is the shallow accent cap at that side's top corner.
 *
 * Keep this exhaustive for every team across all tournaments — the smoke test
 * fails the build if a roster team is missing. A missing team simply renders a
 * neutral (untinted) modal, so the failure mode is graceful, not broken.
 */
export const teamColors: Record<TeamId, readonly [string, string]> = {
  ALG: ['#2a8f5e', '#1f6f49'],
  ARG: ['#7cb8e6', '#4f93cc'],
  AUS: ['#3a5da8', '#d8b54a'],
  AUT: ['#d6435a', '#c0c6d2'],
  BEL: ['#e0b53e', '#c43a3a'],
  BIH: ['#3f6fb5', '#e6c352'],
  BRA: ['#e6c84a', '#2f9e63'],
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
  GER: ['#d6454f', '#e0b53e'],
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
  NED: ['#e0843c', '#3a5fb0'],
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
  USA: ['#3a5fb0', '#d6454f'],
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
 * Pick which of a team's two tones fills its side (`field`) and which becomes
 * the top-corner accent (`cap`). Normally primary fills — but when the two
 * primaries collide, one team drops to its secondary, the way Apple Sports
 * moves a team to its alternate kit color when the home kits clash (their
 * Scotland-goes-yellow / Haiti-is-blue behavior). Among the swap options we
 * pick the one whose two field colors are farthest apart in OKLab, preferring
 * chromatic fields (Spain moves to gold rather than Austria to silver) and
 * penalizing swaps so identity survives when possible.
 */
function resolveFields(
  h: readonly [string, string],
  a: readonly [string, string],
): { home: readonly [string, string]; away: readonly [string, string] } {
  if (deltaE(h[0], a[0]) >= COLLISION_DELTA_E) return { home: h, away: a }
  const orderings = [0, 1] as const
  let best = { home: h, away: a }
  let bestScore = -Infinity
  for (const hi of orderings) {
    for (const ai of orderings) {
      const hField = h[hi]
      const aField = a[ai]
      const swaps = hi + ai
      const achromatic = (chroma(hField) < 0.04 ? 1 : 0) + (chroma(aField) < 0.04 ? 1 : 0)
      const score = deltaE(hField, aField) - 0.04 * swaps - 0.05 * achromatic
      if (score > bestScore) {
        bestScore = score
        best = {
          home: [h[hi], h[1 - hi]],
          away: [a[ai], a[1 - ai]],
        }
      }
    }
  }
  return best
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
export function matchTint(
  home: TeamId | null,
  away: TeamId | null,
): Record<string, string> {
  const vars: Record<string, string> = {}
  let h = home ? teamColors[home] : undefined
  let a = away ? teamColors[away] : undefined
  if (h && a) {
    const resolved = resolveFields(h, a)
    h = resolved.home
    a = resolved.away
  }
  if (h) {
    vars['--home-1'] = h[0]
    vars['--home-2'] = h[1]
    vars['--home-glow'] = glowColor(h[0])
  }
  if (a) {
    vars['--away-1'] = a[0]
    vars['--away-2'] = a[1]
    vars['--away-glow'] = glowColor(a[0])
  }
  return vars
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
