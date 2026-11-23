# Sky Hop 1.18-candidate (versionCode 22, versionName "1.18-candidate"), second round: LOCAL ONLY, nothing uploaded

Built Oct 28 2026 4:18 PM America/Detroit from the 1.17 work copy. The 1.17 files in review, the 1.16 files and the first-1.18-round files are untouched (hashes at the bottom).
No new permissions, no new SDKs.

## Artifacts (/workspace/skyhop-1.18-work/)
- skyhop-release-v1.18b-code22-candidate.aab  sha256 7d6ea3ad9fb24faea44ace6f5134a6631531dced611d62a444518f91be0b878f (signed, jarsigner verified; game/economy/ads.js inside the AAB == flappy-clone)
- sky-hop-web-1.18b-candidate.zip  sha256 bbc2473625b4b5b85537b5d3ea58fac93290ffab6ec69ef1b42233404a86818e (10 files)
- STORE-TEXT-1.18.md (store text, "Notes for Danny"), SHA256SUMS-1.18.txt, flappy-clone/README.md
- Screenshots (JPEG, max 900 px) in screens-1.17/jpg/: see the list at the end.

## What changed in this round (cumulative with the first 1.18 round)
1. **Steady, stacking helpers** (patch117/p17_burst.py): Pellet Burst / Rocket Pop / Poof Toy placed every 5-8 s of play (300-450 frames; skills shorten it, floor 4 s), rotated so none is starved, new pickups add to the running effect (up to 2x one pickup), so all three are usually on together. Not on boss levels, the level before one, or the very first levels (pellet from level 2, rocket 3, poof 5).
2. **Colourful effects, boosted** (patch117/burst117.js): rainbow pellets (bigger, white outline, glow, 4-step comet tail, sparks every 4 frames, small lightning arcs), rainbow rockets with a double flame trail, sparks and lightning, a cartoon starburst + fire ring + rainbow sparks on every rocket impact, rainbow stars and lightning on every hunter hit, a bigger starburst + sparks + lightning + small fire on a defeat (still the confetti poof, no body), and a Poof Toy blast with a rainbow shockwave, starburst, 14 sparks, 5 lightning arcs and a little fire. Pipe cracks and crumbles also throw sparks. No blood, no gore.
   Pools are capped: 14 lightning bolts, 110 flame bits, 56 sparks, 8 starbursts, 40 obstacle chips, 48 particles, 170 confetti (obstacle_tests asserts the caps).
3. **Evolving obstacles**: every world's obstacle cracks in 3 stages with its own colour/glow/chips, crumbles in the cartoon puff, and from the third world on regrows a small solid stump (only when 110+ px ahead of the bird; gap never reduced). Boss obstacles unchanged.
4. **Witch-hunters in many shapes**: 6 silhouettes with hats/brooms that vary per tier; hit box >= 17x21, HP 2-4, confetti defeat, reliable-hit fix kept.
5. **Trails category removed**: Skills / Evolution tabs only; one fixed fiery red-gold trail, always on. Old saves: trail selections ignored, coins spent on trails refunded once (spark 75, rainbow 150, bubbles 175, stars 200, fire 250; the Spark refund is a best guess).
6. **Ghost: several uses per run**: 2 charges (+1 at Quick Recharge levels 2 and 4, max 4), 5 pipes each, 8 s gap after a ghost ends, one charge back every 45 s of play (faster with Quick Recharge, never while a ghost runs). HUD: charge pips + count badge + recharge ring. No boss-level exclusion existed before, so none was added.
7. **Magnet is now built into the bird** (patch117/p18_magnet.py, p17_econ.py): no skill, no coins, no key. Always on; range grows with the evolution stage, 48 px (stage 1) to 161 px (stage 40); pull speed about 3.5 to 8 px per frame by stage. Only normal coins are pulled (big risky coins are not), so no extra coins and the faucet is unchanged. A faint dashed ring shows the range and brightens while coins are pulled; the Magnet pickup still gives a short super pull. The Magnet branch is gone from the tree (18 branches), its daily mission is retired, the free stage-9 reward is now Coin Reach. Old saves: range tiers (40/90/170/300), Long Magnet levels (60/130/240/400) and the 375-coin skill (only if the save is below stage 9) are refunded once (`magnetRefund`), the ids are dropped, hostile/odd values do not crash.
8. **Pause** (patch117/p18_pause.py): round button on the right edge below the evolve pill (away from the hop area), P key; pause screen with Resume and Quit to menu (second tap confirms). Everything freezes (frames, bird, pipes, timers, helper/ride timers, pickup spacing, animations, effects). Resume has a 3-2-1 countdown (150 frames) before the bird moves, no invulnerability. Auto-pause on app background, screen off, Android Back (Back again resumes) and web tab blur/hide; returning never resumes by itself. No ads on the pause screen or during pause; rewarded continue and ride modes work (tests). Quit to menu = the run ends like a game over (coins and score banked once, no skipping) and the game-over screen with the menu buttons appears.

9. **Saving points spaced out** (patch117/p17_econ.py, p18_checkpoint.py): the "lines" are the "⚑ Checkpoint saved · Level N" flash line and the HUD "⚑ L{n}" pill (there is no line drawn in the world). Old spacing: every 10 levels (the same as boss levels). New: **every 20 levels** (levels 20, 40, 60 ...; two bosses apart, and in step with the 20-level world change). Boss levels stay every 10th level and keep their banner. The flash, the HUD pill, the menu text and the watch-ad "continue from checkpoint" point all follow `CHECKPOINT_EVERY`. Trade-off: a continue after a game over can now put the player up to 19 levels back (was 9), and the continue offer first appears after level 20. Nothing about checkpoints is saved in the save file (per run), so old saves are unaffected.

