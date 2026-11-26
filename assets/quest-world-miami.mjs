// CREASE VR world: MIAMI. The neon beachfront of the painted arena as a real place: the table stands on a dark stone island in a wet,
// mirror-bright plaza, the hotels, palms and the night sea rise round it as a relief and glow again in the wet floor. Near the player:
// palm trees with their trunks in the water and a pink light at their feet, low bollard lights, warm haze.
import * as THREE from './vendor/three.module.min.js';
import {propMaterial,GB} from './quest-world-kit.mjs';
import {openStage,lin,hot,four,prism} from './quest-world-stage.mjs';

// Where the palms stand: [distance, bearing from straight ahead in degrees, height], planted four ways.
export const MIAMI_PALMS=[[5.2,56,3.4],[8.4,36,4.6],[9.6,70,4]];
// Where the bollard lights stand: [distance, bearing], planted four ways.
export const MIAMI_BOLLARDS=[[3.9,38],[4.3,74],[6.4,52]];

export async function build({renderer,colors,plate,aniso=4}){
  const c=colors||{},P={a:c.grid||'#ff5ea8',b:c.wire||'#5ff0e0',zenith:'#02020a',skyHor:'#0c0820',gain:1.1,reflGain:.9,deep:'#030208',
    amb:'#1e1426',keyDir:[.4,.55,-.7],key:'#7a2a5a',fillDir:[-.6,.4,.65],fill:'#1a5a6a',up:'#8a2a6a',rim:'#3a8a9a'};
  const st=await openStage({id:'miami',plate,aniso,P,seed:73,
    relief:{fall:[.6,1,.95],breathe:.16},sky:{star:[.9,.85,1],cloud:[.08,.04,.1]},
    stone:{base:'#0c0a10',wash:'rgba(9,7,13,.66)',veins:['#ff9ad0','#5ff0e0']},inlay:'rgba(240,200,225,',top:{sheen:.3,tintMul:1.25},solidMat:{sheen:.16,spec:.6,shin:60},
    mist:[{n:14,r0:8.5,r1:13.5,y0:.3,y1:1,s0:5,s1:9,sy0:1.1,sy1:2,cols:[[.06,.02,.04],[.02,.04,.05]]},{n:6,r0:4,r1:7.5,y0:.05,y1:.25,s0:3,s1:5,sy0:.4,sy1:.8,cols:[[.03,.012,.024]]}],
    motes:{n:160,cols:[lin(P.a),lin(P.b),[1,.85,.7],lin(P.a)],rise:.15,height:5,r0:2.5,r1:14}});
  const {R,rr,solid,halos,U,LU,add,meta}=st,A=lin(P.a),B=lin(P.b),wy=meta.waterY,bark=[.32,.26,.3];
  const fronds=new GB();
  for(const [rad,deg,h] of MIAMI_PALMS)four(rad,deg+rr(-3,3),(x,z)=>{
    // a slim curved trunk, leaning one way, with its crown of drooping fronds
    const la=R()*6.283,lean=rr(.25,.6),path=[];for(let i=0;i<=8;i++){const t=i/8;path.push([x+Math.cos(la)*lean*t*t*h*.3,wy-.1+(h+.1)*t,z+Math.sin(la)*lean*t*t*h*.3,(.13-.06*t)*(.7+h*.08)]);}
    solid.tube(path,6,{tint:bark,vRep:3});
    const top=path[8];
    for(let k=0;k<11;k++){const a=k/11*6.283+rr(-.2,.2),L=rr(1.2,1.9)*(.6+h*.1),droop=rr(.6,1),sp=[],wd=[],m=7;
      for(let i=0;i<m;i++){const t=i/(m-1);sp.push([top[0]+Math.cos(a)*L*t,top[1]+.15*L*t-droop*L*t*t,top[2]+Math.sin(a)*L*t]);wd.push(.17*L*Math.sin(Math.PI*Math.min(1,t*1.1+.05))+.01);}
      fronds.strip(sp,wd,[-Math.sin(a),0,Math.cos(a)],{tint:[.07,.12,.09],ramp:t=>.6+.4*t,glow:.05,fold:.35});}
    halos.push({x,y:wy+.12,z,s:1.6,sy:.4,c:A.map(v=>v*.5)},{x:top[0],y:top[1],z:top[2],s:2.4,c:A.map(v=>v*.05)});});
  for(const [rad,deg] of MIAMI_BOLLARDS)four(rad,deg,(x,z,sx,sz)=>{const col=sx*sz>0?A:B;
    prism(solid,x,z,[[.11,wy-.2],[.11,wy+.5],[.08,wy+.52],[.08,wy+.62],[.11,wy+.64],[.11,wy+.7]],{tint:[.3,.28,.32],uRep:.8});
    solid.revolve(x,wy+.52,z,[[.075,0],[.075,.1]],8,{tint:hot(col,.4),glow:1.1});
    halos.push({x,y:wy+.57,z,s:.6,c:col.map(v=>v*.6)},{x,y:wy+.05,z,s:1.2,sy:.3,c:col.map(v=>v*.3)});});
  const fg=fronds.geometry();
  add(new THREE.Mesh(fg,propMaterial(U,LU,{double:true,tintMul:1.4})),{name:'fronds'});
  add(new THREE.Mesh(fg,propMaterial(U,LU,{double:true,tintMul:1.4,flipY:true})),{name:'fronds-reflection',mirror:true});
  return st.finish();
}
