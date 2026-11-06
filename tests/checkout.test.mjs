// Premium Pass checkout: signed tokens, the Pass never being a Founder pass, the license Worker (Lemon Squeezy mocked),
// the browser-side redeem flow, config consistency, and "nothing old is left in the repo".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { signToken, verifyToken } from '../backend/license/token.mjs';
import { parseIso } from '../backend/license/founder.mjs';
import license, { PASS_ID } from '../backend/license/worker.mjs';
import metrics from '../backend/worker.mjs';

const ROOT = new URL('../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, ROOT), 'utf8');
const SECRET = 'unit-test-signing-secret-0123456789';
const ORIGIN = 'https://playcrease.app';

// ---------------------------------------------------------------- tokens
test('token: sign then verify returns the payload, with version and signature checked', async () => {
  const token = await signToken({ p: PASS_ID, c: '2026-12-02T10:00:00.000000Z', i: 'f90ec370-fd83-46a5-8bbd-44a241e78665', f: true, iat: 1 }, SECRET);
  assert.match(token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(await verifyToken(token, SECRET), { v: 1, p: PASS_ID, c: '2026-12-02T10:00:00.000000Z', i: 'f90ec370-fd83-46a5-8bbd-44a241e78665', f: true, iat: 1 });
});

test('token: wrong secret, tampered payload or signature, and garbage are all rejected (never thrown)', async () => {
  const token = await signToken({ p: PASS_ID, c: '2026-12-02T10:00:00Z', i: 'abcdef12-0000', f: false, iat: 1 }, SECRET);
  const [body, sig] = token.split('.');
  assert.equal(await verifyToken(token, SECRET + 'x'), null);
  const forged = Buffer.from(JSON.stringify({ v: 1, p: PASS_ID, c: '2026-12-02T10:00:00Z', i: 'abcdef12-0000', f: true, iat: 1 })).toString('base64url');
  assert.equal(await verifyToken(forged + '.' + sig, SECRET), null, 'flipping founder to true must break the signature');
  assert.equal(await verifyToken(body + '.' + sig.slice(0, -2) + 'AA', SECRET), null);
  for (const junk of ['', 'x', 'a.b.c', '....', null, undefined, 42, {}, 'a'.repeat(5000)]) assert.equal(await verifyToken(junk, SECRET), null);
  await assert.rejects(() => signToken({ p: 'x' }, ''), /secret/);
  assert.equal(await verifyToken(token, 'short'), null);
});

test('token: the payload holds product, created_at, instance and founder only (no key, email or name)', async () => {
  const token = await signToken({ p: PASS_ID, c: '2026-12-02T10:00:00Z', i: 'abcdef12-0000', f: false, iat: 5 }, SECRET);
  const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
  assert.deepEqual(Object.keys(payload).sort(), ['c', 'f', 'i', 'iat', 'p', 'v']);
});

// ---------------------------------------------------------------- dates, and no Founder window any more
test('dates: Lemon Squeezy timestamps (six fractional digits) and zone offsets parse exactly', () => {
  assert.equal(parseIso('2021-01-24T14:15:07.000000Z'), Date.UTC(2021, 0, 24, 14, 15, 7));
  assert.equal(parseIso('2021-01-24T14:15:07.123456Z'), Date.UTC(2021, 0, 24, 14, 15, 7, 123));
  assert.equal(parseIso('2026-12-01T17:00:00+02:00'), Date.UTC(2026, 11, 1, 15, 0, 0));
  for (const bad of ['', undefined, null, 'soon', '2026-12-01', '2026-12-01T15:00:00', 20261201]) assert.equal(parseIso(bad), null);
});

test('founder: buying is no longer how Founder\'s Gold is earned (the 30-day window code is gone)', async () => {
  const mod = await import('../backend/license/founder.mjs');
  for (const gone of ['FOUNDER_DAYS', 'founderCutoff', 'isFounder']) assert.equal(mod[gone], undefined, gone + ' is removed');
  for (const f of ['backend/license/worker.mjs', 'backend/license/stripe.mjs', 'assets/monetization.js']) {
    assert.ok(!/isFounder\(createdAt|founderWindowEnd|FOUNDER_DAYS|SALES_START \+ 30/.test(read(f)), f + ' has no purchase-time Founder rule');
  }
});

// ---------------------------------------------------------------- license Worker, Lemon Squeezy mocked
const KEY = '38b1460a-5104-4067-a91d-77b872934d51';
const INSTANCE = 'f90ec370-fd83-46a5-8bbd-44a241e78665';
const SALES_START = '2026-12-01T15:00:00Z';
const baseEnv = (extra = {}) => ({ ALLOWED_ORIGINS: 'https://playcrease.app,https://www.playcrease.app', STORE_ID: '111', PRODUCT_ID: '222', VARIANT_ID: '333', SALES_START, SIGNING_SECRET: SECRET, ...extra });
const meta = (extra = {}) => ({ store_id: 111, order_id: 2, order_item_id: 3, product_id: 222, product_name: 'CREASE Premium Pass', variant_id: 333, variant_name: 'Default', customer_id: 6, customer_name: 'Buyer Name', customer_email: 'buyer@example.com', ...extra });
const lic = (extra = {}) => ({ id: 1, status: 'active', key: KEY, activation_limit: 5, activation_usage: 1, created_at: '2026-12-05T10:00:00.000000Z', expires_at: null, ...extra });
const okActivate = (extra = {}) => ({ status: 200, json: { activated: true, error: null, license_key: lic(), instance: { id: INSTANCE, name: 'crease-web-x', created_at: '2026-12-05T10:00:00.000000Z' }, meta: meta(), ...extra } });

// Replaces fetch for one test; `script` maps an action (activate / validate / deactivate) to a reply.
async function withLemon(script, run) {
  const calls = [], realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const action = String(url).replace('https://api.lemonsqueezy.com/v1/licenses/', '');
    calls.push({ url: String(url), action, init, form: Object.fromEntries(new URLSearchParams(init.body)) });
    const r = script[action];
    if (r instanceof Error) throw r;
    const { status = 200, json, text } = typeof r === 'function' ? r(calls) : r || { status: 500 };
    return new Response(text ?? JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } });
  };
  const logged = [], realConsole = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  for (const k of Object.keys(realConsole)) console[k] = (...a) => logged.push(a.join(' '));
  try { return await run(calls, logged); } finally { globalThis.fetch = realFetch; Object.assign(console, realConsole); }
}
const post = (body, env = baseEnv(), { origin = ORIGIN, headers = {}, raw } = {}) => license.fetch(new Request('https://license.example/license/activate', {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: raw ?? JSON.stringify(body) }), env);

