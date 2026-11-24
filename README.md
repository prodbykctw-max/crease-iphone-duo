# CREASE

Dark vaporwave air hockey built for the iPhone Duo fold, by prodbyKCTW.

**Play:** https://playcrease.app/

Other pages on the same site:

- [`online.html`](https://playcrease.app/online.html) — live match against another person (quick match or room code)
- [`vr.html`](https://playcrease.app/vr.html) — Meta Quest browser VR mode vs the CPU (labelled beta in the menu)
- [`iphone-duo-games/`](https://playcrease.app/iphone-duo-games/) — landing page about playing CREASE on the iPhone Duo

## The game

- **Portrait:** pocket table — solo vs CPU. The difficulty buttons read **Normal / Hard / CTW** (internally `easy` / `normal` / `hard`).
- **Landscape:** wide table, one player per side (local two-player on one device).
- Rotate or fold mid-match and the layout adapts; mode, score and power-ups carry over. Physical iPhone Duo fold behavior is unverified — all testing so far is emulated.
- Every open starts with a tap-to-boot screen (unlocks sound), then the prodbyKCTW logo on black, then an intro cutscene: the table unfolds out of the crease, a rally, a smash, and the title. Tap or press a key to skip; replay it from **Settings & Help → Intro**. Only `?nointro` and an incoming `?challenge=1` link skip the intro. Winning plays a victory cutscene.
- First to 7. Drag your paddle and stay on your side of the crease.
- **SMASH:** flick your paddle hard into the puck. **BUMP:** gold bumpers on the crease kick the puck; score off one for a **BANK SHOT**.
- **Power-ups** spawn on the crease — knock the puck through one: **BIG** paddle, **MULTI** puck, **WALL** over your goal.
- **FIRE MODE:** score 3 goals in a row and your paddle, the puck and your side of the rails catch fire for 7 seconds.
- Juiced hits and scoring: freeze-frames, shake, pop-up text, race-to-7 bars on the rails, and a procedural disco loop (120 BPM, synthesized in Web Audio — no audio files) whose kick the table pulses to.
- **Ten arenas** (Midnight, Toxic, Ice, Inferno, Ultraviolet, Miami, Gold Rush, Void, Sakura, prodby KCTW) with photographic plates in `assets/arenas/` and a shared WebGL centerpiece on the crease. Midnight is always available; the rest unlock through play (`assets/progression.js`).
- **Progress:** achievements and a local Records/leaderboard list, saved per device in `localStorage`.
- **Founder's Gold:** free to the first 100 players who DM @playcrease for a one-time code (typed in the Garage, or opened as `?founder=CODE`). It is not part of the Premium Pass and is never sold.
- **Garage:** arena picker and a Premium Garage of paddle styles. The Premium Pass ($2.99 + tax) is sold through a Stripe Payment Link with Managed Payments; the license Worker verifies the Checkout Session and unlocks the pass (Lemon Squeezy license keys remain supported in code but are not on sale). With an empty `CHECKOUT_URL` in `assets/commerce-config.js` the button reads **COMING SOON** and links nowhere. Setup and go-live steps: [`docs/CHECKOUT.md`](docs/CHECKOUT.md).
- **Challenge a friend / Share result:** uses the native share sheet when available, otherwise a copyable link. Challenge links carry `?challenge=1`.
- A "Built by KCTW" link to Instagram appears on the menu and result screens for custom game inquiries.
- Share → Add to Home Screen for full-screen (`manifest.webmanifest`).

## Online play

`online.html` talks to the `crease-online` Cloudflare Worker (source in `backend/online/`), whose URL is set in `online-config.js`. QUICK MATCH pairs any two waiting players; a room code or invite link plays a specific person. The server runs the puck, score and paddle limits. See [`backend/online/README.md`](backend/online/README.md) for the protocol, limits, local run and deploy steps.

## VR

`vr.html` loads `assets/quest-vr.mjs`, which uses a vendored three.js r170 (`assets/vendor/`). It runs the real game engine from `index.html`: a hidden same-origin frame opens `index.html?vrhost=1` (host mode: no screens, no render loop, only the engine and `window.__creaseHost`), VR feeds it the hand position in field units (1 m = 1 field unit across, so a fast swing smashes exactly like a flick on the phone), steps it every frame and draws its state in 3D (pucks, paddles, bumpers, BIG/MULTI/WALL, arena powers, Fire Mode). Rules, music, sound effects, progress and unlocks are the phone game's; the arena picker lists only unlocked arenas and uses the arena artwork as a curved backdrop. If the frame cannot load, the older simple physics (`backend/online/physics.mjs`) is used with a notice. Not in VR yet: intro and victory scenes, Garage paddle styles, the daily challenge. Pure helpers (coordinate mapping, scoreboard text, haptic events) are in `assets/quest-engine.mjs`. Bare-hand tracking needs no controllers (the paddle follows the palm; menu buttons take a fingertip touch or a pinch ray); controllers and gaze also work. The table auto-fits the player's eye height on entry. The in-headset Options menu (free-hand pinch, the MENU tab, or A/B/X/Y) sets CPU level, table height (−/+, AUTO, MATCH MY HAND), paddle hand, sound and vibration, saved per headset (`assets/quest-options.mjs`). "Desktop practice" plays with the mouse; M opens the menu.

Online in VR: ONLINE (in the options menu header) opens QUICK MATCH, CREATE ROOM and ENTER CODE (a 32-key in-headset keypad for the ten-character room code; fingertip touch, controller tip, or point and pinch/trigger). The network client is the phone page's own: VR loads `online.html?vrhost=1` in a hidden same-origin frame, which exposes `window.__creaseOnline` (`poll`, `quick`, `create`, `join`, `cancel`, `move`) and presses the page's own buttons, so the lobby, room codes, messages and the 30 ms move cadence are identical and the server (`backend/online/`) is unchanged; a headset and a phone play each other. The state machine (searching, waiting with the code shown, opponent found, playing, opponent left, connection lost with RETRY, match over with REMATCH), the keypad and the panel layouts are pure functions in `assets/quest-online.mjs` (`tests/quest-online.test.mjs`). REMATCH and RETRY after a dropped room-code match meet again on the same code (the host reopens it, the guest joins, taking turns if they arrive out of order), so a phone friend can rejoin by typing the code shown in the headset. Online matches do not pause: leaving the headset keeps the match going and the board says so.

## Analytics

`analytics.js` sends anonymous match events to the URL in `analytics-config.js`, which currently points at a `crease-metrics` Worker. Nothing is sent when that value is blank, when the URL is not HTTPS, or when the browser sends Do Not Track or Global Privacy Control. Worker, D1 schema and query notes: [`backend/README.md`](backend/README.md).

## Run locally

No build step. Serve the repository root with any static server, for example:

```sh
python3 -m http.server 8765
# open http://127.0.0.1:8765/index.html  (add ?nointro to go straight to the menu)
```

Port 8765 is the origin the online relay's `dev` environment allows, and the default for `qa/qa.js`.

The test hooks `window.__crease` (game) and `window.__online` (online page) exist only on a local server (`localhost` / `127.0.0.1`) or when the URL has `?qa=1`.

## Tests and checks

```sh
node --test tests/*.test.mjs          # unit tests (game logic, progression, workers, online relay)
node tools/stamp-assets.mjs --check   # fails if a ?v= cache tag no longer matches its file
node tools/stamp-assets.mjs           # rewrite the cache tags after changing a script
node tools/csp-hash.mjs --check       # fails if a CSP script hash no longer matches its inline script
node tools/csp-hash.mjs               # rewrite the CSP hashes after changing an inline script
```

`index.html`, `online.html` and `vr.html` carry a Content-Security-Policy that only runs scripts from this site plus the exact inline scripts listed by hash. After editing any inline script, run `node tools/stamp-assets.mjs` first and then `node tools/csp-hash.mjs` (in that order), or the browser will refuse to run the changed script. On `index.html` the policy is installed by the first script in `<head>`, everywhere except `localhost` / `127.0.0.1`, because the internal capture harness rewrites the game script locally. See the header of `tools/csp-hash.mjs`.

`qa/qa.js` and `qa/check-centerpieces.cjs` are Playwright browser checks (Playwright is not a dependency of this repo; install it separately).

## Deploy

- **Game:** a static site served by GitHub Pages from `main`. The live page matched `index.html` on `main` when this README was written.
- **CI:** `.github/workflows/asset-tags.yml` runs `node tools/stamp-assets.mjs --check`, `node tools/csp-hash.mjs --check` and the unit tests (`node --test tests/*.test.mjs`) on every push to `main` and every pull request. Script tags in `index.html`, `vr.html` and `online.html` use content-hash `?v=` tags; do not hand-edit them.
- **Workers:** deployed separately with Wrangler from `backend/` (metrics) and `backend/online/` (online relay). See the two backend READMEs.

## Project structure

```
index.html              The game (canvas, inline JS/CSS)
online.html             Online play page
vr.html                 Meta Quest VR page
iphone-duo-games/       iPhone Duo landing page
analytics.js            Event sender; analytics-config.js holds the endpoint
online-config.js        Online relay URL
assets/
  arena-engine.js       Arena plates + shared WebGL centerpiece
  progression.js        Achievements, records, arena unlocks
  monetization.js       Local leaderboard, paddle styles, premium pass + license-key redeem
  commerce-config.js    Checkout settings (Stripe checkout link, price label, sales start; Lemon Squeezy ids unused)
  quest-vr.mjs          VR scene; quest-engine.mjs = engine/VR helpers; quest-controls.mjs = fallback hand smoothing
  arenas/               Arena plates and thumbnails (.webp)
  vendor/               three.js r170
backend/                Metrics Worker + D1 migration (see backend/README.md)
backend/online/         Online relay Worker + shared physics (see its README)
backend/license/        License Worker: Lemon Squeezy key -> signed pass token (see docs/CHECKOUT.md)
tests/                  node:test suites
qa/                     Playwright checks
tools/                  stamp-assets.mjs, csp-hash.mjs, capture/video helpers
docs/                   STATUS, LAUNCH, iOS 27 / iPhone Duo readiness, player-experience principles
marketing/              Launch campaign notes
media/                  Gameplay video and poster
llms.txt, llms-full.txt, sitemap.xml, robots.txt, manifest.webmanifest, icons, og images
```

More context: [`docs/STATUS.md`](docs/STATUS.md), [`docs/LAUNCH.md`](docs/LAUNCH.md).
