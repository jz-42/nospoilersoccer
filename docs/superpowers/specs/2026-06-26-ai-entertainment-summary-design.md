# AI Entertainment Summary Design

## Goal

Add a spoiler-safe experiment for finished matches that helps users decide whether a match looks entertaining enough to watch, without revealing the result or score shape by default.

## Scope

This experiment is limited to finished matches from Thursday, June 25, 2026.

It adds two optional disclosures in the finished-match modal:

1. `AI Entertainment Summary`
2. `Total goals`

Both stay hidden by default and require an explicit tap to reveal.

## Product Shape

The entertainment feature is not a rating, badge, or one-word verdict. It is a short AI-written synthesis of broad public reaction in 1 to 2 sentences.

The copy must:

- stay focused on entertainment value, pacing, tension, quality, or atmosphere
- avoid revealing winner, loser, draw, comeback, upset, advancement implications, stoppage-time drama, or total goals
- sound like a broad read of public reaction, not a deterministic judgment

The total-goals disclosure is independent from the entertainment summary so the summary never leaks score shape.

## Data Model

Add optional match metadata:

- `entertainmentSummary?: string`

This is stored statically alongside tournament data. For the experiment, the values are manually seeded from a broad-source synthesis for the six finished June 25 group matches.

No client-side fetching is introduced.

## UI Placement

Add a compact disclosure section near the bottom of the finished-match modal, below highlight choices and above `Hide Result`.

Each disclosure row should:

- read as optional
- look lightweight and consistent with the current modal style
- reveal inline content on tap

Suggested order:

1. `AI Entertainment Summary`
2. `Total goals`

## Safety Rules

Fail closed:

- if a match has no summary, render nothing for that row
- if a summary cannot be written safely, omit it

The summary must never mention:

- scorelines
- who won or lost
- that it was a draw
- late goals or equalizers
- number of goals
- qualification or elimination stakes in a way that gives away the result

## Experiment Data

Seed summaries for these finished June 25, 2026 matches:

- `D5` Turkey vs United States
- `D6` Paraguay vs Australia
- `E5` Ecuador vs Germany
- `E6` Curacao vs Ivory Coast
- `F5` Japan vs Sweden
- `F6` Tunisia vs Netherlands

## Testing

Add smoke coverage for:

- modal renders the new disclosure labels only for matches with summary data
- summary content stays hidden by default
- total-goals disclosure stays hidden by default
- revealed matches still show existing result UI correctly

## Non-Goals

- no automation pipeline yet
- no live fetching in the browser
- no star ratings
- no recommendation labels like `skip` or `must watch`
