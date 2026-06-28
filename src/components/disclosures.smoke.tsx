import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { tournaments } from '../data'
import type { GroupMatch, KnockoutMatch } from '../data/types'
import type { Progress } from '../state/progress'
import { DisclosureContent, Onboarding } from './Dialogs'
import { MatchModal } from './MatchModal'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const noop = () => {}
const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
const appCss = readFileSync(new URL('../App.css', import.meta.url), 'utf8')

function googleCalendarDateTime(instant: string | Date, timeZone = localTimeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant instanceof Date ? instant : new Date(instant))
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}${value('month')}${value('day')}T${value('hour')}${value('minute')}${value('second')}`
}

function googleCalendarWindow(
  kickoff: string,
  durationMinutes: number,
  timeZone = localTimeZone,
) {
  const start = new Date(kickoff)
  const end = new Date(start.getTime() + durationMinutes * 60_000)
  return `${googleCalendarDateTime(start, timeZone)}/${googleCalendarDateTime(end, timeZone)}`
}

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
  catchUp: noop,
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

const wc2026 = tournaments.wc2026
const group2026Source = wc2026.groupMatches.find(
  (match): match is GroupMatch => Boolean(match.kickoff),
)
if (!group2026Source) throw new Error('Fixture error: expected a 2026 group match with kickoff data')
const played2026: GroupMatch = {
  ...group2026Source,
  score: { home: 3, away: 2 },
  goals: [],
  videos: [{ youtubeId: 'fixture-video', kind: 'normal', durationSeconds: 300 }],
}
const experimentWithEntertainment: GroupMatch = {
  ...played2026,
  entertainmentSummary: 'Lively and open-feeling, with enough rhythm to sound more engaging than routine.',
  entertainmentRating: 4,
}
const hiddenGoalCountCopy = `${played2026.score!.home + played2026.score!.away} total goals`

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
  !renderMatch(played2026).includes('Videos from the FOX Sports YouTube channel may only be available in the U.S.'),
  'FOX warning is not shown by default for a 2026 highlight',
)
assert(
  !renderMatch(played2026).includes('Add to Google Calendar'),
  'played match modal does not show the Google Calendar control',
)
assert(
  Boolean(experimentWithEntertainment.entertainmentSummary),
  'test fixture includes entertainment summary data',
)
assert(
  experimentWithEntertainment.entertainmentRating === 4,
  'test fixture includes entertainment rating data',
)
const preRevealExperiment = renderMatch(experimentWithEntertainment)
assert(
  preRevealExperiment.includes('AI Watchability Rating'),
  'pre-reveal experiment match includes the entertainment disclosure label',
)
assert(
  !preRevealExperiment.includes('<p class="modal-disclosure-copy"><div'),
  'entertainment disclosure content does not render invalid paragraph markup',
)
assert(
  preRevealExperiment.includes('class="modal-disclosure-trigger"'),
  'pre-reveal experiment match uses a dedicated disclosure trigger control',
)
assert(
  preRevealExperiment.includes('Total Goals'),
  'pre-reveal experiment match includes the total-goals disclosure label',
)
assert(
  !preRevealExperiment.includes('Lively and open-feeling, with enough rhythm to sound more engaging than routine.'),
  'pre-reveal entertainment summary copy is hidden by default',
)
assert(
  !preRevealExperiment.includes('Entertainment rating'),
  'pre-reveal entertainment rating content is hidden by default',
)
assert(
  !preRevealExperiment.includes(hiddenGoalCountCopy),
  'pre-reveal total-goals disclosure content is hidden by default',
)
assert(
  /\.modal-close\s*\{[\s\S]*?width:\s*52px;[\s\S]*?height:\s*52px;/.test(appCss),
  'desktop modal close control is substantially larger',
)
assert(
  /\.modal\s*\{[\s\S]*?padding:\s*24px 28px 14px;/.test(appCss),
  'desktop modal uses tighter vertical padding',
)
assert(
  !preRevealExperiment.includes('class="modal-close modal-close-compact"'),
  'highlight-ready modals keep the larger desktop close control',
)
assert(
  /\.modal-close-icon\s*\{[\s\S]*?width:\s*20px;[\s\S]*?height:\s*20px;/.test(appCss),
  'desktop modal close icon scales with the larger close control',
)
assert(
  /\.modal-close-compact\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/.test(appCss),
  'no-highlight modals use a slightly smaller desktop close control',
)
assert(
  /\.modal-pre-reveal-stack\s*\{[\s\S]*?gap:\s*10px;[\s\S]*?margin-top:\s*0;/.test(appCss),
  'desktop pre-reveal stack uses tighter neutral spacing',
)
assert(
  /\.modal-pre-reveal-cta\s*\{[\s\S]*?order:\s*2;[\s\S]*?margin-top:\s*0;/.test(appCss),
  'desktop pre-reveal CTA returns below the disclosures',
)
assert(
  /\.modal-pre-reveal-disclosures\s*\{[\s\S]*?order:\s*1;/.test(appCss),
  'desktop disclosures sit above the pre-reveal CTA',
)
const noHighlightExperiment: GroupMatch = {
  ...experimentWithEntertainment,
  videos: undefined,
}
const noHighlightPreReveal = renderMatch(noHighlightExperiment)
assert(
  noHighlightPreReveal.includes('class="modal-close modal-close-compact"'),
  'no-highlight ready modals use the compact close control',
)
assert(
  /\.modal-disclosure-bar\s*\{[\s\S]*?padding:\s*9px 12px;/.test(appCss),
  'disclosure bars use tighter vertical padding',
)
assert(
  /\.player-poster\s*\{[\s\S]*?min-height:\s*150px;/.test(appCss),
  'highlight poster height is reduced to 150px',
)
const revealedExperiment = renderMatch(experimentWithEntertainment, {
  ...emptyProgress,
  marks: { [experimentWithEntertainment.id]: 'watched' },
})
assert(
  !revealedExperiment.includes('AI Watchability Rating'),
  'revealed experiment match hides the entertainment disclosure block',
)
assert(
  !revealedExperiment.includes('Total Goals'),
  'revealed experiment match hides the total-goals disclosure block',
)
assert(
  !renderMatch(played2026, {
    ...emptyProgress,
    marks: { [played2026.id]: 'watched' },
  }).includes('Videos from the FOX Sports YouTube channel may only be available in the U.S.'),
  'FOX warning stays out of revealed 2026 highlights by default',
)

const upcoming2026: GroupMatch = {
  ...group2026Source,
  kickoff: '2099-06-01T18:00:00Z',
  score: undefined,
  goals: undefined,
  videos: undefined,
  entertainmentSummary: undefined,
  entertainmentRating: undefined,
  odds: undefined,
}
const upcoming2026Markup = renderMatch(upcoming2026)
const upcomingTitle = `${wc2026.teams[upcoming2026.home].name} vs ${wc2026.teams[upcoming2026.away].name}`
const upcomingTitleQuery = new URLSearchParams({ text: upcomingTitle }).toString().replace('text=', '')
const upcomingWindowQuery = new URLSearchParams({
  dates: googleCalendarWindow(upcoming2026.kickoff!, 120),
})
  .toString()
  .replace('dates=', '')
const upcomingTimeZoneQuery = new URLSearchParams({ ctz: localTimeZone }).toString().replace('ctz=', '')
assert(
  !upcoming2026Markup.includes('Videos from the FOX Sports YouTube channel may only be available in the U.S.'),
  'FOX warning does not appear for an upcoming match without highlights',
)
assert(
  !upcoming2026Markup.includes('Watch live on FOX'),
  'upcoming match modal no longer shows the FOX live CTA',
)
assert(
  upcoming2026Markup.includes('Add to Google Calendar'),
  'upcoming group match modal shows the Google Calendar control',
)
assert(
  upcoming2026Markup.includes(upcomingTitleQuery),
  'upcoming group match calendar link includes a minimalist match title',
)
assert(
  upcoming2026Markup.includes(upcomingWindowQuery),
  'upcoming group match calendar link uses a two-hour local-time event window',
)
assert(
  upcoming2026Markup.includes(upcomingTimeZoneQuery),
  'upcoming group match calendar link includes the viewer local timezone',
)
assert(
  !upcoming2026Markup.includes('Pre-match odds'),
  'future unrevealed match without odds does not show the odds bar',
)

const pastKickoffSnapshot2026: GroupMatch = {
  ...upcoming2026,
  kickoff: '2000-06-01T18:00:00Z',
  odds: { home: 0.44, draw: 0.28, away: 0.28, url: 'https://polymarket.com/event/test-snapshot' },
}
const pastKickoffSnapshotMarkup = renderMatch(pastKickoffSnapshot2026)
assert(
  pastKickoffSnapshot2026.odds !== undefined,
  'test fixture includes snapshot odds data',
)
assert(
  pastKickoffSnapshotMarkup.includes('Pre-match odds'),
  'past-kickoff unrevealed match still shows snapshotted pre-match odds',
)
assert(
  !pastKickoffSnapshotMarkup.includes('Polymarket'),
  'past-kickoff unrevealed match hides the Polymarket source link',
)

const upcomingKnockoutRound = wc2026.knockoutRounds.find((round) =>
  round.matches.some((match) => Boolean(match.kickoff)),
)
if (!upcomingKnockoutRound) {
  throw new Error('Fixture error: expected a 2026 knockout round with kickoff data')
}
const upcomingKnockoutSource = upcomingKnockoutRound.matches.find(
  (match): match is KnockoutMatch => Boolean(match.kickoff),
)
if (!upcomingKnockoutSource) {
  throw new Error('Fixture error: expected a 2026 knockout match with kickoff data')
}
const upcomingKnockout: KnockoutMatch = {
  ...upcomingKnockoutSource,
  kickoff: '2099-07-01T20:00:00Z',
  score: undefined,
  goals: undefined,
  penalties: undefined,
  afterExtraTime: undefined,
  videos: undefined,
  entertainmentSummary: undefined,
  entertainmentRating: undefined,
}
const upcomingKnockoutMarkup = renderToStaticMarkup(
  <MatchModal
    t={wc2026}
    target={{ kind: 'knockout', match: upcomingKnockout, roundName: upcomingKnockoutRound.name }}
    progress={emptyProgress}
    onClose={noop}
  />,
)
const upcomingKnockoutWindowQuery = new URLSearchParams({
  dates: googleCalendarWindow(upcomingKnockout.kickoff!, 150),
})
  .toString()
  .replace('dates=', '')
assert(
  upcomingKnockoutMarkup.includes('Add to Google Calendar'),
  'upcoming knockout modal shows the Google Calendar control',
)
assert(
  upcomingKnockoutMarkup.includes(upcomingKnockoutWindowQuery),
  'upcoming knockout calendar link uses a two-and-a-half-hour local-time event window',
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
assert(
  !historical.includes('Videos from the FOX Sports YouTube channel may only be available in the U.S.'),
  'FOX warning does not appear for 2022 highlights',
)

console.log('ALL PASS')
