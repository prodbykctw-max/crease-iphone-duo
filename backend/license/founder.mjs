// Strict ISO-8601 parsing for Lemon Squeezy timestamps. Founder's Gold used to depend on when a Pass was bought;
// it no longer does (it is free to the first 100 players who claim a code, see founder-codes.mjs), so only the
// date parser that the Lemon Squeezy license checks need is left here.
//
// Strict ISO-8601 with an explicit zone ("Z" or +hh:mm). A zone-less string would be read in the
// server's local zone, which is how a time quietly shifts by hours. Lemon Squeezy sends six
// fractional digits ("2021-01-24T14:15:07.000000Z"); they are cut to three before parsing.
const ISO = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/;

export function parseIso(text) {
  if (typeof text !== 'string') return null;
  const m = ISO.exec(text.trim());
  if (!m) return null;
  const t = Date.parse(m[1] + '.' + ((m[2] || '') + '000').slice(0, 3) + m[3]);
  return Number.isFinite(t) ? t : null;
}
