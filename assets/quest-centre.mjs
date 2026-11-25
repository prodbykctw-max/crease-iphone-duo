// The arena's centrepiece as a real 3D object floating over the middle of the table (VR). It is the phone's own object: the same shader and meshes
// (assets/arena-engine.js, handed over by the host), the same spin, tilt, breathing and bob (quest-centre-pure.mjs), and the same size relative to
// the table. Visual only: on the phone nothing collides with it, so neither does the puck here. When the puck or a paddle would be hidden behind it
// from where you stand, it fades out; a soft light pool and a shadow on the table show that it floats.
import * as THREE from './vendor/three.module.min.js';
import {centreFrame,centreExtent,centreRadius,centreHeight,CENTRE_GLOW,FADE_MIN,sightBlocked,fadeStep,solidFragment} from './quest-centre-pure.mjs';

const VERT=`
varying vec3 N; varying vec3 P; varying vec3 V;
void main(){
  P=position; vec4 w=modelMatrix*vec4(position,1.);
  N=normalize(mat3(modelMatrix)*normal);
  V=normalize(cameraPosition-w.xyz);
  gl_Position=projectionMatrix*viewMatrix*w;
}`;

function radialTex(stops){
  const cv=document.createElement('canvas');cv.width=cv.height=128;const c=cv.getContext('2d'),g=c.createRadialGradient(64,64,0,64,64,64);
  for(const [o,col] of stops)g.addColorStop(o,col);c.fillStyle=g;c.fillRect(0,0,128,128);
  const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;return t;
}

