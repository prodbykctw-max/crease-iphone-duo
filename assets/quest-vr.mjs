import * as THREE from './vendor/three.module.min.js';
import {initial,move,step} from '../backend/online/physics.mjs';
import {followHand,createOpponent,opponentMove} from './quest-controls.mjs';
import {updatePinch,acceptSelect,SLOP as HIT_SLOP,loadOptions,saveOptions,autoTableHeight,heightFromHand,stepHeight,clampHeight,updatePoke,MENU_W,MENU_H,menuButtons,hitButton,applyButton,TABLE_DEFAULT} from './quest-options.mjs';
import {ease,introFrame,introBeats,INTRO_END,victoryFrame,popFrame,ringFrame,barCells,shakeOffset,unlockLine,paddleLook} from './quest-juice.mjs';
import {fieldToTable,inputToField,fieldToInput,pickupStyle,envVictim,boardLabel,powerLine,detectEvents,newEventState,usableArena,backdropSize} from './quest-engine.mjs';
import {createLook} from './quest-look.mjs';
import {XR_SCALE,FOVEATION,newQuality,qualityStep,paddleRingColour,JOINT_NAMES} from './quest-look-pure.mjs';

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
    applyArena(arenaIx);applyLook();menuDirty=true;lastLabel='';
    if(pendingStart){pendingStart=false;startMatch();}
  }else{
    say('FULL GAME ENGINE UNAVAILABLE · PLAYING THE SIMPLE VERSION',5);menuDirty=true;
    if(pendingStart){pendingStart=false;startMatch();}
  }
}
const usingEngine=()=>engine.state==='ready';

const scene=new THREE.Scene();scene.background=new THREE.Color('#080514');scene.fog=new THREE.Fog('#080514',5,15);
const camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.01,40);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.xr.enabled=true;renderer.xr.setReferenceSpaceType('local-floor');renderer.xr.setFoveation(FOVEATION);renderer.xr.setFramebufferScaleFactor(XR_SCALE);document.body.append(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xc7bbff,0x170924,1.1));
const light=new THREE.DirectionalLight(0xffffff,1.6);light.position.set(-2,4,1);scene.add(light);

// local-floor is measured from the Quest floor. The table top sits at
// tableHeight (auto-fitted to the player, or set in the options menu).
const table=new THREE.Group();table.position.set(0,TABLE_DEFAULT,-1.25);scene.add(table);
function mesh(geometry,color,emissive=0){return new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,emissive,roughness:.32,metalness:.55}));}
function glowMat(color,opacity=1){return new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending});}
// The table, rails, legs, paddles, pucks, bumpers, hands and controllers live in quest-look.mjs. The table top is a texture the phone
// engine draws itself (host.renderField); the pieces are 3D bodies capped with the phone's own paddle and puck art (host.pieceArt).
// Text canvases are drawn at CANVAS_SCALE x their layout size so lettering stays crisp in the headset; all drawing code keeps using the
// layout coordinates (the context carries the scale), so button positions and hit-testing are unchanged.
const CANVAS_SCALE=2,ANISO=Math.min(8,renderer.capabilities.getMaxAnisotropy());
const puckArt=new Map(); // puck tint -> the phone's puck art canvas for it
const lk=createLook({scene,table,renderer});
const legs=lk.legs,paddles=lk.paddles,pucks=lk.pucks,bumpers=lk.bumpers,MAX_PUCKS=pucks.length;
let grid=new THREE.GridHelper(16,32,0x842e8f,0x271438);grid.position.y=-.01;scene.add(grid);
// Power-up pick-up: the phone's flat ring, glow and glyph are in the table texture; a faint light beam rising from it shows it from across the room.
const pickup=(()=>{const g=new THREE.Group();
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,.22,24,1,true),glowMat(0xffffff,.18));beam.position.y=.12;g.add(beam);
  g.userData={beam};g.visible=false;table.add(g);return g;})();
// Arena power orb on the crease: the orb itself is in the texture; its name floats above it.
const envOrb=(()=>{const g=new THREE.Group();
  const label=canvasPlane(512,96,.34,.064);label.mesh.position.set(0,.2,0);g.add(label.mesh);
  g.userData={label,name:''};g.visible=false;table.add(g);return g;})();
// Arena backdrop: the arena's own artwork on a curved panel around the far end of the room.
const backdrop=new THREE.Mesh(new THREE.CylinderGeometry(5.5,5.5,5.2,48,1,true,0,1),new THREE.MeshBasicMaterial({color:0xcccccc,side:THREE.BackSide,fog:false}));backdrop.visible=false;scene.add(backdrop);
const textures=new Map();const loader=new THREE.TextureLoader();
function plateTexture(id,cb){
  if(textures.has(id)){cb(textures.get(id));return;}
  loader.load('assets/arenas/'+id+'.webp',t=>{t.colorSpace=THREE.SRGBColorSpace;t.wrapS=THREE.RepeatWrapping;t.repeat.x=-1;t.offset.x=1;t.anisotropy=4;textures.set(id,t);while(textures.size>3){const k=textures.keys().next().value;textures.get(k).dispose();textures.delete(k);}cb(t);},undefined,()=>cb(null));
}
let backdropFor='';
let arenaCols=null;
function applyArena(i){
  const a=arenaList.find(x=>x.index===i);if(!a)return;const c=a.colors;
  lk.applyArena(c);arenaCols=c;refreshPaddleStyle();puckArt.clear();
  scene.remove(grid);grid.geometry.dispose();grid.material.dispose();grid=new THREE.GridHelper(16,32,new THREE.Color(c.grid).multiplyScalar(.7),new THREE.Color(c.grid).multiplyScalar(.2));grid.position.y=-.01;scene.add(grid);
  scene.background.set(c.base?.[0]||'#080514');scene.fog.color.set(c.base?.[0]||'#080514');
  backdropFor=a.id;
  plateTexture(a.id,t=>{if(backdropFor!==a.id)return;if(!t){backdrop.visible=false;return;}
    const img=t.image,sz=backdropSize(img.width/img.height);backdrop.geometry.dispose();backdrop.geometry=new THREE.CylinderGeometry(sz.radius,sz.radius,sz.height,48,1,true,Math.PI-sz.theta/2,sz.theta);
    backdrop.material.map=t;backdrop.material.needsUpdate=true;backdrop.visible=true;backdrop.userData.height=sz.height;placeBackdrop();});
  lastLabel='';menuDirty=true;
}
function placeBackdrop(){backdrop.position.set(0,.3+(backdrop.userData.height||5.2)/2,-.6);}