test('license Worker: a valid key activates once, checks ids, and returns a signed token', async () => {
  await withLemon({ activate: okActivate() }, async (calls, logged) => {
    const res = await post({ license_key: ' ' + KEY + ' ' });
    assert.equal(res.status, 200);
    const out = await res.json();
    assert.deepEqual(Object.keys(out).sort(), ['founder', 'instanceId', 'product', 'token', 'verified']);
    assert.equal(out.verified, true); assert.equal(out.product, PASS_ID); assert.equal(out.instanceId, INSTANCE);
    assert.equal(out.founder, false, 'a Pass is never a Founder pass, even bought on day one');
    const payload = await verifyToken(out.token, SECRET);
    assert.deepEqual({ p: payload.p, c: payload.c, i: payload.i, f: payload.f }, { p: PASS_ID, c: '2026-12-05T10:00:00.000000Z', i: INSTANCE, f: false });
    // exactly one Lemon Squeezy call: POST /activate, form-encoded, Accept json, generic User-Agent
    assert.equal(calls.length, 1);
    const c = calls[0];
    assert.equal(c.url, 'https://api.lemonsqueezy.com/v1/licenses/activate');
    assert.equal(c.init.method, 'POST');
    assert.equal(c.init.headers.Accept, 'application/json');
    assert.equal(c.init.headers['Content-Type'], 'application/x-www-form-urlencoded');
    assert.equal(c.init.headers['User-Agent'], 'crease-license-worker');
    assert.deepEqual(Object.keys(c.form).sort(), ['instance_name', 'license_key']);
    assert.equal(c.form.license_key, KEY);
    assert.match(c.form.instance_name, /^crease-web-[0-9a-f]{8}$/);
    // nothing about the buyer is returned or logged, and nothing is logged at all
    const text = JSON.stringify(out);
    for (const s of ['buyer@example.com', 'Buyer Name', KEY]) assert.ok(!text.includes(s) && !logged.join('\n').includes(s));
    assert.deepEqual(logged, []);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  });
});

