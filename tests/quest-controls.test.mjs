import test from 'node:test';
import assert from 'node:assert/strict';
import {followHand,createOpponent,opponentMove} from '../assets/quest-controls.mjs';
import {initial,move} from '../backend/online/physics.mjs';

test('fast hand swing catches up without overshoot; off-table targets stay bounded',()=>{
  const p={x:.5,y:1.6};followHand(p,{x:.9,y:1.1},1/60);
  assert.ok(p.x>.8&&p.x<.9);assert.ok(p.y>1.1&&p.y<1.23);
  for(let i=0;i<120;i++)followHand(p,{x:10,y:-10},1/90);
  assert.ok(p.x<=.93&&p.y>=.99);
});
test('hand filter is stable across headset refresh rates',()=>{
  const results=[60,72,90,120].map(hz=>{const p={x:.5,y:1.6};for(let i=0;i<hz/2;i++)followHand(p,{x:.85,y:1.2},1/hz);return p;});
  for(const p of results){assert.ok(Math.abs(p.x-.85)<.001);assert.ok(Math.abs(p.y-1.2)<.001);}
});
test('CPU advances to attack and retreats when puck leaves its half',()=>{
  const s=initial(),ai=createOpponent();s.countdown=0;s.puck={x:.6,y:.6,vx:0,vy:0};
  for(let i=0;i<90;i++){const p=opponentMove(s,ai,1/60);move(s,1,p.x,p.y);}
  assert.ok(s.paddles[1].y>.4);assert.equal(ai.mode,'strike');
  s.puck.y=1.5;
  for(let i=0;i<90;i++){const p=opponentMove(s,ai,1/60);move(s,1,p.x,p.y);}
  assert.ok(s.paddles[1].y<.31);assert.equal(ai.mode,'recover');
});
test('CPU respects its half and movement speed across varied puck states',()=>{
  const s=initial(),ai=createOpponent();s.countdown=0;
  for(let i=0;i<600;i++){
    s.puck={x:.5+.48*Math.sin(i),y:.9+.89*Math.cos(i*.1),vx:Math.sin(i)*2,vy:Math.cos(i)*2};
    const p=opponentMove(s,ai,1/60),old=s.paddles[1];
    assert.ok(p.x>=.07&&p.x<=.93&&p.y>=.07&&p.y<=.81);
    assert.ok(Math.hypot(p.x-old.x,p.y-old.y)<=1.25/60+1e-10);move(s,1,p.x,p.y);
  }
});
