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

const archiveDayInLosAngeles = new Date('2026-07-20T07:01:00Z')
assert(
  isTournamentArchived(wc2026, archiveDayInLosAngeles, 'America/Los_Angeles'),
  'day after final enters archive',
)

// Every competition, in every phase, opens on the same tab under the same
// name. An archived tournament used to open on its bracket or its final
// table — which is the ending, handed to someone who has not watched it.
assert(defaultTournamentView() === 'day', 'every competition defaults to the day rail')
assert(dayTabLabel() === 'Today', 'the day rail is called Today everywhere')

assert(
  dayRailInitialDate(wc2026, finalDayInLosAngeles, 'America/Los_Angeles') === '2026-07-19',
  'a live tournament opens on the local today',
)
assert(
  dayRailInitialDate(wc2026, archiveDayInLosAngeles, 'America/Los_Angeles') === '2026-06-11',
  'archive day rail opens the first local matchday, not the last',
)
assert(
  dayRailInitialDate(wc2022, archiveDayInLosAngeles, 'America/Los_Angeles') === '2022-11-20',
  'a historical tournament also opens at its first matchday',
)

const finalDayInTokyo = new Date('2026-07-20T12:00:00Z')
assert(
  !isTournamentArchived(wc2026, finalDayInTokyo, 'Asia/Tokyo'),
  'Tokyo remains current on its July 20 final matchday',
)
assert(
  dayRailInitialDate(wc2026, new Date('2026-07-20T15:01:00Z'), 'Asia/Tokyo') === '2026-06-12',
  'Tokyo archive opens its own local first matchday',
)

const appSource = fs.readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')
const railSource = fs.readFileSync(new URL('./components/Rail.tsx', import.meta.url), 'utf8')

assert(
  appSource.includes('useState<View>(defaultTournamentView)'),
  'App initializes on the day rail',
)
assert(
  appSource.includes('key={seasonId}'),
  'switching season remounts, so the tab resets to the day rail',
)
assert(
  appSource.includes('availableViews(t).map('),
  'App derives its tabs from the competition shape',
)
assert(appSource.includes('dayTabLabel()'), 'App renders the shared day label')
assert(appSource.includes('tableTabLabel(t)'), 'App renders the shape-aware table label')
assert(
  railSource.includes('const anchorDate = dayRailInitialDate(t, now)'),
  'Rail uses the phase-aware anchor date',
)
assert(
  railSource.includes("isTournamentArchived(t, now) ? 'First day' : 'Today'"),
  'Rail names its anchor after where the archive actually opens',
)

console.log('navigation smoke tests passed')
