import { flushSync } from 'react-dom'

/**
 * Opening a match grows its card into the sheet, and closing shrinks the
 * sheet back into the card, the way an App Store Today card opens. A view
 * transition does the morph: the card's picture and then the sheet are both
 * named `match-sheet`, and the browser animates one box into the other
 * (App.css, "Grow from the card").
 *
 * The page behind has to move with it, and it's never captured: a snapshot
 * drops backdrop-filter, so the blur would snap on or off at the end.
 * Opening, the live backdrop's own scrim-in blurs and dims it in step with
 * the grow; closing, a live copy of the scrim stays behind and fades as the
 * sheet shrinks, so the blur lifts rather than snapping off.
 *
 * With no card to grow from (a bracket slot, a table row) the sheet opens as
 * it always has, and closes by dropping away. Without view transitions, or
 * with reduced motion, it opens and closes exactly as before.
 */

const NAME = 'match-sheet'

/** The card the click being handled landed on, for the open it causes. */
let pressed: HTMLElement | null = null
/** The picture the open sheet grew from, for the close to return to. */
let source: HTMLElement | null = null
let running: ViewTransition | null = null
/** The scrim a closing sheet leaves behind while it goes. */
let lingering: HTMLElement | null = null

if (typeof window !== 'undefined') {
  // Capture, so this runs before the card's own onClick opens the sheet.
  window.addEventListener(
    'click',
    (e) => {
      const card = e.target instanceof Element ? e.target.closest('.preview-card') : null
      pressed = card?.querySelector<HTMLElement>('.preview-media') ?? null
      if (pressed) setTimeout(() => (pressed = null))
    },
    true,
  )
}

const canMorph = () =>
  typeof document.startViewTransition === 'function' &&
  !matchMedia('(prefers-reduced-motion: reduce)').matches

const noop = () => {}
const sheet = () => document.querySelector<HTMLElement>('.modal:not(.dialog)')
const dialog = () => document.querySelector<HTMLElement>('.modal-backdrop:not(.is-leaving) > .modal.dialog')

/**
 * Reads the scrim off the backdrop about to be closed, and once it's gone
 * puts back a live copy that fades out over the close, blur and all.
 */
function leaveScrim(leaving: HTMLElement) {
  const backdrop = leaving.closest('.modal-backdrop')
  if (!backdrop) return () => {}
  // Read now: a computed style is live, and blank once the backdrop is gone.
  const cs = getComputedStyle(backdrop, '::before')
  const color = cs.backgroundColor
  const fx = cs.backdropFilter || cs.getPropertyValue('-webkit-backdrop-filter')
  const opacity = Number(cs.opacity)
  return () => {
    lingering?.remove()
    const scrim = document.createElement('div')
    scrim.className = 'morph-scrim'
    scrim.style.background = color
    scrim.style.setProperty('backdrop-filter', fx)
    scrim.style.setProperty('-webkit-backdrop-filter', fx)
    document.body.append(scrim)
    lingering = scrim
    const done = () => {
      scrim.remove()
      if (lingering === scrim) lingering = null
    }
    scrim
      .animate([{ opacity }, { opacity: 0 }], { duration: 340, easing: 'cubic-bezier(0.3, 0.9, 0.3, 1)', fill: 'forwards' })
      .finished.then(done, done)
  }
}

const onScreen = (el: HTMLElement) => {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth
}

async function morph(kind: 'open' | 'close' | 'drop', name: HTMLElement, update: () => void, done: () => void) {
  // A second open or close mid-morph finishes the first before starting.
  if (running) {
    running.skipTransition()
    await running.finished.catch(() => {})
  }
  name.style.viewTransitionName = NAME
  const root = document.documentElement
  root.dataset.morph = kind
  const vt = document.startViewTransition(update)
  running = vt
  // A skipped transition rejects `ready`; the update still runs, so that's fine.
  vt.ready.catch(() => {})
  await vt.finished.catch(() => {})
  done()
  if (running === vt) {
    running = null
    delete root.dataset.morph
  }
}

/*
 * The crests travel on their own, from the card to their places in the
 * sheet and back, so they stay one crest the whole way: left inside the
 * picture they'd be scaled with it, and doubled while the card and the sheet
 * overlap. Only a crest that can be seen gets a name, since a named element
 * is drawn unclipped (a crest scrolled out of the sheet would fly in from
 * outside it).
 */
const CRESTS = ['match-crest-home', 'match-crest-away']

function crests(within: HTMLElement): HTMLElement[] {
  const found = within.matches('.preview-media')
    ? [...within.querySelectorAll<HTMLElement>('.preview-matchup > .preview-flag')]
    : [...within.querySelectorAll<HTMLElement>('.modal-teams > .modal-team > .modal-flag')]
  if (found.length !== 2) return []
  const box = within.getBoundingClientRect()
  const seen = found.every((el) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.top >= box.top && r.bottom <= box.bottom && r.top >= 0 && r.bottom <= innerHeight
  })
  return seen ? found : []
}

function nameCrests(els: HTMLElement[]) {
  els.forEach((el, i) => (el.style.viewTransitionName = CRESTS[i]))
  return () => els.forEach((el) => el.style.removeProperty('view-transition-name'))
}

/** Opens a sheet, grown from the card that was just clicked if there is one. */
export function openSheet(open: () => void) {
  const from = pressed
  pressed = null
  if (document.documentElement.dataset.morph === 'open') return
  if (!from || !from.isConnected || !canMorph()) {
    source = null
    open()
    return
  }
  source = from
  let grown: HTMLElement | null = null
  let unname = nameCrests(crests(from))
  void morph(
    'open',
    from,
    () => {
      from.style.viewTransitionName = ''
      const had = unname !== noop
      unname()
      flushSync(open)
      grown = sheet()
      if (!grown) return
      grown.style.viewTransitionName = NAME
      // The sheet's own entrance would otherwise play inside the morph, and
      // again once it ends.
      grown.style.animation = 'none'
      // Both ends need their crests, or they'd have nowhere to fly to.
      unname = had ? nameCrests(crests(grown)) : noop
    },
    () => {
      grown?.style.removeProperty('view-transition-name')
      unname()
    },
  )
}

/** Closes the sheet, back into the card it came from if that's still in view. */
export function closeSheet(close: () => void) {
  // Already on its way out (Escape pressed twice, or held down).
  if (running && document.documentElement.dataset.morph !== 'open') return
  const leaving = sheet()
  if (!leaving || !canMorph()) {
    source = null
    close()
    return
  }
  const to = source && source.isConnected && onScreen(source) ? source : null
  source = null
  const scrim = leaveScrim(leaving)
  let unname = to ? nameCrests(crests(leaving)) : noop
  void morph(
    to ? 'close' : 'drop',
    leaving,
    () => {
      const had = unname !== noop
      unname()
      flushSync(close)
      scrim()
      if (!to) return
      to.style.viewTransitionName = NAME
      unname = had ? nameCrests(crests(to)) : noop
    },
    () => {
      to?.style.removeProperty('view-transition-name')
      unname()
    },
  )
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
