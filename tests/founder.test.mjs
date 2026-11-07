// Founder's Gold by code: free to the first 100 players who DM @playcrease. The license Worker's /founder/redeem
// and /founder/left (real SQL on node:sqlite, the same engine family as D1), the browser side in
// assets/monetization.js, and the Garage markup/copy in index.html.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { verifyToken } from '../backend/license/token.mjs';
import license, { PASS_ID } from '../backend/license/worker.mjs';
import { FOUNDER_ID, PUBLIC_CODES, normalizeCode, hashCode, redeemFounder, foundersLeft } from '../backend/license/founder-codes.mjs';

const ROOT = new URL('../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, ROOT), 'utf8');
const SECRET = 'unit-test-signing-secret-0123456789';
const ORIGIN = 'https://playcrease.app';
const DEV = 'a'.repeat(32), DEV2 = 'b'.repeat(32);
const COPY = {
  text: 'Only 100 will ever exist. Free to the first 100 players who DM @playcrease to claim one. Never sold.',
  label: 'Have a Founder code?',
  success: 'Founder’s Gold is yours. Welcome to the first 100.',
  invalid: 'That code isn’t valid.', used: 'That code has already been claimed.', offline: 'Couldn’t reach the server. Try again.',
  soldOut: 'All 100 have been claimed.',
};

let sqlite = null;
try { sqlite = await import('node:sqlite'); } catch (_) { /* tests below skip */ }

// A D1 stand-in over an in-memory SQLite database that holds 100 public codes plus the owner's.
async function seeded() {
  const raw = new sqlite.DatabaseSync(':memory:');
  raw.exec(read('backend/license/schema.sql'));
  const bound = (st, a) => ({ run: async () => st.run(...a), first: async () => st.get(...a) ?? null });
  const db = { raw, prepare: sql => { const st = raw.prepare(sql); return { bind: (...a) => bound(st, a), ...bound(st, []) }; } };   // like D1: bind(...) first, or run/first directly
  const codes = [];
  for (let i = 1; i <= 100; i++) {
    const code = 'GOLD' + String(i).padStart(4, '0') + 'ABCD';
    codes.push(code);
    raw.prepare('INSERT INTO founder_codes (code_hash, label) VALUES (?1, ?2)').run(await hashCode(code), 'public-' + String(i).padStart(3, '0'));
  }
  const owner = 'GOLDOWNER000XYZ';
  raw.prepare('INSERT INTO founder_codes (code_hash, label) VALUES (?1, ?2)').run(await hashCode(owner), 'owner-000');
  return { db, raw, codes, owner, env: { ALLOWED_ORIGINS: ORIGIN, SIGNING_SECRET: SECRET, DB: db } };
}
const sk = { skip: !sqlite && 'node:sqlite not available on this Node' };

test('founder codes: normalization uppercases and drops spaces and dashes, then hashes', async () => {
  assert.equal(normalizeCode(' gold-ab12 cd34 '), 'GOLDAB12CD34');
  assert.equal(normalizeCode('GOLD-AB12-CD34'), 'GOLDAB12CD34');
  assert.equal(normalizeCode(null), ''); assert.equal(normalizeCode(undefined), '');
  const h = await hashCode('GOLDAB12CD34');
  assert.match(h, /^[a-f0-9]{64}$/);
  assert.equal(h, await hashCode(normalizeCode('gold ab12-cd34')));
  assert.notEqual(h, await hashCode('GOLDAB12CD35'));
  assert.ok(!h.includes('GOLD'), 'the hash is not the code');
});

test('founder redeem: unknown and malformed codes are "invalid", and nothing is claimed', sk, async () => {
  const { env, raw } = await seeded();
  for (const code of ['GOLDNOSUCHCODE', 'x', '', 'GOLD 0001 ABC!', 'A'.repeat(40), 42, null, undefined, {}]) {
    const r = await redeemFounder({ code, device: DEV }, env);
    assert.deepEqual(r, { status: 200, body: { ok: false, reason: 'invalid' } }, String(code));
  }
  for (const device of ['', 'short', 'Z'.repeat(32), 'a'.repeat(33), null, 7]) {
    assert.deepEqual((await redeemFounder({ code: 'GOLD0001ABCD', device }, env)).body, { ok: false, reason: 'invalid' }, String(device));
  }
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM founder_codes WHERE device IS NOT NULL').get().n, 0);
});

test('founder redeem: the first claim binds the code to this device and returns a signed Founder token', sk, async () => {
  const { env, raw, codes } = await seeded();
  const before = Date.now();
  const r = await redeemFounder({ code: ' gold-0001-abcd ', device: DEV }, env);   // typed in lower case with a space and dashes
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true); assert.equal(r.body.product, FOUNDER_ID);
  const p = await verifyToken(r.body.token, SECRET);
  assert.equal(p.p, 'founder'); assert.equal(p.f, true); assert.equal(p.i, DEV);
  assert.notEqual(p.p, PASS_ID, 'a Founder token can never be mistaken for a Premium Pass');
  assert.deepEqual(Object.keys(p).sort(), ['c', 'f', 'i', 'iat', 'p', 'v']);
  const row = raw.prepare('SELECT * FROM founder_codes WHERE label = ?1').get('public-001');
  assert.equal(row.device, DEV); assert.ok(row.claimed_at >= before && row.claimed_at <= Date.now());
  assert.equal(p.c, new Date(row.claimed_at).toISOString());
  // only hashes are stored: the plain code appears nowhere in the table
  const dump = JSON.stringify(raw.prepare('SELECT * FROM founder_codes').all());
  assert.ok(!dump.includes(codes[0]) && !dump.includes('GOLD0001'));
  for (const r2 of raw.prepare('SELECT code_hash FROM founder_codes').all()) assert.match(r2.code_hash, /^[a-f0-9]{64}$/);
});