test('license Worker: a Pass is never a Founder pass, whenever it was bought or whatever SALES_START says', async () => {
  const iso = ms => new Date(ms).toISOString().replace('.000Z', '.000000Z');
  for (const created of [iso(Date.UTC(2026, 11, 1, 15, 0, 1)), iso(Date.UTC(2026, 11, 31, 14, 59, 59)), iso(Date.UTC(2027, 5, 1))]) {
    for (const sales of [SALES_START, '']) {
      await withLemon({ activate: okActivate({ license_key: lic({ created_at: created }) }) }, async () => {
        const out = await (await post({ license_key: KEY }, baseEnv({ SALES_START: sales }))).json();
        assert.equal(out.founder, false, created);
        assert.equal((await verifyToken(out.token, SECRET)).f, false);
      });
    }
  }
});

test('license Worker: an unknown key is "invalid"', async () => {
  await withLemon({ activate: { status: 404, json: { activated: false, error: 'license_key not found.', license_key: null, instance: null, meta: null } } }, async () => {
    assert.deepEqual(await (await post({ license_key: KEY })).json(), { verified: false, reason: 'invalid' });
  });
  await withLemon({}, async calls => {   // malformed keys never reach Lemon Squeezy
    for (const k of ['', 'short', 'has spaces in it', 'x'.repeat(101), 12345, null]) assert.deepEqual(await (await post({ license_key: k })).json(), { verified: false, reason: 'invalid' });
    assert.equal(calls.length, 0);
  });
});

test('license Worker: a key for another product or store is refused, and its activation is handed back', async () => {
  for (const wrong of [{ product_id: 999 }, { store_id: 999 }, { variant_id: 999 }]) {
    await withLemon({ activate: okActivate({ meta: meta(wrong) }), deactivate: { json: { deactivated: true, error: null } } }, async calls => {
      const out = await (await post({ license_key: KEY })).json();
      assert.deepEqual(out, { verified: false, reason: 'wrong_product' }, JSON.stringify(wrong));
      assert.equal(calls.at(-1).action, 'deactivate');
      assert.deepEqual(calls.at(-1).form, { license_key: KEY, instance_id: INSTANCE });
    });
  }
  // a wrong-product key that is also at its limit is still reported as the wrong product
  await withLemon({ activate: { status: 400, json: { activated: false, error: 'This license key has reached the activation limit.', license_key: lic({ activation_usage: 5 }), meta: meta({ product_id: 999 }) } } }, async () => {
    assert.equal((await (await post({ license_key: KEY })).json()).reason, 'wrong_product');
  });
});

test('license Worker: with no VARIANT_ID configured any variant of the product is accepted', async () => {
  await withLemon({ activate: okActivate({ meta: meta({ variant_id: 777 }) }) }, async () => {
    assert.equal((await (await post({ license_key: KEY }, baseEnv({ VARIANT_ID: '' }))).json()).verified, true);
  });
});

test('license Worker: over the activation limit is "limit" and no token is issued', async () => {
  await withLemon({ activate: { status: 400, json: { activated: false, error: 'This license key has reached the activation limit.', license_key: lic({ activation_usage: 5 }), meta: meta() } } }, async () => {
    const out = await (await post({ license_key: KEY })).json();
    assert.deepEqual(out, { verified: false, reason: 'limit' });
  });
});

test('license Worker: disabled, expired and past-expiry keys are refused', async () => {
  const cases = [['disabled', lic({ status: 'disabled' }), 'revoked'], ['expired', lic({ status: 'expired' }), 'expired'],
    ['active but expires_at in the past', lic({ expires_at: '2020-01-01T00:00:00.000000Z' }), 'expired']];
  for (const [name, license_key, reason] of cases) {
    await withLemon({ activate: okActivate({ license_key }), deactivate: { json: {} } }, async () => {
      assert.deepEqual(await (await post({ license_key: KEY })).json(), { verified: false, reason }, name);
    });
  }
});

test('license Worker: a "successful" reply with no ids or no created_at is not trusted', async () => {
  await withLemon({ activate: okActivate({ meta: undefined }), deactivate: { json: {} } }, async () => {
    assert.equal((await (await post({ license_key: KEY })).json()).verified, false);
  });
  await withLemon({ activate: okActivate({ license_key: lic({ created_at: 'yesterday' }) }), deactivate: { json: {} } }, async () => {
    assert.equal((await (await post({ license_key: KEY })).json()).verified, false);
  });
});

