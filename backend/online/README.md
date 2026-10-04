# CREASE online relay

A Cloudflare Worker that lets any two people playing CREASE meet in a live
match. The server owns the puck, the scores and the paddle limits, so a player
cannot move their paddle somewhere the rules do not allow or invent a goal.

Two ways in, both served by the same Worker:

- **Quick match** - `GET /match` asks the lobby who is waiting. The first
  player is told to create a room; the next person to ask is sent to that same
  room. Nobody types anything.
- **Room code** - `GET /room/<CODE>` over WebSocket, where `<CODE>` is ten
  characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. `?create=1` opens the
  room; without it the player joins an existing one.

`Lobby` is a single Durable Object holding at most one waiting room code, for
30 seconds. `Room` is one Durable Object per match: it accepts two sockets,
steps the physics at 60 Hz and broadcasts state at 30 Hz. A match is capped at
ten minutes. Only origins in `ALLOWED_ORIGINS` are served; everything else gets
403 before any socket is opened.

## Deploy

This needs a Cloudflare login, so it has to be run by the account owner.

```bash
cd backend/online
npx wrangler login          # opens a browser, one time
npx wrangler deploy
```

`deploy` prints the Worker's HTTPS URL. Put that URL in `/online-config.js` at
the repo root and commit it:

```js
window.CREASE_ONLINE_URL = 'https://crease-online.<your-subdomain>.workers.dev';
```

Until that value is set, the online page says online play is not switched on
yet and the buttons stay disabled - nothing breaks, and local play is
unaffected.

If you later serve CREASE from a custom domain, add that origin to
`ALLOWED_ORIGINS` in `wrangler.jsonc` and deploy again, or the browser will be
refused with 403.

## Run it locally

```bash
cd backend/online
npx wrangler dev --port 8787 --local
```

`wrangler.jsonc` already allows `http://127.0.0.1:8765`, so serving the repo
root on port 8765 and opening `online.html` there will talk to the local
Worker - point `window.CREASE_ONLINE_URL` at `http://127.0.0.1:8787` to try it.

## Verified

Against `wrangler dev --local`, running this Worker's real code including both
Durable Objects, with two separate browser contexts:

- quick match paired two clients that exchanged nothing - same room, opposite
  player slots, both connected
- one player's drag appeared on the other's screen (paddle moved 0.418)
- the puck advanced and read identically on both sides at every sample
- room code: host created, friend joined by code, both live in the same room
- the invite link pre-fills the code
- a malformed code is refused in the UI; `/room/nope` returns 400
- `Origin: https://evil.example` and a missing Origin both return 403
- the Room loop measured 58 Hz against a 60 Hz target

Scoring was verified by simulating this directory's own `physics.mjs` rather
than in a browser: 120 seconds of play produced 7 goals and a winner. Two idle
automated clients do not chase the puck, so a live goal was not observed in the
browser run.
