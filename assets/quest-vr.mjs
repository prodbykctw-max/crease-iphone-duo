import * as THREE from './vendor/three.module.min.js';
import {initial,move,step} from '../backend/online/physics.mjs';
import {followHand,createOpponent,opponentMove} from './quest-controls.mjs';
import {updatePinch,acceptSelect,SLOP as HIT_SLOP,loadOptions,saveOptions,autoTableHeight,heightFromHand,stepHeight,clampHeight,updatePoke,MENU_W,MENU_H,menuButtons,hitButton,applyButton,TABLE_DEFAULT} from './quest-options.mjs';
import {fieldToTable,inputToField,fieldToInput,pickupStyle,envVictim,boardLabel,powerLine,detectEvents,newEventState,usableArena,backdropSize} from './quest-engine.mjs';

const storage=(()=>{try{return localStorage;}catch{return null;}})();
const options=loadOptions(storage);const save=()=>saveOptions(storage,options);
const status=document.querySelector('#status'),enter=document.querySelector('#enter'),handSelect=document.querySelector('#hand');
handSelect.value=options.hand;handSelect.addEventListener('change',()=>{options.hand=handSelect.value;save();placeTab();menuDirty=true;});

// ---- The real game engine ----------------------------------------------------
// The phone game (index.html) runs in a hidden same-origin frame in "VR host"
// mode: no screen, no intro, no menus. Every frame this page steps it and draws
// its state in 3D, so every rule, power-up, arena power, sound and unlock is the
// phone game's own. If the frame cannot load, the old simple game below is used.
const engine={host:null,frame:null,state:'loading',why:''};
let arenaList=[],arenaIx=0,pendingStart=false;
function loadEngine(){
  const f=document.createElement('iframe');
  f.src='index.html?vrhost=1&nointro';f.title='';f.setAttribute('aria-hidden','true');f.tabIndex=-1;
  // Portrait 500 x 864 gives the engine a 1 : 1.8 table, the same shape as the VR table.
  f.style.cssText='position:fixed;left:-9999px;top:0;width:500px;height:864px;border:0;opacity:0;pointer-events:none';
  engine.host=null;engine.state='loading';engine.errors=0;
  const fail=why=>{if(engine.state!=='loading')return;engine.state='failed';engine.why=why;engineSettled();};
  const timer=setTimeout(()=>fail('timeout'),20000);
  f.addEventListener('load',()=>{try{const h=f.contentWindow.__creaseHost;if(h&&h.version===1&&h.view.vw>0&&h.view.L>0){engine.host=h;engine.state='ready';clearTimeout(timer);engineSettled();}else fail('no host');}catch(e){fail(String(e&&e.message||e));}});
  f.addEventListener('error',()=>fail('error'));
  document.body.append(f);engine.frame=f;
}
// If the engine frame throws or stops, rebuild it rather than leave a dead game.
function recoverEngine(why){
  if(engine.state==='loading')return;
  try{engine.frame?.remove();}catch{}
  engine.recoveries=(engine.recoveries||0)+1;engine.lastWhy=why;
  pendingStart=started;menuOpen=true;menuDirty=true;say('RECOVERING THE GAME…',4);
  loadEngine();
}
function engineSettled(){
  if(engine.state==='ready'){
    const h=engine.host;h.setMuted(!options.sound);if(audio)h.setAudio(audio);
    arenaList=h.arenas();options.arena=usableArena(arenaList,options.arena);arenaIx=options.arena;h.setStage(arenaIx);
    applyArena(arenaIx);menuDirty=true;lastLabel='';
    if(pendingStart){pendingStart=false;startMatch();}
  }else{
    say('FULL GAME ENGINE UNAVAILABLE · PLAYING THE SIMPLE VERSION',5);menuDirty=true;
    if(pendingStart){pendingStart=false;startMatch();}
  }
}
const usingEngine=()=>engine.state==='ready';

const scene=new THREE.Scene();scene.background=new THREE.Color('#080514');scene.fog=new THREE.Fog('#080514',5,15);
const camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.01,40);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.xr.enabled=true;renderer.xr.setReferenceSpaceType('local-floor');document.body.append(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xc7bbff,0x170924,2));
const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-2,4,1);scene.add(light);

// local-floor is measured from the Quest floor. The table top sits at
// tableHeight (auto-fitted to the player, or set in the options menu).
const table=new THREE.Group();table.position.set(0,TABLE_DEFAULT,-1.25);scene.add(table);
function mesh(geometry,color,emissive=0){return new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,emissive,roughness:.32,metalness:.55}));}
function glowMat(color,opacity=1){return new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending});}
function box(w,h,d,x,y,z,color,glow=0){const m=mesh(new THREE.BoxGeometry(w,h,d),color,glow);m.position.set(x,y,z);table.add(m);return m;}
const GOAL_HALF=.19; // engine goal mouth is .38 wide
box(1.06,.1,1.86,0,-.06,0,0x180d2c);const windowMesh=box(1,.018,1.8,0,0,0,0x091b28);
// Rails and walls take the arena's colours (see applyArena).
const trimMats=[];const trim=(w,h,d,x,y,z)=>{const m=box(w,h,d,x,y,z,0x4ce9ff,0x126478);trimMats.push(m.material);return m;};
for(const x of [-.515,.515])trim(.025,.07,1.8,x,.025,0);
for(const z of [-.915,.915])for(const sx of [-1,1])trim(.5-GOAL_HALF+.015,.07,.025,sx*((.5+GOAL_HALF)/2),.025,z);
// Goal mouths: the far one is the CPU's (pink), yours is cyan.
const goalGlow=[-.925,.925].map(z=>box(GOAL_HALF*2,.018,.012,0,.03,z,z<0?0xff3195:0x2de2e6,z<0?0x99195f:0x126478));
// Corners are quarter-circle springs in the engine; a solid wedge outside the curve.
{const R=.15,sh=new THREE.Shape();sh.moveTo(R,0);sh.lineTo(R,R);sh.lineTo(0,R);sh.absarc(0,0,R,Math.PI/2,0,true);
  const g=new THREE.ExtrudeGeometry(sh,{depth:.07,bevelEnabled:false,curveSegments:10});g.rotateX(-Math.PI/2);
  for(const sx of [-1,1])for(const sz of [-1,1]){const m=mesh(g,0x4ce9ff,0x126478);m.position.set(sx*(.5-R),0,sz*(.9-R));m.scale.set(sx,1,-sz);table.add(m);trimMats.push(m.material);}}
const creaseLine=box(1,.002,.008,0,.012,0,0xbb66ff,0x673399);
let legs=[];for(const x of [-.4,.4])for(const z of [-.7,.7])legs.push(box(.07,1,.07,x,-.5,z,0x25143b));
let grid=new THREE.GridHelper(16,32,0x842e8f,0x271438);grid.position.y=-.01;scene.add(grid);
const paddles=[0x2de2e6,0xff3195].map(color=>{const g=new THREE.Group();
  const base=mesh(new THREE.CylinderGeometry(.082,.09,.038,40),color,color);base.position.y=.027;g.add(base);g.userData.base=base;
  const bevel=mesh(new THREE.TorusGeometry(.066,.007,10,40),0xffffff,color);bevel.rotation.x=Math.PI/2;bevel.position.y=.052;g.add(bevel);
  const grip=mesh(new THREE.CylinderGeometry(.03,.042,.08,28),color,color);grip.position.y=.075;g.add(grip);g.userData.grip=grip;
  const cap=mesh(new THREE.SphereGeometry(.021,20,12),0xffffff,color);cap.position.set(0,.12,-.006);g.add(cap);
  table.add(g);return g;});
