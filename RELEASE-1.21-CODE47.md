# Sky Hop 1.21 code 47 — animals, monsters, and dragons

versionName **1.21**. versionCode and APP_BUILD **47**. Nothing was uploaded. Store release notes are unchanged. Hunters stay in the game, as one enemy among many.

`flight.test.js` and `obstacles.test.js` had 0 failures.

Every foe is drawn upright for forward flight: the head, beak, or maw points down the screen toward the bird, and wings open left and right. A defeat is smoke, feathers, embers, or rubble. There is no blood. Screen edges do not kill the bird. Dragon fire and sentinel beams travel down the lane after a glow wind-up, and they vanish at the side edges instead of clipping the bird there.

## How a dragon fight works

A drake or a big dragon flies in from ahead, stops a short way up the screen, and strafes. The mouth glows, then it breathes one or two fireballs down the lane. The aim is gentle, so the bird can slide aside. The existing weapons damage it. It recoils up the screen when hit. A drake has 3 hits. The big dragon has 7, a red health bar, and drops 3 coins. On the last hit it bursts into embers and retreats. One big dragon appears on each world's 5th level from level 15 (15, 20, 25, 30, 35, 40, 45). While it is alive, other spawns wait. Level 10 sends one drake instead.

## Roster

Each line is how it looks, how it moves, how it attacks, and how it is not a witch.

- Bat — ragged dark wings, red eyes, fangs. Fast zigzag down the screen. Body contact. A small flier, not a hat and broom.
- Ember imp — the bat shape with horns and ember eyes, only in Ember Reach and Lava Land. Same fast zigzag. A fire-world flier.
- Raven — black, hooked yellow beak, red eyes. Swoops diagonally toward the bird's lane. One bird, not a standing figure.
- Spike vulture — raven with bone spikes on the wings and a harder swoop. From level 11 in the mix, featured in Blossom Valley.
- Wasp swarm — black and gold, smoky wings, red eyes, stingers down. Slow drift and a light chase. One fire hit scatters the whole swarm. A cluster, not one witch.
- Storm eagle — large dark wings, white head, red eyes. Hovers and drifts. 4 hits, then feathers and 3 coins. A wide sky hunter, not a broom rider.
- Drake — small dark dragon, horns, glowing eyes, smoky breath. Hovers, strafes, telegraphed fireball. 3 hits. A quadruped silhouette with wings.
- Big dragon — the drake at a larger scale, 7 hits, two fireballs, health bar. World's 5th level from level 15. The mini-boss.
- Gargoyle — gray stone, horns, stub wings. Glides, then dives. 2 hits, then rubble. A statue, not cloth and a hat.
- Shadow wraith — a smoke column with pale eyes that fades in and out. Only solid when it is dark enough to see. 2 hits. No limbs.
- Frost wraith — the wraith in ice colors, featured in Snowy Peaks.
- Sky eel — a long segmented body, glowing eyes, a crackle along the spine. Slithers as it comes down. 3 hits. A line, not a person.
- Eye sentinel — a dark orb with a slit pupil. Hovers, glows, then a thin beam travels straight down. 2 hits. A circle, not a body.

## Density

Worlds still change every 5 levels. Spawns share one clock. Witches are about one spawn in ten, and only from level 6, never on a boss level, and at most one on screen before level 31.

| Levels | Pace | Who shows up |
| --- | --- | --- |
| 1–5 Ember Reach | about every 5 seconds, small groups | bats, ravens |
| 6–10 Sunset Desert | same light pace | bats, ravens, an occasional witch; one drake on level 10 |
| 11–15 Snowy Peaks | about every 3 seconds | frost wraiths, wasps, ravens, bats, drakes, a rare witch; big dragon on level 15 |
| 16–20 Night City | same | shadow wraiths, wasps, drakes, ravens, bats |
| 21–25 Outer Space | same, storm eagle can appear | eye sentinels, wasps, drakes; big dragon on level 25 |
| 26–30 Blossom Valley | same | spike vultures, wasps, drakes; big dragon on level 30 |
| 31–35 Coral Reef | about every 2 seconds, more kinds at once | sky eels, vultures, eyes, gargoyles, wraiths, wasps, eagles, drakes; big dragon on level 35 |
| 36–40 Lava Land | same dense mix | ember imps plus the late pool; big dragon on level 40 |
| 41–45 Glass Aurora | same | gargoyles plus the late pool; big dragon on level 45 |

Then the nine worlds repeat. The world's own creature is the one that world adds to the pool.

The unsigned AAB is package `com.skyhop.mobile`, versionCode 47, versionName 1.21. The live AdMob app ID is unchanged. The app manifest still declares only INTERNET. `jarsigner` reports the jar is unsigned. There is no mapping file.

- AAB SHA-256 `d25eaace5d91643e1e1a1fbd5d1984d49c2366f571fdb1321c9c3930385a2823`
- web zip SHA-256 `7737bfdb6bad5199686c58f8532e68209d00c6e1a0846ae73f2191752d628db6`
