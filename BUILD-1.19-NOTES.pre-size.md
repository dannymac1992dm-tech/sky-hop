# Sky Hop 1.19-candidate (versionCode 23) - build notes (local only, nothing uploaded)
Built Oct 30 2026, America/Detroit (EDT).

## Changes
- **Helpers, one at a time.** A new pickup replaces the running one and the same kind stacks up to 2x. Pickups come about every 7-8 s.
- **Pellets.** Back to the 1.17 size. They fly STRAIGHT as small streaks with a light trail and a small white pop, with no sparkle.
- **Rocket Pop.** Restored exactly to the 1.18 look (rainbow-tinted body, 2 flames per frame, 1.18 impacts). Its path is STRAIGHT and homing.
- **Zap Wand.** Crackling orbs on a RANDOM zig-zag path with a lightning trail and an electric pop.
- **Poof Toy.** Lobbed on RANDOM arcs (height 30-120 px plus sideways sway) with a colourful confetti trail and a confetti pop.
- **Effect caps.** Bolts 14, flames 110, sparks 40, blasts 8 (the 1.18 values, needed for the 1.18 rocket look).
- **Magnet.** Now a collected, timed in-run pickup: 8 s, 130 px reach, with a ring only while it is active. It is guaranteed about every 20 s.
  - The built-in magnet and the evolution-card magnet line are removed.
  - The old Magnet refund is kept, and its banner now says "Magnet is now a pickup".
- **Ghost.** Reusable, with a recharge ring and no number.
- **Obstacles.** These shapes are now mixed into runs, about 70% of columns: blocks, balloons, clouds, rocks, crystal, barricade/crates, monster (cute slime), windmill.
  - They are themed per world (`OBST_MIX` in `patch117/obst119.js`). Boss levels keep the spiked column.
  - Floating platforms and moving gates are the existing moving columns from level 50+. They now take the shapes too.
  - The shapes are render-only on the same column hitbox, so gaps and difficulty are unchanged.
- **Breaking.** Every obstacle breaks under every helper.

## Previously unbreakable (now fixed)
- Levels 1-2 (`PIPE_BREAK_MIN_LEVEL` was 3).
- Every boss-level spiked column, because helpers were switched off on boss levels.
- The second half of a column once the first half crumbled (an `!p.cr` check).
- Regrown stumps, which were never targeted.

## Source
`patch117/p17.py` generates the game from `game.1.15.js`. It now runs `burst117.js` (helpers), `p19_magnet_pickup.py`, `p19_break.py`, `p19_obstacles.py` and `obst119.js`.

## Tests (all FAILS 0)
single 0 · burst x3 0 · obstacle 0 · ghost 0 · pause 0 · magnet 0 · fx119 0 · break119 (197 checks, run twice) 0 · soak BAD 0 · crash sweep 0 errors · hunter rate 99.8% · pickup gap 0 fails (normal and SKILL=4) · screenshots 0 page errors.
Some tests were updated for the new rules:
- burst: helpers now work at level 1 and on boss levels, and pipes break at level 2;
- fx119: the new looks and paths;
- obstacle: the restored 1.18 caps.

## CPU at 4x throttle (ms CPU per frame, perf_ab rep 1; 1.17 / 1.18 / 1.19)
- L41 natural 12.5 / 17.5 / 16.4
- L81 natural 15.3 / 18.9 / 16.1
- L41 overload 15.5 / 21.1 / 16.4
- L81 overload 15.8 / 19.1 / 17.1
- In a partial rep 2, L41 natural was 12.1 / 16.1 / 15.2. That rep was stopped early because a 1.18 sample hit a 17 s harness stall.
