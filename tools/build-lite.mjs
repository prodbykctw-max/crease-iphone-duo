#!/usr/bin/env node
// Build "CREASE Lite": the offline, ads-only variant for YouTube Playables and CrazyGames.
//
//   node tools/build-lite.mjs                      build both targets into dist-lite/
//   node tools/build-lite.mjs --target youtube     one target (youtube | crazygames | all)
//   node tools/build-lite.mjs --rewarded           also enable the optional rewarded-video hook
//   node tools/build-lite.mjs --audit              print the external-call audit and sizes
//
// One codebase: index.html and assets/ are read as they are and transformed at build time. Every
// edit below is anchored to exact text; if the full site changes under an anchor the build stops
// with the anchor's name instead of silently shipping something different.
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync, copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LITE = path.join(ROOT, 'tools', 'lite');
const read = f => readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const readLite = f => readFileSync(path.join(LITE, f), 'utf8').replace(/\r\n/g, '\n');
const DOT = '·';

export const TARGETS = {
  youtube: {
    sdk: '<script src="https://www.youtube.com/game_api/v1"></script>',
    hostFile: 'host-youtube.js',
    // Same shape as the policy YouTube applies to Playables, minus 'unsafe-inline'/'unsafe-eval' for scripts.
    csp: "default-src 'none'; script-src 'self' https://www.youtube.com/game_api/v1; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; connect-src 'self' blob: data:; object-src 'none'; base-uri 'none'; form-action 'none'",
    userSound: false,      // 5.7: no overall mute button; the YouTube mute is followed instead
    clearData: false,
    pageVisibility: false, // 6.2: no Page Visibility / focus events; onPause and onResume only
    haptics: false,        // 2.8a: haptics need an in-game toggle, so the build has none
  },
  crazygames: {
    sdk: '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>',
    hostFile: 'host-crazygames.js',
    csp: null,             // the CrazyGames SDK loads its own ad and analytics scripts
    userSound: true,
    clearData: true,
    pageVisibility: true,
    haptics: true,
  },
};

// ---------- anchored edits ----------
function where(src, needle, label) {
  const i = src.indexOf(needle);
  if (i < 0) throw new Error(`build-lite: anchor not found: ${label}`);
  if (src.indexOf(needle, i + 1) >= 0) throw new Error(`build-lite: anchor is ambiguous: ${label}`);
  return i;
}
const rep = (src, from, to, label) => { const i = where(src, from, label); return src.slice(0, i) + to + src.slice(i + from.length); };
function cut(src, start, end, label, { inclusive = true, to = '' } = {}) {
  const i = where(src, start, label + ' (start)');
  const j = src.indexOf(end, i + start.length);
  if (j < 0) throw new Error(`build-lite: anchor not found: ${label} (end)`);
  return src.slice(0, i) + to + src.slice(inclusive ? j + end.length : j);
}
function rx(src, re, to, label) {
  const n = (src.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) || []).length;
  if (n === 0) throw new Error(`build-lite: anchor not found: ${label}`);
  if (n > 1) throw new Error(`build-lite: anchor is ambiguous: ${label}`);
  return src.replace(re, to);
}

