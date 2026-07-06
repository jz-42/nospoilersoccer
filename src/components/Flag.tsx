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
    query: '?url&no-inline',
    import: 'default',
  }) as Record<string, string>
} catch {
  // Node (tsx smoke tests): no bundler, no assets — emoji fallback.
}

const warmedFlagHrefs = new Set<string>()
const warmFlagImages: HTMLImageElement[] = []

function supportsFlagPrefetch() {
  if (typeof document === 'undefined') return false
  const link = document.createElement('link')
  return typeof link.relList?.supports === 'function' && link.relList.supports('prefetch')
}

function warmFlagUrls(urls: string[]) {
  if (typeof document === 'undefined') return
  const usePrefetch = supportsFlagPrefetch()
  const existing = new Set(
    Array.from(document.querySelectorAll<HTMLLinkElement>('link[data-flag-prefetch]')).map(
      (link) => link.href,
    ),
  )
  for (const url of urls) {
    const href = new URL(url, document.baseURI).href
    if (warmedFlagHrefs.has(href) || existing.has(href)) continue

    if (usePrefetch) {
      const link = document.createElement('link')
      link.rel = 'prefetch'
      link.as = 'image'
      link.href = url
      link.setAttribute('fetchpriority', 'low')
      link.setAttribute('data-flag-prefetch', '')
      document.head.appendChild(link)
      existing.add(href)
    } else if (typeof Image !== 'undefined') {
      const image = new Image()
      image.decoding = 'async'
      image.src = url
      warmFlagImages.push(image)
    }
    warmedFlagHrefs.add(href)
  }
}

if (typeof window !== 'undefined') {
  const warm = () => warmFlagUrls(Object.values(flagUrls))
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(warm, { timeout: 2500 })
  } else {
    setTimeout(warm, 1200)
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
      {url ? (
        <img src={url} alt="" draggable={false} decoding="sync" loading="eager" />
      ) : (
        team.flag
      )}
    </span>
  )
}
