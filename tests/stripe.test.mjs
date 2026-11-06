// Stripe Premium Pass: the /stripe/redeem and /stripe/restore routes of the license Worker (Stripe mocked),
// the 5-device limit, and the browser side (?cs= return link, restore by email + receipt number / last 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { verifyToken } from '../backend/license/token.mjs';
import license, { PASS_ID } from '../backend/license/worker.mjs';
import { DEVICE_LIMIT, claimDevice } from '../backend/license/stripe.mjs';

const ROOT = new URL('../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, ROOT), 'utf8');
const SECRET = 'unit-test-signing-secret-0123456789';
const ORIGIN = 'https://playcrease.app';
const SID = 'cs_test_a1B2c3D4e5F6g7H8i9J0kLmNoPqRsTuVwXyZ';
const PRICE = 'price_1UX8NNPI1ShVAXTPm5y7wURF';
const DEV = 'a'.repeat(32), DEV2 = 'b'.repeat(32);
const SALES_START = '2026-12-01T15:00:00Z';
const BOUGHT = Date.parse('2026-12-05T10:00:00Z') / 1000;

// A stand-in for D1 that keeps the two statements stripe.mjs runs (the real SQL is checked against SQLite below).
function fakeDB() {
  const rows = [];
  return { rows, prepare: sql => ({ bind: (...a) => ({
    async run() {
      assert.match(sql, /^INSERT OR IGNORE INTO devices/);
      const [sale, device, at, limit] = a;
      if (!rows.some(r => r.sale === sale && r.device === device) && rows.filter(r => r.sale === sale).length < limit) rows.push({ sale, device, at });
      return {};
    },
    async first() { assert.match(sql, /^SELECT 1/); return rows.some(r => r.sale === a[0] && r.device === a[1]) ? { ok: 1 } : null; },
  }) }) };
}
const env = (extra = {}) => ({ ALLOWED_ORIGINS: ORIGIN, SALES_START, SIGNING_SECRET: SECRET, STRIPE_KEY: 'sk_test_unit_only', STRIPE_PRICE_ID: PRICE, DB: fakeDB(), ...extra });
const charge = (x = {}) => ({ id: 'ch_1', object: 'charge', paid: true, status: 'succeeded', refunded: false, amount_refunded: 0, disputed: false, receipt_number: '1817-3092', payment_method_details: { card: { last4: '4242' } }, ...x });
const session = (x = {}, c = {}) => ({ id: SID, object: 'checkout.session', livemode: false, mode: 'payment', status: 'complete', payment_status: 'paid', created: BOUGHT,
  customer_details: { email: 'Buyer@Example.com' }, line_items: { object: 'list', data: [{ price: { id: PRICE } }] }, payment_intent: { id: 'pi_1', latest_charge: charge(c) }, ...x });

// Replaces fetch for one test. `retrieve` answers GET /checkout/sessions/{id}; `list` answers the email search.
async function withStripe({ retrieve = { json: session() }, list = { json: { object: 'list', data: [] } } } = {}, run) {
  const calls = [], realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    calls.push({ url: u, init });
    assert.equal(u.origin, 'https://api.stripe.com', 'only Stripe is called');
    assert.equal(init.method ?? 'GET', 'GET', 'nothing is ever written to Stripe');
    const r = u.pathname === '/v1/checkout/sessions' ? (typeof list === 'function' ? list(u) : list) : (typeof retrieve === 'function' ? retrieve(u) : retrieve);
    if (r instanceof Error) throw r;
    return new Response(r.text ?? JSON.stringify(r.json), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } });
  };
  const logged = [], realConsole = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  for (const k of Object.keys(realConsole)) console[k] = (...a) => logged.push(a.join(' '));
  try { return await run(calls, logged); } finally { globalThis.fetch = realFetch; Object.assign(console, realConsole); }
}
const call = (route, body, e = env(), { origin = ORIGIN } = {}) => license.fetch(new Request('https://license.example' + route, {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), e);
const redeem = (body = { session_id: SID, device_id: DEV }, e) => call('/stripe/redeem', body, e);
const restore = (body, e) => call('/stripe/restore', { device_id: DEV, ...body }, e);

test('stripe redeem: a paid CREASE Premium session unlocks with a signed token that is never a Founder pass', async () => {
  await withStripe({}, async (calls, logged) => {
    const e = env();
    const res = await redeem(undefined, e);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.verified, true); assert.equal(body.product, PASS_ID); assert.equal(body.founder, false); assert.equal(body.instanceId, DEV);
    const p = await verifyToken(body.token, SECRET);
    assert.equal(p.p, PASS_ID); assert.equal(p.i, DEV); assert.equal(p.f, false); assert.equal(p.c, '2026-12-05T10:00:00.000Z');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url.pathname, '/v1/checkout/sessions/' + SID);
    assert.deepEqual(calls[0].url.searchParams.getAll('expand[]'), ['line_items', 'payment_intent.latest_charge']);
    assert.equal(calls[0].init.headers.Authorization, 'Bearer sk_test_unit_only');
    assert.equal(calls[0].init.headers['Stripe-Version'], '2025-03-31.basil');
    assert.equal(e.DB.rows.length, 1);
    assert.match(e.DB.rows[0].sale, /^[a-f0-9]{64}$/); assert.equal(e.DB.rows[0].device, DEV);
    assert.ok(!JSON.stringify(e.DB.rows).includes(SID), 'the session id itself is never stored');
    assert.deepEqual(logged, [], 'nothing is logged');
    assert.ok(!JSON.stringify(body).includes(SID) && !JSON.stringify(body).includes('xample'), 'no session id or email in the reply');
  });
  // bought long after go-live: still not a Founder pass
  await withStripe({ retrieve: { json: session({ created: Date.parse('2027-01-01T00:00:00Z') / 1000 }) } }, async () => {
    assert.equal((await (await redeem()).json()).founder, false);
  });
  // SALES_START no longer matters: a Pass is never a Founder pass
  await withStripe({}, async () => assert.equal((await (await redeem(undefined, env({ SALES_START: '' }))).json()).founder, false));
});