// Fire Mode: a hot glow under the paddle of whoever is on a streak.
const fireDiscs=[0,1].map(()=>{const m=new THREE.Mesh(new THREE.CircleGeometry(.2,32),glowMat(0xff7a2f,0));m.rotation.x=-Math.PI/2;m.position.y=.02;m.visible=false;table.add(m);return m;});
// Pucks (the engine allows up to 3 with MULTI).
const MAX_PUCKS=3;
const pucks=[];for(let i=0;i<MAX_PUCKS;i++){const g=new THREE.Group();const body=mesh(new THREE.CylinderGeometry(.042,.042,.022,28),0xffffff,0x443366);body.position.y=.014;g.add(body);
  const halo=new THREE.Mesh(new THREE.RingGeometry(.05,.075,32),glowMat(0xffd23f,0));halo.rotation.x=-Math.PI/2;halo.position.y=.03;g.add(halo);g.userData={body,halo};g.visible=false;table.add(g);pucks.push(g);}
// Gold bumpers on the crease: solid for most of a cycle, ghosted when "phased".
const bumpers=[0,1].map(()=>{const g=new THREE.Group();const m=mesh(new THREE.CylinderGeometry(.05,.056,.05,32),0xffffff,0x444444);m.position.y=.03;g.add(m);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.04,.005,8,32),glowMat(0xffffff,.9));ring.rotation.x=Math.PI/2;ring.position.y=.058;g.add(ring);g.userData={m,ring};g.visible=false;table.add(g);return g;});
// Goal wall (WALL power-up): a shield bar across the goal.
const shields=[0,1].map(()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(GOAL_HALF*2+.06,.09,.02),glowMat(0xb26bff,.7));m.visible=false;table.add(m);return m;});
// Power-up pick-up: ring + disc + glyph, bobbing on the crease.
function glyphTexture(kind){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');x.clearRect(0,0,128,128);x.fillStyle='#ffffff';
  if(kind==='big'){x.beginPath();x.arc(64,64,34,0,7);x.fill();}
  else if(kind==='multi'){for(const o of [-1,1]){x.beginPath();x.arc(64+o*26,64,19,0,7);x.fill();}}
  else{x.fillRect(22,46,84,36);}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
const glyphTex={big:glyphTexture('big'),multi:glyphTexture('multi'),wall:glyphTexture('wall')};
const pickup=(()=>{const g=new THREE.Group();const disc=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,.01,32),glowMat(0xffffff,.35));disc.position.y=.012;g.add(disc);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.045,.0045,8,40),glowMat(0xffffff,1));ring.rotation.x=Math.PI/2;ring.position.y=.02;g.add(ring);
  const glyph=new THREE.Mesh(new THREE.PlaneGeometry(.075,.075),new THREE.MeshBasicMaterial({map:glyphTex.big,transparent:true,depthWrite:false}));glyph.rotation.x=-Math.PI/2;glyph.position.y=.05;g.add(glyph);
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,.22,24,1,true),glowMat(0xffffff,.18));beam.position.y=.12;g.add(beam);
  g.userData={disc,ring,glyph,beam};g.visible=false;table.add(g);return g;})();
// Arena power orb on the crease, with its name floating above.
const envOrb=(()=>{const g=new THREE.Group();const core=new THREE.Mesh(new THREE.IcosahedronGeometry(.05,1),glowMat(0xffffff,.9));core.position.y=.07;g.add(core);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.075,.005,8,40),glowMat(0xffffff,.9));ring.position.y=.07;g.add(ring);
  const label=canvasPlane(512,96,.34,.064);label.mesh.position.set(0,.2,0);g.add(label.mesh);
  g.userData={core,ring,label,name:''};g.visible=false;table.add(g);return g;})();
// The half of the table an active arena power acts on glows in the arena colour.
const envTint=new THREE.Mesh(new THREE.PlaneGeometry(1,.9),glowMat(0xffffff,0));envTint.rotation.x=-Math.PI/2;envTint.position.y=.011;envTint.visible=false;table.add(envTint);
// A true geometry centerpiece below the transparent-looking center window.
const orb=mesh(new THREE.IcosahedronGeometry(.17,1),0xff9044,0x8a2311);orb.position.set(0,-.25,0);table.add(orb);
windowMesh.material.transparent=true;windowMesh.material.opacity=.65;windowMesh.material.depthWrite=false;
const halo=mesh(new THREE.TorusGeometry(.23,.006,8,48),0xff49b6,0x99195f);halo.rotation.x=.7;orb.add(halo);
// Arena backdrop: the arena's own artwork on a curved panel around the far end of the room.
const backdrop=new THREE.Mesh(new THREE.CylinderGeometry(5.5,5.5,5.2,48,1,true,0,1),new THREE.MeshBasicMaterial({color:0xcccccc,side:THREE.BackSide,fog:false}));backdrop.visible=false;scene.add(backdrop);
const textures=new Map();const loader=new THREE.TextureLoader();
function plateTexture(id,cb){
  if(textures.has(id)){cb(textures.get(id));return;}
  loader.load('assets/arenas/'+id+'.webp',t=>{t.colorSpace=THREE.SRGBColorSpace;t.wrapS=THREE.RepeatWrapping;t.repeat.x=-1;t.offset.x=1;t.anisotropy=4;textures.set(id,t);while(textures.size>3){const k=textures.keys().next().value;textures.get(k).dispose();textures.delete(k);}cb(t);},undefined,()=>cb(null));
}
let backdropFor='';
function applyArena(i){
  const a=arenaList.find(x=>x.index===i);if(!a)return;const c=a.colors;
  for(const m of trimMats){m.color.set(c.rail||c.grid);m.emissive.set(c.rail||c.grid).multiplyScalar(.45);}
  goalGlow[0].material.color.set(c.p2);goalGlow[0].material.emissive.set(c.p2).multiplyScalar(.5);goalGlow[1].material.color.set(c.p1);goalGlow[1].material.emissive.set(c.p1).multiplyScalar(.5);
  for(const k of ['base','grip'])for(const [j,col] of [[0,c.p1],[1,c.p2]]){const m=paddles[j].userData[k].material;m.color.set(col);m.emissive.set(col);}
  creaseLine.material.color.set(c.horizon||c.grid);creaseLine.material.emissive.set(c.grid).multiplyScalar(.6);
  scene.remove(grid);grid.geometry.dispose();grid.material.dispose();grid=new THREE.GridHelper(16,32,new THREE.Color(c.grid).multiplyScalar(.7),new THREE.Color(c.grid).multiplyScalar(.2));grid.position.y=-.01;scene.add(grid);
  orb.material.color.set(c.sun?.[1]||c.grid);orb.material.emissive.set(c.sun?.[0]||c.grid).multiplyScalar(.7);
  scene.background.set(c.base?.[0]||'#080514');scene.fog.color.set(c.base?.[0]||'#080514');
  backdropFor=a.id;
  plateTexture(a.id,t=>{if(backdropFor!==a.id)return;if(!t){backdrop.visible=false;return;}
    const img=t.image,sz=backdropSize(img.width/img.height);backdrop.geometry.dispose();backdrop.geometry=new THREE.CylinderGeometry(sz.radius,sz.radius,sz.height,48,1,true,Math.PI-sz.theta/2,sz.theta);
    backdrop.material.map=t;backdrop.material.needsUpdate=true;backdrop.visible=true;backdrop.userData.height=sz.height;placeBackdrop();});
  lastLabel='';menuDirty=true;
}
function placeBackdrop(){backdrop.position.set(0,.3+(backdrop.userData.height||5.2)/2,-.6);}

function canvasPlane(w,h,pw,ph){const c=document.createElement('canvas');c.width=w;c.height=h;const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
  const m=new THREE.Mesh(new THREE.PlaneGeometry(pw,ph),new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false}));m.renderOrder=5;return {canvas:c,ctx:c.getContext('2d'),texture:t,mesh:m};}
