# Sky Hop 1.6 (versionCode 7) build notes, 2026-09-29 (NOT uploaded)

Purpose: fixes the AdMob publisher ID only. 1.5 used the mistyped pub-9357129551501069.
The real ID (from the AdMob UI, /workspace/admob_review/ids.txt) is pub-9357129551510699.
No gameplay changes.

- App ID (strings.xml admob_app_id): ca-app-pub-9357129551510699~6915096354
- Banner ca-app-pub-9357129551510699/5602014680 · Rewarded Continue .../9791621264 · Rewarded Unlock .../5030249177
- The Google demo IDs (ca-app-pub-3940256099942544/...) used by the Test-ads switch are unchanged.
- ads.js APP_VERSION "1.6", APP_BUILD 7 (diagnostics label v1.6; 5-tap panel shows "Sky Hop v1.6 (7)").
- build.gradle versionCode 7 / versionName "1.6". Cache-busting ?v=160.

Build steps (same as 1.4/1.5):
    cd /workspace/sky-hop-app && node scripts/sync-web.js
    cp www/* android/app/src/main/assets/public/
    cd android && JAVA_HOME=/home/box/jdk/jdk-21.0.12.1+1 ANDROID_HOME=/home/box/Android/Sdk ./gradlew bundleRelease
    cp app/build/outputs/bundle/release/app-release.aab /workspace/sky-hop-publishing/store-assets/skyhop-release-v1.6-code7.aab

AAB sha256: d57849c7441efc165f8cf27fd2bc4c4f6853719736a50c830e9cc2778d9c213e
Signed with android/keystore.properties (the same upload cert as 1.3/1.4/1.5:
SHA1 39:DC:8E:39:...:A0:B1, SHA256 1F:00:E6:8C:...:71:DB). jarsigner verified.
Verified with bundletool 1.18.1 (/home/box/bin/bundletool-all.jar): the manifest APPLICATION_ID is @string/admob_app_id,
which resolves to ca-app-pub-9357129551510699~6915096354. The AAB has 0 occurrences of 9357129551501069.
Pre-1.6 backup: /workspace/backups/pre-1.6/
GitHub Pages (sky-hop-site) was not updated. It still serves the 2026-09-23 build, which has only Google test IDs.
