# La Liga Highlight Fallback Design

## Goal

Publish the earliest safe, correct La Liga highlight for each finished match while preserving ESPN FC as the preferred provider, using ESPN Deportes when ESPN FC does not publish a match. The change must remain spoiler-safe, work for viewers in the United States, stay comfortably within the YouTube Data API quota, and identify the actual provider in the player UI.

## Research Findings

ESPN remains the exclusive United States La Liga rights holder through the 2028-29 season. Its 2026-27 coverage announcement specifically states that the ESPN Deportes YouTube channel publishes final highlights.

On September 20, 2026:

- ESPN Deportes published Getafe-Malaga at 7:05 a.m. Pacific and Villarreal-Levante at 11:25 a.m. Pacific.
- The official LALIGA channel published the same matches 12 and 15 minutes later, respectively.
- ESPN FC published other matches from the round but did not publish these two.
- Both ESPN Deportes videos passed current United States playback and embedding checks.
- YouTube's Atom feed changed between HTTP 404 and HTTP 200 during the investigation. Feed discovery is fast and quota-free, but it cannot be the only recovery mechanism.

The failure was therefore not an absent highlight. The configured La Liga source was incomplete for that round, and the quota-free discovery feed was intermittently unavailable.

## Provider Policy

ESPN FC remains the preferred provider. ESPN Deportes is the fallback provider.

The curator checks ESPN FC before ESPN Deportes within the same scan. If both acceptable videos are already visible, it selects ESPN FC. A targeted ESPN Deportes candidate also triggers one shallow check of ESPN FC's recent uploads before acceptance. If ESPN FC has no acceptable video at that moment, the curator accepts ESPN Deportes immediately. It does not wait for a possible future ESPN FC upload because minimizing delay is the primary product requirement.

The existing one-cut invariant remains in force. Once either provider supplies an accepted highlight, later candidates for that match are ignored. Existing accepted videos are never replaced automatically.

## Source Definitions and Matching

Add ESPN Deportes as a trusted source for `esp1` with channel ID `UC08mnbiC4FykqpHqbEWgFcg`. Keep ESPN FC as the first source for that competition.

ESPN Deportes titles are editorial rather than a stable `home vs. away` template. Its parser therefore uses a fail-closed policy:

1. The candidate must come from the exact ESPN Deportes channel.
2. The title must carry an explicit La Liga marker, including the observed `| La Liga` and `| Resumen | La Liga` endings.
3. The title must resolve to exactly two distinct clubs registered in the current La Liga season. Club aliases may be added only when they identify one club unambiguously.
4. Those two clubs must map to exactly one finished fixture that does not already have a highlight.
5. The publication time must be after that fixture's kickoff and within the curator's existing recovery window.
6. The video must pass the existing embedding check.

Club order in the editorial title is not trusted as home/away order. Fixture matching uses the unordered club pair and still requires a unique fixture. The upstream title is never rendered, so scores and editorial spoilers in the title cannot leak into the application.

Targeted curation must select its source by the scheduler-provided `SOURCE_ID`; it must not assume that a competition has exactly one trusted source. Channel ID, source ID, and parser must agree before a candidate can be accepted.

## Discovery and Quota Strategy

Use three bounded layers:

1. Poll both La Liga Atom feeds every minute. Feed requests consume no YouTube Data API quota.
2. Use a shallow, one-page API recovery scan for ESPN Deportes while finished La Liga fixtures are missing highlights. This scan runs no more often than the existing five-minute update cycle.
3. Retain bounded deep recovery for missed feed events and extended outages. ESPN Deportes needs at most 100 recent uploads for recovery, rather than the 400-upload depth used for ESPN FC.

The fallback is not added as an unrestricted fifth minute-level API poller. At a five-minute cadence, one shallow page costs at most 288 units per day; the bounded deep allowance adds about 24 more units per day over the shallow baseline. Metadata checks add only a small number of one-unit calls for plausible candidates. The expected increase is approximately 300-350 units per day, well below the scheduler's 8,000-unit guardrail.

Every quota-consuming path retains the existing hard reservation check and degradation modes. Feed failures, API failures, malformed titles, ambiguous fixtures, and embedding uncertainty fail closed and retry through a slower recovery layer; none may publish an unverified or duplicate video.

## Provider Metadata and UI

Add optional provider metadata to YouTube highlight records. Generated La Liga entries record either `espn-fc` or `espn-deportes` according to the source that passed curation. Existing records without provider metadata remain valid and use the current competition-level fallback label.

The player label resolves from the selected video's provider metadata:

- `espn-fc` -> `Highlights (ESPN FC)`
- `espn-deportes` -> `Highlights (ESPN Deportes)`

NBC, CBS, FOX, and legacy YouTube behavior remain unchanged. Runtime highlight-state parsing and validation must preserve and validate the optional provider field.

## Pending Copy

For a finished match with no accepted highlight:

- Preview card: `Result in · highlights pending`
- Match modal: `Highlights pending`

No other match-state copy changes.

## Error Handling

- A source/channel mismatch is quarantined rather than repeatedly dispatched.
- A title that permanently fails the source shape, competition marker, or two-club requirement is ignored before dispatch or quarantined after dispatch; it is not retried forever.
- A candidate mapping to multiple fixtures is quarantined. A zero-fixture result may retry only when match/result ingestion could still make the mapping valid; otherwise it is quarantined.
- An already-covered fixture acknowledges the candidate without appending a second cut.
- Feed failure does not block API recovery.
- API budget exhaustion stops quota-consuming recovery while leaving quota-free discovery active.
- Provider metadata that is missing uses the legacy label; an unknown provider value is rejected by validation.

## Verification

Automated coverage must include:

- ESPN Deportes title screening for Getafe-Malaga and Villarreal-Levante.
- Rejection of reaction shows, single-club clips, goal clips, ambiguous club names, non-La Liga titles, and wrong channels.
- ESPN FC preference when both providers have an acceptable candidate in the same scan.
- Immediate ESPN Deportes acceptance when ESPN FC has no acceptable candidate.
- No replacement or duplicate when the other provider arrives later.
- Targeted curation routing by `SOURCE_ID` with two trusted sources for `esp1`.
- Quota cost and recovery cadence bounds.
- Provider metadata serialization, runtime-state validation, and both player labels.
- Exact pending copy in the preview card and modal.
- Existing scheduler, curation, data validation, TypeScript, and production build suites.

After deployment, production checks must confirm scheduler health, feed and API recovery diagnostics, successful targeted callback handling, generated highlight state, and HTTP 200 responses from the deployed site and highlight endpoints.
