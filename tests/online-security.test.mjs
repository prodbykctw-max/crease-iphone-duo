// Online relay hardening: paddle speed cap, lobby readiness, idle/finished room
// closing and per-IP rate limiting (backend/online).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initial,step,target,steer,MAX_SPEED} from '../backend/online/physics.mjs';
import worker,{Lobby,Room} from '../backend/online/worker.mjs';

const TICK=1/60;

test('a flood of moves cannot push a paddle past MAX_SPEED per tick',()=>{
  const s=initial(),targets=[null,null];
  for(let tick=0;tick<120;tick++){
    const before={...s.paddles[0]};
    // a modded client: 50 messages per tick, each to the far corner
    for(let i=0;i<50;i++)targets[0]=target(0,tick%2?.07:.93,tick%2?.99:1.73);
    steer(s,targets,TICK);step(s);
    const moved=Math.hypot(s.paddles[0].x-before.x,s.paddles[0].y-before.y);
    assert.ok(moved<=MAX_SPEED*TICK+1e-12,`moved ${moved}`);
  }
});

test('the cap does not slow the official client (0.12 per 30 ms message)',()=>{
  // official client limit: one move per 30 ms; the old server moved <= 0.12 per move
  const from={x:.5,y:1.6},to={x:.1,y:1.0},d=Math.hypot(to.x-from.x,to.y-from.y);
  const oldMs=Math.ceil(d/.12)*30;
  const s=initial(),targets=[target(0,to.x,to.y),null];
  let ms=0;while(targets[0]&&ms<5000){steer(s,targets,TICK);ms+=1000/60;}
  assert.ok(Math.abs(s.paddles[0].x-to.x)<1e-9&&Math.abs(s.paddles[0].y-to.y)<1e-9);
  assert.ok(ms<=oldMs+1000/60,`new ${ms.toFixed(0)} ms vs old ${oldMs} ms`);
  assert.ok(MAX_SPEED>=.12/.030,'cap below the honest client maximum');
});

test('targets are clamped to the player half and non-finite input ignored',()=>{
  assert.equal(target(0,NaN,1),null);assert.equal(target(1,1,Infinity),null);
  assert.deepEqual(target(0,-5,-5),{x:.07,y:.99});
  assert.deepEqual(target(1,5,5),{x:.93,y:.81});
});

const req=(path,ip)=>new Request('https://crease-online.example'+path,{headers:ip?{'CF-Connecting-IP':ip}:{}});
const match=async(lobby,ip)=>(await lobby.fetch(req('/match',ip))).json();

test('lobby only offers a code once the host is connected',async()=>{
  const lobby=new Lobby({});
  const a=await match(lobby,'1.1.1.1');assert.equal(a.create,true);
  const b=await match(lobby,'2.2.2.2');
  assert.equal(b.create,true,'unconfirmed code must not be handed out');assert.notEqual(b.code,a.code);
  await lobby.fetch(req('/ready?code='+a.code));
  const c=await match(lobby,'3.3.3.3');assert.deepEqual(c,{code:a.code,create:false});
  const d=await match(lobby,'4.4.4.4');assert.equal(d.create,true,'a code is handed out once');
});

test('lobby never pairs an IP with itself and expires stale codes',async()=>{
  const lobby=new Lobby({});const real=Date.now;
  try{
    const a=await match(lobby,'1.1.1.1');await lobby.fetch(req('/ready?code='+a.code));
    const same=await match(lobby,'1.1.1.1');assert.equal(same.create,true);assert.notEqual(same.code,a.code);
    const t0=real();Date.now=()=>t0+31000;
    const late=await match(lobby,'9.9.9.9');assert.equal(late.create,true,'expired code offered');
  }finally{Date.now=real;}
});

test('lobby ignores /ready for codes it never issued',async()=>{
  const lobby=new Lobby({});
  await lobby.fetch(req('/ready?code=ABCDEFGHJK'));
  assert.equal((await match(lobby,'1.1.1.1')).create,true);
});

// ── Room with a fake socket pair (Node has no WebSocketPair / 101 Response) ──
class FakeWS{constructor(){this.sent=[];this.closed=false;this.l={};}accept(){}send(m){this.sent.push(m);}
  close(){this.closed=true;}addEventListener(t,f){(this.l[t]??=[]).push(f);}emit(t,e){for(const f of this.l[t]||[])f(e);}}
function withFakes(fn){
  const RealResponse=globalThis.Response,RealPair=globalThis.WebSocketPair;
  const sockets=[];
  globalThis.WebSocketPair=class{constructor(){const c=new FakeWS(),s=new FakeWS();sockets.push(s);this[0]=c;this[1]=s;}};
  globalThis.Response=class extends RealResponse{constructor(b,init){if(init&&init.status===101){super(null,{status:200});this.upgraded=true;}else super(b,init);}};
  return Promise.resolve(fn(sockets)).finally(()=>{globalThis.Response=RealResponse;globalThis.WebSocketPair=RealPair;});
}
function fakeCtx(){const ctx={alarm:null,storage:{setAlarm:async t=>{ctx.alarm=t;}}};return ctx;}
const roomReq=(code,create)=>new Request('https://crease-online.example/room/'+code+(create?'?create=1':''),{headers:{Upgrade:'websocket'}});

