# Sky Hop 1.11 (versionCode 14): build notes

Built Tuesday, Oct 20, 2026 (America/Detroit). **NOT uploaded, deployed or pushed anywhere.** Danny must approve uploads.
Working copy: /workspace/skyhop-1.11-work (copied from /workspace/skyhop-1.10-work, which is untouched).
Patch script: patch111/apply.py.

## What's new (Danny's list)
1. **Rocket Boost replaces the Slow-mo pickup.** The bird auto-flies through the next 5 pipes at 1.7x world speed with a
   flame trail, and it can't crash while boosted. (1.11.1: the Slow-mo skill is now removed too; see below.)
2. **Black hole / wormhole.** Flying into it skips ahead 5 levels, with a warp flash and a toast. It's much rarer than power-ups:
   level 6+, never on boss levels, at least 80 pipes apart, 1% per eligible pipe, at most 2 per run (about 1 per 180 pipes;
   power-ups come about 1 per 25). It rides in a pipe gap and scrolls in from off-screen right. The warp clears the pipes on
   screen, gives a short grace period, saves any checkpoint jumped past, and announces a new world when it crosses one.
3. **Faster boss levels:** x1.22 scroll speed (was x1.08). Gap rule unchanged (-10 px, never below 100 px).
4. **5 new original birds:** Penguin Pal (200 coins / 1 ad), Bumble Bee (250 / 2), Jungle Toucan (300 / 2),
   Fire Phoenix (450 / 3), Galaxy Hopper (500 / 3). Same Shop flow: coins, or the opt-in card, then the Rewarded Unlock unit. 10 original skins in total.
5. **A new world every 20 levels, 9 worlds:** Day Sky 1-20, Sunset Desert 21-40, Snowy Peaks 41-60, Night City 61-80,
   Outer Space 81-100, Blossom Valley 101-120, **Coral Reef** 121-140 (new), **Lava Land** 141-160 (new),
   **Candy Clouds** 161-180 (new), then the cycle repeats ("Day Sky II" at 181).
   World 1 uses the **original green pipes again as plain tubes**. The end is a flat band exactly as wide as the tube, with no wide
   Mario-style rim (checked on screen pixels: band 50 px = tube 50 px). This replaces 1.10's "sky stone" columns.
6. **Power Bird pickup:** the bird grows 1.65x and smashes any pipe it touches for a random 5-10 pipes.
7. **Spaceship pickup:** the bird rides a spaceship that fires rockets at the pipes ahead and destroys them, for 10 pipes.
Ride modes (Rocket, Power Bird, Spaceship) run one at a time and count pipes, not time. The floor and ceiling can't kill the bird while
one is active, and there's a 45-frame grace when it ends. A pill under the score shows how many pipes are left.

## Rules kept
- Power-ups are still rare (6% per pipe, at least 10 pipes apart, at most 1 on screen) and ride in pipe gaps from off-screen right. Coins are unchanged.
- No new storage keys, URLs, network requests or data collection. No audio files: music is still the original in-code loops
  (new worlds reuse existing ones; see AUDIO-LICENSE.md). Sound effects are synthesized.
- Live AdMob IDs are unchanged: pub-9357129551510699, app ca-app-pub-9357129551510699~6915096354, the same 3 units, and test mode is off.
- Versions: build.gradle versionCode 14 / versionName "1.11"; ads.js APP_VERSION "1.11", APP_BUILD 14; cache-buster ?v=1110.

