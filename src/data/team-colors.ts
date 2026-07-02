import type { TeamId } from './types'

/**
 * Per-team flag color palettes, used to tint the match modal background with a
 * soft two-team gradient (home color on the left, away on the right).
 *
 * Each entry is `[primary, secondary]`: two representative flag tones. They are
 * stored at full strength and intentionally a little muted — the CSS that
 * consumes them washes them over the dark panel at low alpha, so the result
 * reads as a tasteful tint, never a flag. Order matters: `primary` anchors the
 * outer edge of a team's side, `secondary` fades toward the center seam.
 *
 * Keep this exhaustive for every team across all tournaments — the smoke test
 * fails the build if a roster team is missing. A missing team simply renders a
 * neutral (untinted) modal, so the failure mode is graceful, not broken.
 */
export const teamColors: Record<TeamId, readonly [string, string]> = {
  ALG: ['#2a8f5e', '#1f6f49'],
  ARG: ['#7cb8e6', '#4f93cc'],
  AUS: ['#3a5da8', '#d8b54a'],
  AUT: ['#d6435a', '#a82c41'],
  BEL: ['#e0b53e', '#c43a3a'],
  BIH: ['#3f6fb5', '#e6c352'],
  BRA: ['#e6c84a', '#2f9e63'],
  CAN: ['#e0544e', '#b23a37'],
  CIV: ['#e08a3c', '#2a9e6a'],
  CMR: ['#2a9e5e', '#d9b441'],
  COD: ['#4aa3d6', '#d6b441'],
  COL: ['#e6c44a', '#3a5fb0'],
  CPV: ['#3a5fa8', '#d94a52'],
  CRC: ['#3a5fb0', '#d6454f'],
  CRO: ['#d6454f', '#3a5fb0'],
  CUW: ['#2f57a0', '#e6c44a'],
  CZE: ['#3a5fa8', '#d6454f'],
  DEN: ['#d6454f', '#b23139'],
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
  SUI: ['#d6454f', '#b8313a'],
  SWE: ['#3a6fb5', '#e6c44a'],
  TUN: ['#d6454f', '#b8313a'],
  TUR: ['#d6454f', '#b8313a'],
  URU: ['#5a9fd6', '#e6c44a'],
  USA: ['#3a5fb0', '#d6454f'],
  UZB: ['#3a8fd0', '#2a9e5e'],
  WAL: ['#d6454f', '#2a8f57'],
}

/**
 * CSS custom properties that tint the match modal for a given matchup. Only the
 * sides whose team is known are set, so a not-yet-decided knockout slot leaves
 * that half of the modal neutral until it's revealed — keeping the color reveal
 * in lockstep with the spoiler-safe flag reveal. Returns an empty object when
 * neither team is known (or lacks a palette), yielding the plain dark modal.
 */
export function matchTint(
  home: TeamId | null,
  away: TeamId | null,
): Record<string, string> {
  const vars: Record<string, string> = {}
  const h = home ? teamColors[home] : undefined
  if (h) {
    vars['--home-1'] = h[0]
    vars['--home-2'] = h[1]
  }
  const a = away ? teamColors[away] : undefined
  if (a) {
    vars['--away-1'] = a[0]
    vars['--away-2'] = a[1]
  }
  return vars
}
