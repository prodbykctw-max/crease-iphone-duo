// CREASE VR world: GOLD RUSH. The desert canyon of the painted arena as a real place: the table stands on a dark stone island in a lake
// of still black oil, the mesas, gilded towers and dunes rise round it as a relief and burn again in the oil. Near the player: gold
// obelisks with lit seams, a warm glow at their feet, drifting sand and a low dust haze.
import {openStage,lin,hot,four,prism,faceBand} from './quest-world-stage.mjs';

// Where the obelisks stand: [distance, bearing from straight ahead in degrees, height], planted four ways.
export const GOLD_OBELISKS=[[4.6,52,2],[7.8,32,3.6],[8.6,72,2.9],[11.2,50,4.8]];

export async function build({renderer,colors,plate,aniso=4}){
  const c=colors||{},P={a:c.grid||'#ffb020',b:c.wire||'#ffcf6b',zenith:'#030201',skyHor:'#140c04',gain:1.1,reflGain:.85,deep:'#040301',
    amb:'#241a0e',keyDir:[.4,.55,-.7],key:'#8a5a1a',fillDir:[-.6,.4,.65],fill:'#5a3a14',up:'#a8701a',rim:'#8a6a2a'};
  const st=await openStage({id:'gold-rush',plate,aniso,P,seed:79,
    relief:{fall:[1,.85,.5],breathe:.16},sky:{star:[1,.9,.75],cloud:[.12,.07,.02]},
    stone:{base:'#0e0a06',wash:'rgba(12,8,4,.66)',veins:['#ffcf6b','#ffb020']},inlay:'rgba(240,215,170,',top:{sheen:.24,tintMul:1.2},solidMat:{sheen:.22,spec:.9,shin:60},
    mist:[{n:16,r0:8.5,r1:13.5,y0:.2,y1:.8,s0:5,s1:9,sy0:1,sy1:1.8,cols:[[.07,.04,.015],[.05,.03,.012]]},{n:7,r0:4,r1:7.5,y0:.05,y1:.25,s0:3,s1:5,sy0:.4,sy1:.8,cols:[[.035,.02,.008]]}],
    motes:{n:220,cols:[lin(P.a),lin(P.b),[1,.8,.5],[.8,.6,.35]],rise:.08,height:4,r0:2.2,r1:14}});
  const {rr,solid,halos,meta}=st,A=lin(P.a),B=lin(P.b),wy=meta.waterY,gold=[.62,.46,.2];
  for(const [rad,deg,h] of GOLD_OBELISKS)four(rad,deg+rr(-2,2),(x,z)=>{
    const w=.12+h*.045;
    // stepped base, a tapering shaft and its pyramid cap; a lit seam up each face and a gilded band near the top
    prism(solid,x,z,[[w*2.2,wy-.3],[w*2.2,wy+.1],[w*1.7,wy+.12],[w*1.7,wy+.26],[w*1.25,wy+.28],[w,wy+.3],[w*.62,h],[w*.7,h+.02],[.005,h+w*1.4]],{tint:gold,uRep:1.2,chamfer:.06});
    faceBand(solid,x,z,w*.99,w*.63,wy+.4,h-.15,.08,[hot(B,.3)],1.1);
    faceBand(solid,x,z,w*.7,w*.67,h-.12,h-.06,.95,[hot(A,.4)],1.15);
    halos.push({x,y:wy+.1,z,s:1.4+h*.3,sy:.4,c:A.map(v=>v*.45)},{x,y:h+w,z,s:.8,c:hot(B,.3).map(v=>v*.25)});});
  return st.finish();
}
