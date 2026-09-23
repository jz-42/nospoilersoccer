# Nations League knockout reliability

**Date:** 2026-09-22
**Status:** Approved in conversation

## Result and draw discovery

The update workflow keeps its five-minute, fixture-window Nations ingest for
active and recently finished matches. It also runs one off-window discovery
ingest in the first cycle of an updater job that begins in the 00:00, 06:00,
12:00, or 18:00 UTC hour while the tournament still has pending knockout
stages. The check is
driven by the published tournament state, not by fixtures that have yet to be
discovered. This polls ESPN's 2026 and 2027 scoreboards and standings, but
never calls the YouTube API. A complete draw becomes publishable without a
previously known kickoff; partial draws remain pending under the existing
all-or-nothing stage rule. Repeated discovery is idempotent.

## Score regression safety

After a stage is materialized from a complete ESPN snapshot, compare each
match with the previously published round by stable match ID. If a previously
scored match loses its score, reject that snapshot with an audit error and
retain the previous round and ties in memory. The workflow's existing backup
then keeps last-known-good files on disk. A different new score remains subject
to normal validation; this change protects disappearance, not result
correction.

## Visual championship bracket

The championship track continues using `ConnectedBracket`, the World Cup
component. Its layout resolves `match-winner` feeder references to either a
single match or a two-leg tie. For a tie, both leg cards are kept together as
the feeder node for the next round. The championship can then flow from four
quarter-final ties through two semi-finals to the final, with the third-place
match alongside. Promotion/relegation remains a separate grid, and pending
stages remain pending cards rather than invented fixtures.

## Proof

Regression tests cover discovery with no known knockout fixtures, a complete
snapshot that drops an already published knockout score, and a rendered
championship whose semi-finals refer to quarter-final tie IDs. Run focused
Nations tests, data/type checks, lint, and build. No deployment or trust-mode
change is part of this work.
