/**
 * Highlight lab: a dev-only page (served by `npm run dev` at /highlight-lab.html,
 * not part of the production build) for the highlight poster's source menu at
 * one to four sources, on a real match sheet, desktop or phone.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter/index.css'
import '../index.css'
import '../App.css'
import '@fontsource/roboto/latin-500.css'
import '../components/PlayerControls.css'
import '../components/SpoilerCovers.css'
import './highlight-lab.css'
import { HighlightLab } from './HighlightLab'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HighlightLab />
  </StrictMode>,
)