test('founder redeem: the same device asking again gets a fresh token (restore) and the claim time is kept', sk, async () => {
  const { env, raw } = await seeded();
  const first = await redeemFounder({ code: 'GOLD0007ABCD', device: DEV }, env);
  const at = raw.prepare('SELECT claimed_at FROM founder_codes WHERE label = ?1').get('public-007').claimed_at;
  const again = await redeemFounder({ code: 'gold-0007-abcd', device: DEV }, env);
  assert.equal(again.body.ok, true);
  const a = await verifyToken(first.body.token, SECRET), b = await verifyToken(again.body.token, SECRET);
  assert.equal(a.c, b.c); assert.equal(b.i, DEV);
  assert.equal(raw.prepare('SELECT claimed_at FROM founder_codes WHERE label = ?1').get('public-007').claimed_at, at);
});

test('founder redeem: a different device is told the code is "used" and the owner of the code is unchanged', sk, async () => {
  const { env, raw } = await seeded();
  await redeemFounder({ code: 'GOLD0009ABCD', device: DEV }, env);
  const r = await redeemFounder({ code: 'GOLD0009ABCD', device: DEV2 }, env);
  assert.deepEqual(r, { status: 200, body: { ok: false, reason: 'used' } });
  assert.equal(raw.prepare('SELECT device FROM founder_codes WHERE label = ?1').get('public-009').device, DEV);
});

test('founder redeem: two devices racing for one code cannot both win', sk, async () => {
  const { env } = await seeded();
  const results = await Promise.all(['a', 'b', 'c', 'd', 'e'].map(c => redeemFounder({ code: 'GOLD0010ABCD', device: c.repeat(32) }, env)));
  assert.equal(results.filter(r => r.body.ok).length, 1);
  assert.equal(results.filter(r => r.body.reason === 'used').length, 4);
});

test('founder left: counts only the 100 public codes, never the owner’s, and is cached for about 30 seconds', sk, async () => {
  const { env, raw, owner } = await seeded();
  assert.equal(PUBLIC_CODES, 100);
  assert.equal(await foundersLeft(env, 1000), 100);
  await redeemFounder({ code: owner, device: DEV }, env);                   // the owner's code #0 is outside the 100
  assert.equal(raw.prepare('SELECT device FROM founder_codes WHERE label = ?1').get('owner-000').device, DEV);
  assert.equal(await foundersLeft(env, 2000), 100, 'claiming the owner code leaves 100');
  raw.prepare("UPDATE founder_codes SET device = ?1 WHERE label = 'public-050'").run(DEV2);   // change the DB behind the cache
  assert.equal(await foundersLeft(env, 2000 + 29000), 100, 'cached inside 30 s');
  assert.equal(await foundersLeft(env, 2000 + 30001), 99, 'fresh after 30 s');
  await redeemFounder({ code: 'GOLD0001ABCD', device: DEV }, env);          // a claim clears the cache
  assert.equal(await foundersLeft(env, 2000 + 30002), 98);
  raw.prepare("UPDATE founder_codes SET device = ?1 WHERE label LIKE 'public-%'").run(DEV2);
  assert.equal(await foundersLeft(env, 2000 + 70000), 0, 'sold out');
});

