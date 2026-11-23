# Sky Hop 1.10 (versionCode 13): build notes

Built on Saturday, Oct 17, 2026 (America/Detroit). **NOT uploaded, deployed or pushed anywhere.**
Working copy: /workspace/skyhop-1.10-work (based on the 1.9.2 working copy). Live 1.9.1 sources
(/workspace/flappy-clone, /workspace/sky-hop-app) were not touched.

## What's new
- Worlds every 25 levels: Day Sky (1-24), Sunset Desert (25-49), Snowy Peaks (50-74), Night City (75-99),
  Outer Space (100-124), Blossom Valley (125-149), then the cycle repeats as "II", "III"...
  Each world has its own palette, sky/far layer/ground, pipe style, weather and original music, plus a "New World" banner.
- Moving pipes from level 50 (22% chance, ramps to a 55% max; amplitude 14 to 44 px). Breathing gaps from level 65
  (the gap never drops below 100 px). Moving pipes show a chevron tell.
- Boss level every 10 levels: BOSS banner, red look and vignette, faster/tighter pipes (speed ×1.08, gap −10, minimum 100),
  boss music variant. Clearing one pays +5 to +20 coins.
- Power-ups (rare: level 3+, 6% chance per pipe, at least 10 pipes apart, at most 1 on screen). They ride in pipe gaps and
  scroll in: Shield (one hit), Slow-mo (3 s), Magnet (6 s).
- 5 original skins: City Pigeon, Rubber Duck, Robo Hopper, Cloud Puff, Little Dragon. Each unlocks with coins or with the
  existing rewarded unlock unit.
- Legal: every ad unlock in the Shop now opens an opt-in card that shows the reward before any ad plays
  ("▶ Watch ad" / "No thanks"). All new music is original and generated in code; sources are recorded in AUDIO-LICENSE.md.
  No new storage keys, URLs or data collection.

## Kept from 1.9.2
- Game Over buttons stay usable while ads load.
- Consent is gated by canRequestAds.
- Play Games sign-in happens only on a Leaderboard tap.
- Live AdMob IDs are unchanged (pub-9357129551510699, app ~6915096354). No 501069 anywhere.

## Build
    node scripts/sync-web.js && cp www/* android/app/src/main/assets/public/   # cap CLI needs Node 22; box has 20
    cd android && JAVA_HOME=/home/box/jdk/jdk-21.0.12.1+1 ./gradlew --offline bundleRelease
Output: /workspace/sky-hop-publishing/store-assets/skyhop-release-v1.10-code13.aab
sha256 ae0c186ed70540b7c62b184c6b9e6e69962f8fad8e946a7bb8bf0c1958e8ed9d (rebuilt after the Day Sky restyle; the first build was 7e3a1967…).
It is signed with the same upload certificate as 1.9.2 (SHA256 1F:00:E6:...:71:DB) and bundletool reports
versionCode 13 / versionName 1.10.

## Tests (/workspace/sky-hop-1.10-test)
- verify-1.10: 61/61
- 1.9.2 suite: 88/88
- Back suite: 118/118
- 1.9 suite: 78/78

The speed checks ran at 4× CPU throttle on phone, Fold outer and Fold inner viewports. Not yet tested on a real device.

## Day Sky pipe restyle (Legal follow-up, Oct 17, 2026, ~9 PM America/Detroit)
- Day Sky (1-24) and its repeats (Day Sky II, 150-174, and so on) no longer use the old bright-green tube with a wide rim.
  They now use original "sky stone" columns: pale blue-white stone blocks with staggered joints, a sky-blue inlay stripe,
  a slate outline for readability, and a flat two-course carved slab instead of a rim.
- The old green pipe sprites (pipeBodySprite/pipeCapSprite) and their fallback were removed. Every pipe now goes through the
  world-style renderer (style 0 = sky stone).
- Hitboxes and gap sizes are unchanged; this is visual only.
- New tests check that no world or boss pipe palette is green, that Day Sky and Day Sky II use stone, and that the green
  pipe colours are gone from the source.
- Rebuilt: AAB (still 1.10 / code 13, same upload cert), web zip and itch zip.
