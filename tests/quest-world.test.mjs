import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORLD_LIMITS, WORLD_ARENAS, worldFor, worldAllowed, worldDetail, texBytes, MB, sumBudget, withinLimits, panoScale, waterDistance, panoPoint, panoUV, decodeRho,
  EXTRA_V, buildRelief, ISLAND, TABLE_KEEP, midnightLayout, mulberry32 } from '../assets/quest-world-pure.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');
const WORLDS = Object.fromEntries(WORLD_ARENAS.map(id => [id, JSON.parse(read(`assets/worlds/${id}.json`))]));

// A minimal PNG reader (8-bit RGB, no interlace) so the baked world data can be checked without a browser. Returns RGBA bytes.
function readPng(path) {
  const b = readFileSync(path); let o = 8, w = 0, h = 0, type = 0; const idat = [];
  while (o < b.length) { const len = b.readUInt32BE(o), tag = b.toString('ascii', o + 4, o + 8), body = b.subarray(o + 8, o + 8 + len);
    if (tag === 'IHDR') { w = body.readUInt32BE(0); h = body.readUInt32BE(4); assert.equal(body[8], 8, 'bit depth'); type = body[9]; assert.equal(body[12], 0, 'interlace'); }
    if (tag === 'IDAT') idat.push(body);
    o += 12 + len; }
  assert.equal(type, 2, 'the world data is plain RGB');
  const raw = inflateSync(Buffer.concat(idat)), bpp = 3, stride = w * bpp, px = Buffer.alloc(h * stride), out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) { const a = x >= bpp ? px[y * stride + x - bpp] : 0, up = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      px[y * stride + x] = v & 255; } }
  for (let i = 0; i < w * h; i++) { out[i * 4] = px[i * 3]; out[i * 4 + 1] = px[i * 3 + 1]; out[i * 4 + 2] = px[i * 3 + 2]; out[i * 4 + 3] = 255; }
  return { w, h, data: out };
}

test('worlds: on for real GPUs, the flat plate for a software GL unless forced, and only for arenas that have one', () => {
  assert.equal(worldAllowed('', false), true);
  assert.equal(worldAllowed('', true), false, 'software GL (CI, emulators) keeps the cheap flat plate');
  assert.equal(worldAllowed('?world=1', true), true);
  assert.equal(worldAllowed('?fullfield=1&world=0', false), false);
  assert.equal(worldFor('midnight'), 'midnight');
  assert.equal(worldFor('nope'), null);
  assert.ok(WORLD_ARENAS.includes('midnight'));
});

test('worlds: the quality controller sheds the drifting extras first, then the water reflection', () => {
  assert.deepEqual(worldDetail(0), { extras: true, mirror: true });
  assert.deepEqual(worldDetail(1), { extras: true, mirror: true });
  assert.deepEqual(worldDetail(2), { extras: false, mirror: true });
  assert.deepEqual(worldDetail(3), { extras: false, mirror: false });
});

test('budget maths', () => {
  assert.equal(texBytes(1024, 1024, false), 4194304);
  assert.equal(texBytes(1024, 1024), Math.round(4194304 * 4 / 3));
  const b = sumBudget([{ draws: 10, tris: 1000, tex: 1048576 }, { draws: 5, tris: 500, tex: 1048576 }]);
  assert.deepEqual(b, { draws: 15, tris: 1500, texMB: 2 });
  assert.ok(withinLimits(b));
  assert.ok(!withinLimits({ draws: WORLD_LIMITS.draws + 1, tris: 0, texMB: 0 }));
  assert.ok(!withinLimits({ draws: 0, tris: WORLD_LIMITS.tris + 1, texMB: 0 }));
  assert.ok(!withinLimits({ draws: 0, tris: 0, texMB: WORLD_LIMITS.texMB + .1 }));
  assert.deepEqual(WORLD_LIMITS, { draws: 80, tris: 250000, texMB: 48 });
});

