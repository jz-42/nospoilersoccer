import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter/index.css'
import './index.css'
// Component styles load here, not from the components: the Node smoke tests
// import components directly and can't load CSS.
import '@fontsource/roboto/latin-500.css'
import './components/PlayerControls.css'
import './components/SpoilerCovers.css'
import App from './App.tsx'
import { analytics } from './analytics'

analytics.init()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