const board=canvasPlane(1024,256,1.3,.325);board.mesh.material.side=THREE.DoubleSide;scene.add(board.mesh);
// Options menu: a panel floating over your own half of the table, within
// arm's reach, so it can be touched with a fingertip or pointed at and pinched.
const PANEL_W=.72,PANEL_H=PANEL_W*MENU_H/MENU_W;
const menu=canvasPlane(MENU_W,MENU_H,PANEL_W,PANEL_H);menu.mesh.rotation.x=-.36;menu.mesh.visible=false;scene.add(menu.mesh);
// Small MENU tab beside the table on your free-hand side, shown during play.
const TAB_W=.2,TAB_H=.08;
const tab=canvasPlane(256,104,TAB_W,TAB_H);tab.mesh.visible=false;scene.add(tab.mesh);
(function drawTab(){const c=tab.ctx;c.clearRect(0,0,256,104);c.fillStyle='#100821e8';roundRect(c,4,4,248,96,22);c.fill();c.strokeStyle='#36eeee';c.lineWidth=4;c.stroke();c.fillStyle='#36eeee';c.font='bold 44px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('MENU',128,54);tab.texture.needsUpdate=true;})();

// Old simple game (fallback only): state in table units, x across [0,1], y along [0,1.8].
let state=initial(),playing=false,started=false,desktop=false,intro=true,menuOpen=false,introT=0,last=0,acc=0,lastLabel='',audio,menuDirty=true,lastHoverKey='',calibrating=null,notice='',noticeT=0,eyeY=NaN,lostT=0;
let target={x:.5,y:1.6},smoothTarget={x:.5,y:1.6},opponent=createOpponent(options.difficulty);const sources=new Map();
let tableHeight=TABLE_DEFAULT,autoPending=options.height==='auto';
const plane=new THREE.Plane(new THREE.Vector3(0,1,0),-tableHeight);
const evState=newEventState();

function roundRect(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}
function placeTab(){const side=options.hand==='right'?-1:1;tab.mesh.position.set(side*.68,tableHeight+.2,-.42);tab.mesh.rotation.set(-.5,side*-.55,0,'YXZ');}
function applyHeight(h){
  tableHeight=clampHeight(h);table.position.y=tableHeight;
  // Legs run from under the top (0.11 m below the surface) to the floor.
  for(const leg of legs){const len=Math.max(.05,tableHeight-.11);leg.scale.y=len;leg.position.y=-.11-len/2;}
  board.mesh.position.set(0,tableHeight+.71,-1.75);menu.mesh.position.set(0,tableHeight+.5,-.55);placeTab();
  plane.constant=-tableHeight;
  camera.position.set(0,tableHeight+1.01,1.3);camera.lookAt(0,tableHeight+.04,-1.25);
  menuDirty=true;
}
applyHeight(options.height==='auto'?TABLE_DEFAULT:options.height);

const jointNames=['wrist','thumb-metacarpal','thumb-phalanx-proximal','thumb-phalanx-distal','thumb-tip','index-finger-metacarpal','index-finger-phalanx-proximal','index-finger-phalanx-intermediate','index-finger-phalanx-distal','index-finger-tip','middle-finger-metacarpal','middle-finger-phalanx-proximal','middle-finger-phalanx-intermediate','middle-finger-phalanx-distal','middle-finger-tip','ring-finger-metacarpal','ring-finger-phalanx-proximal','ring-finger-phalanx-intermediate','ring-finger-phalanx-distal','ring-finger-tip','pinky-finger-metacarpal','pinky-finger-phalanx-proximal','pinky-finger-phalanx-intermediate','pinky-finger-phalanx-distal','pinky-finger-tip'];
const handVisuals=new Map(),pokes=new Map(),pinches=new Map(),pinchA=new THREE.Vector3(),pinchB=new THREE.Vector3();
function makeHandVisual(){const g=new THREE.Group();for(const name of jointNames){const dot=mesh(new THREE.SphereGeometry(name==='wrist'?.022:.014,10,8),0xefffff,0x36eeee);g.add(dot);}g.visible=false;scene.add(g);return g;}

function startMatch(){
  if(engine.state==='loading'){pendingStart=true;say('LOADING THE GAME…',3);menuOpen=true;menuDirty=true;return;}
  if(usingEngine()){const h=engine.host;h.setDifficulty(options.difficulty);h.setStage(arenaIx);h.setMuted(!options.sound);if(audio)h.setAudio(audio);
    if(!h.startSolo()){say('THIS ARENA IS LOCKED',3);return;}
    Object.assign(smoothTarget,{x:.5,y:1.6});Object.assign(target,{x:.5,y:1.6});Object.assign(evState,newEventState());detectEvents(evState,h.game);
  }else{state=initial();opponent=createOpponent(options.difficulty);smoothTarget={...state.paddles[0]};}
  playing=true;started=true;intro=false;menuOpen=false;table.visible=true;acc=0;menuDirty=true;lastLabel='';
}
function openMenu(){if(intro)return;menuOpen=true;menuDirty=true;}
function skipIntro(){if(!intro)return;intro=false;menuOpen=true;table.visible=true;lastLabel='';menuDirty=true;}
function unlockSound(){if(!options.sound)return;if(!audio){audio=new AudioContext();if(usingEngine())engine.host.setAudio(audio);}audio.resume().catch(()=>{});}
function isPaddleHand(source){return !source||source.handedness===options.hand||source.handedness==='none';}
function haptic(source,intensity=.55,duration=35){if(!options.haptics)return;try{const a=source?.gamepad?.hapticActuators?.[0];if(a?.pulse)a.pulse(intensity,duration).catch(()=>{});else if(source?.gamepad?.vibrationActuator?.playEffect)source.gamepad.vibrationActuator.playEffect('dual-rumble',{duration,strongMagnitude:intensity,weakMagnitude:intensity*.6}).catch(()=>{});}catch{}}
const paddleSource=()=>[...sources.values()].find(s=>s.handedness===options.hand);
function say(text,seconds=2.5){notice=text;noticeT=seconds;lastLabel='';}

// ---- Options menu ----------------------------------------------------------
const buttonsDown=new Map();
const hover=new Map(); // pointer id -> {kind:'menu'|'tab', button}
const flashes=new Map(); // button id -> time the pressed flash ends
function clickSound(high=false){
  if(!options.sound||!audio||audio.state!=='running')return;
  try{const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime;o.type='triangle';o.frequency.setValueAtTime(high?1320:880,t);o.frequency.exponentialRampToValueAtTime(high?880:520,t+.07);
    g.gain.setValueAtTime(.09,t);g.gain.exponentialRampToValueAtTime(.001,t+.09);o.connect(g).connect(audio.destination);o.start(t);o.stop(t+.1);}catch{}
}
function menuView(){return {started,over:usingEngine()?engine.host.game.state==='over':!!state.winner,difficulty:options.difficulty,height:options.height,hand:options.hand,sound:options.sound,haptics:options.haptics,calibrating,inVR:renderer.xr.isPresenting,arenas:usingEngine()?arenaList:[],arena:arenaIx};}
function drawLock(c,x,y,col){c.strokeStyle=col;c.fillStyle=col;c.lineWidth=3;c.beginPath();c.arc(x,y-4,6,Math.PI,0);c.stroke();c.fillRect(x-8,y-4,16,12);}
function drawMenu(){
  const c=menu.ctx,buttons=menuButtons(menuView()),hot=new Set([...hover.values()].filter(h=>h.kind==='menu'&&h.button).map(h=>h.button.id)),nowMs=performance.now();
  const over=usingEngine()?engine.host.game.state==='over':!!state.winner,score=usingEngine()?engine.host.game.score:state.score,winner=usingEngine()?engine.host.game.winner:state.winner;
  c.clearRect(0,0,MENU_W,MENU_H);c.fillStyle='#100821f2';roundRect(c,6,6,MENU_W-12,MENU_H-12,40);c.fill();c.strokeStyle='#734394';c.lineWidth=6;c.stroke();
  c.textBaseline='middle';c.textAlign='left';c.fillStyle='#36eeee';c.font='bold 54px sans-serif';c.fillText('CREASE VR',56,66);
  c.fillStyle='#ffd15f';c.font='bold 30px sans-serif';c.textAlign='right';
  c.fillText(over?(winner===1?'YOU WIN '+score.join(' : '):'CPU WINS '+score.join(' : ')):started?'PAUSED  '+score.join(' : '):'OPTIONS',MENU_W-56,66);
  c.textAlign='left';c.fillStyle='#c9b8e8';c.font='bold 30px sans-serif';
  c.fillText('CPU',56,274);
  const cur=arenaList.find(a=>a.index===arenaIx);
  if(usingEngine()){c.fillText('ARENA',56,350);c.fillStyle='#ffffff';c.font='bold 30px sans-serif';c.fillText(cur?cur.name:'',200,350);}
  c.fillStyle='#c9b8e8';c.font='bold 30px sans-serif';c.fillText('TABLE HEIGHT',56,548);c.fillStyle='#ffffff';c.font='bold 30px sans-serif';c.fillText(Math.round(tableHeight*100)+' cm'+(options.height==='auto'?' · auto':''),56,586);
  c.fillStyle='#c9b8e8';c.font='bold 30px sans-serif';c.fillText('PADDLE HAND',56,662);c.fillText('VIBRATION',56,762);
  for(const b of buttons){
    const pressed=(flashes.get(b.id)||0)>nowMs;
    c.fillStyle=pressed?'#ff3195':b.accent?'#36eeee':b.locked?'#120a22':b.active?'#3a1f63':'#1b1032';roundRect(c,b.x,b.y,b.w,b.h,b.small?14:18);c.fill();
    c.lineWidth=hot.has(b.id)?8:3;c.strokeStyle=hot.has(b.id)?'#ff3195':b.active?'#36eeee':b.locked?'#2c1d45':'#4a2d73';c.stroke();
    c.fillStyle=pressed?'#ffffff':b.accent?'#120727':b.locked?'#6a5a8a':'#f5eaff';
    if(b.small){c.font='bold '+(b.label.length>9?(b.locked?16:19):(b.locked?19:22))+'px sans-serif';c.textAlign='center';c.fillText(b.label,b.x+b.w/2+(b.locked?13:0),b.y+b.h/2+2);if(b.locked)drawLock(c,b.x+16,b.y+b.h/2+1,'#8a74b5');c.textAlign='left';}
    else{c.font='bold '+(b.label.length>10?30:38)+'px sans-serif';c.textAlign='center';c.fillText(b.label,b.x+b.w/2,b.y+b.h/2+2);c.textAlign='left';}
  }
  menu.texture.needsUpdate=true;menuDirty=false;return buttons;
}
let buttons=drawMenu();
function chooseArena(i){
  const a=arenaList.find(x=>x.index===i);
  if(!a||!a.unlocked){say('LOCKED'+(a&&a.requirement?' · '+a.requirement.toUpperCase():' · KEEP PLAYING TO UNLOCK'),3.5);return false;}
  arenaIx=i;options.arena=i;engine.host.setStage(i);applyArena(i);
  if(started&&engine.host.game.state!=='over'){startMatch();say('NEW ARENA · MATCH RESTARTED',2.5);}
  return true;
}
function press(id,source){
  flashes.set(id,performance.now()+220);clickSound(id==='primary');menuDirty=true;
  if(id.startsWith('arena:')){if(usingEngine())chooseArena(+id.slice(6));save();menuDirty=true;haptic(source,.35,20);return;}
  const action=applyButton(options,id);
  if(action==='primary'){const over=usingEngine()?engine.host.game.state==='over':!!state.winner;if(!started||over)startMatch();else{menuOpen=false;}}
  else if(action==='restart')startMatch();
  else if(action==='lower'||action==='raise'){options.height=stepHeight(tableHeight,action==='raise'?1:-1);applyHeight(options.height);}
  else if(action==='height'){applyHeight(autoTableHeight(eyeY));}
  else if(action==='match'){calibrating={until:performance.now()+3000,t:3};say('HOLD YOUR PADDLE HAND WHERE THE TABLE SHOULD BE',3.2);}
  else if(action==='difficulty'){opponent.level=options.difficulty;if(usingEngine())engine.host.setDifficulty(options.difficulty);}
  else if(action==='hand'){handSelect.value=options.hand;placeTab();}
  else if(action==='sound'){if(usingEngine())engine.host.setMuted(!options.sound);if(options.sound)unlockSound();else audio?.suspend?.().catch(()=>{});}
  else if(action==='exit'){renderer.xr.getSession()?.end().catch(()=>{});}
  save();menuDirty=true;haptic(source,.35,20);
}
const lastSelect=new Map();
// One entry for every detector (our pinch check, the browser's select event, a trigger).
function selectFrom(source,id){
  const key=source?.handedness||('id'+id);
  if(!acceptSelect(lastSelect,key,performance.now()))return;
  handleSelect(id,source);
}
function handleSelect(id,source){
  unlockSound();
  if(intro){skipIntro();return;}
  if(calibrating)return;
  const h=hover.get(id);
  if(h?.kind==='tab'){openMenu();return;}
  if(h?.kind==='menu'){if(h.button)press(h.button.id,source);return;}
  if(menuOpen)return; // pinched beside the panel: ignore
  // Mid-match, a pinch or trigger on your FREE hand opens the menu; the paddle
  // hand's pinch is ignored so gripping the paddle can't pause the game.
  if(!isPaddleHand(source)||!playing)openMenu();
}

// ---- Input -----------------------------------------------------------------
const lasers=[];
for(let i=0;i<2;i++){
  const controller=renderer.xr.getController(i);scene.add(controller);
  const laser=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(0,0,-1)]),new THREE.LineBasicMaterial({color:0x36eeee}));laser.visible=false;controller.add(laser);
  const dot=new THREE.Mesh(new THREE.SphereGeometry(.008,10,8),new THREE.MeshBasicMaterial({color:0xff3195}));dot.visible=false;scene.add(dot);
  lasers.push({controller,laser,dot});
  const grip=renderer.xr.getControllerGrip(i),gripMesh=mesh(new THREE.CapsuleGeometry(.025,.11,6,12),0x9eecff,0x1685a0);gripMesh.rotation.x=Math.PI/2;gripMesh.visible=false;grip.add(gripMesh);scene.add(grip);
  controller.addEventListener('connected',e=>{sources.set(i,e.data);gripMesh.visible=!e.data.hand&&!!e.data.gripSpace;lastLabel='';});
  controller.addEventListener('disconnected',()=>{sources.delete(i);gripMesh.visible=false;hover.delete(i);});
  controller.addEventListener('selectstart',()=>{const s=sources.get(i);if(s?.hand)return;haptic(s,.4,25);selectFrom(s,i);});
}
enter.onclick=async()=>{
  enter.disabled=true;unlockSound();let session;
  try{session=await navigator.xr.requestSession('immersive-vr',{requiredFeatures:['local-floor'],optionalFeatures:['hand-tracking']});
    desktop=false;playing=false;started=false;state=initial();intro=true;menuOpen=false;introT=0;table.visible=false;autoPending=options.height==='auto';document.body.classList.add('in-vr');
    resetInputState();calibrating=null;notice='';noticeT=0;
    if(engine.state==='ready'&&engine.host){let dead=false;try{dead=!engine.frame?.contentWindow||!engine.host.game;}catch{dead=true;}if(dead)recoverEngine('frame gone');}
    session.addEventListener('visibilitychange',()=>onSessionVisibility(session));
    session.addEventListener('inputsourceschange',()=>{pokes.clear();pinches.clear();buttonsDown.clear();hover.clear();lastSelect.clear();menuDirty=true;});
    session.addEventListener('end',()=>{playing=false;menuOpen=false;calibrating=null;resetInputState();if(usingEngine())engine.host.pause();audio?.suspend?.().catch(()=>{});document.body.classList.remove('in-vr');enter.disabled=false;enter.textContent='Enter VR';status.textContent='VR ended. Enter again or return to the phone game.';});
    await renderer.xr.setSession(session);enter.textContent='In VR';
  }catch(e){await session?.end().catch(()=>{});status.textContent='VR could not start: '+e.message;enter.disabled=false;}
};
document.querySelector('#preview').onclick=()=>{desktop=true;unlockSound();startMatch();};

