// Fixed 1:1.8 table; the server owns scores, puck motion and paddle limits.
export function initial(){return {score:[0,0],paddles:[{x:.5,y:1.6},{x:.5,y:.2}],puck:{x:.5,y:.9,vx:.35,vy:.65},winner:0,countdown:90};}
export function move(s,player,x,y){
  if(!Number.isFinite(x)||!Number.isFinite(y))return;
  const p=s.paddles[player],tx=Math.max(.07,Math.min(.93,x)),ty=Math.max(player?.07:.99,Math.min(player?.81:1.73,y));
  const d=Math.hypot(tx-p.x,ty-p.y),k=Math.min(1,.12/(d||1));
  p.x+=(tx-p.x)*k;p.y+=(ty-p.y)*k;
}
// ONLINE paddle input (backend/online/worker.mjs). move() above jumps a paddle
// up to 0.12 per call, so a client that sent moves faster than the official one
// moved faster. Online, a message only sets a TARGET (target()), and every
// physics tick carries the paddle toward it at no more than MAX_SPEED (steer()).
// MAX_SPEED: the official client (online.html) sends at most one move per 30 ms,
// so honest play topped out at 0.12 / 0.030 = 4.0 table units/s (~3.6 at the
// usual 33 ms pointer cadence); a modded client reached 0.12 per 14 ms = 8.6.
// 4.2 leaves 5% over the honest maximum. Local/VR play keeps using move().
export const MAX_SPEED=4.2;
export function target(player,x,y){
  if(!Number.isFinite(x)||!Number.isFinite(y))return null;
  return {x:Math.max(.07,Math.min(.93,x)),y:Math.max(player?.07:.99,Math.min(player?.81:1.73,y))};
}
export function steer(s,targets,dt=1/60){
  const max=MAX_SPEED*dt;
  for(let i=0;i<2;i++){const t=targets[i];if(!t)continue;
    const p=s.paddles[i],d=Math.hypot(t.x-p.x,t.y-p.y);
    if(d<=max){p.x=t.x;p.y=t.y;targets[i]=null;}
    else{const k=max/d;p.x+=(t.x-p.x)*k;p.y+=(t.y-p.y)*k;}}
}
export function step(s,dt=1/60){
  if(s.winner)return;
  if(s.countdown>0){s.countdown--;return;}
  const b=s.puck;b.x+=b.vx*dt;b.y+=b.vy*dt;
  if(b.x<.025||b.x>.975){b.x=Math.max(.025,Math.min(.975,b.x));b.vx*=-1;}
  for(const p of s.paddles){const dx=b.x-p.x,dy=b.y-p.y,d=Math.hypot(dx,dy);if(d<.09){const nx=dx/(d||1),ny=dy/(d||1),dot=b.vx*nx+b.vy*ny;if(dot<0){b.vx-=2*dot*nx;b.vy-=2*dot*ny;b.vx*=1.025;b.vy*=1.025;const speed=Math.hypot(b.vx,b.vy);if(speed>2){b.vx*=2/speed;b.vy*=2/speed;}}b.x=p.x+nx*.091;b.y=p.y+ny*.091;}}
  if(b.y<.025||b.y>1.775){
    if(Math.abs(b.x-.5)<.23){const scorer=b.y<.9?0:1;s.score[scorer]++;if(s.score[scorer]>=7)s.winner=scorer+1;s.puck={x:.5,y:.9,vx:.25,vy:scorer===0?.65:-.65};s.countdown=75;}
    else {b.y=Math.max(.025,Math.min(1.775,b.y));b.vy*=-1;}
  }
}
