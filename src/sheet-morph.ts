import { flushSync } from 'react-dom'

/**
 * Opening a match grows its card into the sheet, and closing shrinks the
 * sheet back into the card, the way an App Store Today card opens. A view
 * transition does the morph: the card's picture and then the sheet are both
 * named `match-sheet`, and the browser animates one box into the other
 * (App.css, "Grow from the card").
 *
 * The page behind has to move with it. Opening, it's shown live, so the
 * backdrop's own scrim-in blurs and dims it in step with the grow; closing,
 * the old page (backdrop and all) lies on top and fades away as the sheet
 * shrinks, so the blur lifts rather than snapping off.
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

const sheet = () => document.querySelector<HTMLElement>('.modal:not(.dialog)')
const dialog = () => document.querySelector<HTMLElement>('.modal.dialog')

const onScreen = (el: HTMLElement) => {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth
}

async function morph(
  kind: 'open' | 'close' | 'drop',
  name: HTMLElement,
  update: () => void,
  done: () => void,
  // Growing out of a button rather than a card: its corners, and the card's.
  button?: { from: string; to: string },
) {
  // A second open or close mid-morph finishes the first before starting.
  if (running) {
    running.skipTransition()
    await running.finished.catch(() => {})
  }
  name.style.viewTransitionName = NAME
  const root = document.documentElement
  root.dataset.morph = kind
  if (button) {
    root.dataset.morphButton = ''
    root.style.setProperty('--morph-from-radius', button.from)
    root.style.setProperty('--morph-to-radius', button.to)
  }
  const vt = document.startViewTransition(update)
  running = vt
  // A skipped transition rejects `ready`; the update still runs, so that's fine.
  vt.ready.catch(() => {})
  await vt.finished.catch(() => {})
  done()
  if (running === vt) {
    running = null
    delete root.dataset.morph
    delete root.dataset.morphButton
    root.style.removeProperty('--morph-from-radius')
    root.style.removeProperty('--morph-to-radius')
  }
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
  void morph(
    'open',
    from,
    () => {
      from.style.viewTransitionName = ''
      flushSync(open)
      grown = sheet()
      if (!grown) return
      grown.style.viewTransitionName = NAME
      // The sheet's own entrance would otherwise play inside the morph, and
      // again once it ends.
      grown.style.animation = 'none'
    },
    () => grown?.style.removeProperty('view-transition-name'),
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
  void morph(
    to ? 'close' : 'drop',
    leaving,
    () => {
      flushSync(close)
      if (to) to.style.viewTransitionName = NAME
    },
    () => to?.style.removeProperty('view-transition-name'),
  )
}

/*
 * Dialogs grow out of the button that asked for them, the way an iOS 26
 * button turns into its alert: the same morph, from the button's capsule to
 * the dialog's card, with the page dimming and blurring on the same curve.
 * Cancelled, a dialog goes back into its button; once its button is gone
 * (Catch up turns into Reset progress when it's done) it drops away.
 */
let dialogSource: HTMLElement | null = null

/** Opens a dialog, grown from `from`, the button that asked for it. */
export function openDialog(from: HTMLElement | null, open: () => void) {
  if (running) return
  if (!from || !from.isConnected || !onScreen(from) || !canMorph()) {
    dialogSource = null
    open()
    return
  }
  dialogSource = from
  let grown: HTMLElement | null = null
  void morph(
    'open',
    from,
    () => {
      from.style.viewTransitionName = ''
      flushSync(open)
      grown = dialog()
      if (!grown) return
      grown.style.viewTransitionName = NAME
      grown.style.animation = 'none'
    },
    () => grown?.style.removeProperty('view-transition-name'),
    { from: getComputedStyle(from).borderRadius, to: '28px' },
  )
}

/** Closes the open dialog, back into its button if that's still there. */
export function closeDialog(close: () => void) {
  if (running && document.documentElement.dataset.morph !== 'open') return
  const leaving = dialog()
  if (!leaving || !canMorph()) {
    dialogSource = null
    close()
    return
  }
  const from = dialogSource
  dialogSource = null
  let to: HTMLElement | null = null
  void morph(
    'drop',
    leaving,
    () => {
      flushSync(close)
      // Only now is it known whether the button survived the answer.
      if (from && from.isConnected && onScreen(from)) {
        to = from
        to.style.viewTransitionName = NAME
        document.documentElement.dataset.morph = 'close'
      }
    },
    () => to?.style.removeProperty('view-transition-name'),
    from ? { from: getComputedStyle(from).borderRadius, to: '28px' } : undefined,
  )
}
