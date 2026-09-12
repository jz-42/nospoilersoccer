/**
 * The leg pager in the match modal.
 *
 * The rule under test is the one that makes a two-legged tie spoiler-safe:
 * opening either leg shows both slides, but leg 2 renders nothing about itself
 * — not its teams, not its score — until leg 1 has been marked. The slide is
 * visible and disabled rather than hidden, so finishing leg 1 doesn't make a
 * control appear out of nowhere.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { twoLeggedFixture } from '../logic/ties-fixture'
import type { Progress } from '../state/progress'
import { MatchModal } from './MatchModal'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
  console.log(`ok - ${msg}`)
}

const t = twoLeggedFixture()
const leg1 = t.knockoutRounds[0].matches[0]
const leg2 = t.knockoutRounds[0].matches[1]
const groupMarks = Object.fromEntries(t.groupMatches.map((m) => [m.id, 'watched' as const]))

const progressWith = (marks: Record<string, 'watched' | 'skipped'>): Progress =>
  ({
    marks,
    revealed: new Set<string>(),
    pins: new Set<string>(),
    favorites: new Set<string>(),
    favAuto: true,
    mark: () => {},
    unmark: () => {},
    forceReveal: () => {},
    togglePin: () => {},
    toggleFavorite: () => {},
    setFavAuto: () => {},
    catchUp: () => {},
    reset: () => {},
  }) as unknown as Progress

const render = (match: typeof leg1, marks: Record<string, 'watched' | 'skipped'>) =>
  renderToStaticMarkup(
    <MatchModal
      t={t}
      target={{ kind: 'knockout', match, roundName: 'Semi-final' }}
      progress={progressWith(marks)}
      onClose={() => {}}
    />,
  )

// --- before leg 1 is marked ------------------------------------------------

const sealed = render(leg1, groupMarks)
assert(sealed.includes('Leg 1') && sealed.includes('Leg 2'), 'both legs are listed')
assert(
  sealed.includes('Watch the first leg to open this'),
  'leg 2 explains why it is closed rather than just being dead',
)
assert(/Leg 2\b/.test(sealed) && sealed.includes('disabled'), 'leg 2 is disabled')
assert(!sealed.includes('2–1'), 'leg 1 score is hidden while unmarked')

// Opening leg 2 directly must not bypass the gate — the Today rail can link
// straight to it, since each leg lands on its own day.
const direct = render(leg2, groupMarks)
assert(!direct.includes('1–1'), 'opening leg 2 directly still hides its score')

// --- after leg 1 is marked -------------------------------------------------

const opened = render(leg2, { ...groupMarks, 'sf-1-l1': 'watched' })
assert(!opened.includes('Watch the first leg to open this'), 'leg 2 opens once leg 1 is marked')
assert(!opened.includes('1–1'), 'unlocking leg 2 does not by itself reveal its score')

// Unlocking is permission to open; marking is what reveals. Both are required.
const watched = render(leg2, { ...groupMarks, 'sf-1-l1': 'watched', 'sf-1-l2': 'watched' })
assert(watched.includes('1–1'), 'leg 2 shows its score once it is unlocked and marked')

const single = renderToStaticMarkup(
  <MatchModal
    t={t}
    target={{ kind: 'knockout', match: t.knockoutRounds[1].matches[0], roundName: 'Final' }}
    progress={progressWith(groupMarks)}
    onClose={() => {}}
  />,
)
assert(!single.includes('modal-legs'), 'a single-leg match shows no pager at all')

console.log('ALL LEG PAGER TESTS PASS')
