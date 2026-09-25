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
fixture manifest is the independent audit boundary. Highlights use both the
FOX Soccer channel `UCooTLkxcpnTNx6vfOovfBFA`, FOX Sports channel
`UCwNqHDsnBCKT-olwJwIFyfg`, and TUDN USA channel `UCSo19KhHogXxu3sFsOpqrcQ`.
FOX Sports and TUDN USA both published full-match Nations League cuts on the
opening matchday. TUDN USA cuts are the standard 15-minute Spanish highlights;
its super-extended packages are ignored.

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
unknown team IDs, lost finished group or knockout scores, and a previously
published knockout stage that becomes partial. On a knockout score regression,
it retains the previous round and ties in memory and fails the audit, so the
workflow restores the last-known-good files. Writes use a sibling temporary
file followed by an atomic rename. A later draw is published only when the
complete stage is present and structurally valid; until then its UI remains
“Draw pending”. The championship tab always displays a bracket: before the
draw, four quarter-final ties (two empty leg slots each), two semi-finals, the
final, and third place appear as noninteractive placeholders. Published matches
replace their own placeholders without inventing fixtures. Quarter-final ties
remain visually unassigned to semi-finals until the separate semi-final draw
provides actual tie references; only then are those feeder paths connected.
Once all four championship stages are published, the existing connected
World Cup-style bracket takes over. The placeholders are UI-only and do not
change the ingest, fixture count, hot state, or YouTube quota use.

The update workflow runs this ingest every five minutes within a
schedule-derived result window: group matches from 105 minutes through eight
hours after kickoff, and knockout matches from 90 minutes through 12 hours.
It also checks for new draws in the first cycle of an updater job that reaches
the gate during the 00:00, 06:00, 12:00, or 18:00 UTC hour while any stage is
pending. That check can discover a complete draw before any knockout kickoff is
in the published schedule. It uses ESPN requests, not YouTube API quota. The
workflow snapshots every owned Nations file first and restores the
last-known-good set if ingest, validation, typechecking, or runtime-state
generation fails.

## Highlight ingest

Test one exact candidate without writing:

```sh
HIGHLIGHT_CANDIDATE_CHANNEL_ID=UCooTLkxcpnTNx6vfOovfBFA \
HIGHLIGHT_CANDIDATE_TITLE='Italy vs. France UEFA Nations League Highlights | FOX Soccer' \
HIGHLIGHT_CANDIDATE_PUBLISHED_AT='2026-09-25T22:00:00Z' \
npx tsx scripts/curate-nations-videos.ts --dry-run --video-id VIDEO_ID_HERE
```

For a FOX Sports candidate, set `HIGHLIGHT_CANDIDATE_CHANNEL_ID` to
`UCwNqHDsnBCKT-olwJwIFyfg` and use its exact title. The Worker assigns those
candidates the `foxnations` route; FOX Soccer candidates retain `foxsoccer`.
TUDN USA candidates use channel `UCSo19KhHogXxu3sFsOpqrcQ` and the `tudn` route.

Remove `--dry-run` only for the targeted workflow. With
`NATIONS_HIGHLIGHT_TRUST` set to `trusted`, the curator accepts either exact channel,
a resolvable two-country highlight title, one completed fixture within the
72-hour publication horizon, a non-Short duration, and a working embed.
Existing cuts are append-only and are never replaced.

Atom polling and WebSub notifications cost zero YouTube Data API units. FOX
Soccer and TUDN USA playlist recovery open only when runtime hot-state proves a
completed fixture lacks a cut. Each source scans at most two pages per run and
stops at its own 48 units per Pacific quota day and two requests per rolling
hour, in addition to the global 8,000-unit ceiling. If public feeds fail,
authenticated fallback is eligible every five minutes but the hourly limit
spaces out those requests instead of exhausting the day's allowance early. The
D1 ledger covers this Worker, not other jobs sharing the same Google Cloud
project/API key; check the project's YouTube Data API quota usage separately
on matchdays.

FOX Sports Nations League discovery shares the existing FOX Sports WebSub,
one-minute Atom poll, and bounded playlist scan used by World Cup highlights.
It adds no channel subscription or YouTube Data API playlist request. The
Nations-specific `foxnations` candidate is routed to the Nations curator, not
the World Cup curator. A successful targeted workflow commit rebuilds the
runtime highlight snapshot, which the site can fetch without waiting for its
next static deploy.

Inspect quota use, subscriptions, and Nations candidates:

```sh
cd cloudflare-scheduler
npm exec --yes wrangler d1 execute nospoilersoccer-highlights --remote --command \
  "SELECT day, method, SUM(units) AS units FROM quota_events GROUP BY day, method ORDER BY day DESC, method;"
npm exec --yes wrangler d1 execute nospoilersoccer-highlights --remote --command \
  "SELECT channel_id, status, expires_at, last_notification_at, last_error FROM subscriptions ORDER BY channel_id;"
npm exec --yes wrangler d1 execute nospoilersoccer-highlights --remote --command \
  "SELECT video_id, source_id, status, title, published_at FROM candidates WHERE source_id IN ('foxsoccer', 'foxnations', 'tudn') ORDER BY first_seen_at DESC;"
```

### FOX upload review

FOX Soccer, FOX Sports, and TUDN USA Nations League uploads that pass the curator's channel, title,
fixture, duration, and embed checks are published without a manual quarantine.
TUDN USA must be a 12-to-18-minute cut; longer super-extended uploads stay out.
Review the published videos on the site. If a bad cut appears, remove it from
`src/data/nations/unl-2026-videos.ts` and investigate the acceptance rule.

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
