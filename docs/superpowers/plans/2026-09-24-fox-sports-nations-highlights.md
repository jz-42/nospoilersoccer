# FOX Sports Nations League Highlights Implementation Plan

**Goal:** Publish valid 2026/27 Nations League highlights from either trusted FOX channel quickly without adding YouTube Data API calls.

**Architecture:** Classify main-channel Nations titles separately inside the existing Worker discovery paths. Route that candidate type through the existing targeted Nations curator and broaden its exact channel allowlist. Use runtime highlight snapshots for immediate playback after curation.

**Tech Stack:** Cloudflare Worker, D1, GitHub Actions, TypeScript, Node tests, Render static site.

---

### Task 1: Discovery and routing

**Files:** `cloudflare-scheduler/highlights.test.mjs`, `cloudflare-scheduler/highlights.mjs`, `.github/workflows/curate-highlight.yml`

- [ ] Add failing tests for the real FOX Sports Nations titles, unrelated clips, and source IDs emitted by Atom, WebSub, and playlist recovery.
- [ ] Run `node --test cloudflare-scheduler/highlights.test.mjs` and confirm the new assertions fail for the source mismatch.
- [ ] Add a single title classifier used by all three discovery paths. Route `foxnations` to the Nations script in the workflow.
- [ ] Run the Worker tests and confirm all cases pass with unchanged request and quota counts.

### Task 2: Curator trust

**Files:** `scripts/curate-nations-videos.smoke.ts`, `scripts/curate-nations-videos.ts`

- [ ] Add a failing test that accepts a full Nations title from the exact FOX Sports channel and rejects every other channel.
- [ ] Run `npx tsx scripts/curate-nations-videos.smoke.ts` and confirm the new assertion fails.
- [ ] Allow both channel IDs, while keeping the existing fixture, timing, duration, embed, and duplicate gates.
- [ ] Run the focused test again and confirm it passes.

### Task 3: Release

**Files:** `docs/nations-league-operations.md`, `README.md`

- [ ] Update source and recovery documentation.
- [ ] Run `npm run test:nations`, `npm run check`, `npm run lint`, and `npm run build`.
- [ ] Commit, publish to `main`, and deploy the Cloudflare Worker.
- [ ] Confirm production queue activity, curated commits, Render deployment, and live highlight feed entries for available videos.
