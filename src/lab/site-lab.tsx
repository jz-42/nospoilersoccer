/**
 * Site lab: a dev-only copy of the whole app (served by `npm run dev` at
 * /site-lab.html, not part of the production build), for testing the match
 * sheet and its highlight source menu on every match's colours.
 *
 * Real data has a second source on only a handful of matches, so the lab gives
 * every match with a highlight extra channels (2 by default, up to 4; "Real"
 * leaves the data as it is). The
 * extra TUDN and FOX cuts are real videos from another match; the ESPN ones
 * are placeholders that won't play.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter/index.css'
import '../index.css'
import '@fontsource/roboto/latin-500.css'
import '../components/PlayerControls.css'
import '../components/SpoilerCovers.css'
import App from '../App.tsx'
import { tournaments } from '../data'
import { eng1_2026 } from '../data/club/eng1-2026'
import { esp1_2026 } from '../data/club/esp1-2026'
import { ucl_2026 } from '../data/club/ucl-2026'
import { unl2026 } from '../data/nations/unl-2026'
import type { HighlightVideo, Tournament } from '../data/types'
import './site-lab.css'
import './new-look.css'
import { applyLook } from './new-look'
import { SiteLab } from './SiteLab'

const initial = new URLSearchParams(window.location.search)
/** The phone view is this same page in an iframe, so the app's own breakpoints apply. */
const framed = initial.has('frame')
applyLook()
window.addEventListener('message', (e) => {
  if (e.data === 'nl-look') applyLook()
})
const sourceCount = Math.min(4, Math.max(1, Number(initial.get('sources')) || 2))
// 1 = the real data, untouched.

const EXTRAS: HighlightVideo[] = [
  { youtubeId: 'AjiN46Zmdlc', kind: 'normal', publisher: 'tudn' },
  { youtubeId: '4fsGpbnpU9Q', kind: 'normal' },
  { youtubeId: 'labEspnFc00', kind: 'normal', publisher: 'espn-fc' },
  { youtubeId: 'labDeportes', kind: 'normal', publisher: 'espn-deportes' },
]

/** Top a match up to `sourceCount` channels, in place, so the app's own objects carry them. */
function addSources(t: Tournament) {
  const matches = [...t.groupMatches, ...t.knockoutRounds.flatMap((r) => r.matches)]
  for (const m of matches) {
    const videos = m.videos
    if (!videos?.length) continue
    const channels = new Set(videos.map((v) => ('publisher' in v && v.publisher) || 'home'))
    for (const extra of EXTRAS) {
      if (channels.size >= sourceCount) break
      const channel = ('publisher' in extra && extra.publisher) || 'home'
      if (channels.has(channel)) continue
      channels.add(channel)
      videos.push(extra)
    }
  }
}

for (const t of [tournaments.wc2026, unl2026, ucl_2026, eng1_2026, esp1_2026]) {
  if (t) addSources(t)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>{framed ? <App /> : <SiteLab sources={sourceCount} />}</StrictMode>,
)
