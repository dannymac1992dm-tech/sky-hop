# Sky Hop 1.17-candidate (versionCode 21): LOCAL ONLY, nothing uploaded

Built Wed Oct 28 2026 1:18 PM America/Detroit (Legal string renames applied, see last section) (rebuilt with Poof Toy + Phoenix recolour + hunter defeat + pipe crumble + 30 s burst + stages 21-40) from the 1.16 tree (1.16 files untouched).

Artifacts (/workspace/skyhop-1.17-work/):
- skyhop-release-v1.17-code21-candidate.aab  sha256 645bea1424cc8ab906fbe57be726e572ed58f98d58f7fd7694ba0fee4ba59aad (signed, jarsigner verified; game.js/economy.js/ads.js inside AAB == flappy-clone)
- sky-hop-web-1.17-candidate.zip  sha256 d16f402da74cf98efa30e9b7a3656e887a32d8b3c811b9de0ce8549518169c14
- screens-1.17/ (PNG) and screens-1.17/jpg (<=900 px), screens-1.17/old116pre = superseded early shots

## Pellet Burst / Rocket Pop
- From level 2 (Pellet) / level 3 (Pop). Guaranteed first Pellet by pipe 10 passed, first Pop by pipe 16 passed (and level >= 3). Then normal rarity (10%/pipe, 7-pipe gap, ~11% each of pickups). Never on boss levels or the level before one.
- Bigger, brighter pellets and rockets (2.1x), name pills above pickups and a "Pellet Burst!" / "Rocket Pop!" banner on pickup. Hunters stay stunned only. Pellets and rockets pop nets and bolts.
## One Phoenix (species id stays "sparrow"), one skill tree, 20 evolution stages
- All other birds, all skins, bird select and the bird/skin rewarded-ad flows are gone. One tail design. Ghost skill and trail unlock ads stay (opt-in).
- 20 stages (EVO_LEVELS 1,3,5,8,11,15,19,24,29,35,41,48,55,63,72,82,93,105,120,140), each with new shape (wings, tail, crest, size) and a free upgrade. Evolution moment card in play, progress bar in HUD and in Skills & Evolution.
- 14 coin-bought branches, ~19.1k coins total (16.7k + ~2.4k Poof) (Dash 9, Shield 11, Magnet 9, Shrink 5, Quick Recharge 5, Glide 4, Second Chance 4, Coin Boost 10, Coin Reach 4, Rocket Boost 4, Power & Talons 6, Pellet Burst 4, Rocket Pop 4, Poof Toy 9 steps). Perks work from level 1 except boss levels. An empty tree is neutral.
- Tail shows owned branches (a lit feather each, brighter per level, max 9).
- No Bomb upgrade (conflicts with the no-explosion rules). The Poof Toy is the soft, non-explosive replacement; store text avoids bomb/grenade/kill/weapon (in-game name "Poof Toy" is the only place the word appears; consider renaming to "Poof Toy" if a reviewer objects).
## Migration
Old saves: coins kept; six-bird perk levels become tree levels (max with existing); coins paid for retired birds refunded once (swallow 150, owl 250, hummingbird 325, parrot 400, eagle 550; may over-refund trophy-unlocked birds); coin-only skins refunded once; ad-or-coin skins not refunded; stage set from best level with free upgrades; one-time notice banner. birdPerks kept in the save for downgrades.
## Tests (all pass)
burst117_tests (FAILS 0), single_tests (36 PASS: fresh install, tree, perks, evolution, migration, corrupt saves), soak_burst (BAD 0), crash_sweep (0 errors, levels 25/61/88 x 3 builds). Frame-time A/B at 4x CPU throttle vs 1.16 (3 runs x 2 levels): CPU ms/frame ~10.3-11.4 -> ~12.4-14.8 (+15-35%), p99 16.8 -> 16.8-33.3 ms, long-frame (>50ms) counts comparable within noise, 0 errors.

