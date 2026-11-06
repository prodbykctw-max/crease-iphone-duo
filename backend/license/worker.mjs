// CREASE license Worker: turns a Lemon Squeezy license key into a signed Premium Pass token.
//
//   POST /license/activate   { "license_key": "...", "instance_id": "..."? }
//   -> 200 { verified: true, token, product, founder, instanceId }
//   -> 200 { verified: false, reason: invalid | wrong_product | limit | expired | revoked }
//   -> 400/403/413/415/429/503 for malformed, forbidden, flooded or unavailable requests
//
// Lemon Squeezy's License API needs no API key (https://docs.lemonsqueezy.com/api/license-api), so the
// only secret here is SIGNING_SECRET. The key, the buyer's email and the caller's IP are never logged,
// stored or returned: the response carries only the fields listed above.
//
// The same Worker also serves Stripe purchases (POST /stripe/redeem and /stripe/restore, see stripe.mjs).
// Both routes share the origin check, the rate limits, the body limit and the token format below.
import { signToken } from './token.mjs';
import { parseIso } from './founder.mjs';
import { redeemFounder, foundersLeft } from './founder-codes.mjs';
import { redeemSession, restorePurchase } from './stripe.mjs';

const LS_API = 'https://api.lemonsqueezy.com/v1/licenses/';
// The id the game itself uses for the Premium Pass (assets/monetization.js PRODUCT.id).
export const PASS_ID = 'crease-premium-pass';
const KEY = /^[A-Za-z0-9_-]{8,100}$/;
const INSTANCE = /^[A-Za-z0-9-]{8,64}$/;
const MAX_BODY = 1024;
const ROUTES = ['/license/activate', '/stripe/redeem', '/stripe/restore', '/founder/redeem', '/founder/left'];

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!origin || !allowed.includes(origin)) return new Response('Forbidden', { status: 403 });
    const cors = { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Cache-Control': 'no-store' };
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
    const text = (body, status) => new Response(body, { status, headers: cors });

    const path = new URL(request.url).pathname;
    if (!ROUTES.includes(path)) return text('Not found', 404);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors,
      'Access-Control-Allow-Methods': path === '/founder/left' ? 'GET' : 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' } });
    // How many of the 100 free Founder's Gold codes are still unclaimed (cached about 30 s inside foundersLeft).
    if (path === '/founder/left') {
      if (request.method !== 'GET') return text('Method not allowed', 405);
      try {
        return new Response(JSON.stringify({ left: await foundersLeft(env) }), { status: 200, headers: { ...cors, 'Cache-Control': 'public, max-age=30', 'Content-Type': 'application/json' } });
      } catch (_) {
        return json({ left: null }, 503);
      }
    }
    if (request.method !== 'POST') return text('Method not allowed', 405);
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return text('JSON required', 415);

    // Lemon Squeezy allows 60 License API calls a minute for this Worker as a whole (one activation is
    // one or two calls), so a per-connection limit and a Worker-wide limit both run before any body is
    // read. The IP is only a transient limiter key; it is never stored.
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (env.PER_IP && !(await env.PER_IP.limit({ key: ip })).success) return text('Too many requests', 429);
    if (env.ALL_TRAFFIC && !(await env.ALL_TRAFFIC.limit({ key: 'all' })).success) return text('Too many requests', 429);

    const raw = await readBody(request, MAX_BODY);
    if (raw === null) return text('Too large', 413);
    let body;
    try { body = JSON.parse(raw); } catch (_) { return text('Invalid JSON', 400); }
    if (path === '/founder/redeem') {
      try {
        const r = await redeemFounder(body, env);
        return json(r.body, r.status);
      } catch (_) {
        return json({ ok: false, reason: 'unavailable' }, 503);
      }
    }
    if (path !== '/license/activate') {
      try {
        return await (path === '/stripe/redeem' ? redeemSession : restorePurchase)(body, env, json, PASS_ID);
      } catch (_) {
        return json({ verified: false, reason: 'unavailable' }, 503);
      }
    }
    const key = typeof body?.license_key === 'string' ? body.license_key.trim() : '';
    const prior = typeof body?.instance_id === 'string' && INSTANCE.test(body.instance_id) ? body.instance_id : '';
    if (!KEY.test(key)) return json({ verified: false, reason: 'invalid' });

    // Fail closed: without the signing secret and the expected Lemon Squeezy ids nothing is accepted.
    if (!env.SIGNING_SECRET || !env.STORE_ID || !env.PRODUCT_ID) return json({ verified: false, reason: 'unavailable' }, 503);

    try {
      // Same device asking again (the browser sends back the instance it was given): validate that
      // instance instead of spending another activation.
      let instance = '', info = null;
      if (prior) {
        const v = await lemon('validate', { license_key: key, instance_id: prior });
        if (v.data?.valid === true && v.data.instance?.id === prior && !problem(v.data, env)) { instance = prior; info = v.data; }
      }
      if (!instance) {
        const a = await lemon('activate', { license_key: key, instance_name: 'crease-web-' + randomHex(4) });
        if (a.status >= 500 || !a.data || typeof a.data !== 'object') return json({ verified: false, reason: 'unavailable' }, 503);
        const bad = problem(a.data, env);
        if (a.data.activated !== true) {
          if (bad) return json({ verified: false, reason: bad });
          if (a.data.license_key && /limit/i.test(String(a.data.error || ''))) return json({ verified: false, reason: 'limit' });
          return json({ verified: false, reason: 'invalid' });
        }
        // Activated: confirm it is really OUR product. A key from another product or store must not
        // unlock the pass, and its activation is handed back so it does not eat that key's limit.
        if (bad) {
          if (a.data.instance?.id) await lemon('deactivate', { license_key: key, instance_id: a.data.instance.id }).catch(() => {});
          return json({ verified: false, reason: bad });
        }
        instance = a.data.instance?.id;
        info = a.data;
        if (typeof instance !== 'string' || !INSTANCE.test(instance)) return json({ verified: false, reason: 'unavailable' }, 503);
      }
      const createdAt = info.license_key.created_at;
      // Founder's Gold is no longer granted by buying: a Pass is never a Founder pass (see founder-codes.mjs).
      const token = await signToken({ p: PASS_ID, c: createdAt, i: instance, f: false, iat: Math.floor(Date.now() / 1000) }, env.SIGNING_SECRET);
      return json({ verified: true, token, product: PASS_ID, founder: false, instanceId: instance });
    } catch (_) {
      return json({ verified: false, reason: 'unavailable' }, 503);
    }
  },
};