// soft: software GL (no noise shader; a plain lit ball in the world's colour).
export function createCentre({table,soft=false}){
  const out={ok:false,alpha:1,frames:0,kind:'',errors:0};
  const group=new THREE.Group();group.visible=false;table.add(group);
  const frame={};
  // shared uniforms: one object per value, referenced by both materials, so a frame writes each once
  const U={style:{value:0},time:{value:0},beat:{value:0},texturedSun:{value:0},alpha:{value:1}};
  let bodyMat=null,ringMat=null,fragment='';
  const bodyMesh=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial());bodyMesh.frustumCulled=false;group.add(bodyMesh);
  const ringMesh=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial());ringMesh.frustumCulled=false;ringMesh.visible=false;group.add(ringMesh);
  const geos={};
  // atmosphere: a soft fresnel shell in the world's own colour around the body (the phone shader stays untouched)
  const shellU={glow:{value:new THREE.Color(0xff6a1a)},alpha:{value:1},k:{value:1}};
  const SHELL_V=`varying vec3 N; varying vec3 V; void main(){ vec4 w=modelMatrix*vec4(position,1.); N=normalize(mat3(modelMatrix)*normal); V=normalize(cameraPosition-w.xyz); gl_Position=projectionMatrix*viewMatrix*w; }`;
  const SHELL_F=`precision mediump float; varying vec3 N; varying vec3 V; uniform vec3 glow; uniform float alpha; uniform float k; void main(){ float f=1.-abs(dot(normalize(N),normalize(V))); float a=pow(f,3.)*k*alpha; gl_FragColor=vec4(glow*(.6+f),a); }`;
  const shell=new THREE.Mesh(new THREE.BufferGeometry(),soft?new THREE.MeshBasicMaterial({color:0xff6a1a,transparent:true,opacity:.14,blending:THREE.AdditiveBlending,depthWrite:false}):new THREE.ShaderMaterial({vertexShader:SHELL_V,fragmentShader:SHELL_F,uniforms:shellU,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.FrontSide}));
  shell.frustumCulled=false;shell.visible=false;shell.renderOrder=3;group.add(shell);
  function mk(arr){const n=arr.length/6,pos=new Float32Array(n*3),nor=new Float32Array(n*3);
    for(let i=0;i<n;i++){pos[i*3]=arr[i*6];pos[i*3+1]=arr[i*6+1];pos[i*3+2]=arr[i*6+2];nor[i*3]=arr[i*6+3];nor[i*3+1]=arr[i*6+4];nor[i*3+2]=arr[i*6+5];}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('normal',new THREE.BufferAttribute(nor,3));g.computeBoundingSphere();return g;}
  // The light pool under it and a faint shadow, shared by every arena (tinted per kind)
  const poolTex=radialTex([[0,'rgba(255,255,255,.9)'],[.35,'rgba(255,255,255,.35)'],[1,'rgba(255,255,255,0)']]);
  const shadowTex=radialTex([[0,'rgba(0,0,0,.55)'],[.55,'rgba(0,0,0,.28)'],[1,'rgba(0,0,0,0)']]);
  const pool=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:poolTex,color:0xff6a1a,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false}));
  pool.rotation.x=-Math.PI/2;pool.position.y=.0035;pool.renderOrder=1;pool.visible=false;table.add(pool);
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:shadowTex,transparent:true,opacity:.6,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2;shadow.position.y=.0033;shadow.renderOrder=1;shadow.visible=false;table.add(shadow);

  // Hand over the phone's assets (once). Returns true when the object can be drawn.
  out.setAssets=a=>{
    if(!a||!a.geometry)return false;
    for(const [k,arr] of Object.entries(a.geometry)){if(geos[k])geos[k].dispose();geos[k]=mk(new Float32Array(arr));}
    fragment=a.fragment;
    if(!soft){
      const frag=solidFragment(fragment);
      const mat=ring=>new THREE.ShaderMaterial({vertexShader:VERT,fragmentShader:frag,uniforms:{...U,isRing:{value:ring?1:0}},transparent:true,side:THREE.DoubleSide});
      bodyMat=mat(false);ringMat=mat(true);
    }else{
      bodyMat=new THREE.MeshStandardMaterial({color:0x888888,emissive:0x442200,roughness:.45,metalness:.2,transparent:true,flatShading:true});
      ringMat=new THREE.MeshStandardMaterial({color:0xaaaaaa,emissive:0x222222,roughness:.5,metalness:.2,transparent:true,side:THREE.DoubleSide});
    }
    bodyMesh.material=bodyMat;ringMesh.material=ringMat;ringMesh.geometry=geos.ring;
    shell.geometry=geos.sphere;
    out.ok=!!(geos.sphere&&geos.crystal&&geos.ring);return out.ok;
  };

  const tmpC=new THREE.Color();
  // info: {kind, index, ready}; t seconds; beat 0..1; eye: table-local eye position; sights: Float32Array of table-local points (x,y,z)*n.
  out.update=(info,t,beat,dt,ex,ey,ez,sights,n)=>{
    if(!out.ok||!info){group.visible=pool.visible=shadow.visible=shell.visible=false;return;}
    const f=centreFrame(info.kind,info.index,t,beat,frame);
    if(out.kind!==f.kind){out.kind=f.kind;bodyMesh.geometry=f.faceted?geos.crystal:geos.sphere;tmpC.set(CENTRE_GLOW[f.kind]);pool.material.color.copy(tmpC);shellU.glow.value.copy(tmpC);if(soft)shell.material.color.copy(tmpC);
      if(soft){bodyMat.color.copy(tmpC);bodyMat.emissive.copy(tmpC).multiplyScalar(.35);ringMat.color.copy(tmpC);ringMat.emissive.copy(tmpC).multiplyScalar(.25);}}
    const unit=f.unit,cy=centreHeight(f),R=centreRadius(f);
    group.visible=true;group.position.set(0,cy,0);
    bodyMesh.scale.setScalar(f.bodyScale*unit);bodyMesh.rotation.set(f.tilt,f.angle,0);
    shell.visible=true;shell.scale.setScalar(f.bodyScale*unit*(f.faceted?1.75:1.2));
    ringMesh.visible=f.ringed;if(f.ringed){ringMesh.scale.setScalar(f.ringScale*unit);ringMesh.rotation.set(f.ringTilt,f.ringAngle,0);}
    // fade while it hides the puck or a paddle from this eye
    let blocked=false;const br=R*1.02;
    for(let i=0;i<n&&!blocked;i++)blocked=sightBlocked(ex,ey,ez,sights[i*3],sights[i*3+1],sights[i*3+2],0,cy,0,br);
    out.alpha=fadeStep(out.alpha,blocked?FADE_MIN:1,dt);
    shellU.alpha.value=out.alpha;shellU.k.value=1.15+beat*.6+Math.sin(t*2.1+f.bodyScale)*.12;if(soft)shell.material.opacity=.14*out.alpha;U.alpha.value=out.alpha;U.time.value=t;U.beat.value=beat;U.style.value=f.style;U.texturedSun.value=f.kind==='sun'?1:0;
    if(soft){bodyMat.opacity=out.alpha;ringMat.opacity=out.alpha;}
    // the light it throws on the table and its shadow (they shrink a little as it rises with the bob)
    pool.visible=shadow.visible=true;
    const ps=R*3.1*(1+f.bob*.3);pool.scale.set(ps,ps,1);pool.material.opacity=(.38+beat*.3)*(.4+.6*out.alpha);
    const ss=R*2.3;shadow.scale.set(ss,ss,1);shadow.material.opacity=.55*(.3+.7*out.alpha);
    out.frames++;
  };
  out.group=group;out.pool=pool;out.shadow=shadow;out.frame=frame;
  out.dispose=()=>{for(const g of Object.values(geos))g.dispose();poolTex.dispose();shadowTex.dispose();};
  return out;
}
