# AI Entertainment Summary Experiment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a spoiler-safe modal experiment for June 25, 2026 finished matches that reveals an optional AI entertainment summary and optional total-goals disclosure.

**Architecture:** Extend the static match data model with optional entertainment-summary text, seed summaries for the six finished June 25 matches, and render the new disclosures only in the revealed finished-match modal. Keep all behavior local and static; no runtime fetching or backend changes.

**Tech Stack:** React 19, TypeScript, Vite, existing `tsx` smoke tests, static tournament data.

---

### Task 1: Define the data shape and test it

**Files:**
- Modify: `src/data/types.ts`
- Modify: `src/components/disclosures.smoke.tsx`

- [ ] **Step 1: Write the failing test**

Add assertions to `src/components/disclosures.smoke.tsx` for a revealed June 25, 2026 match that should include the `AI Entertainment Summary` and `Total goals` labels, but should not include the hidden summary text or goal count by default.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:components`

Expected: FAIL because the modal does not yet render the new disclosure labels.

- [ ] **Step 3: Add the minimal type support**

Add `entertainmentSummary?: string` to group and knockout match types in `src/data/types.ts`.

- [ ] **Step 4: Run test to confirm it still fails for the right reason**

Run: `npm run test:components`

Expected: FAIL because the UI still does not render the disclosure rows.

### Task 2: Seed June 25 experiment data

**Files:**
- Modify: `src/data/wc2026.ts`
- Test: `src/components/disclosures.smoke.tsx`

- [ ] **Step 1: Write the failing test**

Add a fixture lookup in `src/components/disclosures.smoke.tsx` for one June 25, 2026 finished match and assert it has `entertainmentSummary` data.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:components`

Expected: FAIL because the selected June 25 match has no summary in the dataset.

- [ ] **Step 3: Add the minimal experiment data**

Seed `entertainmentSummary` on the six finished June 25, 2026 group matches in `src/data/wc2026.ts`.

- [ ] **Step 4: Run test to verify the data exists**

Run: `npm run test:components`

Expected: FAIL moves forward to the missing UI behavior, or PASS for the data-specific assertion if separated.

### Task 3: Render the modal disclosures

**Files:**
- Modify: `src/components/MatchModal.tsx`
- Modify: `src/App.css`
- Test: `src/components/disclosures.smoke.tsx`

- [ ] **Step 1: Write the failing test**

Extend `src/components/disclosures.smoke.tsx` to assert that:

- the rendered revealed modal contains the labels
- the hidden panel content is absent by default
- the hidden total-goals value is absent by default

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:components`

Expected: FAIL because the modal has no disclosure UI.

- [ ] **Step 3: Write the minimal implementation**

Add two disclosure controls in `src/components/MatchModal.tsx` for revealed played matches:

- `AI Entertainment Summary`
- `Total goals`

Keep them collapsed by default with local component state. Reveal the summary inline on click. Reveal total goals as a numeric count on click only when score exists.

Add compact styling in `src/App.css` consistent with the current modal.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:components`

Expected: PASS for the new modal disclosure coverage.

### Task 4: Verify no data or app regressions

**Files:**
- Verify: `src/data/validate.ts`
- Verify: `src/components/disclosures.smoke.tsx`

- [ ] **Step 1: Run focused validation**

Run: `npm run validate:data`

Expected: PASS with no data validation errors.

- [ ] **Step 2: Run focused logic and component checks**

Run: `npm run test:components && npm run test:logic`

Expected: PASS.

- [ ] **Step 3: Run full project verification**

Run: `npm run check`

Expected: PASS.
