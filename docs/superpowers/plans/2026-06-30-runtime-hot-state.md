# Runtime Hot State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move volatile `wc2026` match state off the Render deploy path by generating a hot-state JSON snapshot, serving it through Cloudflare, and overlaying it in the client at runtime.

**Architecture:** GitHub Actions remains the canonical updater and writes a small generated JSON snapshot from the current tournament data. The existing Cloudflare Worker proxies that snapshot from `main` through a stable API, and the React app merges the hot fields over its bundled static tournament data without changing spoiler behavior.

**Tech Stack:** TypeScript, React, Vite, Node smoke tests, Cloudflare Workers

---

### Task 1: Add hot-state data generation and overlay helpers

**Files:**
- Create: `src/data/hot-state.ts`
- Create: `src/data/hot-state.smoke.ts`
- Create: `scripts/build-hot-state.ts`

- [ ] Write failing smoke tests for snapshot generation and overlay merge.
- [ ] Run the smoke tests to confirm they fail for missing hot-state helpers.
- [ ] Implement the minimal snapshot builder and overlay functions.
- [ ] Re-run the hot-state smoke tests until they pass.

### Task 2: Serve hot-state through the Cloudflare Worker

**Files:**
- Modify: `cloudflare-scheduler/index.mjs`
- Modify: `cloudflare-scheduler/index.test.mjs`

- [ ] Write failing Worker tests for the hot-state endpoint and CORS behavior.
- [ ] Run the Worker tests to confirm they fail before implementation.
- [ ] Implement `/api/hot-state/wc2026` as a short-cache proxy to raw GitHub content.
- [ ] Re-run the Worker tests until they pass.

### Task 3: Use hot-state in the React app

**Files:**
- Modify: `src/App.tsx`

- [ ] Write or extend a failing smoke test for overlay behavior if needed.
- [ ] Implement runtime fetch and polling with graceful fallback.
- [ ] Verify existing component and logic tests still pass with overlayed tournament data.

### Task 4: Publish the generated snapshot in the updater flow

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/update-results.yml`
- Create: `public/api/hot-state/wc2026.json`

- [ ] Add a script command that regenerates the hot snapshot from current data.
- [ ] Update the workflow so the snapshot is regenerated before committing bot changes.
- [ ] Include the generated JSON file in the bot commit set.
- [ ] Verify the file stays in sync after local generation.

### Task 5: Verify and document rollout

**Files:**
- Modify: `README.md`
- Modify: `docs/cloudflare-scheduler.md`

- [ ] Run targeted tests for hot-state, Worker, and schedule logic.
- [ ] Run the full build to verify the app and generated data stay consistent.
- [ ] Update docs so the hot-state path and fallback behavior are explicit.
