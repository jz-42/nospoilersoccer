# Tournament Archive Navigation Design

## Goal

Keep the day-by-day tournament experience usable after the World Cup ends while making the completed knockout bracket the natural archive landing page.

## Behavior

The selected tournament's visitor-local match dates determine its phase. Result completeness does not affect navigation.

- Before the first matchday and from the first matchday through the final matchday, the initial view is the day rail and its tab is labeled **Today**.
- This includes rest days and the entire final matchday, even after the final score has been recorded.
- Beginning on the visitor-local calendar day after the final matchday, the initial view is **Knockouts** and the day-rail tab is labeled **Day**.
- In archive mode, opening **Day** selects the tournament's final matchday rather than inserting an empty current-day card. Earlier matchdays remain browsable.
- Switching tournaments selects the phase-appropriate initial view: day rail for a current/upcoming tournament, Knockouts for an archived tournament.
- A user's explicit tab or matchday choice remains in place until reload or tournament switch.
- Existing spoiler protection, revealed progress, highlights, and match dialogs are unchanged.

## Date Rules

Matchdays use the visitor-local dates derived from kickoff timestamps, matching the existing rail. The first and last dates across all group and knockout matches define the tournament window. At local midnight after the last matchday, the tournament enters archive mode.

## Structure

Add pure navigation helpers that derive the tournament date range, whether it is archived, the initial tab, the tab label, and the day rail's initial date. `App` uses those helpers for default navigation and tournament switching. `Rail` uses the same date rule to select either today or the last matchday without duplicating phase logic.

## Testing

Regression tests cover:

- a final whose score is already present still opens **Today** on its final local date;
- the following local date defaults to **Knockouts** and labels the tab **Day**;
- archived day navigation opens the final matchday;
- historical tournaments use archive behavior;
- visitor-local kickoff dates determine the boundary;
- switching tournaments resets to the phase-appropriate initial view.
