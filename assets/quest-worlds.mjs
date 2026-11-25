// CREASE VR worlds: the manager. Shows the 3D world of the picked arena (its module and its data are fetched the first time the arena is
// picked, and everything is released when the arena changes) and tells quest-vr.mjs whether it took over from the flat painted backdrop.
// Arenas without a world, and a software GL (CI, emulators; ?world=1 forces a world on, ?world=0 off), keep the flat plate.
// The budgets and the mapping are in quest-world-pure.mjs.
import {worldFor,worldAllowed,worldDetail} from './quest-world-pure.mjs';

const FAR=700; // metres: the sky dome of a world is far beyond the bare room's 40 m

export function createWorlds({scene,renderer,camera,soft=false,search=''}){
  const allowed=worldAllowed(search,soft),farWas=camera.far;let cur=null,token=0,lastError='',step=0;
  function clear(){token++;if(!cur)return;try{cur.dispose();}catch{}cur=null;camera.far=farWas;camera.updateProjectionMatrix();}
  // Resolves true when the arena's world is on screen (the caller then hides the flat plate and the floor grid).
  async function show(id,colors,plate){
    if(!allowed||!worldFor(id)||!plate){clear();return false;}
    if(cur&&cur.id===id)return true;
    clear();const my=token;
    try{
      const mod=await import('./quest-world-'+id+'.mjs');if(my!==token)return false;
      const w=await mod.build({renderer,colors,plate,aniso:soft?1:Math.min(8,renderer.capabilities.getMaxAnisotropy())});
      if(my!==token){w.dispose();return false;}
      scene.add(w.group);cur=w;w.detail(worldDetail(step));camera.far=FAR;camera.updateProjectionMatrix();lastError='';return true;
    }catch(e){lastError=String(e&&e.stack||e);if(my===token)clear();return false;}
  }
  return {show,clear,get active(){return cur?cur.id:'';},get error(){return lastError;},get allowed(){return allowed;},
    update(t){if(cur)cur.update(t);},
    // the adaptive quality controller's step (0 best): sheds the drifting extras, then the reflection
    quality(s){if(s===step)return;step=s;if(cur)cur.detail(worldDetail(s));},
    stats(){return cur?cur.stats():null;},get current(){return cur;}};
}
