import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initial,move,step} from '../backend/online/physics.mjs';
test('remote input is bounded to the player half and rejects non-finite values',()=>{
 const s=initial();move(s,0,NaN,Infinity);assert.deepEqual(s.paddles[0],{x:.5,y:1.6});
 for(let i=0;i<100;i++)move(s,0,-999,-999);
 assert.ok(s.paddles[0].x>=.07);assert.ok(s.paddles[0].y>=.99);
});
test('server awards goals only within goal mouth and stops at seven',()=>{
 const s=initial();s.countdown=0;s.puck={x:.1,y:.001,vx:0,vy:-1};step(s);assert.deepEqual(s.score,[0,0]);
 for(let i=0;i<7;i++){s.countdown=0;s.puck={x:.5,y:.001,vx:0,vy:-1};step(s);}
 assert.equal(s.winner,1);assert.deepEqual(s.score,[7,0]);step(s);assert.deepEqual(s.score,[7,0]);
});
