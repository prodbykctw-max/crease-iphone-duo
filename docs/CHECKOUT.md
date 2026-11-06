# Premium Pass checkout (Lemon Squeezy)

The Premium Pass is a one-time **$2.99** purchase on Lemon Squeezy, with a **license key** that unlocks the pass in the game. The code is in the repo; nothing is live until the store exists and the steps under "Go-live" are done. Until then every setting in `assets/commerce-config.js` is empty, the Premium Garage shows a disabled **COMING SOON** button, and nothing links anywhere.

## How it works

1. **Buy.** GET PREMIUM PASS is an ordinary link (`target="_blank"`, `rel="noopener noreferrer"`) to the Lemon Squeezy checkout in `CHECKOUT_URL`. Only an `https://*.lemonsqueezy.com` link is accepted; anything else is treated as "not on sale".
2. **Receipt.** Lemon Squeezy emails the buyer a receipt containing the license key (and shows it on its My Orders page).
3. **Redirect back.** The product's confirmation-modal button and receipt button point at `https://playcrease.app/#pass=[license_key]`. The game reads the key from the link once, removes it from the address bar, and activates it automatically.
4. **Restore / manual entry.** The Premium Garage has an "Enter license key" field (same flow). The same key restores the pass on a new device, or after browser data is cleared.
5. **Verify.** The game POSTs the key to the license Worker (`backend/license/`). The Worker calls Lemon Squeezy's License API, checks the store/product (and variant) ids, and returns a signed token. The game unlocks the pass only when the Worker answers `verified: true`.
6. **Founder's Gold.** Not part of the Pass. It is free to the first 100 players who DM @playcrease for a one-time code (see `## Founder's Gold` below). A Pass token always carries `f:false`.

### Why a small separate Worker, not a route on `crease-online`

`crease-online` is a Durable Object relay for live matches. The license endpoint is a stateless request/response function that needs a signing secret and calls an external API. A separate Worker keeps that secret out of the match relay, lets either be deployed or rolled back without touching the other, and keeps a Lemon Squeezy outage or bug from ever affecting online play. It needs no storage: the key, email and IP are never stored. (Cost: one more `wrangler deploy`.)

### Why a plain link, not the lemon.js overlay

The overlay needs `https://app.lemonsqueezy.com/js/lemon.js` in `script-src` (and a frame origin), and Lemon Squeezy asks that the script not be self-hosted. That would weaken the CSP from PR #55 for a $2.99 button. A normal link needs no CSP change. The tradeoff is that the buyer leaves the page for checkout instead of seeing an overlay.

### Files

| File | Role |
| --- | --- |
| `assets/commerce-config.js` | The one config file: `CHECKOUT_URL`, `STORE_ID`, `PRODUCT_ID`, `VARIANT_ID`, `PRICE_LABEL`, `SALES_START`, `WORKER_URL` |
| `assets/monetization.js` | Pass state, `redeemKey`, `takeKeyFromUrl`, Founder code redeem, `?founder=` link, "N of 100 left" |
| `index.html` | Premium Garage markup, COMING SOON / price / key field, funnel events |
| `backend/license/worker.mjs` | `POST /license/activate` |
| `backend/license/token.mjs` | HMAC-SHA256 token sign/verify (reusable by other Workers) |
| `backend/license/founder-codes.mjs` | Founder's Gold codes: `/founder/redeem`, `/founder/left` |
| `backend/license/founder.mjs` | Strict ISO-8601 date parser |
| `backend/license/wrangler.jsonc` | Worker config (ids, rate limits) |
| `backend/worker.mjs` | Metrics Worker, now also accepts the four funnel events |
| `tests/checkout.test.mjs` | Tests for all of the above |

## Lemon Squeezy details this is built on

All checked against the live Lemon Squeezy docs while this was built (November 2026):

- License API (no API key; form-urlencoded POST; 60 requests/minute; `Accept: application/json`): <https://docs.lemonsqueezy.com/api/license-api>
- Activate (`license_key`, `instance_name`; returns `license_key.created_at/status/activation_limit/activation_usage`, `instance.id`, `meta.store_id/product_id/variant_id`): <https://docs.lemonsqueezy.com/api/license-api/activate-license-key>
- Validate (`license_key`, optional `instance_id`): <https://docs.lemonsqueezy.com/api/license-api/validate-license-key>
- Deactivate (`license_key`, `instance_id`): <https://docs.lemonsqueezy.com/api/license-api/deactivate-license-key>
- License key statuses (`inactive`, `active`, `expired`, `disabled`): <https://docs.lemonsqueezy.com/help/licensing/license-api>
- "Generate License Keys", "License length", "Activation limit": <https://docs.lemonsqueezy.com/help/licensing/generating-license-keys>
- Link variables (`[license_key]` etc. work in the confirmation-modal button and receipt button; customers may not click the button, so it is a convenience, not fulfilment): <https://docs.lemonsqueezy.com/help/products/link-variables>
- Customizing the confirmation modal / receipt: <https://docs.lemonsqueezy.com/help/checkout/customizing-confirmation-modal>, <https://docs.lemonsqueezy.com/help/checkout/customizing-receipt-emails>
- Checkout link format `https://[STORE].lemonsqueezy.com/checkout/buy/[VARIANT_ID]`: <https://docs.lemonsqueezy.com/guides/developer-guide/taking-payments>
- Lemon Squeezy as merchant of record (tax, refunds, chargebacks): <https://docs.lemonsqueezy.com/help/payments/merchant-of-record>
- lemon.js (not used): <https://docs.lemonsqueezy.com/help/lemonjs/what-is-lemonjs>

