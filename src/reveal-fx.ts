import { flushSync } from 'react-dom'

/**
 * What a tap on Reveal Result does as the score rolls in. `reveal` is the
 * real reveal, called once. Nothing flies off: the frost clears from the
 * finger in one wave, grainy only along its melting edge, uncovering the
 * winner's colour (both sides' in a draw) with the words lit on it. Then the
 * button turns into Hide Result, carried along with the sheet as it grows:
 * rather than jump to the revealed layout, the sheet grows to its new height
 * and the videos slide down to make room.
 */
/** Who won the match being revealed, held in memory only, never in the page. */
export type Winner = 'home' | 'away' | 'draw'

type Point = { x: number; y: number }

export function playRevealFx(button: HTMLElement, point: Point, reveal: () => void, winner: Winner | null = null) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    reveal()
    return
  }
  // Only the sheet's own button has a Hide Result to become. Anywhere else
  // (the full-time pill in the player) the button just clears away.
  if (button.classList.contains('modal-pre-reveal-cta')) thaw(button, point, reveal, winner)
  else melt(button, point, () => {
    try {
      glide(button, reveal)
    } finally {
      for (const property of ['mask-image', '-webkit-mask-image', 'mask-size', 'mask-repeat', 'mask-composite']) {
        button.style.removeProperty(property)
      }
      delete button.dataset.baked
    }
  })
}

const SPRING = 'cubic-bezier(0.32, 0.72, 0, 1)'
const GLIDE_MS = 520
/** Hide Result's glass and ink (App.css .modal-hide-result), for a thaw to clear to. */
const GLASS_INK = 'rgba(238, 243, 250, 0.88)'

/** The spring above, for motion driven frame by frame. */
const spring = (() => {
  const at = (s: number, a: number, b: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3
  return (t: number) => {
    let lo = 0
    let hi = 1
    let s = t
    for (let i = 0; i < 24; i++) {
      const x = at(s, 0.32, 0)
      if (Math.abs(x - t) < 1e-4) break
      if (x < t) lo = s
      else hi = s
      s = (lo + hi) / 2
    }
    return at(s, 0.72, 1)
  }
})()

/**
 * Commits the reveal, then animates the sheet from where everything was to
 * where it is now: the sheet's height, the videos, and Hide Result, which
 * comes up out of Reveal Result's place, wherever the reveal began. `landed`
 * runs in between, while the layout is still the final one, for an effect
 * that has to aim at it.
 */
function glide(button: HTMLElement, reveal: () => void, landed?: () => void) {
  const sheet = button.closest<HTMLElement>('.modal')
  if (!sheet) {
    flushSync(reveal)
    landed?.()
    return
  }
  const blocks = '.player-block, .modal-video-placeholder'
  const before = sheet.getBoundingClientRect()
  const tops = [...sheet.querySelectorAll(blocks)].map((el) => el.getBoundingClientRect().top - before.top)
  const b = (sheet.querySelector('.modal-pre-reveal-cta') ?? button).getBoundingClientRect()
  const buttonMid = b.top + b.height / 2 - before.top

  flushSync(reveal)

  const after = sheet.getBoundingClientRect()
  const ease = { duration: GLIDE_MS, easing: SPRING }
  if (Math.abs(after.height - before.height) > 1) {
    sheet.animate(
      [
        { height: `${before.height}px`, overflow: 'hidden' },
        { height: `${after.height}px`, overflow: 'hidden' },
      ],
      ease,
    )
  }
  sheet.querySelectorAll(blocks).forEach((el, i) => {
    if (tops[i] === undefined) return
    const dy = tops[i] - (el.getBoundingClientRect().top - after.top)
    if (Math.abs(dy) > 1) el.animate([{ translate: `0 ${dy}px` }, { translate: '0 0' }], ease)
  })
  const hide = sheet.querySelector('.modal-hide-result')
  if (hide) {
    const h = hide.getBoundingClientRect()
    const dy = buttonMid - (h.top + h.height / 2 - after.top)
    hide.animate(
      [
        { translate: `0 ${dy}px`, opacity: 0 },
        { translate: '0 0', opacity: 1 },
      ],
      ease,
    )
  }
  // Its animations are in place, so what it aims at is where it starts.
  landed?.()
}

const box = (r: DOMRect) => ({
  left: `${r.left}px`,
  top: `${r.top}px`,
  width: `${r.width}px`,
  height: `${r.height}px`,
})

/** A fixed box at `el`'s place, for it to go on in after it's gone. */
function ghostOf(el: HTMLElement) {
  const rect = el.getBoundingClientRect()
  const ghost = document.createElement('div')
  ghost.className = 'reveal-ghost'
  Object.assign(ghost.style, box(rect))
  document.body.append(ghost)
  return { ghost, rect }
}

/**
 * Carries a ghost along with `anchor` as the sheet glides and scrolls, from
 * where it started to the anchor's middle (`settle`), or at the same
 * distance from it. `morph` changes its size and corners into the
 * anchor's on the way.
 */
function ride(
  ghost: HTMLElement,
  from: DOMRect,
  anchor: Element | null,
  { settle, morph, ms, corners }: { settle: boolean; morph: boolean; ms: number; corners?: [number, number] },
) {
  return new Promise<void>((done) => {
    if (!anchor) {
      setTimeout(done, ms)
      return
    }
    const mid = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
    const a0 = mid(anchor.getBoundingClientRect())
    const f = mid(from)
    const off = { x: f.x - a0.x, y: f.y - a0.y }
    const start = performance.now()
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / ms)
      const e = spring(t)
      const r = anchor.getBoundingClientRect()
      const a = mid(r)
      const k = settle ? 1 - e : 1
      const w = morph ? from.width + (r.width - from.width) * e : from.width
      const h = morph ? from.height + (r.height - from.height) * e : from.height
      Object.assign(ghost.style, {
        left: `${a.x + off.x * k - w / 2}px`,
        top: `${a.y + off.y * k - h / 2}px`,
        width: `${w}px`,
        height: `${h}px`,
        borderRadius: corners ? `${corners[0] + (corners[1] - corners[0]) * e}px` : '',
      })
      if (t < 1) requestAnimationFrame(frame)
      else done()
    }
    requestAnimationFrame(frame)
  })
}

