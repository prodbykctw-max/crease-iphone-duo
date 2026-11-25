// The arena window scene as a small 3D diorama on the table (VR). On the phone each player's strip of the table shows a painted world in three
// depth layers (ridges, towers, trees, cacti, shards, palms ...); here the same layout, colours and relative sizes stand on the table as real,
// lit geometry: varied towers with neon trim and flickering window grids, bridges, waterfalls, crystal clusters, stratified mesas, saguaros,
// pagodas and blossom trees, with drifting particles (embers, snow, petals, spores) and bobbing crystals. Heights are squashed (HS) so nothing
// tall blocks the puck, and a half fades when it would hide the puck or a paddle from where you stand. Visual only, as on the phone.
// Cost: 6 draw calls per half (lit body, three glow layers, wire, waterfalls), plus 1 particle call and 2 instanced calls for the bobbing shapes.
// Geometry is built once per arena and shared by both halves; nothing is allocated per frame.
import * as THREE from './vendor/three.module.min.js';
import {HORIZON as H, HS, ROW_Z, FADE_MIN, ridgePts, buildingPlan, treePlan, blossomPlan, poolPlan, diamondPlan, clipRidge, srand} from './quest-diorama-pure.mjs';
import {sightBlocked, fadeStep} from './quest-centre-pure.mjs';

const C = h => new THREE.Color(h);
const m4 = new THREE.Matrix4(), mm = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), v3 = new THREE.Vector3(), v3b = new THREE.Vector3(), s3 = new THREE.Vector3(), tmpCol = new THREE.Color(), tmpCol2 = new THREE.Color();
const clamp01 = x => Math.max(0, Math.min(1, x));
const mix = (c0, c1, k, o) => o.copy(c0).lerp(c1, clamp01(k));
// vertex colour by height: a -> b between y0 and y1
const grad = (a, b, y0, y1) => (x, y, z, o) => mix(a, b, (y - y0) / ((y1 - y0) || 1), o);

// accumulates merged, non-indexed geometry with vertex colours
class Buf {
  constructor() { this.p = []; this.n = []; this.c = []; }
  addM(g, matrix, col, fn = null) {
    const ng = g.index ? g.toNonIndexed() : g.clone();
    ng.applyMatrix4(matrix);
    const P = ng.attributes.position, N = ng.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      this.p.push(P.getX(i), P.getY(i), P.getZ(i));
      this.n.push(N ? N.getX(i) : 0, N ? N.getY(i) : 1, N ? N.getZ(i) : 0);
      if (fn) fn(P.getX(i), P.getY(i), P.getZ(i), tmpCol, i); else tmpCol.copy(col);
      this.c.push(tmpCol.r, tmpCol.g, tmpCol.b);
    }
    ng.dispose(); return this;
  }
  add(g, x, y, z, col, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, fn = null) {
    m4.compose(v3.set(x, y, z), q4.setFromEuler(e4.set(rx, ry, rz)), s3.set(sx, sy, sz));
    return this.addM(g, m4, col, fn);
  }
  tri(a, b, c, col, fn = null) {   // one double-sided triangle
    v3.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); v3b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); v3.cross(v3b).normalize();
    for (const s of [1, -1]) for (const p of (s > 0 ? [a, b, c] : [a, c, b])) {
      this.p.push(p[0], p[1], p[2]); this.n.push(v3.x * s, v3.y * s, v3.z * s);
      if (fn) fn(p[0], p[1], p[2], tmpCol, 0); else tmpCol.copy(col);
      this.c.push(tmpCol.r, tmpCol.g, tmpCol.b);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere(); return g;
  }
  get tris() { return this.p.length / 9; }
  get empty() { return this.p.length === 0; }
  clone() { const o = new Buf(); o.p = this.p.slice(); o.n = this.n.slice(); o.c = this.c.slice(); return o; }
  cat(x) { for (const k of ['p', 'n', 'c']) for (let i = 0; i < x[k].length; i++) this[k].push(x[k][i]); return this; }
}
class Lines {
  constructor() { this.p = []; this.c = []; }
  seg(a, b, col) { this.p.push(a[0], a[1], a[2], b[0], b[1], b[2]); this.c.push(col.r, col.g, col.b, col.r, col.g, col.b); }
  poly(pts, col) { for (let i = 0; i + 1 < pts.length; i++) this.seg(pts[i], pts[i + 1], col); }
  get empty() { return this.p.length === 0; }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere(); return g;
  }
}

