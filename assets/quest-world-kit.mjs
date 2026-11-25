// CREASE VR worlds: the shared kit every arena world is built from (see quest-world-pure.mjs for the idea and the mapping).
//   relief    the painted plate as a textured relief, drawn four times: ahead, mirrored behind the player, and both again upside down
//             under the water as the reflection (a cheaper half-resolution copy);
//   sky       a dome that shows the painting's own sky where no relief stands, stars and slow cloud above it, and its reflection;
//   water     the surface of the pool: lets the reflection through more at grazing angles, glows round the island, glints;
//   props     a small lit material + geometry builder for the solid things an arena plants near the player (island, pylons, palms),
//             with emissive trim, a sheen that reflects the painted city, and the same water reflection;
//   weather   instanced glow sprites (halos, mist, traffic), drifting motes, sweeping light shafts.
// Nothing here allocates per frame: update() only writes uniforms.
import * as THREE from './vendor/three.module.min.js';
import {buildRelief,panoScale,texBytes} from './quest-world-pure.mjs';

// The baked world of an arena: its numbers (assets/worlds/<id>.json) and the data image's bytes (opaque RGB, read back unchanged).
export async function loadWorldData(id){
  const [jr,pr]=await Promise.all([fetch('assets/worlds/'+id+'.json'),fetch('assets/worlds/'+id+'.png')]);if(!jr.ok||!pr.ok)throw new Error('world data '+jr.status+' '+pr.status);
  const meta=await jr.json(),blob=await pr.blob(),bmp=await createImageBitmap(blob,{colorSpaceConversion:'none',premultiplyAlpha:'none'});
  const c=document.createElement('canvas');c.width=bmp.width;c.height=bmp.height;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(bmp,0,0);
  const data=x.getImageData(0,0,c.width,c.height).data;bmp.close?.();c.width=c.height=0;
  return {meta,data,bytes:blob.size};
}

// ---- shader pieces -------------------------------------------------------------------------------------------------------------
const NOISE=`
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}`;
// uPano = (vEye, S, vBottom, waterY). art(): the painting at (u,v); above its top edge (v < 0) the top row carries on and fades into the night.
const PANO=`
#define PI 3.14159265
uniform sampler2D uMap;uniform float uTime;uniform vec4 uPano;uniform vec3 uEye;uniform vec3 uZen;uniform vec3 uHor;uniform float uGain;uniform float uReflGain;
${NOISE}
vec2 panoUV(vec3 d){return vec2(.5+atan(d.x,abs(d.z))/PI,uPano.x-d.y/max(length(d.xz),1e-5)/uPano.y);}
vec3 skyProc(vec3 d){float h=clamp(d.y,0.,1.);return mix(uHor,uZen,pow(h,.45));}
vec3 art(vec2 uv,vec3 d,float bias){float up=max(0.,-uv.y);vec3 c=texture2D(uMap,vec2(uv.x,1.-clamp(uv.y,.004,uPano.z)),bias+up*16.).rgb*uGain;
  return mix(c,skyProc(d),smoothstep(0.,.36,up+(vn(vec2(uv.x*46.,uv.y*7.))-.5)*.1*step(.001,up)));}
// Ripples: where the line of sight to a reflected point crosses the water, and how the surface tilts there.
vec2 ripple(vec3 W){float k=(cameraPosition.y-uPano.w)/max(cameraPosition.y-W.y,1e-3);vec2 P=cameraPosition.xz+(W.xz-cameraPosition.xz)*k;float t=uTime;
  return vec2(vn(P*2.1+vec2(t*.33,t*.2))-.5,vn(P*2.1+vec2(-t*.26,t*.31)+11.)-.5)+.5*vec2(vn(P*5.7+t*.55)-.5,vn(P*5.7-t*.5+5.)-.5);}`;

export function panoUniforms(meta,map,P){const C=c=>new THREE.Color(c);return {
  uMap:{value:map},uTime:{value:0},uPano:{value:new THREE.Vector4(meta.vEye,panoScale(meta),meta.vBottom,meta.waterY)},uEye:{value:new THREE.Vector3(0,meta.eyeH,0)},
  uZen:{value:C(P.zenith)},uHor:{value:C(P.skyHor)},uGain:{value:P.gain??1},uReflGain:{value:P.reflGain??.8}};}

