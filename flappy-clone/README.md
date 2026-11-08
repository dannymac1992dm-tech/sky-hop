# Sky Hop

A polished, addictive browser mini-game inspired by classic flap-and-dodge side-scrollers. Original art, name, and sound — no third-party assets or trademarks.

## How to play

1. **Open the game**
   - Double-click `index.html`, or
   - From this folder run a static server, e.g.:
     ```bash
     cd /workspace/flappy-clone
     python3 -m http.server 8080
     ```
     then visit `http://localhost:8080`
   - Single-file build: open `sky-hop.html` (or `/sky-hop.html` via the tunnel)

2. **Controls**
   - **Click / tap** or press **Space** to flap
   - Pass through pipe gaps to score
   - Avoid pipes, edges, and (with Extras on) hazards
   - **🔊** mute/unmute SFX + music (saved in `localStorage`)
   - **✨ Extras** toggle world variety / hazards on or off (saved in `localStorage`)
   - **🏆 Trophies** button on start / game over opens the collection shelf

3. **Goal**
   - Climb **levels 1–10,000** and beat your **best score** + **best level**
   - Unlock progress every time you reach a new peak level (persisted lightly)
   - Chase clean-streak multipliers and near-miss sparkles for juice

## Extras (world variety)

Toggle with the **✨** button (next to mute). Preference key: `skyhop_extras` (`1`/`0`; default on).

| Extras | What you get |
|--------|----------------|
| **Off** | Classic pipes-only challenge + light background trees/scenery |
| **On** | Full variety that densifies with level (soft-capped) |

When **on**, content ramps by level (using the same soft-cap curve as pipes):

- **Early (~1–15):** scenic trees, animated waterfalls
- **Mid (~8–35):** cute animals (butterflies, bunnies, squirrels, dragonflies); some become mild moving hazards later; waterfalls may gently push you down
- **Later (35+):** witch-hunter silhouettes that throw slow nets/bolts — readable, never spawned inside a pipe gap. They evolve (v1.18): **Apprentice** (from level 35, HP 2), **Broom Rider** (61, purple, broom, HP 2, faster, wider net), **Sorcerer** (101, teal, tall starry hat, HP 3) and **Archwitch** (141, crimson and gold, HP 4, fastest, widest net); an "X ahead!" floater announces each new tier once per run. Never on boss levels, the level before one, or below level 35.
- **Trees:** later levels can add solid tree-trunk obstacles

Spawn rates and entity counts are **hard-capped** (trees ≤14, animals ≤8, hunters ≤3, projectiles ≤8, waterfalls ≤4) so high levels stay mobile-friendly.

Extras off mid-run clears hunters, projectiles, and hazard trees immediately.

## Trophies (scalable)

Reaching a new peak level unlocks it. Persistence is tiny — not 10k assets or a huge array:

```json
localStorage.skyhop_trophies = { "h": 1247 }
```

- **`h`** = highest level ever reached (unlocks 1…h conceptually)
- Legacy array format is migrated automatically on load

**Trophy Shelf** shows a finite list only:

- Named **landmarks**: 1, 10, 50, 100, 250, 500, 1000, 2500, 5000, 10000
- **Milestones**: every 10 (≤100), every 50 (≤1000), every 100 (above)
- Your current **highest** peak row
- A few locked lookahead landmarks


## One Phoenix: evolution and the skill tree (v1.17)

There is **one bird, a crimson-and-gold fire Phoenix** (the in-game id is still `sparrow`), and no skins. Its fiery glow grows with every stage. It **evolves through 40 stages as you reach higher levels** (stage is permanent, based on your best level). Stages 21-40 are the toy machine line: clockwork gears, helicopter rotors, an ace pilot with a striped toy popper and heavy treads (cartoon machinery only, drawn on the same Phoenix, visual only, the hit circle never changes). Each stage changes the bird's shape (wings, tail, crest, size) and gives a **free upgrade**; coin upgrades come on top.

