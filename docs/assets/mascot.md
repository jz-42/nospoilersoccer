# Mascot

Official No Spoiler Soccer mascot: a football in a red blindfold.

Canonical standing pose, full-size source: [`mascot.png`](mascot.png) (1254px).
It lives here, outside `src/assets`, so it is never bundled. The app ships
[`src/assets/mascot.webp`](../../src/assets/mascot.webp), a 192px export — 3x the
largest place it is drawn (the 56px onboarding badge).

Used as the header mark, the onboarding badge, and the favicon.

## Sleeping poses (rest-day empty state)

Full-size sources, 1254px squares, same rule as above — they live here and are
never bundled:

- [`mascot-sleeping-1.png`](mascot-sleeping-1.png)
- [`mascot-sleeping-2.png`](mascot-sleeping-2.png)
- [`mascot-sleeping-3.png`](mascot-sleeping-3.png)

The pose is picked from the calendar date — consecutive days cycle 1 → 2 → 3,
so a rest day never reshuffles on refresh and neighbouring rest days never show
the same one.

The z's are drawn in slate `#7D8A9E`, not the near-black the rest of the outline
uses. Everywhere else the mascot's black line sits on a white ball panel; the
z's are the one element with nothing behind them, so in black they scored 1.07:1
against the page and simply vanished. Slate puts them at 5.4:1. Keep them out of
`--accent` green — in this app green means "you can watch this".

### Re-exporting

`src/assets/mascot-sleeping-*.webp` are 800×768 each, and the app draws them in
one fixed `25 / 24` box with `object-fit: contain`, so the footprint and the
caption under them stay put whichever pose comes up. Two things make that work,
and both need honouring if the art is ever re-exported:

- **Crop on alpha > 10, not alpha > 0.** The sources carry a near-invisible
  export halo (alpha 1–10) well outside the art. `Image.getbbox()` sees it, so
  cropping on any-alpha gives three wildly different footprints (0.94 / 1.02 /
  1.15) instead of the true ones.
- **Normalise on width, then bottom-align onto one canvas.** The poses are
  drawn at different heights (pose 1's z's rise higher). Matching widths makes
  the *ball* the same size in all three; bottom-aligning puts the sleeping
  mascot on the same resting line. Normalising on height or area would do
  neither.
