# iOS 27 / iPhone Duo validation

CREASE is HTML/Canvas/WebGL running in Safari or as a home-screen web app.
UIKit/SwiftUI SDK opt-ins apply to a native host, not directly to this website.
Design kits are layout references, not runtime compatibility guarantees.

Official references reviewed September 28, 2026:
- https://developer.apple.com/iphone-duo/
- https://developer.apple.com/videos/play/tech-talks/111461/
- https://developer.apple.com/design/resources/

Readiness changes: preserve four-edge safe-area support and size-based layout;
skip redundant canvas rebuilds; clear touch anchors on actual size changes;
refresh layout on pageshow; bound canvas pixel count; reduce impact particles,
intentional smash freeze and centerpiece framebuffer cost.
Difficulty display: Normal / Hard / CTW, preserving existing stored keys.

Required Mac/Xcode 27.1 beta and physical-device checks:
1. Safari/home-screen launch, including fresh/private sessions.
2. Outer/inner display, rotation and split-width layouts; inspect asymmetric
   camera/status-bar insets and every dialog's close controls.
3. Fold/resize during drag: no stuck paddle, jump, lost score or restart.
4. Tap-start audio, lock/unlock, background/foreground and sound resume.
5. Two simultaneous touches in local multiplayer.
6. Profile Midnight with repeated bumper/smash hits for two minutes; record
   median/p95 frame time, long frames and any WebGL context loss.

Not yet verified on an iOS 27/Duo device or simulator. No native UIKit
integration or measured physical-device performance is claimed.