## Go-live steps

Do these in order. Test mode first, then live. Wrangler is not on PATH on this laptop; define it once per PowerShell window:

```powershell
$wr = "C:\Users\Owner\Documents\EBT-PRESENTS-CORNER-STORE-DASH\node_modules\.bin\wrangler.cmd"
& $wr whoami          # must show the Cloudflare account that owns the other CREASE Workers
```

(The laptop has `NODE_ENV=production`; if you ever install dependencies use `npm ci --include=dev`. The Workers here have no dependencies.)

### 1. Create the product in Lemon Squeezy (test mode first)

- Create the store (payout and tax details).
- New product **CREASE Premium Pass**, one-time, price **$2.99**, one variant.
- Turn on **Generate License Keys**. Set **Activation limit = 5** and a lifetime license length (no expiry). The game and the Terms say "up to 5 devices"; if you pick another number, change "5" in `index.html` (`KEY_MESSAGES.limit` and the restore blurb) and in `terms/index.html`.
- In the product's **Confirmation modal** and **receipt** settings, set the button link to `https://playcrease.app/#pass=[license_key]` with a button label such as "Open CREASE".
  Lemon Squeezy documents `[license_key]` for these fields; it does not say whether it keeps a `#fragment` in the link, so check the real link after a test purchase. If the fragment is dropped, use `https://playcrease.app/?pass=[license_key]` instead (the game reads both). A key in a query string reaches GitHub Pages logs, which is why the fragment is preferred.
- Copy the product's **checkout link** (Share) for `CHECKOUT_URL`.

### 2. Get the three ids

Make a test purchase, copy the license key from the receipt, then run:

```powershell
curl.exe -s -X POST https://api.lemonsqueezy.com/v1/licenses/activate -H "Accept: application/json" -d "license_key=PASTE_KEY" -d "instance_name=setup-check"
```

Read `meta.store_id`, `meta.product_id`, `meta.variant_id` from the response (and note the `instance.id`). Free the activation afterwards:

```powershell
curl.exe -s -X POST https://api.lemonsqueezy.com/v1/licenses/deactivate -H "Accept: application/json" -d "license_key=PASTE_KEY" -d "instance_id=PASTE_INSTANCE_ID"
```

Ids may differ between test mode and live mode. Repeat this step after switching to live and use the live values.

### 3. Deploy the license Worker

```powershell
cd backend\license
# edit wrangler.jsonc vars: STORE_ID, PRODUCT_ID, VARIANT_ID, SALES_START (see step 5)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # a fresh signing secret
& $wr secret put SIGNING_SECRET        # paste it when asked; it is never written to a file
& $wr deploy
```

`deploy` prints the Worker URL. The code assumes `https://crease-license.prodbykctw.workers.dev` (the CSP in `index.html` allows exactly that origin). If the printed URL differs, update `connect-src` in `index.html` and `tests/csp.test.mjs`, then run `node tools/stamp-assets.mjs && node tools/csp-hash.mjs`.

Secret names: **`SIGNING_SECRET`** only. There is no Lemon Squeezy API key to store (the License API needs none). While `STORE_ID` or `PRODUCT_ID` is empty, or the secret is missing, the Worker answers 503 and nothing unlocks.

### 4. Redeploy the metrics Worker

It now accepts the four funnel events. No database migration.

```powershell
cd ..           # backend\
& $wr deploy
```

### 5. Fill `assets/commerce-config.js` and set SALES_START

- `CHECKOUT_URL`, `STORE_ID`, `PRODUCT_ID`, `VARIANT_ID`, `WORKER_URL` from steps 1 to 3. `PRICE_LABEL` is already `$2.99 + tax`; it shows only once `CHECKOUT_URL` is set.
- `SALES_START`: the exact moment you announce the Pass (ISO with a zone, e.g. `2026-12-01T15:00:00Z`). Put the **same value** in `backend/license/wrangler.jsonc` and redeploy the license Worker **before** the site goes live. `SALES_START` no longer affects Founder's Gold.
- `node --test tests/*.test.mjs` fails if the config file and `wrangler.jsonc` disagree.
- Run `node tools/stamp-assets.mjs` (cache tag) and `node tools/csp-hash.mjs --check`.

