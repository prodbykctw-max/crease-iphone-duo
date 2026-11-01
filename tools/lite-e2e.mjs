#!/usr/bin/env node
// Headless check of the Lite builds. Serves each dist-lite/<target> with `python -m http.server`,
// loads it in Chromium (Playwright) with a MOCK of the host SDK, and fails on:
//   - any request that leaves localhost, other than the one SDK script tag (answered by the mock)
//   - any console error, page error, CSP violation or WebSocket
//   - the game not reaching play in solo or two-player, or host hooks firing out of order
//
//   node tools/build-lite.mjs && node tools/lite-e2e.mjs
//
// Playwright is not a dependency of the repo: it is found via require('playwright'), PLAYWRIGHT_DIR,
// or the npx cache (%LOCALAPPDATA%\npm-cache\_npx\*\node_modules\playwright).
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist-lite');
const YT_SDK = 'https://www.youtube.com/game_api/v1';
const CG_SDK = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

function loadPlaywright() {
  const req = createRequire(import.meta.url);
  try { return req('playwright'); } catch (_) {}
  const cands = [process.env.PLAYWRIGHT_DIR];
  const npx = path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx');
  if (existsSync(npx)) for (const d of readdirSync(npx)) cands.push(path.join(npx, d, 'node_modules', 'playwright'));
  for (const c of cands) if (c && existsSync(path.join(c, 'package.json'))) return req(c);
  throw new Error('Playwright not found (set PLAYWRIGHT_DIR)');
}

const YT_MOCK = `(function(){
  var log = window.__ytLog = [], saved = window.__ytSaved || '', audio = window.__ytAudio !== false, cb = { a: [], p: [], r: [] };
  window.__ytSaves = [];
  window.ytgame = { IN_PLAYABLES_ENV: true, SDK_VERSION: 'mock',
    game: { firstFrameReady: function(){ log.push('firstFrameReady'); }, gameReady: function(){ log.push('gameReady'); },
      loadData: function(){ log.push('loadData'); return Promise.resolve(saved); },
      saveData: function(d){ if (log.indexOf('loadData') < 0) throw new Error('saveData before loadData'); log.push('saveData'); window.__ytSaves.push(d); saved = d; return Promise.resolve(); } },
    system: { isAudioEnabled: function(){ return audio; }, onAudioEnabledChange: function(f){ cb.a.push(f); log.push('onAudioEnabledChange'); return function(){}; },
      onPause: function(f){ cb.p.push(f); log.push('onPause'); return function(){}; }, onResume: function(f){ cb.r.push(f); log.push('onResume'); return function(){}; },
      getLanguage: function(){ return Promise.resolve('en-US'); } },
    ads: { requestInterstitialAd: function(){ log.push('interstitial'); return new Promise(function(r){ setTimeout(r, 120); }); },
      requestRewardedAd: function(id){ log.push('rewarded:' + id); return Promise.resolve(true); } },
    health: { logError: function(){ log.push('logError'); }, logWarning: function(){ log.push('logWarning'); } },
    engagement: { sendScore: function(){ return Promise.resolve(); } } };
  window.__ytFire = { pause: function(){ cb.p.forEach(function(f){ f(); }); }, resume: function(){ cb.r.forEach(function(f){ f(); }); },
    audio: function(v){ audio = v; cb.a.forEach(function(f){ f(v); }); } };
})();`;

const CG_MOCK = `(function(){
  var log = window.__cgLog = [], listeners = [];
  var sdk = { environment: 'local', game: { settings: { muteAudio: false, disableChat: false },
      loadingStart: function(){ log.push('loadingStart'); }, loadingStop: function(){ log.push('loadingStop'); },
      gameplayStart: function(){ log.push('gameplayStart'); }, gameplayStop: function(){ log.push('gameplayStop'); },
      addSettingsChangeListener: function(f){ listeners.push(f); } },
    ad: { requestAd: function(type, c){ log.push('ad:' + type); setTimeout(function(){ log.push('adStarted'); c.adStarted(); setTimeout(function(){ log.push('adFinished'); c.adFinished(); }, 120); }, 40); } },
    init: function(){ log.push('init'); return Promise.resolve(); } };
  window.CrazyGames = { SDK: sdk };
  window.__cgMute = function(v){ sdk.game.settings.muteAudio = v; listeners.forEach(function(f){ f({ muteAudio: v }, 'muteAudio'); }); };
})();`;

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// LITE_SHOTS=<dir> saves screenshots of the main screens for a visual check
const shot = async (page, name) => { if (process.env.LITE_SHOTS) await page.screenshot({ path: path.join(process.env.LITE_SHOTS, name + '.png') }); };

