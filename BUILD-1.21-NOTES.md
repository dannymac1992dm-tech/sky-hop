# Sky Hop 1.21 (versionCode 25) — playable test build, not uploaded

Local test release only. No Play upload, no site deploy, no store-listing change.

## Baseline
Built on the supplied 1.20 source (versionCode 24, versionName was `1.20-candidate`), imported beside the existing site files. Gameplay source is `flappy-clone/`. The Capacitor wrapper is the sibling `sky-hop-app/`. `scripts/sync-web.js` resolves that sibling (`../../flappy-clone` from `scripts/`), which is `/workspace/flappy-clone` in this checkout. Older README lines that hard-code that absolute path match this layout; the script does not depend on them.

## What changed
- versionName `1.21`, versionCode `25`. In-app label matches. AdMob app id and unit ids are unchanged (`pub-9357129551510699`).
- Starter bird is the red-and-gold phoenix: swept-back crest, layered feathers, glossy eye. Hit circle stays 16px at every evolution stage. Stage 40 still adds the toy-machine parts on that same small bird. Skins still recolor it.
- Ceiling-to-floor columns are gone, including the old reskinned pairs. Each gate is a handful of compact, separate obstacles. Every one can be cracked and crumbled by the existing helpers (pellet, rocket, zap, toy). They do not grow back into columns.
- Nine existing regions still change every 20 levels. Inside them, 22 drawn families and 10 patterns (solo, stagger, gateway, triangle, bob, drift, orbit, wave, ring, gauntlet) are chosen from the level. Later laps mix in the next region's shapes. This is procedural. None of the 10,000 levels is hand-authored.
- Saves, coins, upgrades, evolution, pause, checkpoint every 10 levels, Save & Continue, helper spacing (one at a time, next only after the current one ends), collectible Magnet (off until picked up), Ghost with no count, hunters, and the level-10 boss cadence are unchanged.

## Coverage that was actually measured
`node flappy-clone/tests/obstacles.test.js` (0 failures):
- 1,224 focused gates across early, mid, late, and end levels, including 1, 100, 1,000, 5,000, and 10,000, plus a sweep of all 10,000 levels × 2 gates (20,000 gates, about 54 ms).
- Every gate had at least one obstacle, a clear corridor at least as tall as the existing gap (never under 100px), and no piece taller than 68px.
- 22 families and 10 patterns showed up. Each region's own family appeared on at least a quarter of that region's sampled gates.
- A 1.20-shaped save (4,321 coins, evolution stage 12, tree and upgrade levels, a skin) reloaded with those values intact.

Browser play (`?debug=1`, Chrome) 0 gameplay failures:
- Live levels 1, 100, 1,000, 5,000, 10,000 spawned compact clusters, not columns. Bird radius stayed 16 through all 40 stages. Drawn size stayed within about 8% of the starter.
- Corridor center did not collide; obstacle centers did. A hit cracked; further hits crumbled.
- Collecting a second helper replaced the first. Magnet radius was 0 until a Magnet was collected, then 130, then 0 again.
- Autopilot on a live level kept playing and scored. 240 simulation frames took 3.9 ms in that headless loop (simulation only; the screenshot frames are separate full draws).

Screenshots in the review artifacts are frames from that running canvas, bird at normal play size.

## Build
- Debug APK: `skyhop-1.21-code25-debug.apk` (signed with the local Android debug certificate only, not a Play key). SHA-256 `46643d4219b2a9cdc32569c67d08a2487b0907ab186c1c377a08da3e1eb57e97`.
- Release bundle: `skyhop-1.21-code25-release-unsigned.aab`. SHA-256 `147fb98d7e89540478261d44d7aed6e94798ef8ac8f7e39a357a02beeca151a1`. No upload key was present, and none was created. `jarsigner` reports the bundle unsigned, so it can be signed later.
- `aapt` on the APK: `com.skyhop.mobile` versionCode 25 versionName 1.21. Packaged `game.js`, `obstacles.js`, `ads.js`, and `economy.js` match `flappy-clone/`.

## Limits
- Patterns and silhouettes are generated. Do not describe this as 10,000 unique hand-made levels.
- Art is drawn in code. It follows the approved rock, crystal, gear, and debris ideas and adds more region shapes; it is not the painted concept board itself.
- Boss levels (every 10) are a denser pattern in the current region, not a separate hand-built encounter.
- Solid ground trunks no longer collide, because they were tall columns. Background trees still scroll.
- Hunters, black holes, the floor, and the ceiling are still there.
- A fresh clone needs `npm ci` and `npx cap sync android` before Gradle. The generated plugin project and `www/` stay out of git, as before. Signing secrets were not added.
