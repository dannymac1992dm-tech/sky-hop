# Audio source and license for Sky Hop clips
- Background music: an original chiptune loop (128 BPM, C-G-Am-F) generated in code on 2026-10-12 by /workspace/sky-hop-publishing/tools/gen.py. It contains no samples or third-party recordings.
- Sound effects: the flap and crash tones recreated from Sky Hop's own game code (/workspace/flappy-clone/game.js).
- Rights: original work made for Sky Hop / Little Home Games, so no third-party license is needed. Facebook's copyright check passed on 2026-10-12.

## In-game world music (Sky Hop 1.10, added 2026-10-17)
Each world in the game has its own short music loop. All of them are original compositions written for Sky Hop as note lists in the game code (`SONGS` in game.js) and played live by the phone's Web Audio synthesizer (square / triangle / sine / sawtooth tones). No samples, recordings, loops or third-party music are used, so no outside license is needed. Rights: original work made for Sky Hop / Little Home Games.
- Day Sky (levels 1–24): the existing Sky Hop chiptune loop (132 BPM, C–Am–F–G), unchanged since 1.0. Source: game.js `LEAD` / `BASS` / `ARP`.
- Sunset Desert (25–49): "Dune Drift", original, 116 BPM, D Hijaz-flavoured melody. Source: game.js `SONGS[1]`.
- Snowy Peaks (50–74): "Frost Bells", original, 104 BPM, E major bell melody. Source: game.js `SONGS[2]`.
- Night City (75–99): "Neon Nights", original, 120 BPM, A minor synth-pop. Source: game.js `SONGS[3]`.
- Outer Space (100–124): "Star Drift", original, 96 BPM, C Lydian. Source: game.js `SONGS[4]`.
- Blossom Valley (125–149): "Petal Breeze", original, 124 BPM, G major pentatonic. Source: game.js `SONGS[5]`.
- Boss levels (every 10th level): the current world's loop played 12% faster with a lower bass and an added pulse, generated in code. No new material.
- Level 150 and up: the same six loops repeat with the worlds.
- New sound effect: the boss alarm (`sfxBoss`), a synthesized sweep and two beeps.

## v1.11
No new audio files. The three new worlds (Coral Reef, Lava Land, Pastel Skies) reuse the existing original,
in-code synthesized loops (Snow, Dune Drift and Blossom songs). New power-up / black-hole sound effects are
short synthesized beeps and sweeps generated in code (no samples).
