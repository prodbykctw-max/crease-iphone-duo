// The arena window scene as a small 3D diorama on the table (VR). On the phone each player's strip of the table shows a painted world in three
// depth layers (ridges, towers, trees, cacti, shards, palms ...); here the same layout, colours and relative sizes stand on the table as real
// geometry with lit materials, glowing windows and wire edges. Heights are squashed (HS) so nothing tall blocks the puck, and a half fades when
// it would hide the puck or a paddle from where you stand. Visual only: nothing collides with it, as on the phone.
// Cost: 3 draw calls per half (lit body, glow, wire), shared geometry for both halves, built once per arena, nothing allocated per frame.
import * as THREE from './vendor/three.module.min.js';
import {HORIZON as H, HS, ROW_Z, FADE_MIN, ridgePts, buildingPlan, treePlan, blossomPlan, poolPlan, diamondPlan, clipRidge, srand} from './quest-diorama-pure.mjs';
import {sightBlocked, fadeStep} from './quest-centre-pure.mjs';

const C = h => new THREE.Color(h);
const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), tmpCol = new THREE.Color(), tmpCol2 = new THREE.Color();

// accumulates merged, non-indexed geometry with vertex colours
class Buf {
  constructor() { this.p = []; this.n = []; this.c = []; }
  add(g, x, y, z, col, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, fn = null) {
    const ng = g.index ? g.toNonIndexed() : g.clone();
    m4.compose(v3.set(x, y, z), q4.setFromEuler(e4.set(rx, ry, rz)), s3.set(sx, sy, sz));
    ng.applyMatrix4(m4);
    const P = ng.attributes.position, N = ng.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      this.p.push(P.getX(i), P.getY(i), P.getZ(i));
      this.n.push(N ? N.getX(i) : 0, N ? N.getY(i) : 1, N ? N.getZ(i) : 0);
      if (fn) fn(P.getX(i), P.getY(i), P.getZ(i), tmpCol, i); else tmpCol.copy(col);
      this.c.push(tmpCol.r, tmpCol.g, tmpCol.b);
    }
    ng.dispose(); return this;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere(); return g;
  }
  get tris() { return this.p.length / 9; }
  clone() { const o = new Buf(); o.p = this.p.slice(); o.n = this.n.slice(); o.c = this.c.slice(); return o; }
  cat(x) { for (const k of ['p', 'n', 'c']) for (let i = 0; i < x[k].length; i++) this[k].push(x[k][i]); return this; }
}
class Lines {
  constructor() { this.p = []; this.c = []; }
  seg(a, b, col) { this.p.push(a[0], a[1], a[2], b[0], b[1], b[2]); this.c.push(col.r, col.g, col.b, col.r, col.g, col.b); }
  poly(pts, col) { for (let i = 0; i + 1 < pts.length; i++) this.seg(pts[i], pts[i + 1], col); }
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
  SH.cone7 = new THREE.ConeGeometry(.5, 1, 7, 1); SH.cone7.translate(0, .5, 0);
  SH.cyl = new THREE.CylinderGeometry(.5, .5, 1, 8, 1); SH.cyl.translate(0, .5, 0);
  SH.sph = new THREE.SphereGeometry(.5, 10, 6);
  SH.sphHi = new THREE.SphereGeometry(.5, 32, 20);
  SH.hemi = new THREE.SphereGeometry(.5, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  SH.oct = new THREE.OctahedronGeometry(.5, 0);
  SH.ico = new THREE.IcosahedronGeometry(.5, 1);
  SH.disc = new THREE.CircleGeometry(.5, 24); SH.disc.rotateX(-Math.PI / 2);
  SH.quad = new THREE.PlaneGeometry(1, 1);
  return SH;
}

// extrude a silhouette (x, height) pairs standing on y=0, depth d centred on z
function silhouette(pts, d) {
  const sh = new THREE.Shape(); sh.moveTo(pts[0][0], 0);
  for (const p of pts) sh.lineTo(p[0], p[1]);
  sh.lineTo(pts[pts.length - 1][0], 0); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, {depth: d, bevelEnabled: false, steps: 1}); g.translate(0, 0, -d / 2); return g;
}
const tube = (pts, r, seg = 8, rad = 5) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2]))), seg, r, rad, false);

