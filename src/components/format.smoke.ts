import { eng1_2026 } from '../data/club/eng1-2026'
import { unl2026 } from '../data/nations/unl-2026'
import { wc2026 } from '../data/wc2026'
import { groupContextLabel } from '../navigation'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

assert(groupContextLabel(unl2026, 'A1') === 'Group A1', 'UNL label is the group name, league not repeated')
assert(groupContextLabel(wc2026, 'F') === 'Group F', 'World Cup group label is unchanged')
assert(groupContextLabel(eng1_2026, 'league') === null, 'single-table competition has no repeated chip')
