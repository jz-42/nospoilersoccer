import { setPlayerSetting } from './player-settings'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const storage = new Map<string, string>()
let failBackup = false
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (failBackup && key === 'nss-player-settings-last-good') throw new Error('backup full')
      storage.set(key, value)
    },
  },
})

// The old tab's full-object write has a new skip value but an out-of-date
// title choice. Both the new-tab choice and old-tab change should survive.
setPlayerSetting('showTitle', true)
assert(JSON.parse(storage.get('nss-player-settings-legacy-base') ?? 'null')?.showTitle === false,
  'a first-ever preference change seeds the baseline from defaults')
storage.clear()
storage.set('nss-player-settings', JSON.stringify({ showTitle: false, skipSeconds: 5 }))
setPlayerSetting('showTitle', true)
assert(JSON.parse(storage.get('nss-player-settings-legacy-base') ?? 'null')?.showTitle === false,
  'the first preference write saves its previous values as the baseline')
storage.set('nss-player-settings', JSON.stringify({ showTitle: false, skipSeconds: 15 }))
setPlayerSetting('showElapsed', false)
const saved = JSON.parse(storage.get('nss-player-settings')!)
assert(saved.showTitle === true, 'an old tab cannot revert a newer title preference')
assert(saved.skipSeconds === 15, 'an old tab preference change survives the new tab write')
assert(saved.showElapsed === false, 'the current preference change is saved')
setPlayerSetting('skipSeconds', 5)
storage.set('nss-player-settings', JSON.stringify({ showTitle: false, skipSeconds: 15 }))
setPlayerSetting('showProgress', true)
const afterNewChoice = JSON.parse(storage.get('nss-player-settings')!)
assert(afterNewChoice.skipSeconds === 5, 'an old tab cannot reapply an edit after the viewer changes it again')
assert(afterNewChoice.showTitle === true, 'a stale old tab still cannot revert unrelated choices')
storage.clear()
const defaults = JSON.stringify({ showTitle: false, skipSeconds: 5 })
for (const key of ['nss-player-settings', 'nss-player-settings-last-good', 'nss-player-settings-legacy-base']) {
  storage.set(key, defaults)
}
storage.set('nss-player-settings', JSON.stringify({ showTitle: false, skipSeconds: 15 }))
failBackup = true
setPlayerSetting('showTitle', true)
assert(JSON.parse(storage.get('nss-player-settings-legacy-base')!).skipSeconds === 5,
  'the baseline does not advance before the backup saves a reconciled preference')
failBackup = false
setPlayerSetting('showProgress', true)
assert(JSON.parse(storage.get('nss-player-settings')!).skipSeconds === 15,
  'a failed backup write can be recovered on the next preference edit')
storage.clear()
for (const key of ['nss-player-settings-last-good', 'nss-player-settings-legacy-base']) {
  storage.set(key, defaults)
}
storage.set('nss-player-settings', JSON.stringify({ showTitle: false, skipSeconds: 5, futureSetting: true }))
setPlayerSetting('showTitle', true)
assert(JSON.parse(storage.get('nss-player-settings')!).futureSetting === true,
  'a setting added by another build is preserved by older code')
storage.clear()
storage.set('nss-player-settings-last-good', JSON.stringify({ showTitle: true, skipSeconds: 5 }))
storage.set('nss-player-settings', JSON.stringify({ showTitle: false, skipSeconds: 15 }))
setPlayerSetting('showElapsed', false)
const noBaseline = JSON.parse(storage.get('nss-player-settings')!)
assert(noBaseline.showTitle === true,
  'a stale preference cannot overwrite a newer backup when no baseline exists')
storage.set('nss-player-settings', JSON.stringify({ showTitle: false, skipSeconds: 15, showMoreVideos: true }))
setPlayerSetting('showProgress', true)
const afterBaseline = JSON.parse(storage.get('nss-player-settings')!)
assert(afterBaseline.showMoreVideos === true,
  'a later old-tab edit to an unchanged choice is recognized after baseline seeding')
assert(afterBaseline.skipSeconds === 5,
  'a choice already divergent before baseline seeding stays with the newer backup')
delete (globalThis as { localStorage?: unknown }).localStorage

console.log('ALL PLAYER SETTINGS TESTS PASS')
