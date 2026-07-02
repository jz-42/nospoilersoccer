import { tournaments } from './index'
import { matchTint, teamColors } from './team-colors'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const HEX = /^#[0-9a-f]{6}$/

// Every team in every tournament must have a palette, or its modal renders
// untinted. This is the guard that keeps the table in step with the rosters.
for (const t of Object.values(tournaments)) {
  for (const id of Object.keys(t.teams)) {
    const palette = teamColors[id]
    assert(Boolean(palette), `${t.year}: ${id} (${t.teams[id].name}) has a color palette`)
    assert(
      palette[0] !== palette[1],
      `${id} primary and secondary differ (gives the side some depth)`,
    )
  }
}

for (const [id, palette] of Object.entries(teamColors)) {
  assert(HEX.test(palette[0]) && HEX.test(palette[1]), `${id} palette is two #rrggbb hexes`)
}

// matchTint only sets the variables for sides whose team is known, so an
// undecided knockout slot stays neutral until it's revealed.
const both = matchTint('GER', 'PAR')
assert(
  both['--home-1'] === teamColors.GER[0] && both['--away-1'] === teamColors.PAR[0],
  'a known matchup sets both home and away color vars',
)

const homeOnly = matchTint('BRA', null)
assert(
  homeOnly['--home-1'] === teamColors.BRA[0] && !('--away-1' in homeOnly),
  'a half-resolved matchup tints only the known side',
)

assert(Object.keys(matchTint(null, null)).length === 0, 'an unknown matchup yields no tint')

console.log('ALL PASS')
