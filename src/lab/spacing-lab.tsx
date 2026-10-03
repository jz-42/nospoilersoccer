/** Dev-only viewport comparison for the Today rail's top spacing. */
import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter/index.css'
import '../index.css'
import '@fontsource/roboto/latin-500.css'
import '../components/PlayerControls.css'
import '../components/SpoilerCovers.css'
import App from '../App.tsx'
import './spacing-lab.css'

type Layout = 'before' | 'after'
type Screen = { name: string; width: number; height: number }

const screens: Screen[] = [
  { name: '14-inch laptop', width: 1512, height: 776 },
  { name: 'Compact laptop', width: 1280, height: 720 },
  { name: 'Desktop', width: 1920, height: 1080 },
  { name: 'Tablet', width: 820, height: 1180 },
  { name: 'Phone', width: 390, height: 844 },
  { name: 'Landscape phone', width: 844, height: 390 },
]

const params = new URLSearchParams(window.location.search)
const isFrame = params.has('frame')

if (isFrame) {
  const setLayout = (layout: Layout) => {
    document.documentElement.dataset.spacingLab = layout
  }
  setLayout(params.get('layout') === 'before' ? 'before' : 'after')
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return
    if (event.data?.type !== 'spacing-lab-layout') return
    if (event.data.layout === 'before' || event.data.layout === 'after') {
      setLayout(event.data.layout)
    }
  })
}

export function SpacingLab() {
  const [layout, setLayout] = useState<Layout>('after')
  const [screen, setScreen] = useState<Screen>(screens[0])
  const [area, setArea] = useState({ width: 0, height: 0 })
  const stageRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const observer = new ResizeObserver(([entry]) => {
      setArea({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage({ type: 'spacing-lab-layout', layout }, window.location.origin)
  }, [layout])

  const scale = area.width && area.height
    ? Math.min(1, (area.width - 48) / screen.width, (area.height - 48) / screen.height)
    : 1

  return (
    <div className="spacing-lab">
      <header className="spacing-lab-bar">
        <div className="spacing-lab-title">
          <strong>Today spacing lab</strong>
          <span>Compare the live page at different viewport sizes.</span>
        </div>
        <div className="spacing-lab-controls">
          <div className="spacing-lab-group" role="group" aria-label="Screen size">
            {screens.map((option) => (
              <button
                key={option.name}
                type="button"
                className={screen.name === option.name ? 'selected' : ''}
                aria-pressed={screen.name === option.name}
                onClick={() => setScreen(option)}
              >
                {option.name}
              </button>
            ))}
          </div>
          <div className="spacing-lab-group" role="group" aria-label="Spacing version">
            {(['before', 'after'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={layout === option ? 'selected' : ''}
                aria-pressed={layout === option}
                onClick={() => setLayout(option)}
              >
                {option === 'before' ? 'Before' : 'After'}
              </button>
            ))}
          </div>
        </div>
      </header>
      <main className="spacing-lab-stage" ref={stageRef}>
        <div className="spacing-lab-device" style={{ width: screen.width * scale, height: screen.height * scale }}>
          <iframe
            ref={frameRef}
            title={`${screen.name} preview`}
            src="/spacing-lab.html?frame=1&layout=after"
            style={{ width: screen.width, height: screen.height, transform: `scale(${scale})` }}
            onLoad={() => frameRef.current?.contentWindow?.postMessage(
              { type: 'spacing-lab-layout', layout }, window.location.origin,
            )}
          />
        </div>
      </main>
      <footer className="spacing-lab-info">
        <span>{screen.width} × {screen.height} CSS pixels · {Math.round(scale * 100)}% preview scale</span>
        <span>Before restores the original Today rail spacing. After uses the height-responsive spacing.</span>
        <a href={`/spacing-lab.html?frame=1&layout=${layout}`} target="_blank" rel="noreferrer">Open full size ↗</a>
      </footer>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isFrame ? <App /> : <SpacingLab />}</StrictMode>,
)
