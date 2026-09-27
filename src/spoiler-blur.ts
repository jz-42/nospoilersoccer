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
  const root = createRoot(host)
  openRoot = () => {
    openRoot = null
    root.unmount()
    host.remove()
  }
  root.render(createElement(SpoilerBlurSheet, { onClose: () => openRoot?.() }))
}
