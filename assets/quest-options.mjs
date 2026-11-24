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
export const DEFAULTS=Object.freeze({hand:'right',height:'auto',difficulty:'easy',sound:true,haptics:true});
const KEY='crease-vr-options-v1';

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

// Menu canvas is MENU_W x MENU_H pixels, drawn on a 0.72 x 0.54 m panel.
export const MENU_W=1024, MENU_H=768;
export function menuButtons(view){
  const b=[],row=(y,items,x0=56,gap=16,h=84)=>{let x=x0;for(const it of items){b.push({...it,x,y,w:it.w,h});x+=it.w+gap;}};
  const primary=view.over?'REMATCH':view.started?'RESUME':'PLAY';
  row(150,[{id:'primary',label:primary,w:440,accent:true},...(view.started&&!view.over?[{id:'restart',label:'RESTART',w:300}]:[]),]);
  row(300,DIFFICULTIES.map(d=>({id:'diff:'+d.key,label:d.label,w:200,active:view.difficulty===d.key})),330);
  row(420,[{id:'lower',label:'−',w:90},{id:'raise',label:'+',w:90},{id:'auto',label:'AUTO',w:150,active:view.height==='auto'},{id:'match',label:view.calibrating?'HOLD STILL…':'MATCH MY HAND',w:300,active:!!view.calibrating}],330);
  row(540,[{id:'hand:left',label:'LEFT',w:160,active:view.hand==='left'},{id:'hand:right',label:'RIGHT',w:160,active:view.hand==='right'}],330);
  row(540,[{id:'sound',label:view.sound?'SOUND ON':'SOUND OFF',w:300,active:view.sound}],690);
  row(660,[{id:'haptics',label:view.haptics?'ON':'OFF',w:300,active:view.haptics}],330);
  if(view.inVR)row(660,[{id:'exit',label:'EXIT VR',w:300}],668);
  return b;
}
export function hitButton(buttons,x,y){return buttons.find(b=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h)||null;}

// Applies a menu button to the options; returns the action the scene must run.
export function applyButton(options,id){
  if(id.startsWith('diff:')){options.difficulty=id.slice(5);return 'difficulty';}
  if(id.startsWith('hand:')){options.hand=id.slice(5);return 'hand';}
  if(id==='sound'){options.sound=!options.sound;return 'sound';}
  if(id==='haptics'){options.haptics=!options.haptics;return 'haptics';}
  if(id==='auto'){options.height='auto';return 'height';}
  return id; // primary, restart, lower, raise, match, exit: handled by the scene
}
