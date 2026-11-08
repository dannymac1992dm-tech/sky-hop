# Sky Hop 1.9.1 (versionCode 11) — Fold inner-screen Back fix — 2026-10-13
NOT uploaded. Includes all 1.9 work (Ghost, PGS leaderboard, Share). Backup: /workspace/backups/pre-1.9.1/
Root cause: targetSdk 36 = edge-to-edge; canvas fit ignored status bar/cutout insets. On the Fold inner screen the canvas
is height-limited and starts at y=0, so the top-left Back (canvas y 18-50) sat under the status bar, which eats taps.
Outer screen letterboxes vertically, so Back was well below the bar. No system-back handler existed either
(back gesture left the app instead of closing the menu).
Changes: style.css (#game-wrap safe-area padding via env() + --sh-inset-*), game.js (hitBack generous area, SkyHopBack()
for Shop/Birds/Trophies/Missions, Escape key), MainActivity.java (OnBackPressedCallback -> SkyHopBack, WindowInsets -> --sh-inset-*),
version 1.9.1/11 (build.gradle, ads.js APP_VERSION/APP_BUILD, ?v=191).
AAB: /workspace/sky-hop-publishing/store-assets/skyhop-release-v1.9.1-code11.aab (sha256 6b39019474d63659c2614b25d1e6815b4dfec51a83452306f6ac1341971f4a0e)
APKs: /workspace/sky-hop-1.9.1-test/apk/ (same upload cert as 1.9)
Tests: verify-back.js 118/118; 1.9 suite 78/78; 1.8 suite 106/110 (4 fails = test expects "v1.9" tag text). No on-device test.