test('license Worker: the same device asking again validates its instance instead of using another activation', async () => {
  await withLemon({ validate: { json: { valid: true, error: null, license_key: lic(), instance: { id: INSTANCE, name: 'x', created_at: '2026-12-05T10:00:00Z' }, meta: meta() } } }, async calls => {
    const out = await (await post({ license_key: KEY, instance_id: INSTANCE })).json();
    assert.equal(out.verified, true); assert.equal(out.instanceId, INSTANCE);
    assert.deepEqual(calls.map(c => c.action), ['validate']);
    assert.deepEqual(calls[0].form, { license_key: KEY, instance_id: INSTANCE });
    assert.equal((await verifyToken(out.token, SECRET)).i, INSTANCE);
  });
  // an instance Lemon Squeezy does not know: fall back to a normal activation
  await withLemon({ validate: { status: 404, json: { valid: false, error: 'instance not found', license_key: lic(), instance: null, meta: meta() } }, activate: okActivate() }, async calls => {
    assert.equal((await (await post({ license_key: KEY, instance_id: 'deadbeef-0000' })).json()).verified, true);
    assert.deepEqual(calls.map(c => c.action), ['validate', 'activate']);
  });
  // a validate reply for a different instance is not accepted as this device's
  await withLemon({ validate: { json: { valid: true, error: null, license_key: lic(), instance: { id: 'other-instance-1' }, meta: meta() } }, activate: okActivate() }, async calls => {
    await post({ license_key: KEY, instance_id: 'deadbeef-0000' });
    assert.deepEqual(calls.map(c => c.action), ['validate', 'activate']);
  });
});

test('license Worker: Lemon Squeezy being down or unreadable gives 503 and no token', async () => {
  for (const script of [{ activate: { status: 500, text: 'oops' } }, { activate: { status: 200, text: '<html>' } }, { activate: new Error('network') }]) {
    await withLemon(script, async () => {
      const res = await post({ license_key: KEY });
      assert.equal(res.status, 503);
      assert.deepEqual(await res.json(), { verified: false, reason: 'unavailable' });
    });
  }
});

test('license Worker: fails closed without the secret or the Lemon Squeezy ids', async () => {
  for (const missing of ['SIGNING_SECRET', 'STORE_ID', 'PRODUCT_ID']) {
    await withLemon({ activate: okActivate() }, async calls => {
      const res = await post({ license_key: KEY }, baseEnv({ [missing]: '' }));
      assert.equal(res.status, 503, missing);
      assert.equal(calls.length, 0, 'no Lemon Squeezy call is made when unconfigured');
    });
  }
});

test('license Worker: origin, method, content type, size, rate limits', async () => {
  await withLemon({ activate: okActivate() }, async calls => {
    assert.equal((await post({ license_key: KEY }, baseEnv(), { origin: 'https://evil.example' })).status, 403);
    assert.equal((await license.fetch(new Request('https://license.example/license/activate', { method: 'POST', body: '{}' }), baseEnv())).status, 403, 'no Origin');
    assert.equal((await license.fetch(new Request('https://license.example/license/activate', { method: 'GET', headers: { Origin: ORIGIN } }), baseEnv())).status, 405);
    assert.equal((await license.fetch(new Request('https://license.example/other', { method: 'POST', headers: { Origin: ORIGIN } }), baseEnv())).status, 404);
    assert.equal((await post(null, baseEnv(), { headers: { 'Content-Type': 'text/plain' }, raw: 'x' })).status, 415);
    assert.equal((await post(null, baseEnv(), { raw: 'not json' })).status, 400);
    assert.equal((await post(null, baseEnv(), { raw: JSON.stringify({ license_key: KEY, pad: 'x'.repeat(2000) }) })).status, 413);
    const pre = await license.fetch(new Request('https://license.example/license/activate', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), baseEnv());
    assert.equal(pre.status, 204); assert.equal(pre.headers.get('Access-Control-Allow-Origin'), ORIGIN); assert.equal(pre.headers.get('Access-Control-Allow-Methods'), 'POST');
    const limited = { async limit() { return { success: false }; } };
    assert.equal((await post({ license_key: KEY }, baseEnv({ PER_IP: limited }))).status, 429);
    assert.equal((await post({ license_key: KEY }, baseEnv({ ALL_TRAFFIC: limited }))).status, 429);
    assert.equal(calls.length, 0, 'none of the refused requests reached Lemon Squeezy');
  });
});

