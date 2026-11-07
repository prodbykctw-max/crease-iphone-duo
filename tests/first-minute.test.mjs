import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const between = (a, b) => html.slice(html.indexOf(a), html.indexOf(b, html.indexOf(a)));

// ---- skip: armed from the boot tap, through the logo and the cutscene ----
function skipHarness(state, booting) {
  const calls = [];
  const src = between('let skipArmEvt = null;', "$('studio').addEventListener('pointerdown'");
  const ctx = vm.createContext({
    game: { state, mode: 'intro' }, booting, booted: true, studioTimers: [setTimeout(() => {}, 1)],
    show: (id, on) => calls.push(['show', id, on]), splashClass: n => calls.push(['splash', n]),
    unlockAudio: () => calls.push(['unlock']), music: { start: () => calls.push(['music']) },
    endIntro: () => calls.push(['endIntro']), $: () => ({ classList: { remove() {} } }), clearTimeout,
  });
  vm.runInContext(src + '\nthis.skipIntro = skipIntro; this.arm = e => { skipArmEvt = e; };', ctx);
  return { ctx, calls };
}

test('skip is armed during the boot sequence, the logo splash and the cutscene', () => {
  for (const [state, booting] of [['boot', true], ['studio', true], ['intro', true], ['studio', false]]) {
    const { ctx, calls } = skipHarness(state, booting);
    assert.equal(ctx.skipIntro({}), true, `${state} skips`);
    assert.ok(calls.some(c => c[0] === 'endIntro'), `${state} goes through endIntro (menu fade-in and tap guard)`);
    assert.equal(ctx.game.mode, 'intro');
  }
});

test('skip does nothing before the boot tap, in the menu or in a match, and ignores the boot tap itself', () => {
  for (const [state, booting] of [['boot', false], ['play', true], ['countdown', true], ['paused', true], ['over', true]]) {
    const { ctx, calls } = skipHarness(state, booting);
    assert.equal(ctx.skipIntro({}), false, `${state}/${booting}`);
    assert.equal(calls.length, 0);
  }
  const { ctx } = skipHarness('boot', true);
  const evt = {}; ctx.arm(evt);
  assert.equal(ctx.skipIntro(evt), false, 'the event that started the boot must not also skip');
  assert.equal(ctx.skipIntro({}), true, 'the next one does');
});