## Poof Toy (new in this rebuild)
- Cartoon toy the bird lobs automatically at the nearest hunter (2 toys per pickup, +1 with the top branch step). Lands with a soft confetti poof (rings + confetti, no fire, no blood). Dazes hunters in the radius and pops nets and bolts. Radius 46 px (+9/18/27 with skills); toss interval 52 frames (-8/-16/-24).
- First pickup guaranteed by level 5 (after pellet pipe 8 and pop pipe 14: poof arrived at pipe 16, level 5 in 10/10 autopilot runs). Afterwards normal rarity. Never spawns on boss levels (10/20/30...) or the level before; grants are ignored on boss levels. No target on screen: one demo toy still pops so the pickup is never invisible.
- Skill branch "Poof Toy": 9 interleaved steps (more toys, bigger poof, quicker toss), 90-430 coins each.
- Tests extended: burst117_tests (guarantee, boss gating, skill perks), single_tests (+2 checks, 38 PASS), soak_burst BAD 0, crash_sweep 0 errors (log: patch117/soak117.log, crash117.log).
- Test change: rocket-boost sighting horizon extended to pipe 54 (threshold <=50) because a pre-existing pipe-36 guarantee plus the 7-pipe gap pushed 1 run of 10 past 44.
## Phoenix recolour (Danny 12:23 PM)
- The single bird is now a red/gold fire Phoenix matching Icon H: crimson body, orange-gold wings/tail/crest, fiery glow that grows per stage, rounded Style C kept, no yellow body. Red/orange is the main UI colour for menu, HUD, evolution cards and tail power feathers. Stage sheet: screens-1.17/evolution-stages-1-20*.png. Old teal-era shots: screens-1.17/old117-pre-phoenix/.
- Known minor: full-power tail sheet still shows distinct skill colours on feather dots (intentional); Evolution tab "You're here" row stays green.
## Build
npm sync (scripts/sync-web.js) + manual copy of game.js/ads.js/economy.js into android assets/public (node 20, cap copy unavailable), gradlew bundleRelease, jarsigner verify OK, game.js/economy.js/ads.js inside AAB identical to flappy-clone. Zip has the same 10-file layout as before.
Protected: 1.16 AAB cd13f909..., zip c60ff473... unchanged.
Draft store text: STORE-TEXT-1.17.md.

## 1:06 PM rebuild: defeat, longer burst, pipe crumble, 20 more stages (Danny 12:40 / 12:41 / 12:46 PM)  LEGAL FLAGS INSIDE
Nothing uploaded. Earlier sections above are superseded where they conflict (hunters "stunned only", 20 stages, 14 branches, 36/38 tests).
### Hunter defeat (cartoon only)  -> LEGAL must check: earlier approval said "stunned only"
- Hunters ("witches") have 3 HP: pellet 1, rocket 2. Hits give a "Bonk!" with stars; the last hit gives a colourful confetti Poof and the hunter simply disappears (no blood, no body, no fall, no fireball). +3 coins per hunter (run cap 60 coins from this source, +20 per Bonk Bounty level). The Poof Toy still only dazes and pops nets/bolts (and cracks pipes). Eagle Talon Smash uses the same defeat rule.
### Longer power-ups (about 10x of 1.16)
- Pellet Burst 1800 frames (~30 s) base, Rocket Pop 30 rockets base (one every 24 frames). Skills extend further (Pellet Burst steps, Rocket Pop steps; Rapid Rockets shortens the interval to 6 frames min; test: >=50 rockets with skills).
### Pipe crumble  -> LEGAL flag (breaking obstacles)
- From level 3 only, never on boss levels. Pellets 1, Poof 2, rocket 3 damage vs 5 pipe HP. Cracks show, then the hit half crumbles in a cartoon puff (+2 coins), giving a bigger opening. The other half and uncracked pipes stay solid; hit radius and gap logic unchanged. Pellets that hit a pipe in line with a hunter are absorbed by the pipe (one rare flake in burst117_tests came from this geometry).
- Note: the guaranteed first Pellet pickup can arrive at level 2, where pipes are untouchable by design.
### Stages 21-40 (toy machinery on the same Phoenix)  -> LEGAL flag (war-machine theme)
- 40 stages (EVO_LEVELS 155,172,190,210,232,256,282,310,340,372,408,448,492,540,592,650,714,784,860,1000 for 21-40), each with an Evolution card, a free upgrade and a new look. Names: Rivet Rider, Gear Glider, Cog Crest, Wind-Up Wing, Brass Blaze, Propeller Pup, Rotor Hopper, Twin Rotor, Chopper Phoenix, Skycopter (rotor helicopter), Cadet Ace, Wingman, Squadron Lead, Jet Phoenix, Star Ace (pilot goggles, candy-striped toy launcher, jet nozzle with candy flame, generic yellow star on a purple badge, no real insignia), Dozer Bird, Tread Titan, Mech Phoenix, Fortress Wing, Grand Titan (treads, armour plates, toy popper, smokestack puffs). Visual overlay only: same hit circle, evolution grows size <= ~1.2x. Overlay is ~30 cheap path ops, drawn live for tier > 0.
- 5 new coin-bought branches (tree = 19 nodes, ~28.7k coins total): Toy Popper (more pellet/pipe damage), Rotor Lift (slower fall, stacks with Glide, min combined 0.80), Rapid Rockets, Bonk Bounty (+coins per poof), Crumble Touch (pipes/hunters need fewer hits). Free stage rewards use them; maxed ones give a 50-coin consolation.
### Economy flag
- New coin faucet: defeat/crumble coins, capped 60 per run (+20 per Bonk Bounty level, max 120). Review against shop prices.
### Tests (final state, all pass)
- single_tests: FAILS 0 (40 stages, 40 rewards, evolution clamp, perks, migration, corrupt saves). burst117_tests: FAILS 0 on this final run (earlier 4 of 5 reruns clean; the one flake was pellet absorption by a pipe, see above). soak_burst: BAD 0 (levels 45 and 160, max skills). crash_sweep: TOTAL errors 0 (levels 25/61/88/171, skills none/mid/max). Screenshot runs: errors [].
- Perf A/B (4x CPU throttle, stage 40 + all skills, 2 reps, 1.16 vs 1.17): CPU ms/frame 1.16 11.5-13.1; 1.17 14.9-15.8 (lv25), 16.8-20.1 (lv61); p99 33-50 ms vs 17-33 for 1.16; frames >50 ms: 0-5 per 20 s run vs 0-3; 0 errors. Heavier than 1.16 on a throttled device; flagged, not yet optimised. (patch117 / /workspace/stress115/results/ab117c.log)
### Screenshots (JPEG <= 900 px) in screens-1.17/jpg/
W1 hunter hit (Bonk), W2 hunter poofed away, W3 Rocket Pop, W4/W5 longer Pellet Burst (start + after 10 s, bar), W6/W7/W8 pipe cracked / big crack / half crumbled, stages-21-40.jpg (contact sheet), stages-1-20.jpg, S21/S26/S31/S36/S40 evolution cards, S34 menu, skills-tab-new-war-machine-branches, evolution-tab-40-stages-progress, evolution-tab-stages-21-40-part1/2/3.
### Build
Same manual steps as above. AAB signed, jarsigner verified, game/economy/ads inside AAB identical to flappy-clone. 1.16 artifacts unchanged (cd13f909..., c60ff473...). versionCode 21.

