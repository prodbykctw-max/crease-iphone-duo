// CREASE VR worlds: the common stage most arenas stand on, built from the kit so an arena module only adds what is its own.
//   the painted plate as a relief (ahead, behind, both reflected), the sky dome, the reflecting surface (water, wet stone, lava glass);
//   a round stone island under the table and the player, its top inlaid with two rings of the arena's light;
//   one merged "stone" mesh (st.solid, a GB) for the arena's own solid props, drawn with its reflection;
//   halos (st.halos), drifting mist, motes that rise or fall (embers, bubbles, snow), and the runtime (update, detail, stats, dispose).
// Use: const st=await openStage({...}); add props to st.solid / st.add(mesh); return st.finish(extraUpdate).
import * as THREE from './vendor/three.module.min.js';
import {waterDistance,mulberry32,texBytes} from './quest-world-pure.mjs';
import {loadWorldData,panoUniforms,buildReliefMeshes,skyMaterial,waterMaterial,propUniforms,propMaterial,GB,canvas2d,newTracker,noiseCanvas,flareCanvas,glowMaterial,moteMaterial,measure} from './quest-world-kit.mjs';

export const lin=c=>{const k=new THREE.Color(c);return [k.r,k.g,k.b];};
export const css=(c,a=1)=>{const k=new THREE.Color(c).convertLinearToSRGB();return `rgba(${Math.round(k.r*255)},${Math.round(k.g*255)},${Math.round(k.b*255)},${a})`;};
export const hot=(c,k=.3)=>c.map(v=>v+(1-v)*k);
export const STAGE_ISLAND={x:0,z:-.85,r:2.75}; // the table (z -1.25) and the player (z about 0.2) stand on it