### 6. Test end to end (still in Lemon Squeezy test mode)

1. Open the site, tap Paddles & pass: price, GET PREMIUM PASS and the key field show.
2. Buy with a test card. Confirm the receipt has the key and the button lands on the game with the pass unlocked (and the address bar cleaned).
3. Clear data, enter the key by hand: restores on the same device without a second activation (the game sends the stored instance back; check `activation_usage` in Lemon Squeezy).
4. Enter the key on a second browser: activation_usage goes up. After 5, the game says the key is on its maximum.
5. Confirm a Pass purchase does NOT unlock Founder's Gold.

### 7. Go live

- Switch the store to live mode, repeat step 2 with a real purchase (refund yourself afterwards), update ids/URL/secret if they differ, redeploy.
- Update the "Effective" dates at the top of `terms/index.html` and `privacy/index.html`.
- Merge the PR into `main` (GitHub Pages deploys from `main`). Merge the config and the SALES_START change together; do not merge before the license Worker is deployed.

## Founder's Gold

Founder's Gold is free. It goes to the first 100 players who claim it by DMing @playcrease on Instagram, X or TikTok, and buying the Pass does not give it. Each claimer gets a one-time code (`GOLD-XXXX-XXXX`) and enters it in the Premium Garage ("Have a Founder code?") or opens `https://playcrease.app/?founder=CODE`.

- D1 table `founder_codes` (schema.sql) holds only SHA-256 hashes (of `crease-founder:` + the code, upper case, no spaces or dashes), a label (`public-001` ... `public-100`, plus `owner-000` outside the 100), `claimed_at` and the claiming browser's random device id.
- `POST /founder/redeem {code, device}` claims an unclaimed code for that device and returns a signed token (`p:'founder'`, `f:true`). The same device asking again gets a fresh token (restore); another device gets `used`; an unknown code gets `invalid`. Rate-limited like the other endpoints.
- `GET /founder/left` returns `{left: N}` for the 100 public codes only (cached about 30 s). The Garage shows "N of 100 left" and hides the number if it can't be read.
- The plain codes are kept in a CSV outside the repository and are never committed (`.gitignore` also blocks `founder-codes.csv`).
- Public copy everywhere reads: "Only 100 will ever exist. Free to the first 100 players who DM @playcrease to claim one. Never sold."

## Refunds and revoked keys

Lemon Squeezy is merchant of record and processes refunds. The License API docs do not say what happens to a key on refund, so after refunding, **disable the license key in the Lemon Squeezy dashboard**. A disabled key is refused for any new activation or restore. A device that already unlocked the pass keeps it (the token is stored in the browser and not re-checked); for a $2.99 cosmetic pass that is accepted.

## Online safety

Today the online relay accepts exactly one message from a client, `{type:'move',x,y}`, and sends nothing but the match state. No paddle skin, Design Studio picture, name, or pass status is sent to an opponent, and `tests/checkout.test.mjs` fails if that changes. If premium skins are ever shown to an opponent, the rule is: the client sends its **token**, the relay verifies it with `verifyToken` from `backend/license/token.mjs` (same `SIGNING_SECRET` as a secret on `crease-online`), and relays only a skin id from a fixed list. Design Studio images must never be sent.

## Funnel counter

Uses the existing analytics path (`track` -> `crease:metric` -> `analytics.js` -> `crease-metrics`). Events: `premium_open`, `checkout_start`, `key_submit`, `key_verified`. They carry no properties, are not sent when Do Not Track or Global Privacy Control is on, and the metrics Worker stores no keys, emails or IPs. Count them:

```sql
SELECT date(created_at) AS day, name, COUNT(*) AS n FROM events
WHERE name IN ('premium_open','checkout_start','key_submit','key_verified') GROUP BY day, name ORDER BY day DESC;
```

`checkout_start` is a click on the buy link, not a sale. The authoritative sales count is Lemon Squeezy.

## Values the owner must supply

| Value | Where it comes from | Goes in |
| --- | --- | --- |
| Lemon Squeezy store (account) | Create at lemonsqueezy.com | n/a |
| Checkout link | Product -> Share | `CHECKOUT_URL` |
| `STORE_ID`, `PRODUCT_ID`, `VARIANT_ID` | Step 2 | `commerce-config.js` and `backend/license/wrangler.jsonc` |
| `SIGNING_SECRET` | Step 3 (random, 32 bytes) | `wrangler secret put` only |
| License Worker URL | Printed by `deploy` | `WORKER_URL` |
| `SALES_START` | Moment of announcement | `commerce-config.js` and `backend/license/wrangler.jsonc` |
| Activation limit 5, lifetime license | Product settings | Lemon Squeezy |

