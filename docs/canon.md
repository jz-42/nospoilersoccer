# Canon

This app has two truths:

- The **full canon**: the real tournament data we ship with the site.
- The **user canon**: the spoiler-free world the user has earned by revealing matches.

The user canon is a **time capsule**. It should feel like the tournament only
progresses when the user reveals the matches that would let them know it.

## Core rule

Show a **real score, team, or advancement** only when both are true:

1. It is **actually certain** under the real tournament rules.
2. The user has revealed the matches that would let them know it.

If either is false, show a **placeholder** instead.

The user may still choose to **jump ahead** and reveal a locked knockout matchup
manually. That is an intentional spoiler action by the user, not an automatic
leak by the app.

Examples:

- `Germany v ?` is okay if Germany is truly locked into that slot and the user
  has revealed the needed matches.
- `Germany v South Korea` is not okay until South Korea is also truly confirmed
  and user-earned.
- Labels like `Winner Group F` or `Best 3rd-place team` are always okay.

## 2026 best thirds

For the 2026 World Cup, the eight best third-placed teams advance. They are
ranked by:

1. points
2. goal difference
3. goals scored

Because of that, a best-third knockout slot is **not canonically settled** until
the whole group stage is finished.

So:

- the **best-third table** may show the current projection from the user's
  revealed matches
- the **projection lines** from third place may also show that current
  projection
- but a **real best-third team name must not appear in a knockout matchup**
  until the **entire group stage** is revealed

## By surface

- **Today**: same spoiler rules as everywhere else; looking ahead may show one
  real team plus one placeholder, but not an unearned future matchup.
- **Group stage**: fixtures are public, but standings only use revealed matches.
- **Knockouts**: placeholders are fine; real future teams appear only when they
  are both truly settled and user-earned.