/** A colour a canvas can paint: custom properties can hold color-mix(). */
function paintable(colour: string, fallback: string) {
  const probe = document.createElement('i')
  probe.style.color = colour
  if (!probe.style.color) return fallback
  document.body.append(probe)
  const out = getComputedStyle(probe).color
  probe.remove()
  return out
}

/** Farthest a circle from `p` has to grow to cover `r`. */
function reachOf(r: DOMRect, p: Point) {
  const dx = Math.max(p.x - r.left, r.right - p.x)
  const dy = Math.max(p.y - r.top, r.bottom - p.y)
  return Math.hypot(dx, dy)
}

/** Whether something around `el` scrolls, as the phone sheet does. */
function inScroller(el: HTMLElement) {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const overflow = getComputedStyle(p).overflowY
    if (overflow === 'auto' || overflow === 'scroll') return true
  }
  return false
}

/** A gentle ease-out: under way from the first frame, with no slow tail. */
const easeWave = (t: number) => 1 - (1 - t) ** 2

const GRAIN_TILE = 48
let grainUrl = ''

/**
 * A tile of fine grain, one grain to a CSS pixel, as a mask image: made
 * once. The grains lean to clear or solid rather than grey, so the edge
 * breaks up like sugar, not like fog.
 */
function grainTile() {
  if (grainUrl) return grainUrl
  const dpr = Math.min(2, Math.round(window.devicePixelRatio || 1))
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = GRAIN_TILE * dpr
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const img = ctx.createImageData(canvas.width, canvas.height)
  for (let y = 0; y < GRAIN_TILE; y++) {
    for (let x = 0; x < GRAIN_TILE; x++) {
      const r = Math.random()
      const a = Math.round(255 * (r < 0.5 ? 2 * r * r : 1 - 2 * (1 - r) ** 2))
      for (let dy = 0; dy < dpr; dy++) {
        for (let dx = 0; dx < dpr; dx++) img.data[((y * dpr + dy) * canvas.width + x * dpr + dx) * 4 + 3] = a
      }
    }
  }
  ctx.putImageData(img, 0, 0)
  grainUrl = canvas.toDataURL()
  return grainUrl
}

