import { flushSync } from 'react-dom'

/**
 * Opening a match pops its sheet up where it lands: it scales up from a
 * point toward the card you clicked, so it still seems to come from there,
 * while the page blurs and dims under it (the backdrop's own scrim-in). On a
 * phone it's the iOS sheet, up from the bottom edge. Nothing is morphed: the
 * card (a poster) and the sheet (a panel) aren't the same object, and any
 * morph between them leaves crests drifting or jumping.
 *
 * Closing plays on the live sheet, then removes it, starting from wherever
 * it is (part way through opening, or where a swipe left it): in place on a
 * desktop, down off the screen on a phone. The page comes back into focus
 * the way it went out, the blur shrinking to nothing as the dim lifts.
 *
 * With reduced motion it opens and closes at once.
 */

/** The card the click being handled landed on, for the open it causes. */
let pressed: DOMRect | null = null
/** The point the open sheet came from, for the close to return toward. */
let origin: { x: number; y: number } | null = null
/** Ends the close under way at once, if there is one. */
let closing: (() => void) | null = null
/** The last finger movement on the sheet, so a flick hands its speed on. */
let lastTouch: { y: number; t: number; v: number } | null = null

if (typeof window !== 'undefined') {
  // Capture, so this runs before the card's own onClick opens the sheet.
  window.addEventListener(
    'click',
    (e) => {
      const card = e.target instanceof Element ? e.target.closest('.preview-card') : null
      pressed = card?.getBoundingClientRect() ?? null
      if (pressed) setTimeout(() => (pressed = null))
    },
    true,
  )
  window.addEventListener(
    'touchmove',
    (e) => {
      if (!(e.target instanceof Element) || !e.target.closest('.modal:not(.dialog)')) return
      const y = e.touches[0].clientY
      const t = performance.now()
      const v = lastTouch && t > lastTouch.t ? (y - lastTouch.y) / (t - lastTouch.t) : 0
      lastTouch = { y, t, v: lastTouch ? 0.6 * v + 0.4 * lastTouch.v : v }
    },
    { passive: true, capture: true },
  )
}

const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const phone = () => matchMedia('(max-width: 760px)').matches
const sheet = () => document.querySelector<HTMLElement>('.modal:not(.dialog)')
const dialog = () => document.querySelector<HTMLElement>('.modal-backdrop:not(.is-leaving) > .modal.dialog')

const CALM = 'cubic-bezier(0.22, 1, 0.36, 1)'
const SLIDE = 'cubic-bezier(0.32, 0.72, 0, 1)'

/** Opens a sheet, popping up toward the card that was just clicked if there is one. */
export function openSheet(open: () => void) {
  const card = pressed
  pressed = null
  // A sheet still on its way out goes now, or its close would take this one with it.
  closing?.()
  flushSync(open)
  origin = card ? { x: card.left + card.width / 2, y: card.top + card.height / 2 } : null
  const el = sheet()
  if (!el || still()) return
  // The sheet's own entrance is replaced by this one.
  el.style.animation = 'none'
  if (phone()) {
    el.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { duration: 420, easing: SLIDE })
    return
  }
  const r = el.getBoundingClientRect()
  el.style.transformOrigin = origin ? `${origin.x - r.left}px ${origin.y - r.top}px` : 'center'
  el.animate([{ transform: 'scale(0.92)' }, { transform: 'scale(1)' }], { duration: 420, easing: CALM })
  el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: 'ease-out' })
}

