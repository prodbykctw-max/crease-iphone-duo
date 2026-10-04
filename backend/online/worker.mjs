import {initial,move,step} from './physics.mjs';

const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE=/^[A-Z2-9]{10}$/;
// A waiting opponent is only offered to the next arrival for this long. If the
// host closed their tab, the joiner gets a 404 from the room and asks again.
const HOLD_MS=30000;

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

export class Lobby {
  constructor(ctx){this.ctx=ctx;this.waiting=null;}
  async fetch(){
    const now=Date.now();
    if(this.waiting&&now-this.waiting.ts>HOLD_MS)this.waiting=null;
    let body;
    if(this.waiting){body={code:this.waiting.code,create:false};this.waiting=null;}
    else{const code=newCode();this.waiting={code,ts:now};body={code,create:true};}
    return new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
  }
}

export class Room {
  constructor(ctx){this.ctx=ctx;this.players=[];this.state=initial();this.timer=null;this.ticks=0;}
  async fetch(request){
    const create=new URL(request.url).searchParams.get('create')==='1';
    if(this.players.length===0&&!create)return new Response('Room not found',{status:404});
    if(this.players.length>=2||this.players.length&&create)return new Response('Room full',{status:409});
    const pair=new WebSocketPair(),[client,server]=Object.values(pair);server.accept();
    const player=this.players.length;this.players.push(server);let last=0;
    server.send(JSON.stringify({type:'joined',player}));
    // Tell the player already waiting that someone arrived, so the host's UI can
    // stop saying "waiting" before the first state frame lands.
    if(this.players.length===2)for(const ws of this.players)try{ws.send(JSON.stringify({type:'ready'}));}catch{}
    server.addEventListener('message',e=>{
      if(typeof e.data!=='string'||e.data.length>256)return;
      const now=Date.now();if(now-last<14)return;last=now;
      try{const m=JSON.parse(e.data);if(m.type==='move')move(this.state,player,m.x,m.y);}catch{}
    });
    const close=()=>{if(!this.players.includes(server))return;clearInterval(this.timer);this.timer=null;const peers=this.players;this.players=[];this.state=initial();for(const ws of peers)try{ws.close(1000,'Match ended');}catch{}};
    server.addEventListener('close',close,{once:true});server.addEventListener('error',close,{once:true});
    if(this.players.length===2){this.ticks=0;this.timer=setInterval(()=>{step(this.state);this.ticks++;if(this.ticks%2===0){const msg=JSON.stringify({type:'state',state:this.state});for(const ws of this.players)try{ws.send(msg);}catch{}}if(this.ticks>60*600)close();},1000/60);}
    return new Response(null,{status:101,webSocket:client});
  }
}