/**
 * The surface of `el` clears in one wave from `point`, grainy only along its
 * melting edge, and nothing is left behind it: when the wave is done, so is
 * everything it drew, before anything moves. Returns how long it takes.
 */
function melt(el: HTMLElement, point: Point, done: () => void): number {
  const rect = el.getBoundingClientRect()
  // Chrome won't cut the wave through a backdrop-filter in a scroller, so
  // there the glass is swapped for a flat painting of itself (see is-frost).
  if (getComputedStyle(el).backdropFilter !== 'none' && inScroller(el)) el.dataset.baked = ''
  const px = point.x - rect.left
  const py = point.y - rect.top
  const reach = reachOf(rect, point)
  // How wide the thawing edge is: sugar needs room to show.
  const band = 36
  const duration = Math.min(400, Math.max(300, 250 + reach * 0.45))
  const at = `circle at ${px}px ${py}px`
  const grain = CSS.supports('mask-composite', 'intersect') ? grainTile() : ''
  if (grain) {
    // Solid frost, then grain over a soft ramp, then clear: the grain lives
    // only in the edge, and goes as it does.
    el.style.setProperty('mask-size', `auto, ${GRAIN_TILE}px ${GRAIN_TILE}px, auto`)
    el.style.setProperty('mask-repeat', 'no-repeat, repeat, no-repeat')
    el.style.setProperty('mask-composite', 'add, intersect, add')
  }
  const cut = (r: number) => {
    const a = r - band
    const k = r - band * 0.45
    const mask = grain
      ? `radial-gradient(${at}, transparent ${k}px, #000 ${r}px), url(${grain}), radial-gradient(${at}, transparent ${a}px, #000 ${k}px)`
      : `radial-gradient(${at}, transparent ${a}px, #000 ${r}px)`
    el.style.setProperty('-webkit-mask-image', mask)
    el.style.setProperty('mask-image', mask)
  }

  // Already thinning under the finger on the first frame.
  const r0 = band * 0.5
  cut(r0)
  const start = performance.now()
  const frame = (now: number) => {
    const t = Math.min(1, (now - start) / duration)
    cut(r0 + (reach + band - r0) * easeWave(t))
    if (t < 1) requestAnimationFrame(frame)
    else done()
  }
  requestAnimationFrame(frame)
  return duration
}

/** A colour as OKLCh (hue in degrees), or null if it isn't one. */
function oklch(colour: string): [number, number, number] | null {
  const m = paintable(colour, '').match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/)
  if (!m) return null
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const [r, g, b] = [m[1], m[2], m[3]].map((v) => lin(Number(v) / 255))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const mm = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * mm - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * mm + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * mm - 0.808675766 * s
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360]
}

/**
 * The colour one side's win is painted in, deep enough for white words: its
 * field colour, or, where that is too pale (Argentina's sky, Brazil's
 * yellow) or has no colour to it, its second colour. Held between mid and
 * deep, so the words read and it never goes to mud.
 */
function winColour(field: string, second: string) {
  const a = oklch(field)
  const b = second ? oklch(second) : null
  if (!a) return null
  const fits = (c: [number, number, number] | null) => c !== null && c[0] <= 0.72 && c[1] >= 0.04
  const hued = (c: [number, number, number] | null) => c !== null && c[1] >= 0.04
  const pick = fits(a) ? a : b && fits(b) ? b : hued(a) ? a : b && hued(b) ? b : b && b[0] < a[0] ? b : a
  const [L, C, H] = pick
  // A colourless side (black and white) goes to a deep glass, not grey.
  const lit = Math.min(0.6, Math.max(C < 0.04 ? 0.3 : 0.48, L))
  return `oklch(${lit.toFixed(3)} ${Math.min(0.2, C * 1.1).toFixed(3)} ${H.toFixed(1)})`
}

/** Under the frost in 'winner': [left, right], one colour for a win. */
function winnerColours(sheet: HTMLElement | null, winner: Winner | null): [string, string] | null {
  if (!sheet || !winner) return null
  const s = getComputedStyle(sheet)
  const side = (x: 'home' | 'away') =>
    winColour(s.getPropertyValue(`--${x}-1`).trim(), s.getPropertyValue(`--${x}-2`).trim())
  if (winner !== 'draw') {
    const c = side(winner)
    return c ? [c, c] : null
  }
  const home = side('home')
  const away = side('away')
  return home && away ? [home, away] : null
}

