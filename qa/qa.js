const { chromium } = require('playwright');
const path = require('path');
const FILE = process.env.QA_URL || 'http://127.0.0.1:8765/index.html';
const URL = FILE + '?nointro';
const OUT = process.env.OUT || __dirname + '/shots';
require('fs').mkdirSync(OUT, { recursive: true });

const CLOSED = { width: 466, height: 678 };  // 1398x2034 @3x
const OPEN = { width: 890, height: 626 };    // 2670x1878 @3x
const results = [];
const ok = (name, cond, info = '') => { results.push([cond ? 'PASS' : 'FAIL', name, info]); };

const checkFn = () => {
  const { game, view } = window.__crease; const L = view.L; const bad = [];
  for (const p of game.pucks) {
    if (![p.u, p.v, p.vu, p.vv].every(Number.isFinite)) bad.push('puck NaN');
    if (p.u < -0.01 || p.u > 1.01 || p.v < -0.2 || p.v > L + 0.2) bad.push(`puck out ${p.u.toFixed(3)},${p.v.toFixed(3)}`);
  }
  for (const d of game.paddles) {
    if (![d.u, d.v].every(Number.isFinite)) bad.push('paddle NaN');
    const lo = d.p === 1 ? L / 2 - 1e-3 : -1e-3, hi = d.p === 1 ? L + 1e-3 : L / 2 + 1e-3;
    if (d.v < lo || d.v > hi) bad.push(`paddle ${d.p} crossed half v=${d.v.toFixed(3)}`);
  }
  return bad;
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: CLOSED, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: OUT + '/1-closed-menu.png' });
  let v = await page.evaluate(() => ({ land: window.__crease.view.land, L: window.__crease.view.L, hint: document.getElementById('screenHint').textContent, rec: document.getElementById('bSolo').className }));
  ok('closed detected as portrait', v.land === false, JSON.stringify(v));
  ok('solo recommended when closed', v.rec.includes('rec'));

  // Demo long run: invariants + matches finish
  const demo = await page.evaluate((check) => {
    const f = new Function('return (' + check + ')()');
    const c = window.__crease; const issues = new Set(); let matches = 0, prev = 0;
    for (let i = 0; i < 1800; i++) { c.sim(1); f().forEach(x => issues.add(x)); const s = c.game.score[0] + c.game.score[1]; if (s < prev) matches++; prev = s; }
    return { issues: [...issues].slice(0, 10), matches };
  }, checkFn.toString());
  ok('30 min CPU-vs-CPU sim: no NaN / escapes / half crossing', demo.issues.length === 0, demo.issues.join('; '));
  ok('CPU-vs-CPU matches complete', demo.matches >= 3, 'matches finished: ' + demo.matches);

  // Solo start
  await page.tap('#bSolo');
  await page.waitForTimeout(300);
  let st = await page.evaluate(() => ({ mode: window.__crease.game.mode, state: window.__crease.game.state, menuHidden: document.getElementById('menu').classList.contains('hidden'), pauseVis: !document.getElementById('bPause').classList.contains('hidden') }));
  ok('solo starts', st.mode === 'solo' && st.menuHidden && st.pauseVis, JSON.stringify(st));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: OUT + '/2-closed-countdown.png' });

  // touch drag moves P1 paddle; cannot cross the crease
  const cdp = await ctx.newCDPSession(page);
  const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i })) });
  const target = await page.evaluate(() => window.__crease.toScreen(0.3, window.__crease.view.L * 0.8));
  await touch('touchStart', [target]);
  await page.waitForTimeout(400);
  let pd = await page.evaluate(() => ({ u: window.__crease.game.paddles[0].u, v: window.__crease.game.paddles[0].v, L: window.__crease.view.L }));
  ok('touch moves P1 paddle', Math.abs(pd.u - 0.3) < 0.03 && Math.abs(pd.v - (pd.L * 0.8 - 0.03)) < 0.03, JSON.stringify(pd));
  const over = await page.evaluate(() => window.__crease.toScreen(0.5, window.__crease.view.L * 0.1));
  await touch('touchMove', [over]);
  await page.waitForTimeout(400);
  pd = await page.evaluate(() => ({ v: window.__crease.game.paddles[0].v, min: window.__crease.view.L / 2 + window.__crease.game.paddles[0].r }));
  ok('P1 paddle stops at the crease', Math.abs(pd.v - pd.min) < 0.01, JSON.stringify(pd));
  await touch('touchEnd', []);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT + '/3-closed-play.png' });

  // UNFOLD mid-match
  const before = await page.evaluate(() => ({ score: [...window.__crease.game.score], state: window.__crease.game.state }));
  await page.setViewportSize(OPEN);
  await page.waitForTimeout(150);
  v = await page.evaluate(() => ({ land: window.__crease.view.land, L: window.__crease.view.L, state: window.__crease.game.state, score: [...window.__crease.game.score], mode: window.__crease.game.mode }));
  ok('unfold detected as landscape', v.land === true, JSON.stringify(v));
  ok('match survives unfold (same mode + score, fold hold)', v.mode === 'solo' && JSON.stringify(v.score) === JSON.stringify(before.score) && (v.state === 'fold' || before.state === 'over'), JSON.stringify({ before, v }));
  const hinge = await page.evaluate(() => { const c = window.__crease; return { x: c.toScreen(0.5, c.view.L / 2).x, mid: window.innerWidth / 2 }; });
  ok('crease sits on the hinge (screen center)', Math.abs(hinge.x - hinge.mid) < 1, JSON.stringify(hinge));
  await page.screenshot({ path: OUT + '/4-open-fold-toast.png' });
  await page.waitForTimeout(1600);
  st = await page.evaluate(() => window.__crease.game.state);
  ok('play resumes after unfold', st === 'play' || st === 'countdown' || st === 'goal', st);
  const bad = await page.evaluate(`(${checkFn})()`);
  ok('invariants after unfold', bad.length === 0, bad.join(';'));

  // 2P on open table with real multitouch
  await page.evaluate(() => window.__crease.start('duo'));
  await page.waitForTimeout(2000);
  const [a, b] = await page.evaluate(() => { const c = window.__crease, L = c.view.L; return [c.toScreen(0.7, L * 0.85), c.toScreen(0.25, L * 0.15)]; });
  await touch('touchStart', [{ ...a, id: 1 }, { ...b, id: 2 }]);
  await page.waitForTimeout(500);
  const two = await page.evaluate(() => window.__crease.game.paddles.map(p => ({ u: +p.u.toFixed(3), v: +p.v.toFixed(3) })));
  const L = await page.evaluate(() => window.__crease.view.L);
  ok('two simultaneous touches drive both paddles', Math.abs(two[0].u - 0.7) < 0.03 && Math.abs(two[1].u - 0.25) < 0.03 && two[0].v > L / 2 && two[1].v < L / 2, JSON.stringify(two));
  await page.evaluate(() => { const g = window.__crease.game; g.pups.push({ type: 'MULTI', u: 0.5, v: window.__crease.view.L / 2, r: 0.045, life: 9, dead: false }); g.shields[1] = 5; g.paddles[0].big = 5; });
  await page.waitForTimeout(600);
  await page.screenshot({ path: OUT + '/5-open-duo.png' });
  await touch('touchEnd', []);

  // FOLD mid 2P match
  await page.setViewportSize(CLOSED);
  await page.waitForTimeout(150);
  v = await page.evaluate(() => ({ land: window.__crease.view.land, state: window.__crease.game.state, mode: window.__crease.game.mode }));
  ok('fold back to closed keeps 2P match', v.land === false && v.mode === 'duo' && v.state === 'fold', JSON.stringify(v));
  await page.waitForTimeout(1500);
  const bad2 = await page.evaluate(`(${checkFn})()`);
  ok('invariants after fold', bad2.length === 0, bad2.join(';'));
  await page.screenshot({ path: OUT + '/6-closed-duo.png' });

  // Pause / resume / win flow
  await page.tap('#bPause');
  await page.waitForTimeout(200);
  st = await page.evaluate(() => ({ s: window.__crease.game.state, vis: !document.getElementById('pauseM').classList.contains('hidden') }));
  ok('pause works', st.s === 'paused' && st.vis, JSON.stringify(st));
  await page.tap('#bResume');
  await page.evaluate(() => { const c = window.__crease; c.game.score = [6, 3]; const p = c.game.pucks[0] || {}; });
  await page.evaluate(() => { const c = window.__crease; c.game.state = 'play'; const pk = c.game.pucks[0]; pk.u = 0.5; pk.v = 0.1; pk.vu = 0; pk.vv = -2; c.game.shields = [0, 0]; c.game.paddles[1].u = 0.1; c.game.paddles[1].tu = 0.1; });
  await page.waitForTimeout(1000);
  const mid = await page.evaluate(() => ({ s: window.__crease.game.state, overHidden: document.getElementById('over').classList.contains('hidden') }));
  ok('victory cutscene plays before the results card', mid.s === 'over' && mid.overHidden, JSON.stringify(mid));
  await page.screenshot({ path: OUT + '/7a-victory-cutscene.png' });
  await page.waitForTimeout(2800);
  st = await page.evaluate(() => ({ s: window.__crease.game.state, score: window.__crease.game.score, overVis: !document.getElementById('over').classList.contains('hidden'), title: document.getElementById('overTitle').textContent }));
  ok('win screen at 7', st.overVis && st.title === 'CYAN WINS', JSON.stringify(st));
  await page.screenshot({ path: OUT + '/7-closed-win.png' });

  // Open-table menu recommends 2P
  await page.tap('#bMenu');
  await page.setViewportSize(OPEN);
  await page.waitForTimeout(400);
  v = await page.evaluate(() => ({ rec: document.getElementById('bDuo').className, menu: !document.getElementById('menu').classList.contains('hidden') }));
  ok('open menu recommends 2P', v.menu && v.rec.includes('rec'), JSON.stringify(v));
  await page.screenshot({ path: OUT + '/8-open-menu.png' });
  await page.tap('#bHow');
  await page.waitForTimeout(200);
  await page.screenshot({ path: OUT + '/9-open-how.png' });
  const howFits = await page.evaluate(() => { const c = document.querySelector('#how .card').getBoundingClientRect(); return { top: c.top, bottom: c.bottom, h: innerHeight }; });
  ok('how-to card fits open screen', howFits.top >= 0 && howFits.bottom <= howFits.h, JSON.stringify(howFits));

  // frame rate sanity (headless, software GL)
  const fps = await page.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); }));
  ok('renders frames (headless CPU renderer at 3x, not device speed)', fps > 12, fps.toFixed(1) + ' fps headless');

  // ---- smash / bump / scoring FX ----
  {
    const fc = await browser.newContext({ viewport: CLOSED, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const fp = await fc.newPage();
    fp.on('pageerror', e => errors.push('fx: ' + e.message));
    fp.on('console', m => { if (m.type() === 'error') errors.push('fx: ' + m.text()); });
    await fp.goto(URL);
    await fp.waitForTimeout(500);
    await fp.tap('#bSolo');
    await fp.waitForTimeout(2000);
    // SMASH: human paddle driven fast straight through a resting puck
    let r = await fp.evaluate(() => {
      const c = window.__crease, g = c.game, L = c.view.L, pd = g.paddles[0], pk = g.pucks[0];
      g.state = 'play'; g.paddles[1].u = g.paddles[1].tu = 0.1;
      pk.u = 0.5; pk.v = L * 0.7; pk.vu = 0; pk.vv = 0;
      pd.u = pd.tu = 0.5; pd.v = L * 0.92; pd.tv = L * 0.52;
      c.sim(0.25, 1 / 120);
      return { smashT: pk.smashT, spd: Math.hypot(pk.vu, pk.vv), pops: g.pops.map(p => p.text) };
    });
    ok('SMASH triggers on a hard flick (white-hot, faster, popup)', r.smashT > 0 && r.pops.includes('SMASH!') && r.spd > 3.4, JSON.stringify(r));
    // BUMP: puck driven into a crease bumper
    r = await fp.evaluate(() => {
      const c = window.__crease, g = c.game, L = c.view.L, b = g.bumpers[0];
      g.pops = []; g.state = 'play';
      const pk = { u: 0, v: 0, vu: 0, vv: 0, r: 0.042, last: 1, trail: [], side: 1, dead: false, smashT: 0, bumped: false };
      g.pucks = [pk];
      pk.smashT = 0; pk.u = b.u; pk.v = L / 2 + 0.2; pk.vu = 0; pk.vv = -1.2; pk.bumped = false;
      g.paddles[0].u = g.paddles[0].tu = 0.85; g.paddles[0].v = g.paddles[0].tv = L - 0.15;
      c.sim(0.3, 1 / 120);
      return { bumped: pk.bumped, vv: pk.vv, spd: Math.hypot(pk.vu, pk.vv), pops: g.pops.map(p => p.text), flash: b.flash };
    });
    ok('BUMP kicks the puck back with at least bump speed', r.bumped && r.vv > 0 && r.spd >= 1.8 * 0.9 && r.pops.includes('BUMP'), JSON.stringify(r));
    // BANK SHOT: a bumped puck that scores gets its own label, board punches
    r = await fp.evaluate(() => {
      const c = window.__crease, g = c.game, L = c.view.L;
      const pk = { u: 0, v: 0, vu: 0, vv: 0, r: 0.042, last: 1, trail: [], side: -1, dead: false, smashT: 0, bumped: false };
      g.pucks = [pk]; g.state = 'play';
      g.pops = []; g.score = [2, 1]; g.shields = [0, 0];
      g.paddles[1].u = g.paddles[1].tu = 0.1;
      pk.u = 0.5; pk.v = 0.15; pk.vu = 0; pk.vv = -2; pk.bumped = true; pk.last = 1;
      c.sim(0.5, 1 / 120);
      const b = g.board[0];
      return { score: g.score, pops: g.pops.map(p => p.text), chunk: b.chunk, state: g.state };
    });
    ok('bumped puck scores as BANK SHOT, board takes the point', r.score[0] === 3 && r.pops.includes('BANK SHOT') && r.chunk === 3, JSON.stringify(r));
    await fp.screenshot({ path: OUT + '/fx-bank-shot.png' });
    r = await fp.evaluate(() => { const c = window.__crease; c.sim(2, 1 / 60); return { shown: c.game.board[0].shown }; });
    ok('race bar fill catches up to the score', Math.abs(r.shown - 3) < 0.05, JSON.stringify(r));
    // 10 min human-vs-CPU-style sim with bumpers + smashes: invariants
    const inv = await fp.evaluate((check) => {
      const f = new Function('return (' + check + ')()'); const c = window.__crease; c.newMatch('demo'); const bad = new Set();
      let smashes = 0, bumps = 0;
      for (let i = 0; i < 600; i++) { c.sim(1); f().forEach(x => bad.add(x)); for (const p of c.game.pops) { if (p.text === 'BUMP' && p.t < 1.01 / 60 + 1e-9) bumps++; } }
      return [...bad].slice(0, 8);
    }, checkFn.toString());
    ok('10 min sim with bumpers: no escapes / NaN / half crossing', inv.length === 0, inv.join('; '));
    await fc.close();
  }

  // ---- intro cutscene ----
  for (const [name, vp] of [['closed', CLOSED], ['open', OPEN]]) {
    const ic = await browser.newContext({ viewport: vp, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const ip = await ic.newPage();
    ip.on('pageerror', e => errors.push('intro ' + name + ': ' + e.message));
    ip.on('console', m => { if (m.type() === 'error') errors.push('intro ' + name + ': ' + m.text()); });
    await ip.goto(FILE);
    await ip.evaluate(() => { window.__seq = []; let last = ''; setInterval(() => { const st = window.__crease.game.state; if (st !== last) { window.__seq.push(st); last = st; } }, 16); });
    await ip.waitForTimeout(800);
    let s1 = await ip.evaluate(() => ({ st: window.__crease.game.state, boot: !document.getElementById('boot').classList.contains('hidden'), menuHidden: document.getElementById('menu').classList.contains('hidden') }));
    ok(`[${name}] boot gate shows on load`, s1.st === 'boot' && s1.boot && s1.menuHidden, JSON.stringify(s1));
    await ip.screenshot({ path: `${OUT}/boot-${name}-0.png` });
    await ip.touchscreen.tap(vp.width / 2, vp.height * 0.8);
    await ip.waitForTimeout(900);
    s1 = await ip.evaluate(() => ({ st: window.__crease.game.state, stat: document.getElementById('bootStat').textContent, audio: 1 }));
    ok(`[${name}] tap boots: status lines + bar run`, s1.st === 'boot' && /table|Calibrating|Syncing/.test(s1.stat), JSON.stringify(s1));
    await ip.screenshot({ path: `${OUT}/boot-${name}-1.png` });
    await ip.waitForTimeout(1400);
    s1 = await ip.evaluate(() => ({ st: window.__crease.game.state, boot: !document.getElementById('boot').classList.contains('hidden'), studio: !document.getElementById('studio').classList.contains('hidden') }));
    ok(`[${name}] boot hands off to the prodbyKCTW studio splash`, s1.st === 'studio' && !s1.boot && s1.studio, JSON.stringify(s1));
    await ip.waitForTimeout(700);
    const vid = await ip.evaluate(() => { const v = document.getElementById('stLogo'); return { src: v.src.slice(0, 5), w: v.naturalWidth, h: v.naturalHeight, done: v.complete, op: getComputedStyle(v).opacity, html: document.documentElement.className }; });
    ok(`[${name}] his transparent prodbyKCTW logo is showing on black`, vid.w === 440 && vid.h === 440 && vid.done && +vid.op > 0.5 && /splash-studio/.test(vid.html), JSON.stringify(vid));
    for (const [ms, tag] of [[300, 'a'], [700, 'b'], [700, 'c']]) { await ip.waitForTimeout(ms); await ip.screenshot({ path: `${OUT}/studio-${name}-${tag}.png`, scale: 'css' }); }
    await ip.waitForFunction(() => window.__crease.game.state !== 'studio', null, { timeout: 10000 });
    await ip.waitForTimeout(200);
    s1 = await ip.evaluate(() => ({ seq: window.__seq.join('>'), studio: !document.getElementById('studio').classList.contains('hidden') }));
    ok(`[${name}] studio splash hands off to the intro cutscene`, /studio>intro/.test(s1.seq) && !s1.studio, JSON.stringify(s1));
    const mu = await ip.evaluate(async () => { const c = window.__crease; let beats = 0; for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 50)); if (c.game.beat > 0.5) beats++; } return { on: c.music.on, audio: c.audio() && c.audio().state, beats }; });
    ok(`[${name}] synthwave loop is running and pulsing the visuals`, mu.on && mu.audio === 'running' && mu.beats > 0, JSON.stringify(mu));
    await ip.waitForFunction(() => window.__crease.game.mode === 'demo', null, { timeout: 15000 }).catch(() => {});
    s1 = await ip.evaluate(() => ({ st: window.__crease.game.state, mode: window.__crease.game.mode, menu: !document.getElementById('menu').classList.contains('hidden') }));
    ok(`[${name}] intro ends on its own into the menu`, s1.mode === 'demo' && s1.menu, JSON.stringify(s1));
    // replay, tap to skip the splash, tap to skip the cutscene
    await ip.tap('#bIntro');
    await ip.waitForTimeout(600);
    s1 = await ip.evaluate(() => window.__crease.game.state);
    ok(`[${name}] Intro button replays the studio splash`, s1 === 'studio', s1);
    await ip.touchscreen.tap(vp.width / 2, vp.height / 2);
    await ip.waitForTimeout(500);
    s1 = await ip.evaluate(() => window.__crease.game.state);
    ok(`[${name}] tap skips the splash into the cutscene`, s1 === 'intro', s1);
    await ip.waitForFunction(() => window.__crease.game.introT > 0.4, null, { timeout: 5000 });
    await ip.touchscreen.tap(vp.width / 2, vp.height / 2);
    await ip.waitForTimeout(300);
    await ip.waitForTimeout(500);
    s1 = await ip.evaluate(() => ({ st: window.__crease.game.state, mode: window.__crease.game.mode, menu: !document.getElementById('menu').classList.contains('hidden') }));
    ok(`[${name}] tap skips straight to the menu (and doesn't click through into a game)`, s1.mode === 'demo' && s1.menu, JSON.stringify(s1));
    // fold mid-intro
    await ip.tap('#bIntro');
    await ip.waitForTimeout(300);
    await ip.touchscreen.tap(vp.width / 2, vp.height / 2);
    await ip.waitForTimeout(2500);
    await ip.setViewportSize(name === 'closed' ? OPEN : CLOSED);
    await ip.waitForTimeout(600);
    s1 = await ip.evaluate(() => ({ st: window.__crease.game.state, land: window.__crease.view.land }));
    ok(`[${name}] folding mid-intro keeps the intro running`, s1.st === 'intro', JSON.stringify(s1));
    await ic.close();
  }

  ok('no console/page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  for (const r of results) console.log(r.join('  '));
  const fails = results.filter(r => r[0] === 'FAIL').length;
  console.log(`\n${results.length - fails}/${results.length} passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { for (const r of results) console.log(r.join('  ')); console.error(e); process.exit(2); });