// ---------------------------------------------------------------- browser side (assets/monetization.js)
function loadClient({ store = {}, config, fetchImpl } = {}) {
  const window = { CREASE_COMMERCE: config, fetch: fetchImpl };
  const context = { window, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, atob, btoa,
    localStorage: { getItem: k => Object.hasOwn(store, k) ? store[k] : null, setItem: (k, v) => { store[k] = String(v); } } };
  vm.runInNewContext(read('assets/monetization.js'), context);
  return { api: window.CreaseProduct, store };
}
const liveConfig = { CHECKOUT_URL: 'https://crease.lemonsqueezy.com/checkout/buy/abc', WORKER_URL: 'https://crease-license.prodbykctw.workers.dev', PRICE_LABEL: '$2.99', SALES_START };
// Objects built inside the vm context come from another realm; compare them as plain JSON.
const plain = o => JSON.parse(JSON.stringify(o));
const reply = (json, status = 200) => async () => new Response(JSON.stringify(json), { status });

test('client: nothing is on sale until a Lemon Squeezy https checkout link is configured', () => {
  for (const url of ['', undefined, 'https://www.instagram.com/prodbykctw/', 'http://crease.lemonsqueezy.com/checkout/buy/a', 'https://lemonsqueezy.com.evil.example/x', 'javascript:alert(1)', 'not a url']) {
    const { api } = loadClient({ config: { CHECKOUT_URL: url } });
    assert.equal(api.checkout(), '', String(url)); assert.equal(api.checkoutReady(), false);
  }
  assert.equal(loadClient({}).api.checkoutReady(), false, 'no config object at all');
  const { api } = loadClient({ config: liveConfig });
  assert.equal(api.checkout(), liveConfig.CHECKOUT_URL); assert.equal(api.checkoutReady(), true);
  assert.equal(api.priceLabel(), '$2.99');
  assert.equal(loadClient({ config: { PRICE_LABEL: '  ' } }).api.priceLabel(), '', 'a blank price label hides the price');
});

test('client: restore needs an https Worker URL', () => {
  assert.equal(loadClient({ config: { WORKER_URL: '' } }).api.restoreReady(), false);
  assert.equal(loadClient({ config: { WORKER_URL: 'http://crease-license.example' } }).api.restoreReady(), false);
  assert.equal(loadClient({ config: liveConfig }).api.restoreReady(), true);
});

test('client: a key unlocks the pass only when the Worker says verified, and a Pass never carries Founder\'s Gold', async () => {
  const sent = [];
  const fetchImpl = async (url, init) => { sent.push({ url, init, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ verified: true, token: 'tok.en', product: PASS_ID, founder: true, instanceId: INSTANCE })); };
  const { api, store } = loadClient({ config: liveConfig, fetchImpl });
  assert.equal(api.isPremium(), false);
  assert.deepEqual(plain(await api.redeemKey(' ' + KEY.slice(0, 18) + '\n' + KEY.slice(18) + ' ')), { ok: true });
  assert.equal(sent[0].url, 'https://crease-license.prodbykctw.workers.dev/license/activate');
  assert.deepEqual(sent[0].body, { license_key: KEY });
  assert.equal(sent[0].init.credentials, 'omit');
  assert.equal(api.isPremium(), true); assert.equal(api.isFounder(), false, 'even a Worker reply that says founder:true is ignored'); assert.equal(api.canUse('founder'), false);
  const saved = JSON.parse(store['crease.entitlement.v1']);
  assert.equal(saved.token, 'tok.en'); assert.equal(saved.instanceId, INSTANCE); assert.equal(saved.founder, undefined);
  assert.ok(!JSON.stringify(store).includes(KEY), 'the license key itself is never stored');
  // asking again from this device sends the instance back so no new activation is used
  await api.redeemKey(KEY);
  assert.deepEqual(sent[1].body, { license_key: KEY, instance_id: INSTANCE });
  // a reload keeps the pass
  assert.equal(loadClient({ store, config: liveConfig }).api.isPremium(), true); assert.equal(loadClient({ store, config: liveConfig }).api.isFounder(), false);
});

test('client: a Pass cannot use Founder\'s Gold, whatever the device clock says', async () => {
  const { api } = loadClient({ config: liveConfig, fetchImpl: reply({ verified: true, token: 't', product: PASS_ID, founder: false, instanceId: INSTANCE }) });
  assert.deepEqual(plain(await api.redeemKey(KEY)), { ok: true });
  assert.equal(api.isPremium(), true); assert.equal(api.canUse('prism'), true);
  assert.equal(api.isFounder(), false); assert.equal(api.canUse('founder'), false); assert.equal(api.setPaddleStyle('founder'), false);
});

