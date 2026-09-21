# UEFA Nations League 2026/27 design

**Date:** 2026-09-21  
**Status:** Approved in conversation  
**Scope:** UEFA Nations League 2026/27, including every participating country,
the League A championship, and the League A/B and B/C play-offs

## Context and decisions

This design implements the complete request from the opening message and the
decisions made in the follow-up conversation:

- Add UEFA Nations League as a new competition in the competition dropdown.
- Show every country and every league, not only League A.
- Put Nations League first and make it the no-save default during its active
  league-phase windows: 24 September–6 October and 12–17 November 2026.
  Champions League returns to first place outside those windows.
- Preserve a returning visitor's saved competition instead of forcing a switch.
- Reuse national-team IDs so World Cup favourites carry into Nations League.
- Show every League A–D match in Today, ordered chronologically and identified
  by league and group. The existing favourite spotlight continues to work.
- Add League A, B, C, and D tabs to Groups.
- Represent both the League A championship and the promotion/relegation
  play-offs, including honest pending-draw states before pairings exist.
- Treat FOX Sports' dedicated FOX Soccer YouTube channel as the default US
  English-language highlight source.
- Quarantine the first 2026/27 matchday's highlight candidates for manual
  verification. Enable automatic acceptance only after the observed channel,
  title format, timing, duration, and embed behaviour pass the gate.
- Do not include international friendlies in this release. Keep the national
  team and competition boundaries reusable so friendlies can later become a
  separate competition.

The World Cup archive work already in the working tree is user-owned and must
be preserved. Nations League should integrate with that competition registry,
not replace or rewrite it.

## Authoritative competition format

UEFA's 2026/27 regulations are the source of truth. The competition contains
54 teams and these stages:

1. A league phase with 14 groups:
   - League A: four groups of four
   - League B: four groups of four
   - League C: four groups of four
   - League D: two groups of three
2. A League A championship:
   - four two-legged quarter-finals
   - two single-match semi-finals
   - a single third-place match
   - a single final
3. Four two-legged League A/B play-offs.
4. Four two-legged League B/C play-offs.

Leagues A–C play a double round robin, producing 48 matches per league. League
D produces 12 matches. The launch dataset must therefore contain exactly 156
league-phase matches. Once every later draw and stage is populated, the full
edition contains 184 matches: 156 league matches, eight quarter-final legs,
four finals matches, and sixteen promotion/relegation play-off legs.

The League A group winners and runners-up reach the quarter-finals. Group
winners are seeded and drawn against a runner-up from a different group; the
runner-up hosts the first leg. The four quarter-final winners reach the finals.
The semi-final draw cannot be invented before UEFA conducts it.

Promotion and relegation are special in this edition because 2028/29 moves to
three leagues of 18 teams:

- League A: group winners and runners-up reach the quarter-finals. The two
  highest-ranked third-place teams stay in A. The two lowest-ranked third-place
  teams and two highest-ranked fourth-place teams enter the A/B play-offs. The
  two lowest-ranked fourth-place teams are relegated.
- League B: winners are promoted, runners-up enter the A/B play-offs,
  third-place teams stay, and fourth-place teams enter the B/C play-offs.
- League C: winners are promoted, runners-up enter the B/C play-offs, and the
  remaining teams stay in C.
- League D: all six teams are promoted into the new 18-team League C.

There is no 2026/27 League C/D play-off stage in the adopted competition-stage
regulations. A UEFA overview also lists a March 2028 “League C/D play-offs”
window, but that conflicts with both the adopted stage list and the rule that
all six League D teams are promoted. The application follows the regulations
and does not fabricate a C/D stage. This discrepancy should remain an explicit
source-audit assertion so a later UEFA clarification is noticed.

Official sources:

- Format, groups, dates, promotion and relegation:
  https://www.uefa.com/uefanationsleague/news/0298-1d6ef1acfaef-b54fcf1da859-1000/
- Competition stages:
  https://documents.uefa.com/r/Regulations-of-the-UEFA-Nations-League-2026/27/Article-12-Competition-stages-Online
- League phase system:
  https://documents.uefa.com/r/Regulations-of-the-UEFA-Nations-League-2026/27/Article-14-Match-system-league-phase-Online
- Group tiebreakers:
  https://documents.uefa.com/r/Regulations-of-the-UEFA-Nations-League-2026/27/Article-15-Equality-of-points-league-phase-Online
- Play-offs:
  https://documents.uefa.com/r/Regulations-of-the-UEFA-Nations-League-2026/27/Article-16-Match-system-play-offs-Online
