import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../backend/worker.mjs';
const origin = 'https://prodbykctw-max.github.io';
const event = { id: '12345678-1234-1234-1234-123456789abc', name: 'match_start', props: { mode: 'duo', email: 'discard' } };
// Mock D1: the daily counter behaves like the real upsert (raised only while below the bound cap) and
// event inserts are recorded in `writes`.
function setup({ count = 0, day = null } = {}) {
  const writes = [], counts = new Map(day ? [[day, count]] : []);
  const DB = { prepare(sql) {
    if (/daily_counts/.test(sql)) {
      assert.match(sql, /^INSERT INTO daily_counts \(day, n\) VALUES \(\?, 1\) ON CONFLICT\(day\) DO UPDATE SET n = n \+ 1 WHERE n < \?$/);
      return { bind(d, cap) { return { async run() {
        const n = counts.get(d);
        if (n === undefined) { counts.set(d, 1); return { meta: { changes: 1 } }; }
        if (n < cap) { counts.set(d, n + 1); return { meta: { changes: 1 } }; }
        return { meta: { changes: 0 } };
      } }; } };
    }
    assert.match(sql, /INSERT OR IGNORE/);
    return { bind(...args) { return { async run() { writes.push(args); return { meta: { changes: 1 } }; } }; } };
  } };
  return { writes, counts, env: { ALLOWED_ORIGINS: origin, DB } };
}
function req(body = event, from = origin, extra = {}) {
  return new Request('https://metrics.example/events', { method: 'POST', headers: { Origin: from, 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body) });
}
const today = () => new Date().toISOString().slice(0, 10);
test('valid event stores only allowed properties', async () => {
  const {env,writes} = setup(); assert.equal((await worker.fetch(req(), env)).status, 204);
  assert.deepEqual(JSON.parse(writes[0][2]), { mode: 'duo' });
});
test('rejects foreign origins, malformed event and oversized body before DB', async () => {
  const {env,writes} = setup();
  assert.equal((await worker.fetch(req(event, 'https://foreign.example'), env)).status, 403);
  assert.equal((await worker.fetch(req({ ...event, name: 'purchase' }), env)).status, 400);
  assert.equal((await worker.fetch(req({ ...event, junk: 'x'.repeat(3000) }), env)).status, 413);
  assert.equal(writes.length, 0);
});
test('CORS preflight and unavailable database', async () => {
  const {env} = setup();
  const preflight = await worker.fetch(new Request('https://metrics.example/events', {method:'OPTIONS',headers:{Origin:origin}}),env);
  assert.equal(preflight.status,204); assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);
  env.DB.prepare = () => {throw new Error('offline');};
  assert.equal((await worker.fetch(req(),env)).status,503);
});

test('rate limits answer 429 before the database is touched', async () => {
  const {env,writes} = setup();
  env.PER_IP = { async limit() { return { success: false }; } };
  assert.equal((await worker.fetch(req(), env)).status, 429);
  env.PER_IP = { async limit() { return { success: true }; } };
  env.ALL_TRAFFIC = { async limit({ key }) { assert.equal(key, 'all'); return { success: false }; } };
  assert.equal((await worker.fetch(req(), env)).status, 429);
  env.ALL_TRAFFIC = { async limit() { return { success: true }; } };
  assert.equal((await worker.fetch(req(), env)).status, 204);
  assert.equal(writes.length, 1);
});

test('feedback votes and reasons store only the fixed choices', async () => {
  const {env,writes} = setup();
  const id = n => `12345678-1234-1234-1234-12345678900${n}`;
  assert.equal((await worker.fetch(req({ id: id(1), name: 'feedback', props: { vote: 'up', mode: 'solo', note: 'free text is dropped' } }), env)).status, 204);
  assert.equal((await worker.fetch(req({ id: id(2), name: 'feedback_reason', props: { why: 'too_hard', difficulty: 'hard' } }), env)).status, 204);
  assert.equal((await worker.fetch(req({ id: id(3), name: 'feedback', props: { vote: 'meh' } }), env)).status, 204);
  assert.equal((await worker.fetch(req({ id: id(4), name: 'visit', props: { source: 'x' } }), env)).status, 204);
  assert.deepEqual(writes.map(w => JSON.parse(w[2])), [{ mode: 'solo', vote: 'up' }, { difficulty: 'hard', why: 'too_hard' }, {}, { source: 'x' }]);
});