// The relief. flip = [1, +-1 (reflection in the water), +-1 (the mirrored half behind the player)].
// Flowing parts (waterfalls, lava) run inside the baked mask wherever the painting has the flow's colour: by default water (blue-green
// brighter than red); fallKey = [wr,wg,wb,threshold] picks another colour (the flow is where dot(colour, w) > threshold, e.g. lava
// [1,.2,-1,.12]). fall = the highlight colour, fallSpeed its speed, breathe = how much lit windows and glows pulse.
export function reliefMaterial(U,{flip=[1,1,1],fall=[.45,.85,1],fallKey=null,fallSpeed=1,breathe=.13}={}){
  const refl=flip[1]<0;
  return new THREE.ShaderMaterial({uniforms:{...U,uFlip:{value:new THREE.Vector3(...flip)},uFall:{value:new THREE.Color(...fall)},uKey:{value:new THREE.Vector4(...(fallKey||[0,0,0,-1]))},uFlow:{value:new THREE.Vector2(fallSpeed,breathe)}},defines:refl?{REFLECT:''}:{},side:THREE.DoubleSide,
    vertexShader:`attribute vec2 aFx;uniform vec3 uFlip;uniform float uTime;uniform vec4 uPano;varying vec2 vUV;varying vec3 vW;varying vec3 vO;varying vec2 vFx;
void main(){vec3 p=position;float sw=aFx.x;
  p.x+=(sin(uTime*1.1+p.z*.35+p.x*.2)*.09+sin(uTime*2.3+p.x)*.03)*sw;p.z+=cos(uTime*.9+p.x*.3)*.06*sw;
  vO=p;if(uFlip.y<0.)p.y=2.*uPano.w-p.y;p.z*=uFlip.z;
  vec4 w=modelMatrix*vec4(p,1.);vW=w.xyz;vUV=uv;vFx=aFx;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader:`${PANO}
uniform vec3 uFall;uniform vec4 uKey;uniform vec2 uFlow;varying vec2 vUV;varying vec3 vW;varying vec3 vO;varying vec2 vFx;
void main(){vec2 uv=vUV;float bias=0.;vec3 d=normalize(vO-uEye);
  #ifdef REFLECT
  if(vO.y<uPano.w+.004)discard;
  uv+=ripple(vW)*vec2(.0016,.0075);bias=1.3;
  #endif
  vec3 c=art(uv,d,bias);
  // waterfalls: streaks of falling water inside the baked mask, wherever the painting is water-coloured
  float m=vFx.y*(uKey.a<0.?smoothstep(.04,.26,min(c.g,c.b)-c.r*.75):smoothstep(uKey.a,uKey.a+.22,dot(c,uKey.rgb)));
  if(m>.01){float ft=uTime*uFlow.x,s=vn(vec2(uv.x*900.,uv.y*42.-ft*2.6))*.65+vn(vec2(uv.x*2100.+3.,uv.y*95.-ft*4.3))*.35;
    c*=mix(1.,.45+1.15*s,m);c+=uFall*pow(s,4.)*m*.4;}
  // lit windows and neon breathe a little, each on its own clock
  float lum=dot(c,vec3(.3,.5,.2)),hh=h21(floor(uv*vec2(1100.,360.)));
  c*=1.+uFlow.y*sin(uTime*(1.+hh*3.)+hh*40.)*smoothstep(.16,.5,lum);
  #ifdef REFLECT
  c*=uReflGain;
  #endif
  gl_FragColor=vec4(c,1.);
  #include <colorspace_fragment>
}`});
}
// Four meshes from the baked data: ahead and behind, and their reflections. Returns {meshes, tris}.
export function buildReliefMeshes(meta,data,U,opts={}){
  const mk=(step)=>{const r=buildRelief(meta,data,step),g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(r.position,3));g.setAttribute('uv',new THREE.BufferAttribute(r.uv,2));g.setAttribute('aFx',new THREE.BufferAttribute(r.fx,2));g.setIndex(new THREE.BufferAttribute(r.index,1));
    g.computeBoundingSphere();return g;};
  const hi=mk(1),lo=mk(2),meshes=[];
  for(const [geo,flip,name] of [[hi,[1,1,1],'relief'],[hi,[1,1,-1],'relief-behind'],[lo,[1,-1,1],'relief-reflection'],[lo,[1,-1,-1],'relief-behind-reflection']]){
    const m=new THREE.Mesh(geo,reliefMaterial(U,{...opts,flip}));m.name=name;m.userData.mirror=flip[1]<0;
    // each copy is culled by its own bounds (the shader moves it, so the bounds are moved here to match)
    const bs=geo.boundingSphere.clone();if(flip[1]<0)bs.center.y=2*meta.waterY-bs.center.y;bs.center.z*=flip[2];m.geometry=geo;m.userData.bounds=bs;m.frustumCulled=false;
    meshes.push(m);}
  return {meshes,geos:[hi,lo]};
}

// The sky dome: the painting's sky as the far layer, night above it, and all of it again in the water.
export function skyMaterial(U,{star=[.75,.82,1],cloud=[.2,.08,.32]}={}){
  return new THREE.ShaderMaterial({uniforms:{...U,uStar:{value:new THREE.Color(...star)},uCloud:{value:new THREE.Color(...cloud)}},side:THREE.BackSide,depthWrite:false,
    vertexShader:`varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader:`${PANO}
uniform vec3 uStar;uniform vec3 uCloud;varying vec3 vW;
void main(){vec3 W=vW;float refl=0.;if(W.y<uPano.w){W.y=2.*uPano.w-W.y;refl=1.;}
  vec3 d=normalize(W-uEye);vec2 uv=panoUV(d);float bias=0.;
  if(refl>.5){uv+=ripple(vW)*vec2(.0016,.0075);bias=1.3;}
  vec3 c=art(uv,d,bias);
  float dark=1.-smoothstep(.01,.045,dot(c,vec3(.3,.5,.2)));
  // slow high cloud and stars, only where the painting is open sky
  vec2 cp=d.xz/(abs(d.y)+.32)*1.15+vec2(uTime*.004,0.);float cl=vn(cp*1.3)*.6+vn(cp*2.9+4.)*.4;
  c+=uCloud*smoothstep(.45,.95,cl)*dark*smoothstep(.08,.45,d.y)*.22;
  vec3 sp=d*72.,id=floor(sp);float r=h21(id.xy+id.z*17.3);vec3 f=fract(sp)-.5-(vec3(h21(id.yz+3.1),h21(id.zx+7.7),h21(id.xy+5.3))-.5)*.6;
  float st=step(.86,r)*smoothstep(.13,.0,length(f))*(.35+.65*h21(id.zy+1.3));
  c+=uStar*st*(.55+.45*sin(uTime*(1.+r*2.)+r*90.))*dark*smoothstep(.03,.25,d.y)*(1.-.5*refl);
  if(refl>.5)c*=uReflGain;
  gl_FragColor=vec4(c,1.);
  #include <colorspace_fragment>
}`});
}

