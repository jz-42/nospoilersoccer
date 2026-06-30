# Live Match Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add spoiler-safe source-driven `Live` and `Delayed` match badges that update on the GitHub Action's 5-minute cadence without affecting result reveal rules or other updater steps.

**Architecture:** Extend the match data model with a small source-status overlay stored separately from user progress, then add an isolated updater pass that reads ESPN scoreboard state and writes only live-status fields. Reuse one shared UI formatter so preview cards, match tiles, bracket pills, and the modal all render the same spoiler-safe badge behavior and override the existing unrevealed badge only while a source status is active.

**Tech Stack:** TypeScript, React 19, Vite, TSX smoke tests, GitHub Actions

---

## File Structure

- Modify: `src/data/types.ts`
  Defines the persistent match data shape. Add a narrow live-status type shared by group and knockout matches.
- Modify: `src/data/validate.ts`
  Reject invalid stored live-status values and keep validation centralized.
- Create: `scripts/update-live-status-lib.ts`
  Pure helpers for matching source statuses to tournament matches and applying status edits safely.
- Create: `scripts/update-live-status.ts`
  Top-level status updater script, parallel to `scripts/update-results.ts`.
- Create: `scripts/update-live-status.smoke.ts`
  Covers source-state mapping, per-match isolation, and source-text application.
- Modify: `scripts/espn.ts`
  Parse the source status fields already present on the ESPN scoreboard into a small internal status shape.
- Modify: `.github/workflows/update-results.yml`
  Insert an isolated live-status step with backup/rollback and spoiler-free audit handling.
- Modify: `package.json`
  Add the new smoke test to `test:logic` and `check:update`.
- Modify: `src/components/status.ts`
  Extend the shared match-state/status helper so UI surfaces can ask for a source-status overlay separately from existing progress state.
- Create: `src/components/live-status.tsx`
  Shared badge renderer for `Live` and `Delayed`.
- Modify: `src/components/PreviewCard.tsx`
- Modify: `src/components/MatchTile.tsx`
- Modify: `src/components/Bracket.tsx`
- Modify: `src/components/MatchModal.tsx`
  Each surface should render the shared live-status badge and suppress the normal unrevealed badge when active.
- Modify: `src/App.css`
  Add the blinking green dot, delayed indicator, and badge variants.

### Task 1: Add Persistent Live-Status Data And Validation

**Files:**
- Modify: `src/data/types.ts`
- Modify: `src/data/validate.ts`
- Test: `src/data/schedule.smoke.ts`

- [ ] **Step 1: Write the failing validation smoke assertions**

Add these assertions near the other dataset-shape checks in `src/data/schedule.smoke.ts`:

```ts
import { validateTournament } from './validate'
import { tournaments } from '.'

const statusTournament = structuredClone(tournaments.wc2026)
statusTournament.groupMatches[0].liveStatus = { kind: 'live' }
assert(
  validateTournament(statusTournament).length === 0,
  'valid liveStatus passes tournament validation',
)

const invalidStatusTournament = structuredClone(tournaments.wc2026)
invalidStatusTournament.groupMatches[0].liveStatus = { kind: 'stalled' as 'live' }
assert(
  validateTournament(invalidStatusTournament).some((msg) => msg.includes('invalid liveStatus')),
  'invalid liveStatus is rejected by validation',
)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx src/data/schedule.smoke.ts`
Expected: FAIL with a TypeScript error for missing `liveStatus` on the match type or a validation assertion failure.

- [ ] **Step 3: Add the minimal data-model and validator support**

In `src/data/types.ts`, add the shared type and optional property on both match kinds:

```ts
export type MatchLiveStatus = { kind: 'live' } | { kind: 'delayed' }

export interface GroupMatch {
  // ...
  liveStatus?: MatchLiveStatus
  score?: Score
}

export interface KnockoutMatch {
  // ...
  liveStatus?: MatchLiveStatus
  score?: Score
}
```

In `src/data/validate.ts`, validate only the two supported stored values:

```ts
const liveStatus = m.liveStatus
if (
  liveStatus !== undefined &&
  liveStatus.kind !== 'live' &&
  liveStatus.kind !== 'delayed'
) {
  err(`match ${m.id}: invalid liveStatus ${(liveStatus as { kind: string }).kind}`)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx src/data/schedule.smoke.ts`
Expected: PASS, including the new live-status validation assertions.

- [ ] **Step 5: Commit**

```bash
git add src/data/types.ts src/data/validate.ts src/data/schedule.smoke.ts
git commit -m "feat: add live status data model"
```

### Task 2: Build A Pure Live-Status Updater With Per-Match Isolation

**Files:**
- Modify: `scripts/espn.ts`
- Create: `scripts/update-live-status-lib.ts`
- Create: `scripts/update-live-status.ts`
- Test: `scripts/update-live-status.smoke.ts`