## Not verified against a real store

Because no Lemon Squeezy account exists yet, these rest on the docs and mocked responses only: whether a `#fragment` survives in the redirect link; the exact responses for an unknown key and for a key that was never activated; how a refunded key reports its status; whether ids differ between test and live mode.

---

# Stripe checkout (Stripe Managed Payments)

The same Premium Pass can be sold through a Stripe Payment Link with Managed Payments on (Stripe is merchant of
record and handles sales tax/VAT, like Lemon Squeezy, for 3.5% on top of standard card fees). The game picks
the provider from `CHECKOUT_URL` in `assets/commerce-config.js`: a `https://buy.stripe.com/...` link switches the
Premium Garage to Stripe mode; a Lemon Squeezy link keeps the license-key flow. Both stay in the code.

## How it works

1. **GET PREMIUM PASS** opens the Payment Link. After paying, Stripe sends the buyer to
   `https://playcrease.app/?cs={CHECKOUT_SESSION_ID}`.
2. The game reads `cs` once, removes it from the address bar and POSTs `{ session_id, device_id }` to
   `crease-license` `/stripe/redeem`. `device_id` is a random 32-hex id the browser keeps (`crease.device.v1`).
3. The Worker reads the Checkout Session from Stripe (line items + charge expanded) and unlocks only if it is
   complete and paid, in the same mode as the key (live key = live sales only), contains `STRIPE_PRICE_ID`, and
   the charge is not refunded (even partly) or disputed. The token's `c` is the session's `created` time; a Pass never carries Founder's Gold.
4. D1 (`crease-license`, table `devices`) counts devices per sale: at most 5. It stores a SHA-256 of the session
   id and the random device id, nothing else.
5. **Restore** on another device: checkout email + the card's last 4 digits (or the receipt number). The Worker
   searches complete sessions for that email, matches the proof on the charge, re-reads the sale in full and
   applies the same checks. Unknown email and wrong proof get the same answer (`not_found`).

No webhook in v1: a refund after unlock does not lock devices that already have the pass, but blocks every new
unlock or restore. Stripe itself may refund within 60 days under Managed Payments.

## Verified end to end in the sandbox (November 2026, before launch)

Sandbox account "CREASE sandbox". Test product `prod_VYErmeygt1RjVX`, price `price_1UX8NNPI1ShVAXTPm5y7wURF`
($2.99, tax code `txcd_10201000`, video games downloaded, permanent rights), Payment Link with
`managed_payments[enabled]=true`. A test-card purchase redirected back with `?cs=`, unlocked Premium +
Founder's Gold, restore on a fresh device worked (email typed in different case + last 4), wrong digits were
refused, and after a refund restore answered `revoked`.

Findings: the sandbox charge had **no receipt number** (sandbox doesn't send receipts), so card last 4 is the
primary restore proof. Stripe **added sales tax on top** ($2.99 + $0.27 in Georgia = $3.26) because prices are
tax-exclusive by default.

**Decision (owner, November 2026): $2.99 + tax.** Prices are tax-exclusive (`tax_behavior=exclusive`, set
explicitly on the sandbox price) and the button reads `$2.99 + tax`, matching how Steam, the App Store and Google
Play price games in the US. Revisit if EU/UK sales grow: consumer prices there are expected to include VAT
(Directive 98/6/EC Art. 2(a)); a separate tax-inclusive EUR/GBP price would cover it.

## Go-live steps (Stripe)

1. Finish activating the live Stripe account and turn on **Managed Payments** (Dashboard → Settings → Managed
   Payments). Stripe runs an eligibility review.
2. In live mode create the product (name CREASE Premium, tax code `txcd_10201000`, $2.99 one-time, tax behavior
   **exclusive**, i.e. `tax_behavior=exclusive`), then a Payment Link with Managed Payments on and **After payment → redirect** to
   `https://playcrease.app/?cs={CHECKOUT_SESSION_ID}`.
3. Create a **restricted key** (Developers → API keys → Create restricted key) with **Read** on Checkout
   Sessions, Charges and PaymentIntents only, then:
   `wrangler secret put STRIPE_KEY` in `backend/license` (paste the `rk_live_...` key; never commit it).
4. Set `STRIPE_PRICE_ID` (the live price id) and `SALES_START` in `backend/license/wrangler.jsonc`; deploy.
5. In `assets/commerce-config.js` set `CHECKOUT_URL` (the live `buy.stripe.com` link), `WORKER_URL`
   (`https://crease-license.prodbykctw.workers.dev`) and the same `SALES_START`.
6. Update Terms and Privacy to name Stripe (Managed Payments / Link) as merchant of record and processor, and
   mention the restore lookup (email + card last 4, used once, not stored).
7. Buy once in live mode with a real card, check the unlock, then refund it from the Dashboard.
