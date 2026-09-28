import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('resizing preserves table state, releases touches and skips duplicate work',()=>{
  let builds=0;
  const paddle={ptr:3,dragAnchor:{},u:.5,v:1.4},game={paddles:[paddle],score:[3,2]};
  const view={vw:0,vh:0,land:false,L:1.8,safe:{t:20,r:45,b:25,l:0}};
  const context=vm.createContext({view,game,window:{innerWidth:390,innerHeight:844,devicePixelRatio:3},cv:{style:{}},ptrs:new Map([[3,paddle]]),readSafe(){},clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),rescaleV(){},placeBumpers(){},sceneLayers:{},buildBg(){builds++;},placePause(){},updateHint(){},onFold(){}});
  vm.runInContext(html.slice(html.indexOf('function layout()'),html.indexOf('function fieldTf(')),context);
  context.layout();assert.equal(builds,1);context.layout();assert.equal(builds,1);
  context.window.innerWidth=1000;context.window.innerHeight=800;context.layout();
  assert.equal(builds,2);assert.equal(paddle.ptr,null);assert.equal(paddle.dragAnchor,null);
  assert.deepEqual(game.score,[3,2]);assert.ok(context.cv.width*context.cv.height<2504000);
  assert.ok(view.ox>=view.safe.l&&view.oy>=view.safe.t);
});
