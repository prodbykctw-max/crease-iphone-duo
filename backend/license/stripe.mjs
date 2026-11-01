// Stripe side of the license Worker (Stripe Managed Payments, Stripe as merchant of record).
//
//   POST /stripe/redeem  { session_id, device_id }      after checkout: the Payment Link sends the buyer
//                                                       back to playcrease.app/?cs={CHECKOUT_SESSION_ID}
//   POST /stripe/restore { email, proof, device_id }    another device: the checkout email plus the receipt
//                                                       number or the last 4 digits of the card used
//   -> 200 { verified: true, token, product, founder, instanceId } | { verified: false, reason }
//
// STRIPE_KEY is a restricted key with READ access to Checkout Sessions, Charges and PaymentIntents only.
// Nothing here writes to Stripe. A sale unlocks up to DEVICE_LIMIT devices; D1 holds only a SHA-256 of the
// Checkout Session id and a random per-browser device id. No email, card digit, name or IP is stored or logged.
import { signToken } from './token.mjs';
import { isFounder } from './founder.mjs';

const API = 'https://api.stripe.com/v1/';
const STRIPE_VERSION = '2025-03-31.basil';
export const DEVICE_LIMIT = 5;
export const SESSION = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;
export const DEVICE = /^[a-f0-9]{32}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@.]{2,24}$/;
const EXPAND = 'expand[]=line_items&expand[]=payment_intent.latest_charge';

export const stripeReady = env => !!(env.SIGNING_SECRET && env.STRIPE_KEY && env.STRIPE_PRICE_ID && env.DB);
const liveKey = env => /^(sk|rk)_live_/.test(String(env.STRIPE_KEY || ''));

async function stripe(env, path) {
  const res = await fetch(API + path, {
    headers: { 'Authorization': 'Bearer ' + env.STRIPE_KEY, 'Stripe-Version': STRIPE_VERSION, 'User-Agent': 'crease-license-worker' },
    signal: AbortSignal.timeout(8000),
  });
  let data = null;
  try { data = await res.json(); } catch (_) { /* not JSON */ }
  return { status: res.status, data };
}

// Why a Checkout Session (retrieved with EXPAND) must not unlock the pass, or '' when it may.
export function sessionProblem(s, env) {
  if (!s || s.object !== 'checkout.session' || typeof s.id !== 'string') return 'invalid';
  if (s.livemode !== liveKey(env)) return 'invalid'; // a test-mode purchase never unlocks the live game
  if (s.mode !== 'payment' || s.status !== 'complete' || s.payment_status !== 'paid') return 'unpaid';
  const items = s.line_items?.data;
  if (!Array.isArray(items) || !items.some(li => li?.price?.id === env.STRIPE_PRICE_ID)) return 'wrong_product';
  const charge = s.payment_intent?.latest_charge;
  if (!charge || typeof charge !== 'object') return 'unpaid';
  if (charge.refunded === true || Number(charge.amount_refunded) > 0 || charge.disputed === true) return 'revoked';
  if (charge.paid !== true || charge.status !== 'succeeded') return 'unpaid';
  if (!Number.isInteger(s.created) || s.created <= 0) return 'invalid';
  return '';
}

async function sha256hex(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, '0')).join('');
}

// Registers this device for the sale unless the sale already has DEVICE_LIMIT devices. One statement, so
// two devices racing for the last place cannot both get it. A device already on the sale always passes.
export async function claimDevice(db, sessionId, device) {
  const sale = await sha256hex('crease-sale:' + sessionId);
  await db.prepare('INSERT OR IGNORE INTO devices (sale, device, at) SELECT ?1, ?2, ?3 WHERE (SELECT COUNT(*) FROM devices WHERE sale = ?1) < ?4')
    .bind(sale, device, Date.now(), DEVICE_LIMIT).run();
  return !!(await db.prepare('SELECT 1 AS ok FROM devices WHERE sale = ?1 AND device = ?2').bind(sale, device).first());
}

async function grant(session, device, env, json, passId) {
  if (!(await claimDevice(env.DB, session.id, device))) return json({ verified: false, reason: 'limit' });
  const createdAt = new Date(session.created * 1000).toISOString();
  const founder = isFounder(createdAt, env.SALES_START);
  const token = await signToken({ p: passId, c: createdAt, i: device, f: founder, iat: Math.floor(Date.now() / 1000) }, env.SIGNING_SECRET);
  return json({ verified: true, token, product: passId, founder, instanceId: device });
}

const deviceOf = body => (typeof body?.device_id === 'string' && DEVICE.test(body.device_id) ? body.device_id : '');

export async function redeemSession(body, env, json, passId) {
  const id = typeof body?.session_id === 'string' ? body.session_id.trim() : '';
  const device = deviceOf(body);
  if (!SESSION.test(id) || !device) return json({ verified: false, reason: 'invalid' });
  if (!stripeReady(env)) return json({ verified: false, reason: 'unavailable' }, 503);
  const r = await stripe(env, 'checkout/sessions/' + id + '?' + EXPAND);
  if (r.status === 404 || r.status === 400) return json({ verified: false, reason: 'invalid' });
  if (r.status !== 200 || !r.data || typeof r.data !== 'object') return json({ verified: false, reason: 'unavailable' }, 503);
  const bad = sessionProblem(r.data, env);
  if (bad) return json({ verified: false, reason: bad });
  return grant(r.data, device, env, json, passId);
}

// The proof is the receipt number from the Stripe receipt email ("1234-5678") or the card's last 4 digits.
const norm = s => String(s || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
export function proofMatches(charge, proof) {
  if (!charge || typeof charge !== 'object') return false;
  const p = norm(proof);
  if (/^\d{4}$/.test(p)) return charge.payment_method_details?.card?.last4 === p;
  return p.length >= 6 && p.length <= 32 && norm(charge.receipt_number) === p;
}

export async function restorePurchase(body, env, json, passId) {
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const proof = typeof body?.proof === 'string' ? body.proof.trim() : '';
  const device = deviceOf(body);
  if (!EMAIL.test(email) || email.length > 254 || !/^[A-Za-z0-9 -]{4,40}$/.test(proof) || !device) return json({ verified: false, reason: 'invalid' });
  if (!stripeReady(env)) return json({ verified: false, reason: 'unavailable' }, 503);
  // Stripe matches the email as it was typed at checkout, so the typed form is tried first, then lower case.
  const tries = [...new Set([email, email.toLowerCase()])];
  for (const e of tries) {
    const r = await stripe(env, 'checkout/sessions?limit=20&status=complete&customer_details[email]=' + encodeURIComponent(e) + '&expand[]=data.payment_intent.latest_charge');
    if (r.status !== 200 || !Array.isArray(r.data?.data)) return json({ verified: false, reason: 'unavailable' }, 503);
    const hit = r.data.data.find(s => s && SESSION.test(String(s.id)) && proofMatches(s.payment_intent?.latest_charge, proof));
    if (!hit) continue;
    // Re-read the matching sale in full (line items included) and apply exactly the checks a redeem gets.
    const full = await stripe(env, 'checkout/sessions/' + hit.id + '?' + EXPAND);
    if (full.status !== 200 || !full.data) return json({ verified: false, reason: 'unavailable' }, 503);
    const bad = sessionProblem(full.data, env);
    if (bad) return json({ verified: false, reason: bad });
    return grant(full.data, device, env, json, passId);
  }
  // Same answer whether the email is unknown or the proof is wrong: the reply never confirms an email bought.
  return json({ verified: false, reason: 'not_found' });
}
