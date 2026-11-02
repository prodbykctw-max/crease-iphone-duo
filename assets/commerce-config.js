/* CREASE checkout settings. Public values only; nothing secret ever goes in this file (docs/CHECKOUT.md).
   Every value is empty until the Lemon Squeezy store exists. While CHECKOUT_URL is empty the Premium
   Garage shows a disabled "COMING SOON" button and links nowhere. */
window.CREASE_COMMERCE = Object.freeze({
  // Lemon Squeezy checkout link for the Premium Pass variant: https://<store>.lemonsqueezy.com/checkout/buy/<id>
  CHECKOUT_URL: '',
  // Lemon Squeezy numeric ids. The license Worker (backend/license/wrangler.jsonc vars) must hold the same three.
  STORE_ID: '',
  PRODUCT_ID: '',
  VARIANT_ID: '',
  // Price text shown beside the button once CHECKOUT_URL is set ($2.99 one-time, sales tax/VAT added at checkout).
  // Empty hides the price line. Keep it equal to the store price, which is tax-exclusive (owner's choice, Nov 2026).
  PRICE_LABEL: '$2.99 + tax',
  // When the Pass goes on sale, as ISO time with a zone, for example '2026-12-01T15:00:00Z'. Founder's Gold is
  // for passes bought in the 30 days after this moment. The license Worker decides who qualifies (from the
  // purchase time Lemon Squeezy records), so this copy only drives the date shown in the Premium Garage.
  SALES_START: '',
  // The deployed license Worker, https only: https://crease-license.<subdomain>.workers.dev
  WORKER_URL: ''
});
