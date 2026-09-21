# La Liga Highlight Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Add ESPN Deportes as an immediate, quota-bounded La Liga fallback, preserve ESPN FC preference, show the actual ESPN provider, and replace uncertain no-video copy with “Highlights pending.”

**Architecture:** The scheduler discovers both ESPN channels and routes candidates with explicit source IDs. The curator applies source-specific, fail-closed parsing and the existing one-cut invariant; a Deportes candidate checks ESPN FC’s newest page before acceptance. Optional publisher metadata reaches runtime state so the UI labels the actual source.

**Tech Stack:** TypeScript 6, React 19, Node smoke tests, GitHub Actions, Cloudflare Workers/D1/Queues, YouTube Atom feeds and Data API v3.

---

## File map

- src/data/types.ts and src/data/highlight-state.ts: publisher data and validation.
- src/components/highlight-copy.ts, PreviewCard.tsx, MatchModal.tsx, and HighlightPlayer.tsx: exact copy and provider labels.
- src/data/club/clubs.ts and scripts/curate-club-videos.ts: safe editorial-title matching, source routing, preference, and serialization.
- cloudflare-scheduler/highlights.mjs: fifth discovery source and quota bounds.
- curate-highlight.yml and update-results.yml: targeted routing and five-minute fallback.
- Corresponding smoke tests and docs/cloudflare-scheduler.md: regression and operating evidence.

### Task 1: Provider metadata, labels, and pending copy

**Files:**
- Modify: src/data/types.ts
- Modify: src/data/highlight-state.ts
- Modify: src/data/highlight-state.smoke.ts
- Create: src/components/highlight-copy.ts
- Create: src/components/highlight-copy.smoke.ts
- Modify: src/components/PreviewCard.tsx
- Modify: src/components/MatchModal.tsx
- Modify: src/components/HighlightPlayer.tsx
- Modify: src/components/HighlightPlayer.smoke.tsx
- Modify: package.json

- [ ] **Step 1: Write failing tests**

Add to the runtime-state smoke test:

~~~ts
const deportesPayload = {
  ...payload,
  matches: {
    'a-b': [{ youtubeId: 'abcdefghijk', kind: 'normal', publisher: 'espn-deportes' }],
  },
}
assert.deepEqual(parseRuntimeHighlightState(deportesPayload), deportesPayload)
assert.equal(
  parseRuntimeHighlightState({
    ...payload,
    matches: { 'a-b': [{ youtubeId: 'abcdefghijk', kind: 'normal', publisher: 'unknown' }] },
  }),
  null,
)
~~~

Add to the player smoke test:

~~~tsx
const espnFc = renderPlayer('esp1-home-away', [
  { youtubeId: 'espnfc00001', kind: 'normal', publisher: 'espn-fc' },
])
assert(espnFc.includes('Highlights (ESPN FC)'), 'ESPN FC publisher is explicit')

const deportes = renderPlayer('esp1-home-away', [
  { youtubeId: 'deportes001', kind: 'normal', publisher: 'espn-deportes' },
])
assert(deportes.includes('Highlights (ESPN Deportes)'), 'ESPN Deportes publisher is explicit')
~~~

Create highlight-copy.smoke.ts:

~~~ts
import assert from 'node:assert/strict'
import { FINISHED_PENDING_CARD_COPY, FINISHED_PENDING_MODAL_COPY } from './highlight-copy'

assert.equal(FINISHED_PENDING_CARD_COPY, 'Result in · highlights pending')
assert.equal(FINISHED_PENDING_MODAL_COPY, 'Highlights pending')
console.log('highlight pending copy smoke tests passed')
~~~

- [ ] **Step 2: Run tests and confirm failure**

~~~bash
npx tsx src/data/highlight-state.smoke.ts
npx tsx --tsconfig tsconfig.app.json src/components/HighlightPlayer.smoke.tsx
npx tsx --tsconfig tsconfig.app.json src/components/highlight-copy.smoke.ts
~~~

Expected: publisher is not accepted, the Deportes label is absent, and highlight-copy does not exist.

- [ ] **Step 3: Implement the minimum support**

Add:

~~~ts
export type YouTubeHighlightPublisher = 'espn-fc' | 'espn-deportes'

export interface YouTubeHighlightVideo extends HighlightVideoBase {
  source?: 'youtube'
  youtubeId: string
  publisher?: YouTubeHighlightPublisher
  foxId?: never
}
~~~

Validate publisher as undefined, espn-fc, or espn-deportes only for YouTube videos. Create:

~~~ts
export const FINISHED_PENDING_CARD_COPY = 'Result in · highlights pending'
export const FINISHED_PENDING_MODAL_COPY = 'Highlights pending'
~~~

Change highlightLabel to accept the video:

~~~ts
const PUBLISHER_LABEL = {
  'espn-fc': 'ESPN FC',
  'espn-deportes': 'ESPN Deportes',
} as const

export function highlightLabel(matchId: string, video: HighlightVideo): string {
  if ('publisher' in video && video.publisher) {
    return 'Highlights (' + PUBLISHER_LABEL[video.publisher] + ')'
  }
  const provider = Object.entries(CLUB_PROVIDER_BY_MATCH_PREFIX)
    .find(([prefix]) => matchId.startsWith(prefix))?.[1]
  return provider ? 'Highlights (' + provider + ')' : KIND_LABEL[video.kind]
}
~~~

Update all call sites to pass the video. Import the shared constants into PreviewCard and MatchModal. Add the copy smoke test to test:components.

- [ ] **Step 4: Run tests and confirm success**

~~~bash
npx tsx src/data/highlight-state.smoke.ts
npm run test:components
~~~

Expected: all runtime-state and component tests pass.

- [ ] **Step 5: Commit**

~~~bash
git add src/data/types.ts src/data/highlight-state.ts src/data/highlight-state.smoke.ts \
  src/components/highlight-copy.ts src/components/highlight-copy.smoke.ts \
  src/components/PreviewCard.tsx src/components/MatchModal.tsx \
  src/components/HighlightPlayer.tsx src/components/HighlightPlayer.smoke.tsx package.json
git commit -m "Show highlight publisher and pending copy"
~~~

### Task 2: ESPN Deportes parser and accepted-video metadata

**Files:**
- Modify: src/data/club/clubs.ts
- Modify: scripts/curate-club-videos.ts
- Modify: scripts/curate-club-videos.smoke.ts

- [ ] **Step 1: Write failing parser tests**

Add Getafe-Malaga and Villarreal-Levante to the test tournament, then add:

~~~ts
const deportes = CLUB_VIDEO_SOURCES.espndeportes
assert.deepEqual(
  sourcesForCompetition('esp1').map((source) => source.id),
  ['espnfc', 'espndeportes'],
)

const getafe = acceptCandidate({
  ...espnBase,
  source: deportes,
  channelId: deportes.channelId,
  id: 'VTqhYR74sHY',
  title: 'GETAFE VUELVE A LA VICTORIA tras imponerse 1-0 ante MÁLAGA con gol agónico de IVÁN AZÓN | La Liga',
  publishedAt: '2026-09-20T14:05:28Z',
})
assert(getafe.status === 'accept' && getafe.matchId === 'esp1-getafe-malaga')
assert(getafe.status === 'accept' && getafe.video.publisher === 'espn-deportes')
~~~

Add the corresponding Villarreal-Levante assertion using LAR13_KP79g. Add rejections for La Liga Al Día, a goal-only title, one club, three clubs, a non-La Liga suffix, and a wrong channel. Include the observed scoreless full-match title `LA REAL SOCIEDAD se quedó con la VICTORIA vs VALENCIA. Goles de Sucic, Soler y Barrenetxea | La Liga` as an acceptance case so the implementation cannot require a printed score. Assert ESPN FC acceptances carry espn-fc. Assert serialization preserves either publisher and never durationSeconds.

- [ ] **Step 2: Run the curator test and confirm failure**

~~~bash
npx tsx scripts/curate-club-videos.smoke.ts
~~~

Expected: espndeportes is undefined and publisher is not serialized.

- [ ] **Step 3: Add conservative mention matching and source definition**

Expose immutable normalized names and aliases from clubs.ts:

~~~ts
export const clubNameCandidates = Object.freeze(
  [...byNormalizedName.entries()].map(([normalized, id]) => ({ normalized, id })),
)
~~~

Add:

~~~ts
const ESPN_DEPORTES_LALIGA_RE = /\|\s*(?:Resumen\s*\|\s*)?La Liga\s*$/i
const ESPN_DEPORTES_SINGLE_PLAY_RE = /\b(?:marca|marcó|anota|anotó|amplía|descuenta|penal|tarjeta roja|atajada|salvada)\b/i
export const ESPN_DEPORTES_CHANNEL_ID = 'UC08mnbiC4FykqpHqbEWgFcg'
~~~

Pass the current tournament into the source parser/screening boundary. Require the La Liga suffix, reject single-play language, normalize the title, consider only name candidates belonging to the tournament, remove shorter overlapping matches, and require exactly two distinct IDs. Do not trust mention order as home/away. This accepts scoreless match summaries while rejecting the channel's individual goal/card/save clips.

