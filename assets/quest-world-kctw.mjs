// CREASE VR world: PRODBY KCTW. The stage of the painted arena as a real place: the table stands on a dark stone island on a mirror-black
// floor, the speaker stacks, light walls and the prodbyKCTW screen rise round it as a relief and stand again in the floor. The half behind
// the player is the stage turned round (not mirrored), so the name reads the right way from both sides. Near the player: slim light
// totems, speaker stacks turned to face the table, haze and drifting dust in the stage lights.
import {openStage,lin,hot,four,prism,faceBand} from './quest-world-stage.mjs';

// Where the light totems stand: [distance, bearing from straight ahead in degrees, height], planted four ways.
export const KCTW_TOTEMS=[[4.3,52,2.3],[7.8,34,3.4],[8.4,72,2.9]];
// Where the speaker stacks stand: [distance, bearing, height of the cabinet], planted four ways, each turned to face the table.
export const KCTW_SPEAKERS=[[6.1,62,1.5],[10.2,46,2.3]];

// A speaker cone facing local +z: a glowing surround ring, a dark cone stepping in to a glossy dust cap. (cx,cy) is its centre on the baffle.
function cone(gb,cx,cy,z0,r,ring){const rows=[[r*1.08,0,ring,1.25],[r*.98,0,ring,1.25],[r*.92,-.01,[.2,.22,.26],0],[r*.42,-.07*r*4,[.12,.13,.16],0],[r*.26,-.06*r*4,[.5,.55,.62],.06],[.001,-.03*r*4,[.6,.65,.75],.06]];
  for(let i=0;i<rows.length-1;i++){const a=rows[i],b=rows[i+1],P=[[],[]];for(let j=0;j<=20;j++){const t=j/20*6.2832;P[0].push([cx+Math.cos(t)*a[0],cy+Math.sin(t)*a[0],z0-a[1]+.004]);P[1].push([cx+Math.cos(t)*b[0],cy+Math.sin(t)*b[0],z0-b[1]+.004]);}
    gb.grid(P,20,{tint:a[2],glow:a[3]},true);}}
// A tall black speaker cabinet like the painted stacks, built at the origin facing +z: a plinth, the box with a lit edge line, two woofers
// and a tweeter, and a bar of light along the top.
function speaker(gb,h,col,alt){const w=.42+h*.12,d=w*.9,y0=.02,dark=[.32,.34,.4];
  const box=(x0,x1,ya,yb,z0,z1,t,g=0)=>{const F=[[[x0,ya,z1],[x1,ya,z1],[x1,yb,z1],[x0,yb,z1],[0,0,1]],[[x1,ya,z0],[x0,ya,z0],[x0,yb,z0],[x1,yb,z0],[0,0,-1]],[[x1,ya,z1],[x1,ya,z0],[x1,yb,z0],[x1,yb,z1],[1,0,0]],[[x0,ya,z0],[x0,ya,z1],[x0,yb,z1],[x0,yb,z0],[-1,0,0]],[[x0,yb,z1],[x1,yb,z1],[x1,yb,z0],[x0,yb,z0],[0,1,0]]];
    for(const f of F)gb.quad(f.slice(0,4),f[4],[[0,0],[1,0],[1,1],[0,1]],[t],g);};
  box(-w*1.08,w*1.08,y0-.4,y0+.12,-d*1.08,d*1.08,dark);
  box(-w,w,y0+.12,y0+.12+h,-d,d,[.22,.24,.3]);
  // lit edge lines up the front corners and across the top
  for(const sx of [-1,1])box(sx*w-.012,sx*w+.012,y0+.14,y0+.1+h,d-.004,d+.012,hot(col,.4),1.2);
  box(-w*.96,w*.96,y0+h+.06,y0+h+.1,d-.004,d+.012,hot(alt,.4),1.2);
  const r1=w*.62,fz=d+.004;cone(gb,0,y0+.12+h*.27,fz,r1,hot(col,.3));cone(gb,0,y0+.12+h*.64,fz,r1,hot(col,.3));cone(gb,0,y0+.12+h*.89,fz,w*.2,hot(alt,.3));
  return [r1,d];}

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
  KCTW_SPEAKERS.forEach(([rad,deg,h],k)=>four(rad,deg,(x,z,sx,sz)=>{
    const col=(sx*sz>0)===(k%2===1)?A:B,alt=col===A?B:A;
    solid.at(Math.atan2(-x,-z),x,wy,z);const [r1,d]=speaker(solid,h,col,alt);solid.at(0,0,0,0);
    const l=Math.hypot(x,z)||1,fx=x-x/l*(d+.05),fz=z-z/l*(d+.05);
    halos.push({x:fx,y:wy+.12+h*.27,z:fz,s:r1*3,c:col.map(v=>v*.16)},{x:fx,y:wy+.12+h*.64,z:fz,s:r1*3,c:col.map(v=>v*.16)},{x,y:wy+.04,z,s:2.6,sy:.4,c:col.map(v=>v*.22)});}));
  return st.finish();
}
