# Club Highlight Player Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give club matches one provider-labelled highlight experience, remove all active OpenAI-backed automation, and preserve title masking in fullscreen without obscuring broadcast score graphics.

**Architecture:** `HighlightPlayer` derives a neutral label from the stable match-id competition prefix, leaving World Cup kind labels unchanged. YouTube remains sealed by fullscreening the wrapper, but the custom fullscreen control moves to the lower-right and the title mask uses a fixed height. Curators keep only official-source and fixture-assignment checks; the workflow no longer exposes or invokes OpenAI-backed steps.

**Tech Stack:** React 19, TypeScript, CSS fullscreen API, Node/tsx smoke tests, GitHub Actions, Vite.

---

### Task 1: Neutral club labels

**Files:**
- Create: `src/components/HighlightPlayer.smoke.tsx`
- Modify: `src/components/HighlightPlayer.tsx`
- Modify: `package.json`

- [ ] **Step 1: Write the failing label test**

Render `HighlightPlayer` with one YouTube video and match ids beginning `eng1-`, `esp1-`, `ucl-`, and `A1`. Assert the club posters contain `Highlights (NBC)`, `Highlights (ESPN)`, and `Highlights (CBS)` with neither `Quick` nor `Extended`; assert the World Cup fixtures retain `Quick Highlights` and `Extended Highlights`.

- [ ] **Step 2: Run the test and verify RED**

Run: `npx tsx --tsconfig tsconfig.app.json src/components/HighlightPlayer.smoke.tsx`

Expected: FAIL because every normal video is currently labelled `Quick Highlights`.

- [ ] **Step 3: Implement one label function**

Add and use this function for posters, toggles, iframe titles, and the opaque title seal:

```ts
const CLUB_PROVIDER_BY_MATCH_PREFIX = {
  'eng1-': 'NBC',
  'esp1-': 'ESPN',
  'ucl-': 'CBS',
} as const

export function highlightLabel(matchId: string, kind: HighlightVideo['kind']): string {
  const provider = Object.entries(CLUB_PROVIDER_BY_MATCH_PREFIX)
    .find(([prefix]) => matchId.startsWith(prefix))?.[1]
  return provider ? `Highlights (${provider})` : KIND_LABEL[kind]
}
```

Add the smoke test to `test:components` in `package.json`.

- [ ] **Step 4: Run the focused and component tests**

Run: `npx tsx --tsconfig tsconfig.app.json src/components/HighlightPlayer.smoke.tsx && npm run test:components`

Expected: PASS.

- [ ] **Step 5: Commit only Task 1 files**

```bash
git add src/components/HighlightPlayer.tsx src/components/HighlightPlayer.smoke.tsx package.json
git commit -m "Simplify club highlight labels"
```

### Task 2: Fullscreen mask and control placement

**Files:**
- Modify: `src/components/disclosures.smoke.tsx`
- Modify: `src/components/HighlightPlayer.tsx`
- Modify: `src/App.css` (player selectors only; preserve unrelated working-tree edits)

- [ ] **Step 1: Write failing semantic regressions**

Replace the percentage-height assertion with checks that:

```ts
assert(
  /\.player-titlebar\s*\{[\s\S]*?height:\s*var\(--player-title-mask-height\);/.test(appCss),
  'the title mask uses a fixed measured height',
)
assert(
  !/\.player-titlebar\s*\{[\s\S]*?height:\s*clamp\(/.test(appCss),
  'fullscreen cannot scale the title mask with viewport height',
)
assert(
  /\.player-expand\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?right:\s*10px;[\s\S]*?bottom:\s*10px;/.test(appCss),
  'the custom fullscreen control occupies the familiar lower-right position',
)
assert(
  playerSource.indexOf('className="player-titlebar"') < playerSource.indexOf('className="player-expand"'),
  'the fullscreen control is a sibling after the title mask rather than inside it',
)
```

- [ ] **Step 2: Run and verify RED**

Run: `npx tsx --tsconfig tsconfig.app.json src/components/disclosures.smoke.tsx`

Expected: FAIL on fixed mask height and lower-right button placement.

- [ ] **Step 3: Implement the minimal layout fix**

Move `.player-expand` outside `.player-titlebar` in JSX. Set `--player-title-mask-height: 48px` on `.player-wrap`, use it directly for `.player-titlebar`, remove the 22px fade extension, and position `.player-expand` absolutely at `right: 10px; bottom: 10px; z-index: 3`. Keep `fs=0`, removal of `allowfullscreen`, and the wrapper fullscreen behavior unchanged.

- [ ] **Step 4: Run focused tests and inspect at normal size**

Run: `npx tsx --tsconfig tsconfig.app.json src/components/disclosures.smoke.tsx && npm run test:components`

Expected: PASS.

- [ ] **Step 5: Stage only this task's CSS hunk and component/test files**

Use a generated patch containing only the `.player-wrap`, `.player-titlebar`, `.player-titlebar::after`, and `.player-expand` hunks with `git apply --cached`; do not stage the pre-existing header/card/layout edits in `src/App.css`. Then stage the two component files and commit:

