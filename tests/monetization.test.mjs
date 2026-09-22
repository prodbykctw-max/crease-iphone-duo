import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function load(store = {}) {
  const context = { window: {}, localStorage: {
    getItem: key => Object.hasOwn(store, key) ? store[key] : null,
    setItem: (key, value) => { store[key] = String(value); }
  } };
  vm.runInNewContext(fs.readFileSync(new URL('../assets/monetization.js', import.meta.url), 'utf8'), context);
  return { api: context.window.CreaseProduct, store };
}

test('premium pass gates cosmetics and round carryover until verified', () => {
  const { api } = load();
  assert.equal(api.isPremium(), false);
  assert.equal(api.setPaddleStyle('prism'), false);
  assert.equal(api.extendRounds(), false);
  assert.equal(api.activateProviderEntitlement({product: 'wrong', verified: true}), false);
  assert.equal(api.activateProviderEntitlement({product: api.PRODUCT.id, verified: true}), true);
  assert.equal(api.isPremium(), true);
  assert.equal(api.setPaddleStyle('prism'), true);
  assert.equal(api.extendRounds(), true);
});

test('display names are sanitized and capped for local leaderboard entries', () => {
  const { api } = load();
  assert.equal(api.setName('  KCTW <fire>  '), true);
  assert.equal(api.name(), 'KCTW fire');
  assert.equal(api.setName(''), false);
  assert.ok(api.setName('x'.repeat(40)));
  assert.equal(api.name().length, 24);
});
