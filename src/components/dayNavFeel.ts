/**
 * How the day carousel responds to input.
 *
 * A plain mutable object rather than React state: every field is read inside
 * an event handler at the moment of input, so nothing needs to re-render when
 * one changes. The defaults are what ships; the day-nav lab flips them live.
 */
export interface DayNavFeel {
  /**
   * Trackpad swipes and mouse drags: scroll freely then snap, step exactly one
   * day per gesture, or glide (follow the fingers 1:1, then carry the flick's
   * momentum onto a day).
   */
  wheel: 'free' | 'paged' | 'glide'
  /** Arrow / tap / Today glides: the browser's smooth scroll, a short ease-out, or a spring. */
  glide: 'smooth' | 'crisp' | 'spring'
  /** The outgoing day's cards leave (a snapshot slides away) instead of vanishing. */
  cardsOut: boolean
  /** A short tick when the day changes (Android vibrate, iOS 18 switch). */
  haptics: boolean
  /** On phones, the cards lean with your finger before the swipe commits. */
  followFinger: boolean
  /** ← → step days and T returns to today. */
  keys: boolean
}

export const dayNavFeel: DayNavFeel = {
  wheel: 'glide',
  glide: 'spring',
  cardsOut: false,
  haptics: true,
  followFinger: true,
  keys: true,
}

let hapticLabel: HTMLLabelElement | null = null

/**
 * One light tick.
 *
 * Android Chrome has `navigator.vibrate`. iOS Safari has no vibration API, but
 * since iOS 18 toggling an `<input type="checkbox" switch>` plays the system
 * switch haptic, and clicking its label from inside a user gesture counts —
 * so a hidden switch is the only haptic the iPhone web gets. Desktop: no-op.
 */
export function hapticTick() {
  if (!dayNavFeel.haptics || typeof window === 'undefined') return
  // Only phones and tablets have a motor to tick; on a desktop the hidden
  // switch below would just steal keyboard focus.
  if (!window.matchMedia('(pointer: coarse)').matches) return
  if (typeof navigator.vibrate === 'function') {
    try {
      if (navigator.vibrate(8)) return
    } catch {
      // Fall through to the iOS switch.
    }
  }
  if (!hapticLabel) {
    const label = document.createElement('label')
    label.setAttribute('aria-hidden', 'true')
    label.style.cssText = 'position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;left:-99px'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.setAttribute('switch', '')
    input.tabIndex = -1
    label.appendChild(input)
    document.body.appendChild(label)
    hapticLabel = label
  }
  // Clicking the label focuses its switch; give focus straight back, or the
  // next key press would land on a hidden checkbox.
  const focused = document.activeElement
  hapticLabel.click()
  if (document.activeElement !== focused) {
    if (focused instanceof HTMLElement) focused.focus({ preventScroll: true })
    else (document.activeElement as HTMLElement | null)?.blur()
  }
}