- League A knockouts:
  https://documents.uefa.com/r/Regulations-of-the-UEFA-Nations-League-2026/27/Article-17-Match-system-League-A-knockout-stage-Online
- Overall rankings and 2028/29 allocation:
  https://documents.uefa.com/r/Regulations-of-the-UEFA-Nations-League-2026/27/Article-19-Individual-league-interim-overall-and-final-overall-rankings-Online
- Official league-phase fixtures:
  https://www.uefa.com/uefanationsleague/news/02a2-1fea18abbcbc-456e846509e7-1000/
- US broadcasters:
  https://www.uefa.com/uefanationsleague/news/02a9-219ae5c877f5-740390ccb3e5-1000--where-to-watch-the-nations-league-tv-broadcast-partners-li/

## Architecture

### Competition registry and priority

Register a single `unl-2026` season under a `unl` competition named “UEFA
Nations League”, with compact label “Nations League” and season label “26/27”.
It is live, not archived.

Replace the single static picker/default ordering assumption with a pure
priority function derived from the current local date and competition windows.
During the two approved league-phase windows, picker order begins Nations
League, Champions League, Premier League, and La Liga. Outside those windows it
begins Champions League, followed by Nations League and the domestic leagues.
The ordering function must accept an explicit clock for deterministic tests.

Selection precedence is:

1. a valid season saved in `nss-tournament`;
2. Nations League during an approved active window;
3. Champions League otherwise.

Changing picker priority must never overwrite a valid saved selection.

### Shared national-team identity

Create a shared national-team registry keyed by the stable IDs already used by
the World Cup, such as `ENG`, `ESP`, and `FRA`. Nations League references those
same IDs. Newly needed UEFA countries are added once to the registry with name,
flag, short name, and ESPN ID.

World Cup data and Nations League data may construct their own `teams` subsets,
but both subsets must take objects and IDs from this registry. A validation test
must reject two national-team records with the same ESPN ID or two IDs for the
same association. This boundary is also the intended foundation for a later,
separate international-friendlies competition.

Favourites remain global in progress schema v4. No storage migration is
required: matching IDs make an existing World Cup favourite immediately active
in Nations League, while club favourites remain unaffected.

### Tournament schema

Keep `Tournament` as the common match container and extend it in small,
optional units instead of adding a parallel Nations League application:

- `groupSections`: ordered sections with an ID, label, and group IDs. Nations
  League supplies A–D; World Cup omits the field and keeps its current layout.
- group display metadata: an explicit label and section ID so the UI does not
  infer “Group A1” by string concatenation.
- position outcomes: declarative labels and colours for direct qualification,
  promotion, play-offs, staying in a league, and relegation.
- cross-group ranking rules: the inputs needed to compare equal group
  positions within one league after its relevant groups are complete.
- `knockoutTracks`: independently rendered tracks. Nations League supplies a
  championship track and a promotion/relegation track; World Cup and Champions
  League continue to expose one connected championship bracket.
- pending stages: draw date/window, stage label, qualification pools, and
  pairing constraints without fake match IDs, teams, or kickoff times.

Populated knockout matches continue using the existing `KnockoutMatch`, `Tie`,
and `SlotRef` structures. The extension is for multiple independent tracks and
truthful not-yet-drawn stages, not a second match representation.

### Standings and qualification

League-phase standings shown to a user are computed only from results that user
has revealed. Nations League uses UEFA's ordered group criteria:

1. head-to-head points;
2. head-to-head goal difference;
3. head-to-head goals scored;
4. recursive reapplication among teams still tied;
5. overall goal difference;
6. overall goals scored;
7. overall away goals;
8. overall wins;
9. overall away wins;
10. disciplinary score;
11. the 2026/27 access list.

The generated dataset stores the access-list rank and, once available, official
disciplinary totals and official final position. Before all matches in a group
are revealed, unavailable late tiebreak inputs do not pull from live official
standings; a stable neutral order is used and no final qualification outcome is
claimed. Once the group is fully revealed, stored official position resolves
any remaining equality and can be cross-checked against the local calculation.

Cross-group comparisons and promotion/relegation outcomes appear only after
every result needed for that comparison has been revealed. This prevents the
rank of a hidden match in another group from leaking through a coloured zone or
qualification label.

## User experience

### Competition picker and default

Nations League appears as one dropdown entry. It moves above or below Champions
League according to the active-window rule but never steals focus from a saved
competition. The current season-loading and archive behaviour remain intact.

### Today

Today contains all A–D fixtures in local kickoff order. Each card gains a small
league/group context label, such as `League B · B3`, so simultaneous fixtures
remain understandable. Existing favourite decoration, spotlight, Watch Later,
live state, and spoiler behaviour apply unchanged.

