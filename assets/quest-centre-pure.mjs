// The arena's centrepiece (the sun, core, crystal, molten world, ringed planet, gold relic, prism, moon or studio orb in the middle of the table):
// the same animation numbers as the phone's own Centerpiece (assets/arena-engine.js), the size it has on the phone relative to the table, and the
// small pure helpers VR needs to float it above the table without hiding the puck. No three.js here, so node can test it.

export const CENTRE_STYLE = { sun: 0, core: 1, crystal: 2, molten: 3, planet: 4, gold: 5, prism: 6, moon: 7, studio: 8 };
export const FACETED = ['crystal', 'gold', 'prism'];
export const RINGED = ['planet', 'core', 'studio'];
const SPIN = { sun: .48, core: .65, crystal: .72, molten: .46, planet: .50, gold: .62, prism: .74, moon: .42, studio: .58 };
// the soft light the object throws on the table under it (matches each world's own colour)
export const CENTRE_GLOW = { sun: '#ff6a1a', core: '#4dff8a', crystal: '#6fd8ff', molten: '#ff5a1f', planet: '#a76bff', gold: '#ffc44d', prism: '#cfd6ff', moon: '#ffb9d8', studio: '#3aa8ff' };
// phone: the object is a 3D scene drawn into a square image that is .66 (UV: .70) table widths across, with the scene's perspective w = 4.5 - z.
// Around z = 0 one model unit is 2 / 4.5 of the half-image, so one unit is this many table widths (a table is 1 m wide):
export const UNIT_PER_IMAGE = 2 / 4.5 / 2;
export const HOVER = .05;           // clear gap between the lowest point of the object and the table
export const FADE_MIN = .3;         // opacity while the puck or a paddle is hidden behind the object

// the arena order of the phone engine (assets/arena-engine.js `worlds`): stage index -> centrepiece kind
export const ARENA_KINDS = ['sun', 'core', 'crystal', 'molten', 'planet', 'sun', 'gold', 'prism', 'moon', 'studio'];
export const centreKind = k => (k in CENTRE_STYLE ? k : 'sun');

// One frame of the centrepiece at time t (seconds), beat 0..1. Writes into `out` (made once by the caller) so nothing is allocated per frame.
export function centreFrame(kind, index, t, beat = 0, out = {}) {
  kind = centreKind(kind);
  const faceted = FACETED.includes(kind), ringed = RINGED.includes(kind), spin = SPIN[kind];
  const pulse = Math.max(0, Math.min(1, beat));
  const breathe = 1 + Math.sin(t * (kind === 'crystal' ? .95 : .55) + index) * .022 + beat * .045;
  out.kind = kind; out.style = CENTRE_STYLE[kind]; out.faceted = faceted; out.ringed = ringed;
  out.angle = t * spin;
  out.tilt = faceted ? .32 + Math.sin(t * .5) * .16 : .20 + Math.sin(t * .38 + index) * .16;
  out.bodyScale = (ringed ? .82 : 1.23) * breathe;
  out.ringAngle = t * spin * .72;
  out.ringTilt = .45 + Math.sin(t * .18) * .13;
  out.ringScale = .82;
  out.image = (index === 4 ? .70 : .66) * (1 + Math.sin(t * .7 + index) * .018 + pulse * .045);   // table widths
  out.unit = UNIT_PER_IMAGE * out.image;                                                        // metres per model unit
  out.bob = Math.sin(t * .75 + index * 1.7) * .012;                                             // the phone's own float, in table widths = metres
  return out;
}

// Half-height and outer radius of the object in model units (before .unit): how far it reaches below / sideways of its centre.
export function centreExtent(f) {
  const body = f.faceted ? 1.4 * f.bodyScale : f.bodyScale;                 // crystal points reach 1.4; spheres 1
  const ring = f.ringed ? 1.94 * f.ringScale * (Math.sin(f.ringTilt) + .06) : 0;   // the tilted ring dips this far below the equator
  return Math.max(body, ring);
}
export const centreRadius = f => Math.max(f.faceted ? 1.4 * f.bodyScale : f.bodyScale, f.ringed ? 1.94 * f.ringScale : 0) * f.unit;
export const centreHeight = f => HOVER + centreExtent(f) * f.unit + f.bob;      // centre of the object above the table surface

// Does the straight line from the eye (c) to a point on the table (s) pass through the sphere (o, r)?
export function sightBlocked(cx, cy, cz, sx, sy, sz, ox, oy, oz, r) {
  const dx = sx - cx, dy = sy - cy, dz = sz - cz, len2 = dx * dx + dy * dy + dz * dz;
  if (len2 < 1e-9) return false;
  let u = ((ox - cx) * dx + (oy - cy) * dy + (oz - cz) * dz) / len2;
  if (u <= 0 || u >= 1) return false;                // the object is not between the eye and the point
  const px = cx + dx * u - ox, py = cy + dy * u - oy, pz = cz + dz * u - oz;
  return px * px + py * py + pz * pz < r * r;
}

// Exponential approach of the object's opacity to its target (rate per second), frame-rate independent.
export function fadeStep(alpha, target, dt, rate = 7) {
  const k = 1 - Math.exp(-rate * Math.max(0, dt));
  return alpha + (target - alpha) * k;
}

// The fragment shader from the phone's Centerpiece (arena-engine.js), made to run on a real, lit 3D object seen from any side: the view vector
// replaces the phone's fixed "looking down -z", a uniform opacity lets it fade, and the phone's own main() becomes shade().
export function solidFragment(src) {
  let s = String(src);
  s = s.replace('precision mediump float;', 'precision mediump float; varying vec3 V; uniform float alpha;');
  s = s.replace('void main(){', 'void shade(){');
  s = s.split('abs(n.z)').join('abs(dot(n,V))');
  s = s.replace('reflect(-light,n),vec3(0.,0.,1.))', 'reflect(-light,n),V)');
  return s + '\nvoid main(){ shade(); gl_FragColor.a *= alpha; }';
}