Define espndeportes after espnfc with competitions ['esp1'] and scanDepth 100.

- [ ] **Step 4: Attach and serialize publisher metadata**

~~~ts
function publisherForSource(sourceId: string) {
  if (sourceId === 'espnfc') return 'espn-fc' as const
  if (sourceId === 'espndeportes') return 'espn-deportes' as const
  return undefined
}
~~~

Build the video with the optional publisher. In serializeVideo, append the validated publisher property using ordinary string concatenation and continue dropping durationSeconds.

- [ ] **Step 5: Run tests and confirm success**

~~~bash
npx tsx scripts/curate-club-videos.smoke.ts
npx tsx src/data/club-colors.smoke.ts
~~~

Expected: all existing and new fail-closed tests pass.

- [ ] **Step 6: Commit**

~~~bash
git add src/data/club/clubs.ts scripts/curate-club-videos.ts scripts/curate-club-videos.smoke.ts
git commit -m "Add ESPN Deportes La Liga fallback parser"
~~~

### Task 3: Source-aware targeted curation and provider preference

**Files:**
- Modify: scripts/curate-club-videos.ts
- Modify: scripts/curate-club-videos.smoke.ts
- Modify: .github/workflows/curate-highlight.yml
- Modify: scripts/update-workflow.smoke.ts

- [ ] **Step 1: Write failing routing and disposition tests**

~~~ts
assert.equal(resolveTargetSource('esp1', 'espnfc').id, 'espnfc')
assert.equal(resolveTargetSource('esp1', 'espndeportes').id, 'espndeportes')
assert.throws(() => resolveTargetSource('esp1', 'nbc'), /not trusted for esp1/)
assert.equal(targetDisposition({ status: 'skip', reason: 'already have a cut' }), 'accepted')
assert.equal(targetDisposition({ status: 'skip', reason: 'fixture not finished yet' }), 'retry')
assert.equal(
  targetDisposition({ status: 'skip', reason: 'more than one candidate fixture' }),
  'quarantined',
)
~~~

Extend update-workflow.smoke.ts to require an espndeportes input/case and persisted accepted, retry, or quarantined disposition.

- [ ] **Step 2: Run focused tests and confirm failure**

~~~bash
npx tsx scripts/curate-club-videos.smoke.ts
npx tsx scripts/update-workflow.smoke.ts
~~~

Expected: routing/disposition helpers and workflow routing are absent.

- [ ] **Step 3: Route targeted candidates by SOURCE_ID**

~~~ts
export function resolveTargetSource(competitionId: string, sourceId: string): ClubVideoSource {
  const source = CLUB_VIDEO_SOURCES[sourceId]
  if (!source || !source.competitions.includes(competitionId)) {
    throw new Error('source ' + sourceId + ' is not trusted for ' + competitionId)
  }
  return source
}
~~~

For --video-id runs, require SOURCE_ID and load metadata using only that channel. Remove the exactly-one-source assumption. Add validated --source and --scan-depth controls for bounded non-targeted scans.

- [ ] **Step 4: Enforce ESPN FC preference at decision time**

When a targeted Deportes candidate passes, list at most 50 ESPN FC uploads. Screen titles before metadata calls and stop when an accepted candidate maps to the same match. Choose ESPN FC if found; otherwise choose Deportes immediately. Do not sleep or create a grace window.

Test the injected helper:

~~~ts
assert.equal(await choosePreferredCandidate(deportesCandidate, [espnFcCandidate]), espnFcCandidate)
assert.equal(await choosePreferredCandidate(deportesCandidate, []), deportesCandidate)
~~~

Also test that an existing ESPN FC cut causes a later Deportes candidate to return the already-covered disposition without appending or replacing the stored video.

- [ ] **Step 5: Report permanent versus transient outcomes**

When HIGHLIGHT_RESULT_FILE is set, write accepted, retry, or quarantined. Treat already-covered as accepted, early/transient metadata or embedding uncertainty as retry, and permanent channel/title/ambiguity failures as quarantined.

Add:

~~~yaml
options:
  - fox
  - golazo
  - nbc
  - espnfc
  - espndeportes
~~~

Route both ESPN sources to the La Liga curator:

~~~bash
espnfc|espndeportes)
  npx tsx scripts/curate-club-videos.ts --competition esp1 --video-id "$VIDEO_ID"
  ;;
~~~

If no diff exists and the exact video is not already persisted, report the result-file value instead of unconditional retry.