test('client: refusals, bad replies and being offline never unlock anything', async () => {
  const cases = [
    [reply({ verified: false, reason: 'limit' }), { ok: false, reason: 'limit' }],
    [reply({ verified: false, reason: 'wrong_product' }), { ok: false, reason: 'wrong_product' }],
    [reply({ verified: false, reason: 'made-up' }), { ok: false, reason: 'invalid' }],
    [reply({ verified: true, token: 't', product: 'some-other-product', instanceId: INSTANCE }), { ok: false, reason: 'invalid' }],
    [reply({ verified: true, product: PASS_ID }), { ok: false, reason: 'invalid' }],       // no token
    [reply({ verified: 'true', token: 't', product: PASS_ID }), { ok: false, reason: 'invalid' }],
    [reply({ verified: false, reason: 'unavailable' }, 503), { ok: false, reason: 'unavailable' }],
    [async () => { throw new Error('offline'); }, { ok: false, reason: 'offline' }],
    [async () => new Response('<html>', { status: 502 }), { ok: false, reason: 'offline' }],
  ];
  for (const [fetchImpl, expected] of cases) {
    const { api, store } = loadClient({ config: liveConfig, fetchImpl });
    assert.deepEqual(plain(await api.redeemKey(KEY)), expected);
    assert.equal(api.isPremium(), false); assert.equal(store['crease.entitlement.v1'], undefined);
  }
  assert.deepEqual(plain(await loadClient({ config: liveConfig, fetchImpl: reply({}) }).api.redeemKey('nope')), { ok: false, reason: 'format' });
  assert.deepEqual(plain(await loadClient({ config: {}, fetchImpl: reply({}) }).api.redeemKey(KEY)), { ok: false, reason: 'offline' }, 'no Worker URL configured');
});

test('client: a key in the redirect link (#pass= or ?pass=) is read once and removed from the address bar', () => {
  const { api } = loadClient({ config: liveConfig });
  const run = (search, hash) => { const calls = []; const key = api.takeKeyFromUrl({ search, hash, pathname: '/index.html' }, { replaceState: (...a) => calls.push(a) }); return { key, calls }; };
  assert.deepEqual(run('', '#pass=' + KEY), { key: KEY, calls: [[null, '', '/index.html']] });
  assert.deepEqual(run('?pass=' + KEY, ''), { key: KEY, calls: [[null, '', '/index.html']] });
  assert.deepEqual(run('?src=instagram&pass=' + KEY, '#x=1&pass=' + KEY), { key: KEY, calls: [[null, '', '/index.html?src=instagram#x=1']] });
  assert.deepEqual(run('?src=instagram', ''), { key: '', calls: [] }, 'untouched without a pass parameter');
  assert.equal(run('', '#pass=bad key!').key, '');
  assert.equal(api.takeKeyFromUrl(null, null), '', 'never throws');
});

test('client: old entitlement records without a token still work, and are never Founder', () => {
  const store = { 'crease.entitlement.v1': JSON.stringify({ product: PASS_ID, verifiedAt: 1000 }) };
  const { api } = loadClient({ store, config: {} });
  assert.equal(api.isPremium(), true); assert.equal(api.isFounder(), false);
  assert.equal(loadClient({ store: { 'crease.entitlement.v1': JSON.stringify({ product: 'other' }) } }).api.isPremium(), false);
});

// ---------------------------------------------------------------- shipped config, copy and pages
function wranglerVars() {
  const json = read('backend/license/wrangler.jsonc').replace(/^\s*\/\/.*$/gm, '');
  return JSON.parse(json).vars;
}
function clientConfig() {
  const window = {}; vm.runInNewContext(read('assets/commerce-config.js'), { window });
  return window.CREASE_COMMERCE;
}

