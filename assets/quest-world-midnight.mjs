// CREASE VR world: MIDNIGHT. The neon city of the painted arena as a real place: the player and the table stand on a black marble island
// in a still pool, the painted city rises all round it as a relief with real depth (statues, terraces, waterfalls, palms, the avenue to
// the far skyline) and stands mirrored in the water. Round the island: neon pylons and palms in the water, mist, motes, searchlights and
// the night traffic of the phone arena.
import * as THREE from './vendor/three.module.min.js';
import {WORLDS,waterDistance,midnightLayout,reliefPeak,ISLAND,mulberry32,texBytes} from './quest-world-pure.mjs';
import {loadWorldData,panoUniforms,buildReliefMeshes,skyMaterial,waterMaterial,propUniforms,propMaterial,GB,canvas2d,newTracker,noiseCanvas,flareCanvas,glowMaterial,moteMaterial,beamMaterial,measure} from './quest-world-kit.mjs';

const META=WORLDS.midnight;
export const DATA_URL='assets/worlds/midnight.png';
const lin=c=>{const k=new THREE.Color(c);return [k.r,k.g,k.b];};
const hexA=(c,a)=>{const k=new THREE.Color(c).convertLinearToSRGB();return `rgba(${Math.round(k.r*255)},${Math.round(k.g*255)},${Math.round(k.b*255)},${a})`;};
// neon reads as a hot tube: the colour pulled a little towards white
const hot=(c,k=.3)=>c.map(v=>v+(1-v)*k);

