# CREASE

Dark vaporwave air hockey built for the iPhone Duo fold, by prodbyKCTW.

**Play:** https://prodbykctw-max.github.io/crease-iphone-duo/

Other pages on the same site:

- [`online.html`](https://prodbykctw-max.github.io/crease-iphone-duo/online.html) — live match against another person (quick match or room code)
- [`vr.html`](https://prodbykctw-max.github.io/crease-iphone-duo/vr.html) — Meta Quest browser VR mode vs the CPU (labelled beta in the menu)
- [`iphone-duo-games/`](https://prodbykctw-max.github.io/crease-iphone-duo/iphone-duo-games/) — landing page about playing CREASE on the iPhone Duo

## The game

- **Portrait:** pocket table — solo vs CPU. The difficulty buttons read **Normal / Hard / CTW** (internally `easy` / `normal` / `hard`).
- **Landscape:** wide table, one player per side (local two-player on one device).
- Rotate or fold mid-match and the layout adapts; mode, score and power-ups carry over. Physical iPhone Duo fold behavior is unverified — all testing so far is emulated.
- Every open starts with a tap-to-boot screen (unlocks sound), then the prodbyKCTW logo on black, then an intro cutscene: the table unfolds out of the crease, a rally, a smash, and the title. Tap or press a key to skip; replay it from **Settings & Help → Intro**. Only `?nointro` and an incoming `?challenge=1` link skip the intro. Winning plays a victory cutscene.
- First to 7. Drag your paddle and stay on your side of the crease.
- **SMASH:** flick your paddle hard into the puck. **BUMP:** gold bumpers on the crease kick the puck; score off one for a **BANK SHOT**.
- **Power-ups** spawn on the crease — knock the puck through one: **BIG** paddle, **MULTI** puck, **WALL** over your goal.
- **FIRE MODE:** score 3 goals in a row and your paddle, the puck and your side of the rails catch fire for 7 seconds.
- Juiced hits and scoring: freeze-frames, shake, pop-up text, race-to-7 bars on the rails, and a procedural synthwave loop (96 BPM, synthesized in Web Audio — no audio files) whose kick the table pulses to.
- **Ten arenas** (Midnight, Toxic, Ice, Inferno, Ultraviolet, Miami, Gold Rush, Void, Sakura, prodby KCTW) with photographic plates in `assets/arenas/` and a shared WebGL centerpiece on the crease. Midnight is always available; the rest unlock through play (`assets/progression.js`).
- **Progress:** achievements and a local Records/leaderboard list, saved per device in `localStorage`.
- **Garage:** arena picker and a Premium Garage of paddle styles. The **GET PREMIUM PASS** button currently links to the creator's Instagram — there is no checkout or payment flow in this repo.
- **Challenge a friend / Share result:** uses the native share sheet when available, otherwise a copyable link. Challenge links carry `?challenge=1`.
- A "Built by KCTW" link to Instagram appears on the menu and result screens for custom game inquiries.
- Share → Add to Home Screen for full-screen (`manifest.webmanifest`).

## Online play

`online.html` talks to the `crease-online` Cloudflare Worker (source in `backend/online/`), whose URL is set in `online-config.js`. QUICK MATCH pairs any two waiting players; a room code or invite link plays a specific person. The server runs the puck, score and paddle limits. See [`backend/online/README.md`](backend/online/README.md) for the protocol, limits, local run and deploy steps.

## VR

`vr.html` loads `assets/quest-vr.mjs`, which uses a vendored three.js r170 (`assets/vendor/`) and the same physics module as the online relay (`backend/online/physics.mjs`). Controllers, hand tracking or gaze; "Desktop practice" plays with the mouse.

## Analytics

`analytics.js` sends anonymous match events to the URL in `analytics-config.js`, which currently points at a `crease-metrics` Worker. Nothing is sent when that value is blank, when the URL is not HTTPS, or when the browser sends Do Not Track or Global Privacy Control. Worker, D1 schema and query notes: [`backend/README.md`](backend/README.md).

## Run locally

No build step. Serve the repository root with any static server, for example:

```sh
python3 -m http.server 8765
# open http://127.0.0.1:8765/index.html  (add ?nointro to go straight to the menu)
```

Port 8765 is the origin the online relay's `dev` environment allows, and the default for `qa/qa.js`.

## Tests and checks

```sh
node --test tests/*.test.mjs          # unit tests (game logic, progression, workers, online relay)
node tools/stamp-assets.mjs --check   # fails if a ?v= cache tag no longer matches its file
node tools/stamp-assets.mjs           # rewrite the cache tags after changing a script
```

`qa/qa.js` and `qa/check-centerpieces.cjs` are Playwright browser checks (Playwright is not a dependency of this repo; install it separately).

## Deploy

- **Game:** a static site served by GitHub Pages from `main`. The live page matched `index.html` on `main` when this README was written.
- **CI:** `.github/workflows/asset-tags.yml` runs `node tools/stamp-assets.mjs --check` on every push to `main` and every pull request. Script tags in `index.html`, `vr.html` and `online.html` use content-hash `?v=` tags; do not hand-edit them.
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
  monetization.js       Local leaderboard, paddle styles, premium hooks
  quest-vr.mjs          VR game; quest-controls.mjs = hand/controller smoothing
  arenas/               Arena plates and thumbnails (.webp)
  vendor/               three.js r170
backend/                Metrics Worker + D1 migration (see backend/README.md)
backend/online/         Online relay Worker + shared physics (see its README)
tests/                  node:test suites
qa/                     Playwright checks
tools/                  stamp-assets.mjs, capture/video helpers
docs/                   STATUS, LAUNCH, iOS 27 / iPhone Duo readiness, player-experience principles
marketing/              Launch campaign notes
media/                  Gameplay video and poster
llms.txt, llms-full.txt, sitemap.xml, robots.txt, manifest.webmanifest, icons, og images
```

More context: [`docs/STATUS.md`](docs/STATUS.md), [`docs/LAUNCH.md`](docs/LAUNCH.md).
