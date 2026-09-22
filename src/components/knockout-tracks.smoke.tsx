import { renderToStaticMarkup } from 'react-dom/server'
import { unl2026 } from '../data/nations/unl-2026'
import type { Progress } from '../state/progress'
import { KnockoutTracks, PendingStageCard, roundsForTrack } from './KnockoutTracks'

function assert(value: unknown, message: string) {
  if (!value) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

assert(
  roundsForTrack(unl2026, 'championship').every((round) => ['qf', 'sf', 'third-place', 'final'].includes(round.id)),
  'championship rounds are isolated',
)
assert(
  roundsForTrack(unl2026, 'promotion').every((round) => ['ab-playoff', 'bc-playoff'].includes(round.id)),
  'promotion/relegation rounds are isolated',
)

const pending = unl2026.knockoutTracks![0].pendingStages![0]
const pendingHtml = renderToStaticMarkup(<PendingStageCard stage={pending} />)
assert(pendingHtml.includes('Draw pending'), 'pending stages state that the draw is pending')
assert(pendingHtml.includes('25–30 Mar 2027'), 'pending stages show their match window')
assert(pendingHtml.includes('League A group winners'), 'pending stages show qualification pools')
assert(!pendingHtml.includes(' vs '), 'pending stages invent no pairing')

const noop = () => {}
const progress: Progress = {
  marks: {}, revealed: new Set(), pins: new Set(), pinOrder: [], favorites: [],
  favAuto: true, spotlight: false, setMark: noop, unmark: noop, reveal: noop,
  togglePin: noop, setPinOrder: noop, toggleFavorite: noop, setFavorites: noop,
  setFavAuto: noop, setSpotlight: noop, catchUp: noop, reset: noop,
}
const shell = renderToStaticMarkup(<KnockoutTracks t={unl2026} progress={progress} onOpen={noop} />)
assert(shell.includes('>Championship</button>'), 'championship track tab renders')
assert(shell.includes('>Promotion / relegation</button>'), 'promotion/relegation track tab renders')
assert(shell.includes('Quarter-finals'), 'the selected championship renders its pending stages')
assert(!shell.includes('League A/B play-offs'), 'the unselected track stays isolated')

console.log('KNOCKOUT TRACK TESTS PASS')
