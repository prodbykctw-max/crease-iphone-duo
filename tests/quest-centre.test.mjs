import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ARENA_KINDS, CENTRE_STYLE, CENTRE_GLOW, FACETED, RINGED, HOVER, FADE_MIN, centreFrame, centreExtent, centreRadius, centreHeight, centreKind, sightBlocked, fadeStep, solidFragment } from '../assets/quest-centre-pure.mjs';

const engine = readFileSync(new URL('../assets/arena-engine.js', import.meta.url), 'utf8');

test('every arena world kind the phone engine knows has a style, a glow colour and a look', () => {
  const kinds = [...engine.matchAll(/\['[a-z-]+', '[^']*', '[^']*', '([a-z]+)'\]/g)].map(m => m[1]);
  assert.equal(kinds.length, 10);
  for (const k of new Set(kinds)) {
    assert.ok(k in CENTRE_STYLE, k);
    assert.ok(/^#[0-9a-f]{6}$/.test(CENTRE_GLOW[k]), k);
    assert.equal(centreKind(k), k);
  }
  assert.equal(centreKind('nope'), 'sun');
  assert.deepEqual(ARENA_KINDS, kinds, 'stage index -> kind table follows the engine\'s arena order');
  // the style numbers are the phone shader's own
  assert.match(engine, /styles=\{sun:0,core:1,crystal:2,molten:3,planet:4,gold:5,prism:6,moon:7,studio:8\}/);
  assert.deepEqual(FACETED.slice().sort(), ['crystal', 'gold', 'prism']);
  assert.deepEqual(RINGED.slice().sort(), ['core', 'planet', 'studio']);
});

test('animation numbers are the phone Centerpiece\'s (spin, tilt, breathing, ring)', () => {
  const f = centreFrame('sun', 0, 2, 0);
  assert.ok(Math.abs(f.angle - 2 * .48) < 1e-12);
  assert.ok(Math.abs(f.tilt - (.20 + Math.sin(2 * .38 + 0) * .16)) < 1e-12);
  assert.ok(Math.abs(f.bodyScale - 1.23 * (1 + Math.sin(2 * .55) * .022)) < 1e-12);
  const p = centreFrame('planet', 4, 3, .5);
  assert.equal(p.ringed, true);
  assert.ok(Math.abs(p.bodyScale - .82 * (1 + Math.sin(3 * .55 + 4) * .022 + .5 * .045)) < 1e-12);
  assert.ok(Math.abs(p.ringAngle - 3 * .50 * .72) < 1e-12);
  assert.ok(Math.abs(p.ringTilt - (.45 + Math.sin(3 * .18) * .13)) < 1e-12);
  assert.ok(Math.abs(p.image - .70 * (1 + Math.sin(3 * .7 + 4) * .018 + .5 * .045)) < 1e-12, 'the ringed planet is drawn a little larger');
  const c = centreFrame('crystal', 2, 1, 0);
  assert.equal(c.faceted, true);
  assert.ok(Math.abs(c.tilt - (.32 + Math.sin(.5) * .16)) < 1e-12);
  assert.ok(Math.abs(centreFrame('sun', 0, 1, 0).bob - Math.sin(.75) * .012) < 1e-12);
});

test('size: the sun is a modest planet (about 14 cm), 40% of the phone\'s relative size, and the beat swells it', () => {
  const f = centreFrame('sun', 0, 0, 0);
  const diameter = 2 * centreRadius(f);
  assert.ok(diameter > .12 && diameter < .18, 'diameter ' + diameter);
  assert.ok(centreRadius(centreFrame('sun', 0, 0, 1)) > centreRadius(f));
  // a ringed planet is a smaller ball in a wide ring
  const pl = centreFrame('planet', 4, 0, 0);
  assert.ok(centreRadius(pl) > 1.4 * pl.bodyScale * pl.unit * .8);
});

test('floating: the lowest point is a fixed gap above the table, whatever the shape', () => {
  for (const [k, i] of [['sun', 0], ['crystal', 2], ['planet', 4], ['prism', 7], ['studio', 9]]) {
    const f = centreFrame(k, i, 1.3, 0);
    const lowest = centreHeight(f) - centreExtent(f) * f.unit;
    assert.ok(Math.abs(lowest - (HOVER + f.bob)) < 1e-12, k);
    assert.ok(centreHeight(f) > HOVER);
  }
});

test('sight line: blocked only when the object is between the eye and the point', () => {
  // eye 60 cm up and 1 m back, puck at the table centre, ball of radius .2 between them
  assert.equal(sightBlocked(0, .6, 1, 0, 0, 0, 0, .3, .3, .2), true);
  assert.equal(sightBlocked(0, .6, 1, 0, 0, 0, .5, .3, .3, .2), false, 'off to the side');
  assert.equal(sightBlocked(0, .6, 1, 0, 0, 0, 0, .3, -1, .2), false, 'behind the point');
  assert.equal(sightBlocked(0, .6, 1, 0, 0, 0, 0, .3, 2, .2), false, 'behind the eye');
  assert.equal(sightBlocked(0, 1, 0, 0, 1, 0, 0, 1, 0, .5), false, 'zero-length line');
});

test('fade: frame-rate independent approach, never overshoots', () => {
  let a = 1;
  for (let i = 0; i < 12; i++) a = fadeStep(a, FADE_MIN, 1 / 72);
  let b = 1;
  for (let i = 0; i < 6; i++) b = fadeStep(b, FADE_MIN, 1 / 36);
  assert.ok(Math.abs(a - b) < 1e-9);
  assert.ok(a > FADE_MIN && a < 1);
  assert.equal(fadeStep(.5, .5, .1), .5);
  assert.ok(Math.abs(fadeStep(.2, 1, 10) - 1) < 1e-3);
  assert.equal(fadeStep(.2, 1, -5), .2);
});

test('solidFragment keeps the phone shader and swaps only its fixed view direction', () => {
  const src = readFileSync(new URL('../assets/arena-engine.js', import.meta.url), 'utf8');
  const frag = src.slice(src.indexOf('const fragment = `') + 18, src.indexOf('class Centerpiece')).split('`;')[0];
  assert.ok(frag.includes('void main(){') && frag.includes('abs(n.z)') && frag.includes('vec3(0.,0.,1.))'));
  const out = solidFragment(frag);
  assert.ok(!out.includes('abs(n.z)') && !out.includes('reflect(-light,n),vec3(0.,0.,1.))'));
  assert.ok(out.includes('void shade(){') && out.includes('void main(){ shade();'));
  assert.ok(out.includes('varying vec3 V;') && out.includes('uniform float alpha;'));
  assert.equal((out.match(/void main\(\)/g) || []).length, 1);
  // the noise, bands and styles are untouched
  for (const needle of ['float turbulence', 'texturedSun', 'style==6.', 'sweep']) assert.ok(out.includes(needle), needle);
});
