// CREASE VR world: INFERNO. The volcano of the painted arena as a real place: the table stands on a basalt island in a lake of black
// volcanic glass, the lava falls, spires and the far cone rise round it as a relief and burn again in the glass. Near the player:
// obsidian shards standing in the glass with an ember glow at their feet, embers rising, drifting smoke.
import {openStage,lin,four} from './quest-world-stage.mjs';

// Where the shards stand: [distance, bearing from straight ahead in degrees, height], planted four ways.
export const INFERNO_SHARDS=[[4.7,52,1.3],[7.6,32,2.4],[8.2,70,1.9],[10.6,50,3.2]];

// A leaning, faceted splinter of obsidian: a six-sided spike with uneven faces.
function shard(gb,x,z,h,r,R,wy){const lean=[(R()-.5)*.22*h,(R()-.5)*.22*h],jit=[];for(let j=0;j<6;j++)jit.push([.75+R()*.5,(R()-.5)*.5]);
  const P=[];for(const [k,t] of [[1.25,-.35],[1.1,0],[.82,.28],[.5,.62],[.2,.88],[.01,1]]){const row=[];for(let j=0;j<=6;j++){const q=jit[j%6],a=(j%6)/6*6.2832+q[1];
      row.push([x+Math.cos(a)*r*k*q[0]+lean[0]*t,wy+h*t,z+Math.sin(a)*r*k*q[0]+lean[1]*t]);}P.push(row);}
  gb.grid(P,6,{flat:true,tint:[.3,.26,.27],uRep:2,vAt:i=>i*.6});}

export async function build({renderer,colors,plate,aniso=4}){
  const c=colors||{},P={a:c.p1||'#ffb02f',b:c.grid||'#ff3b2f',zenith:'#040101',skyHor:'#120403',gain:1.1,reflGain:.8,deep:'#040101',
    amb:'#241010',keyDir:[.4,.5,-.75],key:'#8a2a12',fillDir:[-.6,.35,.65],fill:'#5a1a0e',up:'#a8380c',rim:'#7a2a14'};
  const st=await openStage({id:'inferno',plate,aniso,P,seed:53,
    relief:{fall:[1,.75,.3],fallKey:[1,.25,-1,.14],fallSpeed:.42,breathe:.2},sky:{star:[1,.7,.5],cloud:[.16,.03,.015]},
    stone:{base:'#0c0807',wash:'rgba(10,6,5,.66)',veins:['#ff6b2f','#ffb02f']},inlay:'rgba(230,190,170,',top:{sheen:.2,tintMul:1.3},solidMat:{sheen:.07,spec:.7,shin:70},
    mist:[{n:16,r0:8.5,r1:13.5,y0:.3,y1:1.2,s0:5,s1:9,sy0:1.4,sy1:2.6,cols:[[.07,.012,.006],[.04,.01,.008]]},{n:6,r0:4,r1:7.5,y0:.1,y1:.3,s0:3,s1:5,sy0:.5,sy1:.9,cols:[[.035,.008,.004]]}],
    motes:{n:260,cols:[lin('#ff7a2f'),lin('#ffd23f'),lin('#ff7a2f'),lin('#ff3b2f')],rise:1.6,height:6,r0:2.5,r1:14}});
  const {R,rr,solid,halos,meta}=st,A=lin(P.a),B=lin(P.b),wy=meta.waterY;
  for(const [rad,deg,h] of INFERNO_SHARDS)four(rad,deg+rr(-3,3),(x,z)=>{
    shard(solid,x,z,h*rr(.9,1.1),.12+h*.05,R,wy);
    // two lesser splinters at its foot, and the glow of the melt it stands in
    for(let k=0;k<2;k++){const a=R()*6.283,d=.22+h*.12;shard(solid,x+Math.cos(a)*d,z+Math.sin(a)*d,h*rr(.25,.45),.08+h*.03,R,wy);}
    halos.push({x,y:wy+.12,z,s:1.3+h*.5,sy:.5,c:B.map(v=>v*.55)},{x,y:wy+.06,z,s:.6+h*.2,sy:.22,c:A.map(v=>v*.7)});});
  return st.finish();
}
