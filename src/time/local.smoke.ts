import {
  addLocalDays,
  formatKickoffLocal,
  formatLocalDate,
  localDateKey,
  relativeDayLabel,
} from './local'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const kickoff = '2026-06-20T19:00Z'

assert(
  formatKickoffLocal(kickoff, 'America/Los_Angeles') === '12:00 PM PT',
  'Los Angeles receives Pacific time',
)
assert(
  formatKickoffLocal(kickoff, 'America/New_York') === '3:00 PM ET',
  'New York receives Eastern time',
)
assert(
  formatKickoffLocal(kickoff, 'Europe/Amsterdam') === '9:00 PM GMT+2',
  'Amsterdam receives its local time and UTC offset',
)
assert(
  localDateKey('2026-06-21T00:30Z', 'America/Los_Angeles') === '2026-06-20',
  'Pacific local date can be the previous UTC date',
)
assert(
  localDateKey('2026-06-21T00:30Z', 'Europe/Amsterdam') === '2026-06-21',
  'Amsterdam local date follows its local midnight',
)
assert(addLocalDays('2026-06-30', 1) === '2026-07-01', 'calendar date addition crosses months')

const nearPacificMidnight = new Date('2026-06-21T06:30Z')
assert(
  relativeDayLabel('2026-06-19', nearPacificMidnight, 'America/Los_Angeles') === 'Yesterday',
  'relative label identifies yesterday in the visitor timezone',
)
assert(
  relativeDayLabel('2026-06-20', nearPacificMidnight, 'America/Los_Angeles') === 'Today',
  'relative label identifies today in the visitor timezone',
)
assert(
  relativeDayLabel('2026-06-21', nearPacificMidnight, 'America/Los_Angeles') === 'Tomorrow',
  'relative label identifies tomorrow in the visitor timezone',
)
assert(
  formatLocalDate('2026-06-21T00:30Z', { month: 'short', day: 'numeric' }, 'America/Los_Angeles') ===
    'Jun 20',
  'displayed date follows the visitor timezone',
)

console.log('ALL LOCAL TIME TESTS PASS')
