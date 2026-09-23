const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// Adaptive filtering: steady hands stay calm, fast swings catch up quickly.
export function followHand(current,target,dt){
  const x=clamp(target.x,.07,.93),y=clamp(target.y,.99,1.73);
  const distance=Math.hypot(x-current.x,y-current.y);
  const alpha=1-Math.exp(-Math.min(dt,.05)*(40+Math.min(80,distance*240)));
  current.x+=(x-current.x)*alpha;current.y+=(y-current.y)*alpha;
  return current;
}

export function createOpponent(){return {time:0,think:0,target:{x:.5,y:.22},mode:'guard'};}
function reflectedX(x){const width=.95;let n=((x-.025)%(2*width)+2*width)%(2*width);return .025+(n>width?2*width-n:n);}

// Finite reaction time and a bounded movement speed keep the CPU beatable.
export function opponentMove(s,brain,dt){
  brain.time+=dt;brain.think-=dt;
  const p=s.paddles[1],b=s.puck,human=s.paddles[0];
  if(brain.think<=0){
    brain.think=.09;
    let x=.5,y=.22;brain.mode='guard';
    if(s.countdown<=0&&b.y<.88){
      const incoming=b.vy<-.08;
      if(incoming&&b.y>.4){
        brain.mode='intercept';y=.34;
        const arrival=clamp((b.y-y)/-b.vy,0,.65);
        x=reflectedX(b.x+b.vx*arrival)+Math.sin(brain.time*2.3)*.018;
      }else{
        // Get behind the puck, then close in at an angle toward open goal space.
        const aimX=human.x>=.5?.32:.68;
        const length=Math.hypot(aimX-b.x,1.8-b.y);
        const behindX=b.x-(aimX-b.x)/length*.105;
        const behindY=b.y-(1.8-b.y)/length*.105;
        if(p.y>b.y-.045||Math.abs(p.x-behindX)>.13){
          brain.mode='line-up';x=behindX;y=behindY-.07;
        }else{
          brain.mode='strike';x=b.x+(aimX-b.x)/length*.06;y=b.y+.06;
        }
      }
    }else if(s.countdown<=0){
      brain.mode='recover';x=.5+(b.x-.5)*.45;y=.24+.05*Math.sin(brain.time*1.7);
    }
    brain.target={x:clamp(x,.07,.93),y:clamp(y,.07,.81)};
  }
  const dx=brain.target.x-p.x,dy=brain.target.y-p.y,d=Math.hypot(dx,dy);
  const speed=brain.mode==='strike'?1.25:brain.mode==='intercept'?.95:.75;
  const k=Math.min(1,speed*dt/(d||1));
  return {x:p.x+dx*k,y:p.y+dy*k};
}
