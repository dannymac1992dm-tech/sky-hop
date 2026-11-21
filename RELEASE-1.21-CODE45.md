# Sky Hop 1.21 code 45 — unsigned Play bundle

Gameplay commit `af4367d`. No gameplay or art changes in this build. The code 45 web files were synced into the Capacitor project before `bundleRelease`. Bundled `ads.js`, `game.js`, `obstacles.js`, `flight.js`, `economy.js`, `index.html`, and the `art/` files match `flappy-clone/` byte for byte. `APP_BUILD` is 45. `WORLD_EVERY` is 5.

Nothing was uploaded.

## Manifest (from the AAB, via bundletool)

- package `com.skyhop.mobile`
- versionCode **45**
- versionName **1.21**
- minSdk 24, targetSdk 36, compileSdk 36
- AdMob `APPLICATION_ID` resource `string/admob_app_id`: `ca-app-pub-9357129551510699~6915096354`
- `jarsigner -verify`: jar is unsigned (no manifest signature)
- `minifyEnabled` is false, so R8 did not write a `mapping.txt`

Live ad units in the bundled `ads.js` (used unless the on-device test switch is turned on):

- banner `ca-app-pub-9357129551510699/5602014680`
- rewarded continue `ca-app-pub-9357129551510699/9791621264`
- rewarded unlock `ca-app-pub-9357129551510699/5030249177`

The Google sample app ID is not in the native resources. The sample unit IDs remain in `ads.js` only as the optional test-mode constants.

## Permissions versus the 1.20 source (commit 0eb0949, versionCode 24)

The app manifest still declares only `android.permission.INTERNET`. That list is unchanged. `applicationId`, the live AdMob app ID, and the Android library versions are unchanged. The extra permissions below are merged from those same libraries (AdMob, Play services, WorkManager). None were added for this build.

- `android.permission.INTERNET`
- `android.permission.ACCESS_NETWORK_STATE`
- `com.google.android.gms.permission.AD_ID`
- `android.permission.ACCESS_ADSERVICES_AD_ID`
- `android.permission.ACCESS_ADSERVICES_ATTRIBUTION`
- `android.permission.ACCESS_ADSERVICES_TOPICS`
- `android.permission.WAKE_LOCK`
- `android.permission.FOREGROUND_SERVICE`
- `com.skyhop.mobile.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` (signature)

## Tests

`flappy-clone/tests/obstacles.test.js` and `flappy-clone/tests/flight.test.js`: 0 failures.

## Artifact

`/opt/cursor/artifacts/skyhop-1.21-code45/sky-hop-1.21-code45-release.aab`

SHA-256 `b366f7e3c8ce6c9e44fe84af089926affd3b98058c933d4432484998c5d54458`
