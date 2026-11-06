import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('no page, feed or structured data still says the iPhone Duo has not gone on sale', () => {
  for (const f of ['iphone-duo-games/index.html', 'llms.txt', 'llms-full.txt', 'index.html', 'README.md']) {
    const s = read(f);
    assert.doesNotMatch(s, /goes on sale/i, f);
    assert.doesNotMatch(s, /isn.t on sale yet/i, f);
    assert.doesNotMatch(s, /before the iPhone Duo goes/i, f);
    assert.doesNotMatch(s, /Until then, CREASE is tested/i, f);
  }
  const page = read('iphone-duo-games/index.html');
  assert.match(page, /went on sale (Friday, )?October 23, 2026/);
  assert.match(read('llms.txt'), /on sale since October 23, 2026/);
});

test('404.html is a branded noindex page that links home and uses only root-absolute assets', () => {
  assert.ok(existsSync(new URL('../404.html', import.meta.url)));
  const s = read('404.html');
  assert.match(s, /<meta name="robots" content="noindex">/);
  assert.match(s, /<a class="cta" href="\/">/);
  assert.doesNotMatch(s, /GitHub/i);
  for (const m of s.matchAll(/(?:src|href)="([^"]+)"/g)) assert.match(m[1], /^(\/|https?:)/, 'asset path must not be relative: ' + m[1]);
});

test('tap targets are at least 44px and small text is at least 12px', () => {
  const s = read('index.html');
  assert.match(s, /\.arrow\{width:44px;height:44px;/);
  assert.match(s, /#bPause\{position:fixed;z-index:4;width:44px;height:44px;/);
  assert.match(s, /\.seg button\{[^}]*min-height:44px/);
  assert.match(s, /\.link\{[^}]*min-height:44px;min-width:44px/);
  assert.match(s, /\.btn small\{display:block;font-size:12\.5px/);
  assert.match(s, /\.arena-tile strong\{[^}]*font-size:12px/);
  assert.match(s, /\.arena-tile small\{[^}]*font-size:12px/);
  assert.match(s, /\.achievement-tools select\{[^}]*appearance:none/);
  for (const f of ['terms/index.html', 'privacy/index.html', 'iphone-duo-games/index.html']) {
    assert.match(read(f), /footer p a\{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px/, f);
  }
});