// The water surface. uIsland = (x, z, radius, pool radius). Premultiplied: the tint covers, the glow adds.
export function waterMaterial(U,{island,deep='#030109',glowA='#2de2e6',glowB='#ff2a8a'}){
  const C=c=>new THREE.Color(c);
  return new THREE.ShaderMaterial({uniforms:{uTime:U.uTime,uIsland:{value:new THREE.Vector4(...island)},uDeep:{value:C(deep)},uGlowA:{value:C(glowA)},uGlowB:{value:C(glowB)}},transparent:true,premultipliedAlpha:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-4,
    vertexShader:`varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader:`uniform float uTime;uniform vec4 uIsland;uniform vec3 uDeep;uniform vec3 uGlowA;uniform vec3 uGlowB;varying vec3 vW;${NOISE}
void main(){vec3 V=normalize(cameraPosition-vW);float cosv=clamp(V.y,0.,1.);
  float fres=mix(.34,.97,pow(1.-cosv,2.2));
  vec2 q=vW.xz;float dI=max(length(q-uIsland.xy)-uIsland.z,0.),t=uTime;
  // light spilling from the island's neon rim, broken by the ripples
  float w=vn(q*3.+vec2(t*.3,t*.17))*vn(q*5.-vec2(t*.22,t*.27));
  vec3 glow=uGlowA*exp(-dI*3.2)*(.05+.5*w)+uGlowA*exp(-dI*.9)*.012+uGlowB*exp(-dI*.5)*.008;
  // slow rings that drift out from the island
  float ring=smoothstep(.9,1.,sin(dI*4.2-t*.7)*.5+.5)*exp(-dI*.5);glow+=uGlowA*ring*.012*(1.-cosv);
  // a soft sheen where the ripples catch the sky
  float g=smoothstep(.55,.9,vn(q*1.7+vec2(t*.12,-t*.09))*.6+vn(q*4.3-t*.2)*.4)*pow(1.-cosv,3.);glow+=vec3(.35,.28,.6)*g*.05;
  float edge=1.-smoothstep(uIsland.w-1.4,uIsland.w,length(q));
  float a=(1.-fres)*edge;gl_FragColor=vec4(uDeep*a+glow*edge,a);
  #include <colorspace_fragment>
}`});
}

// ---- solid props ---------------------------------------------------------------------------------------------------------------
// One small lit material for everything an arena plants near the player. Light is three coloured directions + a glow that rises from the
// water, a rim, an emissive term (per-vertex aGlow x aTint, or an emissive map) and a sheen that reflects the painted city.
export function propUniforms(P){const C=c=>new THREE.Color(c),V=(x,y,z)=>new THREE.Vector3(x,y,z).normalize();return {
  uAmb:{value:C(P.amb)},uKeyDir:{value:V(...P.keyDir)},uKey:{value:C(P.key)},uFillDir:{value:V(...P.fillDir)},uFill:{value:C(P.fill)},uUp:{value:C(P.up)},uRim:{value:C(P.rim)}};}
export function propMaterial(U,L,{map=null,emap=null,flipY=false,alphaTest=false,double=false,sway=0,frond=false,sheen=0,gloss=2.5,spec=0,shin=30,emis=1,tintMul=1}={}){
  const defines={};if(map)defines.USE_MAP='';if(emap)defines.USE_EMAP='';if(alphaTest)defines.ALPHATEST='';if(double)defines.DOUBLE='';if(sway)defines.SWAY='';if(frond)defines.FROND='';if(sheen>0)defines.SHEEN='';if(flipY)defines.REFLECT='';
  return new THREE.ShaderMaterial({defines,uniforms:{...U,...L,map:{value:map},emap:{value:emap},uSway:{value:sway},uSheen:{value:sheen},uGloss:{value:gloss},uSpec:{value:spec},uShin:{value:shin},uEmis:{value:emis},uTintMul:{value:tintMul}},side:(double||flipY)?THREE.DoubleSide:THREE.FrontSide,
    vertexShader:`attribute vec3 aTint;attribute float aGlow;uniform float uTime;uniform vec4 uPano;uniform float uSway;
varying vec3 vN;varying vec3 vW;varying vec3 vO;varying vec2 vUv;varying vec3 vT;varying float vG;
void main(){vec4 p=vec4(position,1.);vec3 n=normal;
  #ifdef USE_INSTANCING
  p=instanceMatrix*p;n=mat3(instanceMatrix)*n;
  #endif
  vec4 w=modelMatrix*p;
  #ifdef SWAY
  float k=clamp(position.y/4.5,0.,1.),ph=instanceMatrix[3].x*.6+instanceMatrix[3].z*.45,fl=0.;k*=k;
  #ifdef FROND
  fl=uv.y;
  #endif
  w.x+=((sin(uTime*1.2+ph)+.35*sin(uTime*2.7+ph*2.))*.1*k+sin(uTime*2.6+ph*3.+uv.y*5.)*.06*fl)*uSway;
  w.z+=(cos(uTime*1.05+ph*1.3)*.08*k)*uSway;w.y+=sin(uTime*2.2+ph*3.+uv.y*6.)*.05*fl*uSway;
  #endif
  vO=w.xyz;vN=normalize(mat3(modelMatrix)*n);
  #ifdef REFLECT
  w.y=2.*uPano.w-w.y;vN.y=-vN.y;
  #endif
  vW=w.xyz;vUv=uv;vT=aTint;vG=aGlow;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader:`${PANO}
uniform vec3 uAmb;uniform vec3 uKeyDir;uniform vec3 uKey;uniform vec3 uFillDir;uniform vec3 uFill;uniform vec3 uUp;uniform vec3 uRim;
uniform float uSheen;uniform float uGloss;uniform float uSpec;uniform float uShin;uniform float uEmis;uniform float uTintMul;
#ifdef USE_MAP
uniform sampler2D map;
#endif
#ifdef USE_EMAP
uniform sampler2D emap;
#endif
varying vec3 vN;varying vec3 vW;varying vec3 vO;varying vec2 vUv;varying vec3 vT;varying float vG;
void main(){
  #ifdef REFLECT
  if(vO.y<uPano.w+.004)discard;
  vec3 n=normalize(vN);n.y=-n.y;vec3 V=normalize(vec3(cameraPosition.x,2.*uPano.w-cameraPosition.y,cameraPosition.z)-vO);
  #else
  vec3 n=normalize(vN);vec3 V=normalize(cameraPosition-vO);
  #endif
  #ifdef DOUBLE
  if(dot(n,V)<0.)n=-n;
  #endif
  vec3 base=vT*uTintMul;
  #ifdef USE_MAP
  vec4 tx=texture2D(map,vUv);
  #ifdef ALPHATEST
  if(tx.a<.4)discard;
  #endif
  base*=tx.rgb;
  #endif
  float low=exp(-max(vO.y-uPano.w,0.)*.55);
  vec3 light=uAmb*(.6+.4*n.y)+uKey*max(dot(n,uKeyDir),0.)+uFill*max(dot(n,uFillDir),0.)+uUp*low*(.3+.7*max(-n.y*.6+.4,0.));
  vec3 col=base*light;
  float fr=pow(1.-max(dot(n,V),0.),3.);
  col+=uRim*fr*(.35+.65*low);
  #ifdef SHEEN
  vec3 R=reflect(-V,n);vec3 env=art(panoUV(R),R,uGloss)*smoothstep(-.3,.02,R.y);
  col+=env*uSheen*(.3+.7*fr);
  #endif
  if(uSpec>0.){vec3 H=normalize(uKeyDir+V);col+=uKey*pow(max(dot(n,H),0.),uShin)*uSpec;H=normalize(uFillDir+V);col+=uFill*pow(max(dot(n,H),0.),uShin)*uSpec;}
  float fl=1.+.06*sin(uTime*7.+vO.x*3.+vO.z*2.)+.04*sin(uTime*23.+vO.y*5.);
  col+=vT*vG*uEmis*fl;
  #ifdef USE_EMAP
  col+=texture2D(emap,vUv).rgb*uEmis*fl;
  #endif
  #ifdef REFLECT
  col*=uReflGain;
  #endif
  gl_FragColor=vec4(col,1.);
  #include <colorspace_fragment>
}`});
}

// Geometry builder: lathes, tubes, boxes with bevels and leaf strips, with per-vertex tint and glow, merged into one draw call per material.
export class GB{
  constructor(){this.pos=[];this.nor=[];this.uv=[];this.tint=[];this.glow=[];this.idx=[];this.n=0;this.c=1;this.s=0;this.tx=0;this.ty=0;this.tz=0;this.sc=1;}
  at(rotY,x,y,z,sc=1){this.c=Math.cos(rotY);this.s=Math.sin(rotY);this.tx=x;this.ty=y;this.tz=z;this.sc=sc;return this;}
  v(x,y,z,nx,ny,nz,u,v,t,g){const c=this.c,s=this.s,k=this.sc;
    this.pos.push((x*c+z*s)*k+this.tx,y*k+this.ty,(-x*s+z*c)*k+this.tz);this.nor.push(nx*c+nz*s,ny,-nx*s+nz*c);this.uv.push(u,v);this.tint.push(t[0],t[1],t[2]);this.glow.push(g);return this.n++;}
  quad(P,n,UV,T,g=0){const i=P.map((p,k)=>this.v(p[0],p[1],p[2],n[0],n[1],n[2],UV[k][0],UV[k][1],T[k]||T[0],g));this.idx.push(i[0],i[1],i[2],i[0],i[2],i[3]);}
  // Surface of revolution about +y at (cx,cy,cz): prof = [[r,y],...] bottom to top. sides > 0 makes a faceted prism (flat shaded) instead of a round lathe.
  revolve(cx,cy,cz,prof,seg,o={}){
    const rows=prof.length,P=[],a0=o.a0||0;for(let i=0;i<rows;i++){const row=[];for(let j=0;j<=seg;j++){const a=a0+j/seg*6.2831853,r=prof[i][0]*(o.rf?o.rf(i/(rows-1),a):1);row.push([cx+Math.cos(a)*r,cy+prof[i][1],cz+Math.sin(a)*r]);}P.push(row);}
    this.grid(P,seg,o,false);
  }
  // Tube along a path [[x,y,z,r],...]
  tube(path,seg,o={}){
    const P=[],q=new THREE.Vector3(),t=new THREE.Vector3(),n1=new THREE.Vector3(),n2=new THREE.Vector3(),hh=new THREE.Vector3();
    for(let i=0;i<path.length;i++){const a=path[Math.max(0,i-1)],b=path[Math.min(path.length-1,i+1)];t.set(b[0]-a[0],b[1]-a[1],b[2]-a[2]).normalize();
      hh.set(0,1,0);if(Math.abs(t.y)>.95)hh.set(1,0,0);n1.crossVectors(t,hh).normalize();n2.crossVectors(t,n1);
      const row=[];for(let j=0;j<=seg;j++){const a2=j/seg*6.2831853,r=path[i][3]*(o.rf?o.rf(i/(path.length-1),a2):1);q.set(path[i][0],path[i][1],path[i][2]).addScaledVector(n1,Math.cos(a2)*r).addScaledVector(n2,Math.sin(a2)*r);row.push([q.x,q.y,q.z]);}P.push(row);}
    this.grid(P,seg,o,true);
  }
  grid(P,seg,o,flip){
    const rows=P.length,t=o.tint||[1,1,1],g=o.glow||0,ur=o.uRep||1,vr=o.vRep||1,base=this.n,sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],flat=!!o.flat;
    if(flat){ // faceted: every quad gets its own corners and face normal
      for(let i=0;i<rows-1;i++)for(let j=0;j<seg;j++){const a=P[i][j],b=P[i][j+1],c=P[i+1][j+1],d=P[i+1][j],e1=sub(b,a),e2=sub(d,a);let nx=e1[1]*e2[2]-e1[2]*e2[1],ny=e1[2]*e2[0]-e1[0]*e2[2],nz=e1[0]*e2[1]-e1[1]*e2[0];
        if(Math.hypot(nx,ny,nz)<1e-9){const e3=sub(c,a);nx=e1[1]*e3[2]-e1[2]*e3[1];ny=e1[2]*e3[0]-e1[0]*e3[2];nz=e1[0]*e3[1]-e1[1]*e3[0];}
        const l=Math.hypot(nx,ny,nz)||1,sg=flip?1:-1;nx*=sg/l;ny*=sg/l;nz*=sg/l;
        const k0=o.ramp?o.ramp(i/(rows-1)):1,k1=o.ramp?o.ramp((i+1)/(rows-1)):1,g0=typeof g==='function'?g(i/(rows-1)):g,T0=[t[0]*k0,t[1]*k0,t[2]*k0],T1=[t[0]*k1,t[1]*k1,t[2]*k1];
        const u0=j/seg*ur,u1=(j+1)/seg*ur,v0=(o.vAt?o.vAt(i):i/(rows-1))*vr,v1=(o.vAt?o.vAt(i+1):(i+1)/(rows-1))*vr;
        const q=[this.v(a[0],a[1],a[2],nx,ny,nz,u0,v0,T0,g0),this.v(b[0],b[1],b[2],nx,ny,nz,u1,v0,T0,g0),this.v(c[0],c[1],c[2],nx,ny,nz,u1,v1,T1,g0),this.v(d[0],d[1],d[2],nx,ny,nz,u0,v1,T1,g0)];
        if(flip)this.idx.push(q[0],q[1],q[3],q[1],q[2],q[3]);else this.idx.push(q[0],q[3],q[1],q[1],q[3],q[2]);}
      return;}
    for(let i=0;i<rows;i++)for(let j=0;j<=seg;j++){
      const a=P[Math.min(rows-1,i+1)][j],b=P[Math.max(0,i-1)][j],c=P[i][j===seg?1:j+1],d=P[i][j===0?seg-1:j-1];
      const dv=sub(a,b),du=sub(c,d);let nx=dv[1]*du[2]-dv[2]*du[1],ny=dv[2]*du[0]-dv[0]*du[2],nz=dv[0]*du[1]-dv[1]*du[0];const l=Math.hypot(nx,ny,nz)||1,sg=flip?-1:1;nx*=sg/l;ny*=sg/l;nz*=sg/l;
      const k=o.ramp?o.ramp(i/(rows-1)):1;this.v(P[i][j][0],P[i][j][1],P[i][j][2],nx,ny,nz,j/seg*ur,(o.vAt?o.vAt(i):i/(rows-1))*vr,[t[0]*k,t[1]*k,t[2]*k],typeof g==='function'?g(i/(rows-1)):g);}
    for(let i=0;i<rows-1;i++)for(let j=0;j<seg;j++){const a=base+i*(seg+1)+j,b=a+1,c=a+seg+2,d=a+seg+1;if(flip)this.idx.push(a,b,d,b,c,d);else this.idx.push(a,d,b,b,d,c);}
  }
  // Flat disc facing up (fan), uv = position / size + .5
  disc(cx,cy,cz,r,seg,o={}){const t=o.tint||[1,1,1],g=o.glow||0,c0=this.v(cx,cy,cz,0,1,0,.5,.5,t,g),b=this.n;
    for(let j=0;j<=seg;j++){const a=j/seg*6.2831853;this.v(cx+Math.cos(a)*r,cy,cz+Math.sin(a)*r,0,1,0,.5+Math.cos(a)*.5,.5+Math.sin(a)*.5,t,g);}
    for(let j=0;j<seg;j++)this.idx.push(c0,b+j+1,b+j);}
  // Double-sided curved leaf strip (spine [[x,y,z],...], half widths w[i], side = the direction the leaf is wide in); uv.x across, uv.y along.
  strip(spine,widths,side,o={}){
    const t=o.tint||[1,1,1],base=this.n,v=new THREE.Vector3(),sd=new THREE.Vector3(side[0],side[1],side[2]).normalize(),nrm=new THREE.Vector3(),fold=o.fold||0,gl=o.glow||0;
    for(let i=0;i<spine.length;i++){const a=spine[Math.max(0,i-1)],b=spine[Math.min(spine.length-1,i+1)];v.set(b[0]-a[0],b[1]-a[1],b[2]-a[2]).normalize();
      nrm.crossVectors(v,sd).normalize();const w=widths[i],k=o.ramp?o.ramp(i/(spine.length-1)):1,tt=[t[0]*k,t[1]*k,t[2]*k],f=i/(spine.length-1);
      // a V-fold along the rib: the two edges droop below the spine
      this.v(spine[i][0]-sd.x*w-nrm.x*w*fold,spine[i][1]-sd.y*w-nrm.y*w*fold,spine[i][2]-sd.z*w-nrm.z*w*fold,nrm.x,nrm.y,nrm.z,0,f,tt,gl);
      this.v(spine[i][0],spine[i][1],spine[i][2],nrm.x,nrm.y,nrm.z,.5,f,tt,gl);
      this.v(spine[i][0]+sd.x*w-nrm.x*w*fold,spine[i][1]+sd.y*w-nrm.y*w*fold,spine[i][2]+sd.z*w-nrm.z*w*fold,nrm.x,nrm.y,nrm.z,1,f,tt,gl);}
    for(let i=0;i<spine.length-1;i++){const a=base+i*3;this.idx.push(a,a+1,a+4,a,a+4,a+3,a+1,a+2,a+5,a+1,a+5,a+4);}
  }
  geometry(){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(this.pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.nor,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(this.uv,2));
    g.setAttribute('aTint',new THREE.Float32BufferAttribute(this.tint,3));g.setAttribute('aGlow',new THREE.Float32BufferAttribute(this.glow,1));
    g.setIndex(this.n>65535?new THREE.Uint32BufferAttribute(this.idx,1):new THREE.Uint16BufferAttribute(this.idx,1));g.computeBoundingSphere();return g;}
  get tris(){return this.idx.length/3;}
}

