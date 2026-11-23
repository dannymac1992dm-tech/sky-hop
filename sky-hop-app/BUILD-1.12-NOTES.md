# Sky Hop 1.12 (versionCode 16, versionName "1.12"): build notes

Built Saturday, Oct 24, 2026 (America/Toronto). **NOT uploaded, deployed or pushed anywhere.** Danny must approve uploads.
Working copy: /workspace/skyhop-1.12-work (copied from /workspace/skyhop-1.11-work = 1.11.1, which is untouched).
Patch scripts: patch112/ (p1 eye + old-save cleanup, p2 mid-game ease, p3 economy.js, p4 game.js systems, p5 versions, p6 world obstacles;
`run_all.sh` re-copies the pristine 1.11.1 sources and re-applies all of them).

## What's new
### 1. The eye button is gone
The 👁️ "gap flash / next pipe" skill (button, skill bar slot, shop entry, hint flash, gap-hint drawing and its texts) is removed from game.js and
economy.js. `feat_hint` is dropped from old saves in `loadUnlocks`/`loadUnlockProgress`. **Owners of the eye skill are not refunded**
(it was an unlock; nothing else in the save changes). Skills left: dash, shield, shrink, magnet (+ ghost as an extra skill).

### 2. Combo meter ("candy crush" chain)
- Each scored pipe is rated: **close** (within 14 px of a gap edge, shown as "So close!", +2 and +1 bonus coin), **near-edge** (within 40 px, +1),
  or **comfortable**. Collecting a coin also builds the chain.
- Multiplier = 1 + floor(chain / 2), **capped at x8**. **Two comfortable passes in a row** (no coin between them) break the combo; a miss (death) ends it.
- Milestone bonus coins the first time a chain reaches x3 / x5 / x8: 1 / 2 / 5.
- Coin pickups are worth +25% per step above x1 (x8 = 2.75x). That is the only effect on scoring; the score itself is not multiplied.
- FX: particle burst + HUD pulse, an escalating chime per step, "COMBO xN!" text, and a "Combo lost" fade. Best combo is stored in `stats.bestCombo`.
- Screens: combo-burst-frame-0..7.png, combo-burst-phone.png, combo-burst.gif in /workspace/sky-hop-1.12-test.

### 3. Daily streak (+ one freeze)
Opens as a popup on the first launch of each calendar day (it consumes the first tap: the Collect button pays and closes it).
- Reward = 5 + 3 x (day - 1) coins, capped at 47, plus day-7 bonus +15 and day-14 bonus +25. Day 7 = 38, day 14 = 69, day 20 = 47, day 30 = 97.
- **Streak freeze:** one freeze covers one missed day; at most 1 held; one is earned on every 7th streak day (7, 14, 21, ...) if none is held.
- Persisted inside the existing save (`streak` in the `skyhop_v15` key: no new storage keys). A menu chip shows the day and the freeze.
- Tested with day rollover, a skipped day with and without a freeze, and a reset (verify-1.12 section C).

### 4. End-of-run reward chest
- Appears after a run with score >= 5, one per run. **Coins only.** Tiers: small 70% (x1), medium 25% (x3), **jackpot 5% (x10)**; base = 1 + floor(score / 15) + floor(best combo / 4), capped 1-12; expected value about 1.95 x base. Coins are credited at game over. Fanfare on medium/jackpot, jackpot burst.
- **Google Play policy:** coin-only; no real-money purchase, no paid or randomised paid reward, no billing code (verify-1.12 greps for it). An optional
  **rewarded-ad "double"** is opt-in (a button the player taps); ads never auto-play and are never tapped in tests (the ad mock logs calls).
- Screens: chest-closed/opening/jackpot(-frame-0..3)/doubled/gameover-after-chest.png, chest-jackpot.gif.

### 5. Easier mid/late game (Danny reached about 180 pipes)
Applied in `applyDifficulty`, before the boss block, so bosses keep their x1.22 relative speed (and -10 px gap, min 100). Levels 1-20 are unchanged.

    EASE_FROM_LEVEL = 20, EASE_RAMP_LEVELS = 20, EASE_GAP_PX = 8, EASE_SPEED_MUL = 0.96, EASE_SPAWN_FRAMES = 3
    t = clamp((level - 20) / 20, 0, 1);  gap += 8 t;  speed *= (1 - 0.04 t);  spawn interval += 3 t   (full effect from level 40)