test('config: the shipped client config is the live Stripe setup (Lemon Squeezy ids empty) and matches the Worker vars', () => {
  const c = clientConfig();
  assert.deepEqual(Object.keys(c).sort(), ['CHECKOUT_URL', 'PRICE_LABEL', 'PRODUCT_ID', 'SALES_START', 'STORE_ID', 'VARIANT_ID', 'WORKER_URL']);
  for (const k of ['STORE_ID', 'PRODUCT_ID', 'VARIANT_ID']) assert.equal(c[k], '', k + ' stays empty: Lemon Squeezy is not in use');
  assert.equal(c.CHECKOUT_URL, 'https://buy.stripe.com/6oU4gycj9ag0fJC2Ys5AQ02');
  assert.equal(c.WORKER_URL, 'https://crease-license.prodbykctw.workers.dev');
  assert.match(c.SALES_START, /^2026-11-\d\dT\d\d:\d\d:00Z$/);
  assert.ok(Number.isFinite(Date.parse(c.SALES_START)));
  assert.equal(c.PRICE_LABEL, '$2.99 + tax', 'prices are tax-exclusive, so the label says tax is added');
  const v = wranglerVars();
  for (const k of ['STORE_ID', 'PRODUCT_ID', 'VARIANT_ID', 'SALES_START']) assert.equal(v[k], c[k], k + ' must be the same in commerce-config.js and backend/license/wrangler.jsonc');
  assert.equal(JSON.parse(read('backend/license/wrangler.jsonc').replace(/^\s*\/\/.*$/gm, '')).name, 'crease-license');
  assert.ok(Object.isFrozen(c));
});

test('page: with the shipped config the Premium Garage says COMING SOON and links nowhere', () => {
  const html = read('index.html');
  assert.match(html, /<button id="premiumSoon" class="btn p1" type="button" disabled>COMING SOON<\/button>/);
  const buy = /<a id="premiumCheckout"[^>]*>/.exec(html)[0];
  assert.ok(!/href=/.test(buy), 'the buy link has no href in the markup');
  assert.match(buy, /class="btn p1 hidden"/); assert.match(buy, /rel="noopener noreferrer"/);
  assert.match(html, /<script src="assets\/commerce-config\.js\?v=[0-9a-f]+"><\/script>\s*<script src="assets\/monetization\.js/, 'config loads before monetization.js');
  for (const ev of ['premium_open', 'checkout_start', 'key_submit', 'key_verified']) assert.ok(html.includes(`track('${ev}')`), ev + ' is tracked');
});

test('page: the CSP allows the license Worker origin and nothing new (no lemon.js, no frames)', () => {
  const html = read('index.html');
  const csp = /name="crease-csp" content="([^"]*)"/.exec(html)[1];
  assert.ok(/connect-src 'self' https:\/\/crease-metrics\.prodbykctw\.workers\.dev https:\/\/crease-license\.prodbykctw\.workers\.dev;/.test(csp));
  assert.ok(!/lemonsqueezy/i.test(csp), 'the checkout is a plain link; no Lemon Squeezy origin in the CSP');
  assert.ok(!/frame-src|script-src[^;]*https:/.test(csp));
});

test('metrics Worker: accepts the four funnel events, with no properties kept', async () => {
  for (const name of ['premium_open', 'checkout_start', 'key_submit', 'key_verified']) {
    const writes = [];
    const DB = { prepare: sql => /daily_counts/.test(sql)
      ? { bind: () => ({ run: async () => ({ meta: { changes: 1 } }) }) }
      : { bind: (...a) => ({ run: async () => { writes.push(a); return { meta: { changes: 1 } }; } }) } };
    const res = await metrics.fetch(new Request('https://m.example/events', { method: 'POST', headers: { Origin: 'https://playcrease.app', 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '12345678-1234-1234-1234-123456789abc', name, props: { license_key: KEY, email: 'a@b.c' } }) }), { ALLOWED_ORIGINS: 'https://playcrease.app', DB });
    assert.equal(res.status, 204, name);
    assert.equal(writes[0][1], name); assert.equal(writes[0][2], '{}', 'any property sent with the event is discarded');
  }
});

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.wrangler', 'vendor', 'media', 'arenas', 'qa'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.(html|js|mjs|json|jsonc|md|txt|xml|webmanifest|yml|svg|css)$/i.test(e.name)) out.push(p);
  }
  return out;
}

