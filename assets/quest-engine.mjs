// CREASE VR: pure helpers for playing the real web game engine (index.html in
// ?vrhost=1 mode) inside the headset. No three.js, no DOM, so Node can test it.
//
// Field coordinates are the engine's: u in [0,1] across the table, v in [0,L]
// along it, player 1 (you) near v = L. VR table coordinates are metres: x in
// [-.5,.5], z in [-.9,.9], you stand at +z. The VR table is always 1 m x 1.8 m,
// so a table whose engine length L differs is stretched along its length.

export const TABLE_W=1, TABLE_D=1.8;

export function fieldToTable(u,v,L,out={x:0,z:0}){out.x=(u-.5)*TABLE_W;out.z=(v/L-.5)*TABLE_D;return out;}
export function tableToField(x,z,L,out={u:.5,v:0}){out.u=x/TABLE_W+.5;out.v=(z/TABLE_D+.5)*L;return out;}
// VR input used (x,y) with x across [0,1] and y along [0,1.8] (y = z + .9).
export function inputToField(x,y,L,out={u:.5,v:0}){out.u=x;out.v=y/TABLE_D*L;return out;}
export function fieldToInput(u,v,L,out={x:.5,y:0}){out.x=u;out.y=v/L*TABLE_D;return out;}

// Pick-ups: colours come from the engine's COL; the glyph tells them apart
// without reading text (one dot, two dots, a bar).
export const PICKUPS={
  BIG:{label:'BIG PADDLE',colour:'#ffd23f',glyph:'big'},
  MULTI:{label:'MULTI PUCK',colour:'#7cff6b',glyph:'multi'},
  WALL:{label:'GOAL WALL',colour:'#b26bff',glyph:'wall'},
};
export const pickupStyle=type=>PICKUPS[type]||{label:String(type||''),colour:'#ffffff',glyph:'big'};

// Whose half an arena power acts on (same rule as the phone game's drawEnv).
export function envVictim(env,L){
  if(!env)return 0;
  return env.type==='BLOOM'||env.type==='GOLD'||env.type==='STAR'||env.type==='LAVA'?env.who:3-env.who;
}

// The big line on the scoreboard. Mirrors what the phone game prints over the table.
export function boardLabel(game){
  if(game.state==='countdown'&&game.mode!=='demo'){
    if(game.score[0]+game.score[1]===0)return game.timer>1.2?'3':game.timer>.6?'2':'1';
    return game.timer>.3?'READY':'GO';
  }
  if(game.state==='over')return game.winner===1?'YOU WIN':'CPU WINS';
  if(game.state==='paused')return 'PAUSED';
  if(game.msgT>0&&game.msg)return String(game.msg);
  const pop=latestPop(game);
  return pop?pop.text.toUpperCase():'';
}
export function latestPop(game){
  for(let i=game.pops.length-1;i>=0;i--){const p=game.pops[i];if(p.t<p.life)return p;}
  return null;
}
// The small line under it: the active arena power, or Fire Mode.
export function powerLine(game,envName){
  const e=game.env;
  if(e&&e.t>0)return (e.who===1?'YOUR ':'CPU ')+e.name+' '+Math.ceil(e.t)+'s';
  if(game.envOrb)return 'ARENA POWER ON THE CREASE: '+game.envOrb.name;
  if(game.fire[0]>0)return 'FIRE MODE';
  if(game.fire[1]>0)return 'CPU FIRE MODE';
  return '';
}

// Detects things worth a controller buzz by comparing two frames of engine
// state. `prev` is kept by the caller and updated in place.
export function detectEvents(prev,game){
  const ev={hit:0,smash:false,bump:false,goalFor:0,reset:false};
  const returns=game.playerReturns||0,s0=game.score[0],s1=game.score[1];
  if(returns<prev.returns||s0<prev.s0||s1<prev.s1)ev.reset=true;
  else{
    if(returns>prev.returns)ev.hit=returns-prev.returns;
    if(s0>prev.s0)ev.goalFor=1;else if(s1>prev.s1)ev.goalFor=2;
  }
  let smash=false;for(const pk of game.pucks)if(pk.smashT>.6)smash=true;
  ev.smash=smash&&!prev.smash;
  let flash=0;for(const b of game.bumpers)flash=Math.max(flash,b.flash);
  ev.bump=flash>.9&&prev.flash<=.9;
  prev.returns=returns;prev.s0=s0;prev.s1=s1;prev.smash=smash;prev.flash=flash;
  return ev;
}
export const newEventState=()=>({returns:0,s0:0,s1:0,smash:false,flash:0});

// Arena picker rows. Only unlocked arenas can be chosen.
export function arenaChoices(arenas,selected){
  return arenas.map(a=>({index:a.index,name:a.name,unlocked:!!a.unlocked,selected:a.index===selected,requirement:a.requirement||''}));
}
// Keep the saved choice only if the player may still play it.
export function usableArena(arenas,wanted){
  const a=arenas.find(x=>x.index===wanted);
  if(a&&a.unlocked)return wanted;
  const first=arenas.find(x=>x.unlocked);return first?first.index:0;
}
// Backdrop geometry: a curved panel around the far end of the room. Keeps the
// plate's aspect ratio at a fixed height, so a 3:1 plate is wide and a 3:2 plate narrower.
export function backdropSize(aspect,radius=5.5,height=5.2){
  const arc=height*(Number.isFinite(aspect)&&aspect>.3?aspect:3);
  return {radius,height,theta:Math.min(Math.PI*1.7,arc/radius)};
}
// Which side of the table to open: levels follow the phone game's names.
export const LEVEL_LABELS={easy:'NORMAL',normal:'HARD',hard:'CTW'};
