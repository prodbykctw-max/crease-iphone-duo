import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,drive,step,PHYS} from '../assets/quest-physics.mjs';
import * as online from '../backend/online/physics.mjs';

// Puck sitting still in front of the player's paddle; the paddle swings
// straight up the table (toward the CPU) at `speed` table widths per second.
function strike(speed){
  const s=initial();s.countdown=0;s.puck={x:.5,y:1.3,vx:0,vy:0};s.paddles[0]={x:.5,y:1.55};
  const events=[];
  for(let i=0;i<90;i++){drive(s,0,.5,s.paddles[0].y-speed/60,1/60);events.push(...step(s,1/60));if(events.length)break;}
  for(let i=0;i<3;i++)step(s,1/60);
  return {speed:Math.hypot(s.puck.vx,s.puck.vy),events,up:s.puck.vy<0};
}

test('a soft push sends the puck slow, a harder swing faster: hit strength follows the hand',()=>{
  const soft=strike(.3),mid=strike(.7),hard=strike(1.2);
  assert.ok(soft.up&&mid.up&&hard.up,'the puck goes up the table');
  assert.ok(soft.speed<.6,'soft push: '+soft.speed.toFixed(2));
  assert.ok(mid.speed>soft.speed+.3,'medium: '+mid.speed.toFixed(2));
  assert.ok(hard.speed>mid.speed,'hard: '+hard.speed.toFixed(2));
  assert.equal(soft.events[0].type,'hit');assert.ok(soft.events[0].strength<mid.events[0].strength);
});
test('a normal hit is capped at the phone game top speed; only a SMASH goes beyond it',()=>{
  const hard=strike(2.4);assert.equal(hard.events[0].type,'hit');assert.ok(hard.speed<=PHYS.maxSpd+1e-9,'capped: '+hard.speed.toFixed(3));
  const smash=strike(3.6);assert.equal(smash.events[0].type,'smash');
  assert.ok(smash.speed>PHYS.maxSpd&&smash.speed<=PHYS.smashSpd+1e-9,'smash speed: '+smash.speed.toFixed(3));
});
test('the SMASH threshold matches the phone game (2.8 widths/s into the puck)',()=>{
  assert.equal(PHYS.smashNeed,2.8);assert.equal(PHYS.padRest,.7);assert.equal(PHYS.maxSpd,1.65);assert.equal(PHYS.smashSpd,2.2);
  assert.equal(strike(2.6).events[0].type,'hit');assert.equal(strike(3.2).events[0].type,'smash');
});
test('a still paddle still bounces the puck back, and the paddle never leaves its half or outruns 4 widths/s',()=>{
  const s=initial();s.countdown=0;s.paddles[0]={x:.5,y:1.5,vx:0,vy:0};s.puck={x:.5,y:1.3,vx:0,vy:1};
  for(let i=0;i<20;i++)step(s,1/60);assert.ok(s.puck.vy<0&&Math.abs(s.puck.vy)<1,'bounced softer than it came in');
  const t=initial();for(let i=0;i<10;i++){const before={...t.paddles[0]};drive(t,0,.5,.1,1/60);assert.ok(Math.hypot(t.paddles[0].x-before.x,t.paddles[0].y-before.y)<=4/60+1e-9);}
  assert.ok(t.paddles[0].y>=.99);
});
test('goals, serve and first to 7 are unchanged',()=>{
  const s=initial();s.countdown=0;let goals=0;
  for(let n=0;n<7;n++){s.countdown=0;s.puck={x:.5,y:.05,vx:0,vy:-1.5};for(let i=0;i<10;i++)for(const e of step(s,1/60))if(e.type==='goal')goals++;}
  assert.equal(goals,7);assert.equal(s.score[0],7);assert.equal(s.winner,1);
});
test('the online server physics is untouched (VR has its own copy)',()=>{
  const s=online.initial();s.countdown=0;s.puck={x:.5,y:1.3,vx:0,vy:0};s.paddles[0]={x:.5,y:1.38};
  online.step(s);assert.equal(s.puck.vx,0);assert.equal(s.puck.vy,0,'online collisions still ignore paddle speed');
});
