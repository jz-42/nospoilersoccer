import { clubColors } from './club-colors'
import { clubs } from './club/clubs'
import { tournaments } from './index'
import { matchTint, paletteFor, teamColors } from './team-colors'

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
const rosters: [string, Record<string, { name: string }>][] = [
  ...Object.values(tournaments).map(
    (t) => [String(t.year), t.teams] as [string, Record<string, { name: string }>],
  ),
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

// Collision rule: when both primaries read as the same color, one side drops
// to its secondary (its cap shows the primary instead) so the matchup always
// renders as two colors — the Apple Sports alternate-kit behavior.
const espAut = matchTint('ESP', 'AUT')
assert(
  espAut['--home-1'] === teamColors.ESP[1] && espAut['--home-2'] === teamColors.ESP[0],
  'Spain–Austria (red vs red) moves Spain to gold, cap flips to red',
)
assert(espAut['--away-1'] === teamColors.AUT[0], 'Austria keeps its red field')

const usaBih = matchTint('USA', 'BIH')
assert(
  usaBih['--home-1'] !== usaBih['--away-1'],
  'USA–Bosnia (blue vs blue) resolves to two distinct fields',
)

const qatSui = matchTint('QAT', 'SUI')
assert(
  qatSui['--home-1'] === teamColors.QAT[0] && qatSui['--away-1'] === teamColors.SUI[0],
  'Qatar–Switzerland (dark maroon vs bright red) is distinct enough to keep both primaries',
)

const homeOnly = matchTint('BRA', null)
assert(
  homeOnly['--home-1'] === teamColors.BRA[0] && !('--away-1' in homeOnly),
  'a half-resolved matchup tints only the known side',
)

assert(Object.keys(matchTint(null, null)).length === 0, 'an unknown matchup yields no tint')

console.log('ALL PASS')
