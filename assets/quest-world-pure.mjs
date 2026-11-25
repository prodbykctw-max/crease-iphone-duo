// CREASE VR worlds: pure helpers (no three.js, no DOM), so the geometry of a world, its budgets and the switching rules run in node tests.
//
// A world IS the arena's painted plate. The painting is wrapped half way round the player (the other half is its mirror image, so the place
// closes into a full circle), and every part of it is pushed out to its own distance, measured by a depth model when the world was baked
// (tools/bake-world.py -> assets/worlds/<id>.png). The result is one textured relief: towers, terraces and palms stand at different depths,
// their feet on the water, and move against each other as the head moves. quest-world-kit.mjs draws it; quest-world-<id>.mjs adds what is
// particular to one arena (its island, its props, its weather).

export function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

// Hard budgets for one arena world on Quest 2 class hardware (the table, hands and menu are on top of these).
export const WORLD_LIMITS={draws:80,tris:250000,texMB:48};
// Arenas that have a 3D world, with the numbers their bake printed. Everything else keeps the flat painted plate.
//   vEye   the row of the painting (0 top, 1 bottom) that sits at eye level        vBase  the row where the scenery meets the water
//   vBottom the last row the relief uses (a short skirt of painted shore)          eyeH   the eye height the world is built around
//   waterY the height of the water around the island (the island top, y 0, is the real floor)
export const WORLDS={
  midnight:{id:'midnight',grid:[400,100],vEye:.59,vBase:.715,vBottom:.74,eyeH:1.6,waterY:-.12,rFar:220,aspect:3,invNear:4},
};
export const WORLD_ARENAS=Object.keys(WORLDS);
export const worldFor=id=>WORLD_ARENAS.includes(id)?id:null;
// Worlds are on for real GPUs. A software GL (CI, emulators) keeps the cheap flat plate unless ?world=1 forces the world on; ?world=0 always turns it off.
export function worldAllowed(search,soft){const m=/[?&]world=(\d)/.exec(search||'');if(m)return m[1]==='1';return !soft;}
// What the adaptive quality controller's step (0 best .. 3) switches off in a world: first the drifting extras, then the water reflection.
export function worldDetail(step){return {extras:step<2,mirror:step<3};}

export const texBytes=(w,h,mips=true,bpp=4)=>Math.round(w*h*bpp*(mips?4/3:1));
export const MB=b=>b/1048576;
export function sumBudget(parts){let draws=0,tris=0,tex=0;for(const p of parts){draws+=p.draws||0;tris+=p.tris||0;tex+=p.tex||0;}return {draws,tris,texMB:MB(tex)};}
export const withinLimits=b=>b.draws<=WORLD_LIMITS.draws&&b.tris<=WORLD_LIMITS.tris&&b.texMB<=WORLD_LIMITS.texMB;

// ---- the panorama mapping --------------------------------------------------------------------------------------------------------
// u runs 0..1 left to right across the painting = -90 deg .. +90 deg round the player (0.5 is straight ahead, -z).
// v runs 0 (top) .. 1 (bottom). One image height is S radii tall, so the painting keeps its proportions on the cylinder.
export const panoScale=m=>Math.PI/m.aspect;
// Distance at which the row v of the painting lies on the water plane.
export const waterDistance=(m,v)=>(m.eyeH-m.waterY)/((v-m.vEye)*panoScale(m));
// The point of the painting at (u,v), pushed out to the horizontal distance rho from the reference eye (0,eyeH,0).
export function panoPoint(m,u,v,rho,out=[0,0,0]){const a=(u-.5)*Math.PI,t=(m.vEye-v)*panoScale(m);out[0]=rho*Math.sin(a);out[1]=m.eyeH+rho*t;out[2]=-rho*Math.cos(a);return out;}
// And back: which (u,v) of the painting a direction from the reference eye shows. Directions behind the player fold onto the mirrored half.
export function panoUV(m,dx,dy,dz,out=[0,0]){const h=Math.hypot(dx,dz)||1e-9;out[0]=.5+Math.atan2(dx,Math.abs(dz))/Math.PI;out[1]=m.vEye-dy/h/panoScale(m);return out;}
// 16-bit code -> distance in metres. 0 is open sky (no relief there; the sky dome shows the painting).
export const decodeRho=(m,code)=>code>0?Math.min(m.rFar,m.invNear*65535/code):m.rFar;

