# Cloudflare highlight and result workers

The free Workers plan allows 10 ms of CPU per invocation. The work is split
across three Workers so no minute tick parses all seven YouTube feeds:

1. `nospoilersoccer-feed-scanner` scans one channel per private service request.
   It writes candidates to D1 and sends new candidates to the existing Queue.
2. `nospoilersoccer-highlight-tick` runs each minute and calls the scanner once
   per channel. It also retries due candidates and renews WebSub subscriptions.
3. `nospoilersoccer-scheduler` runs each minute to keep the GitHub result
   updater active. It serves the existing public hot state and WebSub routes
   and consumes the candidate Queue.

Deploy from the repository root in dependency order:

```sh
npx wrangler deploy -c cloudflare-feed-scanner/wrangler.toml
npx wrangler deploy -c cloudflare-highlight-tick/wrangler.toml
npx wrangler deploy -c cloudflare-scheduler/wrangler.toml
```

New Cron Triggers can take up to 15 minutes to propagate. Verify both minute
crons and all seven scanner calls in `wrangler tail` before treating a fresh
deployment as healthy. The scanner and tick Workers have no public route.
