# Workers + D1 game metrics

D1 stores anonymous events; Workers validates and inserts them. The game remains on GitHub Pages. No Cloudflare resources have been created by this change.

## Deploy from a Cloudflare-connected environment
Install Cloudflare Wrangler, authenticate, then run from `backend/`:

```sh
npx wrangler d1 create crease-metrics
# Put the returned database_id in wrangler.jsonc.
npx wrangler d1 migrations apply crease-metrics --remote
npx wrangler deploy
```

Set `window.CREASE_ANALYTICS_ENDPOINT` in `../analytics-config.js` to the deployed Worker's HTTPS `/events` URL, then publish the frontend. The blank default sends no metrics. Never place a Cloudflare token or payment secret in browser code.

Before enabling publicly, apply Cloudflare rate limiting appropriate to the account. Origin checks prevent casual browser misuse, not forged requests. Metrics are client-reported and unsuitable for prizes, verified scores, billing, or payment entitlements. There is no public read endpoint. Use the authenticated D1 console or Wrangler to query:

```sql
SELECT date(created_at) AS day, name, COUNT(*) AS events
FROM events GROUP BY day, name ORDER BY day DESC, name;

SELECT json_extract(props, '$.source') AS source, COUNT(*) AS visits
FROM events WHERE name = 'visit' GROUP BY source;
```

`visit` counts page loads, not unique people. `match_start` includes new matches, restarts and rematches (see `reason`). `match_complete` fires when the result screen appears. `rematch` counts result-screen rematches. Native `share_handoff` means the platform accepted the share action, not verified message delivery. `share_copy` means clipboard success. `inquiry_click` is a click, not a sale.

The server discards unrecognized properties, uses prepared SQL and deduplicates event UUIDs. It does not persist IP addresses, user agents, names, or persistent player IDs. Infrastructure providers may keep their own logs. Delivery is best effort, without retries; privacy signals disable remote transmission. Local aggregate totals and the return-visit flag survive in localStorage when available. No cross-device retention measurement exists yet.

Suggested retention: delete events older than 90 days through an authenticated maintenance job:

```sql
DELETE FROM events WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-90 days');
```

Test locally with `node --test tests/worker.test.mjs` from the repository root. Deployment and actual D1 integration still require verification in the Cloudflare account.

