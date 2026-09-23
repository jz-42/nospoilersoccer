# UEFA Nations League 2026/27 operations

This runbook covers the `unl-2026` data, results, highlights, and failure
recovery. International friendlies are intentionally outside this competition.

## Competition facts and sources

The site carries all 54 associations: four groups of four in Leagues A, B, and
C, plus two groups of three in League D. The checked-in league phase has 156
fixtures. League A later adds four two-leg quarter-finals, two semi-finals, a
third-place match, and a final. Promotion/relegation adds four A/B and four B/C
two-leg ties.

There is no C/D play-off in the adopted 2026/27 competition-stage regulations;
all six League D teams move to the expanded League C for 2028/29. Do not create
a C/D stage unless UEFA formally changes those regulations.

Authoritative references:

- [UEFA format, groups, and dates](https://www.uefa.com/uefanationsleague/news/0298-1d6ef1acfaef-b54fcf1da859-1000/)
- [UEFA competition stages](https://documents.uefa.com/r/Regulations-of-the-UEFA-Nations-League-2026/27/Article-12-Competition-stages-Online)
- [UEFA league-phase system](https://documents.uefa.com/r/Regulations-of-the-UEFA-Nations-League-2026/27/Article-14-Match-system-league-phase-Online)
- [UEFA tiebreakers](https://documents.uefa.com/r/Regulations-of-the-UEFA-Nations-League-2026/27/Article-15-Equality-of-points-league-phase-Online)
- [UEFA play-offs](https://documents.uefa.com/r/Regulations-of-the-UEFA-Nations-League-2026/27/Article-16-Match-system-play-offs-Online)
- [UEFA League A knockouts](https://documents.uefa.com/r/Regulations-of-the-UEFA-Nations-League-2026/27/Article-17-Match-system-League-A-knockout-stage-Online)
- [UEFA overall rankings and 2028/29 allocation](https://documents.uefa.com/r/Regulations-of-the-UEFA-Nations-League-2026/27/Article-19-Individual-league-interim-overall-and-final-overall-rankings-Online)
- [Official league-phase fixtures](https://www.uefa.com/uefanationsleague/news/02a2-1fea18abbcbc-456e846509e7-1000/)
- [UEFA US broadcast partners](https://www.uefa.com/uefanationsleague/news/02a9-219ae5c877f5-740390ccb3e5-1000--where-to-watch-the-nations-league-tv-broadcast-partners-li/)

ESPN's `uefa.nations` endpoints are the machine-readable result source. UEFA's
fixture manifest is the independent audit boundary. Highlights use the FOX
Soccer channel `UCooTLkxcpnTNx6vfOovfBFA` and uploads playlist
`UUooTLkxcpnTNx6vfOovfBFA`.

## Result ingest

Preview the current upstream snapshot without writing:

```sh
npx tsx scripts/espn-nations.ts --dry-run
```

Perform an audited atomic write, validate it, and rebuild runtime state:

```sh
NATIONS_AUDIT_FILE=/tmp/nations-audit.md npx tsx scripts/espn-nations.ts
npm run validate:data
npx tsx scripts/espn-nations.smoke.ts
npx tsc -b
npm run build:hot-state
npm run build:highlight-state
```

The generator rejects missing official fixtures, changed pairings or kickoffs,
unknown team IDs, lost finished scores, and a previously published knockout
stage that becomes partial. Writes use a sibling temporary file followed by an
atomic rename. A later draw is published only when the complete stage is
present and structurally valid; until then its UI remains “Draw pending”.

The update workflow runs this ingest only in a schedule-derived result window:
105 minutes through eight hours after kickoff. It snapshots every owned
Nations file first and restores the last-known-good set if ingest, validation,
typechecking, or runtime-state generation fails.

## Highlight ingest and quarantine

Test one exact candidate without writing:

```sh
HIGHLIGHT_CANDIDATE_CHANNEL_ID=UCooTLkxcpnTNx6vfOovfBFA \
HIGHLIGHT_CANDIDATE_TITLE='Italy vs. France UEFA Nations League Highlights | FOX Soccer' \
HIGHLIGHT_CANDIDATE_PUBLISHED_AT='2026-09-25T22:00:00Z' \
npx tsx scripts/curate-nations-videos.ts --dry-run --video-id VIDEO_ID_HERE
```

Remove `--dry-run` only for the targeted workflow. The curator still writes
nothing while `NATIONS_HIGHLIGHT_TRUST` is `quarantine`; its result file says
`quarantined`. It accepts only the exact channel, a resolvable two-country
highlight title, one completed fixture within the 72-hour publication horizon,
a non-Short duration, and a working embed. Existing cuts are append-only and
are never replaced.

Atom polling and WebSub notifications cost zero YouTube Data API units. FOX
Soccer playlist recovery opens only when runtime hot-state proves a completed
fixture lacks a cut. It scans at most two pages per run and stops at 48
FOX-Soccer units per Pacific quota day and two requests per rolling hour, in
addition to the global 8,000-unit ceiling. If public feeds fail, authenticated
fallback is eligible every five minutes but the hourly limit spaces out FOX
requests instead of exhausting the day's allowance early. The D1 ledger covers
this Worker, not other jobs sharing the same Google Cloud project/API key;
check the project's YouTube Data API quota usage separately on matchdays.

Inspect quota use, subscriptions, and quarantined candidates:

```sh
cd cloudflare-scheduler
npm exec --yes wrangler d1 execute nospoilersoccer-highlights --remote --command \
  "SELECT day, method, SUM(units) AS units FROM quota_events GROUP BY day, method ORDER BY day DESC, method;"
npm exec --yes wrangler d1 execute nospoilersoccer-highlights --remote --command \
  "SELECT channel_id, status, expires_at, last_notification_at, last_error FROM subscriptions ORDER BY channel_id;"
npm exec --yes wrangler d1 execute nospoilersoccer-highlights --remote --command \
  "SELECT video_id, source_id, status, title, published_at FROM candidates WHERE source_id='foxsoccer' ORDER BY first_seen_at DESC;"
```

### Matchday-1 trust promotion

Review multiple fixtures, not one upload. Confirm exact channel identity,
country parsing, titles, post-match publication delays, durations, thumbnails,
and successful US embeds. Confirm quarantine produced no change to
`src/data/nations/unl-2026-videos.ts`.

After that audit, make one reviewed commit changing only
`NATIONS_HIGHLIGHT_TRUST` from `quarantine` to `trusted`. Parser changes and
trust promotion must be separate commits.

## Proof and recovery

Run the focused proof twice; the second run must be identical:

```sh
npm run test:nations
npm run test:nations
```

Then verify generation is idempotent:

```sh
npx tsx scripts/espn-nations.ts
npm run build:hot-state
npm run build:highlight-state
git diff --exit-code -- src/data/nations \
  public/api/hot-state/unl-2026.json \
  public/api/highlights/unl-2026.json
```

If a local write fails, do not hand-edit around the audit. Restore the affected
generated files from Git and rerun after the upstream feed is healthy. In CI,
the scoped Nations backup/restore step does this automatically and never
touches World Cup or club files.
