// CREASE VR world: VOID. The monolith city of the painted arena as a real place: the table stands on a dark stone island on a black
// mirror floor, the slabs, gates and floating blocks rise round it as a relief and stand again in the floor. Near the player: black
// monoliths with white light running up their edges and a red ember at their feet, grey dust hanging in the air.
import {openStage,lin,hot,four,prism,faceBand} from './quest-world-stage.mjs';

// Where the monoliths stand: [distance, bearing from straight ahead in degrees, height], planted four ways.
export const VOID_MONOLITHS=[[4.5,54,1.9],[7.7,33,3.6],[8.5,73,2.7],[11,50,4.6]];

export async function build({renderer,colors,plate,aniso=4}){
  const c=colors||{},P={a:c.grid||'#cfcfcf',b:c.p2||'#ff3131',zenith:'#010101',skyHor:'#08080a',gain:1.1,reflGain:.85,deep:'#010101',
    amb:'#18181c',keyDir:[.4,.55,-.7],key:'#5a5a62',fillDir:[-.6,.4,.65],fill:'#3a3a44',up:'#4a2a2a',rim:'#6a6a72'};
  const st=await openStage({id:'void',plate,aniso,P,seed:71,
    relief:{fall:[1,1,1],breathe:.12},sky:{star:[.9,.9,.95],cloud:[.04,.04,.05]},
    stone:{base:'#08080a',wash:'rgba(6,6,8,.7)',veins:['#e0e0e0','#ff3131']},inlay:'rgba(220,220,225,',top:{sheen:.22,tintMul:1.1},solidMat:{sheen:.18,spec:.7,shin:80},
    mist:[{n:14,r0:8.5,r1:13.5,y0:.3,y1:1,s0:5,s1:9,sy0:1.1,sy1:2,cols:[[.035,.035,.04],[.03,.02,.02]]},{n:6,r0:4,r1:7.5,y0:.05,y1:.25,s0:3,s1:5,sy0:.4,sy1:.8,cols:[[.02,.02,.022]]}],
    motes:{n:200,cols:[[.7,.7,.72],[.5,.5,.52],lin(P.b),[.8,.8,.8]],rise:.12,height:5,r0:2.2,r1:14}});
  const {rr,solid,halos,meta}=st,A=lin(P.a),B=lin(P.b),wy=meta.waterY,dark=[.22,.22,.25];
  VOID_MONOLITHS.forEach(([rad,deg,h])=>four(rad,deg+rr(-2,2),(x,z)=>{
    const w=.16+h*.06;
    // a low plinth, then the slab itself (narrow side on), a white seam up each face and a red glow line at the foot
    prism(solid,x,z,[[w*1.5,wy-.3],[w*1.5,wy+.06],[w*1.3,wy+.08],[w,wy+.08],[w*.94,h]],{tint:dark,uRep:1.2,chamfer:.08});
    faceBand(solid,x,z,w*.99,w*.93,wy+.2,h-.08,.06,[hot(A,.4)],1.2);
    faceBand(solid,x,z,w*1.31,w*1.31,wy+.03,wy+.05,.9,[hot(B,.2)],1.1);
    halos.push({x,y:wy+.08,z,s:1+h*.25,sy:.35,c:B.map(v=>v*.45)},{x,y:h*.55,z,s:.9,sy:h*1.1,c:A.map(v=>v*.06)});}));
  return st.finish();
}
