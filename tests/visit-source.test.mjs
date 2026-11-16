import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('function inferredSource()');
const end = html.indexOf("\nconst source = ", start);
const fnSrc = html.slice(start, end);

function infer(ua, referrer = '') {
  const ctx = vm.createContext({ navigator: { userAgent: ua }, document: { referrer }, URL });
  vm.runInContext(fnSrc + '\nthis.out = inferredSource();', ctx);
  return ctx.out;
}

const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

test('in-app browsers are attributed from the user agent', () => {
  assert.equal(infer(SAFARI.replace('Safari/604.1', 'Instagram 350.0.0.0 (iPhone15,2)')), 'instagram');
  assert.equal(infer(SAFARI + ' [FBAN/FBIOS;FBAV/480.0]'), 'facebook');
  assert.equal(infer(SAFARI + ' musical_ly_37.0 BytedanceWebview/d8a21c6'), 'tiktok');
});

test('referrer hosts are attributed when the user agent is plain', () => {
  assert.equal(infer(SAFARI, 'https://l.instagram.com/?u=x'), 'instagram');
  assert.equal(infer(SAFARI, 'https://t.co/abc'), 'x');
  assert.equal(infer(SAFARI, 'https://www.youtube.com/'), 'youtube');
  assert.equal(infer(SAFARI, 'https://m.facebook.com/'), 'facebook');
  assert.equal(infer(SAFARI, 'https://www.reddit.com/r/WebGames'), 'reddit');
});

test('everything else stays direct, including look-alike hosts', () => {
  assert.equal(infer(SAFARI), 'direct');
  assert.equal(infer(SAFARI, 'https://playcrease.app/'), 'direct');
  assert.equal(infer(SAFARI, 'https://notinstagram.com.evil.example/'), 'direct');
  assert.equal(infer(SAFARI, 'not a url'), 'direct');
});

test('only sources the metrics worker accepts can be produced', () => {
  const worker = fs.readFileSync(new URL('../backend/worker.mjs', import.meta.url), 'utf8');
  for (const s of fnSrc.match(/return '([a-z]+)'/g).map((m) => m.slice(8, -1))) {
    assert.ok(worker.includes(`'${s}'`), `${s} must be allowed by backend/worker.mjs`);
  }
});

test('short bio-link tags map to sources the worker accepts', () => {
  const a = html.indexOf('const SRC_ALIASES');
  const aliasSrc = html.slice(a, html.indexOf('\n', a));
  const ctx = vm.createContext({});
  vm.runInContext(aliasSrc.replace('const SRC_ALIASES', 'this.SRC_ALIASES'), ctx);
  assert.equal(ctx.SRC_ALIASES.ig, 'instagram');
  assert.equal(ctx.SRC_ALIASES.tt, 'tiktok');
  const worker = fs.readFileSync(new URL('../backend/worker.mjs', import.meta.url), 'utf8');
  for (const v of Object.values(ctx.SRC_ALIASES)) assert.ok(worker.includes(`'${v}'`), v);
});
