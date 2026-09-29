import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('touch grabs preserve the point touched and reject off-paddle snaps', () => {
  const src = html.slice(html.indexOf('function setTarget('), html.indexOf("cv.addEventListener('pointerdown'"));
  const ctx = vm.createContext({view:{L:1.8},clamp:(v,a,b)=>Math.max(a,Math.min(b,v))});
  vm.runInContext(src, ctx);
  const paddle={p:1,r:.085,u:.5,v:1.6,dragAnchor:{u:.5,v:1.6,fu:.3,fv:1.4}};
  ctx.setTarget(paddle,{u:.3,v:1.4});
  assert.equal(paddle.tu,.5);
  assert.equal(paddle.tv,1.6);
  assert.equal(ctx.canGrabPaddle(paddle,{u:.5,v:1.6}),true);
  assert.equal(ctx.canGrabPaddle(paddle,{u:.1,v:1.2}),false);
});

test('player-centered feedback is present without coercive UI', () => {
  assert.match(html,/RALLY · KEEP IT CLEAN/);
  assert.match(html,/RESET · ONE CLEAN RETURN/);
  assert.match(html,/overReflection/);
  assert.match(html,/best rally/);
});
