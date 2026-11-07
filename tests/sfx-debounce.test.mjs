import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// Pull the real gate out of the shipped page so the test exercises the code that runs in the game.
function loadGate() {
  const m = src.match(/const SND_GAP = [^\n]*\nfunction sndGate\([\s\S]*?\n\}\n/);
  assert.ok(m, 'sndGate must be defined in index.html');
  const ctx = vm.createContext({});
  vm.runInContext(m[0] + '\nthis.SND_GAP = SND_GAP; this.sndGate = sndGate;', ctx);
  return ctx;
}

test('debounce window is 70-90 ms', () => {
  const {SND_GAP} = loadGate();
  assert.ok(SND_GAP >= 0.07 && SND_GAP <= 0.09, 'SND_GAP=' + SND_GAP);
});

test('a sustained contact (a hit on every 16 ms frame, or 5 substeps in one frame) is one sound', () => {
  const {sndGate} = loadGate();
  let played = 0;
  for (let f = 0; f < 63; f++) { const t = f * 0.016; for (let s = 0; s < 5; s++) if (sndGate('pad2', t)) played++; }
  assert.equal(played, 1);
});

test('no two sounds from one source are ever less than 80 ms apart, whatever the contact pattern', () => {
  const {sndGate, SND_GAP} = loadGate();
  let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const played = []; let t = 0;
  for (let i = 0; i < 4000; i++) { t += rnd() < 0.5 ? 0 : 0.016 * (1 + Math.floor(rnd() * 12)); if (sndGate('pad1', t)) played.push(t); }
  assert.ok(played.length > 20);
  for (let i = 1; i < played.length; i++) assert.ok(played[i] - played[i - 1] >= SND_GAP - 1e-9);
});

test('real separate hits (150 ms apart, or after a quiet spell of the full window) all sound', () => {
  const {sndGate} = loadGate();
  for (let i = 0; i < 10; i++) assert.equal(sndGate('pad1', i * 0.15), true, 'hit ' + i);
  assert.equal(sndGate('pad2', 5), true);
  assert.equal(sndGate('pad2', 5.09), true);
  assert.equal(sndGate('pad2', 5.1), false);
});

test('sources are independent: CPU paddle, player paddle and each wall do not mute each other', () => {
  const {sndGate} = loadGate();
  assert.equal(sndGate('pad1', 1), true);
  assert.equal(sndGate('pad2', 1.01), true);
  assert.equal(sndGate('railu1', 1.02), true);
  assert.equal(sndGate('railv-1', 1.03), true);
  assert.equal(sndGate('pad1', 1.03), false);
  assert.equal(sndGate('railu1', 1.05), false);
  assert.equal(sndGate('railv-1', 1.2), true);
});

test('a new match (game clock back to 0) is not muted by the previous match', () => {
  const {sndGate} = loadGate();
  assert.equal(sndGate('pad1', 61.0), true);
  assert.equal(sndGate('pad1', 0.02), true);
});

test('paddle, smash, bumper and rail sounds are only reachable through the gate', () => {
  assert.match(src, /if \(sndGate\('pad' \+ pd\.p, game\.t\)\) sfx\.hit\(pd\.p, k\);/);
  assert.match(src, /if \(sndGate\('smash' \+ pd\.p, game\.t\)\) sfx\.smash\(\);/);
  assert.match(src, /if \(sndGate\('bump' \+ [^\n]*\) sfx\.bump\(\);/);
  assert.match(src, /if \(sndGate\('rail' \+ [^\n]*, now\)\) sfx\.rail\(k\);/);
  assert.doesNotMatch(src, /lastWallSnd/);
  for (const name of ['hit', 'smash', 'bump', 'rail']) {
    for (const m of src.matchAll(new RegExp('(^|[^.\\w])sfx\\.' + name + '\\(', 'g'))) {
      const line = src.slice(src.lastIndexOf('\n', m.index) + 1, src.indexOf('\n', m.index));
      assert.match(line, /sndGate\(/, 'ungated sfx.' + name + ': ' + line.trim());
    }
  }
});

test('CPU strikes once then backs off: no carrying the puck on every physics step (CTW paddle is faster than the puck cap)', () => {
  // the cause: DIFF.hard.spd (2.75) > CFG.maxSpd (1.65) and the AI aims "through" the puck, so contact repeated every 1/240 s
  const spd = +src.match(/hard:\s*\{\s*spd:\s*([\d.]+)/)[1], cap = +src.match(/maxSpd:\s*([\d.]+)/)[1];
  assert.ok(spd > cap, 'premise: CTW paddle outruns the puck cap');
  // after a real CPU strike (once per approach) the paddle gets a back-off target, a short AI pause and bled-off momentum
  assert.match(src, /if \(pd\.ctrl === 'cpu' && j > 0\.5 && !\(pd\.aiRecover > 0\)\) \{\s*pd\.aiRecover = 0\.\d+; pd\.tu = pd\.u - nu \* 0\.\d+; pd\.tv = pd\.v - nv \* 0\.\d+;\s*pd\.cvu = \(pd\.cvu \|\| 0\) \* 0\.\d+; pd\.cvv = \(pd\.cvv \|\| 0\) \* 0\.\d+;/);
  assert.match(src, /function ai\(pd, dt, D\) \{\s*if \(pd\.aiRecover > 0\) \{ pd\.aiRecover -= dt; return; \}/);
  // the recovery is a beat, not a nerf: well under the CPU's own reaction window scale and never longer than a quarter second
  const rec = +src.match(/pd\.aiRecover = (0\.\d+);/)[1];
  assert.ok(rec > 0 && rec <= 0.25, 'aiRecover=' + rec);
  // difficulty table untouched
  assert.match(src, /easy:\s*\{ spd: 0\.65, react: 0\.36, err: 0\.15, aggr: 0\.35, lat: 0\.2, acc: 5 \}/);
  assert.match(src, /normal:\s*\{ spd: 1\.2, react: 0\.2, err: 0\.075, aggr: 0\.65, lat: 0\.14, acc: 9 \}/);
  assert.match(src, /hard:\s*\{ spd: 2\.75, react: 0\.08, err: 0\.03, aggr: 1\.0, lat: 0\.09, acc: 15 \}/);
});
