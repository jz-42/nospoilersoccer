import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { Onboarding } from '../components/Dialogs'
import { completeOnboarding, ONBOARDED_KEY } from './onboarding'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const dom = new JSDOM('<div id="root"></div>', { url: 'https://nospoilersoccer.test' })
const storage = new Map<string, string>()
const warnings: string[] = []
let mode: 'blocked' | 'discarded' | 'available' = 'blocked'
Object.defineProperties(globalThis, {
  window: { configurable: true, value: dom.window },
  document: { configurable: true, value: dom.window.document },
  IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  localStorage: {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (mode === 'blocked') throw new Error('storage full')
        if (mode === 'available') storage.set(key, value)
      },
    },
  },
})
dom.window.alert = (message: string) => { warnings.push(message) }

export function OnboardingProbe() {
  const [visible, setVisible] = useState(() => localStorage.getItem(ONBOARDED_KEY) === null)
  return visible
    ? <Onboarding onClose={() => completeOnboarding(() => setVisible(false))} />
    : <main>Site available</main>
}

const root = createRoot(document.getElementById('root')!)
let generation = 0
const reload = async () => {
  generation += 1
  await act(async () => { root.render(<OnboardingProbe key={generation} />) })
}

for (const storageMode of ['blocked', 'discarded', 'available'] as const) {
  mode = storageMode
  for (const method of ['button', 'escape', 'backdrop'] as const) {
    storage.clear()
    warnings.length = 0
    await reload()
    assert(!!document.querySelector('.onboarding'), `${storageMode}: the welcome is shown before ${method} dismissal`)
    await act(async () => {
      if (method === 'button') document.querySelector<HTMLButtonElement>('.onboarding-go')!.click()
      else if (method === 'escape') window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }))
      else document.querySelector<HTMLElement>('.dialog-backdrop')!.click()
    })
    assert(!document.querySelector('.onboarding') && !!document.querySelector('main'),
      `${storageMode}: ${method} dismissal leaves the site usable`)
    assert(warnings.length === (storageMode === 'available' ? 0 : 1),
      `${storageMode}: ${method} dismissal reports only an unconfirmed preference save`)
    assert(storage.get(ONBOARDED_KEY) === (storageMode === 'available' ? '1' : undefined),
      `${storageMode}: ${method} dismissal never falsely records a saved preference`)
    await reload()
    assert(!!document.querySelector('.onboarding') === (storageMode !== 'available'),
      `${storageMode}: a reload reflects whether the welcome preference actually saved`)
  }
}

await act(async () => { root.unmount() })
dom.window.close()
console.log('ALL ONBOARDING RECOVERY TESTS PASS')
