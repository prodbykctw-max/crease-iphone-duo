import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function load(store = {}) {
  const context = { window: {}, atob, btoa, localStorage: {
    getItem: key => Object.hasOwn(store, key) ? store[key] : null,
    setItem: (key, value) => { store[key] = String(value); }
  } };
  vm.runInNewContext(fs.readFileSync(new URL('../assets/monetization.js', import.meta.url), 'utf8'), context);
  return { api: context.window.CreaseProduct, store };
}
const FOUNDER_TOKEN = Buffer.from(JSON.stringify({ v: 1, p: 'founder', c: '2026-11-07T00:00:00.000Z', i: 'a'.repeat(32), f: true, iat: 1 })).toString('base64url') + '.sig';
// A Premium Pass, plus (founder = true) a Founder's Gold code claimed on this device. The two are separate entitlements.
const owner = (store, founder = false) => {
  if (founder) store['crease.founder.v1'] = JSON.stringify({ token: FOUNDER_TOKEN });
  const r = load(store);
  assert.equal(r.api.activateProviderEntitlement({ product: r.api.PRODUCT.id, verified: true }), true);
  return r;
};
const plain = v => JSON.parse(JSON.stringify(v));
const PADDLES = ['prism', 'solar', 'obsidian'];

test('each premium paddle has two named looks and the names are the ones players see', () => {
  const { api } = load();
  assert.deepEqual(plain(api.looks), {
    prism: [{ id: 'A', name: 'Crystal' }, { id: 'B', name: 'Lens' }],
    solar: [{ id: 'A', name: 'Molten' }, { id: 'B', name: 'Eclipse' }],
    obsidian: [{ id: 'A', name: 'Circuit' }, { id: 'B', name: 'Hex' }],
  });
  assert.equal(api.lookSets.length, 6);
  assert.equal(api.lookName('solarB'), 'Solar Flare · Eclipse');
});

test('look choice is remembered next to the equipped paddle and survives a reload', () => {
  const store = {};
  const { api } = owner(store);
  assert.equal(api.setPaddleStyle('obsidian'), true);
  assert.equal(api.paddleLook('obsidian'), 'A');                 // default look
  assert.equal(api.setPaddleLook('obsidian', 'B'), true);
  assert.equal(api.setPaddleLook('prism', 'B'), true);
  assert.equal(api.paddleLook('obsidian'), 'B');
  assert.equal(api.paddleLook('solar'), 'A');
  assert.equal(store['crease.paddle.v1'], 'obsidian');           // the equipped paddle key is untouched
  assert.deepEqual(plain(JSON.parse(store['crease.paddleLook.v1'])), { prism: 'B', solar: 'A', obsidian: 'B' });
  const again = load(store).api;                                   // a new page load reading the same storage
  assert.equal(again.paddleLook('obsidian'), 'B');
  assert.equal(again.paddleLook('prism'), 'B');
  assert.equal(again.paddleLook('solar'), 'A');
});

test('look choice rejects bad input and bad saved data falls back to the first look', () => {
  const { api } = owner({});
  assert.equal(api.setPaddleLook('prism', 'C'), false);
  assert.equal(api.setPaddleLook('prism', 'b'), false);
  assert.equal(api.setPaddleLook('classic', 'A'), false);
  assert.equal(api.setPaddleLook('founder', 'A'), false);
  assert.equal(api.setPaddleLook('__proto__', 'A'), false);
  assert.equal(api.paddleLook('classic'), '');
  for (const bad of ['not json', '[]', 'null', '{"prism":"Z","solar":5,"obsidian":{"x":1}}', '{"prism":"B"', '"B"']) {
    const a = load({ 'crease.paddleLook.v1': bad }).api;
    assert.equal(a.paddleLook('solar'), 'A', bad);
    assert.equal(a.paddleLook('obsidian'), 'A', bad);
  }
  assert.equal(load({ 'crease.paddleLook.v1': '{"prism":"B","solar":"Z"}' }).api.paddleLook('prism'), 'B');
});

test('a paddle you do not own cannot have its look changed', () => {
  const { api, store } = load();
  assert.equal(api.setPaddleLook('prism', 'B'), false);
  assert.equal(store['crease.paddleLook.v1'], undefined);
});

test('both looks of every premium paddle play that paddle’s B effects', () => {
  const { api } = load();
  for (const id of PADDLES) for (const look of ['A', 'B']) assert.equal(api.effectsFor(id, look), id + 'B', id + look);
  assert.equal(api.effectsFor('classic', 'A'), '');
  assert.equal(api.effectsFor('founder', 'A'), '');
  assert.equal(api.effectsFor('prism', 'Z'), '');
});

