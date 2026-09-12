# Club highlight player simplification

## Goal

Make every non-World-Cup highlight a single neutral, provider-labelled experience, keep YouTube titles hidden in both embedded and fullscreen playback without covering broadcast graphics, and disable every OpenAI-backed updater path for now.

## Product behavior

- World Cup playback keeps its existing Quick Highlights and Extended Highlights choices.
- Every other competition presents one neutral label based on its official source:
  - Premier League: `Highlights (NBC)`
  - La Liga: `Highlights (ESPN)`
  - Champions League: `Highlights (CBS)`
- Club highlight labels never expose duration or YouTube title text.
- Club matches continue to carry one selected official highlight per match.
- Existing entertainment summaries and ratings remain visible as frozen data. No new entertainment copy is generated.

## Player and fullscreen design

The player continues to disable YouTube's native fullscreen and Picture-in-Picture permissions. Native iframe fullscreen would escape any overlay painted by the application.

The application fullscreen button continues to fullscreen the complete player wrapper, which keeps the application-owned title seal present. Its placement moves from the title seal's top-right corner to the conventional bottom-right player position so it is easier to reach.

In the embedded player, an opaque application-owned strip covers YouTube's title and channel UI. In fullscreen, the wrapper reserves a shallow header rail for that seal and lays the iframe below it. The rail must not overlap the video image, so top-left broadcast score graphics remain visible. The fullscreen player may letterbox slightly to preserve the whole 16:9 picture; it must not crop or stretch the broadcast.

The title may remain in cross-origin iframe accessibility metadata because the application cannot rewrite YouTube's internal document. The visual UI must not show it. This limitation is acceptable for the current product, and no title-based AI review is used as a second gate.

## Video ingestion without AI

All OpenAI calls are disabled and removed from the active updater workflow:

- no World Cup video spoiler review;
- no AI rejection alert path;
- no entertainment generation;
- no OpenAI API key, model, or reasoning configuration in the workflow.

The video ingestion scripts retain only ordinary matching safeguards needed to avoid attaching unrelated content: scan the configured official broadcaster channel, recognize the competition and matchup, locate one finished fixture, require publication after kickoff, and require an embeddable video. Title wording is not judged for spoilers. The UI's neutral poster, custom title seal, disabled native fullscreen/Picture-in-Picture, and guarded end state provide the spoiler protection.

Existing generated entertainment data stays in source control. AI-only scripts, state files, workflow steps, and test commands that no longer have a caller are removed where safe.

## Compatibility and existing work

The implementation must preserve the uncommitted header, navigation, card, crest, and layout work already present in this workspace. Player CSS changes are limited to the relevant player selectors, and commits stage only files and hunks belonging to this feature.

The current Cloudflare schedule remains unchanged: it starts one updater workflow at a time and checks every five minutes. After merge, a fresh updater cycle refreshes all World Cup, Premier League, La Liga, and Champions League results and videos before production verification.

## Verification

Automated coverage asserts behavior rather than exact visual styling:

- club labels contain only `Highlights` and the expected provider;
- World Cup labels retain their existing quick/extended behavior;
- club labels and posters expose no duration or YouTube title;
- the native iframe cannot enter fullscreen or Picture-in-Picture;
- the application fullscreen control is outside the top title seal and occupies the bottom-right control position;
- fullscreen layout reserves title-seal space instead of overlaying the video;
- no active workflow or updater command references OpenAI;
- data validation, component tests, scheduler tests, type checking, and the production build pass.

Manual browser verification uses real official videos with spoiler-bearing titles and broadcasts that place a score graphic at top-left. It covers desktop embedded playback, desktop fullscreen, and the non-native fullscreen fallback at a narrow viewport. The title must remain visually absent and the full broadcast picture, including its score graphic, must remain visible.

After verification, merge to `main`, deploy the Worker only if its code changed, run a fresh update cycle, and confirm the production bundles and hot-state endpoints are current.
