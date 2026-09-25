# FOX Sports Nations League highlights

## Problem

FOX Sports is publishing 2026/27 Nations League full-match highlights on its main YouTube channel. The Worker treats that channel's uploads as World Cup-only, and the Nations curator trusts only the separate FOX Soccer channel. Consequently valid videos are never queued and the site shows highlights pending.

## Design

Keep the existing FOX Sports channel subscription, minute-by-minute Atom polling, and capped playlist recovery. Classify an exact `<team> vs <team> [Extended] Highlights … UEFA Nations League` title from that channel as a separate `foxnations` candidate. Keep World Cup titles classified as `fox`. The GitHub workflow sends `foxnations` to the Nations curator. The curator accepts either exact FOX Sports or FOX Soccer channel ID, then still requires a unique completed fixture, publication within 72 hours of kickoff, a full-length video, and a working YouTube embed. Existing cuts remain append-only.

This reuses existing FOX Sports API calls. FOX Soccer retains its own 48-unit Pacific-day and two-request rolling-hour limits; global quota stays 8,000 units. Atom and WebSub remain quota-free. A candidate that cannot pass metadata or embed verification retries according to the existing queue policy.

## Release and proof

Write failing tests using the two real September 24 title formats, including emoji between `Highlights` and `UEFA Nations League`. Exercise Atom, WebSub, playlist recovery, routing, and curation. After tests and build pass, publish the workflow to `main`, deploy the Worker, confirm the two existing uploads are ingested, and verify the production highlight endpoint contains their match IDs. Render will redeploy the static site from `main`; the runtime endpoint supplies cuts as soon as curation commits them.