| Stage | Name | Level | Free upgrade |
|------:|------|------:|--------------|
| 1 | Hatchling | 1 | - |
| 2 | Fledgling | 3 | Coin Reach |
| 3 | Sky Hopper | 5 | Glide |
| 4 | Breeze Glider | 8 | Dash skill |
| 5 | Gale Wing | 11 | Second Chance |
| 6 | Cloud Dancer | 15 | Rich Pickups |
| 7 | Storm Rider | 19 | Shield skill |
| 8 | Thunder Wing | 24 | Pellet Power |
| 9 | Aurora Flap | 29 | Coin Reach |
| 10 | Dawn Streamer | 35 | Pop Power |
| 11 | Nova Beak | 41 | Long Dash |
| 12 | Star Flyer | 48 | Shrink skill |
| 13 | Eclipse Crow | 55 | Long Shield |
| 14 | Moon Weaver | 63 | Pathfinder |
| 15 | Comet Tail | 72 | Second Chance |
| 16 | Celestial | 82 | Mighty Bird |
| 17 | Sun Crown | 93 | Talon Smash |
| 18 | Skyfire | 105 | Coin Shower |
| 19 | Mythic Phoenix | 120 | Glide |
| 20 | Sky Legend | 140 | Pellet Power |
| 21 | Rivet Rider | 155 | Toy Popper |
| 22 | Gear Glider | 172 | Rotor Lift |
| 23 | Cog Crest | 190 | Crumble Touch |
| 24 | Wind-Up Wing | 210 | Rapid Rockets |
| 25 | Brass Blaze | 232 | Bonk Bounty |
| 26 | Propeller Pup | 256 | Toy Popper |
| 27 | Rotor Hopper | 282 | Rotor Lift |
| 28 | Twin Rotor | 310 | More Poofs |
| 29 | Chopper Phoenix | 340 | Pop Power |
| 30 | Skycopter | 372 | Crumble Touch |
| 31 | Cadet Ace | 408 | Toy Popper |
| 32 | Wingman | 448 | Rapid Rockets |
| 33 | Squadron Lead | 492 | Bigger Poof |
| 34 | Jet Phoenix | 540 | Bonk Bounty |
| 35 | Star Ace | 592 | Rotor Lift |
| 36 | Dozer Bird | 650 | Crumble Touch |
| 37 | Tread Titan | 714 | Toy Popper |
| 38 | Mech Phoenix | 784 | Rapid Rockets |
| 39 | Fortress Wing | 860 | Quick Poof |
| 40 | Grand Titan | 1000 | Bonk Bounty |

Skills & Evolution screen: **Skills** (18 coin-bought branches: Dash, Shield, Shrink, Quick Recharge, Glide, Second Chance, Coin Boost, Coin Reach, Rocket Boost, Power & Talons, Pellet Burst, Rocket Pop, Poof Toy, plus the toy-machine branches Toy Popper (pellets crack pipes faster / poof hunters sooner), Rotor Lift (slower falls), Rapid Rockets (faster Rocket Pop), Bonk Bounty (+1..3 coins per poof) and Crumble Touch (pipes and hunters give up sooner)), and **Evolution** (progress bar and all 40 stages). The coin Magnet is no longer a skill (v1.18): it is built into the bird (see "Built-in coin magnet"); old saves get the coins spent on Magnet back once (`magnetRefund`). There is no Trails tab any more (v1.18): the bird always flies with one fixed fiery red-and-gold trail that matches the Phoenix; old saves ignore their saved trail and get the coins spent on trails back once (`trailRefund`). The Phoenix's tail lights up one feather per owned branch, brighter with each level. Source: `economy.js` (`TREE`, `EVO_LEVELS`, `EVO_REWARDS`); drawing: `styleC_core` (`SC_FORM`, `setTailPower`). Older saves migrate on load (six-bird perks become tree levels, retired birds and coin-only skins are refunded once).

### Pellet Burst, Rocket Pop, Zap Wand and Poof Toy (v1.17; v1.19: one helper at a time, each with its own look)

