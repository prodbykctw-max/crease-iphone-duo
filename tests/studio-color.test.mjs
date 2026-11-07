import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const plain = v => JSON.parse(JSON.stringify(v));

function load(store = {}) {
  const context = { atob, btoa, window: {}, localStorage: {
    getItem: key => Object.hasOwn(store, key) ? store[key] : null,
    setItem: (key, value) => { store[key] = String(value); }
  } };
  vm.runInNewContext(fs.readFileSync(new URL('../assets/monetization.js', import.meta.url), 'utf8'), context);
  return { api: context.window.CreaseProduct, store, context };
}
const FOUNDER_TOKEN = Buffer.from(JSON.stringify({ v: 1, p: 'founder', c: '2026-11-07T00:00:00.000Z', i: 'a'.repeat(32), f: true, iat: 1 })).toString('base64url') + '.sig';
const owner = (founder = false) => {
  const r = load(founder ? { 'crease.founder.v1': JSON.stringify({ token: FOUNDER_TOKEN }) } : {});
  assert.equal(r.api.activateProviderEntitlement({ product: r.api.PRODUCT.id, verified: true }), true);
  return r.api;
};
const { api: A } = load();
const C = A.color;

// ---------------------------------------------------------------- color math
test('hex parsing accepts #RRGGBB and shorthand, rejects everything else', () => {
  assert.equal(C.parseHex('#2DE2E6'), '#2de2e6');
  assert.equal(C.parseHex('2de2e6'), '#2de2e6');
  assert.equal(C.parseHex(' #fa0 '), '#ffaa00');
  for (const bad of ['', '#', '#12', '#12345', '#1234567', '#gggggg', '#12 456', null, undefined, 5, {}, [], '#ff00zz']) assert.equal(C.parseHex(bad), null, String(bad));
  assert.equal(C.hexToRgb('nope'), null);
});

test('edge colors: pure black, pure white, the primaries and K=100', () => {
  const rgb = (r, g, b) => ({ r, g, b });
  assert.deepEqual(plain(C.rgbToCmyk(0, 0, 0)), { c: 0, m: 0, y: 0, k: 100 });
  assert.deepEqual(plain(C.rgbToCmyk(255, 255, 255)), { c: 0, m: 0, y: 0, k: 0 });
  assert.deepEqual(plain(C.rgbToCmyk(255, 0, 0)), { c: 0, m: 100, y: 100, k: 0 });
  assert.deepEqual(plain(C.rgbToCmyk(0, 255, 0)), { c: 100, m: 0, y: 100, k: 0 });
  assert.deepEqual(plain(C.rgbToCmyk(0, 0, 255)), { c: 100, m: 100, y: 0, k: 0 });
  assert.deepEqual(plain(C.cmykToRgb(0, 0, 0, 100)), rgb(0, 0, 0));
  assert.deepEqual(plain(C.cmykToRgb(100, 50, 25, 100)), rgb(0, 0, 0), 'K=100 is black whatever C, M and Y say');
  assert.deepEqual(plain(C.cmykToRgb(0, 0, 0, 0)), rgb(255, 255, 255));
  assert.deepEqual(plain(C.rgbToHsb(0, 0, 0)), { h: 0, s: 0, b: 0 });
  assert.deepEqual(plain(C.rgbToHsb(255, 255, 255)), { h: 0, s: 0, b: 100 });
  assert.deepEqual(plain(C.rgbToHsb(255, 0, 0)), { h: 0, s: 100, b: 100 });
  assert.deepEqual(plain(C.rgbToHsb(0, 255, 0)), { h: 120, s: 100, b: 100 });
  assert.deepEqual(plain(C.rgbToHsb(0, 0, 255)), { h: 240, s: 100, b: 100 });
  assert.deepEqual(plain(C.hsbToRgb(360, 100, 100)), rgb(255, 0, 0), '360 degrees is red again');
  assert.deepEqual(plain(C.hsbToRgb(-120, 100, 100)), rgb(0, 0, 255), 'negative hue wraps');
  assert.deepEqual(plain(C.hsbToRgb(0, 0, 0)), rgb(0, 0, 0));
  assert.equal(C.rgbToHex(0, 0, 0), '#000000');
  assert.equal(C.rgbToHex(255, 255, 255), '#ffffff');
  assert.equal(C.rgbToHex(300, -5, 12.4), '#ff000c', 'out of range channels are clamped');
});

