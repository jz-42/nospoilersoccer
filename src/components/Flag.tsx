/**
 * Circular flag badge — the Apple Sports look. Every matchup composes from
 * uniform discs instead of platform emoji (which vary in shape and size per
 * team and per OS).
 *
 * Assets are vendored circle-flags SVGs (https://github.com/HatScripts/circle-flags,
 * MIT) in src/assets/flags, one per TeamId, ~4KB each. The badge is sized in
 * `em` so it inherits whatever font-size the surrounding flag class already
 * sets — the same knob that sized the emoji.
 */
import type { Team } from '../data/types'

// import.meta.glob is Vite-only; the component smoke tests run this file under
// plain Node (tsx), where the call throws — there the map stays empty and
// every team takes the emoji fallback below. (A `typeof` guard doesn't work:
// Vite rewrites the glob call itself but leaves `typeof import.meta.glob`
// undefined at runtime.)
let flagUrls: Record<string, string> = {}
try {
  flagUrls = import.meta.glob('../assets/flags/*.svg', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Record<string, string>
} catch {
  // Node (tsx smoke tests): no bundler, no assets — emoji fallback.
}

export function Flag({ team, className }: { team: Team; className?: string }) {
  const url = flagUrls[`../assets/flags/${team.id}.svg`]
  const cls = className ? `flag-badge ${className}` : 'flag-badge'
  // A team without a vendored asset falls back to its emoji, so a new roster
  // entry degrades gracefully instead of rendering a broken image. The wrapper
  // span carries the curvature shading (an img can't host ::after).
  return (
    <span className={cls}>
      {url ? <img src={url} alt="" draggable={false} /> : team.flag}
    </span>
  )
}
