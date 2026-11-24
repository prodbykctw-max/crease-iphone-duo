import * as THREE from './vendor/three.module.min.js';
import {initial,move,step} from '../backend/online/physics.mjs';
import {followHand,createOpponent,opponentMove} from './quest-controls.mjs';
import {loadOptions,saveOptions,autoTableHeight,heightFromHand,stepHeight,clampHeight,updatePoke,updatePinch,MENU_W,MENU_H,menuButtons,hitButton,applyButton,TABLE_DEFAULT} from './quest-options.mjs';

const storage=(()=>{try{return localStorage;}catch{return null;}})();
const options=loadOptions(storage);const save=()=>saveOptions(storage,options);
const status=document.querySelector('#status'),enter=document.querySelector('#enter'),handSelect=document.querySelector('#hand');
handSelect.value=options.hand;handSelect.addEventListener('change',()=>{options.hand=handSelect.value;save();placeTab();menuDirty=true;});

const scene=new THREE.Scene();scene.background=new THREE.Color('#080514');scene.fog=new THREE.Fog('#080514',5,15);
const camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.01,30);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.xr.enabled=true;renderer.xr.setReferenceSpaceType('local-floor');document.body.append(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xc7bbff,0x170924,2));
const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-2,4,1);scene.add(light);

// local-floor is measured from the Quest floor. The table top sits at
// tableHeight (auto-fitted to the player, or set in the options menu).
const table=new THREE.Group();table.position.set(0,TABLE_DEFAULT,-1.25);scene.add(table);
function mesh(geometry,color,emissive=0){return new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,emissive,roughness:.32,metalness:.55}));}
function box(w,h,d,x,y,z,color,glow=0){const m=mesh(new THREE.BoxGeometry(w,h,d),color,glow);m.position.set(x,y,z);table.add(m);return m;}
box(1.06,.1,1.86,0,-.06,0,0x180d2c);const windowMesh=box(1,.018,1.8,0,0,0,0x091b28);
for(const x of [-.515,.515])box(.025,.07,1.8,x,.025,0,0x4ce9ff,0x126478);
// The visible goal mouths match the shared physics goal width.
for(const z of [-.915,.915])for(const x of [-.375,.375])box(.25,.07,.025,x,.025,z,z<0?0xff3195:0x2de2e6);
for(const z of [-.925,.925])box(1.02,.018,.012,0,.065,z,0x6d3bba,0x24116b);
box(1,.002,.008,0,.012,0,0xbb66ff,0x673399);
const legs=[];for(const x of [-.4,.4])for(const z of [-.7,.7])legs.push(box(.07,1,.07,x,-.5,z,0x25143b));
const grid=new THREE.GridHelper(16,32,0x842e8f,0x271438);grid.position.y=-.01;scene.add(grid);
const paddles=[0x2de2e6,0xff3195].map(color=>{const g=new THREE.Group();
  const base=mesh(new THREE.CylinderGeometry(.065,.073,.038,40),color,color);base.position.y=.027;g.add(base);
  const bevel=mesh(new THREE.TorusGeometry(.052,.006,10,40),0xffffff,color);bevel.rotation.x=Math.PI/2;bevel.position.y=.052;g.add(bevel);
  const grip=mesh(new THREE.CylinderGeometry(.026,.035,.072,28),color,color);grip.position.y=.07;g.add(grip);
  const cap=mesh(new THREE.SphereGeometry(.019,20,12),0xffffff,color);cap.position.set(0,.112,-.006);g.add(cap);
  table.add(g);return g;});
const puck=mesh(new THREE.CylinderGeometry(.025,.025,.018,24),0xffffff,0x443366);table.add(puck);
// A true geometry centerpiece below the transparent-looking center window.
const orb=mesh(new THREE.IcosahedronGeometry(.17,1),0xff9044,0x8a2311);orb.position.set(0,-.25,0);table.add(orb);
windowMesh.material.transparent=true;windowMesh.material.opacity=.65;windowMesh.material.depthWrite=false;
const halo=mesh(new THREE.TorusGeometry(.23,.006,8,48),0xff49b6,0x99195f);halo.rotation.x=.7;orb.add(halo);

function canvasPlane(w,h,pw,ph){const c=document.createElement('canvas');c.width=w;c.height=h;const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
  const m=new THREE.Mesh(new THREE.PlaneGeometry(pw,ph),new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false}));m.renderOrder=5;return {canvas:c,ctx:c.getContext('2d'),texture:t,mesh:m};}