// ---------- page ----------
function transformBody(body, t) {
  let b = body;
  b = rep(b, '<button id="bGarageHub" class="link">Garage</button>', '<button id="bArenas" class="link">Arenas</button>', 'garage button');
  b = cut(b, '<dialog id="garageHub"', '</dialog>', 'garage hub');
  b = cut(b, '<dialog id="settingsHub"', '</dialog>', 'settings hub', {
    to: '<dialog id="settingsHub" class="product-dialog"><h2>SETTINGS &amp; HELP</h2><div class="row">\n' +
      '      <button id="bHow" class="link">How to play</button>\n      <button id="bIntro" class="link">Intro</button>\n' +
      (t.userSound ? '      <button id="bSound" class="link">Sound: On</button>\n' : '') +
      (t.clearData ? '      <button id="bClearData" class="link">Clear my data</button>\n' : '') +
      '    </div><button class="link" data-close-hub="settingsHub">Back</button></dialog>',
  });
  b = cut(b, '<p id="menuShareStatus"', '</a>', 'menu share and creator link');
  b = rep(b, 'Saved on this device. Tracks solo play', 'Tracks solo play', 'achievements hint');
  b = cut(b, '<dialog id="designStudio"', '</dialog>', 'design studio dialog');
  b = cut(b, '<dialog id="premium"', '</dialog>', 'premium dialog');
  if (t.clearData) {
    b = rep(b, 'your display name, daily results, Design Studio designs and pictures, your stage and paddle choice, play counts, and a Premium Pass activated on this device.', 'daily results, your arena choice and play counts.', 'clear data text');
  } else {
    b = cut(b, '<dialog id="clearData"', '</dialog>', 'clear data dialog');
  }
  b = rep(b, '<p class="hint">Your best matches, saved on this device.</p><label class="field">Display name<input id="leaderboardName" maxlength="24" autocomplete="nickname" placeholder="Player 1"></label><button id="saveLeaderboardName" class="btn plain">SAVE NAME</button>', '<p class="hint">Your best matches.</p>', 'leaderboard name field');
  b = rx(b, /<li><b>CHALLENGE A FRIEND:<\/b>[^\n]*<\/li>\n/, '', 'how: challenge bullet');
  b = rx(b, /<li>Tip: Share[^\n]*<\/li>\n/, '', 'how: home screen tip');
  b = rx(b, /<li>Your settings and stats stay on this device\.[^\n]*<\/li>/, t.cloud ? '<li>Your progress saves automatically.</li>' : '<li>Your settings and stats stay on this device.</li>', 'how: data bullet');
  b = cut(b, '<button id="bShareResult"', '</button>', 'result: challenge button');
  b = cut(b, '<button id="bShareCard"', '</button>', 'result: share button');
  b = cut(b, '<div class="mq-fb" id="fbVote"', `Built by KCTW ${DOT} Custom game inquiries</a>`, 'result: feedback, share status, creator link');
  b = rep(b, 'assets/crease-wordmark.svg?v=logo-a', 'assets/crease-wordmark.svg', 'wordmark cache tag');
  const splash = '<div id="liteLoad" role="status" aria-live="polite"><img src="assets/crease-wordmark.svg" alt="CREASE" width="824" height="164"><div class="bar"><i></i></div><p id="liteLoadText">LOADING</p></div>\n' +
    '<div id="liteBlock" hidden aria-hidden="true"><i></i></div>\n';
  return splash + b;
}