// ---- textures ------------------------------------------------------------------------------------------------------------------
function marbleCanvas(R,P,S=512){
  const [c,x]=canvas2d(S,S),n=noiseCanvas(128,R,4);x.fillStyle='#0b0916';x.fillRect(0,0,S,S);
  x.globalAlpha=.5;x.globalCompositeOperation='screen';x.drawImage(n,0,0,S,S);x.globalCompositeOperation='source-over';x.globalAlpha=1;x.fillStyle='rgba(9,7,22,.66)';x.fillRect(0,0,S,S);
  // veins: long wandering hairlines, a few thicker, wrapped at the edges so the tile repeats
  for(let v=0;v<34;v++){const px=R()*S,py=R()*S,a=R()*6.283,big=R()<.2;x.strokeStyle=R()<.55?hexA('#9fd8ff',big?.3:.13+R()*.1):hexA(P.violet,big?.3:.14+R()*.1);x.lineWidth=big?1.6:.5+R()*.7;
    for(const [ox,oy] of [[0,0],[S,0],[-S,0],[0,S],[0,-S]]){let qx=px,qy=py,b=a;const R2=mulberry32(v*977+13);x.beginPath();x.moveTo(qx+ox,qy+oy);for(let s=0;s<46;s++){b+=(R2()-.5)*.75;qx+=Math.cos(b)*8;qy+=Math.sin(b)*8;x.lineTo(qx+ox,qy+oy);}x.stroke();}}
  for(let i=0;i<900;i++){x.fillStyle=`rgba(${120+R()*80|0},${110+R()*70|0},${190+R()*60|0},${.03+R()*.05})`;x.fillRect(R()*S,R()*S,1+R()*2,1+R()*2);}
  return c;
}
// The island top: polished marble with an art-deco inlay (pale hairlines, a fan band) and the two neon rings set into it.
function islandCanvases(R,P,marble){
  const S=1024,m=S/2,[c,x]=canvas2d(S,S),[e,ex]=canvas2d(S,S);
  x.fillStyle=x.createPattern(marble,'repeat');x.fillRect(0,0,S,S);x.fillStyle='rgba(4,3,12,.25)';x.fillRect(0,0,S,S);ex.fillStyle='#000';ex.fillRect(0,0,S,S);
  const inlay=(a)=>`rgba(196,164,255,${a})`,ring=(ctx,r,w,col)=>{ctx.strokeStyle=col;ctx.lineWidth=w;ctx.beginPath();ctx.arc(m,m,r*m,0,6.2832);ctx.stroke();};
  const ray=(ctx,a,r0,r1,w,col)=>{ctx.strokeStyle=col;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(m+Math.cos(a)*r0*m,m+Math.sin(a)*r0*m);ctx.lineTo(m+Math.cos(a)*r1*m,m+Math.sin(a)*r1*m);ctx.stroke();};
  // a darker polished field inside the band
  {const g=x.createRadialGradient(m,m,0,m,m,m);g.addColorStop(0,'rgba(2,1,8,.35)');g.addColorStop(.74,'rgba(2,1,8,.2)');g.addColorStop(.78,'rgba(2,1,8,0)');x.fillStyle=g;x.fillRect(0,0,S,S);}
  // sunburst hairlines, long and short
  for(let i=0;i<96;i++){const a=i/96*6.2832;ray(x,a,i%8===0?.24:i%2===0?.52:.64,.765,i%8===0?1.6:.9,inlay(i%8===0?.42:.2));}
  ring(x,.24,1.6,inlay(.4));ring(x,.52,1.2,inlay(.3));ring(x,.765,2.4,inlay(.6));
  // the fan band: overlapping arcs between two rules, in the manner of the city's facades
  ring(x,.80,5,'rgba(3,2,10,.9)');ring(x,.93,5,'rgba(3,2,10,.9)');ring(x,.795,1.4,inlay(.55));ring(x,.935,1.4,inlay(.55));
  for(let i=0;i<40;i++){const a=(i+.5)/40*6.2832,cx=m+Math.cos(a)*.8*m,cy=m+Math.sin(a)*.8*m;x.save();x.beginPath();x.arc(m,m,.93*m,0,6.2832);x.arc(m,m,.8*m,0,6.2832,true);x.clip();
    for(let k=1;k<=4;k++){x.strokeStyle=inlay(.16+.1*k);x.lineWidth=1.3;x.beginPath();x.arc(cx,cy,k*.034*m,0,6.2832);x.stroke();}x.restore();}
  // soft contact shadow where the table stands (the island is centred a little behind it; -z is up on this canvas)
  {const ty=m+(-1.25-ISLAND.z)/ISLAND.r*m,g=x.createRadialGradient(m,ty,0,m,ty,.5*m);g.addColorStop(0,'rgba(0,0,0,.55)');g.addColorStop(.55,'rgba(0,0,0,.28)');g.addColorStop(1,'rgba(0,0,0,0)');x.save();x.translate(m,ty);x.scale(.62,1);x.translate(-m,-ty);x.fillStyle=g;x.fillRect(0,0,S,S);x.restore();}
  // neon set into the stone: a cyan ring near the rim, a pink one inside the band, studs on the band
  const neon=(r,w,col,blur)=>{x.strokeStyle='rgba(2,1,8,.95)';x.lineWidth=w+5;x.beginPath();x.arc(m,m,r*m,0,6.2832);x.stroke();ex.shadowColor=col;ex.shadowBlur=blur;ring(ex,r,w,col);ex.shadowBlur=0;ring(ex,r,w*.4,'rgba(255,255,255,.75)');};
  neon(.966,3,P.cyan,12);neon(.776,2,P.pink,9);
  for(let i=0;i<20;i++){const a=i/20*6.2832,px=m+Math.cos(a)*.865*m,py=m+Math.sin(a)*.865*m,col=i%2?P.pink:P.cyan;
    x.save();x.translate(px,py);x.rotate(a+Math.PI/4);x.fillStyle='rgba(2,1,8,.95)';x.fillRect(-8,-8,16,16);x.strokeStyle=inlay(.5);x.lineWidth=1.2;x.strokeRect(-8,-8,16,16);x.restore();
    ex.save();ex.translate(px,py);ex.rotate(a+Math.PI/4);ex.shadowColor=col;ex.shadowBlur=10;ex.fillStyle=col;ex.fillRect(-4.5,-4.5,9,9);ex.shadowBlur=0;ex.fillStyle='rgba(255,255,255,.7)';ex.fillRect(-2,-2,4,4);ex.restore();}
  return [c,e];
}
function barkCanvas(R){const [c,x]=canvas2d(128,256);x.fillStyle='#1c1626';x.fillRect(0,0,128,256);
  for(let i=0;i<700;i++){x.fillStyle=`rgba(${60+R()*50|0},${48+R()*36|0},${66+R()*44|0},${.1+R()*.22})`;x.fillRect(R()*128,R()*256,1+R()*1.5,3+R()*12);}
  for(let r=0;r<20;r++){const y=r*12.8+R()*3;x.fillStyle='rgba(5,3,12,.7)';x.fillRect(0,y,128,2.5+R()*1.5);x.fillStyle='rgba(150,125,175,.22)';x.fillRect(0,y+3.5,128,1.2);
    for(let k=0;k<6;k++){x.fillStyle='rgba(5,3,12,.5)';x.fillRect(R()*128,y+3,2+R()*3,6+R()*4);}}
  return c;}