test('stripe redeem: unpaid, refunded, disputed, other product and wrong mode never unlock', async () => {
  const cases = [
    [session({ status: 'open', payment_status: 'unpaid' }), 'unpaid'],
    [session({ payment_status: 'no_payment_required' }), 'unpaid'],
    [session({ mode: 'subscription' }), 'unpaid'],
    [session({}, { paid: false, status: 'failed' }), 'unpaid'],
    [session({ payment_intent: null }), 'unpaid'],
    [session({}, { refunded: true, amount_refunded: 299 }), 'revoked'],
    [session({}, { amount_refunded: 100 }), 'revoked'],
    [session({}, { disputed: true }), 'revoked'],
    [session({ line_items: { data: [{ price: { id: 'price_somethingelse' } }] } }), 'wrong_product'],
    [session({ line_items: undefined }), 'wrong_product'],
    [session({ livemode: true }), 'invalid'],
    [session({ object: 'payment_intent' }), 'invalid'],
    [session({ created: 'yesterday' }), 'invalid'],
  ];
  for (const [s, reason] of cases) {
    await withStripe({ retrieve: { json: s } }, async () => {
      const e = env(), body = await (await redeem(undefined, e)).json();
      assert.deepEqual(body, { verified: false, reason }, JSON.stringify(s).slice(0, 80));
      assert.equal(e.DB.rows.length, 0, 'no device is counted for a refused sale');
    });
  }
  // a live key never accepts a test-mode (sandbox) purchase, and the other way round
  await withStripe({}, async () => assert.equal((await (await redeem(undefined, env({ STRIPE_KEY: 'rk_live_unit' }))).json()).reason, 'invalid'));
  await withStripe({ retrieve: { json: session({ livemode: true }) } }, async () => assert.equal((await (await redeem(undefined, env({ STRIPE_KEY: 'rk_live_unit' }))).json()).verified, true));
});

test('stripe redeem: unknown session is "invalid", Stripe trouble is 503, malformed input never reaches Stripe', async () => {
  await withStripe({ retrieve: { status: 404, json: { error: { type: 'invalid_request_error' } } } }, async () => assert.deepEqual(await (await redeem()).json(), { verified: false, reason: 'invalid' }));
  for (const retrieve of [{ status: 500, json: {} }, { status: 401, json: {} }, { text: 'not json' }, new Error('network down')]) {
    await withStripe({ retrieve }, async () => { const r = await redeem(); assert.equal(r.status, 503); assert.equal((await r.json()).reason, 'unavailable'); });
  }
  await withStripe({}, async calls => {
    for (const body of [{}, { session_id: SID }, { session_id: SID, device_id: 'short' }, { session_id: 'cs_test_../../charges', device_id: DEV }, { session_id: 'pi_123456789012', device_id: DEV }, { session_id: SID + '?expand[]=x', device_id: DEV }, { session_id: 42, device_id: DEV }])
      assert.deepEqual(await (await redeem(body)).json(), { verified: false, reason: 'invalid' }, JSON.stringify(body));
    assert.equal(calls.length, 0);
  });
});