const call = (path, { method = 'POST', body, env, origin = ORIGIN, headers = {} } = {}) => license.fetch(new Request('https://license.example' + path, {
  method, headers: { Origin: origin, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }), env);

test('founder routes: CORS like the other endpoints, methods, origin check and rate limits', sk, async () => {
  const { env } = await seeded();
  const left = await call('/founder/left', { method: 'GET', env });
  assert.equal(left.status, 200); assert.deepEqual(await left.json(), { left: 100 });
  assert.equal(left.headers.get('Access-Control-Allow-Origin'), ORIGIN); assert.equal(left.headers.get('Vary'), 'Origin');
  assert.match(left.headers.get('Cache-Control'), /max-age=30/);
  assert.equal((await call('/founder/left', { method: 'GET', env, origin: 'https://evil.example' })).status, 403);
  assert.equal((await call('/founder/left', { method: 'GET', env, origin: null, headers: {} })).status, 403);
  assert.equal((await call('/founder/left', { method: 'POST', body: {}, env })).status, 405);
  const pre = await call('/founder/redeem', { method: 'OPTIONS', env });
  assert.equal(pre.status, 204); assert.equal(pre.headers.get('Access-Control-Allow-Origin'), ORIGIN); assert.equal(pre.headers.get('Access-Control-Allow-Methods'), 'POST');
  assert.equal((await call('/founder/left', { method: 'OPTIONS', env })).headers.get('Access-Control-Allow-Methods'), 'GET');
  assert.equal((await call('/founder/redeem', { method: 'GET', env })).status, 405);
  assert.equal((await call('/founder/redeem', { body: { code: 'GOLD0001ABCD', device: DEV }, env, origin: 'https://evil.example' })).status, 403);
  assert.equal((await license.fetch(new Request('https://license.example/founder/redeem', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'text/plain' }, body: '{}' }), env)).status, 415);
  // rate limits answer 429 before the database is touched
  let touched = 0; const counting = { prepare: () => { touched++; throw new Error('db'); } };
  const limited = { async limit() { return { success: false }; } };
  assert.equal((await call('/founder/redeem', { body: { code: 'GOLD0001ABCD', device: DEV }, env: { ...env, DB: counting, PER_IP: limited } })).status, 429);
  assert.equal((await call('/founder/redeem', { body: { code: 'GOLD0001ABCD', device: DEV }, env: { ...env, DB: counting, ALL_TRAFFIC: limited } })).status, 429);
  assert.equal(touched, 0);
  // the redeem answer over HTTP
  const ok = await call('/founder/redeem', { body: { code: 'gold-0002-abcd', device: DEV }, env });
  assert.equal(ok.status, 200); const body = await ok.json();
  assert.equal(body.ok, true); assert.equal(body.product, 'founder'); assert.equal((await verifyToken(body.token, SECRET)).f, true);
  assert.deepEqual(await (await call('/founder/redeem', { body: { code: 'GOLD0002ABCD', device: DEV2 }, env })).json(), { ok: false, reason: 'used' });
  assert.deepEqual(await (await call('/founder/redeem', { body: { code: 'NOPE', device: DEV }, env })).json(), { ok: false, reason: 'invalid' });
  // unavailable database answers 503, never a false "ok"
  const down = await call('/founder/redeem', { body: { code: 'GOLD0003ABCD', device: DEV }, env: { ...env, DB: counting } });
  assert.equal(down.status, 503);
  assert.equal((await call('/founder/left', { method: 'GET', env: { ...env, DB: counting } })).status, 503);
  assert.equal((await call('/founder/redeem', { body: { code: 'GOLD0003ABCD', device: DEV }, env: { ...env, SIGNING_SECRET: '' } })).status, 503);
});

