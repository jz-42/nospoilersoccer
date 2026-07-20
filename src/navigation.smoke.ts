import fs from 'node:fs'
import { wc2022 } from './data/wc2022'
import { wc2026 } from './data/wc2026'
import {
  dayRailInitialDate,
  dayTabLabel,
  defaultTournamentView,
  isTournamentArchived,
} from './navigation'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const finalDayInLosAngeles = new Date('2026-07-20T06:59:00Z')
assert(
  !isTournamentArchived(wc2026, finalDayInLosAngeles, 'America/Los_Angeles'),
  'final local day remains current after its score arrives',
)
assert(
  defaultTournamentView(wc2026, finalDayInLosAngeles, 'America/Los_Angeles') === 'day',
  'final local day defaults to Today',
)
assert(
  dayTabLabel(wc2026, finalDayInLosAngeles, 'America/Los_Angeles') === 'Today',
  'final local day keeps Today label',
)

const archiveDayInLosAngeles = new Date('2026-07-20T07:01:00Z')
assert(
  isTournamentArchived(wc2026, archiveDayInLosAngeles, 'America/Los_Angeles'),
  'day after final enters archive',
)
assert(
  defaultTournamentView(wc2026, archiveDayInLosAngeles, 'America/Los_Angeles') === 'bracket',
  'archive defaults to Knockouts',
)
assert(
  dayTabLabel(wc2026, archiveDayInLosAngeles, 'America/Los_Angeles') === 'Day',
  'archive relabels Today to Day',
)
assert(
  dayRailInitialDate(wc2026, archiveDayInLosAngeles, 'America/Los_Angeles') === '2026-07-19',
  'archive day rail opens final local matchday',
)

assert(
  defaultTournamentView(wc2022, archiveDayInLosAngeles, 'America/Los_Angeles') === 'bracket',
  'historical tournament defaults to Knockouts',
)

const finalDayInTokyo = new Date('2026-07-20T12:00:00Z')
assert(
  !isTournamentArchived(wc2026, finalDayInTokyo, 'Asia/Tokyo'),
  'Tokyo remains current on its July 20 final matchday',
)
assert(
  dayRailInitialDate(wc2026, new Date('2026-07-20T15:01:00Z'), 'Asia/Tokyo') ===
    '2026-07-20',
  'Tokyo archive opens its local final matchday',
)

const appSource = fs.readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')
const railSource = fs.readFileSync(new URL('./components/Rail.tsx', import.meta.url), 'utf8')

assert(
  appSource.includes('useState<View>(() => defaultTournamentView(baseTournament))'),
  'App initializes from tournament phase',
)
assert(
  appSource.includes('setTab(defaultTournamentView(tournaments[id]))'),
  'tournament switching resets to its phase default',
)
assert(appSource.includes('{dayTabLabel(t)}'), 'App renders the phase-aware day label')
assert(
  railSource.includes('const anchorDate = dayRailInitialDate(t, now)'),
  'Rail uses the phase-aware anchor date',
)
assert(
  railSource.includes("isTournamentArchived(t, now) ? 'Final day' : 'Today'"),
  'Rail uses an archive-safe return label',
)

console.log('navigation smoke tests passed')
