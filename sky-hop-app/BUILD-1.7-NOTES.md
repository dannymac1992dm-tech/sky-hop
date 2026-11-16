# Sky Hop 1.7 (versionCode 8) build notes, 2026-10-02 (NOT uploaded)

Purpose: pre-production compliance fixes from `/workspace/sky-hop-publishing/legal/COMPLIANCE-AUDIT.md`
(M2 rewarded-ad labels, M3 in-app privacy link + stale bundled legal pages, M4 privacy options entry point,
S1 consent-before-ads, M5 launcher icon/splash). No gameplay, physics, timing or economy changes:
the fixed 60 Hz sim + render extrapolation and the 1.5/1.6 no-hitch work are untouched (only menu,
game-over and shop drawing code and ads.js changed).

AAB: /workspace/sky-hop-publishing/store-assets/skyhop-release-v1.7-code8.aab
sha256 0bc767ba68237301d6d213d33909a3bd543525791dcb45bf1671bbf2d517bd49
Signed with android/keystore.properties: the same upload cert as 1.3–1.6
(SHA1 39:DC:8E:39:...:A0:B1, SHA256 1F:00:E6:8C:...:71:DB). jarsigner: "jar verified".

Source of truth is still /workspace/flappy-clone (synced into www/ and android assets).

## Changes
1. Rewarded-ad disclosure (game.js)
   - Practice restart: "Practice restart (easy start) — free today" for the daily free use; after that
     "▶ Watch ad — easy start (first pipes gentler)" (the button plays a rewarded ad).
   - Featured unlock on game-over (native): "▶ Watch N ad(s) — unlock <item> (p/m)". Web demo: "Demo unlock <item> (p/m)".
   - Shop ad chips: "▶ Ad p/m"; shop footer on native: "▶ Ad = watch a rewarded video ad · drag to scroll".
   - Already labelled and unchanged: "▶ Watch ad — resume Level N", "⚑ Watch ad — continue from Level N checkpoint",
     "Watch ad — double coins". Every showRewarded() call site was checked (continue, checkpoint, double coins,
     safe start, featured unlock, shop item unlock, shop skill unlock).
2. Privacy policy link: "🔒 Privacy policy" button on the start menu (ground strip) opens
   https://dannymac1992dm-tech.github.io/sky-hop/privacy.html via window.open; Capacitor's
   Bridge.launchIntent sends external URLs to an ACTION_VIEW intent (system browser), same path as the Share fallback.
   Stale bundled privacy.html / terms.html / legal-index.html (Sept 15 copy with [AD NETWORK PRIVACY URL] /
   [CONTACT EMAIL]) and the internal README.md are no longer bundled: scripts/sync-web.js EXCLUDE list,
   and removed from android/app/src/main/assets/public/. (The files still exist in /workspace/flappy-clone.)
3. Consent + privacy choices (ads.js)
   - Order is now: UMP requestConsentInfo → showConsentForm if REQUIRED → AdMob.initialize() only if
     canRequestAds === true → banner / rewarded loads. Before 1.7, initialize ran first and a consent error "failed open".
   - Consent error / timeout / canRequestAds false: no SDK init, no ad requests, no ad buttons. Retried on a later
     menu / game-over screen at most once per 60 s, max 5 tries per session. Never retried, and the consent form
     is never shown, during a run (deferred to the next menu).
   - privacyOptionsRequirementStatus is stored; SkyHopAds.privacyOptionsRequired() / showPrivacyOptions().
     The menu shows "⚙ Privacy choices" next to Privacy policy when UMP says REQUIRED; it calls
     AdMob.showPrivacyOptionsForm(), then re-checks consent (hides banner / stops ads if canRequestAds became false).
   - Diagnostics panel shows consent attempts and the privacy-options status.
4. Icons / splash (scripts/gen-icons.py, from store-assets/icon-1024.png)
   - Legacy ic_launcher / ic_launcher_round PNGs (mdpi–xxxhdpi), adaptive icon = bird foreground +
     sky/sun/hills background (mipmap PNGs) + monochrome bird (themed icons). Capacitor stock PNGs and the
     drawable-v24/ic_launcher_foreground.xml + drawable/ic_launcher_background.xml vectors removed.
   - All 11 splash.png variants: sky #6ec6ff + centred framed icon. Android 12+ system splash:
     windowSplashScreenBackground #6ec6ff + windowSplashScreenAnimatedIcon @drawable/splash_icon.
   - Previews: sky-hop-app/icon-src/ (contact.png, adaptive-preview.png, splash-android12-preview.png).
5. Version: build.gradle versionCode 8 / versionName "1.7"; ads.js APP_VERSION "1.7", APP_BUILD 8
   (label "v1.7", panel "Sky Hop v1.7 (8)"); cache-busting ?v=170.

## Build steps (same as 1.4–1.6)
    cd /workspace/sky-hop-app && npm ci && node scripts/sync-web.js
    cp www/* android/app/src/main/assets/public/
    cd android && JAVA_HOME=/home/box/jdk/jdk-21.0.12.1+1 ANDROID_HOME=/home/box/Android/Sdk ./gradlew bundleRelease
    cp app/build/outputs/bundle/release/app-release.aab /workspace/sky-hop-publishing/store-assets/skyhop-release-v1.7-code8.aab
(`cp` never deletes files, so the stale legal pages and README.md were removed from assets/public by hand once.)

## Verification
- bundletool 1.18.1 dump manifest: package com.skyhop.mobile, versionCode 8, versionName 1.7, APPLICATION_ID
  = @string/admob_app_id → "ca-app-pub-9357129551510699~6915096354".
- aapt2 badging (universal APK): label Sky Hop, icon res/mipmap-anydpi-v26/ic_launcher.xml (background/foreground/monochrome).
- AAB: 0 occurrences of "501069"; pub-9357129551510699 only in resources.pb and assets/public/ads.js;
  assets/public = ads.js, economy.js, game.js, index.html, sky-hop.html, style.css, cordova*.js.
- Headless Chrome (/workspace/sky-hop-1.7-test/check.js, web build + mocked Capacitor AdMob plugin): all checks pass
  (consent→form→initialize order, no init/requests on consent error or canRequestAds=false, throttled retry,
  Privacy choices calls showPrivacyOptionsForm, Privacy policy opens the live URL, labels, STEP_MS = 1000/60).
  Screenshots: store-assets/v1.7-check-*.png.
- Not tested on a real device (no device/emulator on the box): live UMP form, system-browser hand-off, icon on the launcher.

Pre-1.7 backup: /workspace/backups/pre-1.7/ (flappy-clone, build.gradle, res/, AndroidManifest.xml, sync-web.js).

## Still open (not in this build)
- The live privacy policy (sky-hop-site, not pushed) still says the app has no in-app privacy-options button
  (§4.4/§4.5). The audit (M4 step 3) has the replacement wording.
- Audit items not in scope for 1.7: S2 banner delay on game-over, S3 hidden "Test ads" switch, S6 allowBackup,
  M6 terms placeholders, M7–M10 Console/listing work.
