# Sky Hop 1.8 (versionCode 9): "1.8 Skill tap fix". Build notes, 2026-10-06 (NOT uploaded)

Release name: **1.8 Skill tap fix**
Danny approved this build for Play Closed Alpha. This build was **not** uploaded. Upload is a separate step.

AAB: `/workspace/sky-hop-publishing/store-assets/skyhop-release-v1.8-code9.aab`
sha256 `bfe4d6f68066936081561650fec20d2a0c2da90802918867bf41f075346390c5`
Signed with `android/keystore.properties`, using the same upload cert as 1.3 to 1.7
(SHA1 39:DC:8E:39:...:A0:B1, SHA256 1F:00:E6:8C:...:71:DB). jarsigner says "jar verified". It prints the same
self-signed/no-timestamp/JarInputStream warnings as the 1.7 AAB, which is normal for an AGP-signed bundle.

Source of truth is still `/workspace/flappy-clone`. It is synced into `sky-hop-app/www/` and `android/app/src/main/assets/public/`.

## Suggested Play release notes (en-US)
    Fixed skill buttons not responding after ads load; banner sizing on foldables; steadier menu layout.

## What changed
Only ads.js, game.js, the cache-busting in index.html/sky-hop.html (`?v=180`) and build.gradle changed.
There are no gameplay, physics, balance, economy or ad unit ID changes, and economy.js and style.css are unchanged.
Diffs: `/workspace/sky-hop-1.8-test/v1.8-game.js.diff`, `v1.8-ads.js.diff`.

1. **Skill tap bug (main fix), in game.js**
   - Cause: `canvasToLocal()` cached the canvas rect until a window resize or scroll. The native AdMob banner is an
     overlay, and ads.js toggles `--ad-banner-pad` on `<html>` without any resize. That moves the canvas, so taps
     during a run were mapped with the menu-time rect and landed 30 to 50 CSS px low. Skill buttons
     (Dash/Shield/Shrink/Slow-mo/Magnet/Glide) then fell through to `flap()`. In 1.7, game-over buttons could
     misfire the same way: the 1.7 baseline run below shows Shop/Birds/Trophies taps restarting the run.
   - Fix: the rect is re-read on every pointer down (touchstart/mousedown) and reused only for the drag moves that
     follow. As backstops, the rect cache is cleared and the canvas re-fit on a new `skyhop:bannerpad` event
     (dispatched by `setBannerPad`), on a MutationObserver on `<html style>`, and on a ResizeObserver on `#game-wrap`.
   - `fitCanvas()` now sizes the canvas to `#game-wrap`'s content box, excluding the banner padding. On the inner Fold
     screen the canvas was squashed (aspect 0.726 instead of 0.667). It is now 423x635 instead of 483x635.
2. **Adaptive banner width after fold/unfold, in ads.js.** The plugin sizes `ADAPTIVE_BANNER` once, when the AdView
   is created. ads.js now records the viewport width at creation. A resize or orientationchange is debounced
   by 400 ms. If the width differs by 24 px or more, the banner is removed (`removeBanner`) and recreated at the
   new width: immediately if on a menu or game-over screen, otherwise at the next menu or game-over. This never
   happens during a run, and `showBanner()` now returns early when the screen is "playing".