function serve(dir, port) {
  const p = spawn('python', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', dir], { stdio: 'ignore' });
  return p;
}
async function waitUp(port) {
  const probe = () => new Promise(res => { const r = http.get(`http://127.0.0.1:${port}/`, x => { x.resume(); res(x.statusCode === 200); }); r.on('error', () => res(false)); });
  for (let i = 0; i < 60; i++) { if (await probe()) return; await sleep(250); }
  throw new Error('server did not start on ' + port);
}

async function newPage(browser, { sdkUrl, mock, init = '', viewport = { width: 390, height: 844 }, label }) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'block' });
  const rec = { label, external: [], sdkRequests: 0, errors: [], csp: [], sockets: 0 };
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(u)) return route.continue();
    if (u === sdkUrl) { rec.sdkRequests++; return mock ? route.fulfill({ status: 200, contentType: 'text/javascript', body: mock }) : route.abort(); }
    rec.external.push(u);
    return route.abort();
  });
  await ctx.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));
  });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') rec.errors.push('console: ' + m.text()); });
  page.on('pageerror', e => rec.errors.push('pageerror: ' + e.message));
  page.on('websocket', () => rec.sockets++);
  return { ctx, page, rec };
}
const g = (page, expr) => page.evaluate(expr);
// Polls with page.evaluate (page.waitForFunction evaluates strings with eval, which the page's CSP forbids).
const waitFor = async (page, expr, timeout = 15000) => { const end = Date.now() + timeout; while (Date.now() < end) { try { if (await page.evaluate(expr)) return true; } catch (_) {} await sleep(50); } return false; };

async function toMenuNatural(page, label) {
  // the real path: boot gate, studio splash, intro cutscene, menu
  check(`${label}: boot screen shows`, await waitFor(page, "window.__crease && __crease.game.state === 'boot'"));
  await page.click('#boot');
  check(`${label}: studio logo splash plays`, await waitFor(page, "__crease.game.state === 'studio'"));
  await page.mouse.click(200, 400);
  check(`${label}: intro cutscene plays`, await waitFor(page, "__crease.game.state === 'intro'"));
  await sleep(1200);
  const t = await g(page, '__crease.game.introT');
  check(`${label}: intro cutscene is animating`, t > 0.8, 't=' + t);
  await page.keyboard.press('Space');
  check(`${label}: menu after intro`, await waitFor(page, "!document.getElementById('menu').classList.contains('hidden')"));
}
async function startMatch(page, btn, mode) {
  await page.click(btn);
  return waitFor(page, `__crease.game.mode === '${mode}' && __crease.game.state === 'play'`);
}
async function frames(page, n, ms) {
  return page.evaluate(([n, ms]) => new Promise(res => { let c = 0; const t = setTimeout(() => res(false), ms); (function f() { if (++c >= n) { clearTimeout(t); res(true); } else requestAnimationFrame(f); })(); }), [n, ms]);
}
// run a whole match with the simulator (the CPU wins; the human paddle stays idle)
async function finishMatch(page) {
  for (let i = 0; i < 6; i++) { await page.evaluate(() => { __crease.sim(240); }); if (await waitFor(page, "__crease.game.state === 'over'", 1500)) return true; }
  return false;
}

function summary(rec, label, sdkExpected) {
  check(`${label}: no request left localhost (besides the SDK tag)`, rec.external.length === 0, rec.external.join(' ') || 'none');
  check(`${label}: SDK script requested exactly ${sdkExpected}x`, rec.sdkRequests === sdkExpected, 'got ' + rec.sdkRequests);
  check(`${label}: 0 console/page errors`, rec.errors.length === 0, rec.errors.slice(0, 3).join(' | '));
  check(`${label}: no WebSocket`, rec.sockets === 0);
}