// Dark veined stone, tileable. base = the stone colour, veins = two vein colours.
export function stoneCanvas(R,{base='#0b0916',wash='rgba(9,7,22,.66)',veins=['#9fd8ff','#c04dff'],S=512}={}){
  const [c,x]=canvas2d(S,S),n=noiseCanvas(128,R,4);x.fillStyle=base;x.fillRect(0,0,S,S);
  x.globalAlpha=.5;x.globalCompositeOperation='screen';x.drawImage(n,0,0,S,S);x.globalCompositeOperation='source-over';x.globalAlpha=1;x.fillStyle=wash;x.fillRect(0,0,S,S);
  for(let v=0;v<34;v++){const px=R()*S,py=R()*S,a=R()*6.283,big=R()<.2;x.strokeStyle=css(veins[R()<.55?0:1],big?.3:.13+R()*.1);x.lineWidth=big?1.6:.5+R()*.7;
    for(const [ox,oy] of [[0,0],[S,0],[-S,0],[0,S],[0,-S]]){let qx=px,qy=py,b=a;const R2=mulberry32(v*977+13);x.beginPath();x.moveTo(qx+ox,qy+oy);for(let s=0;s<46;s++){b+=(R2()-.5)*.75;qx+=Math.cos(b)*8;qy+=Math.sin(b)*8;x.lineTo(qx+ox,qy+oy);}x.stroke();}}
  for(let i=0;i<900;i++){x.fillStyle=`rgba(${120+R()*80|0},${120+R()*70|0},${130+R()*80|0},${.03+R()*.05})`;x.fillRect(R()*S,R()*S,1+R()*2,1+R()*2);}
  return c;
}
// The island top: the stone, a quiet inlay of hairlines, a contact shadow under the table and two rings of light set into it.
function islandCanvases(stone,{inlay='rgba(200,200,220,',ringA,ringB,rays=64,island=STAGE_ISLAND}){
  const S=1024,m=S/2,[c,x]=canvas2d(S,S),[e,ex]=canvas2d(S,S);
  x.fillStyle=x.createPattern(stone,'repeat');x.fillRect(0,0,S,S);x.fillStyle='rgba(3,3,6,.3)';x.fillRect(0,0,S,S);ex.fillStyle='#000';ex.fillRect(0,0,S,S);
  const ring=(ctx,r,w,col)=>{ctx.strokeStyle=col;ctx.lineWidth=w;ctx.beginPath();ctx.arc(m,m,r*m,0,6.2832);ctx.stroke();};
  for(let i=0;i<rays;i++){const a=i/rays*6.2832,r0=i%8===0?.26:i%2===0?.54:.66;x.strokeStyle=inlay+(i%8===0?.36:.17)+')';x.lineWidth=i%8===0?1.5:.9;x.beginPath();x.moveTo(m+Math.cos(a)*r0*m,m+Math.sin(a)*r0*m);x.lineTo(m+Math.cos(a)*.765*m,m+Math.sin(a)*.765*m);x.stroke();}
  ring(x,.26,1.5,inlay+'.34)');ring(x,.54,1.1,inlay+'.26)');ring(x,.765,2.2,inlay+'.5)');ring(x,.80,5,'rgba(2,2,5,.9)');ring(x,.93,5,'rgba(2,2,5,.9)');ring(x,.795,1.3,inlay+'.45)');ring(x,.935,1.3,inlay+'.45)');
  {const ty=m+(-1.25-island.z)/island.r*m,g=x.createRadialGradient(m,ty,0,m,ty,.5*m);g.addColorStop(0,'rgba(0,0,0,.55)');g.addColorStop(.55,'rgba(0,0,0,.28)');g.addColorStop(1,'rgba(0,0,0,0)');x.save();x.translate(m,ty);x.scale(.62,1);x.translate(-m,-ty);x.fillStyle=g;x.fillRect(0,0,S,S);x.restore();}
  const neon=(r,w,col,blur)=>{x.strokeStyle='rgba(2,2,5,.95)';x.lineWidth=w+5;x.beginPath();x.arc(m,m,r*m,0,6.2832);x.stroke();ex.shadowColor=col;ex.shadowBlur=blur;ring(ex,r,w,col);ex.shadowBlur=0;ring(ex,r,w*.4,'rgba(255,255,255,.7)');};
  neon(.966,3,ringA,12);neon(.776,2,ringB,9);
  for(let i=0;i<20;i++){const a=i/20*6.2832,px=m+Math.cos(a)*.865*m,py=m+Math.sin(a)*.865*m,col=i%2?ringB:ringA;
    x.save();x.translate(px,py);x.rotate(a+Math.PI/4);x.fillStyle='rgba(2,2,5,.95)';x.fillRect(-8,-8,16,16);x.strokeStyle=inlay+'.45)';x.lineWidth=1.2;x.strokeRect(-8,-8,16,16);x.restore();
    ex.save();ex.translate(px,py);ex.rotate(a+Math.PI/4);ex.shadowColor=col;ex.shadowBlur=10;ex.fillStyle=col;ex.fillRect(-4.5,-4.5,9,9);ex.restore();}
  return [c,e];
}
// A chamfered square prism through the rows [[halfWidth, y], ...] (flat shaded), for stepped stonework.
export function prism(gb,cx,cz,rows,o={}){const ch=o.chamfer??.18,P=[];
  for(const [w,y] of rows){const k=w*ch,pts=[[w-k,-w],[w,-w+k],[w,w-k],[w-k,w],[-w+k,w],[-w,w-k],[-w,-w+k],[-w+k,-w]];pts.push(pts[0]);P.push(pts.map(p=>[cx+p[0],y,cz+p[1]]));}
  gb.grid(P,8,{...o,flat:true,vAt:i=>rows[i][1]/(o.vTile||1.5)});}
// Thin lit strips on the four faces of a square prism (half-widths w0 at y0, w1 at y1; hw = how much of the face they span).
export function faceBand(gb,x,z,w0,w1,y0,y1,hw,T,g){for(let f=0;f<4;f++){const a=f*Math.PI/2,nx=Math.cos(a),nz=Math.sin(a),tx=nz,tz=-nx,o=.003;
  gb.quad([[x+nx*(w0+o)-tx*w0*hw,y0,z+nz*(w0+o)-tz*w0*hw],[x+nx*(w0+o)+tx*w0*hw,y0,z+nz*(w0+o)+tz*w0*hw],[x+nx*(w1+o)+tx*w1*hw,y1,z+nz*(w1+o)+tz*w1*hw],[x+nx*(w1+o)-tx*w1*hw,y1,z+nz*(w1+o)-tz*w1*hw]],[nx,0,nz],[[0,0],[1,0],[1,1],[0,1]],T,g);}}
