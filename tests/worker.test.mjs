import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../backend/worker.mjs';
const origin = 'https://prodbykctw-max.github.io';
const event = { id: '12345678-1234-1234-1234-123456789abc', name: 'match_start', props: { mode: 'duo', email: 'discard' } };
function setup() {
  const writes = [];
  return { writes, env: { ALLOWED_ORIGINS: origin, DB: { prepare(sql) { assert.match(sql, /INSERT OR IGNORE/); return { bind(...args) { return { async run() { writes.push(args); } }; } }; } } } };
}
function req(body = event, from = origin) {
  return new Request('https://metrics.example/events', { method: 'POST', headers: { Origin: from, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
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