3. **Reserved banner space (Legal / AdMob accidental-click guidance), in ads.js**
   - On menu, shop, birds, trophies, missions and game-over, `--ad-banner-pad` is set **when the screen opens**,
     before and regardless of consent or load. At app start this happens synchronously when ads.js loads, before
     game.js's first `fitCanvas()`.
   - Reserved height: the measured adaptive banner height for this viewport width, cached in localStorage key
     `skyhop_banner_h` (a layout cache only). Until a height has been measured, it is the anchored-adaptive
     maximum, min(90, 15% of screen height) and at least 50, which is 90 px on both Fold screens. So the banner can
     never be taller than the space. While on a screen the padding can grow (only if a banner turns out taller)
     but never shrinks. `bannerAdFailedToLoad`, size events with height 0 and hides no longer zero it there.
     All non-run screens share one reservation, so it is recomputed only when coming back from a run or after a
     width change.
   - Trade-off: the very first menu of a fresh install reserves 90 px even if the banner turns out to be 50 to 60 px,
     leaving a small empty strip. From the next screen on, the measured height is used.
   - Runs are unchanged: no banner, padding 0.
   - hideBanner failure: a failed hide is retried twice, 250 ms apart. A "never shown" rejection means the plugin
     has no AdView, so nothing is on screen. If the hide still fails, the AdView is removed with `removeBanner`.
     The padding is cleared only once the banner is known to be gone. If both hide and remove fail, the padding
     stays during the run so the banner can't cover the play area. The skill taps still work there because of fix 1.
   - Plugins without AdMob, consent permanently failed, or SDK init failed: no reservation. The web build never
     reserves anything.
