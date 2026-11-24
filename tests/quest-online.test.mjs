import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CODE_ALPHABET,CODE_LEN,isCode,typeKey,formatCode,mine,feelEvents,createOnline,onlineEvent,onlineTick,onlineIntent,onlinePage,onlineBoard,keypadKeys,ONLINE_BUTTON,REMATCH_TRIES,LOST_TEXT,PANEL_W,PANEL_H} from '../assets/quest-online.mjs';
import {menuButtons,hitButton} from '../assets/quest-options.mjs';
import {initial,target,steer,step} from '../backend/online/physics.mjs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');

test('room codes: the keypad types exactly the server alphabet, ten characters, and validation matches the server',()=>{
  assert.equal(CODE_ALPHABET.length,32);assert.equal(CODE_LEN,10);
  // the alphabet the server generates codes from
  assert.ok(read('backend/online/worker.mjs').includes(`const ALPHABET='${CODE_ALPHABET}'`));
  let e='';for(const ch of 'ABCDEFGHJK')e=typeKey(e,ch);assert.equal(e,'ABCDEFGHJK');assert.ok(isCode(e));
  assert.equal(typeKey(e,'L'),e,'no eleventh character');
  assert.equal(typeKey('AB','DEL'),'A');assert.equal(typeKey('','DEL'),'');assert.equal(typeKey('ABC','CLEAR'),'');
  for(const bad of ['O','I','0','1','a','!','AB'])assert.equal(typeKey('X',bad),'X',bad);
  for(const bad of ['ABCDEFGHJ','ABCDEFGHJKL','abcdefghjk','ABCDE-GHJK',null,42])assert.equal(isCode(bad),false,String(bad));
  assert.equal(formatCode('ABCDEFGHJK'),'ABCDE FGHJK');
});

test('your end of the table: player 1 sees the server table turned round, like the phone page',()=>{
  const s=initial();
  const a=mine(s,0),b=mine(s,1);
  assert.deepEqual(a.me,{x:.5,y:1.6});assert.deepEqual(a.them,{x:.5,y:.2});
  assert.ok(Math.abs(b.me.y-1.6)<1e-9&&Math.abs(b.them.y-.2)<1e-9,'both players are at the bottom of their own view');
  s.score=[3,5];s.winner=2;s.puck={x:.2,y:.4,vx:.3,vy:.6};
  assert.deepEqual(mine(s,0).score,[3,5]);assert.equal(mine(s,0).winner,2);
  assert.deepEqual(mine(s,1).score,[5,3]);assert.equal(mine(s,1).winner,1);
  const p=mine(s,1).puck;assert.ok(Math.abs(p.x-.8)<1e-9&&Math.abs(p.y-1.4)<1e-9&&p.vx===-.3&&p.vy===-.6);
  // what the headset sends for player 1 (flipped by the phone client) lands where the hand is
  const hand={x:.3,y:1.5},sent={x:1-hand.x,y:1.8-hand.y},t=target(1,sent.x,sent.y);
  const st=initial();steer(st,[null,t],1);const back=mine(st,1).me;
  assert.ok(Math.abs(back.x-hand.x)<1e-9&&Math.abs(back.y-hand.y)<1e-9);
});

test('buzzes: a goal for either side, and your own return of the puck',()=>{
  const prev={},v=s=>mine(s,0),s=initial();
  feelEvents(prev,v(s));
  s.puck={x:.5,y:1.5,vx:0,vy:-.6};s.paddles[0]={x:.5,y:1.58};
  prev.vy=.6;assert.equal(feelEvents(prev,v(s)).hit,true);
  s.score=[1,0];assert.equal(feelEvents(prev,v(s)).goalFor,1);
  s.score=[1,1];assert.equal(feelEvents(prev,v(s)).goalFor,2);
  assert.deepEqual(feelEvents(prev,null),{hit:false,goalFor:0});
});