// One palm frond: a rib and close-set leaflets that sweep towards the tip. Transparent between the leaflets.
function frondCanvas(R){const W=256,H=1024,[c,x]=canvas2d(W,H);x.clearRect(0,0,W,H);x.lineCap='round';
  const N=58;for(let i=0;i<N;i++){const f=i/(N-1),y=14+f*(H-90),len=(.3+.7*Math.sin(Math.PI*Math.min(1,f*1.2+.08)))*(1-.5*f*f)*120,sw=60+f*70;
    for(const s of [-1,1]){const l=len*(.82+R()*.24),ex=128+s*l,ey=y+sw+(R()-.5)*16;
      const g=x.createLinearGradient(128,y,ex,ey);g.addColorStop(0,'#3d8a70');g.addColorStop(.6,'#24604f');g.addColorStop(1,'#16423c');
      x.fillStyle=g;x.beginPath();x.moveTo(128,y-3.2);x.quadraticCurveTo(128+s*l*.55,y+sw*.3-3.5,ex,ey);x.quadraticCurveTo(128+s*l*.5,y+sw*.36+3,128,y+3.2);x.closePath();x.fill();}}
  const g=x.createLinearGradient(0,0,0,H);g.addColorStop(0,'#5a9a7c');g.addColorStop(1,'#2a6a54');x.strokeStyle=g;x.lineWidth=6;x.beginPath();x.moveTo(128,0);x.lineTo(128,H-70);x.stroke();
  x.lineWidth=3;x.beginPath();x.moveTo(128,H-70);x.lineTo(128,H-10);x.stroke();
  return c;}

// ---- solid geometry ----------------------------------------------------------------------------------------------------------
// A chamfered square prism through the rows [[halfWidth, y], ...] (flat shaded), for stepped art-deco stonework.
function prism(gb,cx,cz,rows,o={}){const ch=o.chamfer??.18,P=[];
  for(const [w,y] of rows){const k=w*ch,pts=[[w-k,-w],[w,-w+k],[w,w-k],[w-k,w],[-w+k,w],[-w,w-k],[-w,-w+k],[-w+k,-w]];pts.push(pts[0]);P.push(pts.map(p=>[cx+p[0],y,cz+p[1]]));}
  gb.grid(P,8,{...o,flat:true,vAt:i=>rows[i][1]/(o.vTile||1.5)});}
// Thin lit strips on the four faces of a square prism of half-width w, from y0 to y1 (hw = how much of the face they span).
function faceBand(gb,x,z,w0,w1,y0,y1,hw,T,g){for(let f=0;f<4;f++){const a=f*Math.PI/2,nx=Math.cos(a),nz=Math.sin(a),tx=nz,tz=-nx,o=.003;
  gb.quad([[x+nx*(w0+o)-tx*w0*hw,y0,z+nz*(w0+o)-tz*w0*hw],[x+nx*(w0+o)+tx*w0*hw,y0,z+nz*(w0+o)+tz*w0*hw],[x+nx*(w1+o)+tx*w1*hw,y1,z+nz*(w1+o)+tz*w1*hw],[x+nx*(w1+o)-tx*w1*hw,y1,z+nz*(w1+o)-tz*w1*hw]],[nx,0,nz],[[0,0],[1,0],[1,1],[0,1]],T,g);}}
