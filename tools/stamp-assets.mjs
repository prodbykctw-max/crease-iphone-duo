#!/usr/bin/env node
// Keep every ?v= cache tag in sync with the file it points at.
//
// Why this exists: assets/arena-engine.js changed five times between
// 2026-09-21 and 2026-09-22 while index.html kept serving it as
// "?v=shared-sun-1". Browsers key their cache on the URL, so every device that
// had loaded the game already kept the OLD engine - including the build before
// the centerpiece spun. The spin shipped and nobody with a warm cache saw it.
//
// Hand-written tags rely on somebody remembering. A content hash cannot be
// forgotten: change the file, the tag changes, every browser refetches.
//
//   node tools/stamp-assets.mjs          rewrite the tags in place
//   node tools/stamp-assets.mjs --check  exit 1 if any tag is stale (CI)

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = ['index.html', 'vr.html', 'online.html'];
const REF = /((?:src|href)=")([^"?]+\.(?:js|mjs|css))\?v=([^"]*)(")/g;

const check = process.argv.includes('--check');
let stale = 0, stamped = 0, missing = 0;

for (const page of PAGES) {
  const pagePath = join(root, page);
  if (!existsSync(pagePath)) continue;
  const before = readFileSync(pagePath, 'utf8');

  const after = before.replace(REF, (whole, pre, assetPath, tag, post) => {
    const file = join(root, assetPath);
    if (!existsSync(file)) {
      console.error(`  ${page}: references ${assetPath}, which does not exist`);
      missing++;
      return whole;
    }
    // Normalise CRLF before hashing: a Windows checkout has CRLF in the working
    // tree while git stores and GitHub Pages serves LF. Hashing raw bytes would
    // give a different tag on Windows than in CI, and neither would match what
    // players actually download.
    const body = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    const want = createHash('sha256').update(body, 'utf8').digest('hex').slice(0, 10);
    if (tag === want) return whole;
    stale++;
    console.log(`  ${page}: ${assetPath}  ${tag} -> ${want}`);
    return `${pre}${assetPath}?v=${want}${post}`;
  });

  if (after !== before && !check) { writeFileSync(pagePath, after); stamped++; }
}

if (missing) { console.error(`\n${missing} missing asset(s) referenced.`); process.exit(1); }

if (check) {
  if (stale) {
    console.error(`\n${stale} cache tag(s) are stale.`);
    console.error('Returning players would keep the old file. Run: node tools/stamp-assets.mjs');
    process.exit(1);
  }
  console.log('All cache tags match their files.');
} else {
  console.log(stale ? `\nUpdated ${stale} tag(s) across ${stamped} page(s).` : 'All cache tags already match their files.');
}
