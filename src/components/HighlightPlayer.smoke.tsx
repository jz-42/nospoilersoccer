import { renderToStaticMarkup } from 'react-dom/server'
import type { HighlightVideo } from '../data/types'
import { HighlightPlayer } from './HighlightPlayer'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const renderPlayer = (matchId: string, videos: HighlightVideo[]) =>
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

const worldCup = renderPlayer('A1', [
  { youtubeId: 'quick-video', kind: 'normal', durationSeconds: 300 },
  { youtubeId: 'extended-video', kind: 'extended', durationSeconds: 900 },
])
assert(worldCup.includes('Quick Highlights'), 'World Cup keeps its quick label')
assert(worldCup.includes('Extended Highlights'), 'World Cup keeps its extended label')

console.log('ALL HIGHLIGHT PLAYER TESTS PASS')
