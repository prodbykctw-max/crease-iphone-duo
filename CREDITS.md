# CREASE credits and asset sources

Internal record of where CREASE's code, sound, fonts and images come from. Not linked from the public site.

## Third-party code

| What | Where | License |
| --- | --- | --- |
| three.js r170 (`three@0.170.0`, `build/three.module.min.js`) | `assets/vendor/three.module.min.js`, used by the VR page | MIT, Copyright 2010-2024 Three.js Authors. The license header is kept in the file; provenance and checksum are in `assets/vendor/README.txt`. |

No other third-party scripts, stylesheets or web fonts are loaded. Apart from the site's own hosting (GitHub Pages) and its own Workers (Cloudflare), the pages load nothing from other servers.

## Sound

All music and sound effects are synthesized in code with the Web Audio API (the 96 BPM synthwave loop, hits, goals, power-ups). There are no audio files in the repository.

## Fonts

System fonts only (`-apple-system`, `BlinkMacSystemFont`, `SF Pro`, `system-ui`, `Segoe UI`, `Roboto`, `ui-monospace`/`SF Mono`/`Menlo`/`Consolas`). No font files are bundled or downloaded.

## Graphics drawn in code

The table, paddles, puck, effects, boot screen mark, intro, end-game marquee and share card are drawn at runtime on canvas/WebGL by code in this repository.

## TODO for owner: confirm source and license

These files are in the repository but their origin is not recorded here. Confirm who made each one and that CREASE has the right to use it (own work, commissioned, generated with a tool whose terms allow commercial use, or licensed stock), then record it in this file:

- [ ] `assets/arenas/*.webp` (10 arena plates and 10 thumbnails: gold-rush, ice, inferno, kctw, miami, midnight, sakura, toxic, ultraviolet, void)
- [ ] `assets/kctw_logo.webp` (prodbyKCTW studio logo shown at boot)
- [ ] `og.png`, `og-fold.png` (link preview images)
- [ ] `media/crease-fold.mp4`, `media/crease-fold-poster.jpg` (gameplay video and poster)
- [ ] `favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` (app icons)