// Desktop: the mouse plays and clicks the menu; M or Esc opens it.
const ray=new THREE.Raycaster(),pointer=new THREE.Vector2(),hit=new THREE.Vector3();
function pointAt(id,origin,dir){
  ray.set(origin,dir);
  if(menuOpen){const [m]=ray.intersectObject(menu.mesh);if(m){const button=hitButton(buttons,m.uv.x*MENU_W,(1-m.uv.y)*MENU_H,HIT_SLOP);hover.set(id,{kind:'menu',button});return m.distance;}}
  else if(tab.mesh.visible){const [t]=ray.intersectObject(tab.mesh);if(t){hover.set(id,{kind:'tab'});return t.distance;}}
  hover.delete(id);return 0;
}
renderer.domElement.addEventListener('pointermove',e=>{if(renderer.xr.isPresenting)return;pointer.set(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2);ray.setFromCamera(pointer,camera);
  pointAt('mouse',ray.ray.origin.clone(),ray.ray.direction.clone());
  if(!menuOpen&&ray.ray.intersectPlane(plane,hit)){table.worldToLocal(hit);target={x:hit.x+.5,y:hit.z+.9};}});
renderer.domElement.addEventListener('click',()=>{if(!renderer.xr.isPresenting&&desktop)selectFrom(null,'mouse');});
addEventListener('keydown',e=>{if(renderer.xr.isPresenting||!desktop)return;if(e.key==='m'||e.key==='M'||e.key==='Escape'){if(menuOpen&&started&&!(usingEngine()?engine.host.game.state==='over':state.winner))menuOpen=false;else openMenu();menuDirty=true;}});

