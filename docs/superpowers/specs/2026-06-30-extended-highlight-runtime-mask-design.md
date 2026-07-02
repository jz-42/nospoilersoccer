# Extended Highlight Runtime Mask Design

## Goal

Hide spoiler-bearing extended-highlight runtimes without changing any match data,
video ordering, click behavior, default selection, or playback flow.

## Approved UI Contract

- Outer match cards keep showing quick-highlight minutes.
- Outer match cards replace any extended-highlight minute value with the neutral
  label `Extended`.
- Inner highlight chooser keeps quick-highlight runtimes visible.
- Inner highlight chooser hides extended-highlight runtimes entirely so the label
  reads only `Extended Highlights`.

## Scope

- Apply the rule to every match on the site, regardless of whether the real
  match ended in regulation or after extra time.
- Preserve all existing behavior outside of the displayed runtime text.

## Implementation Notes

- Centralize the runtime masking rules in formatting helpers so the preview card
  and highlight player stay aligned.
- Add regression coverage for the outer runtime badge, the inner highlight
  chooser markup, and the supporting chip alignment CSS.
