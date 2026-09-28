import { clubColors } from './club-colors'
import { clubs } from './club/clubs'
import { tournaments } from './index'
import { nationalTeams } from './national-teams'
import { matchTint, paletteFor, separation, teamColors } from './team-colors'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const HEX = /^#[0-9a-f]{6}$/

// Every team the site can show must have a palette, or its modal renders
// untinted. This is the guard that keeps the tables in step with the rosters.
//
// Club seasons are lazy chunks and `tournaments` only holds what ships in the
// bundle, so they can't be reached the way the World Cup is. The shared club
// registry is the roster instead — every club in it plays somewhere, and a
// club in two competitions is one entry, so checking it covers all of them.
// Nations League is lazy for the same reason, so every national team is
// checked through the shared registry too.
const rosters: [string, Record<string, { name: string }>][] = [
  ...Object.values(tournaments).map(
    (t) => [String(t.year), t.teams] as [string, Record<string, { name: string }>],
  ),
  ['national', nationalTeams],
  ['clubs', clubs],
]
for (const [label, teams] of rosters) {
  for (const id of Object.keys(teams)) {
    const palette = paletteFor(id)
    assert(Boolean(palette), `${label}: ${id} (${teams[id].name}) has a color palette`)
    assert(
      palette![0] !== palette![1],
      `${id} primary and secondary differ (gives the side some depth)`,
    )
  }
}

for (const [id, palette] of [...Object.entries(teamColors), ...Object.entries(clubColors)]) {
  assert(HEX.test(palette[0]) && HEX.test(palette[1]), `${id} palette is two #rrggbb hexes`)
}

// The two tables are merged by one lookup, so a shared key would silently
// shadow a country. Countries are uppercase codes and clubs lowercase slugs,
// which makes that impossible — assert it rather than trust it.
for (const id of Object.keys(clubColors)) {
  assert(teamColors[id] === undefined, `club id ${id} does not collide with a country code`)
}

// matchTint only sets the variables for sides whose team is known, so an
// undecided knockout slot stays neutral until it's revealed.
const both = matchTint('PAR', 'FRA')
assert(
  both['--home-1'] === teamColors.PAR[0] && both['--away-1'] === teamColors.FRA[0],
  'a distinct matchup keeps both primaries as field colors',
)

// Clash rule: when both fields would read as one colour, one side moves to
// another colour it wears (its cap then shows the lead) so the matchup always
// renders as two colours — the Apple Sports alternate-kit behavior. What
// survives the wash is hue, so a maroon against a red is a clash however far
// apart their lightness.
const espAut = matchTint('ESP', 'AUT')
assert(espAut['--home-1'] === teamColors.ESP[0], 'Spain–Austria (red vs red): Spain is pinned to its red')
assert(
  espAut['--away-1'] === teamColors.AUT[1] && espAut['--away-2'] === teamColors.AUT[0],
  'Austria moves to its white, cap flips to red',
)

const usaBih = matchTint('USA', 'BIH')
assert(
  usaBih['--home-1'] !== usaBih['--away-1'],
  'USA–Bosnia (blue vs blue) resolves to two distinct fields',
)

const qatSui = matchTint('QAT', 'SUI')
assert(
  qatSui['--home-1'] === teamColors.QAT[0] && qatSui['--away-1'] === teamColors.SUI[1],
  'Qatar–Switzerland (dark maroon vs bright red) is one red under the wash, so Switzerland goes white',
)

// Pinned leads are the colours a side would look wrong without: the other
// side moves, even at home.
const srbNed = matchTint('SRB', 'NED')
assert(
  srbNed['--home-1'] === teamColors.SRB[1] && srbNed['--away-1'] === teamColors.NED[0],
  'Serbia–Netherlands: the Dutch stay orange, Serbia moves to blue',
)

// Every national pairing, both ways round, reads as two colours.
const nations = Object.keys(teamColors)
let clashes = 0
for (const home of nations) {
  for (const away of nations) {
    if (home === away) continue
    const tint = matchTint(home, away)
    if (separation(tint['--home-1'], tint['--away-1']) < 1) {
      console.error(`  ${home} v ${away} -> ${tint['--home-1']} / ${tint['--away-1']}`)
      clashes += 1
    }
  }
}
assert(clashes === 0, `all ${nations.length * (nations.length - 1)} national pairings resolve to two colours`)

const homeOnly = matchTint('BRA', null)
assert(
  homeOnly['--home-1'] === teamColors.BRA[0] && !('--away-1' in homeOnly),
  'a half-resolved matchup tints only the known side',
)

assert(Object.keys(matchTint(null, null)).length === 0, 'an unknown matchup yields no tint')

console.log('ALL PASS')
