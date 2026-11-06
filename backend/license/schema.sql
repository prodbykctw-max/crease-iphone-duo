-- crease-license D1: which devices each Stripe sale has unlocked (limit 5, see stripe.mjs).
-- sale   = SHA-256 hex of 'crease-sale:' + the Checkout Session id (the id itself is never stored)
-- device = random 32-hex id the browser made for itself (crease.device.v1); not tied to a person
-- at     = first unlock time, ms since epoch
CREATE TABLE IF NOT EXISTS devices (
  sale   TEXT NOT NULL,
  device TEXT NOT NULL,
  at     INTEGER NOT NULL,
  PRIMARY KEY (sale, device)
);

-- Founder's Gold codes (founder-codes.mjs): free to the first 100 players who DM @playcrease, one code each.
-- code_hash  = SHA-256 hex of 'crease-founder:' + the normalized code (upper case, no spaces or dashes); the code itself is never stored
-- label      = public-001 ... public-100 (the 100 public codes) or owner-000 (the owner's extra code, outside the 100)
-- claimed_at = ms since epoch of the claim, NULL while unclaimed
-- device     = random 32-hex id of the browser that claimed it (crease.device.v1), NULL while unclaimed
CREATE TABLE IF NOT EXISTS founder_codes (
  code_hash  TEXT PRIMARY KEY,
  label      TEXT,
  claimed_at INTEGER,
  device     TEXT
);