test('skip wiring: any pointer press or key press anywhere, repeats ignored, tap guard on the menu kept', () => {
  assert.match(html, /window\.addEventListener\('pointerdown', e => \{ skipIntro\(e\); \}, true\)/);
  assert.match(html, /window\.addEventListener\('keydown', e => \{ if \(e\.repeat\) return; if \(game\.state === 'boot' && !booting\) \{ boot\(e\); return; \} if \(skipIntro\(e\)\) return;/);
  assert.match(html, /function boot\(evt\) \{[^}]*?\n  booting = true; unlockAudio\(\); booted = true;\n  skipArmEvt = evt \|\| null; setSkipHint\(true\);/);
  const end = between('function endIntro()', 'function rallyPos');
  assert.match(end, /m\.style\.pointerEvents = 'none'; setTimeout\(\(\) => \{ m\.style\.pointerEvents = ''; \}, 450\);/);
  assert.match(end, /setSkipHint\(false\)/);
});

test('skip hint: 15 px, from the start of the splash, CLICK TO SKIP on desktop pointers, not drawn at 11 px any more', () => {
  assert.match(html, /#skipHint\{[^}]*font:700 15px/);
  assert.match(html, /<div id="skipHint" aria-hidden="true">TAP TO SKIP<\/div>/);
  assert.match(html, /matchMedia\('\(hover:hover\) and \(pointer:fine\)'\)/);
  assert.match(html, /finePointer\(\) \? 'CLICK TO SKIP' : 'TAP TO SKIP'/);
  assert.doesNotMatch(html, /stext\('TAP TO SKIP'/);
  assert.match(html, /@media \(prefers-reduced-motion:reduce\)\{#skipHint\{transition:none\}\}/);
  const t = ms => { const m = html.match(/function playIntro\(\) \{[\s\S]*?\n\}/)[0]; return m.includes('setSkipHint(true)'); };
  assert.ok(t(), 'replaying the intro from the menu shows the hint too');
});

// ---- coach ----
function coachHarness({ stored = null, fine = false, mode = 'solo', throwing = false } = {}) {
  const writes = [];
  const ls = throwing
    ? { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }
    : { getItem: k => (k === 'crease.coach.v1' ? stored : null), setItem: (k, v) => writes.push([k, v]) };
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  const ctx = vm.createContext({
    localStorage: ls, clamp, matchMedia: () => ({ matches: false }),
    game: { mode, state: 'countdown', paddles: [{ u: 0.5, v: 1.6, tu: 0.5, tv: 1.6 }, { u: 0.5, v: 0.2, tu: 0.5, tv: 0.2 }] },
    finePointer: () => fine,
  });
  vm.runInContext(between('const storage = {', 'let achievementBatch') + between('const COACH_KEY', 'function drawCoach') + '\nthis.coach = coach; this.coachBegin = coachBegin; this.coachTick = coachTick; this.coachAlpha = coachAlpha; this.coachCopy = coachCopy; this.COACH_COPY = COACH_COPY;', ctx);
  return { ctx, writes };
}

test('coach copy exists for touch and for desktop, and matches how the mouse really steers', () => {
  const { ctx } = coachHarness();
  assert.equal(ctx.COACH_COPY.touch, 'Drag your paddle · Hit the puck into the other goal · First to 7 wins');
  assert.equal(ctx.coachCopy('solo', false), ctx.COACH_COPY.touch);
  assert.equal(ctx.coachCopy('duo', false), ctx.COACH_COPY.touch);
  assert.match(ctx.coachCopy('solo', true), /^Move your mouse to steer your paddle · Hit the puck into the other goal · First to 7 wins$/);
  assert.match(ctx.coachCopy('duo', true), /^Hold the mouse button to steer your paddle · /);
  // the code the copy describes: solo hover steers without a press; 2 players needs a press (ptrs from pointerdown)
  assert.match(html, /e\.pointerType === 'mouse' && game\.mode === 'solo'\) pd = game\.paddles\[0\]; \/\/ desktop hover control/);
  for (const s of Object.values(ctx.COACH_COPY)) assert.doesNotMatch(s, /debug|todo|\bqa\b/i);
});

test('coach: shown once per device, flag written once, storage failures never throw', () => {
  const a = coachHarness();
  a.ctx.coachBegin();
  assert.equal(a.ctx.coach.on, true);
  assert.deepEqual(a.writes, [['crease.coach.v1', '1']]);
  a.ctx.coach.on = false; a.ctx.coachBegin();            // a second match in the same page load
  assert.equal(a.writes.length, 1, 'written once');
  assert.equal(a.ctx.coach.on, false);

  const b = coachHarness({ stored: '1' });                // a later visit on the same device
  b.ctx.coachBegin();
  assert.equal(b.ctx.coach.on, false);
  assert.equal(b.writes.length, 0);

  const c = coachHarness({ throwing: true });             // storage blocked: still no throw, still not repeated
  assert.doesNotThrow(() => c.ctx.coachBegin());
  assert.equal(c.ctx.coach.on, true);
  c.ctx.coach.on = false; c.ctx.coachBegin();
  assert.equal(c.ctx.coach.on, false);

  const d = coachHarness({ mode: 'demo' });               // the demo is not a real match
  d.ctx.coachBegin();
  assert.equal(d.ctx.coach.on, false);
  assert.equal(d.writes.length, 0);
  assert.match(html, /game\.dailyDone = false; coachBegin\(\); \}\nfunction toMenu\(\)/);
});

test('coach: both sides in 2 players, one side in solo; fades after the first move or 5 s', () => {
  const duo = coachHarness({ mode: 'duo' });
  duo.ctx.coachBegin();
  assert.deepEqual([...duo.ctx.coach.sides], [0, 1]);
  const solo = coachHarness();
  solo.ctx.coachBegin();
  assert.deepEqual([...solo.ctx.coach.sides], [0]);

  const g = solo.ctx.game;
  solo.ctx.coachTick(1);                                  // not moved: still fully shown
  assert.equal(solo.ctx.coachAlpha(0), 1);
  g.paddles[0].tu = 0.62;                                 // the player moves their paddle
  solo.ctx.coachTick(0.1);
  solo.ctx.coachTick(0.5);
  assert.equal(solo.ctx.coachAlpha(0), 0, 'gone shortly after the first move');
  assert.equal(solo.ctx.coach.on, false);

  const idle = coachHarness();
  idle.ctx.coachBegin();
  for (let i = 0; i < 49; i++) idle.ctx.coachTick(0.1);   // 4.9 s
  assert.ok(idle.ctx.coachAlpha(0) > 0.9);
  for (let i = 0; i < 6; i++) idle.ctx.coachTick(0.1);    // past 5 s + fade
  assert.equal(idle.ctx.coach.on, false);

  const held = coachHarness();
  held.ctx.coachBegin(); held.ctx.game.state = 'paused';
  held.ctx.coachTick(30);
  assert.equal(held.ctx.coach.t, 0, 'time does not run while paused');
});

test('coach: reduced motion switches instead of fading; text is at least 14 px, high contrast, off the puck spot', () => {
  const { ctx } = coachHarness();
  ctx.coachBegin(); ctx.coachTick(4.8);
  assert.ok(ctx.coachAlpha(0) > 0.9);
  const r = coachHarness(); r.ctx.matchMedia = () => ({ matches: true });
  r.ctx.coachBegin(); r.ctx.coachTick(4.99);
  assert.equal(r.ctx.coachAlpha(0), 1);
  r.ctx.coachTick(0.02);
  assert.equal(r.ctx.coachAlpha(0), 0, 'no partial alpha');
  const d = between('function drawCoach()', 'function draw()');
  assert.match(d, /clamp\(Math\.round\(view\.s \* 0\.04\), 14, 16\)/);
  assert.match(d, /view\.L \* 0\.75 \+ 0\.04/, 'sits between the paddle and the centre band, not on the serve');
  assert.match(d, /wide = view\.land && game\.mode === 'solo'/, 'wide desktop table: above the paddle');
  assert.match(d, /, true\);/, 'backed by the dark pill for contrast');
  assert.match(d, /Math\.PI/, 'player 2 side is turned to face player 2');
  assert.match(html, /\n  drawCoach\(\);\n\n  \/\/ messages/);
  assert.match(html, /if \(coach\.on\) coachTick\(dt\);/);
});
