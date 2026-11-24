import test from 'node:test';
import assert from 'node:assert/strict';
import {INTRO_END,RALLY,rallyPos,introFrame,introBeats,victoryFrame,popFrame,ringFrame,barCells,shakeOffset,unlockLine,paddleLook} from '../assets/quest-juice.mjs';

test('intro follows the phone game beats and ends on time',()=>{
  assert.equal(INTRO_END,7.6);
  const f0=introFrame(0),f1=introFrame(1.3),f2=introFrame(3.5),f3=introFrame(5.2),f4=introFrame(7.6);
  assert.ok(f0.crease===0&&!f0.showTable&&!f0.padsOn&&!f0.puck.on);
  assert.ok(f1.showTable&&f1.fold>0&&f1.fold<1);
  assert.ok(f2.padsOn&&f2.puck.on&&f2.fold===1);
  assert.ok(f3.title>0&&f3.puck.smashed);
  assert.equal(f4.fade,1);
});
test('rally puck hits the player and CPU ends of the table in turn and smashes into the crease',()=>{
  const L=1.8;
  assert.ok(rallyPos(3.28,L).v>L/2&&rallyPos(3.66,L).v<L/2);
  const end=rallyPos(4.75,L);assert.ok(Math.abs(end.v-L/2)<.02&&Math.abs(end.u-.5)<1e-9);
  for(const [t] of RALLY)assert.ok(Number.isFinite(rallyPos(t,L).u));
});
test('paddles slide in from off the table and stay inside it during the rally',()=>{
  const a=introFrame(1.9),b=introFrame(3.4);
  assert.ok(a.p1.v>1.8&&a.p2.v<0);
  for(const T of [2.7,3,3.5,4,4.4,4.7]){const f=introFrame(T);for(const p of [f.p1,f.p2]){assert.ok(p.u>=.2&&p.u<=.8);assert.ok(p.v>.05&&p.v<1.75);}}
  assert.ok(b.p1.v>1.5&&b.p2.v<.3);
});
test('intro beats fire once each, in order',()=>{
  const seen=[];let t=0;for(let i=0;i<800;i++){const n=t+.01;seen.push(...introBeats(t,n));t=n;}
  assert.deepEqual(seen.filter((x,i)=>seen.indexOf(x)===i),seen);
  for(const n of ['hum','unfold','paddles','drop','hit1','hit5','smash','title','tag','end'])assert.ok(seen.includes(n),n);
  assert.ok(seen.indexOf('smash')<seen.indexOf('title'));
});
test('victory stamps the result in and hands over to the menu after the cutscene',()=>{
  assert.equal(victoryFrame(0).stampScale,0);
  const v=victoryFrame(.5);assert.ok(Math.abs(v.stampScale-1)<.05);assert.ok(!v.ready);
  assert.ok(victoryFrame(3).ready);assert.ok(victoryFrame(.9).wash>=.99);
});
test('pop text scales in, rises and fades',()=>{
  const p={t:0,life:1,big:true,rot:.2},f0=popFrame(p),f1=popFrame({...p,t:.5}),f2=popFrame({...p,t:.99});
  assert.equal(f0.scale,0);assert.ok(f1.rise>f0.rise);assert.ok(f2.alpha<.1);assert.ok(f1.alpha>.9);
});
test('rings grow and fade; a ring that has not started is hidden',()=>{
  assert.equal(ringFrame({age:-.05,life:.5,max:.3}),null);assert.equal(ringFrame({age:.5,life:.5,max:.3}),null);
  const a=ringFrame({age:.1,life:.5,max:.3}),b=ringFrame({age:.4,life:.5,max:.3});assert.ok(b.radius>a.radius&&b.alpha<a.alpha);
});
test('race bars fill smoothly and flag match point',()=>{
  const r=barCells({shown:2.5,chunk:3,flash:.4,punch:.1},6);
  assert.deepEqual(r.cells.slice(0,4).map(c=>c.fill),[1,1,.5,0]);assert.equal(r.cells[2].chunk,1);assert.ok(r.matchPoint&&r.hot);
  assert.ok(!barCells({shown:1,chunk:1},1).hot);assert.equal(r.cells.length,7);
});
test('screen shake is only ever a small table jolt',()=>{
  for(const s of [0,.3,1,5]){const o=shakeOffset(s,1,0);assert.ok(Math.abs(o.x)<=.0121&&Math.abs(o.z)<=.0121);}
  assert.deepEqual(shakeOffset(0,.9,.1),{x:0,z:-0});
});
test('unlock toasts and paddle looks are sanitised',()=>{
  assert.equal(unlockLine({type:'stage',name:'Toxic'}),'ARENA UNLOCKED · TOXIC');
  assert.equal(unlockLine({type:'achievement',name:'First Smash'}),'ACHIEVEMENT · FIRST SMASH');
  assert.equal(unlockLine(null),'');
  assert.deepEqual(paddleLook({name:'Solar Flare',ring:'#ffc44d',core:'#fff5c2',trail:'#ff713b'}),{name:'Solar Flare',ring:'#ffc44d',core:'#fff5c2',trail:'#ff713b'});
  assert.equal(paddleLook({ring:'url(x)'}).ring,'#2de2e6');assert.equal(paddleLook(null).name,'Classic Cyan');
});
