# CREASE

Dark vaporwave air hockey built for the iPhone Duo fold, by prodbyKCTW.

- **Portrait:** pocket table — solo vs CPU (Easy / Normal / Hard).
- **Landscape:** wide table, one player per side.
- Responsive layout preserves matches on resize. Physical iPhone Duo fold behavior is unverified.
- Opens with a tap-to-boot screen (unlocks sound), then the prodbyKCTW logo on black, then an intro cutscene: the table unfolds out of the crease, a rally, a smash, and the title. Tap to skip; replay it from the menu. Winning plays a victory cutscene.
- SMASH: flick your paddle hard into the puck. BUMP: gold bumpers on the crease kick the puck; score off one for a BANK SHOT.
- Juiced hits and scoring: freeze-frames, shake, pop-up text, race-to-7 bars, synthwave soundtrack the table pulses to.
- Power-ups on the crease: BIG paddle, MULTI puck, WALL over your goal. First to 7.

Static `index.html` plus optional analytics scripts — no frontend build step. Designed for modern mobile browsers; Share → Add to Home Screen for full-screen.

**Play:** https://prodbykctw-max.github.io/crease-iphone-duo/

Launch preparation: [plan and device checks](docs/LAUNCH.md), [Workers + D1 setup](backend/README.md). Challenge sharing and a KCTW inquiry link appear in-game; returning players bypass the intro after starting their first match. Remote analytics stays disabled until configured.

