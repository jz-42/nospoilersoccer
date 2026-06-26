# Saved Highlights and Reset Design

## Scope

Clarify that `Reset progress` only resets spoiler-viewing progress, not saved
attention state. Preserve both favorite teams and manually saved matches when a
user starts over. Leave the existing separation of manual match saves and
favorite-team auto-highlighting intact.

## Behavior

The app stores two kinds of state that should remain distinct:

- Viewing progress: watched/skipped match marks and force-revealed knockout
  slots.
- Saved attention state: manually saved matches, favorite teams, and the
  `auto-highlight favorite teams` preference.

`Reset progress` should clear only viewing progress:

- `marks`
- `revealed`

It should preserve:

- manually saved matches (`pins`)
- favorite teams
- `auto-highlight favorite teams`

Behavioral rules:

- A manually saved match remains saved until the user unsaves it explicitly.
- A favorite team may auto-save its matches visually when `favAuto` is enabled.
- Manual saves and favorite-driven saves stay independent in storage.
- If both sources apply to one match, the UI still renders one saved state, not
  stacked or competing states.

## Copy

The reset affordance and confirmation should promise only a viewing reset.
Avoid implying that the action clears favorites, saved matches, or display
preferences.

The confirmation body should explain that revealed scores in the active
tournament will be hidden again. It may also explicitly reassure the user that
saved matches and favorite teams stay in place, as long as the primary promise
remains a viewing reset rather than a full preference wipe.

## Highlight Intent

Saved emphasis should mean “keep this on my radar.” It should not read as
celebration, warning, or team-color fandom. The intent applies equally to
manually saved matches and favorite-team auto-highlights.

The target visual language is:

- one shared saved-match treatment across day cards, group rows, and bracket
  cards
- warm and noticeable, but clearly secondary to spoiler/status signals such as
  `Watch`, `FT`, and revealed scores
- recognizable as a deliberate saved state rather than a faint decorative tint

## Visual Handoff

Claude should handle the pure styling changes. The visual brief is:

- replace the current pink favorite language with the same warm yellow/amber
  family used for saved matches
- unify `.is-pinned` and `.is-fav` into one saved-state language
- strengthen the saved treatment so it reads as intentional and consistent
  across preview cards, group rows, bracket cards, and related favorites UI
  affordances

## Verification

Add regression coverage that proves reset preserves:

- manually saved matches
- favorite teams
- the `favAuto` preference

Verification should also confirm that reset still clears watched/revealed
progress and that the user-facing reset copy reflects the narrower scope.