test('host connecting tells the lobby; an empty room closes on its alarm',()=>withFakes(async sockets=>{
  const readyCalls=[];
  const env={LOBBY:{idFromName:n=>n,get:()=>({fetch:async u=>{readyCalls.push(String(u));return new Response(null,{status:204});}})}};
  const ctx=fakeCtx(),room=new Room(ctx,env);
  const r=await room.fetch(roomReq('ABCDEFGHJK',true));assert.ok(r.upgraded);
  assert.ok(ctx.alarm>Date.now()+55000&&ctx.alarm<=Date.now()+60000,'alarm ~60 s out');
  await new Promise(r=>setTimeout(r,0));
  assert.deepEqual(readyCalls,['https://lobby/ready?code=ABCDEFGHJK']);
  await room.alarm();
  assert.equal(sockets[0].closed,true);assert.equal(room.players.length,0);
}));

test('a full room ignores the alarm; a finished match closes ~5 s after the winner',()=>withFakes(async sockets=>{
  const realSI=globalThis.setInterval,realCI=globalThis.clearInterval;let body=null;
  globalThis.setInterval=f=>{body=f;return 1;};globalThis.clearInterval=()=>{};
  try{
    const room=new Room(fakeCtx(),{});
    await room.fetch(roomReq('ABCDEFGHJK',true));await room.fetch(roomReq('ABCDEFGHJK',false));
    assert.equal(room.players.length,2);assert.ok(body,'match loop started');
    await room.alarm();assert.equal(sockets[0].closed,false,'alarm must not end a live match');
    for(let i=0;i<10;i++)body();
    assert.equal(sockets[0].closed,false);
    room.state.winner=1;
    for(let i=0;i<300;i++)body();
    assert.equal(sockets[0].closed,false,'still open just under 5 s');
    body();
    assert.equal(sockets[0].closed,true);assert.equal(sockets[1].closed,true);assert.equal(room.players.length,0);
  }finally{globalThis.setInterval=realSI;globalThis.clearInterval=realCI;}
}));

test('room steers paddles toward the latest move at the capped speed',()=>withFakes(async sockets=>{
  const realSI=globalThis.setInterval,realCI=globalThis.clearInterval;let body=null;
  globalThis.setInterval=f=>{body=f;return 1;};globalThis.clearInterval=()=>{};
  try{
    const room=new Room(fakeCtx(),{});
    await room.fetch(roomReq('ABCDEFGHJK',true));await room.fetch(roomReq('ABCDEFGHJK',false));
    const start={...room.state.paddles[0]};
    for(let i=0;i<40;i++)sockets[0].emit('message',{data:JSON.stringify({type:'move',x:.93,y:.99})});
    body();
    const p=room.state.paddles[0];
    assert.ok(Math.hypot(p.x-start.x,p.y-start.y)<=MAX_SPEED/60+1e-12);
    assert.ok(p.x>start.x&&p.y<start.y,'moved toward the target');
  }finally{globalThis.setInterval=realSI;globalThis.clearInterval=realCI;}
}));

test('rate limit: /match and /room are limited per IP after the origin check',async()=>{
  let n=0;const env={ALLOWED_ORIGINS:'https://prodbykctw-max.github.io',MATCH_LIMIT:{limit:async()=>({success:++n<=20})},
    LOBBY:{idFromName:x=>x,get:()=>({fetch:async()=>new Response('{"code":"X","create":true}')})}};
  const call=(o)=>worker.fetch(new Request('https://crease-online.example/match',{headers:{Origin:o,'CF-Connecting-IP':'5.5.5.5'}}),env);
  assert.equal((await call('https://evil.example')).status,403);
  assert.equal(n,0,'refused origins do not spend the budget');
  const codes=[];for(let i=0;i<21;i++)codes.push((await call('https://prodbykctw-max.github.io')).status);
  assert.equal(codes.filter(c=>c===200).length,20);assert.equal(codes.at(-1),429);
});

test('production config serves only the github.io origin',async()=>{
  const {readFileSync}=await import('node:fs');
  const raw=readFileSync(new URL('../backend/online/wrangler.jsonc',import.meta.url),'utf8');
  const cfg=JSON.parse(raw.replace(/^\s*\/\/.*$/gm,''));
  assert.equal(cfg.vars.ALLOWED_ORIGINS,'https://prodbykctw-max.github.io');
  assert.match(cfg.env.dev.vars.ALLOWED_ORIGINS,/localhost/);
  assert.equal(cfg.ratelimits[0].name,'MATCH_LIMIT');
});