Four friendly pickups (v1.19 adds the Zap Wand); never on boss levels or the level before one. **One at a time (v1.19):** picking up a different helper replaces the running one (its pellets, rockets, toys and leftover effects are cleared); picking up the same kind again adds to it (up to 2x). Pellets, rockets and zaps **defeat hunters cartoon-style**: a couple of hits give a "Bonk!" with stars, then the hunter vanishes in a puff of colourful smoke and confetti (no blood, no body, no fireball) and the player earns +3 coins (Toy Popper / Crumble Touch / Bonk Bounty skills change the numbers; coin faucet capped at 60 (+20 per Bonk Bounty level) per run). The Poof Toy only dazes hunters. All four pop nets and bolts with a harmless puff and **crack pipes**: hunter HP 2 at tier 0 (pellet 1, rocket 2, zap 2; higher tiers 2-4 HP); pipe half HP 5 (pellet 1, poof 2, zap 2, rocket 3); the first half to reach 5 crumbles in a cartoon puff (+2 coins), the other half stays, collisions treat the crumbled half as absent. Pipe breaking only from level 3, never on boss levels or boss pipe styles. Talon Smash poofs a hunter away with the same effect.

- **Steady pickups (v1.18, one at a time since v1.19):** a pity timer places one helper about every 6-8 s of play (360-420 frames nominal, floor 300; Pellet Burst from level 2, Rocket Pop from level 3, Zap Wand from level 4, Poof Toy from level 5), rotating among them (least recently placed first, so each is about a quarter of the pickups), never while a ride is active, never on pipes or hazards, never on boss levels or the level before. Measured in the autopilot test: average 6.8 s between pickups outside boss windows, longest 8.3 s. A new pickup of a different kind **replaces** the running helper (no more Pellet + Rocket + Poof at once); the same kind adds to it, capped at 2x. Skills that raise the pickup rate shorten the interval (20 frames per level, floor 4 s). The first Pellet / Rocket / Poof guarantees from 1.17 still apply.
- **Per-helper looks (v1.19):** **Pellet Burst** = small 1.17-size rainbow pellets (core radius 6.8, outline 8.2, glow 12; 1.18 had 8.4 / 9 / 16) with a short sparks-and-stars trail, no fire, no lightning; **Rocket Pop** = fire only (orange flame trail, flame puffs and an orange-red starburst on impact); **Zap Wand** (new, level 4+, 12 zaps, one about every 0.6 s, 12 s hold; internal id `zap`) = lightning only (bright blue-and-yellow zig-zag arcs from the bird to the nearest hunter, with a chain to a second hunter within 150 px, else a hunter net/bolt, else a pipe half; one demo arc if nothing is around; electric starbursts); **Poof Toy** = pastel confetti, soft puffs and mint/pink rings only (no lightning, no flames). Effect pools are capped lower than 1.18 (8 bolts, 70 flames, 36 sparks, 5 starbursts, 40 chips) and only one helper runs, so the screen stays calm. No gore, no bodies; defeat is still the confetti poof.
- **Evolving obstacles (v1.18):** every world's obstacle (tube, cactus, ice pillar, tower, asteroid, trunk, coral, lava rock, cane) shows 3 crack stages as it is hit, with its own crack colour, glow and chip shape, then crumbles in the cartoon puff with chips of its own material. From the third world on, a crumbled half regrows a small stump that rises a little more; the stump is solid (collision box equals what is drawn) and only appears when the pipe is at least 110 px ahead of the bird, and the original gap is never reduced. Boss obstacles are unchanged.
- **Witch-hunter shapes (v1.18):** 6 silhouettes (classic, tall, round, hunched, big hat, tiny) with hats and brooms that vary per tier; hit box is never smaller than 17x21 px and HP stays 2-4 per tier.
- **Ghost (v1.18, HUD v1.19):** no longer once per run. 2 charges per run (+1 at Quick Recharge levels 2 and 4, max 4), each lasting 5 pipes; 8 s gap between uses (counted after a ghost ends); one charge comes back every 45 s of play (a little faster with Quick Recharge; never while a ghost is running). **v1.19 HUD: no number, no pips, no seconds digit.** The button has a thin ring that glows when a ghost is ready and fills clockwise while the next charge reloads (dimmed with a filling ring at zero charges); toasts say "Ghost is ready again" instead of counting.
- **Built-in coin magnet (v1.18, visible since v1.19):** every bird pulls nearby coins from the very first flight at no cost, always on. Range grows with the evolution stage from 48 px (stage 1) to 161 px (stage 40) and the pull gets stronger (about 3.5 to 8 px/frame, faster the closer the coin). Big risky coins are never pulled, so the risk/reward stays; no extra coins appear (earn-only, same coin faucet). **v1.19:** the pull range is drawn as a soft pulsing pink ring (glow band + dashed ring + three orbiting dots) around the bird at the true radius, brightening while coins fly in; a short "Magnet · pulls coins in" label shows on the very first run only (save flag `skyhop_v119_magnet_label`); every evolution card and the evolution moment show "Magnet reach N px". The Magnet pickup still gives a short super pull.
- **Pause (v1.18):** a round pause button on the right edge of the HUD (below the evolve pill, away from the hop area), also the `P` key. The pause screen has **Resume** and **Quit to menu** (a second tap confirms; quitting ends the run exactly like a game over, coins and score are banked once, nothing is skipped). Everything freezes while paused: pipes, bird, power-up and helper timers, pickup spacing, animations and effects. Resume gives a 3-2-1 countdown (150 frames) before the bird moves; there is no invulnerability on resume. Auto-pause when the app goes to the background, the screen turns off, on Android Back (Back again resumes) and when the web tab loses focus; coming back never resumes by itself. No ads on the pause screen or during pause; works with rewarded continue and the ride modes. Tests: `patch117/pause_tests.js`.
- **Pellet Burst** (from level 2, guaranteed by about pipe 12) - 30 seconds (1800 frames, 10x 1.16) of colourful pellets that home in on hunters, then pipes (skill Pellet Power: up to +1350 frames).
- **Rocket Pop** (from level 3, guaranteed by about pipe 20) - 30 homing toy rockets (up to +22 with Pop Power), one about every 0.4 s, waiting up to a minute for a target (hunter, then pipe).
- **Zap Wand** (from level 4; internal id `zap`; v1.19) - 12 instant lightning zaps (dmg 2 to a hunter, 1 more to a second hunter within 150 px; a net/bolt is popped; a pipe half takes 2), one about every 36 frames, held up to 12 s; picking it up replaces any other helper. No skills yet.
- **Poof Toy** (from level 5, guaranteed by about pipe 20; internal id `poof`) - a smiling toy the bird lobs. It lands with a soft pastel confetti poof (puffs, sparkles and mint/pink rings; no lightning, no fire, no blood, no bodies) that dazes hunters and pops nets and bolts in a small radius (46 px, up to +60% with skills). 2 toys per pickup (up to 5), one tossed about every 0.9 s (up to 45% faster). If nothing is on screen, one toy still pops so the pickup is never invisible. Skills branch **Poof Toy** (9 steps: More Poofs, Bigger Poof, Quick Poof), coins only.