- [ ] **Step 6: Run tests and confirm success**

~~~bash
npx tsx scripts/curate-club-videos.smoke.ts
npx tsx scripts/update-workflow.smoke.ts
~~~

Expected: routing, preference, and disposition assertions pass.

- [ ] **Step 7: Commit**

~~~bash
git add scripts/curate-club-videos.ts scripts/curate-club-videos.smoke.ts \
  .github/workflows/curate-highlight.yml scripts/update-workflow.smoke.ts
git commit -m "Route La Liga highlights by provider"
~~~

### Task 4: Scheduler discovery and quota bounds

**Files:**
- Modify: cloudflare-scheduler/highlights.mjs
- Modify: cloudflare-scheduler/highlights.test.mjs
- Modify: docs/cloudflare-scheduler.md

- [ ] **Step 1: Write failing scheduler tests**

~~~js
const deportes = HIGHLIGHT_SOURCES.find((source) => source.id === 'espndeportes')
assert.equal(deportes.channelId, 'UC08mnbiC4FykqpHqbEWgFcg')
assert.equal(deportes.scanDepth, 100)
assert.equal(HIGHLIGHT_SOURCES.length, 5)
assert.equal(new Set(HIGHLIGHT_SOURCES.map((source) => source.channelId)).size, 5)
assert.equal(deepScanPageCost(HIGHLIGHT_SOURCES), 27)
assert.equal(projectedDailyBaseCost(HIGHLIGHT_SOURCES), 648)
assert.equal(isPotentialHighlight('espndeportes', GETAFE_TITLE), true)
assert.equal(isPotentialHighlight('espndeportes', VILLARREAL_TITLE), true)
assert.equal(isPotentialHighlight('espndeportes', SCORELESS_REAL_SOCIEDAD_TITLE), true)
assert.equal(isPotentialHighlight('espndeportes', 'La Liga Al Día: debate'), false)
assert.equal(isPotentialHighlight('espndeportes', SINGLE_GOAL_CLIP_TITLE), false)
~~~

Update feed/API fixtures for all five sources and assert the 8,000-unit reservation prevents overspend.

- [ ] **Step 2: Run Worker tests and confirm failure**

~~~bash
node --test cloudflare-scheduler/highlights.test.mjs
~~~

Expected: fifth-source and revised quota assertions fail.

- [ ] **Step 3: Register source and strict prefilter**

~~~js
{
  id: 'espndeportes',
  label: 'ESPN Deportes',
  channelId: 'UC08mnbiC4FykqpHqbEWgFcg',
  playlistId: 'UU08mnbiC4FykqpHqbEWgFcg',
  scanDepth: 100,
}
~~~

Use an exact final La Liga marker plus a source-specific single-play exclusion. Do not require a printed score because ESPN Deportes publishes legitimate scoreless-title match summaries:

~~~js
espndeportes: /\|\s*(?:Resumen\s*\|\s*)?La Liga\s*$/i,
~~~

In isPotentialHighlight, return false for ESPN Deportes titles matching the same single-play vocabulary used by the curator. The curator remains the final exact-club and fixture gate.

Keep Atom/WebSub discovery quota-free and preserve hard quota reservation and degradation.

- [ ] **Step 4: Document quota behavior**

Document five zero-unit feeds, 27 units per complete hourly deep sweep, bounded five-minute GitHub recovery, depth 100 for Deportes, and the 8,000-unit hard stop.

- [ ] **Step 5: Run tests and confirm success**

~~~bash
node --test cloudflare-scheduler/highlights.test.mjs
node --test cloudflare-scheduler/index.test.mjs
~~~

Expected: both Worker suites pass with five-source concurrency and quota assertions.

- [ ] **Step 6: Commit**

~~~bash
git add cloudflare-scheduler/highlights.mjs cloudflare-scheduler/highlights.test.mjs \
  docs/cloudflare-scheduler.md
git commit -m "Discover ESPN Deportes highlights safely"
~~~

### Task 5: Five-minute API recovery without broad rescans

**Files:**
- Modify: scripts/curate-club-videos.ts
- Modify: .github/workflows/update-results.yml
- Modify: scripts/update-workflow.smoke.ts

- [ ] **Step 1: Write a failing cadence assertion**

~~~ts
assert.match(
  workflow,
  /if \[ "\$cycle" -eq 1 \]; then[\s\S]*?curate-club-videos\.ts --competition "\$competition"[\s\S]*?else[\s\S]*?--competition esp1 --source espndeportes --scan-depth 50/,
  'later cycles run only the bounded La Liga fallback scan',
)
~~~