// Why a Lemon Squeezy response must not unlock the pass, or '' when it is fine. Checked on every
// response that carries the license, so a wrong-product key is refused even if it reached the limit.
function problem(data, env) {
  const meta = data.meta, lic = data.license_key;
  if (meta) {
    if (String(meta.store_id) !== String(env.STORE_ID) || String(meta.product_id) !== String(env.PRODUCT_ID)) return 'wrong_product';
    if (env.VARIANT_ID && String(meta.variant_id) !== String(env.VARIANT_ID)) return 'wrong_product';
  } else if (data.activated === true || data.valid === true) return 'invalid'; // success without ids: never trust it
  if (lic) {
    if (lic.status === 'disabled') return 'revoked';
    if (lic.status === 'expired') return 'expired';
    if (lic.expires_at && (parseIso(lic.expires_at) ?? 0) <= Date.now()) return 'expired';
  }
  if ((data.activated === true || data.valid === true) && (!lic || parseIso(lic.created_at) === null)) return 'invalid';
  return '';
}

async function lemon(action, params) {
  const res = await fetch(LS_API + action, {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'crease-license-worker' },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(8000),
  });
  let data = null;
  try { data = await res.json(); } catch (_) { /* not JSON */ }
  return { status: res.status, data };
}

function randomHex(bytes) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), b => b.toString(16).padStart(2, '0')).join('');
}

async function readBody(request, max) {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let at = 0;
  for (const c of chunks) { bytes.set(c, at); at += c.length; }
  return new TextDecoder().decode(bytes);
}