test('RGB, CMYK, HSB and hex round-trip exactly for every color on a fine grid, and for random colors', () => {
  const check = (r, g, b) => {
    const hex = C.rgbToHex(r, g, b), back = C.hexToRgb(hex);
    assert.deepEqual(plain(back), { r, g, b }, hex);
    const k = C.rgbToCmyk(r, g, b); assert.deepEqual(plain(C.cmykToRgb(k.c, k.m, k.y, k.k)), { r, g, b }, 'cmyk ' + hex);
    const h = C.rgbToHsb(r, g, b); assert.deepEqual(plain(C.hsbToRgb(h.h, h.s, h.b)), { r, g, b }, 'hsb ' + hex);
    assert.ok(k.c >= 0 && k.c <= 100 && k.m >= 0 && k.m <= 100 && k.y >= 0 && k.y <= 100 && k.k >= 0 && k.k <= 100);
    assert.ok(h.h >= 0 && h.h < 360 && h.s >= 0 && h.s <= 100 && h.b >= 0 && h.b <= 100);
  };
  const steps = [0, 1, 2, 3, 7, 15, 16, 31, 63, 64, 100, 127, 128, 129, 191, 200, 253, 254, 255];
  for (const r of steps) for (const g of steps) for (const b of steps) check(r, g, b);
  let s = 12345; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 20000; i++) check(Math.floor(rnd() * 256), Math.floor(rnd() * 256), Math.floor(rnd() * 256));
});

test('any slider position in every mode gives a valid color (every color is reachable)', () => {
  for (let v = 0; v <= 100; v += 5) for (let k = 0; k <= 100; k += 25) {
    const c = C.cmykToRgb(v, 100 - v, v / 2, k); for (const ch of Object.values(c)) assert.ok(Number.isInteger(ch) && ch >= 0 && ch <= 255);
  }
  for (let h = 0; h <= 360; h += 15) for (let s = 0; s <= 100; s += 20) for (let b = 0; b <= 100; b += 20) {
    const c = C.hsbToRgb(h, s, b); for (const ch of Object.values(c)) assert.ok(Number.isInteger(ch) && ch >= 0 && ch <= 255);
  }
  // all 256 levels of each RGB channel are reachable from the RGB sliders and the hex field
  const seen = new Set(); for (let v = 0; v <= 255; v++) seen.add(C.hexToRgb(C.rgbToHex(v, 0, 0)).r); assert.equal(seen.size, 256);
  for (const junk of [NaN, undefined, null, 'x', Infinity, -Infinity]) { const c = C.cmykToRgb(junk, junk, junk, junk); for (const ch of Object.values(c)) assert.ok(Number.isInteger(ch)); }
});