## Levels & difficulty

```
Level = min(10000, 1 + floor(score / PIPES_PER_LEVEL))
PIPES_PER_LEVEL = 5
```

- Score `0–4` → Level 1
- Level **10,000** from score **49,995**+ (plus optional streak bonus points)
- HUD shows e.g. `Level 1,247 / 10,000`

### Soft-cap difficulty curve

Most speed / gap tightness ramps in early–mid levels, then **asymptotes** so ~500–10,000 are endurance / score challenges — not impossible gaps:

```
t(L) = 1 - exp(-k * (L - 1))    with k = 0.006

pipeSpeed = BASE_SPEED + (MAX_SPEED - BASE_SPEED) * t
pipeGap   = BASE_GAP   + (MIN_GAP   - BASE_GAP)   * t
spawnEvery / gapMargin lerp the same way
```

Approximate `t` / feel:

| Level | t ≈ | Notes |
|------:|----:|-------|
| 1 | 0.00 | Baseline |
| 100 | 0.45 | Comfortable mid ramp |
| 200 | 0.70 | Getting spicy |
| 400 | 0.91 | Near soft-cap |
| 500 | 0.95 | Endurance zone begins |
| 1000+ | →1.00 | Speed/gap essentially capped (`MAX_SPEED` 4.15, `MIN_GAP` 102) |