// ---- the ten worlds. Each fills `b` (lit body), `g` (glow, additive) and `l` (wire) in a half's local space: z grows towards the player. ----
function windowsGlow(g, plan, z, st, dz) {   // one quad per window, only on the face that looks at the player (g.wf for the near half, g.wb for the far half)
  const S = shapes();
  for (const bd of plan) for (const [wx, wy, k] of bd.wins) {
    const x = Math.min(.499, wx + .0012 - .5);
    if (x < -.5) continue;
    tmpCol.set(st.win[k]);
    g.wf.add(S.quad, x, wy * HS, z + dz + .0006, tmpCol, 0, 0, 0, .0034, .0022, 1);
    g.wb.add(S.quad, x, wy * HS, z - dz - .0006, tmpCol, 0, Math.PI, 0, .0034, .0022, 1);
  }
}
function towers(b, g, l, st, plan, z, dz, fill, edge, wire) {
  const S = shapes(), fc = C(fill), ec = edge ? C(edge) : null;
  for (const bd of plan) {
    const x0 = bd.u - .5, x1 = x0 + bd.w; if (x1 < -.5 || x0 > .5) continue;
    const cx = (Math.max(x0, -.5) + Math.min(x1, .5)) / 2, w = Math.min(x1, .5) - Math.max(x0, -.5), h = bd.h * HS;
    const tint = C(st.wire).multiplyScalar(.22);   // base sinks into the table, the roofline catches the arena's light
    b.add(S.box, cx, h / 2, z, fc, 0, 0, 0, w, h, dz * 2, (px, py, pz, o) => { const k = Math.max(0, Math.min(1, py / (h || 1))); o.copy(fc).multiplyScalar(.45 + .55 * k).add(tmpCol2.copy(tint).multiplyScalar(k * k)); });
    if (ec) { // the phone's thin outline
      const y = h, a = x => [x, y, z + dz + .0004], c = x => [x, y, z - dz - .0004];
      l.seg([cx - w / 2, 0, z + dz + .0004], [cx - w / 2, y, z + dz + .0004], ec); l.seg([cx + w / 2, 0, z + dz + .0004], [cx + w / 2, y, z + dz + .0004], ec);
      l.seg(a(cx - w / 2), a(cx + w / 2), ec); l.seg(c(cx - w / 2), c(cx + w / 2), ec);
    }
    if (bd.ant) { // roof antenna with a lamp
      const ah = bd.ant * HS; tmpCol.set(st.wire).multiplyScalar(.6);
      b.add(S.cyl, cx, h, z, tmpCol, 0, 0, 0, .0009, ah, .0009);
      tmpCol.set(st.p2); g.add(S.sph, cx, h + ah, z, tmpCol, 0, 0, 0, .0034, .0034, .0034);
    }
  }
}
function ridgeMesh(b, l, st, seed, base, amp, step, fill, wire, z, d) {
  const pts = clipRidge(ridgePts(seed, base, amp, step), base); if (pts.length < 2) return;
  const S = silhouette(pts, d); const col = C(fill);
  b.add(S, 0, 0, z, col); S.dispose();
  if (wire) { const wc = C(wire), top = pts.map(p => [p[0], p[1] + .0006, z]);
    l.poly(top.map(p => [p[0], p[1], z + d / 2 + .0004]), wc); l.poly(top.map(p => [p[0], p[1], z - d / 2 - .0004]), wc); }
}
function pool(g, x, z, rx, rz, col, k) { const S = shapes(); // soft glowing patch on the ground
  g.add(S.disc, x, .0016, z, col, 0, 0, 0, rx * 2, 1, rz * 2, (px, py, pz, o) => { const r = Math.hypot((px - x) / (rx || 1), (pz - z) / (rz || 1)) * 2; o.copy(col).multiplyScalar(k * Math.max(0, 1 - r) * Math.max(0, 1 - r)); }); }
