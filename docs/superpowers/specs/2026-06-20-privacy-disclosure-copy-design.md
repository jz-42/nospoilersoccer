# Disclosure Copy and Readability Update

## Scope

Replace the Privacy disclosure text in the onboarding dialog and group both
Privacy and Advanced content into readable paragraphs. Leave the analytics
implementation and disclosure controls unchanged.

## Content

The expanded Privacy disclosure will contain these three paragraphs:

> Your preferences are saved locally in your browser.

> This site uses anonymous Umami analytics for basic usage and error tracking,
> such as page views, match opens, highlight plays, result reveals, and video
> failures. Analytics may include general technical details like device type,
> browser language, screen size, referrer, and approximate country.

> No cookies, persistent IDs, user profiles, team picks, scores, or progress data
> are stored, profiled, or sold.

## Advanced Content

The Advanced disclosure will retain its existing wording, grouped into these
three conceptual paragraphs:

> This is a static React website with no application backend. Your progress is
> stored in your browser.

> Results and highlights are updated automatically through GitHub Actions and
> delivered when the site refreshes.

> YouTube is loaded only after you choose a highlight.

## Rendering

Change the disclosure content model from one string per disclosure to an array
of paragraph strings. Render the expanded disclosure in one existing styled
panel, with a blank-line-sized vertical gap between paragraphs. Privacy and
Advanced each render as three easy-to-scan text blocks without separate cards,
rules, or labels. Preserve the existing collapsed-by-default behavior.

## Verification

Extend the component smoke test to render each disclosure's content directly,
verify the new Privacy copy, verify both disclosures have three paragraphs, and
verify the superseded Privacy copy is absent.
