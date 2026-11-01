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
