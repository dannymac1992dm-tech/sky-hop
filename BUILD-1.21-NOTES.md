# Sky Hop 1.21 revised test build (versionCode 31) — not uploaded

versionName stays 1.21. versionCode 31. Nothing here is uploaded.

## Climb pose
The climb bird is drawn from behind with a tapered back, a swept crest, layered wing feathers, and three ember tail streamers. It replaces the capsule pose from code 30. The side view is unchanged. `BIRD_FLIP` is unchanged.

# Sky Hop 1.21 revised test build (versionCode 30) — not uploaded

versionName stays 1.21. versionCode 30. Nothing here is uploaded.

## Upward pose
A climb draws the phoenix from behind: crest and beak at the top, both wings out to the sides, tail centered below. The wings are short layered feathers, on the side view as well. A bank crossfades from the side view into that pose. A tap while climbing beats the wings instead of tipping the body. `BIRD_FLIP` (default on) plays one short backward loop at the start of each bank. The hit circle is unchanged.

# Sky Hop 1.21 revised test build (versionCode 29) — not uploaded

versionName stays 1.21. versionCode 29. Nothing here is uploaded.

## Bird heading
The phoenix is drawn on the line of flight. East, the beak points right. Through a bank it turns with the camera. On a climb the beak points up and the tail points down. A flap still tips the nose relative to that heading. The hit circle stays on the center. Shots leave from the beak along the heading.

# Sky Hop 1.21 revised test build (versionCode 28) — not uploaded

versionName stays 1.21. versionCode 28. Nothing here is uploaded.

## Mixed headings
The same 20-gate cycle now also turns the camera. Gates 0–7 cruise east. Gates 8–10 bank north. Gates 11–16 climb toward that realm's landmark. Gates 17–19 level back to east. Tap still pushes against the same drift; the camera turns that drift onto the screen. Shots travel forward in course space, so they leave toward the right while cruising and toward the landmark while climbing. A continue starts level, facing east. Turn gates are wider.

# Sky Hop 1.21 revised test build (versionCode 27) — not uploaded

versionName stays 1.21. versionCode 27 replaces the code 26 packages. Nothing here is uploaded.

## Scenery
The opening view is Ember Reach: a dark copper sky, a low disc, haze ribbons, broken sky-bridges and a basalt parapet. The old light-blue sky, piled white clouds, rounded green hills, grass strip and striped dirt floor are not drawn. Each later realm has its own floor silhouette (stepped stone, ice teeth, girder deck, hull plates, timber, coral polyps, obsidian drips, glass fins). The score numerals are gold. A new run places the bird back at x 90 so it cannot stay off the side.

# Sky Hop 1.21 revised test build (versionCode 26) — not uploaded

Same user-facing version 1.21. versionCode moved from 25 to 26 because 25 was already built. Nothing here is a Play submission.

## This revision
- A new run starts on the Hatchling. The form is earned again as that run's level rises. Save & Continue restores the form for the saved level. Permanent stage rewards, coins, and the skill tree are not cleared. Older checkpoint saves without a stored form use the saved level.
- Pellet Burst, Rocket Pop, Zap Wand, and Poof Toy are stored when picked up. A separate Use control (on-screen button, or F) spends them only while held down, so one finger can still flap. Unused time and counts do not tick down. The next burst is not offered until the stored one and its leftover shots are gone. Magnet, shield, and ride pickups are unchanged and do not clear a stored burst.
- Obstacles follow a 20-gate cycle: easy stretch, a short named section (Drift, Rise and fall, Turning, Weave, Three across, Steady), another easy stretch, then a second section and a bonus gate. The first named section is obstacle 6, during level 1. Clean bonus gates pay a few earned coins. Sections stay inside the existing gap rules. No tall columns were added.
- After the bird form is finished (level 1000, about obstacle 4995), five free mastery unlocks change play: Calm Entry at level 800 (about obstacle 3995), Reserve at 1500 (7495), Second Glance at 3000 (14995), Keen Eye at 5000 (24995), Anchor at 8000 (39995). Level 10000 is about obstacle 49995. Obstacle counts here are `(level - 1) * 5` gates.

## Content note for Legal
Witch hunters are still the same humanoid silhouettes. This revision does not redesign them. Burst effects are still cartoon pellets, flames, lightning, and confetti, with no blood. Clearance to ship is unchanged.

# Sky Hop 1.21 (versionCode 25) — earlier test build, not uploaded

Local test release only. No Play upload, no site deploy, no store-listing change.

## Baseline
Built on the supplied 1.20 source (versionCode 24, versionName was `1.20-candidate`), imported beside the existing site files. Gameplay source is `flappy-clone/`. The Capacitor wrapper is the sibling `sky-hop-app/`. `scripts/sync-web.js` resolves that sibling (`../../flappy-clone` from `scripts/`), which is `/workspace/flappy-clone` in this checkout. Older README lines that hard-code that absolute path match this layout; the script does not depend on them.

