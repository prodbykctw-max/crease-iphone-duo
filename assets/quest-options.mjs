// CREASE VR: player options, table-height maths, pinch detection and the
// in-headset options menu layout. Pure functions only (no three.js, no DOM),
// so tests/quest-options.test.mjs can check them in Node.

export const TABLE_MIN=.55, TABLE_MAX=1.15, TABLE_STEP=.025, TABLE_DEFAULT=.8;
// A real air hockey table is about 80 cm high for a standing adult whose eyes
// are about 1.55 m up: roughly 0.52 of eye height. Seated (eyes ~1.15 m) that
// gives ~60 cm, about lap height. Clamped so the table never sinks into the
// floor or rises past the chest.
export const EYE_TO_TABLE=.52;
// The paddle's top sits ~11 cm above the surface and a hand resting on it sits
// a little higher, so "match my hand" puts the surface 10 cm below the palm.
export const HAND_ABOVE_TABLE=.10;

export const DIFFICULTIES=[{key:'easy',label:'NORMAL'},{key:'normal',label:'HARD'},{key:'hard',label:'CTW'}];
export const DEFAULTS=Object.freeze({hand:'right',height:'auto',difficulty:'easy',sound:true,haptics:true,arena:0});
const KEY='crease-vr-options-v1';
export const ARENA_COUNT=10;

export function clampHeight(h){
  if(!Number.isFinite(h))return TABLE_DEFAULT;
  return Math.round(Math.max(TABLE_MIN,Math.min(TABLE_MAX,h))*1000)/1000;
}
export function autoTableHeight(eyeY){
  if(!Number.isFinite(eyeY)||eyeY<.6||eyeY>2.4)return TABLE_DEFAULT;
  return clampHeight(eyeY*EYE_TO_TABLE);
}
export function heightFromHand(handY){return clampHeight(handY-HAND_ABOVE_TABLE);}
export function stepHeight(current,direction){return clampHeight(current+Math.sign(direction)*TABLE_STEP);}

export function sanitize(raw){
  const o={...DEFAULTS};if(!raw||typeof raw!=='object')return o;
  if(raw.hand==='left'||raw.hand==='right')o.hand=raw.hand;
  if(raw.height==='auto')o.height='auto';else if(Number.isFinite(raw.height))o.height=clampHeight(raw.height);
  if(DIFFICULTIES.some(d=>d.key===raw.difficulty))o.difficulty=raw.difficulty;
  if(typeof raw.sound==='boolean')o.sound=raw.sound;
  if(typeof raw.haptics==='boolean')o.haptics=raw.haptics;
  if(Number.isInteger(raw.arena)&&raw.arena>=0&&raw.arena<ARENA_COUNT)o.arena=raw.arena;
  return o;
}
// Storage can be missing, blocked or full (private mode, Quest guest user):
// the game must still run, it just forgets the options.
export function loadOptions(storage){try{return sanitize(JSON.parse(storage?.getItem(KEY)||'null'));}catch{return {...DEFAULTS};}}
export function saveOptions(storage,options){try{storage?.setItem(KEY,JSON.stringify(sanitize(options)));return true;}catch{return false;}}

// Poke: a fingertip that was in front of a panel and crosses its surface
// presses whatever is under it. One press per crossing.
export const POKE_FRONT=.02, POKE_HIT=.004;
export function updatePoke(poke,depth){
  if(!Number.isFinite(depth)){poke.armed=false;return false;}
  if(depth>POKE_FRONT){poke.armed=true;return false;}
  if(poke.armed&&depth<POKE_HIT){poke.armed=false;return true;}
  return false;
}