Clamps stay fair: gap never below 102px; extras cadence floors out (e.g. hunters ≥ ~120 frames).

### Addictive juice

- Milestone celebrations every **10 / 100 / 1000** levels
- **Clean streak** multiplier (up to ×2.5) for consecutive pipes without a near-miss; streak bonuses can add +1/+2 score
- **Near-miss** sparkle + “Close call!” when you skim the gap edge
- Game over shows **best score** + **best level**; soft **NEW RECORD** fanfare
- One-tap / Space restart (free)

## Files

| File           | Role |
|----------------|------|
| `index.html`   | Page shell |
| `style.css`    | Layout, mute + extras HUD |
| `game.js`      | Game logic, extras, trophies, audio |
| `ads.js`       | AdMob hooks (Capacitor native; no-op in browser) |
| `sky-hop.html` | Single-file build (inline CSS + JS; ads no-op OK) |
| `README.md`    | This file |

`localStorage` keys: `skyhop_best`, `skyhop_best_level`, `skyhop_mute`, `skyhop_extras`, `skyhop_trophies`.

Audio: Web Audio chiptune (`MUSIC_VOL` ≈ 0.12). Mute covers music + SFX.

Capacitor: keep editing **`/workspace/flappy-clone/`** as the source of truth, then sync into the app project as usual. Do not invent live AdMob IDs — `ads.js` stays a browser no-op / native hook shell.

Refresh the single-file build after editing CSS/JS:

```bash
python3 -c "
from pathlib import Path
root = Path('.')
css, js = (root/'style.css').read_text(), (root/'game.js').read_text()
ads = (root/'ads.js').read_text() if (root/'ads.js').exists() else '/* no ads.js */'
html = '''<!DOCTYPE html>
<html lang=\"en\">
<head>
  <meta charset=\"UTF-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover\" />
  <meta name=\"apple-mobile-web-app-capable\" content=\"yes\" />
  <meta name=\"theme-color\" content=\"#6ec6ff\" />
  <title>Sky Hop</title>
  <style>
''' + css + '''
  </style>
</head>
<body>
  <div id=\"game-wrap\">
    <canvas id=\"game\" width=\"400\" height=\"600\" aria-label=\"Sky Hop game canvas\"></canvas>
    <div id=\"hud-btns\">
      <button id=\"extras-btn\" type=\"button\" aria-label=\"Toggle extras\" title=\"Extras on/off\" aria-pressed=\"false\">✨</button>
      <button id=\"mute-btn\" type=\"button\" aria-label=\"Toggle sound\" title=\"Mute / unmute\">🔊</button>
    </div>
    <span id=\"mute-hint\" hidden>Muted</span>
    <span id=\"extras-hint\" hidden>Extras off</span>
  </div>
  <script>
''' + ads + '''
  </script>
  <script>
''' + js + '''
  </script>
</body>
</html>
'''
(root/'sky-hop.html').write_text(html)
print('wrote sky-hop.html', len(html))
"
```

No build step or dependencies required.

## Saving points (checkpoints), v1.18
Checkpoints are saved every 20 levels (`CHECKPOINT_EVERY = 20` in `economy.js`; it was 10 up to 1.17). The "⚑ Checkpoint saved · Level N" flash, the HUD "⚑ L{n}" pill and the watch-ad "continue from checkpoint" point all follow that one constant. Boss levels stay every 10th level (a checkpoint level that is also a boss level shows the boss banner). Level 10, 30, 50 ... are boss levels without a checkpoint.