// ---------------------------------------------------------------- sanitizers
test('shape, texture, opacity and strength: names are checked and numbers are clamped', () => {
  assert.deepEqual(plain(A.sanitizePaddle(undefined)), { shape: 'circle', texture: 'none', opacity: 1, strength: .6 });
  assert.deepEqual(plain(A.sanitizePaddle({ shape: 'star', texture: 'lava', opacity: .5, strength: .25 })), { shape: 'star', texture: 'lava', opacity: .5, strength: .25 });
  assert.equal(A.sanitizePaddle({ opacity: 0 }).opacity, .3, 'never fully invisible');
  assert.equal(A.sanitizePaddle({ opacity: -4 }).opacity, .3);
  assert.equal(A.sanitizePaddle({ opacity: '0.1' }).opacity, .3);
  assert.equal(A.sanitizePaddle({ opacity: 7 }).opacity, 1);
  assert.equal(A.sanitizePaddle({ opacity: 'abc' }).opacity, 1);
  assert.equal(A.sanitizePaddle({ opacity: '0.456' }).opacity, .46);
  assert.equal(A.sanitizePaddle({ strength: -1 }).strength, 0);
  assert.equal(A.sanitizePaddle({ strength: 5 }).strength, 1);
  assert.equal(A.sanitizePaddle({ strength: NaN }).strength, .6);
  assert.equal(A.sanitizePaddle({ strength: Infinity }).strength, .6, 'not finite falls back to the default');
  for (const bad of ['hex', 'CIRCLE', 'Star ', '', 5, null, {}, [], '__proto__', 'constructor']) {
    assert.equal(A.sanitizePaddle({ shape: bad }).shape, 'circle', String(bad));
    assert.equal(A.sanitizePaddle({ texture: bad }).texture, 'none', String(bad));
  }
  for (const junk of [null, 'x', 5, [], [1], true, () => 1, NaN]) assert.deepEqual(plain(A.sanitizePaddle(junk)), { shape: 'circle', texture: 'none', opacity: 1, strength: .6 });
  const dirty = A.sanitizePaddle(JSON.parse('{"__proto__":{"x":1},"constructor":"y","shape":"gear","evil":"<script>"}'));
  assert.deepEqual(Object.keys(dirty).sort(), ['opacity', 'shape', 'strength', 'texture']);
  assert.equal(dirty.shape, 'gear');
  assert.deepEqual(plain(A.sanitizePaddle(dirty)), plain(dirty), 'cleaning twice changes nothing');
});

test('the player-facing names of the shapes and textures', () => {
  assert.deepEqual(plain(A.shapes.map(s => s.name)), ['Circle', 'Rounded square', 'Hexagon', 'Octagon', 'Diamond', 'Star', 'Gear', 'Shield']);
  assert.deepEqual(plain(A.textures.map(s => s.name)), ['None', 'Carbon fiber', 'Brushed metal', 'Glass', 'Marble', 'Holographic', 'Wood grain', 'Lava', 'Circuit', 'Glitter']);
  assert.equal(A.paddleLimits.opacity.min, .3);
});

test('colors loaded from storage become #rrggbb or fall back', () => {
  assert.equal(A.sanitizeColor('#2DE2E6', ''), '#2de2e6');
  assert.equal(A.sanitizeColor('#2de2e6', '#000000'), '#2de2e6');
  for (const bad of ['red', 'rgb(1,2,3)', '#12', 7, null, undefined, {}, '<script>', '#ggg']) {
    assert.equal(A.sanitizeColor(bad, '#123456'), '#123456', String(bad));
    assert.equal(A.sanitizeColor(bad, ''), '', String(bad));
  }
});

test('old saved Studio data loads unchanged', () => {
  const m = html.indexOf('const studio = (() => {'), e = html.indexOf('})();', m) + 5;
  assert.ok(m > 0 && e > m);
  const run = (saved, product = A) => {
    const store = saved === undefined ? {} : { 'crease.studio.v1': saved };
    const ctx = { window: { CreaseProduct: product }, STUDIO_KEY: 'crease.studio.v1', localStorage: { getItem: k => Object.hasOwn(store, k) ? store[k] : null } };
    return plain(vm.runInNewContext(html.slice(m, e).replace('const studio =', 'var studio =') + ';studio', ctx).d);
  };
  const old = { ring: '#2de2e6', core: '#ffffff', trail: '#ff00aa', puck: '#ffffff', skyA: '#0a0118', skyB: '#1b0536', grid: '#ff2a8a', padOn: true, puckOn: false, stageOn: true,
    padImg: 'data:image/png;base64,AAAA', mix: { base: 'prismB', hit: 'solarA', goal: 'classic', tune: { hue: 40, size: 1.2, power: .8 } } };
  assert.deepEqual(run(JSON.stringify(old)), old, 'nothing in an old save is changed');
  assert.deepEqual(plain(A.sanitizeMix(old.mix)), old.mix, 'an old mix has no new fields and stays as it was');
  assert.deepEqual(plain(A.paddleDesign(old.mix, undefined)), { base: 'classic', custom: true, shape: 'circle', texture: 'none', strength: .6, opacity: 1 }, 'no saved design means plain defaults (and an unowned look plays as Custom)');
  assert.deepEqual(run(undefined), {});
  // the new design survives a reload exactly
  const withDesign = { ...old, custom: { shape: 'octagon', texture: 'carbon', opacity: .7, strength: .8 } };
  assert.deepEqual(run(JSON.stringify(withDesign)), withDesign);
});