Add a curator assertion that scan depth 50 makes no more than one playlist request.

- [ ] **Step 2: Run tests and confirm failure**

~~~bash
npx tsx scripts/update-workflow.smoke.ts
npx tsx scripts/curate-club-videos.smoke.ts
~~~

Expected: later cycles still skip every club scan.

- [ ] **Step 3: Add bounded later-cycle recovery**

Retain cycle-one deep scans. In later cycles run esp1 only:

~~~bash
club_step "$season fallback videos" "$season" "$CLUB_BACKUP_ROOT/$season-fallback-videos" \
  npx tsx scripts/curate-club-videos.ts \
    --competition esp1 --source espndeportes --scan-depth 50
~~~

Before listing, skip the request when no finished fixture lacks a cut. Keep validation, highlight-state rebuilding, staging, and push within club_step.

One page per five-minute cycle costs at most 288 units/day. Hourly depth 100 adds only one page beyond that hour’s shallow request, about 24 units/day. Candidate metadata remains small, keeping the approved increase near 300–350 units/day.

- [ ] **Step 4: Run tests and confirm success**

~~~bash
npx tsx scripts/update-workflow.smoke.ts
npx tsx scripts/curate-club-videos.smoke.ts
~~~

Expected: hourly deep and bounded later-cycle recovery are pinned.

- [ ] **Step 5: Commit**

~~~bash
git add scripts/curate-club-videos.ts .github/workflows/update-results.yml scripts/update-workflow.smoke.ts
git commit -m "Recover missing La Liga highlights every five minutes"
~~~

### Task 6: Full verification, integration, deployment, and backfill

**Files:**
- Verify: all modified files
- Generated after curation: src/data/club/esp1-2026-videos.ts
- Generated after curation: public/api/highlights/esp1-2026.json

- [ ] **Step 1: Synchronize with origin/main**

~~~bash
git fetch origin
git merge --no-edit origin/main
~~~

Expected: a clean merge or conflicts limited to current automated data. Preserve newest origin/main results and rerun generators; never discard user changes.

- [ ] **Step 2: Run full local verification**

~~~bash
npm run build
npm run lint
node --test cloudflare-scheduler/highlights.test.mjs
node --test cloudflare-scheduler/index.test.mjs
git diff --check
~~~

Expected: every command exits 0.

- [ ] **Step 3: Inspect integration**

~~~bash
git status --short
git diff origin/main...HEAD --stat
git diff origin/main...HEAD --check
~~~

Commit only necessary integration adjustments with message Integrate La Liga fallback with current data.

- [ ] **Step 4: Push, open a PR, and wait for checks**

~~~bash
git push -u origin HEAD
gh pr create --base main --title "Add ESPN Deportes La Liga highlight fallback" \
  --body "Adds quota-bounded ESPN Deportes fallback ingestion, exact provider labels, and pending-state copy."
gh pr checks --watch
~~~

Expected: checks pass and the diff remains limited to approved scope.

- [ ] **Step 5: Merge and deploy the Worker**

~~~bash
gh pr merge --merge --delete-branch=false
git fetch origin
npx wrangler deploy --config cloudflare-scheduler/wrangler.toml
~~~

Expected: nospoilersoccer-scheduler deploys with the one-minute cron.

- [ ] **Step 6: Trigger authoritative backfill**

~~~bash
gh workflow run update-results.yml --ref main
gh run list --workflow update-results.yml --limit 1
~~~

Monitor until cycle one persists a preferred ESPN FC cut or these fallback IDs:

~~~text
VTqhYR74sHY  Getafe-Malaga
LAR13_KP79g  Villarreal-Levante
~~~

Fallback entries must carry publisher espn-deportes.

- [ ] **Step 7: Verify production**

~~~bash
curl --fail --silent --show-error https://nospoilersoccer.com/ >/dev/null
curl --fail --silent --show-error \
  https://nospoilersoccer-scheduler.jerryzhan42.workers.dev/health
curl --fail --silent --show-error \
  https://nospoilersoccer-scheduler.jerryzhan42.workers.dev/api/highlights/esp1-2026
~~~

Inspect production JSON and both matches. Verify Highlights (ESPN Deportes) when fallback won, Highlights pending for a finished match without a cut, scheduler recognition of the fifth feed, no queue storm, no repeated quarantined candidate, and quota below guardrails.

- [ ] **Step 8: Record fresh evidence**

Report PR/merged commit, Worker deployment version, backfilled IDs, exact tests, quota reading, and endpoint status. Do not claim completion before all evidence is current.