test('the match plays the B effects whichever look is picked, and draws the picked look', () => {
  const store = {};
  const { api } = owner(store);
  const src = html.slice(html.indexOf('const sig = {'), html.indexOf('let PAi = null;'));
  assert.ok(src.includes('function p1Sig()'));
  const studio = { d: {} };
  const { p1Sig, sig } = vm.runInNewContext(src + '\n({ p1Sig, sig })', { CreaseProduct: api, studio, studioOn: () => !!studio.d.padOn });
  for (const id of PADDLES) {
    assert.equal(api.setPaddleStyle(id), true);
    for (const look of ['A', 'B']) {
      assert.equal(api.setPaddleLook(id, look), true);
      p1Sig();
      assert.equal(sig.body, id + look);
      assert.equal(sig.hit, id + 'B');
      assert.equal(sig.goal, id + 'B');
      assert.equal(sig.mixed, false);
    }
  }
  api.setPaddleStyle('classic'); p1Sig();
  assert.deepEqual([sig.body, sig.hit, sig.goal], ['', '', '']);   // Classic Cyan keeps its current drawing and sparks
  const gold = owner({}, true);
  gold.api.setPaddleStyle('founder');
  const g = vm.runInNewContext(src + '\n({ p1Sig, sig })', { CreaseProduct: gold.api, studio: { d: {} }, studioOn: () => false });
  g.p1Sig();
  assert.deepEqual([g.sig.body, g.sig.hit, g.sig.goal], ['', '', '']);
});

test('a saved Design Studio mix is what the match plays', () => {
  const { api } = owner({});
  const src = html.slice(html.indexOf('const sig = {'), html.indexOf('let PAi = null;'));
  const studio = { d: { padOn: true, mix: { base: 'solarA', hit: 'obsidianA', goal: 'prismB', tune: { hue: 40, size: 1.3, power: 0.7 } } } };
  const { p1Sig, sig } = vm.runInNewContext(src + '\n({ p1Sig, sig })', { CreaseProduct: api, studio, studioOn: () => !!studio.d.padOn });
  p1Sig();
  assert.equal(sig.mixed, true);
  assert.deepEqual([sig.body, sig.hit, sig.goal], ['solarA', 'obsidianA', 'prismB']);
  assert.deepEqual(plain(sig.tune), { hue: 40, size: 1.3, power: 0.7 });
  studio.d.mix = { base: 'classic', hit: 'classic', goal: 'classic' }; p1Sig();
  assert.deepEqual([sig.body, sig.hit, sig.goal], ['', '', '']);
  assert.equal(sig.mixed, true);                                    // classic effects: no signature sparks at all
  studio.d.padOn = false; p1Sig();
  assert.equal(sig.mixed, false);                                   // "Use my paddle" off: the equipped paddle plays
});

test('Studio mix cleaning: junk, old data and out-of-range numbers fall back or clamp, never throw', () => {
  const { api } = load();
  const DEF = { base: 'classic', hit: 'classic', goal: 'classic', tune: { hue: 0, size: 1, power: 1 } };
  for (const junk of [undefined, null, 0, 1, 'x', '', true, [], [1, 2], () => 1, Symbol.iterator, { tune: 'bad' }, { tune: null }, { tune: [] }, { base: 5, hit: {}, goal: [] }]) {
    assert.deepEqual(plain(api.sanitizeMix(junk)), DEF, String(typeof junk));
  }
  const m = api.sanitizeMix({ base: 'nope', hit: 'prismA', goal: 'founder', tune: { hue: NaN, size: Infinity, power: -Infinity } });
  assert.equal(m.base, 'classic');
  assert.equal(m.hit, 'prismA');
  assert.equal(m.goal, 'classic');                                 // founder is a look, not an effect set
  assert.deepEqual(plain(m.tune), { hue: 0, size: 1, power: 1 });
  const hi = api.sanitizeMix({ tune: { hue: 9999, size: 99, power: 99 } }).tune;
  assert.deepEqual(plain(hi), { hue: 180, size: 1.6, power: 1.6 });
  const lo = api.sanitizeMix({ tune: { hue: -9999, size: -5, power: 0 } }).tune;
  assert.deepEqual(plain(lo), { hue: -180, size: 0.6, power: 0.4 });
  const s = api.sanitizeMix({ tune: { hue: '45.4', size: '1.234', power: 'abc' } }).tune;
  assert.deepEqual(plain(s), { hue: 45, size: 1.23, power: 1 });
  assert.equal(api.sanitizeMix({ tune: { hue: ' ', size: null } }).tune.hue, 0);
  // extra keys and prototype tricks are dropped
  const dirty = api.sanitizeMix(JSON.parse('{"__proto__":{"x":1},"constructor":"y","base":"prismB","evil":"<script>"}'));
  assert.deepEqual(Object.keys(dirty).sort(), ['base', 'goal', 'hit', 'tune']);
  assert.equal(dirty.base, 'prismB');
  // idempotent
  assert.deepEqual(plain(api.sanitizeMix(m)), plain(m));
});