test('repo: no copy of the old Nov 1 founder date and no Instagram checkout link is left', () => {
  const old = ['Nov 1, 2026', 'November 1, 2026', 'before Nov 1', 'Nov. 1, 2026', '2026-11-01', 'FOUNDER_UNTIL'].map(s => s.toLowerCase());
  const files = walk(fileURLToPath(ROOT));
  assert.ok(files.length > 20);
  const hits = [];
  for (const f of files) {
    if (f.endsWith('checkout.test.mjs')) continue;   // this file names the strings it hunts for
    // The terms/privacy 'Effective November 1, 2026' date is the policy date, not the old founder promise.
    const text = fs.readFileSync(f, 'utf8').toLowerCase().replaceAll('effective november 1, 2026', '');
    for (const s of old) if (text.includes(s)) hits.push(path.basename(f) + ': ' + s);
  }
  assert.deepEqual(hits, []);
  const mon = read('assets/monetization.js'), cfg = read('assets/commerce-config.js');
  assert.ok(!/instagram/i.test(mon) && !/instagram/i.test(cfg), 'the pass layer has no Instagram link');
  const html = read('index.html');
  const dialog = /<dialog id="premium"[\s\S]*?<\/dialog>/.exec(html)[0];
  assert.ok(!/instagram/i.test(dialog));
  assert.ok(!/instagram\.com[^"']*/.test(/function renderPremium\(\)\{[\s\S]*?\n\}/.exec(html)[0]));
});

test('repo: every player-facing mention of Founder\'s Gold says it is free, by code, first 100, never sold', () => {
  const sentence = 'Only 100 will ever exist. Free to the first 100 players who DM @playcrease to claim one. Never sold.';
  assert.ok(read('assets/monetization.js').includes(sentence));
  assert.ok(read('terms/index.html').includes(sentence));
  assert.ok(read('llms-full.txt').includes(sentence));
  assert.ok(read('docs/CHECKOUT.md').includes(sentence));
  const terms = read('terms/index.html');
  assert.match(terms, /Founder\u2019s Gold is free and is not part of the Premium Pass; buying the Pass does not give it to you\. It goes to the first 100 players who claim it by direct message to @playcrease on Instagram, X or TikTok, one per player, each with a one-time code\. It is not sold and has no cash value\./);
  // the old launch-window promise is gone everywhere a player (or a crawler) can read it
  const hits = [];
  for (const f of walk(fileURLToPath(ROOT))) {
    if (/tests[\\/]/.test(f) || /\.(png|webp|jpg|jpeg|mp3|ogg|wav|svg|woff2?)$/i.test(f)) continue;
    if (/launch-window exclusive|first 30 days on sale|30-day window/i.test(fs.readFileSync(f, 'utf8'))) hits.push(path.basename(f));
  }
  assert.deepEqual(hits, []);
});

test('copy: terms and privacy name Stripe as merchant of record and processor, with a refund line', () => {
  const terms = read('terms/index.html'), privacy = read('privacy/index.html');
  assert.match(terms, /Stripe<\/a> is the merchant of record and the payment processor/);
  assert.match(terms, /<strong>Refunds\.<\/strong> You can ask for a refund within 14 days of buying: email .*prodbykctw@gmail\.com/);
  assert.match(terms, /Stripe, as merchant of record, handles refunds/);
  assert.match(terms, /sold by Melvin D\. Brown III \(KCTW\)/);
  assert.match(terms, /up to 5 devices/);
  assert.match(privacy, /Stripe<\/a> is the merchant of record and payment processor/);
  assert.match(privacy, /checks them against Stripe and does not store or log them/);
  assert.match(privacy, /Effective November 6, 2026/); assert.match(terms, /Effective November 6, 2026/);
  for (const page of [terms, privacy]) assert.ok(!/lemon squeezy/i.test(page), 'no page names Lemon Squeezy as a seller');
  for (const page of [terms, privacy]) assert.ok(!/instagram direct messages/i.test(page), 'the old Instagram-DM sales wording is gone');
});

// ---------------------------------------------------------------- online safety
test('online: nothing but paddle moves is sent to the relay, and no skin or Design Studio picture can reach an opponent', () => {
  const page = read('online.html'), relay = read('backend/online/worker.mjs');
  const sends = [...page.matchAll(/\.send\(([^;]*)\);/g)].map(m => m[1]);
  assert.ok(sends.length >= 1);
  for (const s of sends) assert.match(s, /JSON\.stringify\(\{type:'move',x,y\}\)/);
  for (const forbidden of [/monetization/i, /CreaseProduct/, /crease\.studio/, /toDataURL/, /skin/i, /entitlement/i, /token/i]) {
    assert.ok(!forbidden.test(page), 'online.html must not touch ' + forbidden);
    assert.ok(!forbidden.test(relay.replace(/\/\/.*$/gm, '')), 'the relay must not handle ' + forbidden);
  }
  // the relay only ever reads `move` messages from a client and sends state, 'joined' and 'ready'
  assert.ok(relay.includes("m.type==='move'"));
  assert.deepEqual([...new Set([...relay.matchAll(/type:'([a-z]+)'/g)].map(m => m[1]))].sort(), ['joined', 'ready', 'state']);
});
