// CREASE Lite: the compact save format and what the two builds ship.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildTarget, TARGETS, audit, listFiles } from '../tools/build-lite.mjs';

const require = createRequire(import.meta.url);
const S = require('../tools/lite/storage.js');
const { create, catalog } = require('../assets/progression.js');

const METRICS = ['matches', 'wins', 'losses', 'goals', 'conceded', 'hits', 'smashes', 'smashGoals', 'bankGoals', 'rails', 'powerups', 'shutouts', 'comebacks'];

function fullProgress() {
  const earned = {};
  for (const a of catalog) earned[a.id] = Date.now();
  return {
    stages: Array.from({ length: 10 }, () => Object.fromEntries(METRICS.map(m => [m, 1989]))),
    earned, unlocked: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], streak: 12, previous: 'win',
  };
}

test('memory storage behaves like Storage and reports changes', () => {
  const seen = [];
  const s = S.createMemoryStorage(k => seen.push(k));
  assert.equal(s.getItem('a'), null);
  s.setItem('a', 1); s.setItem('a', 1); s.setItem('b', 'x');
  assert.equal(s.getItem('a'), '1');
  assert.equal(s.length, 2);
  assert.deepEqual([s.key(0), s.key(1), s.key(2)], ['a', 'b', null]);
  s.removeItem('a');
  assert.deepEqual(seen, ['a', 'b', 'a']);
  s.setItem('crease.metrics.v1', '{}');
  assert.deepEqual(seen, ['a', 'b', 'a'], 'analytics counters never trigger a cloud save');
  s.clear();
  assert.equal(s.length, 0);
});

test('a save with every achievement, every arena and a full record list stays far below 64 KiB', () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({ name: 'Player 1', wins: i, streak: i, achievements: 1989, stage: 9, at: Date.now() }));
  const entries = [
    ['crease.progress.v1', JSON.stringify(fullProgress())],
    ['crease.leaderboard.v1', JSON.stringify(rows)],
    ['crease.stage', '9'], ['crease.daily.v1', JSON.stringify({ last: { day: '2026-10-30', no: 24, a: 7, b: 3, win: true, goals: '1121211', rally: 14, streak: 5 }, best: 5 })],
    ['crease.metrics.v1', '{"visit":999}'],
  ];
  const raw = entries[0][1].length;
  const blob = S.pack(entries, catalog);
  assert.ok(raw > 60000, 'the unpacked progress alone is ' + raw + ' bytes');
  assert.ok(blob.length < 65536, 'packed save is ' + blob.length + ' bytes');
  assert.ok(blob.length < 20000, 'packed save is ' + blob.length + ' bytes (budget 20 KB)');
  assert.ok(!blob.includes('visit'));
});

test('pack then unpack restores progress exactly, including derived achievements', () => {
  const store = { v: null };
  const p = create({ getItem: () => store.v, setItem: (k, v) => { store.v = v; } }, () => {});
  p.begin({ mode: 'solo', stage: 0, difficulty: 'normal' });
  for (let i = 0; i < 7; i++) p.goal({ scorer: 1, lastTouch: 1 });
  const original = JSON.parse(store.v);
  assert.ok(Object.keys(original.earned).length > 5);
  const blob = S.pack([['crease.progress.v1', store.v]], catalog);
  const back = S.unpack(blob, catalog);
  const restored = JSON.parse(back['crease.progress.v1']);
  assert.deepEqual(Object.keys(restored.earned).sort(), Object.keys(original.earned).sort());
  assert.deepEqual(restored.stages, original.stages);
  assert.deepEqual(restored.unlocked, original.unlocked);
  assert.equal(restored.streak, original.streak);
  const again = create({ getItem: () => back['crease.progress.v1'], setItem() {} }, () => {});
  assert.equal(again.state.stages[0].wins, 1);
  assert.ok(again.state.earned.winner !== undefined);
});

test('unpack never throws and treats empty or foreign data as no save', () => {
  for (const bad of [undefined, null, '', 'not json', '[]', '{"v":9}', '{"v":1,"k":{"x":5,"crease.progress.v1":7}}', '{"v":99,"k":{"crease.stage":"4","new.key":"1"}}']) {
    assert.doesNotThrow(() => S.unpack(bad, catalog));
  }
  assert.deepEqual(S.unpack('', catalog), {});
  assert.deepEqual(S.unpack('{"v":99,"k":{"crease.stage":"4","new.key":"1"}}', catalog), { 'crease.stage': '4', 'new.key': '1' });
});

// ---------- the builds ----------
const out = mkdtempSync(path.join(tmpdir(), 'crease-lite-'));
const text = dir => Object.fromEntries(listFiles(dir).filter(f => /\.(html|js|css|svg)$/.test(f.file)).map(f => [f.file, readFileSync(path.join(dir, f.file), 'utf8')]));

