// Signed Premium Pass tokens: HMAC-SHA256 over a small JSON payload.
//
// The license Worker signs one after Lemon Squeezy confirms a license key. Anything that must trust a
// pass on the SERVER (for example the online relay, before it ever shows a premium paddle to an
// opponent) verifies the token with the same secret. The browser only stores the token; it cannot
// check it, and nothing in the browser is trusted by another player's game.
//
// Format: base64url(JSON payload) + '.' + base64url(HMAC-SHA256(secret, first part)).
// Payload: { v: 1, p: product id, c: license created_at (ISO, from Lemon Squeezy), i: activation
// instance id, f: founder flag, iat: issued-at seconds }. No key, name, email or IP is ever inside.

const enc = new TextEncoder();
const dec = new TextDecoder();

export const TOKEN_VERSION = 1;

function toB64u(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64u(text) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) throw new Error('bad base64url');
  const s = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

function hmacKey(secret, usage) {
  if (typeof secret !== 'string' || secret.length < 16) throw new Error('signing secret missing or too short');
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

export async function signToken(payload, secret) {
  const body = toB64u(enc.encode(JSON.stringify({ v: TOKEN_VERSION, ...payload })));
  const mac = await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), enc.encode(body));
  return body + '.' + toB64u(new Uint8Array(mac));
}

// Returns the payload when the signature is genuine and the shape is right, otherwise null.
// Never throws on bad input: a malformed token is simply not a valid one.
export async function verifyToken(token, secret) {
  try {
    if (typeof token !== 'string' || token.length > 2048) return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), fromB64u(parts[1]), enc.encode(parts[0]));
    if (!ok) return null;
    const p = JSON.parse(dec.decode(fromB64u(parts[0])));
    if (!p || p.v !== TOKEN_VERSION || typeof p.p !== 'string' || typeof p.c !== 'string' || typeof p.i !== 'string' || typeof p.f !== 'boolean') return null;
    return p;
  } catch (_) {
    return null;
  }
}