test('founder SQL: the schema has founder_codes with a hash primary key, and a code is only claimed while device IS NULL', () => {
  const sql = read('backend/license/schema.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS founder_codes \(\s*code_hash\s+TEXT PRIMARY KEY,\s*label\s+TEXT,\s*claimed_at\s+INTEGER,\s*device\s+TEXT\s*\)/);
  const src = read('backend/license/founder-codes.mjs');
  assert.match(src, /UPDATE founder_codes SET claimed_at = \?1, device = \?2 WHERE code_hash = \?3 AND device IS NULL/);
  assert.ok(!/console\./.test(src), 'nothing is logged');
});

// ---------------------------------------------------------------- browser side
function loadClient({ store = {}, config, fetchImpl } = {}) {
  const window = { CREASE_COMMERCE: config, fetch: fetchImpl, crypto: globalThis.crypto };
  const context = { window, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, atob, btoa,
    localStorage: { getItem: k => Object.hasOwn(store, k) ? store[k] : null, setItem: (k, v) => { store[k] = String(v); } } };
  vm.runInNewContext(read('assets/monetization.js'), context);
  return { api: window.CreaseProduct, store };
}
const cfg = { CHECKOUT_URL: 'https://buy.stripe.com/x', WORKER_URL: 'https://crease-license.prodbykctw.workers.dev', PRICE_LABEL: '$2.99 + tax' };
const plain = o => JSON.parse(JSON.stringify(o));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const founderToken = (extra = {}) => b64({ v: 1, p: 'founder', c: '2026-11-07T00:00:00.000Z', i: DEV, f: true, iat: 1, ...extra }) + '.sig';
const jsonReply = (json, status = 200) => async () => new Response(JSON.stringify(json), { status });

test('client: a valid code unlocks Founder’s Gold WITHOUT the Premium Pass, and nothing else', async () => {
  const sent = [];
  const fetchImpl = async (url, init) => { sent.push({ url, init, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ ok: true, product: 'founder', token: founderToken() })); };
  const { api, store } = loadClient({ config: cfg, fetchImpl });
  assert.equal(api.isFounder(), false); assert.equal(api.canUse('founder'), false); assert.equal(api.canUseLook('founderA'), false);
  assert.deepEqual(plain(await api.redeemFounder(' gold-abcd efgh ')), { ok: true });
  assert.equal(sent[0].url, 'https://crease-license.prodbykctw.workers.dev/founder/redeem');
  assert.deepEqual(Object.keys(sent[0].body).sort(), ['code', 'device']);
  assert.equal(sent[0].body.code, 'GOLDABCDEFGH'); assert.match(sent[0].body.device, /^[a-f0-9]{32}$/);
  assert.equal(sent[0].init.credentials, 'omit');
  assert.equal(store['crease.device.v1'], sent[0].body.device);
  assert.equal(api.isFounder(), true); assert.equal(api.isPremium(), false, 'a Founder code is not a Premium Pass');
  assert.equal(api.canUse('founder'), true); assert.equal(api.canUseLook('founderA'), true);
  for (const id of ['prism', 'solar', 'obsidian']) assert.equal(api.canUse(id), false, id + ' stays premium-only');
  for (const k of api.lookSets) { const f = k.startsWith('founder'); assert.equal(api.canUseLook(k), f, k); assert.equal(api.canUseFx(k), f, k); }   // only the two Founder looks and effects
  assert.equal(api.extendRounds(), false);
  assert.equal(api.setPaddleStyle('founder'), true); assert.equal(api.setPaddleStyle('prism'), false);
  assert.equal(api.paddleStyle(), api.styles.founder);
  assert.equal(api.resolveMix({ base: 'founderB', hit: 'prismA' }).base, 'founderB');
  assert.equal(api.resolveMix({ base: 'founder', hit: 'prismA' }).hit, 'classic');
  // its own storage key, separate from the Pass entitlement
  assert.ok(store['crease.founder.v1']); assert.equal(store['crease.entitlement.v1'], undefined);
  assert.ok(!JSON.stringify(store).includes('GOLDABCDEFGH'), 'the code itself is never stored');
  // survives a reload; a Pass added later keeps both
  const again = loadClient({ store, config: cfg }).api;
  assert.equal(again.isFounder(), true); assert.equal(again.isPremium(), false);
  assert.equal(again.activateProviderEntitlement({ product: again.PRODUCT.id, verified: true }), true);
  assert.equal(again.isFounder(), true); assert.equal(again.canUse('prism'), true);
});

test('client: a Pass buyer without a code does not get Founder’s Gold, and an old stored Founder flag is ignored', () => {
  const store = { 'crease.entitlement.v1': JSON.stringify({ product: PASS_ID, verifiedAt: 5, token: 't', founder: true, instanceId: 'abcdef12-0000' }) };
  const { api } = loadClient({ store, config: cfg });
  assert.equal(api.isPremium(), true); assert.equal(api.isFounder(), false);
  assert.equal(api.canUse('prism'), true); assert.equal(api.canUse('founder'), false); assert.equal(api.canUseLook('founderA'), false);
  assert.equal(api.setPaddleStyle('founder'), false);
  assert.equal(api.resolveMix({ base: 'founder' }).base, 'classic');
});