- [ ] **Step 1: Write the failing smoke test for source mapping and isolation**

Create `scripts/update-live-status.smoke.ts` with these focused checks:

```ts
import { parseEvent, type EspnEvent } from './espn'
import {
  applyParsedStatuses,
  summarizeLiveStatusAudit,
  type ParsedLiveStatusEvent,
} from './update-live-status-lib'
import { tournaments } from '../src/data'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const liveEvent = {
  date: '2026-06-30T01:00Z',
  competitions: [
    {
      competitors: [
        { homeAway: 'home', team: { id: '1', displayName: 'Netherlands' } },
        { homeAway: 'away', team: { id: '2', displayName: 'Morocco' } },
      ],
      status: { type: { completed: false, detail: "48'", shortDetail: "48'", state: 'in' } },
    },
  ],
} as EspnEvent

const parsedLive = parseEvent(tournaments.wc2026, liveEvent)
assert(parsedLive?.liveStatus?.kind === 'live', 'ESPN in-progress state maps to live')

const delayedEvent = {
  ...liveEvent,
  competitions: [
    {
      ...liveEvent.competitions[0],
      status: { type: { completed: false, detail: 'Delayed', shortDetail: 'Delayed', state: 'pre' } },
    },
  ],
} as EspnEvent

const parsedDelayed = parseEvent(tournaments.wc2026, delayedEvent)
assert(parsedDelayed?.liveStatus?.kind === 'delayed', 'delayed feed detail maps to delayed')

const sourceText = `
export const tournament = {
  groupMatches: [
    { id: 'BROKEN', group: 'A', matchday: 1, date: '2026-06-10', home: 'NED', away: 'MOR' },
    { id: 'OK', group: 'A', matchday: 2, date: '2026-06-10', home: 'BRA', away: 'JPN' },
  ],
}
`

const applied = applyParsedStatuses({
  sourceText,
  events: [
    { matchId: 'BROKEN', liveStatus: { kind: 'live' } } as ParsedLiveStatusEvent,
    { matchId: 'OK', liveStatus: { kind: 'delayed' } } as ParsedLiveStatusEvent,
  ],
})

assert(applied.updatedIds.includes('OK'), 'a later clean status still applies after an earlier failure')
assert(
  applied.audit.some((entry) => entry.code === 'live_status_apply_failed' && entry.matchId === 'BROKEN'),
  'per-match live-status apply failure becomes a spoiler-free audit entry',
)
assert(
  applied.sourceText.includes(`liveStatus: { kind: 'delayed' }`),
  'successful live-status writes update source text',
)

const summary = summarizeLiveStatusAudit(applied.audit)
assert(summary.includes('live_status_apply_failed'), 'audit summary includes spoiler-free error codes')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/update-live-status.smoke.ts`
Expected: FAIL because `ParsedLiveStatusEvent`, `applyParsedStatuses`, or `parseEvent(...).liveStatus` does not exist yet.

- [ ] **Step 3: Implement minimal parser and pure updater helpers**

In `scripts/espn.ts`, extend the status types and parsing:

```ts
export interface EspnEvent {
  // ...
  competitions: {
    // ...
    status: { type: { completed: boolean; detail: string; shortDetail?: string; state?: string } }
  }[]
}

function parseLiveStatus(detail: string, state?: string): MatchLiveStatus | undefined {
  if (state === 'in') return { kind: 'live' }
  if (/delay|suspend|postpone/i.test(detail)) return { kind: 'delayed' }
  return undefined
}

export interface ParsedEvent {
  // ...
  liveStatus?: MatchLiveStatus
}

const detail = comp.status.type.detail ?? ''
const state = comp.status.type.state
const liveStatus = parseLiveStatus(detail, state)
if (liveStatus) out.liveStatus = liveStatus
```

Create `scripts/update-live-status-lib.ts` with pure source-text replacement and spoiler-free audit records:

```ts
export interface LiveStatusAuditEntry {
  code:
    | 'live_status_apply_failed'
    | 'live_status_unmapped_match'
    | 'live_status_fetch_failed'
  day: string
  matchId?: string
  note?: string
}

export interface ParsedLiveStatusEvent {
  matchId: string
  liveStatus?: MatchLiveStatus
}

export function applyParsedStatuses({
  sourceText,
  events,
}: {
  sourceText: string
  events: ParsedLiveStatusEvent[]
}): { sourceText: string; updatedIds: string[]; audit: LiveStatusAuditEntry[] } {
  // Replace or remove the `liveStatus` property on one object at a time.
}
```

Create `scripts/update-live-status.ts` parallel to `scripts/update-results.ts`:

```ts
export async function runUpdateLiveStatus({
  today = new Date().toISOString().slice(0, 10),
  liveStatusAuditFile = process.env.LIVE_STATUS_AUDIT_FILE,
}: {
  today?: string
  liveStatusAuditFile?: string
} = {}) {
  const pending = [
    ...t.groupMatches.filter((match) => match.date <= today),
    ...t.knockoutRounds.flatMap((round) => round.matches).filter((match) => match.date <= today),
  ]
  // fetch scoreboard days, map parsed events to tournament ids, apply statuses, write audit summary
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/update-live-status.smoke.ts`
Expected: PASS for live mapping, delayed mapping, and per-match isolation assertions.

- [ ] **Step 5: Commit**

```bash
git add scripts/espn.ts scripts/update-live-status-lib.ts scripts/update-live-status.ts scripts/update-live-status.smoke.ts
git commit -m "feat: add live status updater"
```

### Task 3: Wire The Live-Status Step Into The Workflow Without Cross-Step Leakage

**Files:**
- Modify: `.github/workflows/update-results.yml`
- Modify: `package.json`
- Test: `scripts/update-live-status.smoke.ts`

- [ ] **Step 1: Add a failing workflow/command expectation**

First update `package.json` so CI expects the new smoke test:

```json
{
  "scripts": {
    "test:logic": "tsx src/logic/spoilers.smoke.ts && ... && tsx scripts/update-results.smoke.ts && tsx scripts/update-live-status.smoke.ts && tsx scripts/curate-entertainment.smoke.ts",
    "check:update": "npm run validate:data && tsx src/data/videos.smoke.ts && tsx scripts/update-results.smoke.ts && tsx scripts/update-live-status.smoke.ts && tsc -b"
  }
}
```

- [ ] **Step 2: Run the updater check to verify it fails before workflow wiring**

Run: `npm run check:update`
Expected: FAIL if the new smoke test has not been added or if the live-status updater still violates validation.

- [ ] **Step 3: Insert the isolated workflow step**

In `.github/workflows/update-results.yml`, add a dedicated backup/audit block after results and before odds:

```yaml
          LIVE_STATUS_AUDIT_FILE: /tmp/live-status-audit.md
          LIVE_STATUS_BACKUP_FILE: /tmp/wc2026-before-live-status.ts
```

```yaml
            rm -f "$LIVE_STATUS_AUDIT_FILE"
            cp src/data/wc2026.ts "$LIVE_STATUS_BACKUP_FILE"
            if npx tsx scripts/update-live-status.ts; then
              if [ -f "$LIVE_STATUS_AUDIT_FILE" ]; then
                {
                  echo "### Live status audit — cycle $cycle"
                  cat "$LIVE_STATUS_AUDIT_FILE"
                  echo
                } >> "$GITHUB_STEP_SUMMARY"
              fi
              if ! (npm run validate:data && npx tsx scripts/update-live-status.smoke.ts && npx tsc -b); then
                echo "::warning::live-status validation failed; discarding live-status changes for this cycle"
                cp "$LIVE_STATUS_BACKUP_FILE" src/data/wc2026.ts
              fi
            else
              echo "::warning::live-status step errored; discarding live-status changes for this cycle"
              cp "$LIVE_STATUS_BACKUP_FILE" src/data/wc2026.ts
            fi
```

Keep it independent:

- do not touch video backups here
- do not set the global curator error flag on live-status failure
- let later odds/video/entertainment steps continue

- [ ] **Step 4: Run checks to verify it passes**

Run: `npm run check:update`
Expected: PASS, including the new live-status smoke test.

- [ ] **Step 5: Commit**

```bash
git add package.json .github/workflows/update-results.yml
git commit -m "feat: isolate live status workflow updates"
```

### Task 4: Render Shared Live-Status Badges Across All Match Surfaces

**Files:**
- Create: `src/components/live-status.tsx`
- Modify: `src/components/status.ts`
- Modify: `src/components/PreviewCard.tsx`
- Modify: `src/components/MatchTile.tsx`
- Modify: `src/components/Bracket.tsx`
- Modify: `src/components/MatchModal.tsx`
- Modify: `src/App.css`
- Test: `src/components/schedule.smoke.ts`
- Test: `src/components/disclosures.smoke.tsx`

- [ ] **Step 1: Write the failing component smoke assertions**

Add badge assertions to `src/components/schedule.smoke.ts` and `src/components/disclosures.smoke.tsx`:

```ts
const liveMatch = {
  ...played2026,
  score: undefined,
  videos: undefined,
  liveStatus: { kind: 'live' as const },
}
const liveMarkup = renderToStaticMarkup(
  <MatchTile t={tournaments.wc2026} m={liveMatch} progress={emptyProgress} onOpen={() => {}} />,
)
assert(liveMarkup.includes('Live'), 'live match tile shows Live badge')
assert(liveMarkup.includes('live-status-dot'), 'live match tile renders blinking status dot')
assert(!liveMarkup.includes('FT'), 'live match tile suppresses FT badge')
```