test('panorama mapping: the painting wraps half a turn, keeps its proportions, and maps back', () => {
  const m = WORLDS.midnight, p = [0, 0, 0], uv = [0, 0];
  assert.ok(Math.abs(panoScale(m) - Math.PI / 3) < 1e-9, 'a 3:1 plate over half a turn');
  // the middle of the painting is straight ahead, its edges are exactly left and right
  panoPoint(m, .5, m.vEye, 10, p); assert.ok(Math.abs(p[0]) < 1e-9 && Math.abs(p[1] - m.eyeH) < 1e-9 && Math.abs(p[2] + 10) < 1e-9);
  panoPoint(m, 0, m.vEye, 10, p); assert.ok(Math.abs(p[0] + 10) < 1e-9 && Math.abs(p[2]) < 1e-9);
  panoPoint(m, 1, m.vEye, 10, p); assert.ok(Math.abs(p[0] - 10) < 1e-9 && Math.abs(p[2]) < 1e-9);
  // the waterline of the painting lands on the water
  const rB = waterDistance(m, m.vBase); panoPoint(m, .3, m.vBase, rB, p); assert.ok(Math.abs(p[1] - m.waterY) < 1e-9);
  assert.ok(rB > 10 && rB < 16, 'the shore is a dozen metres away: near enough for depth, far enough for the art');
  // round trip, and the half behind the player is the mirror image
  const R = mulberry32(3);
  for (let i = 0; i < 50; i++) { const u = R(), v = R() * m.vBottom, rho = 8 + R() * 100; panoPoint(m, u, v, rho, p);
    panoUV(m, p[0], p[1] - m.eyeH, p[2], uv); assert.ok(Math.abs(uv[0] - u) < 1e-9 && Math.abs(uv[1] - v) < 1e-9);
    panoUV(m, p[0], p[1] - m.eyeH, -p[2], uv); assert.ok(Math.abs(uv[0] - u) < 1e-9 && Math.abs(uv[1] - v) < 1e-9, 'mirrored behind'); }
  assert.equal(decodeRho(m, 0), m.rFar); assert.ok(Math.abs(decodeRho(m, 65535) - m.invNear) < 1e-9); assert.equal(decodeRho(m, 1), m.rFar, 'clamped to the far shell');
});

test('midnight relief: built from the baked data, stands on the water, stays out of the pool and inside the triangle budget', () => {
  const m = WORLDS.midnight, png = readPng(join(root, 'assets/worlds/midnight.png'));
  assert.equal(png.w, m.grid[0] + 1); assert.equal(png.h, 2 * (m.grid[1] + 1));
  const hi = buildRelief(m, png.data, 1), lo = buildRelief(m, png.data, 2), rB = waterDistance(m, m.vBase);
  assert.equal(hi.cols, m.grid[0] + 1); assert.equal(hi.rows, m.grid[1] + 1 + EXTRA_V.length);
  let minR = 1e9, maxY = -1e9, minShoreY = 1e9, maxShoreY = -1e9, skyVerts = 0, sway = 0, fall = 0;
  for (let k = 0; k < hi.position.length / 3; k++) { const x = hi.position[k * 3], y = hi.position[k * 3 + 1], z = hi.position[k * 3 + 2], v = hi.uv[k * 2 + 1];
    assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)); assert.ok(z <= 1e-6, 'the baked half is ahead of the player; the shader mirrors it behind');
    if (hi.sky[k]) { skyVerts++; continue; }
    minR = Math.min(minR, Math.hypot(x, z)); maxY = Math.max(maxY, y);
    if (v >= m.vBase) { minShoreY = Math.min(minShoreY, y); maxShoreY = Math.max(maxShoreY, y); }
    if (hi.fx[k * 2] > .2) sway++; if (hi.fx[k * 2 + 1] > .5) fall++; }
  assert.ok(minR > 9 && minR < rB, `nothing of the city reaches into the pool (nearest ${minR.toFixed(2)} m)`);
  assert.ok(minShoreY > m.waterY - .02 && maxShoreY < m.waterY, 'the painted shore lies just under the water surface');
  assert.ok(maxY > 25, 'the towers rise well above the player');
  assert.ok(skyVerts > hi.sky.length * .15, 'open sky is left to the dome');
  assert.ok(sway > 50 && fall > 100, 'painted palms sway and waterfalls flow');
  // just above the waterline the city is still at the shore distance: its feet stand on the water, with no step
  const cols = hi.cols, rowAt = v => EXTRA_V.length + Math.round(v / m.vBottom * m.grid[1]);
  for (const c of [5, 60, 150, 200, 260, 340, 395]) { const k = rowAt(m.vBase - .004) * cols + c, r = Math.hypot(hi.position[k * 3], hi.position[k * 3 + 2]);
    assert.ok(Math.abs(r - rB) < 1.2, `column ${c}: the foot of the city is at the shore (${r.toFixed(2)} vs ${rB.toFixed(2)})`);
    assert.ok(Math.abs(hi.position[k * 3 + 1] - m.waterY) < .2); }
  // index sanity and budget: two full copies (ahead, behind) and two half-resolution copies (their reflections)
  for (const r of [hi, lo]) { let mx = 0; for (const i of r.index) mx = Math.max(mx, i); assert.ok(mx < r.position.length / 3); assert.equal(r.index.length % 3, 0); }
  assert.ok(hi.tris < m.grid[0] * (m.grid[1] + EXTRA_V.length) * 2, 'sky cells are dropped');
  const total = 2 * hi.tris + 2 * lo.tris;
  assert.ok(total < 170000, `relief triangles ${total}`);
  assert.ok(lo.tris < hi.tris * .3);
});

