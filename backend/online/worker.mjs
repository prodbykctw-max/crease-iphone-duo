import {initial,step,target,steer} from './physics.mjs';

const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE=/^[A-Z2-9]{10}$/;
// A waiting opponent is only offered to the next arrival for this long. If the
// host closed their tab, the joiner gets a 404 from the room and asks again.
const HOLD_MS=30000;
// An unconfirmed code is still offered this soon after it was issued.
const FRESH_MS=8000;
// Most waiting rooms the lobby remembers at once (oldest dropped first).
const MAX_WAITING=32;
// A room nobody else has joined is closed this long after its first player.
const EMPTY_MS=60000;
// A finished match stays open this many 60 Hz ticks (~5 s) so both players
// see the result, then closes.
const END_TICKS=300;

function newCode(){
  return Array.from(crypto.getRandomValues(new Uint8Array(10)),n=>ALPHABET[n%32]).join('');
}
function allowed(env,origin){
  return (env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean).includes(origin);
}
function cors(origin){
  return {'Access-Control-Allow-Origin':origin,'Vary':'Origin','Cache-Control':'no-store'};
}

export default {async fetch(request,env){
  const url=new URL(request.url),origin=request.headers.get('Origin');

  if(request.method==='OPTIONS'){
    if(!allowed(env,origin))return new Response('Forbidden',{status:403});
    return new Response(null,{status:204,headers:{...cors(origin),
      'Access-Control-Allow-Methods':'GET,OPTIONS','Access-Control-Allow-Headers':'content-type','Access-Control-Max-Age':'86400'}});
  }

  if(!allowed(env,origin))return new Response('Forbidden',{status:403});

  // Per-IP rate limit on matchmaking and room sockets (binding optional).
  if(env.MATCH_LIMIT&&(url.pathname==='/match'||url.pathname.startsWith('/room/'))){
    const {success}=await env.MATCH_LIMIT.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'});
    if(!success)return new Response('Too many requests',{status:429,headers:cors(origin)});
  }

  // Quick match: pair whoever is waiting with whoever asks next. One lobby for
  // the whole game, so any two visitors meet without exchanging anything.
  if(url.pathname==='/match'){
    const res=await env.LOBBY.get(env.LOBBY.idFromName('global')).fetch(request);
    const body=await res.text();
    return new Response(body,{status:res.status,headers:{...cors(origin),'content-type':'application/json'}});
  }

  const room=url.pathname.startsWith('/room/')?url.pathname.slice(6):'';
  if(!CODE.test(room))return new Response('Invalid room',{status:400,headers:cors(origin)});
  if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')
    return new Response('WebSocket required',{status:426,headers:cors(origin)});
  return env.ROOMS.get(env.ROOMS.idFromName('/room/'+room)).fetch(request);
}};

// Quick-match lobby. A code is only offered to a second player once its host's
// socket is actually open in the Room (the Room calls /ready), within HOLD_MS,
// and never to a request from the host's own IP. /ready is only reachable from
// the Room: the public Worker forwards nothing but /match here.
export class Lobby {
  constructor(ctx){this.ctx=ctx;this.waiting=[];}
  async fetch(request){
    const url=new URL(request.url),now=Date.now();
    this.waiting=this.waiting.filter(w=>now-w.ts<=HOLD_MS);
    if(url.pathname==='/ready'){
      const w=this.waiting.find(w=>w.code===url.searchParams.get('code'));
      if(w)w.ready=true;
      return new Response(null,{status:204});
    }
    // The room closed (host left or match over): stop offering its code.
    if(url.pathname==='/gone'){
      const c=url.searchParams.get('code');this.waiting=this.waiting.filter(w=>w.code!==c);
      return new Response(null,{status:204});
    }
    const ip=request.headers.get('CF-Connecting-IP')||'';
    // Prefer a host whose socket is confirmed open. Failing that, offer a code
    // handed out in the last FRESH_MS (its host is most likely still
    // connecting) so two players who tap at the same moment still meet; a
    // stale unconfirmed code is never offered, so a flood of abandoned codes
    // can't strand real players.
    const other=w=>!(ip&&w.ip===ip);
    let i=this.waiting.findIndex(w=>w.ready&&other(w));
    if(i<0)i=this.waiting.findIndex(w=>!w.ready&&now-w.ts<=FRESH_MS&&other(w));
    let body;
    if(i>=0){const [w]=this.waiting.splice(i,1);body={code:w.code,create:false};}
    else{
      const code=newCode();this.waiting.push({code,ts:now,ip,ready:false});
      if(this.waiting.length>MAX_WAITING)this.waiting.shift();
      body={code,create:true};
    }
    return new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
  }
}

