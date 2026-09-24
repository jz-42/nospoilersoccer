import { migrate, reorderSavedMatches } from './progress'
import { resetTournamentProgressForViewing, type TournamentProgress } from './reset'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
  console.log(`ok - ${msg}`)
}

const before: TournamentProgress = {
  marks: { 'm-1': 'watched', 'm-2': 'skipped' },
  revealed: ['ko-1'],
  pins: ['m-1', 'm-9'],
}

const after = resetTournamentProgressForViewing(before)

assert(Object.keys(after.marks).length === 0, 'reset clears watched progress')
assert(after.revealed.length === 0, 'reset clears force-revealed slots')
assert(
  after.pins.length === 2 && after.pins[0] === 'm-1' && after.pins[1] === 'm-9',
  'reset preserves manual saved matches',
)
assert(after !== before, 'reset returns a new object')

// v3 kept favorites per competition; v4 makes them global. v5 also brings
// each competition's saved matches into one Watch Later order. v6 tracks writes.
const v3 = migrate({
  version: 3,
  tournaments: {
    'eng1-2026': { marks: {}, revealed: [], pins: [], favorites: ['arsenal', 'liverpool'], favAuto: true },
    'ucl-2026': { marks: {}, revealed: [], pins: ['x'], favorites: ['liverpool', 'barcelona'], favAuto: false },
    'wc2026': { marks: {}, revealed: [], pins: [], favorites: [], favAuto: false },
  },
})
assert(v3.version === 6 && v3.revision === 0, 'v3 saves migrate through v6')
assert(
  v3.favorites.join() === 'arsenal,liverpool,barcelona',
  'per-competition favorites merge into one list, in order, without duplicates',
)
assert(v3.favAuto === true, 'highlighting stays on if any competition with favorites had it on')
assert(v3.spotlight === false, 'spotlight starts off')
assert(v3.pinOrder.join() === 'ucl-2026/x', 'older saved matches join the global queue')
assert(
  !('favorites' in v3.tournaments['ucl-2026']) && v3.tournaments['ucl-2026'].pins[0] === 'x',
  'tournament entries drop their old favorites but keep everything else',
)

const allOff = migrate({
  version: 3,
  tournaments: { a: { marks: {}, revealed: [], pins: [], favorites: ['arg'], favAuto: false } },
})
assert(allOff.favAuto === false, 'highlighting stays off if it was off everywhere you followed anyone')

const v1 = migrate({ version: 1, tournaments: { a: { marks: {} } } })
assert(v1.version === 6 && v1.favorites.length === 0 && v1.favAuto, 'v1 saves still load all the way up')

const broken = migrate({ version: 4, tournaments: {} })
assert(Array.isArray(broken.favorites) && broken.spotlight === false, 'a v4 save missing fields is repaired')

const multi = migrate({
  version: 4,
  tournaments: {
    'ucl-2026': { marks: {}, revealed: [], pins: ['same-id', 'ucl-only'] },
    wc2026: { marks: { 'same-id': 'watched' }, revealed: [], pins: ['same-id'] },
  },
  favorites: [], favAuto: true, spotlight: false,
})
assert(
  multi.pinOrder.join() === 'ucl-2026/same-id,ucl-2026/ucl-only,wc2026/same-id',
  'migration keeps saved matches from every tournament, even when match ids overlap',
)
assert(multi.tournaments.wc2026.marks['same-id'] === 'watched', 'migration preserves each tournament’s viewing state')

const damaged = migrate({
  version: 4,
  tournaments: {
    'old-broken-season': null,
    wc2026: { marks: { A1: 'skipped' }, revealed: [], pins: ['A1'] },
  },
  favorites: ['MEX'], favAuto: false, spotlight: true,
})
assert(damaged.pinOrder.includes('wc2026/A1'), 'a damaged season cannot erase other saved matches during migration')
assert(damaged.favorites.includes('MEX') && damaged.spotlight, 'migration preserves unrelated preferences after a damaged season')

const damagedLegacy = migrate({
  version: 3,
  tournaments: {
    broken: { marks: {}, revealed: [], pins: [], favorites: 42 },
    wc2026: { marks: {}, revealed: [], pins: ['A1'], favorites: ['MEX'] },
  },
})
assert(damagedLegacy.pinOrder.includes('wc2026/A1') && damagedLegacy.favorites.includes('MEX'),
  'a damaged legacy favorite list cannot erase other saved progress')

const divergent = migrate({
  version: 5,
  tournaments: {
    wc2026: { marks: {}, revealed: [], pins: ['A1'] },
    'ucl-2026': { marks: {}, revealed: [], pins: ['ucl-aek-athens-lask'] },
  },
  pinOrder: ['wc2026/A1'], favorites: [], favAuto: true, spotlight: false,
})
assert(divergent.pinOrder.includes('ucl-2026/ucl-aek-athens-lask'), 'migration recovers a pin missing from the global index')

const versionFive = migrate({
  version: 5,
  tournaments: { wc2026: { marks: {}, revealed: [], pins: ['A1'] } },
  pinOrder: ['wc2026/A1'], favorites: [], favAuto: true, spotlight: false,
})
assert(versionFive.version === 6 && versionFive.revision === 0, 'v5 saves gain revision without losing pins')

assert(
  reorderSavedMatches(['ucl/a', 'wc/b', 'ucl/c', 'unl/d'], ['ucl/c', 'ucl/a']).join() ===
    'ucl/c,wc/b,ucl/a,unl/d',
  'reordering visible saved matches preserves other tournaments in place',
)

console.log('ALL PASS')