const BECOME_MS = 560

/**
 * The button turns into Hide Result, carried along with the sheet as it
 * glides. It's drawn as a ghost in layers — Hide Result's glass, what's
 * under the frost, the frost, and each label — so the frost can go while
 * the words stay, and one label can swap for the other.
 */
function thaw(button: HTMLElement, point: Point, reveal: () => void, winner: Winner | null) {
  const style = getComputedStyle(button)
  const sheet = button.closest<HTMLElement>('.modal')
  const { ghost, rect } = ghostOf(button)
  // Read now: the style is live, and empty once the reveal takes the button.
  const radius = Math.min(parseFloat(style.borderTopLeftRadius) || 0, rect.height / 2)
  ghost.style.borderRadius = `${radius}px`
  const plate = document.createElement('div')
  plate.className = 'reveal-ghost-plate'
  // Without the sides' colours, the frost clears to Hide Result's glass.
  const colours = winnerColours(sheet, winner)
  const kits = colours ? document.createElement('div') : null
  if (kits && colours) {
    kits.className = winner === 'draw' ? 'reveal-ghost-kits is-draw' : 'reveal-ghost-kits'
    kits.style.setProperty('--win-a', colours[0])
    kits.style.setProperty('--win-b', colours[1])
  }
  // The melt takes the words with the frost, uncovering lit words beneath,
  // so they turn along the wave.
  const frost = button.cloneNode(true) as HTMLElement
  frost.classList.remove('is-going')
  frost.classList.add('reveal-ghost-face')
  const from = document.createElement('span')
  from.className = 'reveal-ghost-label'
  from.textContent = button.textContent
  Object.assign(from.style, { font: style.font, letterSpacing: style.letterSpacing, color: kits ? '#fff' : GLASS_INK })
  ghost.append(plate, ...(kits ? [kits] : []), from, frost)
  button.style.visibility = 'hidden'

  const turn = () => {
    let hide: HTMLElement | null = null
    glide(button, reveal, () => {
      hide = document.querySelector<HTMLElement>('.modal .modal-hide-result')
    })
    if (!hide) {
      void ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, fill: 'forwards' }).finished.then(() => ghost.remove())
      return
    }
    const target: HTMLElement = hide
    const hs = getComputedStyle(target)
    const to = document.createElement('span')
    to.className = 'reveal-ghost-label'
    to.textContent = target.textContent
    Object.assign(to.style, {
      font: hs.font,
      letterSpacing: hs.letterSpacing,
      color: hs.color,
      textShadow: hs.textShadow,
    })
    ghost.append(to)
    target.style.visibility = 'hidden'
    const timing = { duration: BECOME_MS, fill: 'both' as const }
    kits?.animate([{ opacity: 1 }, { opacity: 0, offset: 0.7 }, { opacity: 0 }], timing)
    from.animate(
      [
        { opacity: 1, filter: 'blur(0)' },
        { opacity: 0, filter: 'blur(4px)', offset: 0.4 },
        { opacity: 0, filter: 'blur(4px)' },
      ],
      timing,
    )
    to.animate(
      [
        { opacity: 0, filter: 'blur(4px)' },
        { opacity: 0, filter: 'blur(4px)', offset: 0.3 },
        { opacity: 1, filter: 'blur(0)', offset: 0.8 },
        { opacity: 1, filter: 'blur(0)' },
      ],
      timing,
    )
    const corners: [number, number] = [radius, parseFloat(hs.borderTopLeftRadius) || 0]
    void ride(ghost, rect, target, { settle: true, morph: true, ms: BECOME_MS, corners }).then(() => {
      target.style.visibility = ''
      ghost.remove()
    })
  }

  // The frost clears from the finger first. The colour under it is there as
  // soon as the finger is, so a hole in the frost never shows grey glass.
  const ms = melt(frost, point, turn)
  const under = kits ?? plate
  under.animate([{ opacity: 0.5, easing: 'ease-out' }, { opacity: 1, offset: 0.2 }, { opacity: 1 }], {
    duration: ms,
    fill: 'both',
  })
  if (kits) plate.style.opacity = '1'
}