const local=new THREE.Vector3(),listenerPos=new THREE.Vector3(),forward=new THREE.Vector3(),up=new THREE.Vector3(),tmp=new THREE.Vector3(),tmp2=new THREE.Vector3(),dir=new THREE.Vector3(),fp={x:0,z:0},fu={u:.5,v:0};
function setTarget(world){local.copy(world);table.worldToLocal(local);target={x:local.x+.5,y:local.z+.9};}
function jointPos(frame,hand,name,ref,out){const s=hand.get(name),p=s&&frame.getJointPose(s,ref);if(!p)return null;return out.set(p.transform.position.x,p.transform.position.y,p.transform.position.z);}
// The paddle sits under the middle of your palm, like holding a real mallet.
function palm(frame,hand,ref,out){const w=jointPos(frame,hand,'wrist',ref,tmp2),k=w&&jointPos(frame,hand,'middle-finger-phalanx-proximal',ref,out);return k?out.add(w).multiplyScalar(.5):null;}

// Feeds the real hand position to the engine, 1 m = 1 field unit across. No smoothing: the engine's own
// paddle follow (the same one a fingertip gets on the phone) turns target movement into paddle velocity,
// so a fast swing is a SMASH exactly as on the phone. The frame's movement is spread over up to twelve
// engine steps so the velocity it sees is the hand's real speed rather than one jump per frame (a slow frame of up to 0.1 s
// is stepped in 8 ms pieces, so a headset that drops frames still feeds true speed).
const hitLog=[];
const prevT={x:.5,y:1.6};let needSync=true,freeze=false,lastEngineT=-1,stallT=0,lastAudioKick=0;
// Touch-press: a fingertip or controller tip that crosses the menu panel (or the MENU tab) from the front presses whatever is under it, once per push.
function pokeAt(key,tip,source){
  let poke=pokes.get(key);if(!poke){poke={armed:false};pokes.set(key,poke);}
  const panel=calibrating?null:menuOpen?menu.mesh:tab.mesh.visible?tab.mesh:null; // no presses while the hand is held still for MATCH MY HAND
  if(!tip||!panel){poke.armed=false;return;}
  const lp=panel.worldToLocal(tip.clone()),w=panel===menu.mesh?PANEL_W:TAB_W,hh=panel===menu.mesh?PANEL_H:TAB_H,inside=Math.abs(lp.x)<w/2+.02&&Math.abs(lp.y)<hh/2+.02;
  if(updatePoke(poke,inside?lp.z:NaN)){unlockSound();if(panel===tab.mesh)openMenu();else{const b=hitButton(buttons,(lp.x/w+.5)*MENU_W,(.5-lp.y/hh)*MENU_H,HIT_SLOP);if(b)press(b.id,source);}}
}
let hitches=0;
function driveEngine(dt,feed,snap){
  const eng=engine.host;
  try{
    if(feed){
      if(snap){hitches++;prevT.x=target.x;prevT.y=target.y;inputToField(target.x,target.y,eng.view.L,fu);eng.snapPaddle(fu.u,fu.v);eng.setTarget(fu.u,fu.v);needSync=false;eng.step(Math.min(dt,.02));engine.errors=0;return;}
      if(needSync){prevT.x=target.x;prevT.y=target.y;needSync=false;}
      const n=Math.max(1,Math.min(30,Math.ceil(dt*120)));
      for(let k=1;k<=n;k++){const a=k/n;inputToField(prevT.x+(target.x-prevT.x)*a,prevT.y+(target.y-prevT.y)*a,eng.view.L,fu);eng.setTarget(fu.u,fu.v);eng.step(dt/n);}
      prevT.x=target.x;prevT.y=target.y;
    }else{needSync=true;eng.step(dt);}
    engine.errors=0;
  }catch(e){engine.errors=(engine.errors||0)+1;if(engine.errors>=3)recoverEngine(String(e&&e.message||e));}
}
function hiddenNow(){const se=renderer.xr.getSession();return se?se.visibilityState!=='visible':document.hidden;}
// Anything outside the game (system menu, Meta button, another tab) leaves it paused in the menu with stale input cleared.
function resetInputState(){hover.clear();pokes.clear();pinches.clear();buttonsDown.clear();lastSelect.clear();flashes.clear();lastHoverKey='';needSync=true;lostT=0;last=0;for(const hv of handVisuals.values())hv.visible=false;menuDirty=true;}
function onSessionVisibility(se){
  if(se.visibilityState!=='visible'){if(started&&!intro){menuOpen=true;}if(usingEngine())engine.host.pause();resetInputState();menuDirty=true;}
  else{resetInputState();unlockSound();audio?.resume?.().catch(()=>{});lastLabel='';if(started)say('WELCOME BACK · PRESS RESUME',3);}
}
// ---- Drawing the engine's state -----------------------------------------------
const colorCache=new Map(),tmpColor=new THREE.Color();
function glowTint(m,hex,a){m.material.color.set(hex);m.material.opacity=a;}
function syncEngine(dt,t){
  const h=engine.host;if(!h)return;
  const g=h.game,L=h.view.L,beat=g.beat||0;
  // paddles
  for(let i=0;i<2;i++){const pd=g.paddles[i],m=paddles[i];if(!pd){m.visible=false;continue;}m.visible=true;
    fieldToTable(pd.u,pd.v,L,fp);m.position.set(fp.x,0,fp.z);const k=pd.r/.085,p=1+(pd.punch||0)*.12;m.scale.set(k*p,1,k*p);
    const big=pd.r>.1;m.userData.base.material.emissiveIntensity=big?1.6:1;
    const fire=g.fire[i]>0?Math.min(1,g.fire[i]*2):0,fd=fireDiscs[i];fd.visible=fire>0;
    if(fire>0){fd.position.set(fp.x,.02,fp.z);const f=.8+.25*Math.sin(t*14+i)+(g.fire[i]>6.5?.4:0);fd.scale.setScalar(f*(.8+pd.r*2));fd.material.opacity=.55*fire;}}
  // pucks
  const np=Math.min(MAX_PUCKS,g.pucks.length);
  for(let i=0;i<MAX_PUCKS;i++){const m=pucks[i];if(i>=np){m.visible=false;continue;}const pk=g.pucks[i];m.visible=true;
    fieldToTable(pk.u,pk.v,L,fp);m.position.set(fp.x,0,fp.z);m.scale.set(pk.r/.042,1,pk.r/.042);
    const body=m.userData.body,hot=pk.smashT>0,env=g.env,uv=env&&env.type==='UV'&&env.t>0&&(env.who===1?pk.v<L/2:pk.v>L/2);
    const col=hot?h.COL.gold:pk.last===1?h.COL.p1:pk.last===2?h.COL.p2:'#ffffff';
    body.material.color.set(col);body.material.emissive.set(col).multiplyScalar(hot?.9:.35);body.material.transparent=uv;body.material.opacity=uv?.15:1;
    m.userData.halo.material.opacity=hot?Math.min(1,pk.smashT/.3)*.9:env&&env.type==='LAVA'&&pk.last===env.who&&env.t>0?.6:0;m.userData.halo.material.color.set(hot?h.COL.gold:h.COL.orange);}
  // bumpers on the crease
  for(let i=0;i<2;i++){const b=g.bumpers[i],m=bumpers[i];if(!b){m.visible=false;continue;}m.visible=true;
    fieldToTable(b.u,b.v,L,fp);m.position.set(fp.x,0,fp.z);const on=h.bumperActive(b),col=b.u<.5?h.COL.p1:h.COL.p2,s=1+Math.max(0,b.punch)*.35+b.flash*.15;m.scale.set(s,1,s);
    const mat=m.userData.m.material;mat.color.set(col);mat.emissive.set(col).multiplyScalar(.25+b.flash*.7+beat*.15);mat.transparent=true;mat.opacity=on?1:.22;
    m.userData.ring.material.opacity=on?.9:.35;m.userData.ring.material.color.set(b.flash>.2?'#ffffff':col);}
  // goal walls
  for(let i=0;i<2;i++){const s=g.shields[i],m=shields[i];if(s<=0){m.visible=false;continue;}m.visible=true;m.position.set(0,.045,i===0?.89:-.89);
    m.material.opacity=(s<1.5&&Math.sin(t*30)<=0)?.2:.75;}
  // power-up pick-up
  const pu=g.pups[0];
  if(pu&&!pu.dead){const st=pickupStyle(pu.type),u=pickup.userData;pickup.visible=true;fieldToTable(pu.u,pu.v,L,fp);const bob=1+.08*Math.sin(t*6),fade=pu.life<2?(Math.sin(t*20)>0?1:.35):1;
    pickup.position.set(fp.x,0,fp.z);pickup.scale.set(bob,1,bob);u.ring.rotation.z=t*2;
    for(const k of ['disc','ring','beam'])u[k].material.color.set(st.colour);u.disc.material.opacity=.35*fade;u.ring.material.opacity=fade;u.beam.material.opacity=.2*fade;
    u.glyph.material.map=glyphTex[st.glyph];u.glyph.material.color.set(st.colour);u.glyph.position.y=.05+.012*Math.sin(t*3);}
  else pickup.visible=false;
  // arena power orb and the glow of an active power
  const eo=g.envOrb,col=h.stageColors(h.stage).grid;
  if(eo){envOrb.visible=true;fieldToTable(eo.u,eo.v,L,fp);envOrb.position.set(fp.x,0,fp.z);const bob=1+.1*Math.sin(t*5),fade=eo.life<2?(Math.sin(t*20)>0?1:.35):1,u=envOrb.userData;
    u.core.scale.setScalar(bob);u.core.rotation.y=t*2;u.ring.rotation.set(t*1.3,t*.9,0);u.core.material.color.set(col);u.core.material.opacity=.85*fade;u.ring.material.color.set(col);u.ring.material.opacity=fade;
    u.label.mesh.rotation.y=0;if(u.name!==eo.name){u.name=eo.name;const c=u.label.ctx;c.clearRect(0,0,512,96);c.font='bold 46px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillStyle='#100821d0';roundRect(c,10,10,492,76,24);c.fill();c.fillStyle='#ffffff';c.fillText(eo.name,256,50);u.label.texture.needsUpdate=true;}
    u.label.mesh.lookAt(camera.getWorldPosition(tmp));}
  else envOrb.visible=false;
  const e=g.env;
  if(e&&e.t>0){const victim=envVictim(e,L);envTint.visible=true;envTint.position.z=victim===1?.45:-.45;glowTint(envTint,col,.12+.06*Math.sin(t*6));}else envTint.visible=false;
  // beat: the crease and centrepiece pulse with the music
  creaseLine.material.emissiveIntensity=.7+beat*1.8;orb.scale.setScalar(1+beat*.08);
}
// Old simple game drawn with the same meshes.
function syncSimple(){
  for(let i=0;i<2;i++){const p=state.paddles[i];paddles[i].visible=true;paddles[i].position.set(p.x-.5,0,p.y-.9);paddles[i].scale.set(1,1,1);fireDiscs[i].visible=false;}
  pucks[0].visible=true;pucks[0].position.set(state.puck.x-.5,0,state.puck.y-.9);pucks[0].scale.set(1,1,1);for(let i=1;i<MAX_PUCKS;i++)pucks[i].visible=false;
  for(const b of bumpers)b.visible=false;for(const s of shields)s.visible=false;pickup.visible=false;envOrb.visible=false;envTint.visible=false;
}

renderer.setAnimationLoop((now,frame)=>{
  const gap=(now-last)/1000,okGap=!!last&&gap>0&&gap<.25,dt=okGap?gap:1/72,t=now/1000;last=now;let tracked=desktop,paddleY=NaN;
  const session=renderer.xr.getSession();
  if(frame&&session){
    tracked=false;const ref=renderer.xr.getReferenceSpace(),inputs=[...session.inputSources];
    const vp=frame.getViewerPose(ref);if(vp){eyeY=vp.transform.position.y;if(autoPending&&eyeY>.6){autoPending=false;applyHeight(autoTableHeight(eyeY));}}
    // Paddle hand: tracked hand first (no controller needed), then controller.
    const src=inputs.find(s=>s.handedness===options.hand&&(s.hand||s.gripSpace));
    if(src?.hand&&session.visibilityState==='visible'){if(palm(frame,src.hand,ref,tmp)){paddleY=tmp.y;setTarget(tmp);tracked=true;}}
    else if(src?.gripSpace&&session.visibilityState==='visible'){const pose=frame.getPose(src.gripSpace,ref);if(pose){tmp.set(pose.transform.position.x,pose.transform.position.y,pose.transform.position.z);paddleY=tmp.y;setTarget(tmp);tracked=true;}}
    // Last resort, only when the headset sees no hands and no controllers at
    // all: steer with your gaze.
    if(!tracked&&!inputs.some(s=>s.hand||s.gripSpace)&&vp){const v=vp.views[0],m=new THREE.Matrix4().fromArray(v.transform.matrix);tmp.setFromMatrixPosition(m);dir.set(0,0,-1).applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(m)).normalize();if(new THREE.Ray(tmp,dir).intersectPlane(plane,hit)){setTarget(hit);tracked=true;}}
    for(const hv of handVisuals.values())hv.visible=false;
    for(const s of inputs){
      if(s.hand){let hv=handVisuals.get(s.handedness);if(!hv){hv=makeHandVisual();handVisuals.set(s.handedness,hv);}hv.visible=true;for(let j=0;j<jointNames.length;j++)if(jointPos(frame,s.hand,jointNames[j],ref,tmp2))hv.children[j].position.copy(tmp2);
        // Touch the menu or the MENU tab with your index fingertip.
        pokeAt(s.handedness,jointPos(frame,s.hand,'index-finger-tip',ref,tmp2),s);
        // Our own pinch detector, so a pinch always registers (the browser's select event is a second, de-duplicated source).
        let pn=pinches.get(s.handedness);if(!pn){pn={down:false};pinches.set(s.handedness,pn);}
        const ta=jointPos(frame,s.hand,'thumb-tip',ref,pinchA),tb=jointPos(frame,s.hand,'index-finger-tip',ref,pinchB);
        if(ta&&tb&&updatePinch(pn,ta.distanceTo(tb))==='start'&&session.visibilityState==='visible'){
          const idx=[...sources.entries()].find(([,v])=>v===s||v.handedness===s.handedness);selectFrom(s,idx?idx[0]:s.handedness);}
      }
      // Controllers can also press buttons by touching them with the tip (the front of the controller).
      if(!s.hand&&s.targetRaySpace){const tp=frame.getPose(s.targetRaySpace,ref);pokeAt(s.handedness+'-controller',tp?tmp2.set(tp.transform.position.x,tp.transform.position.y,tp.transform.position.z):null,s);}
      // Controller A/B/X/Y opens or closes the menu.
      const pad=s.gamepad;if(pad){const pressed=!!(pad.buttons[4]?.pressed||pad.buttons[5]?.pressed),was=buttonsDown.get(s)||false;buttonsDown.set(s,pressed);
        if(pressed&&!was){if(intro)skipIntro();else if(menuOpen&&started&&!(usingEngine()?engine.host.game.state==='over':state.winner)){menuOpen=false;menuDirty=true;}else openMenu();}}
    }
    // Pointer rays for the menu: controllers aim, tracked hands aim with a pinch ray.
    for(let i=0;i<lasers.length;i++){const L=lasers[i],s=sources.get(i);
      if(!s||(!menuOpen&&!tab.mesh.visible)){L.laser.visible=false;L.dot.visible=false;hover.delete(i);continue;}
      L.controller.getWorldPosition(tmp);dir.set(0,0,-1).applyQuaternion(L.controller.getWorldQuaternion(new THREE.Quaternion()));
      const d=pointAt(i,tmp.clone(),dir.clone());L.laser.visible=menuOpen||d>0;L.laser.scale.z=d||.35;L.dot.visible=d>0;if(d>0)L.dot.position.copy(tmp).addScaledVector(dir,d);
    }
  }
  if(calibrating){calibrating.t=Math.max(0,(calibrating.until-performance.now())/1000);if(calibrating.t<=0){calibrating=null;if(Number.isFinite(paddleY)){options.height=heightFromHand(paddleY);applyHeight(options.height);save();say('TABLE SET TO '+Math.round(tableHeight*100)+' CM');}else say('NO PADDLE HAND SEEN. TRY AGAIN');menuDirty=true;}}
  if(noticeT>0){noticeT-=dt;if(noticeT<=0){notice='';lastLabel='';}}
  if(intro){introT+=dt;if(introT>4.8)skipIntro();}
  tab.mesh.visible=!!session&&!intro&&!menuOpen&&playing;menu.mesh.visible=menuOpen&&!intro;
  const hoverKey=[...hover.values()].map(h=>h.kind+(h.button?.id||'')).join();if(hoverKey!==lastHoverKey){lastHoverKey=hoverKey;menuDirty=true;}
  const eng=usingEngine()?engine.host:null,g=eng?eng.game:null;
  // The engine is paused whenever the menu is open or the paddle hand is gone for a moment.
  lostT=tracked?0:lostT+dt;
  let over=false;
  if(eng){
    over=g.state==='over';
    if(started){
      const wantPause=menuOpen||(lostT>.4&&playing)||hiddenNow();
      if(wantPause)eng.pause();else eng.resume();
      if(!freeze)driveEngine(dt,playing&&!wantPause&&tracked,!okGap&&gap>0);
      if(!wantPause&&!freeze&&(g.state==='play'||g.state==='countdown')){if(g.t===lastEngineT)stallT+=dt;else{stallT=0;lastEngineT=g.t;}if(stallT>1.5){stallT=0;recoverEngine('stalled');}}else stallT=0;
      const ev=detectEvents(evState,g);
      if(!ev.reset&&(ev.hit||ev.smash)){const pd=g.paddles[0],sp=pd?Math.hypot(pd.vu,pd.vv):0;hitLog.push({type:ev.smash?'smash':'hit',player:0,strength:ev.smash?1:Math.min(1,1.7*sp/3),at:performance.now()}); // the engine's own k = impulse/3, impulse ~ 1.7 x paddle speed
      if(hitLog.length>60)hitLog.shift();}
      if(!ev.reset){
        if(ev.hit)haptic(paddleSource(),ev.smash?.9:.65,ev.smash?70:45);
        else if(ev.smash)haptic(paddleSource(),.9,70);
        if(ev.bump)haptic(paddleSource(),.25,18);
        if(ev.goalFor)haptic(paddleSource(),ev.goalFor===1?.8:.5,ev.goalFor===1?120:80);
      }
      if(over&&!menuOpen){menuOpen=true;menuDirty=true;}
    }
    if(started&&usingEngine())syncEngine(dt,t);else if(!started){for(const m of pucks)m.visible=false;}
  }else if(started&&engine.state==='failed'){
    over=!!state.winner;
    if(playing&&!menuOpen&&tracked&&!hiddenNow()){followHand(smoothTarget,target,dt);acc+=dt;while(acc>=1/60){
      move(state,0,smoothTarget.x,smoothTarget.y);const ai=opponentMove(state,opponent,1/60);move(state,1,ai.x,ai.y);
      const score=state.score.join();step(state);
      if(state.score.join()!==score)haptic(paddleSource(),.8,50);if(state.winner){menuOpen=true;menuDirty=true;}acc-=1/60;
    }}else acc=0;
    syncSimple();
  }else{for(const m of paddles)m.visible=true;}
  if(!started){const rest=[[.5,1.6],[.5,.2]];paddles.forEach((m,i)=>{m.position.set(rest[i][0]-.5,0,rest[i][1]-.9);m.scale.set(1,1,1);});}
  if(menuDirty&&menu.mesh.visible)buttons=drawMenu();
  orb.rotation.y+=dt*.65;halo.rotation.z+=dt*.4;
  // Scoreboard: score, the engine's own message, and the active arena power.
  const score=eng?g.score:state.score;
  let label,sub;
  const away=!!session&&session.visibilityState!=='visible';
  if(away)label='QUEST MENU IS OPEN';
  else if(notice)label=notice+(calibrating?'  '+Math.ceil(calibrating.t):'');
  else if(intro)label='BUILT FOR THE FOLD   ·   prodbyKCTW';
  else if(menuOpen&&!over)label=started?'PAUSED':'PICK PLAY TO START';
  else if(!playing)label='OPEN THE MENU TO PLAY';
  else if(!tracked&&started&&lostT>.4)label='TRACKING PAUSED — SHOW YOUR PADDLE HAND';
  else if(eng){label=boardLabel(g)||'FIRST TO 7';if(g.state==='paused'&&!menuOpen)label='FIRST TO 7';}
  else label=over?(state.winner===1?'YOU WIN':'CPU WINS'):'FIRST TO 7';
  if(over&&!notice)label=(eng?g.winner:state.winner)===1?'YOU WIN':'CPU WINS';
  sub=away?'CLOSE IT (QUEST BUTTON) TO KEEP PLAYING':intro?'PINCH OR TRIGGER TO SKIP':menuOpen?'TOUCH A BUTTON · OR POINT AND PINCH':(eng&&powerLine(g))||(desktop&&!renderer.xr.isPresenting?'MOUSE TO PLAY · M FOR MENU':'FREE-HAND PINCH OR MENU TAB FOR OPTIONS');
  const text=(intro?'INTRO':started?score.join(' : '):'MENU')+' / '+label+' / '+sub;
  if(text!==lastLabel){lastLabel=text;const c=board.ctx;c.fillStyle='#100821';c.fillRect(0,0,1024,256);c.textAlign='center';c.textBaseline='alphabetic';const pulse=intro?1+.05*Math.sin(introT*5):1;c.save();c.translate(512,95);c.scale(pulse,pulse);c.fillStyle=intro?'#ff3195':'#36eeee';c.font='bold 70px sans-serif';
    if(window.CreaseLogo){const LG=window.CreaseLogo,lh=58,lw=LG.width(lh);if(!started)LG.draw(c,-lw/2,-lh,lh);else{const sc=score.join(' : '),sw=c.measureText(sc).width,gap=40,tot=lw+gap+sw;LG.draw(c,-tot/2,-lh,lh);c.textAlign='left';c.fillText(sc,-tot/2+lw+gap,0);c.textAlign='center';}}
    else c.fillText(started?'CREASE   '+score.join(' : '):'CREASE',0,0);
    c.restore();c.fillStyle='#fff';c.font=label.length>34?'bold 24px sans-serif':'bold 30px sans-serif';c.fillText(label,512,174);c.fillStyle=eng&&g.env&&g.env.t>0?'#ffd15f':'#ff3195';c.font='18px sans-serif';c.fillText(sub,512,220);board.texture.needsUpdate=true;status.textContent=label;}
  if(audio){const cam=renderer.xr.isPresenting?renderer.xr.getCamera():camera;cam.getWorldPosition(listenerPos);forward.set(0,0,-1).applyQuaternion(cam.quaternion);up.set(0,1,0).applyQuaternion(cam.quaternion);if(audio.listener.positionX){audio.listener.positionX.value=listenerPos.x;audio.listener.positionY.value=listenerPos.y;audio.listener.positionZ.value=listenerPos.z;audio.listener.forwardX.value=forward.x;audio.listener.forwardY.value=forward.y;audio.listener.forwardZ.value=forward.z;audio.listener.upX.value=up.x;audio.listener.upY.value=up.y;audio.listener.upZ.value=up.z;}}
  // An AudioContext the system suspended (call, system menu) is woken again; one that was closed is replaced.
  if(audio&&options.sound&&started&&(renderer.xr.isPresenting||desktop)&&!hiddenNow()&&audio.state!=='running'&&now-lastAudioKick>1000){lastAudioKick=now;
    if(audio.state==='closed'){audio=new AudioContext();if(usingEngine())engine.host.setAudio(audio);}audio.resume().catch(()=>{});}
  renderer.render(scene,camera);
});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
document.addEventListener('visibilitychange',()=>{if(renderer.xr.isPresenting)return;if(document.hidden){if(started&&playing&&!intro){menuOpen=true;menuDirty=true;}}else{last=0;needSync=true;audio?.resume?.().catch(()=>{});}});
loadEngine();
// Old-style view of the engine match for tests and tools: table units (x across [0,1], y along [0,1.8]);
// the puck fields and `countdown` can be written, which moves the engine's own puck / starts play.
let compat=null;
function engineCompat(){
  if(compat&&compat.host===engine.host)return compat.obj;
  const h=engine.host,g=h.game,L=()=>h.view.L,k=()=>1.8/L();
  const pk=()=>g.pucks[0]||{u:.5,v:.9,vu:0,vv:0,smashT:0};
  const pd=i=>({get x(){return g.paddles[i].u;},get y(){return g.paddles[i].v*k();}});
  const obj={get score(){return g.score;},get winner(){return g.winner;},paddles:[pd(0),pd(1)],
    get countdown(){return g.state==='countdown'?g.timer:0;},set countdown(v){if(v<=0&&(g.state==='countdown'||g.state==='goal'&&g.pucks.length)){g.state='play';g.timer=0;}},
    puck:{get x(){return pk().u;},set x(v){pk().u=v;},get y(){return pk().v*k();},set y(v){pk().v=v/k();},get vx(){return pk().vu;},set vx(v){pk().vu=v;},get vy(){return pk().vv*k();},set vy(v){pk().vv=v/k();},get smashT(){return pk().smashT;},set smashT(v){pk().smashT=v;}}};
  compat={host:h,obj};return obj;
}
// Test hook (local server or ?qa=1 only), same convention as the phone game.
if(/^(localhost|127\.0\.0\.1)$/.test(location.hostname)||new URLSearchParams(location.search).has('qa'))window.__creaseVR={options,get session(){return renderer.xr.getSession();},get freeze(){return freeze;},set freeze(v){freeze=!!v;},get recoveries(){return engine.recoveries||0;},get stalled(){return stallT;},
  // Drives the engine exactly like a frame would, with the hand at table coordinates (x,y): used to test swing speed.
  feed(x,y,dt){target.x=x;target.y=y;driveEngine(dt,true);},
  resetFeed(x,y){target.x=x;target.y=y;prevT.x=x;prevT.y=y;needSync=false;},
  // Table-unit view of the match (x across [0,1], y along [0,1.8]) whichever game is running.
  get hitLog(){return hitLog;},get hitches(){return hitches;},
  get state(){return usingEngine()?engineCompat():state;},
  get engine(){return engine.host;},get engineState(){return engine.state;},get arenaList(){return arenaList;},get arenaIx(){return arenaIx;},
  get audio(){return audio;},get backdrop(){return {visible:backdrop.visible,map:!!backdrop.material.map,id:backdropFor};},
  get visible(){return {pucks:pucks.filter(p=>p.visible).length,pickup:pickup.visible,envOrb:envOrb.visible,shields:shields.filter(s=>s.visible).length,bumpers:bumpers.filter(b=>b.visible).length};},
  get tableHeight(){return tableHeight;},get menuOpen(){return menuOpen;},get playing(){return playing;},get intro(){return intro;},get target(){return target;},startMatch,press,handleSelect,hover,
  menuPoint(id){const b=buttons.find(x=>x.id===id);if(!b)return null;menu.mesh.updateMatrixWorld();const p=menu.mesh.localToWorld(new THREE.Vector3(((b.x+b.w/2)/MENU_W-.5)*PANEL_W,(.5-(b.y+b.h/2)/MENU_H)*PANEL_H,0));const n=new THREE.Vector3(0,0,1).transformDirection(menu.mesh.matrixWorld);return {p:{x:p.x,y:p.y,z:p.z},n:{x:n.x,y:n.y,z:n.z}};}};
try{const supported=await navigator.xr?.isSessionSupported('immersive-vr');enter.disabled=!supported;enter.textContent=supported?'Enter VR':'Open in Quest Browser';}catch{enter.textContent='VR unavailable';}
