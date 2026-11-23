# Sky Hop 1.4 (versionCode 5) — AdMob diagnosis build (NOT uploaded)

AAB: /workspace/sky-hop-publishing/store-assets/skyhop-release-v1.4-code5.aab
(same upload cert as 1.3, SHA256 1F:00:E6:8C:...:71:DB). Built on 2026-09-25 with:

    cd /workspace/sky-hop-app && npm ci && node scripts/sync-web.js
    cp www/* android/app/src/main/assets/public/     # (cap CLI needs Node 22; box has Node 20)
    cd android && JAVA_HOME=/home/box/jdk/jdk-21.0.12.1+1 ANDROID_HOME=/home/box/Android/Sdk ./gradlew bundleRelease

Changes (source of truth /workspace/flappy-clone):
- ads.js: rewarded never hangs (8s load timeout, 8s "must appear" timeout, event-driven outcome;
  plugin 8.1.0 showRewardVideoAd never settles on close-without-reward / failed-to-show).
- ads.js: banner state reset on bannerAdFailedToLoad (before: after 1st failure only a no-op
  resumeBanner was called, so no more banner requests that session).
- ads.js: hidden diagnostics — tap the tiny "v1.4" label (bottom-left) 5x. Shows SDK init, consent,
  request/loaded/failed counts, last AdMob error code+message, log. "Test ads" switch uses Google
  demo units after app restart (label shows "TEST ADS" while on).
- game.js: "No ad available right now" / "Ad closed early — no reward" notice; button re-enabled.
Backups of pre-1.4 files: /workspace/backups/pre-1.4/