/** Closes the sheet where it stands (down off the screen on a phone). */
export function closeSheet(close: () => void) {
  // Already on its way out (Escape pressed twice, or held down).
  if (closing) return
  const el = sheet()
  const backdrop = el?.closest<HTMLElement>('.modal-backdrop')
  if (!el || !backdrop || still()) {
    origin = null
    close()
    return
  }
  // Read before anything is cancelled: this is where the sheet is now.
  const cs = getComputedStyle(el)
  const at = cs.transform === 'none' ? (phone() ? 'translateY(0)' : 'scale(1)') : cs.transform
  const opacityAt = Number(cs.opacity)
  const scrim = getComputedStyle(backdrop, '::before')
  const scrimAt = {
    opacity: scrim.opacity,
    backdropFilter: scrim.backdropFilter,
    WebkitBackdropFilter: scrim.backdropFilter,
    backgroundColor: scrim.backgroundColor,
  }
  el.getAnimations().forEach((a) => a.cancel())
  // Holds the scrim where a swipe left it (see App.css) and lets clicks
  // through to the page.
  backdrop.setAttribute('data-leaving', '')

  let duration = phone() ? 300 : 220
  let slide = SLIDE
  if (phone()) {
    // A flick: carry the finger's speed into the slide.
    const flick = lastTouch && performance.now() - lastTouch.t < 100 && lastTouch.v > 0.3 ? lastTouch.v : 0
    if (flick) {
      const left = Math.max(1, el.offsetHeight - new DOMMatrix(at).m42)
      duration = Math.min(320, Math.max(140, (1.6 * left) / flick))
      slide = `cubic-bezier(0.25, ${Math.min(1, (0.25 * flick * duration) / left).toFixed(3)}, 0.45, 1)`
    }
  } else {
    const r = el.getBoundingClientRect()
    el.style.transformOrigin = origin ? `${origin.x - r.left}px ${origin.y - r.top}px` : 'center'
  }
  lastTouch = null
  const moves = phone()
    ? [el.animate([{ transform: at }, { transform: 'translateY(100%)' }], { duration, easing: slide, fill: 'forwards' })]
    : [
        el.animate([{ transform: at }, { transform: 'scale(0.95)' }], {
          duration,
          easing: 'cubic-bezier(0.3, 0.9, 0.3, 1)',
          fill: 'forwards',
        }),
        // Gone before the scrim clears, so the page is never seen sharp
        // through the frosted sheet.
        el.animate([{ opacity: opacityAt }, { opacity: 0 }], {
          duration: 120 * opacityAt,
          easing: 'cubic-bezier(0, 0, 0.4, 1)',
          fill: 'forwards',
        }),
      ]
  // The blur shrinks to nothing and the dim lifts. Fading the blurred layer
  // out instead cross-fades a soft copy of the page over a sharp one, so
  // every card edge doubles and seems to shiver.
  moves.push(
    backdrop.animate(
      [
        scrimAt,
        { opacity: scrimAt.opacity, backdropFilter: 'blur(0px)', WebkitBackdropFilter: 'blur(0px)', backgroundColor: 'transparent' },
      ],
      {
        duration: duration + 40,
        easing: phone() ? slide : 'cubic-bezier(0.4, 0, 0.2, 1)',
        fill: 'forwards',
        pseudoElement: '::before',
      },
    ),
  )
  const finish = () => {
    if (closing !== finish) return
    closing = null
    origin = null
    flushSync(close)
  }
  closing = finish
  Promise.all(moves.map((a) => a.finished)).then(finish, finish)
}

/**
 * Closes the open dialog where it stands, the way an iOS alert goes: the
 * answer takes effect at once (a reveal's ripple of scores starts under it)
 * while a copy of the dialog and its scrim fades out on top. The copy keeps
 * a live backdrop-filter, so the blur lifts with the dim instead of
 * snapping off.
 */
export function closeDialog(close: () => void) {
  const leaving = dialog()?.parentElement
  if (!leaving || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    close()
    return
  }
  const parent = leaving.parentElement
  const ghost = leaving.cloneNode(true) as HTMLElement
  ghost.classList.add('is-leaving')
  ghost.inert = true
  ghost.setAttribute('aria-hidden', 'true')
  ghost.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'))
  // The scrim's opacity may be part way through a swipe or its own entrance.
  const scrimFrom = Number(getComputedStyle(leaving, '::before').opacity)
  flushSync(close)
  ;(parent?.isConnected ? parent : document.body).append(ghost)
  const card = ghost.querySelector('.modal')
  const ease = { duration: 200, easing: 'cubic-bezier(0.3, 0.9, 0.3, 1)', fill: 'forwards' } as const
  // Not the ghost as a whole: an opacity there would cut the scrim's blur
  // off from the page behind.
  const fades = [
    ghost.animate([{ opacity: scrimFrom }, { opacity: 0 }], { ...ease, duration: 260, pseudoElement: '::before' }),
    card?.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(0.96)' }], ease),
  ]
  const done = () => ghost.remove()
  Promise.all(fades.map((a) => a?.finished)).then(done, done)
}