| level | gap old -> new | speed old -> new | room x time (about) |
|---|---|---|---|
| 1-20 | same | same | 0% |
| 37 | 139.1 -> 145.9 | 2.74 -> 2.65 | +8.6% |
| 41 | | | +10.2% |
| 121 | | | +10.9% |
Mid/late game is about 8.6-11% easier; it is not trivial (speed still ramps, gaps still shrink with level, bosses and breathing/moving pipes are unchanged).
Verify check: verify-1.12 section "ease" compares the live gap/speed with the old 1.11.1 formulas (levels <= 20 identical; 21+ gap = old + 8t, speed = old x (1 - 0.04t)), checks the net room x time gain (L29/37/41/61/121), that it still gets harder after level 40, boss x1.22 and boss gap >= 100, and that the worlds are unchanged.

### 6. Every world has its own obstacles (original art)
| world | obstacle |
|---|---|
| Day Sky (1-20) | **original plain green tube, unchanged** (no wide rim) |
| Sunset Desert | ribbed cactus with a pink flower and a domed cap |
| Snowy Peaks | faceted ice pillar with crystal-spike tips |
| Night City | skyscraper / antenna tower with lit windows, neon edge, roof beacon |
| Outer Space | cratered asteroid column with glowing veins |
| Blossom Valley | tree trunk with a blossom-cluster cap |
| Coral Reef | coral column with polyps and a lobed cap |
| Lava Land | basalt pillar with cracks, glowing crust and lava drips |
| Candy Clouds | red/white candy cane with a rounded striped cap |
All new bodies are painted the full 58 px hitbox width (the art is exactly as wide as what hits you; no wide rim). **Hitboxes and gap rules are the same
code path as the pipes** (`hitPipe`, `PIPE_W` 58, `PIPE_CAP` 22, gap/boss/breathing/moving rules, scoring, Rocket Boost / Power Bird / Spaceship pipe
counting, black hole): only `stylePipeBody` / `stylePipeCap` / `drawStyledPipe` art changed. Boss levels keep their own look.
verify-1.12 section H: 9 distinct looks, collision parity +-1 px at every gap edge and the wall in all 9 worlds, nothing drawn in the gap, art reaches the gap
edge, full-width bodies, Day Sky unchanged, live autopilot in all worlds, power-up/boss runs, no errors. Screens: obstacle-world-1..9-*-phone.png.

## Debug-only hooks (need ?debug=1; ignored in the shipped app)
`nostreak=1` / `nochest=1` URL flags (let old test suites run without the popup / chest), `SkyHopDebug.freeze112`, `placePipe112`, `hitPipe112`,
`obstacleKinds112`, `pipeW112`, `pipeGap112`, `clearCoins112`, `expectedSpeed`, `oldSpeed`, `oldGap`, `easeConsts`, `midEase`.

## Trade-offs
- The streak popup and the chest each add one tap between runs (retry is a little slower); both are skippable and quick.
- Combo coin factor, So-close coins, milestones, streak coins and chest coins all raise coin income. Shop prices are unchanged, so skins unlock sooner;
  watch the numbers after launch.
- Old saves keep everything; only `feat_hint` is dropped.

## Versions
build.gradle versionCode 16 / versionName "1.12"; ads.js APP_VERSION "1.12", APP_BUILD 16; cache-buster ?v=1120. AdMob ids unchanged
(pub-9357129551510699, app ca-app-pub-9357129551510699~6915096354, 3 units, test mode off). No new storage keys, URLs, network requests or audio files.

