# Privacy Disclosure Copy Update

## Scope

Replace only the Privacy disclosure text in the onboarding dialog. Leave the
Advanced disclosure, analytics implementation, disclosure controls, and layout
unchanged.

## Content

The expanded Privacy disclosure will contain these three paragraphs:

> Your preferences are saved locally in your browser.

> This site uses anonymous Umami analytics for basic usage and error tracking,
> such as page views, match opens, highlight plays, result reveals, and video
> failures. Analytics may include general technical details like device type,
> browser language, screen size, referrer, and approximate country.

> No cookies, persistent IDs, user profiles, team picks, scores, or progress data
> are stored, profiled, or sold.

## Rendering

Change the disclosure content model from one string per disclosure to an array
of paragraph strings. Render each entry as its own paragraph while preserving
the existing collapsed-by-default behavior.

## Verification

Extend the component smoke test to open the Privacy disclosure, verify the new
copy and paragraph structure, and verify the superseded copy is absent.