// Drives the machine the way the scene does: intents, events in order, ticks.
function harness(){
  const m=createOnline();let sid=0,serial=0,now=1000;const sent=[];
  const snap=(o={})=>({events:[],serial,searching:false,tries:0,busy:false,open:false,...o});
  return {m,sent,
    press(id){const fx=onlineIntent(m,id,{now,serial});return fx;},
    tick(o){now+=16;const c=onlineTick(m,snap(o),now);if(c)sent.push(c);return c;},
    wait(ms){now+=ms;},
    open(){serial++;sid=serial;return sid;},
    ev(e){onlineEvent(m,{sid,...e},now);},
    stale(e){onlineEvent(m,{sid:0,...e},now);},
    get now(){return now;}};
}
const play=(score=[0,0],countdown=0,winner=0)=>({...initial(),score,countdown,winner});

test('quick match: searching, found, countdown, playing, match over, rematch',()=>{
  const h=harness();
  h.press('ol:quick');assert.equal(h.m.phase,'searching');
  assert.deepEqual(h.tick({}),{do:'quick',at:h.now-16});
  h.open();h.tick({searching:true,busy:true});
  h.ev({type:'joined',player:0,room:'ABCDEFGHJK'});assert.equal(h.m.phase,'searching','hosting the lobby room: still looking');
  h.ev({type:'ready'});assert.equal(h.m.phase,'found');
  h.ev({type:'state',state:play([0,0],60)});assert.equal(h.m.phase,'found','countdown before the first point');
  h.ev({type:'state',state:play([0,0],0)});assert.equal(h.m.phase,'playing');
  h.ev({type:'state',state:play([1,0],40)});assert.equal(h.m.phase,'playing','countdown after a goal stays playing');
  h.ev({type:'state',state:play([7,4],0,1)});assert.equal(h.m.phase,'over');assert.equal(h.m.winner,1);assert.deepEqual(h.m.score,[7,4]);
  h.ev({type:'close',code:1000});assert.equal(h.m.phase,'over','the server closing a finished match keeps the result up');
  const fx=h.press('ol:rematch');assert.ok(fx.leave);assert.equal(h.m.phase,'connecting');assert.equal(h.m.mode,'rematch');
  assert.deepEqual(h.tick({}),{do:'create',code:'ABCDEFGHJK',at:h.now-16},'the host reopens the same room');
});

test('room code: create shows the code; a friend joins by code; the joiner is player 1',()=>{
  const host=harness();host.press('ol:create');assert.equal(host.m.phase,'connecting');assert.equal(host.tick({}).do,'create');
  host.open();host.ev({type:'joined',player:0,room:'QRSTUVWXYZ'});assert.equal(host.m.phase,'waiting');assert.equal(host.m.code,'QRSTUVWXYZ');
  assert.ok(onlineBoard(host.m).label.includes('QRSTU VWXYZ'));assert.equal(onlinePage(host.m).big,'QRSTU VWXYZ');
  const guest=harness();guest.press('ol:keypad');assert.equal(guest.m.page,'keypad');
  guest.press('ol:join');assert.equal(guest.m.phase,'idle');assert.ok(guest.m.hint,'a short code is refused');
  for(const ch of 'QRSTUVWXYZ')guest.press('ol:key:'+ch);
  guest.press('ol:join');assert.equal(guest.m.phase,'connecting');assert.deepEqual(guest.tick({}),{do:'join',code:'QRSTUVWXYZ',at:guest.now-16});
  guest.open();guest.ev({type:'joined',player:1,room:'QRSTUVWXYZ'});assert.equal(guest.m.phase,'found');assert.equal(guest.m.player,1);
  guest.ev({type:'state',state:play([2,5],0)});assert.deepEqual(guest.m.score,[5,2],'scores read from your side');
});

