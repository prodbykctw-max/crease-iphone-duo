// CREASE VR world: TOXIC. The drowned laboratory of the painted arena as a real place: the table stands on a dark stone island in the
// swamp water, the specimen tanks, gantries and falls rise round it as a relief and stand mirrored in the water. Near the player: beds
// of glowing reeds in the water, bubbles rising off the water, green mist.
import * as THREE from './vendor/three.module.min.js';
import {propMaterial,GB} from './quest-world-kit.mjs';
import {openStage,lin,hot,four} from './quest-world-stage.mjs';

// Where the reed beds grow: [distance, bearing from straight ahead in degrees, size], planted four ways.
export const TOXIC_BEDS=[[4.6,46,.8],[6.4,70,1.1],[7.6,31,1.25],[9.8,52,1.4],[10.4,82,1.2]];

export async function build({renderer,colors,plate,aniso=4}){
  const c=colors||{},P={a:c.grid||'#39ff88',b:c.horizon||'#b6ff3b',zenith:'#010402',skyHor:'#041008',gain:1.1,reflGain:.85,deep:'#010503',
    amb:'#10241a',keyDir:[.4,.55,-.7],key:'#2f7a3a',fillDir:[-.6,.4,.65],fill:'#1d6a52',up:'#1f7a3a',rim:'#2a6a3a'};
  const st=await openStage({id:'toxic',plate,aniso,P,seed:41,
    relief:{fall:[.6,1,.7],fallSpeed:.9,breathe:.16},sky:{star:[.6,1,.7],cloud:[.03,.12,.05]},
    top:{sheen:.16,tintMul:1.1},
    stone:{base:'#070d0a',wash:'rgba(5,10,7,.66)',veins:['#7dff5a','#39ffd0']},inlay:'rgba(170,230,190,',
    mist:[{n:18,r0:8.5,r1:13.5,y0:.25,y1:.9,s0:5,s1:9,sy0:1.1,sy1:2,cols:[[.012,.06,.025],[.03,.07,.012]]},{n:8,r0:4,r1:7.5,y0:.1,y1:.3,s0:3,s1:5,sy0:.5,sy1:.9,cols:[[.008,.035,.015]]}],
    motes:{n:240,cols:[lin(P.a),lin(P.b),lin('#39ffd0'),lin(P.a)],rise:.9,height:3.4,r0:3.2,r1:13}});
  const {R,rr,solid,halos,U,LU,add,meta}=st,A=lin(P.a),B=lin(P.b),wy=meta.waterY;
  // beds of reeds standing in the water: thin blades, dark at the foot, glowing towards the tip
  const reeds=new GB();
  for(const [rad,deg,s] of TOXIC_BEDS)four(rad,deg+rr(-3,3),(x,z)=>{
    const r=.5*s;
    const n=Math.round(9+6*s);
    for(let k=0;k<n;k++){const a=R()*6.283,d=rr(0,r*.75),bx=x+Math.cos(a)*d,bz=z+Math.sin(a)*d,h=rr(.55,1.5)*s,lean=rr(.05,.3),la=R()*6.283,w=rr(.012,.022)*s,sp=[],wd=[],m=6;
      for(let i=0;i<m;i++){const t=i/(m-1);sp.push([bx+Math.cos(la)*lean*t*t*h,wy-.06+(h+.06)*t,bz+Math.sin(la)*lean*t*t*h]);wd.push(w*(1-.75*t*t)+.003);}
      const col=R()<.6?B:A;reeds.strip(sp,wd,[-Math.sin(la),0,Math.cos(la)],{tint:hot(col,.25),ramp:t=>.15+.85*t,glow:.75,fold:.3});
      // the bud of light at the tip
      if(k%3===0)halos.push({x:sp[m-1][0],y:sp[m-1][1],z:sp[m-1][2],s:.22*s,c:col.map(v=>v*.5)});}
    halos.push({x,y:wy+.5*s,z,s:2.2*s,c:A.map(v=>v*.06)});});
  const rg=reeds.geometry();
  add(new THREE.Mesh(rg,propMaterial(U,LU,{double:true,emis:1,tintMul:.5})),{name:'reeds'});
  add(new THREE.Mesh(rg,propMaterial(U,LU,{double:true,emis:1,tintMul:.5,flipY:true})),{name:'reeds-reflection',mirror:true});
  return st.finish();
}
