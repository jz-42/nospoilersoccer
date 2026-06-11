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

## Curating highlight videos

`scripts/curate.mjs` is the maintainer tool for finding and vetting
spoiler-free highlights:

```sh
node scripts/curate.mjs playlist <youtubePlaylistId>   # list {videoId, title} per video
node scripts/curate.mjs check <videoId> [...]          # title, duration, embeddable, channel
```

Curation rules: no scores or winners in the title or thumbnail (inspect
thumbnails at `https://i.ytimg.com/vi/<id>/hqdefault.jpg`), video must be
embeddable, prefer official rights-holder channels with a consistent
spoiler-free format (FOX Soccer for US coverage). Add vetted entries to the
match's `videos` array in `src/data/`.

## Deployment

Deployed as a [Render Static Site](https://render.com/docs/static-sites).

- Build command: `npm install && npm run build`
- Publish directory: `dist`

## Branches

- `main` — production, public-facing
- `dev` — staging; PRs merge here first, then `dev` → `main` when ready
