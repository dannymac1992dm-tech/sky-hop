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

## 1.19 late steers (rebuilt 18:39 America/Detroit, same code 23)
- Bird size cap: evolution no longer makes the Phoenix bigger. Body scale is fixed at 1.0; wing, tail and crest growth are capped (wings at most 1.076x, tail at most 1.04x, crest at most 3 feathers); the glow is a fixed size; accent trails, the halo and the stage 21-40 toy machinery sit closer to the body. A runtime size helper measures each stage's solid pixels and shrinks any stage over 1.05x of the starter's footprint area (floor 0.74). Worst stage: 1.06x (sqrt of area). Hit circle bird.r = 16 at every stage. Patch: patch117/p19_evosize.py.
- Obstacle sizes: non-pipe shapes come in col / slim (0.7x width) / chunky (1.55x, sometimes floating) / float (two floating pieces of 44-90) / stub (one 36-46 piece) / single (one floating piece only). The hit box is the drawn piece (segTopA/segBotB, noT/noB). The gap is always the difficulty curve's pipeGap; pieces only add room. Moving and boss columns keep the full column. Windmills keep full-length towers. Patch: p19_obstsize.py + obst119b.js.
- Plain pipes: the face on the old "monster" column end is gone; no column in any world has a face.
- Monsters: 8 free-standing designs (blob, spiky, horned, one-eyed, fuzzy, rocky, antenna, squid). Each world has its own set of three, with a per-world colour shift. The top and bottom monster of a pair are never the same design. Cute faces, gentle wobble, the crumble poof is kept.
- No pickup text: the pickup/skill/ride-end toasts, the floating pickup name tags, the "Pellet Burst!"-style banners, the first-Magnet label and the "Magnet is now a pickup" banner are removed. Collecting shows a wordless pop (ring, glow and the pickup's own icon). The small HUD icon stays. Patch: p19_quiet.py.
- Magnet pulls pickups (all 9 kinds) as well as coins, only while it runs (130 radius).
- New tests: evosize_tests (FAILS 0), obstsize_tests (174 checks, FAILS 0), quiet_tests (FAILS 0). Test updates: magnet_tests now expects no label; pause_tests lets the autopilot place the bird (wider obstacles).
- Full rerun: quiet, evosize, obstsize, single, burst x3, obstacle, ghost, pause, magnet, fx119, break119 (197), soak BAD 0, crash sweep TOTAL errors 0, hunter_rate 99.8%, pickup_gap and pickup_gap SKILL=4: all FAILS 0. fx119 failed once in an earlier pass, from a random hunter death during the autopilot run, then passed 3 times in a row.
- CPU at 4x (perf_ab rep 1, ms/frame 1.17 / 1.18 / 1.19): L41 natural 15.1 / 18.1 / 14.6; L81 natural 14.7 / 16.0 / 14.9; L41 overload 14.8 / 19.5 / 15.8; L81 overload 15.6 / 19.7 / 15.7. Rep 2 had a one-off 71 ms 1.19 sample (a page stall), so it was stopped.
- Screens: screens-1.17/evo-before/jpg, evo-after/jpg, evo-before-after-sheet.jpg, obst119b/jpg (sizes, plain pipes, monster designs, monsters per world, wordless pickup pop).

## 1.19 menace restyle (Oct 30, 2026)
- I changed only the art inside `drawMonsterArt` in patch117/obst119b.js. The friendly version is backed up in obst119b.pre-menace.js. Hitboxes, the confetti poof and all other code are unchanged.
- What changed: darker, more saturated colours; a near-black outline; glowing slit-pupil eyes set in sunken sockets; slanted brows and heavy lids; scowls with fangs or rows of teeth; claws; a dark gradient over the lower body; glowing lava cracks on rocky; hard shading marks on blob and fuzzy. There is no blood or gore.
- Tests: obstsize 174/0, break119 197/0, single, quiet, evosize and obstacle 0 fails, soak 0 bad.
- Shots and sheets are in screens-1.17/obst119b-menace/jpg/. The sheets were also copied over the ones in obst119b/jpg/.

## 1.19 polish restyle (Oct 30, 2026)
- I redrew `drawMonsterArt` in patch117/obst119b.js. The menace version is backed up as obst119b.pre-polish.js. Hitboxes, the confetti poof, the per-world hue and pairing rules, and all other code are unchanged.
- MON_COL now holds four tones per kind: base, shadow, outline and highlight. The colours are rich and harmonious.
- Each body has a radial gradient, a rim light on the lower right, a glossy specular highlight and a thin 1.6 px tinted outline instead of black.
- Faces have sleek angled almond eyes with a soft glow, catch-lights and tapered brows. Mouths are a confident smirk or snarl with small neat fangs.
- Horns and antennae are larger and cleaner. Spikes are clean, rocky is a faceted octagon, and the squid has tapered tentacles.
- I removed the scratch marks, cracks, sunken sockets and claws.
- Tests: obstsize 174/0, break119 197/0, single 0, quiet 0, soak 0 bad.
- Sheets are in screens-1.17/obst119b-polish/jpg/.