async function youtube(browser) {
  const port = 8801, srv = serve(path.join(DIST, 'youtube'), port);
  try {
    await waitUp(port);
    const base = `http://127.0.0.1:${port}/index.html`;
    // 1. natural boot path with the mock SDK
    let { ctx, page, rec } = await newPage(browser, { sdkUrl: YT_SDK, mock: YT_MOCK, label: 'yt' });
    await page.goto(base + '?qa=1');
    await toMenuNatural(page, 'yt');
    await shot(page, 'yt-menu');
    check('yt: gameReady fired at the menu', await waitFor(page, "window.__ytLog.includes('gameReady')"));
    const log = await g(page, 'window.__ytLog');
    const ix = n => log.indexOf(n);
    check('yt: hook order loadData < firstFrameReady < gameReady', ix('loadData') >= 0 && ix('loadData') < ix('firstFrameReady') && ix('firstFrameReady') < ix('gameReady'), log.join(','));
    check('yt: onPause/onResume/onAudioEnabledChange registered', ['onPause', 'onResume', 'onAudioEnabledChange'].every(n => ix(n) >= 0));
    check('yt: gameReady called once', log.filter(x => x === 'gameReady').length === 1);
    check('yt: no Sound button, no Clear data (host owns audio and data)', await g(page, "!document.querySelector('#bSound') && !document.querySelector('#bClearData')"));
    // solo
    check('yt: solo reaches play', await startMatch(page, '#bSolo', 'solo'));
    // pause / resume
    const t0 = await g(page, '__crease.game.t');
    await g(page, 'window.__ytFire.pause()');
    check('yt: onPause shows the game paused', await g(page, "__crease.game.state === 'paused'"));
    check('yt: onPause halts the animation loops', (await frames(page, 6, 600)) === false);
    const tp = await g(page, '__crease.game.t');
    await sleep(300);
    check('yt: game time frozen while paused', (await g(page, '__crease.game.t')) === tp, `t0=${t0} tp=${tp}`);
    check('yt: audio context suspended on pause', ['suspended', null].includes(await g(page, 'CreaseLite.bridge.audio().ctx')), await g(page, 'CreaseLite.bridge.audio().ctx'));
    await g(page, 'window.__ytFire.resume()');
    check('yt: onResume restarts the loops', await frames(page, 6, 2000));
    // host audio
    await g(page, 'window.__ytFire.audio(false)');
    let a = await g(page, 'CreaseLite.bridge.audio()');
    check('yt: YouTube mute silences the game (muted, gain 0)', a.muted && a.hostMuted && (a.gain === 0 || a.gain === null), JSON.stringify(a));
    await g(page, 'window.__ytFire.audio(true)');
    a = await g(page, 'CreaseLite.bridge.audio()');
    check('yt: YouTube unmute restores sound', !a.muted && !a.hostMuted && (a.gain === null || Math.abs(a.gain - 0.9) < 0.001), JSON.stringify(a));
    // finish a match: save + ad
    await page.click('#bResume');
    check('yt: match finishes', await finishMatch(page));
    await sleep(3000); await shot(page, 'yt-over');
    check('yt: result screen title and score are drawn', await g(page, "(() => { const c = document.getElementById('overTitle3d'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n > 1000; })()"));
    await sleep(100);
    await g(page, 'window.__ytFire.pause()');   // pause flushes the cloud save
    await sleep(300);
    await g(page, 'window.__ytFire.resume()');
    const saves = await g(page, 'window.__ytSaves');
    check('yt: progress saved with saveData', saves.length >= 1, 'saves=' + saves.length);
    const last = saves[saves.length - 1] || '{}';
    const blob = JSON.parse(last);
    check('yt: save is compact and under 64 KiB', last.length < 65536, last.length + ' bytes');
    check('yt: save holds the finished match', blob.k && blob.k['crease.progress.v1'] && blob.k['crease.progress.v1'].stages[0].matches === 1);
    check('yt: the game talks to the in-memory store, not the browser localStorage', await g(page, 'window.localStorage === CreaseLite.storage'));
    check('yt: break (interstitial) before a rematch', await (async () => {
      await page.click('#bAgain');
      const ok = await waitFor(page, "window.__ytLog.includes('interstitial')", 3000);
      const resumed = await waitFor(page, "__crease.game.state === 'countdown' || __crease.game.state === 'play'", 4000);
      return ok && resumed;
    })());
    check('yt: ad blocker hidden afterwards', await g(page, "document.getElementById('liteBlock').hidden"));
    check('yt: no service worker', (await g(page, 'navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then(r => r.length) : 0')) === 0);
    check('yt: no CSP violations', (await g(page, 'window.__csp.length')) === 0, (await g(page, 'window.__csp')).join(' '));
    summary(rec, 'yt natural boot', 1);
    await ctx.close();

    // 2. two-player (landscape) with a saved game restored from the mock cloud save
    const savedBlob = last;
    ({ ctx, page, rec } = await newPage(browser, { sdkUrl: YT_SDK, mock: YT_MOCK, viewport: { width: 844, height: 390 }, label: 'yt2', init: `window.__ytSaved = ${JSON.stringify(savedBlob)};` }));
    await page.goto(base + '?nointro&qa=1');
    check('yt2: menu with ?nointro, gameReady fired', await waitFor(page, "window.__ytLog.includes('gameReady')"));
    const prog = JSON.parse(await g(page, "localStorage.getItem('crease.progress.v1')"));
    check('yt2: restored progress from cloud save (matches=1, achievements rebuilt)', prog.stages[0].matches === 1 && Object.keys(prog.earned).length >= 3, 'earned=' + Object.keys(prog.earned).length);
    check('yt2: 2 PLAYERS reaches play', await startMatch(page, '#bDuo', 'duo'));
    await sleep(500); await shot(page, 'yt-duo');
    await g(page, '__crease.toMenu && 0'); await page.keyboard.press('Escape'); await page.click('#bQuit'); await page.click('#bArenas'); await sleep(800); await shot(page, 'yt-arenas');
    summary(rec, 'yt2 two-player + restored save', 1);
    await ctx.close();

    // 3. a failed loadData never lets an empty game overwrite the cloud save
    ({ ctx, page, rec } = await newPage(browser, { sdkUrl: YT_SDK, mock: YT_MOCK.replace("return Promise.resolve(saved);", "return Promise.reject(new Error('API_UNAVAILABLE'));"), label: 'yt3' }));
    await page.goto(base + '?nointro&qa=1');
    check('yt3: game still starts when loadData fails', await waitFor(page, "window.__ytLog.includes('gameReady')", 20000));
    await startMatch(page, '#bSolo', 'solo');
    await finishMatch(page);
    await g(page, 'window.__ytFire.pause()'); await sleep(300);
    check('yt3: no saveData after a failed load', (await g(page, 'window.__ytSaves.length')) === 0);
    await ctx.close();

    // 4. opened outside YouTube (SDK tag blocked): falls back to browser storage and still plays
    ({ ctx, page, rec } = await newPage(browser, { sdkUrl: YT_SDK, mock: null, label: 'yt4' }));
    await page.goto(base + '?nointro&qa=1');
    check('yt4: no SDK present, menu still appears', await waitFor(page, "!document.getElementById('menu').classList.contains('hidden')", 20000));
    check('yt4: solo reaches play', await startMatch(page, '#bSolo', 'solo'));
    rec.errors = rec.errors.filter(e => !/game_api|ERR_FAILED|Failed to load resource/.test(e));
    summary(rec, 'yt4 no SDK (blocked)', 1);
    await ctx.close();
  } finally { srv.kill(); }
}

