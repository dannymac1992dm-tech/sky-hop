# Sky Hop 1.15-candidate (versionCode 19) — LOCAL test candidate, nothing uploaded
Built Oct 27 2026 (America/Detroit). Copy of 1.14; 1.12/1.13/1.14 files untouched.

Artifacts
- skyhop-release-v1.15-code19-candidate.aab  sha256 cee1b30702f29a5e2882560157395a040bb3c8becd57be93f124644eb771dc4e (signed, jarsigner verified)
- sky-hop-web-1.15-candidate.zip             sha256 a74ae27971ddd829d2b1f0399bfc1b9b647afc2923c7b22b29eb7fe2aa527c0f
- Screenshots: screens-1.15/ ; source patches: patch115/ (game.js/economy.js are generated from game.1.14.js/economy.1.14.js by patch115/rebuild.sh)
- Tests: patch115/perk_tests.js (assertions), crash_sweep.js (6 species x levels 25/61/88, perk L3, 0 errors), ui_shots.js

Changes
1. Evolution changes the SHAPE every 10 pipes (10 forms): bigger wings (wing tips), longer tail (extra tail feathers), growing crest. Skins/species only recolour the form reached.
2. Default birds are no longer yellow: Sparrow teal, Swallow blue, Owl white-blue, Hummingbird mint/aqua, Parrot cyan/blue, Eagle navy/white. Same family in all 10 forms. (Optional Duck/Bee/Gold skins stay yellow.)
3. Per-bird 3-level perk tracks (coins 100/250/500, earn-only), active from Level 21, paused on boss levels:
   Sparrow Second Wind -> Wide Beak (pickup radius x1.3, L3 x1.6); Swallow Long Dash (x1.35, L3 x1.7) -> Rocket Recharge; Owl Long Shield (x1.3) -> Pathfinder (glow on next safe gap; L3 two gaps);
   Hummingbird Tight Hover (gravity x0.92, flap height unchanged) -> Long Magnet (x1.3); Parrot Rich Pickups (+10%) -> Coin Shower (3%, +4 coins); Eagle Mighty Bird (+2 pipes) -> Talon Smash (first hunter/net hit smashed).
   L3 = "Master" upgrade of each line. Per-bird perk screen: Birds screen -> tap a bird. Saved in save.birdPerks (normalised 0-3).
4. Unchanged: hit circle (bird.r 16), scale 0.65, physics at L0, difficulty, names, ads (opt-in), levels 1-20 and bosses.
