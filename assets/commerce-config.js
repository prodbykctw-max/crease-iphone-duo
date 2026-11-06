/* CREASE checkout settings. Public values only; nothing secret ever goes in this file (docs/CHECKOUT.md).
   The Premium Pass is sold through a Stripe Payment Link (Stripe Managed Payments). The Lemon Squeezy ids stay
   empty: that provider is not in use, though the code still supports it. While CHECKOUT_URL is empty the Premium
   Garage shows a disabled "COMING SOON" button and links nowhere. */
window.CREASE_COMMERCE = Object.freeze({
  // Checkout link for the Premium Pass: a Stripe Payment Link (https://buy.stripe.com/...), or a Lemon Squeezy
  // link (https://<store>.lemonsqueezy.com/checkout/buy/<id>) if that provider is ever used instead.
  CHECKOUT_URL: 'https://buy.stripe.com/6oU4gycj9ag0fJC2Ys5AQ02',
  // Lemon Squeezy numeric ids, unused with Stripe. If set, the license Worker (backend/license/wrangler.jsonc vars) must hold the same three.
  STORE_ID: '',
  PRODUCT_ID: '',
  VARIANT_ID: '',
  // Price text shown beside the button once CHECKOUT_URL is set ($2.99 one-time, sales tax/VAT added at checkout).
  // Empty hides the price line. Keep it equal to the store price, which is tax-exclusive (owner's choice, Nov 2026).
  PRICE_LABEL: '$2.99 + tax',
  // When the Pass went on sale, as ISO time with a zone. Founder's Gold is for passes bought in the 30 days
  // after this moment. The license Worker decides who qualifies (from the purchase time Stripe or Lemon Squeezy
  // records), so this copy only drives the date shown in the Premium Garage. Same value as in wrangler.jsonc.
  SALES_START: '2026-11-06T06:18:00Z',
  // The deployed license Worker, https only: https://crease-license.<subdomain>.workers.dev
  WORKER_URL: 'https://crease-license.prodbykctw.workers.dev'
});
