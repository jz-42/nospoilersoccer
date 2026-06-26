# ⚽ No Spoiler Soccer

**[nospoilersoccer.com](https://nospoilersoccer.com)**

Catch up on the World Cup at your own pace — spoiler-free highlights laid out on
the tournament bracket. Watch (or skip) a match, mark it done, and only then does
the score reveal and the winner advance to the next round. Miss a week of games?
The drama is still intact when you come back.

## How it works

- **No accounts, no backend.** The site is fully static. All tournament data
  (groups, bracket, scores, highlight video links) ships as JSON with the site.
- **Your progress stays in your browser.** Watched/skipped games, followed teams,
  and settings live in `localStorage` — deploys never reset them.
- **Spoiler-proof by design.** Scores, standings, and bracket progression are
  hidden until you reveal them. Highlight videos are shown behind neutral cards
  (no YouTube thumbnails or titles) and play in an embedded player.

## Development

```sh
npm install
npm run dev      # local dev server
npm run build    # type-check + production build to dist/
npm run lint
```

### Testing local times

Match kickoffs are stored once as UTC instants and converted by each visitor's
browser. You do not need to change the Mac clock to test another timezone.

The automated tests accept explicit timezones and can also run with Node's
timezone changed:

```sh
TZ=America/Los_Angeles npm run test:logic
TZ=America/New_York npm run test:logic
TZ=Europe/Amsterdam npm run test:logic
```

For visual testing, start the site with `npm run dev`, open browser developer
tools, then use **More tools → Sensors → Location → Timezone** to override the
browser timezone. Check the Today carousel, group-stage headings, knockout
cards, and match modal. The browser override is what matters for the running
site; changing `TZ` on the Vite process alone does not change browser output.

## Highlights: automatic curation

Highlights are added automatically by `scripts/curate-videos.ts`, run every 15
minutes by the [Update World Cup data](.github/workflows/update-results.yml)
Action (right after results are fetched). For each recent FOX Sports YouTube
upload it:

1. keeps only titles matching `<A> vs <B> [Extended ]Highlights … World Cup`
   — FOX's other uploads (goal clips, reactions like "Japan draws level LATE!")
   are spoilery and don't match, so they're dropped before anything else;
2. maps the teams to the one finished fixture still missing that cut;
3. runs deterministic guards: FOX channel, embeddable, clean title, published
   after kickoff; then
4. asks a vision model whether the title or thumbnail leaks the result, and
   whether it's really the full-match highlights for these two teams.

The curator also scans FOX Sports' 4-minute World Cup recap feed and uses those
clips as missing quick highlights when a match does not already have a quick
YouTube cut. These FOX-site clips pass the same title/thumbnail AI spoiler gate
before being written.

Anything ambiguous or unverifiable is **skipped** (fail-closed) and existing
entries are **never overwritten** (append-only) — worst case is a late or
missing video, never a spoiler. Curated cuts are written to
`src/data/wc2026-videos.ts` (generated — don't hand-edit) and merged into the
tournament in `src/data/index.ts`; rejected video ids are remembered in
`scripts/curate-skip.json` so each is judged only once.

```sh
npx tsx scripts/curate-videos.ts --dry-run   # show decisions, write nothing
npx tsx scripts/curate-videos.ts --validate  # re-check the known-good cuts
npx tsx scripts/curate-videos.ts             # curate and write
```

### Required GitHub secrets

| Secret | Purpose | Without it |
|---|---|---|
| `OPENAI_API_KEY` | the AI spoiler gate (GPT‑5.4 vision) | curator adds nothing (fails closed) |
| `YOUTUBE_API_KEY` | reliable listing in CI (YouTube Data API v3) | scrape fallback, which CI IPs may get blocked from |

The AI runs ~once per new video (~$3 across the whole tournament). Override with
`OPENAI_MODEL` / `OPENAI_REASONING_EFFORT` if needed.

### Manual fallback

`scripts/curate.mjs` is the hand tool if you ever need it:

```sh
node scripts/curate.mjs playlist <playlistId>   # list {videoId, title} per video
node scripts/curate.mjs check <videoId> [...]   # title, duration, embeddable, channel
```

Inspect thumbnails at `https://i.ytimg.com/vi/<id>/hqdefault.jpg`. Add vetted
entries to a match's `videos` array in `src/data/`.

## Deployment

Deployed as a [Render Static Site](https://render.com/docs/static-sites).

- Build command: `npm install && npm run build`
- Publish directory: `dist`

## Branches

- `main` — production, public-facing
- `dev` — staging; PRs merge here first, then `dev` → `main` when ready
