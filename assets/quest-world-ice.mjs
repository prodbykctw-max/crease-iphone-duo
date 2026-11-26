// CREASE VR world: ICE. The frozen cavern of the painted arena as a real place: the table stands on a dark stone island on black ice,
// the crystal cliffs, arches and frozen falls rise round it as a relief and stand again in the ice. Near the player: clusters of
// glassy crystal standing in the ice with a cold glow at their feet, snow falling, a low freezing mist.
import {openStage,lin,hot,four} from './quest-world-stage.mjs';

// Where the crystal clusters stand: [distance, bearing from straight ahead in degrees, height], planted four ways.
export const ICE_CRYSTALS=[[4.6,50,1.2],[7.4,31,2.3],[8.3,71,1.8],[10.5,49,3]];

// One crystal: a six-sided column with a pointed tip, leaning a little.
function crystal(gb,x,z,h,r,R,wy,tint){const lean=[(R()-.5)*.3*h,(R()-.5)*.3*h],spin=R()*6.283,P=[];
  for(const [k,t] of [[1,-.3],[1,0],[1,.7],[.55,.86],[.01,1]]){const row=[];for(let j=0;j<=6;j++){const a=spin+(j%6)/6*6.2832;
      row.push([x+Math.cos(a)*r*k+lean[0]*t,wy+h*t,z+Math.sin(a)*r*k+lean[1]*t]);}P.push(row);}
  gb.grid(P,6,{flat:true,tint,uRep:2,vAt:i=>i*.6,glow:t=>.15+.5*t});}

export async function build({renderer,colors,plate,aniso=4}){
  const c=colors||{},P={a:c.grid||'#6fd8ff',b:c.wire||'#9fe8ff',zenith:'#010309',skyHor:'#061426',gain:1.1,reflGain:.85,deep:'#010309',
    amb:'#12223a',keyDir:[.4,.55,-.7],key:'#2a5a8a',fillDir:[-.6,.4,.65],fill:'#1a4a7a',up:'#2a6a9a',rim:'#3a7aaa'};
  const st=await openStage({id:'ice',plate,aniso,P,seed:61,
    relief:{fall:[.75,.92,1],fallSpeed:.55,breathe:.14},sky:{star:[.75,.9,1],cloud:[.02,.07,.14]},
    stone:{base:'#070b14',wash:'rgba(5,8,16,.66)',veins:['#9fe8ff','#6fd8ff']},inlay:'rgba(190,225,250,',top:{sheen:.3,tintMul:1.2},solidMat:{sheen:.3,spec:.9,shin:90},
    mist:[{n:18,r0:8.5,r1:13.5,y0:.2,y1:.8,s0:5,s1:9,sy0:1,sy1:1.8,cols:[[.02,.05,.08],[.03,.05,.07]]},{n:8,r0:4,r1:7.5,y0:.05,y1:.25,s0:3,s1:5,sy0:.4,sy1:.8,cols:[[.015,.035,.05]]}],
    motes:{n:320,cols:[[.8,.9,1],[.6,.8,1],lin(P.b),[.9,.95,1]],rise:-.7,height:6,r0:1.8,r1:13}});
  const {R,rr,solid,halos,meta}=st,A=lin(P.a),B=lin(P.b),wy=meta.waterY,glass=hot(A,.1).map(v=>v*.6);
  for(const [rad,deg,h] of ICE_CRYSTALS)four(rad,deg+rr(-3,3),(x,z)=>{
    crystal(solid,x,z,h*rr(.9,1.1),.1+h*.06,R,wy,glass);
    for(let k=0;k<3;k++){const a=R()*6.283,d=.2+h*.13;crystal(solid,x+Math.cos(a)*d,z+Math.sin(a)*d,h*rr(.3,.55),.06+h*.03,R,wy,glass);}
    halos.push({x,y:wy+.1,z,s:1.2+h*.5,sy:.45,c:A.map(v=>v*.4)},{x,y:wy+h*.8,z,s:.5+h*.2,c:B.map(v=>v*.18)});});
  return st.finish();
}