function tree(b, x, z, h, col) { // trunk plus four bent branches (the phone's tree())
  const S = shapes(), c = C(col);
  b.add(S.cyl, x, 0, z, c, 0, 0, 0, h * .1, h, h * .1);
  for (const [a, len, k] of [[-.9, .5, 0], [.8, .45, 1], [-.5, .3, 2], [.4, .28, 3]]) {
    const by = h * (.55 + Math.abs(a) * .2), bx = x + h * .04, ex = bx + Math.sin(a) * h * len, ey = by + Math.cos(a) * h * len * .8, az = k * 1.6;
    const dz2 = Math.sin(az) * (ex - bx) * .5;
    b.add(tube([[bx, by, z], [(bx + ex) / 2, (by + ey) / 2 + .002, z + dz2 * .5], [ex, ey, z + dz2]], h * .028, 4, 4), 0, 0, 0, c);
  }
}
function palm(b, g, l, st, x0, z, hgt, dir) {
  const S = shapes(), top = [x0 + dir * hgt * .22, hgt], dk = C('#04000a'), gr = C(st.grid).multiplyScalar(.5);
  const mid = [x0 - dir * hgt * .16 + (top[0] - x0) * .5, hgt * .55];
  b.add(tube([[x0, 0, z], [mid[0], mid[1], z], [top[0], top[1], z]], hgt * .045, 8, 6), 0, 0, 0, dk);
  [15, 50, 80, 110, 150, 175, -10].forEach((deg, i) => {
    const ang = deg * Math.PI / 180, len = hgt * (.42 + Math.abs(90 - deg) / 180 * .2), az = i * 2.4;
    const hx = Math.cos(ang) * len, hy = Math.sin(ang) * len * .5, ex = hx * Math.cos(az), ez = hx * Math.sin(az);
    const p = [[top[0], top[1], z], [top[0] + ex * .55, top[1] + Math.abs(hy) * .9, z + ez * .55], [top[0] + ex, top[1] - .1 * len + (hy > 0 ? 0 : hy * .3) - len * .15, z + ez]];
    b.add(tube(p, hgt * .03, 6, 4), 0, 0, 0, dk);
    l.poly(p.map(q => [q[0], q[1] + .0015, q[2]]), gr);
  });
}
function cactus(b, x, z, h) {
  const S = shapes(), c = C('#2a1a06'), r = h * .12;
  b.add(new THREE.CapsuleGeometry(1, 1, 3, 8), x, h / 2, z, c, 0, 0, 0, r, (h - 2 * r) / 1, r);
  const arm = (dir, y0, run, rise) => {
    const p = [[x, y0, z], [x + dir * run, y0, z], [x + dir * run, y0 + rise, z]];
    b.add(tube(p, h * .065, 6, 6), 0, 0, 0, c);
  };
  arm(1, h * .55, h * .3, h * .25); arm(-1, h * .4, h * .26, h * .22);
}