There is no default league filter in Today: the explicit decision was to show
every country. The favourite spotlight remains the lightweight way to reduce
noise without hiding the field.

### Groups

The Groups view begins with four nested tabs: League A, League B, League C, and
League D. The selected league shows its four groups, or League D's two groups,
using the existing responsive group-card grid. League selection is local UI
state and does not create four competitions or four progress stores.

Tables show only spoiler-safe standings derived from revealed matches. Outcome
bands and labels use the league-specific rules above. A label is explicitly
provisional until the complete set of results needed to decide it is revealed.

### Knockouts

The Knockouts view contains two track selectors:

- **Championship:** quarter-finals, semi-finals, third-place match, and final.
- **Promotion/Relegation:** A/B play-offs and B/C play-offs.

Before a draw, the stage presents its date window, qualified/eligible pools
when spoiler-safe, and “Draw pending”. It does not create a false bracket or
guess pairings. After a draw, the data updater creates the real ties and the
existing two-leg machinery renders them. The championship becomes a connected
bracket once the quarter-final and semi-final draws make that topology known.

## Data ingestion

### Fixture and result source

Use ESPN's `uefa.nations` feed as the machine-readable primary source. It
currently identifies the 2026/27 season, all 14 standings groups, and the full
league-phase fixture list. Store ESPN team IDs in the shared national registry
and match by those IDs, never by display-name guessing.

The generated season is rebuilt from upstream data in the same broad style as
the club generator, but with Nations League-specific group and stage logic. The
generator must preserve separately curated videos and stable internal match/tie
IDs across rewrites.

An official UEFA manifest supplies the independent audit layer: expected teams,
group membership, matchday windows, and published kickoff schedule. A generated
update is rejected rather than partially written when any invariant fails.
Minimum launch invariants are:

- exactly 54 unique teams;
- groups A1–A4, B1–B4, C1–C4, and D1–D2;
- four teams and 12 fixtures in each A–C group;
- three teams and six fixtures in each D group;
- exactly 156 league-phase fixtures;
- every pair within a group meets once home and once away;
- every fixture has two registered teams, a unique stable ID, and a valid UTC
  kickoff;
- ESPN and UEFA agree on participants, home/away order, and kickoff within an
  explicitly audited correction policy;
- an update cannot delete a previously known finished match, score, or accepted
  video.

When a later draw is not represented upstream yet, retain the pending stage.
When it appears, require a complete draw-level set before replacing the pending
stage with matches. Never publish half a draw.

### Update scheduling and atomicity

The scheduler knows each kickoff. Begin result polling near the earliest
plausible final whistle, continue while ESPN reports live/incomplete matches,
and stop after all matches in that window are complete plus the highlight
recovery period. Do not run a permanent broad loop when no match could have
changed.

Each Nations League step follows backup → fetch → generate → validate → type
check → atomically commit. Network errors, an incomplete source response, an
unknown team, or a failed invariant leave the last known-good dataset and
runtime JSON untouched. One competition's failure cannot discard valid updates
for another competition.

Runtime hot state and highlight state receive `unl-2026` endpoints matching the
existing per-season URL pattern. Static data remains the durable baseline;
runtime state accelerates live badges, final scores, and newly accepted videos.

## Highlight ingestion

### Source choice

UEFA lists FOX Sports, FuboTV, and ViX as US broadcasters. Historical US
English Nations League match highlights were published on FOX Sports' dedicated
FOX Soccer channel. Configure that exact channel as the default:

- label: `FOX Soccer`
- YouTube channel ID: `UCooTLkxcpnTNx6vfOovfBFA`
- source ID: a new unambiguous ID such as `foxsoccer`

Do not reuse the current `fox` source ID for both the general FOX Sports channel
and FOX Soccer. Channel ID is a hard trust boundary; branding text in a title
is not.

### Discovery and quota

Discovery order is:

1. YouTube WebSub notification for near-real-time, zero-quota delivery.
2. The public Atom channel feed as zero-quota recovery.
3. `playlistItems.list` against the channel's uploads playlist only when a
   finished Nations League fixture still lacks a highlight and the expected
   upload window is open.

Never use `search.list` for routine Nations League discovery. It costs far more
quota and is unnecessary when the exact channel is known. Recovery page count,
run count, and consumed units are explicitly capped and recorded. Nations
League must have its own small reserve within the existing daily ledger so it
cannot starve other competitions. A quota-exhausted run degrades to WebSub and
Atom rather than exceeding the cap.

