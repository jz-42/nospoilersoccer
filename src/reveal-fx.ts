import { flushSync } from 'react-dom'

/**
 * Lab look `revealFx`: what a tap on Reveal Result does as the score rolls
 * in. `reveal` is the real reveal; each effect calls it once. Nothing flies
 * off: the button thaws where it is, then turns into Hide Result, carried
 * along with the sheet as it grows.
 *
 * - 'thaw': the frost clears from the finger, leaving the words on the
 *   glass underneath, and that glass becomes Hide Result.
 * - 'kits': under the frost are the two kits, lit for a moment, then
 *   cooling to the glass.
 * - 'winner': under the frost is the winner's colour, or both kits in a
 *   draw.
 *
 * Lab look `thawClear`: how the frost clears.
 *
 * - 'grains': the wave sheds fine grains that settle where they were.
 * - 'edge': no loose grains; the frost is grainy only along its melting
 *   edge, so the texture goes with it.
 * - 'mist': a wide, soft edge, like breath clearing off a window.
 * - 'rim': a crisp edge that catches the light, the lip of Liquid Glass.
 *
 * Every effect ends in a glide: rather than jump to the revealed layout, the
 * sheet grows to its new height and the videos slide down to make room.
 */
export type RevealFx = 'none' | 'thaw' | 'kits' | 'winner'
export type ThawClear = 'grains' | 'edge' | 'mist' | 'rim'
/** Who won the match being revealed, held in memory only, never in the page. */
export type Winner = 'home' | 'away' | 'draw'

type Point = { x: number; y: number }

export function playRevealFx(
  fx: RevealFx,
  button: HTMLElement,
  point: Point,
  reveal: () => void,
  { clear = 'grains', winner = null }: { clear?: ThawClear; winner?: Winner | null } = {},
) {
  if (fx === 'none' || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    reveal()
    return
  }
  // Only the sheet's own button has a Hide Result to become. Anywhere else
  // (the full-time pill in the player) the button just clears away.
  if (button.classList.contains('modal-pre-reveal-cta')) thaw(button, point, reveal, fx, clear, winner)
  else clearAway(button, point, () => glide(button, reveal), clear, true)
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

const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2)

type Grain = { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number; colour: string; glint: boolean }

/**
 * The surface of `el` clears in a soft wave from `point`, and where the wave
 * passes the surface stays behind for a moment as fine grains, which barely
 * drift, dim and are gone: sand settling, not dust blown off. `words`: the
 * label comes apart too, in its own ink. `done` runs as the wave finishes.
 */
