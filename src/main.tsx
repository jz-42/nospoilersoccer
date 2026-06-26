import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter/index.css'
import './index.css'
import App from './App.tsx'
import { initAnalytics } from './analytics'

initAnalytics({
  VITE_UMAMI_SCRIPT_URL: import.meta.env.VITE_UMAMI_SCRIPT_URL,
  VITE_UMAMI_WEBSITE_ID: import.meta.env.VITE_UMAMI_WEBSITE_ID,
  VITE_UMAMI_HOST_URL: import.meta.env.VITE_UMAMI_HOST_URL,
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