const board=canvasPlane(1024,256,1.3,.325);board.mesh.material.side=THREE.DoubleSide;scene.add(board.mesh);
// Options menu: a panel floating over your own half of the table, within
// arm's reach, so it can be touched with a fingertip or pointed at and pinched.
const PANEL_W=.72,PANEL_H=.54;
const menu=canvasPlane(MENU_W,MENU_H,PANEL_W,PANEL_H);menu.mesh.rotation.x=-.36;menu.mesh.visible=false;scene.add(menu.mesh);
// Small MENU tab beside the table on your free-hand side, shown during play.
const TAB_W=.2,TAB_H=.08;
const tab=canvasPlane(256,104,TAB_W,TAB_H);tab.mesh.visible=false;scene.add(tab.mesh);
(function drawTab(){const c=tab.ctx;c.clearRect(0,0,256,104);c.fillStyle='#100821e8';roundRect(c,4,4,248,96,22);c.fill();c.strokeStyle='#36eeee';c.lineWidth=4;c.stroke();c.fillStyle='#36eeee';c.font='bold 44px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('MENU',128,54);tab.texture.needsUpdate=true;})();

let state=initial(),playing=false,started=false,desktop=false,intro=true,menuOpen=false,introT=0,last=0,acc=0,lastLabel='',audio,menuDirty=true,lastHoverKey='',calibrating=null,notice='',noticeT=0,eyeY=NaN;
let target={x:.5,y:1.6},smoothTarget={x:.5,y:1.6},opponent=createOpponent(options.difficulty);const sources=new Map();
let tableHeight=TABLE_DEFAULT,autoPending=options.height==='auto',pressed=null;
const pinches=new Map(),lastSelectAt=new Map();
const plane=new THREE.Plane(new THREE.Vector3(0,1,0),-tableHeight);

function roundRect(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}
function placeTab(){const side=options.hand==='right'?-1:1;tab.mesh.position.set(side*.68,tableHeight+.2,-.42);tab.mesh.rotation.set(-.5,side*-.55,0,'YXZ');}
function applyHeight(h){
  tableHeight=clampHeight(h);table.position.y=tableHeight;
  // Legs run from under the top (0.11 m below the surface) to the floor.
  for(const leg of legs){const len=Math.max(.05,tableHeight-.11);leg.scale.y=len;leg.position.y=-.11-len/2;}
  board.mesh.position.set(0,tableHeight+.71,-1.75);menu.mesh.position.set(0,tableHeight+.46,-.55);placeTab();
  plane.constant=-tableHeight;
  camera.position.set(0,tableHeight+1.01,1.3);camera.lookAt(0,tableHeight+.04,-1.25);
  menuDirty=true;
}
applyHeight(options.height==='auto'?TABLE_DEFAULT:options.height);

const jointNames=['wrist','thumb-metacarpal','thumb-phalanx-proximal','thumb-phalanx-distal','thumb-tip','index-finger-metacarpal','index-finger-phalanx-proximal','index-finger-phalanx-intermediate','index-finger-phalanx-distal','index-finger-tip','middle-finger-metacarpal','middle-finger-phalanx-proximal','middle-finger-phalanx-intermediate','middle-finger-phalanx-distal','middle-finger-tip','ring-finger-metacarpal','ring-finger-phalanx-proximal','ring-finger-phalanx-intermediate','ring-finger-phalanx-distal','ring-finger-tip','pinky-finger-metacarpal','pinky-finger-phalanx-proximal','pinky-finger-phalanx-intermediate','pinky-finger-phalanx-distal','pinky-finger-tip'];
const handVisuals=new Map(),pokes=new Map();
function makeHandVisual(){const g=new THREE.Group();for(const name of jointNames){const dot=mesh(new THREE.SphereGeometry(name==='wrist'?.022:.014,10,8),0xefffff,0x36eeee);g.add(dot);}g.visible=false;scene.add(g);return g;}

// Leaving the game (Quest menu, another tab, taking the headset off) pauses
// the match into the menu; coming back starts clean: no stale presses, no
// giant frame step, sound resumed.
function clearInputState(){hover.clear();pokes.clear();pinches.clear();buttonsDown.clear();lastSelectAt.clear();lastHoverKey='';}
function goAway(){if(playing&&started&&!state.winner){menuOpen=true;menuDirty=true;}calibrating=null;clearInputState();acc=0;}
function comeBack(){clearInputState();last=0;acc=0;lastLabel='';menuDirty=true;if(options.sound&&audio&&audio.state!=='running')audio.resume().catch(()=>{});}
document.addEventListener('visibilitychange',()=>{if(renderer.xr.isPresenting)return;if(document.hidden)goAway();else comeBack();});
function startMatch(){state=initial();opponent=createOpponent(options.difficulty);smoothTarget={...state.paddles[0]};playing=true;started=true;intro=false;menuOpen=false;table.visible=true;acc=0;menuDirty=true;}
function openMenu(){if(intro)return;menuOpen=true;menuDirty=true;}
function skipIntro(){if(!intro)return;intro=false;menuOpen=true;table.visible=true;lastLabel='';menuDirty=true;}
function unlockSound(){if(!options.sound)return;audio??=new AudioContext();audio.resume().catch(()=>{});}
function isPaddleHand(source){return !source||source.handedness===options.hand||source.handedness==='none';}
function haptic(source,intensity=.55,duration=35){if(!options.haptics)return;try{const a=source?.gamepad?.hapticActuators?.[0];if(a?.pulse)a.pulse(intensity,duration).catch(()=>{});else if(source?.gamepad?.vibrationActuator?.playEffect)source.gamepad.vibrationActuator.playEffect('dual-rumble',{duration,strongMagnitude:intensity,weakMagnitude:intensity*.6}).catch(()=>{});}catch{}}
function say(text,seconds=2.5){notice=text;noticeT=seconds;lastLabel='';}
function impact(player=0){
  orb.scale.setScalar(1.3);
  if(player===0)haptic([...sources.values()].find(s=>s.handedness===options.hand),.8,50);
  if(!options.sound||!audio||audio.state!=='running')return;
  const o=audio.createOscillator(),g=audio.createGain(),p=audio.createPanner();p.panningModel='HRTF';p.positionX.value=state.puck.x-.5;p.positionY.value=tableHeight+.26;p.positionZ.value=state.puck.y-2.15;
  o.frequency.setValueAtTime(360,audio.currentTime);o.frequency.exponentialRampToValueAtTime(110,audio.currentTime+.09);g.gain.setValueAtTime(.05,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.1);o.connect(g).connect(p).connect(audio.destination);o.start();o.stop(audio.currentTime+.11);
}

// ---- Options menu ----------------------------------------------------------
const hover=new Map(); // pointer id -> {kind:'menu'|'tab', button}
function menuView(){return {started,over:!!state.winner,difficulty:options.difficulty,height:options.height,hand:options.hand,sound:options.sound,haptics:options.haptics,calibrating,inVR:renderer.xr.isPresenting};}
function drawMenu(){
  const c=menu.ctx,buttons=menuButtons(menuView()),hot=new Set([...hover.values()].filter(h=>h.kind==='menu'&&h.button).map(h=>h.button.id));
  c.clearRect(0,0,MENU_W,MENU_H);c.fillStyle='#100821f2';roundRect(c,6,6,MENU_W-12,MENU_H-12,40);c.fill();c.strokeStyle='#734394';c.lineWidth=6;c.stroke();
  c.textBaseline='middle';c.textAlign='left';c.fillStyle='#36eeee';c.font='bold 54px sans-serif';c.fillText('CREASE VR',56,74);
  c.fillStyle='#ffd15f';c.font='bold 30px sans-serif';c.textAlign='right';
  c.fillText(state.winner?(state.winner===1?'YOU WIN '+state.score.join(' : '):'CPU WINS '+state.score.join(' : ')):started?'PAUSED  '+state.score.join(' : '):'OPTIONS',MENU_W-56,74);
  c.textAlign='left';c.fillStyle='#c9b8e8';c.font='bold 30px sans-serif';
  c.fillText('CPU',56,342);c.fillText('TABLE HEIGHT',56,450);c.fillStyle='#ffffff';c.font='bold 34px sans-serif';c.fillText(Math.round(tableHeight*100)+' cm'+(options.height==='auto'?' · auto':''),56,490);
  c.fillStyle='#c9b8e8';c.font='bold 30px sans-serif';c.fillText('PADDLE HAND',56,582);c.fillText('VIBRATION',56,702);
  for(const b of buttons){
    const down=pressed&&pressed.id===b.id;
    c.fillStyle=down?'#ff3195':b.accent?'#36eeee':b.active?'#3a1f63':'#1b1032';roundRect(c,b.x,b.y,b.w,b.h,18);c.fill();
    c.lineWidth=hot.has(b.id)?8:3;c.strokeStyle=hot.has(b.id)?'#ff3195':b.active?'#36eeee':'#4a2d73';c.stroke();
    c.fillStyle=b.accent?'#120727':'#f5eaff';c.font='bold '+(b.label.length>10?30:38)+'px sans-serif';c.textAlign='center';c.fillText(b.label,b.x+b.w/2,b.y+b.h/2+2);c.textAlign='left';
  }
  menu.texture.needsUpdate=true;menuDirty=false;return buttons;
}
let buttons=drawMenu();
function click(){if(!options.sound||!audio||audio.state!=='running')return;const o=audio.createOscillator(),g=audio.createGain();o.frequency.value=1400;g.gain.setValueAtTime(.04,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.05);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+.06);}
function press(id,source){
  pressed={id,until:performance.now()+180};click();
  const action=applyButton(options,id);
  if(action==='primary'){if(!started||state.winner)startMatch();else{menuOpen=false;}}
  else if(action==='restart')startMatch();
  else if(action==='lower'||action==='raise'){options.height=stepHeight(tableHeight,action==='raise'?1:-1);applyHeight(options.height);}
  else if(action==='height'){applyHeight(autoTableHeight(eyeY));}
  else if(action==='match'){calibrating={until:performance.now()+3000,t:3};say('HOLD YOUR PADDLE HAND WHERE THE TABLE SHOULD BE',3.2);}
  else if(action==='difficulty'){opponent.level=options.difficulty;}
  else if(action==='hand'){handSelect.value=options.hand;placeTab();}
  else if(action==='sound'){if(options.sound)unlockSound();else audio?.suspend?.().catch(()=>{});}
  else if(action==='exit'){renderer.xr.getSession()?.end().catch(()=>{});}
  save();menuDirty=true;haptic(source,.35,20);
}
function handleSelect(id,source){
  // One press per pinch/trigger even if both our pinch detector and the
  // browser's select event fire for it.
  const key=source?.handedness||id,t=performance.now();if(t-(lastSelectAt.get(key)||0)<250)return;lastSelectAt.set(key,t);
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
  controller.addEventListener('selectstart',()=>{const s=sources.get(i);if(s?.hand)return;haptic(s,.4,25);handleSelect(i,s);});
}
enter.onclick=async()=>{
  enter.disabled=true;unlockSound();let session;
  try{session=await navigator.xr.requestSession('immersive-vr',{requiredFeatures:['local-floor'],optionalFeatures:['hand-tracking']});
    desktop=false;playing=false;started=false;state=initial();intro=true;menuOpen=false;introT=0;table.visible=false;autoPending=options.height==='auto';document.body.classList.add('in-vr');clearInputState();last=0;
    session.addEventListener('visibilitychange',()=>{if(session.visibilityState==='visible')comeBack();else goAway();});
    session.addEventListener('inputsourceschange',()=>{clearInputState();lastLabel='';});
    session.addEventListener('end',()=>{playing=false;menuOpen=false;calibrating=null;clearInputState();document.body.classList.remove('in-vr');enter.disabled=false;enter.textContent='Enter VR';status.textContent='VR ended. Enter again or return to the phone game.';});
    await renderer.xr.setSession(session);enter.textContent='In VR';
  }catch(e){await session?.end().catch(()=>{});status.textContent='VR could not start: '+e.message;enter.disabled=false;}
};
document.querySelector('#preview').onclick=()=>{desktop=true;unlockSound();startMatch();};

// Desktop: the mouse plays and clicks the menu; M or Esc opens it.
const ray=new THREE.Raycaster(),pointer=new THREE.Vector2(),hit=new THREE.Vector3();
function pointAt(id,origin,dir){
  ray.set(origin,dir);
  if(menuOpen){const [m]=ray.intersectObject(menu.mesh);if(m){const button=hitButton(buttons,m.uv.x*MENU_W,(1-m.uv.y)*MENU_H);hover.set(id,{kind:'menu',button});return m.distance;}}
  else if(tab.mesh.visible){const [t]=ray.intersectObject(tab.mesh);if(t){hover.set(id,{kind:'tab'});return t.distance;}}
  hover.delete(id);return 0;
}
renderer.domElement.addEventListener('pointermove',e=>{if(renderer.xr.isPresenting)return;pointer.set(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2);ray.setFromCamera(pointer,camera);
  pointAt('mouse',ray.ray.origin.clone(),ray.ray.direction.clone());
  if(!menuOpen&&ray.ray.intersectPlane(plane,hit)){table.worldToLocal(hit);target={x:hit.x+.5,y:hit.z+.9};}});
renderer.domElement.addEventListener('click',()=>{if(!renderer.xr.isPresenting&&desktop)handleSelect('mouse',null);});
addEventListener('keydown',e=>{if(renderer.xr.isPresenting||!desktop)return;if(e.key==='m'||e.key==='M'||e.key==='Escape'){if(menuOpen&&started&&!state.winner)menuOpen=false;else openMenu();menuDirty=true;}});

const local=new THREE.Vector3(),listenerPos=new THREE.Vector3(),forward=new THREE.Vector3(),up=new THREE.Vector3(),tmp=new THREE.Vector3(),tmp2=new THREE.Vector3(),dir=new THREE.Vector3();
const buttonsDown=new Map();
function setTarget(world){local.copy(world);table.worldToLocal(local);target={x:local.x+.5,y:local.z+.9};}
function jointPos(frame,hand,name,ref,out){const s=hand.get(name),p=s&&frame.getJointPose(s,ref);if(!p)return null;return out.set(p.transform.position.x,p.transform.position.y,p.transform.position.z);}
// The paddle sits under the middle of your palm, like holding a real mallet.
function palm(frame,hand,ref,out){const w=jointPos(frame,hand,'wrist',ref,tmp2),k=w&&jointPos(frame,hand,'middle-finger-phalanx-proximal',ref,out);return k?out.add(w).multiplyScalar(.5):null;}

renderer.setAnimationLoop((now,frame)=>{
  const gap=(now-last)/1000;const dt=last&&gap>0&&gap<.25?Math.min(gap,.05):0;last=now;let tracked=desktop,paddleY=NaN;
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
        let poke=pokes.get(s.handedness);if(!poke){poke={armed:false};pokes.set(s.handedness,poke);}
        const tip=jointPos(frame,s.hand,'index-finger-tip',ref,tmp2),panel=calibrating?null:menuOpen?menu.mesh:tab.mesh.visible?tab.mesh:null; // no presses while the hand is held still for MATCH MY HAND
        if(tip&&panel){const lp=panel.worldToLocal(tip.clone()),w=panel===menu.mesh?PANEL_W:TAB_W,h=panel===menu.mesh?PANEL_H:TAB_H,inside=Math.abs(lp.x)<w/2+.01&&Math.abs(lp.y)<h/2+.01;
          if(updatePoke(poke,inside?lp.z:NaN)){unlockSound();if(panel===tab.mesh)openMenu();else{const b=hitButton(buttons,(lp.x/w+.5)*MENU_W,(.5-lp.y/h)*MENU_H);if(b)press(b.id,s);}}}
        else poke.armed=false;
        // Pinch (thumb tip to index tip) = select, for pinch-ray presses and the free-hand menu pinch.
        let pinch=pinches.get(s.handedness);if(!pinch){pinch={down:false};pinches.set(s.handedness,pinch);}
        const th=jointPos(frame,s.hand,'thumb-tip',ref,tmp),ix=jointPos(frame,s.hand,'index-finger-tip',ref,tmp2);
        if(th&&ix&&updatePinch(pinch,th.distanceTo(ix))==='start'){let id=null;for(const [k,v] of sources)if(v===s)id=k;handleSelect(id??s.handedness,s);}
      }
      // Controller A/B/X/Y opens or closes the menu.
      const pad=s.gamepad;if(pad){const pressed=!!(pad.buttons[4]?.pressed||pad.buttons[5]?.pressed),was=buttonsDown.get(s)||false;buttonsDown.set(s,pressed);
        if(pressed&&!was){if(intro)skipIntro();else if(menuOpen&&started&&!state.winner){menuOpen=false;menuDirty=true;}else openMenu();}}
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
  if(pressed&&performance.now()>pressed.until){pressed=null;menuDirty=true;}
  if(menuDirty&&menu.mesh.visible)buttons=drawMenu();
  const live=renderer.xr.isPresenting?session?.visibilityState==='visible':!document.hidden;
  if(playing&&!menuOpen&&tracked&&live){followHand(smoothTarget,target,dt);acc+=dt;while(acc>=1/60){
    move(state,0,smoothTarget.x,smoothTarget.y);const ai=opponentMove(state,opponent,1/60);move(state,1,ai.x,ai.y);
    const vx=state.puck.vx,vy=state.puck.vy,score=state.score.join();step(state);
    if(state.score.join()!==score||vx*state.puck.vx<0||vy*state.puck.vy<0)impact(state.puck.y>.9?0:1);if(state.winner){menuOpen=true;menuDirty=true;}acc-=1/60;
  }}else acc=0;
  paddles.forEach((m,i)=>m.position.set(state.paddles[i].x-.5,0,state.paddles[i].y-.9));puck.position.set(state.puck.x-.5,.028,state.puck.y-.9);
  orb.rotation.y+=dt*.65;halo.rotation.z+=dt*.4;orb.scale.lerp(new THREE.Vector3(1,1,1),Math.min(1,dt*7));
  const label=notice?notice+(calibrating?'  '+Math.ceil(calibrating.t):''):intro?'BUILT FOR THE FOLD   ·   prodbyKCTW':state.winner?(state.winner===1?'YOU WIN':'CPU WINS'):menuOpen?(started?'PAUSED':'PICK PLAY TO START'):!playing?'OPEN THE MENU TO PLAY':!tracked?'TRACKING PAUSED — SHOW YOUR PADDLE HAND':state.countdown>0?'READY…':'FIRST TO 7';
  const sub=intro?'PINCH OR TRIGGER TO SKIP':menuOpen?'TOUCH A BUTTON · OR POINT AND PINCH':desktop&&!renderer.xr.isPresenting?'MOUSE TO PLAY · M FOR MENU':'FREE-HAND PINCH OR MENU TAB FOR OPTIONS';
  const text=(intro?'INTRO':started?state.score.join(' : '):'MENU')+' / '+label+' / '+sub;
  if(text!==lastLabel){lastLabel=text;const c=board.ctx;c.fillStyle='#100821';c.fillRect(0,0,1024,256);c.textAlign='center';c.textBaseline='alphabetic';const pulse=intro?1+.05*Math.sin(introT*5):1;c.save();c.translate(512,95);c.scale(pulse,pulse);c.fillStyle=intro?'#ff3195':'#36eeee';c.font='bold 70px sans-serif';
    if(window.CreaseLogo){const LG=window.CreaseLogo,lh=58,lw=LG.width(lh);if(!started)LG.draw(c,-lw/2,-lh,lh);else{const sc=state.score.join(' : '),sw=c.measureText(sc).width,gap=40,tot=lw+gap+sw;LG.draw(c,-tot/2,-lh,lh);c.textAlign='left';c.fillText(sc,-tot/2+lw+gap,0);c.textAlign='center';}}
    else c.fillText(started?'CREASE   '+state.score.join(' : '):'CREASE',0,0);
    c.restore();c.fillStyle='#fff';c.font=label.length>34?'bold 24px sans-serif':'bold 30px sans-serif';c.fillText(label,512,174);c.fillStyle='#ff3195';c.font='18px sans-serif';c.fillText(sub,512,220);board.texture.needsUpdate=true;status.textContent=label;}
  if(audio){const cam=renderer.xr.isPresenting?renderer.xr.getCamera():camera;cam.getWorldPosition(listenerPos);forward.set(0,0,-1).applyQuaternion(cam.quaternion);up.set(0,1,0).applyQuaternion(cam.quaternion);audio.listener.setPosition(listenerPos.x,listenerPos.y,listenerPos.z);audio.listener.setOrientation(forward.x,forward.y,forward.z,up.x,up.y,up.z);}
  renderer.render(scene,camera);
});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
// Test hook (local server or ?qa=1 only), same convention as the phone game.
if(/^(localhost|127\.0\.0\.1)$/.test(location.hostname)||new URLSearchParams(location.search).has('qa'))window.__creaseVR={options,get state(){return state;},get tableHeight(){return tableHeight;},get menuOpen(){return menuOpen;},get playing(){return playing;},get intro(){return intro;},get target(){return target;},press,handleSelect,hover,
  menuPoint(id){const b=buttons.find(x=>x.id===id);if(!b)return null;menu.mesh.updateMatrixWorld();const p=menu.mesh.localToWorld(new THREE.Vector3(((b.x+b.w/2)/MENU_W-.5)*PANEL_W,(.5-(b.y+b.h/2)/MENU_H)*PANEL_H,0));const n=new THREE.Vector3(0,0,1).transformDirection(menu.mesh.matrixWorld);return {p:{x:p.x,y:p.y,z:p.z},n:{x:n.x,y:n.y,z:n.z}};}};
try{const supported=await navigator.xr?.isSessionSupported('immersive-vr');enter.disabled=!supported;enter.textContent=supported?'Enter VR':'Open in Quest Browser';}catch{enter.textContent='VR unavailable';}
