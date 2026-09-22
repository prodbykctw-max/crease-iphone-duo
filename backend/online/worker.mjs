import {initial,move,step} from './physics.mjs';
export default {async fetch(request,env){
  const url=new URL(request.url),origin=request.headers.get('Origin');
  if(!(env.ALLOWED_ORIGINS||'').split(',').includes(origin))return new Response('Forbidden',{status:403});
  if(!/^\/room\/[A-Z2-9]{10}$/.test(url.pathname))return new Response('Invalid room',{status:400});
  if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});
  return env.ROOMS.get(env.ROOMS.idFromName(url.pathname)).fetch(request);
}};
export class Room {
  constructor(ctx){this.ctx=ctx;this.players=[];this.state=initial();this.timer=null;this.ticks=0;}
  async fetch(request){
    const create=new URL(request.url).searchParams.get('create')==='1';
    if(this.players.length===0&&!create)return new Response('Room not found',{status:404});
    if(this.players.length>=2||this.players.length&&create)return new Response('Room full',{status:409});
    const pair=new WebSocketPair(),[client,server]=Object.values(pair);server.accept();
    const player=this.players.length;this.players.push(server);let last=0;
    server.send(JSON.stringify({type:'joined',player}));
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