function transformGame(g, t, flags) {
  g = rep(g, "const logoReady = fetch('assets/kctw_logo.webp').then(r => r.ok ? r.blob() : null).then(b => { logoBlob = b; return b; }).catch(() => null);",
    "const logoReady = new Promise(res => { const im = new Image(); im.onload = () => { logoBlob = true; res(true); }; im.onerror = () => res(null); im.src = 'assets/kctw_logo.webp'; });", 'logo preload');
  g = rep(g, '    if (logoUrl) URL.revokeObjectURL(logoUrl);\n    logoUrl = URL.createObjectURL(logoBlob);\n    img.src = logoUrl;',
    "    const fresh = new Image(); fresh.id = 'stLogo'; fresh.alt = 'prodbyKCTW'; fresh.src = 'assets/kctw_logo.webp'; img.replaceWith(fresh);", 'logo restart');
  g = rep(g, "return !document.hasFocus() && (game.mode === 'demo' || IDLE_STATES[game.state] === 1);", 'return false;', 'idle background');
  g = rep(g, 'master = ac.createGain(); master.gain.value = 0.9;', 'master = ac.createGain(); master.gain.value = window.__creaseHostMuted ? 0 : 0.9;', 'master gain');
  // result sharing (share sheet, clipboard, challenge links, result card)
  g = cut(g, '// ---------- shareable result card ----------', '// ---- end-game marquee', 'result card section', {
    inclusive: false, to: '// (Lite) result sharing is not part of this build.\nlet cardSnap = null;\nfunction matchSnapshot() { return null; }\n',
  });
  g = cut(g, '  cardFile = null; cardJob = null; cardSnap = matchSnapshot();', 'else setTimeout(build, 80);', 'result card build');
  g = cut(g, 'async function shareChallenge(result) {', '// ---------- Daily Challenge', 'challenge sharing', { inclusive: false });
  g = cut(g, 'function dailyText(r) {', "$('bDaily').onclick = startDaily;", 'daily sharing', { inclusive: false, to: 'function shareDaily() {}\n' });
  g = rep(g, `${DOT} tap to share`, `${DOT} back tomorrow`, 'daily subtitle');
  g = rep(g, "$('bShareCard').onclick = () => shareResultCard();\n", '', 'share card handler');
  // premium garage, pass and Design Studio
  g = cut(g, 'function renderPremium(){', "$('bLeaderboard').onclick=", 'premium dialog code', { inclusive: false });
  // premium button, checkout click tracking, license-key redeem and the #pass= link intake
  g = cut(g, "$('bPremium').onclick=", '// Clear my data:', 'premium button, key redeem and checkout link', { inclusive: false });
  g = cut(g, '// ---------- Design Studio UI ----------', 'let arenaRaf = 0,', 'design studio code', {
    inclusive: false, to: "$('leaderboard').addEventListener('keydown',e=>e.stopPropagation());\n",
  });
  g = rep(g, `+' ${DOT} or unlock every arena with the Premium Pass'`, '', 'locked-arena hint');
  if (!t.pageVisibility) {
    g = cut(g, '// Multi-window: the game stays visible', "cv.addEventListener('pointerdown', () => { if (game.state === 'intro'", 'blur/focus/visibility pause', { inclusive: false });
  }
  if (!t.haptics) {
    g = rep(g, "const buzz = ms => { if (!touched || game.mode === 'demo') return; try { navigator.vibrate && navigator.vibrate(ms); } catch (_) {} };", 'const buzz = () => {};', 'haptics');
  }
  if (!g.endsWith('\n})();')) throw new Error('build-lite: game script does not end with its closing line');
  return g.slice(0, -'\n})();'.length) + '\n' + readLite('bridge.js') + '\n})();\n';
}

const GAME_SCRIPTS = ['analytics-config.js', 'analytics.js', 'assets/crease-logo.js', 'assets/arena-engine.js', 'assets/progression.js', 'assets/commerce-config.js', 'assets/monetization.js'];

