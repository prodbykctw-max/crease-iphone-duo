// CREASE VR world: PRODBY KCTW. The stage of the painted arena as a real place: the table stands on a dark stone island on a mirror-black
// floor, the speaker stacks, light walls and the prodbyKCTW screen rise round it as a relief and stand again in the floor. The half behind
// the player is the stage turned round (not mirrored), so the name reads the right way from both sides. Near the player: slim light
// totems, haze and drifting dust in the stage lights.
import {openStage,lin,hot,four,prism,faceBand} from './quest-world-stage.mjs';

// Where the light totems stand: [distance, bearing from straight ahead in degrees, height], planted four ways.
export const KCTW_TOTEMS=[[4.3,52,2.3],[7.8,34,3.4],[8.4,72,2.9]];

export async function build({renderer,colors,plate,aniso=4}){
  const c=colors||{},P={a:c.grid||'#34edb0',b:c.wire||'#42c2ff',zenith:'#010306',skyHor:'#04101c',gain:1.1,reflGain:.85,deep:'#010305',backTurn:true,
    amb:'#101c28',keyDir:[.4,.55,-.7],key:'#1c5a7a',fillDir:[-.6,.4,.65],fill:'#1a6a52',up:'#16607a',rim:'#2a5a8a'};
  const st=await openStage({id:'kctw',plate,aniso,P,seed:29,
    relief:{fall:[.7,.9,1],breathe:.18},sky:{star:[.7,.9,1],cloud:[.02,.06,.12]},
    stone:{base:'#070b10',wash:'rgba(5,8,12,.66)',veins:['#7dffbe','#46baff']},inlay:'rgba(180,215,235,',top:{sheen:.26,tintMul:1.2},solidMat:{sheen:.2,spec:.6,shin:70},
    mist:[{n:16,r0:8.5,r1:13.5,y0:.3,y1:1.1,s0:5,s1:9,sy0:1.2,sy1:2.2,cols:[[.012,.04,.07],[.01,.06,.045]]},{n:6,r0:4,r1:7.5,y0:.1,y1:.3,s0:3,s1:5,sy0:.5,sy1:.9,cols:[[.008,.03,.04]]}],
    motes:{n:200,cols:[lin(P.a),lin(P.b),lin('#b7f5e7'),lin(P.b)],rise:.18,height:5,r0:2.5,r1:14}});
  const {rr,solid,halos,meta}=st,A=lin(P.a),B=lin(P.b),wy=meta.waterY;
  KCTW_TOTEMS.forEach(([rad,deg,h],k)=>four(rad,deg,(x,z,sx,sz)=>{
    const w=.05+h*.012,col=(sx*sz>0)===(k%2===0)?A:B,alt=col===A?B:A,dark=[.5,.55,.65];
    // a stepped foot on the floor, a slim black column, a light bar up each face and a cap
    prism(solid,x,z,[[w*3,wy-.3],[w*3,wy+.05],[w*2.7,wy+.07],[w*2,wy+.07],[w*2,wy+.2],[w*1.7,wy+.22],[w,wy+.22],[w*.82,h]],{tint:dark,uRep:1.5});
    prism(solid,x,z,[[w*.82,h],[w*1.25,h+.012],[w*1.25,h+.05],[w*.5,h+.085]],{tint:dark,uRep:1});
    faceBand(solid,x,z,w*.99,w*.83,wy+.32,h-.05,.42,[hot(col,.2),hot(col,.2),hot(col,.5),hot(col,.5)],1.15);
    faceBand(solid,x,z,w*2,w*2,wy+.125,wy+.14,.86,[hot(alt,.3)],1.05);
    halos.push({x,y:(h+wy)/2+.2,z,s:.7,sy:h*1.15,c:col.map(v=>v*.2)},{x,y:h,z,s:1.3,c:col.map(v=>v*.3)});}));
  return st.finish();
}