export class Room {
  constructor(ctx,env){this.ctx=ctx;this.env=env;this.players=[];this.state=initial();this.targets=[null,null];this.timer=null;this.ticks=0;this.endAt=0;}
  // Ends the match: stops the loop, resets the table, closes both sockets.
  end(){
    if(this.code&&this.env&&this.env.LOBBY){
      const lobby=this.env.LOBBY.get(this.env.LOBBY.idFromName('global'));
      this.ctx.waitUntil?.(lobby.fetch('https://lobby/gone?code='+encodeURIComponent(this.code)).catch(()=>{}));
    }
    clearInterval(this.timer);this.timer=null;const peers=this.players;this.players=[];this.state=initial();this.targets=[null,null];this.endAt=0;for(const ws of peers)try{ws.close(1000,'Match ended');}catch{}}
  // EMPTY_MS after the first player arrived: nobody joined, so close the room.
  async alarm(){if(this.players.length===1)this.end();}
  async fetch(request){
    const url=new URL(request.url),create=url.searchParams.get('create')==='1';
    if(this.players.length===0&&!create)return new Response('Room not found',{status:404});
    if(this.players.length>=2||this.players.length&&create)return new Response('Room full',{status:409});
    const pair=new WebSocketPair(),[client,server]=Object.values(pair);server.accept();
    const player=this.players.length;this.players.push(server);let last=0;
    if(player===0){
      this.code=url.pathname.slice(6);
      await this.ctx.storage.setAlarm(Date.now()+EMPTY_MS);
      // the host is connected: the lobby may now offer this code
      if(create&&this.env&&this.env.LOBBY){
        const lobby=this.env.LOBBY.get(this.env.LOBBY.idFromName('global'));
        try{await lobby.fetch('https://lobby/ready?code='+encodeURIComponent(url.pathname.slice(6)));}catch{}
      }
    }
    server.send(JSON.stringify({type:'joined',player}));
    // Tell the player already waiting that someone arrived, so the host's UI can
    // stop saying "waiting" before the first state frame lands.
    if(this.players.length===2)for(const ws of this.players)try{ws.send(JSON.stringify({type:'ready'}));}catch{}
    server.addEventListener('message',e=>{
      if(typeof e.data!=='string'||e.data.length>256)return;
      const now=Date.now();if(now-last<14)return;last=now;
      try{const m=JSON.parse(e.data);if(m.type==='move'){const t=target(player,m.x,m.y);if(t)this.targets[player]=t;}}catch{}
    });
    const close=()=>{if(!this.players.includes(server))return;this.end();};
    server.addEventListener('close',close,{once:true});server.addEventListener('error',close,{once:true});
    if(this.players.length===2){this.ticks=0;this.endAt=0;this.timer=setInterval(()=>{steer(this.state,this.targets);step(this.state);this.ticks++;if(this.ticks%2===0){const msg=JSON.stringify({type:'state',state:this.state});for(const ws of this.players)try{ws.send(msg);}catch{}}
      if(this.state.winner&&!this.endAt)this.endAt=this.ticks+END_TICKS;
      if(this.ticks>60*600||(this.endAt&&this.ticks>=this.endAt))this.end();},1000/60);}
    return new Response(null,{status:101,webSocket:client});
  }
}