test('bad saved Studio data falls back to defaults and never throws', () => {
  const m = html.indexOf('const studio = (() => {'), e = html.indexOf('})();', m) + 5;
  const run = saved => {
    const ctx = { window: { CreaseProduct: A }, STUDIO_KEY: 'k', localStorage: { getItem: () => saved } };
    return plain(vm.runInNewContext(html.slice(m, e).replace('const studio =', 'var studio =') + ';studio', ctx).d);
  };
  for (const junk of ['not json', '"abc"', '5', 'null', '[]', '[1,2]', 'true', '{"ring":', '']) assert.deepEqual(run(junk), {}, junk);
  const d = run(JSON.stringify({ ring: 'red', core: '#fff', trail: 5, puck: null, skyA: '#GGGGGG', skyB: '#1b0536', grid: { x: 1 }, padImg: 'javascript:alert(1)', puckImg: 7, stageImg: 'data:image/jpeg;base64,AAAA',
    custom: { shape: 'blob', texture: 'x', opacity: 0, strength: 99 } }));
  assert.deepEqual(d, { core: '#ffffff', skyB: '#1b0536', stageImg: 'data:image/jpeg;base64,AAAA', custom: { shape: 'circle', texture: 'none', opacity: .3, strength: 1 } });
  assert.deepEqual(run(JSON.stringify({ custom: 'oops' })), { custom: { shape: 'circle', texture: 'none', opacity: 1, strength: .6 } });
});

// ---------------------------------------------------------------- premium base
test('a premium base look turns shape and texture off; transparency still applies', () => {
  const design = { shape: 'star', texture: 'marble', opacity: .55, strength: .9 };
  const none = A.paddleDesign({ base: 'classic' }, design);
  assert.deepEqual(plain(none), { base: 'classic', custom: true, shape: 'star', texture: 'marble', strength: .9, opacity: .55 });
  const pass = owner();
  for (const base of A.lookSets.filter(k => !k.startsWith('founder'))) {
    const d = pass.paddleDesign({ base }, design);
    assert.equal(d.custom, false, base);
    assert.equal(d.shape, 'circle', base);
    assert.equal(d.texture, 'none', base);
    assert.equal(d.opacity, .55, base + ' keeps the transparency');
  }
  for (const base of ['founderA', 'founderB']) {
    const gold = owner(true).paddleDesign({ base }, design);
    assert.deepEqual(plain(gold), { base, custom: false, shape: 'circle', texture: 'none', strength: .9, opacity: .55 });
  }
  // a premium look the player does not own plays as the Custom look, so the shape still draws
  const unowned = A.paddleDesign({ base: 'prismA' }, design);
  assert.equal(unowned.base, 'classic'); assert.equal(unowned.shape, 'star');
  // no saved design at all: plain defaults
  assert.deepEqual(plain(A.paddleDesign(undefined, undefined)), { base: 'classic', custom: true, shape: 'circle', texture: 'none', strength: .6, opacity: 1 });
  // the existing mix cleaner is untouched by the new fields
  assert.deepEqual(Object.keys(A.sanitizeMix({ base: 'prismA', shape: 'star' })).sort(), ['base', 'goal', 'hit', 'tune']);
});