function sift(
  el: HTMLElement,
  point: Point,
  done: () => void,
  { words = true, colours }: { words?: boolean; colours?: [string, string] } = {},
): number {
  const rect = el.getBoundingClientRect()
  const style = getComputedStyle(el)
  const [left, right] = colours ?? [
    paintable(style.getPropertyValue('--dust-a').trim(), style.backgroundColor),
    paintable(style.getPropertyValue('--dust-b').trim(), style.backgroundColor),
  ]
  const ink = style.color
  const label = words ? (el.querySelector('.reveal-btn-label')?.getBoundingClientRect() ?? null) : null
  const corner = Math.min(parseFloat(style.borderTopLeftRadius) || 0, rect.height / 2)
  // Chrome won't cut the wave through a backdrop-filter in a scroller, so
  // there the glass is swapped for a flat painting of itself (see is-frost).
  if (style.backdropFilter !== 'none' && inScroller(el)) el.dataset.baked = ''

  const px = point.x - rect.left
  const py = point.y - rect.top
  const reach = reachOf(rect, point)
  const feather = 26
  const duration = Math.min(620, 380 + reach * 0.7)

  const pad = 24
  const w = rect.width + pad * 2
  const h = rect.height + pad * 2
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const canvas = document.createElement('canvas')
  canvas.className = 'reveal-grains'
  canvas.width = Math.ceil(w * dpr)
  canvas.height = Math.ceil(h * dpr)
  Object.assign(canvas.style, {
    left: `${rect.left - pad}px`,
    top: `${rect.top - pad}px`,
    width: `${w}px`,
    height: `${h}px`,
  })
  document.body.append(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    canvas.remove()
    done()
    return 0
  }
  ctx.scale(dpr, dpr)

  // Inside the rounded outline, in the element's own coordinates.
  const inside = (x: number, y: number) => {
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return false
    const cx = Math.min(Math.max(x, corner), rect.width - corner)
    const cy = Math.min(Math.max(y, corner), rect.height - corner)
    return (x - cx) ** 2 + (y - cy) ** 2 <= corner ** 2
  }
  const onLabel = (x: number, y: number) =>
    label !== null &&
    x + rect.left > label.left &&
    x + rect.left < label.right &&
    y + rect.top > label.top + label.height * 0.18 &&
    y + rect.top < label.bottom - label.height * 0.12

  const grains: Grain[] = []
  const density = 0.14
  let swept = 0
  let finished = false
  const start = performance.now()
  let last = start

  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    if (!finished) {
      const t = Math.min(1, (now - start) / duration)
      const r = (reach + feather) * easeInOut(t)
      const mask = `radial-gradient(circle at ${px}px ${py}px, transparent ${Math.max(0, r - feather)}px, #000 ${r}px)`
      el.style.setProperty('-webkit-mask-image', mask)
      el.style.setProperty('mask-image', mask)
      // Grains where the wave's soft edge passed this frame, so they sit
      // where the surface was, not ahead of it.
      const edge = Math.max(0, r - feather / 2)
      const n = Math.round(Math.PI * (edge * edge - swept * swept) * density)
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        const d = Math.sqrt(swept * swept + Math.random() * (edge * edge - swept * swept))
        const x = px + Math.cos(a) * d
        const y = py + Math.sin(a) * d
        if (!inside(x, y)) continue
        const text = onLabel(x, y) && Math.random() < 0.5
        const glint = !text && Math.random() < 0.08
        grains.push({
          x,
          y,
          // Barely moving: a breath away from the finger, a little lift.
          vx: Math.cos(a) * (2 + Math.random() * 6) + (Math.random() - 0.5) * 4,
          vy: Math.sin(a) * (2 + Math.random() * 4) - 5 - Math.random() * 9,
          age: 0,
          life: glint ? 0.5 + Math.random() * 0.4 : 0.3 + Math.random() * 0.5,
          size: glint ? 1.3 + Math.random() * 0.6 : 0.6 + Math.random() * 0.8,
          colour: text ? ink : glint ? '#fff' : Math.random() < x / rect.width ? right : left,
          glint,
        })
      }
      swept = edge
      if (t >= 1) {
        finished = true
        done()
        // The sheet moves under the grains as it glides, so they go quickly.
        canvas.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, easing: 'ease-in', fill: 'forwards' })
      }
    }

    ctx.clearRect(0, 0, w, h)
    for (let i = grains.length - 1; i >= 0; i--) {
      const g = grains[i]
      g.age += dt
      if (g.age >= g.life) {
        grains.splice(i, 1)
        continue
      }
      g.x += g.vx * dt
      g.y += g.vy * dt
      const k = g.age / g.life
      // Grains dim as they go; the odd bright one catches the light once.
      ctx.globalAlpha = g.glint ? Math.sin(Math.PI * k) * 0.95 : 0.85 * (1 - k) ** 1.4
      ctx.fillStyle = g.colour
      const s = g.size * (1 - k * 0.5)
      ctx.fillRect(g.x + pad - s / 2, g.y + pad - s / 2, s, s)
    }
    if (!finished || grains.length) requestAnimationFrame(frame)
    else canvas.remove()
  }
  requestAnimationFrame(frame)
  return duration
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
 * 'edge', 'mist' and 'rim': the surface of `el` clears in one wave from
 * `point`, and nothing is left behind it: when the wave is done, so is
 * everything it drew, before anything moves. Returns how long it takes.
 */