```bash
git add src/components/HighlightPlayer.tsx src/components/disclosures.smoke.tsx
git diff --cached --check
git commit -m "Keep fullscreen title mask compact"
```

### Task 3: Remove AI video and entertainment automation

**Files:**
- Modify: `.github/workflows/update-results.yml`
- Modify: `scripts/curate-videos.ts`
- Modify: `scripts/curate-videos.smoke.ts`
- Modify: `scripts/curate-club-videos.ts`
- Modify: `scripts/curate-club-videos.smoke.ts`
- Modify: `package.json`
- Delete: `scripts/spoiler-check.ts`
- Delete: `scripts/notify-ai-rejections.ts`
- Delete: `scripts/notify-ai-rejections.smoke.ts`
- Delete: `scripts/curate-entertainment.ts`
- Delete: `scripts/curate-entertainment.smoke.ts`
- Delete: `scripts/curate-ai-rejections.json`

- [ ] **Step 1: Add failing no-AI and prefixed-title tests**

In `curate-videos.smoke.ts`, assert previously skipped reasons containing `AI rejected` or `title failed spoiler check` are retryable and remove imports/assertions belonging to `spoiler-check.ts`. In `curate-club-videos.smoke.ts`, change the ESPN editorial-prefix case to expect a successful normalized screen result. Add a repository-source assertion that the active workflow and curator entrypoints contain none of `OPENAI_API_KEY`, `checkVideoForSpoilers`, or `curate-entertainment`.

- [ ] **Step 2: Run and verify RED**

Run: `npx tsx scripts/curate-videos.smoke.ts && npx tsx scripts/curate-club-videos.smoke.ts`

Expected: FAIL because historical AI/title rejection reasons remain permanent and ESPN editorial prefixes are rejected.

- [ ] **Step 3: Remove AI from the World Cup curator**

Remove the spoiler-check import, AI-rejection state/reporting, AI hold branch, and title-wording rejection from `curate-videos.ts`. Keep official FOX source validation, team parsing, one-fixture matching, publication timing, duration-kind inference, and embeddability. Mark old AI/title rejection reasons retryable so a fresh cycle can reconsider those uploads.

- [ ] **Step 4: Allow club editorial titles without spoiler judgment**

Remove `rejectsLeadingPrefix` and `TITLE_SPOILER_RE`. Normalize a parsed home side with `clubIdByName(homeName) ? homeName : clubNameFromTail(homeName)` before fixture lookup. Keep competition, source, team-pair, publication, uniqueness, and embed checks.

- [ ] **Step 5: Remove AI workflow and dead commands**

Delete OpenAI environment variables, AI alert invocation, and the optional entertainment block from the workflow. Remove AI-only smoke commands from `package.json` and delete the unused AI scripts/state listed above. Leave `src/data/wc2026-entertainment.ts` and its UI behavior unchanged.

- [ ] **Step 6: Run focused tests and scan active code**

Run:

```bash
npx tsx scripts/curate-videos.smoke.ts
npx tsx scripts/curate-club-videos.smoke.ts
grep -RInE 'OPENAI_API_KEY|checkVideoForSpoilers|curate-entertainment|notify-ai-rejections' .github/workflows scripts package.json --exclude='*.md'
```

Expected: both tests PASS and grep returns no active-code matches.

- [ ] **Step 7: Commit Task 3**

```bash
git add .github/workflows/update-results.yml scripts/curate-videos.ts scripts/curate-videos.smoke.ts scripts/curate-club-videos.ts scripts/curate-club-videos.smoke.ts package.json scripts/spoiler-check.ts scripts/notify-ai-rejections.ts scripts/notify-ai-rejections.smoke.ts scripts/curate-entertainment.ts scripts/curate-entertainment.smoke.ts scripts/curate-ai-rejections.json
git diff --cached --check
git commit -m "Remove AI-backed update paths"
```

### Task 4: Full verification and localhost handoff

**Files:**
- Create/update locally: `dist/seed.html` (gitignored)

- [ ] **Step 1: Run the full suite**

Run: `npm run check && node --test cloudflare-scheduler/index.test.mjs && npx vite build`

Expected: all commands exit 0.

- [ ] **Step 2: Seed real club progress and start the Conductor preview**

Run:

```bash
npx tsx .context/make-seed.ts eng1-2026
npx vite preview --host 127.0.0.1 --port "$CONDUCTOR_PORT"
```

Expected: `/seed.html` returns HTTP 200.

- [ ] **Step 3: Verify with safe browser control**

Open the seeded preview, choose a recent NBC Chelsea/Arsenal highlight, start playback, and enter wrapper fullscreen. Confirm the visible label is `Highlights (NBC)`, YouTube's upstream title is absent, the score graphic remains visible, and the fullscreen control is lower-right. Exit fullscreen and repeat the title check at modal size. Do not submit forms, alter accounts, install software, or make any browser-side external changes.

- [ ] **Step 4: Leave localhost ready for user testing**

Keep the preview process running and leave Firefox on the test match. Report the exact local URL and navigation steps. Do not merge or deploy until the user confirms the localhost behavior.