// shared unit shapes (one each, scaled per use)
const SH = {};
function shapes() {
  if (SH.box) return SH;
  SH.box = new THREE.BoxGeometry(1, 1, 1);
  SH.cone4 = new THREE.ConeGeometry(.5, 1, 4, 1); SH.cone4.translate(0, .5, 0); SH.cone4.rotateY(Math.PI / 4);
  SH.cone6 = new THREE.ConeGeometry(.5, 1, 6, 1); SH.cone6.translate(0, .5, 0);
  SH.cone7 = new THREE.ConeGeometry(.5, 1, 7, 1); SH.cone7.translate(0, .5, 0);
  SH.cyl = new THREE.CylinderGeometry(.5, .5, 1, 8, 1); SH.cyl.translate(0, .5, 0);
  SH.cyl12 = new THREE.CylinderGeometry(.5, .5, 1, 14, 1); SH.cyl12.translate(0, .5, 0);
  SH.pris6 = new THREE.CylinderGeometry(.5, .5, 1, 6, 1); SH.pris6.translate(0, .5, 0);
  SH.sph = new THREE.SphereGeometry(.5, 10, 6);
  SH.sphHi = new THREE.SphereGeometry(.5, 32, 20);
  SH.hemi = new THREE.SphereGeometry(.5, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  SH.oct = new THREE.OctahedronGeometry(.5, 0);
  SH.ico = new THREE.IcosahedronGeometry(.5, 1);
  SH.disc = new THREE.CircleGeometry(.5, 24); SH.disc.rotateX(-Math.PI / 2);
  SH.quad = new THREE.PlaneGeometry(1, 1);
  return SH;
}

// ---- small procedural textures (canvas, built once) ----
function noiseCanvas(seed, size = 128, blur = 1.4) {
  const R = srand(seed), cv = document.createElement('canvas'); cv.width = cv.height = size; const c = cv.getContext('2d');
  const img = c.createImageData(size, size);
  for (let i = 0; i < size * size; i++) { const v = 150 + (R() * 105) | 0; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  c.putImageData(img, 0, 0);
  try { const c2 = document.createElement('canvas'); c2.width = c2.height = size; const k = c2.getContext('2d'); k.filter = `blur(${blur}px)`; k.drawImage(cv, 0, 0); k.drawImage(cv, size, 0); return c2; } catch { return cv; }
}
function makeTextures() {
  const T = {};
  T.detail = new THREE.CanvasTexture(noiseCanvas(11)); T.detail.wrapS = T.detail.wrapT = THREE.RepeatWrapping; T.detail.repeat.set(3, 3); T.detail.colorSpace = THREE.SRGBColorSpace;
  const d = document.createElement('canvas'); d.width = d.height = 64; const c = d.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  T.dot = new THREE.CanvasTexture(d); T.dot.colorSpace = THREE.SRGBColorSpace;
  const f = document.createElement('canvas'); f.width = 64; f.height = 256; const fc = f.getContext('2d'), R = srand(77);
  for (let i = 0; i < 26; i++) { const x = R() * 64, w = 1 + R() * 4, y0 = R() * 256, len = 40 + R() * 160, gr = fc.createLinearGradient(0, y0, 0, y0 + len);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, `rgba(255,255,255,${.35 + R() * .5})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    fc.fillStyle = gr; fc.fillRect(x, y0, w, len); fc.fillRect(x, y0 - 256, w, len); }
  T.fall = new THREE.CanvasTexture(f); T.fall.wrapS = T.fall.wrapT = THREE.RepeatWrapping; T.fall.colorSpace = THREE.SRGBColorSpace;
  return T;
}

// ---- builders ----
// extrude a silhouette (x, height) pairs standing on y=0, depth d centred on z
function silhouette(pts, d) {
  const sh = new THREE.Shape(); sh.moveTo(pts[0][0], 0);
  for (const p of pts) sh.lineTo(p[0], p[1]);
  sh.lineTo(pts[pts.length - 1][0], 0); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, {depth: d, bevelEnabled: false, steps: 1}); g.translate(0, 0, -d / 2); return g;
}
// a tapered stick between two points (trunks, branches, arms, spires)
function seg(b, a, c, r0, r1, col, fn = null, radial = 6) {
  v3.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); const len = v3.length(); if (len < 1e-6) return;
  const g = new THREE.CylinderGeometry(r1, r0, len, radial, 1, false);
  q4.setFromUnitVectors(v3b.set(0, 1, 0), v3.normalize());
  m4.compose(v3b.set((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2), q4, s3.set(1, 1, 1));
  b.addM(g, m4, col, fn); g.dispose();
}
function chain(b, pts, r0, r1, col, fn = null, radial = 6) { for (let i = 0; i + 1 < pts.length; i++) { const k0 = i / (pts.length - 1), k1 = (i + 1) / (pts.length - 1); seg(b, pts[i], pts[i + 1], r0 + (r1 - r0) * k0, r0 + (r1 - r0) * k1, col, fn, radial); } }
// a flat blade along a curve (fronds, petals)
function ribbon(b, pts, w0, w1, col, fn = null) {
  const n = pts.length, Lp = [], Rp = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], c = pts[Math.min(n - 1, i + 1)];
    v3.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); v3b.set(0, 1, 0); const side = v3.clone().cross(v3b);
    if (side.lengthSq() < 1e-10) side.set(1, 0, 0); side.normalize();
    const w = w0 + (w1 - w0) * i / (n - 1), p = pts[i];
    Lp.push([p[0] - side.x * w, p[1] - side.y * w, p[2] - side.z * w]); Rp.push([p[0] + side.x * w, p[1] + side.y * w, p[2] + side.z * w]);
  }
  for (let i = 0; i + 1 < n; i++) { b.tri(Lp[i], Rp[i], Rp[i + 1], col, fn); b.tri(Lp[i], Rp[i + 1], Lp[i + 1], col, fn); }
}
function ridgeMesh(S, st, seed, base, amp, step, fill, wire, z, d, hs = 1) {
  const pts = clipRidge(ridgePts(seed, base, amp, step), base).map(p => [p[0], p[1] * hs]); if (pts.length < 2) return;
  const geo = silhouette(pts, d), top = Math.max(...pts.map(p => p[1])) || .05, fc = C(fill), lit = C(fill).lerp(C(st.horizon), .05).multiplyScalar(1.5);
  S.b.add(geo, 0, 0, z, fc, 0, 0, 0, 1, 1, 1, grad(fc.clone().multiplyScalar(.7), lit, 0, top)); geo.dispose();
  if (wire !== null && wire !== undefined) { const wc = C(wire), up = pts.map(p => [p[0], p[1] + .0006]);
    S.l.poly(up.map(p => [p[0], p[1], z + d / 2 + .0004]), wc); S.l.poly(up.map(p => [p[0], p[1], z - d / 2 - .0004]), wc); }
}
function pool(S, x, z, rx, rz, col, k, bucket = 'g') { const sh = shapes(); // soft glowing patch on the ground
  S[bucket].add(sh.disc, x, .0016, z, col, 0, 0, 0, rx * 2, 1, rz * 2, (px, py, pz, o) => { const r = Math.hypot((px - x) / (rx || 1), (pz - z) / (rz || 1)) * 2; o.copy(col).multiplyScalar(k * Math.max(0, 1 - r) * Math.max(0, 1 - r)); }); }
function glowBall(S, x, y, z, r, col, k = 1, bucket = 'g') { S[bucket].add(shapes().sph, x, y, z, tmpCol2.copy(col).multiplyScalar(k), 0, 0, 0, r * 2, r * 2, r * 2); }
// a window quad on the face that looks at the player (half 0) and on the back face (half 1); 3 flicker groups by position hash
function win(S, x, y, zf, zb, st, k, w = .0034, h = .0022) {
  const grp = Math.abs(Math.floor((x * 9771 + y * 1313) * 7)) % 3; tmpCol.set(st.win[k]);
  S.w[0][grp].add(shapes().quad, x, y, zf, tmpCol, 0, 0, 0, w, h, 1);
  S.w[1][grp].add(shapes().quad, x, y, zb, tmpCol, 0, Math.PI, 0, w, h, 1);
}

// ---- towers: varied silhouettes with neon trim, window grids, spires and bridges ----
function city(S, st, plan, z, o) {
  const sh = shapes(), R = srand(o.seed || 555), fc = C(o.fill), towers = [], hs = o.hs || 1;
  const trims = o.trims.map(C);
  plan.forEach((bd, i) => {
    const x0 = bd.u - .5, x1 = x0 + bd.w; if (x1 < -.5 || x0 > .5) return;
    const cx = (Math.max(x0, -.5) + Math.min(x1, .5)) / 2, w = Math.min(x1, .5) - Math.max(x0, -.5), h = bd.h * HS * hs;
    const d = Math.min(.05, .018 + w * 1.2), type = o.types === false ? 0 : (R() * 4) | 0, trim = trims[i % trims.length], dz = d / 2;
    const body = grad(fc.clone().multiplyScalar(.5), fc.clone().lerp(C(st.wire), .06).multiplyScalar(1.6), 0, h);
    let stepY = h, wU = w, dU = d;
    if (type === 1) { stepY = h * .6; wU = w * .68; dU = d * .68; }
    // body
    if (type === 3) { S.b.add(sh.cyl12, cx, 0, z, fc, 0, 0, 0, w, h, w, body); }
    else if (type === 1) { S.b.add(sh.box, cx, stepY / 2, z, fc, 0, 0, 0, w, stepY, d, body); S.b.add(sh.box, cx, stepY + (h - stepY) / 2, z, fc, 0, 0, 0, wU, h - stepY, dU, body); }
    else S.b.add(sh.box, cx, h / 2, z, fc, 0, 0, 0, w, h, d, body);
    // roof pieces and neon trim
    const roofY = h, tw = type === 1 ? wU : w, td = type === 1 ? dU : d;
    if (type === 2) { // spire crown
      const sp = h * .55 + .02; S.b.add(sh.cone4, cx, roofY, z, fc, 0, 0, 0, tw * .75, sp, td * .75, grad(fc.clone().multiplyScalar(.6), C(st.wire), roofY, roofY + sp));
      seg(S.b, [cx, roofY + sp, z], [cx, roofY + sp + .03, z], .0012, .0003, C(st.wire).multiplyScalar(.7));
      glowBall(S, cx, roofY + sp + .031, z, .0036, C(st.p2), 1.2, 'fa');
    } else if (type === 3) { S.b.add(sh.hemi, cx, roofY, z, fc, 0, 0, 0, w, w * .55, w); }
    else { // antenna with a lamp (the phone's)
      if (bd.ant) { const ah = bd.ant * HS * hs; seg(S.b, [cx, roofY, z], [cx, roofY + ah, z], .0009, .0004, C(st.wire).multiplyScalar(.6)); glowBall(S, cx, roofY + ah, z, .0033, C(st.p2), 1.1, 'fb'); }
    }
    const top = (y, ww, dd) => { const p = [[cx - ww / 2, y, z + dd / 2], [cx + ww / 2, y, z + dd / 2], [cx + ww / 2, y, z - dd / 2], [cx - ww / 2, y, z - dd / 2], [cx - ww / 2, y, z + dd / 2]]; S.l.poly(p, trim); };
    if (type === 3) { const ring = y => { const p = []; for (let k = 0; k <= 20; k++) { const a = k / 20 * Math.PI * 2; p.push([cx + Math.cos(a) * w / 2, y, z + Math.sin(a) * w / 2]); } S.l.poly(p, trim); }; ring(h); ring(h * .5); ring(h * .2); }
    else { top(roofY, tw, td); if (type === 1) top(stepY, w, d); S.l.seg([cx - w / 2, 0, z + dz], [cx - w / 2, stepY, z + dz], trim.clone().multiplyScalar(.7)); S.l.seg([cx + w / 2, 0, z + dz], [cx + w / 2, stepY, z + dz], trim.clone().multiplyScalar(.7)); }
    // lit window grid from the phone's lottery, laid on whatever surface is there
    if (!o.nowin) for (const [wx, wy, k] of bd.wins) {
      const x = wx + .0012 - .5, y = wy * HS * hs; if (x < cx - w / 2 + .001 || x > cx + w / 2 - .0015 || y > h - .002) continue;
      const dx = x - cx; let half = dz;
      if (type === 3) { const r = w / 2; if (Math.abs(dx) > r * .8) continue; half = Math.sqrt(r * r - dx * dx); }
      else if (type === 1 && y > stepY) { if (Math.abs(dx) > wU / 2 - .002) continue; half = dU / 2; }
      win(S, x, y, z + half + .0006, z - half - .0006, st, k);
    }
    towers.push({x0: cx - w / 2, x1: cx + w / 2, h, d});
  });
  if (o.bridges) for (let i = 0; i + 1 < towers.length; i++) {
    const a = towers[i], c = towers[i + 1], gap = c.x0 - a.x1; if (gap < .004 || gap > .035 || Math.min(a.h, c.h) < .05 || R() > .4) continue;
    const y = Math.min(a.h, c.h) * (.45 + R() * .2), x = (a.x1 + c.x0) / 2;
    S.b.add(sh.box, x, y, z, fc.clone().multiplyScalar(1.4), 0, 0, 0, gap + .004, .005, .01);
    S.g.add(sh.box, x, y - .003, z, tmpCol2.copy(trims[i % trims.length]).multiplyScalar(.8), 0, 0, 0, gap, .0012, .0105);
    S.l.seg([a.x1, y + .0027, z + .0052], [c.x0, y + .0027, z + .0052], trims[(i + 1) % trims.length]);
  }
}

// ---- organic things with volume ----
function swampTree(S, st, x, z, h, seed) {
  const R = srand(seed), b = S.b, dk = C('#0b2a14'), lt = C('#1d5a2a'), gc = C(st.grid), bend = (R() - .5) * h * .5;
  const trunk = [[x, 0, z], [x + bend * .3, h * .3, z], [x + bend * .7, h * .65, z + (R() - .5) * .01], [x + bend, h, z]];
  chain(b, trunk, h * .09, h * .035, dk, grad(dk, lt, 0, h), 7);
  for (let k = 0; k < 4; k++) { const a = (k % 2 ? 1 : -1) * (.5 + R() * .7), y0 = h * (.45 + R() * .4), sx = x + bend * (y0 / h), len = h * (.3 + R() * .22);
    const e = [sx + Math.sin(a) * len, y0 + len * .7, z + (R() - .5) * .014], m = [(sx + e[0]) / 2 + (R() - .5) * .006, y0 + len * .5, z];
    chain(b, [[sx, y0, z], m, e], h * .03, h * .012, dk, null, 5);
    glowBall(S, e[0], e[1] - .004, e[2], h * .06, gc, .95, k % 2 ? 'fa' : 'fb');          // glowing hanging pod
    b.add(shapes().ico, e[0], e[1] - .004, e[2], C('#14441f'), 0, 0, 0, h * .11, h * .1, h * .11);
    ribbon(b, [[e[0], e[1] - .008, e[2]], [e[0] + .004, e[1] - h * .16, e[2]], [e[0] + .002, e[1] - h * .26, e[2]]], h * .022, h * .003, C('#1f6d34'));   // dangling moss
  }
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 + R(); seg(b, [x + Math.cos(a) * h * .16, 0, z + Math.sin(a) * h * .1], [x + Math.cos(a) * h * .03, h * .22, z], h * .02, h * .045, dk); }   // roots
}
function palm(S, st, x0, z, hgt, dir, seed) {
  const R = srand(seed), b = S.b, trunkC = C('#3a2430'), leafC = C('#0c4a44'), rim = C(st.wire).multiplyScalar(.55);
  const bend = dir * hgt * .22, pts = [[x0, 0, z], [x0 - dir * hgt * .08, hgt * .3, z], [x0 + bend * .55, hgt * .66, z], [x0 + bend, hgt, z]];
  chain(b, pts, hgt * .06, hgt * .032, trunkC, grad(C('#241420'), C('#5a3a46'), 0, hgt), 7);
  for (let k = 1; k <= 7; k++) { const y = hgt * k / 8, xx = x0 + bend * Math.pow(y / hgt, 1.7) - dir * hgt * .08 * Math.sin(y / hgt * 3.1); S.l.seg([xx - hgt * .05, y, z + hgt * .03], [xx + hgt * .05, y - hgt * .012, z + hgt * .03], rim.clone().multiplyScalar(.5)); }
  const top = pts[3];
  for (let i = 0; i < 9; i++) {
    const az = i * 2.4 + R() * .4, len = hgt * (.45 + R() * .2), lift = .18 + R() * .3, drop = .5 + R() * .35, fr = [];
    for (let k = 0; k <= 6; k++) { const t = k / 6, r = len * t; fr.push([top[0] + Math.cos(az) * r, top[1] + Math.sin(t * Math.PI * .8) * len * lift - t * t * len * drop, top[2] + Math.sin(az) * r]); }
    ribbon(b, fr, hgt * .05, hgt * .004, leafC, grad(C('#0a3a34'), C('#1a8a72'), top[1] - len * .6, top[1] + len * .2));
    S.l.poly(fr.map(p => [p[0], p[1] + .001, p[2]]), rim);
  }
  for (let k = 0; k < 3; k++) b.add(shapes().sph, top[0] + (R() - .5) * hgt * .1, top[1] - hgt * .04, top[2] + (R() - .5) * hgt * .1, C('#3b2a1a'), 0, 0, 0, hgt * .06, hgt * .06, hgt * .06);
}
function saguaro(S, st, x, z, h, seed) {
  const R = srand(seed), b = S.b, sh = shapes(), r = h * .1, rock = C('#2f5a2a'), glow = C(st.grid);
  const prof = [[0, 0], [r * .85, 0], [r, h * .06], [r * 1.04, h * .4], [r, h * .85], [r * .75, h * .97], [0, h]].map(p => new THREE.Vector2(p[0], p[1]));
  const trunk = new THREE.LatheGeometry(prof, 12); S.b.add(trunk, x, 0, z, rock, 0, 0, 0, 1, 1, 1, grad(C('#1d3d1a'), C('#4f8a3a'), 0, h)); trunk.dispose();
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; S.l.seg([x + Math.cos(a) * r * 1.02, h * .08, z + Math.sin(a) * r * 1.02], [x + Math.cos(a) * r * .74, h * .96, z + Math.sin(a) * r * .74], C('#9ad66a').multiplyScalar(.35)); }   // ribs
  const arm = (dir, y0, run, rise) => { const rr = r * .62, p = [[x + dir * r * .8, y0, z], [x + dir * (run + r * .2), y0 + rr * .6, z], [x + dir * run, y0 + rr * 1.6, z], [x + dir * run, y0 + rise, z]];
    chain(b, p, rr, rr * .9, rock, grad(C('#1d3d1a'), C('#4f8a3a'), y0, y0 + rise), 8); b.add(sh.sph, x + dir * run, y0 + rise, z, rock.clone().multiplyScalar(1.1), 0, 0, 0, rr * 1.8, rr * 1.8, rr * 1.8); glowBall(S, x + dir * run, y0 + rise + rr * .9, z, rr * .35, C('#ff6fa8'), 1, 'fa'); };
  arm(1, h * (.42 + R() * .12), h * .26, h * .27); arm(-1, h * (.3 + R() * .1), h * .22, h * .22);
  glowBall(S, x, h + r * .5, z, r * .42, C('#ff6fa8'), 1.1, 'fb');   // blossom on the crown
  S.b.add(sh.hemi, x, h * .97, z, C('#ff9ec0'), 0, 0, 0, r * 1.1, r * .8, r * 1.1);
}
function blossomTree(S, st, x, z, h, seed) {
  const R = srand(seed), b = S.b, sh = shapes(), bark = C('#2a1220');
  const bend = (R() - .5) * h * .3, trunk = [[x, 0, z], [x + bend * .4, h * .3, z], [x + bend, h * .62, z]];
  chain(b, trunk, h * .07, h * .035, bark, grad(C('#1d0a16'), C('#4a2236'), 0, h), 7);
  const cx = x + bend, cy = h * .62;
  for (let k = 0; k < 3; k++) { const a = (k - 1) * .9, e = [cx + Math.sin(a) * h * .34, cy + h * .26, z + (R() - .5) * .012]; chain(b, [[cx, cy, z], e], h * .03, h * .012, bark, null, 5); }
  for (let k = 0; k < 7; k++) { const ox = (R() - .5) * h * .85, oy = h * (.78 + R() * .32), oz = (R() - .5) * .016, s = h * (.2 + R() * .13);
    b.add(sh.ico, cx + ox, oy, z + oz, C('#e87aa8'), 0, R() * 3, 0, s * 1.15, s * .85, s * 1.15, grad(C('#a8456f'), C('#ffc2dc'), oy - s * .5, oy + s * .5));
    S.fa.add(sh.ico, cx + ox, oy, z + oz, tmpCol2.set('#ff8fbf').multiplyScalar(.12), 0, 0, 0, s * 1.4, s * 1.1, s * 1.4); }
}
function crystalCluster(S, st, x, z, h, w, seed) {
  const R = srand(seed), sh = shapes(), n = 3 + ((R() * 3) | 0), c0 = C('#0a3558'), c1 = C('#8fe6ff'), core = C(st.grid);
  for (let k = 0; k < n; k++) {
    const big = k === 0, ch = h * (big ? 1 : .42 + R() * .4), cw = w * (big ? 1 : .5 + R() * .3), ox = big ? 0 : (R() - .5) * w * 1.5, oz = big ? 0 : (R() - .5) * w * 1.2, tz = (R() - .5) * (big ? .12 : .6), tx = (R() - .5) * (big ? .12 : .5), ry = R() * 3;
    const sh1 = ch * .66, tip = ch * .34;
    m4.compose(v3.set(x + ox, 0, z + oz), q4.setFromEuler(e4.set(tx, ry, tz)), s3.set(1, 1, 1)); const base = m4.clone();
    const part = (g, y, sx, sy, o2, col, fn) => { mm.compose(v3b.set(0, y, 0), q4.identity(), s3.set(sx, sy, sx)); mm.premultiply(base); o2.addM(g, mm, col, fn); };
    part(sh.pris6, 0, cw, sh1, S.b, c0, grad(c0, c1.clone().lerp(c0, .35), 0, ch)); part(sh.cone6, sh1, cw, tip, S.b, c0, grad(c1.clone().lerp(c0, .35), c1, sh1, ch));
    part(sh.pris6, 0, cw * .62, sh1 * .98, S.fa, core.clone().multiplyScalar(.95)); part(sh.cone6, sh1, cw * .62, tip * .96, S.fa, core.clone().multiplyScalar(1.2));   // glowing core
    const P = (px, py, pz) => v3b.set(px, py, pz).applyMatrix4(base).toArray();
    for (let e = 0; e < 6; e++) { const a = e / 6 * Math.PI * 2 + Math.PI / 6, px = Math.cos(a) * cw * .5, pz = Math.sin(a) * cw * .5;
      S.l.seg(P(px, 0, pz), P(px, sh1, pz), c1.clone().multiplyScalar(.55)); S.l.seg(P(px, sh1, pz), P(0, ch, 0), C('#ffffff').multiplyScalar(.8)); }
    const tp = P(0, ch + .002, 0); S.w[0][2].add(sh.quad, tp[0], tp[1], tp[2] + .001, C('#cfeeff'), 0, 0, Math.PI / 4, .006, .006, 1); S.w[1][2].add(sh.quad, tp[0], tp[1], tp[2] - .001, C('#cfeeff'), 0, Math.PI, Math.PI / 4, .006, .006, 1);   // sparkle on the tip
  }
  pool(S, x, z, w * 2.4, w * 1.6, core, .45);
}
function strata(S, st, cx, z, wBase, mh, depth) { // a stratified mesa with a lit rim
  const sh = shapes(), cols = ['#5a2a0e', '#8a3f14', '#b45a1c', '#7a3812', '#a04e18', '#c46a24'], n = cols.length, hh = mh / n, rim = C(st.horizon);
  for (let i = 0; i < n; i++) { const inset = i * wBase * .014, w = wBase - inset * 2 - (i === n - 1 ? wBase * .04 : 0), d = depth * (1 - i * .05), y = i * hh, c = C(cols[i]);
    S.b.add(sh.box, cx, y + hh / 2, z, c, 0, 0, 0, w, hh * 1.01, d, grad(c.clone().multiplyScalar(.6), c.clone().lerp(rim, .07).multiplyScalar(1.3), y, y + hh));
    const front = z + d / 2 + .0006;
    S.l.seg([cx - w / 2, y + hh, front], [cx + w / 2, y + hh, front], C(st.sun[1]).multiplyScalar(i === n - 1 ? 1 : .35));
    if (i === n - 1) { S.l.seg([cx - w / 2, y + hh, z - d / 2 - .0006], [cx + w / 2, y + hh, z - d / 2 - .0006], C(st.sun[1]).multiplyScalar(.9));
      S.g.add(sh.box, cx + w / 2 - .003, y + hh * .5, z, tmpCol2.copy(C(st.sun[0])).multiplyScalar(.28), 0, 0, 0, .006, hh * 1.4, d * 1.02); } }   // sunset rim on the sun-facing flank
  pool(S, cx, z, wBase * .6, depth * 1.2, C(st.sun[0]), .3);
}
function roughCone(rx, rz, h, seed) { // a cone with rocky, uneven flanks
  const R = srand(seed), g = new THREE.ConeGeometry(.5, 1, 40, 9, true), P = g.attributes.position, jit = new Map();
  for (let i = 0; i < P.count; i++) { const y = P.getY(i), key = Math.round(P.getX(i) * 1e4) + ',' + Math.round(P.getZ(i) * 1e4) + ',' + Math.round(y * 1e4);
    let j = jit.get(key); if (!j) { j = [(R() - .5), (R() - .5), (R() - .5)]; jit.set(key, j); }
    const k = (.5 - y) * .9 + .05; P.setX(i, P.getX(i) * (1 + j[0] * .16 * k) + j[1] * .02 * k); P.setZ(i, P.getZ(i) * (1 + j[2] * .16 * k)); P.setY(i, y + j[1] * .015 * k); }
  g.computeVertexNormals(); g.scale(rx * 2, h, rz * 2); g.translate(0, h / 2, 0); return g;
}
function pagoda(S, st, bu, z, bh) {
  const sh = shapes(), red = C('#8c1d2c'), roof = C('#2a0c20'), gold = C('#ffcf6b'), pk = C('#ff9ec4'), tiers = 4, base = .075;
  S.b.add(sh.box, bu, .004, z, C('#3a1a2a'), 0, 0, 0, base * 1.5, .008, base * 1.5);
  for (let i = 0; i < tiers; i++) {
    const w = base * (1 - i * .16), y = .008 + bh * i / tiers, th = bh / tiers, rw = w * 1.7;
    S.b.add(sh.box, bu, y + th * .3, z, red, 0, 0, 0, w, th * .62, w, grad(C('#5a1020'), red, y, y + th * .6));
    S.l.seg([bu - w / 2, y + th * .6, z + w / 2 + .0006], [bu + w / 2, y + th * .6, z + w / 2 + .0006], gold.clone().multiplyScalar(.8));
    S.b.add(sh.cone4, bu, y + th * .55, z, roof, 0, 0, 0, rw, th * .5, rw, grad(C('#1a0614'), C('#4a1838'), y + th * .55, y + th * 1.05));
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {                       // upturned eave corners with hanging lanterns
      const ex = bu + sx * rw * .5, ez = z + sz * rw * .5; S.b.add(sh.cone7, ex, y + th * .5, ez, roof, sz * .35, 0, -sx * .35, .006, .014, .006);
      S.l.seg([ex, y + th * .5, ez], [bu, y + th * 1.02, z], pk.clone().multiplyScalar(.55)); glowBall(S, ex, y + th * .44, ez, .0055, C('#ffb347'), 1.2, i % 2 ? 'fa' : 'fb'); }
    // windows glow on the red body
    for (const sgn of [1, -1]) S.g.add(sh.box, bu, y + th * .3, z + sgn * (w / 2 + .0007), tmpCol2.set('#ffb347').multiplyScalar(.5), 0, 0, 0, w * .3, th * .28, .0012);
  }
  seg(S.b, [bu, .008 + bh, z], [bu, .008 + bh + .035, z], .002, .0005, gold); glowBall(S, bu, .008 + bh + .036, z, .0045, gold, 1.2, 'fa');
}
function torii(S, st, tu, z, th) {
  const sh = shapes(), red = C('#b3202c'), dark = C('#5a0e18');
  for (const sx of [-1, 1]) { const x = tu + sx * th * .27; S.b.add(sh.cyl, x, 0, z, red, 0, 0, -sx * .045, th * .09, th, th * .09, grad(dark, red, 0, th)); S.b.add(sh.box, x, .004, z, C('#2a1218'), 0, 0, 0, th * .16, .008, th * .16); }
  S.b.add(sh.box, tu, th * .82, z, red, 0, 0, 0, th * .7, th * .06, th * .07);
  S.b.add(sh.box, tu, th * 1.02, z, C('#1f0a14'), 0, 0, 0, th * 1.0, th * .09, th * .11);
  for (const sx of [-1, 1]) S.b.add(sh.box, tu + sx * th * .5, th * 1.07, z, C('#1f0a14'), 0, 0, sx * .25, th * .14, th * .05, th * .11);
  S.g.add(sh.box, tu, th * 1.062, z + th * .056, tmpCol2.set('#ff6fa8').multiplyScalar(.7), 0, 0, 0, th * 1.02, .0015, .0015);
  glowBall(S, tu, th * .7, z + .002, .006, C('#ffb347'), 1.2, 'fa');      // lantern hanging from the tie beam
}

// ---- the worlds (index = stage). S: {b lit body, g/fa/fb glow layers, l wire, w windows [half][group], falls, floats, parts} ----
const WORLDS = [
  // 0 MIDNIGHT: neon city
  (S, st) => {
    const sh = shapes(); S.expo = .8;
    ridgeMesh(S, st, 21, H, H * .55, .05, st.mtn[1], tmpCol.set(st.wire).multiplyScalar(.5).getHex(), ROW_Z.far, .04);
    city(S, st, buildingPlan(61, H, H * .36, false), ROW_Z.far + .022, {fill: '#080414', trims: [st.wire], seed: 71, hs: 1, nowin: true, types: false});
    city(S, st, buildingPlan(99, H, H * .62), ROW_Z.mid, {fill: '#05020f', trims: [st.grid, st.p1, st.wire, st.p2], bridges: true, seed: 555});
    city(S, st, buildingPlan(131, H + .012, H * .38, false), ROW_Z.near, {fill: '#04020c', trims: [st.p1, st.grid], types: false, nowin: true, seed: 9});
    S.g.add(sh.box, 0, .001, ROW_Z.near + .014, C(st.grid).multiplyScalar(.45), 0, 0, 0, 1, .002, .004);
    for (const [x, col] of [[-.42, st.p1], [.41, st.grid]]) { S.falls.push({x, z: ROW_Z.far + .03, w: .022, h: .07, col}); pool(S, x, ROW_Z.far + .045, .035, .02, C(col), .7, 'fa'); }
    S.parts = {n: 22, col: st.p1, size: .0075, mode: 'drift', speed: .004, y: [.02, .12], z: [.03, .3], blend: 'add'};
  },
  // 1 TOXIC: swamp
  (S, st) => {
    const sh = shapes(); ridgeMesh(S, st, 5, H, H * .5, .07, '#0e3a1f', tmpCol.set(st.wire).multiplyScalar(.5).getHex(), ROW_Z.far, .04);
    const R = srand(7), gc = C(st.grid);
    treePlan(41, 12, H, .3, .35).forEach(([u, h], i) => { if (u < -.02 || u > 1.02) return; swampTree(S, st, u - .5, ROW_Z.mid + (R() - .5) * .05, h * HS * 1.9, 300 + i); });
    for (const [u, w] of poolPlan(77, 7, .05, .09)) { if (u < 0 || u > 1) continue; pool(S, u - .5, ROW_Z.near, w, w * .32, gc, .6);
      S.b.add(sh.hemi, u - .5, 0, ROW_Z.near, C('#0a2a14'), 0, 0, 0, w * 1.5, w * .55, w * .5, grad(C('#05150a'), C('#1a5a2a'), 0, w * .28));
      glowBall(S, u - .5, w * .2, ROW_Z.near, w * .26, gc, .75, 'fa'); }
    for (const x of [-.44, .43]) { S.falls.push({x, z: ROW_Z.far + .03, w: .02, h: .06, col: st.grid}); }
    S.parts = {n: 36, col: st.grid, size: .0072, mode: 'rise', speed: .012, y: [.005, .1], z: [.03, .3], blend: 'add'};
  },
  // 2 ICE: glacier with glowing crystal clusters
  (S, st) => {
    ridgeMesh(S, st, 13, H, H * .8, .09, '#1b4a78', '#ffffff', ROW_Z.far, .05);
    ridgeMesh(S, st, 29, H, H * .45, .05, '#12385c', tmpCol.set('#bfeaff').multiplyScalar(.7).getHex(), ROW_Z.mid, .05);
    const R = srand(53); let i = 0;
    for (let k = 0; k < 16; k++) { const u = -.12 + R() * 1.24, h = H * (.12 + R() * .3) * HS * 2.3; if (u < 0 || u > 1) continue; crystalCluster(S, st, u - .5, ROW_Z.near + (k % 3 - 1) * .02, h, h * .26, 900 + (i++)); }
    S.parts = {n: 46, col: '#ffffff', size: .0065, mode: 'fall', speed: .016, y: [.0, .14], z: [.03, .3], blend: 'add'};
  },
  // 3 INFERNO: volcano
  (S, st) => {
    const sh = shapes(); ridgeMesh(S, st, 17, H, H * .5, .08, '#2a0a10', tmpCol.set(st.wire).multiplyScalar(.45).getHex(), ROW_Z.far, .04);
    const hh = H * .92 * HS * 1.8, z = ROW_Z.mid, cone = roughCone(.33, .16, hh, 5);
    S.b.add(cone, 0, 0, z, C('#2a0a0e'), 0, 0, 0, 1, 1, 1, grad(C('#120406'), C('#4a1410'), 0, hh)); cone.dispose();
    S.b.add(sh.hemi, 0, hh - .004, z, C('#ff5a2f').multiplyScalar(.6), 0, 0, 0, .06, .02, .035);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; S.l.seg([Math.cos(a) * .33, 0, z + Math.sin(a) * .16], [Math.cos(a) * .035, hh * .92, z + Math.sin(a) * .017], C('#ff6b4a').multiplyScalar(.2)); }
    S.fa.add(sh.sph, 0, hh, z, C('#ff5a2f').multiplyScalar(.3), 0, 0, 0, .22, .1, .13); S.fb.add(sh.sph, 0, hh + .004, z, C('#ffd23f').multiplyScalar(.7), 0, 0, 0, .06, .03, .04);
    for (const dx of [-1, 1]) for (const off of [0, .5]) { const th = Math.PI / 2 - dx * (.5 + off * .35), pts = [];
      for (let k = 0; k <= 9; k++) { const t = .06 + .94 * k / 9, w = t + Math.sin(k * 1.7 + dx + off * 3) * .02; pts.push([.33 * w * Math.cos(th), Math.max(.002, hh * (1 - t) + .004), z + .16 * w * Math.sin(th) + .002]); }
      chain(S.fa, pts, .0045, .003, C('#ff9152').multiplyScalar(.9), null, 5); }
    for (const [u, w] of poolPlan(61, 9, .03, .05)) { if (u < 0 || u > 1) continue; pool(S, u - .5, ROW_Z.near, w, w * .22, C('#ff5a2f'), .5, 'fb');
      S.b.add(sh.ico, u - .5, .002, ROW_Z.near, C('#1a0608'), 0, u * 9, 0, w * 1.2, w * .35, w * .8); }
    for (const x of [-.43, .42]) S.falls.push({x, z: ROW_Z.far + .03, w: .02, h: .06, col: '#ff7a2f'});
    S.parts = {n: 42, col: '#ff8a3a', size: .0068, mode: 'rise', speed: .03, y: [.0, .2], z: [.03, .3], blend: 'add'};
  },
  // 4 ULTRAVIOLET: ringed planet, floating crystals
  (S, st) => {
    const sh = shapes(), r = H * .42 * HS * 1.5, cy = (H - H * .34) * HS + r * .5 + .02, z = ROW_Z.mid, a = C('#d9b8ff'), m = C('#7a2fff'), d = C('#1a0640'), rc = C('#e6c8ff');
    S.b.add(sh.sphHi, 0, cy, z, a, 0, 0, 0, r * 2, r * 2, r * 2, (x, y, zq, o) => { const t = clamp01(((x) * -.5 + (y - cy) * .5 + (zq - z) * .7) / r * .5 + .5); o.copy(t < .5 ? d.clone().lerp(m, t * 2) : m.clone().lerp(a, (t - .5) * 2)); });
    S.g.add(sh.sphHi, 0, cy, z, tmpCol2.copy(m).multiplyScalar(.1), 0, 0, 0, r * 2.3, r * 2.3, r * 2.3);          // atmosphere
    for (const [rr, k, tu] of [[1.5, .5, .003], [1.78, .38, .004], [2.05, .28, .003]]) { const tg = new THREE.TorusGeometry(r * rr, tu, 6, 72); tg.rotateX(Math.PI / 2);
      S.g.add(tg, 0, cy, z, tmpCol2.copy(rc).multiplyScalar(k), 0, 0, -.28, 1, 1, .28); tg.dispose(); }
    const ring = []; for (let i = 0; i <= 56; i++) { const q = i / 56 * Math.PI * 2, px = Math.cos(q) * r * 1.65, pz = Math.sin(q) * r * 1.65 * .28; ring.push([px, cy + px * -.28 * .5, z + pz]); } S.l.poly(ring, rc.clone().multiplyScalar(.3));
    for (const [u, v, s2] of diamondPlan(83, 12, H)) { if (u < 0 || u > 1) continue; S.floats.push({x: u - .5, y: (H - v) * HS + .014, z: ROW_Z.near, s: s2 * 1.6, ph: u * 11}); }
    S.parts = {n: 40, col: '#d6b6ff', size: .0066, mode: 'drift', speed: .003, y: [.01, .14], z: [.03, .3], blend: 'add'};
  },
  // 5 MIAMI: art-deco beach strip
  (S, st) => {
    const sh = shapes(); S.expo = .55;
    const mid = buildingPlan(67, H * .74, H * .5); city(S, st, mid, ROW_Z.mid, {fill: '#07242c', trims: [st.wire, st.grid, st.p1], bridges: false, seed: 31});
    palm(S, st, .1 - .5, ROW_Z.near, H * .85 * HS * 1.4, 1, 41); palm(S, st, .9 - .5, ROW_Z.near + .02, H * .72 * HS * 1.4, -1, 42); palm(S, st, .28 - .5, ROW_Z.near - .02, H * .5 * HS * 1.4, -1, 43);
    S.g.add(sh.box, 0, .001, ROW_Z.far, C('#0a4a58').multiplyScalar(.4), 0, 0, 0, 1, .002, .14);
    S.parts = {n: 28, col: '#ff9ccf', size: .0072, mode: 'drift', speed: .003, y: [.02, .12], z: [.03, .3], blend: 'add'};
  },
  // 6 GOLD RUSH: desert mesa, saguaros
  (S, st) => {
    const sh = shapes(); ridgeMesh(S, st, 43, H, H * .6, .12, '#6a3510', tmpCol.set(st.sun[1]).multiplyScalar(.7).getHex(), ROW_Z.far, .05);
    strata(S, st, (.58 + .9) / 2 - .5, ROW_Z.mid, .34, H * .55 * HS * 1.7, .1);
    ridgeMesh(S, st, 71, H, H * .28, .06, '#8a4a18', tmpCol.set(st.sun[1]).multiplyScalar(.6).getHex(), ROW_Z.mid + .045, .04);
    const R = srand(89); let i = 0;
    for (let k = 0; k < 6; k++) { const u = -.12 + R() * 1.24, h = H * (.2 + R() * .3) * HS * 1.7; if (u < 0 || u > 1) continue; saguaro(S, st, u - .5, ROW_Z.near + (k % 2 ? .02 : -.02), h, 70 + (i++)); }
    for (let k = 0; k < 7; k++) { const x = (R() - .5) * .9, w = .008 + R() * .014; S.b.add(sh.ico, x, w * .15, ROW_Z.near + (R() - .5) * .06, C('#6a3a14'), R() * 3, R() * 3, 0, w * 1.6, w * .8, w * 1.2); }
    S.parts = {n: 36, col: '#ffd890', size: .006, mode: 'drift', speed: .006, y: [.005, .08], z: [.03, .3], blend: 'add'};
  },
  // 7 VOID: wire nothing, spinning cubes
  (S, st) => {
    const wc = C('#ffffff'), sh = shapes();
    for (let i = 1; i <= 7; i++) { const r = H * (i / 7) * 1.4, arc = []; for (let k = 0; k <= 36; k++) { const a = k / 36 * Math.PI; arc.push([Math.cos(a) * r, .0006, H - Math.sin(a) * r]); }
      S.l.poly(arc.filter(p => Math.abs(p[0]) <= .5 && p[2] >= 0), wc.clone().multiplyScalar(.14)); }
    for (let k = -6; k <= 6; k++) S.l.seg([0, .0006, H], [Math.max(-.5, Math.min(.5, k * .14)), .0006, Math.max(0, H - H * 1.4)], wc.clone().multiplyScalar(.14));
    S.g.add(sh.box, 0, .0012, H - .004, wc.clone().multiplyScalar(.5), 0, 0, 0, 1, .0016, .0016);
    S.parts = {n: 18, col: '#ffffff', size: .005, mode: 'drift', speed: .002, y: [.01, .14], z: [.03, .3], blend: 'add'};
  },
  // 8 SAKURA: grove with pagoda and torii, falling petals
  (S, st) => {
    const sh = shapes(); ridgeMesh(S, st, 59, H, H * .62, .1, '#3a1430', tmpCol.set(st.wire).multiplyScalar(.5).getHex(), ROW_Z.far, .05);
    pagoda(S, st, .74 - .5, ROW_Z.mid, H * .55 * HS * 2.6);
    const R = srand(3); let i = 0;
    for (const [u, h0] of blossomPlan(97, 6, H)) { if (u < 0 || u > 1) continue; blossomTree(S, st, u - .5, ROW_Z.mid - .03 - R() * .03, h0 * HS * 1.9, 500 + (i++)); }
    torii(S, st, .22 - .5, ROW_Z.near, H * .8 * HS * 1.4);
    for (let k = 0; k < 7; k++) { const x = (R() - .5) * .95, z = ROW_Z.near + (R() - .5) * .06; pool(S, x, z, .02 + R() * .02, .012, C('#ff9ec4'), .55, 'fb'); }
    S.parts = {n: 52, col: '#ffb7d5', size: .0085, mode: 'fall', speed: .012, y: [.0, .16], z: [.03, .3], blend: 'add', sway: .02};
  },
  // 9 STUDIO: no scenery on the phone either
  () => {},
];

export function createDiorama({table, soft = false}) {
  const out = {ok: true, index: -1, tris: 0, draws: 0, alpha: [1, 1], errors: 0};
  const group = new THREE.Group(); group.visible = false; table.add(group);
  const T = makeTextures();
  const sh = shapes();
  const mk = (kind, mats) => ({kind, mats});
  const halves = [0, 1].map(h => {
    // Lambert on purpose: the room's environment map would wash dark, saturated shapes to grey
    const body = new THREE.MeshLambertMaterial({vertexColors: true, transparent: true, map: T.detail});
    const glowMat = () => new THREE.MeshBasicMaterial({vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false});
    const lineMat = new THREE.LineBasicMaterial({vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false});
    const fallMat = new THREE.MeshBasicMaterial({vertexColors: true, map: T.fall, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide});
    const mats = {body, g: glowMat(), fa: glowMat(), fb: glowMat(), line: lineMat, fall: fallMat};
    const meshes = {body: new THREE.Mesh(new THREE.BufferGeometry(), body), g: new THREE.Mesh(new THREE.BufferGeometry(), mats.g), fa: new THREE.Mesh(new THREE.BufferGeometry(), mats.fa), fb: new THREE.Mesh(new THREE.BufferGeometry(), mats.fb),
      line: new THREE.LineSegments(new THREE.BufferGeometry(), lineMat), fall: new THREE.Mesh(new THREE.BufferGeometry(), fallMat)};
    for (const m of Object.values(meshes)) { m.frustumCulled = false; m.rotation.y = h ? Math.PI : 0; group.add(m); m.visible = false; }
    meshes.g.renderOrder = 2; meshes.fa.renderOrder = 2; meshes.fb.renderOrder = 2; meshes.fall.renderOrder = 2; meshes.line.renderOrder = 3;
    return {meshes, mats};
  });
  // drifting particles (both halves in one call)
  const PN = 56, ppos = new Float32Array(PN * 3), pbase = new Float32Array(PN * 4);
  const pgeo = new THREE.BufferGeometry(); pgeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3)); pgeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, .1, 0), 2);
  const pmat = new THREE.PointsMaterial({size: .008, map: T.dot, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, color: 0xffffff});
  const points = new THREE.Points(pgeo, pmat); points.frustumCulled = false; points.visible = false; points.renderOrder = 4; group.add(points);
  let pcfg = null, pcount = 0;
  // bobbing crystals (instanced, both halves)
  const FN = 40, fmatBody = new THREE.MeshStandardMaterial({color: 0x241048, emissive: 0x4a1fb0, emissiveIntensity: .55, roughness: .3, metalness: .5, transparent: true}), fmatGlow = new THREE.MeshBasicMaterial({color: 0xb58cff, transparent: true, opacity: .22, blending: THREE.AdditiveBlending, depthWrite: false});
  const fl = new THREE.InstancedMesh(sh.oct, fmatBody, FN), flg = new THREE.InstancedMesh(sh.oct, fmatGlow, FN); for (const f of [fl, flg]) { f.frustumCulled = false; f.count = 0; f.visible = false; group.add(f); }
  fl.instanceMatrix.setUsage(THREE.DynamicDrawUsage); flg.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const dummy = new THREE.Object3D(); let floats = [];
  let cubes = null;
  const spheres = [[], []];
  for (const h of [0, 1]) for (const x of [-.3, 0, .3]) spheres[h].push(x, .04, (h ? -1 : 1) * ROW_Z.mid, .15);

  function fallGeometry(list) {
    const p = [], uv = [], c = [], idx = [];
    list.forEach((f, i) => { const x0 = f.x - f.w / 2, x1 = f.x + f.w / 2, col = C(f.col).multiplyScalar(1.3);
      p.push(x0, f.h, f.z, x1, f.h, f.z, x1, 0, f.z, x0, 0, f.z); uv.push(0, 1, 1, 1, 1, 0, 0, 0); for (let k = 0; k < 4; k++) c.push(col.r, col.g, col.b); idx.push(i * 4, i * 4 + 2, i * 4 + 1, i * 4, i * 4 + 3, i * 4 + 2); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); g.setIndex(idx); g.computeBoundingSphere(); return g;
  }

  out.set = (index, st) => {
    if (index === out.index || !st) return;
    out.index = index; out.errors = 0;
    const S = {b: new Buf(), g: new Buf(), fa: new Buf(), fb: new Buf(), l: new Lines(), falls: [], floats: [], parts: null, w: [[new Buf(), new Buf(), new Buf()], [new Buf(), new Buf(), new Buf()]]};
    try { (WORLDS[index] || WORLDS[9])(S, st); } catch (e) { out.errors++; console.warn('diorama', index, e && e.message); }
    tmpCol.set(st.horizon).multiplyScalar(soft ? .004 : .006);
    const fg = S.falls.length ? fallGeometry(S.falls) : null;
    let tris = S.b.tris + S.g.tris + S.fa.tris + S.fb.tris;
    for (let h = 0; h < 2; h++) {
      const H2 = halves[h], M = H2.meshes, set = (mesh, buf) => { mesh.geometry.dispose(); mesh.visible = !buf.empty; if (!buf.empty) mesh.geometry = buf.geometry(); };
      if (H2.mats.body.emissive) H2.mats.body.emissive.copy(tmpCol);
      H2.mats.body.color.setScalar(S.expo === undefined ? 1.15 : S.expo);
      set(M.body, S.b); set(M.g, S.g.clone().cat(S.w[h][0])); set(M.fa, S.fa.clone().cat(S.w[h][1])); set(M.fb, S.fb.clone().cat(S.w[h][2]));
      M.line.geometry.dispose(); M.line.visible = !S.l.empty; if (!S.l.empty) M.line.geometry = S.l.geometry();
      M.fall.visible = !!fg; if (fg) { M.fall.geometry.dispose(); M.fall.geometry = fg; }
      tris += S.w[h][0].tris + S.w[h][1].tris + S.w[h][2].tris;
    }
    out.tris = tris | 0;
    // particles
    pcfg = S.parts; pcount = 0; points.visible = !!pcfg;
    if (pcfg) { pcount = Math.min(PN, pcfg.n * 2); pmat.color.set(pcfg.col); pmat.size = pcfg.size; pmat.blending = THREE.AdditiveBlending;
      const R = srand(1234 + index); for (let i = 0; i < pcount; i++) { pbase[i * 4] = (R() - .5) * .96; pbase[i * 4 + 1] = R(); pbase[i * 4 + 2] = pcfg.z[0] + R() * (pcfg.z[1] - pcfg.z[0]); pbase[i * 4 + 3] = R() * 6.28; } pgeo.setDrawRange(0, pcount); }
    // bobbing crystals
    floats = S.floats; const nf = Math.min(FN / 2, floats.length); fl.count = flg.count = nf * 2; fl.visible = flg.visible = nf > 0;
    cubes = null;
    if (index === 7) { // Void: three wire cubes per half, re-posed each frame into the tail of the line buffer
      for (const h of halves) {
        const n0 = S.l.p.length, arr = new Float32Array(n0 + 3 * 12 * 6), ca = new Float32Array(arr.length).fill(.55); arr.set(S.l.p); ca.set(S.l.c);
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(arr, 3)); geo.setAttribute('color', new THREE.BufferAttribute(ca, 3));
        geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, .05, ROW_Z.mid), 1); h.meshes.line.geometry.dispose(); h.meshes.line.geometry = geo; h.meshes.line.visible = true; h.cubeOff = n0;
      }
      cubes = {n: 3};
    }
    let calls = 0; for (const h of halves) for (const m of Object.values(h.meshes)) if (m.visible) calls++;
    out.draws = calls + (pcfg ? 1 : 0) + (fl.visible ? 2 : 0);
  };
  const cp = new Float32Array(24), IDX = [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  function poseCubes(t) {
    for (const h of halves) {
      const arr = h.meshes.line.geometry.attributes.position.array; let o = h.cubeOff;
      for (let i = 0; i < 3; i++) {
        const u = .22 + i * .28 - .5, y = (.45 + .1 * Math.sin(t + i)) * H, sz = H * .13, a = t * (.5 + i * .2), ca = Math.cos(a), sa = Math.sin(a), hy = (H - y) * HS * 1.2 + .02;
        for (let k = 0; k < 8; k++) { const cx = (k & 1) ? 1 : -1, cz = (k & 2) ? 1 : -1, cyy = (k & 4) ? 1 : -1;
          cp[k * 3] = u + (cx * ca - cz * sa) * sz * .7; cp[k * 3 + 1] = hy + cyy * sz * .45; cp[k * 3 + 2] = ROW_Z.mid + (cx * sa + cz * ca) * sz * .7; }
        for (const [p, q] of IDX) { arr[o++] = cp[p * 3]; arr[o++] = cp[p * 3 + 1]; arr[o++] = cp[p * 3 + 2]; arr[o++] = cp[q * 3]; arr[o++] = cp[q * 3 + 1]; arr[o++] = cp[q * 3 + 2]; }
      }
      h.meshes.line.geometry.attributes.position.needsUpdate = true;
    }
  }
  const flick = (t, f1, f2, ph) => { const s = .8 + .2 * Math.sin(t * f1 + ph) * Math.sin(t * f2 + ph * 2.3), drop = Math.sin(t * .83 + ph * 1.9) > .95 ? .3 : 1; return s * drop; };

  // t seconds; eye in table-local space; sights: Float32Array of (x,y,z)*n points that must stay visible
  out.update = (t, dt, ex, ey, ez, sights, n) => {
    if (out.index < 0) { group.visible = false; return; }
    group.visible = true;
    let amin = 1;
    for (let h = 0; h < 2; h++) {
      let blocked = false; const sp = spheres[h];
      for (let i = 0; i < n && !blocked; i++) for (let s = 0; s < 12 && !blocked; s += 4) blocked = sightBlocked(ex, ey, ez, sights[i * 3], sights[i * 3 + 1], sights[i * 3 + 2], sp[s], sp[s + 1], sp[s + 2], sp[s + 3]);
      const a = out.alpha[h] = fadeStep(out.alpha[h], blocked ? FADE_MIN : 1, dt); amin = Math.min(amin, a);
      const m = halves[h].mats, tr = a < .995;
      m.body.opacity = a; m.body.transparent = tr; m.g.opacity = a; m.fa.opacity = a; m.fb.opacity = a; m.line.opacity = a; m.fall.opacity = a;
      m.fa.color.setScalar(flick(t, 7.3, 2.9, 1 + h)); m.fb.color.setScalar(flick(t, 5.1, 3.7, 4 + h * 2));
    }
    T.fall.offset.y = -(t * .45) % 1; T.fall.repeat.y = 1.6;
    if (pcfg) {
      const c = pcfg, span = c.y[1] - c.y[0];
      for (let i = 0; i < pcount; i++) {
        const half = i & 1 ? -1 : 1, bx = pbase[i * 4], ph = pbase[i * 4 + 1], bz = pbase[i * 4 + 2], w = pbase[i * 4 + 3];
        let k = ph, x = bx, y;
        if (c.mode === 'rise') { k = (ph + t * c.speed / span) % 1; y = c.y[0] + k * span; x += Math.sin(t * .9 + w) * .012; }
        else if (c.mode === 'fall') { k = (ph + t * c.speed / span) % 1; y = c.y[1] - k * span; x += Math.sin(t * 1.3 + w) * (c.sway || .01); }
        else { y = c.y[0] + (ph + Math.sin(t * .35 + w) * .12 + 1) % 1 * span; x += Math.sin(t * c.speed * 40 + w) * .02 + (t * c.speed) % .05; }
        ppos[i * 3] = x; ppos[i * 3 + 1] = y; ppos[i * 3 + 2] = half * bz;
      }
      pgeo.attributes.position.needsUpdate = true; pmat.opacity = .25 + amin * .6;
    }
    if (fl.visible) {
      let i = 0;
      for (let h = 0; h < 2; h++) for (const f of floats) { if (i >= FN) break;
        dummy.position.set(f.x, f.y + Math.sin(t * 1.1 + f.ph) * .006, (h ? -1 : 1) * f.z); dummy.rotation.set(0, t * .6 + f.ph, 0); dummy.scale.set(f.s, f.s * 1.5, f.s); dummy.updateMatrix(); fl.setMatrixAt(i, dummy.matrix);
        dummy.scale.multiplyScalar(1.28); dummy.updateMatrix(); flg.setMatrixAt(i, dummy.matrix); i++; }
      fl.instanceMatrix.needsUpdate = flg.instanceMatrix.needsUpdate = true; fmatBody.opacity = amin; fmatGlow.opacity = .22 * amin; fmatBody.emissiveIntensity = .5 + .2 * Math.sin(t * 2.1);
    }
    if (cubes) poseCubes(t);
  };
  out.dispose = () => { for (const h of halves) for (const m of Object.values(h.meshes)) m.geometry.dispose(); pgeo.dispose(); };
  out.group = group; out.halves = halves;
  return out;
}