test('opponent left, connection lost, wrong code, room expired, nobody around',()=>{
  let h=harness();h.press('ol:quick');h.tick({});h.open();h.ev({type:'joined',player:1,room:'ABCDEFGHJK'});h.ev({type:'state',state:play()});
  h.ev({type:'close',code:1000});assert.equal(h.m.phase,'left');
  h=harness();h.press('ol:quick');h.tick({});h.open();h.ev({type:'joined',player:1,room:'ABCDEFGHJK'});h.ev({type:'state',state:play()});
  h.ev({type:'close',code:1006});assert.equal(h.m.phase,'lost');assert.equal(h.m.reason,'dropped');
  h=harness();for(const ch of 'ABCDEFGHJK')h.press('ol:key:'+ch);h.press('ol:join');h.tick({});h.open();h.ev({type:'close',code:1006});
  assert.equal(h.m.reason,'noroom');h.press('ol:retry');assert.equal(h.m.phase,'idle');assert.equal(h.m.page,'keypad');assert.equal(h.m.entry,'ABCDEFGHJK','EDIT CODE keeps what was typed');
  h=harness();h.press('ol:create');h.tick({});h.open();h.ev({type:'joined',player:0,room:'ABCDEFGHJK'});h.ev({type:'close',code:1000});
  assert.equal(h.m.reason,'expired');h.press('ol:retry');assert.deepEqual(h.tick({}),{do:'create',code:'ABCDEFGHJK',at:h.now-16},'retry reopens the same code');
  h=harness();h.press('ol:quick');h.tick({});h.wait(400);h.tick({searching:false,busy:false,tries:7});assert.equal(h.m.reason,'nobody');
  h=harness();h.press('ol:quick');h.tick({});h.wait(400);h.tick({searching:false,busy:false,tries:1});assert.equal(h.m.reason,'server');
  for(const r of Object.keys(LOST_TEXT)){const m=createOnline();m.phase='lost';m.reason=r;const p=onlinePage(m);assert.ok(p.buttons.some(b=>b.id==='ol:retry')&&p.buttons.some(b=>b.id==='ol:menu'),r);}
});

test('RETRY after a dropped room-code match meets again on the same code; a dropped quick match looks for a new one',()=>{
  const g=harness();for(const ch of 'ABCDEFGHJK')g.press('ol:key:'+ch);g.press('ol:join');g.tick({});g.open();g.ev({type:'joined',player:1,room:'ABCDEFGHJK'});g.ev({type:'state',state:play()});
  g.ev({type:'close',code:1006});assert.equal(g.m.reason,'dropped');
  g.press('ol:retry');assert.equal(g.m.mode,'rematch');assert.deepEqual(g.tick({}),{do:'join',code:'ABCDEFGHJK',at:g.now-16});
  g.open();g.ev({type:'close',code:1006});g.wait(800);assert.deepEqual(g.tick({}).do,'create','the old room is gone: open it again with the same code');
  const q=harness();q.press('ol:quick');q.tick({});q.open();q.ev({type:'joined',player:1,room:'ABCDEFGHJK'});q.ev({type:'state',state:play()});q.ev({type:'close',code:1006});
  q.press('ol:retry');assert.equal(q.m.phase,'searching');assert.equal(q.tick({}).do,'quick');
});
test('rematch takes turns creating and joining the same code, then gives up',()=>{
  const h=harness();h.press('ol:quick');h.tick({});h.open();h.ev({type:'joined',player:1,room:'ABCDEFGHJK'});h.ev({type:'state',state:play([3,7],0,1)});
  assert.equal(h.m.phase,'over');h.press('ol:rematch');assert.equal(h.tick({}).do,'join','the guest joins first');
  const seen=[];
  for(let i=0;i<REMATCH_TRIES-1;i++){h.open();h.ev({type:'close',code:1006});assert.equal(h.m.phase,'connecting');assert.equal(h.tick({}),null,'waits a moment first');h.wait(800);seen.push(h.tick({}).do);}
  assert.deepEqual(seen.slice(0,4),['create','join','create','join']);
  h.open();h.ev({type:'close',code:1006});assert.equal(h.m.phase,'lost');assert.equal(h.m.reason,'rematch');
  // a successful create after a failed join: waiting with the code, as player 0
  const g=harness();g.m.code='ABCDEFGHJK';g.m.player=1;g.m.phase='over';g.press('ol:rematch');g.tick({});g.open();g.ev({type:'close',code:1006});g.wait(800);
  assert.equal(g.tick({}).do,'create');g.open();g.ev({type:'joined',player:0,room:'ABCDEFGHJK'});assert.equal(g.m.phase,'waiting');assert.equal(g.m.player,0);
});