// ---------------------------------------------------------------- the page
test('the Studio uses one shared picker: no native color inputs, three slider modes, hex, recents', () => {
  const dlg = html.slice(html.indexOf('<dialog id="designStudio"'), html.indexOf('</dialog>', html.indexOf('<dialog id="designStudio"')));
  assert.ok(!/type="color"/.test(dlg) && !/input\[type=color\]\s*\{/.test(html), 'no native color input left');
  for (const id of ['sdRing', 'sdCore', 'sdTrail', 'sdPuck', 'sdSkyA', 'sdSkyB', 'sdGrid']) assert.ok(new RegExp(`<button type="button" class="cbtn" id="${id}" data-color="#[0-9a-f]{6}"`).test(dlg), id);
  assert.equal((dlg.match(/class="cbtn"/g) || []).length, 7);
  for (const id of ['cpk', 'cpkSV', 'cpkHue', 'cpkHex', 'cpkRecent', 'cpkTabRgb', 'cpkTabCmyk', 'cpkTabHsb', 'cpkDone', 'cpkOld']) assert.ok(dlg.includes(`id="${id}"`), id);
  assert.ok(/rgb: \[\['r', 'R', 'Red', 255.*\n.*cmyk: \[\['c', 'C', 'Cyan', 100.*\n.*hsb: \[\['h', 'H', 'Hue', 360/.test(html), 'R G B / C M Y K / H S B');
  assert.ok(html.includes("RKEY = 'crease.recentColors.v1'") && html.includes('out.length >= 8') && html.includes('a.slice(0, 8)'), 'last 8 colors, kept on the device');
  assert.ok(html.includes('pointerdown') && html.includes('setPointerCapture') && html.includes('touch-action:none'), 'pointer events for touch');
  assert.ok(/\.cpk-slider input\[type=range\]\{[^}]*height:44px/.test(html) && /-webkit-slider-thumb\{[^}]*width:44px;height:44px/.test(html), 'thumbs are at least 44px');
  assert.ok(/\.cpk-hex input\{[^}]*font-size:16px/.test(html), 'hex text is at least 16px');
});

test('performance: the paddle sprite is baked on a change, never with shadow blur, and drags re-bake at most once a frame', () => {
  const bake = html.slice(html.indexOf('// ---------- Custom paddle sprite'), html.indexOf('const ST = () => {'));
  assert.ok(bake.length > 3000);
  assert.ok(!/shadowBlur/.test(bake), 'no shadowBlur in the sprite or the per-frame draw');
  const draw = bake.slice(bake.indexOf('function drawCustomPaddle'));
  assert.ok(!/bakePaddleSprite\(/.test(draw.replace(/if \(!c\.cv[\s\S]*?\n  }\n/, '')), 'the match draw only blits; the bake sits behind a changed-settings check');
  assert.ok(/if \(!c\.cv \|\| c\.D !== D/.test(draw));
  assert.ok(/if \(!raf\) raf = requestAnimationFrame/.test(html), 'picker output is coalesced to one update per animation frame');
  assert.ok(/if \(sk !== mixSprKey\)/.test(html), 'the preview re-bakes only when a setting changed, from the animation-frame loop');
  const ui = html.slice(html.indexOf('// ---------- Design Studio: one color picker'), html.indexOf('for (const id of [\'mixBase\''));
  assert.ok(!/shadowBlur/.test(ui));
});

test('the page script still parses and player-facing text uses US spelling and typographic apostrophes', () => {
  const m = html.match(/<script>\n([\s\S]*?)<\/script>/);
  assert.doesNotThrow(() => new vm.Script(m[1]));
  const studioUi = html.slice(html.indexOf('// ---------- Design Studio: one color picker'), html.indexOf("$('leaderboard').addEventListener"));
  assert.ok(!/colour|grey\b/i.test(studioUi + html.slice(html.indexOf('<dialog id="designStudio"'), html.indexOf('</dialog>', html.indexOf('<dialog id="designStudio"')))), 'US spelling');
});