for (const name of Object.keys(TARGETS)) {
  test(`${name}: strips online, premium, analytics, links, manifest and share code`, () => {
    const dir = buildTarget(name, { out });
    const files = listFiles(dir).map(f => f.file);
    for (const gone of ['online.html', 'online-config.js', 'analytics.js', 'analytics-config.js', 'manifest.webmanifest', 'vr.html', 'assets/monetization.js', 'assets/vendor/three.module.min.js', 'assets/quest-vr.mjs']) assert.ok(!files.includes(gone), gone);
    assert.ok(!files.some(f => /(^|\/)(sw|service-worker)[^/]*\.js$/.test(f)));
    const all = text(dir);
    const joined = Object.values(all).join('\n').replace(/^\s*\/\/.*$/gm, '');
    // (isPremium() calls remain as dead false branches of the unchanged game code; no player-facing wording does)
    for (const re of [/instagram\.com/i, /Premium (Pass|Garage)|GET PREMIUM|Founder's/i, /Design studio|DESIGN STUDIO/i, /commerce-config|crease-license|lemon ?squeezy|redeemKey|takeKeyFromUrl|#pass=|premiumCheckout|premiumKey/i, /bPremium/, /fetch\(/, /WebSocket/, /sendBeacon/, /XMLHttpRequest/, /navigator\.serviceWorker/, /navigator\.clipboard/, /navigator\.share/, /manifest\.webmanifest/, /online\.html/, /vr\.html/, /privacy\//, /terms\//, /mailto:/, /prodbykctw@/i, /googleapis|gstatic|cdn\./]) {
      assert.ok(!re.test(joined), `${name} still contains ${re}`);
    }
    // the only absolute URLs are the SDK tag, its CSP entry and the SVG namespace
    const urls = [...new Set([...joined.matchAll(/https?:\/\/[^\s"'<>);]+/g)].map(m => m[0]))].sort();
    const allowed = { youtube: ['https://www.youtube.com/game_api/v1', 'http://www.w3.org/2000/svg'], crazygames: ['https://sdk.crazygames.com/crazygames-sdk-v3.js', 'http://www.w3.org/2000/svg'], itch: ['http://www.w3.org/2000/svg'] }[name];
    assert.deepEqual(urls.filter(u => !u.startsWith('http://www.w3.org/')), allowed.filter(u => !u.startsWith('http://www.w3.org/')));
    assert.ok(!/<a [^>]*href="(https?:|mailto:)/.test(joined), 'no outbound anchors');
  });

  test(`${name}: keeps solo, local two-player, all ten arenas, intro and the logo`, () => {
    const dir = buildTarget(name, { out });
    const html = readFileSync(path.join(dir, 'index.html'), 'utf8');
    for (const id of ['bSolo', 'bDuo', 'bDaily', 'stagePrev', 'stageNext', 'bArenas', 'bAchievements', 'bLeaderboard', 'bIntro', 'bHow', 'boot', 'studio', 'liteLoad']) assert.ok(html.includes(`id="${id}"`), id);
    const files = listFiles(dir).map(f => f.file);
    assert.equal(files.filter(f => /^assets\/arenas\/.+\.webp$/.test(f)).length, 20);
    for (const f of ['assets/kctw_logo.webp', 'assets/crease-wordmark.svg', 'assets/game.js']) assert.ok(files.includes(f), f);
    const game = readFileSync(path.join(dir, 'assets/game.js'), 'utf8');
    assert.ok(game.includes('function playIntro()') && game.includes('INTRO_END'));
  });

  test(`${name}: file names, paths, counts and sizes satisfy the host's published limits`, () => {
    const dir = buildTarget(name, { out });
    const files = listFiles(dir);
    for (const f of files) {
      assert.match(f.file, /^[A-Za-z0-9_\-./]+$/, 'file name characters: ' + f.file);
      assert.ok(f.bytes < 30 * 1024 * 1024);
    }
    const total = files.reduce((s, f) => s + f.bytes, 0);
    // YouTube: 8000 files / 15 MB initial; CrazyGames: 1500 files / 50 MB; itch.io: 1000 files, 500 MB extracted,
    // 200 MB per file, paths under 240 characters (https://itch.io/docs/creators/html5).
    assert.ok(files.length <= ({ youtube: 8000, crazygames: 1500, itch: 1000 })[name]);
    assert.ok(total < ({ youtube: 15, crazygames: 50, itch: 500 })[name] * 1024 * 1024, 'initial download ' + total);
    for (const f of files) assert.ok(f.file.length < 240, 'path length: ' + f.file);
    const html = readFileSync(path.join(dir, 'index.html'), 'utf8');
    assert.ok(!/(src|href)="\//.test(html), 'no absolute paths');
    if (name === 'youtube') {
      const g = readFileSync(path.join(dir, 'assets/game.js'), 'utf8');
      assert.ok(!/visibilitychange|document\.hidden|visibilityState|navigator\.vibrate|navigator\.languages?\b/.test(g + html));
      assert.match(html, /<script src="https:\/\/www\.youtube\.com\/game_api\/v1"><\/script>\s*<style>/, 'SDK tag precedes every game script');
      assert.match(html, /Content-Security-Policy/);
    }
    if (name === 'itch') {
      // nothing is loaded from outside the ZIP, there are no ads, and the strict CSP blocks anything else
      assert.ok(!/<script src="https?:/.test(html), 'no outside script');
      assert.match(html, /Content-Security-Policy" content="default-src 'none'; script-src 'self';/);
      const cfg = readFileSync(path.join(dir, 'assets/lite/config.js'), 'utf8');
      assert.match(cfg, /"target":"itch"/); assert.match(cfg, /"ads":false/); assert.match(cfg, /"rewarded":false/);
      assert.match(readFileSync(path.join(dir, 'assets/lite/host.js'), 'utf8'), /name: 'itch'/);
    }
  });
}

test('itch: --rewarded never turns ads on for the itch build', () => {
  const dir = buildTarget('itch', { out, rewarded: true });
  const cfg = readFileSync(path.join(dir, 'assets/lite/config.js'), 'utf8');
  assert.match(cfg, /"ads":false/); assert.match(cfg, /"rewarded":false/);
});

test('audit finds only documented hits', () => {
  const dir = buildTarget('youtube', { out });
  const labels = audit(dir).map(h => h.label);
  assert.deepEqual([...new Set(labels)].sort(), ['http://', 'https://']);
});
