#!/usr/bin/env node
// Keep each page's Content-Security-Policy script hashes in sync with its inline scripts.
//
// index.html, online.html and vr.html only allow scripts from this site ('self') plus
// the exact inline scripts they ship, listed as 'sha256-...' sources in script-src.
// Change one character of an inline script without updating its hash and the browser
// refuses to run it, so the page silently stops working. This tool recomputes the hashes.
//
//   node tools/csp-hash.mjs          rewrite the hashes in place
//   node tools/csp-hash.mjs --check  exit 1 if any hash is stale (CI)
//
// ORDER: run this AFTER `node tools/stamp-assets.mjs`. A hash covers the exact text
// between <script> and </script>; stamp-assets only rewrites src/href ?v= tags, but if
// it ever touched text inside an inline script, hashing first would leave a stale hash.
//
// Where the policy lives:
//   online.html, vr.html  <meta http-equiv="Content-Security-Policy" content="...">
//   index.html            <meta name="crease-csp" content="...">, installed as a real
//                         Content-Security-Policy meta by the small script after it,
//                         everywhere except a local test server (localhost / 127.0.0.1).
//                         The internal capture harness rewrites the game script on
//                         localhost, which would no longer match its hash.
//
// Hashes are taken over the script text with CRLF normalised to LF: the HTML parser
// does the same before the browser hashes it, so a Windows checkout gets the same
// result as CI and as what GitHub Pages serves.
//
// The check also fails on inline event handler attributes (onclick="...") and
// javascript: URLs, which this policy blocks.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = ['index.html', 'online.html', 'vr.html'];
const check = process.argv.includes('--check');

const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const POLICY_META = /<meta\s+(?:http-equiv="Content-Security-Policy"|name="crease-csp")\s+content="([^"]*)"\s*\/?>/gi;
const EXECUTABLE_TYPES = new Set(['', 'module', 'text/javascript', 'application/javascript', 'text/ecmascript', 'application/ecmascript']);

const attr = (attrs, name) => {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs);
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
};

export function inlineScriptHashes(html) {
  const hashes = [];
  for (const [, attrs, body] of html.matchAll(SCRIPT)) {
    if (attr(attrs, 'src') !== null) continue;
    const type = (attr(attrs, 'type') || '').trim().toLowerCase();
    if (!EXECUTABLE_TYPES.has(type)) continue; // e.g. application/ld+json: data, never executed
    const text = body.replace(/\r\n?/g, '\n');
    const h = `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
    if (!hashes.includes(h)) hashes.push(h);
  }
  return hashes;
}

export function withHashes(policy, hashes) {
  const directives = policy.split(';').map(d => d.trim()).filter(Boolean);
  const i = directives.findIndex(d => /^script-src\s/i.test(d) || d.toLowerCase() === 'script-src');
  if (i < 0) throw new Error('policy has no script-src directive');
  const kept = directives[i].split(/\s+/).slice(1).filter(s => !/^'sha(256|384|512)-/i.test(s));
  directives[i] = ['script-src', ...kept, ...hashes].join(' ');
  return directives.join('; ');
}

function blockedInlineCode(html) {
  const markup = html.replace(SCRIPT, '').replace(/<style\b[\s\S]*?<\/style\s*>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const found = [];
  for (const m of markup.matchAll(/<[a-z][^>]*?\s(on[a-z]+)\s*=/gi)) found.push(`inline handler ${m[1]}=`);
  for (const m of markup.matchAll(/(?:href|src|action)\s*=\s*["']?\s*javascript:/gi)) found.push(`javascript: URL (${m[0].trim()})`);
  return found;
}

function main() {
  let stale = 0, problems = 0, written = 0;
  for (const page of PAGES) {
    const path = join(root, page);
    if (!existsSync(path)) { console.error(`  ${page}: missing`); problems++; continue; }
    const before = readFileSync(path, 'utf8');
    const metas = [...before.matchAll(POLICY_META)];
    if (metas.length !== 1) { console.error(`  ${page}: expected exactly one CSP meta tag, found ${metas.length}`); problems++; continue; }
    for (const issue of blockedInlineCode(before)) { console.error(`  ${page}: ${issue} would be blocked by the CSP`); problems++; }
    const hashes = inlineScriptHashes(before);
    const [whole, policy] = metas[0];
    const next = withHashes(policy, hashes);
    if (next === policy) continue;
    stale++;
    console.log(`  ${page}: script-src hashes out of date`);
    const after = before.replace(whole, whole.replace(`content="${policy}"`, `content="${next}"`));
    if (!check) { writeFileSync(path, after); written++; }
  }
  if (problems) { console.error(`\n${problems} problem(s) found.`); process.exit(1); }
  if (check) {
    if (stale) {
      console.error(`\n${stale} page(s) have stale CSP script hashes; their inline scripts would be blocked.`);
      console.error('Run: node tools/stamp-assets.mjs && node tools/csp-hash.mjs');
      process.exit(1);
    }
    console.log('All CSP script hashes match their inline scripts.');
  } else {
    console.log(stale ? `\nUpdated CSP hashes in ${written} page(s).` : 'All CSP script hashes already match.');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
