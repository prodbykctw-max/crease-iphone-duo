// CREASE VR world: INFERNO. The volcano of the painted arena as a real place: the table stands on a basalt island in a lake of black
// volcanic glass, the lava falls, spires and the far cone rise round it as a relief and burn again in the glass. Near the player:
// obsidian shards standing in the glass, veined with melt and ringed with it at their feet, embers rising, drifting smoke.
import {openStage,lin,hot,four} from './quest-world-stage.mjs';

// Where the shards stand: [distance, bearing from straight ahead in degrees, height], planted four ways.
export const INFERNO_SHARDS=[[4.7,52,1.3],[7.6,32,2.4],[8.2,70,1.9],[10.6,50,3.2]];

// A leaning, faceted splinter of obsidian: a six-sided spike with uneven faces.
function shard(gb,x,z,h,r,R,wy){const lean=[(R()-.5)*.22*h,(R()-.5)*.22*h],jit=[];for(let j=0;j<6;j++)jit.push([.75+R()*.5,(R()-.5)*.5]);
  const P=[];for(const [k,t] of [[1.25,-.35],[1.1,0],[.82,.28],[.5,.62],[.2,.88],[.01,1]]){const row=[];for(let j=0;j<=6;j++){const q=jit[j%6],a=(j%6)/6*6.2832+q[1];
      row.push([x+Math.cos(a)*r*k*q[0]+lean[0]*t,wy+h*t,z+Math.sin(a)*r*k*q[0]+lean[1]*t]);}P.push(row);}
  gb.grid(P,6,{flat:true,tint:[.3,.26,.27],uRep:2,vAt:i=>i*.6});return P;}
// Cracks of melt up a shard's faces: thin glowing strips laid just proud of every other edge, white-hot at the foot and dying out towards
// the tip, so the obsidian reads as cooling round a molten core.
function veins(gb,P,hotA,hotB,reach,R){for(let j=0;j<6;j+=2){const T=[];for(let i=0;i<P.length;i++){const a=P[i][j],b=P[i][j+1],m=.28+.44*R(),w=.09*Math.max(.25,1-i/(reach+1)),f0=m-w,f1=m+w;T.push([a[0]+(b[0]-a[0])*f0,a[1],a[2]+(b[2]-a[2])*f0],[a[0]+(b[0]-a[0])*f1,a[1],a[2]+(b[2]-a[2])*f1]);}
  const cx=(P[1][0][0]+P[1][3][0])/2,cz=(P[1][0][2]+P[1][3][2])/2,push=p=>{const dx=p[0]-cx,dz=p[2]-cz,l=Math.hypot(dx,dz)||1;return [p[0]+dx/l*.006,p[1],p[2]+dz/l*.006];};
  // rows 1.. are above the glass (row 0 is under it); the strip runs from row 1 up through `reach` rows
  for(let i=1;i<=reach&&i+1<P.length;i++){const f0=(i-1)/reach,f1=i/reach,k0=Math.max(0,1-f0),k1=Math.max(0,1-f1),c0=hotA.map((v,q)=>(v*k0+hotB[q]*(1-k0))*k0),c1=hotA.map((v,q)=>(v*k1+hotB[q]*(1-k1))*k1);
    const p=[T[2*i+1],T[2*i],T[2*i+2],T[2*i+3]].map(push),n=[(p[0][0]-cx),0,(p[0][2]-cz)],l=Math.hypot(n[0],n[2])||1;
    gb.quad(p,[n[0]/l,0,n[2]/l],[[0,0],[1,0],[1,1],[0,1]],[c0,c0,c1,c1],1.3);}}}

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
    const big=shard(solid,x,z,h*rr(.9,1.1),.12+h*.05,R,wy);veins(solid,big,hot(A,.1),B,3,R);
    // a rim of melt where it meets the glass
    solid.revolve(x,wy-.01,z,[[.12+h*.05*1.4,0],[.12+h*.05*1.16,.03]],12,{tint:A.map((v,q)=>(v+B[q])*.5),glow:1.3});
    // two lesser splinters at its foot, and the glow of the melt it stands in
    for(let k=0;k<2;k++){const a=R()*6.283,d=.22+h*.12,sm=shard(solid,x+Math.cos(a)*d,z+Math.sin(a)*d,h*rr(.25,.45),.08+h*.03,R,wy);veins(solid,sm,hot(A,.06),B,2,R);}
    halos.push({x,y:wy+.12,z,s:1.3+h*.5,sy:.5,c:B.map(v=>v*.55)},{x,y:wy+.06,z,s:.6+h*.2,sy:.22,c:A.map(v=>v*.7)});});
  return st.finish();
}
