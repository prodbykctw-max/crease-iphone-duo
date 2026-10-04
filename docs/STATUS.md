# Status

CREASE is a single-page HTML5 canvas game served from this repository's `main`
branch by GitHub Pages at
https://prodbykctw-max.github.io/crease-iphone-duo/ — the deployed site is the
root of `main`, so anything merged there is live within minutes.

## Shipped

- **Fold-first play.** The crease sits on the hinge. Portrait is the pocket
  table, landscape the full table with one player per side. A match survives
  folding or rotating mid-play: mode, score and power-ups carry over.
- **Modes.** Solo vs CPU (easy / normal / hard) and local two-player.
  First to 7.
- **Ten arenas** with photographic plates and a shared WebGL centerpiece on the
  crease, equal from both sides. Arenas unlock through play.
- **Intro sequence** — boot screen, prodbyKCTW studio splash, cutscene — on
  **every** open. It is not a first-run-only event; `?nointro` (tests) and an
  incoming `?challenge=1` link are the only things that skip it.
- **Paddles are never repositioned between rounds.** After a goal the puck is
  re-served but each paddle stays exactly where its player left it. If a paddle
  is sitting on the serve spot, the serve slides aside instead.
- **Progression** — achievements, Fire Mode, arena unlocks — and a premium
  garage of paddle styles. All state is per-device.
- **Meta Quest VR** at `vr.html`: WebXR, hand tracking with a gaze fallback,
  haptics, a VR menu and the CREASE intro in-headset. Reachable from the menu.
- **Online play, live.** `online.html` offers QUICK MATCH, which pairs any two
  visitors with nothing exchanged, and room codes for playing a specific
  person. The relay is a deployed Cloudflare Worker at
  `https://crease-online.prodbykctw.workers.dev` (source in `backend/online/`),
  with a `Lobby` Durable Object for matchmaking and one `Room` Durable Object
  per match. The server owns the puck, the score and the paddle limits.
  Verified on the live site in WebKit: two clients paired and played, one
  player's drag appeared on the other's screen, room codes and invite links
  worked, and only allow-listed origins are served.
- **SEO** — llms.txt, sitemap, robots, manifest, icons, OG tags, JSON-LD.
- **Analytics** are opt-in and off by default. `analytics-config.js` ships with
  an empty endpoint; nothing is sent until one is set.

## Not done

- **Checkout is not wired.** "GET PREMIUM PASS" currently opens the creator's
  Instagram. There is no payment flow, and nothing verifies an entitlement.
- **The metrics Worker is not deployed.** `backend/` holds a Worker and a D1
  migration for metrics; the D1 database id in `wrangler.jsonc` is still a
  placeholder. See `backend/README.md`. (The separate online relay in
  `backend/online/` IS deployed - see Shipped.)
- **No physical device testing.** Every check so far is emulated — Playwright
  Chromium and WebKit at iPhone Duo dimensions. No real iPhone Duo and no real
  Quest headset has run this build.

## Things that bite

- **Cache tags.** Scripts are loaded as `assets/<name>.js?v=<hash>`. Browsers
  cache on the URL, so changing a file without changing its tag means returning
  players keep the old one forever. This already happened:
  `assets/arena-engine.js` changed five times under the tag `shared-sun-1`,
  including the commit that made the centerpiece spin, so warm-cache devices
  never got it. Tags are now content hashes produced by
  `node tools/stamp-assets.mjs`, and the **Cache tags** workflow fails any push
  or PR where a tag no longer matches its file. Do not hand-edit them. The
  script normalises CRLF before hashing so a Windows checkout and CI agree.
- **GitHub Pages serves `index.html` with `max-age=600`.** An installed
  home-screen app can hold the HTML well past that, so a device can keep asking
  for old asset URLs even after the tags change.
- **WebKit is not Chromium.** CSS `background-clip:text` and `clip-path`
  animations freeze on iOS, and WebM alpha does not composite. The title is
  drawn on canvas and the studio logo is an animated WebP for this reason.
  Verify on WebKit, not only Chromium.
- **No developer-facing text in player-facing UI** — no endpoints, no "testing
  pending", no changelog lines where product copy belongs. Open each screen and
  read what renders before shipping.
