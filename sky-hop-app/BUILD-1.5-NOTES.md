# Sky Hop 1.5 (versionCode 6) build notes — 2026-09-25

Build steps (same as 1.4):
    cd /workspace/sky-hop-app && node scripts/sync-web.js
    cp www/* android/app/src/main/assets/public/     # keeps cordova.js / cordova_plugins.js
    cd android && JAVA_HOME=/home/box/jdk/jdk-21.0.12.1+1 ANDROID_HOME=/home/box/Android/Sdk ./gradlew bundleRelease
    cp app/build/outputs/bundle/release/app-release.aab /workspace/sky-hop-publishing/store-assets/skyhop-release-v1.5-code6.aab

- New file: economy.js (loaded between ads.js and game.js). It must be in www/ and assets/public/.
- build.gradle: versionCode 6 / versionName "1.5". ads.js APP_VERSION "1.5", APP_BUILD 6 (diagnostic label v1.5).
- Signed with android/keystore.properties (upload cert SHA256 1F:00:E6:8C:...:71:DB, same as 1.3/1.4). jarsigner verified.
- (first 1.5 build, superseded) AAB sha256: 02796badc1947c290e96ca8572e3e3e04805d0fdabe4571c3874fa3febbf98ce
- Pre-1.5 web backup: /workspace/backups/pre-1.5/flappy-clone/
- Tests: /workspace/sky-hop-1.5-test/ (economy.test.js, smoke.js, smoke2.js, shot-unlock.js). Serve flappy-clone on :8765 first.
- New rewarded placements: double coins -> showRewarded("unlock"); checkpoint continue -> showRewarded("continue"); skill ad unlock -> "unlock". Existing 8s timeouts are unchanged.
- Save key skyhop_v15 (migrates the legacy keys; skyhop_best / skyhop_best_level / skyhop_trophies are never written or wiped).

## 1.5 feedback round (2026-09-25 ~19:50 ET), still versionCode 6 (not uploaded yet)
- Performance: fixed 60 Hz sim + render extrapolation (smooth on 90/120 Hz screens), cached sky/hills/ground/pipe/coin/
  skill-button/HUD-text sprites, pooled particles & coins, cached gradients, opaque canvas, adaptive quality
  (key skyhop_quality_v15b; ?quality=0|1|2 overrides; default medium = 1× 400×600 backing store).
  Diagnostic panel now shows a "Perf:" line (fps / quality / canvas / auto-drops / dpr).
- Fixed pre-existing scenery glitches: hills jumped ~100px on wrap, ground pebbles jumped 96px every ~20 frames, clouds popped in.
- Pace: physics/scroll constants identical to pre-1.5; slow-mo can't stick (tested after expiry, resume, checkpoint, toasts).
  Pre-1.5 advanced one step per display refresh, so on 120 Hz phones 1.4 ran up to 2× faster than on 60 Hz ones.
  ?pace=1.15 (0.8–1.5) is a web-only playtest knob.
- Coins ~45-50% fewer (planCoins: 40% breather, 1-2 coin lines, 3-coin arcs, lone risky coin 13%).
  Mission rewards -15%, all-3 bonus 40, coin mission targets 15/25/40, magnet 8/15/25, big coin 1/2/3.
- In-run celebrations are compact 1.5s toasts at the top edge; full cards show on game over / menu.
- Cache-busting bumped to ?v=151.
- AAB sha256: eeb6665eda8ec7bdc58638f29f7d9bc1538a1c5fe284a8264413ed5201ac2c04

## Round 3 (2026-09-25 ET): owner feedback from Galaxy Fold (Chrome, 120 Hz)

### Coins
- `planCoins`: at most ONE coin per gap, centered (dx = pipe.w/2, y = gapY), 27% of gaps; risky 5-coin in 2.5% (~1 in 40). No arcs, trails or lead-in coins. The old arc coins spawned at `pipe.x - spacing`, i.e. on screen, and that was the pop-in.
- Coins are attached to their pipe (`c.pipe`, `c.dx`), spawn at W+10+29 (off-screen right) and scroll in with it. A magnet-pulled coin detaches.
- No "+N risky!" floater and no gold pickup burst (the HUD pill pops and a chime plays). Near-miss, flap, dash, glide and evolve bursts recolored white/cyan/violet. The daily-reward burst no longer fires during play. The level bonus is still banked silently at game over.
- Economy halved: skills 75–375, upgrades from 30, Lucky Coins 15/120/350, birds 150–550, skins 125–300, trails 75–250. Mission rewards 5–30, all-missions bonus 15, coin mission targets 5/8/12, magnet 3/5/8. The "bigcoin" mission is retired (no longer generated).
- Sim (economy.test.js): 29.5% gaps with a coin, risky 1 in 40; casual 3.45 runs to first upgrade (2.41 with missions); new 5.9; decent 2.3.

### Hitches
- Saves deferred during PLAY (`lsSet`/`flushSaves` at game over, pause, visibilitychange, pagehide).
- Audio: follow-up notes scheduled on the audio clock (27 `setTimeout` beeps removed); shared SFX bus; oscillator wavetables pre-warmed; max 7 notes per frame.
- Persistent text slots (HUD, toast, flash texts); per-digit score sprites; `measureText` on a dedicated context with LRU eviction; next-pipe HUD strings pre-measured on spare frames; sprite cache no longer wiped mid-run; per-frame allocations removed; shelf rebuilt lazily.
- A quality-drop canvas resize is deferred to game over; resize is debounced and skipped when unchanged; the canvas rect is cached for input.
- rAF dt snapping to 60/90/120/144 Hz, fixed 60 Hz sim, max 5 steps, accumulator clamp.
- Hitch logger: `window.SkyHopHitch`, shown in the diagnostic panel (frames >34 ms with time, JS ms, state and tags), with a "Reset hitches" button.
- Cache-busting `?v=152`. AAB sha256 d3121c7d4fbf6ea47ca11a042499b79f3234772b665eb13191fc3157931facfe (versionCode 6, 1.5).
