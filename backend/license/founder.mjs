// Founder's Gold window: a Premium Pass bought in the first FOUNDER_DAYS days after the Pass goes on
// sale. "Bought" is the license's created_at as reported by Lemon Squeezy, never a device clock.

export const FOUNDER_DAYS = 30;
const DAY_MS = 86400000;

// Strict ISO-8601 with an explicit zone ("Z" or +hh:mm). A zone-less string would be read in the
// server's local zone, which is how a window quietly shifts by hours. Lemon Squeezy sends six
// fractional digits ("2021-01-24T14:15:07.000000Z"); they are cut to three before parsing.
const ISO = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/;

export function parseIso(text) {
  if (typeof text !== 'string') return null;
  const m = ISO.exec(text.trim());
  if (!m) return null;
  const t = Date.parse(m[1] + '.' + ((m[2] || '') + '000').slice(0, 3) + m[3]);
  return Number.isFinite(t) ? t : null;
}

// First instant (exclusive) that no longer counts as the launch window; null while SALES_START is empty or invalid.
export function founderCutoff(salesStart) {
  const start = parseIso(salesStart);
  return start === null ? null : start + FOUNDER_DAYS * DAY_MS;
}

export function isFounder(createdAt, salesStart) {
  const created = parseIso(createdAt), cutoff = founderCutoff(salesStart);
  return cutoff !== null && created !== null && created < cutoff;
}
