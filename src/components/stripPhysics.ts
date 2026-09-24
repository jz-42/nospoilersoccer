/**
 * The physics behind the day strip's own motion (see DaySwitcher in Rail.tsx).
 *
 * Positions are scroll offsets in px, velocities px/ms, times ms. Everything
 * here is pure so the feel can be tested without a browser.
 */

/**
 * Settling spring: critically damped, so it arrives without wobbling past the
 * day. 0.42s is the response Apple's own "smooth" springs sit near.
 */
export const SPRING_RESPONSE_MS = 420
export const SPRING_OMEGA = (2 * Math.PI) / SPRING_RESPONSE_MS

/**
 * How far a mouse flick carries, as a multiple of its speed: the same distance
 * the carousel's original momentum (0.92 per frame) coasted, so a flick lands
 * where it always did — just in one continuous motion.
 */
export const FLICK_PROJECTION_MS = 200

export interface SpringState {
  x: number
  v: number
}

/**
 * Advance a critically damped spring toward `target` by `dt`. Solved in
 * closed form, so a long frame lands exactly where the curve says rather than
 * overshooting the way a numeric step would.
 */
export function stepSpring(
  { x, v }: SpringState,
  target: number,
  omega: number,
  dt: number,
): SpringState {
  const d0 = x - target
  const c = v + omega * d0
  const decay = Math.exp(-omega * dt)
  return {
    x: target + (d0 + c * dt) * decay,
    v: (v - omega * c * dt) * decay,
  }
}

/**
 * The stiffness to settle with, given how fast the strip is already moving.
 *
 * Launched at the target faster than the default spring would move there on
 * its own, a critically damped spring sails past and comes back. Stiffening
 * to exactly `speed / distance` instead turns it into a pure exponential
 * glide that uses up the flick's speed and stops dead on the day, which is
 * how a flicked page on an iPhone comes to rest.
 */
export function settleOmega(x: number, v: number, target: number): number {
  const d = target - x
  if (Math.abs(d) < 0.5 || Math.sign(v) !== Math.sign(d)) return SPRING_OMEGA
  return Math.max(SPRING_OMEGA, Math.abs(v) / Math.abs(d))
}

/**
 * Past the first or last day the strip gives, but less and less the further
 * you pull: Apple's rubber-band curve, `(1 - 1 / (x * c / d + 1)) * d`.
 */
export function rubberBand(overshoot: number, dimension: number, c = 0.55): number {
  if (overshoot === 0 || dimension <= 0) return 0
  const x = Math.abs(overshoot)
  return Math.sign(overshoot) * (1 - 1 / ((x * c) / dimension + 1)) * dimension
}

/**
 * Which day a release at `pos` with velocity `v` should settle on: the one
 * nearest to where the flick would have coasted. `stops` is the scroll offset
 * that centres each day.
 */
export function pickFlickStop(stops: number[], pos: number, v: number): number {
  if (stops.length === 0) return 0
  const projected = pos + v * FLICK_PROJECTION_MS
  let best = 0
  for (let i = 1; i < stops.length; i++) {
    if (Math.abs(stops[i] - projected) < Math.abs(stops[best] - projected)) best = i
  }
  return best
}