export function buildTarget(name, { out = path.join(ROOT, 'dist-lite'), rewarded = false } = {}) {
  if (!TARGETS[name]) throw new Error(`unknown target ${name}`);
  const t = { ...TARGETS[name], cloud: name === 'youtube' };
  const dir = path.join(out, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(path.join(dir, 'assets', 'lite'), { recursive: true });

  const html = read('index.html');
  let css = html.slice(where(html, '<style>', 'style start') + 7, where(html, '</style>', 'style end'));
  // purchase-dialog styles (price, license-key box) have no markup in Lite
  css = cut(css, '.premium-price{', '.leaderboard-list{', 'premium dialog css', { inclusive: false });
  const bodyStart = where(html, '<body>', 'body') + 6;
  const scriptsAt = where(html, '<script src="analytics-config.js"></script>', 'script block');
  const gameAt = where(html, '<script>\n(() => {', 'game script');
  const gameEnd = html.indexOf('\n})();\n</script>', gameAt);
  if (gameEnd < 0) throw new Error('build-lite: game script end not found');
  const tags = [...html.slice(scriptsAt, gameAt).matchAll(/<script src="([^"?]+)(?:\?[^"]*)?"><\/script>/g)].map(m => m[1]);
  if (tags.join('|') !== GAME_SCRIPTS.join('|')) throw new Error(`build-lite: script list changed: ${tags.join(', ')}`);

  const body = transformBody(html.slice(bodyStart, scriptsAt), t);
  const game = transformGame(html.slice(gameAt + '<script>\n'.length, gameEnd + '\n})();'.length), t, { rewarded });
  const flags = { ads: true, rewarded: !!rewarded };

  const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="referrer" content="no-referrer">
${t.csp ? `<meta http-equiv="Content-Security-Policy" content="${t.csp}">\n` : ''}<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#07020f">
<meta name="description" content="Neon air hockey. Play solo against the CPU or two players on one screen. First to 7.">
<title>CREASE - Neon Air Hockey</title>
<link rel="icon" href="data:,">
${t.sdk}
<style>${css}\n${readLite('lite.css')}</style>
</head>
<body>
${body}<script src="assets/lite/config.js"></script>
<script src="assets/lite/storage.js"></script>
<script src="assets/lite/host.js"></script>
<script src="assets/lite/loader.js"></script>
</body>
</html>
`;
  writeFileSync(path.join(dir, 'index.html'), page);
  writeFileSync(path.join(dir, 'assets', 'game.js'), game);
  writeFileSync(path.join(dir, 'assets', 'lite', 'config.js'), `window.CreaseLite = ${JSON.stringify({ target: name, flags })};\n`);
  // The runtime files ship without their header comment (it holds the documentation links).
  const shipLite = (from, to) => writeFileSync(path.join(dir, 'assets', 'lite', to), readLite(from).replace(/^\/\*[\s\S]*?\*\/\n/, ''));
  for (const f of ['storage.js', 'loader.js', 'product.js']) shipLite(f, f);
  shipLite(t.hostFile, 'host.js');
  for (const f of ['crease-logo.js', 'arena-engine.js', 'progression.js', 'crease-wordmark.svg', 'kctw_logo.webp']) copyFileSync(path.join(ROOT, 'assets', f), path.join(dir, 'assets', f));
  mkdirSync(path.join(dir, 'assets', 'arenas'), { recursive: true });
  for (const f of readdirSync(path.join(ROOT, 'assets', 'arenas'))) copyFileSync(path.join(ROOT, 'assets', 'arenas', f), path.join(dir, 'assets', 'arenas', f));
  return dir;
}

// ---------- audit ----------
export function listFiles(dir, base = dir) {
  return readdirSync(dir).flatMap(n => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? listFiles(p, base) : [{ file: path.relative(base, p).replace(/\\/g, '/'), bytes: statSync(p).size }];
  });
}
const PATTERNS = [
  ['http://', /http:\/\//g], ['https://', /https:\/\//g], ['fetch(', /\bfetch\(/g], ['WebSocket', /WebSocket/g],
  ['sendBeacon', /sendBeacon/g], ['XMLHttpRequest', /XMLHttpRequest/g], ['navigator.serviceWorker', /navigator\.serviceWorker/g],
  ['navigator.clipboard', /navigator\.clipboard/g], ['navigator.share', /navigator\.share/g], ['visibilitychange', /visibilitychange|document\.hidden|visibilityState/g],
  ['navigator.language', /navigator\.languages?\b/g], ['window.open', /window\.open/g], ['eval(', /\beval\(|new Function\(/g],
];
export function audit(dir) {
  const hits = [];
  for (const { file } of listFiles(dir)) {
    if (!/\.(html|js|css|svg|json)$/.test(file)) continue;
    const text = readFileSync(path.join(dir, file), 'utf8');
    for (const [label, re] of PATTERNS) {
      for (const m of text.matchAll(re)) {
        const line = text.slice(0, m.index).split('\n').length;
        const ctx = text.slice(Math.max(0, m.index - 40), m.index + 70).replace(/\s+/g, ' ');
        hits.push({ file, line, label, ctx });
      }
    }
  }
  return hits;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const which = opt('--target') || 'all';
  const names = which === 'all' ? Object.keys(TARGETS) : [which];
  const out = opt('--out') ? path.resolve(opt('--out')) : path.join(ROOT, 'dist-lite');
  for (const n of names) {
    const dir = buildTarget(n, { out, rewarded: args.includes('--rewarded') });
    const files = listFiles(dir);
    const total = files.reduce((s, f) => s + f.bytes, 0);
    console.log(`${n}: ${dir}  ${files.length} files, ${total} bytes`);
    if (args.includes('--audit')) for (const h of audit(dir)) console.log(`  ${h.file}:${h.line} [${h.label}] ${h.ctx}`);
  }
}