## Numbers
- Helper spacing (pickup_gap.js, 30 autopilot runs x 2 min, patch117/pickup_gap_results.log):
  - 1.17 baseline: avg gap 13.4 s, p95 45.3 s, longest 54 s; 1.85 pickups per minute.
  - first 1.18 round: avg 12.3 s, p95 17.1 s, longest 19.5 s; 3.8 per minute.
  - now: **6.9 pickups per minute**; outside boss windows avg 6.7 s, p95 7.8 s, longest 8.6 s; all gaps (boss windows included, rides excluded) avg 7.4 s, p95 11.9 s, longest 13.4 s. A helper was loaded 100% of non-boss play time; all three together 46%. Mix: pellet 163 / pop 132 / poof 119 (39% / 32% / 29%, Poof no longer 45%). Quick Recharge level 4 (SKILL=4, 20 runs): see pickup_gap_skill4.log, all PASS.
- Hunter defeat within 2 s (hunter_rate.js N=40, all tiers/variants): 99.8% (3832/3840).
- CPU, 4x throttle, 20 s per run, 3 reps (perf_ab.js, perf_ab.log), ms of main-thread CPU per frame, 1.17 vs 1.18:
  | Level / mode | 1.17 CPU ms/frame | 1.18 CPU ms/frame | 1.17 fps | 1.18 fps | frames over 50 ms (avg of 3) 1.17 / 1.18 |
  |---|---|---|---|---|---|
  | L41 natural | 13.9 | 16.1 (+16%) | 57.6 | 53.9 | 0.3 / 3.3 |
  | L81 natural | 14.5 | 18.1 (+25%) | 56.2 | 49.5 | 1.0 / 4.7 |
  | L41 overload | 15.8 | 20.8 (+32%) | 56.1 | 47.3 | 2.3 / 0.3 |
  | L81 overload | 16.3 | 21.1 (+29%) | 54.7 | 46.4 | 1.7 / 4.7 |
  The low-graphics setting (quality 2) now halves sparks, flames, lightning and starbursts (not measured for CPU, smoke-tested for errors).
  Flag: the effects boost makes 1.18 heavier than 1.17 (see the table); fps stays near 50-56 under 4x throttle. Play-test on a low-end phone before release.

## Tests (all on the final code)
- single_tests (59 PASS, incl. the 3 new checkpoint tests), burst117_tests x3 runs (98 PASS each), obstacle_tests (50), ghost_tests (19), pause_tests (46), magnet_tests (28): FAILS 0.
- soak_burst: BAD count 0. crash_sweep: TOTAL errors 0. hunter_rate: 99.8%. pickup_gap (30 runs) and Quick Recharge level 4 (20 runs): all PASS. perf_ab: errs 0.
- Logs in patch117/: single118, burst118_1..3, obstacle118, ghost118, pause118, magnet118, soak118, crash118, hunter_rate_after, pickup_gap_results, pickup_gap_skill4, perf_ab.

## Flags for LEGAL
- Hunters are poofed away (the earlier approval said "stunned only"), pipes crumble, Air Force style goggles and star badge, coin faucet 60 per run (+20 per Bonk Bounty level).
- NEW: fire and lightning visuals (rocket flame trails, fiery impact bursts, zig-zag lightning arcs, starbursts) and bigger hit/defeat effects. All cartoon, capped, no blood, no bodies. Re-check the Play / itch content-rating questionnaire (mild cartoon fantasy violence).
- NEW: coin refunds for trails and Magnet (one-time, approximate), the Magnet skill and Trails tab are removed from the store text.
- Hunters spawn naturally only from level 35, so a player below level 35 never meets one.
- Balance: helpers are about 3.6x as frequent as in 1.17.

## Screenshots (screens-1.17/jpg/)
FX1-rainbow-pellets, FX2-rocket-flames-lightning, FX3-rocket-fiery-impact, FX4-poof-toy-blast, FX5-hit-sparks, FX6-defeat-confetti-burst, FX7-all-three-helpers, H1-hunter-tiers, H2-witch-shapes, O-ice-1..4 and O-lava-1..4 (crack, big crack, crumble, regrown stump), P1/P2 (Skills tab: no Trails tab, no Magnet), P3 (Evolution tab), G1/G2 (Ghost HUD with 3 and then 2 charges), M1/M2 (magnet pull at stage 1 and stage 40), PA1 (HUD with pause button), PA2 (pause screen), PA3 (resume countdown).
Old files `skills-tab-*.jpg` and `trails-tab.jpg` show the Trails tab: do not use them.

## Hashes that must not change
- 1.17-candidate AAB 645bea1424cc8ab906fbe57be726e572ed58f98d58f7fd7694ba0fee4ba59aad, zip d16f402da74cf98efa30e9b7a3656e887a32d8b3c811b9de0ce8549518169c14
- 1.16 AAB cd13f909587d44da..., zip c60ff473bf189084...
- first 1.18 round (saved in /workspace/skyhop-1.18-baseline/): AAB fd616ccaf78bad332ded4f71bdeddc6133e20ba963bfd6d168b149d5081e7153, zip 0e10507a59b20d99a4142b4b095678b16e5d7244e01919a5a932c707ef025433
