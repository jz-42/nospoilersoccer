import { resetTournamentProgressForViewing, type TournamentProgress } from './reset'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
  console.log(`ok - ${msg}`)
}

const before: TournamentProgress = {
  marks: { 'm-1': 'watched', 'm-2': 'skipped' },
  revealed: ['ko-1'],
  pins: ['m-1', 'm-9'],
  favorites: ['arg', 'jpn'],
  favAuto: false,
}

const after = resetTournamentProgressForViewing(before)

assert(Object.keys(after.marks).length === 0, 'reset clears watched progress')
assert(after.revealed.length === 0, 'reset clears force-revealed slots')
assert(
  after.pins.length === 2 && after.pins[0] === 'm-1' && after.pins[1] === 'm-9',
  'reset preserves manual saved matches',
)
assert(
  after.favorites.length === 2 && after.favorites[0] === 'arg' && after.favorites[1] === 'jpn',
  'reset preserves favorite teams',
)
assert(after.favAuto === false, 'reset preserves the favorite auto-highlight preference')
assert(after !== before, 'reset returns a new object')

console.log('ALL PASS')
