import {
  addLocalDays,
  formatKickoffLocalParts,
  formatKickoffLocal,
  formatLocalDate,
  localDateKey,
  relativeDayLabel,
} from './local'
import {
  formatMatchDate,
  formatMatchDateLong,
  formatMatchWeekday,
  formatMatchWeekdayLong,
} from '../components/format'

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
  formatKickoffLocal(kickoff, 'Europe/Amsterdam') === '9:00 PM CEST',
  'Amsterdam receives a recognized timezone abbreviation',
)
assert(
  formatKickoffLocal(kickoff, 'Asia/Tokyo') === '4:00 AM JST',
  'Tokyo receives a recognized timezone abbreviation',
)
assert(
  formatKickoffLocalParts(kickoff, 'Etc/GMT-3')?.zone === 'UTC+3',
  'offset fallback uses compact UTC notation',
)
assert(
  formatKickoffLocalParts(kickoff, 'Etc/GMT-3')?.offsetZone === true,
  'offset fallback is marked for smaller visual treatment',
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
assert(
  formatMatchDate('2026-06-21', '2026-06-21T00:30Z', 'America/Los_Angeles') === 'Jun 20',
  'match short date comes from kickoff',
)
assert(
  formatMatchDateLong('2026-06-21', '2026-06-21T00:30Z', 'Europe/Amsterdam') ===
    'Sun, June 21, 2026',
  'match long date comes from kickoff',
)
assert(
  formatMatchWeekday('2026-06-21', '2026-06-21T00:30Z', 'America/Los_Angeles') === 'Saturday',
  'match weekday comes from local kickoff date',
)
assert(
  formatMatchWeekdayLong('2026-06-21', '2026-06-21T00:30Z', 'Europe/Amsterdam') ===
    'Sunday, June 21',
  'match long weekday comes from local kickoff date',
)

console.log('ALL LOCAL TIME TESTS PASS')
