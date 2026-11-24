// CREASE VR look: the table, the pieces, the rails, the hands and the controllers, drawn to match the phone game.
//
// The table top is a texture the phone engine draws itself (host.renderField, top-down); the paddles and the puck are 3D bodies
// capped with the phone's own paddle and puck art (host.pieceArt). Everything here only draws; no rules, physics or input.
import * as THREE from './vendor/three.module.min.js';
import {FIELD_PX,FIELD_MARGIN,fieldPlaneSize,railPlan,railCorners,handBones,palmFan,JOINT_NAMES,FINGERTIPS,paddleRingColour,puckTintKey} from './quest-look-pure.mjs';

const PADDLE_R=.085,PUCK_R=.042,BUMPER_R=.05;
const DARK=0x0b0d1c;

// Physical (clearcoat) materials are plain standard ones on a software GL, which cannot afford the extra lobe.
let SOFT=false;
function phys(o){if(SOFT){delete o.clearcoat;delete o.clearcoatRoughness;return new THREE.MeshStandardMaterial(o);}return new THREE.MeshPhysicalMaterial(o);}
function glossy(color,{metalness=.85,roughness=.28,clearcoat=.6,env=1.1,emissive=0x000000,emissiveIntensity=1}={}){
  return phys({color,metalness,roughness,clearcoat,clearcoatRoughness:.18,envMapIntensity:env,emissive,emissiveIntensity});
}
function neon(color,intensity=1.6){
  const m=new THREE.MeshStandardMaterial({color:0x050508,emissive:color,emissiveIntensity:intensity,roughness:.4,metalness:0});return m;
}
function canvasTex(canvas,aniso=8){
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=aniso;t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;return t;
}

// A small neon-tinted room, turned into an environment map so the glossy pieces and the table reflect something. (Three's RoomEnvironment
// is the same idea; this one is tinted to the game's colours and needs no extra files.)
function buildEnvironment(renderer,scene){
  try{
    const pm=new THREE.PMREMGenerator(renderer),room=new THREE.Scene();
    room.add(new THREE.Mesh(new THREE.BoxGeometry(12,7,12),new THREE.MeshBasicMaterial({color:0x1a0f30,side:THREE.BackSide})));
    const panel=(w,h,x,y,z,r,g,b,ry=0)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color(r,g,b),side:THREE.DoubleSide}));m.position.set(x,y,z);m.rotation.y=ry;room.add(m);};
    panel(5,.5,0,3.3,0,5,5,5.4).rotation.x=Math.PI/2;
    panel(5,.5,0,3.3,-2.2,4,4,4.4).rotation.x=Math.PI/2;
    panel(4,2.4,0,1.2,-5.8,2.2,2.2,2.6);
    panel(.6,2.4,-5.8,1.4,-1,.4,3.6,4,Math.PI/2);
    panel(.6,2.4,5.8,1.4,-1,4,.5,2.6,Math.PI/2);
    panel(.6,2.4,-5.8,1.4,2.5,.4,3.6,4,Math.PI/2);
    panel(.6,2.4,5.8,1.4,2.5,4,.5,2.6,Math.PI/2);
    const rt=pm.fromScene(room,.04);scene.environment=rt.texture;pm.dispose();
    return rt.texture;
  }catch{return null;}
}