test('Studio ownership: locked looks and effects never play', () => {
  const none = load().api;
  assert.equal(none.canUseLook('classic'), true);
  assert.equal(none.canUseFx('classic'), true);
  for (const k of none.lookSets) { assert.equal(none.canUseLook(k), false, k); assert.equal(none.canUseFx(k), false, k); }
  assert.equal(none.canUseLook('founder'), false);
  const all = { base: 'solarB', hit: 'prismA', goal: 'obsidianB', tune: { hue: 20, size: 1.2, power: 1.2 } };
  const r = none.resolveMix(all);
  assert.deepEqual([r.base, r.hit, r.goal], ['classic', 'classic', 'classic']);
  assert.equal(r.tune.hue, 20);                                     // tuning is kept; only locked parts are swapped
  const pass = owner({}).api;
  for (const k of pass.lookSets) { assert.equal(pass.canUseLook(k), true, k); assert.equal(pass.canUseFx(k), true, k); }
  assert.equal(pass.canUseLook('founder'), false);                  // a Pass alone never includes Founder’s Gold
  const p = pass.resolveMix(all);
  assert.deepEqual([p.base, p.hit, p.goal], ['solarB', 'prismA', 'obsidianB']);
  assert.equal(pass.resolveMix({ base: 'founder' }).base, 'classic');
  const gold = owner({}, true).api;
  assert.equal(gold.canUseLook('founder'), true);
  assert.equal(gold.resolveMix({ base: 'founder' }).base, 'founder');
  assert.equal(gold.canUseFx('founder'), false);
});

test('the preview switch is gone and the new screens are in the page', () => {
  assert.ok(!/paddlepreview|PADV/.test(html), 'no preview parameter left');
  for (const id of ['mixPreview', 'mixBase', 'mixHit', 'mixGoal', 'mixHue', 'mixSize', 'mixPower', 'mixSave', 'mixPlayHit', 'mixPlayGoal']) assert.ok(html.includes(`id="${id}"`), id);
  // every control has a visible label
  const mix = html.slice(html.indexOf('<section class="studio-mix"'), html.indexOf('</section>', html.indexOf('<section class="studio-mix"')));
  assert.equal((mix.match(/<select /g) || []).length, 3);
  assert.equal((mix.match(/<input type="range"/g) || []).length, 5);   // color shift, size, intensity, texture strength, opacity
  assert.equal((mix.match(/<label class="mix-field">/g) || []).length, 8);
  assert.ok(!/debug|todo|param|preview param|internal/i.test(mix.replace(/aria-label="[^"]*"/g, '').replace(/id="mixPreview"/, '')), 'no developer text on the Studio screen');
});

test('the inline game script still parses (typographic apostrophes in player-facing text)', () => {
  const m = html.match(/<script>\n([\s\S]*?)<\/script>/);
  assert.ok(m);
  assert.doesNotThrow(() => new vm.Script(m[1]));
});

test('the new effect code keeps the performance rules: no shadow blur in the live effect code, particles capped', () => {
  const fx = html.slice(html.indexOf('// ---- effects: short-lived records'), html.indexOf('function drawPaddle(pd, glowA)'));
  assert.ok(fx.length > 2000);
  assert.ok(!/shadowBlur/.test(fx), 'effects draw without shadowBlur');
  assert.ok(/P\.length >= 170/.test(fx), 'one cap of 170 particles');
  const s = html.slice(html.indexOf('// ---------- Design Studio: mix and tune'), html.indexOf('for (const id of [\'mixBase\''));
  assert.ok(!/shadowBlur/.test(s));
});

test('Design Studio: locked state hides and disables every control; inputs are 16px or larger; columns fit', () => {
  assert.ok(html.includes('#designStudio.locked .studio-grid,#designStudio.locked .studio-mix{display:none}'));
  assert.ok(/for \(const e of \$\('designStudio'\)\.querySelectorAll\('\.studio-grid input,\.studio-grid button,\.studio-mix input,\.studio-mix select,\.studio-mix button'\)\) e\.disabled = !paid;/.test(html));
  assert.ok(html.includes('#designStudio input,#designStudio select,#designStudio button{font-size:16px}'));
  assert.ok(html.includes('#designStudio .studio-grid fieldset{min-width:0'));
  assert.ok(html.includes('minmax(min(250px,100%),1fr)'));
  assert.ok(html.includes("if (CreaseProduct.isPremium()) mixStart();"), 'the live preview does not run while locked');
});
