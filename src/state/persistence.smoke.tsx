import { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { wc2026 } from '../data/wc2026'
import { RevealResultButton, WatchLaterClock } from '../components/MatchActions'
import { readStored, useProgress, type Progress } from './progress'
import { writeStorage } from './storage'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const dom = new JSDOM('<div id="root"></div>', { url: 'https://nospoilersoccer.test' })
const storage = new Map<string, string>()
const blockedReads = new Set<string>()
const blockedWrites = new Set<string>()
const alerts: string[] = []
let discardWrites = false
let trackLocks = false
let insideLock = false
let unlockedWrites = 0
Object.defineProperties(globalThis, {
  window: { configurable: true, value: dom.window },
  document: { configurable: true, value: dom.window.document },
  navigator: { configurable: true, value: dom.window.navigator },
  IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  matchMedia: { configurable: true, value: () => ({ matches: true }) },
  localStorage: {
    configurable: true,
    value: {
      getItem: (key: string) => {
        if (blockedReads.has(key)) throw new Error('read blocked')
        return storage.get(key) ?? null
      },
      setItem: (key: string, value: string) => {
        if (trackLocks && !insideLock && /nss-(progress|player-settings)/.test(key)) unlockedWrites += 1
        if (blockedWrites.has(key)) throw new Error('storage full')
        if (!discardWrites) storage.set(key, value)
      },
    },
  },
})
dom.window.alert = (message: string) => { alerts.push(message) }

const { DEFAULT_PLAYER_SETTINGS, usePlayerSettings, readPlayerSettings, setPlayerSetting, resetPlayerSettings } = await import('../player-settings')
const progress = new Map<string, Progress>()
let settings = {} as ReturnType<typeof usePlayerSettings>
export function PersistenceProbe({ slot }: { slot: string }) {
  const snapshot = useProgress(wc2026)
  const preferences = usePlayerSettings()
  useEffect(() => {
    progress.set(slot, snapshot)
    settings = preferences
  }, [slot, snapshot, preferences])
  return <div data-slot={slot}>
    <WatchLaterClock saved={snapshot.pins.has('toast-match')} compact onToggle={() => snapshot.togglePin('toast-match')} />
    <RevealResultButton winner={null} onReveal={() => snapshot.setMark('reveal-retry', 'watched')} />
  </div>
}

const root = createRoot(document.getElementById('root')!)
let generation = 0
async function reload() {
  generation += 1
  await act(async () => {
    root.render(<><PersistenceProbe key={`first-${generation}`} slot="first" /><PersistenceProbe key={`second-${generation}`} slot="second" /></>)
  })
}

async function changeAndReload(change: () => void, check: (saved: Progress) => boolean, message: string) {
  await act(async () => { change() })
  await reload()
  assert(check(progress.get('first')!), message)
}

await reload()
const first = () => progress.get('first')!
const second = () => progress.get('second')!
const other = { ...wc2026, id: 'other-season' }

await changeAndReload(() => first().togglePin('A1'), (saved) => saved.pins.has('A1'), 'Watch Later survives an immediate reload')
await changeAndReload(() => first().togglePin('A1'), (saved) => !saved.pins.has('A1'), 'unsaving a match survives reload')
await changeAndReload(() => first().setMark('A1', 'watched'), (saved) => saved.marks.A1 === 'watched', 'watched marks survive reload')
await changeAndReload(() => first().setMark('A1', 'skipped'), (saved) => saved.marks.A1 === 'skipped', 'skipped marks survive reload')
await changeAndReload(() => first().unmark('A1'), (saved) => !saved.marks.A1, 'unmarking survives reload')
await changeAndReload(() => first().reveal('B1'), (saved) => saved.revealed.has('B1'), 'matchup reveals survive reload')
await changeAndReload(() => first().catchUp(['A1', 'A2']), (saved) => saved.marks.A1 === 'skipped' && saved.marks.A2 === 'skipped', 'catch-up marks survive reload')
await changeAndReload(() => first().forTournament(other).togglePin('other-match'), (saved) => saved.forTournament(other).pins.has('other-match'), 'other-season saves survive reload')
await changeAndReload(() => first().forTournament(other).setMark('A1', 'watched'), (saved) => saved.forTournament(other).marks.A1 === 'watched', 'other-season marks survive reload')
await changeAndReload(() => first().forTournament(other).unmark('A1'), (saved) => !saved.forTournament(other).marks.A1, 'other-season unmarking survives reload')
await changeAndReload(() => first().forTournament(other).reveal('B1'), (saved) => saved.forTournament(other).revealed.has('B1'), 'other-season reveals survive reload')
await changeAndReload(() => first().forTournament(other).catchUp(['A1']), (saved) => saved.forTournament(other).marks.A1 === 'skipped', 'other-season catch-up survives reload')
await changeAndReload(() => first().forTournament(other).setPinOrder(['other-match']), (saved) => saved.forTournament(other).pinOrder.join() === 'other-match', 'other-season queue ordering survives reload')
await changeAndReload(() => first().forTournament(other).reset(), (saved) => !saved.forTournament(other).marks.A1 && !saved.forTournament(other).revealed.size && saved.forTournament(other).pins.has('other-match'), 'other-season reset persists while retaining its saved matches')
await changeAndReload(() => first().setPinOrder(['A1', 'A2']), (saved) => saved.pinOrder.join() === 'A1,A2', 'queue replacement survives reload')
await changeAndReload(() => first().reorderAllPins(['wc2026/A2', 'wc2026/A1']), (saved) => saved.pinOrder.join() === 'A2,A1', 'queue reordering survives reload')
await changeAndReload(() => first().removePins(['wc2026/A2']), (saved) => !saved.pins.has('A2') && saved.forTournament(other).pins.has('other-match'), 'queue removal preserves other seasons after reload')
await changeAndReload(() => first().toggleFavorite('MEX'), (saved) => saved.favorites.includes('MEX'), 'following teams survives reload')
await changeAndReload(() => first().toggleFavorite('ARG'), (saved) => saved.favorites.includes('ARG'), 'additional favorites survive reload')
await changeAndReload(() => first().setFavorites(['ARG', 'MEX']), (saved) => saved.favorites.join() === 'ARG,MEX', 'favorite reordering survives reload')
await changeAndReload(() => first().toggleFavorite('MEX'), (saved) => !saved.favorites.includes('MEX'), 'unfollowing survives reload')
await changeAndReload(() => first().setFavAuto(false), (saved) => !saved.favAuto, 'favorite highlighting preferences survive reload')
await changeAndReload(() => first().setSpotlight(true), (saved) => saved.spotlight, 'spotlight preferences survive reload')
await changeAndReload(() => first().reset(), (saved) => !saved.marks.A1 && !saved.revealed.size && saved.pins.has('A1'), 'viewing reset persists without erasing Watch Later')

for (const blocked of ['nss-progress', 'nss-progress-last-good']) {
  blockedWrites.add(blocked)
  await changeAndReload(() => first().togglePin(blocked), (saved) => saved.pins.has(blocked), `progress survives reload with ${blocked} writes blocked`)
  blockedWrites.clear()
}

blockedWrites.add('nss-progress')
blockedWrites.add('nss-progress-last-good')
const failedActions: [string, () => void][] = [
  ['save', () => first().togglePin('failed')],
  ['mark', () => first().setMark('A1', 'watched')],
  ['reveal', () => first().reveal('failed')],
  ['favorites', () => first().toggleFavorite('failed')],
  ['spotlight', () => first().setSpotlight(false)],
  ['remove', () => first().removePins(['wc2026/A1'])],
  ['reset', () => first().reset()],
]
for (const [name, change] of failedActions) {
  const previous = JSON.stringify(readStored())
  const previousUI = first()
  const warningCount = alerts.length
  await act(async () => { change() })
  assert(JSON.stringify(readStored()) === previous, `failed ${name} leaves durable progress intact`)
  assert(first().allPinOrder.join() === previousUI.allPinOrder.join() &&
    JSON.stringify(first().marks) === JSON.stringify(previousUI.marks) &&
    [...first().revealed].join() === [...previousUI.revealed].join() &&
    first().favorites.join() === previousUI.favorites.join() && first().spotlight === previousUI.spotlight,
  `failed ${name} never appears successful in the UI`)
  assert(alerts.length === warningCount + 1, `failed ${name} reports an explicit error, even after previous failures`)
}
const clockButton = () => document.querySelector<HTMLButtonElement>('[data-slot="first"] .modal-clock')!
await act(async () => { clockButton().click() })
assert(!document.querySelector('[role="status"]'), 'a failed Watch Later click never displays an Added to Watch Later success toast')
const revealButton = () => document.querySelector<HTMLButtonElement>('[data-slot="first"] .reveal-btn')!
const revealWarnings = alerts.length
await act(async () => { revealButton().click() })
await act(async () => { revealButton().click() })
assert(alerts.length === revealWarnings + 2, 'a failed result reveal remains retryable instead of getting stuck in its success animation')
blockedWrites.clear()
await act(async () => { clockButton().click() })
assert(document.querySelector('[role="status"]')?.textContent?.includes('Added to Watch Later') ?? false,
  'a confirmed Watch Later save still displays its success toast')
await act(async () => { clockButton().click() })
assert(document.querySelector('[role="status"]')?.textContent?.includes('Removed from Watch Later') ?? false,
  'a confirmed Watch Later removal still displays its success toast')
discardWrites = true
await act(async () => { first().togglePin('discarded') })
assert(!first().pins.has('discarded'), 'silently discarded progress writes never appear saved')
assert(!writeStorage('selection', 'new-season'), 'read-back verification rejects silently discarded scalar writes')
discardWrites = false
await changeAndReload(() => first().togglePin('retry'), (saved) => saved.pins.has('retry'), 'retrying after storage recovers saves normally')

for (const key of Object.keys(DEFAULT_PLAYER_SETTINGS) as (keyof typeof DEFAULT_PLAYER_SETTINGS)[]) {
  const value = key === 'skipSeconds' ? 30 : !DEFAULT_PLAYER_SETTINGS[key]
  await act(async () => { setPlayerSetting(key, value) })
  assert(readPlayerSettings()?.[key] === value && settings[key] === value, `${key} is visible only after it can be loaded from storage`)
}
await act(async () => { resetPlayerSettings() })
assert(Object.entries(DEFAULT_PLAYER_SETTINGS).every(([key, value]) => readPlayerSettings()?.[key as keyof typeof DEFAULT_PLAYER_SETTINGS] === value),
  'player settings reset survives a fresh storage load')

for (const blocked of ['nss-player-settings', 'nss-player-settings-last-good']) {
  await act(async () => { setPlayerSetting('showTitle', true) })
  blockedWrites.add(blocked)
  await act(async () => { setPlayerSetting('showTitle', false) })
  await act(async () => { setPlayerSetting('showProgress', true) })
  assert(!settings.showTitle, `player settings keep the newer surviving ${blocked} counterpart`)
  assert(readPlayerSettings()?.showTitle === false, `a fresh player settings load recovers the newer ${blocked} counterpart`)
  blockedWrites.clear()
}
await act(async () => { setPlayerSetting('showTitle', true) })
blockedWrites.add('nss-player-settings-last-good')
await act(async () => { setPlayerSetting('showTitle', false) })
blockedWrites.clear()
blockedReads.add('nss-player-settings')
await act(async () => { window.dispatchEvent(new dom.window.StorageEvent('storage', { key: 'nss-player-settings-last-good' })) })
assert(!settings.showTitle, 'an unreadable newer primary cannot roll the visible preferences back to an older backup')
await act(async () => { setPlayerSetting('showElapsed', false) })
assert(!settings.showTitle && readPlayerSettings()?.showTitle === false, 'editing while the newer copy is unreadable preserves the last confirmed preferences')
blockedReads.clear()
blockedWrites.add('nss-player-settings')
blockedWrites.add('nss-player-settings-last-good')
const previousSettings = JSON.stringify(settings)
const previousWarnings = alerts.length
await act(async () => { setPlayerSetting('showTitle', true) })
await act(async () => { resetPlayerSettings() })
assert(JSON.stringify(settings) === previousSettings, 'failed player setting changes and resets leave the visible settings unchanged')
assert(alerts.length === previousWarnings + 2, 'each failed player setting change reports that it was not saved')
blockedWrites.clear()
discardWrites = true
await act(async () => { setPlayerSetting('showTitle', true) })
assert(JSON.stringify(settings) === previousSettings, 'silently discarded preferences never appear saved')
discardWrites = false
blockedReads.add('nss-player-settings')
blockedReads.add('nss-player-settings-last-good')
await act(async () => { window.dispatchEvent(new dom.window.StorageEvent('storage', { key: 'nss-player-settings' })) })
assert(JSON.stringify(settings) === previousSettings, 'an unreadable storage event cannot reset player preferences')
blockedReads.clear()

let requests = 0
let release: () => void = () => {}
let gate = new Promise<void>((resolve) => { release = resolve })
let lockTail = Promise.resolve()
let rejectLocks = false
Object.defineProperty(navigator, 'locks', {
  configurable: true,
  value: {
    request: (_name: string, change: () => void) => {
      requests += 1
      if (rejectLocks) return Promise.reject(new Error('lock unavailable'))
      const operation = lockTail.then(async () => {
        await gate
        insideLock = true
        try { change() } finally { insideLock = false }
      })
      lockTail = operation.catch(() => {})
      return operation
    },
  },
})
await act(async () => {
  first().togglePin('first-tab')
  second().togglePin('second-tab')
})
assert(requests === 2, 'each progress action acquires an origin-wide exclusive save lock')
assert(!first().pins.has('first-tab') && !second().pins.has('second-tab'), 'queued changes are not shown as saved before their lock runs')
await act(async () => { clockButton().click() })
assert(!document.querySelector('[role="status"]'), 'a queued Watch Later click shows no success toast before its save commits')
const pendingRefresh = new dom.window.Event('beforeunload', { cancelable: true })
window.dispatchEvent(pendingRefresh)
assert(pendingRefresh.defaultPrevented, 'refresh warns while accepted save requests are still queued')
await act(async () => { release(); await lockTail })
assert(document.querySelector('[role="status"]')?.textContent?.includes('Added to Watch Later') ?? false,
  'a queued Watch Later click shows its toast after its save commits')
await reload()
assert(first().pins.has('first-tab') && first().pins.has('second-tab'), 'two tab edits both survive reload without replacing each other')
const settledRefresh = new dom.window.Event('beforeunload', { cancelable: true })
window.dispatchEvent(settledRefresh)
assert(!settledRefresh.defaultPrevented, 'refresh is no longer blocked once saving completes')

trackLocks = true
storage.delete('nss-progress-last-good')
await reload()
await act(async () => { await lockTail })
assert(unlockedWrites === 0, 'reload recovery never repairs a progress copy outside its save lock')
storage.set('nss-player-settings-last-good', JSON.stringify({ showTitle: false, skipSeconds: 5 }))
storage.set('nss-player-settings-legacy-base', JSON.stringify({ showTitle: false, skipSeconds: 5 }))
storage.set('nss-player-settings', JSON.stringify({ showTitle: false, skipSeconds: 15 }))
await act(async () => {
  window.dispatchEvent(new dom.window.StorageEvent('storage', { key: 'nss-player-settings' }))
  await Promise.resolve()
  await lockTail
})
assert(unlockedWrites === 0, 'storage-event reconciliation never repairs preferences outside their save lock')

gate = Promise.resolve()
await act(async () => {
  first().togglePin('rapid')
  first().togglePin('rapid')
  first().setMark('A1', 'watched')
  second().setMark('A2', 'skipped')
  setPlayerSetting('showTitle', true)
  setPlayerSetting('showTitle', false)
  await Promise.resolve()
  await lockTail
})
await reload()
assert(!first().pins.has('rapid'), 'rapid toggles are applied in order against the latest committed progress')
assert(first().marks.A1 === 'watched' && first().marks.A2 === 'skipped', 'competing tab mark actions preserve both matches')
assert(!settings.showTitle, 'queued player settings are committed in action order')
rejectLocks = true
const warningCount = alerts.length
await act(async () => { first().togglePin('lock-failed'); setPlayerSetting('showTitle', true) })
assert(!first().pins.has('lock-failed') && !settings.showTitle, 'lock failures do not apply unprotected changes')
assert(alerts.length === warningCount + 2, 'lock failures report that each requested change was not saved')
const failedRefresh = new dom.window.Event('beforeunload', { cancelable: true })
window.dispatchEvent(failedRefresh)
assert(!failedRefresh.defaultPrevented, 'lock failures release the pending-save refresh guard')

await act(async () => { root.unmount() })
dom.window.close()
console.log('ALL PERSISTENCE INTEGRATION TESTS PASS')
