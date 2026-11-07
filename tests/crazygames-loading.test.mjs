// CrazyGames Lite: loadingStart / loadingStop must not wait for the "tap to boot".
// Runs the shipped host.js + loader.js and the real bridge (cut from the built game.js) against a fake
// CrazyGames SDK that records call order and timestamps. The fake requestAnimationFrame is manual, so
// "frames never run" (a background tab or an unpainted preview iframe) can be tested too.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildTarget } from '../tools/build-lite.mjs';

const dir = buildTarget('crazygames', { out: mkdtempSync(path.join(tmpdir(), 'crease-cg-')) });
const file = f => readFileSync(path.join(dir, f), 'utf8');
const game = file('assets/game.js');
const bridgeAt = game.indexOf('// ---- CREASE Lite host bridge ----');
assert.ok(bridgeAt > 0, 'bridge present in the built game');
const bridge = game.slice(bridgeAt, game.lastIndexOf('\n})();'));

const sleep = ms => new Promise(r => setTimeout(r, ms));

function page({ env = 'crazygames', initDelay = 0 } = {}) {
  const t0 = Date.now();
  const calls = [];
  const rec = n => () => { calls.push({ n, at: Date.now() - t0 }); };
  const sdk = {
    environment: env,
    init: () => sleep(initDelay).then(rec('init')),
    game: {
      settings: { muteAudio: false }, addSettingsChangeListener() {},
      loadingStart: rec('loadingStart'), loadingStop: rec('loadingStop'),
      gameplayStart: rec('gameplayStart'), gameplayStop: rec('gameplayStop'),
    },
    ad: { requestAd() {} },
  };
  const queue = [];
  const hidden = () => ({ classList: new Set(['hidden']), onclick: null, textContent: '' });
  const els = { boot: hidden(), menu: hidden() };
  els.boot.classList.contains = k => els.boot.classList.has(k);
  els.menu.classList.contains = k => els.menu.classList.has(k);
  const real = id => els[id];
  const state = { mode: 'intro', state: 'boot' };
  const doc = {
    getElementById: id => real(id) || null,
    querySelector: () => null,
    createElement: () => ({}),
    documentElement: { classList: { add() {}, remove() {} } },
    body: {
      appendChild(s) {
        setTimeout(() => {
          if (/game\.js$/.test(s.src)) {
            els.boot.classList.delete('hidden'); // the game calls showBoot() while it starts
            vm.runInContext(`(function () {
              let muted = false, master = null, booted = false, ac = null, stageIx = 0;
              const $ = id => document.getElementById(id) || { onclick: null, classList: new Set() };
              const unlockAudio = () => {}, music = { start() {} }, pause = () => {}, progress = { canPlay: () => true, state: { unlocked: [0] } };
              const refreshStageLock = () => {}, setStage = () => {};
              const game = __game;
              ${bridge}
            })();`, ctx);
          }
          s.onload && s.onload();
        }, 0);
      },
    },
  };
  const ctx = vm.createContext({
    document: doc, setTimeout, clearTimeout, Promise, console, __game: state,
    CrazyGames: { SDK: sdk },
    requestAnimationFrame: cb => { queue.push(cb); return queue.length; },
    cancelAnimationFrame() {},
  });
  ctx.window = ctx;
  const step = () => { const q = queue.splice(0); q.forEach(cb => cb(0)); };
  const run = f => vm.runInContext(file(f), ctx, { filename: f });
  return { ctx, calls, els, state, step, run, boot: () => { for (const f of ['config', 'storage', 'host']) run(`assets/lite/${f}.js`); } };
}

const names = calls => calls.map(c => c.n);

test('crazygames: loadingStart then loadingStop with no input and no animation frames', async () => {
  const p = page({ initDelay: 60 });
  p.boot();
  p.run('assets/lite/loader.js');
  await sleep(400); // no step(): frames never run, nothing is tapped
  assert.deepEqual(names(p.calls), ['init', 'loadingStart', 'loadingStop']);
  const at = n => p.calls.find(c => c.n === n).at;
  assert.ok(at('loadingStart') <= at('loadingStop'));
  assert.ok(at('loadingStop') < 3000, 'loadingStop within 3 s: ' + at('loadingStop'));
  assert.ok(!names(p.calls).includes('gameplayStart'), 'no gameplay before a match starts');
});

test('crazygames: same result when frames do run, and each call happens once', async () => {
  const p = page({ initDelay: 20 });
  p.boot();
  p.run('assets/lite/loader.js');
  for (let i = 0; i < 6; i++) { await sleep(40); p.step(); }
  assert.deepEqual(names(p.calls), ['init', 'loadingStart', 'loadingStop']);
});

test('crazygames: gameplayStart only after a match starts, gameplayStop on its end', async () => {
  const p = page();
  p.boot();
  p.run('assets/lite/loader.js');
  await sleep(100); p.step(); p.step();
  assert.deepEqual(names(p.calls), ['init', 'loadingStart', 'loadingStop']);
  p.state.mode = 'solo'; p.state.state = 'countdown'; p.els.boot.classList.add('hidden');
  p.step();
  assert.deepEqual(names(p.calls).slice(3), ['gameplayStart']);
  p.state.state = 'over'; p.step();
  assert.deepEqual(names(p.calls).slice(3), ['gameplayStart', 'gameplayStop']);
});

test('crazygames: a boot screen that shows before init resolves still calls loadingStart first', async () => {
  const p = page({ initDelay: 80 });
  p.boot();
  const host = p.ctx.CreaseLite.host;
  p.ctx.CreaseLite.setMuteSource = () => {}; // normally defined by loader.js
  host.init();
  host.onBootShown(); // boot screen up while init is still pending
  await sleep(20);
  assert.deepEqual(names(p.calls), [], 'nothing before init resolves');
  await sleep(150);
  assert.deepEqual(names(p.calls), ['init', 'loadingStart', 'loadingStop']);
  host.onMenuReady(); host.onBootShown();
  await sleep(20);
  assert.equal(names(p.calls).filter(n => n === 'loadingStop').length, 1);
});

test('crazygames: local environment also reports loading; an unknown environment reports nothing', async () => {
  const local = page({ env: 'local' });
  local.boot(); local.run('assets/lite/loader.js');
  await sleep(100);
  assert.deepEqual(names(local.calls), ['init', 'loadingStart', 'loadingStop']);
  const off = page({ env: 'disabled' });
  off.boot(); off.run('assets/lite/loader.js');
  await sleep(100);
  assert.deepEqual(names(off.calls), ['init']);
});