## Build
    node scripts/sync-web.js && cp www/* android/app/src/main/assets/public/
    cd android && JAVA_HOME=/home/box/jdk/jdk-21.0.12.1+1 ./gradlew --offline bundleRelease   (log: ../gradle-bundle-1.11.log)
AAB: /workspace/sky-hop-publishing/store-assets/skyhop-release-v1.11-code14.aab
sha256 fdf1661ce2070ec1681ac7b205eea8d8085d7a5e358e69e1a476b43ec3cd0bad. It's signed with the same upload cert as 1.10
(SHA256 1F:00:E6:...:71:DB), and bundletool reports versionCode 14 / versionName 1.11.
Web zip: /workspace/skyhop-1.11-work/sky-hop-web-1.11.zip (sha256 c405e9d0c5a28f74a80ad5e11eb5c4b3911f14d2bd2c2f32d8ad00a3a8d264f0).
The itch.io zip was NOT rebuilt.

## Tests (/workspace/sky-hop-1.11-test)
- New verify-1.11: 77/77 (worlds, rim pixel check, boss speed, each power-up, black hole, birds, IDs, 60 fps).
- 1.9.2 suite: 88/88. Back suite: 118/118. 1.9 suite: 78/78.
- 1.10 suite: 51/61. All 10 failures are the requested changes: 25 to 20 levels per world (3 checks + cross-fade at L25),
  green tubes in place of sky stone (2), boss x1.22 in place of x1.08, 10 skins in place of 5, and the version 1.11/14 checks (2).
- Speed: a steady 60 fps / 60 Hz in all 9 worlds and every ride mode plus the black hole, at 4x CPU throttle on the phone (412x915),
  Fold outer (301x772) and Fold inner (720x800) viewports. Not yet tested on a real device.

## Caveats
- The new worlds reuse existing music loops rather than having new songs.
- The black hole adds 25 points to the score (5 levels x 5 pipes), which also counts on the leaderboard.
- Store screenshots and the feature graphic should lead with the new worlds, per Legal.

---------------------------------------------------------------------------------------------------------------
# Sky Hop 1.11.1 (versionCode 15): slow-motion completely removed

Built Tuesday, Oct 20, 2026 (America/Detroit). **NOT uploaded, deployed or pushed anywhere.** Same working copy
(pre-change 1.11 snapshot: /workspace/skyhop-1.11-work.bak-v1.11). Patch script: patch1111/apply.py.

## Removed (Danny: "the time slow down still on there")
- Slow-mo skill (economy SKILLS entry, key 4, 300 coins / 3 ads, unlock at level 60): gone from Shop > Skills, the skill bar and the "new skill" moments.
- "Time Warp" upgrade (slowDur) in Shop > Upgrades.
- Legacy "feat_slowmo" catalog item and its v1.4 -> skill migration.
- All runtime code: SLOWMO_SCALE, slowmoFrames, world/gravity/render slow-down, blue tint overlay, skill icon, sfxSlow.
- Leftover Slow-mo pickup code (POWERUP_INFO.slow, puSlowFrames, its HUD timer and sprite). Unknown/retired power-up kinds are now ignored.
- Desktop key "4" does nothing (keys 1-3, 5-7 unchanged).
- Eagle perk "Slow-mo lasts 50% longer" became "Magnet lasts 50% longer". The Quick Recharge row icon now uses the Dash icon.

## Old saves
Players who bought it are refunded: 300 coins if they unlocked Slow-mo early, plus 40/90/170/300 for each Time Warp tier.
The retired ids are dropped from the save, so the refund can only happen once. No crash: checked with a seeded old save.

## Versions
build.gradle versionCode 15 / versionName "1.11.1"; ads.js APP_VERSION "1.11.1", APP_BUILD 15; cache-buster ?v=1111.
AAB: /workspace/sky-hop-publishing/store-assets/skyhop-release-v1.11.1-code15.aab
sha256 1b4b0ef2ad71814f5fb175e33d96dbba6610cb246462204573480e34a14cf786. Same upload cert as 1.10/1.11 (SHA256 1F:00:E6:...:71:DB).
Web zip: /workspace/skyhop-1.11-work/sky-hop-web-1.11.1.zip (sha256 df91809e6bac6a594dbdf57e3f93eddd8df1d75444dc6df1cee4da866d214bb9). Log: gradle-bundle-1.11.1.log.
The itch zip and web-dist/ were NOT rebuilt.

## Tests (/workspace/sky-hop-1.11-test, run-1111-*.txt)
- New verify-1.11.1.js: 85/85. That's the 77 1.11 checks with versions updated to 1.11.1/15, plus 8 new no-slow-mo checks: source/www/Android assets scan,
  old-save refund (100 -> 530 coins), no skill slot, Shop rows, Eagle perk, key 4 + forced pickup + a 6000-frame run with no slow-down, skill bar, and no errors.
- Original verify-1.11.js: 75/77. The 2 failures are the expected version checks (1.11/14).
- 1.9.2 suite: 88/88. Back suite: 118/118.
- 1.9 suite: 75/78. The 3 failures are expected: "slowmo still fires by tap" on 3 viewports.
- 1.10 suite: 50/61. The 10 failures already expected in 1.11 remain, plus "Slow-mo bubble slows the world" (expected).