function melt(el: HTMLElement, point: Point, done: () => void, mode: 'edge' | 'mist' | 'rim'): number {
  const rect = el.getBoundingClientRect()
  const style = getComputedStyle(el)
  const corner = Math.min(parseFloat(style.borderTopLeftRadius) || 0, rect.height / 2)
  if (style.backdropFilter !== 'none' && inScroller(el)) el.dataset.baked = ''
  const px = point.x - rect.left
  const py = point.y - rect.top
  const reach = reachOf(rect, point)
  // How wide the thawing edge is: sugar needs room to show, mist is wide.
  const band = mode === 'mist' ? Math.max(56, reach * 0.6) : mode === 'edge' ? 36 : 16
  const duration = Math.min(400, Math.max(300, 250 + reach * 0.45))
  const at = `circle at ${px}px ${py}px`
  const grain = mode === 'edge' && CSS.supports('mask-composite', 'intersect') ? grainTile() : ''
  if (grain) {
    // Solid frost, then grain over a soft ramp, then clear: the grain lives
    // only in the edge, and goes as it does.
    el.style.setProperty('mask-size', `auto, ${GRAIN_TILE}px ${GRAIN_TILE}px, auto`)
    el.style.setProperty('mask-repeat', 'no-repeat, repeat, no-repeat')
    el.style.setProperty('mask-composite', 'add, intersect, add')
  }
  const cut = (r: number) => {
    const a = r - band
    let mask = `radial-gradient(${at}, transparent ${a}px, #000 ${r}px)`
    if (grain) {
      const k = r - band * 0.45
      mask = `radial-gradient(${at}, transparent ${k}px, #000 ${r}px), url(${grain}), radial-gradient(${at}, transparent ${a}px, #000 ${k}px)`
    } else if (mode === 'mist') {
      // A smoothstep, so the mist has no line at either end.
      const f = (x: number) => `${a + band * x}px`
      mask = `radial-gradient(${at}, transparent ${a}px, rgb(0 0 0 / 0.16) ${f(0.25)}, rgb(0 0 0 / 0.5) ${f(0.5)}, rgb(0 0 0 / 0.84) ${f(0.75)}, #000 ${r}px)`
    }
    el.style.setProperty('-webkit-mask-image', mask)
    el.style.setProperty('mask-image', mask)
  }

  // 'rim': the thawed edge catches the light, brightest along the top.
  let rim: CanvasRenderingContext2D | null = null
  let canvas: HTMLCanvasElement | null = null
  if (mode === 'rim') {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas = document.createElement('canvas')
    canvas.className = 'reveal-grains'
    canvas.width = Math.ceil(rect.width * dpr)
    canvas.height = Math.ceil(rect.height * dpr)
    Object.assign(canvas.style, box(rect))
    document.body.append(canvas)
    rim = canvas.getContext('2d')
    rim?.scale(dpr, dpr)
  }
  const light = (r: number, t: number) => {
    if (!rim) return
    const { width: w, height: h } = rect
    rim.clearRect(0, 0, w, h)
    const ring = r - band * 0.9
    if (ring <= 1) return
    const a = (1 - t) ** 0.6
    rim.save()
    rim.beginPath()
    rim.roundRect(0.5, 0.5, w - 1, h - 1, Math.max(0, corner - 0.5))
    rim.clip()
    const g = rim.createRadialGradient(px, py, Math.max(0, ring - 7), px, py, ring + 1.5)
    g.addColorStop(0, 'rgb(255 255 255 / 0)')
    g.addColorStop(0.72, `rgb(255 255 255 / ${0.2 * a})`)
    g.addColorStop(0.9, `rgb(255 255 255 / ${0.9 * a})`)
    g.addColorStop(1, 'rgb(255 255 255 / 0)')
    rim.fillStyle = g
    rim.fillRect(0, 0, w, h)
    rim.globalCompositeOperation = 'destination-in'
    const top = rim.createLinearGradient(0, 0, 0, h)
    top.addColorStop(0, '#000')
    top.addColorStop(1, 'rgb(0 0 0 / 0.35)')
    rim.fillStyle = top
    rim.fillRect(0, 0, w, h)
    rim.restore()
  }

  // Already thinning under the finger on the first frame.
  const r0 = band * 0.5
  cut(r0)
  const start = performance.now()
  const frame = (now: number) => {
    const t = Math.min(1, (now - start) / duration)
    const r = r0 + (reach + band - r0) * easeWave(t)
    cut(r)
    light(r, t)
    if (t < 1) {
      requestAnimationFrame(frame)
      return
    }
    canvas?.remove()
    done()
  }
  requestAnimationFrame(frame)
  return duration
}

