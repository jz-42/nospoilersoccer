import { renderToStaticMarkup } from 'react-dom/server'
import { unl2026 } from '../data/nations/unl-2026'
import type { Progress } from '../state/progress'
import { GroupStage } from './GroupStage'
import { groupDisplayName, sectionGroups } from './group-stage-helpers'

function assert(value: unknown, message: string) {
  if (!value) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const noop = () => {}
const progress: Progress = {
  marks: {}, revealed: new Set(), pins: new Set(), pinOrder: [], favorites: [],
  favAuto: true, spotlight: false, setMark: noop, unmark: noop, reveal: noop,
  togglePin: noop, setPinOrder: noop, toggleFavorite: noop, setFavorites: noop,
  setFavAuto: noop, setSpotlight: noop, catchUp: noop, reset: noop,
}

assert(sectionGroups(unl2026, 'A').map((group) => group.id).join() === 'A1,A2,A3,A4', 'League A has four groups')
assert(sectionGroups(unl2026, 'B').map((group) => group.id).join() === 'B1,B2,B3,B4', 'League B has four groups')
assert(sectionGroups(unl2026, 'D').map((group) => group.id).join() === 'D1,D2', 'League D has two groups')
assert(groupDisplayName(unl2026.groups[0]) === 'Group A1', 'explicit group labels render')

const html = renderToStaticMarkup(<GroupStage t={unl2026} progress={progress} onOpen={noop} />)
for (const league of ['League A', 'League B', 'League C', 'League D']) {
  assert(html.includes(`>${league}</button>`), `${league} tab renders`)
}
for (const group of ['A1', 'A2', 'A3', 'A4']) {
  assert(html.includes(`>Group ${group}</h3>`), `selected League A renders Group ${group}`)
}
assert(!html.includes('>Group B1</h3>') && !html.includes('>Group D1</h3>'), 'unselected league groups stay hidden')
assert(!html.includes('zone-qualify') && !html.includes('zone-playoff') && !html.includes('zone-drop'), 'unrevealed tables show no outcome bands')

console.log('GROUP STAGE TESTS PASS')
