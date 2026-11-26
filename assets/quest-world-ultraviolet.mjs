// CREASE VR world: ULTRAVIOLET. The space station of the painted arena as a real place: the table stands on a dark stone island on a
// mirror-black deck, the station rings, spires and the nebula rise round it as a relief and stand again in the deck. Near the player:
// faceted asteroids hanging in the air with a violet glow under them, slow sparks drifting up.
import {openStage,lin,hot,four} from './quest-world-stage.mjs';

// Where the asteroids hang: [distance, bearing from straight ahead in degrees, size, height above the deck], planted four ways.
export const UV_ROCKS=[[5,48,.38,1.9],[7.6,30,.62,3],[8.6,72,.5,2.4],[11,52,.9,3.8]];

// A lumpy faceted rock: a coarse sphere with every vertex pushed in or out.
function rock(gb,x,y,z,r,R,tint){const N=7,M=5,bump=[];for(let i=0;i<=M;i++){bump.push([]);for(let j=0;j<N;j++)bump[i].push(.72+R()*.5);}
  const sq=[.55+R()*.5,.7+R()*.3,.55+R()*.5],P=[];
  for(let i=0;i<=M;i++){const th=i/M*Math.PI,row=[];for(let j=0;j<=N;j++){const ph=(j%N)/N*6.2832,k=(i===0||i===M)?.85:bump[i][j%N];
      row.push([x+Math.sin(th)*Math.cos(ph)*r*k*sq[0],y+Math.cos(th)*r*k*sq[1],z+Math.sin(th)*Math.sin(ph)*r*k*sq[2]]);}P.push(row);}
  gb.grid(P,N,{flat:true,tint,uRep:1.5,vAt:i=>i*.4});}

export async function build({renderer,colors,plate,aniso=4}){
  const c=colors||{},P={a:c.grid||'#a06bff',b:c.wire||'#c9a0ff',zenith:'#03010a',skyHor:'#0e0620',gain:1.1,reflGain:.85,deep:'#030108',
    amb:'#1a1230',keyDir:[.4,.55,-.7],key:'#5a3a9a',fillDir:[-.6,.4,.65],fill:'#3a2a7a',up:'#6a3aaa',rim:'#7a5aba'};
  const st=await openStage({id:'ultraviolet',plate,aniso,P,seed:67,
    relief:{fall:[.8,.6,1],breathe:.18},sky:{star:[.85,.75,1],cloud:[.08,.03,.14]},
    stone:{base:'#0a0712',wash:'rgba(8,5,16,.66)',veins:['#c9a0ff','#a06bff']},inlay:'rgba(210,190,245,',top:{sheen:.24,tintMul:1.2},solidMat:{sheen:.12,spec:.5,shin:50},
    mist:[{n:14,r0:8.5,r1:13.5,y0:.3,y1:1,s0:5,s1:9,sy0:1.1,sy1:2,cols:[[.04,.015,.07],[.025,.01,.06]]},{n:6,r0:4,r1:7.5,y0:.05,y1:.25,s0:3,s1:5,sy0:.4,sy1:.8,cols:[[.02,.008,.04]]}],
    motes:{n:220,cols:[lin(P.a),lin(P.b),[.95,.85,1],lin(P.a)],rise:.25,height:6,r0:2.2,r1:14}});
  const {R,rr,solid,halos}=st,A=lin(P.a),B=lin(P.b),stoneT=[.34,.3,.4];
  for(const [rad,deg,s,y] of UV_ROCKS)four(rad,deg+rr(-4,4),(x,z)=>{
    const yy=y*rr(.85,1.15);rock(solid,x,yy,z,s*rr(.85,1.15),R,stoneT);
    // a pebble or two keeping it company, and the violet light it hangs in
    for(let k=0;k<2;k++){const a=R()*6.283,d=s*rr(1.6,2.4);rock(solid,x+Math.cos(a)*d,yy+rr(-.5,.6),z+Math.sin(a)*d,s*rr(.18,.32),R,stoneT);}
    halos.push({x,y:yy-s*.6,z,s:s*3,sy:s*1.4,c:A.map(v=>v*.28)},{x,y:yy+s*.3,z,s:s*2,c:hot(B,.2).map(v=>v*.1)});});
  return st.finish();
}