## Build
    node scripts/sync-web.js && cp www/* android/app/src/main/assets/public/
    cd android && JAVA_HOME=/home/box/jdk/jdk-21.0.12.1+1 ./gradlew --offline bundleRelease   (log: ../gradle-bundle-1.12.log)
AAB: /workspace/sky-hop-publishing/store-assets/skyhop-release-v1.12-code16.aab  (sha256: see bottom)  Signed with the same upload key as 1.10-1.11.1.
Web zip: /workspace/skyhop-1.12-work/sky-hop-web-1.12.zip (sha256: see bottom). The itch.io zip was NOT rebuilt.

## Tests (/workspace/sky-hop-1.12-test)
- **verify-1.12: 95/95** (eye gone incl. www + Android assets, combo math, streak persistence + day rollover, chest odds sum to 100, no ad auto-play,
  ease values, obstacles per world, steady 60 fps / 60 Hz sim at 4x CPU throttle in all worlds, ride modes, black hole, combo bursts and chest on
  phone 412x915, Fold outer 301x772, Fold inner 720x800). Log: out-verify-1.12.txt.
- Older suites (copies in /workspace/sky-hop-1.12-test/older, logs log-*-plain.txt = no flags, log-*-nostreak.txt = with &nostreak=1&nochest=1):
  see the table filled in at the bottom of this file. Expected failures are only: version strings (1.10 / 1.11.1), per-world pipe look checks (new obstacles),
  and (1.9.2/1.9/back suites) the streak popup eating the first tap or the chest intercepting a tap when run without the flags.

## Default bird (Sparrow) vs Flappy Bird: audit (notes only, no code change)
In game the Sparrow is a 34 x 28 ellipse (`SPECIES_DIMS.sparrow` = [17,14,1]) with a yellow gradient (#fff5a0 / #ffd54a / #f0a820), cream belly,
**orange beak** (#ff6b2d), **big white eye with black pupil**, amber wing on the body and a small tail fin: round yellow-orange chubby bird in profile with a
wing flapping up/down. That is very close to the Flappy Bird silhouette and colours (the app icon is the same character). Suggestions:
1. Change the default colour away from yellow/orange: e.g. the Swallow blue palette or a teal/cobalt/crimson sparrow; keep yellow for a shop skin only.
2. Change the silhouette: narrower, more streamlined body (e.g. 36 x 20), pointed head, a forked or longer tail, a swept wing instead of a round blob.
3. Beak and eye: a slimmer, dark or white beak instead of orange; a smaller eye with a brow line instead of the big round white eye.
4. Add one signature feature (head crest, tail streamers, a scarf/jetpack glow) so a screenshot is recognisably Sky Hop.
5. Keep the hit circle (r 16 - 2) unchanged so gameplay does not change.

## App icon: 3 replacement options (proposal; NOT in the build)
/workspace/sky-hop-1.12-test/icon-options/ (README.txt, make_icons.py, contact-sheet.png): each has `<name>-icon-512.png`,
`-adaptive-foreground-432.png`, `-adaptive-background-432.png` (+ `-adaptive-monochrome-432.png`). A = Nova Swift (teal), B = Rocket Falcon (crimson),
C = Comet Hummer (violet). None has pipes, yellow, a round body or pixel art. Danny picks one; then regenerate res/mipmap* via scripts/gen-icons.py
(use his pick as `icon-1024.png` source, or drop the layers into the adaptive-icon resources) and rebuild.

## Caveats
- **Not device-tested** (headless Chrome with phone/Fold viewports only). Obstacle art, chest animation and popup layouts should be eyeballed on a device.
- Nothing was uploaded, deployed or pushed; no ads were tapped or auto-played.

---------------------------------------------------------------------------------------------------------------
## Final results (filled in Sun Oct 25, 2026, America/Toronto)
Artifacts (NOT uploaded):
- AAB: /workspace/sky-hop-publishing/store-assets/skyhop-release-v1.12-code16.aab
  sha256 8bdf1800b0b34fc9a1dc64394091bcbc3c2e55650d5fbe16eca4cc6fdf60c6a7. Same upload cert as 1.11.1 (SHA256 1F:00:E6:...:71:DB), versionCode 16 / "1.12".
- Web zip: /workspace/skyhop-1.12-work/sky-hop-web-1.12.zip, sha256 1431d7306b5048eac2b817bb870d1f7efcb4d923c749089f5155b671e0d1e051
  (9 files; legal/privacy/terms/style.css identical to 1.11.1).
- Build log: /workspace/skyhop-1.12-work/gradle-bundle-1.12.log. **Build note:** the Gradle dependency cache (~/.gradle/caches/modules-2) was empty on
  this box, so this build ran online (`./gradlew bundleRelease`, ANDROID_HOME=/home/box/Android/Sdk) instead of `--offline`; it needs network once.
- The app icon in this build is the CURRENT icon (unchanged). The 3 options are only proposals.

verify-1.12: 95/95 (final re-run after the build, out-verify-1.12.txt).

Older suites on the 1.12 source (copies in /workspace/sky-hop-1.12-test/older; "flags" = &nostreak=1&nochest=1):
| suite | no flags | with flags | the failures are |
|---|---|---|---|
| 1.9.2 | 57/88 | **88/88** | the streak popup eats the first tap |
| back | 112/118 | **118/118** | the streak popup |
| 1.9 | crashed after 29/38 (popup) | 75/78 | 3 = "the other 5 skills still fire by tap": slow-mo is gone since 1.11.1 |
| 1.10 | 50/61 | 50/61 | 11 = 25-level worlds, sky-stone/green tubes, boss x1.08, 5 skins, versions, Slow-mo (all removed by 1.11/1.11.1/1.12) |
| 1.11.1 | 82/85 | 81/85 | version strings (2), "later worlds keep their own pipe styles" (names of the 8 new looks); 1 fps dip: Fold-outer 50fps on one 4x-throttled sample in a run that overlapped other work. verify-1.12 passes all 3 viewports. |
So the only failures are expected ones (retired features, versions, new obstacle looks, popup/chest in front of the first tap).

## App icon v2 options (replace the v1 options; Danny: "must read as a real bird")
/workspace/sky-hop-1.12-test/icon-options-v2/ (README.txt, contact-sheet.png): A-nova-eagle, B-storm-swallow, C-comet-macaw; each `-icon-512.png` +
`-adaptive-foreground/background/monochrome-432.png`. Drawn from individual feathers with beaks, eyes and tails; no yellow round bird, no pipes, no blue-sky-and-hills.
The AAB still has the current icon; nothing was rebuilt or uploaded for these.

## App icon v3 options (cartoon style, per Danny: "make it more cartoonish")
/workspace/sky-hop-1.12-test/icon-options-v3/ (README.txt, contact-sheet.png): A-captain-eagle, B-zoom-swallow, C-jetpack-macaw, each with `-icon-512.png` and
`-adaptive-foreground/background/monochrome-432.png`. Thick outlines, huge eyes, chunky shapes, saturated colours, goggles / scarf / jetpack. Not in the build; the AAB is not rebuilt.

## Icon options v4 (D-I)
Six more cartoon bird icon proposals (owl astronaut, puffin rocket, toucan jetpack, comet hummingbird, phoenix, kingfisher pilot) in /workspace/sky-hop-1.12-test/icon-options-v4/ (512 icons, adaptive layers, contact-sheet.png, README.txt). AI-illustrated + keyed to transparency. Not in the build; AAB unchanged.

## Phoenix icon (H) + sharper birds (final 1.12 / code 16)
- Launcher icon swapped to option H "Phoenix launch": all ic_launcher/_round/_foreground/_background/_monochrome densities, splash PNGs, splash_icon_art (scripts/gen-icons-phoenix.py; old icons in icon-src/old-icons-pre-phoenix/). Adaptive xml unchanged. No web/PWA icons exist in the project.
- Birds redrawn (patch112/p7_birds.py): slimmer body, longer swept tail blades, angular swept wing, pointed dark beak (orange/amber/yellow beaks darkened; duck/toucan/candy keep signature bills), smaller eye with brow, two-spike crest, bolder outline. Same hitbox, size, physics. Skin palettes unchanged.
- Capacitor CLI needs Node 22 (box has older), so www/ was synced with scripts/sync-web.js and copied into android/app/src/main/assets/public by hand, then gradlew bundleRelease (online).
- verify-1.12: 95/95 (two earlier runs each had 1-2 single-frame 4x-throttle hitches in the fps section, in different places; A/B of old vs new birds over 12 s showed no difference).
- AAB sha256 8a55449603958f9cf4eb8cb9c9397ea7a5e84f0426d4ba7e55e89276864d41b4; web zip sha256 45fc349647d4f0401bb00e41ccffa3c3ba5e9c35c923f5e628b3dc4bd5da8898

## FINAL 1.12 / code 16: Phoenix icon + fancier birds (approved by Danny)
- The fancier birds (patch112/p8_fancy_birds.py, now in run_all.sh after p7) replace the sharper-only birds above: layered feather shading and highlights, glossy eye with shine, gradients on body/wing, soft glow, faint spark trail in the bird's colours (only when no cosmetic trail equipped), curved crest and tail feathers. Hitbox, size, physics unchanged. Menu/picker/shop previews are baked into cached sprites (8 wing steps).
- run_all.sh reproduces the shipped game.js byte-for-byte. Build: sync-web.js, copy into android/app/src/main/assets/public, gradlew bundleRelease (online; Capacitor CLI needs Node 22 so cap sync is not used).
- Final AAB: /workspace/sky-hop-publishing/store-assets/skyhop-release-v1.12-code16.aab  sha256 bc31a5835cd96da27ef241421df550cb31bf155ad58abaef57986855cbb98372 (same upload cert 1F:00:E6:8C:...:D5:71:DB, versionCode 16 / "1.12"; identical bytes to ...-fancybirds.aab)
- Final web zip: /workspace/skyhop-1.12-work/sky-hop-web-1.12.zip  sha256 e9f7a2f6300a7e1e329a5395b3562b8773044fcf2bf87878afa53eae13387079
- Backups: ...-prefancy.aab (sharper birds, phoenix icon) 8a55449603958f9cf4eb8cb9c9397ea7a5e84f0426d4ba7e55e89276864d41b4; sky-hop-web-1.12-prefancy.zip 45fc349647d4f0401bb00e41ccffa3c3ba5e9c35c923f5e628b3dc4bd5da8898; ...-oldicon.aab 8bdf1800b0b34fc9a1dc64394091bcbc3c2e55650d5fbe16eca4cc6fdf60c6a7; ...-phoenixicon-only.aab eb7c7e577233e105cd057481784e95dbde6df370217d051920bc378ce345bab7
- verify-1.12: 95/95 (fps section included). Earlier single 2.5 s fps hitches on the shared box were rerun; a 40 s x2 frame-time comparison at 4x CPU throttle showed the fancy birds no slower than the previous ones.

