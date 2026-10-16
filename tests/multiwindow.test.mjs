import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const between = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); assert.ok(i >= 0 && j > i, 'snippet ' + a); return html.slice(i, j); };

test('split screen: tapping another app pauses a live local match and quiets the audio', () => {
  const handlers = {};
  let paused = 0, suspended = 0, resumed = 0;
  const ctx = vm.createContext({
    window: { addEventListener: (k, f) => { handlers[k] = f; } },
    document: { hidden: false },
    game: { state: 'play' }, booted: true,
    ac: { suspend() { suspended++; }, resume() { resumed++; } },
    pause() { paused++; },
  });
  vm.runInContext(between("window.addEventListener('blur'", "document.addEventListener('visibilitychange'"), ctx);
  for (const st of ['play', 'countdown', 'goal', 'fold']) { ctx.game.state = st; handlers.blur(); }
  assert.equal(paused, 4); assert.equal(suspended, 4);
  for (const st of ['paused', 'over', 'intro', 'boot']) { ctx.game.state = st; handlers.blur(); }
  assert.equal(paused, 4, 'menus, intro and finished matches are left alone');
  handlers.focus(); assert.equal(resumed, 1, 'audio wakes when the window is focused again');
});

test('background windows redraw slowly only when nothing is in play', () => {
  let focused = false;
  const ctx = vm.createContext({ document: { hasFocus: () => focused }, game: { mode: 'solo', state: 'play' } });
  vm.runInContext(between('const IDLE_STATES', 'function frame('), ctx);
  assert.equal(ctx.idleBackground(), false, 'a live match always runs at full speed');
  ctx.game.state = 'paused'; assert.equal(ctx.idleBackground(), true);
  ctx.game.mode = 'demo'; ctx.game.state = 'play'; assert.equal(ctx.idleBackground(), true, 'menu attract loop behind the menu');
  focused = true; assert.equal(ctx.idleBackground(), false, 'focused window is never throttled');
});

test('dragging a split-screen divider re-lays out at most ~10 times a second and always once at the end', () => {
  let now = 0, layouts = 0; const timers = []; let raf = null;
  const ctx = vm.createContext({
    performance: { now: () => now },
    requestAnimationFrame: f => { raf = f; return 1; }, cancelAnimationFrame: () => { raf = null; },
    setTimeout: (f, ms) => { const t = { f, at: now + ms, live: true }; timers.push(t); return t; },
    clearTimeout: t => { if (t) t.live = false; },
    layout: () => { layouts++; },
  });
  vm.runInContext(between('let rsz = 0', "window.addEventListener('resize'") + ';this.onResize=onResize;', ctx);
  const flush = () => { if (raf) { const f = raf; raf = null; f(); } for (const t of timers) if (t.live && t.at <= now) { t.live = false; t.f(); if (raf) { const f = raf; raf = null; f(); } } };
  // one resize event per 16 ms frame for one second
  for (let i = 0; i < 60; i++) { ctx.onResize(); flush(); now += 16; flush(); }
  assert.ok(layouts >= 8 && layouts <= 12, 'throttled during the drag: ' + layouts);
  const during = layouts; now += 200; flush();
  assert.equal(layouts, during + 1, 'one final layout at the settled size');
  // a single rotation / fold applies immediately
  now += 1000; layouts = 0; ctx.onResize(); flush(); assert.equal(layouts, 1);
});
