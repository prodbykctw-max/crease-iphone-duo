// Content-Security-Policy and test-hook exposure on the public pages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inlineScriptHashes, withHashes } from '../tools/csp-hash.mjs';

const read = page => readFileSync(new URL('../' + page, import.meta.url), 'utf8');
const policyOf = html => /<meta\s+(?:http-equiv="Content-Security-Policy"|name="crease-csp")\s+content="([^"]*)"/.exec(html)[1];
const directives = policy => Object.fromEntries(policy.split(';').map(d => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));

test('inline script hashes: executable scripts only, CRLF treated as LF', () => {
  const html = '<script type="application/ld+json">{"a":1}</script><script src="x.js"></script><script>a()\r\nb()</script><script type="module">c()</script>';
  const lf = inlineScriptHashes('<script>a()\nb()</script>');
  const hashes = inlineScriptHashes(html);
  assert.equal(hashes.length, 2);
  assert.equal(hashes[0], lf[0]);
  assert.match(hashes[1], /^'sha256-[A-Za-z0-9+/]{43}='$/);
});

test('withHashes replaces old hashes and keeps the other sources', () => {
  const p = withHashes("default-src 'self'; script-src 'self' 'sha256-old='; object-src 'none'", ["'sha256-new='"]);
  assert.equal(p, "default-src 'self'; script-src 'self' 'sha256-new='; object-src 'none'");
});

for (const [page, connect] of [
  ['index.html', ["'self'", 'https://crease-metrics.prodbykctw.workers.dev']],
  ['online.html', ["'self'", 'https://crease-online.prodbykctw.workers.dev', 'wss://crease-online.prodbykctw.workers.dev']],
  ['vr.html', null],
]) {
  test(`${page}: CSP lists every inline script and locks down the rest`, () => {
    const html = read(page), d = directives(policyOf(html));
    assert.deepEqual(d['default-src'], ["'self'"]);
    assert.deepEqual(d['script-src'], ["'self'", ...inlineScriptHashes(html)]);
    assert.deepEqual(d['object-src'], ["'none'"]);
    assert.deepEqual(d['base-uri'], ["'none'"]);
    assert.deepEqual(d['form-action'], ["'none'"]);
    assert.deepEqual(d['img-src'], ["'self'", 'data:', 'blob:']);
    assert.deepEqual(d['style-src'], ["'self'", "'unsafe-inline'"]);
    if (connect) assert.deepEqual(d['connect-src'], connect); else assert.equal(d['connect-src'], undefined);
    assert.ok(!('unsafe-eval' in d) && !d['script-src'].includes("'unsafe-inline'") && !d['script-src'].includes("'unsafe-eval'"));
    assert.match(html, /<meta name="referrer" content="strict-origin-when-cross-origin">/);
  });
}

test('the analytics and online endpoints are covered by connect-src', () => {
  const analytics = /CREASE_ANALYTICS_ENDPOINT = '([^']+)'/.exec(read('analytics-config.js'))[1];
  const online = /CREASE_ONLINE_URL = '([^']+)'/.exec(read('online-config.js'))[1];
  assert.ok(directives(policyOf(read('index.html')))['connect-src'].includes(new URL(analytics).origin));
  assert.ok(directives(policyOf(read('online.html')))['connect-src'].includes(new URL(online).origin));
});

test('index.html installs its policy before any other script, and not on localhost', () => {
  const html = read('index.html');
  const head = html.slice(0, html.indexOf('</head>'));
  const first = /<script>([\s\S]*?)<\/script>/.exec(head);
  assert.equal(head.indexOf('<script'), first.index, 'installer must be the first script on the page');
  assert.ok(first.index < head.indexOf('<link'), 'installer must run before any resource is requested');
  const install = src => {
    const added = [];
    const doc = { querySelector: () => ({ content: 'POLICY' }), createElement: () => ({}), head: { appendChild: m => added.push(m) } };
    new Function('location', 'document', first[1])({ hostname: src }, doc);
    return added;
  };
  assert.deepEqual(install('playcrease.app'), [{ httpEquiv: 'Content-Security-Policy', content: 'POLICY' }]);
  assert.deepEqual(install('prodbykctw-max.github.io').length, 1);
  assert.deepEqual(install('localhost'), []);
  assert.deepEqual(install('127.0.0.1'), []);
});

for (const [page, name] of [['index.html', '__crease'], ['online.html', '__online']]) {
  test(`${page}: window.${name} only on localhost / 127.0.0.1 or with ?qa=1`, () => {
    const html = read(page);
    const m = new RegExp(`if\\s*\\((.+?)\\)\\s*window\\.${name}\\s*=`).exec(html);
    assert.ok(m, `window.${name} must be assigned behind a condition`);
    assert.equal(html.match(new RegExp(`window\\.${name}\\s*=`, 'g')).length, 1);
    const exposed = (hostname, search = '') => new Function('location', `return !!(${m[1]});`)({ hostname, search });
    assert.equal(exposed('playcrease.app'), false);
    assert.equal(exposed('www.playcrease.app', '?src=x'), false);
    assert.equal(exposed('playcrease.app', '?qa=0'), false);
    assert.equal(exposed('[::1]'), false);
    assert.equal(exposed('localhost.evil.example'), false);
    assert.equal(exposed('playcrease.app', '?qa=1'), true);
    assert.equal(exposed('playcrease.app', '?nointro&qa=1'), true);
    assert.equal(exposed('localhost'), true);
    assert.equal(exposed('127.0.0.1'), true);
  });
}