function canvasPlane(w,h,pw,ph,scale=CANVAS_SCALE){const c=document.createElement('canvas');c.width=w*scale;c.height=h*scale;const x=c.getContext('2d');x.scale(scale,scale);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=ANISO;
  const m=new THREE.Mesh(new THREE.PlaneGeometry(pw,ph),new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false}));m.renderOrder=5;return {canvas:c,ctx:x,texture:t,mesh:m};}
const board=canvasPlane(1024,256,1.3,.325);board.mesh.material.side=THREE.DoubleSide;scene.add(board.mesh);
// Options menu: a panel floating over your own half of the table, within
// arm's reach, so it can be touched with a fingertip or pointed at and pinched.
const PANEL_W=.72,PANEL_H=PANEL_W*MENU_H/MENU_W;
const menu=canvasPlane(MENU_W,MENU_H,PANEL_W,PANEL_H);menu.mesh.rotation.x=-.36;menu.mesh.visible=false;scene.add(menu.mesh);
// Small MENU tab beside the table on your free-hand side, shown during play.
const TAB_W=.2,TAB_H=.08;
const tab=canvasPlane(256,104,TAB_W,TAB_H);tab.mesh.visible=false;scene.add(tab.mesh);
(function drawTab(){const c=tab.ctx;c.clearRect(0,0,256,104);c.fillStyle='#100821e8';roundRect(c,4,4,248,96,22);c.fill();c.strokeStyle='#36eeee';c.lineWidth=4;c.stroke();c.fillStyle='#36eeee';c.font='bold 44px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('MENU',128,54);tab.texture.needsUpdate=true;})();

// ---- Juice: sparks, rings, floating text, race bars, table jolt ------------------------
// Everything below only DRAWS what the engine (or the intro) already computed: game.parts, game.rings, game.pops, game.board, game.shake.
const MAX_PARTS=160,partPos=new Float32Array(MAX_PARTS*3),partCol=new Float32Array(MAX_PARTS*3),partGeo=new THREE.BufferGeometry();
partGeo.setAttribute('position',new THREE.BufferAttribute(partPos,3));partGeo.setAttribute('color',new THREE.BufferAttribute(partCol,3));partGeo.setDrawRange(0,0);
const partPts=new THREE.Points(partGeo,new THREE.PointsMaterial({size:.022,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));partPts.frustumCulled=false;table.add(partPts);
const ringPool=[];for(let i=0;i<14;i++){const m=new THREE.Mesh(new THREE.RingGeometry(.9,1,56),glowMat(0xffffff,0));m.rotation.x=-Math.PI/2;m.position.y=.016;m.visible=false;table.add(m);ringPool.push(m);}
const popPool=[];for(let i=0;i<8;i++){const p=canvasPlane(512,128,.4,.1);p.mesh.visible=false;p.key='';table.add(p.mesh);popPool.push(p);}
const colorCache=new Map(),pc=new THREE.Color();
function cssColor(c,out){let v=colorCache.get(c);if(!v){try{v=new THREE.Color(c);}catch{v=new THREE.Color(1,1,1);}colorCache.set(c,v);}return out.copy(v);}
// With the field texture on, the phone draws every spark flat on the table itself; only sparks that have risen above it are drawn here in 3D.
let flatInTexture=false;
function drawParticles(parts,L){
  let n=0;
  for(const p of parts){if(n>=MAX_PARTS)break;if(flatInTexture&&!(p.z>.03))continue;fieldToTable(p.u,p.v,L,fp);partPos[n*3]=fp.x;partPos[n*3+1]=Math.max(0,p.z||0)+.01;partPos[n*3+2]=fp.z;
    cssColor(p.col||'#ffffff',pc);const a=Math.max(0,Math.min(1,p.life/(p.max||.5)));partCol[n*3]=pc.r*a;partCol[n*3+1]=pc.g*a;partCol[n*3+2]=pc.b*a;n++;}
  partGeo.setDrawRange(0,n);partGeo.attributes.position.needsUpdate=true;partGeo.attributes.color.needsUpdate=true;partPts.visible=n>0;
}
function drawRings(rings,L){
  for(let i=0;i<ringPool.length;i++){const m=ringPool[i],r=rings[i],f=r&&ringFrame(r);
    if(!f){m.visible=false;continue;}m.visible=true;fieldToTable(r.u,r.v,L,fp);m.position.set(fp.x,.016,fp.z);m.scale.setScalar(f.radius);m.material.color.set(cssColor(r.col||'#ffffff',pc));m.material.opacity=.9*f.alpha;}
}
const camWorld=new THREE.Vector3();
function drawPops(pops,L){
  const cam=renderer.xr.isPresenting?renderer.xr.getCamera():camera;cam.getWorldPosition(camWorld);
  for(let i=0;i<popPool.length;i++){const m=popPool[i],p=pops[i];
    if(!p||p.t>=p.life){m.mesh.visible=false;continue;}
    const f=popFrame(p),key=p.text+'|'+p.col;
    if(m.key!==key){m.key=key;const c=m.ctx;c.clearRect(0,0,512,128);let px=84;c.font='bold '+px+'px sans-serif';const w=c.measureText(p.text).width;if(w>480)px=Math.floor(px*480/w);
      c.font='bold '+px+'px sans-serif';c.textAlign='center';c.textBaseline='middle';c.lineJoin='round';c.lineWidth=12;c.strokeStyle='#100821';c.strokeText(p.text,256,66);c.fillStyle=p.col||'#ffffff';c.fillText(p.text,256,66);m.texture.needsUpdate=true;}
    fieldToTable(p.u,p.v,L,fp);const sc=Math.max(.001,f.scale)*Math.max(.05,p.size*1.9)/.1;
    m.mesh.visible=true;m.mesh.scale.set(sc,sc,1);m.mesh.position.set(fp.x,.1+f.rise*1.5,fp.z);m.mesh.material.opacity=Math.max(0,f.alpha);m.mesh.lookAt(camWorld);m.mesh.rotateZ(f.tilt*.5);}
}
// Race-to-7 bars on the outer rails: 7 cells each, filling smoothly with a white chunk catching up.
const BAR_N=7,BAR_X=.565,BAR_Z0=.8,BAR_SEG=.1;
const bars=[0,1].map(i=>{const cells=[];for(let k=0;k<BAR_N;k++){
  const bg=new THREE.Mesh(new THREE.BoxGeometry(.016,.008,BAR_SEG-.012),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.1}));
  const chunk=new THREE.Mesh(new THREE.BoxGeometry(.016,.01,1),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.85}));
  const fill=new THREE.Mesh(new THREE.BoxGeometry(.016,.012,1),new THREE.MeshBasicMaterial({color:0xffffff}));
  for(const m of [bg,chunk,fill]){m.visible=false;table.add(m);}cells.push({bg,chunk,fill});}return cells;});