export function createLook({scene,table,renderer,onHeight,soft=false}){
  const out={};SOFT=soft;
  const aniso=soft?1:renderer.capabilities.getMaxAnisotropy();
  out.env=buildEnvironment(renderer,scene);
  const maxAniso=renderer.capabilities.getMaxAnisotropy();

  // ---- Table top: the phone's own field drawing -----------------------------------------------------------------
  const fp=fieldPlaneSize();
  // (software GL: a plain unlit top, no clearcoat/env reflection)
  const topMat=soft?new THREE.MeshBasicMaterial({color:0x0a0618}):phys({color:0x000000,emissive:0xffffff,emissiveIntensity:1,roughness:.45,metalness:0,clearcoat:.85,clearcoatRoughness:.14,envMapIntensity:.55});
  if(!soft)topMat.emissive.setRGB(.001,.001,.001);
  const top=new THREE.Mesh(new THREE.PlaneGeometry(fp.w,fp.d),topMat);top.rotation.x=-Math.PI/2;top.position.y=.0015;table.add(top);
  // while no texture has arrived yet the top is a plain dark panel
  topMat.color.set(0x0a0618);
  let fieldCanvas=null,fieldTex=null;
  out.field={mesh:top,canvas:()=>fieldCanvas,texture:()=>fieldTex,ms:0,frames:0,every:1,counter:0,errors:0,ok:false,px:FIELD_PX,opts:{bare:false,paddles:[]}};
  // Draws the phone's field into the texture. Returns false when the engine cannot (old host, or it threw).
  out.updateField=host=>{
    const F=out.field;
    if(!host||typeof host.renderField!=='function'||F.errors>3)return false;
    if(F.every>1&&(F.counter++%F.every)!==0)return F.ok;
    const t0=performance.now();
    try{
      const cv=host.renderField(F.px,F.opts);
      if(cv!==fieldCanvas){fieldCanvas=cv;if(fieldTex)fieldTex.dispose();fieldTex=canvasTex(cv,aniso);topMat.map=fieldTex;if(soft)topMat.color.set(0xffffff);else{topMat.emissiveMap=fieldTex;topMat.emissive.setRGB(1,1,1);topMat.color.set(0x000000);}topMat.needsUpdate=true;}
      fieldTex.needsUpdate=true;F.ok=true;F.errors=0;
    }catch(e){F.errors++;F.lastError=String(e&&e.message||e);return false;}
    const dt=performance.now()-t0;F.ms=F.ms?F.ms*.9+dt*.1:dt;F.frames++;
    return true;
  };

  // Display-only drawing for matches the engine is not running (online: the server owns the match). Fill the field options from table
  // positions (x across [0,1], y along [0,1.8], you at the high y); updateField then draws the phone's pucks, paddle glows and score numbers
  // from them. Nothing is allocated after the first call.
  const ext={pads:[{p:1,u:.5,v:1.6,r:PADDLE_R,ptr:null,big:0,punch:0},{p:2,u:.5,v:.2,r:PADDLE_R,ptr:null,big:0,punch:0}],puck:{u:.5,v:.9,vu:0,vv:0,r:PUCK_R,last:0,trail:[],smashT:0,dead:false},score:[0,0]};
  out.setExternal=(L,me,them,puck,score,pr=PADDLE_R,kr=PUCK_R)=>{
    const o=out.field.opts,k=L/1.8;o.bare=true;
    ext.pads[0].u=me.x;ext.pads[0].v=me.y*k;ext.pads[0].r=pr;ext.pads[1].u=them.x;ext.pads[1].v=them.y*k;ext.pads[1].r=pr;o.paddles=ext.pads;
    if(puck){ext.puck.u=puck.x;ext.puck.v=puck.y*k;ext.puck.r=kr;ext.puck.last=puck.last||0;o.pucks=ext.pucks||(ext.pucks=[ext.puck]);}else o.pucks=ext.none||(ext.none=[]);
    if(score){ext.score[0]=score[0];ext.score[1]=score[1];o.score=ext.score;}else o.score=null;
  };
  out.clearExternal=()=>{const o=out.field.opts;o.pucks=null;o.score=null;o.paddles=[];};

  // ---- Table body, rails, legs ---------------------------------------------------------------------------------
  const frameMat=glossy(0x120a24,{metalness:.8,roughness:.34,clearcoat:.7});
  const body=new THREE.Mesh(new THREE.BoxGeometry(1.06,.07,1.86),frameMat);body.position.y=-.037;table.add(body);
  const skirt=new THREE.Mesh(new THREE.BoxGeometry(1.0,.05,1.8),glossy(0x07050f,{metalness:.9,roughness:.4}));skirt.position.y=-.095;table.add(skirt);
  // Static pieces are merged per material (a few draw calls instead of ~120; the headset draws every call twice, once per eye).
  const _m4=new THREE.Matrix4(),_q4=new THREE.Quaternion(),_e4=new THREE.Euler(),_p4=new THREE.Vector3(),_s4=new THREE.Vector3();
  const xf=(x=0,y=0,z=0,rx=0,ry=0,rz=0,sx=1,sy=1,sz=1)=>new THREE.Matrix4().compose(_p4.set(x,y,z),_q4.setFromEuler(_e4.set(rx,ry,rz)),_s4.set(sx,sy,sz));
  const mergeAdd=(list,geo,m)=>{const g=geo.index?geo.toNonIndexed():geo.clone();g.applyMatrix4(m);
    if(m.determinant()<0)for(const k of ['position','normal','uv']){const a=g.getAttribute(k);if(!a)continue;const n=a.itemSize,arr=a.array;for(let i=0;i<arr.length;i+=n*3)for(let j=0;j<n;j++){const t=arr[i+n+j];arr[i+n+j]=arr[i+2*n+j];arr[i+2*n+j]=t;}}
    list.push(g);};
  const mergeDone=list=>{const out=new THREE.BufferGeometry();for(const k of ['position','normal','uv']){let n=0;const it=list[0].getAttribute(k).itemSize;for(const g of list)n+=g.getAttribute(k).array.length;const arr=new Float32Array(n);let o=0;for(const g of list){arr.set(g.getAttribute(k).array,o);o+=g.getAttribute(k).array.length;}out.setAttribute(k,new THREE.BufferAttribute(arr,it));}for(const g of list)g.dispose();return out;};
  const underglow=[];
  {const L1={p1:[],p2:[]};
    for(const [side,z] of [['p2',-.905],['p1',.905]])mergeAdd(L1[side],new THREE.BoxGeometry(.9,.006,.01),xf(0,-.073,z));
    for(const sx of [-1,1])for(const [side,z] of [['p2',-.45],['p1',.45]])mergeAdd(L1[side],new THREE.BoxGeometry(.01,.006,.88),xf(sx*.505,-.073,z));
    for(const side of ['p1','p2']){const m=new THREE.Mesh(mergeDone(L1[side]),neon(side==='p1'?0x2de2e6:0xff2a8a,2.2));m.userData.side=side;table.add(m);underglow.push(m);}}
  // legs: tapered, glossy; scaled in y by the caller (unit height)
  const legMat=glossy(0x1a1030,{metalness:.9,roughness:.32});
  const legGeo=new THREE.CylinderGeometry(.034,.042,1,20);
  const legs=[];for(const x of [-.4,.4])for(const z of [-.7,.7]){const m=new THREE.Mesh(legGeo,legMat);m.position.set(x,-.5,z);table.add(m);legs.push(m);}
  out.legs=legs;out.underglow=underglow;


  // Rails: dark glossy body with a neon tube along the top inner edge, pink (p2) on the CPU half, cyan (p1) on yours. One merged body mesh and one
  // merged neon mesh per side (the beat pulse and the arena colours drive the two neon materials).
  const railBody=glossy(DARK,{metalness:.9,roughness:.3,clearcoat:.8});
  const tubeMats={p1:[],p2:[]},railMats={p1:[],p2:[]};
  const bodyList=[],neonList={p1:[],p2:[]};
  const tubeGeoCache=new Map();
  function tube(len,radius=.0065){const k=len.toFixed(3)+radius;let g=tubeGeoCache.get(k);if(!g){g=new THREE.CylinderGeometry(radius,radius,len,10);tubeGeoCache.set(k,g);}return g;}
  for(const s of railPlan()){
    const horizontalX=s.axis==='x';
    mergeAdd(bodyList,new THREE.BoxGeometry(horizontalX?s.len:.03,.058,horizontalX?.03:s.len),xf(s.x,.027,s.z));
    const inner=s.kind==='side'?-Math.sign(s.x)*.0125:0,innerZ=s.kind==='end'?-Math.sign(s.z)*.0125:0;
    mergeAdd(neonList[s.side],tube(s.len-.004),xf(s.x+inner,.062,s.z+innerZ,s.axis==='z'?Math.PI/2:0,0,s.axis==='x'?Math.PI/2:0));
    // a thin lower accent line so the rail reads as a lit channel
    mergeAdd(neonList[s.side],new THREE.BoxGeometry(horizontalX?s.len-.01:.004,.004,horizontalX?.004:s.len-.01),xf(s.x+inner*1.35,.02,s.z+innerZ*1.35));
  }
  // Corners: a solid wedge outside the spring arc, with a neon arc tube along the curve.
  {const R=.15,sh=new THREE.Shape();sh.moveTo(R,0);sh.lineTo(R,R);sh.lineTo(0,R);sh.absarc(0,0,R,Math.PI/2,0,true);
    const g=new THREE.ExtrudeGeometry(sh,{depth:.058,bevelEnabled:false,curveSegments:14});g.rotateX(-Math.PI/2);
    const arcGeo=new THREE.TorusGeometry(R-.004,.0065,8,24,Math.PI/2);
    for(const c of railCorners()){
      mergeAdd(bodyList,g,xf(c.x,0,c.z,0,0,0,c.sx,1,-c.sz));
      // the torus arc runs from +x to +y; laid flat (rotation.x = 90 deg) it covers the quadrant (+x,+z), and the turn about y points it at this corner
      const ry=c.sx>0?(c.sz>0?0:Math.PI/2):(c.sz<0?Math.PI:Math.PI*1.5);
      mergeAdd(neonList[c.side],arcGeo,xf(c.x,.062,c.z,0,ry,0).multiply(xf(0,0,0,Math.PI/2)));
    }}
  // Goal posts: short bright caps where the end rails stop, so the goal mouth reads.
  for(const [side,z] of [['p2',-.915],['p1',.915]])for(const sx of [-1,1])mergeAdd(neonList[side],new THREE.BoxGeometry(.016,.07,.034),xf(sx*.19,.03,z));
  table.add(new THREE.Mesh(mergeDone(bodyList),railBody));
  for(const side of ['p1','p2']){const m=neon(side==='p1'?0x2de2e6:0xff2a8a,1.8);tubeMats[side].push(m);table.add(new THREE.Mesh(mergeDone(neonList[side]),m));}
  out.tubeMats=tubeMats;out.railMats=railMats;out.posts=[];

  // ---- Pieces: paddles ------------------------------------------------------------------------------------------
  const sharedBodyMat=glossy(0x080a16,{metalness:.9,roughness:.24,clearcoat:1,env:1.4});
  const sharedKnobMat=glossy(0x0d1022,{metalness:.9,roughness:.26,clearcoat:1,env:1.3});
  const bodyGeo=new THREE.LatheGeometry([[0,0],[.0885,0],[.0925,.004],[.0925,.02],[.0875,.0295],[.0845,.0315],[0,.0315]].map(([x,y])=>new THREE.Vector2(x,y)),48);
  const knobGeo=new THREE.LatheGeometry([[.0,.0315],[.043,.0315],[.041,.044],[.033,.066],[.0285,.09],[.031,.104],[.0345,.114],[.0325,.124],[.024,.131],[.0,.134]].map(([x,y])=>new THREE.Vector2(x,y)),32);
  const capGeo=new THREE.CircleGeometry(PADDLE_R*.99,48);
  const ringGeo=new THREE.TorusGeometry(PADDLE_R*.845,.0072,12,64);
  const bandGeo=new THREE.TorusGeometry(.0395,.0034,10,40);
  const pieceTex=new Map(); // art canvas -> texture
  function artTexture(canvas){let t=pieceTex.get(canvas);if(!t){t=canvasTex(canvas,aniso);pieceTex.set(canvas,t);}return t;}
  out.paddles=[0,1].map(i=>{
    const g=new THREE.Group();
    const base=new THREE.Mesh(bodyGeo,sharedBodyMat);g.add(base);
    const capMat=phys({color:0x000000,emissive:0xffffff,emissiveIntensity:.9,roughness:.4,metalness:0,clearcoat:.9,clearcoatRoughness:.1,envMapIntensity:.8});
    const cap=new THREE.Mesh(capGeo,capMat);cap.rotation.x=-Math.PI/2;cap.position.y=.0322;g.add(cap);
    const ringMat=new THREE.MeshStandardMaterial({color:0x2de2e6,emissive:0x2de2e6,emissiveIntensity:1.1,metalness:1,roughness:.22,envMapIntensity:1.4});
    const bevel=new THREE.Mesh(ringGeo,ringMat);bevel.rotation.x=Math.PI/2;bevel.position.y=.0318;g.add(bevel);
    const grip=new THREE.Mesh(knobGeo,sharedKnobMat);g.add(grip);
    const bandMat=new THREE.MeshStandardMaterial({color:0x2de2e6,emissive:0x2de2e6,emissiveIntensity:1.3,metalness:.9,roughness:.25});
    const band=new THREE.Mesh(bandGeo,bandMat);band.rotation.x=Math.PI/2;band.position.y=.05;g.add(band);
    const domeMat=new THREE.MeshStandardMaterial({color:0xffffff,emissive:0x2de2e6,emissiveIntensity:.8,metalness:.3,roughness:.2});
    const dome=new THREE.Mesh(new THREE.SphereGeometry(.0185,20,12),domeMat);dome.position.set(0,.1345,0);dome.scale.y=.7;g.add(dome);
    g.userData={base,bevel,grip,cap:dome,band,glow:band,capMat,ringKey:'',artKey:''};
    table.add(g);return g;});
  out.setPaddleArt=(i,canvas)=>{const u=out.paddles[i].userData,t=artTexture(canvas);if(u.capMat.map!==t){u.capMat.map=t;u.capMat.emissiveMap=t;u.capMat.needsUpdate=true;}t.needsUpdate=true;};
  out.setPaddleRing=(i,hex)=>{const u=out.paddles[i].userData;if(u.ringKey===hex)return;u.ringKey=hex;u.bevel.material.color.set(hex);u.bevel.material.emissive.set(hex);};
  out.setPaddleAccent=(i,col,trail,core)=>{const u=out.paddles[i].userData;u.band.material.color.set(trail||col);u.band.material.emissive.set(trail||col);u.cap.material.color.set(core||'#ffffff');u.cap.material.emissive.set(col);};

  // ---- Pieces: pucks (the engine allows up to 3) ----------------------------------------------------------------
  const puckBodyMat=glossy(0x0a0c18,{metalness:.9,roughness:.22,clearcoat:1,env:1.4});
  const puckBodyGeo=new THREE.LatheGeometry([[0,0],[.0425,0],[.0445,.003],[.0445,.0155],[.0425,.0215],[0,.0225]].map(([x,y])=>new THREE.Vector2(x,y)),40);
  const puckCapGeo=new THREE.CircleGeometry(PUCK_R*1.0,40);
  const puckRimGeo=new THREE.TorusGeometry(PUCK_R*1.04,.0034,10,48);
  out.pucks=[0,1,2].map(()=>{
    const g=new THREE.Group();
    const base=new THREE.Mesh(puckBodyGeo,puckBodyMat);g.add(base);
    const capMat=phys({color:0x000000,emissive:0xffffff,emissiveIntensity:.9,roughness:.4,metalness:0,clearcoat:.9,clearcoatRoughness:.1,envMapIntensity:.8,transparent:true});
    const cap=new THREE.Mesh(puckCapGeo,capMat);cap.rotation.x=-Math.PI/2;cap.position.y=.0228;g.add(cap);
    const rimMat=new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xffffff,emissiveIntensity:.8,metalness:1,roughness:.22,transparent:true});
    const rim=new THREE.Mesh(puckRimGeo,rimMat);rim.rotation.x=Math.PI/2;rim.position.y=.0125;g.add(rim);
    g.userData={body:base,cap,capMat,rim,rimMat,tint:''};g.visible=false;table.add(g);return g;});
  // Tint a puck: the art canvas for this tint (the engine draws it with the phone's drawPuck), the rim colour, and the UV-arena ghosting.
  out.tintPuck=(g,tint,art,hot,alpha=1)=>{
    const u=g.userData,key=puckTintKey(tint);
    if(u.tint!==key){u.tint=key;u.rimMat.color.set(tint);u.rimMat.emissive.set(tint);}
    if(art){const t=artTexture(art);if(u.capMat.map!==t){u.capMat.map=t;u.capMat.emissiveMap=t;u.capMat.needsUpdate=true;}}
    u.rimMat.emissiveIntensity=hot?2.2:.8;
    u.capMat.opacity=alpha;u.rimMat.opacity=alpha;u.body.visible=alpha>.5;
  };
  out.touchArt=()=>{for(const t of pieceTex.values())t.needsUpdate=true;};

  // ---- Bumpers: the phone's bumper art is in the texture; a short glassy cylinder gives it some body -------------------
  const bumperGeo=new THREE.CylinderGeometry(BUMPER_R*1.02,BUMPER_R*1.1,.016,40);
  const bumperRimGeo=new THREE.TorusGeometry(BUMPER_R*1.03,.0032,8,48);
  out.bumpers=[0,1].map(()=>{
    const g=new THREE.Group();
    const m=new THREE.Mesh(bumperGeo,phys({color:0xffffff,metalness:0,roughness:.05,transparent:true,opacity:.16,clearcoat:1,clearcoatRoughness:.04,envMapIntensity:1.6,depthWrite:false}));m.position.y=.008;g.add(m);
    const ring=new THREE.Mesh(bumperRimGeo,new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xffffff,emissiveIntensity:.9,metalness:1,roughness:.2,transparent:true,opacity:.8}));ring.rotation.x=Math.PI/2;ring.position.y=.0165;g.add(ring);
    g.userData={m,ring};g.visible=false;table.add(g);return g;});

  // ---- Arena colours: rails, glow strips, accents ---------------------------------------------------------------
  out.applyArena=c=>{
    const col={p1:c.p1,p2:c.p2};
    for(const side of ['p1','p2'])for(const m of tubeMats[side]){m.emissive.set(col[side]);}
    for(const m of underglow)m.material.emissive.set(col[m.userData.side]);
    out.arenaColors=col;
  };
  out.beat=b=>{for(const side of ['p1','p2'])for(const m of tubeMats[side])m.emissiveIntensity=1.5+b*1.1;for(const m of underglow)m.material.emissiveIntensity=1.9+b*1.2;};

  // ---- Hands: capsule bones, round joints, fingertip dots, a faint palm, all in translucent CREASE cyan with a soft glow ------
  const bones=handBones(),fan=palmFan();
  const boneGeo=new THREE.CylinderGeometry(1,1,1,10,1,false),jointGeo=new THREE.SphereGeometry(1,12,8);
  const q=new THREE.Quaternion(),yAxis=new THREE.Vector3(0,1,0),dirV=new THREE.Vector3(),midV=new THREE.Vector3(),sc=new THREE.Vector3(),m4=new THREE.Matrix4();
  const handMat=()=>new THREE.MeshStandardMaterial({color:0x7ff7f7,emissive:0x36eeee,emissiveIntensity:.9,transparent:true,opacity:.62,roughness:.35,metalness:.1,depthWrite:false});
  const glowMat=()=>new THREE.MeshBasicMaterial({color:0x36eeee,transparent:true,opacity:.11,depthWrite:false,blending:THREE.AdditiveBlending});
  out.makeHand=()=>{
    const g=new THREE.Group(),pos=Array.from({length:JOINT_NAMES.length},()=>new THREE.Vector3());
    const boneI=new THREE.InstancedMesh(boneGeo,handMat(),bones.length),boneG=new THREE.InstancedMesh(boneGeo,glowMat(),bones.length);
    const jointI=new THREE.InstancedMesh(jointGeo,handMat(),JOINT_NAMES.length),jointG=new THREE.InstancedMesh(jointGeo,glowMat(),JOINT_NAMES.length);
    const tipI=new THREE.InstancedMesh(jointGeo,new THREE.MeshBasicMaterial({color:0xe9ffff,transparent:true,opacity:.95,depthWrite:false}),FINGERTIPS.length);
    for(const m of [boneI,boneG,jointI,jointG,tipI]){m.frustumCulled=false;m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);g.add(m);}
    const palmGeo=new THREE.BufferGeometry(),pa=new Float32Array(fan.verts.length*3);palmGeo.setAttribute('position',new THREE.BufferAttribute(pa,3));palmGeo.setIndex(fan.tris);
    const palm=new THREE.Mesh(palmGeo,new THREE.MeshBasicMaterial({color:0x36eeee,transparent:true,opacity:.2,side:THREE.DoubleSide,depthWrite:false}));palm.frustumCulled=false;g.add(palm);
    const set=(j,v)=>pos[j].copy(v);
    const commit=()=>{
      for(let b=0;b<bones.length;b++){
        const A=pos[bones[b][0]],B=pos[bones[b][1]];dirV.subVectors(B,A);const len=Math.max(1e-4,dirV.length());midV.addVectors(A,B).multiplyScalar(.5);
        q.setFromUnitVectors(yAxis,dirV.multiplyScalar(1/len));
        sc.set(.0052,len,.0052);m4.compose(midV,q,sc);boneI.setMatrixAt(b,m4);
        sc.set(.0125,len,.0125);m4.compose(midV,q,sc);boneG.setMatrixAt(b,m4);
      }
      for(let j=0;j<pos.length;j++){const r=j===0?.011:.0072;sc.set(r,r,r);m4.compose(pos[j],q.identity(),sc);jointI.setMatrixAt(j,m4);sc.set(r*2.3,r*2.3,r*2.3);m4.compose(pos[j],q,sc);jointG.setMatrixAt(j,m4);}
      for(let k=0;k<FINGERTIPS.length;k++){sc.set(.0058,.0058,.0058);m4.compose(pos[FINGERTIPS[k]],q.identity(),sc);tipI.setMatrixAt(k,m4);}
      for(const m of [boneI,boneG,jointI,jointG,tipI])m.instanceMatrix.needsUpdate=true;
      for(let k=0;k<fan.verts.length;k++){const p=pos[fan.verts[k]];pa[k*3]=p.x;pa[k*3+1]=p.y;pa[k*3+2]=p.z;}
      palmGeo.attributes.position.needsUpdate=true;
    };
    g.userData={set,commit,pos};g.visible=false;return g;
  };

  // ---- Controller: a finished-looking Touch-style grip (handle, tracking ring, thumbstick, trigger) ------------------
  out.makeController=()=>{
    const g=new THREE.Group();
    const shell=glossy(0x15172a,{metalness:.35,roughness:.5,clearcoat:.5,env:.8});
    const handle=new THREE.Mesh(new THREE.CapsuleGeometry(.0185,.085,6,16),shell);handle.rotation.x=Math.PI/2-.35;handle.position.set(0,-.012,.02);g.add(handle);
    const head=new THREE.Mesh(new THREE.CylinderGeometry(.034,.03,.03,28),shell);head.position.set(0,.006,-.045);head.rotation.x=Math.PI/2;g.add(head);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.047,.0065,12,44),new THREE.MeshStandardMaterial({color:0xb9faff,emissive:0x36eeee,emissiveIntensity:.9,metalness:.6,roughness:.3}));ring.position.set(0,.03,-.04);ring.rotation.x=Math.PI/2-.55;g.add(ring);
    const stick=new THREE.Mesh(new THREE.CylinderGeometry(.0085,.0095,.012,16),glossy(0x080915,{metalness:.2,roughness:.6}));stick.position.set(.0,.024,-.04);stick.rotation.x=-.2;g.add(stick);
    const trig=new THREE.Mesh(new THREE.BoxGeometry(.012,.022,.03),glossy(0x08091a,{metalness:.2,roughness:.55}));trig.position.set(0,-.006,-.062);trig.rotation.x=.4;g.add(trig);
    const stripe=new THREE.Mesh(new THREE.CylinderGeometry(.0195,.0195,.006,20),new THREE.MeshStandardMaterial({color:0x36eeee,emissive:0x36eeee,emissiveIntensity:1.2}));stripe.position.set(0,-.032,.058);stripe.rotation.x=Math.PI/2-.35;g.add(stripe);
    g.visible=false;return g;
  };

  // ---- Soft contact shadows under the pieces at rest (the phone draws its own during play) ----------------------------
  out.disposeAll=()=>{for(const t of pieceTex.values())t.dispose();if(fieldTex)fieldTex.dispose();};
  out.PADDLE_R=PADDLE_R;out.PUCK_R=PUCK_R;out.FIELD_MARGIN=FIELD_MARGIN;out.paddleRingColour=paddleRingColour;
  return out;
}
