# Always-visible Nations Championship Bracket Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline; the user prohibited subagents and asked to complete this in the current chat. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Show the Nations League championship bracket before any draw, then fill it with real matches as stages arrive.

**Architecture:** A pure view model derives the four QF tie positions, two SF positions, final, third place, and whether QF-to-SF paths are known. A dedicated partial-bracket component renders data-free placeholders or real match cards; the existing connected component handles a complete bracket. Promotion/relegation is unchanged.

**Tech Stack:** React, TypeScript, CSS, TSX server-rendered smoke tests.

---

### Task 1: Derive a truthful partial bracket

**Files:** Create `src/components/nations-bracket-view.ts`; modify `src/components/knockout-tracks.smoke.tsx`.

- [x] Add failing assertions for an empty `unl2026`: four QF positions, two SF positions, and absent final/third matches. Add QF-only and SF-path assertions using the synthetic `championship` fixture already in the smoke test. Assert paths are unknown until SF references map four distinct QF tie IDs, then order QF positions by those references.
- [x] Run `npx tsx --tsconfig tsconfig.app.json src/components/knockout-tracks.smoke.tsx` and observe the expected failure.
- [x] Implement `nationsBracketView(t)` returning `{ quarterFinals: (TieWithLegs | null)[], semiFinals: (KnockoutMatch | null)[], final: KnockoutMatch | null, thirdPlace: KnockoutMatch | null, pathsKnown: boolean }`. Read only `knockoutRounds` and `ties`; fill the fixed-size arrays with `null` when stages are absent. Never create `KnockoutMatch` placeholder objects. When both SF slots in both matches reference exactly four known QF ties, order tie positions by SF home/away slot order; otherwise sort published ties by kickoff and ID and set `pathsKnown: false`.
- [x] Re-run the focused smoke test, confirm green, and commit the model and its tests.

### Task 2: Render the empty and partially filled bracket

**Files:** Create `src/components/NationsPendingBracket.tsx`, `src/components/NationsPendingBracket.css`; modify `src/components/KnockoutTracks.tsx`, `src/App.tsx`, `src/components/knockout-tracks.smoke.tsx`.

- [x] Add failing SSR assertions: the current no-draw Championship shows a bracket with four QF tie nodes, eight leg placeholders, two SF placeholders, a final placeholder, and a third-place placeholder; placeholders are not buttons. A QF-only tournament renders eight real leg cards and keeps later positions pending. A QF+SF tournament maps real tie cards to known SF paths. A complete tournament still uses `ConnectedBracket`. Promotion/relegation remains unchanged.
- [x] Run the focused component smoke and observe the expected missing-bracket failure.
- [x] Implement `NationsPendingBracket` with five columns (QF/SF/final/SF/QF) using the existing `bracket`, `b-col`, `b-pair`, and `b-slot` geometry. Put both leg cards inside one QF tie node. Use noninteractive pending-position elements, stage labels, and windows, not synthetic match data. Hide QF-to-SF connector pseudo-elements and show “Semi-final draw pending” while `pathsKnown` is false. When paths are known, map the first two ties to SF1 and next two to SF2. Render third place below final. Use a new isolated CSS file imported by `src/App.tsx`, leaving the already-dirty `src/App.css` day-navigation edits untouched.
- [x] In `KnockoutTracks`, use `NationsPendingBracket` for the Championship while any of QF, SF, final, or third-place is absent; otherwise use `ConnectedBracket`. Keep `TieGrid` and pending-stage cards for Promotion only, so the Championship bracket is the first and sole pending-stage visual.
- [x] Re-run the focused smoke, `npm run test:components`, and `npx tsc -b`; confirm green and commit only files belonging to this task.

### Task 3: Visual and release verification

**Files:** Modify `docs/nations-league-operations.md`.

- [x] Document the always-visible UI-only bracket, the separately drawn SF paths, and the progressive handoff to the full connected bracket. Confirm no data file, fixture ID, YouTube quota, or FOX trust mode changes.
- [x] Run `npm run test:nations`, `npm run check`, `npm run lint`, `npm run build`, and `git diff --check origin/main...HEAD`. Inspect the empty bracket in a browser at a desktop viewport if local browser access is available; save any screenshot under `.context/`.
- [x] Inspect `git status --short` and the task diff, commit documentation/plan tracking, and leave unrelated dirty day-navigation files as found. Do not push, deploy, or merge.

Verification note: `npm run lint` was run but fails on two existing `.context` lab files outside this task; changed source files pass ESLint. Browser inspection passed, but no screenshot was saved.
