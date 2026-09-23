# Always-visible Nations League championship bracket

**Date:** 2026-09-22
**Status:** Approved in conversation; user asked to complete the work in this chat.

The Championship tab shows a bracket even before the first knockout draw:
four quarter-final tie positions with two leg rows each, two semi-final
positions, a final, and a third-place position. Empty positions are clearly
labelled “Draw pending,” non-interactive, and carry the published stage windows.
They are UI placeholders only: the tournament, schedule, result pipeline,
progress marks, and highlight data never receive synthetic match IDs.

The partial bracket replaces each placeholder with real `KnockoutCard` content
as complete stages are published. A quarter-final tie stays one visual bracket
node containing its two real leg cards. The Promotion / relegation tab keeps
its existing grid and pending-stage cards. Once all championship rounds are
published, the existing `ConnectedBracket` remains the full-data view.

UEFA draws the semi-final pairings separately from the quarter-finals. Until
both the quarter-final ties and semi-final match references are published, the
partial bracket labels the paths “Semi-final draw pending” and does not draw
QF-to-SF connectors that imply a pairing. Once known, it orders QF ties by
the semi-final slot references. Pending final and third-place positions can
show the known winner/loser progression without inventing participants.

Use a pure view-model helper to derive actual stages, tie order, and whether
pairing paths are known. A dedicated partial-bracket component renders that
model using the existing bracket/card styling plus isolated new CSS. The
isolated stylesheet avoids modifying unrelated in-progress day-navigation CSS.
Tests cover no draw, QF-only, known SF paths, the full connected bracket, and
the absence of fake fixtures or interactive placeholder buttons. Run the
Nations, component, type, lint, and production-build checks before completion.