// Menu canvas is MENU_W x MENU_H pixels, drawn on a 0.72 x 0.584 m panel.
export const MENU_W=1024, MENU_H=830;
// view.arenas: [{index,name,unlocked}] from the engine; locked arenas are drawn
// dimmed and are never selectable (the scene refuses them too).
export function menuButtons(view){
  const b=[],row=(y,items,x0=56,gap=16,h=84)=>{let x=x0;for(const it of items){b.push({...it,x,y,w:it.w,h});x+=it.w+gap;}};
  const primary=view.over?'REMATCH':view.started?'RESUME':'PLAY';
  const d=view.daily; // the right end of this row (x > 800) is left free for a future ONLINE button.
  // {no,done} from the engine; absent in the simple fallback game
  row(120,[{id:'primary',label:primary,w:view.started&&!view.over?300:440,accent:true},...(view.started&&!view.over?[{id:'restart',label:'RESTART',w:170}]:[]),...(d?[{id:'daily',label:d.done?'DAILY DONE':'DAILY #'+d.no,w:220,locked:!!d.done,active:false}]:[])]);
  row(236,DIFFICULTIES.map(d=>({id:'diff:'+d.key,label:d.label,w:200,active:view.difficulty===d.key})),330,16,76);
  const arenas=view.arenas||[];
  arenas.slice(0,ARENA_COUNT).forEach((a,i)=>{
    const col=i%5,r=Math.floor(i/5),w=172;
    b.push({id:'arena:'+a.index,label:a.name,x:56+col*(w+13),y:376+r*72,w,h:60,active:view.arena===a.index,locked:!a.unlocked,small:true});
  });
  row(524,[{id:'lower',label:'−',w:90},{id:'raise',label:'+',w:90},{id:'auto',label:'AUTO',w:150,active:view.height==='auto'},{id:'match',label:view.calibrating?'HOLD STILL…':'MATCH MY HAND',w:300,active:!!view.calibrating}],330,16,76);
  row(624,[{id:'hand:left',label:'LEFT',w:160,active:view.hand==='left'},{id:'hand:right',label:'RIGHT',w:160,active:view.hand==='right'}],330,16,76);
  row(624,[{id:'sound',label:view.sound?'SOUND ON':'SOUND OFF',w:300,active:view.sound}],690,16,76);
  row(724,[{id:'haptics',label:view.haptics?'ON':'OFF',w:300,active:view.haptics}],330,16,76);
  if(view.inVR)row(724,[{id:'exit',label:'EXIT VR',w:300}],668,16,76);
  return b;
}
// Hit slop: a press that lands just outside a button (within SLOP canvas px,
// about 1.4 cm on the panel) still counts, picking the nearest button.
export const SLOP=20;
export function hitButton(buttons,x,y,slop=SLOP){
  let best=null,bestD=Infinity;
  for(const b of buttons){const dx=Math.max(b.x-x,0,x-(b.x+b.w)),dy=Math.max(b.y-y,0,y-(b.y+b.h)),d=Math.hypot(dx,dy);if(d===0)return b;if(d<=slop&&d<bestD){best=b;bestD=d;}}
  return best;
}

// Our own pinch detector for tracked hands (thumb tip to index tip), with
// hysteresis: closes under 2 cm, opens over 4 cm, so one pinch is one click.
export const PINCH_CLOSE=.02, PINCH_OPEN=.04;
export function updatePinch(pinch,distance){
  if(!Number.isFinite(distance))return null;
  if(!pinch.down&&distance<PINCH_CLOSE){pinch.down=true;return 'start';}
  if(pinch.down&&distance>PINCH_OPEN){pinch.down=false;return 'end';}
  return null;
}
// One physical pinch or trigger squeeze is one click, however many detectors
// (ours, the browser's select event) report it.
export const SELECT_GAP_MS=350;
export function acceptSelect(last,key,now,gap=SELECT_GAP_MS){
  const t=last.get(key);if(t!==undefined&&now-t<gap&&now>=t)return false;
  last.set(key,now);return true;
}

// Applies a menu button to the options; returns the action the scene must run.
export function applyButton(options,id){
  if(id.startsWith('diff:')){options.difficulty=id.slice(5);return 'difficulty';}
  if(id.startsWith('hand:')){options.hand=id.slice(5);return 'hand';}
  if(id.startsWith('arena:'))return 'arena'; // the scene checks the arena is unlocked, then sets options.arena
  if(id==='sound'){options.sound=!options.sound;return 'sound';}
  if(id==='haptics'){options.haptics=!options.haptics;return 'haptics';}
  if(id==='auto'){options.height='auto';return 'height';}
  return id; // primary, restart, lower, raise, match, exit: handled by the scene
}
