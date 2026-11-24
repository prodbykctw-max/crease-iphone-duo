import test from 'node:test';
import assert from 'node:assert/strict';
import {autoTableHeight,heightFromHand,stepHeight,clampHeight,sanitize,loadOptions,saveOptions,updatePoke,menuButtons,hitButton,applyButton,TABLE_MIN,TABLE_MAX,TABLE_DEFAULT,DEFAULTS} from '../assets/quest-options.mjs';
import {createOpponent,opponentMove,LEVELS} from '../assets/quest-controls.mjs';
import {initial,move} from '../backend/online/physics.mjs';

test('auto table height fits standing and seated players and never leaves the safe range',()=>{
  assert.ok(Math.abs(autoTableHeight(1.55)-.806)<.001,'standing adult ~80 cm');
  assert.ok(Math.abs(autoTableHeight(1.15)-.598)<.001,'seated ~60 cm');
  assert.equal(autoTableHeight(.9),TABLE_MIN);assert.equal(autoTableHeight(2.3),TABLE_MAX);
  for(const bad of [NaN,undefined,0,.3,5])assert.equal(autoTableHeight(bad),TABLE_DEFAULT);
});
test('height steps, hand matching and clamping stay inside the table range',()=>{
  assert.equal(stepHeight(.8,1),.825);assert.equal(stepHeight(.8,-1),.775);
  assert.equal(stepHeight(TABLE_MAX,1),TABLE_MAX);assert.equal(stepHeight(TABLE_MIN,-1),TABLE_MIN);
  assert.equal(heightFromHand(.95),.85);assert.equal(heightFromHand(.2),TABLE_MIN);
  assert.equal(clampHeight(NaN),TABLE_DEFAULT);
});
test('saved options survive a reload and bad or blocked storage falls back to defaults',()=>{
  const mem=new Map(),storage={getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,v)};
  const o={...DEFAULTS,hand:'left',height:.9,difficulty:'hard',sound:false,haptics:false};
  assert.equal(saveOptions(storage,o),true);assert.deepEqual(loadOptions(storage),o);
  mem.set('crease-vr-options-v1','{not json');assert.deepEqual(loadOptions(storage),{...DEFAULTS});
  const blocked={getItem(){throw new Error('denied');},setItem(){throw new Error('denied');}};
  assert.deepEqual(loadOptions(blocked),{...DEFAULTS});assert.equal(saveOptions(blocked,o),false);
  assert.deepEqual(sanitize({hand:'up',height:9,difficulty:'god',sound:'yes'}),{...DEFAULTS,height:TABLE_MAX});
});
test('a fingertip press fires once per push through the panel',()=>{
  const p={armed:false};
  assert.equal(updatePoke(p,.1),false);assert.equal(updatePoke(p,.01),false);
  assert.equal(updatePoke(p,0),true,'crossing the surface presses');
  assert.equal(updatePoke(p,-.02),false,'staying behind it does not repeat');
  assert.equal(updatePoke(p,.03),false);assert.equal(updatePoke(p,-.01),true,'pull back and push again presses again');
  assert.equal(updatePoke(p,NaN),false);assert.equal(updatePoke(p,-.01),false,'entering from the side does not press');
});
test('menu buttons fit the panel, never overlap, and map back from a point',()=>{
  for(const view of [{},{started:true,inVR:true},{started:true,over:true,inVR:true,calibrating:{t:2}}]){
    const b=menuButtons({difficulty:'easy',hand:'right',sound:true,haptics:true,height:'auto',...view});
    for(const x of b){assert.ok(x.x>=40&&x.x+x.w<=1010&&x.y>=120&&x.y+x.h<=750,x.id);}
    for(let i=0;i<b.length;i++)for(let j=i+1;j<b.length;j++){const p=b[i],q=b[j];assert.ok(p.x+p.w<=q.x||q.x+q.w<=p.x||p.y+p.h<=q.y||q.y+q.h<=p.y,p.id+' overlaps '+q.id);}
    for(const x of b)assert.equal(hitButton(b,x.x+x.w/2,x.y+x.h/2).id,x.id);
  }
  const fresh=menuButtons({difficulty:'easy',hand:'right'}),over=menuButtons({started:true,over:true});
  assert.equal(fresh[0].label,'PLAY');assert.equal(over[0].label,'REMATCH');assert.ok(!over.some(b=>b.id==='restart'));
  assert.ok(!fresh.some(b=>b.id==='exit'),'no EXIT VR button outside the headset');
  assert.equal(hitButton(fresh,5,5),null);
});
test('menu buttons change the options they say they change',()=>{
  const o={...DEFAULTS};
  assert.equal(applyButton(o,'diff:hard'),'difficulty');assert.equal(o.difficulty,'hard');
  assert.equal(applyButton(o,'hand:left'),'hand');assert.equal(o.hand,'left');
  applyButton(o,'sound');assert.equal(o.sound,false);applyButton(o,'haptics');assert.equal(o.haptics,false);
  o.height=.9;assert.equal(applyButton(o,'auto'),'height');assert.equal(o.height,'auto');
  assert.equal(applyButton(o,'primary'),'primary');
});
test('NORMAL keeps the original VR CPU; HARD and CTW react faster and move faster',()=>{
  assert.deepEqual(LEVELS.easy,{think:.09,speed:1});
  assert.equal(createOpponent().level,'easy');assert.equal(createOpponent('nope').level,'easy');
  const reach=level=>{const s=initial(),ai=createOpponent(level);s.countdown=0;s.puck={x:.6,y:.6,vx:0,vy:0};let n=0;while(Math.hypot(s.paddles[1].x-ai.target.x,s.paddles[1].y-ai.target.y)>.01||n<6){const p=opponentMove(s,ai,1/60);move(s,1,p.x,p.y);if(++n>400)break;}return n;};
  assert.ok(reach('hard')<reach('easy'));
  const s=initial(),ai=createOpponent('hard');s.countdown=0;
  for(let i=0;i<600;i++){s.puck={x:.5+.48*Math.sin(i),y:.9+.89*Math.cos(i*.1),vx:Math.sin(i)*2,vy:Math.cos(i)*2};
    const p=opponentMove(s,ai,1/60),old=s.paddles[1];assert.ok(p.x>=.07&&p.x<=.93&&p.y>=.07&&p.y<=.81);
    assert.ok(Math.hypot(p.x-old.x,p.y-old.y)<=1.25*1.4/60+1e-10);move(s,1,p.x,p.y);}
});
import {updatePinch,SLOP} from '../assets/quest-options.mjs';
test('a press just outside a button still lands on the nearest one; far misses do not',()=>{
  const b=menuButtons({difficulty:'easy',hand:'right'}),p=b.find(x=>x.id==='primary');
  assert.equal(hitButton(b,p.x-SLOP+2,p.y+10).id,'primary');
  assert.equal(hitButton(b,p.x+p.w/2,p.y-SLOP-5),null);
});
test('one pinch is one click: hysteresis stops flicker near the threshold',()=>{
  const p={down:false},seq=[.05,.03,.019,.022,.018,.03,.035,.041,.03,.015];
  const ev=seq.map(d=>updatePinch(p,d)).filter(Boolean);
  assert.deepEqual(ev,['start','end','start']);
  assert.equal(updatePinch(p,NaN),null);
});
