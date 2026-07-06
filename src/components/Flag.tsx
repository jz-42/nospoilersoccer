/**
 * Rounded-rectangle flag badge — the professional football-product look
 * (FotMob/Sofascore/FIFA). Rectangles keep real flag proportions and detail
 * that circle-cropping mangled (Spain's crest in a porthole), and the shape
 * contrast means a circular play button between two flags can never read as
 * a row of three tokens.
 *
 * Assets are vendored flag-icons 4x3 SVGs (https://github.com/lipis/flag-icons,
 * MIT) in src/assets/flags, one per TeamId. The badge is sized in `em` (height
 * 1em, width 4:3) so it inherits whatever font-size the surrounding flag class
 * already sets — the same knob that sized the emoji.
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

// Warm every flag into the browser cache as soon as the bundle loads:
// otherwise the first paint of a day (or a swipe to a new one) shows dark
// placeholder boxes for a beat while each SVG fetches. 54 tiny files, one
// idle pass, cached for the session. Guarded so the Node smoke tests
// (no window, empty flagUrls) skip it.
if (typeof window !== 'undefined') {
  const warm = () => {
    for (const url of Object.values(flagUrls)) {
      const img = new Image()
      img.src = url
    }
  }
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(warm, { timeout: 1500 })
  } else {
    setTimeout(warm, 200)
  }
}

export function Flag({ team, className }: { team: Team; className?: string }) {
  const url = flagUrls[`../assets/flags/${team.id}.svg`]
  const cls = className ? `flag-badge ${className}` : 'flag-badge'
  // A team without a vendored asset falls back to its emoji, so a new roster
  // entry degrades gracefully instead of rendering a broken image. The wrapper
  // span carries the curvature shading (an img can't host ::after).
  return (
    <span className={cls}>
      {url ? <img src={url} alt="" draggable={false} decoding="sync" /> : team.flag}
    </span>
  )
}
