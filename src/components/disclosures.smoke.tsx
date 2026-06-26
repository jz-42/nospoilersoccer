import { renderToStaticMarkup } from 'react-dom/server'
import { tournaments } from '../data'
import type { GroupMatch } from '../data/types'
import type { Progress } from '../state/progress'
import { DisclosureContent, Onboarding } from './Dialogs'
import { MatchModal } from './MatchModal'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const noop = () => {}
const emptyProgress: Progress = {
  marks: {},
  revealed: new Set(),
  pins: new Set(),
  favorites: [],
  favAuto: true,
  setMark: noop,
  unmark: noop,
  reveal: noop,
  togglePin: noop,
  toggleFavorite: noop,
  moveFavorite: noop,
  setFavAuto: noop,
  reset: noop,
}

const onboarding = renderToStaticMarkup(<Onboarding onClose={noop} />)
const privacy = renderToStaticMarkup(<DisclosureContent disclosure="privacy" />)
const advanced = renderToStaticMarkup(<DisclosureContent disclosure="advanced" />)

assert(
  privacy.includes('Your preferences are saved locally in your browser.'),
  'Privacy explains that preferences remain local',
)
assert(
  privacy.includes('This site uses anonymous Umami analytics'),
  'Privacy explains anonymous analytics',
)
assert(
  privacy.includes('No cookies, persistent IDs, user profiles'),
  'Privacy explains what is not stored, profiled, or sold',
)
assert(
  (privacy.match(/<p>/g) ?? []).length === 3,
  'Privacy is grouped into three paragraphs',
)
assert(
  (advanced.match(/<p>/g) ?? []).length === 3,
  'Advanced is grouped into three paragraphs',
)
assert(
  !privacy.includes('Progress, favorites, and settings stay in this browser'),
  'Privacy omits the superseded disclosure copy',
)

assert(
  onboarding.includes('Click a match to watch its highlights, then click to reveal the result.'),
  'onboarding includes the revised highlight explanation',
)
assert(
  onboarding.includes('aria-expanded="false">Privacy</button>'),
  'onboarding includes a collapsed Privacy disclosure',
)
assert(
  onboarding.includes('aria-expanded="false">Advanced</button>'),
  'onboarding includes a collapsed Advanced disclosure',
)
assert(
  onboarding.indexOf("Let&#x27;s go") < onboarding.indexOf('>Privacy</button>'),
  'onboarding disclosures appear below the primary button',
)
assert(
  onboarding.indexOf('>Privacy</button>') < onboarding.indexOf('>Advanced</button>'),
  'onboarding footer places Privacy before Advanced',
)
assert(
  !onboarding.includes('Your preferences are saved locally in your browser.'),
  'onboarding disclosure copy is hidden by default',
)

const warning = 'Videos from FOX Sports may only be available in the U.S.'
const wc2026 = tournaments.wc2026
const played2026 = wc2026.groupMatches.find(
  (match): match is GroupMatch => Boolean(match.score && match.videos?.length),
)
if (!played2026) throw new Error('Fixture error: expected a played 2026 match with highlights')

const renderMatch = (match: GroupMatch, progress: Progress = emptyProgress) =>
  renderToStaticMarkup(
    <MatchModal
      t={wc2026}
      target={{ kind: 'group', match }}
      progress={progress}
      onClose={noop}
    />,
  )

assert(
  renderMatch(played2026).includes(warning),
  'FOX warning appears before a 2026 result is revealed',
)
assert(
  renderMatch(played2026, {
    ...emptyProgress,
    marks: { [played2026.id]: 'watched' },
  }).includes(warning),
  'FOX warning appears after a 2026 result is revealed',
)

const upcoming2026 = wc2026.groupMatches.find((match) => !match.score && !match.videos?.length)
if (!upcoming2026) throw new Error('Fixture error: expected an upcoming 2026 match without highlights')
assert(
  !renderMatch(upcoming2026).includes(warning),
  'FOX warning does not appear for an upcoming match without highlights',
)

const wc2022 = tournaments.wc2022
const played2022 = wc2022.groupMatches.find((match) => Boolean(match.score && match.videos?.length))
if (!played2022) throw new Error('Fixture error: expected a played 2022 match with highlights')
const historical = renderToStaticMarkup(
  <MatchModal
    t={wc2022}
    target={{ kind: 'group', match: played2022 }}
    progress={emptyProgress}
    onClose={noop}
  />,
)
assert(!historical.includes(warning), 'FOX warning is restricted to the 2026 tournament')

console.log('ALL PASS')
