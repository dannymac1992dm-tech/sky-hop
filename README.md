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
- **Later (35+):** bird-hunter silhouettes that shoot slow nets/bolts — readable, never spawned inside a pipe gap
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


## Bird evolution (every 5 levels)

During a run the bird **evolves every 5 levels** (`tier = floor(level / 10)`). Shop `equippedBird` stays the **base skin family / palette**; evolution tints + form accents layer on top for the run (cosmetics only — flap/gravity unchanged aside from a tiny wing-animation flourish).

| Tier | Levels | Kind |
|-----:|--------|------|
| 0 | 1–9 | Hatchling |
| 1 | 5–9 | Fledgling |
| 2 | 20–29 | Sky Hopper |
| 3 | 30–39 | Gale Wing |
| 4 | 40–49 | Storm Rider |
| 5 | 50–59 | Aurora Flap |
| 6 | 60–69 | Nova Beak |
| 7 | 70–79 | Eclipse Crow |
| 8 | 80–89 | Celestial |
| 9 | 90–99 | Mythic Phoenix |

Tiers **10+** cycle the same 10 looks with prestige prefixes (★ / ◆ / ✦ / ✧) and rim/glow shifts — no explosion of unique arts at 10k levels. On-screen: short **“Bird evolved! …”** flash + form name chip.

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
