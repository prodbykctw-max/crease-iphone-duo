// CREASE VR look: pure helpers for the table, pieces, rails, hands and render quality. No three.js and no DOM, so Node can test them.
// The 3D side that uses them is assets/quest-look.mjs.

// The field texture: the phone game's own table drawing, top-down. About FIELD_PX pixels across the 1-unit table width, plus a small
// margin of rail glow on every side. The VR table body is 1.06 x 1.86 m, so the margin is .03 on each side. Lower FIELD_PX on a slow headset.
export const FIELD_PX=1024;
export const FIELD_MARGIN=.03;
export const TABLE_W=1,TABLE_D=1.8;
export function fieldTextureSize(px=FIELD_PX,L=TABLE_D,margin=FIELD_MARGIN){return {w:Math.round((1+2*margin)*px),h:Math.round((L+2*margin)*px)};}
// Size of the table top plane that carries the texture (metres).
export const fieldPlaneSize=(L=TABLE_D,margin=FIELD_MARGIN)=>({w:TABLE_W+2*margin,d:L+2*margin});

// Render quality: the headset asks for 1.2x the default eye buffer, foveation stays low so the edges are not blurred.
export const XR_SCALE=1.2;
export const FOVEATION=.25;
export const FOVEATION_STEPS=[.25,.5,.75,1];
// A tiny controller for sustained slow frames: step foveation up when frames run long, back down when there is plenty of headroom, and
// refresh the field texture every other frame when drawing it is the slow part. Returns what to do; the state is kept by the caller.
export function newQuality(){return {slow:0,fast:0,step:0,fieldEvery:1,fieldMs:0};}
export function qualityStep(q,frameMs,targetMs,fieldMs=0){
  q.fieldMs=q.fieldMs?q.fieldMs*.9+fieldMs*.1:fieldMs;
  if(frameMs>targetMs*1.3){q.slow++;q.fast=0;}
  else if(frameMs<targetMs*1.05){q.fast++;q.slow=Math.max(0,q.slow-1);}
  else{q.slow=Math.max(0,q.slow-1);q.fast=0;}
  if(q.slow>=90){q.slow=0;if(q.step<FOVEATION_STEPS.length-1)q.step++;else q.fieldEvery=2;}
  if(q.fast>=600){q.fast=0;if(q.fieldEvery>1)q.fieldEvery=1;else if(q.step>0)q.step--;}
  return {foveation:FOVEATION_STEPS[q.step],fieldEvery:q.fieldEvery};
}

// Colour of a paddle's metallic ring in 3D: BIG gold, then Fire Mode orange, otherwise the equipped Garage look's ring.
export function paddleRingColour(look,big,fire,bigColour='#ffd23f'){return big?bigColour:fire?'#ff8a1e':(look&&look.ring)||'#2de2e6';}

// Which top-art canvas a puck uses: one per tint (white, each side's colour, smash gold).
export const puckTintKey=col=>String(col||'#ffffff').toLowerCase();

// Rails of the table, as data (metres, table-local: x across, z along, you at +z). Each piece is a dark body with a neon tube; the far
// half (z < 0, the CPU) takes the arena's p2 colour and your half (z > 0) its p1 colour, the way the phone draws its rails.
// side is 'p1' or 'p2'; axis is the way the piece runs.
export function railPlan(L=TABLE_D,goalHalf=.19,corner=.15){
  const half=L/2,w=.5,segs=[];
  for(const sx of [-1,1])for(const side of ['p2','p1']){
    const dir=side==='p1'?1:-1;
    // side rails: from the crease to the corner, one per half
    const z0=0,z1=dir*(half-corner);
    segs.push({kind:'side',axis:'z',side,x:sx*(w+.015),z:(z0+z1)/2,len:Math.abs(z1-z0)});
  }
  for(const side of ['p2','p1']){
    const dir=side==='p1'?1:-1;
    for(const sx of [-1,1]){
      const x0=sx*goalHalf,x1=sx*(w-corner);
      segs.push({kind:'end',axis:'x',side,x:(x0+x1)/2,z:dir*(half+.015),len:Math.abs(x1-x0)});
    }
  }
  return segs;
}
export const railCorners=(L=TABLE_D,w=.5,corner=.15)=>{const out=[];for(const sx of [-1,1])for(const sz of [-1,1])out.push({sx,sz,side:sz<0?'p2':'p1',x:sx*(w-corner),z:sz*(L/2-corner)});return out;};

// Hand bones: the XR hand joints in order, and the pairs of joints a capsule is drawn between.
export const JOINT_NAMES=['wrist','thumb-metacarpal','thumb-phalanx-proximal','thumb-phalanx-distal','thumb-tip','index-finger-metacarpal','index-finger-phalanx-proximal','index-finger-phalanx-intermediate','index-finger-phalanx-distal','index-finger-tip','middle-finger-metacarpal','middle-finger-phalanx-proximal','middle-finger-phalanx-intermediate','middle-finger-phalanx-distal','middle-finger-tip','ring-finger-metacarpal','ring-finger-phalanx-proximal','ring-finger-phalanx-intermediate','ring-finger-phalanx-distal','ring-finger-tip','pinky-finger-metacarpal','pinky-finger-phalanx-proximal','pinky-finger-phalanx-intermediate','pinky-finger-phalanx-distal','pinky-finger-tip'];
export const FINGERTIPS=[4,9,14,19,24];
// Every finger runs wrist -> metacarpal -> proximal -> ... -> tip; the thumb has no intermediate joint.
export function handBones(names=JOINT_NAMES){
  const ix=n=>names.indexOf(n),bones=[];
  for(const f of ['thumb','index-finger','middle-finger','ring-finger','pinky-finger']){
    const chain=names.filter(n=>n.startsWith(f+'-'));let prev=ix('wrist');
    for(const n of chain){bones.push([prev,ix(n)]);prev=ix(n);}
  }
  // knuckle bar across the palm
  for(const [a,b] of [['index-finger-metacarpal','middle-finger-metacarpal'],['middle-finger-metacarpal','ring-finger-metacarpal'],['ring-finger-metacarpal','pinky-finger-metacarpal']])bones.push([ix(a),ix(b)]);
  return bones;
}
// The palm: a fan of triangles from the wrist over the metacarpal bases and the first finger joints.
export function palmFan(names=JOINT_NAMES){
  const ix=n=>names.indexOf(n);
  const ring=['thumb-metacarpal','index-finger-metacarpal','index-finger-phalanx-proximal','middle-finger-phalanx-proximal','ring-finger-phalanx-proximal','pinky-finger-phalanx-proximal','pinky-finger-metacarpal'].map(ix);
  const verts=[ix('wrist'),...ring],tris=[];
  for(let i=1;i<verts.length-1;i++)tris.push(0,i,i+1);
  return {verts,tris};
}
