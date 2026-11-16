# Sky Hop — Capacitor Android app

Native Android wrapper for the **Sky Hop** web game using [Capacitor](https://capacitorjs.com/).

| | |
|---|---|
| **Display name** | Sky Hop |
| **Application ID / package** | `com.skyhop.mobile` |
| **Game source of truth** | `/workspace/flappy-clone` (do not treat `www/` as editable source) |
| **This project** | `/workspace/sky-hop-app` |

iOS is not included (Linux box cannot add the iOS platform). Android is fully scaffolded.

---

## Prerequisites

- **Node.js ≥ 22** (Capacitor 8 CLI requirement). This box uses nvm:
  ```bash
  unset NPM_CONFIG_PREFIX
  export NVM_DIR="$HOME/.nvm"
  . "$NVM_DIR/nvm.sh"
  nvm use   # reads .nvmrc → 22
  ```
- **Android Studio** (recommended) with Android SDK + JDK 17+
- Or command-line: JDK 17+, Android SDK, `ANDROID_HOME` set

### Box status (scaffold environment)

| Check | Result |
|-------|--------|
| `npx cap add android` | Succeeded |
| `npx cap sync` | Succeeded |
| Gradle / APK build | **Blocked** — no JDK (`JAVA_HOME` unset, `java` not found) and no Android SDK on this Linux box |

The Android project under `android/` is complete; build the APK on a machine with Android Studio or a configured SDK.

---

## Sync web assets from flappy-clone

Game files live in `/workspace/flappy-clone`. This app copies them into `www/` (Capacitor `webDir`), then into the Android assets on sync.

```bash
cd /workspace/sky-hop-app
npm run sync:web          # copy flappy-clone → www/
npm run cap:sync          # sync:web + npx cap sync
```

Or manually:

```bash
npm run sync:web
npx cap sync android
```

**Do not** edit gameplay under `www/` or `android/app/src/main/assets/public/` — those are generated. Edit `/workspace/flappy-clone` only, then re-sync.

---

## Open in Android Studio

```bash
cd /workspace/sky-hop-app
npm run cap:sync
npx cap open android
# equivalent: open android/ in Android Studio
```

Then: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

---

## Build APK (CLI)

With JDK 17+ and Android SDK installed:

```bash
cd /workspace/sky-hop-app
npm run cap:sync
cd android
./gradlew assembleDebug          # → app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease        # needs signing config for Play Store
```

Release / Play Store: configure signing in Android Studio or `android/app/build.gradle`, then `bundleRelease` for an `.aab`.

---

## Project layout

```
sky-hop-app/
├── capacitor.config.json   # appId com.skyhop.mobile, appName Sky Hop, webDir www
├── package.json
├── scripts/sync-web.js     # copies /workspace/flappy-clone → www/
├── www/                    # generated web assets (Capacitor webDir)
└── android/                # native Android project (applicationId com.skyhop.mobile)
```

`webDir` is `www` (inside the Capacitor project). Capacitor does not reliably support pointing `webDir` at `../flappy-clone` outside the project, so we use `npm run sync:web` instead.

---

## npm scripts

| Script | Purpose |
|--------|---------|
| `npm run sync:web` | Copy flappy-clone → `www/` |
| `npm run cap:sync` | sync:web + `npx cap sync` |
| `npm run cap:open:android` | Open Android Studio |
| `npm run cap:copy` | sync:web + `npx cap copy` |

---

## Package / Play identity

- **applicationId**: `com.skyhop.mobile`
- **namespace / Java package**: `com.skyhop.mobile`
- **app_name**: Sky Hop

Do not rename to a personal-name package.

---


---

## AdMob (test units)

Plugin: **`@capacitor-community/admob@8.1.0`** (pinned, Capacitor 8–compatible).

Web ad logic lives in `/workspace/flappy-clone/ads.js` (synced into `www/`). It detects the Capacitor native bridge and **no-ops in a plain browser** so the Safari/local play link keeps working.

### Placeholders → where they go

| Placeholder / value | Where |
|---------------------|--------|
| `[ADMOB_ANDROID_APP_ID]` | `android/app/src/main/res/values/strings.xml` → `admob_app_id` (referenced by `AndroidManifest` meta-data `com.google.android.gms.ads.APPLICATION_ID`) |
| `[BANNER_AD_UNIT_ID]` | `flappy-clone/ads.js` banner load (menu + game-over) |
| `[REWARDED_AD_UNIT_ID]` | `flappy-clone/ads.js` rewarded continue |
| `[INTERSTITIAL_AD_UNIT_ID]` | Optional later (Phase C) — not wired |

### Current debug values (Google official test IDs)

| Role | Value | Notes |
|------|-------|--------|
| **App ID** (debug) | `ca-app-pub-3940256099942544~3347511713` | Google **sample** App ID in `strings.xml`. Replace with live `[ADMOB_ANDROID_APP_ID]` before Play release. **Never** ship the sample App ID in a production store build. |
| **Banner** (Android test) | `ca-app-pub-3940256099942544/6300978111` | Used until live `[BANNER_AD_UNIT_ID]` |
| **Rewarded** (Android test) | `ca-app-pub-3940256099942544/5224354917` | Optional continue; free Retry always available |

Do **not** invent live ad unit IDs or revenue numbers. Create units in the AdMob console for `com.skyhop.mobile`, then swap constants in `ads.js` + `strings.xml`.

### Behaviour

| Context | Behaviour |
|---------|-----------|
| Plain browser / Safari | `SkyHopAds` no-ops; no banners; no continue button |
| Capacitor Android | Init AdMob + UMP consent (best-effort); banner on **start menu** and **game-over**; **hidden during play**; optional **Watch ad to continue** (one continue per reward / per run) |
| Layout | `#game-wrap` uses CSS `--ad-banner-pad` so Retry / continue sit above the bottom banner |

UMP: plugin `requestConsentInfo` → `showConsentForm` when status is `REQUIRED`. If AdMob console GDPR messaging is not configured yet, consent may fail open for **test** ads — configure messages before production.

### Sync after game / ads edits

```bash
cd /workspace/sky-hop-app
npm run cap:sync    # sync:web (flappy-clone → www) + npx cap sync
```

Then rebuild the APK/AAB on a machine with Android SDK / Android Studio.

### After ads ship (Legal / store)

Coordinate with `/workspace/sky-hop-publishing/`: mark Play **Contains ads**, flip WHEN ADS SHIP rows in Data safety, confirm Privacy Policy advertising section. See `admob-wiring-notes.md`.

## Safety notes

- `/workspace/flappy-clone` is never moved or rewritten by this scaffold.
- Do not kill processes on port **8080** or localtunnel — the live web preview may be running there.

---

## Release signing (Play AAB)

See [RELEASE-SIGNING.md](./RELEASE-SIGNING.md). Keystore is Danny’s — never commit it.