test('client: refusals, bad replies, forged tokens and being offline never unlock Founder’s Gold', async () => {
  const cases = [
    [jsonReply({ ok: false, reason: 'invalid' }), { ok: false, reason: 'invalid' }],
    [jsonReply({ ok: false, reason: 'used' }), { ok: false, reason: 'used' }],
    [jsonReply({ ok: false, reason: 'made-up' }), { ok: false, reason: 'invalid' }],
    [jsonReply({ ok: true, product: 'founder', token: 'tok.en' }), { ok: false, reason: 'invalid' }],                     // a token that does not say founder
    [jsonReply({ ok: true, product: 'founder', token: b64({ p: PASS_ID, f: true }) + '.s' }), { ok: false, reason: 'invalid' }],   // a Pass token is not a Founder token
    [jsonReply({ ok: true, product: 'founder', token: b64({ p: 'founder', f: false }) + '.s' }), { ok: false, reason: 'invalid' }],
    [jsonReply({ ok: true, product: PASS_ID, token: founderToken() }), { ok: false, reason: 'invalid' }],
    [jsonReply({ ok: false, reason: 'unavailable' }, 503), { ok: false, reason: 'offline' }],
    [jsonReply({}, 429), { ok: false, reason: 'offline' }],
    [async () => { throw new Error('offline'); }, { ok: false, reason: 'offline' }],
    [async () => new Response('<html>', { status: 200 }), { ok: false, reason: 'offline' }],
  ];
  for (const [fetchImpl, expected] of cases) {
    const { api, store } = loadClient({ config: cfg, fetchImpl });
    assert.deepEqual(plain(await api.redeemFounder('GOLD-ABCD-EFGH')), expected);
    assert.equal(api.isFounder(), false); assert.equal(store['crease.founder.v1'], undefined);
  }
  let calls = 0;
  const { api } = loadClient({ config: cfg, fetchImpl: async () => { calls++; return new Response('{}'); } });
  for (const bad of ['', 'abc', 'GOLD!!!!', 'x'.repeat(50), null, undefined]) assert.deepEqual(plain(await api.redeemFounder(bad)), { ok: false, reason: 'invalid' });
  assert.equal(calls, 0, 'a malformed code never leaves the device');
  assert.deepEqual(plain(await loadClient({ config: {}, fetchImpl: jsonReply({}) }).api.redeemFounder('GOLD-ABCD-EFGH')), { ok: false, reason: 'offline' }, 'no Worker URL');
  // garbage in storage is ignored
  for (const junk of ['not json', JSON.stringify({ token: 'x.y' }), JSON.stringify({ token: b64({ p: PASS_ID, f: true }) + '.s' }), JSON.stringify(null)])
    assert.equal(loadClient({ store: { 'crease.founder.v1': junk }, config: cfg }).api.isFounder(), false, junk);
});

test('client: ?founder=CODE is read once, normalized, and removed from the address bar', () => {
  const { api } = loadClient({ config: cfg });
  const run = (search, hash = '') => { const calls = []; const code = api.takeFounderFromUrl({ search, hash, pathname: '/' }, { replaceState: (...a) => calls.push(a) }); return { code, calls }; };
  assert.deepEqual(run('?founder=gold-abcd-efgh'), { code: 'GOLDABCDEFGH', calls: [[null, '', '/']] });
  assert.deepEqual(run('?utm=x&founder=GOLD-ABCD-EFGH'), { code: 'GOLDABCDEFGH', calls: [[null, '', '/?utm=x']] });
  assert.deepEqual(run('', '#founder=GOLDABCDEFGH'), { code: 'GOLDABCDEFGH', calls: [[null, '', '/']] });
  assert.deepEqual(run('?founder=%3Cscript%3E'), { code: '', calls: [[null, '', '/']] }, 'a bad value is dropped but still removed from the address');
  assert.deepEqual(run('?utm=x'), { code: '', calls: [] });
  assert.equal(api.takeFounderFromUrl(null, null), '', 'never throws');
});

