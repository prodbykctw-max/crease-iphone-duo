// Founder's Gold codes. Founder's Gold is free to the first 100 players who ask for one (by DM); each gets a
// one-time code. It is no longer tied to buying anything.
//
//   POST /founder/redeem { code, device }  -> { ok: true, token, product: 'founder' } | { ok: false, reason: invalid | used }
//   GET  /founder/left                     -> { left: N }   (only the 100 public codes count, never the owner's)
//
// D1 holds only a SHA-256 of each code (never the code), a label (public-001 ... public-100, owner-000), when
// it was claimed and the random per-browser device id that claimed it. No name, handle, email or IP is stored.
// The token uses the Premium Pass token format with a different product and f:true, so a Founder token can
// never be mistaken for a Pass (PASS_ID is 'crease-premium-pass', this one is 'founder').
import { signToken } from './token.mjs';

export const FOUNDER_ID = 'founder';
export const PUBLIC_CODES = 100;
const CODE = /^[A-Z0-9]{6,32}$/;
const DEVICE = /^[a-f0-9]{32}$/;
const LEFT_TTL_MS = 30000;

// Upper case, spaces and dashes removed: "gold-ab12 cd34" and "GOLDAB12CD34" are the same code.
export const normalizeCode = raw => String(raw == null ? '' : raw).toUpperCase().replace(/[\s-]+/g, '');

export async function hashCode(normalized) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('crease-founder:' + normalized));
  return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, '0')).join('');
}

async function grant(env, device, claimedAt) {
  const token = await signToken({ p: FOUNDER_ID, c: new Date(claimedAt).toISOString(), i: device, f: true, iat: Math.floor(Date.now() / 1000) }, env.SIGNING_SECRET);
  return { ok: true, token, product: FOUNDER_ID };
}

export async function redeemFounder(body, env) {
  const code = normalizeCode(typeof body?.code === 'string' && body.code.length <= 64 ? body.code : '');
  const device = typeof body?.device === 'string' ? body.device : '';
  if (!CODE.test(code) || !DEVICE.test(device)) return { status: 200, body: { ok: false, reason: 'invalid' } };
  if (!env.SIGNING_SECRET || !env.DB) return { status: 503, body: { ok: false, reason: 'unavailable' } };
  const hash = await hashCode(code);
  const read = () => env.DB.prepare('SELECT device, claimed_at AS claimedAt FROM founder_codes WHERE code_hash = ?1').bind(hash).first();
  let row = await read();
  if (!row) return { status: 200, body: { ok: false, reason: 'invalid' } };
  if (row.device === null || row.device === undefined) {
    // One statement that only succeeds while the code is still unclaimed, so two devices racing for it cannot both win.
    const now = Date.now();
    await env.DB.prepare('UPDATE founder_codes SET claimed_at = ?1, device = ?2 WHERE code_hash = ?3 AND device IS NULL').bind(now, device, hash).run();
    leftCache.delete(env.DB);
    row = await read();
    if (!row) return { status: 200, body: { ok: false, reason: 'invalid' } };
  }
  if (row.device !== device) return { status: 200, body: { ok: false, reason: 'used' } };
  return { status: 200, body: await grant(env, device, Number(row.claimedAt) || Date.now()) };
}

// Cached for LEFT_TTL_MS per database binding, so a busy Garage cannot hammer D1.
const leftCache = new WeakMap();
export async function foundersLeft(env, now = Date.now()) {
  const hit = leftCache.get(env.DB);
  if (hit && now - hit.at < LEFT_TTL_MS) return hit.left;
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM founder_codes WHERE device IS NULL AND label LIKE 'public-%'").first();
  const left = Math.max(0, Math.min(PUBLIC_CODES, Number(r?.n) || 0));
  leftCache.set(env.DB, { at: now, left });
  return left;
}