test('midnight layout: lamps and palms stand in the water, clear of the table, the island and the view down the avenue, planted four ways', () => {
  const m = WORLDS.midnight, L = midnightLayout(), rB = waterDistance(m, m.vBase);
  assert.ok(L.lamps.length >= 4 && L.palms.length >= 8);
  for (const p of [...L.lamps, ...L.palms]) {
    const dI = Math.hypot(p.x - ISLAND.x, p.z - ISLAND.z), r = Math.hypot(p.x, p.z);
    assert.ok(dI > ISLAND.r + .5, 'off the island'); assert.ok(r < rB - 1.2, 'inside the pool');
    assert.ok(!(Math.abs(p.x) < TABLE_KEEP.x && p.z > TABLE_KEEP.z0 && p.z < TABLE_KEEP.z1));
    const off = Math.abs(Math.atan2(p.x, -Math.abs(p.z))) * 180 / Math.PI; assert.ok(off > 20, 'the avenue stays open');
    // every placement has its three mirror partners
    for (const [sx, sz] of [[-1, 1], [1, -1], [-1, -1]]) assert.ok([...L.lamps, ...L.palms].some(q => Math.abs(q.x - sx * p.x) < 1e-9 && Math.abs(q.z - sz * p.z) < 1e-9));
  }
  // the table and the player are on the island
  assert.ok(Math.hypot(0 - ISLAND.x, -2.2 - ISLAND.z) < ISLAND.r && Math.hypot(.6, .6 - ISLAND.z) < ISLAND.r);
  assert.deepEqual(midnightLayout(), midnightLayout(), 'deterministic');
});

