/**
 * Player lab: a dev-only page (served by `npm run dev` at /player-lab.html,
 * not part of the production build) for trying our own player controls on
 * real highlights before they reach the app.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter/index.css'
import '../index.css'
import '../App.css'
// Component styles are imported by the entry, as in main.tsx (the Node smoke
// tests import components directly and can't load CSS).
import '@fontsource/roboto/latin-500.css'
import '../components/PlayerControls.css'
import '../components/PlayerSettingsPanel.css'
import './player-lab.css'
import { PlayerLab } from './PlayerLab'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PlayerLab />
  </StrictMode>,
)
