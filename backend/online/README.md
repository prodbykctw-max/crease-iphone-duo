# Online friend-match beta

This is a separate, minimal first-to-seven mode. The Durable Object owns puck
physics and scores. It supports two players per room, fixed table dimensions,
bounded inputs, join links, disconnect handling and a ten-minute room limit.
It does not yet share the main game's powerups, achievements or arena rendering.

Deploy from this directory with `npx wrangler deploy`, then set the returned
HTTPS Worker origin in `/online-config.js`. Add any custom game domain to
ALLOWED_ORIGINS. No D1 database is needed for transient rooms. The public page
shows an honest unavailable state until an endpoint is configured.

Before public launch: test two physical devices on separate networks, add
edge rate limits/abuse controls, load test room capacity, and set account usage
notifications. The active 60 Hz room simulation uses billable Durable Object
duration; it stops when either player leaves or after ten minutes. This beta
does not submit competitive rankings or payments.

The local `node --test tests/online.test.mjs` tests physics only. They are not
evidence of a deployed or cross-device-tested service.
