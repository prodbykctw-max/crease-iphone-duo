// The arena window scene (index.html SCENES: far / mid / near layers) as layout numbers for a small 3D diorama on the table.
// The random sequences below are the phone's own (same seeds, same order of draws), so every ridge, building, tree, cactus and shard sits where
// it does on the phone. No three.js here, so node can test it.

export const HORIZON = .32;     // phone: depth of one player's window strip (field units = metres on the table)
export const SCENE_PAD = .12;
export const HS = .5;           // heights are squashed to this fraction so nothing tall stands in the puck's way
export const ROW_Z = { far: .05, mid: .14, near: .27 };   // distance of each depth layer from the crease, towards its player
export const FADE_MIN = .3;

export function srand(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

// phone ridge(): returns [u, v] points, v measured down from the sky top (ground at baseV)
export function ridgePts(seed, baseV, amp, step = .05) {
  const R = srand(seed), pts = [];
  for (let u = -SCENE_PAD; u <= 1 + SCENE_PAD; u += step + R() * step) pts.push([u, baseV - (.1 + R() * .9) * amp]);
  return pts;
}

// phone buildings(): same draw order, including the window lottery and the antenna
export function buildingPlan(seed, baseV, hMax, withWin = true) {
  const R = srand(seed), out = [];
  for (let u = -SCENE_PAD; u < 1 + SCENE_PAD;) {
    const w = .014 + R() * .026, h = (.25 + R() * .75) * hMax, wins = [];
    if (withWin) for (let wy = baseV - h + .005; wy < baseV - .003; wy += .0062)
      for (let wx = u + .003; wx < u + w - .002; wx += .005)
        if (R() < .34) wins.push([wx, baseV - wy, R() < .5 ? 0 : 1]);
    let ant = 0;
    if (withWin && R() < .45) ant = h * (.15 + R() * .3);
    out.push({ u, w, h, wins, ant });
    u += w + .004 + R() * .012;
  }
  return out;
}

// phone mid layer of TOXIC (12 swamp trees), SAKURA's blossom trees, GOLD RUSH cacti, ICE shards: [u, h] lists in the phone's draw order
export function treePlan(seed, n, H, lo, span) { const R = srand(seed), out = []; for (let i = 0; i < n; i++) { const u = -SCENE_PAD + R() * (1 + 2 * SCENE_PAD), h = H * (lo + R() * span); out.push([u, h]); } return out; }
export function blossomPlan(seed, n, H) { const R = srand(seed), out = []; for (let i = 0; i < n; i++) { const u = -SCENE_PAD + R() * .7, h = H * (.22 + R() * .28); out.push([u, h]); } return out; }
export function poolPlan(seed, n, wLo, wSpan) { const R = srand(seed), out = []; for (let i = 0; i < n; i++) { const u = -SCENE_PAD + R() * (1 + 2 * SCENE_PAD), w = wLo + R() * wSpan; out.push([u, w]); } return out; }
export function diamondPlan(seed, n, H) { const R = srand(seed), out = []; for (let i = 0; i < n; i++) { const u = -SCENE_PAD + R() * (1 + 2 * SCENE_PAD), v = H * (.55 + R() * .45), s = H * (.03 + R() * .07); out.push([u, v, s]); } return out; }

// table coordinates from the phone's (u across, height above ground)
export const tx = u => Math.min(.5, Math.max(-.5, u - .5));
export const inTable = u => u >= 0 && u <= 1;

// clip a phone ridge to the table width, with end points on the table edge: [[x, height]]
export function clipRidge(pts, baseV) {
  const h = p => (baseV - p[1]) * HS, out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    if (a[0] >= 0 && a[0] <= 1) out.push([a[0] - .5, h(a)]);
    if (b && ((a[0] < 0 && b[0] > 0) || (a[0] < 1 && b[0] > 1))) {
      const edge = a[0] < 0 ? 0 : 1, k = (edge - a[0]) / (b[0] - a[0]);
      const e = [edge - .5, (h(a) + (h(b) - h(a)) * k)];
      if (edge === 0) out.push(e); else out.push(e);
    }
  }
  out.sort((p, q) => p[0] - q[0]);
  return out;
}

// the light over a half's strip: 3 spheres along it that stand for what could hide the puck
export function stripSpheres(half, out = []) {
  const s = half ? -1 : 1;
  out.length = 0;
  for (const x of [-.3, 0, .3]) out.push(x, .04, s * ROW_Z.mid, .15);
  return out;
}
