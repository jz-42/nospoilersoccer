# Nations League pipeline review fixes

**Date:** 2026-09-22
**Status:** Approved by the user's request to fix the reviewed findings

The scheduler must identify fixtures by their position in `groupMatches` or a
knockout round's `matches` array. Tournament, group, round, and tie objects are
not fixtures even if nested text contains a kickoff. This preserves the existing
World Cup date-only knockout handling while giving numeric Nations knockout IDs
the 90-minute-to-12-hour knockout result window.

The Nations curator must persist its video map after any accepted candidate in
a broad scan, regardless of the last candidate's disposition. Targeted scans
continue to report their sole candidate's disposition. Quarantine continues to
publish nothing until the first live FOX Soccer uploads are manually verified.

FOX Soccer API recovery remains conditional on a completed fixture missing a
cut. It may spend no more than two playlist requests in any rolling hour and
48 in a Pacific quota day. The existing global Worker ceiling remains 8,000.
This preserves quota throughout a matchday when public feeds are unavailable.
It does not account for GitHub jobs using the same YouTube project; actual
project-wide usage must be checked in Google Cloud before trust promotion.

Regression tests cover the real 156-fixture source, numeric knockout IDs,
broad-scan acceptance followed by a non-acceptance, and recovery pacing across
multiple five-minute scheduler ticks. Full data, worker, type, lint, and build
checks remain release gates.