```tsx
const delayedModalMarkup = renderToStaticMarkup(
  <MatchModal
    t={tournaments.wc2026}
    target={{ kind: 'group', match: { ...upcoming2026, liveStatus: { kind: 'delayed' } } }}
    progress={progress}
    onClose={() => {}}
  />,
)
assert(delayedModalMarkup.includes('Delayed'), 'modal shows delayed badge')
assert(!delayedModalMarkup.includes('0–0'), 'modal does not show a score for delayed matches')
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx src/components/schedule.smoke.ts`
Expected: FAIL because no shared live-status renderer or badge text exists yet.

Run: `npx tsx --tsconfig tsconfig.app.json src/components/disclosures.smoke.tsx`
Expected: FAIL because the modal does not render delayed status yet.

- [ ] **Step 3: Add the minimal shared UI implementation**

Create `src/components/live-status.tsx`:

```tsx
import type { MatchLiveStatus } from '../data/types'

export function LiveStatusBadge({ status, className = '' }: { status: MatchLiveStatus; className?: string }) {
  const label = status.kind === 'live' ? 'Live' : 'Delayed'
  return (
    <span className={`live-status-badge live-status-${status.kind} ${className}`.trim()}>
      <span className="live-status-dot" aria-hidden="true" />
      <span>{label}</span>
    </span>
  )
}
```

In `src/components/status.ts`, keep `MatchState` unchanged and add an overlay helper:

```ts
import type { MatchLiveStatus } from '../data/types'

export function matchLiveStatus(target: ModalTarget): MatchLiveStatus | undefined {
  return target.match.liveStatus
}
```

Then wire it into each surface:

```tsx
const liveStatus = matchLiveStatus(target)
const badge =
  liveStatus ? (
    <LiveStatusBadge status={liveStatus} />
  ) : state === 'watch' || state === 'ft' ? (
    'FT'
  ) : state === 'upcoming' ? (
    <KickoffTime kickoff={m.kickoff} />
  ) : state === 'locked' ? (
    'Locked'
  ) : null
```

Use the same override rule in `PreviewCard.tsx`, `MatchTile.tsx`, `Bracket.tsx`, and `MatchModal.tsx`. In `MatchModal.tsx`, place the badge in the context/meta area, not in the score slot.

Add the CSS treatment in `src/App.css`:

```css
.live-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.live-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
}

.live-status-live .live-status-dot {
  background: #2fd06f;
  box-shadow: 0 0 10px rgba(47, 208, 111, 0.8);
  animation: live-status-pulse 1.1s ease-in-out infinite;
}

.live-status-delayed .live-status-dot {
  background: #f0a43a;
  box-shadow: 0 0 8px rgba(240, 164, 58, 0.45);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx src/components/schedule.smoke.ts`
Expected: PASS, including the new live badge assertions.

Run: `npx tsx --tsconfig tsconfig.app.json src/components/disclosures.smoke.tsx`
Expected: PASS, including delayed modal assertions.

- [ ] **Step 5: Commit**

```bash
git add src/components/live-status.tsx src/components/status.ts src/components/PreviewCard.tsx src/components/MatchTile.tsx src/components/Bracket.tsx src/components/MatchModal.tsx src/App.css src/components/schedule.smoke.ts src/components/disclosures.smoke.tsx
git commit -m "feat: show live status badges"
```

### Task 5: Run Full Verification

**Files:**
- Modify: none
- Test: repo-wide verification only

- [ ] **Step 1: Run updater-focused verification**

Run: `npm run check:update`
Expected: PASS, including data validation, result smoke tests, live-status smoke tests, and typecheck.

- [ ] **Step 2: Run app logic and component verification**

Run: `npm run test:logic`
Expected: PASS, including the new `scripts/update-live-status.smoke.ts`.

Run: `npm run test:components`
Expected: PASS, including live badge rendering assertions.

- [ ] **Step 3: Run the full repository check**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Inspect the final diff**

Run: `git diff --stat origin/main...HEAD`
Expected: shows only the planned live-status data, updater, workflow, UI, and test changes.

- [ ] **Step 5: Commit any final verification-only fixes**

```bash
git add .
git commit -m "test: verify live status workflow end to end"
```

## Plan Self-Review

- Spec coverage: data model, source-driven status mapping, no score leakage, per-match isolation, step isolation, spoiler-free logging, and 5-minute polling behavior are all covered by Tasks 1-5.
- Placeholder scan: no `TODO`, `TBD`, or "similar to above" instructions remain.
- Type consistency: the plan consistently uses `liveStatus`, `MatchLiveStatus`, `LiveStatusBadge`, `applyParsedStatuses`, and `runUpdateLiveStatus`.
