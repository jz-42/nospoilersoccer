# Knockouts Champion Banner Design

## Goal

Keep the Knockouts tab's champion celebration legible by preventing the centered
"Show more detail" control from overlapping it, and replace the generic trophy
illustration with a real FIFA World Cup trophy image.

## Scope

- Change the standard champion celebration used by the 2026 tournament.
- Preserve the separate 2022 Argentina/Messi celebration unchanged.
- Preserve the final card's vertical centering and bracket connector geometry.
- Do not change tournament data, reveal behavior, or navigation.

## Asset

Use a license-compatible photograph or photographic cutout of the FIFA World Cup
trophy with a transparent background. Store the optimized image in the repository
and import it from `Champion.tsx`, so the celebration has no runtime dependency on
an external image host. Retain the image's source and license information in the
repository alongside the asset or in an adjacent attribution file when required by
the selected license.

The image is decorative because the champion name and "World Champions" label
already provide the relevant meaning. Render it with an empty alternative text and
hide it from assistive technology to avoid redundant announcement.

## Layout

Leave the detail control anchored at the top of the Final column. Move the champion
block down enough to create a clear visual gap beneath the collapsed control.

The existing `is-open` state on the detail control will drive a second champion
offset when the explanatory key is expanded. This keeps the entire key clear of the
champion art in both states without putting the champion in normal flow or moving
the final card and its connectors.

Size the photographic trophy to approximately the same visual footprint as the
current generic trophy and preserve the existing gold drop shadow, flag, team name,
and champion label styling.

## Component Changes

- Replace the generic `Trophy` SVG in `Champion.tsx` with the bundled trophy image.
- Keep the `Lift` SVG and the 2022 tournament/team condition intact.
- Add a state-relevant class or sibling selector contract so `App.css` can apply
  distinct closed-detail and open-detail champion offsets.
- Update the champion art CSS to constrain the image predictably.

## Verification

- Add a focused component smoke test proving the standard champion renders the
  bundled decorative trophy image while the 2022 champion still renders its special
  artwork.
- Add or extend a source-level layout smoke test for the open-detail positioning
  contract if the current lightweight test setup cannot calculate browser layout.
- Run the focused test red before implementation and green afterward.
- Run the full project checks, lint, and production build.
- Visually inspect the 2026 Knockouts tab with the detail key both collapsed and
  expanded, confirming no overlap and no movement of the final card.
