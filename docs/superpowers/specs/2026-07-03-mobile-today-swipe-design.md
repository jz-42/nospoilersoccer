# Mobile Today Swipe Design

## Goal

Improve the mobile Today-tab experience in two narrow ways without changing any
desktop behavior or existing Today carousel mechanics:

- make the match modal's top-right close control significantly larger on mobile;
- let a visitor swipe left or right anywhere in the Today tab on mobile to move
  exactly one day backward or forward.

The existing carousel, card interactions, spoiler behavior, and modal content
remain the source of truth and should otherwise behave as they do now.

## Scope

This change applies only when all of the following are true:

- the visitor is on a mobile viewport;
- the active app view is the `Today` tab;
- the user is interacting with the Today-tab content area.

It does not apply to Group stage, Knockouts, desktop viewports, or the modal
sheet's internal drag-to-dismiss behavior.

## Mobile modal close control

Increase the top-right modal close button's mobile tap target substantially from
its current mobile size. The button should remain circular, visually consistent
with the existing frosted control styling, and stay in the same top-right
position.

The icon should scale up with the larger button so the control reads visibly
larger, not just more padded. Desktop close-button sizing remains unchanged.

## Today-tab swipe behavior

Add a mobile-only swipe recognizer at the Today-tab container level so a
horizontal swipe can begin from anywhere inside the Today view, including empty
space, the day header area, or match-card areas.

When a swipe commits:

- swiping left moves to the next day;
- swiping right moves to the previous day;
- each gesture advances exactly one day;
- day changes route through the existing carousel/day-selection behavior rather
  than creating a second navigation path.

This keeps the current day rail as the single source of truth for selected-day
state, scrolling, labels, and card rendering.

## Accidental-gesture prevention

The gesture must be intentionally horizontal before it commits. Specifically:

- vertical page scrolling must continue to feel normal;
- short drags, taps, and diagonal noise must do nothing;
- a gesture should only trigger if horizontal travel clears a deliberate
  threshold and is materially greater than vertical travel;
- once triggered, only one day should move per gesture, even if the swipe is
  long or fast.

The implementation should fail closed: if the gesture direction is ambiguous,
the app should preserve the current day and allow the normal interaction to win.

## Implementation shape

Keep the change local:

- `src/components/Rail.tsx` gains the mobile-only Today-tab swipe handling and
  reuses the existing day-navigation function for committed gestures;
- `src/App.css` updates only the mobile modal close-control sizing and icon
  scale.

If extracting the swipe decision into a small helper makes the threshold logic
easier to test, that is preferred over spreading gesture math inline through the
component.

## Testing

Add or extend automated coverage for:

- the larger mobile modal close-control dimensions;
- swipe-decision logic, including:
  - clear left swipe commits to next day;
  - clear right swipe commits to previous day;
  - mostly vertical motion does not commit;
  - small horizontal motion under threshold does not commit.

## Verification and manual testing

After implementation, verify:

- mobile Today tab still scrolls vertically through match cards normally;
- a deliberate horizontal swipe anywhere in Today moves one day at a time;
- casual taps and short drags do not switch days;
- existing carousel arrows, direct day taps, and jump-to-Today behavior still
  work;
- Group stage and Knockouts do not gain the new swipe behavior;
- the modal close button is noticeably easier to tap on mobile and unchanged on
  desktop.

## Non-goals

- No desktop swipe navigation.
- No swipe behavior outside the Today tab.
- No changes to existing card tap behavior, modal drag-to-dismiss, or carousel
  desktop interactions.
- No redesign of the modal header or day carousel visuals beyond the mobile
  close-control size increase.