test('stripe: fails closed without the key, the price id, the signing secret or the database', async () => {
  for (const missing of ['STRIPE_KEY', 'STRIPE_PRICE_ID', 'SIGNING_SECRET', 'DB']) {
    await withStripe({}, async calls => {
      const r = await redeem(undefined, env({ [missing]: '' }));
      assert.equal(r.status, 503, missing); assert.equal((await r.json()).reason, 'unavailable');
      assert.equal((await restore({ email: 'buyer@example.com', proof: '4242' }, env({ [missing]: '' }))).status, 503);
      assert.equal(calls.length, 0);
    });
  }
});

test('stripe: one sale unlocks at most 5 devices; a device already on it always gets back in', async () => {
  await withStripe({}, async () => {
    const e = env(), devs = Array.from({ length: DEVICE_LIMIT + 1 }, (_, i) => String(i).repeat(32).slice(0, 32).replace(/\d/g, d => 'abcdef0123'[d]));
    for (const d of devs.slice(0, DEVICE_LIMIT)) assert.equal((await (await redeem({ session_id: SID, device_id: d }, e)).json()).verified, true);
    assert.deepEqual(await (await redeem({ session_id: SID, device_id: devs[DEVICE_LIMIT] }, e)).json(), { verified: false, reason: 'limit' });
    assert.equal((await (await redeem({ session_id: SID, device_id: devs[0] }, e)).json()).verified, true, 'same device again');
    assert.equal(e.DB.rows.length, DEVICE_LIMIT);
  });
});

test('stripe: the device-limit SQL works on SQLite (D1) and is atomic per statement', async t => {
  let sqlite;
  try { sqlite = await import('node:sqlite'); } catch (_) { t.skip('node:sqlite not available on this Node'); return; }
  const raw = new sqlite.DatabaseSync(':memory:');
  raw.exec(read('backend/license/schema.sql'));
  const db = { prepare: sql => { const st = raw.prepare(sql); return { bind: (...a) => ({ run: async () => st.run(...a), first: async () => st.get(...a) ?? null }) }; } };
  const devs = 'abcdef'.split('').map(c => c.repeat(32));
  const got = [];
  for (const d of devs) got.push(await claimDevice(db, SID, d));
  assert.deepEqual(got, [true, true, true, true, true, false]);
  assert.equal(await claimDevice(db, SID, devs[0]), true, 'already registered');
  assert.equal(await claimDevice(db, 'cs_test_another_sale_123', devs[5]), true, 'a different sale has its own 5');
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM devices').get().n, 6);
});

test('stripe restore: checkout email plus receipt number or card last 4 finds the sale; anything else is "not_found"', async () => {
  const list = u => ({ json: { object: 'list', data: u.searchParams.get('customer_details[email]') === 'Buyer@Example.com' ? [session({ line_items: undefined })] : [] } });
  for (const proof of ['1817-3092', '18173092', ' 1817 3092 ', '4242']) {
    await withStripe({ list }, async (calls, logged) => {
      const e = env(), body = await (await restore({ email: ' Buyer@Example.com ', proof }, e)).json();
      assert.equal(body.verified, true, proof); assert.equal(body.instanceId, DEV);
      assert.equal(calls[0].url.searchParams.get('status'), 'complete');
      assert.deepEqual(calls[0].url.searchParams.getAll('expand[]'), ['data.payment_intent.latest_charge']);
      assert.equal(calls[1].url.pathname, '/v1/checkout/sessions/' + SID, 'the match is re-read in full before unlocking');
      assert.ok(!JSON.stringify(e.DB.rows).toLowerCase().includes('example'), 'no email stored');
      assert.deepEqual(logged, []);
    });
  }
  // typed in another case than at checkout: the lower-case form is tried next
  await withStripe({ list: u => ({ json: { data: u.searchParams.get('customer_details[email]') === 'buyer@example.com' ? [session({ customer_details: { email: 'buyer@example.com' } })] : [] } }) },
    async calls => { assert.equal((await (await restore({ email: 'BUYER@example.com', proof: '4242' })).json()).verified, true); assert.equal(calls.length, 3); });
  for (const proof of ['1111', '9999-0000', '4242-0000']) {
    await withStripe({ list }, async () => assert.deepEqual(await (await restore({ email: 'Buyer@Example.com', proof })).json(), { verified: false, reason: 'not_found' }, proof));
  }
  await withStripe({ list }, async () => assert.deepEqual(await (await restore({ email: 'nobody@example.com', proof: '4242' })).json(), { verified: false, reason: 'not_found' }));
  // a refunded sale found by restore is still refused
  await withStripe({ list, retrieve: { json: session({}, { refunded: true }) } }, async () => assert.equal((await (await restore({ email: 'Buyer@Example.com', proof: '4242' })).json()).reason, 'revoked'));
  await withStripe({ list: { status: 500, json: {} } }, async () => assert.equal((await restore({ email: 'Buyer@Example.com', proof: '4242' })).status, 503));
  await withStripe({}, async calls => {
    for (const b of [{ email: 'not-an-email', proof: '4242' }, { email: 'a@b.co', proof: '12' }, { email: 'a@b.co', proof: '<script>' }, { email: 'a@b.co', proof: '4242', device_id: 'x' }, { email: 'a@b.co&status=open@x.io', proof: '4242' }])
      assert.deepEqual(await (await restore(b)).json(), { verified: false, reason: 'invalid' }, JSON.stringify(b));
    assert.equal(calls.length, 0);
  });
});