function drawBars(g,h){
  const show=!!g.board&&g.mode!=='demo'&&g.mode!=='intro';
  for(let i=0;i<2;i++){const cells=bars[i],b=g.board&&g.board[i];
    if(!show||!b){for(const c of cells)c.bg.visible=c.chunk.visible=c.fill.visible=false;continue;}
    const r=barCells(b,g.score[i],BAR_N),col=i===0?h.COL.p1:h.COL.p2,dir=i===0?1:-1,x=(i===0?-1:1)*BAR_X+(b.shake>0?(Math.random()-.5)*.006:0),w=1+r.punch*1.4;
    const fillCol=r.matchPoint?(Math.sin(performance.now()/50)>0?h.COL.gold:col):r.hot?'#ffffff':col;
    for(let k=0;k<BAR_N;k++){const c=cells[k],zc=dir*(BAR_Z0-(k+.5)*BAR_SEG),za=zc+dir*(BAR_SEG-.012)/2,len=BAR_SEG-.012;
      c.bg.visible=true;c.bg.position.set(x,.006,zc);c.bg.scale.x=w;c.bg.material.opacity=.1+r.flash*.6;
      const f=r.cells[k];
      c.chunk.visible=f.chunk>.001;c.chunk.scale.set(w,1,Math.max(.0001,f.chunk*len));c.chunk.position.set(x,.01,za-dir*f.chunk*len/2);
      c.fill.visible=f.fill>.001;c.fill.scale.set(w,1,Math.max(.0001,f.fill*len));c.fill.position.set(x,.014,za-dir*f.fill*len/2);cssColor(fillCol,c.fill.material.color);}}
}
function fxOff(){partPts.visible=false;for(const m of ringPool)m.visible=false;for(const p of popPool)p.mesh.visible=false;for(const c of bars)for(const k of c)k.bg.visible=k.chunk.visible=k.fill.visible=false;}
// Title / result stamp that floats over the table, and the colour wash of the victory scene.
const stamp=canvasPlane(1024,256,1.1,.275);stamp.mesh.visible=false;stamp.key='';scene.add(stamp.mesh);
const washTex=(()=>{const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d'),g=x.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);})();
const wash=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({map:washTex,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));wash.rotation.x=-Math.PI/2;wash.visible=false;table.add(wash);
function setStamp(text,col,sub){
  const key=text+'|'+col+'|'+sub;if(stamp.key===key)return;stamp.key=key;const c=stamp.ctx;c.clearRect(0,0,1024,256);c.textAlign='center';c.textBaseline='middle';c.lineJoin='round';
  let px=150;c.font='bold '+px+'px sans-serif';const w=c.measureText(text).width;if(w>960)px=Math.floor(px*960/w);c.font='bold '+px+'px sans-serif';
  const y=sub?100:128;c.lineWidth=18;c.strokeStyle='#100821';c.strokeText(text,512,y);c.fillStyle=col;c.fillText(text,512,y);
  if(sub){c.font='bold 64px sans-serif';c.lineWidth=12;c.strokeText(sub,512,214);c.fillStyle='#ffffff';c.fillText(sub,512,214);}
  stamp.texture.needsUpdate=true;
}
function hideStamp(){stamp.mesh.visible=false;wash.visible=false;}
// Intro line that draws the crease before the table unfolds out of it.
const introLine=new THREE.Mesh(new THREE.BoxGeometry(1,.006,.014),glowMat(0xbb66ff,1));introLine.visible=false;scene.add(introLine);
// Unlock toast above the far end of the table.
const toast=canvasPlane(1024,128,.9,.1125);toast.mesh.visible=false;scene.add(toast.mesh);
const toasts=[];let toastShown='',toastUntil=0;
function drawToast(now){
  if(toastUntil<=now){const nx=toasts.shift();if(nx){toastShown=nx;toastUntil=now+3200;const c=toast.ctx;c.clearRect(0,0,1024,128);c.fillStyle='#100821ee';roundRect(c,6,6,1012,116,36);c.fill();c.strokeStyle='#ffd15f';c.lineWidth=6;c.stroke();c.fillStyle='#ffd15f';c.textAlign='center';c.textBaseline='middle';let px=54;c.font='bold '+px+'px sans-serif';const w=c.measureText(nx).width;if(w>940)px=Math.floor(px*940/w);c.font='bold '+px+'px sans-serif';c.fillText(nx,512,66);toast.texture.needsUpdate=true;}else toastShown='';}
  toast.mesh.visible=!!toastShown&&toastUntil>now;
}
let look=paddleLook(null);
function applyLook(){
  try{look=paddleLook(usingEngine()?engine.host.paddleStyle():null);}catch{look=paddleLook(null);}
  for(let i=0;i<2;i++)lk.setPaddleRing(i,look.ring);
  refreshPaddleStyle();
}
// The knob you hold: accent band in the Garage look's trail colour, dome in its core colour, glowing in the side's colour.
function refreshPaddleStyle(){const c=arenaCols;for(let i=0;i<2;i++)lk.setPaddleAccent(i,c?(i?c.p2:c.p1):(i?'#ff3195':'#2de2e6'),look.trail,look.core);}

// Old simple game (fallback only): state in table units, x across [0,1], y along [0,1.8].
let introFxState={parts:[],rings:[],shake:0,tones:0,smashed:false,flash:0};
let dailyMatch=false,overHandled=false,state=initial(),playing=false,started=false,desktop=false,intro=true,menuOpen=false,introT=0,last=0,acc=0,lastLabel='',audio,menuDirty=true,lastHoverKey='',calibrating=null,notice='',noticeT=0,eyeY=NaN,lostT=0;
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
  board.mesh.position.set(0,tableHeight+.71,-1.75);toast.mesh.position.set(0,tableHeight+.47,-1.75);menu.mesh.position.set(0,tableHeight+.5,-.55);placeTab();
  plane.constant=-tableHeight;
  camera.position.set(0,tableHeight+1.01,1.3);camera.lookAt(0,tableHeight+.04,-1.25);
  menuDirty=true;
}
applyHeight(options.height==='auto'?TABLE_DEFAULT:options.height);

const jointNames=JOINT_NAMES;
const handVisuals=new Map(),pokes=new Map(),pinches=new Map(),pinchA=new THREE.Vector3(),pinchB=new THREE.Vector3();
function makeHandVisual(){const g=lk.makeHand();scene.add(g);return g;}

function startMatch(daily=false){
  if(engine.state==='loading'){pendingStart=true;say('LOADING THE GAME…',3);menuOpen=true;menuDirty=true;return;}
  if(usingEngine()){const h=engine.host;h.setDifficulty(options.difficulty);h.setStage(arenaIx);h.setMuted(!options.sound);if(audio)h.setAudio(audio);
    if(daily){if(!h.startDaily()){say(h.daily().done?'TODAY\'S DAILY IS DONE · COME BACK TOMORROW':'THIS ARENA IS LOCKED',3.5);return;}dailyMatch=true;}
    else{dailyMatch=false;if(!h.startSolo()){say('THIS ARENA IS LOCKED',3);return;}}
    applyLook();overHandled=false;
    Object.assign(smoothTarget,{x:.5,y:1.6});Object.assign(target,{x:.5,y:1.6});Object.assign(evState,newEventState());detectEvents(evState,h.game);
  }else{state=initial();opponent=createOpponent(options.difficulty);smoothTarget={...state.paddles[0]};}
  playing=true;started=true;if(intro)skipIntro();intro=false;menuOpen=false;table.visible=true;acc=0;menuDirty=true;lastLabel='';
}
function openMenu(){if(intro)return;menuOpen=true;menuDirty=true;}
function skipIntro(){if(!intro)return;intro=false;menuOpen=true;table.visible=true;table.scale.set(1,1,1);introLine.visible=false;hideStamp();board.mesh.visible=true;introFxState.parts.length=0;introFxState.rings.length=0;introFxState.shake=0;for(const m of paddles)m.scale.set(1,1,1);lastLabel='';menuDirty=true;}
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
function menuView(){return {started,over:usingEngine()?engine.host.game.state==='over':!!state.winner,difficulty:options.difficulty,height:options.height,hand:options.hand,sound:options.sound,haptics:options.haptics,calibrating,inVR:renderer.xr.isPresenting,arenas:usingEngine()?arenaList:[],arena:arenaIx,daily:usingEngine()?engine.host.daily():null};}
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
    else{let px=b.label.length>10?30:38;c.font='bold '+px+'px sans-serif';const tw=c.measureText(b.label).width;if(tw>b.w-28){px=Math.max(18,Math.floor(px*(b.w-28)/tw));c.font='bold '+px+'px sans-serif';}c.textAlign='center';c.fillText(b.label,b.x+b.w/2,b.y+b.h/2+2);c.textAlign='left';}
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
  else if(action==='daily'){if(usingEngine())startMatch(true);}
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
  if(!menuOpen&&started&&usingEngine()&&engine.host.game.state==='over'){openMenu();return;} // skip the victory scene
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
  const grip=renderer.xr.getControllerGrip(i),gripMesh=lk.makeController();grip.add(gripMesh);scene.add(grip);
  controller.addEventListener('connected',e=>{sources.set(i,e.data);gripMesh.visible=!e.data.hand&&!!e.data.gripSpace;lastLabel='';});
  controller.addEventListener('disconnected',()=>{sources.delete(i);gripMesh.visible=false;hover.delete(i);});
  controller.addEventListener('selectstart',()=>{const s=sources.get(i);if(s?.hand)return;haptic(s,.4,25);selectFrom(s,i);});
}
enter.onclick=async()=>{
  enter.disabled=true;unlockSound();let session;
  try{session=await navigator.xr.requestSession('immersive-vr',{requiredFeatures:['local-floor'],optionalFeatures:['hand-tracking']});
    desktop=false;playing=false;started=false;state=initial();intro=true;menuOpen=false;introT=0;table.visible=false;autoPending=options.height==='auto';document.body.classList.add('in-vr');
    resetInputState();calibrating=null;notice='';noticeT=0;introFxState.parts.length=0;introFxState.rings.length=0;introFxState.shake=0;toasts.length=0;hideStamp();introFrameNow=null;table.scale.set(1,1,1);
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
function glowTint(m,hex,a){m.material.color.set(hex);m.material.opacity=a;}
// The phone's own top art for the pieces. Drawn by the engine (drawPaddle / drawPuck) into small canvases, refreshed a few times a second.
let artAt=-1e9;
function refreshArt(h,now){
  if(now-artAt<250)return;artAt=now;
  try{for(let i=0;i<2;i++)lk.setPaddleArt(i,h.pieceArt('paddle',i+1));for(const [tint] of puckArt)puckArt.set(tint,h.pieceArt('puck',tint));lk.touchArt();}catch{}
}
function puckArtFor(h,tint){let c=puckArt.get(tint);if(!c){try{c=h.pieceArt('puck',tint);puckArt.set(tint,c);}catch{c=null;}}return c;}
function syncEngine(dt,t){
  const h=engine.host;if(!h)return;
  const g=h.game,L=h.view.L,beat=g.beat||0;
  refreshArt(h,performance.now());
  // paddles: 3D bodies; their glow, flames and contact shadow are in the table texture
  for(let i=0;i<2;i++){const pd=g.paddles[i],m=paddles[i];if(!pd){m.visible=false;continue;}m.visible=true;
    fieldToTable(pd.u,pd.v,L,fp);m.position.set(fp.x,0,fp.z);const k=pd.r/.085,p=1+(pd.punch||0)*.12;m.scale.set(k*p,1,k*p);
    lk.setPaddleRing(i,paddleRingColour(look,pd.r>.1,g.fire[i]>0,h.COL.BIG));}
  // pucks: tint, smash gold and UV-arena ghosting follow the engine; the trail, flames and RGB split are in the texture
  const np=Math.min(MAX_PUCKS,g.pucks.length);
  for(let i=0;i<MAX_PUCKS;i++){const m=pucks[i];if(i>=np){m.visible=false;continue;}const pk=g.pucks[i];m.visible=true;
    fieldToTable(pk.u,pk.v,L,fp);m.position.set(fp.x,0,fp.z);m.scale.set(pk.r/.042,1,pk.r/.042);
    const hot=pk.smashT>0,env=g.env,uv=env&&env.type==='UV'&&env.t>0&&(env.who===1?pk.v<L/2:pk.v>L/2);
    const col=hot?h.COL.gold:pk.last===1?h.COL.p1:pk.last===2?h.COL.p2:'#ffffff';
    lk.tintPuck(m,col,puckArtFor(h,col),hot,uv?.15:1);}
  // bumpers on the crease: the phone's bumper art is in the texture; a glassy cylinder gives it body, ghosted when "phased"
  for(let i=0;i<2;i++){const b=g.bumpers[i],m=bumpers[i];if(!b){m.visible=false;continue;}m.visible=true;
    fieldToTable(b.u,b.v,L,fp);m.position.set(fp.x,0,fp.z);const on=h.bumperActive(b),col=b.u<.5?h.COL.p1:h.COL.p2,s=1+Math.max(0,b.punch)*.35+b.flash*.15;m.scale.set(s,1,s);
    const u=m.userData;u.m.material.color.set(col);u.m.material.opacity=on?.16+b.flash*.3:.06;u.ring.material.opacity=on?.85:.3;u.ring.material.color.set(b.flash>.2?'#ffffff':col);u.ring.material.emissive.set(b.flash>.2?'#ffffff':col);}
  // power-up pick-up: the table texture draws its ring and glyph; a light beam shows it from afar
  const pu=g.pups[0];
  if(pu&&!pu.dead){const st=pickupStyle(pu.type),u=pickup.userData;pickup.visible=true;fieldToTable(pu.u,pu.v,L,fp);const fade=pu.life<2?(Math.sin(t*20)>0?1:.35):1;
    pickup.position.set(fp.x,0,fp.z);u.beam.material.color.set(st.colour);u.beam.material.opacity=.2*fade;}
  else pickup.visible=false;
  // arena power orb: the texture draws the orb; its name floats above it
  const eo=g.envOrb;
  if(eo){envOrb.visible=true;fieldToTable(eo.u,eo.v,L,fp);envOrb.position.set(fp.x,0,fp.z);const u=envOrb.userData;
    if(u.name!==eo.name){u.name=eo.name;const c=u.label.ctx;c.clearRect(0,0,512,96);c.font='bold 46px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillStyle='#100821d0';roundRect(c,10,10,492,76,24);c.fill();c.fillStyle='#ffffff';c.fillText(eo.name,256,50);u.label.texture.needsUpdate=true;}
    u.label.mesh.lookAt(camera.getWorldPosition(tmp));}
  else envOrb.visible=false;
  // beat: the rail neon pulses with the music
  lk.beat(beat);
}

// ---- Intro: the phone game's cutscene, in 3D (pure timing in quest-juice.mjs) -----------------
let introFrameNow=null;
function introBurst(u,v,col,n,spd){for(let i=0;i<n&&introFxState.parts.length<110;i++){const a=Math.random()*6.283,sp=(.3+Math.random()*.9)*spd;introFxState.parts.push({u,v,vu:Math.cos(a)*sp,vv:Math.sin(a)*sp,z:Math.random()*.15-.05,vz:(.25+Math.random()*.7)*spd,life:.35+Math.random()*.45,max:.8,col});}}
function introRing(u,v,col,max,life,age=0){introFxState.rings.push({u,v,age,life,col,max});}
function itone(f,d,type,vol,slide){if(options.sound&&usingEngine()){try{engine.host.tone(f,d,type,vol,slide);}catch{}}}
function introBeat(name){
  const f=introFrameNow||introFrame(introT,1.8),P1='#2de2e6',P2='#ff3195',st=introFxState;
  if(name==='hum')itone(90,.9,'sine',.12,2.5);
  else if(name==='unfold')itone(140,.7,'sawtooth',.05,3);
  else if(name==='paddles')itone(300,.25,'triangle',.06,1.8);
  else if(name==='drop'){introRing(.5,.9,'#ffffff',.35,.7);introBurst(.5,.9,'#ffffff',16,1.1);itone(180,.2,'square',.08,.5);st.shake=Math.max(st.shake,.15);haptic(paddleSource(),.3,25);}
  else if(name.startsWith('hit')){const i=+name.slice(3),side=i%2===1?1:2;introBurst(f.puck.u,f.puck.v,side===1?P1:P2,12,1.3);itone(side===1?560+i*60:440+i*60,.07,'triangle',.14);st.shake=Math.max(st.shake,.12);if(side===1)haptic(paddleSource(),.5,30);}
  else if(name==='smash'){st.shake=.7;for(const c of [P1,P2,'#ffffff'])introBurst(.5,.9,c,30,2.4);introRing(.5,.9,P1,.7,.9);introRing(.5,.9,P2,.95,1,-.08);itone(70,.8,'sawtooth',.18,.4);itone(1200,.4,'sine',.08,.3);haptic(paddleSource(),1,160);}
  else if(name==='title'){for(let i=0;i<6;i++)setTimeout(()=>itone(330*Math.pow(1.26,i),.1,'square',.05),i*120);}
  else if(name==='tag')itone(660,.6,'sine',.08,1.5);
}
function stepLocalFx(dt){
  const st=introFxState;for(const p of st.parts){p.u+=p.vu*dt;p.v+=p.vv*dt;p.z+=p.vz*dt;p.vz-=dt*2.2;p.vu*=.94;p.vv*=.94;p.life-=dt;}
  st.parts=st.parts.filter(p=>p.life>0);for(const r of st.rings)r.age+=dt;st.rings=st.rings.filter(r=>r.age<r.life);st.shake=Math.max(0,st.shake-dt*2.2);
}
function runIntro(dt){
  const prev=introT;introT+=dt;introFrameNow=introFrame(introT,1.8);
  for(const b of introBeats(prev,introT))introBeat(b);
  stepLocalFx(dt);if(introT>=INTRO_END){introFrameNow=null;skipIntro();}
}
function applyIntro(f){
  const L=1.8;table.visible=f.showTable;table.scale.set(1,1,Math.max(.001,f.fold));
  introLine.visible=f.fold<1;introLine.position.set(table.position.x,table.position.y+.012,table.position.z);introLine.scale.x=Math.max(.001,f.crease);introLine.material.opacity=1-f.fold*.8;
  for(const m of bumpers)m.visible=false;pickup.visible=false;envOrb.visible=false;
  const ps=[f.p1,f.p2];for(let i=0;i<2;i++){const m=paddles[i];m.visible=f.padsOn;fieldToTable(ps[i].u,ps[i].v,L,fp);m.position.set(fp.x,0,fp.z);m.scale.set(1,1,1);}
  for(let i=1;i<MAX_PUCKS;i++)pucks[i].visible=false;
  const pk=pucks[0];pk.visible=f.puck.on&&!f.puck.smashed;fieldToTable(f.puck.u,f.puck.v,L,fp);pk.position.set(fp.x,f.puck.drop,fp.z);pk.scale.set(1,1,1);
  const col=f.puck.last===1?'#2de2e6':f.puck.last===2?'#ff3195':'#ffffff';lk.tintPuck(pk,col,engine.host&&engine.host.pieceArt?puckArtFor(engine.host,col):null,false,1);
  if(f.title>0){setStamp('CREASE','#36eeee',f.tag>0?'BUILT FOR THE FOLD':'');stamp.mesh.visible=true;stamp.mesh.scale.setScalar(Math.max(.01,2.2-1.2*ease.outBack(f.title)));stamp.mesh.material.opacity=f.title*(1-f.fade);
    stamp.mesh.position.set(0,tableHeight+.42,table.position.z);const cam=renderer.xr.isPresenting?renderer.xr.getCamera():camera;cam.getWorldPosition(camWorld);stamp.mesh.lookAt(camWorld);}
  else stamp.mesh.visible=false;
  wash.visible=false;drawParticles(introFxState.parts,L);drawRings(introFxState.rings,L);
  for(const p of popPool)p.mesh.visible=false;for(const c of bars)for(const k of c)k.bg.visible=k.chunk.visible=k.fill.visible=false;
}
// ---- Victory: colour wash out of the winner's goal, result stamped over the table ------------------
function applyVictory(g,h){
  const vf=victoryFrame(g.overT),w=g.winner,col=w===1?h.COL.p1:h.COL.p2;
  wash.visible=true;wash.position.set(0,.013,w===1?.9:-.9);wash.scale.setScalar(.2+vf.wash*1.1);cssColor(col,wash.material.color);wash.material.opacity=Math.min(1,vf.washAlpha*2.4);
  if(vf.stamp>0){setStamp(w===1?'YOU WIN':'CPU WINS',col,vf.sub>.5?g.score.join(' – '):'');stamp.mesh.visible=true;stamp.mesh.scale.setScalar(Math.max(.01,vf.stampScale));stamp.mesh.material.opacity=vf.stamp;
    stamp.mesh.position.set(0,tableHeight+.42,table.position.z);const cam=renderer.xr.isPresenting?renderer.xr.getCamera():camera;cam.getWorldPosition(camWorld);stamp.mesh.lookAt(camWorld);}
}
function onMatchOver(){
  const h=engine.host,g=h.game;
  if(g.winner===1)haptic(paddleSource(),.9,260);else haptic(paddleSource(),.4,120);
  if(dailyMatch){try{h.finishDaily();}catch{}}
  try{arenaList=h.arenas();}catch{}menuDirty=true;lastLabel='';
}
// Old simple game drawn with the same meshes.
function syncSimple(){
  for(let i=0;i<2;i++){const p=state.paddles[i];paddles[i].visible=true;paddles[i].position.set(p.x-.5,0,p.y-.9);paddles[i].scale.set(1,1,1);}
  pucks[0].visible=true;pucks[0].position.set(state.puck.x-.5,0,state.puck.y-.9);pucks[0].scale.set(1,1,1);for(let i=1;i<MAX_PUCKS;i++)pucks[i].visible=false;
  for(const b of bumpers)b.visible=false;pickup.visible=false;envOrb.visible=false;
}

const quality=newQuality();let curFov=FOVEATION;
renderer.setAnimationLoop((now,frame)=>{
  const gap=(now-last)/1000,okGap=!!last&&gap>0&&gap<.25,dt=okGap?gap:1/72,t=now/1000;last=now;let tracked=desktop,paddleY=NaN;
  table.position.x=0;table.position.z=-1.25; // the jolt is added after input is read, so it never feeds the paddle
  const session=renderer.xr.getSession();
  // Keep the headset's frame rate: sustained slow frames raise foveation, then draw the field texture every other frame.
  if(session&&okGap){const qs=qualityStep(quality,gap*1000,1000/(session.frameRate||72),lk.field.ms);if(qs.foveation!==curFov){curFov=qs.foveation;try{renderer.xr.setFoveation(curFov);}catch{}}lk.field.every=qs.fieldEvery;}
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
      if(s.hand){let hv=handVisuals.get(s.handedness);if(!hv){hv=makeHandVisual();handVisuals.set(s.handedness,hv);}hv.visible=true;for(let j=0;j<jointNames.length;j++)if(jointPos(frame,s.hand,jointNames[j],ref,tmp2))hv.userData.set(j,tmp2);hv.userData.commit();
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
  if(intro)runIntro(dt);
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
      if(over){if(!overHandled){overHandled=true;onMatchOver();}if(!menuOpen&&victoryFrame(g.overT).ready){menuOpen=true;menuDirty=true;}}
    }
    if(started&&usingEngine()){syncEngine(dt,t);const L=eng.view.L;drawParticles(g.parts,L);if(!lk.field.ok)drawRings(g.rings,L);drawPops(menuOpen?[]:g.pops,L);drawBars(g,eng);
      if(over&&!menuOpen)applyVictory(g,eng);else hideStamp();}
    else if(!started){for(const m of pucks)m.visible=false;if(!intro)fxOff();}
  }else if(started&&engine.state==='failed'){
    over=!!state.winner;
    if(playing&&!menuOpen&&tracked&&!hiddenNow()){followHand(smoothTarget,target,dt);acc+=dt;while(acc>=1/60){
      move(state,0,smoothTarget.x,smoothTarget.y);const ai=opponentMove(state,opponent,1/60);move(state,1,ai.x,ai.y);
      const score=state.score.join();step(state);
      if(state.score.join()!==score)haptic(paddleSource(),.8,50);if(state.winner){menuOpen=true;menuDirty=true;}acc-=1/60;
    }}else acc=0;
    syncSimple();
  }else{for(const m of paddles)m.visible=true;}
  if(!started&&!intro){const rest=[[.5,1.6],[.5,.2]];paddles.forEach((m,i)=>{m.position.set(rest[i][0]-.5,0,rest[i][1]-.9);m.scale.set(1,1,1);});}
  if(intro&&introFrameNow)applyIntro(introFrameNow);
  else if(started&&!usingEngine())fxOff();
  if(usingEngine()){for(const e of engine.host.takeEvents()){const line=unlockLine(e);if(line)toasts.push(line);if(e.type==='stage'){try{arenaList=engine.host.arenas();}catch{}menuDirty=true;}}}
  drawToast(now);
  {const shk=intro?introFxState.shake:(eng&&started?g.shake:0),o=shakeOffset(shk,Math.random(),Math.random());table.position.x=o.x;table.position.z=-1.25+o.z;}
  if(menuDirty&&menu.mesh.visible)buttons=drawMenu();
  // Scoreboard: score, the engine's own message, and the active arena power.
  const score=eng?g.score:state.score;
  let label,sub;
  const away=!!session&&session.visibilityState!=='visible';
  if(away)label='QUEST MENU IS OPEN';
  else if(notice)label=notice+(calibrating?'  '+Math.ceil(calibrating.t):'');
  else if(intro)label=introT>=6.1?'BUILT FOR THE FOLD   ·   prodbyKCTW':'';
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
  // The table top: the phone's own drawing of the field, refreshed every frame. Menu and intro (no live match) get the bare table with the
  // paddles' shadows where the 3D paddles are.
  if(eng&&!hiddenNow()){
    const F=lk.field,live=started&&!intro;F.opts.bare=!live;F.opts.pucks=null;F.opts.score=null;if(F.opts.paddles.length!==2||F.opts.paddles[0].u===undefined)F.opts.paddles=[];const pa=F.opts.paddles;
    if(!live){if(pa.length!==2){pa.length=0;pa.push({p:1,u:.5,v:1.6,r:.085,ptr:null,big:0,punch:0},{p:2,u:.5,v:.2,r:.085,ptr:null,big:0,punch:0});}
      const Lh=eng.view.L;if(intro&&introFrameNow){const f=introFrameNow;pa[0].u=f.p1.u;pa[0].v=f.padsOn?f.p1.v:-9;pa[1].u=f.p2.u;pa[1].v=f.padsOn?f.p2.v:-9;}
      else{pa[0].u=.5;pa[0].v=1.6*Lh/1.8;pa[1].u=.5;pa[1].v=.2*Lh/1.8;}}
    lk.updateField(eng);flatInTexture=F.ok;
  }
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
  get field(){const F=lk.field;return {ok:F.ok,ms:F.ms,frames:F.frames,every:F.every,errors:F.errors,err:F.lastError||'',w:F.canvas()?.width||0,h:F.canvas()?.height||0};},get look3(){return lk;},get renderer(){return renderer;},
  get engine(){return engine.host;},get engineState(){return engine.state;},get arenaList(){return arenaList;},get arenaIx(){return arenaIx;},
  get audio(){return audio;},get backdrop(){return {visible:backdrop.visible,map:!!backdrop.material.map,id:backdropFor};},
  get visible(){return {pucks:pucks.filter(p=>p.visible).length,pickup:pickup.visible,envOrb:envOrb.visible,shields:usingEngine()?engine.host.game.shields.filter(v=>v>0).length:0, // goal walls are drawn by the table texture
    bumpers:bumpers.filter(b=>b.visible).length};},
  get fx(){const L=usingEngine()?engine.host.view.L:1.8;return {parts:partPts.visible?partGeo.drawRange.count:0,rings:ringPool.filter(m=>m.visible).length,pops:popPool.filter(m=>m.mesh.visible).length,bars:bars.map(c=>c.filter(k=>k.fill.visible).length),jolt:Math.hypot(table.position.x,table.position.z+1.25),stamp:stamp.mesh.visible,wash:wash.visible,toast:toast.mesh.visible?toastShown:'',toastQueue:toasts.length,introT,look,dailyMatch,introLine:introLine.visible,fold:table.scale.z,L};},
  get paddleLook(){return {ring:'#'+paddles[0].userData.bevel.material.color.getHexString(),core:'#'+paddles[0].userData.cap.material.color.getHexString(),glow:'#'+paddles[0].userData.glow.material.color.getHexString(),ring2:'#'+paddles[1].userData.bevel.material.color.getHexString()};},
  skipIntro,set introT(v){introT=v;},get introFrame(){return introFrameNow;},
  get tableHeight(){return tableHeight;},get menuOpen(){return menuOpen;},get playing(){return playing;},get intro(){return intro;},get target(){return target;},startMatch,press,handleSelect,hover,
  menuPoint(id){const b=buttons.find(x=>x.id===id);if(!b)return null;menu.mesh.updateMatrixWorld();const p=menu.mesh.localToWorld(new THREE.Vector3(((b.x+b.w/2)/MENU_W-.5)*PANEL_W,(.5-(b.y+b.h/2)/MENU_H)*PANEL_H,0));const n=new THREE.Vector3(0,0,1).transformDirection(menu.mesh.matrixWorld);return {p:{x:p.x,y:p.y,z:p.z},n:{x:n.x,y:n.y,z:n.z}};}};
try{const supported=await navigator.xr?.isSessionSupported('immersive-vr');enter.disabled=!supported;enter.textContent=supported?'Enter VR':'Open in Quest Browser';}catch{enter.textContent='VR unavailable';}
