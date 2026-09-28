import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { SpoilerBlurSheet } from './components/SpoilerBlur'

/**
 * Opens the sheet from anywhere: the mark, the player, the header menu, the
 * match sheet's actions. It mounts on its own, so it outlives whatever opened
 * it (the menu closes as it opens) and needs nothing mounted in advance. It
 * reads only the settings store, so it needs no app context either.
 */
let openRoot: (() => void) | null = null
export function openSpoilerBlur() {
  if (openRoot) return
  const host = document.createElement('div')
  // In full screen only the full-screen element is drawn, so open inside it.
  ;(document.fullscreenElement ?? document.body).append(host)
  // Leaving full screen (Esc, the reveal, the match sheet closing under it)
  // would strand the sheet in the player's box, or detached along with it,
  // and a detached one could never close: back to the page it goes.
  const settle = () => {
    if (!document.fullscreenElement?.contains(host)) document.body.append(host)
  }
  document.addEventListener('fullscreenchange', settle)
  const root = createRoot(host)
  openRoot = () => {
    openRoot = null
    document.removeEventListener('fullscreenchange', settle)
    root.unmount()
    host.remove()
  }
  root.render(createElement(SpoilerBlurSheet, { onClose: () => openRoot?.() }))
}
