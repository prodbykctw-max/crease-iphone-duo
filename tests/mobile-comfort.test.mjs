import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const cfg=vm.runInNewContext('('+html.match(/const CFG = (\{[^\n]+\});/)[1]+')');
test('mobile has gentler caps and Easy is selected by default',()=>{
  assert.equal(cfg.maxSpd,1.65);assert.equal(cfg.smashSpd,2.2);assert.equal(cfg.fric,.08);
  assert.match(html,/data-d="easy" class="on"/);assert.match(html,/diff: 'easy'/);
});
test('relative touch avoids touchdown jumps and reverses immediately at rails',()=>{
  const source=html.slice(html.indexOf('function setTarget('),html.indexOf("cv.addEventListener('pointerdown'"));
  const ctx=vm.createContext({view:{L:1.8},clamp:(v,a,b)=>Math.max(a,Math.min(b,v))});vm.runInContext(source,ctx);
  const p={p:1,r:.085,u:.5,v:1.6,dragAnchor:{u:.5,v:1.6,fu:.1,fv:1.2}};
  ctx.setTarget(p,{u:.1,v:1.2});assert.equal(p.tu,.5);assert.ok(Math.abs(p.tv-1.6)<1e-9);
  ctx.setTarget(p,{u:2,v:1.2});assert.equal(p.tu,.915);
  ctx.setTarget(p,{u:1.9,v:1.2});assert.ok(Math.abs(p.tu-.815)<1e-9);
});
test('mobile inline scripts parse',()=>{
  for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
    if(!/src=|application\/ld\+json|type="module"/.test(m[1]))new vm.Script(m[2]);
  }
});