// An art-deco lamp standard rising from the water: stepped foot, slender shaft with a hairline of light, a glass lantern and a needle.
function lamp(gb,p,P,halos){
  const {x,z,h,w}=p,col=lin(p.pink?P.pink:P.cyan),alt=lin(p.pink?P.cyan:P.pink),stone=[1.1,1.05,1.3],dark=[.7,.68,.9];
  const y0=.34,hs=h-.5,wAt=y=>w*(1-.4*Math.max(0,(y-y0)/(hs-y0)));
  prism(gb,x,z,[[w*2.6,-.5],[w*2.6,.05],[w*2.4,.08],[w*1.9,.08],[w*1.9,.24],[w*1.7,.27],[w*1.25,.27],[w*1.25,y0-.02],[w,y0]],{tint:dark,uRep:2});
  prism(gb,x,z,[[w,y0],[wAt(hs),hs]],{tint:stone,uRep:1});
  // collar, lantern cage, stepped cap
  const wl=w*1.25,yl=hs+.05,yt=yl+.3;
  prism(gb,x,z,[[wAt(hs),hs],[wl*1.25,hs+.02],[wl*1.25,yl],[wl*.96,yl]],{tint:dark,uRep:1});
  prism(gb,x,z,[[wl*.96,yl],[wl*1.2,yt]],{tint:[.25,.24,.32],uRep:1,chamfer:.3});
  prism(gb,x,z,[[wl*1.2,yt],[wl*1.45,yt+.012],[wl*1.45,yt+.04],[wl*.9,yt+.075],[wl*.9,yt+.1],[wl*.45,yt+.14],[wl*.45,yt+.165],[.012,yt+.2]],{tint:dark,uRep:1});
  gb.revolve(x,yt+.2,z,[[.006,0],[.004,.2],[.0,.22]],5,{tint:hot(col,.55),glow:1.4});
  faceBand(gb,x,z,wl*.96,wl*1.2,yl+.012,yt-.012,.62,[hot(col,.5),hot(col,.5),hot(col,.15),hot(col,.15)],1.25);
  faceBand(gb,x,z,wAt(y0+.08),wAt(hs-.06),y0+.08,hs-.06,.16,[hot(col,.1),hot(col,.1),hot(col,.25),hot(col,.25)],.6);
  faceBand(gb,x,z,w*1.9,w*1.9,.15,.166,.84,[hot(alt,.3)],1.1);
  halos.push({x,y:(yl+yt)/2,z,s:2.4,c:col.map(v=>v*.36)},{x,y:(yl+yt)/2,z,s:.8,c:hot(col,.4).map(v=>v*.7)});
}
// The low stone planter a palm grows from.
function planter(gb,x,z,r,P){const y=META.waterY,k=lin(P.cyan);
  prism(gb,x,z,[[r*.9,y-.5],[r*.9,y+.07],[r,y+.09],[r,y+.2],[r*.9,y+.22],[r*.55,y+.22]],{tint:[.75,.72,.95],uRep:2,chamfer:.3});
  faceBand(gb,x,z,r*.9,r*.9,y+.035,y+.05,.66,[hot(k,.3)],.9);}
function palmGeometry(R){const tk=new GB(),fr=new GB(),rr=(a,b)=>a+(b-a)*R(),path=[],top=[.7,4.6,.3];
  for(let i=0;i<=14;i++){const t=i/14;path.push([top[0]*t*t,top[1]*t,.2*Math.sin(t*Math.PI)+top[2]*t,(.115-.055*t)*(i===0?1.7:i===1?1.25:1)*(i===14?1.3:1)]);}
  tk.tube(path,8,{tint:[1,.95,1.1],uRep:1,vRep:5,ramp:t=>.7+.4*t});
  // the boss the fronds spring from
  tk.revolve(top[0],top[1]-.1,top[2],[[.06,0],[.11,.08],[.1,.2],[.04,.3],[0,.32]],8,{tint:[.8,1,.95],uRep:1,vRep:.5});
  const N=30;
  for(let k=0;k<N;k++){const ring=k<9?0:k<20?1:2,ph=k*2.39996+rr(-.2,.2),dx=Math.cos(ph),dz=Math.sin(ph),el=[1.0,.5,-.05][ring]+rr(-.14,.14),L=[1.7,2.4,2.3][ring]*rr(.88,1.1),droop=[.95,1.3,1.7][ring]*rr(.9,1.15),sp=[],wd=[],n=10;
    for(let i=0;i<n;i++){const t=i/(n-1),out=Math.cos(el)*L*t*(1-.14*t),up=Math.sin(el)*L*t-droop*t*t*L*.42;sp.push([top[0]+dx*out,top[1]+.14+up,top[2]+dz*out]);wd.push(.3*Math.sin(Math.PI*(.1+.9*Math.pow(t,.75)))*(1-.25*t)+.015);}
    fr.strip(sp,wd,[-dz,0,dx],{tint:[1,1,1],ramp:t=>[1,.8,.55][ring]*(.6+.5*t),fold:.5});}
  return [tk,fr];}