/** Clears `el` from `point` the way `thawClear` says, then `done`. */
function clearAway(el: HTMLElement, point: Point, done: () => void, clear: ThawClear, words: boolean) {
  return clear === 'grains' ? sift(el, point, done, { words }) : melt(el, point, done, clear)
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
function thaw(
  button: HTMLElement,
  point: Point,
  reveal: () => void,
  fx: 'thaw' | 'kits' | 'winner',
  clear: ThawClear,
  winner: Winner | null,
) {
  const style = getComputedStyle(button)
  const sheet = button.closest<HTMLElement>('.modal')
  const { ghost, rect } = ghostOf(button)
  // Read now: the style is live, and empty once the reveal takes the button.
  const radius = Math.min(parseFloat(style.borderTopLeftRadius) || 0, rect.height / 2)
  const ink = style.color
  ghost.style.borderRadius = `${radius}px`
  const plate = document.createElement('div')
  plate.className = 'reveal-ghost-plate'
  const colours = fx === 'winner' ? winnerColours(sheet, winner) : null
  const kits = fx === 'kits' || colours ? document.createElement('div') : null
  if (kits && colours) {
    kits.className = winner === 'draw' ? 'reveal-ghost-kits is-winner is-draw' : 'reveal-ghost-kits is-winner'
    kits.style.setProperty('--win-a', colours[0])
    kits.style.setProperty('--win-b', colours[1])
  } else if (kits) {
    kits.className = 'reveal-ghost-kits'
    // The kits are custom properties of the sheet, not of the body.
    if (sheet) {
      const s = getComputedStyle(sheet)
      kits.style.setProperty('--home-1', s.getPropertyValue('--home-1'))
      kits.style.setProperty('--away-1', s.getPropertyValue('--away-1'))
    }
  }
  const lit = kits ? '#fff' : GLASS_INK
  // A melt takes the words with the frost, uncovering lit words beneath,
  // so they turn along the wave. The grains leave them and fade them.
  const melting = clear !== 'grains'
  const frost = button.cloneNode(melting) as HTMLElement
  frost.classList.remove('is-going')
  frost.classList.add('reveal-ghost-face')
  const from = document.createElement('span')
  from.className = 'reveal-ghost-label'
  from.textContent = button.textContent
  Object.assign(from.style, { font: style.font, letterSpacing: style.letterSpacing, color: melting ? lit : ink })
  if (melting) ghost.append(plate, ...(kits ? [kits] : []), from, frost)
  else ghost.append(plate, ...(kits ? [kits] : []), frost, from)
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

  // The frost clears from the finger first, and the words, left on the
  // glass (or the lit colours), go from ink to Hide Result's white.
  const ms = clearAway(frost, point, turn, clear, false)
  const thawMs = melting ? ms : 360
  const under = kits ?? plate
  // Under a melt the colour is there as soon as the finger is: a hole in the
  // frost never shows the grey glass.
  const [from0, glow] = melting ? [0.5, 0.2] : [0, 0.4]
  under.animate([{ opacity: from0, easing: 'ease-out' }, { opacity: 1, offset: glow }, { opacity: 1 }], {
    duration: thawMs,
    fill: 'both',
  })
  if (kits) plate.style.opacity = '1'
  if (!melting) from.animate([{ color: ink }, { color: lit }], { duration: thawMs, easing: 'ease-in-out', fill: 'forwards' })
}