test('stripe routes share the origin check, method rule and rate limits with /license/activate', async () => {
  await withStripe({}, async calls => {
    assert.equal((await call('/stripe/redeem', { session_id: SID, device_id: DEV }, env(), { origin: 'https://evil.example' })).status, 403);
    assert.equal((await license.fetch(new Request('https://license.example/stripe/redeem', { method: 'GET', headers: { Origin: ORIGIN } }), env())).status, 405);
    const limited = { async limit() { return { success: false }; } };
    assert.equal((await redeem(undefined, env({ PER_IP: limited }))).status, 429);
    assert.equal((await restore({ email: 'a@b.co', proof: '4242' }, env({ ALL_TRAFFIC: limited }))).status, 429);
    const pre = await license.fetch(new Request('https://license.example/stripe/restore', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), env());
    assert.equal(pre.status, 204);
    assert.equal(calls.length, 0);
  });
});

test('config: the Worker has the D1 binding and the live Stripe price; secrets stay out of the repo', () => {
  const w = read('backend/license/wrangler.jsonc');
  assert.match(w, /"STRIPE_PRICE_ID": "price_1UYfWOAKvkJ3OCtSYfn5mERx"/);
  assert.match(w, /"binding": "DB", "database_name": "crease-license"/);
  assert.match(read('backend/license/schema.sql'), /PRIMARY KEY \(sale, device\)/);
  assert.match(read('.gitignore'), /\.dev\.vars/);
  for (const p of ['backend/license/wrangler.jsonc', 'backend/license/stripe.mjs', 'assets/commerce-config.js', 'index.html', 'docs/CHECKOUT.md'])
    assert.doesNotMatch(read(p), /\b(sk|rk)_(test|live)_[A-Za-z0-9]{12,}/, p + ' holds no Stripe secret key');
});

// ---------------------------------------------------------------- browser side (assets/monetization.js)
function loadClient({ store = {}, config, fetchImpl } = {}) {
  const window = { CREASE_COMMERCE: config, fetch: fetchImpl, crypto: globalThis.crypto };
  const context = { window, atob, btoa, URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
    localStorage: { getItem: k => Object.hasOwn(store, k) ? store[k] : null, setItem: (k, v) => { store[k] = String(v); } } };
  vm.runInNewContext(read('assets/monetization.js'), context);
  return { api: window.CreaseProduct, store };
}
const stripeConfig = { CHECKOUT_URL: 'https://buy.stripe.com/test_8x29AVfiP1pk1BgfSicQU00', WORKER_URL: 'https://crease-license.prodbykctw.workers.dev', PRICE_LABEL: '$2.99', SALES_START };
const plain = o => JSON.parse(JSON.stringify(o));