const WORLDS = [
  // 0 MIDNIGHT: neon city
  (b, g, l, st) => {
    ridgeMesh(b, l, st, 21, H, H * .55, .05, st.mtn[1], tmpCol.set(st.wire).multiplyScalar(.5).getHex(), ROW_Z.far, .04);
    const mid = buildingPlan(99, H, H * .62); towers(b, g, l, st, mid, ROW_Z.mid, .012, '#05010c', tmpCol.set(st.wire).multiplyScalar(.25).getHex(), 1); windowsGlow(g, mid, ROW_Z.mid, st, .012);
    towers(b, g, l, st, buildingPlan(131, H + .012, H * .38, false), ROW_Z.near, .01, '#02000a', 0);
    const S = shapes(); g.add(S.box, 0, .001, ROW_Z.near + .012, C(st.grid).multiplyScalar(.3), 0, 0, 0, 1, .002, .004);
  },
  // 1 TOXIC: swamp
  (b, g, l, st) => {
    ridgeMesh(b, l, st, 5, H, H * .5, .07, st.mtn[1], tmpCol.set(st.wire).multiplyScalar(.45).getHex(), ROW_Z.far, .04);
    const R = srand(7);
    for (const [u, h] of treePlan(41, 12, H, .3, .35)) { if (u < -.02 || u > 1.02) continue; tree(b, u - .5, ROW_Z.mid + (R() - .5) * .05, h * HS * 1.7, '#04150a'); }
    const S = shapes(), gc = C(st.grid);
    for (const [u, w] of poolPlan(77, 7, .05, .09)) {
      if (u < 0 || u > 1) continue;
      pool(g, u - .5, ROW_Z.near, w, w * .32, gc, .55);
      tmpCol.set('#04150a'); b.add(S.hemi, u - .5, 0, ROW_Z.near, tmpCol, 0, 0, 0, w * 1.4, w * .5, w * .5);
      g.add(S.ico, u - .5, w * .25, ROW_Z.near, gc.clone().multiplyScalar(.4), 0, 0, 0, w * .5, w * .3, w * .3);
    }
  },
  // 2 ICE: glacier
  (b, g, l, st) => {
    ridgeMesh(b, l, st, 13, H, H * .8, .09, st.mtn[0], '#ffffff', ROW_Z.far, .05);
    ridgeMesh(b, l, st, 29, H, H * .45, .05, st.mtn[1], tmpCol.set(st.wire).multiplyScalar(.6).getHex(), ROW_Z.mid, .05);
    const S = shapes(), R = srand(53), wc = C('#9fe8ff');
    for (let i = 0; i < 16; i++) {
      const u = -.12 + R() * 1.24, h = H * (.12 + R() * .3) * HS * 1.9, w = h * .3 * 1.6 / 1.9 * 1.0;
      if (u < 0 || u > 1) continue;
      const z = ROW_Z.near + (i % 3 - 1) * .018;
      b.add(S.cone4, u - .5, 0, z, C('#081a2e'), 0, 0, 0, w * 1.6, h, w * 1.6);
      for (const [dx, dz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) l.seg([u - .5 + dx * w * .8, 0, z + dz * w * .8], [u - .5, h, z], wc.clone().multiplyScalar(.5));
      g.add(S.cone4, u - .5, 0, z, wc.clone().multiplyScalar(.06), 0, 0, 0, w * 1.62, h * 1.01, w * 1.62);
    }
  },
  // 3 INFERNO: volcano
  (b, g, l, st) => {
    ridgeMesh(b, l, st, 17, H, H * .5, .08, st.mtn[1], tmpCol.set(st.wire).multiplyScalar(.4).getHex(), ROW_Z.far, .04);
    const S = shapes(), hh = H * .92 * HS * 1.7, z = ROW_Z.mid;
    b.add(new THREE.ConeGeometry(.5, 1, 28, 1, true), 0, hh / 2, z, C('#20060a'), 0, 0, 0, .64, hh, .3);
    b.add(S.hemi, 0, hh - .002, z, C('#ff5a2f').multiplyScalar(.5), 0, 0, 0, .05, .012, .03);
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; l.seg([Math.cos(a) * .32, 0, z + Math.sin(a) * .15], [Math.cos(a) * .03, hh * .93, z + Math.sin(a) * .014], C('#ff6b4a').multiplyScalar(.22)); }
    g.add(S.sph, 0, hh, z, C('#ff5a2f').multiplyScalar(.22), 0, 0, 0, .2, .1, .12);
    g.add(S.sph, 0, hh, z, C('#ffd23f').multiplyScalar(.5), 0, 0, 0, .06, .03, .04);
    for (const dx of [-1, 1]) { // lava rivers run down the cone's own surface
      const th = Math.PI / 2 - dx * .5, pts = [];
      for (let k = 0; k <= 9; k++) { const t = .06 + .94 * k / 9, w = t + Math.sin(k * 1.7 + dx) * .02; pts.push([.32 * w * Math.cos(th), Math.max(.002, hh * (1 - t) + .0035), z + .15 * w * Math.sin(th) + .002]); }
      g.add(tube(pts, .0045, 12, 4), 0, 0, 0, C('#ff9152').multiplyScalar(.9));
    }
    for (const [u, w] of poolPlan(61, 9, .03, .05)) { if (u < 0 || u > 1) continue; pool(g, u - .5, ROW_Z.near, w, w * .22, C('#ff5a2f'), .45); }
  },
  // 4 ULTRAVIOLET: ringed planet, floating diamonds
  (b, g, l, st) => {
    const S = shapes(), r = H * .42 * HS * 1.6, cy = (H - H * .34) * HS + r * .5 + .02, z = ROW_Z.mid, a = C('#d9b8ff'), m = C('#7a2fff'), d = C('#1a0640');
    b.add(S.sphHi, 0, cy, z, a, 0, 0, 0, r * 2, r * 2, r * 2, (x, y, zq, o) => { const t = Math.min(1, Math.max(0, ((x - 0) * -.5 + (y - cy) * .5 + (zq - z) * .7) / r * .5 + .5)); o.copy(t < .5 ? d.clone().lerp(m, t * 2) : m.clone().lerp(a, (t - .5) * 2)); });
    const rc = C('#e6c8ff');
    for (const rr of [1.5, 1.75, 2]) { const ring = [];
      for (let i = 0; i <= 48; i++) { const q = i / 48 * Math.PI * 2, px = Math.cos(q) * r * rr, pz = Math.sin(q) * r * rr * .28; ring.push([px, cy + px * -.14, z + pz]); }
      l.poly(ring, rc.clone().multiplyScalar(.55)); }
    const wire = C(st.wire).multiplyScalar(.5);
    for (const [u, v, s2] of diamondPlan(83, 12, H)) {
      if (u < 0 || u > 1) continue; const hy = (H - v) * HS + .012, s = s2 * 1.5;
      b.add(S.oct, u - .5, hy, ROW_Z.near, C('#12002a'), 0, 0, 0, s, s * 1.5, s);
      for (const p of [[1, 0], [0, 1], [-1, 0], [0, -1]]) { l.seg([u - .5 + p[0] * s / 2, hy, ROW_Z.near + p[1] * s / 2], [u - .5, hy + s * .75, ROW_Z.near], wire); l.seg([u - .5 + p[0] * s / 2, hy, ROW_Z.near + p[1] * s / 2], [u - .5, hy - s * .75, ROW_Z.near], wire); }
    }
  },
  // 5 MIAMI: beach strip
  (b, g, l, st) => {
    const mid = buildingPlan(67, H * .74, H * .5); towers(b, g, l, st, mid, ROW_Z.mid, .012, '#061c24', tmpCol.set('#5ff0e0').multiplyScalar(.35).getHex(), 1);
    windowsGlow(g, mid, ROW_Z.mid, st, .012);
    palm(b, g, l, st, .1 - .5, ROW_Z.near, H * .85 * HS * 1.3, 1); palm(b, g, l, st, .9 - .5, ROW_Z.near + .02, H * .72 * HS * 1.3, -1); palm(b, g, l, st, .28 - .5, ROW_Z.near - .02, H * .5 * HS * 1.3, -1);
    const S = shapes(); g.add(S.box, 0, .001, ROW_Z.far, C('#07323d').multiplyScalar(.5), 0, 0, 0, 1, .002, .14);
  },
  // 6 GOLD RUSH: desert
  (b, g, l, st) => {
    ridgeMesh(b, l, st, 43, H, H * .6, .12, st.mtn[0], tmpCol.set(st.wire).multiplyScalar(.45).getHex(), ROW_Z.far, .05);
    const S = shapes(), mh = H * .55 * HS * 1.2, z = ROW_Z.mid;
    b.add(silhouette([[.58 - .5, 0], [.62 - .5, mh], [.86 - .5, mh], [.9 - .5, 0]], .09), 0, 0, z, C(st.mtn[1]));
    b.add(S.box, (.62 + .86) / 2 - .5, mh, z, C(st.mtn[1]).multiplyScalar(1.4), 0, 0, 0, .25, .004, .092);
    const wc = C(st.wire).multiplyScalar(.5);
    for (const zz of [z + .0452, z - .0452]) l.poly([[.58 - .5, 0, zz], [.62 - .5, mh, zz], [.86 - .5, mh, zz], [.9 - .5, 0, zz]], wc);
    ridgeMesh(b, l, st, 71, H, H * .28, .06, C(st.mtn[1]).multiplyScalar(.9).getHex(), tmpCol.set(st.wire).multiplyScalar(.35).getHex(), ROW_Z.mid + .04, .04);
    const R = srand(89);
    for (let i = 0; i < 6; i++) { const u = -.12 + R() * 1.24, h = H * (.2 + R() * .3) * HS * 1.5; if (u < 0 || u > 1) continue; cactus(b, u - .5, ROW_Z.near + (i % 2 ? .02 : -.02), h); }
  },
  // 7 VOID: wire nothing, spinning cubes
  (b, g, l, st) => {
    const wc = C('#ffffff'), S = shapes();
    for (let i = 1; i <= 7; i++) { const r = H * (i / 7) * 1.4, arc = [];
      for (let k = 0; k <= 36; k++) { const a = k / 36 * Math.PI; arc.push([Math.cos(a) * r, .0006, H - Math.sin(a) * r]); }
      l.poly(arc.filter(p => Math.abs(p[0]) <= .5 && p[2] >= 0), wc.clone().multiplyScalar(.12)); }
    for (let k = -6; k <= 6; k++) l.seg([0, .0006, H], [Math.max(-.5, Math.min(.5, k * .14)), .0006, Math.max(0, H - H * 1.4)], wc.clone().multiplyScalar(.12));
    g.add(S.box, 0, .0012, H - .004, wc.clone().multiplyScalar(.5), 0, 0, 0, 1, .0016, .0016);
  },
  // 8 SAKURA: grove with pagoda and torii
  (b, g, l, st) => {
    ridgeMesh(b, l, st, 59, H, H * .62, .1, st.mtn[0], tmpCol.set(st.wire).multiplyScalar(.45).getHex(), ROW_Z.far, .05);
    const S = shapes(), z = ROW_Z.mid, bh = H * .55 * HS * 1.4, bu = .74 - .5, dk = C('#1d0716'), pk = C('#ffc0dd');
    for (let i = 0; i < 3; i++) { const w = (.07 - i * .017) * 1.7, y = bh * i / 3, th = bh / 3;
      b.add(S.box, bu, y + th * .3, z, dk, 0, 0, 0, w * .9, th * .6, w * .9);
      b.add(S.cone4, bu, y + th * .55, z, dk, 0, 0, 0, w * 1.9, th * .55, w * 1.9);
      for (const sx of [1, -1]) l.seg([bu + sx * w * .95, y + th * .55, z + w * .95], [bu, y + th * 1.1, z], pk.clone().multiplyScalar(.5)); }
    b.add(S.cyl, bu, bh, z, dk, 0, 0, 0, .004, bh * .18, .004);
    const R = srand(3);
    for (const [u, h0] of blossomPlan(97, 6, H)) { if (u < 0 || u > 1) continue; const h = h0 * HS * 1.5, x = u - .5, zz = ROW_Z.mid - .03 - R() * .03;
      tree(b, x, zz, h, '#2a0c20');
      g.add(S.ico, x + h * .05, h * 1.0, zz, C('#ff9ec4').multiplyScalar(.5), 0, 0, 0, h * .68, h * .5, h * .68);
      b.add(S.ico, x + h * .05, h * .98, zz, C('#7a2a55'), 0, 0, 0, h * .6, h * .44, h * .6); }
    const tu = .22 - .5, th = H * .8 * HS * 1.2, zn = ROW_Z.near, rc = C('#2a0512');
    for (const sx of [-1, 1]) b.add(S.cyl, tu + sx * th * .28 * .9, 0, zn, rc, 0, 0, sx * -.04, th * .09, th, th * .09);
    b.add(S.box, tu, th, zn, rc, 0, 0, 0, th * .96, th * .1, th * .12);
    b.add(S.box, tu, th * .82, zn, rc, 0, 0, 0, th * .68, th * .07, th * .08);
    g.add(S.box, tu, th + th * .06, zn, C('#ff6fa8').multiplyScalar(.5), 0, 0, 0, th * .96, th * .008, th * .125);
  },
  // 9 PRODBY KCTW (studio): no scenery on the phone either
  () => {},
];