## What changed
- versionName `1.21`, versionCode `25`. In-app label matches. AdMob app id and unit ids are unchanged (`pub-9357129551510699`).
- Starter bird is the red-and-gold phoenix: swept-back crest, layered feathers, glossy eye. Hit circle stays 16px at every evolution stage. Stage 40 still adds the toy-machine parts on that same small bird. Skins still recolor it.
- Ceiling-to-floor columns are gone, including the old reskinned pairs. Each gate is a handful of compact, separate obstacles. Every one can be cracked and crumbled by the existing helpers (pellet, rocket, zap, toy). They do not grow back into columns.
- Nine existing regions still change every 20 levels. Inside them, 22 drawn families and 10 patterns (solo, stagger, gateway, triangle, bob, drift, orbit, wave, ring, gauntlet) are chosen from the level. Later laps mix in the next region's shapes. This is procedural. None of the 10,000 levels is hand-authored.
- Saves, coins, upgrades, evolution, pause, checkpoint every 10 levels, Save & Continue, helper spacing (one at a time, next only after the current one ends), collectible Magnet (off until picked up), Ghost with no count, hunters, and the level-10 boss cadence are unchanged.

## Coverage that was actually measured
`node flappy-clone/tests/obstacles.test.js` (0 failures):
- 1,224 focused gates across early, mid, late, and end levels, including 1, 100, 1,000, 5,000, and 10,000, plus a sweep of all 10,000 levels × 2 gates (20,000 gates, about 54 ms).
- Every gate had at least one obstacle, a clear corridor at least as tall as the existing gap (never under 100px), and no piece taller than 68px.
- 22 families and 10 patterns showed up. Each region's own family appeared on at least a quarter of that region's sampled gates.
- A 1.20-shaped save (4,321 coins, evolution stage 12, tree and upgrade levels, a skin) reloaded with those values intact.

Browser play (`?debug=1`, Chrome) 0 gameplay failures:
- Live levels 1, 100, 1,000, 5,000, 10,000 spawned compact clusters, not columns. Bird radius stayed 16 through all 40 stages. Drawn size stayed within about 8% of the starter.
- Corridor center did not collide; obstacle centers did. A hit cracked; further hits crumbled.
- Magnet radius was 0 until a Magnet was collected, then 130, then 0 again.
- Helper auto-spawn was measured on the live clock, not by forcing a second collect. A Rocket Pop offer was collected through the normal pickup path. While it was running (3600 frames, until the pop was fully gone) the spawn log recorded 0 helper offers. The next helper (Pellet Burst) was offered 296 frames after that pop ended. That is the 2.5–3.5 s post-end timer (150–210 frames) plus the wait until the next gate, which is what carries the offer. The earlier “second helper replaced the first” check was a forced `grantPU` call. That path still clears a different helper if one is granted directly. Auto-spawn does not offer that replacement while a helper is active. The spawn function now also refuses a helper kind while `weaponNow()` is non-empty, so the first-offer guarantee cannot bypass the clock.
- Autopilot on a live level kept playing and scored. 240 simulation frames took 3.9 ms in that headless loop (simulation only; the screenshot frames are separate full draws).

Screenshots in the review artifacts are frames from that running canvas, bird at normal play size.

## Build
- Debug APK: `skyhop-1.21-code25-debug.apk` (signed with the local Android debug certificate only, not a Play key). SHA-256 `46643d4219b2a9cdc32569c67d08a2487b0907ab186c1c377a08da3e1eb57e97`.
- Release bundle: `skyhop-1.21-code25-release-unsigned.aab`. SHA-256 `147fb98d7e89540478261d44d7aed6e94798ef8ac8f7e39a357a02beeca151a1`. No upload key was present, and none was created. `jarsigner` reports the bundle unsigned, so it can be signed later.
- `aapt` on the APK: `com.skyhop.mobile` versionCode 25 versionName 1.21. Packaged `game.js`, `obstacles.js`, `ads.js`, and `economy.js` match `flappy-clone/`.

## Limits
- Patterns and silhouettes are generated. Do not describe this as 10,000 unique hand-made levels.
- Art is drawn in code. It follows the approved rock, crystal, gear, and debris ideas and adds more region shapes; it is not the painted concept board itself.
- Boss levels (every 10) are a denser pattern in the current region, not a separate hand-built encounter.
- Solid ground trunks no longer collide, because they were tall columns. Background trees still scroll.
- Hunters, black holes, the floor, and the ceiling are still there.
- A fresh clone needs `npm ci` and `npx cap sync android` before Gradle. The generated plugin project and `www/` stay out of git, as before. Signing secrets were not added.