async function crazygames(browser) {
  const port = 8802, srv = serve(path.join(DIST, 'crazygames'), port);
  try {
    await waitUp(port);
    const base = `http://127.0.0.1:${port}/index.html`;
    let { ctx, page, rec } = await newPage(browser, { sdkUrl: CG_SDK, mock: CG_MOCK, label: 'cg' });
    await page.goto(base + '?qa=1');
    await toMenuNatural(page, 'cg');
    const log0 = await g(page, 'window.__cgLog');
    check('cg: init < loadingStart < loadingStop', log0.indexOf('init') >= 0 && log0.indexOf('init') < log0.indexOf('loadingStart') && log0.indexOf('loadingStart') < log0.indexOf('loadingStop'), log0.join(','));
    check('cg: no gameplayStart before a match', !log0.includes('gameplayStart'));
    check('cg: Sound toggle works in the menu', await (async () => {
      await page.click('#bSettingsHub'); await page.click('#bSound');
      const on = await g(page, 'CreaseLite.bridge.audio()');
      await page.click('#bSound');
      await g(page, 'window.__cgMute(true)');
      await page.click('#bSound');
      const hostWins = await g(page, 'CreaseLite.bridge.audio()');
      await g(page, 'window.__cgMute(false)');
      const back = await g(page, 'CreaseLite.bridge.audio()');
      await page.click('#settingsHub [data-close-hub]');
      return on.userMuted && on.muted && hostWins.hostMuted && !hostWins.userMuted && hostWins.muted && !back.muted;
    })());
    check('cg: solo reaches play', await startMatch(page, '#bSolo', 'solo'));
    check('cg: gameplayStart when the match begins', await waitFor(page, "window.__cgLog.includes('gameplayStart')"));
    await page.keyboard.press('Escape');
    check('cg: gameplayStop when paused', await waitFor(page, "window.__cgLog.lastIndexOf('gameplayStop') > window.__cgLog.lastIndexOf('gameplayStart')"));
    await page.click('#bResume');
    check('cg: gameplayStart again on resume', await waitFor(page, "window.__cgLog.lastIndexOf('gameplayStart') > window.__cgLog.lastIndexOf('gameplayStop')"));
    check('cg: match finishes', await finishMatch(page));
    check('cg: gameplayStop at the result screen', await waitFor(page, "window.__cgLog.lastIndexOf('gameplayStop') > window.__cgLog.lastIndexOf('gameplayStart')"));
    await page.click('#bAgain');
    check('cg: midgame ad requested before the rematch, muted only while it plays', await (async () => {
      await waitFor(page, "window.__cgLog.includes('adStarted')", 3000);
      const during = await g(page, 'CreaseLite.bridge.audio().hostMuted');
      await waitFor(page, "window.__cgLog.includes('adFinished')", 3000);
      await sleep(150);
      const after = await g(page, 'CreaseLite.bridge.audio().hostMuted');
      const l = await g(page, 'window.__cgLog');
      return l.includes('ad:midgame') && l.indexOf('ad:midgame') < l.indexOf('adStarted') && during === true && after === false;
    })());
    check('cg: rematch starts after the ad', await waitFor(page, "__crease.game.mode === 'solo' && (__crease.game.state === 'countdown' || __crease.game.state === 'play')", 5000));
    check('cg: Clear my data present and free of Premium wording', await page.evaluate(() => /Premium/i.test(document.body.innerText) === false && !!document.getElementById('bClearData')));
    summary(rec, 'cg natural boot', 1);
    await ctx.close();

    ({ ctx, page, rec } = await newPage(browser, { sdkUrl: CG_SDK, mock: CG_MOCK, viewport: { width: 844, height: 390 }, label: 'cg2' }));
    await page.goto(base + '?nointro&qa=1');
    check('cg2: 2 PLAYERS reaches play', await (async () => { await waitFor(page, "!document.getElementById('menu').classList.contains('hidden')"); return startMatch(page, '#bDuo', 'duo'); })());
    summary(rec, 'cg2 two-player', 1);
    await ctx.close();
  } finally { srv.kill(); }
}

