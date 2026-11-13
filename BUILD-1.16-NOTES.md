# Sky Hop 1.16-candidate (versionCode 20) — build notes (progress log)

Local only. Nothing uploaded or submitted. Work dir: /workspace/skyhop-1.16-work (copy of 1.15-work; 1.12-1.15 files untouched).

## Done so far (Tue Oct 27 2026, ~11:15 PM America/Detroit)
- Generator: patch116/p16.py turns game.1.15.js into flappy-clone/game.js (never hand-edited).
- Birds: new Style C+ core (patch116/styleC_core116.js): round colourful 1.10-style bodies + radial shading, soft top highlight, glossy eye, thin rim light (stronger on dark birds). 1.15 shape evolution, perks, hit circle (r16), physics, names, scale 0.65 kept. Non-yellow family per species kept (teal Sparrow, blue Swallow, white/blue Owl, mint Hummingbird, cyan Parrot, navy/white Eagle).
- Pickups: PU_CHANCE 0.06 -> 0.10, PU_MIN_GAP_PIPES 10 -> 7, first Rocket Boost/Spaceship guaranteed from pipe 36 (needs level>=3, free slot).
- Version: versionCode 20 / 1.16-candidate (build.gradle, ads.js APP_VERSION).
- perk_tests.js (patch116) updated for gap 7: all PASS.
- Frame-time vs 1.15 (4x CPU throttle, sequential): ~0-8% more CPU/frame, no errors (stress115/results/compare116.log, matrix116*.log, ab116.log).

## Pellet Burst / Rocket Pop (levels 21+, none on boss levels or the level before)
- Pickup kinds `pellet` (~3 s of small bright cartoon pellets, homing, collected in-run) and `rocket pop` (3 aimed homing cartoon rockets, 9 frames apart, poof only).
- Hunters hit by either are stunned (90 / 150 frames) and knocked back, shown dazed ("Bonk!", stars); never removed by these two, no blood, no death animation, no explosion.
- Hunter nets/bolts hit by a pellet/rocket are popped with a poof. A stunned hunter cannot hurt the bird; a normal hunter still ends the run (control test).
- Code: patch116/burst116.js + p16_burst.py (exec'd by p16.py). Names in store-facing text: "Pellet Burst", "Rocket Pop". Words gun/kill/shoot/weapon/blood appear only in code comments/variables (shootCD), never in player-visible text; README line changed to "throw".
- Pickup tuning: chance 6% -> 10%, min gap 10 -> 7 pipes, first Rocket Boost/Spaceship guaranteed by pipe 36 (observed 13-34 in 6 real runs; 12-run earlier test <= 42).
- Caveat: hunters spawn naturally from level 35, so at 21-34 pellets/rockets mostly pop nets/bolts or fly as cosmetic effect.

## Tests (final code)
- perk_tests.js: FAILS [] (only benign favicon 404). burst_tests.js: FAILS 0. crash_sweep.js (3 levels x 6 birds, powerups): 0 errors.
- soak_burst.js (6 birds x levels 21/36/45, forced pellet/pop + hunters, 2400 frames): no NaN, no stuck frames, no page errors, longest 60-frame step 5 ms.
- Frame time at 4x CPU throttle, A/B 1.15 vs 1.16, 20 s runs: cpu ms/frame ~11-12.7 vs ~11-12.5 (parity); p99 16.8-33 ms both; >50 ms frames 0-1 per run both. One 1.16 run reported max=235790 ms: measurement artefact (wall 24 s); 5 reruns max <= 50 ms.
- Earlier pool-of-3 matrix showed more >50 ms frames for 1.16 than 1.15; sequential A/B shows parity. Cause unexplained (likely contention).

## Build
- skyhop-release-v1.16-code20-candidate.aab sha256 cd13f909587d44dafc45d6ab399f87891503c582139d4e35ff6ce208597beb8d (signed, jarsigner verified, game.js inside AAB == flappy-clone/game.js)
- sky-hop-web-1.16-candidate.zip sha256 c60ff473bf1890846f3cac3534a1fedf8f1eb1ea365c1988305239f025667a47
- Build notes: sky-hop-app needed `npm ci` (node_modules absent); node is v20 so `cap copy` refuses (needs 22): ads.js + game.js copied www -> android assets/public by hand, then gradlew bundleRelease.
- Screenshots: screens-1.16/ (PNG) and screens-1.16/jpg/ (<= 900 px). Nothing uploaded.