// worlds that spin their own wire cubes (the phone's live 'glitch' effect)
export function createDiorama({table, soft = false}) {
  const out = {ok: true, index: -1, tris: 0, draws: 0, alpha: [1, 1], errors: 0};
  const group = new THREE.Group(); group.visible = false; table.add(group);
  const halves = [0, 1].map(h => {
    const mats = {
      body: soft ? new THREE.MeshLambertMaterial({vertexColors: true, transparent: true, flatShading: false}) : new THREE.MeshStandardMaterial({vertexColors: true, roughness: .55, metalness: .2, flatShading: false, transparent: true}),
      glow: new THREE.MeshBasicMaterial({vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false}),
      line: new THREE.LineBasicMaterial({vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false}),
    };
    const body = new THREE.Mesh(new THREE.BufferGeometry(), mats.body), glow = new THREE.Mesh(new THREE.BufferGeometry(), mats.glow), line = new THREE.LineSegments(new THREE.BufferGeometry(), mats.line);
    for (const o of [body, glow, line]) { o.frustumCulled = false; o.rotation.y = h ? Math.PI : 0; group.add(o); }
    glow.renderOrder = 2; line.renderOrder = 3;
    return {body, glow, line, mats};
  });
  // Void's cubes are re-posed every frame into one preallocated buffer
  let cubes = null;
  const spheres = [[], []];
  for (const h of [0, 1]) for (const x of [-.3, 0, .3]) spheres[h].push(x, .04, (h ? -1 : 1) * ROW_Z.mid, .15);

  out.set = (index, st) => {
    if (index === out.index || !st) return;
    out.index = index; out.errors = 0;
    const b = new Buf(), g = new Buf(), l = new Lines(); g.wf = new Buf(); g.wb = new Buf();
    try { shapes(); (WORLDS[index] || WORLDS[9])(b, g, l, st); } catch (e) { out.errors++; console.warn('diorama', index, e && e.message); }
    // lit materials get a faint glow of the arena's own horizon colour so dark shapes still read against the table
    tmpCol.set(st.horizon).multiplyScalar(soft ? .02 : .035);
    const glows = [g.clone().cat(g.wf), g.clone().cat(g.wb)];
    for (const h of halves) {
      h.mats.body.emissive && h.mats.body.emissive.copy(tmpCol);
      if (soft) h.mats.body.emissive && h.mats.body.emissive.copy(tmpCol);
      for (const [mesh, geo] of [[h.body, b.geometry()], [h.glow, glows[halves.indexOf(h)].geometry()], [h.line, l.geometry()]]) { mesh.geometry.dispose(); mesh.geometry = geo; }
    }
    cubes = null;
    if (index === 7) { // Void: three wire cubes per half, re-posed each frame into the tail of the line buffer
      for (const h of halves) {
        const n0 = l.p.length, arr = new Float32Array(n0 + 3 * 12 * 6), ca = new Float32Array(arr.length).fill(.55);
        arr.set(l.p); ca.set(l.c);
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(arr, 3)); geo.setAttribute('color', new THREE.BufferAttribute(ca, 3));
        geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, .05, ROW_Z.mid), 1);
        h.line.geometry.dispose(); h.line.geometry = geo; h.cubeOff = n0;
      }
      cubes = {n: 3};
    }
    out.tris = (b.tris + g.tris + g.wf.tris) | 0; out.draws = 6;
  };
  const cp = new Float32Array(24);
  function poseCubes(t) {
    for (const h of halves) {
      const arr = h.line.geometry.attributes.position.array; let o = h.cubeOff;
      for (let i = 0; i < 3; i++) {
        const u = .22 + i * .28 - .5, y = (.45 + .1 * Math.sin(t + i)) * H, sz = H * .13, a = t * (.5 + i * .2), ca = Math.cos(a), sa = Math.sin(a), hy = (H - y) * HS * 1.2 + .02;
        for (let k = 0; k < 8; k++) { const cx = (k & 1) ? 1 : -1, cz = (k & 2) ? 1 : -1, cyy = (k & 4) ? 1 : -1;
          cp[k * 3] = u + (cx * ca - cz * sa) * sz * .7; cp[k * 3 + 1] = hy + cyy * sz * .45; cp[k * 3 + 2] = ROW_Z.mid + (cx * sa + cz * ca) * sz * .7; }
        const idx = [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
        for (const [p, q] of idx) { arr[o++] = cp[p * 3]; arr[o++] = cp[p * 3 + 1]; arr[o++] = cp[p * 3 + 2]; arr[o++] = cp[q * 3]; arr[o++] = cp[q * 3 + 1]; arr[o++] = cp[q * 3 + 2]; }
      }
      h.line.geometry.attributes.position.needsUpdate = true;
    }
  }

  // t seconds; eye in table-local space; sights: Float32Array of (x,y,z)*n points that must stay visible
  out.update = (t, dt, ex, ey, ez, sights, n) => {
    if (out.index < 0) { group.visible = false; return; }
    group.visible = true;
    for (let h = 0; h < 2; h++) {
      let blocked = false; const sp = spheres[h];
      for (let i = 0; i < n && !blocked; i++) for (let s = 0; s < 12 && !blocked; s += 4) blocked = sightBlocked(ex, ey, ez, sights[i * 3], sights[i * 3 + 1], sights[i * 3 + 2], sp[s], sp[s + 1], sp[s + 2], sp[s + 3]);
      const a = out.alpha[h] = fadeStep(out.alpha[h], blocked ? FADE_MIN : 1, dt);
      const m = halves[h].mats, tr = a < .995;
      m.body.opacity = a; m.body.transparent = tr; m.glow.opacity = a; m.line.opacity = a;
    }
    if (cubes) poseCubes(t);
  };
  out.dispose = () => { for (const h of halves) { h.body.geometry.dispose(); h.glow.geometry.dispose(); h.line.geometry.dispose(); } };
  out.group = group; out.halves = halves;
  return out;
}