async function rewarded(browser) {
  // Optional hook: node tools/build-lite.mjs --rewarded --out dist-lite-rewarded
  const dir = path.join(ROOT, 'dist-lite-rewarded', 'youtube');
  if (!existsSync(dir)) return;
  const port = 8803, srv = serve(dir, port);
  try {
    await waitUp(port);
    const { ctx, page, rec } = await newPage(browser, { sdkUrl: YT_SDK, mock: YT_MOCK, label: 'yt-rewarded' });
    await page.goto(`http://127.0.0.1:${port}/index.html?nointro&qa=1`);
    await waitFor(page, "!document.getElementById('menu').classList.contains('hidden')");
    await page.click('#bArenas');
    await page.click('.arena-tile[data-i="9"]');
    check('rewarded: button shows on a locked arena', await g(page, "!document.getElementById('bArenaTrial').hidden"));
    await page.click('#bArenaTrial');
    check('rewarded: video requested then the arena is playable once', await waitFor(page, "window.__ytLog.includes('rewarded:arena_trial') && !document.getElementById('bArenaUse').disabled"));
    summary(rec, 'rewarded hook', 1);
    await ctx.close();
  } finally { srv.kill(); }
}

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ headless: true });
try {
  await youtube(browser);
  await crazygames(browser);
  await rewarded(browser);
} finally { await browser.close(); }
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed, ${results.length} checks`);
process.exit(failed.length ? 1 : 0);