// Plant something four ways (left/right, ahead/behind), like the mirrored painting itself.
export function four(rad,deg,f){const t=deg*Math.PI/180;for(const sx of [-1,1])for(const sz of [-1,1])f(sx*Math.sin(t)*rad,sz*-Math.cos(t)*rad,sx,sz);}

// P = palette: zenith, skyHor, gain, reflGain, amb, keyDir, key, fillDir, fill, up, rim (see kit), plus a (main light colour), b (second),
// deep (surface tint). o: relief (options for the relief shader), sky, stone (stoneCanvas options), inlay, mist [{n,r0,r1,y0,y1,s0,s1,sy0,sy1,cols}],
// motes {n,cols,rise,height,r0,r1,scale}, seed, island (false for none), top (overrides for the island top material).
export async function openStage({id,plate,aniso=4,P,relief={},sky={},stone={},inlay,mist=[],motes=null,seed=77,island=STAGE_ISLAND,surface={},top={}}){
  const {meta,data,bytes}=await loadWorldData(id),R=mulberry32(seed),rr=(a,b)=>a+(b-a)*R();
  const tr=newTracker(),group=new THREE.Group();group.name='world';
  const geos=[],mats=[],mirror=[],extras=[],halos=[],A=lin(P.a),B=lin(P.b);
  const add=(m,o={})=>{if(o.order!==undefined)m.renderOrder=o.order;m.frustumCulled=false;if(o.name)m.name=o.name;group.add(m);if(!geos.includes(m.geometry))geos.push(m.geometry);mats.push(m.material);if(o.mirror)mirror.push(m);if(o.extra)extras.push(m);return m;};
  tr.note(plate,texBytes(plate.image.width,plate.image.height),'painted plate (the same texture the flat backdrop uses)');
  const U=panoUniforms(meta,plate,P),LU=propUniforms(P);
  for(const m of buildReliefMeshes(meta,data,U,relief).meshes)add(m,{mirror:m.userData.mirror});
  const dome=add(new THREE.Mesh(new THREE.SphereGeometry(420,48,24),skyMaterial(U,sky)),{order:20,name:'sky'});dome.position.set(0,meta.eyeH,0);
  const poolR=waterDistance(meta,meta.vBase),isl=island||{x:0,z:0,r:-50};
  const water=add(new THREE.Mesh(new THREE.CircleGeometry(poolR,72),waterMaterial(U,{island:[isl.x,isl.z,isl.r+.06,poolR],deep:P.deep||'#030109',glowA:surface.glowA||P.a,glowB:surface.glowB||P.b})),{order:1,name:'water'});
  water.rotation.x=-Math.PI/2;water.position.y=meta.waterY;
  const stoneC=stoneCanvas(R,stone),stoneTex=tr.tex(stoneC,{aniso,name:'stone'}),flare=tr.tex(flareCanvas(),{aniso:1,repeat:false,name:'flare'}),solid=new GB();
  if(island){const [topC,topE]=islandCanvases(stoneC,{inlay,ringA:css(A),ringB:css(B),island});
    const g=new GB();g.disc(island.x,0,island.z,island.r,96);
    add(new THREE.Mesh(g.geometry(),propMaterial(U,LU,{map:tr.tex(topC,{aniso,repeat:false,name:'island top'}),emap:tr.tex(topE,{aniso,repeat:false,name:'island light'}),sheen:.34,gloss:.6,spec:.3,shin:90,emis:1.25,tintMul:1.6,...top})),{name:'island-top'});
    const r0=island.r,rv=(prof,o)=>solid.revolve(island.x,0,island.z,prof,96,{uRep:18,vRep:.02,...o});
    rv([[r0+.022,-.022],[r0,0]],{tint:[1.5,1.5,1.7]});rv([[r0+.012,-.036],[r0+.022,-.034],[r0+.022,-.022]],{tint:[1.1,1.1,1.25]});
    rv([[r0+.012,-.078],[r0+.012,-.036]],{tint:hot(A,.3),glow:1.3});rv([[r0+.06,-.6],[r0+.06,-.1],[r0+.05,-.082],[r0+.012,-.078]],{tint:[1.1,1.1,1.25],vRep:.3});}
  const mx=new THREE.Matrix4(),pos=new THREE.Vector3(),q=new THREE.Quaternion(),sc=new THREE.Vector3(),col=new THREE.Color(),quad=new THREE.PlaneGeometry(1,1);
  // Instanced glow sprites from a list of {x,y,z,s,sy?,c:[r,g,b]}.
  const sprites=(list,mat,name,o)=>{const m=add(new THREE.InstancedMesh(quad,mat,Math.max(1,list.length)),{name,...o});m.count=list.length;list.forEach((h,i)=>{pos.set(h.x,h.y,h.z);sc.set(h.s,h.sy||h.s,1);mx.compose(pos,q.identity(),sc);m.setMatrixAt(i,mx);col.setRGB(h.c[0],h.c[1],h.c[2]);m.setColorAt(i,col);});m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;return m;};
  const st={id,meta,data,group,add,U,LU,tr,R,rr,P,A,B,solid,halos,flare,stoneTex,poolR,sprites,aniso,
    finish(extra){
      const sg=solid.geometry();
      add(new THREE.Mesh(sg,propMaterial(U,LU,{map:stoneTex,sheen:.3,gloss:1.5,spec:.4,shin:50,emis:1.35})),{name:'stone'});
      add(new THREE.Mesh(sg,propMaterial(U,LU,{map:stoneTex,sheen:.25,emis:1.35,flipY:true})),{name:'stone-reflection',mirror:true});
      if(halos.length)sprites(halos,glowMaterial(U,flare,{pulse:.14,opacity:1}),'halos',{order:6});
      const ms=[];for(const k of mist)for(let i=0;i<k.n;i++){const a=R()*6.283,rad=rr(k.r0,k.r1);ms.push({x:Math.sin(a)*rad,y:meta.waterY+rr(k.y0,k.y1),z:Math.cos(a)*rad,s:rr(k.s0,k.s1),sy:rr(k.sy0,k.sy1),c:k.cols[(R()*k.cols.length)|0]});}
      if(ms.length)sprites(ms,glowMaterial(U,flare,{mist:true,pulse:.3,opacity:.7,drift:1.6}),'mist',{order:4,extra:true});
      if(motes){const N=motes.n,p=new Float32Array(N*3),sd=new Float32Array(N*4),cl=new Float32Array(N*3),H=motes.height||4.6;
        for(let i=0;i<N;i++){const a=R()*6.283,rad=rr(motes.r0||1.5,motes.r1||14);p[i*3]=Math.sin(a)*rad;p[i*3+1]=rr(0,H);p[i*3+2]=Math.cos(a)*rad;for(let k=0;k<4;k++)sd[i*4+k]=R();const c2=motes.cols[(R()*motes.cols.length)|0];cl[i*3]=c2[0];cl[i*3+1]=c2[1];cl[i*3+2]=c2[2];}
        const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setAttribute('aSeed',new THREE.BufferAttribute(sd,4));g.setAttribute('aCol',new THREE.BufferAttribute(cl,3));
        add(new THREE.Points(g,moteMaterial(U,{scale:motes.scale||900,height:H,rise:motes.rise??.25})),{name:'motes',order:7,extra:true});}
      return {group,id,dataBytes:bytes,
        update(t){U.uTime.value=t;if(extra)extra(t);},
        detail(d){for(const m of mirror)m.visible=d.mirror;for(const m of extras)m.visible=d.extras;},
        stats(){return {...measure(group,tr),dataBytes:bytes};},
        dispose(){group.removeFromParent();for(const g of geos)g.dispose();for(const m of mats)m.dispose();quad.dispose();tr.dispose();}};
    }};
  return st;
}