test('client: a Stripe Payment Link counts as a checkout and switches restore to Stripe; look-alikes do not', () => {
  assert.equal(loadClient({ config: stripeConfig }).api.provider(), 'stripe');
  assert.equal(loadClient({ config: stripeConfig }).api.checkoutReady(), true);
  assert.equal(loadClient({ config: { CHECKOUT_URL: 'https://crease.lemonsqueezy.com/checkout/buy/abc' } }).api.provider(), 'lemonsqueezy');
  assert.equal(loadClient({ config: { CHECKOUT_URL: '' } }).api.provider(), '');
  for (const url of ['http://buy.stripe.com/x', 'https://buy.stripe.com.evil.example/x', 'https://evilbuy.stripe.com/x', 'https://checkout.stripe.com/c/pay/cs_test_x'])
    assert.equal(loadClient({ config: { CHECKOUT_URL: url } }).api.checkoutReady(), false, url);
});

test('client: the ?cs= return link is read once, removed from the address bar, and redeemed with this device id', async () => {
  const sent = [];
  const fetchImpl = async (url, init) => { sent.push({ url, init, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ verified: true, token: 'tok.en', product: PASS_ID, founder: true, instanceId: DEV })); };
  const { api, store } = loadClient({ config: stripeConfig, fetchImpl });
  const replaced = [];
  const hist = { replaceState: (_s, _t, u) => replaced.push(u) };
  assert.equal(api.takeSessionFromUrl({ pathname: '/', search: '?cs=' + SID + '&utm=x', hash: '' }, hist), SID);
  assert.deepEqual(replaced, ['/?utm=x']);
  assert.equal(api.takeSessionFromUrl({ pathname: '/', search: '?cs=pi_nope', hash: '' }, hist), '', 'only a Checkout Session id is taken');
  assert.equal(replaced.length, 2, 'a bad value is still removed from the address bar');
  assert.equal(api.takeSessionFromUrl({ pathname: '/', search: '', hash: '' }, hist), '');
  assert.deepEqual(plain(await api.redeemSession(SID)), { ok: true });
  assert.equal(sent[0].url, 'https://crease-license.prodbykctw.workers.dev/stripe/redeem');
  assert.match(sent[0].body.device_id, /^[a-f0-9]{32}$/);
  assert.deepEqual(Object.keys(sent[0].body).sort(), ['device_id', 'session_id']);
  assert.equal(sent[0].init.credentials, 'omit');
  assert.equal(store['crease.device.v1'], sent[0].body.device_id, 'the device id is kept for next time');
  assert.equal(api.isPremium(), true); assert.equal(api.isFounder(), false, 'a Pass is not Founder’s Gold');
  // same browser later: same device id, so it never uses up another of the 5
  await loadClient({ store, config: stripeConfig, fetchImpl }).api.restorePurchase('buyer@example.com', '4242');
  assert.equal(sent[1].url, 'https://crease-license.prodbykctw.workers.dev/stripe/restore');
  assert.deepEqual(sent[1].body, { email: 'buyer@example.com', proof: '4242', device_id: sent[0].body.device_id });
});

test('client: Stripe refusals and bad input never unlock anything', async () => {
  for (const reason of ['not_found', 'unpaid', 'revoked', 'limit', 'invalid', 'unavailable']) {
    const { api, store } = loadClient({ config: stripeConfig, fetchImpl: async () => new Response(JSON.stringify({ verified: false, reason })) });
    assert.deepEqual(plain(await api.redeemSession(SID)), { ok: false, reason }); assert.equal(api.isPremium(), false);
    assert.equal(store['crease.entitlement.v1'], undefined);
  }
  let asked = 0;
  const { api } = loadClient({ config: stripeConfig, fetchImpl: async () => { asked++; return new Response('{}'); } });
  assert.deepEqual(plain(await api.redeemSession('pi_123')), { ok: false, reason: 'format' });
  assert.deepEqual(plain(await api.restorePurchase('nope', '4242')), { ok: false, reason: 'format' });
  assert.deepEqual(plain(await api.restorePurchase('a@b.co', '1')), { ok: false, reason: 'format' });
  assert.equal(asked, 0);
  assert.deepEqual(plain(await api.redeemSession(SID)), { ok: false, reason: 'invalid' }, 'an empty reply is a refusal');
  assert.equal(api.isPremium(), false);
});

test('page: the Premium Garage has a Stripe restore form and handles the ?cs= return link', () => {
  const html = read('index.html');
  for (const id of ['premiumRestoreStripe', 'premiumEmail', 'premiumProof', 'premiumRestoreBtn', 'premiumRestoreStatus']) assert.ok(html.includes('id="' + id + '"'), id);
  assert.match(html, /CreaseProduct\.takeSessionFromUrl\(\)/);
  assert.match(html, /CreaseProduct\.redeemSession\(session\)/);
});