export async function build({renderer,colors,plate,aniso=4}){
  const c=colors||{},P={pink:c.grid||'#ff2a8a',cyan:c.p1||'#2de2e6',violet:c.wire||'#c04dff',zenith:'#030108',skyHor:'#150a24',gain:1.08,reflGain:.85,
    amb:'#1c1734',keyDir:[.45,.5,-.75],key:'#7a2456',fillDir:[-.6,.45,.65],fill:'#155f70',up:'#0f5d68',rim:'#3d2c78'};
  const {data,bytes}=await loadWorldData(DATA_URL);
  const R=mulberry32(77),rr=(a,b)=>a+(b-a)*R(),L=midnightLayout(),PINK=lin(P.pink),CYAN=lin(P.cyan),VIO=lin(P.violet);
  const tr=newTracker(),group=new THREE.Group();group.name='world';
  const geos=[],mats=[],mirror=[],extras=[];
  const add=(m,o={})=>{if(o.order!==undefined)m.renderOrder=o.order;m.frustumCulled=false;if(o.name)m.name=o.name;group.add(m);if(!geos.includes(m.geometry))geos.push(m.geometry);mats.push(m.material);if(o.mirror)mirror.push(m);if(o.extra)extras.push(m);return m;};
  tr.note(plate,texBytes(plate.image.width,plate.image.height),'painted plate (the same texture the flat backdrop uses)');
  const U=panoUniforms(META,plate,P),LU=propUniforms(P);

  // ---- the painted city as a relief: ahead, behind, and both in the water ----
  for(const m of buildReliefMeshes(META,data,U).meshes)add(m,{mirror:m.userData.mirror});
  const sky=add(new THREE.Mesh(new THREE.SphereGeometry(420,48,24),skyMaterial(U)),{order:20,name:'sky'});sky.position.set(0,META.eyeH,0);
  const poolR=waterDistance(META,META.vBase);
  const water=add(new THREE.Mesh(new THREE.CircleGeometry(poolR,72),waterMaterial(U,{island:[ISLAND.x,ISLAND.z,ISLAND.r+.06,poolR],glowA:P.cyan,glowB:P.pink})),{order:1,name:'water'});
  water.rotation.x=-Math.PI/2;water.position.y=META.waterY;

  // ---- textures ----
  const marbleC=marbleCanvas(R,P),marble=tr.tex(marbleC,{aniso,name:'marble'}),[topC,topE]=islandCanvases(R,P,marbleC);
  const topMap=tr.tex(topC,{aniso,repeat:false,name:'island top'}),topEmis=tr.tex(topE,{aniso,repeat:false,name:'island neon'});
  const bark=tr.tex(barkCanvas(R),{aniso,name:'bark'}),frond=tr.tex(frondCanvas(R),{aniso,repeat:false,name:'frond'}),flare=tr.tex(flareCanvas(),{aniso:1,repeat:false,name:'flare'});

  // ---- the island: polished top, a lip, a band of light just above the water, a skirt going under ----
  const halos=[];
  {const g=new GB();g.disc(ISLAND.x,0,ISLAND.z,ISLAND.r,96);add(new THREE.Mesh(g.geometry(),propMaterial(U,LU,{map:topMap,emap:topEmis,sheen:.34,gloss:.6,spec:.3,shin:90,emis:1.25,tintMul:1.6})),{name:'island-top'});}
  const solid=new GB(),r0=ISLAND.r;
  solid.revolve(ISLAND.x,0,ISLAND.z,[[r0+.022,-.022],[r0,0]],96,{tint:[1.5,1.45,1.8],uRep:18,vRep:.02});
  solid.revolve(ISLAND.x,0,ISLAND.z,[[r0+.012,-.036],[r0+.022,-.034],[r0+.022,-.022]],96,{tint:[1.1,1.05,1.3],uRep:18,vRep:.02});
  solid.revolve(ISLAND.x,0,ISLAND.z,[[r0+.012,-.078],[r0+.012,-.036]],96,{tint:hot(CYAN,.3),glow:1.3,uRep:18,vRep:.02});
  solid.revolve(ISLAND.x,0,ISLAND.z,[[r0+.06,-.6],[r0+.06,-.1],[r0+.05,-.082],[r0+.012,-.078]],96,{tint:[1.1,1.05,1.3],uRep:18,vRep:.3});
  // ---- lamp standards and the planters the palms grow from ----
  for(const p of L.lamps)lamp(solid,p,P,halos);
  for(const p of L.palms)planter(solid,p.x,p.z,.4*p.s,P);
  const solidGeo=solid.geometry();
  add(new THREE.Mesh(solidGeo,propMaterial(U,LU,{map:marble,sheen:.3,gloss:1.5,spec:.4,shin:50,emis:1.35})),{name:'stone'});
  add(new THREE.Mesh(solidGeo,propMaterial(U,LU,{map:marble,sheen:.25,emis:1.35,flipY:true})),{name:'stone-reflection',mirror:true});
  // ---- palms ----
  {const [tk,fr]=palmGeometry(R),tg=tk.geometry(),fg=fr.geometry(),n=L.palms.length,mx=new THREE.Matrix4(),q=new THREE.Quaternion(),e=new THREE.Euler(),pos=new THREE.Vector3(),sc=new THREE.Vector3();
    const mk=(geo,mat,name,o)=>{const m=add(new THREE.InstancedMesh(geo,mat,n),{name,...o});L.palms.forEach((p,i)=>{e.set(0,p.rot,0);q.setFromEuler(e);pos.set(p.x,META.waterY+.2,p.z);sc.setScalar(p.s);mx.compose(pos,q,sc);m.setMatrixAt(i,mx);});m.instanceMatrix.needsUpdate=true;return m;};
    const fo={map:frond,alphaTest:true,double:true,sway:1,frond:true,spec:.2,shin:14,tintMul:1.5};
    mk(tg,propMaterial(U,LU,{map:bark,sway:1,spec:.15,shin:12,tintMul:1.9}),'palm-trunks');mk(fg,propMaterial(U,LU,fo),'palm-fronds');
    mk(tg,propMaterial(U,LU,{map:bark,sway:1,tintMul:1.9,flipY:true}),'palm-trunks-reflection',{mirror:true});mk(fg,propMaterial(U,LU,{...fo,flipY:true}),'palm-fronds-reflection',{mirror:true});}

  // ---- weather: halos, mist on the water, night traffic over the avenue, motes, searchlights ----
  const mx=new THREE.Matrix4(),pos=new THREE.Vector3(),q=new THREE.Quaternion(),sc=new THREE.Vector3(),col=new THREE.Color(),quad=new THREE.PlaneGeometry(1,1);
  const sprites=(list,mat,name,o)=>{const m=add(new THREE.InstancedMesh(quad,mat,list.length),{name,...o});list.forEach((h,i)=>{pos.set(h.x,h.y,h.z);sc.set(h.s,h.sy||h.s,1);mx.compose(pos,q.identity(),sc);m.setMatrixAt(i,mx);col.setRGB(h.c[0],h.c[1],h.c[2]);m.setColorAt(i,col);});m.instanceMatrix.needsUpdate=true;m.instanceColor.needsUpdate=true;return m;};
  sprites(halos,glowMaterial(U,flare,{pulse:.14,opacity:1}),'halos',{order:6});
  {const mist=[];for(let i=0;i<18;i++){const a=R()*6.283,rad=rr(8.5,13.5);mist.push({x:Math.sin(a)*rad,y:META.waterY+rr(.25,.9),z:Math.cos(a)*rad,s:rr(5,9),sy:rr(1.1,2),c:R()<.6?[.022,.05,.07]:[.045,.02,.06]});}
    for(let i=0;i<8;i++){const a=R()*6.283,rad=rr(4,7.5);mist.push({x:Math.sin(a)*rad,y:META.waterY+rr(.1,.3),z:Math.cos(a)*rad,s:rr(3,5),sy:rr(.5,.9),c:[.012,.028,.04]});}
    sprites(mist,glowMaterial(U,flare,{mist:true,pulse:.3,opacity:.7,drift:1.6}),'mist',{order:4,extra:true});}
  {const cars=[];for(let i=0;i<14;i++){const back=i%2?1:-1;cars.push({x:0,y:rr(4,26),z:back*rr(70,150),s:rr(2.4,4.2),sy:.5,c:i%4<2?PINK:CYAN});}
    sprites(cars,glowMaterial(U,flare,{traffic:true,pulse:0,opacity:.9,drift:150}),'traffic',{order:5,extra:true});}
  {const N=220,p=new Float32Array(N*3),sd=new Float32Array(N*4),cl=new Float32Array(N*3),pal=[CYAN,PINK,lin('#ffb36b'),VIO,CYAN];
    for(let i=0;i<N;i++){const a=R()*6.283,rad=i<N*.4?rr(1.5,6):rr(4,14);p[i*3]=Math.sin(a)*rad;p[i*3+1]=rr(0,4.2);p[i*3+2]=Math.cos(a)*rad;for(let k=0;k<4;k++)sd[i*4+k]=R();const c2=pal[(R()*pal.length)|0];cl[i*3]=c2[0];cl[i*3+1]=c2[1];cl[i*3+2]=c2[2];}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setAttribute('aSeed',new THREE.BufferAttribute(sd,4));g.setAttribute('aCol',new THREE.BufferAttribute(cl,3));
    add(new THREE.Points(g,moteMaterial(U,{scale:900,height:4.6,rise:.25})),{name:'motes',order:7,extra:true});}
  // searchlights on the tips of the tallest painted towers, ahead and behind, sweeping the sky (one matrix each per frame, written in place)
  const beams=[];[[.47,.53,PINK],[.25,.275,CYAN],[.69,.71,VIO]].forEach(([u0,u1,cc],k)=>{const tip=reliefPeak(META,data,u0,u1);if(tip)for(const sz of [1,-1])beams.push({x:tip[0],y:tip[1],z:tip[2]*sz,c:sz>0?cc:[cc[2],cc[1],cc[0]],ph:k*2.1+sz});});
  const cone=new THREE.CylinderGeometry(.2,3.4,1,20,1,true),beamMesh=add(new THREE.InstancedMesh(cone,beamMaterial(U,{strength:.035}),Math.max(1,beams.length)),{name:'searchlights',order:3,extra:true});beamMesh.count=beams.length;
  const dir=new THREE.Vector3(),dn=new THREE.Vector3(0,-1,0);
  const aim=(i,t)=>{const b=beams[i],a=Math.sin(t*.09+b.ph)*.9+b.ph*2.,el=1.05+.25*Math.sin(t*.06+b.ph*3.);dir.set(Math.sin(a)*Math.cos(el),Math.sin(el),Math.cos(a)*Math.cos(el));q.setFromUnitVectors(dn,dir);pos.set(b.x,b.y,b.z).addScaledVector(dir,75);sc.set(1,150,1);mx.compose(pos,q,sc);beamMesh.setMatrixAt(i,mx);};
  beams.forEach((b,i)=>{aim(i,0);col.setRGB(b.c[0],b.c[1],b.c[2]);beamMesh.setColorAt(i,col);});beamMesh.instanceColor.needsUpdate=true;

  return {group,id:'midnight',dataBytes:bytes,
    update(t){U.uTime.value=t;if(beamMesh.visible){for(let i=0;i<beams.length;i++)aim(i,t);beamMesh.instanceMatrix.needsUpdate=true;}},
    detail(d){for(const m of mirror)m.visible=d.mirror;for(const m of extras)m.visible=d.extras;},
    stats(){return {...measure(group,tr),dataBytes:bytes};},
    dispose(){group.removeFromParent();for(const g of geos)g.dispose();for(const m of mats)m.dispose();quad.dispose();cone.dispose();tr.dispose();}};
}
