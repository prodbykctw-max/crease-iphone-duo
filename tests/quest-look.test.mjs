import test from 'node:test';
import assert from 'node:assert/strict';
import {FIELD_PX,FIELD_MARGIN,fieldTextureSize,fieldPlaneSize,newQuality,qualityStep,FOVEATION_STEPS,FOVEATION,XR_SCALE,paddleRingColour,puckTintKey,railPlan,railCorners,handBones,palmFan,JOINT_NAMES,FINGERTIPS} from '../assets/quest-look-pure.mjs';

test('field texture: about 1024 px across the table width plus a small rail-glow margin, matching the 1.06 x 1.86 m table body', () => {
  const s = fieldTextureSize();
  assert.equal(s.w, Math.round((1 + 2 * FIELD_MARGIN) * FIELD_PX));
  assert.equal(s.h, Math.round((1.8 + 2 * FIELD_MARGIN) * FIELD_PX));
  assert.ok(FIELD_PX >= 1000 && FIELD_PX <= 1100);
  const p = fieldPlaneSize();
  assert.ok(Math.abs(p.w - 1.06) < 1e-9 && Math.abs(p.d - 1.86) < 1e-9);
  // the plane and the texture have the same aspect, so the art is never stretched
  assert.ok(Math.abs(s.w / s.h - p.w / p.d) < 2e-3);
  assert.deepEqual(fieldTextureSize(512), { w: Math.round(1.06 * 512), h: Math.round(1.86 * 512) });
});

test('render quality: low foveation and a larger eye buffer by default', () => {
  assert.ok(FOVEATION >= .2 && FOVEATION <= .3);
  assert.ok(XR_SCALE >= 1.2 && XR_SCALE <= 1.4);
  assert.equal(FOVEATION_STEPS[0], FOVEATION);
});

test('quality controller: sustained slow frames raise foveation, then halve the field refresh; headroom brings it back', () => {
  const q = newQuality(), target = 1000 / 72;
  let r;
  for (let i = 0; i < 89; i++) r = qualityStep(q, target * 2, target, 3);
  assert.equal(r.foveation, FOVEATION_STEPS[0], 'not yet: needs 90 slow frames');
  r = qualityStep(q, target * 2, target, 3);
  assert.equal(r.foveation, FOVEATION_STEPS[1]);
  for (let i = 0; i < 90 * 3; i++) r = qualityStep(q, target * 2, target, 3);
  assert.equal(r.foveation, 1);
  for (let i = 0; i < 90; i++) r = qualityStep(q, target * 2, target, 3);
  assert.equal(r.fieldEvery, 2);
  for (let i = 0; i < 600; i++) r = qualityStep(q, target * .9, target, 3);
  assert.equal(r.fieldEvery, 1);
  for (let i = 0; i < 600 * 3; i++) r = qualityStep(q, target * .9, target, 3);
  assert.equal(r.foveation, FOVEATION_STEPS[0]);
});

test('quality controller: one slow frame, or frames near the target, change nothing', () => {
  const q = newQuality(), t = 13.9;
  let r = qualityStep(q, 80, t);
  for (let i = 0; i < 500; i++) r = qualityStep(q, t * 1.15, t);
  assert.equal(r.foveation, FOVEATION_STEPS[0]);
  assert.equal(r.fieldEvery, 1);
});

test('paddle ring colour: BIG gold wins, then Fire Mode orange, otherwise the equipped Garage ring', () => {
  const look = { ring: '#ffc44d' };
  assert.equal(paddleRingColour(look, true, true), '#ffd23f');
  assert.equal(paddleRingColour(look, false, true), '#ff8a1e');
  assert.equal(paddleRingColour(look, false, false), '#ffc44d');
  assert.equal(paddleRingColour(null, false, false), '#2de2e6');
  assert.equal(paddleRingColour(look, true, false, '#fff000'), '#fff000');
});

test('puck tint key is case-insensitive and defaults to white', () => {
  assert.equal(puckTintKey('#FFD23F'), '#ffd23f');
  assert.equal(puckTintKey(undefined), '#ffffff');
});

test('rails: CPU half (z < 0) is p2 pink, your half is p1 cyan, both sides and both ends, goal mouths left open', () => {
  const plan = railPlan();
  assert.equal(plan.filter(s => s.kind === 'side').length, 4);
  assert.equal(plan.filter(s => s.kind === 'end').length, 4);
  for (const s of plan) assert.equal(s.side, s.z < 0 ? 'p2' : 'p1', JSON.stringify(s));
  for (const s of plan.filter(x => x.kind === 'end')) {
    const near = Math.min(Math.abs(s.x - s.len / 2), Math.abs(s.x + s.len / 2));
    assert.ok(near >= .19 - 1e-9, 'no end rail across the goal mouth');
    assert.ok(Math.abs(s.x) + s.len / 2 <= .5 + 1e-9);
  }
  // side rails meet the corner arcs without a gap or overlap
  for (const s of plan.filter(x => x.kind === 'side')) assert.ok(Math.abs(Math.abs(s.z) + s.len / 2 - .75) < 1e-9);
  assert.equal(railCorners().length, 4);
  assert.deepEqual(railCorners().map(c => c.side).sort(), ['p1', 'p1', 'p2', 'p2']);
});

test('hand: capsule bones follow the XR joint chains, thumbs have no intermediate joint, fingertips are the five tips', () => {
  const b = handBones(), w = JOINT_NAMES.indexOf('wrist');
  assert.equal(JOINT_NAMES.length, 25);
  // thumb 4 + four fingers x 5 = 24 chain bones, plus 3 knuckle bars
  assert.equal(b.length, 24 + 3);
  assert.equal(b.filter(([a]) => a === w).length, 5, 'every finger starts at the wrist');
  for (const [a, c] of b) assert.ok(a >= 0 && c >= 0 && a !== c);
  assert.deepEqual(FINGERTIPS.map(i => JOINT_NAMES[i].endsWith('-tip')), [true, true, true, true, true]);
  const f = palmFan();
  assert.equal(f.tris.length, (f.verts.length - 2) * 3);
  assert.ok(f.verts.every(v => v >= 0));
});
