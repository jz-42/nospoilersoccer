import { renderToStaticMarkup } from 'react-dom/server'
import type { HighlightVideo } from '../data/types'
import { HighlightPlayer } from './HighlightPlayer'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const renderPlayer = (
  matchId: string,
  videos: HighlightVideo[],
  opts?: { archive?: boolean },
) =>
  renderToStaticMarkup(
    <HighlightPlayer
      videos={videos}
      tournamentYear={2026}
      tournamentPhase="group"
      marked={false}
      onReveal={() => {}}
      matchId={matchId}
      homeName="Home"
      awayName="Away"
      archive={opts?.archive}
    />,
  )

for (const [matchId, provider] of [
  ['eng1-home-away', 'NBC'],
  ['esp1-home-away', 'ESPN'],
  ['ucl-home-away', 'CBS'],
] as const) {
  const html = renderPlayer(matchId, [{ youtubeId: `${provider}-video`, kind: 'extended' }])
  assert(html.includes(`Highlights (${provider})`), `${matchId} labels its official provider`)
  assert(!html.includes('Quick Highlights'), `${matchId} does not call a club cut quick`)
  assert(!html.includes('Extended Highlights'), `${matchId} does not call a club cut extended`)
}

const espnFc = renderPlayer('esp1-home-away', [
  { youtubeId: 'espnfc00001', kind: 'normal', publisher: 'espn-fc' },
])
assert(espnFc.includes('Highlights (ESPN FC)'), 'ESPN FC publisher is explicit')

const deportes = renderPlayer('esp1-home-away', [
  { youtubeId: 'deportes001', kind: 'normal', publisher: 'espn-deportes' },
])
assert(deportes.includes('Highlights (ESPN Deportes)'), 'ESPN Deportes publisher is explicit')

const tudn = renderPlayer('unl-401861041', [
  { youtubeId: 'VW2NXp9RaOE', kind: 'normal', publisher: 'tudn', durationSeconds: 886 },
])
assert(tudn.includes('Highlights (TUDN)'), 'TUDN USA publisher is explicit')

const englishAndTudn = renderPlayer('unl-401861041', [
  { youtubeId: 'VW2NXp9RaOE', kind: 'normal', publisher: 'tudn', durationSeconds: 902 },
  { youtubeId: 'english00001', kind: 'extended' },
])
assert(englishAndTudn.includes('Highlights (FOX)'), 'an unlabeled national-team cut is FOX')
assert(!englishAndTudn.includes('Extended Highlights'), 'a live national-team cut is not called extended')
assert(!englishAndTudn.includes('poster-time'), 'the poster does not reveal a runtime')
assert(englishAndTudn.includes('data-highlight="youtube:english00001"'), 'the poster opens on the English cut')
assert(!englishAndTudn.includes('Highlights (TUDN)'), 'the TUDN backup waits in the menu, not on the poster')
assert(englishAndTudn.includes('aria-haspopup="listbox"'), 'two sources make the caption a source menu')

const sameChannel = renderPlayer('unl-401861041', [
  { youtubeId: 'foxnormal001', kind: 'normal' },
  { youtubeId: 'foxextend001', kind: 'extended' },
])
assert(!sameChannel.includes('poster-caption-btn'), 'two lengths from one channel share a poster, no menu')
assert(sameChannel.includes('data-highlight="youtube:foxextend001"'), 'the longer English cut is the one that poster plays')

const worldCup = renderPlayer(
  'A1',
  [
    { youtubeId: 'quick-video', kind: 'normal', durationSeconds: 300 },
    { youtubeId: 'extended-video', kind: 'extended', durationSeconds: 900 },
  ],
  { archive: true },
)
assert(worldCup.includes('Extended Highlights'), 'World Cup archive keeps its extended label')
assert(worldCup.includes('aria-haspopup="listbox"'), 'World Cup quick cut waits in the menu')
assert(worldCup.includes('data-highlight="youtube:extended-video"'), 'archive poster opens on the extended cut')
assert(!worldCup.includes('poster-time'), 'archive poster does not reveal a runtime')

console.log('ALL HIGHLIGHT PLAYER TESTS PASS')
