// CREASE VR world: SAKURA. The shrine garden of the painted arena as a real place: the table stands on a dark stone island on the still
// pond, the torii, pagodas, falls and blossom trees rise round it as a relief and stand again in the water. Near the player: stone
// lanterns standing in the pond with a warm light in each, blossom petals falling, a soft pink mist.
import {openStage,lin,hot,four,prism,faceBand} from './quest-world-stage.mjs';

// Where the lanterns stand: [distance, bearing from straight ahead in degrees, height], planted four ways.
export const SAKURA_LANTERNS=[[4.4,50,1.1],[6.8,30,1.5],[7.6,70,1.35],[10.2,48,1.8]];

export async function build({renderer,colors,plate,aniso=4}){
  const c=colors||{},P={a:c.grid||'#ff9ec4',b:c.wire||'#ffc0dd',zenith:'#03010a',skyHor:'#120824',gain:1.1,reflGain:.85,deep:'#030108',
    amb:'#20142c',keyDir:[.4,.55,-.7],key:'#6a2a5a',fillDir:[-.6,.4,.65],fill:'#3a2a6a',up:'#8a3a6a',rim:'#7a4a8a'};
  const warm=lin('#ffb060');
  const st=await openStage({id:'sakura',plate,aniso,P,seed:83,
    relief:{fall:[.85,.8,1],fallSpeed:.6,breathe:.16},sky:{star:[.95,.85,1],cloud:[.1,.04,.12]},
    stone:{base:'#0c0a10',wash:'rgba(9,7,13,.66)',veins:['#ffc0dd','#ff9ec4']},inlay:'rgba(240,205,225,',top:{sheen:.22,tintMul:1.2},solidMat:{sheen:.1,spec:.4,shin:40},
    mist:[{n:16,r0:8.5,r1:13.5,y0:.2,y1:.9,s0:5,s1:9,sy0:1,sy1:1.9,cols:[[.06,.025,.05],[.04,.02,.06]]},{n:7,r0:4,r1:7.5,y0:.05,y1:.25,s0:3,s1:5,sy0:.4,sy1:.8,cols:[[.03,.012,.03]]}],
    motes:{n:300,cols:[lin(P.a),lin('#ffc0dd'),[1,.85,.92],lin(P.a)],rise:-.35,height:5.5,r0:1.8,r1:13}});
  const {rr,solid,halos,meta}=st,wy=meta.waterY,granite=[.42,.38,.42];
  for(const [rad,deg,h] of SAKURA_LANTERNS)four(rad,deg+rr(-3,3),(x,z)=>{
    const s=h/1.5,y=t=>wy+t*s;
    // a stone toro: foot, post, the fire box with a glowing window on each face, a wide roof and its knob
    prism(solid,x,z,[[.2*s,y(-.2)],[.2*s,y(.08)],[.14*s,y(.1)],[.07*s,y(.12)],[.06*s,y(.78)],[.15*s,y(.8)],[.15*s,y(.86)],[.13*s,y(.88)],[.13*s,y(1.12)],[.16*s,y(1.14)],
      [.32*s,y(1.2)],[.3*s,y(1.24)],[.08*s,y(1.4)],[.05*s,y(1.44)],[.06*s,y(1.5)],[.01*s,y(1.58)]],{tint:granite,uRep:1,chamfer:.12});
    faceBand(solid,x,z,.131*s,.131*s,y(.92),y(1.08),.6,[hot(warm,.3)],1.2);
    halos.push({x,y:y(1),z,s:.9*s,c:warm.map(v=>v*.55)},{x,y:wy+.06,z,s:1.3*s,sy:.35,c:warm.map(v=>v*.22)});});
  return st.finish();
}