The recovery window is schedule-aware. It opens only after ESPN has marked a
fixture complete, or after the scheduled kickoff plus a conservative match
duration when status is temporarily unavailable. It closes when a valid cut is
accepted or after the configured publication horizon. Extra time and delayed
matches keep status-based polling open rather than relying on a fixed 90-minute
assumption.

### Candidate validation and opening-matchday quarantine

A candidate must pass all deterministic gates before any AI review:

- exact trusted channel ID;
- a conservative Nations League full-match-highlight title shape;
- exactly two registered teams that map to one completed fixture;
- publication after kickoff and within the permitted horizon;
- expected match context rather than a goal clip, reaction, preview, short, or
  compilation;
- embeddable and available in the US;
- sane duration for the declared normal or extended cut;
- no duplicate accepted provider/kind for that match.

The current spoiler title/thumbnail gate then runs. Ambiguity fails closed.

For matchday 1, passing candidates are stored as quarantined with a complete
audit record but are not published. Manual verification compares observed FOX
Soccer uploads with the parser and confirms channel ID, title template,
publication delay, duration, thumbnail safety, and embed behaviour. Automatic
acceptance is enabled by an explicit reviewed configuration change only after
the full observed sample passes. If FOX changes its pattern later, parser drift
or validation failures return candidates to quarantine rather than broadening
the regex automatically.

## Error handling and observability

Every scheduled run reports, per source and season:

- upstream request success and latency;
- expected, received, accepted, unchanged, and rejected fixture counts;
- unknown teams, group mismatches, kickoff changes, and duplicate IDs;
- live matches and the next expected final-whistle window;
- highlight notifications, feed recoveries, playlist pages, quota units,
  candidates, quarantine reasons, and accepted videos;
- validation, type-check, runtime-state, commit, and push outcomes.

A failed source fetch is a warning with retained last-known-good data. A schema
or invariant failure is an error and blocks that competition's write. Repeated
upstream disagreement remains visible in audit output; it is never normalized
away silently.

## Verification strategy

### Pure logic and schema tests

- competition priority at every window boundary in multiple time zones;
- saved-selection precedence over dynamic default;
- national-team ID and ESPN-ID uniqueness;
- World Cup-to-Nations-League favourite continuity;
- group-section membership and tab ordering;
- exact group and fixture counts, double round-robin balance, and unique IDs;
- UEFA recursive multi-team head-to-head examples;
- away-goal, win, away-win, disciplinary, and access-list fallback ordering;
- spoiler-safe partial standings that do not read hidden official rank data;
- League A third/fourth cross-group outcomes;
- League B and C promotion/play-off/stay outcomes and League D promotion;
- two-legged aggregates, extra time, penalties, and first-leg home rules;
- pending-draw stages and atomic conversion to populated stages;
- championship and promotion/relegation track isolation.

### Ingestion tests

- recorded ESPN fixtures for all 14 groups;
- unknown-team, truncated-response, duplicate-event, moved-kickoff, and
  upstream-source-disagreement fixtures;
- preservation of stable IDs, finished results, and curated videos;
- all-or-nothing draw ingestion;
- backup and restore on validation or type-check failure;
- runtime hot/highlight state generation for `unl-2026`.

### Highlight tests

- historical FOX Soccer Nations League titles in every known shape;
- near misses: previews, reactions, individual goals, shorts, compilations,
  wrong competitions, reversed/noisy names, and spoofed channel branding;
- WebSub signature/topic/channel verification and Atom recovery;
- finish-window scheduling, delayed matches, extra time, and missing status;
- quota accounting and hard-stop behaviour;
- first-matchday quarantine and explicit promotion to trusted mode;
- retry, idempotency, duplicate notification, unavailable video, and failed
  callback handling;
- spoiler title/thumbnail rejection and accepted-video embed verification.

### Full regression and manual checks

Run the repository's complete data validation, logic tests, component tests,
analytics tests, TypeScript build, ESLint, and production Vite build. Manually
check desktop and mobile layouts for:

- competition ordering inside and outside active windows;
- a saved Champions League selection during a Nations League window;
- Today with a dense ten-match day and favourite spotlight;
- all four league tabs and League D's smaller layout;
- partial and completed group standings without leaks;
- pending championship and play-off stages;
- a populated two-legged tie and finals bracket;
- live, finished-unwatched, watched, and missing-highlight states.

The release is not complete merely because the UI builds. It is complete only
when launch invariants hold against current upstream data, the whole regression
suite passes, opening-day highlight behaviour has a documented quarantine
path, and no test required weakening spoiler or data-integrity safeguards.

## Deferred work

International friendlies outside Europe are intentionally deferred. A later
design should add them as a separate competition with date-based browsing and
the shared national-team registry. They must not be inserted into Nations
League groups, standings, or promotion logic.