// ---- textures ------------------------------------------------------------------------------------------------------------------
export const canvas2d=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return [c,c.getContext('2d')];};
// Keeps the list of textures a world owns, with their GPU size, so the budget is measured and everything is released on dispose.
export function newTracker(){const list=[];return {list,
  tex(canvas,{aniso=4,repeat=true,mips=true,name='',srgb=true}={}){const t=new THREE.CanvasTexture(canvas);if(srgb)t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=aniso;t.generateMipmaps=mips;t.minFilter=mips?THREE.LinearMipmapLinearFilter:THREE.LinearFilter;t.magFilter=THREE.LinearFilter;
    if(repeat)t.wrapS=t.wrapT=THREE.RepeatWrapping;list.push({t,bytes:texBytes(canvas.width,canvas.height,mips),name,own:true});return t;},
  note(t,bytes,name){list.push({t,bytes,name,own:false});return t;},
  bytes(){return list.reduce((s,x)=>s+x.bytes,0);},dispose(){for(const x of list)if(x.own)x.t.dispose();list.length=0;}};}
// Tileable value noise as a canvas (mottling for marble and rock).
export function noiseCanvas(size,R,octaves=4){
  const [c,x]=canvas2d(size,size),img=x.createImageData(size,size),grids=[];
  for(let o=0;o<octaves;o++){const n=4<<o,g=new Float32Array(n*n);for(let i=0;i<g.length;i++)g[i]=R();grids.push([n,g]);}
  for(let j=0;j<size;j++)for(let i=0;i<size;i++){let v=0,a=1,sum=0;for(const [n,g] of grids){const fx=i/size*n,fy=j/size*n,x0=Math.floor(fx),y0=Math.floor(fy),tx=fx-x0,ty=fy-y0,sx=tx*tx*(3-2*tx),sy=ty*ty*(3-2*ty),
      a00=g[(y0%n)*n+x0%n],a10=g[(y0%n)*n+(x0+1)%n],a01=g[((y0+1)%n)*n+x0%n],a11=g[((y0+1)%n)*n+(x0+1)%n];v+=a*(a00+(a10-a00)*sx+(a01-a00)*sy+(a00-a10-a01+a11)*sx*sy);sum+=a;a*=.5;}
    v/=sum;const k=(j*size+i)*4;img.data[k]=img.data[k+1]=img.data[k+2]=v*255;img.data[k+3]=255;}
  x.putImageData(img,0,0);return c;
}
export function flareCanvas(size=128){const [c,x]=canvas2d(size,size),h=size/2,g=x.createRadialGradient(h,h,0,h,h,h);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.15,'rgba(255,255,255,.5)');g.addColorStop(.45,'rgba(255,255,255,.12)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,size,size);return c;}

// ---- weather -------------------------------------------------------------------------------------------------------------------
// Additive sprites that face the viewer: instance scale = size, instanceColor = tint. mist drifts sideways; pulse breathes.
export function glowMaterial(U,tex,{mist=false,traffic=false,pulse=.25,opacity=1,drift=2.5}={}){
  return new THREE.ShaderMaterial({uniforms:{uTime:U.uTime,map:{value:tex},uOp:{value:opacity},uPulse:{value:pulse},uDrift:{value:drift}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,defines:mist?{MIST:''}:traffic?{TRAFFIC:''}:{},
    vertexShader:`uniform float uTime;uniform float uPulse;uniform float uDrift;varying vec2 vUv;varying vec3 vC;varying float vP;
void main(){vUv=uv;vC=instanceColor;float id=float(gl_InstanceID);
  vec4 c=modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.);float sx=length(instanceMatrix[0].xyz),sy=length(instanceMatrix[1].xyz);
  #ifdef MIST
  c.x+=sin(uTime*.05+id*1.7)*uDrift;c.z+=cos(uTime*.04+id*2.3)*uDrift*.6;
  #endif
  #ifdef TRAFFIC
  float way=mod(id,2.)*2.-1.;c.x+=(fract(uTime*(.018+.02*fract(id*.37))+id*.61)-.5)*uDrift*way;c.y+=sin(uTime*.3+id)*.8;
  #endif
  vec4 mv=viewMatrix*c;vP=1.-uPulse+uPulse*(.5+.5*sin(uTime*(.6+fract(id*.37))*2.+id*5.));
  mv.xy+=position.xy*vec2(sx,sy);gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`uniform sampler2D map;uniform float uOp;varying vec2 vUv;varying vec3 vC;varying float vP;
void main(){float a=texture2D(map,vUv).a*vP*uOp;gl_FragColor=vec4(vC*a,1.);
  #include <colorspace_fragment>
}`});
}
// Drifting motes: points animated on the GPU inside a box (fireflies, neon dust). aSeed = 4 randoms, aCol = colour.
export function moteMaterial(U,{scale=900,rise=.4,height=9}={}){
  return new THREE.ShaderMaterial({uniforms:{uTime:U.uTime,uScale:{value:scale},uRise:{value:rise},uH:{value:height}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`attribute vec4 aSeed;attribute vec3 aCol;uniform float uTime;uniform float uScale;uniform float uRise;uniform float uH;varying vec3 vC;varying float vA;
void main(){vec3 p=position;float t=uTime*(.08+aSeed.w*.12);
  p.x+=sin(t*6.+aSeed.x*30.)*.7+sin(t*2.3+aSeed.y*20.)*.4;p.y+=sin(t*5.+aSeed.y*30.)*.5+t*uRise*(.3+aSeed.z);p.z+=cos(t*5.5+aSeed.z*30.)*.7;
  p.y=mod(p.y,uH)+.1;
  vec4 mv=viewMatrix*modelMatrix*vec4(p,1.);vC=aCol;vA=(.3+.7*(.5+.5*sin(uTime*(1.+aSeed.w*2.)+aSeed.x*40.)))*smoothstep(0.,.6,p.y)*smoothstep(uH,uH-1.5,p.y);
  gl_PointSize=clamp(uScale*(.012+.022*aSeed.w)/max(.3,-mv.z),1.,16.);gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`varying vec3 vC;varying float vA;void main(){vec2 d=gl_PointCoord-.5;float a=smoothstep(.5,0.,length(d));a*=a*vA;gl_FragColor=vec4(vC*a,1.);
  #include <colorspace_fragment>
}`});
}
// Light shafts: open cones, brightest along their axis, fading towards the far end. Instanced; instanceColor = tint.
export function beamMaterial(U,{strength=.2}={}){
  return new THREE.ShaderMaterial({uniforms:{uTime:U.uTime,uStr:{value:strength}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
    vertexShader:`varying vec3 vN;varying vec3 vW;varying float vY;varying vec3 vC;
void main(){vec4 p=instanceMatrix*vec4(position,1.);vec3 n=mat3(instanceMatrix)*normal;vec4 w=modelMatrix*p;vW=w.xyz;vN=normalize(mat3(modelMatrix)*n);vY=uv.y;vC=instanceColor;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader:`uniform float uTime;uniform float uStr;varying vec3 vN;varying vec3 vW;varying float vY;varying vec3 vC;
void main(){vec3 V=normalize(cameraPosition-vW);float f=pow(abs(dot(normalize(vN),V)),3.2);float a=f*pow(clamp(vY,0.,1.),1.6)*uStr;
  gl_FragColor=vec4(vC*a,1.);
  #include <colorspace_fragment>
}`});
}

// What a world costs right now: draw calls, triangles, and the textures it owns.
export function measure(group,tracker){let draws=0,tris=0;const per={};
  group.traverse(o=>{if((!o.isMesh&&!o.isPoints)||!o.visible)return;let v=true;for(let p=o.parent;p&&p!==group.parent;p=p.parent)if(!p.visible)v=false;if(!v)return;
    draws++;const g=o.geometry,n=o.isInstancedMesh?o.count:1,dr=g.drawRange,cnt=Math.min(g.index?g.index.count:g.attributes.position.count,dr.count===Infinity?1e12:dr.count),t=o.isPoints?0:cnt/3*n;tris+=t;per[o.name||'?']={tris:Math.round(t),instances:n};});
  const tex=tracker.list.filter(x=>x.own).reduce((s,x)=>s+x.bytes,0),shared=tracker.list.filter(x=>!x.own).reduce((s,x)=>s+x.bytes,0);
  return {draws,tris:Math.round(tris),texBytes:tex,texMB:tex/1048576,sharedBytes:shared,sharedMB:shared/1048576,per,textures:tracker.list.map(x=>({name:x.name,bytes:x.bytes,own:x.own}))};}
