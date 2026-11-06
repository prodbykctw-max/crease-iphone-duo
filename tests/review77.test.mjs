import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Fixes from the review of PR #77 (color picker, paddle shapes, textures, opacity).
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const between = (a, b, from = 0) => { const i = html.indexOf(a, from), j = html.indexOf(b, i + a.length); assert.ok(i >= 0 && j > i, a + ' .. ' + b); return html.slice(i, j); };

test('a picker drag only updates the color, its button and the small preview: no save, no stage rebuild', () => {
  const drag = between('onInput: hex => {', 'onClose: studioCommit').replace(/\/\/.*$/gm, '');
  assert.ok(!/localStorage/.test(drag), 'no localStorage write per input');
  assert.ok(!/studioSave\(|buildBg\(|sceneLayers|studioFill\(/.test(drag), 'no save, no rebuild, no full refill per input');
  assert.ok(/sdSet\(id, hex\)/.test(drag) && /studioPreview\(\)/.test(drag), 'cheap updates only');
  assert.ok(/studioArm\(\)/.test(drag), 'safety net armed');
  assert.ok(/function studioArm\(\) \{ clearTimeout\(studioTimer\); studioTimer = setTimeout\(\(\) => \{ if \(CPK\.isOpen && CPK\.pressed\) studioArm\(\); else studioCommit\(\); \}, 300\); \}/.test(html), '300 ms safety net that waits while a finger is down');
  assert.ok(/k === 'skyA' \|\| k === 'skyB' \|\| k === 'grid'/.test(drag), 'only the stage colors ask for a stage rebuild');
  const save = between('function studioSave(bg = true) {', '\n}\n');
  assert.ok(/if \(bg\) \{ sceneLayers\.key = ''; buildBg\(\); \}/.test(save), 'buildBg only when asked');
  const commit = between('function studioCommit() {', '\n}\n');
  assert.ok(/studioSave\(stage\)/.test(commit));
});

test('every way of closing the picker commits: Done, Close, Escape, backdrop, closing the Studio', () => {
  const cpk = between('const CPK = (() => {', '// ---------- Design Studio: mix and tune');
  const close = between('function close() {', '$(\'cpkDone\')', html.indexOf(cpk));
  assert.ok(/c\.onClose\(\)/.test(close), 'close() calls the commit hook');
  assert.ok(/\$\('cpkDone'\)\.addEventListener\('click', close\)/.test(cpk), 'Done');
  assert.ok(/e\.key === 'Escape'[^\n]*close\(\)/.test(cpk), 'Escape');
  assert.ok(/e\.target === root && ok\) close\(\)/.test(cpk), 'backdrop');
  assert.ok(/designStudio'\)\.addEventListener\('close', \(\) => \{[^}]*CPK\.close\(\)/.test(html), 'closing the Studio closes the picker, which commits');
  assert.ok(/addEventListener\('pagehide', studioCommit\)/.test(html), 'leaving the page saves too');
});

test('Escape closes only the picker; the backdrop needs the press to start there; multi-touch keeps one pointer', () => {
  assert.ok(/get escaping\(\) \{ return performance\.now\(\) < escUntil; \}/.test(html));
  assert.ok(/addEventListener\('cancel', e => \{ if \(CPK\.isOpen \|\| CPK\.escaping\)/.test(html), 'the dialog cancel guard also holds just after the picker closed');
  assert.ok(/root\.addEventListener\('pointerdown', e => \{ downOnBackdrop = e\.target === root; pressed = true; \}\)/.test(html));
  assert.ok(/if \(drag\) return; drag = true; dragId = e\.pointerId/.test(html), 'a second finger does not start a drag');
  assert.ok(/if \(drag && e\.pointerId === dragId\) svAt\(e\)/.test(html), 'other pointers do not move it');
  assert.ok(/if \(e\.pointerId === dragId\) \{ drag = false; dragId = null; \}/.test(html), 'other pointers cannot end it');
});

test('hardening CSS: overscroll contained, 100vh fallback before 100dvh', () => {
  const card = html.match(/\.cpk-card\{[^}]*\}/)[0];
  assert.ok(/overscroll-behavior:contain/.test(card));
  assert.ok(/max-height:100vh;max-height:100dvh/.test(card));
  assert.ok(/max-height:94vh;max-height:94dvh/.test(html));
});

test('hex field: a partial value is rejected while typing; shorthand counts only on Enter or blur', () => {
  const line = html.split('\n').find(l => l.includes('const hexSix ='));
  assert.ok(line, 'hexSix exists');
  const C = { parseHex: s => { const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(s).trim()); if (!m) return null; let h = m[1]; if (h.length === 3) h = [...h].map(c => c + c).join(''); return '#' + h.toLowerCase(); } };
  const hexSix = vm.runInNewContext('(C) => { ' + line.trim().replace(/^const hexSix =/, 'const f =') + '; return f; }')(C);
  for (const partial of ['', '#', '#a', '#ab', '#abc', 'abc', '#abcd', '#abcde', '#12345', '#abcdefg', '#ggg000', ' #abc ']) assert.equal(hexSix(partial), null, JSON.stringify(partial));
  assert.equal(hexSix('#2DE2E6'), '#2de2e6');
  assert.equal(hexSix('2de2e6'), '#2de2e6');
  assert.equal(hexSix(' #ffaa00 '), '#ffaa00');
  const input = between("hexIn.addEventListener('input'", "hexIn.addEventListener('keydown'");
  assert.ok(/hexSix\(hexIn\.value\)/.test(input) && !/C\.parseHex\(hexIn\.value\)\s*;\s*\n\s*if \(h\) \{ setHex/.test(input.split("addEventListener('blur'")[0]), 'input uses the six-digit check');
  assert.ok(/addEventListener\('blur', \(\) => \{ const h = C\.parseHex\(hexIn\.value\)/.test(html), 'blur accepts shorthand');
  assert.ok(/e\.key === 'Enter'[^\n]*C\.parseHex\(hexIn\.value\)/.test(html), 'Enter accepts shorthand');
});

test('the saturation/brightness square announces its value through a polite live region', () => {
  assert.ok(/id="cpkSVsr" class="cpk-sr" role="status" aria-live="polite"/.test(html));
  assert.ok(/'Saturation ' \+ Math\.round\(st\.s\) \+ '%, brightness ' \+ Math\.round\(st\.v\) \+ '%'/.test(html));
  assert.ok(/changed\(\); announce\(\);/.test(html) && /fromRgb\(t\.r, t\.g, t\.b, 'hsb'\); changed\(\); announce\(\);\n/.test(html));
});

// ---- the see-through premium look: scratch canvas and glow
function loadBodyAlpha() {
  const src = between('const scratchMain = { cv: null };', '\n  return {\n    hit, goal');
  const made = [], calls = { glow: [], bodies: [], draws: [] };
  const mkCtx = (name) => new Proxy({ globalAlpha: 1, globalCompositeOperation: 'source-over' }, {
    get(t, k) { if (k in t) return t[k]; return (...a) => { if (k === 'drawImage') calls.draws.push({ ctx: name, a, alpha: t.globalAlpha, op: t.globalCompositeOperation }); }; },
    set(t, k, v) { t[k] = v; return true; },
  });
  const document = { createElement: () => { let w = 0, h = 0; const cv = { get width() { return w; }, set width(v) { w = v; cv.sets.push(v); }, get height() { return h; }, set height(v) { h = v; }, sets: [], getContext: () => mkCtx('scratch') }; made.push(cv); return cv; } };
  const ctx = { document, bodies: { prismB: () => {} }, bodyKey: (id, l) => id + l, PAL: { prism: { g: '#d18cff' } }, glowS: () => 'glow', calls,
    body: (c, u, v, r, key, t, tfp, big, fire, gl, noGlow) => { calls.bodies.push({ noGlow, gl }); return true; } };
  const fn = vm.runInNewContext('(function(){' + src.replace('const scratchMain', 'var scratchMain') + '; return { bodyAlpha, scratchMain }; })()', ctx);
  return { ...fn, made, calls, mkCtx };
}

test('premium look at partial opacity: the scratch canvas only grows and draws from its used corner', () => {
  const { bodyAlpha, made, calls, mkCtx } = loadBodyAlpha();
  const main = mkCtx('main');
  const scale = 3 * 2;   // a CSS scale of 3 at dpr 2
  const radii = [20, 22, 24, 26, 28, 30, 29, 27, 25, 23, 21, 20, 22, 31, 24];   // a paddle that punches, eases and shrinks again
  let prev = 0;
  for (const r of radii) {
    assert.equal(bodyAlpha(main, 100, 100, r, 'prismB', 1, { u: 0, v: 0 }, 0, 0, 0, .8, scale), true);
    assert.equal(made.length, 1, 'one canvas, ever');
    const w = made[0].width; assert.ok(w >= prev, 'never shrinks'); assert.equal(w % 64, 0, 'grows in 64 px steps'); prev = w;
  }
  const sets = made[0].sets;
  assert.ok(sets.length <= 3, 'a handful of reallocations in the whole run, not one per frame: ' + sets.join(','));
  assert.deepEqual([...sets], [...sets].sort((a, b) => a - b), 'sizes only go up');
  // every blit reads the n x n corner and lands in the 2.8r square
  const blits = calls.draws.filter(d => d.a.length === 9 && d.ctx === 'scratch' || d.a[0] === made[0]);
  assert.equal(blits.length, radii.length);
  blits.forEach((b, i) => { const n = Math.ceil(radii[i] * 2.8 * scale); assert.deepEqual(b.a.slice(1, 5), [0, 0, n, n]); assert.equal(b.a[7], radii[i] * 2.8); });
});

test('the mix preview has its own scratch canvas, so it never resizes the match one', () => {
  const { bodyAlpha, made, mkCtx } = loadBodyAlpha();
  const own = { cv: null };
  bodyAlpha(mkCtx('main'), 0, 0, 20, 'prismB', 1, { u: 0, v: 0 }, 0, 0, 0, .8, 6);
  const matchW = made[0].width;
  bodyAlpha(mkCtx('main'), .5, .62, .11, 'prismB', 1, { u: 0, v: 0 }, 0, 0, 0, .8, 786, own);
  assert.equal(made.length, 2); assert.equal(made[0].width, matchW, 'the match canvas was not touched'); assert.ok(own.cv === made[1]);
  assert.ok(/MIX_S, mixScr\)/.test(html) && /const mixScr = \{ cv: null \}/.test(html));
  assert.ok(/view\.s \* Math\.min\(view\.dpr, 2\)/.test(html), 'scratch scale is capped at dpr 2');
});

test('premium look at partial opacity keeps its glow: drawn on the main canvas at half the opacity, body without glow', () => {
  const { bodyAlpha, calls, mkCtx } = loadBodyAlpha();
  const main = mkCtx('main');
  for (const a of [.99, .8, .3]) {
    calls.draws.length = 0; calls.bodies.length = 0;
    bodyAlpha(main, 50, 50, 25, 'prismB', 1, { u: 0, v: 0 }, 0, 0, 0, a, 6);
    const glow = calls.draws.find(d => d.a[0] === 'glow');
    assert.ok(glow && glow.ctx === 'main', 'glow lands on the main canvas');
    assert.equal(glow.op, 'lighter'); assert.ok(Math.abs(glow.alpha - .5 * a) < 1e-9, 'glow alpha is 0.5 x opacity');
    assert.equal(glow.a[3], 25 * 2.5 * 2, 'same 2.5r reach as the plain path');
    assert.equal(calls.bodies.length, 1); assert.equal(calls.bodies[0].noGlow, true, 'the scratch body skips only the glow');
  }
  calls.bodies.length = 0; bodyAlpha(main, 50, 50, 25, 'prismB', 1, { u: 0, v: 0 }, 0, 0, 0, 1, 6);
  assert.equal(calls.bodies[0].noGlow, undefined, 'full opacity still draws its own glow');
  assert.equal(bodyAlpha(main, 0, 0, 10, 'nopeB', 0, { u: 0, v: 0 }, 0, 0, 0, .5, 6), false, 'an unknown look still returns false');
});

// ---- Custom look sprite
test('the baked Custom sprite keeps the highlight, rim arc and center dot, clipped to the shape, and is baked big enough', () => {
  const gloss = between('function padGloss(', '\nfunction bakePaddleSprite');
  assert.ok(/padShape\(x, shape, cx, cy, R\); x\.clip\(\)/.test(gloss), 'clipped to the shape');
  assert.ok(/x\.ellipse\(/.test(gloss) && /x\.arc\(cx, cy - R \* \.035, R \* \.84, ra - \.55, ra \+ \.55\)/.test(gloss) && /x\.arc\(cx - R \* \.12, cy - R \* \.12, R \* \.14/.test(gloss), 'highlight, rim arc and dot, same numbers as the plain paddle');
  const bake = between('function bakePaddleSprite(', '// In the match: draws');
  assert.ok(/if \(!o\.noGloss\) padGloss\(/.test(bake));
  const draw = between('function drawCustomPaddle(', 'const ST = () => {');
  assert.ok(/noGloss: true/.test(draw) && /padGloss\(ctx, D\.shape, pd\.u, pd\.v, pd\.r, tf\.u, tf\.v/.test(draw), 'the match draws the tilt-following gloss live');
  assert.ok(/want > c\.R/.test(draw) && /c\.R = Math\.max\(c\.R, want\)/.test(draw), 'bake radius only grows');
  const padBakeR = vm.runInNewContext('const PAD_R = 116;' + html.split('\n').find(l => l.startsWith('const padBakeR =')) + ';padBakeR');
  assert.equal(padBakeR(10), 116); assert.equal(padBakeR(117), 128); assert.equal(padBakeR(157), 192); assert.equal(padBakeR(5000), 384);
  assert.ok(!/shadowBlur/.test(bake + gloss + draw));
});

test('the Studio top preview draws the colors the match draws, at every opacity', () => {
  const pv = between('const PD = studioPaddleDesign()', "const pr = 36;");
  assert.ok(/const pc = \{ ring: d\.ring \|\| sk\.ring, core: d\.core \|\| sk\.core, trail: d\.trail \|\| sk\.trail \}/.test(pv));
  assert.ok(/ring: pc\.ring, core: pc\.core, trail: pc\.trail/.test(pv) && /disc\(W \* 0\.3, H \* 0\.55, 80, pc\.ring, pc\.core/.test(pv), 'baked and plain paths use the same colors');
  assert.ok(!/f\.ring \|\|/.test(pv), 'no separate Founder baking under 100%');
});

test('the page script still parses', () => {
  const m = html.match(/<script>\n([\s\S]*?)<\/script>/);
  assert.doesNotThrow(() => new vm.Script(m[1]));
});