test('download budget: a world adds little to the page, and nothing until its arena is picked', () => {
  const size = p => statSync(join(root, p)).size;
  const data = size('assets/worlds/midnight.png'), mods = ['assets/quest-worlds.mjs', 'assets/quest-world-pure.mjs', 'assets/quest-world-kit.mjs', 'assets/quest-world-midnight.mjs'].map(size);
  assert.ok(data < 80 * 1024, `midnight data ${data} bytes`);
  assert.ok(data + mods.reduce((a, b) => a + b, 0) < 160 * 1024, 'modules + data');
  // the manager is the only world module loaded with the page; the kit and each arena are imported on demand
  const vr = read('assets/quest-vr.mjs'), mgr = read('assets/quest-worlds.mjs');
  assert.match(vr, /import \{createWorlds\} from '\.\/quest-worlds\.mjs'/);
  assert.ok(!/quest-world-(kit|midnight)/.test(vr));
  assert.ok(!/^import .*quest-world-(kit|midnight)/m.test(mgr), 'no static import of the heavy modules');
  assert.match(mgr, /import\('\.\/quest-world-'\+id\+'\.mjs'\)/);
  for (const id of WORLD_ARENAS) { assert.ok(existsSync(join(root, 'assets/worlds', id + '.png'))); assert.ok(existsSync(join(root, 'assets/worlds', id + '.json'))); assert.ok(existsSync(join(root, 'assets/arenas', id + '.webp'))); assert.ok(existsSync(join(root, `assets/quest-world-${id}.mjs`))); assert.match(read(`assets/quest-world-${id}.mjs`), /export async function build\(/); }
});

test('hooks in quest-vr.mjs: the world follows the arena, updates every frame, follows the quality controller, and the flat plate stays as the fallback', () => {
  const vr = read('assets/quest-vr.mjs');
  assert.match(vr, /worlds\.show\(a\.id,c,t\)/); assert.match(vr, /worlds\.update\(t\)/); assert.match(vr, /worlds\.quality\(quality\.step\)/);
  assert.match(vr, /createWorlds\(\{scene,renderer,camera,soft:softGL,search:location\.search\}\)/);
  assert.match(vr, /backdrop\.visible=true/, 'the painted plate is still set up first');
  const mgr = read('assets/quest-worlds.mjs');
  assert.match(mgr, /dispose\(\)/); assert.match(mgr, /camera\.far=farWas/);
});

test('no per-frame allocation in a world update, and no developer text in the worlds', () => {
  const mid = read('assets/quest-world-midnight.mjs'), upd = /update\(t\)\{([^\n]*)\},\n/.exec(mid);
  assert.ok(upd, 'update() found');
  assert.ok(!/\bnew\b|\[\]|\{\}|\.map\(|\.filter\(|\.slice\(|\.clone\(/.test(upd[1]), 'update() only writes uniforms and instance matrices in place');
  for (const f of ['assets/quest-worlds.mjs', 'assets/quest-world-kit.mjs', 'assets/quest-world-midnight.mjs']) assert.ok(!/fillText|console\.(log|warn|error)|alert\(/.test(read(f)), f);
});

test('every listed world: its relief is built from its baked data, keeps out of the pool, lies on the water and fits the triangle budget', () => {
  for (const id of WORLD_ARENAS) {
    const m = WORLDS[id], png = readPng(join(root, `assets/worlds/${id}.png`));
    assert.equal(png.w, m.grid[0] + 1, id); assert.equal(png.h, 2 * (m.grid[1] + 1), id);
    const hi = buildRelief(m, png.data, 1), lo = buildRelief(m, png.data, 2), rB = waterDistance(m, m.vBase);
    assert.ok(rB > 9 && rB < 18, `${id}: shore at ${rB.toFixed(1)} m`);
    let minR = 1e9;
    for (let k = 0; k < hi.position.length / 3; k++) { if (hi.sky[k]) continue; const x = hi.position[k * 3], y = hi.position[k * 3 + 1], z = hi.position[k * 3 + 2];
      assert.ok(Number.isFinite(x + y + z), id); minR = Math.min(minR, Math.hypot(x, z)); if (hi.uv[k * 2 + 1] >= m.vBase) assert.ok(y < m.waterY && y > m.waterY - .02, id); }
    assert.ok(minR > rB * .7, `${id}: nearest relief point ${minR.toFixed(2)} m`);
    const total = 2 * hi.tris + 2 * lo.tris; assert.ok(total < 215000, `${id}: relief triangles ${total}`);
    assert.ok(statSync(join(root, `assets/worlds/${id}.png`)).size < 80 * 1024, id);
  }
});

test('ice, ultraviolet, void, miami, gold rush and sakura: their props stand in the water, clear of the island, the table and the view ahead, inside the pool', async () => {
  const sets = {
    ice: [(await import('../assets/quest-world-ice.mjs')).ICE_CRYSTALS],
    ultraviolet: [(await import('../assets/quest-world-ultraviolet.mjs')).UV_ROCKS],
    void: [(await import('../assets/quest-world-void.mjs')).VOID_MONOLITHS],
    miami: [(await import('../assets/quest-world-miami.mjs')).MIAMI_PALMS, (await import('../assets/quest-world-miami.mjs')).MIAMI_BOLLARDS],
    'gold-rush': [(await import('../assets/quest-world-gold-rush.mjs')).GOLD_OBELISKS],
    sakura: [(await import('../assets/quest-world-sakura.mjs')).SAKURA_LANTERNS],
  };
  for (const [id, lists] of Object.entries(sets)) {
    assert.ok(WORLD_ARENAS.includes(id), id);
    const m = WORLDS[id], rB = waterDistance(m, m.vBase);
    for (const L of lists) { assert.ok(L.length >= 2, id);
      for (const [rad, deg] of L) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = sx * Math.sin(deg * Math.PI / 180) * rad, z = sz * -Math.cos(deg * Math.PI / 180) * rad;
        assert.ok(Math.hypot(x - ISLAND.x, z - ISLAND.z) > ISLAND.r + .4, `${id}: off the island`);
        assert.ok(rad < rB - 1.5, `${id}: inside the pool`);
        assert.ok(!(Math.abs(x) < TABLE_KEEP.x && z > TABLE_KEEP.z0 && z < TABLE_KEEP.z1), `${id}: clear of the table`);
        assert.ok(deg > 25 && deg < 155, `${id}: the view ahead and behind stays open`);
      } }
  }
});