4. **Version tag (#skyhop-ver)** reads **v1.8**. It is smaller (9 px font, 4x6 px padding, about 29x17 px). During
   runs it is `visibility:hidden` and `pointer-events:none`, so it can't cover or swallow taps meant for the left
   skill button. On menus and game-over it is still the 5-tap diagnostics entry. The diagnostics panel now shows a
   "Banner space" line: reserved px, AdView width, and whether a recreate is pending.
5. **Version:** build.gradle has versionCode 9 / versionName "1.8". ads.js has APP_VERSION "1.8", APP_BUILD 9
   (panel "Sky Hop v1.8 (9)"). Cache-busting is `?v=180`.

## Build steps (same as 1.4–1.7)
    cd /workspace/sky-hop-app && npm ci && node scripts/sync-web.js
    cp www/* android/app/src/main/assets/public/
    cd android && JAVA_HOME=/home/box/jdk/jdk-21.0.12.1+1 ANDROID_HOME=/home/box/Android/Sdk ./gradlew bundleRelease
    cp app/build/outputs/bundle/release/app-release.aab /workspace/sky-hop-publishing/store-assets/skyhop-release-v1.8-code9.aab
(`node_modules` was missing on the box, so `npm ci` was run first, as in the 1.7 steps.)

## Verification
All checks passed on the 1.8 source unless noted otherwise.
- **AAB:** bundletool 1.18.1 dump manifest shows package com.skyhop.mobile, **versionCode 9, versionName 1.8**.
  APPLICATION_ID = @string/admob_app_id, which resolves to **ca-app-pub-9357129551510699~6915096354**.
  `bundletool validate` is OK. The AAB has 0 occurrences of "501069". pub-9357129551510699 appears only in
  base/resources.pb and assets/public/ads.js. The bundled ads.js/game.js/economy.js/index.html/sky-hop.html/style.css
  are byte-identical to /workspace/flappy-clone.
- **AdMob IDs unchanged:** the App ID and banner/rewarded unit IDs in ads.js match 1.7 exactly (diffed).
  strings.xml and AndroidManifest.xml are unchanged. The app-ads.txt copies (`admob_review/`, `user-site-staging/`)
  are untouched (mtime 2026-10-03) and read `google.com, pub-9357129551510699, DIRECT, f08c47fec0942fa0`.
- **Syntax:** `node --check` passes for ads.js, game.js and economy.js.
- **Original repro** (`/workspace/skyhop-skill-fix/repro/`, run against the new source, Fold outer 301x772 DPR 3 and
  inner 604x725 DPR 3, mocked native AdMob, run started by a real menu tap with the banner shown):
  - `repro-ads.js`, BANNER_H=60 and 90: all 5 skills fire with no flap on both screens. 1.7 missed all 5 and flapped.
  - `sweep.js`, 60 px: the tap zones now match the drawn buttons (outer drawn 569..602, fires 566..604; inner drawn
    656..709, fires 652..714). In 1.7 they were 30 to 50 px too high.
  - `repro.js`, no ads: all 5 fire.
  Outputs are in `/workspace/sky-hop-1.8-test/out-repro-*-v18.txt` and `out-sweep-60-v18.txt`.
- **Extended suite** `/workspace/sky-hop-1.8-test/verify.js`: **110/110 pass** on 1.8 (`out-verify-v18.txt`).
  The same suite on the 1.7 source: 50/110 (`out-verify-ORIGINAL-1.7.txt`). Covered, per Fold screen × 60/90 px
  mocked banner:
  - All 5 skills fire at their drawn centres:
    - in one run started by a menu tap with the banner shown;
    - in fresh runs after the game-over banner;
    - after a rewarded Continue;
    - after a failed banner load;
    - after folding mid-run;
    - with hideBanner failing.
  - Game-over Shop / Birds / Trophies (and Back), "▶ Watch N ads — unlock" (featured), and Continue
    ("▶ Watch ad — resume", which plays a rewarded ad and resumes the run) all hit.
  - Menu Shop / Birds / Trophies (and Back), 🔒 Privacy policy (opens the live privacy.html URL) and ⚙ Privacy choices
    (opens the UMP privacy options form) all hit.
  - Menu: the padding is reserved before consent and load finish. Canvas and all buttons are identical between
    loading → loaded and loading → failed, and unchanged after the Privacy choices flow. The second session reserves
    exactly the measured 60 or 90 px.
  - Game-over: padding is reserved within 30 ms of game over and does not change when the banner resumes, loads or
    fails.
  - hideBanner failures:
    - fails once: retried, then padding 0;
    - always fails: removeBanner, then padding 0;
    - hide and remove both fail: padding kept during the run.
  - Fold change:
    - unfold on menu: banner removed and recreated at 604 px, and the reservation recomputed;
    - fold during a run: no banner calls, padding 0;
    - next game-over: banner recreated at 301 px.
  - Version tag reads v1.8, is hidden and non-interactive in runs, and doesn't overlap the left skill or the menu buttons.
  - Plain web build (no Capacitor): the game loop runs at 60 fps / 90 sim steps in 1.5 s, padding 0, no version tag.
  - No console errors or page errors. The only 404 was /favicon.ico from the test HTTP server.
- Screenshots: `store-assets/v1.8-check-menu-{outer,inner}.png` (mock 60 px banner overlay over the reserved 90 px,
  first session), `v1.8-check-play-{outer,inner}.png`.
- **Not tested on a real device.** There is no device or emulator on the box. Untested: live AdMob fill, real
  `bannerAdSizeChanged` heights, a real Fold posture change, and Android 15 edge-to-edge. The plugin adds the
  bottom system inset to the banner margin on Android 15+, which the padding doesn't include. That was also true in
  1.7 and is worth a look on the Fold.

## Web sync
The normal per-build web sync is flappy-clone → `sky-hop-app/www` → `android/.../assets/public`, and that was done.
`/workspace/flappy-clone` (the web source) has the fix. The public GitHub Pages repo `/workspace/sky-hop-site`
(origin github.com/dannymac1992dm-tech/sky-hop) still serves the pre-1.4 2026-09-23 game build, and 1.4–1.7 never
updated it. **It was not updated or pushed.** Copying 1.8 there would publish it and would need Danny's OK.

Pre-1.8 backup: `/workspace/backups/pre-1.8/` (flappy-clone; sky-hop-app build.gradle, capacitor.config.json,
package.json, scripts/, res/values + AndroidManifest.xml, www/, assets/public/; COMPLIANCE-AUDIT.md before the 1.8 entry).

## Production-access answers
`/workspace/sky-hop-publishing/legal/COMPLIANCE-AUDIT.md` §4 Q8 ("What changes did you make based on what you learned
during the closed test?") has a new 1.8 entry. Note: Q3 in the same file still says "Ads didn't serve during the test".
That conflicts with "real ads showing in closed testing", so Danny should reconcile Q3 before submitting.
