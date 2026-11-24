// CREASE VR table physics.
// Same table, goals, serve and first-to-7 scoring as backend/online/physics.mjs
// (which the online server owns, so it stays untouched), but hits work like the
// phone game (index.html hitPaddle / physics):
//  - the paddle's REAL speed drives the puck: impulse on the relative velocity
//    with restitution 0.7, so a soft push sends it slow and a hard swing fast;
//  - the puck slows with friction 0.08/s and loses 6% off the rails;
//  - normal top speed 1.65 table widths/s;
//  - SMASH: paddle driving into the puck faster than 2.8 widths/s with an
//    impulse over 2.2 → puck ×1.3 and a 2.2 top speed for 0.7 s.
// Units: table width = 1 (the VR table is 1 m wide, so 1 unit/s = 1 m/s).
export {initial} from '../backend/online/physics.mjs';
export const PHYS=Object.freeze({padRest:.7,maxSpd:1.65,smashSpd:2.2,smashNeed:2.8,smashJ:2.2,fric:.08,rest:.94,humanSpd:4,contact:.09,goalHalf:.23});

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Moves a paddle toward (x,y) at no more than maxSpd units/s inside its own
// half, and records its velocity for the next collision.
export function drive(s,player,x,y,dt,maxSpd=PHYS.humanSpd){
  if(!Number.isFinite(x)||!Number.isFinite(y)||!(dt>0))return;
  const p=s.paddles[player],tx=clamp(x,.07,.93),ty=clamp(y,player?.07:.99,player?.81:1.73);
  let dx=tx-p.x,dy=ty-p.y;const d=Math.hypot(dx,dy),m=maxSpd*dt;
  if(d>m){dx*=m/d;dy*=m/d;}
  p.x+=dx;p.y+=dy;p.vx=dx/dt;p.vy=dy/dt;
}

// One fixed step. Returns events: {type:'hit',player,strength 0..1},
// {type:'smash',player}, {type:'rail'}, {type:'goal',scorer}.
export function step(s,dt=1/60){
  const ev=[];
  if(s.winner)return ev;
  if(s.countdown>0){s.countdown--;return ev;}
  const b=s.puck;
  b.x+=b.vx*dt;b.y+=b.vy*dt;
  const f=Math.max(0,1-PHYS.fric*dt);b.vx*=f;b.vy*=f;
  if(b.smashT>0)b.smashT-=dt;
  for(let i=0;i<2;i++){
    const p=s.paddles[i],dx=b.x-p.x,dy=b.y-p.y,d=Math.hypot(dx,dy);
    if(d>=PHYS.contact)continue;
    const nx=d<1e-6?0:dx/d,ny=d<1e-6?(i?1:-1):dy/d;
    b.x=p.x+nx*(PHYS.contact+.001);b.y=p.y+ny*(PHYS.contact+.001);
    const pvx=p.vx||0,pvy=p.vy||0,vn=(b.vx-pvx)*nx+(b.vy-pvy)*ny;
    if(vn<0){
      const j=-(1+PHYS.padRest)*vn;b.vx+=j*nx;b.vy+=j*ny;
      const push=Math.max(0,pvx*nx+pvy*ny);
      if(push>PHYS.smashNeed&&j>PHYS.smashJ&&!(b.smashT>.25)){b.smashT=.7;b.vx*=1.3;b.vy*=1.3;ev.push({type:'smash',player:i});}
      else ev.push({type:'hit',player:i,strength:Math.min(1,j/3)});
    }
  }
  if(b.x<.025||b.x>.975){b.x=clamp(b.x,.025,.975);b.vx*=-PHYS.rest;ev.push({type:'rail'});}
  if(b.y<.025||b.y>1.775){
    if(Math.abs(b.x-.5)<PHYS.goalHalf){
      const scorer=b.y<.9?0:1;s.score[scorer]++;if(s.score[scorer]>=7)s.winner=scorer+1;
      s.puck={x:.5,y:.9,vx:.25,vy:scorer===0?.65:-.65,smashT:0};s.countdown=75;ev.push({type:'goal',scorer});return ev;
    }
    b.y=clamp(b.y,.025,1.775);b.vy*=-PHYS.rest;ev.push({type:'rail'});
  }
  const sp=Math.hypot(b.vx,b.vy),cap=b.smashT>0?PHYS.smashSpd:PHYS.maxSpd;
  if(sp>cap){b.vx*=cap/sp;b.vy*=cap/sp;}
  // A puck that dies where nobody can reach it gets a nudge (phone game antiStall).
  if(sp<.03){b.still=(b.still||0)+dt;if(b.still>2.5){b.vx=(Math.random()-.5)*.8;b.vy=(b.y<.9?1:-1)*.5;b.still=0;}}else b.still=0;
  return ev;
}
