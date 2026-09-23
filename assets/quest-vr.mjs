import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import {initial,move,step} from '../backend/online/physics.mjs';
import {followHand,createOpponent,opponentMove} from './quest-controls.mjs';

const status=document.querySelector('#status'),enter=document.querySelector('#enter'),hand=document.querySelector('#hand');
const scene=new THREE.Scene();scene.background=new THREE.Color('#080514');scene.fog=new THREE.Fog('#080514',5,15);
const camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.01,30);
camera.position.set(0,1.55,1.3);camera.lookAt(0,.58,-1.25);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.xr.enabled=true;renderer.xr.setReferenceSpaceType('local-floor');document.body.append(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xc7bbff,0x170924,2));
const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-2,4,1);scene.add(light);
// local-floor is measured from the Quest floor. Keep the play surface below
// the face, at a comfortable waist height, with the full table in view.
const table=new THREE.Group();table.position.set(0,.54,-1.25);scene.add(table);
function mesh(geometry,color,emissive=0){return new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,emissive,roughness:.32,metalness:.55}));}
function box(w,h,d,x,y,z,color,glow=0){const m=mesh(new THREE.BoxGeometry(w,h,d),color,glow);m.position.set(x,y,z);table.add(m);return m;}
box(1.06,.1,1.86,0,-.06,0,0x180d2c);box(1,.018,1.8,0,0,0,0x091b28);
for(const x of [-.515,.515])box(.025,.07,1.8,x,.025,0,0x4ce9ff,0x126478);
// The visible goal mouths match the shared physics goal width.
for(const z of [-.915,.915])for(const x of [-.375,.375])box(.25,.07,.025,x,.025,z,z<0?0xff3195:0x2de2e6);
for(const z of [-.925,.925])box(1.02,.018,.012,0,.065,z,0x6d3bba,0x24116b);
box(1,.002,.008,0,.012,0,0xbb66ff,0x673399);
for(const x of [-.4,.4])for(const z of [-.7,.7])box(.07,.72,.07,x,-.43,z,0x25143b);
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
const windowMesh=table.children[1];windowMesh.material.transparent=true;windowMesh.material.opacity=.65;windowMesh.material.depthWrite=false;
const halo=mesh(new THREE.TorusGeometry(.23,.006,8,48),0xff49b6,0x99195f);halo.rotation.x=.7;orb.add(halo);
const boardCanvas=document.createElement('canvas');boardCanvas.width=1024;boardCanvas.height=256;
const boardContext=boardCanvas.getContext('2d'),boardTexture=new THREE.CanvasTexture(boardCanvas);
const board=new THREE.Mesh(new THREE.PlaneGeometry(1.3,.325),new THREE.MeshBasicMaterial({map:boardTexture,side:THREE.DoubleSide}));board.position.set(0,1.25,-1.75);scene.add(board);
let state=initial(),playing=false,desktop=false,intro=true,menuOpen=false,introT=0,last=0,acc=0,lastLabel='',audio;
let target={x:.5,y:1.6},smoothTarget={x:.5,y:1.6},opponent=createOpponent();const sources=new Map();
const jointNames=['wrist','thumb-metacarpal','thumb-phalanx-proximal','thumb-phalanx-distal','thumb-tip','index-finger-metacarpal','index-finger-phalanx-proximal','index-finger-phalanx-intermediate','index-finger-phalanx-distal','index-finger-tip','middle-finger-metacarpal','middle-finger-phalanx-proximal','middle-finger-phalanx-intermediate','middle-finger-phalanx-distal','middle-finger-tip','ring-finger-metacarpal','ring-finger-phalanx-proximal','ring-finger-phalanx-intermediate','ring-finger-phalanx-distal','ring-finger-tip','pinky-finger-metacarpal','pinky-finger-phalanx-proximal','pinky-finger-phalanx-intermediate','pinky-finger-phalanx-distal','pinky-finger-tip'];
const handVisuals=new Map();
function makeHandVisual(){const g=new THREE.Group();for(const name of jointNames){const dot=mesh(new THREE.SphereGeometry(name==='wrist'?.022:.014,10,8),0xefffff,0x36eeee);g.add(dot);}g.visible=false;scene.add(g);return g;}
const controllerVisuals=[];
function reset(){state=initial();opponent=createOpponent();smoothTarget={...state.paddles[0]};playing=true;intro=false;menuOpen=false;table.visible=true;acc=0;}
function skipIntro(){if(!intro)return;intro=false;menuOpen=true;table.visible=true;lastLabel='';}
function unlockSound(){audio??=new AudioContext();audio.resume().catch(()=>{});}
function haptic(source, intensity=.55, duration=35){try{const a=source?.gamepad?.hapticActuators?.[0];if(a?.pulse)a.pulse(intensity,duration).catch(()=>{});else if(source?.gamepad?.vibrationActuator?.playEffect)source.gamepad.vibrationActuator.playEffect('dual-rumble',{duration,strongMagnitude:intensity,weakMagnitude:intensity*.6}).catch(()=>{});}catch{}}
function impact(player=0){
  orb.scale.setScalar(1.3);
  const source=[...sources.values()].find(s=>s.handedness===hand.value);
  if(player===0)haptic(source,.8,50);
  if(!audio||audio.state!=='running')return;
  const o=audio.createOscillator(),g=audio.createGain(),p=audio.createPanner();p.panningModel='HRTF';p.positionX.value=state.puck.x-.5;p.positionY.value=.8;p.positionZ.value=state.puck.y-2.05;
  o.frequency.setValueAtTime(360,audio.currentTime);o.frequency.exponentialRampToValueAtTime(110,audio.currentTime+.09);g.gain.setValueAtTime(.05,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.1);o.connect(g).connect(p).connect(audio.destination);o.start();o.stop(audio.currentTime+.11);
}
for(let i=0;i<2;i++){
  const controller=renderer.xr.getController(i);scene.add(controller);
  const grip=renderer.xr.getControllerGrip(i),gripMesh=mesh(new THREE.CapsuleGeometry(.025,.11,6,12),0x9eecff,0x1685a0);gripMesh.rotation.x=Math.PI/2;gripMesh.visible=false;grip.add(gripMesh);controllerVisuals.push(gripMesh);
  controller.addEventListener('connected',e=>{sources.set(i,e.data);gripMesh.visible=true;});controller.addEventListener('disconnected',()=>{sources.delete(i);gripMesh.visible=false;});
  controller.addEventListener('selectstart',()=>{if(sources.get(i)?.handedness!==hand.value)return;const source=sources.get(i);unlockSound();haptic(source,.55,35);if(intro)skipIntro();else if(!playing||state.winner)reset();});
}
enter.onclick=async()=>{
  enter.disabled=true;unlockSound();let session;
  try{session=await navigator.xr.requestSession('immersive-vr',{requiredFeatures:['local-floor'],optionalFeatures:['hand-tracking']});
    desktop=false;playing=false;state=initial();intro=true;menuOpen=false;introT=0;table.visible=false;document.body.classList.add('in-vr');
    session.addEventListener('end',()=>{playing=false;document.body.classList.remove('in-vr');enter.disabled=false;enter.textContent='Enter VR';status.textContent='VR ended. Enter again or return to the phone game.';});
    await renderer.xr.setSession(session);enter.textContent='In VR';
  }catch(e){await session?.end().catch(()=>{});status.textContent='VR could not start: '+e.message;enter.disabled=false;}
};
document.querySelector('#preview').onclick=()=>{desktop=true;unlockSound();reset();};
const ray=new THREE.Raycaster(),pointer=new THREE.Vector2(),hit=new THREE.Vector3(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),-table.position.y);
renderer.domElement.addEventListener('pointermove',e=>{if(renderer.xr.isPresenting)return;pointer.set(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2);ray.setFromCamera(pointer,camera);if(ray.ray.intersectPlane(plane,hit)){table.worldToLocal(hit);target={x:hit.x+.5,y:hit.z+.9};}});
const local=new THREE.Vector3(),listenerPos=new THREE.Vector3(),forward=new THREE.Vector3(),up=new THREE.Vector3();
renderer.setAnimationLoop((now,frame)=>{
  const dt=Math.min((now-last)/1000||0,.05);last=now;let tracked=desktop;
  const session=renderer.xr.getSession();
  let pinch=false;
  if(frame&&session){
    tracked=false;const source=[...session.inputSources].find(s=>s.handedness===hand.value&&s.gripSpace);
    const ref=renderer.xr.getReferenceSpace();
    const handSource=[...session.inputSources].find(s=>s.handedness===hand.value&&s.hand);
    const pose=source&&frame.getPose(source.gripSpace,ref);
    if(pose&&session.visibilityState==='visible'){local.set(pose.transform.position.x,pose.transform.position.y,pose.transform.position.z);table.worldToLocal(local);target={x:local.x+.5,y:local.z+.9};tracked=true;}
    for(const hv of handVisuals.values())hv.visible=false;
    if(!pose&&handSource){
      const tip=handSource.hand.get('index-finger-tip'),thumb=handSource.hand.get('thumb-tip'),tp=tip&&frame.getJointPose(tip,ref),th=thumb&&frame.getJointPose(thumb,ref);
      if(tp){local.set(tp.transform.position.x,tp.transform.position.y,tp.transform.position.z);table.worldToLocal(local);target={x:local.x+.5,y:local.z+.9};tracked=true;}
      pinch=!!(tp&&th&&Math.hypot(tp.transform.position.x-th.transform.position.x,tp.transform.position.y-th.transform.position.y,tp.transform.position.z-th.transform.position.z)<.035);
      let hv=handVisuals.get(handSource.handedness);if(!hv){hv=makeHandVisual();handVisuals.set(handSource.handedness,hv);}hv.visible=true;for(let j=0;j<jointNames.length;j++){const jp=frame.getJointPose(handSource.hand.get(jointNames[j]),ref);if(jp)hv.children[j].position.set(jp.transform.position.x,jp.transform.position.y,jp.transform.position.z);}
    }
    // No controller or hand required: aim the paddle with the headset gaze.
    if(!tracked){const vp=frame.getViewerPose(ref),view=vp?.views?.[0];if(view){const origin=new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(view.transform.matrix));const dir=new THREE.Vector3(0,0,-1).applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().fromArray(view.transform.matrix))).normalize();if(new THREE.Ray(origin,dir).intersectPlane(plane,hit)){table.worldToLocal(hit);target={x:hit.x+.5,y:hit.z+.9};tracked=true;}}}
    if(pinch){if(intro)skipIntro();else if(!playing||state.winner)reset();}
  }
  if(intro){introT+=dt;if(introT>4.8)skipIntro();}
  if(playing&&tracked&&!document.hidden){followHand(smoothTarget,target,dt);acc+=dt;while(acc>=1/60){
    move(state,0,smoothTarget.x,smoothTarget.y);const ai=opponentMove(state,opponent,1/60);move(state,1,ai.x,ai.y);
    const vx=state.puck.vx,vy=state.puck.vy,score=state.score.join();step(state);
    if(state.score.join()!==score||vx*state.puck.vx<0||vy*state.puck.vy<0)impact(state.puck.y>.9?0:1);if(state.winner)menuOpen=true;acc-=1/60;
  }}else acc=0;
  paddles.forEach((m,i)=>m.position.set(state.paddles[i].x-.5,0,state.paddles[i].y-.9));puck.position.set(state.puck.x-.5,.028,state.puck.y-.9);
  orb.rotation.y+=dt*.65;halo.rotation.z+=dt*.4;orb.scale.lerp(new THREE.Vector3(1,1,1),Math.min(1,dt*7));
  const label=intro?'CREƎSE   ·   BUILT FOR THE FOLD   ·   prodbyKCTW':menuOpen?'SOLO VS CPU   ·   2 PLAYERS   ·   GARAGE   ·   PROGRESS   ·   SETTINGS':state.winner?(state.winner===1?'YOU WIN — TRIGGER TO REMATCH':'CPU WINS — TRIGGER TO REMATCH'):!playing?'PULL YOUR PADDLE-HAND TRIGGER':!tracked?'TRACKING PAUSED — PICK UP CONTROLLER':state.countdown>0?'READY…':'FIRST TO 7';
  const text=intro?'CREASE VR INTRO':menuOpen?'CREASE VR MENU':state.score.join(' : ')+' / '+label;
  if(text!==lastLabel){lastLabel=text;boardContext.fillStyle='#100821';boardContext.fillRect(0,0,1024,256);boardContext.textAlign='center';const pulse=intro?1+.05*Math.sin(introT*5):1;boardContext.save();boardContext.translate(512,95);boardContext.scale(pulse,pulse);boardContext.fillStyle=intro?'#ff3195':'#36eeee';boardContext.font='bold 70px sans-serif';boardContext.fillText(intro?'CREASE':menuOpen?'CREASE':'CREASE   '+state.score.join(' : '),0,0);boardContext.restore();boardContext.fillStyle='#fff';boardContext.font=intro?'bold 24px sans-serif':menuOpen?'bold 24px sans-serif':'28px sans-serif';boardContext.fillText(label,512,174);boardContext.fillStyle='#ff3195';boardContext.font='18px sans-serif';boardContext.fillText(intro?'TRIGGER OR PINCH TO SKIP':menuOpen?'ONE SCREEN · TWO PLAYERS · FIRST TO 7':'TRIGGER TO OPEN MENU',512,220);boardTexture.needsUpdate=true;status.textContent=text;}
  if(audio){const cam=renderer.xr.isPresenting?renderer.xr.getCamera():camera;cam.getWorldPosition(listenerPos);forward.set(0,0,-1).applyQuaternion(cam.quaternion);up.set(0,1,0).applyQuaternion(cam.quaternion);audio.listener.setPosition(listenerPos.x,listenerPos.y,listenerPos.z);audio.listener.setOrientation(forward.x,forward.y,forward.z,up.x,up.y,up.z);}
  renderer.render(scene,camera);
});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
try{const supported=await navigator.xr?.isSessionSupported('immersive-vr');enter.disabled=!supported;enter.textContent=supported?'Enter VR':'Open in Quest Browser';}catch{enter.textContent='VR unavailable';}