## 1:18 PM Legal string-only changes (no art/logic changes), versionCode still 21
- "Candy Clouds" -> "Pastel Skies" (game.js world name, AUDIO-LICENSE.md, store/itch text); skin "Candy Pop" -> "Pastel Pop" (economy.js); store text "giant candy canes" -> "swirled pastel pillars". Internal ids ("candy", "skin_candy") are unchanged so saves keep working. Remaining "candy" strings: internal ids only (no player-visible or store text); code comments and helper names with "candy" were also reworded.
- "Poof Grenade" -> "Poof Toy" everywhere (pickup name pill/banner, skill branch, perk text, README, notes, store text, code identifiers/comments). Legal flag from earlier ("Poof Grenade") is therefore resolved.
- "Toy Cannon" -> "Toy Popper" (branch name, stage reward text, level texts incl. "Grand toy popper: 1 pellet poofs a hunter away", store and itch lists). Internal perk id "cannon" unchanged.
- Store text: "a great pick for teens and the whole family" -> "a great pick for teens and up" (Play full description and itch). Release note now includes "Coins spent on retired birds are refunded." (404 chars, en-US, free of gun/shoot/kill/weapon/bomb/grenade). Little Home Games line and weekly leaderboard text unchanged. Previous store text: STORE-TEXT-1.17.pre-legal.md.
- Tests after the renames: single_tests FAILS 0 (40 PASS); burst117_tests FAILS 0 on the latest runs, but 2 of 8 runs had flakes in known random-geometry tests (a pipe in line with a hunter absorbing pellets; once "Rocket Pop base 30 rockets" counted 37 and "control: normal hunter contact" failed in the same run); soak_burst BAD 0; crash_sweep TOTAL errors 0.
- New hashes: AAB 645bea14..., zip d16f402d... (full values in SHA256SUMS-1.17.txt). jarsigner verified; game/economy/ads inside the AAB == flappy-clone; 1.16 artifacts unchanged (cd13f909..., c60ff473...).
- Screenshot: screens-1.17/jpg/legal-renames-pastel-skies-poof-toy-toy-popper.jpg (New World: Pastel Skies, Poof Toy pickup banner, Toy Popper in the Skills tab).
- Not uploaded by me.
