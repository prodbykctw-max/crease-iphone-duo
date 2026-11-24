import test from 'node:test';
import assert from 'node:assert/strict';
import {fieldToTable,tableToField,inputToField,fieldToInput,pickupStyle,envVictim,boardLabel,powerLine,detectEvents,newEventState,arenaChoices,usableArena,backdropSize} from '../assets/quest-engine.mjs';

const near=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<e,a+' vs '+b);
test('field and table coordinates round-trip and put the player at +z',()=>{
  for(const L of [1.8,1.42,2.1])for(const [u,v] of [[0,0],[.5,L/2],[1,L],[.23,L*.9]]){
    const t=fieldToTable(u,v,L),f=tableToField(t.x,t.z,L);near(f.u,u);near(f.v,v);
    const i=fieldToInput(u,v,L),g=inputToField(i.x,i.y,L);near(g.u,u);near(g.v,v);
  }
  const me=fieldToTable(.5,1.7,1.8);near(me.x,0);near(me.z,.8);
  const cpu=fieldToTable(.5,.1,1.8);near(cpu.z,-.8);
  near(fieldToTable(0,0,1.8).x,-.5);near(fieldToTable(1,1.8,1.8).x,.5);near(fieldToTable(.5,.9,1.8).z,0);
});
test('a longer or shorter engine table is stretched to the 1.8 m VR table',()=>{
  near(fieldToTable(.5,2.1,2.1).z,.9);near(fieldToTable(.5,1.42,1.42).z,.9);
  near(inputToField(.5,1.8,2.1).v,2.1);
});
test('pick-up styles and unknown types',()=>{
  assert.equal(pickupStyle('MULTI').colour,'#7cff6b');assert.equal(pickupStyle('WALL').glyph,'wall');
  assert.equal(pickupStyle('?').colour,'#ffffff');
});
test('arena power acts on the right half',()=>{
  assert.equal(envVictim(null,1.8),0);
  assert.equal(envVictim({type:'ICE',who:1},1.8),2);assert.equal(envVictim({type:'STAR',who:1},1.8),1);assert.equal(envVictim({type:'GOLD',who:2},1.8),2);
});
const base=()=>({state:'play',mode:'solo',score:[0,0],timer:0,winner:0,msg:'',msgT:0,pops:[],env:null,envOrb:null,fire:[0,0],playerReturns:0,pucks:[],bumpers:[]});
test('scoreboard line follows the phone game',()=>{
  const g=base();assert.equal(boardLabel(g),'');
  g.state='countdown';g.timer=1.5;assert.equal(boardLabel(g),'3');g.timer=.9;assert.equal(boardLabel(g),'2');g.timer=.3;assert.equal(boardLabel(g),'1');
  g.score=[1,0];g.timer=.5;assert.equal(boardLabel(g),'READY');g.timer=.2;assert.equal(boardLabel(g),'GO');
  g.state='play';g.msg='RALLY · KEEP IT CLEAN';g.msgT=1;assert.equal(boardLabel(g),'RALLY · KEEP IT CLEAN');
  g.msgT=0;g.pops=[{text:'Smash!',t:.1,life:.8}];assert.equal(boardLabel(g),'SMASH!');
  g.pops=[{text:'old',t:2,life:.8}];assert.equal(boardLabel(g),'');
  g.state='over';g.winner=1;assert.equal(boardLabel(g),'YOU WIN');g.winner=2;assert.equal(boardLabel(g),'CPU WINS');
  g.state='paused';assert.equal(boardLabel(g),'PAUSED');
});
test('power line names the active arena power or fire mode',()=>{
  const g=base();assert.equal(powerLine(g),'');
  g.fire=[3,0];assert.equal(powerLine(g),'FIRE MODE');
  g.envOrb={name:'RIPTIDE'};assert.match(powerLine(g),/RIPTIDE/);
  g.env={who:2,name:'DEEP FREEZE',t:3.2};assert.equal(powerLine(g),'CPU DEEP FREEZE 4s');
});
test('buzz events come from state changes and a new match resets quietly',()=>{
  const g=base(),p=newEventState();
  assert.deepEqual(detectEvents(p,g),{hit:0,smash:false,bump:false,goalFor:0,reset:false});
  g.playerReturns=1;assert.equal(detectEvents(p,g).hit,1);assert.equal(detectEvents(p,g).hit,0);
  g.score=[1,0];assert.equal(detectEvents(p,g).goalFor,1);g.score=[1,1];assert.equal(detectEvents(p,g).goalFor,2);
  g.pucks=[{smashT:.7}];assert.equal(detectEvents(p,g).smash,true);assert.equal(detectEvents(p,g).smash,false);
  g.bumpers=[{flash:1}];assert.equal(detectEvents(p,g).bump,true);assert.equal(detectEvents(p,g).bump,false);
  g.playerReturns=0;g.score=[0,0];const r=detectEvents(p,g);assert.equal(r.reset,true);assert.equal(r.hit,0);
});
test('arena choices only allow unlocked arenas',()=>{
  const a=[{index:0,name:'MIDNIGHT',unlocked:true},{index:1,name:'TOXIC',unlocked:false,requirement:'Win'},{index:2,name:'ICE',unlocked:true}];
  assert.deepEqual(arenaChoices(a,2).map(x=>[x.unlocked,x.selected]),[[true,false],[false,false],[true,true]]);
  assert.equal(usableArena(a,2),2);assert.equal(usableArena(a,1),0);assert.equal(usableArena(a,9),0);assert.equal(usableArena([{index:0,unlocked:false}],0),0);
});
test('backdrop keeps the plate aspect at a fixed height',()=>{
  const wide=backdropSize(3),sq=backdropSize(1.5);
  near(wide.height,5.2);near(wide.theta*wide.radius,15.6);near(sq.theta*sq.radius,7.8);
  assert.ok(backdropSize(100).theta<=Math.PI*1.7+1e-9);assert.ok(backdropSize(NaN).theta>0);
});