test('client: "N of 100 left" comes from /founder/left, and anything doubtful is null so the number is hidden', async () => {
  const seen = [];
  const ok = n => async (url, init) => { seen.push({ url, init }); return new Response(JSON.stringify({ left: n })); };
  const a = loadClient({ config: cfg, fetchImpl: ok(37) }).api;
  assert.equal(await a.founderLeft(), 37);
  assert.equal(seen[0].url, 'https://crease-license.prodbykctw.workers.dev/founder/left'); assert.equal(seen[0].init.method, 'GET'); assert.equal(seen[0].init.credentials, 'omit');
  assert.equal(await a.founderLeft(), 37); assert.equal(seen.length, 1, 'cached for 30 s');
  assert.equal(await loadClient({ config: cfg, fetchImpl: ok(0) }).api.founderLeft(), 0);
  for (const f of [ok(101), ok(-1), ok(3.5), ok('7'), ok(null), jsonReply({}), jsonReply({ left: 5 }, 503), async () => { throw new Error('x'); }, async () => new Response('nope')])
    assert.equal(await loadClient({ config: cfg, fetchImpl: f }).api.founderLeft(), null);
  assert.equal(await loadClient({ config: {}, fetchImpl: ok(5) }).api.founderLeft(), null, 'no Worker URL');
});

// ---------------------------------------------------------------- page and copy
test('page: the Garage has the claim entry, the exact messages, and tap targets of 44px or more', () => {
  const html = read('index.html'), mon = read('assets/monetization.js');
  assert.ok(mon.includes(COPY.text), 'card description');
  const dialog = /<dialog id="premium"[\s\S]*?<\/dialog>/.exec(html)[0];
  assert.ok(dialog.includes('<h3>' + COPY.label + '</h3>'));
  assert.match(dialog, /<input id="founderCode"[^>]*autocapitalize="characters"/);
  assert.match(dialog, /<button id="founderRedeem" class="btn plain" type="button">CLAIM<\/button>/);
  assert.match(dialog, /id="founderStatus"[^>]*role="status"[^>]*aria-live="polite"/);
  for (const m of [COPY.success, COPY.invalid, COPY.used, COPY.offline]) assert.ok(html.includes(m), m);
  assert.ok(html.includes(COPY.soldOut), 'sold-out line');
  // the field and button sizes come from the shared Garage rules: 16px type (no iOS zoom) and 44px+ targets
  assert.match(html, /#premium \.premium-restore \.field input\{[^}]*min-height:48px[^}]*font-size:16px/);
  assert.match(html, /#premium \.btn\{min-height:52px/);
  // the ?founder= link is handled on load next to the ?cs= one, and equips Founder's Gold
  assert.match(html, /CreaseProduct\.takeFounderFromUrl\(\);if\(code\)claimFounder\(code,true\)/);
  assert.match(html, /CreaseProduct\.setPaddleStyle\('founder'\)/);
  // the number is shown only when it was read
  assert.match(html, /const n=await CreaseProduct\.founderLeft\(\);\s*if\(n===null\)return;/);
  assert.ok(html.includes("n+' of 100 left'"));
  assert.ok(!/founderWindowEnd|The launch window|The window closes/.test(html));
});

test('copy: the old 30-day Founder wording is gone and the new rule is stated plainly in the terms', () => {
  const terms = read('terms/index.html');
  assert.ok(terms.includes(COPY.text));
  assert.match(terms, /Founder’s Gold is free and is not part of the Premium Pass; buying the Pass does not give it to you\./);
  assert.match(terms, /first 100 players who claim it by direct message to @playcrease on Instagram, X or TikTok, one per player/);
  assert.match(terms, /It is not sold and has no cash value\./);
  for (const f of ['terms/index.html', 'llms.txt', 'llms-full.txt', 'README.md', 'docs/CHECKOUT.md', 'docs/LAUNCH.md', 'index.html', 'assets/monetization.js'])
    assert.ok(!/first 30 days|launch-window exclusive|30-day window/i.test(read(f)), f);
  assert.ok(read('llms-full.txt').includes(COPY.text));
});

test('copy: approved wording for CTW and the locked Design Studio', () => {
  const html = read('index.html');
  assert.ok(html.includes('<li>CTW (Change The World) is the hardest CPU.</li>'));
  assert.ok(!/Wizards/i.test(html));
  assert.ok(html.includes('<b>Locked:</b> Design Studio is included with the Premium Pass.</p>'));
  assert.ok(!html.includes('part of the Premium Pass (the unlocked version)'));
  const how = /<div id="how"[\s\S]*?<\/ul>/.exec(html)[0];
  assert.ok(how.includes('CTW (Change The World) is the hardest CPU.'));
});

test('secrets: plain Founder codes are never in the repo and the CSV is git-ignored', () => {
  const ignore = read('.gitignore');
  assert.match(ignore, /^founder-codes\.csv$/m); assert.match(ignore, /^\*\*\/founder-codes\.csv$/m);
});
