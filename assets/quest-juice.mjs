// Pure helpers for the VR scenes and effects (no three.js, so they can be unit tested).
// Field units are the engine's: u across [0,1], v along [0,L]; the VR table is 1 m wide, so 1 field unit = 1 m.
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const seg=(t,a,b)=>clamp((t-a)/(b-a),0,1);
export const ease={
  out3:k=>1-Math.pow(1-k,3),
  outBack:k=>{const c=1.6;return 1+(c+1)*Math.pow(k-1,3)+c*Math.pow(k-1,2);},
  inOut:k=>k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2,
};

// ---- Intro: the phone game's own beats (updateIntro) ----------------------------
// 0.0 crease draws, 0.8 table unfolds, 1.8 paddles slide in, 2.4 puck drops, 2.9 rally,
// 4.75 smash into the crease, 5.0 title stamps, 6.1 tagline, 7.6 hand over to the menu.
export const INTRO_END=7.6;
// [time, u, side]: side 1 = hit by player 1 (near you), 2 = by player 2, 0 = free, 9 = the final smash.
export const RALLY=[[2.9,.5,0],[3.28,.32,1],[3.66,.7,2],[3.98,.27,1],[4.26,.72,2],[4.5,.42,1],[4.75,.5,9]];
const PAD_R=.085,PUCK_R=.042;
const hv=(side,L)=>side===1?L-.2-PAD_R-PUCK_R+.004:side===2?.2+PAD_R+PUCK_R-.004:L/2;
export function rallyPos(t,L=1.8){
  if(t<=RALLY[0][0])return {u:.5,v:L/2};
  for(let i=0;i<RALLY.length-1;i++){
    const [t0,u0,s0]=RALLY[i],[t1,u1,s1]=RALLY[i+1];
    if(t<=t1){const k=(t-t0)/(t1-t0),a=hv(s0===9?0:s0,L),b=hv(s1===9?0:s1,L);return {u:u0+(u1-u0)*k,v:a+(b-a)*k};}
  }
  return {u:.5,v:L/2};
}
function lastTouch(T){return T<3.28?0:T<3.66?1:T<3.98?2:T<4.26?1:T<4.5?2:1;}
// Where the paddle of `side` is: slides in, then moves from hit to hit with a small lunge into each one.
function paddleAt(side,T,L){
  const home=side===1?L-.2:.2,off=side===1?L+.35:-.35;
  let u=.5,v=off+(home-off)*ease.out3(seg(T,1.8,2.6));
  if(T>2.9){
    const hits=RALLY.filter(r=>r[2]===side);let prev={t:2.9,u:.5},next=null;
    for(const [t,hu] of hits){if(t<=T)prev={t,u:hu};else{next={t,u:hu};break;}}
    if(next){u=prev.u+(next.u-prev.u)*ease.inOut(seg(T,prev.t,next.t));const until=next.t-T;v=home+(until<.12?(side===1?-1:1)*.05*(1-until/.12):0);}
    else{u=prev.u;v=home;}
  }
  return {u,v};
}
export function introFrame(T,L=1.8){
  const puckOn=T>=2.4,p=rallyPos(T,L);
  const drop=T<2.9?Math.max(0,1-seg(T,2.4,2.9))*.35:0;   // the puck falls onto the crease
  return {
    crease:seg(T,0,.8),fold:ease.inOut(seg(T,.8,1.8)),showTable:T>=.8,
    puck:{on:puckOn,u:p.u,v:p.v,drop,last:lastTouch(T),smashed:T>=4.9},
    p1:paddleAt(1,T,L),p2:paddleAt(2,T,L),padsOn:T>=1.8,
    title:seg(T,5,5.45),tag:seg(T,6.1,6.6),fade:seg(T,7,INTRO_END)
  };
}
// Named beats crossed between two times (for sounds, sparks, haptics).
export function introBeats(a,b){
  const out=[],at=(n,t)=>{if(a<t&&b>=t)out.push(n);};
  at('hum',.05);at('unfold',.8);at('paddles',1.8);at('drop',2.9);
  for(let i=1;i<RALLY.length-1;i++)at('hit'+i,RALLY[i][0]);
  at('smash',4.75);at('title',5);at('tag',6.1);at('end',INTRO_END);
  return out;
}

// ---- Victory: the phone's drawVictory ---------------------------------------------
// A colour wash sweeps out of the winner's goal while the result is stamped in, then the score.
export function victoryFrame(T){
  const stamp=seg(T,.15,.5);
  return {wash:ease.out3(seg(T,0,.9)),washAlpha:.28*(1-seg(T,1.6,3))+.06,
    stamp,stampScale:stamp<=0?0:2.2-1.2*ease.outBack(stamp),sub:seg(T,.6,.9),menuAt:2.8,ready:T>=2.8};
}

// ---- Floating text, rings, bars, shake ----------------------------------------------
// display, scale in, rise, tilt, fade (the phone's drawPop).
export function popFrame(p){
  const k=clamp(p.t/p.life,0,1);
  return {scale:ease.outBack(seg(p.t,0,.14))*(1+.1*(p.big?1:0)),rise:ease.out3(k)*(p.big?.14:.1),alpha:1-seg(k,.6,1),tilt:p.rot*(1-k)};
}
// Impact ring: radius grows to `max` (field units), fades out. A ring that has not started yet (negative age) is hidden.
export function ringFrame(r){
  if(r.age<0||r.age>=r.life)return null;
  const k=r.age/r.life;return {radius:Math.max(.01,r.max*ease.out3(k)),alpha:(1-k)*(1-k)};
}
// The race-to-N bars: per cell, how full it is (smooth), the white chunk catching up, and whether it pulses.
export function barCells(b,score,N=7){
  const cells=[];
  for(let k=0;k<N;k++)cells.push({fill:clamp(b.shown-k,0,1),chunk:clamp(b.chunk-k,0,1)});
  const matchPoint=score===N-1;
  return {cells,matchPoint,hot:score>=N-3,flash:Math.max(0,b.flash||0),punch:Math.max(0,b.punch||0)};
}
// Screen shake becomes a short jolt of the TABLE (never the player's view). Metres, capped at 1.2 cm.
export function shakeOffset(shake,rx,rz){
  const a=clamp(shake,0,1)*.012;
  return {x:(rx*2-1)*a,z:(rz*2-1)*a};
}
// Short text for a toast about something unlocked.
export function unlockLine(ev){
  if(!ev)return '';
  const name=String(ev.name||'').slice(0,40).toUpperCase();
  return ev.type==='stage'?'ARENA UNLOCKED'+(name?' · '+name:''):'ACHIEVEMENT'+(name?' · '+name:'');
}
// Paddle look (Garage). Only colours are used in VR; anything missing falls back to Classic Cyan.
export function paddleLook(st){
  const ok=c=>typeof c==='string'&&/^#[0-9a-f]{3,8}$/i.test(c);
  return {name:String(st&&st.name||'Classic Cyan'),ring:ok(st&&st.ring)?st.ring:'#2de2e6',core:ok(st&&st.core)?st.core:'#ffffff',trail:ok(st&&st.trail)?st.trail:'#2de2e6'};
}