test('stale sockets, cancel and commands that wait for the client',()=>{
  const h=harness();h.open();
  h.press('ol:quick');h.stale({type:'close',code:1000});h.ev({type:'close',code:1000});assert.equal(h.m.phase,'searching','events from before the choice are ignored');
  assert.equal(h.tick({busy:true}),null,'nothing starts while the old socket is still open');
  assert.equal(h.tick({}).do,'quick');
  const fx=h.press('ol:cancel');assert.ok(fx.leave);assert.equal(h.m.phase,'idle');
  h.ev({type:'joined',player:0,room:'ABCDEFGHJK'});assert.equal(h.m.phase,'idle','late lobby answer after CANCEL is ignored');
  h.open();h.ev({type:'joined',player:0,room:'ABCDEFGHJK'});assert.equal(h.m.phase,'idle');
  assert.deepEqual(h.tick({busy:true,open:true}),{do:'leave'},'and its socket is closed');
  assert.equal(h.press('ol:menu').exit,true);assert.equal(h.press('ol:back').exit,true);
  const k=harness();k.press('ol:keypad');const b=k.press('ol:back');assert.equal(b.exit,false);assert.equal(k.m.page,'home','BACK on the keypad goes to the ONLINE page');
  assert.equal(k.press('ol:resume').resume,true);
});

