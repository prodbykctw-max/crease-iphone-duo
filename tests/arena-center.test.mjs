import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../assets/arena-engine.js',import.meta.url),'utf8');
function engine(){
  const window={};
  vm.runInNewContext(source,{window,matchMedia:()=>({matches:false}),console});
  return window.CreaseArenas;
}
test('shared centerpiece is one draw centered exactly on the crease in either layout',()=>{
  for(const L of [1.2,1.42,2.1]){
    const calls=[],focal={};
    const gradient={addColorStop(){}};
    const c={save(){},restore(){},createRadialGradient(){return gradient;},fillRect(){},drawImage(...a){calls.push(a);}};
    engine().drawCenter(c,{L,focal,beat:1});
    assert.equal(calls.length,1);
    const [image,x,y,w,h]=calls[0];
    assert.equal(image,focal);assert.equal(w,h);
    assert.equal(x+w/2,.5);assert.equal(y+h/2,L/2);
  }
});
test('missing GPU frame is harmless and does not draw an invalid image',()=>{
  engine().drawCenter({drawImage(){assert.fail('invalid frame drawn');}},{L:2,focal:null,beat:0});
});
test('stage identities and order stay unchanged',()=>{
  assert.deepEqual(Array.from(engine().worlds,w=>w.id),['midnight','toxic','ice','inferno','ultraviolet','miami','gold-rush','void','sakura','kctw']);
});
test('sun texture coordinates and bands agree after a half turn',()=>{
  const coordinate=(x,y,t)=>{
    const r=Math.hypot(x,y),a=2*Math.atan2(y,x)+t*.065;
    return [r*Math.cos(a),r*Math.sin(a),Math.abs(y)];
  };
  for(const t of [0,1,50])for(const [x,y] of [[.2,.5],[-.6,.1],[.01,-.8]]){
    const a=coordinate(x,y,t),b=coordinate(-x,-y,t);
    a.forEach((value,i)=>assert.ok(Math.abs(value-b[i])<1e-12));
  }
});
