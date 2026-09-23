import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import {initial,move,step} from '../backend/online/physics.mjs';

const status=document.querySelector('#status'),enter=document.querySelector('#enter'),hand=document.querySelector('#hand');
const scene=new THREE.Scene();scene.background=new THREE.Color('#080514');scene.fog=new THREE.Fog('#080514',5,15);
const camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.01,30);
camera.position.set(0,1.8,1.3);camera.lookAt(0,.8,-1.1);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.xr.enabled=true;renderer.xr.setReferenceSpaceType('local-floor');document.body.append(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xc7bbff,0x170924,2));
const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-2,4,1);scene.add(light);
const table=new THREE.Group();table.position.set(0,.78,-1.15);scene.add(table);
function mesh(geometry,color,emissive=0){return new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,emissive,roughness:.32,metalness:.55}));}
function box(w,h,d,x,y,z,color,glow=0){const m=mesh(new THREE.BoxGeometry(w,h,d),color,glow);m.position.set(x,y,z);table.add(m);return m;}
box(1.06,.1,1.86,0,-.06,0,0x180d2c);box(1,.018,1.8,0,0,0,0x091b28);
for(const x of [-.515,.515])box(.025,.07,1.8,x,.025,0,0x4ce9ff,0x126478);
// The visible goal mouths match the shared physics goal width.
for(const z of [-.915,.915])for(const x of [-.375,.375])box(.25,.07,.025,x,.025,z,z<0?0xff3195:0x2de2e6);
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
const board=new THREE.Mesh(new THREE.PlaneGeometry(1.3,.325),new THREE.MeshBasicMaterial({map:boardTexture,side:THREE.DoubleSide}));board.position.set(0,1.5,-2.2);scene.add(board);
let state=initial(),playing=false,desktop=false,last=0,acc=0,lastLabel='',audio;
let target={x:.5,y:1.6},smoothTarget={x:.5,y:1.6};const sources=new Map();
function reset(){state=initial();playing=true;acc=0;}
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
  controller.addEventListener('connected',e=>sources.set(i,e.data));controller.addEventListener('disconnected',()=>sources.delete(i));
  controller.addEventListener('selectstart',()=>{if(sources.get(i)?.handedness!==hand.value)return;const source=sources.get(i);unlockSound();haptic(source,.55,35);if(!playing||state.winner)reset();});
}
enter.onclick=async()=>{
  enter.disabled=true;unlockSound();let session;
  try{session=await navigator.xr.requestSession('immersive-vr',{requiredFeatures:['local-floor']});
    desktop=false;playing=false;state=initial();document.body.classList.add('in-vr');
    session.addEventListener('end',()=>{playing=false;document.body.classList.remove('in-vr');enter.disabled=false;enter.textContent='Enter VR';status.textContent='VR ended. Enter again or return to the phone game.';});
    await renderer.xr.setSession(session);enter.textContent='In VR';
  }catch(e){await session?.end().catch(()=>{});status.textContent='VR could not start: '+e.message;enter.disabled=false;}
};
document.querySelector('#preview').onclick=()=>{desktop=true;unlockSound();reset();};
const ray=new THREE.Raycaster(),pointer=new THREE.Vector2(),hit=new THREE.Vector3(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),-.8);
renderer.domElement.addEventListener('pointermove',e=>{if(renderer.xr.isPresenting)return;pointer.set(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2);ray.setFromCamera(pointer,camera);if(ray.ray.intersectPlane(plane,hit)){table.worldToLocal(hit);target={x:hit.x+.5,y:hit.z+.9};}});
const local=new THREE.Vector3(),listenerPos=new THREE.Vector3(),forward=new THREE.Vector3(),up=new THREE.Vector3();
renderer.setAnimationLoop((now,frame)=>{
  const dt=Math.min((now-last)/1000||0,.05);last=now;let tracked=desktop;
  const session=renderer.xr.getSession();
  if(frame&&session){
    tracked=false;const source=[...session.inputSources].find(s=>s.handedness===hand.value&&s.gripSpace);
    const pose=source&&frame.getPose(source.gripSpace,renderer.xr.getReferenceSpace());
    if(pose&&session.visibilityState==='visible'){local.set(pose.transform.position.x,pose.transform.position.y,pose.transform.position.z);table.worldToLocal(local);target={x:local.x+.5,y:local.z+.9};tracked=true;}
  }
  if(playing&&tracked&&!document.hidden){acc+=dt;while(acc>=1/60){
    const smoothing=1-Math.exp(-dt*18);smoothTarget.x+=(target.x-smoothTarget.x)*smoothing;smoothTarget.y+=(target.y-smoothTarget.y)*smoothing;
    move(state,0,smoothTarget.x,smoothTarget.y);const ai=state.paddles[1];move(state,1,ai.x+Math.max(-.007,Math.min(.007,state.puck.x-ai.x)),.22);
    const vx=state.puck.vx,vy=state.puck.vy,score=state.score.join();step(state);
    if(state.score.join()!==score||vx*state.puck.vx<0||vy*state.puck.vy<0)impact(state.puck.y>.9?0:1);acc-=1/60;
  }}else acc=0;
  paddles.forEach((m,i)=>m.position.set(state.paddles[i].x-.5,0,state.paddles[i].y-.9));puck.position.set(state.puck.x-.5,.028,state.puck.y-.9);
  orb.rotation.y+=dt*.65;halo.rotation.z+=dt*.4;orb.scale.lerp(new THREE.Vector3(1,1,1),Math.min(1,dt*7));
  const label=state.winner?(state.winner===1?'YOU WIN — TRIGGER TO REMATCH':'CPU WINS — TRIGGER TO REMATCH'):!playing?'PULL YOUR PADDLE-HAND TRIGGER':!tracked?'TRACKING PAUSED — PICK UP CONTROLLER':state.countdown>0?'READY…':'FIRST TO 7';
  const text=state.score.join(' : ')+' / '+label;
  if(text!==lastLabel){lastLabel=text;boardContext.fillStyle='#100821';boardContext.fillRect(0,0,1024,256);boardContext.textAlign='center';boardContext.fillStyle='#36eeee';boardContext.font='bold 82px sans-serif';boardContext.fillText('CREASE   '+state.score.join(' : '),512,110);boardContext.fillStyle='#fff';boardContext.font='28px sans-serif';boardContext.fillText(label,512,190);boardTexture.needsUpdate=true;status.textContent=text;}
  if(audio){const cam=renderer.xr.isPresenting?renderer.xr.getCamera():camera;cam.getWorldPosition(listenerPos);forward.set(0,0,-1).applyQuaternion(cam.quaternion);up.set(0,1,0).applyQuaternion(cam.quaternion);audio.listener.setPosition(listenerPos.x,listenerPos.y,listenerPos.z);audio.listener.setOrientation(forward.x,forward.y,forward.z,up.x,up.y,up.z);}
  renderer.render(scene,camera);
});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
try{const supported=await navigator.xr?.isSessionSupported('immersive-vr');enter.disabled=!supported;enter.textContent=supported?'Enter VR':'Open in Quest Browser';}catch{enter.textContent='VR unavailable';}