test('result-card share events keep their from and method values', async () => {
  const {env,writes} = setup();
  const id = n => `12345678-1234-1234-1234-12345678901${n}`;
  assert.equal((await worker.fetch(req({ id: id(1), name: 'share_handoff', props: { method: 'image', from: 'result_card' } }), env)).status, 204);
  assert.equal((await worker.fetch(req({ id: id(2), name: 'share_attempt', props: { from: 'result_card' } }), env)).status, 204);
  assert.deepEqual(writes.map(w => JSON.parse(w[2])), [{ from: 'result_card', method: 'image' }, { from: 'result_card' }]);
});

test('daily cron deletes events older than 90 days and counters older than 30 days', async () => {
  const sqls = [];
  const env = { DB: { prepare(sql) { sqls.push(sql); return { async run() {} }; } } };
  await worker.scheduled({}, env);
  assert.equal(sqls.length, 2);
  assert.match(sqls[0], /DELETE FROM events WHERE created_at < .*-90 days/);
  assert.match(sqls[1], /DELETE FROM daily_counts WHERE day < .*-30 days/);
});

test('daily cron still prunes counters when the events delete fails, then reports the failure', async () => {
  const sqls = [];
  const env = { DB: { prepare(sql) { sqls.push(sql); return { async run() { if (/FROM events/.test(sql)) throw new Error('busy'); } }; } } };
  await assert.rejects(worker.scheduled({}, env), /busy/);
  assert.equal(sqls.length, 2);
});

test('below the daily cap the event is counted and stored', async () => {
  const { env, writes, counts } = setup({ day: today(), count: 2998 });
  assert.equal((await worker.fetch(req(), env)).status, 204);
  assert.equal(writes.length, 1);
  assert.equal(counts.get(today()), 2999);
});

test('the first event of a new UTC day starts the counter at 1', async () => {
  const { env, writes, counts } = setup({ day: '2000-01-01', count: 3000 });
  assert.equal((await worker.fetch(req(), env)).status, 204);
  assert.equal(writes.length, 1);
  assert.equal(counts.get(today()), 1);
  assert.equal(counts.get('2000-01-01'), 3000, 'yesterday is untouched');
});

test('once the daily cap is reached the worker answers 204 and stores nothing', async () => {
  const { env, writes, counts } = setup({ day: today(), count: 3000 });
  assert.equal((await worker.fetch(req(), env)).status, 204);
  assert.equal(writes.length, 0);
  assert.equal(counts.get(today()), 3000);
});

test('DAILY_EVENT_CAP overrides the default; the cap is never overshot', async () => {
  const { env, writes, counts } = setup();
  env.DAILY_EVENT_CAP = '3';
  const id = n => `12345678-1234-1234-1234-1234567890${String(n).padStart(2, '0')}`;
  const statuses = await Promise.all(Array.from({ length: 6 }, (_, n) => worker.fetch(req({ ...event, id: id(n) }), env).then(r => r.status)));
  assert.deepEqual(statuses, [204, 204, 204, 204, 204, 204]);
  assert.equal(writes.length, 3);
  assert.equal(counts.get(today()), 3);
});

test('DAILY_EVENT_CAP of 0 stores nothing and does not touch the database', async () => {
  const { env, writes, counts } = setup();
  env.DAILY_EVENT_CAP = '0';
  assert.equal((await worker.fetch(req(), env)).status, 204);
  assert.equal(writes.length, 0);
  assert.equal(counts.size, 0);
});

test('Global Privacy Control or Do Not Track: 204, nothing stored, no rate-limit budget spent', async () => {
  for (const extra of [{ 'Sec-GPC': '1' }, { DNT: '1' }]) {
    const { env, writes, counts } = setup();
    let limited = 0;
    env.PER_IP = env.ALL_TRAFFIC = { async limit() { limited++; return { success: true }; } };
    const res = await worker.fetch(req(event, origin, extra), env);
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), origin, 'the browser still sees a normal CORS reply');
    assert.equal(writes.length, 0);
    assert.equal(counts.size, 0);
    assert.equal(limited, 0);
  }
  // Signals that are present but not "1" are not opt-outs.
  const { env, writes } = setup();
  assert.equal((await worker.fetch(req(event, origin, { 'Sec-GPC': '0', DNT: '0' }), env)).status, 204);
  assert.equal(writes.length, 1);
});

test('migration 0002 creates the daily_counts table the worker writes to', async () => {
  const { readFileSync } = await import('node:fs');
  const sql = readFileSync(new URL('../backend/migrations/0002_daily_cap.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS daily_counts \(\s*day TEXT PRIMARY KEY,\s*n INTEGER NOT NULL\s*\)/);
});