const phases=()=>{
  const out=[];const base=createOnline();
  const env=[{},{loading:true},{failed:true},{configured:false}];
  for(const e of env)out.push([{...base},e,'home']);
  out.push([{...base,page:'keypad',entry:'ABC',hint:'A ROOM CODE IS TEN LETTERS AND NUMBERS'},{},'keypad']);
  out.push([{...base,page:'keypad',entry:'ABCDEFGHJK'},{},'keypad full']);
  for(const [phase,mode] of [['searching','quick'],['connecting','create'],['connecting','join'],['connecting','rematch'],['waiting','create'],['waiting','rematch'],['found','quick'],['playing','quick'],['over','quick'],['left','quick']])
    out.push([{...base,phase,mode,code:'ABCDEFGHJK',state:initial(),score:[2,3],winner:phase==='over'?1:0},{},phase+'/'+mode]);
  for(const r of Object.keys(LOST_TEXT))out.push([{...base,phase:'lost',reason:r},{},'lost/'+r]);
  return out;
};
test('every ONLINE page fits the panel, has no overlapping buttons, maps presses back, and has a way out',()=>{
  for(const [m,env,name] of phases()){
    const p=onlinePage(m,env),b=p.buttons;
    for(const x of b)assert.ok(x.x>=40&&x.x+x.w<=PANEL_W-14&&x.y>=100&&x.y+x.h<=PANEL_H-20,name+' '+x.id);
    for(let i=0;i<b.length;i++)for(let j=i+1;j<b.length;j++){const q=b[i],r=b[j];assert.ok(q.x+q.w<=r.x||r.x+r.w<=q.x||q.y+q.h<=r.y||r.y+r.h<=q.y,name+': '+q.id+' overlaps '+r.id);}
    for(const x of b)assert.equal(hitButton(b,x.x+x.w/2,x.y+x.h/2).id,x.id,name);
    assert.ok(b.some(x=>['ol:back','ol:cancel','ol:leave','ol:menu'].includes(x.id)),name+' has a way out');
    assert.ok(p.title&&typeof p.title==='string');
  }
});
test('the keypad: 32 big keys, one per code character, and JOIN only lights with a full code',()=>{
  const keys=keypadKeys();assert.equal(keys.length,32);assert.equal(keys.map(k=>k.label).join(''),CODE_ALPHABET);
  // about 7 x 6.5 cm each on the 0.72 m panel: big enough for a fingertip
  for(const k of keys){assert.ok(k.w*.72/1024>.07&&k.h*.72/1024>.065);}
  const m=createOnline();m.page='keypad';
  assert.equal(onlinePage(m).buttons.find(b=>b.id==='ol:join').locked,true);
  m.entry='ABCDEFGHJK';const j=onlinePage(m).buttons.find(b=>b.id==='ol:join');assert.equal(j.locked,false);assert.equal(j.accent,true);
  assert.deepEqual(onlinePage(m).slots.join(''),'ABCDEFGHJK');
  m.entry='AB';assert.equal(onlinePage(m).slots.length,10);
});
test('the ONLINE entry sits in the menu header without moving or covering any existing button',()=>{
  const arenas=Array.from({length:10},(_,i)=>({index:i,name:'ARENA '+i,unlocked:i<3}));
  for(const view of [{},{started:true,inVR:true},{started:true,over:true,inVR:true},{started:true,inVR:true,daily:{no:3,done:false}}]){
    const b=menuButtons({difficulty:'easy',hand:'right',sound:true,haptics:true,height:'auto',arenas,arena:0,...view});
    for(const x of b){const o=ONLINE_BUTTON;assert.ok(o.x+o.w<=x.x||x.x+x.w<=o.x||o.y+o.h<=x.y||x.y+x.h<=o.y,'ONLINE overlaps '+x.id);}
    const all=[...b,ONLINE_BUTTON];assert.equal(hitButton(all,ONLINE_BUTTON.x+10,ONLINE_BUTTON.y+10).id,'online');
    for(const x of b)assert.equal(hitButton(all,x.x+x.w/2,x.y+x.h/2).id,x.id);
  }
  assert.ok(ONLINE_BUTTON.y>=10&&ONLINE_BUTTON.y+ONLINE_BUTTON.h<=110&&ONLINE_BUTTON.x>=380&&ONLINE_BUTTON.x+ONLINE_BUTTON.w<=700,'clear of the title and the status text');
});
test('scoreboard lines for every state, and the Quest-menu notice',()=>{
  for(const [m] of phases()){const b=onlineBoard(m);assert.ok(b.label&&b.sub,JSON.stringify(m.phase));}
  const m=createOnline();m.phase='playing';m.state=initial();m.score=[1,2];
  assert.equal(onlineBoard(m).score,'1 : 2');assert.equal(onlineBoard(m,{away:true}).label,'QUEST MENU IS OPEN');
  m.phase='searching';assert.equal(onlineBoard(m).score,'');
});
test('the VR client uses the phone page and server unchanged: same messages, same move cadence',()=>{
  const page=read('online.html'),vr=read('assets/quest-vr.mjs');
  // the bridge only exists when the page is framed with ?vrhost=1
  assert.match(page,/get\('vrhost'\)==='1'&&window\.parent!==window/);
  // one sender for moves, shared by the phone's pointer and the headset: 30 ms apart, flipped for player 1
  assert.match(page,/function sendMove\(x,y\)\{\s*if\(!ws\|\|ws\.readyState!==1\|\|!state\)return false;\s*const now=performance\.now\(\);if\(now-lastSend<30\)return false;/);
  assert.ok(!/new WebSocket/.test(vr),'the headset opens no socket of its own');
  assert.ok(!/fetch\(/.test(read('assets/quest-online.mjs')),'nor asks the lobby itself');
  // a full server match still produces a winner (physics untouched)
  const s=initial();let n=0;const t=[null,null];
  while(!s.winner&&n<60*600){t[0]={x:s.puck.x,y:Math.max(s.puck.y+.1,.99)};t[1]={x:.5,y:.07};steer(s,t);step(s);n++;}
  assert.ok(s.winner>0);
});
