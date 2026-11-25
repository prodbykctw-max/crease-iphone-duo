import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { srand, ridgePts, buildingPlan, treePlan, blossomPlan, poolPlan, diamondPlan, clipRidge, HORIZON, HS, ROW_Z } from '../assets/quest-diorama-pure.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('layout constants and the random generator are the phone\'s', () => {
  assert.match(html, /const SUN_R = 0\.15, HORIZON = 0\.32;/);
  assert.equal(HORIZON, .32);
  assert.match(html, /function srand\(seed\) \{ return \(\) => \{ seed = \(seed \* 16807\) % 2147483647; return \(seed - 1\) \/ 2147483646; \}; \}/);
  const r = srand(7); assert.ok(r() >= 0 && r() < 1);
});

test('ridges and buildings follow the phone\'s draw order (same seeds, same counts)', () => {
  const pts = ridgePts(21, HORIZON, HORIZON * .55, .05);
  assert.ok(pts.length > 10);
  assert.ok(pts.every(([, v]) => v <= HORIZON && v >= HORIZON - HORIZON * .55));
  const b = buildingPlan(99, HORIZON, HORIZON * .62);
  assert.ok(b.length > 15 && b.every(x => x.h > 0 && x.h <= HORIZON * .62));
  assert.ok(b.some(x => x.wins.length) && b.some(x => x.ant));
  assert.deepEqual(buildingPlan(99, HORIZON, HORIZON * .62).map(x => x.u), b.map(x => x.u), 'deterministic');
  assert.equal(buildingPlan(131, HORIZON, .1, false).every(x => x.wins.length === 0 && !x.ant), true);
});

test('plans for trees, blossoms, pools and diamonds stay in the phone\'s ranges', () => {
  assert.equal(treePlan(41, 12, HORIZON, .3, .35).length, 12);
  for (const [u, h] of treePlan(41, 12, HORIZON, .3, .35)) { assert.ok(u >= -.12 && u <= 1.12); assert.ok(h >= HORIZON * .3 && h <= HORIZON * .65); }
  for (const [u] of blossomPlan(97, 6, HORIZON)) assert.ok(u >= -.12 && u <= .58);
  assert.equal(poolPlan(77, 7, .05, .09).length, 7);
  for (const [, v, s] of diamondPlan(83, 12, HORIZON)) { assert.ok(v >= HORIZON * .55 && v <= HORIZON); assert.ok(s > 0); }
});

test('standing heights are squashed and rows sit between the crease and the player', () => {
  assert.ok(HS > 0 && HS <= .5);
  assert.ok(ROW_Z.far < ROW_Z.mid && ROW_Z.mid < ROW_Z.near && ROW_Z.near < HORIZON);
  const pts = clipRidge(ridgePts(13, HORIZON, HORIZON * .8, .09), HORIZON);
  assert.ok(pts.length > 5);
  assert.ok(pts[0][0] >= -.5 && pts[pts.length - 1][0] <= .5);
  assert.ok(pts.every(([, h]) => h <= HORIZON * .8 * HS + 1e-9));
});

test('the phone hides its flat window scene only when VR asks for the solid look', () => {
  assert.match(html, /if \(!hostF\.solid && arenas\?\.draw\(/);
  assert.match(html, /if \(!hostF\.solid\) for \(const \[k, sc2, lift/);
});
