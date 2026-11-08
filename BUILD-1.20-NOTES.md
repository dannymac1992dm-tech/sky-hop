# Sky Hop 1.20 candidate (code 24), built Oct 30, 2026 9:23 PM America/Detroit. Local only, nothing uploaded.

## Changes
1. Save points every 10 levels (CHECKPOINT_EVERY 20 -> 10). Worlds stay every 20 (WORLD_EVERY / worldIndexFor are separate from checkpoints). Before 1.20, checkpoints were per run and in memory only, so no old checkpoint data exists to carry over. Bird, coins, upgrades, evolution and best level carry over as before.
2. Save & Continue: the run is saved (localStorage key skyhop_resume_v1) on level-up, pause, app background/pagehide/blur and Quit. Home shows a big "Continue · Level N" button that resumes after a 3-2-1 countdown at the start of the saved level, with the save point, run coins and active helper. A crash saves the last 10-level save point (nothing if none was reached yet). "New Game" needs a confirmation that names the run it replaces. On game over, a tap continues from the save point.
3. Guide line removed: the Owl Pathfinder dashed line (setLineDash 4,8) from the bird to the next safe-gap ring. The ring stays. The other dashed strokes are the bird tread decoration and the Magnet reach ring; neither is a guide line, so both were kept.
4. Helper spacing: no helper pickup spawns while one is active. The next one comes 2.5-3.5 s after it ends (the timer starts from expiry). Still one at a time.

## Flags
- Ads/revenue: the ad-gated checkpoint continue is hidden while a free Continue exists.
- Helpers are now active for about 77% of play time; before 1.20 they could overlap or replace each other.
- Store text updated in STORE-TEXT-1.20.md (the "every 7-8 seconds" wording is gone).

## Tests (all FAILS 0 / BAD count 0)
quiet, evosize, obstsize, single (checkpoint section rewritten for 10), burst x3 (the first Rocket Pop/Poof Toy limit was raised to pipe 88 in 9 of 10 runs because of the spacing), obstacle, ghost, pause, magnet, fx, resume (new; includes a kill and reload), break, soak, crash_sweep, hunter_rate, pickup_gap x2 (new: 0 spawns while busy, wait after end >= 2.4 s).

## Build
jarsigner: jar verified. The AAB assets game/ads/economy.js are byte-identical to flappy-clone/. See SHA256SUMS-1.20.txt.