// Rows added above the top of the painting: a tower that the frame cuts off keeps rising and dissolves into the night (v < 0).
export const EXTRA_V=[-.05,-.12,-.22,-.36,-.56,-.85,-1.25];

// Build the relief from the baked data. data = RGBA bytes of assets/worlds/<id>.png (width grid[0]+1, height 2*(grid[1]+1)).
// step 2 keeps every second vertex (the cheaper copy that is drawn as the reflection in the water).
// Returns {position (x,y,z), uv (u,v of the painting; v < 0 on the added rows), fx (sway, waterfall), index, tris, cols, rows}.
export function buildRelief(m,data,step=1){
  const GW=m.grid[0],GH=m.grid[1],W=GW+1,cols=Math.floor(GW/step)+1,rowsP=Math.floor(GH/step)+1,ex=EXTRA_V.length,rows=rowsP+ex,n=cols*rows;
  const position=new Float32Array(n*3),uv=new Float32Array(n*2),fx=new Float32Array(n*2),sky=new Uint8Array(n),p=[0,0,0];
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    const i=c*step,jp=r<ex?0:(r-ex)*step,o=(jp*W+i)*4,o2=((GH+1+jp)*W+i)*4,code=data[o]<<8|data[o+1],k=r*cols+c;
    const u=i/GW,v=r<ex?EXTRA_V[ex-1-r]:jp/GH*m.vBottom;
    panoPoint(m,u,v,decodeRho(m,code),p);
    // the painted shore lies a finger under the water surface so the two never fight for the same depth
    if(v>=m.vBase)p[1]=m.waterY-.012;
    position[k*3]=p[0];position[k*3+1]=p[1];position[k*3+2]=p[2];uv[k*2]=u;uv[k*2+1]=v;
    fx[k*2]=r<ex?0:data[o+2]/255;fx[k*2+1]=r<ex?0:data[o2]/255;sky[k]=code===0?1:0;
  }
  const idx=[];
  for(let r=0;r<rows-1;r++)for(let c=0;c<cols-1;c++){const a=r*cols+c,b=a+1,d=a+cols,e=d+1;
    if(sky[a]&&sky[b]&&sky[d]&&sky[e])continue; // open sky: nothing to stand there
    idx.push(a,d,b,b,d,e);}
  return {position,uv,fx,index:n>65535?new Uint32Array(idx):new Uint16Array(idx),tris:idx.length/3,cols,rows,sky};
}

// The highest point of the relief between two columns of the painting (a tower tip to hang a light on): [x,y,z], or null if it is all sky.
export function reliefPeak(m,data,u0,u1,out=[0,0,0]){
  const GW=m.grid[0],GH=m.grid[1],W=GW+1;
  for(let j=0;j<=GH;j++)for(let i=Math.max(0,Math.round(u0*GW));i<=Math.min(GW,Math.round(u1*GW));i++){const o=(j*W+i)*4,code=data[o]<<8|data[o+1];
    if(code>0)return panoPoint(m,i/GW,j/GH*m.vBottom,decodeRho(m,code),out);}
  return null;
}

// ---- Midnight: the island the table stands on and what is planted round it (metres; +x right, -z ahead, the real floor is y 0) --------
export const ISLAND={x:0,z:-.85,r:2.75};          // black marble island; the table (z -1.25) and the player (z about 0.2) are on it
export const TABLE_KEEP={x:.8,z0:-2.5,z1:.9};     // table footprint plus where the player stands and swings: nothing solid in here
export function midnightLayout(seed=7){
  const R=mulberry32(seed),rr=(a,b)=>a+(b-a)*R(),out={lamps:[],palms:[]};
  // Everything is planted four ways (left/right, ahead/behind) like the painting itself, and kept out of the view down the avenue.
  const four=(rad,deg,f)=>{const t=deg*Math.PI/180;for(const sx of [-1,1])for(const sz of [-1,1])f(ISLAND.x+sx*Math.sin(t)*rad,sz*-Math.cos(t)*rad,sx,sz);};
  // Lamp standards standing in the water at the four corners of the island.
  four(4.1,50,(x,z,sx,sz)=>out.lamps.push({x,z,h:2.75,w:.07,pink:sx*sz>0}));
  // Palms on low rocks out near the shore, in front of the painted terraces.
  for(const [rad,deg,s] of [[9.4,36,1.2],[10.6,61,1.35],[9.9,83,1.15]])four(rad,deg+rr(-2,2),(x,z)=>out.palms.push({x,z,s:s*rr(.92,1.08),rot:R()*6.283}));
  return out;
}
