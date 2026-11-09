(() => {
  "use strict";

  const canvas = document.getElementById("game");
  // `ctx` is swapped temporarily while baking offscreen sprites (see sprite()).
  let ctx = canvas.getContext("2d", { alpha: false });
  const mainCtx = ctx;
  const gradCache = new Map(); // gradients reused across frames (main canvas only)
  function cachedGrad(key, make) {
    if (ctx !== mainCtx) return make();
    let g = gradCache.get(key);
    if (!g) {
      if (gradCache.size > 64) gradCache.clear();
      g = make();
      gradCache.set(key, g);
    }
    return g;
  }
  const muteBtn = document.getElementById("mute-btn");
  const extrasBtn = document.getElementById("extras-btn");
  const muteHint = document.getElementById("mute-hint");
  const extrasHint = document.getElementById("extras-hint");

  const W = canvas.width;
  const H = canvas.height;
  const GROUND_H = 72;
  const PLAY_H = H - GROUND_H;

  const STORAGE_KEY = "skyhop_best";
  const BEST_LEVEL_KEY = "skyhop_best_level";
  const MUTE_KEY = "skyhop_mute";
  const EXTRAS_KEY = "skyhop_extras";
  const TROPHY_KEY = "skyhop_trophies";
  const UNLOCKS_KEY = "skyhop_unlocks";
  const UNLOCK_PROGRESS_KEY = "skyhop_unlock_progress";
  const DAILY_KEY = "skyhop_daily";
  const CONTINUE_TOKENS_KEY = "skyhop_continue_tokens";
  const SAFE_START_DAY_KEY = "skyhop_safe_start_day";
  const SHARE_URL = "https://dannymac1992dm-tech.github.io/sky-hop/";
  // v1.9: share text + "Get it on Google Play" buttons point at the Play listing.
  const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.skyhop.mobile";
  // v1.9: Play Games Services leaderboard "Weekly High Score" (opened on its weekly tab).
  const LEADERBOARD_ID = "CgkIktmb8oQKEAIQAA";
  // v1.9: ad-free itch.io web build (set by itch-config.js in that package only). No ads, no ad stand-ins.
  const ITCH_BUILD = typeof window !== "undefined" && window.SKYHOP_BUILD === "itch";
  // v1.7: in-app privacy policy link (opens the live page in the system browser).
  const PRIVACY_URL = "https://dannymac1992dm-tech.github.io/sky-hop/privacy.html";

  // —— State ——
  const State = { START: 0, PLAY: 1, OVER: 2, TROPHIES: 3, SHOP: 4, BIRDS: 5, MISSIONS: 6 };
  let state = State.START;

  // —— Deferred saving: no synchronous localStorage writes during a run ——
  // Writes made while playing are queued and flushed at game over (a few frames after the crash),
  // when leaving gameplay, and on visibilitychange/pagehide. Reads see queued values first.
  const lsPending = new Map();
  let saveDirty = false;
  function savesDeferred() { return state === State.PLAY; }
  function lsSet(k, v) {
    v = String(v);
    if (savesDeferred()) { lsPending.set(k, v); return; }
    try { localStorage.setItem(k, v); } catch (_) {}
  }
  function lsGet(k) {
    if (lsPending.has(k)) return lsPending.get(k);
    try { return localStorage.getItem(k); } catch (_) { return null; }
  }
  function flushSaves(reason) {
    if (perf.pendingScale && state !== State.PLAY) { perf.pendingScale = false; applyRenderScale(); }
    if (saveDirty) {
      try { lsPending.set(E.SAVE_KEY, E.serializeSave(save)); } catch (_) {}
      saveDirty = false;
    }
    if (!lsPending.size) return;
    const t0 = performance.now();
    lsPending.forEach(function (v, k) { try { localStorage.setItem(k, v); } catch (_) {} });
    lsPending.clear();
    hitchNote("save", performance.now() - t0);
  }
  let prevMenuState = State.START;
  let score = 0;
  let best = parseInt(lsGet(STORAGE_KEY) || "0", 10) || 0;
  let bestLevel = parseInt(lsGet(BEST_LEVEL_KEY) || "0", 10) || 0;
  let muted = lsGet(MUTE_KEY) === "1";
  // Extras default ON for first-time players
  let extrasOn = lsGet(EXTRAS_KEY) !== "0";
  let frame = 0;
  let flash = 0;
  let scorePop = 0;
  let overTimer = 0;
  let level = 1;
  let levelFlash = 0;
  let levelFlashText = "";
  let milestoneFlash = 0;
  let milestoneFlashText = "";
  let evolveFlash = 0;
  let evolveFlashText = "";
  let trophyFlash = 0;
  let trophyFlashText = "";
  let trophyScroll = 0;
  let trophyDragY = null;
  let trophyDragScroll = 0;
  let newRecordFlash = 0;
  let newRecordText = "";
  let beatBestScore = false;
  let beatBestLevel = false;
  // Streak / near-miss juice
  let cleanStreak = 0;
  let pipeStreak = 0;
  let scoreMult = 1;
  let multPop = 0;
  let nearMissFlash = 0;
  const particles = [];
  // Rewarded continue: one per run; free Retry always available via flap/space
  let continueUsedThisRun = false;
  let invulnFrames = 0;
  let continueBusy = false;
  let continueSnapshot = null; // mid-run snapshot taken before rewarded continue ad
  let ignoreInputFrames = 0; // post-continue: ignore taps so ad click-through doesn't flap/retry
  // Retention / juice
  let screenShake = 0;
  let flapPop = 0;
  let almostLine = "";
  let deathStreakHarsh = 0;
  let runStartFrame = 0;
  let safeStartFrames = 0; // remaining soft-start assist pipes/frames
  let safeStartActive = false;
  let offerSafeStart = false;
  let featuredUnlockId = null;
  let continueTokens = parseInt(lsGet(CONTINUE_TOKENS_KEY) || "0", 10) || 0;
  let shareBusy = false;
  // v1.9 Play Games leaderboard state
  let lbPendingScore = 0;   // best score this session that Play Games didn't accept yet (player signed out)
  const lbSubmitLog = [];   // scores sent to submitScore (QA/debug only)
  let lbBusy = false;
  let lbBusyAt = 0;
  let playLinkEl = null;    // itch build: real <a> over the canvas "Get it on Google Play" button

  // —— v1.5: economy / skills / birds / missions ——
  const E = window.SkyHopEconomy;
  const STEP_MS_BASE = 1000 / 60;
  const DASH_FRAMES = 21;       // ~0.35s burst
  const DASH_WORLD_MUL = 3.1;   // world scroll multiplier during Dash
  const SHRINK_SCALE = 0.6;
  const COIN_R = 8;
  const BIG_COIN_R = 11;
  const MAX_COINS = 40;
  const SKILL_ORDER = ["dash", "shield", "shrink", "ghost"];
  const coins = [];             // {x, y, value, risky, spin, pulled}
  const floaters = [];          // floating "+5" texts
  const rings = [];             // expanding ring effects (shield break, dash)
  const banners = [];           // full celebration cards on the menu
  const toasts = [];            // compact in-run toasts (top edge, ~1.5s)
  const celebrations = [];      // this run's unlock cards, shown in full on game over
  const overCards = [];         // full cards queued on the game-over screen
  let overButtonsBottom = 0;    // v1.9: bottom edge of the game-over button rows (unlock cards go below)
  const skillState = {};        // id -> { cd, cdMax, active, activeMax, readyPulse }
  let ws = 1;                   // world speed scale this frame (dash × ride modes)
  let birdScale = 1;
  let graceBudget = 0;          // frames of pipe-overlap forgiveness after dash/shield
  let runCoins = 0;             // coins earned this run (incl. bonus), for display/double
  let runCoinFrac = 0;
  let coinPop = 0;
  let runBonusCoins = 0;
  let bonusLevelBase = 1;
  let doubleCoinsUsed = false;
  let rewardBusy = false;       // double-coins / checkpoint ad in flight
  let runCheckpoint = 0;        // highest checkpoint level reached this run
  let checkpointUsedThisRun = false;
  let pipesPassed = 0;
  let runMaxStreak = 0;
  let almostLines = [];
  let lastFlapTapAt = 0;
  let shopTab = 0;              // 0 upgrades, 1 skills, 2 style
  let shopRowCount = 0;
  let birdsReturnState = State.START;
  let missionsReturnState = State.START;
  let debugMode = false;
  const finePointer = (function () {
    try { return window.matchMedia && window.matchMedia("(pointer: fine)").matches; } catch (_) { return false; }
  })();

  // —— v1.5 perf: render scale, adaptive quality, sprite caches ——
  // quality 0 = high (sharper: up to 1.5× game resolution; opt-in via ?quality=0),
  // 1 = medium (default: 1× game resolution = 400×600 backing store, CSS-scaled, full effects),
  // 2 = low (1×, half the particles/trails, no redundant redraws on 90/120 Hz screens).
  // Steps down automatically when gameplay fps drops (remembered on the device).
  // Profiling note: 1.5× cost more than the whole 1.4-era frame in a 4–6× CPU-throttled test,
  // so the default stays at 1× (the pre-1.5 resolution) — smoothness first.
  const QUALITY_KEY = "skyhop_quality_v15b";
  const QUALITY_CAPS = [1.5, 1, 1];
  let quality = 1;
  try {
    const qs = /[?&]quality=(\d)/.exec(String(location.search));
    const stored = parseInt(lsGet(QUALITY_KEY) || "", 10);
    if (qs) quality = Math.max(0, Math.min(2, parseInt(qs[1], 10)));
    else if (stored >= 0 && stored <= 2) quality = stored;
  } catch (_) {}
  // Optional pace knob for playtesting only (?pace=1.15 → 15% faster simulation). Default 1.
  let PACE = 1;
  try {
    const pm = /[?&]pace=([0-9.]+)/.exec(String(location.search));
    if (pm) PACE = Math.max(0.8, Math.min(1.5, parseFloat(pm[1]) || 1));
  } catch (_) {}
  let renderScale = 1;
  let lastCssScale = 1;
  function maxParticles() { return quality >= 2 ? 24 : 48; }
  function applyRenderScale(cssScale) {
    if (cssScale) lastCssScale = cssScale;
    const dpr = window.devicePixelRatio || 1;
    let rs = Math.min(QUALITY_CAPS[quality], lastCssScale * dpr);
    rs = Math.max(1, Math.round(rs * 4) / 4);
    if (rs === renderScale && canvas.width === Math.round(W * rs)) return;
    renderScale = rs;
    canvas.width = Math.round(W * rs);
    canvas.height = Math.round(H * rs);
    spriteCache.clear();
    spriteGen++;
    shieldGrad = null;
  }
  const perf = { sum: 0, cnt: 0, best: 1e9, slowWindows: 0, cooldown: 0, fps: 60, drops: 0 };
  /** Rolling fps check: judged every 60 frames or 1s (whichever first) during gameplay. */
  function perfSample(dt) {
    if (perf.cooldown > 0) perf.cooldown--;
    if (dt <= 0 || dt > 250 || document.hidden) return;
    perf.sum += dt;
    perf.cnt++;
    if (perf.cnt < 60 && perf.sum < 1000) return;
    const avg = perf.sum / perf.cnt;
    const enough = perf.cnt >= 6;
    perf.sum = 0;
    perf.cnt = 0;
    if (!enough) return;
    perf.fps = 1000 / avg;
    perf.best = Math.min(perf.best, avg);
    // Only judge real gameplay; menus can idle.
    const slow = state === State.PLAY && avg > Math.max(19.5, perf.best * 1.3);
    perf.slowWindows = slow ? perf.slowWindows + 1 : 0;
    if (perf.slowWindows >= 2 && perf.cooldown <= 0 && quality < 2) {
      quality++;
      perf.drops++;
      perf.slowWindows = 0;
      perf.cooldown = 120;
      try { lsSet(QUALITY_KEY, String(quality)); } catch (_) {}
      hitchNote("quality→" + ["high", "medium", "low"][quality]);
      // Particle cap / effects drop immediately; a canvas resize (high→medium) re-allocates the
      // backbuffer and re-bakes every sprite, so it waits for the next game over / pause.
      if (state === State.PLAY) perf.pendingScale = true;
      else applyRenderScale();
    }
  }
  // —— Hitch logger (shown in the hidden diagnostic panel) ——
  // Records frames whose gap exceeds 34ms (2+ missed 60Hz frames) with a timestamp, the JS time of the
  // preceding frame, and what happened in it (save / sound / toast / spawn / sprite / unlock / quality / resize).
  const hitch = { frames: 0, count: 0, list: [], tags: [], prevTags: "", prevWork: 0, lastHidden: Date.now() + 500, since: Date.now(), worst: 0, byTag: {} };
  function hitchNote(tag, ms) {
    if (hitch.tags.length < 12) hitch.tags.push(ms != null && ms >= 1 ? tag + " " + ms.toFixed(1) + "ms" : tag);
  }
  function hitchFrame(gap, work) {
    hitch.frames++;
    if (gap > 34 && gap < 1000 && Date.now() - hitch.lastHidden > 1500) {
      hitch.count++;
      hitch.worst = Math.max(hitch.worst, gap);
      const d = new Date();
      const two = (n) => (n < 10 ? "0" : "") + n;
      const what = hitch.prevTags || "-";
      hitch.list.push(two(d.getHours()) + ":" + two(d.getMinutes()) + ":" + two(d.getSeconds()) + "  " + Math.round(gap) + "ms  js " + hitch.prevWork.toFixed(1) + "ms  [" + ["menu", "play", "over", "trophies", "shop", "birds", "missions"][state] + "] " + what);
      if (hitch.list.length > 40) hitch.list.shift();
      const tags = what.split(", ");
      for (let i = 0; i < tags.length; i++) { const k = tags[i].split(" ")[0]; hitch.byTag[k] = (hitch.byTag[k] || 0) + 1; }
    }
    hitch.prevTags = hitch.tags.join(", ");
    hitch.prevWork = work;
    hitch.tags.length = 0;
  }
  document.addEventListener("visibilitychange", function () { hitch.lastHidden = Date.now(); });
  window.SkyHopHitch = {
    summary: function () {
      return { frames: hitch.frames, hitches34: hitch.count, worstMs: Math.round(hitch.worst), minutes: +((Date.now() - hitch.since) / 60000).toFixed(1), byTag: hitch.byTag };
    },
    list: function () { return hitch.list.slice(); },
    reset: function () { hitch.frames = 0; hitch.count = 0; hitch.list.length = 0; hitch.worst = 0; hitch.byTag = {}; hitch.since = Date.now(); },
  };

  window.SkyHopPerf = {
    slots: function () { return JSON.parse(JSON.stringify(slotStats)); },
    info: function () { return { fps: Math.round(perf.fps), quality: ["high", "medium", "low"][quality], renderScale: renderScale, canvas: canvas.width + "x" + canvas.height, autoDrops: perf.drops, pace: PACE }; },
  };

  // Offscreen sprite cache. drawFn draws with the normal helpers: ctx is swapped to the
  // sprite's context while baking. Sprites are rendered at renderScale for crispness.
  const spriteCache = new Map();
  let spriteGen = 0; // bumps when caches are invalidated (render scale change)
  function sprite(key, w, h, drawFn) {
    let sp = spriteCache.get(key);
    if (sp) return sp;
    // Static sprites only (bounded set) — dynamic HUD text uses fixed "slots" (see slot()).
    if (spriteCache.size > 600) spriteCache.clear();
    const tBake = performance.now();
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil(w * renderScale));
    c.height = Math.max(1, Math.ceil(h * renderScale));
    const x = c.getContext("2d");
    x.scale(renderScale, renderScale);
    const prev = ctx;
    ctx = x;
    try { drawFn(); } finally { ctx = prev; }
    sp = { c: c, w: w, h: h };
    spriteCache.set(key, sp);
    if (state === State.PLAY) hitchNote("sprite", performance.now() - tBake);
    return sp;
  }

  // Slots: one persistent canvas per changing HUD element (score, coins, toast…). Redrawn in place
  // only when its text changes — no canvas allocation or cache churn during a run.
  const slots = {};
  const slotStats = {};
  function slot(name, key, w, h, drawFn) {
    let sl = slots[name];
    if (!sl) {
      const c = document.createElement("canvas");
      sl = slots[name] = { c: c, x: c.getContext("2d"), key: null, w: 0, h: 0, rs: 0, pw: 0, ph: 0 };
    }
    if (sl.key === key && sl.rs === renderScale) return sl;
    const t0 = performance.now();
    const pw = Math.ceil(w * renderScale);
    const ph = Math.ceil(h * renderScale);
    if (sl.c.width < pw || sl.c.height < ph) {
      // grow generously once (re-allocation is the expensive part)
      sl.c.width = Math.max(sl.c.width, Math.ceil(pw * 1.5), 64);
      sl.c.height = Math.max(sl.c.height, ph, 16);
    }
    const x = sl.x;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, Math.max(sl.pw, pw) + 2, Math.max(sl.ph, ph) + 2);
    x.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    const prev = ctx;
    ctx = x;
    try { drawFn(); } finally { ctx = prev; }
    sl.key = key; sl.w = w; sl.h = h; sl.rs = renderScale; sl.pw = pw; sl.ph = ph;
    const dt = performance.now() - t0;
    const st = slotStats[name] || (slotStats[name] = { bakes: 0, ms: 0, max: 0 });
    st.bakes++; st.ms += dt; if (dt > st.max) st.max = dt;
    if (state === State.PLAY) hitchNote("text", dt);
    return sl;
  }
  function drawSlot(sl, dx, dy, dw, dh) {
    ctx.drawImage(sl.c, 0, 0, sl.pw, sl.ph, dx, dy, dw == null ? sl.w : dw, dh == null ? sl.h : dh);
  }
  /** Outlined, centered text in a slot. */
  function textSlot(name, text, fontPx, bold, fill, stroke, lw) {
    const key = text + "|" + fill;
    const sl = slots[name];
    if (sl && sl.key === key && sl.rs === renderScale) return sl;
    const font = (bold ? "bold " : "") + fontPx + "px " + FONT_FALLBACK;
    const tw = measureCached(text, font);
    const pad = (lw || 0) + 2;
    const w = Math.ceil(tw + pad * 2);
    const h = Math.ceil(fontPx * 1.35 + pad * 2);
    return slot(name, key, w, h, function () {
      ctx.font = font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (stroke && lw) {
        ctx.lineWidth = lw;
        ctx.lineJoin = "round";
        ctx.strokeStyle = stroke;
        ctx.strokeText(text, w / 2, h / 2);
      }
      ctx.fillStyle = fill;
      ctx.fillText(text, w / 2, h / 2);
    });
  }
  /** Centered outlined text from a cached slot, drawn with alpha (flash messages). */
  function flashText(name, text, px, fill, stroke, lw, x, y, alpha) {
    const sl = textSlot(name, text, px, true, fill, stroke, lw);
    ctx.globalAlpha = alpha;
    drawSlot(sl, x - sl.w / 2, y - sl.h / 2);
    ctx.globalAlpha = 1;
  }
  // Big score from per-digit sprites (baked once at startup): a score change costs only a few
  // drawImage calls — no text rasterization mid-run. Strokes first, then fills, so the dark
  // outline of one digit never overlaps the white of its neighbour.
  const SCORE_FONT_PX = 48, SCORE_LW = 6, SCORE_PAD = SCORE_LW + 2;
  const scoreDigitW = {};
  function scoreDigit(ch, part) {
    const name = "sd" + part + ch;
    const font = "bold " + SCORE_FONT_PX + "px " + FONT_FALLBACK;
    const tw = scoreDigitW[ch] || (scoreDigitW[ch] = measureCached(ch, font));
    const w = Math.ceil(tw + SCORE_PAD * 2), h = Math.ceil(SCORE_FONT_PX * 1.35 + SCORE_PAD * 2);
    return slot(name, ch, w, h, function () {
      ctx.font = font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (part === "s") {
        ctx.lineWidth = SCORE_LW;
        ctx.lineJoin = "round";
        ctx.strokeStyle = "rgba(0,0,0,0.25)";
        ctx.strokeText(ch, w / 2, h / 2);
      } else {
        ctx.fillStyle = "#fff";
        ctx.fillText(ch, w / 2, h / 2);
      }
    });
  }
  function drawScoreDigits(str, cx, cy, scale) {
    let total = 0;
    for (let i = 0; i < str.length; i++) { scoreDigit(str[i], "f"); total += scoreDigitW[str[i]]; }
    for (let pass = 0; pass < 2; pass++) {
      let x = cx - (total * scale) / 2;
      for (let i = 0; i < str.length; i++) {
        const sl = scoreDigit(str[i], pass ? "f" : "s");
        drawSlot(sl, x - SCORE_PAD * scale, cy - (sl.h * scale) / 2, sl.w * scale, sl.h * scale);
        x += scoreDigitW[str[i]] * scale;
      }
    }
  }
  function blit(sp, x, y) { ctx.drawImage(sp.c, x, y, sp.w, sp.h); }
  const FONT_FALLBACK = "'Segoe UI', system-ui, sans-serif";
  /** Cached outlined text (centered at the returned anchor). */
  function textSprite(text, fontPx, bold, fill, stroke, lw) {
    const key = "t|" + text + "|" + fontPx + "|" + bold + "|" + fill + "|" + stroke + "|" + lw;
    let sp = spriteCache.get(key);
    if (sp) return sp;
    const font = (bold ? "bold " : "") + fontPx + "px " + FONT_FALLBACK;
    ctx.save();
    ctx.font = font;
    const tw = ctx.measureText(text).width;
    ctx.restore();
    const pad = (lw || 0) + 2;
    const w = Math.ceil(tw + pad * 2);
    const h = Math.ceil(fontPx * 1.35 + pad * 2);
    return sprite(key, w, h, function () {
      ctx.font = font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (stroke && lw) {
        ctx.lineWidth = lw;
        ctx.lineJoin = "round";
        ctx.strokeStyle = stroke;
        ctx.strokeText(text, w / 2, h / 2);
      }
      ctx.fillStyle = fill;
      ctx.fillText(text, w / 2, h / 2);
    });
  }
  // Text widths are measured on a tiny dedicated context (never the main canvas), cached, and
  // evicted oldest-first instead of wiping the whole cache mid-run.
  const measureMap = new Map();
  const measureCtx = document.createElement("canvas").getContext("2d");
  let measureFont = "";
  function measureCached(text, font) {
    const k = font + "|" + text;
    let w = measureMap.get(k);
    if (w == null) {
      if (measureFont !== font) { measureCtx.font = font; measureFont = font; }
      w = measureCtx.measureText(text).width;
      if (measureMap.size > 400) measureMap.delete(measureMap.keys().next().value);
      measureMap.set(k, w);
    }
    return w;
  }
  function drawTextSprite(sp, cx, cy) { ctx.drawImage(sp.c, cx - sp.w / 2, cy - sp.h / 2, sp.w, sp.h); }
  let shieldGrad = null;
  const STEP_MS = STEP_MS_BASE / PACE;

  // —— Freemium unlock catalog v1 ——
  const CATALOG = [
    // v1.9: Ghost replaced Glide in this slot (same 2-ad unlock / free level); saved Glide unlocks migrate to it.
    { id: "skill_ghost", name: "Ghost", kind: "skill", watches: 2, freeLevel: 40 },
    // v1.5: these three moved into the skill system (owners migrate to early unlocks); hidden in shop.
    { id: "skill_double", name: "Double flap", kind: "skill", watches: 2, freeLevel: 60, legacy: true },
    { id: "skill_shield", name: "Feather shield", kind: "skill", watches: 3, freeLevel: 80, legacy: true },
  ];
  // v1.5 coin-only skins (owned via unlocks.owned like the ad skins)
  // v1.10: original skins, unlocked with the Rewarded Unlock ad (opt-in, see drawAdConfirm) or with coins.
  const CATALOG_BY_ID = {};
  for (const it of CATALOG) CATALOG_BY_ID[it.id] = it;

  const BIRD_PALETTES = {
    bird_default: {
      body0: "#b8f5ee", body1: "#2fb5a8", body2: "#13706c",
      wing: "#1b8a8f", wingDark: "#0f5a60", belly: "rgba(245,255,253,0.85)",
      beak: "#ff9a52", cheek: "rgba(255,120,120,0.35)", glow: null,
    },
    bird_gold: {
      body0: "#fff8d0", body1: "#ffd700", body2: "#c9a000",
      wing: "#ffe566", wingDark: "#d4af37", belly: "rgba(255,250,200,0.65)",
      beak: "#ff8c00", cheek: "rgba(255,200,80,0.45)", glow: "rgba(255,215,0,0.35)",
    },
    bird_night: {
      body0: "#6a7a9a", body1: "#3a4560", body2: "#1e2435",
      wing: "#4a5570", wingDark: "#2a3045", belly: "rgba(160,180,220,0.35)",
      beak: "#c0c8d8", cheek: "rgba(100,140,200,0.35)", glow: "rgba(80,120,200,0.25)",
    },
    bird_neon: {
      body0: "#e0ff90", body1: "#39ff14", body2: "#00c853",
      wing: "#00e5ff", wingDark: "#00bcd4", belly: "rgba(200,255,255,0.45)",
      beak: "#ff00e5", cheek: "rgba(255,0,200,0.4)", glow: "rgba(57,255,20,0.45)",
    },
    bird_royal: {
      body0: "#d0b0ff", body1: "#7b2cbf", body2: "#3c096c",
      wing: "#9d4edd", wingDark: "#5a189a", belly: "rgba(240,220,255,0.4)",
      beak: "#ffd700", cheek: "rgba(200,150,255,0.4)", glow: "rgba(157,78,221,0.4)",
    },
  };

  // —— Bird evolution every 10 pipes (score) ——
  // Shop equippedBird = base skin for Hatchling (tier 0). From tier 1+ the
  // evolution ladder supplies a FULL distinct palette so forms are unmistakable.
  // Ladder has 10 distinct looks; higher tiers cycle with prestige glow shifts.
  // Pipes 0–9 → tier 0, 10–19 → tier 1, 20–29 → tier 2, …
  const EVOLUTION_LADDER = [
    // v1.17: 20 stages tied to the levels you reach (see economy.js EVO_LEVELS). Every stage changes the SHAPE (wings, tail, crest, size, see SC_FORM)
    // and some add a soft cool-toned glow or accent. The look is always the one teal Sparrow; the ladder never swaps its colours.
    { id: "hatchling", name: "Hatchling", accent: "none", feel: 0, palette: null },
    { id: "fledgling", name: "Fledgling", accent: "crest", feel: 0.01, palette: { glow: "rgba(70,220,205,0.40)" } },
    { id: "sky_hopper", name: "Sky Hopper", accent: "glow", feel: 0.02, palette: { glow: "rgba(79,195,247,0.5)" } },
    { id: "breeze", name: "Breeze Glider", accent: "none", feel: 0.03, palette: { glow: "rgba(120,220,255,0.42)" } },
    { id: "gale_wing", name: "Gale Wing", accent: "streaks", feel: 0.04, palette: { glow: "rgba(38,200,190,0.45)" } },
    { id: "cloud", name: "Cloud Dancer", accent: "glow", feel: 0.05, palette: { glow: "rgba(200,235,255,0.5)" } },
    { id: "storm_rider", name: "Storm Rider", accent: "electric", feel: 0.06, palette: { glow: "rgba(100,150,255,0.5)" } },
    { id: "thunder", name: "Thunder Wing", accent: "electric", feel: 0.07, palette: { glow: "rgba(140,170,255,0.55)" } },
    { id: "aurora", name: "Aurora Flap", accent: "aurora", feel: 0.08, palette: { glow: "rgba(110,235,255,0.45)" } },
    { id: "dawn", name: "Dawn Streamer", accent: "streaks", feel: 0.09, palette: { glow: "rgba(150,240,230,0.5)" } },
    { id: "nova", name: "Nova Beak", accent: "nova", feel: 0.1, palette: { glow: "rgba(225,255,255,0.55)" } },
    { id: "star", name: "Star Flyer", accent: "nova", feel: 0.11, palette: { glow: "rgba(190,230,255,0.55)" } },
    { id: "eclipse", name: "Eclipse Crow", accent: "eclipse", feel: 0.12, palette: { glow: "rgba(150,175,255,0.5)" } },
    { id: "moon", name: "Moon Weaver", accent: "aurora", feel: 0.13, palette: { glow: "rgba(170,200,255,0.55)" } },
    { id: "comet", name: "Comet Tail", accent: "streaks", feel: 0.14, palette: { glow: "rgba(130,230,255,0.58)" } },
    { id: "celestial", name: "Celestial", accent: "halo", feel: 0.15, palette: { glow: "rgba(235,248,255,0.55)" } },
    { id: "sun", name: "Sun Crown", accent: "halo", feel: 0.16, palette: { glow: "rgba(200,255,245,0.6)" } },
    { id: "skyfire", name: "Skyfire", accent: "phoenix", feel: 0.17, palette: { glow: "rgba(90,255,235,0.55)" } },
    { id: "phoenix", name: "Mythic Phoenix", accent: "phoenix", feel: 0.18, palette: { glow: "rgba(110,255,225,0.6)" } },
    { id: "legend", name: "Sky Legend", accent: "halo", feel: 0.2, palette: { glow: "rgba(215,255,250,0.65)" } },
    // v1.17 stages 21-40: the toy "war machine" line (cartoon machinery drawn on the same Phoenix: clockwork, rotors, Air Force ace, heavy treads)
    { id: "rivet", name: "Rivet Rider", accent: "none", feel: 0.21, palette: null },
    { id: "gear", name: "Gear Glider", accent: "none", feel: 0.22, palette: null },
    { id: "cog", name: "Cog Crest", accent: "none", feel: 0.23, palette: null },
    { id: "windup", name: "Wind-Up Wing", accent: "none", feel: 0.24, palette: null },
    { id: "brass", name: "Brass Blaze", accent: "none", feel: 0.25, palette: null },
    { id: "prop", name: "Propeller Pup", accent: "none", feel: 0.26, palette: null },
    { id: "rotorh", name: "Rotor Hopper", accent: "none", feel: 0.27, palette: null },
    { id: "twinrotor", name: "Twin Rotor", accent: "none", feel: 0.28, palette: null },
    { id: "chopper", name: "Chopper Phoenix", accent: "none", feel: 0.29, palette: null },
    { id: "skycopter", name: "Skycopter", accent: "none", feel: 0.3, palette: null },
    { id: "cadet", name: "Cadet Ace", accent: "none", feel: 0.31, palette: null },
    { id: "wingman", name: "Wingman", accent: "none", feel: 0.32, palette: null },
    { id: "squadron", name: "Squadron Lead", accent: "none", feel: 0.33, palette: null },
    { id: "jet", name: "Jet Phoenix", accent: "none", feel: 0.34, palette: null },
    { id: "staracs", name: "Star Ace", accent: "none", feel: 0.35, palette: null },
    { id: "dozer", name: "Dozer Bird", accent: "none", feel: 0.36, palette: null },
    { id: "tread", name: "Tread Titan", accent: "none", feel: 0.37, palette: null },
    { id: "mech", name: "Mech Phoenix", accent: "none", feel: 0.38, palette: null },
    { id: "fortress", name: "Fortress Wing", accent: "none", feel: 0.39, palette: null },
    { id: "titan", name: "Grand Titan", accent: "none", feel: 0.4, palette: null },
  ];
  // fire phoenix: the fiery glow grows with every stage (orange-gold, a little redder and stronger each time)
  EVOLUTION_LADDER.forEach(function (f, i) { f.palette = { glow: "rgba(255," + Math.max(96, 170 - i * 3) + "," + (50 + (i % 5) * 4) + "," + Math.min(0.8, 0.14 + 0.028 * i).toFixed(2) + ")" }; });
  const PRESTIGE_LABELS = [""];
  const PRESTIGE_GLOWS = [null];

  function evolutionTier(pipes) {
    // v1.17: callers pass stage * 10 (the stage comes from the levels you reached, see evoPipes()); 0..39.
    const p = Math.max(0, pipes | 0);
    return Math.min(39, Math.floor(p / 10));
  }

  function evolutionMeta(lv) {
    const tier = evolutionTier(lv);
    const base = EVOLUTION_LADDER[tier];
    return { tier: tier, idx: tier, prestige: 0, id: base.id, name: base.name, accent: base.accent, feel: base.feel, palette: base.palette, glow: null };
  }
  /** The bird's stage (0..19) is permanent progress (levels reached); the palette helpers take it as stage * 10. */
  let runEvo = 0; // form shown in this run. A new run starts at the first form. A checkpoint restore uses the saved level.
  function evoPipes() {
    let st = runEvo | 0;
    if (state !== State.PLAY && state !== State.OVER) st = resumeRec && resumeRec.level ? E.evoStageForLevel(resumeRec.level) : 0;
    return Math.max(0, Math.min(39, st)) * 10;
  }

  function mixHex(a, b, t) {
    if (!a || !b || t <= 0) return a || b;
    if (t >= 1) return b;
    function parse(h) {
      if (!h || h[0] !== "#" || (h.length !== 7 && h.length !== 4)) return null;
      if (h.length === 4) {
        return [
          parseInt(h[1] + h[1], 16),
          parseInt(h[2] + h[2], 16),
          parseInt(h[3] + h[3], 16),
        ];
      }
      return [
        parseInt(h.slice(1, 3), 16),
        parseInt(h.slice(3, 5), 16),
        parseInt(h.slice(5, 7), 16),
      ];
    }
    const A = parse(a), B = parse(b);
    if (!A || !B) return a;
    const r = Math.round(A[0] + (B[0] - A[0]) * t);
    const g = Math.round(A[1] + (B[1] - A[1]) * t);
    const bl = Math.round(A[2] + (B[2] - A[2]) * t);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
  }

  for (const sk of window.SkyHopEconomy.NEW_SKINS) BIRD_PALETTES[sk.id] = sk.palette;
  for (const sk of window.SkyHopEconomy.WORLD_SKINS) BIRD_PALETTES[sk.id] = sk.palette;

  // Memoized: drawn every frame, but the inputs only change on score / equip changes.
  const palMemo = { p: -1, b: null, s: null, r: null };
  function activeBirdPalette(pipes, speciesOverride) {
    const pp = pipes == null ? evoPipes() : pipes;
    const bb = unlocks.equippedBird;
    const ss = speciesOverride || (save && save.speciesEquipped) || "sparrow";
    if (palMemo.r && palMemo.p === pp && palMemo.b === bb && palMemo.s === ss) return palMemo.r;
    const r = activeBirdPaletteRaw(pp, ss);
    palMemo.p = pp; palMemo.b = bb; palMemo.s = ss; palMemo.r = r;
    return r;
  }
  function activeBirdPaletteRaw(pipes, speciesOverride) {
    const baseId = unlocks.equippedBird;
    const spId = speciesOverride || (save && save.speciesEquipped) || "sparrow";
    const species = E.SPECIES_BY_ID[spId] || E.SPECIES_BY_ID.sparrow;
    // "Classic" skin = the species' own colors. Any other skin keeps its colors through evolution.
    const keepSkin = baseId !== "bird_default" && !!BIRD_PALETTES[baseId];
    const base = keepSkin ? BIRD_PALETTES[baseId] : species.palette;
    const evo = evolutionMeta(pipes == null ? evoPipes() : pipes);
    // v1.15: the form (evo) only changes SHAPE + accents/glow. Colours are the species' own (classic) or the skin's.
    {
      const formGlow = evo.palette ? evo.palette.glow : null;
      let glow = evo.glow || base.glow;
      if (!glow && formGlow) glow = keepSkin ? skinGlow(base) : formGlow;
      return {
        body0: base.body0,
        body1: base.body1,
        body2: base.body2,
        wing: base.wing,
        wingDark: base.wingDark,
        belly: base.belly,
        beak: base.beak,
        cheek: base.cheek,
        glow: glow,
        evo: evo,
        birdId: baseId,
        species: species.id,
      };
    }
  }
  const SKIN_GLOW_MEMO = {};
  function skinGlow(base) {
    const h = base.body1, k = h;
    let v = SKIN_GLOW_MEMO[k];
    if (v) return v;
    const m = /^#([0-9a-f]{6})$/i.exec(h || "");
    v = m ? "rgba(" + parseInt(m[1].slice(0, 2), 16) + "," + parseInt(m[1].slice(2, 4), 16) + "," + parseInt(m[1].slice(4, 6), 16) + ",0.4)" : "rgba(255,255,255,0.4)";
    SKIN_GLOW_MEMO[k] = v;
    return v;
  }

  let ghostMigrated = false; // v1.9: set by loadUnlocks() when a saved Glide unlock became Ghost
  let unlocks = loadUnlocks();
  let unlockProgress = loadUnlockProgress();
  // v1.9: persist the Glide -> Ghost migration once (old keys are rewritten in place).
  if (ghostMigrated) saveUnlocks();
  try {
    const rawProg = lsGet(UNLOCK_PROGRESS_KEY);
    if (rawProg && rawProg.indexOf("skill_glide") >= 0) saveUnlockProgress();
  } catch (_) {}
  // v1.5 save (separate key; legacy best/level/trophy keys are never rewritten here)
  const loadedSave = E.loadSave(localStorage, { unlocks: unlocks });
  let save = loadedSave.save;
  /** v1.17: tell the bird renderer which skill branches to light up on the tail (brighter with each level). */
  const TAIL_RGB = { dash: "255,159,67", shield: "116,192,252", magnet: "255,107,154", shrink: "177,151,252", recharge: "155,231,255", glide: "201,242,255", second: "125,255,176", coins: "255,210,74", reach: "255,224,138", rocket: "255,138,76", power: "255,184,107", pellets: "255,45,138", pop: "122,76,255", poof: "46,230,176", cannon: "255,77,77", rotor: "155,231,255", rapid: "179,157,255", bounty: "255,210,74", crumble: "201,160,102" };
  function refreshTailPower() {
    const list = [];
    for (const n of E.treeInfo(save, peakLevel())) if (n.level > 0) list.push({ id: n.id, rgb: TAIL_RGB[n.id] || "255,255,255", k: Math.max(0.25, n.level / n.max) });
    list.sort(function (a, b) { return b.k - a.k; });
    setTailPower(list.slice(0, 9));
    palMemo.r = null;
  }
  function persist() {
    if (savesDeferred()) { saveDirty = true; return; }
    saveDirty = false;
    try { lsSet(E.SAVE_KEY, E.serializeSave(save)); } catch (_) {}
  }
  if (loadedSave.migrated) persist();
  let shopScroll = 0;
  let shopDragY = null;
  let shopDragScroll = 0;
  let shopBusy = false;
  let shopToast = 0;
  let shopToastText = "";
  // Rewarded-ad failure notice (e.g. "No ad available right now") on game over
  let adNoticeText = "";
  let adNoticeUntil = 0;

  function showAdFailureNotice(fallback) {
    let msg = fallback || "No ad available right now";
    try {
      const a = typeof window !== "undefined" ? window.SkyHopAds : null;
      const f = a && typeof a.getLastFailure === "function" ? a.getLastFailure() : null;
      if (f && f.userMessage) msg = f.userMessage;
    } catch (_) {}
    adNoticeText = msg;
    adNoticeUntil = Date.now() + 3500;
    shopToast = 2.6;
    shopToastText = msg;
  }
  // Per-run perk state (reset in startPlay)
  // v1.9 Ghost: see-through for the next GHOST_PIPES pipes, once per run.
  const GHOST_PIPES = 5;
  // v1.18: Ghost has charges instead of "once per run": 2 per run (+1 at Quick Recharge levels 2 and 4, max 4), 8 s between uses (counted after a ghost ends),
  // and one charge comes back every 45 s of play (a little faster with Quick Recharge). Never while a ghost is running.
  const GHOST_BASE_CHARGES = 2, GHOST_MAX_CHARGES = 4, GHOST_GAP_FRAMES = 480, GHOST_REGEN_FRAMES = 2700;
  let ghostCharges = 0, ghostRegen = 0;
  function ghostMaxCharges() { return Math.min(GHOST_MAX_CHARGES, GHOST_BASE_CHARGES + Math.floor(E.upgradeTier(save, "recharge") / 2)); }
  function ghostRegenNeed() { return Math.max(900, Math.round(GHOST_REGEN_FRAMES * E.upgradeValue(save, "recharge"))); }
  let ghostPipesLeft = 0;
  let ghostUsedThisRun = false;
  let ghostPop = 0;
  let doubleUsedThisRun = false;
  let shieldCharges = 0;
  let trailTick = 0;

  function loadUnlocks() {
    try {
      const raw = lsGet(UNLOCKS_KEY);
      if (!raw) {
        return { owned: ["bird_default"], equippedBird: "bird_default", equippedTrail: false };
      }
      const data = JSON.parse(raw);
      const owned = Array.isArray(data.owned) ? data.owned.map(String) : [];
      if (owned.indexOf("bird_default") < 0) owned.unshift("bird_default");
      // v1.12: the retired next-pipe hint item was removed; drop it from old saves.
      for (let ri = owned.length - 1; ri >= 0; ri--) if (owned[ri] === "feat_hint") owned.splice(ri, 1);
      // v1.9: Glide was replaced by Ghost in the same slot. Anyone who unlocked Glide gets Ghost.
      const gi = owned.indexOf("skill_glide");
      if (gi >= 0) {
        owned.splice(gi, 1);
        if (owned.indexOf("skill_ghost") < 0) owned.push("skill_ghost");
        ghostMigrated = true;
      }
      const bird = "bird_default"; // v1.17: no skins, one look
      return {
        owned: owned,
        equippedBird: bird,
        equippedTrail: !!data.equippedTrail,
      };
    } catch (_) {
      return { owned: ["bird_default"], equippedBird: "bird_default", equippedTrail: false };
    }
  }

  function saveUnlocks() {
    try {
      lsSet(UNLOCKS_KEY, JSON.stringify({
        owned: unlocks.owned,
        equippedBird: unlocks.equippedBird,
        equippedTrail: !!unlocks.equippedTrail,
      }));
    } catch (_) {}
  }

  function loadUnlockProgress() {
    try {
      const raw = lsGet(UNLOCK_PROGRESS_KEY);
      if (!raw) return {};
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object" || Array.isArray(data)) return {};
      const out = {};
      for (const k of Object.keys(data)) {
        const n = parseInt(data[k], 10);
        // v1.9: partial Glide ad progress carries over to Ghost (same slot, same 2 ads).
        if (k === "feat_hint") continue; // v1.12: retired item
        const key = k === "skill_glide" ? "skill_ghost" : k;
        if (Number.isFinite(n) && n > 0) out[key] = Math.max(out[key] | 0, n);
      }
      return out;
    } catch (_) {
      return {};
    }
  }

  function saveUnlockProgress() {
    try {
      lsSet(UNLOCK_PROGRESS_KEY, JSON.stringify(unlockProgress));
    } catch (_) {}
  }

  function peakLevel() {
    return Math.max(bestLevel | 0, highestUnlocked | 0);
  }

  function isOwned(id) {
    if (!id) return false;
    if (unlocks.owned.indexOf(id) >= 0) return true;
    const item = CATALOG_BY_ID[id];
    if (item && item.freeLevel && peakLevel() >= item.freeLevel) return true;
    return false;
  }

  function watchesNeeded(id) {
    const item = CATALOG_BY_ID[id];
    return item ? (item.watches | 0) : 0;
  }

  function progressFor(id) {
    return unlockProgress[id] | 0;
  }

  function grantOwned(id) {
    if (!id || unlocks.owned.indexOf(id) >= 0) return;
    unlocks.owned.push(id);
    saveUnlocks();
  }

  function applyUnlockWatch(id) {
    const item = CATALOG_BY_ID[id];
    if (!item || item.watches <= 0) return false;
    if (unlocks.owned.indexOf(id) >= 0) return false;
    const need = item.watches;
    const cur = (unlockProgress[id] | 0) + 1;
    unlockProgress[id] = cur;
    saveUnlockProgress();
    if (cur >= need) {
      grantOwned(id);
      delete unlockProgress[id];
      saveUnlockProgress();
      shopToast = 1.4;
      shopToastText = "Unlocked: " + item.name;
      return true;
    }
    shopToast = 1.1;
    shopToastText = item.name + " " + cur + "/" + need;
    return false;
  }

  function equipBird(id) {
    if (!isOwned(id) || !CATALOG_BY_ID[id] || CATALOG_BY_ID[id].kind !== "bird") return;
    unlocks.equippedBird = id;
    saveUnlocks();
  }

  function adsApi() {
    return typeof window !== "undefined" ? window.SkyHopAds : null;
  }

  function canNativeUnlockAd() {
    const ads = adsApi();
    return !!(ads && typeof ads.canOfferUnlock === "function" && ads.canOfferUnlock());
  }

  // —— v1.9.2: rewarded requests can be abandoned while they are only loading ——
  // 1.9.1 ignored EVERY game-over tap while a rewarded ad was loading (up to 8 s load + 8 s
  // "must appear"), so with no ad fill Share / Leaderboard / Shop / Birds / Trophies looked dead.
  // Now a nav tap cancels a still-loading request (no ad will pop later) and works at once.
  let adReqToken = 0;
  function newAdReq() {
    adReqToken++;
    const t = adReqToken;
    return {
      token: t,
      opts: { stillWanted: function () { return t === adReqToken && state === State.OVER; } },
      stale: function () { return t !== adReqToken; },
    };
  }
  function lastAdCancelled() {
    try {
      const a = adsApi();
      const f = a && typeof a.getLastFailure === "function" ? a.getLastFailure() : null;
      return !!(f && f.stage === "cancelled");
    } catch (_) {
      return false;
    }
  }
  /** True when no rewarded ad is on screen, so the game-over menu may take this tap. */
  function abandonPendingAd() {
    const a = adsApi();
    if (a && typeof a.cancelPendingRewarded === "function") {
      try {
        if (!a.cancelPendingRewarded()) return false; // an ad is actually showing
      } catch (_) {}
    }
    adReqToken++; // results of the abandoned request are ignored
    continueBusy = false;
    rewardBusy = false;
    continueSnapshot = null;
    return true;
  }
  function rewardedLoadingNow() {
    const a = adsApi();
    try {
      return !!(a && typeof a.rewardedPhase === "function" && a.rewardedPhase() === "loading");
    } catch (_) {
      return false;
    }
  }
  function rewardedStatus(purpose) {
    const a = adsApi();
    try {
      return a && typeof a.rewardedStatus === "function" ? a.rewardedStatus(purpose) : "off";
    } catch (_) {
      return "off";
    }
  }

  function isBrowserPlay() {
    // v1.9: the itch.io build is ad-free with no "demo" ad stand-ins (no free demo continues/unlocks).
    if (ITCH_BUILD) return false;
    const ads = adsApi();
    if (!ads) return true;
    try {
      return !(typeof ads.isNative === "function" && ads.isNative());
    } catch (_) {
      return true;
    }
  }

  // —— Daily challenge + streak ——
  function todayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function yesterdayKey() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function hashDate(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function loadDaily() {
    try {
      const raw = lsGet(DAILY_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && typeof data === "object") return data;
      }
    } catch (_) {}
    return null;
  }

  function saveDaily(data) {
    try { lsSet(DAILY_KEY, JSON.stringify(data)); } catch (_) {}
  }

  function saveContinueTokens() {
    try { lsSet(CONTINUE_TOKENS_KEY, String(continueTokens)); } catch (_) {}
  }

  function grantContinueToken(n) {
    continueTokens = Math.max(0, (continueTokens | 0) + (n | 0));
    saveContinueTokens();
  }

  function spendContinueToken() {
    if (continueTokens <= 0) return false;
    continueTokens--;
    saveContinueTokens();
    return true;
  }

  /** Build or refresh today's challenge (deterministic from date). */
  function ensureDaily() {
    const today = todayKey();
    let data = loadDaily();
    if (data && data.date === today && data.challenge) return data;
    const h = hashDate(today);
    const kinds = ["level", "pipes", "score"];
    const kind = kinds[h % 3];
    let target;
    let label;
    if (kind === "level") {
      target = 3 + (h % 8); // Level 3–10
      label = "Reach Level " + target;
    } else if (kind === "pipes") {
      target = 8 + (h % 18); // 8–25 pipes (score)
      label = "Survive " + target + " pipes";
    } else {
      target = 12 + (h % 24); // score 12–35
      label = "Score " + target + " points";
    }
    let streak = 0;
    if (data && data.date === today) {
      streak = data.streak | 0;
    } else if (data && data.completed && data.date === yesterdayKey()) {
      // Carry prior streak until today is completed (shown as current streak)
      streak = data.streak | 0;
    }
    data = {
      date: today,
      challenge: { kind: kind, target: target, label: label },
      completed: false,
      streak: streak,
      rewarded: false,
    };
    saveDaily(data);
    return data;
  }

  function dailyProgressText(data) {
    if (!data || !data.challenge) return "";
    const c = data.challenge;
    if (data.completed) return "Done! 🔥 streak " + (data.streak | 0);
    if (c.kind === "level") return "Best today L" + Math.max(bestLevel, level) + " / L" + c.target;
    if (c.kind === "pipes" || c.kind === "score") {
      // Use run score on OVER; on START show best as soft progress
      const cur = state === State.OVER ? score : Math.max(best, score);
      return cur + " / " + c.target;
    }
    return "";
  }

  function checkDailyOnGameOver() {
    const data = ensureDaily();
    if (!data || data.completed || !data.challenge) return data;
    const c = data.challenge;
    let ok = false;
    if (c.kind === "level") ok = level >= c.target;
    else if (c.kind === "pipes" || c.kind === "score") ok = score >= c.target;
    if (!ok) return data;
    return completeDaily(data, "Daily done!");
  }

  /** Mark today's daily complete (challenge OR all 3 missions) and advance the 🔥 streak once. */
  function completeDaily(data, label) {
    data = data || ensureDaily();
    if (!data || data.completed) return data;
    data.completed = true;
    // streak: consecutive days with a completed challenge
    let streak = 1;
    const prior = loadDaily();
    if (prior && prior.date === todayKey() && (prior.streak | 0) > 0 && prior.completed) {
      streak = prior.streak | 0; // already counted today
    } else if (prior && prior.date === yesterdayKey() && prior.completed) {
      streak = (prior.streak | 0) + 1;
    } else if (prior && prior.date === todayKey() && !prior.completed && (prior.streak | 0) > 0) {
      // Carried streak from yesterday via ensureDaily
      streak = (prior.streak | 0) + 1;
    }
    data.streak = streak;
    if (!data.rewarded) {
      data.rewarded = true;
      grantContinueToken(1);
      shopToast = 1.6;
      shopToastText = (label || "Daily done!") + " +1 continue · 🔥" + data.streak;
      sfxTrophy();
      if (state !== State.PLAY) spawnParticles(W / 2, PLAY_H / 2, 20, "#bfe8ff");
    }
    saveDaily(data);
    return data;
  }

  function pipesToNextLevel(s) {
    const lv = levelFromScore(s);
    if (lv >= MAX_LEVEL) return 999;
    const nextAt = lv * PIPES_PER_LEVEL;
    return Math.max(0, nextAt - s);
  }

  function pipesToNextEvo(s) {
    // v1.17: pipes left until the level that evolves the bird (stage is permanent: levels you reached)
    const st = (save && save.evo) | 0;
    if (st >= E.EVO_LEVELS.length - 1) return 999;
    return Math.max(0, (E.EVO_LEVELS[st + 1] - 1) * PIPES_PER_LEVEL - s);
  }

  function goalChipInfo(s) {
    const toLv = pipesToNextLevel(s);
    const toEvo = pipesToNextEvo(s);
    const nextLv = levelFromScore(s) + 1;
    if (toEvo <= 0 && toLv <= 0) return { text: "", prefer: "none" };
    // Prefer whichever is closer; tie → bird evolution (more exciting)
    if (toEvo <= toLv) {
      return {
        text: toEvo === 1 ? "1 to evolve!" : toEvo + " to evolve",
        prefer: "evo",
        n: toEvo,
      };
    }
    return {
      text: toLv === 1 ? "1 to Level " + nextLv : toLv + " to Level " + nextLv,
      prefer: "level",
      n: toLv,
      nextLv: nextLv,
    };
  }

  function computeAlmostLine(s, lv) {
    const toLv = pipesToNextLevel(s);
    const toEvo = pipesToNextEvo(s);
    const bits = [];
    if (toLv >= 1 && toLv <= 2) {
      bits.push("Almost Level " + (lv + 1) + "!");
    }
    if (toEvo >= 1 && toEvo <= 2) {
      bits.push(toEvo === 1 ? "1 pipe from evolving!" : toEvo + " pipes from evolving!");
    }
    return bits[0] || "";
  }

  function pickFeaturedUnlock() {
    // Prefer locked skills, then feats, then birds
    const order = ["skill", "feat", "bird"];
    for (const kind of order) {
      for (const it of CATALOG) {
        if (it.kind !== kind || it.watches <= 0 || it.legacy) continue;
        if (isOwned(it.id)) continue;
        return it;
      }
    }
    return CATALOG[1] || CATALOG[0];
  }

  function haptic(kind) {
    // kind: flap | crash | evolve | score | near
    try {
      const Cap = typeof window !== "undefined" ? window.Capacitor : null;
      const H = Cap && Cap.Plugins && Cap.Plugins.Haptics;
      if (H) {
        if (kind === "crash" && H.vibrate) {
          H.vibrate({ duration: 40 });
          return;
        }
        if (kind === "evolve" && H.notification) {
          H.notification({ type: "SUCCESS" });
          return;
        }
        if (H.impact) {
          const style = kind === "crash" ? "HEAVY" : kind === "flap" ? "LIGHT" : "MEDIUM";
          H.impact({ style: style });
          return;
        }
      }
    } catch (_) {}
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        if (kind === "crash") navigator.vibrate([30, 40, 50]);
        else if (kind === "evolve") navigator.vibrate([20, 30, 20, 30, 40]);
        else if (kind === "near") navigator.vibrate(12);
        else if (kind === "score") navigator.vibrate(8);
        else navigator.vibrate(10); // flap
      }
    } catch (_) {}
  }

  function canOfferSafeStartNudge() {
    if (!offerSafeStart) return false;
    const today = todayKey();
    let used = "";
    try { used = lsGet(SAFE_START_DAY_KEY) || ""; } catch (_) {}
    // Free once/day; otherwise native rewarded can still offer
    if (used !== today) return true;
    const ads = adsApi();
    return !!(ads && typeof ads.canOfferContinue === "function" && ads.canOfferContinue());
  }

  /** True while today's free Practice restart hasn't been used (after that it costs a rewarded ad). */
  function safeStartFreeToday() {
    let used = "";
    try { used = lsGet(SAFE_START_DAY_KEY) || ""; } catch (_) {}
    return used !== todayKey();
  }

  function markSafeStartUsed() {
    try { lsSet(SAFE_START_DAY_KEY, todayKey()); } catch (_) {}
  }

  function activateSafeStart() {
    safeStartActive = true;
    safeStartFrames = 20; // ~first 20 pipes gentler via difficulty blend
    offerSafeStart = false;
    markSafeStartUsed();
    shopToast = 1.2;
    shopToastText = "Safe start — easy first pipes!";
  }

  async function requestSafeStart() {
    if (state !== State.OVER || !offerSafeStart) return;
    const today = todayKey();
    let used = "";
    try { used = lsGet(SAFE_START_DAY_KEY) || ""; } catch (_) {}
    if (used !== today) {
      // Free once per day
      activateSafeStart();
      startPlay();
      return;
    }
    const ads = adsApi();
    if (!ads || typeof ads.showRewarded !== "function") return;
    if (typeof ads.canOfferContinue === "function" && !ads.canOfferContinue()) return;
    continueBusy = true;
    const rq = newAdReq();
    try {
      const ok = await ads.showRewarded("continue", rq.opts);
      if (rq.stale()) return;
      continueBusy = false;
      if (ok) {
        activateSafeStart();
        startPlay();
      } else if (!lastAdCancelled()) {
        showAdFailureNotice();
      }
    } catch (_) {
      if (rq.stale()) return;
      continueBusy = false;
      showAdFailureNotice();
    }
  }

  /** Menu "Privacy policy": the live policy in the system browser (Capacitor routes external URLs to an ACTION_VIEW intent). */
  function openPrivacyPolicy() {
    try {
      window.open(PRIVACY_URL, "_blank", "noopener,noreferrer");
    } catch (_) {}
  }

  /** Menu "Privacy choices": Google UMP privacy options form (change consent / US opt-out). */
  function openPrivacyChoices() {
    const ads = adsApi();
    if (!ads || typeof ads.showPrivacyOptions !== "function") return;
    try {
      const r = ads.showPrivacyOptions();
      if (r && typeof r.catch === "function") r.catch(function () {});
    } catch (_) {}
  }

  function privacyChoicesAvailable() {
    const ads = adsApi();
    try {
      return !!(ads && typeof ads.privacyOptionsRequired === "function" && ads.privacyOptionsRequired());
    } catch (_) {
      return false;
    }
  }

  // —— v1.9: native helpers (Play Games leaderboard, Android share sheet) ——
  function nativeApi() {
    try {
      const C = typeof window !== "undefined" ? window.Capacitor : null;
      if (!C || typeof C.isNativePlatform !== "function" || !C.isNativePlatform()) return null;
      return (C.Plugins && C.Plugins.SkyHopNative) || null;
    } catch (_) {
      return null;
    }
  }

  function leaderboardAvailable() {
    const n = nativeApi();
    return !!(n && typeof n.showLeaderboard === "function");
  }

  /** Game over: send this run's score to the weekly leaderboard (Play keeps each player's best per week). */
  function submitRunScore(sc) {
    const n = nativeApi();
    if (!n || typeof n.submitScore !== "function" || !(sc > 0)) return;
    if (lbSubmitLog.length < 50) lbSubmitLog.push(sc);
    try {
      const r = n.submitScore({ leaderboardId: LEADERBOARD_ID, score: sc });
      if (r && typeof r.then === "function") {
        r.then(function (res) {
          if (res && res.submitted) { if (sc >= lbPendingScore) lbPendingScore = 0; }
          else lbPendingScore = Math.max(lbPendingScore, sc);
        }, function () { lbPendingScore = Math.max(lbPendingScore, sc); });
      }
    } catch (_) {
      lbPendingScore = Math.max(lbPendingScore, sc);
    }
  }

  function showMenuNotice(msg) {
    adNoticeText = msg;
    adNoticeUntil = Date.now() + 3500;
  }

  /** Leaderboard button: signs in to Play Games if needed (player tapped), then opens the weekly board. */
  async function openLeaderboard() {
    const n = nativeApi();
    if (!n || typeof n.showLeaderboard !== "function") return;
    // v1.9.2: a sign-in / leaderboard call that never answered can't lock the button for good.
    if (lbBusy && Date.now() - lbBusyAt < 20000) return;
    lbBusy = true;
    lbBusyAt = Date.now();
    try {
      const res = await n.showLeaderboard({ leaderboardId: LEADERBOARD_ID, pendingScore: lbPendingScore });
      if (res && (res.shown || res.pendingSubmitted)) lbPendingScore = 0;
      if (!res || !res.shown) {
        showMenuNotice(res && res.reason === "not_signed_in"
          ? "Leaderboard needs Play Games sign-in (optional)"
          : "Leaderboard isn't available right now");
      }
    } catch (_) {
      showMenuNotice("Leaderboard isn't available right now");
    } finally {
      lbBusy = false;
    }
  }

  function shareMessage() {
    return "I scored " + score + " in Sky Hop! Can you beat me?";
  }

  /** Screenshot of the game-over screen + a small footer, as a JPEG data URL (for the share sheet). */
  function captureShareImage() {
    const sw = 720;
    const sh = Math.round(sw * H / W);
    const foot = 110;
    const c = document.createElement("canvas");
    c.width = sw;
    c.height = sh + foot;
    const g = c.getContext("2d");
    g.drawImage(canvas, 0, 0, sw, sh);
    g.fillStyle = "#0e2238";
    g.fillRect(0, sh, sw, foot);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#ffffff";
    g.font = "bold 38px " + FONT;
    g.fillText("I scored " + score + " in Sky Hop!", sw / 2, sh + 40);
    g.fillStyle = "#9fe8ff";
    g.font = "bold 24px " + FONT;
    g.fillText("Free on Google Play", sw / 2, sh + 82);
    return c.toDataURL("image/jpeg", 0.9);
  }

  async function shareRun() {
    if (shareBusy) return;
    shareBusy = true;
    const msg = shareMessage();
    const url = PLAY_STORE_URL;
    // v1.9 Android: screenshot + text through the system share sheet (FileProvider, no permissions).
    const n = nativeApi();
    if (n && typeof n.shareImage === "function") {
      try {
        await n.shareImage({ base64: captureShareImage(), mimeType: "image/jpeg", text: msg + " " + url, title: "Share your score" });
        shareBusy = false;
        return;
      } catch (_) { /* fall back to text share below */ }
    }
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "Sky Hop", text: msg, url: url });
        shareBusy = false;
        return;
      }
    } catch (_) { /* user cancel ok */ }
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(msg + " " + url);
        shopToast = 1.2;
        shopToastText = "Copied share text!";
        shareBusy = false;
        return;
      }
    } catch (_) {}
    try {
      const intent = "https://twitter.com/intent/tweet?text=" + encodeURIComponent(msg + " " + url);
      window.open(intent, "_blank", "noopener,noreferrer");
    } catch (_) {}
    shareBusy = false;
  }

  /** "Get it on Google Play" (itch.io build): opens the Play listing in a new tab. */
  function openPlayStore() {
    try {
      window.open(PLAY_STORE_URL, "_blank", "noopener,noreferrer");
    } catch (_) {}
  }

  function drawPlayStoreButton(x, y, w, h) {
    const r = drawButton(x, y, w, h, "", "rgba(12,20,32,0.96)", "#fff", "bold 14px " + FONT, "rgba(255,255,255,0.7)");
    // simple four-colour play triangle (not the official badge artwork)
    const tx = x + 26, ty = y + h / 2, ts = Math.min(11, h * 0.28);
    ctx.save();
    ctx.beginPath(); ctx.moveTo(tx - ts * 0.7, ty - ts); ctx.lineTo(tx + ts, ty); ctx.lineTo(tx - ts * 0.7, ty + ts); ctx.closePath();
    ctx.fillStyle = "#34a853"; ctx.fill();
    ctx.beginPath(); ctx.moveTo(tx - ts * 0.7, ty - ts); ctx.lineTo(tx + ts * 0.15, ty); ctx.lineTo(tx - ts * 0.7, ty + ts); ctx.closePath();
    ctx.fillStyle = "#4285f4"; ctx.fill();
    ctx.beginPath(); ctx.moveTo(tx + ts * 0.15, ty); ctx.lineTo(tx + ts, ty); ctx.lineTo(tx + ts * 0.28, ty + ts * 0.43); ctx.closePath();
    ctx.fillStyle = "#fbbc04"; ctx.fill();
    ctx.beginPath(); ctx.moveTo(tx + ts * 0.15, ty); ctx.lineTo(tx + ts, ty); ctx.lineTo(tx + ts * 0.28, ty - ts * 0.43); ctx.closePath();
    ctx.fillStyle = "#ea4335"; ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold " + (h >= 40 ? 16 : 14) + "px " + FONT;
    ctx.fillText(fitText("Get it on Google Play", w - 64), x + w / 2 + 12, y + h / 2 + 0.5);
    return r;
  }

  /** itch.io build: keep a real link over the canvas button so taps open a new tab inside itch's iframe. */
  function syncPlayLink() {
    if (!ITCH_BUILD) return;
    const b = (state === State.START || state === State.OVER) ? uiButtons.playStore : null;
    if (!playLinkEl) {
      const wrap = document.getElementById("game-wrap");
      if (!wrap) return;
      playLinkEl = document.createElement("a");
      playLinkEl.id = "play-store-link";
      playLinkEl.href = PLAY_STORE_URL;
      playLinkEl.target = "_blank";
      playLinkEl.rel = "noopener noreferrer";
      playLinkEl.setAttribute("aria-label", "Get Sky Hop on Google Play (opens in a new tab)");
      playLinkEl.title = "Get it on Google Play";
      playLinkEl.style.cssText = "position:absolute;z-index:5;display:none;background:transparent;border-radius:12px;-webkit-tap-highlight-color:transparent;";
      wrap.appendChild(playLinkEl);
    }
    if (!b) {
      if (playLinkEl.style.display !== "none") playLinkEl.style.display = "none";
      return;
    }
    const wrapEl = playLinkEl.parentNode;
    const cr = canvas.getBoundingClientRect();
    const wr = wrapEl.getBoundingClientRect();
    const sx = cr.width / W, sy = cr.height / H;
    const css = "left:" + Math.round(cr.left - wr.left + b.x * sx) + "px;top:" + Math.round(cr.top - wr.top + b.y * sy) +
      "px;width:" + Math.round(b.w * sx) + "px;height:" + Math.round(b.h * sy) + "px;";
    if (playLinkEl.__pos !== css) {
      playLinkEl.__pos = css;
      playLinkEl.style.left = Math.round(cr.left - wr.left + b.x * sx) + "px";
      playLinkEl.style.top = Math.round(cr.top - wr.top + b.y * sy) + "px";
      playLinkEl.style.width = Math.round(b.w * sx) + "px";
      playLinkEl.style.height = Math.round(b.h * sy) + "px";
    }
    if (playLinkEl.style.display !== "block") playLinkEl.style.display = "block";
  }

  // —— v1.15 per-bird perks ——
  // pk() = the equipped bird's perk numbers while they apply (level 21+, not a boss level, in a run); otherwise neutral.
  let secondWindLeft = 0, talonSmashLeft = 0;
  function perkOn() { return state === State.PLAY && level >= E.BIRD_PERK_MIN_LEVEL && !isBossLevel(level); }
  function pk() { return perkOn() ? E.birdPerk(save) : E.BIRD_PERK_NEUTRAL; }
  function clearThreatsNear(x, r) {
    for (let i = hunters.length - 1; i >= 0; i--) if (Math.abs(hunters[i].x - x) < r + 20) hunters.splice(i, 1);
    for (let i = animals.length - 1; i >= 0; i--) if (Math.abs(animals[i].x - x) < r) animals.splice(i, 1);
    for (let i = projectiles.length - 1; i >= 0; i--) if (Math.abs(projectiles[i].x - x) < r + 40) projectiles.splice(i, 1);
    for (const t of trees) if (t.hazard && Math.abs(t.x - x) < r) t.hazard = false;
  }
  /** Sparrow: Second Wind. One forgiven crash per run: back into the next gap with a short safe window. */
  function trySecondWind() {
    const p = pk();
    if (!p.secondChance || secondWindLeft <= 0) return false;
    secondWindLeft--;
    let tp = null;
    for (const q of pipes) if (!q.scored && q.x + q.w > bird.x - bird.r - 2 && (!tp || q.x < tp.x)) tp = q;
    const ty = tp ? tp.gapY : PLAY_H / 2;
    bird.y = Math.max(bird.r + 10, Math.min(PLAY_H - bird.r - 10, ty));
    bird.vy = FLAP * 0.6;
    for (const q of pipes) if (q.x < bird.x + bird.r + 8 && q.x + q.w > bird.x - bird.r - 8) q.ghostPass = true;
    clearThreatsNear(bird.x, 90);
    invulnFrames = Math.max(invulnFrames, p.secondChanceFrames);
    graceBudget = 90;
    flash = 0.5;
    screenShake = Math.max(screenShake, 0.4);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      addParticle(bird.x + Math.cos(a) * 14, bird.y + Math.sin(a) * 14, Math.cos(a) * 3, Math.sin(a) * 3 - 0.5, 24, 24, i % 2 ? "#ffffff" : "#8ff3e6", 2.4);
    }
    rings.push({ x: bird.x, y: bird.y, r: 16, max: 64, life: 1, color: "140,240,225" });
    floaters.push({ x: bird.x, y: bird.y - 30, text: "Second Wind!", life: 60, color: "#9ff5e8" });
    sfxShieldUp();
    haptic("score");
    return true;
  }
  /** Eagle: Talon Smash. A hunter / projectile hit is smashed instead of ending the run (first N hits per run). */
  function tryTalonSmash(kind, idx) {
    if (invulnFrames > 0 || puMode || state !== State.PLAY) return false;
    const p = pk();
    if (!p.huntSmash || talonSmashLeft <= 0) return false;
    talonSmashLeft--;
    let sx = bird.x + 20, sy = bird.y;
    if (kind === "hunter") { sx = hunters[idx].x; sy = hunters[idx].y; defeatHunter(hunters[idx], true); }
    else { sx = projectiles[idx].x; sy = projectiles[idx].y; projectiles.splice(idx, 1); }
    invulnFrames = Math.max(invulnFrames, 40);
    screenShake = Math.max(screenShake, 0.5);
    if (kind !== "hunter") {
      poofFx(sx, sy, true); confettiBurst(sx, sy, 30);
      floaters.push({ x: bird.x + 24, y: bird.y - 30, text: "Talon Smash!", life: 56, color: "#cfe0ff" });
    }
    beep(120, 0.1, "square", 0.05);
    haptic("near");
    return true;
  }

  // —— v1.5 skills ——
  function resetRunPerks() {
    ghostPipesLeft = 0;
    ghostUsedThisRun = false;
    ghostCharges = ghostMaxCharges(); ghostRegen = 0;
    ghostPop = 0;
    doubleUsedThisRun = false;
    // Owl perk: every run starts with a free shield charge (lasts until hit)
    shieldCharges = save.speciesEquipped === "owl" ? 1 : 0;
    // v1.15 per-bird perk charges (granted per run; they only act on levels 21+ that are not boss levels)
    const rp = E.birdPerk(save);
    secondWindLeft = rp.secondChance;
    talonSmashLeft = rp.huntSmash;
    trailTick = 0;
    for (const id of SKILL_ORDER) {
      skillState[id] = { cd: 0, cdMax: 1, active: 0, activeMax: 1, readyPulse: 0 };
    }
    birdScale = 1;
    graceBudget = 0;
  }

  function skillActive(id) {
    const st = skillState[id];
    return st ? st.active : 0;
  }

  /** Skill has been unlocked (menus) — ignores per-run conditions. */
  function skillOwned(id) {
    if (id === "ghost") return isOwned("skill_ghost");
    return E.isSkillUnlocked(save, id, peakLevel());
  }

  /** Skill button is shown right now in this run. */
  function skillAvailable(id) {
    if (!skillOwned(id)) return false;
    return true;
  }

  function skillStatsFor(id) {
    const s = E.skillStats(save, id, save.speciesEquipped);
    const p = pk();
    if (id === "shield" && p.shieldMul !== 1) return Object.assign({}, s, { dur: s.dur * p.shieldMul });
    return s;
  }

  function useSkill(id) {
    if (state !== State.PLAY || ignoreInputFrames > 0 || pauseMode) return false;
    if (!skillAvailable(id)) return false;
    const st = skillState[id];
    if (!st) return false;
    if (st.cd > 0 || st.active > 0 || (id === "ghost" && ghostCharges <= 0)) {
      beep(180, 0.05, "square", 0.025);
      return false;
    }
    const s = skillStatsFor(id);
    const durF = Math.max(1, Math.round(s.dur * 60));
    let ok = true;
    if (id === "dash") {
      const dashF = Math.round(DASH_FRAMES * pk().dashMul);
      st.active = st.activeMax = dashF;
      invulnFrames = Math.max(invulnFrames, dashF + 16);
      graceBudget = 90;
      bird.vy = Math.min(bird.vy, 0) * 0.3;
      screenShake = Math.max(screenShake, 0.35);
      rings.push({ x: bird.x, y: bird.y, r: 10, max: 46, life: 1, color: "255,190,90" });
      spawnParticles(bird.x - 12, bird.y, 10, "#ffffff");
      sfxDash();
      haptic("near");
      save.stats.dashes++;
      missionProgress("dash", 1);
    } else if (id === "shield") {
      st.active = st.activeMax = durF;
      rings.push({ x: bird.x, y: bird.y, r: 30, max: 22, life: 1, color: "160,210,255", shrink: true });
      sfxShieldUp();
    } else if (id === "shrink") {
      st.active = st.activeMax = durF;
      spawnParticles(bird.x, bird.y, 10, "#d0bfff");
      sfxShrink();
    } else if (id === "ghost") {
      // Counts pipes, not frames: tickSkills keeps st.active in sync with ghostPipesLeft.
      ghostPipesLeft = GHOST_PIPES;
      ghostUsedThisRun = true;
      ghostCharges = Math.max(0, ghostCharges - 1);
      ghostPop = 1;
      st.active = ghostPipesLeft;
      st.activeMax = GHOST_PIPES;
      rings.push({ x: bird.x, y: bird.y, r: 12, max: 40, life: 1, color: "210,225,255" });
      spawnParticles(bird.x, bird.y, 10, "#e6ecff");
      sfxShieldUp();
    }
    if (!ok) return false;
    st.cdMax = Math.max(1, Math.round(s.cd * 60));
    st.cd = st.cdMax;
    if (id === "ghost") st.cd = st.cdMax = GHOST_GAP_FRAMES; // v1.18: the short gap before the next ghost starts counting when this one ends
    missionProgress("skills", 1);
    const def = E.SKILL_BY_ID[id];
    return true;
  }

  /** Per-frame skill timers (real time). */
  function tickSkills() {
    for (const id of SKILL_ORDER) {
      const st = skillState[id];
      if (!st) continue;
      if (id === "ghost") {
        // Pipe-counted skill: never times out. The gap before the next use and the slow recharge only count while no ghost is running.
        st.active = ghostPipesLeft > 0 ? ghostPipesLeft : 0;
        if (ghostPipesLeft <= 0) {
          if (st.cd > 0) { st.cd--; if (st.cd === 0 && ghostCharges > 0 && skillAvailable("ghost")) { st.readyPulse = 1; sfxSkillReady(); } }
          if (ghostCharges < ghostMaxCharges() && state === State.PLAY && ++ghostRegen >= ghostRegenNeed()) {
            ghostRegen = 0; ghostCharges++; ghostPop = 1;
            if (skillAvailable("ghost")) { st.readyPulse = 1; sfxSkillReady(); }
          }
        }
        if (st.readyPulse > 0) st.readyPulse *= 0.93;
        continue;
      }
      if (st.active > 0) {
        st.active--;
        if (st.active === 0) onSkillEnd(id);
      } else if (st.cd > 0) {
        st.cd--;
        if (st.cd === 0 && skillAvailable(id)) {
          st.readyPulse = 1;
          sfxSkillReady();
        }
      }
      if (st.readyPulse > 0) st.readyPulse *= 0.93;
    }
    tickPowerupTimers();
    if (ghostPop > 0) ghostPop = Math.max(0, ghostPop - 0.06);
    // Smooth shrink in/out
    const target = skillActive("shrink") > 0 ? SHRINK_SCALE : 1;
    birdScale += (target - birdScale) * 0.18;
    if (Math.abs(birdScale - target) < 0.005) birdScale = target;
    bird.r = 16 * birdScale;
  }

  function onSkillEnd(id) {
    if (id === "shrink") {
      spawnParticles(bird.x, bird.y, 6, "#d0bfff");
      graceBudget = Math.max(graceBudget, 40); // growing back inside a gap shouldn't insta-kill
      invulnFrames = Math.max(invulnFrames, 10);
    }
  }

  function shieldUp() {
    return skillActive("shield") > 0 || shieldCharges > 0;
  }

  function absorbHitWithShield() {
    if (skillActive("shield") > 0) {
      skillState.shield.active = 0; // cooldown starts now
    } else if (shieldCharges > 0) {
      shieldCharges = 0;
    } else {
      return false;
    }
    invulnFrames = Math.max(invulnFrames, 60);
    graceBudget = 90;
    flash = 0.55;
    screenShake = Math.max(screenShake, 0.6);
    // Satisfying break: shards + ring
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const sp = addParticle(bird.x + Math.cos(a) * 20, bird.y + Math.sin(a) * 20, Math.cos(a) * 4, Math.sin(a) * 4 - 1, 26, 26, i % 2 ? "#e0f2ff" : "#8cc8ff", 2.5);
      if (sp) sp.shard = true;
    }
    rings.push({ x: bird.x, y: bird.y, r: 22, max: 70, life: 1, color: "170,220,255" });
    floaters.push({ x: bird.x, y: bird.y - 30, text: "Shield broke!", life: 50, color: "#bfe4ff" });
    sfxShieldBreak();
    haptic("crash");
    save.stats.shieldBlocks++;
    missionProgress("shield", 1);
    // Keep the bird in bounds after absorbing a floor/ceiling hit
    if (bird.y + bird.r > PLAY_H) { bird.y = PLAY_H - bird.r - 1; bird.vy = FLAP * 0.85; }
    if (bird.y - bird.r < 0) { bird.y = bird.r + 1; bird.vy = 2; }
    return true;
  }

  // —— v1.5 coins ——
  function spawnCoinsForPipe(p, prev) {
    if (coins.length >= MAX_COINS) return;
    const plan = E.planCoins(p, prev, Math.random, spawnEvery * pipeSpeed);
    for (const c of plan) {
      const y = Math.max(16, Math.min(PLAY_H - 16, c.y));
      const o = coinPool.length ? coinPool.pop() : {};
      o.x = p.x + c.dx; o.y = y; o.value = c.value; o.risky = !!c.risky; o.spin = Math.random() * 6; o.pulled = false;
      o.pipe = p; o.dx = c.dx; // rides with its pipe (spawned off-screen right at W+10)
      o.gy = y - p.gapY; // v1.10: offset inside the gap, so coins follow a moving gap
      coins.push(o);
    }
  }
  const coinPool = [];
  function removeCoinAt(i) {
    coinPool.push(coins[i]);
    coins.splice(i, 1);
  }
  function clearCoins() {
    for (let i = 0; i < coins.length; i++) coinPool.push(coins[i]);
    coins.length = 0;
  }

  function collectCoin(c) {
    hitchNote("coin");
    const cp = pk();
    const mult = (E.coinMultiplier(save, save.speciesEquipped) + cp.coinBonus) * E.comboCoinFactor(comboSt.mult);
    runCoinFrac += c.value * mult;
    if (cp.showerChance > 0 && Math.random() < cp.showerChance) {
      // Parrot: Coin Shower (small chance of bonus coins from a pickup)
      runCoinFrac += cp.showerCoins;
      floaters.push({ x: bird.x + 8, y: bird.y - 32, text: "Coin shower! +" + cp.showerCoins, life: 56, color: "#ffe9a0" });
      if (particles.length < maxParticles() - 12) spawnParticles(c.x, c.y, 10, "#ffd24a");
      rings.push({ x: c.x, y: c.y, r: 6, max: 38, life: 1, color: "255,215,90" });
    }
    const n = Math.floor(runCoinFrac);
    runCoinFrac -= n;
    if (n > 0) {
      E.addCoins(save, n);
      runCoins += n;
      missionProgress("coins", n);
      if (c.pulled) missionProgress("magnet", n);
    }
    // Subtle pickup (round 3): no floating "+N" text and no gold burst; just the coin
    // pill pop in the HUD, a soft chime and (big coin only) a few white glints.
    if (c.risky) {
      missionProgress("bigcoin", 1);
      if (particles.length < maxParticles() - 8) spawnParticles(c.x, c.y, 4, "#ffffff");
      sfxBigCoin();
    } else {
      sfxCoin();
    }
    coinPop = 1;
    comboCoinSincePass = true;
    comboEvent("coin");
  }

  let magnetLabelT = -1; // v1.19: frames left on the first-run "Magnet" label (-1 = not decided yet)
  let magnetGlow = 0; // v1.18: brightens the built-in magnet ring while coins are being pulled
  function updateCoins() {
    // v1.19: the coin magnet works only while a collected Magnet pickup is running
    const magnetOn = state === State.PLAY && puMagnetFrames > 0;
    const magPick = puMagnetFrames > 0;
    const magSt = 1;
    const R = magPick ? MAG_PICK_R : 0;
    let pulledNow = 0;
    const coinReach = pk().coinRadius; // Sparrow Wide Beak: pickup radius only (the hit circle is unchanged)
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      // Attached coins track their pipe exactly (pipes move first in update); a magnet-pulled
      // coin detaches and then scrolls on its own.
      if (c.pipe && !c.pulled && pipes.indexOf(c.pipe) >= 0) {
        c.x = c.pipe.x + c.dx;
        if (c.pipe.amp || c.pipe.bAmp) c.y = c.pipe.gapY + (c.gy || 0) * (c.pipe.gap / (c.pipe.gap0 || c.pipe.gap));
      }
      else { c.pipe = null; c.x -= pipeSpeed * ws; }
      c.spin += 0.12;
      if (state === State.PLAY) {
        const dx = bird.x - c.x;
        const dy = bird.y - c.y;
        const d2 = dx * dx + dy * dy;
        if (magnetOn && d2 < R * R && (!c.risky || magPick)) {
          const d = Math.sqrt(d2) || 1;
          const sp = Math.min(d, 3.5 + magSt * 4.5 + (1 - d / R) * (3 + magSt * 4));
          c.x += (dx / d) * sp;
          c.y += (dy / d) * sp;
          c.pulled = true;
          pulledNow++;
          if ((frame + i) % 4 === 0 && particles.length < maxParticles() - 14) spawnParticles(c.x, c.y, 1, "#ffb3d1");
        }
        const cr = ((c.risky ? BIG_COIN_R : COIN_R) + bird.r - 2) * coinReach;
        if (d2 < cr * cr) {
          collectCoin(c);
          removeCoinAt(i);
          continue;
        }
      }
      if (c.x < -20) removeCoinAt(i);
    }
    magnetGlow = pulledNow > 0 ? Math.min(1, magnetGlow + 0.2) : Math.max(0, magnetGlow - 0.04);
  }

  // —— v1.5 missions ——
  let missionsCheckedAt = 0;
  function ensureMissions(force) {
    const now = Date.now();
    if (!force && save.missions && now - missionsCheckedAt < 2000) return save.missions;
    missionsCheckedAt = now;
    const today = todayKey();
    if (!save.missions || save.missions.date !== today) {
      const unlockedSkills = E.SKILLS.filter((sk) => E.isSkillUnlocked(save, sk.id, peakLevel())).map((sk) => sk.id);
      save.missions = E.generateMissions(today, { bestLevel: bestLevel, unlockedSkills: unlockedSkills });
      persist();
    }
    return save.missions;
  }

  function missionProgress(id, amount) {
    const ms = ensureMissions();
    const done = E.progressMission(ms, id, amount);
    if (!done.length) return;
    const daily = ensureDaily();
    const mult = E.streakMultiplier(daily ? daily.streak : 0);
    for (const m of done) {
      const reward = Math.round(m.reward * mult);
      E.addCoins(save, reward);
      m.paid = reward;
      pushBanner("Mission complete!", m.label + "  +" + reward, "#7dffb0", "coin", false, "✓ " + m.label + "  +" + reward);
      sfxMission();
    }
    if (E.missionsLeft(ms) === 0 && !ms.bonusGiven) {
      ms.bonusGiven = true;
      E.addCoins(save, E.ALL_MISSIONS_BONUS);
      const before = daily && daily.completed;
      const d2 = completeDaily(daily, "All missions!");
      pushBanner("All 3 missions done!", "+" + E.ALL_MISSIONS_BONUS + " bonus" + (!before && d2 ? "  ·  🔥 streak " + (d2.streak | 0) : ""), "#ffd24a", "coin", false, "All 3 missions done!  +" + E.ALL_MISSIONS_BONUS);
    }
    persist();
  }

  /**
   * Celebrations. During a run they appear as a small, semi-transparent toast at the top edge
   * (~1.5s) so they never cover the bird or the gaps; the full card is shown on the game-over
   * screen (unlocks / all-missions) or the menu.
   */
  function pushBanner(title, sub, color, icon, priority, short) {
    const b = { title: title, sub: sub || "", color: color || "#ffe566", icon: icon || null, t: 0, life: 150 };
    if (state === State.PLAY) {
      pushToast(short || title, b.color, b.icon, priority);
      if (!/^Mission complete/.test(title)) celebrations.push(b);
      return;
    }
    const q = state === State.OVER ? overCards : banners;
    if (q.length > 4) q.splice(1, 1);
    if (priority && q.length) {
      if (q[0].t < 20) q.unshift(b);
      else q.splice(1, 0, b);
    } else q.push(b);
  }
  const TOAST_LIFE = 90; // 1.5s at 60Hz
  function pushToast(text, color, icon, priority) {
    hitchNote("toast");
    const t = { text: text, color: color || "#ffe566", icon: icon || null, t: 0, life: TOAST_LIFE };
    if (toasts.length > 3) toasts.splice(1, 1);
    if (priority && toasts.length) {
      if (toasts[0].t < 10) toasts.unshift(t);
      else toasts.splice(1, 0, t);
    } else toasts.push(t);
  }
  function toastAlpha() {
    if (!toasts.length || state !== State.PLAY) return 0;
    const t = toasts[0];
    return Math.max(0, Math.min(1, t.t / 8, (t.life - t.t) / 14));
  }
  function drawToast() {
    const a = toastAlpha();
    if (a <= 0) return;
    const t = toasts[0];
    const font = "bold 12px " + FONT_FALLBACK;
    const maxTextW = W - 70;
    if (!t.fit) {
      ctx.save();
      ctx.font = font;
      t.fit = fitText(t.text, maxTextW);
      ctx.restore();
    }
    const txt = t.fit;
    const tw = measureCached(txt, font);
    const w = Math.ceil(tw + 36);
    const h = 22;
    const ts = slot("toast", txt + "|" + t.color + "|" + t.icon, w + 4, h + 4, function () {
      ctx.fillStyle = "rgba(8,20,40,0.62)";
      roundRect(2, 2, w, h, 11);
      ctx.fill();
      ctx.strokeStyle = t.color;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 1.5;
      roundRect(2, 2, w, h, 11);
      ctx.stroke();
      ctx.globalAlpha = 1;
      const ix = 15, iy = 2 + h / 2;
      if (t.icon && t.icon.indexOf("skill:") === 0) drawSkillIcon(t.icon.slice(6), ix, iy, 7, t.color);
      else if (t.icon && t.icon.indexOf("bird:") === 0) { ctx.fillStyle = "#ff9a2a"; ctx.beginPath(); ctx.arc(ix, iy, 5, 0, Math.PI * 2); ctx.fill(); }
      else drawCoinIcon(ix, iy, 6.5);
      ctx.font = font;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = t.color;
      ctx.fillText(txt, 26, iy + 0.5);
    });
    ctx.globalAlpha = a * 0.92;
    drawSlot(ts, (W - ts.w) / 2, 3 - (1 - Math.min(1, t.t / 8)) * 6);
    ctx.globalAlpha = 1;
  }

  /** Celebrate skills/birds that became available (level progress or purchases). */
  function checkNewUnlocks(quiet) {
    let changed = false;
    for (const sk of E.SKILLS) {
      if (!save.skillsSeen[sk.id] && E.isSkillUnlocked(save, sk.id, peakLevel())) {
        save.skillsSeen[sk.id] = true;
        changed = true;
        if (!quiet) {
          pushBanner("New skill unlocked!", sk.name + " — " + sk.desc + (finePointer ? "  [" + sk.key + "]" : ""), sk.color, "skill:" + sk.id, true, "New skill: " + sk.name + (finePointer ? "  [" + sk.key + "]" : "  — tap its button below"));
          sfxMilestone();
          if (state === State.PLAY) spawnParticles(W / 2, PLAY_H + 20, 16, sk.color);
        }
      }
    }
    for (const sp of E.SPECIES) {
      if (sp.trophyLevel > 0 && !save.speciesSeen[sp.id] && E.isSpeciesOwned(save, sp.id, peakLevel())) {
        save.speciesSeen[sp.id] = true;
        changed = true;
        if (!quiet) pushBanner("New bird unlocked!", sp.name + " — " + sp.perk, "#ffb4e0", "bird:" + sp.id, false, "New bird: " + sp.name);
      }
    }
    if (changed) { hitchNote("unlock"); persist(); }
  }

  // —— Levels & trophies (scalable to 10,000) ——
  const MAX_LEVEL = 10000;
  // Named landmark trophies (shelf highlights)
  const LANDMARKS = [1, 10, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
  const LANDMARK_NAMES = {
    1: "First Flap",
    10: "Tenfold Soar",
    50: "Halfway Horizon",
    100: "Century Crown",
    250: "Sky Voyager",
    500: "Endurance Emblem",
    1000: "Millennium Wing",
    2500: "Storm Rider Seal",
    5000: "Aether Titan",
    10000: "Sky Master Eternal",
  };
  // Persist only highest reached (unlocks 1..highest). Tiny localStorage payload.
  let highestUnlocked = loadHighestUnlocked();
  // Seed best-level from trophy peak for players upgrading from older builds
  if (highestUnlocked > bestLevel) {
    bestLevel = highestUnlocked;
    try { lsSet(BEST_LEVEL_KEY, String(bestLevel)); } catch (_) {}
  }

  function loadHighestUnlocked() {
    try {
      const raw = lsGet(TROPHY_KEY);
      if (!raw) return 0;
      const data = JSON.parse(raw);
      if (typeof data === "number") {
        return Math.max(0, Math.min(MAX_LEVEL, data | 0));
      }
      if (data && typeof data === "object" && !Array.isArray(data)) {
        const h = parseInt(data.h != null ? data.h : data.highest, 10);
        if (Number.isFinite(h)) return Math.max(0, Math.min(MAX_LEVEL, h));
      }
      // Legacy: array of unlocked level ids → migrate to highest
      if (Array.isArray(data)) {
        let h = 0;
        for (const n of data) {
          const v = parseInt(n, 10);
          if (v > h) h = v;
        }
        h = Math.max(0, Math.min(MAX_LEVEL, h));
        lsSet(TROPHY_KEY, JSON.stringify({ h }));
        return h;
      }
      return 0;
    } catch (_) {
      return 0;
    }
  }

  function saveHighestUnlocked() {
    lsSet(TROPHY_KEY, JSON.stringify({ h: highestUnlocked }));
  }

  function trophyNameFor(lv) {
    if (LANDMARK_NAMES[lv]) return LANDMARK_NAMES[lv];
    const prefixes = [
      "Cloud", "Sky", "Wind", "Dawn", "Sun", "Mist", "Peak", "Breeze",
      "Nest", "Wing", "Feather", "Horizon", "Soar", "Zephyr", "Aether",
      "Summit", "Drift", "Aurora", "Ember", "Crystal",
    ];
    const suffixes = [
      "Hop", "Badge", "Medal", "Crest", "Star", "Gem", "Seal", "Mark",
      "Token", "Emblem", "Charm", "Shard", "Spark", "Ring", "Orb",
    ];
    const p = prefixes[(lv - 1) % prefixes.length];
    const s = suffixes[Math.floor((lv - 1) / prefixes.length) % suffixes.length];
    return p + " " + s;
  }

  function isShelfLevel(lv) {
    if (lv < 1 || lv > MAX_LEVEL) return false;
    if (LANDMARKS.indexOf(lv) >= 0) return true;
    if (lv === highestUnlocked && lv > 0) return true;
    // Milestone cadence: every 10 early, every 50 mid, every 100 late
    if (lv <= 100) return lv % 10 === 0;
    if (lv <= 1000) return lv % 50 === 0;
    return lv % 100 === 0;
  }

  /** Build finite shelf list (milestones + landmarks + peak) — never 10k rows. */
  function buildShelfLevels() {
    const set = {};
    for (const lv of LANDMARKS) set[lv] = true;
    if (highestUnlocked > 0) set[highestUnlocked] = true;
    // Include milestones up to max(highest, 100) so locked upcoming goals show
    const showTo = Math.min(MAX_LEVEL, Math.max(highestUnlocked, 100));
    for (let lv = 10; lv <= showTo; lv++) {
      if (isShelfLevel(lv)) set[lv] = true;
    }
    // A few locked lookahead milestones past peak
    const lookahead = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
    for (const lv of lookahead) {
      if (lv > highestUnlocked && lv <= MAX_LEVEL) set[lv] = true;
    }
    return Object.keys(set).map(Number).sort((a, b) => a - b);
  }

  let shelfLevels = buildShelfLevels();
  let shelfDirty = false;
  function getShelfLevels() {
    if (shelfDirty) { shelfDirty = false; shelfLevels = buildShelfLevels(); }
    return shelfLevels;
  }

  function unlockTrophy(lv) {
    if (lv < 1 || lv > MAX_LEVEL) return false;
    if (lv <= highestUnlocked) return false;
    const prev = highestUnlocked;
    highestUnlocked = lv;
    saveHighestUnlocked();
    shelfDirty = true; // rebuilt lazily when the trophy shelf is opened
    // Celebrate landmarks & shelf milestones; always toast peak
    const named = LANDMARK_NAMES[lv] || (isShelfLevel(lv) ? trophyNameFor(lv) : null);
    if (named || lv === highestUnlocked) {
      trophyFlash = 1;
      trophyFlashText = "🏆 " + (named || ("Peak Level " + lv));
      sfxTrophy();
    }
    // Also toast if we crossed a landmark between prev+1..lv (continue / big jumps)
    for (const mark of LANDMARKS) {
      if (mark > prev && mark <= lv && mark !== lv) {
        trophyFlash = 1;
        trophyFlashText = "🏆 " + LANDMARK_NAMES[mark];
        sfxTrophy();
      }
    }
    return true;
  }

  function trophyCount() {
    return highestUnlocked;
  }

  function formatLevel(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  // —— Player ——
  const bird = {
    x: 90,
    y: PLAY_H / 2,
    r: 16,
    vy: 0,
    rot: 0,
    wing: 0,
  };

  const GRAVITY = 0.38;
  const FLAP = -7.2;
  const MAX_FALL = 10;

  // —— Levels (1–10000) ——
  // Level = min(MAX_LEVEL, 1 + floor(score / PIPES_PER_LEVEL))
  // With PIPES_PER_LEVEL=5: score 0–4 → L1 … L10000 from score 49995+.
  const PIPES_PER_LEVEL = 5;
  const BASE_SPEED = 2.4;
  const MAX_SPEED = 4.15;       // soft-capped via difficultyT()
  const BASE_GAP = 148;
  const MIN_GAP = 102;          // never tighter — endurance after mid-game
  const BASE_SPAWN = 95;
  const MIN_SPAWN = 70;
  const BASE_GAP_MARGIN = 40;
  const MAX_GAP_MARGIN = 58;
  // v1.12 (Danny: "a little easier to get further"): from level 20 on, gaps are slightly wider and the speed ramp is gentler.
  // The ease fades in over 20 levels (0 at level 20 → full at level 40), so levels 1-20 play exactly as before.
  // Full effect (level 40+): gap +8 px (~+6%), speed x0.96, +3 frames between pipes. Bosses still apply their own x1.22 on top.
  const EASE_FROM_LEVEL = 20, EASE_RAMP_LEVELS = 20, EASE_GAP_PX = 8, EASE_SPEED_MUL = 0.96, EASE_SPAWN_FRAMES = 3;
  function midEase(lv) {
    const t = Math.max(0, Math.min(1, ((lv | 0) - EASE_FROM_LEVEL) / EASE_RAMP_LEVELS));
    return { t: t, gap: EASE_GAP_PX * t, speedMul: 1 - (1 - EASE_SPEED_MUL) * t, spawn: EASE_SPAWN_FRAMES * t };
  }
  // Entity caps (mobile-safe — never unbounded)
  const MAX_TREES = 14;
  const MAX_ANIMALS = 8;
  const MAX_HUNTERS = 3;
  const MAX_PROJECTILES = 8;
  const MAX_WATERFALLS = 4;
  const NEAR_MISS_PX = 14;

  // —— Pipes ——
  const pipes = [];
  const PIPE_W = 58;
  let pipeGap = BASE_GAP;
  let pipeSpeed = BASE_SPEED;
  let spawnEvery = BASE_SPAWN;
  let gapMargin = BASE_GAP_MARGIN;
  let nextSpawn = 0;
  let gateSerial = 0;
  let runGate = 0;
  let recoveryExtra = 0;

  // —— Extras world entities ——
  const trees = [];       // bg/fg scenery + trunk obstacles
  const animals = [];     // flavor critters + mild hazards
  const hunters = [];     // hostile bird hunters
  const projectiles = []; // nets / shots from hunters
  const waterfalls = [];  // scenic + optional mild push
  let nextTree = 0;
  let nextAnimal = 0;
  let nextHunter = 0;
  let nextWaterfall = 0;

  // —— Parallax ——
  let groundX = 0;
  let cloudX = 0;
  let hillX = 0;
  let lastScrollMul = 0.35;
  const GROUND_TILE = 480; // multiple of the 48px stripe; pebbles repeat every 480px
  const HILL_TILE = 140;

  // —— Audio ——
  let audioCtx = null;
  let musicGain = null;
  let musicDesired = 0;
  let musicOn = false;
  let musicStep = 0;
  let nextNoteTime = 0;
  let musicTimerId = null;

  const MUSIC_VOL = 0.12;
  const MUSIC_SOFT = 0.04;
  const MUSIC_BPM = 132;
  const MUSIC_STEP = 60 / MUSIC_BPM / 4;
  const LOOKAHEAD_MS = 25;
  const SCHEDULE_AHEAD = 0.2;

  const N = {
    r: 0,
    C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94,
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0,
  };

  const LEAD = [
    N.E4, N.G4, N.C5, N.G4, N.E4, N.r, N.G4, N.r,
    N.A4, N.C5, N.E5, N.C5, N.A4, N.r, N.G4, N.r,
    N.F4, N.A4, N.C5, N.A4, N.F4, N.r, N.A4, N.r,
    N.G4, N.B4, N.D5, N.B4, N.G4, N.r, N.C5, N.r,
  ];
  const BASS = [
    N.C3, N.r, N.C3, N.r, N.C3, N.r, N.G3, N.r,
    N.A3, N.r, N.A3, N.r, N.A3, N.r, N.E3, N.r,
    N.F3, N.r, N.F3, N.r, N.F3, N.r, N.C3, N.r,
    N.G3, N.r, N.G3, N.r, N.G3, N.D3, N.G3, N.r,
  ];
  const ARP = [
    N.C5, N.r, N.E5, N.r, N.G5, N.r, N.E5, N.r,
    N.A4, N.r, N.C5, N.r, N.E5, N.r, N.C5, N.r,
    N.F4, N.r, N.A4, N.r, N.C5, N.r, N.A4, N.r,
    N.G4, N.r, N.B4, N.r, N.D5, N.r, N.C5, N.r,
  ];

  function ensureAudio() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        musicGain = audioCtx.createGain();
        musicGain.gain.value = 0;
        musicGain.connect(audioCtx.destination);
        sfxOut(); // create the shared SFX bus up front
        // Chrome builds each oscillator type's band-limited wavetable lazily on first use
        // (measured ~2ms real / 12ms at 6x for the first sawtooth mid-run). Warm them silently.
        try {
          const silent = audioCtx.createGain();
          silent.gain.value = 0;
          silent.connect(audioCtx.destination);
          for (const ty of ["sine", "square", "triangle", "sawtooth"]) {
            const o = audioCtx.createOscillator();
            o.type = ty;
            o.connect(silent);
            o.start();
            o.stop(audioCtx.currentTime + 0.05);
          }
        } catch (_) {}
      } catch (_) {
        audioCtx = null;
        musicGain = null;
      }
    }
    if (!audioCtx) return Promise.resolve();
    if (audioCtx.state === "suspended") {
      return audioCtx.resume().then(() => {
        if (musicOn && nextNoteTime < audioCtx.currentTime) {
          nextNoteTime = audioCtx.currentTime + 0.02;
        }
      }).catch(() => {});
    }
    return Promise.resolve();
  }

  function applyMusicGain(now) {
    if (!musicGain || !audioCtx) return;
    const t = now != null ? now : audioCtx.currentTime;
    const target = muted || !musicOn ? 0 : musicDesired;
    try {
      musicGain.gain.cancelScheduledValues(t);
      musicGain.gain.setValueAtTime(musicGain.gain.value, t);
      musicGain.gain.linearRampToValueAtTime(target, t + 0.12);
    } catch (_) {
      musicGain.gain.value = target;
    }
  }

  function playTone(freq, when, dur, type, vol, dest) {
    if (!audioCtx || !freq) return;
    try {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, when);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(vol, when + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      osc.connect(g);
      g.connect(dest);
      osc.start(when);
      osc.stop(when + dur + 0.03);
    } catch (_) {}
  }

  function scheduleMusicNote(step, when) {
    if (!audioCtx || !musicGain) return;
    const i = step % LEAD.length;
    const lead = LEAD[i];
    const bass = BASS[i];
    const arp = ARP[i];
    if (lead) playTone(lead, when, MUSIC_STEP * 0.85, "square", 0.55, musicGain);
    if (bass) playTone(bass, when, MUSIC_STEP * 1.05, "triangle", 0.7, musicGain);
    if (arp) playTone(arp, when, MUSIC_STEP * 0.55, "triangle", 0.28, musicGain);
    if (i % 8 === 0) {
      playTone(90, when, MUSIC_STEP * 0.45, "sine", 0.45, musicGain);
    } else if (i % 4 === 0) {
      playTone(120, when, MUSIC_STEP * 0.3, "sine", 0.22, musicGain);
    }
  }

  function musicSchedulerTick() {
    if (!audioCtx || !musicOn) return;
    const now = audioCtx.currentTime;
    while (nextNoteTime < now + SCHEDULE_AHEAD) {
      if (!muted) scheduleWorldNote(musicStep, nextNoteTime);
      musicStep++;
      nextNoteTime += musicStepDur;
    }
  }

  function startMusicLoop(restartPattern) {
    ensureAudio().then(() => {
      if (!audioCtx || !musicGain) return;
      musicOn = true;
      musicDesired = MUSIC_VOL;
      if (restartPattern || nextNoteTime === 0) {
        musicStep = 0;
        nextNoteTime = audioCtx.currentTime + 0.05;
      } else if (nextNoteTime < audioCtx.currentTime) {
        nextNoteTime = audioCtx.currentTime + 0.02;
      }
      applyMusicGain();
      if (musicTimerId == null) {
        musicTimerId = setInterval(musicSchedulerTick, LOOKAHEAD_MS);
      }
      musicSchedulerTick();
    });
  }

  function softenMusic() {
    if (!musicOn) return;
    musicDesired = MUSIC_SOFT;
    applyMusicGain();
  }

  // SFX go through one shared bus; follow-up notes are scheduled on the audio clock (delay in
  // seconds) instead of setTimeout, so no extra main-thread tasks fire mid-frame.
  let sfxBus = null;
  function sfxOut() {
    if (!sfxBus && audioCtx) {
      try {
        sfxBus = audioCtx.createGain();
        sfxBus.gain.value = 1;
        sfxBus.connect(audioCtx.destination);
      } catch (_) { sfxBus = null; }
    }
    return sfxBus || audioCtx.destination;
  }
  let sfxThisFrame = 0;
  const SFX_NOTES_PER_FRAME = 7;
  function beep(freq, dur, type, gain, delay) {
    if (muted || !audioCtx) return;
    if (audioCtx.state === "closed") return;
    // When several jingles land on the same frame (level-up + trophy + mission), keep the first
    // few notes only: fewer node allocations in one frame and less audio clutter.
    if (sfxThisFrame >= SFX_NOTES_PER_FRAME) return;
    sfxThisFrame++;
    try {
      const t0 = audioCtx.currentTime + (delay || 0);
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = type || "square";
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(gain ?? 0.06, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(g);
      g.connect(sfxOut());
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch (_) {}
  }

  function sfxFlap() {
    beep(540, 0.055, "square", 0.055);
    beep(720, 0.04, "square", 0.03, (35) / 1000);
  }
  function sfxScore() {
    beep(700, 0.07, "triangle", 0.08);
    beep(920, 0.09, "triangle", 0.07, (55) / 1000);
    beep(1100, 0.06, "sine", 0.035, (110) / 1000);
  }
  function sfxHit() {
    beep(140, 0.2, "sawtooth", 0.1);
    beep(90, 0.16, "sawtooth", 0.06, (60) / 1000);
  }
  function sfxEvolveFanfare() {
    beep(523, 0.08, "triangle", 0.07);
    beep(659, 0.09, "triangle", 0.07, (70) / 1000);
    beep(784, 0.1, "triangle", 0.075, (140) / 1000);
    beep(1046, 0.16, "sine", 0.06, (230) / 1000);
  }
  function sfxLevel() {
    beep(520, 0.06, "triangle", 0.05);
    beep(720, 0.07, "triangle", 0.055, (55) / 1000);
    beep(920, 0.09, "triangle", 0.05, (110) / 1000);
  }
  function sfxTrophy() {
    beep(440, 0.07, "triangle", 0.06);
    beep(554, 0.08, "triangle", 0.06, (60) / 1000);
    beep(659, 0.12, "triangle", 0.07, (130) / 1000);
  }
  function sfxMilestone() {
    beep(523, 0.07, "triangle", 0.06);
    beep(659, 0.08, "triangle", 0.065, (70) / 1000);
    beep(784, 0.1, "triangle", 0.07, (140) / 1000);
    beep(1046, 0.14, "sine", 0.05, (220) / 1000);
  }
  function sfxNearMiss() {
    beep(980, 0.04, "sine", 0.035);
    beep(1320, 0.05, "sine", 0.03, (40) / 1000);
  }
  function sfxStreak() {
    beep(700, 0.05, "triangle", 0.04);
    beep(940, 0.07, "triangle", 0.045, (50) / 1000);
  }
  function sfxNewRecord() {
    beep(392, 0.08, "triangle", 0.06);
    beep(523, 0.08, "triangle", 0.06, (80) / 1000);
    beep(659, 0.09, "triangle", 0.065, (160) / 1000);
    beep(784, 0.12, "triangle", 0.07, (250) / 1000);
    beep(1046, 0.16, "sine", 0.055, (360) / 1000);
  }

  function sweep(f0, f1, dur, type, gain, delay) {
    if (muted || !audioCtx) return;
    if (audioCtx.state === "closed") return;
    // When several jingles land on the same frame (level-up + trophy + mission), keep the first
    // few notes only: fewer node allocations in one frame and less audio clutter.
    if (sfxThisFrame >= SFX_NOTES_PER_FRAME) return;
    sfxThisFrame++;
    try {
      const t0 = audioCtx.currentTime + (delay || 0);
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = type || "sine";
      osc.frequency.setValueAtTime(f0, t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
      g.gain.setValueAtTime(gain ?? 0.05, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(g);
      g.connect(sfxOut());
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch (_) {}
  }
  let lastCoinSfx = 0;
  let coinPitch = 0;
  function sfxCoin() {
    const now = performance.now();
    coinPitch = now - lastCoinSfx < 400 ? Math.min(6, coinPitch + 1) : 0; // rising chain
    lastCoinSfx = now;
    const f = 1180 * Math.pow(1.06, coinPitch);
    beep(f, 0.05, "square", 0.03);
    beep(f * 1.5, 0.07, "triangle", 0.035, (40) / 1000);
  }
  function sfxBigCoin() {
    beep(990, 0.06, "triangle", 0.06);
    beep(1320, 0.07, "triangle", 0.06, (60) / 1000);
    beep(1760, 0.12, "sine", 0.05, (120) / 1000);
  }
  function sfxDash() { sweep(300, 1400, 0.16, "sawtooth", 0.05); sweep(1200, 500, 0.12, "triangle", 0.03, (90) / 1000); }
  function sfxShieldUp() { sweep(400, 1100, 0.2, "triangle", 0.05); }
  function sfxShieldBreak() {
    for (let i = 0; i < 5; i++) beep(1400 + Math.random() * 1800, 0.06, "square", 0.03, (i * 28) / 1000);
    sweep(600, 120, 0.25, "sawtooth", 0.04);
  }
  function sfxShrink() { sweep(900, 1600, 0.14, "sine", 0.05); }
  function sfxMagnet() { sweep(200, 520, 0.22, "square", 0.03); }
  function sfxSkillReady() { beep(1560, 0.05, "sine", 0.025); }
  function sfxMission() {
    beep(660, 0.08, "triangle", 0.06);
    beep(880, 0.08, "triangle", 0.06, (80) / 1000);
    beep(1320, 0.14, "sine", 0.05, (160) / 1000);
  }
  function sfxBuy() { beep(880, 0.06, "triangle", 0.06); beep(1320, 0.1, "triangle", 0.06, (70) / 1000); }
  function sfxDeny() { beep(160, 0.12, "square", 0.04); }

  // —— Mute / Extras UI ——
  function updateMuteUI() {
    muteBtn.textContent = muted ? "🔇" : "🔊";
    muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
    muteBtn.title = muted ? "Unmute" : "Mute";
    if (muteHint) {
      muteHint.hidden = !muted;
      muteHint.textContent = "Muted";
    }
  }

  function updateExtrasUI() {
    if (!extrasBtn) return;
    extrasBtn.textContent = extrasOn ? "✨" : "💤";
    extrasBtn.setAttribute("aria-pressed", extrasOn ? "true" : "false");
    extrasBtn.title = extrasOn ? "Extras on (tap to turn off)" : "Extras off (tap to turn on)";
    if (extrasHint) {
      extrasHint.hidden = extrasOn;
      extrasHint.textContent = "Extras off";
    }
  }

  updateMuteUI();
  updateExtrasUI();

  muteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    muted = !muted;
    lsSet(MUTE_KEY, muted ? "1" : "0");
    updateMuteUI();
    if (!muted) {
      ensureAudio().then(() => {
        applyMusicGain();
        if (musicOn) musicSchedulerTick();
      });
    } else {
      applyMusicGain();
    }
  });

  if (extrasBtn) {
    extrasBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      extrasOn = !extrasOn;
      lsSet(EXTRAS_KEY, extrasOn ? "1" : "0");
      updateExtrasUI();
      if (!extrasOn) {
        // Clear hazardous extras immediately; keep light scenery optional
        hunters.length = 0;
        projectiles.length = 0;
        for (let i = trees.length - 1; i >= 0; i--) {
          if (trees[i].hazard) trees.splice(i, 1);
        }
        for (let i = animals.length - 1; i >= 0; i--) {
          if (animals[i].hazard) animals.splice(i, 1);
        }
        for (let i = waterfalls.length - 1; i >= 0; i--) {
          if (waterfalls[i].push) waterfalls[i].push = 0;
        }
      }
    });
  }

  // —— Levels & difficulty ——
  // Soft-cap curve: most speed/gap ramp happens early→mid, then asymptotes.
  // t(L) = 1 - exp(-k*(L-1)), k=0.006 → ~47% @100, ~70% @200, ~91% @400,
  // ~95% @500, ~99.8% @1000. Levels ~500–10000 are endurance/score, not tighter gaps.
  const DIFF_K = 0.006;

  function levelFromScore(s) {
    return Math.min(MAX_LEVEL, 1 + Math.floor(s / PIPES_PER_LEVEL));
  }

  function difficultyT(lv) {
    const x = Math.max(0, Math.min(lv, MAX_LEVEL) - 1);
    return 1 - Math.exp(-DIFF_K * x);
  }

  function applyDifficulty() {
    const t = difficultyT(level);
    let speed = BASE_SPEED + (MAX_SPEED - BASE_SPEED) * t;
    let gap = BASE_GAP + (MIN_GAP - BASE_GAP) * t;
    let spawn = Math.round(BASE_SPAWN + (MIN_SPAWN - BASE_SPAWN) * t);
    let margin = BASE_GAP_MARGIN + (MAX_GAP_MARGIN - BASE_GAP_MARGIN) * t;
    // Soften first ~20 pipes (and safe-start assist): wider gaps, slightly slower
    const earlyPipes = Math.max(0, Math.min(20, score));
    let early = 1 - earlyPipes / 20; // 1 at start → 0 after 20
    if (safeStartActive && safeStartFrames > 0) {
      early = Math.max(early, Math.min(1, safeStartFrames / 20) * 0.85);
    }
    if (early > 0.02) {
      speed = speed * (1 - 0.18 * early);
      gap = gap + 28 * early;
      spawn = Math.round(spawn + 12 * early);
      margin = Math.max(28, margin - 8 * early);
    }
    // v1.12: gentler mid/late game (see EASE_* above); levels 1-20 untouched.
    const ease = midEase(level);
    if (ease.t > 0) {
      speed *= ease.speedMul;
      gap += ease.gap;
      spawn = Math.round(spawn + ease.spawn);
    }
    // v1.10 boss level: a short, harder stretch (tighter gaps; never below 100 px).
    // v1.11 (Danny): boss levels are noticeably faster — ×1.22 scroll speed (was ×1.08).
    if (isBossLevel(level)) {
      speed *= BOSS_SPEED_MUL;
      gap = Math.max(100, gap - 10);
      spawn = Math.max(MIN_SPAWN - 4, spawn - 4);
    }
    pipeSpeed = speed;
    pipeGap = gap;
    spawnEvery = spawn;
    gapMargin = margin;
  }

  function updateScoreMult() {
    // 1.0 → 2.5 based on clean streak (no near-miss)
    scoreMult = Math.min(2.5, 1 + Math.floor(cleanStreak / 3) * 0.25);
  }

  // v1.17: reaching a stage's level evolves the bird for good: new shape, a free upgrade and a short on-screen moment
  let evoMoment = null;
  function checkEvolution() {
    const got = E.evoSync(save, Math.max(level, peakLevel()));
    const form = E.evoStageForLevel(level);
    if (form > runEvo) { runEvo = form; palMemo.r = null; if (!evoMoment) evoMoment = { t: 140, stage: form, name: E.EVO_NAMES[form], rewards: [], pal: null }; }
    const mastered = E.masterySync(save, Math.max(level, peakLevel()));
    if (mastered.length && state === State.PLAY) showBigBanner(mastered[mastered.length - 1].name, mastered[mastered.length - 1].text, "#ffe08a");
    if (!got.length) return;
    persist();
    palMemo.r = null;
    refreshTailPower();
    const last = got[got.length - 1];
    evoMoment = { t: 200, stage: last.stage, name: last.name, rewards: got.map(function (r) { return r.reward; }).filter(Boolean), pal: null };
    sfxMilestone();
    sfxEvolveFanfare();
    haptic("evolve");
    screenShake = Math.max(screenShake, 0.45);
    spawnParticles(bird.x, bird.y, 16, "#ffffff");
    spawnParticles(bird.x, bird.y - 6, 12, "#bfe8ff");
    spawnParticles(bird.x + 8, bird.y + 4, 8, "#d0bfff");
  }
  function onScoreChanged(prevScore) {
    const prev = level;
    level = levelFromScore(score);
    applyDifficulty();
    if (level > prev) {
      hitchNote("levelup");
      levelFlash = 1;
      levelFlashText = "Level " + formatLevel(level) + " / " + formatLevel(MAX_LEVEL);
      sfxLevel();
      unlockTrophy(level);
      checkEvolution();
      missionProgress("level", level);
      checkNewUnlocks(false);
      const newCheckpoint = level % E.CHECKPOINT_EVERY === 0 && level > runCheckpoint;
      if (newCheckpoint) runCheckpoint = level;
      saveRunNow("level");
      if (level % 1000 === 0) {
        milestoneFlash = 1.2;
        milestoneFlashText = "✦ " + formatLevel(level) + " MILESTONE ✦";
        sfxMilestone();
      } else if (level % 100 === 0) {
        milestoneFlash = 1.1;
        milestoneFlashText = "★ Level " + formatLevel(level) + "! ★";
        sfxMilestone();
      } else if (newCheckpoint) {
        milestoneFlash = 1;
        milestoneFlashText = "⚑ Checkpoint saved · Level " + formatLevel(level);
        sfxLevel();
      }
      if (newCheckpoint && level % 100 === 0) milestoneFlashText += "  ⚑";
      onLevelUp110(prev, level);
    }
  }

  // Pooled particles: no per-spawn allocations, swap-remove on death.
  const particlePool = [];
  function addParticle(x, y, vx, vy, life, max, color, r) {
    if (particles.length >= maxParticles()) return null;
    const p = particlePool.length ? particlePool.pop() : {};
    p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = max; p.color = color; p.r = r;
    p.star = false; p.ring = false; p.shard = false;
    particles.push(p);
    return p;
  }
  function clearParticles() {
    for (let i = 0; i < particles.length; i++) particlePool.push(particles[i]);
    particles.length = 0;
  }
  const RAINBOW = [];
  for (let h = 0; h < 360; h += 10) RAINBOW.push("hsl(" + h + ",90%,62%)");

  function spawnParticles(x, y, n, color) {
    if (quality >= 2) n = Math.ceil(n / 2);
    const count = Math.min(n, maxParticles() - particles.length);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 3.5;
      addParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 1, 18 + Math.random() * 16, 34, color || "#ffffff", 1.5 + Math.random() * 2.5);
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.star || p.ring ? 0 : 0.12;
      p.life--;
      if (p.life <= 0) {
        const last = particles.pop();
        if (last !== p) particles[i] = last;
        particlePool.push(p);
      }
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      if (p.ring) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      ctx.fillStyle = p.color;
      if (p.star || p.shard) {
        const r = p.r * 1.4;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - r);
        ctx.lineTo(p.x + r * 0.45, p.y);
        ctx.lineTo(p.x, p.y + r);
        ctx.lineTo(p.x - r * 0.45, p.y);
        ctx.closePath();
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Clearance to the nearest live obstacle when scoring a gate; small = near-miss. */
  function pipeClearance(p) {
    if (!p.bits || !p.bits.length) return 1e5;
    const b = birdCircle();
    let best = 1e5;
    for (let i = 0; i < p.bits.length; i++) {
      const bit = p.bits[i];
      if (!bit || bit.gone) continue;
      const q = window.SkyHopObstacles.bitXY(p.x, p.gapY, bit, frame);
      const dx = b.x - q.x, dy = b.y - q.y;
      const d = Math.sqrt(dx * dx + dy * dy) - bit.r - b.r;
      if (d < best) best = d;
    }
    return best;
  }

  /** v1.9 Ghost countdown: one tick per pipe passed; at 0 the bird is solid again. */
  function onGhostPipe() {
    if (ghostPipesLeft <= 0) return;
    ghostPipesLeft--;
    ghostPop = 1;
    if (ghostPipesLeft > 0) {
      beep(520 + (GHOST_PIPES - ghostPipesLeft) * 60, 0.06, "sine", 0.03);
      return;
    }
    // Ending: any pipe the bird still overlaps stays passable, so it can't die halfway out of it.
    for (const q of pipes) {
      if (q.x - bird.r < bird.x && q.x + q.w + bird.r > bird.x) q.ghostPass = true;
    }
    rings.push({ x: bird.x, y: bird.y, r: 30, max: 22, life: 1, color: "210,225,255", shrink: true });
    spawnParticles(bird.x, bird.y, 8, "#e6ecff");

  }

  function onPipeScored(p) {
    const clearance = pipeClearance(p);
    const nearMiss = !p.ghosted && clearance < NEAR_MISS_PX;
    pipeStreak++;
    if (nearMiss) {
      cleanStreak = 0;
      nearMissFlash = 1;
      screenShake = Math.max(screenShake, 0.7);
      spawnParticles(bird.x + 10, bird.y, 10, "#ffffff");
      spawnParticles(bird.x, bird.y - 8, 6, "#9fe8ff");
      sfxNearMiss();
      haptic("near");
      missionProgress("near", 1);
    } else {
      cleanStreak++;
      if (cleanStreak > 0 && cleanStreak % 3 === 0) {
        multPop = 1;
        sfxStreak();
        spawnParticles(W / 2, 100, 10, "#a0ffd0");
      }
    }
    // v1.12 combo meter: edge-hugging passes (and coins) build it; two comfortable middle passes in a row break it.
    if (!p.ghosted && !puMode && state === State.PLAY) {
      const cev = nearMiss ? "close" : (clearance < E.COMBO_EDGE_PX ? "edge" : (comboCoinSincePass ? null : "plain"));
      if (cev) comboEvent(cev);
      if (nearMiss) soCloseBonus();
    }
    comboCoinSincePass = false;
    updateScoreMult();
    pipesPassed++;
    missionProgress("pipes", 1);
    if (cleanStreak > runMaxStreak) {
      runMaxStreak = cleanStreak;
      missionProgress("streak", runMaxStreak);
    }
    // Base +1 always (level formula). Bonus points from clean streak (capped).
    let add = 1;
    if (scoreMult >= 2) add += 1;
    if (scoreMult >= 2.5) add += 1;
    if (nearMiss) add += 0; // sparkle only — no streak bonus
    if (p.beatRole === "challenge" && nearMiss && E.hasMastery(save, "glance")) recoveryExtra = Math.max(recoveryExtra, 2);
    if (p.beatRole === "reward" && !nearMiss && state === State.PLAY) {
      const bonus = E.hasMastery(save, "keen") ? 8 : 3;
      const gained = E.addCoins(save, bonus);
      runCoins += gained;
      floaters.push({ x: bird.x, y: bird.y - 28, text: "Clean gate +" + gained, life: 50, color: "#ffe08a" });
    }
    const prevScore = score;
    score += add;
    scorePop = 1.15;
    onScoreChanged(prevScore);
    sfxScore();
    haptic("score");
    if (safeStartActive && safeStartFrames > 0) {
      safeStartFrames--;
      if (safeStartFrames <= 0) safeStartActive = false;
      applyDifficulty();
    }
  }

  // ======================================================================================
  // —— v1.10: worlds every 25 levels, moving pipes (50+), boss levels (every 10), power-ups ——
  // All art and music below is drawn / synthesized in code (original; see AUDIO-LICENSE.md).
  // ======================================================================================
  const WORLD_EVERY = 20; // v1.11: a new world every 20 levels (1-20, 21-40, ...)
  const BOSS_EVERY = 10;
  const BOSS_SPEED_MUL = 1.22;
  const ROMAN = ["", " II", " III", " IV", " V", " VI", " VII", " VIII", " IX", " X"];
  // pipe: [body gradient 4 stops], cap, capEdge, deco kind. far: background silhouette layer.
  const WORLDS = [
    { id: "day", name: "Day Sky", sky: ["#5eb8ff", "#8fd4ff", "#c8ecff"], cloud: "rgba(255,255,255,0.85)",
      far: null, ground: null, tree: null, song: 0, theme: "#6ec6ff",
      // v1.11 (Danny + Legal): world 1 uses the original green pipes again, drawn as PLAIN tubes — the top is a flat
      // band exactly as wide as the tube (no wide Mario-style rim / lip).
      pipe: { body: ["#3f9a2e", "#8ee05a", "#5cbf3c", "#2d7a22"], cap: "#6fd04a", edge: "rgba(20,70,15,0.85)", deco: "tube" } },
    { id: "desert", name: "Sunset Desert", sky: ["#ff8a5c", "#ffb36b", "#ffe0a3"], cloud: "rgba(255,226,200,0.7)",
      sun: { x: 300, y: 150, r: 46, c: "rgba(255,240,170,0.95)", glow: "rgba(255,200,120,0.35)" },
      far: { kind: "dunes", c1: "#e8a25a", c2: "#c97a3c", h: 90 },
      ground: { base: "#e2b26a", top: ["#f3cf8a", "#d9a45a"], dots: "rgba(150,90,30,0.28)", stripe: "rgba(120,60,10,0.07)" },
      pipe: { body: ["#2f7d3a", "#7ad06f", "#4aa650", "#24602d"], cap: "#6cc467", edge: "rgba(15,60,25,0.8)", deco: "cactus" },
      tree: { trunk: "#7a5a2a", canopy: "#7f9a3c" }, song: 1, theme: "#ff9a5c" },
    { id: "snow", name: "Snowy Peaks", sky: ["#8fb8e8", "#c4dcf5", "#eef6ff"], cloud: "rgba(255,255,255,0.9)",
      far: { kind: "peaks", c1: "#9db3d6", c2: "#ffffff", h: 150 }, snow: true,
      ground: { base: "#c9d8ea", top: ["#ffffff", "#e3eefa"], dots: "rgba(120,150,190,0.25)", stripe: "rgba(60,90,140,0.06)" },
      pipe: { body: ["#6aa5d8", "#e6f6ff", "#a9d6ff", "#4a86bd"], cap: "#e6f6ff", edge: "rgba(30,80,150,0.85)", deco: "icepillar" },
      tree: { trunk: "#5a4030", canopy: "#2f6a55", snowcap: true }, song: 2, theme: "#a9d6ff" },
    { id: "city", name: "Night City", sky: ["#0b1030", "#1c2456", "#3a2f6b"], cloud: "rgba(120,110,170,0.35)",
      moon: { x: 320, y: 80, r: 24 }, stars: 36,
      far: { kind: "skyline", c1: "#141a3a", c2: "#ffd86b", h: 170 },
      ground: { base: "#2a2c3a", top: ["#4a4d63", "#33354a"], dots: "rgba(255,220,120,0.18)", stripe: "rgba(255,255,255,0.05)", lane: true },
      pipe: { body: ["#171b3c", "#3a4378", "#262d5c", "#0e1128"], cap: "#4a5390", edge: "rgba(80,255,255,0.8)", deco: "tower" },
      tree: { trunk: "#2b2f45", canopy: "#3a4a7a" }, song: 3, theme: "#7a5cff" },
    { id: "space", name: "Outer Space", sky: ["#05030f", "#140a2e", "#2a0f45"], cloud: "rgba(180,120,255,0.18)",
      planet: { x: 300, y: 120, r: 38 }, stars: 70,
      far: { kind: "asteroids", c1: "#3b2f5c", c2: "#5d4a8a", h: 120 },
      ground: { base: "#5b5870", top: ["#8d8aa3", "#6c6984"], dots: "rgba(30,25,50,0.35)", stripe: "rgba(0,0,0,0.06)", craters: true },
      pipe: { body: ["#3d3560", "#8b7fb8", "#675c92", "#2a2347"], cap: "#8b7fb8", edge: "rgba(120,255,214,0.8)", deco: "asteroid" },
      tree: { trunk: "#4b3a7a", canopy: "#9a6cff" }, song: 4, theme: "#9a6cff" },
    { id: "blossom", name: "Blossom Valley", sky: ["#e86fa3", "#f9a8c9", "#ffd9e8"], cloud: "rgba(255,255,255,0.9)",
      far: { kind: "hillsPink", c1: "#e6a4c4", c2: "#c97fa6", h: 80 }, petals: true,
      ground: { base: "#b78a6a", top: ["#a6dd8a", "#7dc06a"], dots: "rgba(110,60,30,0.22)", stripe: "rgba(0,0,0,0.06)" },
      pipe: { body: ["#4a2a1a", "#9a6648", "#7b4c35", "#3a2216"], cap: "#ff9ec8", edge: "rgba(40,20,10,0.8)", deco: "trunk" },
      tree: { trunk: "#6b4430", canopy: "#ff9ec8" }, song: 5, theme: "#ff9ec8" },
    // —— v1.11 new worlds (original art, drawn in code) ——
    { id: "reef", name: "Coral Reef", sky: ["#03344f", "#0a6a8a", "#3fb4c4"], cloud: "rgba(190,240,255,0.18)",
      far: { kind: "reef", c1: "#0b5670", c2: "#ff7a8a", h: 110 }, bubbles: true, noClouds: true,
      ground: { base: "#d9c189", top: ["#f2dfa6", "#cfb173"], dots: "rgba(120,90,40,0.25)", stripe: "rgba(0,60,90,0.07)" },
      pipe: { body: ["#a02f58", "#ff9ab0", "#ec6685", "#78254a"], cap: "#ff9ab0", edge: "rgba(100,20,50,0.7)", deco: "coralcol" },
      tree: { trunk: "#2a6a5a", canopy: "#3fbf8f" }, song: 2, theme: "#3fd0e0" },
    { id: "volcano", name: "Lava Land", sky: ["#1a0606", "#4a1208", "#a33a10"], cloud: "rgba(80,60,60,0.45)",
      far: { kind: "volcano", c1: "#2a1210", c2: "#ff6a1a", h: 150 }, embers: true,
      ground: { base: "#2b2224", top: ["#4a3a3c", "#30262a"], dots: "rgba(255,110,30,0.35)", stripe: "rgba(255,80,0,0.06)" },
      pipe: { body: ["#120e12", "#4d424c", "#352d36", "#0c080c"], cap: "#4d424c", edge: "rgba(255,110,30,0.9)", deco: "lavarock" },
      tree: { trunk: "#2a1a14", canopy: "#5a2a1a" }, song: 1, theme: "#ff6a1a" },
    { id: "candy", name: "Pastel Skies", sky: ["#b48cff", "#ffb3e6", "#fff0c8"], cloud: "rgba(255,255,255,0.95)",
      far: { kind: "candy", c1: "#ffc6e6", c2: "#9ee6ff", h: 120 }, sprinkles: true,
      ground: { base: "#ffd6ea", top: ["#ff9ecf", "#ff7ab8"], dots: "rgba(120,200,255,0.5)", stripe: "rgba(255,255,255,0.15)" },
      pipe: { body: ["#ffffff", "#ffffff", "#fff0f5", "#ffd9e6"], cap: "#ffffff", edge: "rgba(190,30,70,0.8)", deco: "cane" },
      tree: { trunk: "#c87a4a", canopy: "#ff8ac8" }, song: 5, theme: "#ff7ab8" },
  ];
  const BOSS_PIPE = { body: ["#3a0d14", "#7a1a26", "#5a121c", "#24070c"], cap: "#ff3b3b", edge: "rgba(255,190,80,0.9)", deco: "spikes" };

  function worldIndexFor(lv) { return Math.max(0, Math.floor((Math.max(1, lv | 0) - 1) / WORLD_EVERY)); }
  function worldDefAt(wi) { return WORLDS[((wi % WORLDS.length) + WORLDS.length) % WORLDS.length]; }
  function worldNameAt(wi) {
    const lap = Math.floor(wi / WORLDS.length);
    return worldDefAt(wi).name + (ROMAN[Math.min(lap, ROMAN.length - 1)] || "");
  }
  function isBossLevel(lv) { return (lv | 0) >= BOSS_EVERY && (lv | 0) % BOSS_EVERY === 0; }
  function bossBonusFor(lv) { return Math.min(20, 5 + Math.floor((lv | 0) / 20)); }

  let debugAuto = false;
  // v1.18 pause: 0 running, 1 paused (panel), 2 resume countdown (3-2-1, 50 frames each)
  let pauseMode = 0, pauseCount = 0, pauseQuitArmed = false;
  const PAUSE_STEP = 50;
  const PAUSE_BTN = { x: W - 30, y: 88, r: 16, hit: 24 };
  const PAUSE_PANEL = { x: 60, y: 150, w: 280, h: 300 };
  const PAUSE_RESUME = { x: 90, y: 268, w: 220, h: 58 };
  const PAUSE_QUIT = { x: 105, y: 346, w: 190, h: 46 };
  function pauseGame(reason) {
    if (pauseMode || state !== State.PLAY) return false;
    pauseMode = 1; pauseCount = 0; pauseQuitArmed = false;
    try { if (audioCtx && audioCtx.state === "running") audioCtx.suspend(); } catch (_) {}
    saveRunNow("pause");
    saveDirty = true; flushSaves("pause"); // coins already earned are safe if the app is closed while paused
    return true;
  }
  function resumeGame() {
    if (pauseMode !== 1) return false;
    pauseMode = 2; pauseCount = PAUSE_STEP * 3; pauseQuitArmed = false;
    ensureAudio();
    beep(520, 0.07, "sine", 0.04);
    return true;
  }
  function tickPause() {
    if (pauseMode !== 2) return;
    pauseCount--;
    if (pauseCount > 0 && pauseCount % PAUSE_STEP === 0) beep(520 + (3 - pauseCount / PAUSE_STEP) * 110, 0.07, "sine", 0.04);
    if (pauseCount <= 0) { pauseMode = 0; pauseCount = 0; beep(880, 0.12, "sine", 0.05); }
  }
  /** Quit to menu from the pause screen: ends the run exactly like a game over (score and coins banked once, nothing skipped). */
  function quitRunFromPause() {
    if (pauseMode !== 1) return;
    pauseMode = 0; pauseCount = 0; pauseQuitArmed = false;
    puMode = null; puModeLeft = 0; shipRockets.length = 0; ghostPipesLeft = 0;
    ensureAudio();
    saveRunNow("quit"); resumeQuit = true;   // Quit keeps the exact level for Continue
    finishRun();
    flash = 0; screenShake = 0;
  }
  function pauseBtnHit(pt) {
    if (!pt) return false;
    const dx = pt.x - PAUSE_BTN.x, dy = pt.y - PAUSE_BTN.y;
    return dx * dx + dy * dy <= PAUSE_BTN.hit * PAUSE_BTN.hit;
  }
  function pausePointer(pt) {
    if (pauseMode !== 1) return; // countdown: taps do nothing
    if (hitBtn(pt, PAUSE_RESUME)) { resumeGame(); return; }
    if (hitBtn(pt, PAUSE_QUIT)) {
      if (!pauseQuitArmed) pauseQuitArmed = true; // first tap asks, second tap ends the run
      else quitRunFromPause();
      return;
    }
    pauseQuitArmed = false; // a tap anywhere else never resumes by accident
  }
  function drawPauseUi() {
    if (state !== State.PLAY) return;
    ctx.save();
    if (!pauseMode) {
      const b = PAUSE_BTN;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "rgba(20,40,70,0.5)";
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "#ffffff";
      roundRect(b.x - 6.5, b.y - 6.5, 4.5, 13, 1.5); ctx.fill();
      roundRect(b.x + 2, b.y - 6.5, 4.5, 13, 1.5); ctx.fill();
      ctx.restore();
      return;
    }
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (pauseMode === 2) {
      ctx.fillStyle = "rgba(10,25,50,0.32)"; ctx.fillRect(0, 0, W, H);
      const n = Math.ceil(pauseCount / PAUSE_STEP), ph = 1 - (pauseCount % PAUSE_STEP || PAUSE_STEP) / PAUSE_STEP;
      const sc = 1.25 - 0.25 * Math.min(1, ph * 3);
      ctx.translate(W / 2, 250); ctx.scale(sc, sc);
      ctx.font = "bold 96px " + FONT; ctx.lineWidth = 8; ctx.strokeStyle = "rgba(0,30,60,0.55)"; ctx.fillStyle = "#ffe566";
      ctx.strokeText(String(n), 0, 0); ctx.fillText(String(n), 0, 0);
      ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
      ctx.font = "bold 18px " + FONT; ctx.fillStyle = "#ffffff"; ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,30,60,0.5)";
      ctx.strokeText("Get ready!", W / 2, 330); ctx.fillText("Get ready!", W / 2, 330);
      ctx.restore();
      return;
    }
    ctx.fillStyle = "rgba(10,25,50,0.62)"; ctx.fillRect(0, 0, W, H);
    const p = PAUSE_PANEL;
    ctx.fillStyle = "rgba(255,255,255,0.97)"; roundRect(p.x, p.y, p.w, p.h, 20); ctx.fill();
    ctx.strokeStyle = "#7fb6ff"; ctx.lineWidth = 3; roundRect(p.x, p.y, p.w, p.h, 20); ctx.stroke();
    ctx.fillStyle = "#1f3a5f"; ctx.font = "bold 34px " + FONT; ctx.fillText("Paused", W / 2, p.y + 46);
    ctx.fillStyle = "#4a6485"; ctx.font = "14px " + FONT;
    ctx.fillText("Your run is on hold.", W / 2, p.y + 82);
    ctx.fillText("Score " + score + " · Level " + level, W / 2, p.y + 104);
    // pause bars icon
    ctx.fillStyle = "#7fb6ff"; roundRect(W / 2 - 16, p.y + 124, 12, 34, 4); ctx.fill(); roundRect(W / 2 + 4, p.y + 124, 12, 34, 4); ctx.fill();
    let r = PAUSE_RESUME;
    ctx.fillStyle = "#37b24d"; roundRect(r.x, r.y, r.w, r.h, 16); ctx.fill();
    ctx.fillStyle = "#ffffff"; ctx.font = "bold 24px " + FONT; ctx.fillText("▶  Resume", r.x + r.w / 2, r.y + r.h / 2 + 1);
    r = PAUSE_QUIT;
    ctx.fillStyle = pauseQuitArmed ? "#e03131" : "#e9eef6"; roundRect(r.x, r.y, r.w, r.h, 14); ctx.fill();
    ctx.fillStyle = pauseQuitArmed ? "#ffffff" : "#35506f"; ctx.font = "bold 16px " + FONT;
    ctx.fillText(pauseQuitArmed ? "Tap again to end the run" : "Quit to menu", r.x + r.w / 2, r.y + r.h / 2 + 1);
    ctx.fillStyle = "#6c829c"; ctx.font = "12px " + FONT;
    ctx.fillText("Resume starts a 3-2-1 countdown", W / 2, p.y + p.h - 18);
    ctx.restore();
  }
  let freeze112 = false; // debug only: stops the simulation so a world's obstacles can be photographed / hit-tested
  let worldIdx = 0;          // world currently drawn (index; cycles through WORLDS with a lap suffix)
  let worldFromIdx = 0;      // previous world (cross-fade source)
  let worldFade = 1;         // 0 → 1 cross-fade progress after a world change
  let bossOn = false;
  let bossesCleared = 0;     // this run
  let bigBannerT = 0, bigBannerText = "", bigBannerSub = "", bigBannerColor = "#fff", bigBannerBoss = false;
  let farX = 0;

  function showBigBanner(text, sub, color, boss) {
    bigBannerT = 130; bigBannerText = text; bigBannerSub = sub || ""; bigBannerColor = color || "#fff"; bigBannerBoss = !!boss;
  }

  /** Recompute world + boss state from the current level. announce: banners + sounds. */
  function syncWorld(announce) {
    const wi = state === State.START ? 0 : worldIndexFor(level);
    if (wi !== worldIdx) {
      worldFromIdx = worldIdx;
      worldIdx = wi;
      worldFade = announce ? 0 : 1;
      evictWorldSprites();
      setSongForWorld();
      if (announce) {
        showBigBanner("New World: " + worldNameAt(wi), "Level " + formatLevel(level), mixHex(worldDefAt(wi).theme, "#ffffff", 0.4), false);
        sfxMilestone();
        haptic("evolve");
      }
    }
    const boss = state !== State.START && isBossLevel(level);
    if (boss !== bossOn) {
      bossOn = boss;
      setSongForWorld();
      if (boss && announce) {
        // the regular "Checkpoint saved" flash folds into the boss banner (one message, not two stacked)
        const cp = milestoneFlash > 0.05 && milestoneFlashText.indexOf("Checkpoint") >= 0;
        if (cp) milestoneFlash = 0;
        const sub = (cp ? "⚑ Checkpoint saved · " : "Level " + formatLevel(level) + " · ") + "clear it for +" + bossBonusFor(level) + " coins";
        if (bigBannerT > 50 && bigBannerText.indexOf("New World") === 0) bigBannerSub = "BOSS LEVEL · " + sub;
        else showBigBanner("⚠ BOSS ⚠", sub, "#ff5a5a", true);
        sfxBoss();
        screenShake = Math.max(screenShake, 0.5);
      }
    }
  }

  function onLevelUp110(prevLv, lv) {
    if (isBossLevel(prevLv) && !isBossLevel(lv) && state === State.PLAY) {
      const n = E.addCoins(save, bossBonusFor(prevLv));
      runCoins += n;
      coinPop = 1;
      bossesCleared++;
      floaters.push({ x: bird.x + 30, y: bird.y - 36, text: "BOSS CLEARED +" + n, life: 70, color: "#ffd24a" });
      pushToast("Boss cleared! +" + n + " coins", "#ffd24a", "coin", 2);
      sfxBigCoin();
    }
    syncWorld(true);
  }

  // —— Moving pipes (level 50+): gentle ramp, never tighter than 100 px ——
  function pipeMotionFor(lv, gap) {
    if (lv < 50) return null;
    const over = lv - 50;
    const chance = Math.min(0.55, 0.22 + over * 0.006);
    if (Math.random() >= chance) return null;
    const m = { amp: Math.min(44, 14 + over * 0.5), rate: 0.018 + Math.min(0.012, over * 0.0002), ph: Math.random() * Math.PI * 2, bAmp: 0 };
    // From 65: some gaps slowly close / open instead (or as well, from 90)
    if (lv >= 65 && Math.random() < 0.38) {
      m.bAmp = Math.min(18, 8 + (lv - 65) * 0.15);
      m.bRate = 0.022;
      m.bPh = Math.random() * Math.PI * 2;
      if (lv < 90) m.amp *= 0.35;
    }
    return m;
  }

  function stepPipeMotion(p, k) {
    if (p.amp) {
      p.ph += p.rate * k;
      p.gapY = p.gapY0 + Math.sin(p.ph) * p.amp;
    }
    if (p.bAmp) {
      p.bPh += p.bRate * k;
      p.gap = Math.max(100, p.gap0 + Math.sin(p.bPh) * p.bAmp);
    }
  }

  // —— Power-ups: rare, ride in with a pipe's gap (spawned off-screen right), never pop near the bird ——
  // v1.11: Rocket Boost, Power Bird and Spaceship pickups (v1.11.1: the old time pickup is fully removed).
  const POWERUP_KINDS = ["shield", "rocket", "magnet", "power", "ship"];
  const PU_MODE_KINDS = { rocket: 1, power: 1, ship: 1 }; // "ride" modes: one at a time, count pipes, not frames
  const POWERUP_INFO = {
    shield: { name: "Shield", color: "#74c0fc", ring: "116,192,252", desc: "absorbs one hit" },
    magnet: { name: "Magnet", color: "#ff6b9a", ring: "255,107,154", desc: "6 seconds" },
    rocket: { name: "Rocket Boost", color: "#ff9f1a", ring: "255,159,26", desc: "auto-fly 5 pipes" },
    power: { name: "Power Bird", color: "#e03131", ring: "224,49,49", desc: "smash pipes" },
    ship: { name: "Spaceship", color: "#4dabf7", ring: "77,171,247", desc: "blast 10 pipes" },
    pellet: { name: "Pellet Burst", color: "#ff5fa2", ring: "255,95,162", desc: "30 seconds of pellets" },
    pop: { name: "Rocket Pop", color: "#845ef7", ring: "132,94,247", desc: "30 homing rockets" },
    poof: { name: "Poof Toy", color: "#1fc9a0", ring: "31,201,160", desc: "toy poofs hunters and pipes" },
    zap: { name: "Zap Wand", color: "#2f8fff", ring: "47,143,255", desc: "lightning zaps hunters and pipes" },
  };
  const ROCKET_PIPES = 5, SHIP_PIPES = 10, POWER_MIN = 5, POWER_MAX = 10;
  const ROCKET_WORLD_MUL = 1.7;
  const POWER_SCALE = 1.65;
  let puMode = null, puModeLeft = 0, puModeTotal = 0, puModeT = 0;
  let puVis = 1;                 // drawn bird scale (Power Bird grows)
  const shipRockets = [];        // { x, y, pipe }
  let shipFireCd = 0, pipesSmashed = 0;
  const POWERUP_R = 13;
  const PU_MAGNET_FRAMES = 480; const MAG_PICK_R = 130, MAG_DUE = 1200, MAG_FIRST = 300;   // v1.19: 8 s pull, 130 px; a Magnet pickup at least every ~20 s of play (first one ~5 s into a run)
  let magClock = 0;
  const PU_MIN_LEVEL = 3;
  const PU_CHANCE = 0.1;           // v1.16: 6% -> 10%
  const PU_MIN_GAP_PIPES = 7;    // v1.16: at least this many pipes between two power-ups (was 10)
  const PU_GUARANTEE_PIPES = 36; // v1.16: a first Rocket Boost or Spaceship is guaranteed to ride in by about pipe 40 of a run
  let puRunPipes = 0, puRideSeen = false;
  const powerups = [];           // { x, y, kind, pipe, dx, gy, bob }
  let puPipesSince = 0;
  // v1.18 pity timer: frames of play since the last helper pickup was placed; the next one is due after 5-7.5 s (a little sooner with pickup skills)
  const WPN_KINDS = ["pellet", "pop", "poof", "zap"], WPN_MIN_LV = { pellet: 2, pop: 3, poof: 5, zap: 4 };
  const WPN_GAP_MIN = 360, WPN_GAP_MAX = 420, WPN_GAP_FLOOR = 300, WPN_SKILL_FRAMES = 20;
  let wpnBusyF = 0;   // v1.20 test counter: frames with a helper running
  let wpnClock = 0, wpnDue = 900, wpnT = 0, wpnSeq = 0, wpnRun = 0; let wpnHoldOn = false;   // test hook: switches the pity timer off
  const wpnLast = { pellet: 0, pop: 0, poof: 0, zap: 0 }, wpnLog = [];
  const WPN_AFTER_MIN = 150, WPN_AFTER_MAX = 210;   // v1.20: 2.5-3.5 s after the running helper ends
  function wpnNextDue() { return Math.max(WPN_GAP_FLOOR, WPN_GAP_MIN + Math.floor(Math.random() * (WPN_GAP_MAX - WPN_GAP_MIN + 1)) - WPN_SKILL_FRAMES * pk().puGapCut); }
  /** The helper kind to place next: the one shown least recently among those that are allowed right now (rotation), or null. */
  function wpnPick() {
    if (!burstSpawnOk(2)) return null;
    let best = null, bs = 1e9;
    for (let i = 0; i < WPN_KINDS.length; i++) {
      const k = WPN_KINDS[i];
      if (level < WPN_MIN_LV[k] || !burstSpawnOk(WPN_MIN_LV[k])) continue;
      const sc = wpnLast[k] + Math.random() * 0.5;
      if (sc < bs) { bs = sc; best = k; }
    }
    return best;
  }
  function wpnPlaced(kind) {
    wpnLast[kind] = ++wpnSeq; wpnClock = 0; wpnDue = wpnNextDue();
    wpnLog.push({ run: wpnRun, t: wpnT, kind: kind, lv: level, ev: "spawn", busy: weaponNow().length > 0 }); if (wpnLog.length > 4000) wpnLog.shift();
  }
  let puMagnetFrames = 0;
  let puCollected = 0;
  let puForceKind = null;        // QA hook: next eligible pipe carries this power-up
  // —— v1.17: Pellet Burst + Rocket Pop (pickups from level 2, never on boss levels) ——
  // Friendly cartoon helpers. Pellets and rockets bonk hunters (stars + dazed); after a couple of hits a hunter is poofed away in a puff of
  // colourful smoke and confetti (no blood, no falling body, no fireball) and the bird earns a few coins. Nets / bolts are popped with a "poof".
  // They also crack pipes: after a few hits one pipe half crumbles away in a cartoon puff (bigger opening, a few coins). Never on boss pipes / first levels.
  const PU_NEW_MIN_LEVEL = 2;               // v1.17: was 21
  const PU_PELLET_GUARANTEE_PIPES = 10;     // first Pellet Burst rides in by about pipe 12 of the run
  const PU_POP_GUARANTEE_PIPES = 16;        // first Rocket Pop rides in by about pipe 20 of the run (asked: by about 25); scoring runs ahead of pipes, so this is ~level 3-5
  const PU_POOF_GUARANTEE_PIPES = 14;       // first Poof Toy: from level 5 on, once the run is 14 pipes in (and after the pellet / rocket guarantees)
  const PU_POOF_MIN_LEVEL = 5;              // Poof Toy (a harmless toy): first pickup guaranteed by about level 5, never on boss levels
  const POOF_BASE_TOYS = 8, POOF_R = 46, POOF_EVERY = 44, POOF_HOLD = 720, MAX_TOYS = 4, MAX_CONFETTI = 170, POOF_FLIGHT = 38;
  let puPelletSeen = false, puPopSeen = false, puPoofSeen = false, burstBanner = null;
  let poofQueue = 0, poofCd = 0, poofHold = 0, poofShown = false, poofTotal = 0;
  // v1.19 Zap Wand: its own weapon (electricity only). An instant lightning arc from the bird to the nearest hunter / net / pipe half, with a starburst on impact.
  const ZAP_BASE = 12, ZAP_EVERY = 36, ZAP_HOLD = 720;
  let zapQueue = 0, zapCd = 0, zapHold = 0, zapTotal = 0, zapShown = false, zapStrikes = 0;
  const toys = [];         // { sx, sy, x, y, t, tgt, kind, fx, fy, spin }
  const confetti = [];     // { x, y, vx, vy, rot, vr, life, max, c, w }
  const CONFETTI_COLS = ["#ff5fa2", "#ffd000", "#37d6ff", "#6dff8a", "#b197fc", "#ff9a52", "#ffffff"];
  const PELLET_FRAMES = 1800, PELLET_EVERY = 5, MAX_PELLETS = 30;   // ~30 seconds at 60 fps
  const POP_ROCKETS = 30, MAX_POP_ROCKETS = 6, POP_EVERY = 24, POP_HOLD = 3600;   // 30 rockets, one about every 0.4 s, up to a minute to use them
  const HUNTER_HP = 2, HUNTER_HIT_GAP = 4;   // v1.18: pellet = 1, rocket = 2, 2 HP: two pellets or one rocket and the hunter is poofed away
  const PIPE_HP = 5, PIPE_HIT_GAP = 10, PIPE_BREAK_MIN_LEVEL = 1, BURST_COIN_CAP = 60;   // pellet = 1, rocket = 3, poof = 2 per pipe half; coin cap per run
  let pelletFrames = 0, pelletCd = 0, popQueue = 0, popCd = 0, pelletTotal = 1, popTotal = 1, popHold = 0, popLaunched = 0, burstCoins = 0;
  const bstat = { defeated: 0, crumbled: 0, cracked: 0 };
  const STACK_MAX = 2;     // v1.18: pickups stack: a new Pellet Burst / Rocket Pop / Poof Toy adds to the running one (up to 2x one pickup)
  // v1.18 colourful helpers: rainbow pellets / rockets, cartoon sparks, zig-zag lightning arcs, flame trails and fiery poofs (all pools are capped)
  const RB = []; for (let i = 0; i < 36; i++) RB.push("hsl(" + i * 10 + ",100%,58%)");
  const MAX_BOLTS = 14, MAX_FLAMES = 110, MAX_SPARKS = 40, MAX_BLASTS = 8, MAX_ZAPS = 3;   // v1.19: one helper at a time; rockets keep their 1.18 look (Danny likes it)
  // v1.19 firing styles, all built like the rocket (launch, clear trail, satisfying pop), each with its own look and path:
  // Pellets = quick small streaks, straight at the target, light trail, small white pop (no sparkle). Rocket Pop = the 1.18 rocket (fire trail, fiery impact), straight homing.
  // Zap Wand = an electric orb on a random zig-zag path with a lightning trail and an electric pop. Poof Toy = lobbed at random arcs with a colourful trail and a confetti pop.
  const ELEC = [18, 6, 21, 6];   // electric cyan / yellow / blue hues (index into RB)
  let fxMul = 1, toyFxT = 0;     // fxMul: share of ambient / impact effects kept while 2-3 helper kinds are active together
  function fxAmb() { return fxMul < 1 && Math.random() > fxMul; }
  function fxK(n) { return Math.max(1, Math.round(n * fxMul)); }
  let fxTick = 0; function fxThin() { return quality >= 2 && ((++fxTick) & 1) === 1; }   // low-graphics setting: half the sparks, flames, lightning and starbursts
  const bolts = [];        // zig-zag lightning arcs { pts, life, max, c }
  const blasts = [];       // cartoon starbursts { x, y, life, max, r, c }
  const flames = [];       // cartoon flame bits { x, y, vx, vy, life, max, s }
  function boltFx(x1, y1, x2, y2, n, c) {
    if (fxThin()) return;
    if (bolts.length >= MAX_BOLTS) bolts.shift();
    const dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / len, ny = dx / len, pts = [[x1, y1]];
    for (let i = 1; i < n; i++) { const t = i / n, off = (Math.random() - 0.5) * Math.min(30, len * 0.7); pts.push([x1 + dx * t + nx * off, y1 + dy * t + ny * off]); }
    pts.push([x2, y2]); bolts.push({ pts: pts, life: 10, max: 10, c: c % 36 });
  }
function zapFx(x, y, k) { k = fxK(k); for (let i = 0; i < k; i++) { const a = Math.random() * Math.PI * 2, r = 26 + Math.random() * 26; boltFx(x, y, x + Math.cos(a) * r, y + Math.sin(a) * r, 5, ELEC[(i + (frame >> 2)) & 3]); } }
  function flameFx(x, y, vx, vy, life, sz) { if (fxThin()) return; if (flames.length >= MAX_FLAMES) flames.shift(); flames.push({ x: x, y: y, vx: vx, vy: vy, life: life, max: life, s: sz }); }
  function fireBurst(x, y, n) { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + Math.random() * 0.6, sp = 1.4 + Math.random() * 3; flameFx(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 0.7, 16 + Math.random() * 12, 6 + Math.random() * 5); } rings.push({ x: x, y: y, r: 6, max: 42, life: 1, color: "255,170,60" }); rings.push({ x: x, y: y, r: 3, max: 26, life: 1, color: "255,240,140" }); blastFx(x, y, 24 + n * 1.5, true); }
  function sparkBit(x, y, c) { if (sparks.length >= MAX_SPARKS) sparks.shift(); sparks.push({ x: x, y: y, vx: (Math.random() - 0.5) * 1.2, vy: -0.4 - Math.random() * 0.8, rot: Math.random() * 6, vr: 0.2, life: 22 + Math.random() * 10, max: 32, c: 0, w: 5 + Math.random() * 2.4, col: RB[c % 36] }); }
  function blastFx(x, y, r, fire) { if (fxThin()) return; if (blasts.length >= MAX_BLASTS) blasts.shift(); blasts.push({ x: x, y: y, life: 14, max: 14, r: r, c: 0, f: fire ? 1 : 0 }); }
  function sparkRing(x, y, n, spd) { n = fxK(n); for (let i = 0; i < n; i++) { if (fxThin()) continue; if (sparks.length >= MAX_SPARKS) sparks.shift(); const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, sp = spd * (0.6 + Math.random() * 0.7); sparks.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.5, life: 26 + Math.random() * 12, max: 38, c: 0, w: 5.5 + Math.random() * 3, col: RB[(i * 5 + frame) % 36] }); } }
  /** v1.19: the hit / impact look of each helper. kind: "pellet" (rainbow stars), "rocket" (fire), "toy" (lightning + starburst) */
  function wHit(kind, x, y, big) {
    if (kind === "rocket") { fireBurst(x, y, big ? 12 : 7); sparkRing(x, y, big ? 6 : 3, 3); }
    else if (kind === "zap") { zapFx(x, y, big ? 3 : 2); blastFx(x, y, big ? 44 : 28); }
    else if (kind === "toy") smokeFx(x, y, big ? 5 : 3, 12);
    else { rings.push({ x: x, y: y, r: 3, max: big ? 26 : 16, life: 1, color: "255,255,255" }); }   // pellets: a small white pop
  }
  const sparks = [];       // cartoon stars { x, y, vx, vy, rot, vr, life, max, c, w }
  const puffs = [];        // soft smoke clouds { x, y, r, vr, vx, vy, life, max, c }
  const SMOKE_COLS = ["#ffffff", "#ffd6f0", "#d9f3ff", "#e8dcff", "#fff2a8"];
  const PELLET_R = 6.8, PELLET_RING = 8.2, PELLET_GLOW = 12;   // v1.19: the 1.17 pellet size (1.18 had 8.4 / 9 / 16)
  const pellets = [];      // { x, y, vx, vy, life, c, t }
  const popRockets = [];   // { x, y, a, sp, life, tgt, kind, wob }
  const PELLET_COLS = ["#ff2d8a", "#ffd000", "#00cfff", "#3dff5a"];
  function burstSpawnOk(minLv) { return level >= (minLv || PU_NEW_MIN_LEVEL); }
  function burstAllowed() { return state === State.PLAY && level >= 1; }
  function resetBurst() { burstBanner = null; zaps.length = 0; zapQueue = 0; zapHold = 0; zapCd = 0; zapStrikes = 0; pelletFrames = 0; pelletCd = 0; popQueue = 0; popCd = 0; popHold = 0; popLaunched = 0; sparks.length = 0; blasts.length = 0; puffs.length = 0; bolts.length = 0; flames.length = 0; chunks.length = 0; pellets.length = 0; popRockets.length = 0; poofQueue = 0; poofCd = 0; poofHold = 0; poofShown = false; toys.length = 0; confetti.length = 0; }
  function poofFx(x, y, big) {
    // soft cartoon cloud puff (white / pastel), no flames
    const n = big ? 9 : 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5, sp = (big ? 1.2 : 0.8) + Math.random() * 1.4;
      addParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 0.3, 20 + Math.random() * 10, 30, i % 3 === 0 ? "#ffd6f0" : (i % 3 === 1 ? "#d9f3ff" : "#ffffff"), (big ? 4 : 2.6) + Math.random() * 2);
    }
    rings.push({ x: x, y: y, r: 6, max: big ? 34 : 20, life: 1, color: "255,255,255" });
  }
  function stunHunter(h, frames, push) {
    h.stun = Math.max(h.stun | 0, frames);
    h.kb = Math.max(h.kb || 0, push);
    h.shootCD = Math.max(h.shootCD, frames + 40);
    poofFx(h.x, h.y - 6, true);
    floaters.push({ x: h.x, y: h.y - 34, text: "Bonk!", life: 40, color: "#fff2a8" });
    beep(520, 0.06, "triangle", 0.03);
  }
  function starFx(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.7 + (Math.random() - 0.5) * 0.3, sp = 1.6 + Math.random() * 1.6;
      if (sparks.length >= MAX_SPARKS) sparks.shift();
      sparks.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.6, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, life: 34 + Math.random() * 14, max: 48, c: i % 2, w: 6.5 + Math.random() * 3, col: RB[(i * 7 + frame) % 36] });
    }
  }
  function smokeFx(x, y, n, spread) {
    for (let i = 0; i < n; i++) {
      if (puffs.length >= 40) puffs.shift();
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.8, d = Math.random() * spread;
      puffs.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.8, r: 5 + Math.random() * 4, vr: 0.9 + Math.random() * 0.5, vx: Math.cos(a) * 0.5 - 0.5, vy: Math.sin(a) * 0.4 - 0.35, life: 24 + Math.random() * 8, max: 32, c: i % SMOKE_COLS.length });
    }
  }
  // v1.17 war-machine skills: Toy Popper (pelletDmg/pipeDmg), Crumble Touch (hunterHpCut/pipeHpCut), Bonk Bounty (bounty), Rapid Rockets (rocketCut)
  function hunterHp(h) { return Math.max(1, (h && h.hp ? h.hp : HUNTER_HP) - pk().hunterHpCut); }   // v1.18: per-tier hit points (Apprentice 2 ... Archwitch 4)
  function pipeHp() { return Math.max(2, PIPE_HP - pk().pipeHpCut); }
  function pelletHurt() { return 1 + pk().pelletDmg; }
  function pelletPipeDmg() { return 1 + pk().pipeDmg; }
  function burstReward(n, x, y) {
    n = Math.min(n + pk().bounty, BURST_COIN_CAP + 20 * pk().bounty - burstCoins);
    if (n <= 0) return 0;
    const g = E.addCoins(save, n); burstCoins += g; runCoins += g; coinPop = 1;
    floaters.push({ x: x, y: y, text: "+" + g, life: 46, color: "#ffd24a" });
    try { missionProgress("coins", g); } catch (_) {}
    return g;
  }
  /** a hunter is poofed away: colourful smoke + confetti + stars, no body, no blood. */
  function defeatHunter(h, talon, w) {
    const k = hunters.indexOf(h); if (k < 0) return;
    hunters.splice(k, 1); bstat.defeated++;
    const x = h.x, y = h.y - 6;
    smokeFx(x, y, 9, 16); poofFx(x, y, true); confettiBurst(x, y, 34); wHit(w || "pellet", x, y - 6, true);
    rings.push({ x: x, y: y, r: 8, max: 56, life: 1, color: "255,214,240" }); rings.push({ x: x, y: y, r: 4, max: 38, life: 1, color: "190,240,255" });
    floaters.push({ x: x, y: y - 28, text: talon ? "Talon Smash!" : "Poof!", life: 50, color: "#fff2a8" });
    burstReward(3, x, y - 46);
    screenShake = Math.max(screenShake, 0.15);
    sweep(620, 260, 0.18, "triangle", 0.03); beep(940, 0.05, "sine", 0.02);
  }
  /** dmg: pellet 1, rocket 2. Pellets that arrive right after a hit are absorbed (so the "Bonk!" is seen). */
  function hurtHunter(h, dmg, stunF, push, pel, wk) {
    const w = wk || (pel ? "pellet" : "rocket");
    if (hunters.indexOf(h) < 0) return;
    if (pel && frame - (h.hitF === undefined ? -99 : h.hitF) < HUNTER_HIT_GAP) return;
    h.hitF = frame; h.dmg = (h.dmg | 0) + dmg; wHit(w, h.x, h.y - 6, dmg > 1);
    if (h.dmg >= hunterHp(h)) defeatHunter(h, false, w);
    else { stunHunter(h, stunF, push); }
  }
  // —— pipes: cracks, then one half crumbles away ——
  // v1.18 evolving obstacles: every world's own obstacle cracks (3 stages), crumbles into its own kind of chips, and in later worlds regrows as a short capped stump
  const chunks = [], CHUNK_CAP = 40, STUB_WORLD_MIN = 2, STUB_H = 44, STUB_GROW = 26, STUB_AHEAD = 110;
  const OBST_FX = {
    tube: { crack: "rgba(20,55,15,0.85)", hi: "rgba(255,255,255,0.55)", chip: "rock", cols: ["#3f9a2e", "#8ee05a"], glow: null },
    cactus: { crack: "rgba(15,50,20,0.85)", hi: "rgba(230,255,210,0.6)", chip: "spine", cols: ["#2f7d3a", "#7ad06f"], glow: null },
    icepillar: { crack: "rgba(40,100,190,0.9)", hi: "rgba(255,255,255,0.95)", chip: "shard", cols: ["#f0faff", "#a9d6ff"], glow: "rgba(190,230,255,0.45)" },
    tower: { crack: "rgba(90,255,255,0.95)", hi: "rgba(255,255,255,0.85)", chip: "brick", cols: ["#3a4378", "#566099"], glow: "rgba(90,255,255,0.35)" },
    asteroid: { crack: "rgba(25,15,45,0.9)", hi: "rgba(170,255,230,0.7)", chip: "rock", cols: ["#8b7fb8", "#675c92"], glow: null },
    trunk: { crack: "rgba(35,18,8,0.9)", hi: "rgba(255,210,160,0.55)", chip: "splinter", cols: ["#9a6648", "#c58a60"], glow: null },
    coralcol: { crack: "rgba(120,25,65,0.85)", hi: "rgba(255,235,245,0.85)", chip: "blob", cols: ["#ff9ab0", "#ec6685"], glow: null },
    lavarock: { crack: "rgba(255,125,30,0.98)", hi: "rgba(255,235,130,0.95)", chip: "rock", cols: ["#4d424c", "#ff8a2a"], glow: "rgba(255,120,30,0.4)" },
    cane: { crack: "rgba(200,30,70,0.9)", hi: "rgba(255,255,255,0.95)", chip: "shard", cols: ["#ffffff", "#e8344f"], glow: null }
  };
  function obstFx(p) { const d = pipeStyleDef(p.style == null ? 0 : p.style); return OBST_FX[d && d.deco] || OBST_FX.tube; }
  function chunkFx(x, y, n, fx, up) {
    for (let i = 0; i < n && chunks.length < CHUNK_CAP; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.8 + Math.random() * 2.6;
      chunks.push({ x: x + (Math.random() - 0.5) * 18, y: y + (Math.random() - 0.5) * 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.2 + (up || 0), rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4, life: 26 + (Math.random() * 18 | 0), max: 44, s: 3 + Math.random() * 3.4, c: fx.cols[i % 2], k: fx.chip });
    }
  }
  /** height of the regrown stump on a crumbled half (0 when none): grows in over about half a second */
  function stubH(p) { return p.stubT === undefined ? 0 : Math.max(0, Math.min(STUB_H, (frame - p.stubT) * (STUB_H / STUB_GROW))); }
  function pipeEdge(p, side) { return side === "t" ? p.gapY - p.gap / 2 : p.gapY + p.gap / 2; }
  function pipeBreakOk(p) { return state === State.PLAY && level >= PIPE_BREAK_MIN_LEVEL && !p.smashed; }
  function bitFx(bit) {
    const meta = (window.SkyHopObstacles.KIND_META[bit && bit.kind]) || window.SkyHopObstacles.KIND_META.rock;
    const chip = bit && (bit.kind === "crystal" || bit.kind === "ice") ? "shard" : (bit && (bit.kind === "gear" || bit.kind === "anvil" || bit.kind === "sign") ? "brick" : "rock");
    return { cols: meta.chip, chip: chip, crack: meta.crack, hi: meta.hi };
  }
  function sideGone(p, s) {
    if (p.bits) { const b = p.bits[s]; return !b || !!b.gone; }
    return s === "t" ? !!(p.crT || p.noT) : !!(p.crB || p.noB);
  }
  function stubLive(p, s) { return p.bits ? false : (p.cr === s && p.stubT !== undefined && stubH(p) > 1); }
  /** a compact obstacle that can still be hit */
  function sideLive(p, s) {
    if (p.bits) { const b = p.bits[s]; return !!b && !b.gone; }
    return !sideGone(p, s) || stubLive(p, s);
  }
  function pipeSegAt(x, y, r) {
    for (let i = 0; i < pipes.length; i++) {
      const p = pipes[i];
      if (!p.bits || !pipeBreakOk(p)) continue;
      const idx = window.SkyHopObstacles.hitIndex(x, y, r, p.x, p.gapY, p.bits, frame);
      if (idx >= 0) return { p: p, side: idx };
    }
    return null;
  }
  function pipeCover(p, side) {
    let c = 0;
    for (let i = 0; i < pellets.length; i++) if (pellets[i].pp === p && pellets[i].ps === side) c += pelletPipeDmg();
    for (let i = 0; i < popRockets.length; i++) if (popRockets[i].tgt === p && popRockets[i].side === side) c += 3;
    for (let i = 0; i < toys.length; i++) if (toys[i].tgt === p && toys[i].side === side) c += 2;
    return c;
  }
  function pipeCandidate() {
    if (!(state === State.PLAY && level >= PIPE_BREAK_MIN_LEVEL)) return null;
    let best = null, bc = 1e9;
    for (let i = 0; i < pipes.length; i++) {
      const p = pipes[i];
      if (!p.bits || !pipeBreakOk(p)) continue;
      for (let s = 0; s < p.bits.length; s++) {
        const bit = p.bits[s];
        if (!bit || bit.gone) continue;
        const q = window.SkyHopObstacles.bitXY(p.x, p.gapY, bit, frame);
        if (q.x < bird.x + 24 || q.x > W - 8) continue;
        const hp = bit.hp | 0;
        if (hp + pipeCover(p, s) >= pipeHp()) continue;
        const cost = Math.abs(bird.y - q.y) + Math.max(0, q.x - bird.x) * 0.35;
        if (cost < bc) { bc = cost; best = { p: p, side: s }; }
      }
    }
    return best;
  }
  function pipeAim(p, side) {
    if (p.bits && p.bits[side] && !p.bits[side].gone) return window.SkyHopObstacles.bitXY(p.x, p.gapY, p.bits[side], frame);
    return { x: p.x + p.w / 2, y: side === "t" ? pipeEdge(p, "t") - 14 : pipeEdge(p, "b") + 14 };
  }
  function pipeAimY(p, side) { return pipeAim(p, side).y; }
  function crumblePipe(p, side, w) {
    const bit = p.bits && p.bits[side];
    if (!bit || bit.gone) return;
    bit.gone = true;
    bstat.crumbled++;
    const q = window.SkyHopObstacles.bitXY(p.x, p.gapY, bit, frame);
    const meta = window.SkyHopObstacles.KIND_META[bit.kind] || window.SkyHopObstacles.KIND_META.rock;
    const fxo = bitFx(bit);
    for (let i = 0; i < 10 && particles.length < maxParticles() - 2; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1.2 + Math.random() * 2.4;
      addParticle(q.x, q.y, Math.cos(a) * sp, Math.sin(a) * sp - 0.6, 18 + Math.random() * 10, 28, meta.chip[i % meta.chip.length], 2.2 + Math.random() * 2);
    }
    chunkFx(q.x, q.y, 10, fxo, 0);
    smokeFx(q.x, q.y, 6, 16);
    confettiBurst(q.x, q.y, 22);
    wHit(w || "pellet", q.x, q.y, true);
    rings.push({ x: q.x, y: q.y, r: 6, max: bit.r + 18, life: 1, color: "255,255,255" });
    floaters.push({ x: q.x, y: q.y - bit.r, text: "Poof!", life: 46, color: "#ffffff" });
    burstReward(2, q.x, q.y - bit.r - 8);
    screenShake = Math.max(screenShake, 0.16);
    sweep(520, 180, 0.2, "triangle", 0.03);
  }
  /** A hit on one compact obstacle. dmg: pellet 1, poof 2, zap 2, rocket 3. */
  function crackPipe(p, side, dmg, x, y, pel, wk) {
    if (!pipeBreakOk(p) || !p.bits) return false;
    const bit = p.bits[side];
    if (!bit || bit.gone) return false;
    if (pel && frame - (bit.hit == null ? -99 : bit.hit) < PIPE_HIT_GAP) return true;
    bit.hit = frame;
    bit.hp = (bit.hp | 0) + dmg;
    bstat.cracked++;
    const w = wk || (pel ? "pellet" : (dmg >= 3 ? "rocket" : "toy"));
    poofFx(x, y, false);
    wHit(w, x, y, w === "rocket");
    if (bit.hp >= pipeHp()) crumblePipe(p, side, w);
    else { chunkFx(x, y, 3, bitFx(bit), 0); beep(300 + Math.random() * 60, 0.04, "square", 0.02); }
    return true;
  }
  function crackPipesNear(x, y, R, dmg) {
    for (let i = 0; i < pipes.length; i++) {
      const p = pipes[i];
      if (!p.bits || !pipeBreakOk(p)) continue;
      for (let s = 0; s < p.bits.length; s++) {
        const bit = p.bits[s];
        if (!bit || bit.gone) continue;
        const q = window.SkyHopObstacles.bitXY(p.x, p.gapY, bit, frame);
        const dx = q.x - x, dy = q.y - y;
        if (dx * dx + dy * dy < (R + bit.r) * (R + bit.r)) crackPipe(p, s, dmg, q.x, q.y);
      }
    }
  }
  function burstTargets(needFree) {
    const out = [];
    for (let i = 0; i < hunters.length; i++) { const h = hunters[i]; if (h.x > bird.x + 10 && h.x < W + 8 && !(needFree && h.stun > 0)) out.push(h); }
    out.sort(function (a, b) { return Math.abs(a.y - bird.y) + (a.x - bird.x) * 0.5 - Math.abs(b.y - bird.y) - (b.x - bird.x) * 0.5; });
    return out;
  }
  /** v1.19: ONE helper weapon at a time. Picking up a different one replaces the running one (the same kind just adds to it). */
  function clearOthers(kind) {
    { const w = weaponNow(); if (w.length && !(w.length === 1 && w[0] === kind)) dropFxOf(kind); }
    if (kind !== "pellet") { pelletFrames = 0; pelletCd = 0; pellets.length = 0; }
    if (kind !== "pop") { popQueue = 0; popHold = 0; popRockets.length = 0; }
    if (kind !== "poof") { poofQueue = 0; poofHold = 0; toys.length = 0; }
    if (kind !== "zap") { zapQueue = 0; zapHold = 0; zaps.length = 0; }
  }
  function dropFxOf(kind) {   // v1.19: when the weapon changes, the previous weapon's leftover effects are cleared too, so looks never mix
    if (kind !== "pellet") sparks.length = 0;
    if (kind !== "pop") flames.length = 0;
    for (let i = blasts.length - 1; i >= 0; i--) if ((kind !== "pop" && blasts[i].f) || (kind !== "zap" && !blasts[i].f)) blasts.splice(i, 1);
    if (kind !== "zap") bolts.length = 0;
  }
  function weaponNow() { const o = []; if (pelletFrames > 0 || pellets.length) o.push("pellet"); if (popQueue > 0 || popRockets.length) o.push("pop"); if (poofQueue > 0 || toys.length) o.push("poof"); if (zapQueue > 0 || zaps.length) o.push("zap"); return o; }
  let heldWeapon = null; // { kind, ammo, max } stored until the player holds Use. Ammo does not fall while it is waiting.
  let weaponFiring = false, keyFire = false, fireCd = 0;
  const fireIds = new Set();
  const FIRE_BTN = { x: 36, y: 470, r: 26, hit: 40 };
  const WPN_LABEL = { pellet: "Pellet Burst", pop: "Rocket Pop", zap: "Zap Wand", poof: "Poof Toy" };
  function weaponOccupied() { return !!(heldWeapon && heldWeapon.ammo > 0) || weaponNow().length > 0; }
  function ammoPack(kind) {
    const reserve = E.hasMastery(save, "reserve");
    if (kind === "pellet") return Math.round((PELLET_FRAMES + pk().pelletFrames) * (reserve ? 1.25 : 1));
    if (kind === "pop") return POP_ROCKETS + pk().popExtra + (reserve ? 5 : 0);
    if (kind === "zap") return ZAP_BASE + (reserve ? 3 : 0);
    if (kind === "poof") return POOF_BASE_TOYS + pk().poofExtra + (reserve ? 2 : 0);
    return 0;
  }
  function storeWeapon(kind) {
    if (!WPN_LABEL[kind] || weaponOccupied()) return false;
    const n = ammoPack(kind);
    heldWeapon = { kind: kind, ammo: n, max: n };
    fireCd = 0;
    burstBanner = { text: WPN_LABEL[kind] + " ready", life: 80, color: (POWERUP_INFO[kind] && POWERUP_INFO[kind].color) || "#fff" };
    return true;
  }
  function refreshFiring() { weaponFiring = fireIds.size > 0 || keyFire; }
  function fireHit(pt) {
    if (!pt || !heldWeapon || heldWeapon.ammo <= 0) return false;
    const dx = pt.x - FIRE_BTN.x, dy = pt.y - FIRE_BTN.y;
    return dx * dx + dy * dy <= FIRE_BTN.hit * FIRE_BTN.hit;
  }
  function tickHeldFire() {
    if (!heldWeapon || heldWeapon.ammo <= 0) { if (heldWeapon && heldWeapon.ammo <= 0) heldWeapon = null; return; }
    if (!weaponFiring || state !== State.PLAY || pauseMode) return;
    const k = heldWeapon.kind;
    if (k === "pellet") {
      heldWeapon.ammo--;
      if (fireCd <= 0) { firePellet(); fireCd = Math.max(2, PELLET_EVERY - pk().pelletCut); }
      else fireCd--;
    } else if (fireCd > 0) fireCd--;
    else if (k === "pop") {
      if (launchPopRocket(0)) { heldWeapon.ammo--; fireCd = Math.max(6, POP_EVERY - pk().rocketCut); }
      else fireCd = 6;
    } else if (k === "zap") {
      zapStrike(zapTarget());
      heldWeapon.ammo--;
      fireCd = ZAP_EVERY;
    } else if (k === "poof") {
      tossToy(poofTarget());
      heldWeapon.ammo--;
      fireCd = Math.max(18, POOF_EVERY - pk().poofCut);
    }
    if (heldWeapon && heldWeapon.ammo <= 0) { heldWeapon = null; weaponFiring = false; keyFire = false; fireIds.clear(); fireCd = 0; }
  }
  function startPelletBurst() { clearOthers("pellet"); burstBanner = { text: "Pellet Burst!", life: 80, color: "#ff2d8a" }; const add = PELLET_FRAMES + pk().pelletFrames; pelletFrames = Math.min(pelletFrames + add, add * STACK_MAX); pelletTotal = Math.max(pelletFrames, 1); if (pelletCd < 0) pelletCd = 0; sweep(700, 1200, 0.2, "triangle", 0.03); }   // v1.18: a new pickup extends the burst (up to 2x)
  function startRocketPop() { clearOthers("pop"); burstBanner = { text: "Rocket Pop!", life: 80, color: "#7a4cff" }; const add = POP_ROCKETS + pk().popExtra; if (popQueue <= 0) { popLaunched = 0; popCd = 0; } popQueue = Math.min(popQueue + add, add * STACK_MAX); popTotal = Math.max(popQueue, 1); popHold = POP_HOLD; sweep(300, 760, 0.25, "triangle", 0.035); }
  function hunterCover(h) {
    let c = h.dmg | 0;
    for (let i = 0; i < pellets.length; i++) if (pellets[i].t === h) c += pelletHurt();
    for (let i = 0; i < popRockets.length; i++) if (popRockets[i].tgt === h) c += 2;
    return c;
  }
  function pelletSpeed() { return 8.2; }
  /** v1.18: the nearest hunter in front that still needs hits (used to retarget a pellet whose hunter was already poofed away). */
  function nextHunterFor(x, y) {
    let best = null, bd = 1e9;
    for (let i = 0; i < hunters.length; i++) { const h = hunters[i]; if (h.x > x + 6 && h.x < W + 8 && hunterCover(h) < hunterHp(h)) { const d = Math.abs(h.y - y) + (h.x - x) * 0.5; if (d < bd) { bd = d; best = h; } } }
    return best;
  }
  function firePellet() {
    let h = null, pp = null, ps = null;
    const tg = burstTargets(false);
    for (let i = 0; i < tg.length; i++) if (hunterCover(tg[i]) < hunterHp(tg[i])) { h = tg[i]; break; }
    if (!h) { const c = pipeCandidate(); if (c) { pp = c.p; ps = c.side; } }
    const sx = bird.x + 16, sy = bird.y + 2, sp = pelletSpeed();
    let ang = (Math.random() - 0.5) * 0.12;
    if (h) ang = Math.atan2(h.y - sy, Math.max(30, h.x - sx));
    else if (pp) { const aim = pipeAim(pp, ps); ang = Math.atan2(aim.y - sy, Math.max(30, aim.x - sx)); }
    ang = Math.max(-1.45, Math.min(1.45, ang));
    pellets.push({ x: sx, y: sy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 90, c: (frame >> 1) % PELLET_COLS.length, t: h, pp: pp, ps: ps });
    if (frame % 30 === 0) beep(900 + Math.random() * 200, 0.03, "triangle", 0.01);
  }
  function launchPopRocket(i) {
    if (popRockets.length >= MAX_POP_ROCKETS + Math.floor(pk().popExtra / 8)) return false;
    let target = null, kind = "hunter", side = null;
    const tg = burstTargets(false);
    for (let j = 0; j < tg.length; j++) if (hunterCover(tg[j]) < hunterHp(tg[j])) { target = tg[j]; break; }
    if (!target) { const c = pipeCandidate(); if (c) { target = c.p; kind = "pipe"; side = c.side; } }
    if (!target) {
      for (let j = 0; j < projectiles.length; j++) { const q = projectiles[j]; if (q.x > bird.x + 10 && q.x < W + 8) { let taken = false; for (let k = 0; k < popRockets.length; k++) if (popRockets[k].tgt === q) taken = true; if (!taken) { target = q; kind = "proj"; break; } } }
    }
    if (!target) return false;   // nothing to pop yet: the rocket waits in the queue
    const spread = ((i % 3) - 1) * 0.3;
    popRockets.push({ tr: [], x: bird.x + 22, y: bird.y + ((i % 3) - 1) * 11, a: (kind === "hunter" ? Math.atan2(target.y - (bird.y + ((i % 3) - 1) * 11), Math.max(30, target.x - bird.x - 22)) : spread * 0.8 - 0.1), sp: 4.8, life: 150, tgt: target, kind: kind, side: side, wob: i * 2 });
    sweep(260, 520, 0.14, "triangle", 0.025);
    return true;
  }
  function startPoofToy() {
    clearOthers("poof");
    burstBanner = { text: "Poof Toy!", life: 80, color: "#1fc9a0" };
    poofTotal = POOF_BASE_TOYS + pk().poofExtra; if (poofQueue <= 0) { poofCd = 18; poofShown = false; } poofQueue = Math.min(poofQueue + poofTotal, poofTotal * STACK_MAX); poofHold = POOF_HOLD;
    sweep(420, 900, 0.22, "triangle", 0.03);
  }
  function poofTarget() {
    const tg = burstTargets(true);
    for (let i = 0; i < tg.length; i++) { let taken = false; for (let k = 0; k < toys.length; k++) if (toys[k].tgt === tg[i]) taken = true; if (!taken && tg[i].x < W - 14) return { ref: tg[i], kind: "hunter" }; }
    for (let j = 0; j < projectiles.length; j++) {
      const q = projectiles[j]; let taken = false;
      for (let k = 0; k < toys.length; k++) if (toys[k].tgt === q) taken = true;
      if (!taken && q.x > bird.x + 40 && q.x < W - 10) return { ref: q, kind: "proj" };
    }
    const pc = pipeCandidate();
    if (pc) return { ref: pc.p, kind: "pipe", side: pc.side };
    return null;
  }
  function tossToy(tg) {
    const sx = bird.x + 14, sy = bird.y + 6;
    toys.push({ sx: sx, sy: sy, x: sx, y: sy, t: 0, tgt: tg ? tg.ref : null, kind: tg ? tg.kind : "spot", side: tg ? tg.side : null, fx: tg ? (tg.kind === "pipe" ? pipeAim(tg.ref, tg.side).x : tg.ref.x) : bird.x + 130, fy: tg ? (tg.kind === "pipe" ? pipeAim(tg.ref, tg.side).y : tg.ref.y - (tg.kind === "hunter" ? 4 : 0)) : Math.min(PLAY_H - 30, bird.y + 60), spin: 0 });
    sweep(500, 340, 0.12, "triangle", 0.02);
  }
  function startZapWand() {
    clearOthers("zap");
    burstBanner = { text: "Zap Wand!", life: 80, color: "#2f8fff" };
    if (zapQueue <= 0) { zapCd = 14; zapShown = false; }
    zapQueue = Math.min(zapQueue + ZAP_BASE, ZAP_BASE * STACK_MAX); zapTotal = Math.max(zapQueue, 1); zapHold = ZAP_HOLD;
    sweep(500, 1300, 0.2, "sawtooth", 0.02);
  }
  function zapTarget() {
    const tg = burstTargets(false);
    for (let i = 0; i < tg.length; i++) if (tg[i].x < W - 10) return { ref: tg[i], kind: "hunter" };
    for (let j = 0; j < projectiles.length; j++) { const q = projectiles[j]; if (q.x > bird.x + 30 && q.x < W - 10) return { ref: q, kind: "proj" }; }
    const pc = pipeCandidate();
    if (pc) return { ref: pc.p, kind: "pipe", side: pc.side };
    return null;
  }
  const zaps = [];   // v1.19 Zap Wand orbs { x, y, a, t, tg, lx, ly }
  function zapStrike(tg) {
    zapStrikes++;
    if (zaps.length >= MAX_ZAPS) zaps.shift();
    const a = (Math.random() - 0.5) * 2.2;   // random launch direction, then a jittery zig-zag towards the target
    zaps.push({ x: bird.x + 16, y: bird.y, a: a, t: 0, tg: tg, lx: bird.x + 16, ly: bird.y });
    beep(900 + Math.random() * 300, 0.04, "sawtooth", 0.015);
  }
  function zapPos(tg) {
    if (!tg) return null;
    if (tg.kind === "hunter") return hunters.indexOf(tg.ref) >= 0 ? [tg.ref.x, tg.ref.y - 6] : null;
    if (tg.kind === "proj") return projectiles.indexOf(tg.ref) >= 0 ? [tg.ref.x, tg.ref.y] : null;
    if (tg.kind === "pipe") { if (pipes.indexOf(tg.ref) < 0 || !sideLive(tg.ref, tg.side)) return null; const aim = pipeAim(tg.ref, tg.side); return [aim.x, aim.y]; }
    return null;
  }
  function updateZapOrbs() {
    for (let i = zaps.length - 1; i >= 0; i--) {
      const z = zaps[i]; z.t++;
      let tp = zapPos(z.tg);
      if (!tp && z.tg && z.tg.kind === "hunter") { const h2 = nextHunterFor(z.x, z.y); if (h2) { z.tg = { ref: h2, kind: "hunter" }; tp = zapPos(z.tg); } }
      if (!tp && z.tg) z.tg = null;
      if (tp) { let da = Math.atan2(tp[1] - z.y, tp[0] - z.x) - z.a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2; z.a += Math.max(-0.32, Math.min(0.32, da)); }
      z.a += (Math.random() - 0.5) * (tp ? 0.9 : 1.3);   // the random zig-zag
      const sp = 7.6; z.x += Math.cos(z.a) * sp; z.y += Math.sin(z.a) * sp;
      if ((z.t & 1) === 0) { boltFx(z.lx, z.ly, z.x, z.y, 3, ELEC[(z.t >> 1) & 3]); z.lx = z.x; z.ly = z.y; }
      let done = false;
      if (tp) { const dx = tp[0] - z.x, dy = tp[1] - z.y; if (dx * dx + dy * dy < 18 * 18 || z.t > 90) { zapHit(z.tg, tp[0], tp[1]); done = true; } }
      else if (z.t > 34 || z.x > W + 10 || z.y < -10 || z.y > PLAY_H + 10) { const sg = pipeSegAt(z.x, z.y, 10); if (sg) crackPipe(sg.p, sg.side, 2, z.x, z.y, false, "zap"); else wHit("zap", z.x, z.y, false); done = true; }
      if (done) zaps.splice(i, 1);
    }
  }
  function zapHit(tg, tx, ty) {
    if (tg && tg.kind === "hunter") { tx = tg.ref.x; ty = tg.ref.y - 6; }
    else if (tg && tg.kind === "proj") { tx = tg.ref.x; ty = tg.ref.y; }
    else if (tg && tg.kind === "pipe") { const aim = pipeAim(tg.ref, tg.side); tx = aim.x; ty = aim.y; }
    zapFx(tx, ty, 3); blastFx(tx, ty, 34);   // the electric pop
    if (tg && tg.kind === "hunter") {
      const h = tg.ref; hurtHunter(h, 2, 110, 4, false, "zap");
      // the arc jumps to a second hunter close by
      let h2 = null, bd = 150 * 150; for (let i = 0; i < hunters.length; i++) { const o = hunters[i]; if (o === h) continue; const dx = o.x - tx, dy = o.y - ty; if (dx * dx + dy * dy < bd) { bd = dx * dx + dy * dy; h2 = o; } }
      if (h2) { boltFx(tx, ty, h2.x, h2.y - 6, 5, ELEC[2]); hurtHunter(h2, 1, 80, 3, false, "zap"); }
    } else if (tg && tg.kind === "proj") {
      const k = projectiles.indexOf(tg.ref); if (k >= 0) projectiles.splice(k, 1); poofFx(tx, ty, false); wHit("zap", tx, ty, false);
    } else if (tg && tg.kind === "pipe") {
      crackPipe(tg.ref, tg.side, 2, tx, ty, false, "zap");
    } else wHit("zap", tx, ty, false);
    screenShake = Math.max(screenShake, 0.08);
    beep(1300 + Math.random() * 300, 0.05, "sawtooth", 0.018);
  }
  function updateZap() {
    if (zapQueue <= 0) return;
    if (--zapHold <= 0) { zapQueue = 0; return; }
    if (--zapCd > 0) return;
    const tg = zapTarget();
    if (tg) { zapStrike(tg); zapQueue--; zapCd = ZAP_EVERY; zapShown = true; }
    else if (!zapShown && zapHold < ZAP_HOLD - 110) { zapStrike(null); zapQueue--; zapCd = ZAP_EVERY; zapShown = true; }   // nothing to zap yet: one demo arc so the pickup is never invisible
    else zapCd = 6;
  }
  function confettiBurst(x, y, R) {
    const n = Math.round(24 + R * 0.5);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1.2 + Math.random() * (R / 11);
      if (confetti.length >= MAX_CONFETTI) confetti.shift();
      confetti.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.5, life: 44 + Math.random() * 26, max: 70, c: (i + (frame >> 2)) % CONFETTI_COLS.length, w: 3.4 + Math.random() * 3 });
    }
  }
  function poofToyGo(x, y) {
    // v1.19: Poof Toy = pastel confetti poof only (mint / pink), no lightning, no fire, no sparks: dazes hunters, pops nets / bolts and cracks pipes inside the radius.
    const R = POOF_R + pk().poofR;
    poofFx(x, y, true);
    confettiBurst(x, y, R);
    smokeFx(x, y, 8, 18);
    rings.push({ x: x, y: y, r: 6, max: R * 0.9, life: 1, color: "255,150,215" }); rings.push({ x: x, y: y, r: 4, max: R * 0.75, life: 1, color: "120,240,200" });
    rings.push({ x: x, y: y, r: 8, max: R, life: 1, color: "255,214,240" });
    rings.push({ x: x, y: y, r: 4, max: R * 0.62, life: 1, color: "190,240,255" });
    for (let i = 0; i < hunters.length; i++) {
      const h = hunters[i], dx = h.x - x, dy = (h.y - 4) - y;
      if (!(h.stun > 0) && dx * dx + dy * dy < (R + 14) * (R + 14)) stunHunter(h, 130, 5);
    }
    for (let j = projectiles.length - 1; j >= 0; j--) {
      const q = projectiles[j], dx = q.x - x, dy = q.y - y;
      if (dx * dx + dy * dy < (R + q.r) * (R + q.r)) { projectiles.splice(j, 1); poofFx(q.x, q.y, false); }
    }
    crackPipesNear(x, y, R, 2);
    screenShake = Math.max(screenShake, 0.12);
    sweep(700, 220, 0.2, "triangle", 0.03); beep(980, 0.05, "sine", 0.02);
  }
  function updatePoofToys() {
    if (poofQueue > 0) {
      poofHold--;
      if (poofHold <= 0) poofQueue = 0;
      else if (--poofCd <= 0 && toys.length < MAX_TOYS) {
        const tg = poofTarget();
        if (tg) { tossToy(tg); poofQueue--; poofCd = Math.max(18, POOF_EVERY - pk().poofCut); poofShown = true; }
        else if (!poofShown && poofHold < POOF_HOLD - 110) { tossToy(null); poofQueue--; poofCd = Math.max(18, POOF_EVERY - pk().poofCut); poofShown = true; }   // nothing to poof yet: one toy still pops so the pickup is never invisible
        else poofCd = 6;
      }
    }
    for (let i = toys.length - 1; i >= 0; i--) {
      const q = toys[i]; q.t++; q.spin += 0.32;
      if (q.tgt) {
        const alive = q.kind === "hunter" ? hunters.indexOf(q.tgt) >= 0 : (q.kind === "pipe" ? (pipes.indexOf(q.tgt) >= 0 && sideLive(q.tgt, q.side)) : projectiles.indexOf(q.tgt) >= 0);
        if (alive) { if (q.kind === "pipe") { const aim = pipeAim(q.tgt, q.side); q.fx = aim.x; q.fy = aim.y; } else { q.fx = q.tgt.x; q.fy = q.tgt.y - (q.kind === "hunter" ? 4 : 0); } } else q.tgt = null;
      }
      const p = Math.min(1, q.t / POOF_FLIGHT);
      if (q.arc === undefined) { q.arc = 30 + Math.random() * 90; q.sway = (Math.random() - 0.5) * 60; }   // v1.19: every toy is lobbed on its own random arc
      q.x = q.sx + (q.fx - q.sx) * p + q.sway * Math.sin(p * Math.PI); q.y = q.sy + (q.fy - q.sy) * p - q.arc * 4 * p * (1 - p);
      if ((q.t & 1) === 0) addParticle(q.x, q.y, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, 16, 22, CONFETTI_COLS[(q.t >> 1) % CONFETTI_COLS.length], 3);   // colourful trail
      if (p >= 1) { toys.splice(i, 1); poofToyGo(q.x, q.y); }
    }
  }
  function updateFxBits() {
    for (let i = chunks.length - 1; i >= 0; i--) { const c = chunks[i]; c.life--; c.vy += 0.2; c.vx *= 0.98; c.x += c.vx; c.y += c.vy; c.rot += c.vr; if (c.life <= 0) chunks.splice(i, 1); }
    for (let i = bolts.length - 1; i >= 0; i--) { if (--bolts[i].life <= 0) bolts.splice(i, 1); }
    for (let i = blasts.length - 1; i >= 0; i--) { if (--blasts[i].life <= 0) blasts.splice(i, 1); }
    for (let i = flames.length - 1; i >= 0; i--) { const c = flames[i]; c.life--; c.vy -= 0.03; c.x += c.vx; c.y += c.vy; c.vx *= 0.94; if (c.life <= 0) flames.splice(i, 1); }
    for (let i = sparks.length - 1; i >= 0; i--) { const c = sparks[i]; c.life--; c.vy += 0.06; c.vx *= 0.98; c.x += c.vx; c.y += c.vy; c.rot += c.vr; if (c.life <= 0) sparks.splice(i, 1); }
    for (let i = puffs.length - 1; i >= 0; i--) { const c = puffs[i]; c.life--; c.r += c.vr; c.vr *= 0.94; c.x += c.vx; c.y += c.vy; if (c.life <= 0) puffs.splice(i, 1); }
    for (let i = confetti.length - 1; i >= 0; i--) {
      const c = confetti[i]; c.life--; c.vy += 0.09; c.vx *= 0.985; c.x += c.vx; c.y += c.vy; c.rot += c.vr;
      if (c.life <= 0) confetti.splice(i, 1);
    }
  }
  function updateBurstFx() {
    if (burstBanner && --burstBanner.life <= 0) burstBanner = null;
    fxMul = 1;   // v1.19: only one helper weapon is ever active, so no thinning is needed (kept as a safety hook)
    if (!(pelletFrames > 0 || popQueue > 0 || zapQueue > 0 || zaps.length || pellets.length || popRockets.length || poofQueue > 0 || toys.length || confetti.length || sparks.length || blasts.length || puffs.length || bolts.length || flames.length || chunks.length)) return;
    if (state !== State.PLAY) { resetBurst(); return; }
    if (burstAllowed()) {
      if (pelletFrames > 0) { pelletFrames--; if (--pelletCd <= 0 && pellets.length < MAX_PELLETS) { firePellet(); pelletCd = Math.max(2, PELLET_EVERY - pk().pelletCut); } }
      if (popQueue > 0) {
        if (--popHold <= 0) popQueue = 0;
        else if (--popCd <= 0) { if (launchPopRocket(popLaunched)) { popLaunched++; popQueue--; popCd = Math.max(6, POP_EVERY - pk().rocketCut); } else popCd = 6; }
      }
    }
    if (burstAllowed()) updateZap();
    updateZapOrbs();
    updatePoofToys();
    updateFxBits();
    for (let i = pellets.length - 1; i >= 0; i--) {
      const p = pellets[i];
      // v1.18: pellets home onto their hunter (re-aimed every frame, constant speed) and fly straight past pipes on the way;
      // a pellet whose hunter is already gone picks the next hunter in front, otherwise it flies on / cracks pipes as before.
      if (p.t && hunters.indexOf(p.t) < 0) p.t = nextHunterFor(p.x, p.y);
      let tx = null, ty = null;
      if (p.t) { tx = p.t.x; ty = p.t.y; }
      else if (p.pp && pipes.indexOf(p.pp) >= 0 && sideLive(p.pp, p.ps)) { const aim = pipeAim(p.pp, p.ps); tx = aim.x; ty = aim.y; }
      if (tx !== null) {
        const sp = pelletSpeed();
        let da = Math.atan2(ty - p.y, tx - p.x) - Math.atan2(p.vy, p.vx);
        while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
        const an = Math.atan2(p.vy, p.vx) + Math.max(-0.3, Math.min(0.3, da));
        p.vx = Math.cos(an) * sp; p.vy = Math.sin(an) * sp;
      }
      p.x += p.vx; p.y += p.vy; p.life--;
      let gone = p.life <= 0 || p.x > W + 20 || p.y < -10 || p.y > PLAY_H + 10;
      if (!gone) {
        for (let j = 0; j < hunters.length; j++) {
          const h = hunters[j];
          if (p.x > h.x - (h.hw || 17) && p.x < h.x + (h.hw || 17) && p.y > h.y - (h.hh || 21) && p.y < h.y + (h.hh || 21)) { hurtHunter(h, pelletHurt(), 90, 3, true); gone = true; break; }
        }
      }
      if (!gone && !p.t) {
        const sg = pipeSegAt(p.x, p.y, 5);
        if (sg) { crackPipe(sg.p, sg.side, pelletPipeDmg(), p.x, p.y, true); gone = true; }
      }
      if (!gone) {
        for (let j = projectiles.length - 1; j >= 0; j--) {
          const q = projectiles[j]; const dx = q.x - p.x, dy = q.y - p.y, rr = q.r + 4;
          if (dx * dx + dy * dy < rr * rr) { projectiles.splice(j, 1); poofFx(q.x, q.y, false); gone = true; break; }
        }
      }
      if (gone) { if (p.x < W) rings.push({ x: p.x, y: p.y, r: 2, max: 14, life: 1, color: "255,255,255" }); pellets.splice(i, 1); }
    }
    for (let i = popRockets.length - 1; i >= 0; i--) {
      const r = popRockets[i];
      r.life--; r.wob += 0.35;
      for (let fk = 0; fk < 2; fk++) flameFx(r.x - Math.cos(r.a) * (17 + fk * 7), r.y - Math.sin(r.a) * (17 + fk * 7), -Math.cos(r.a) * 1.3 + (Math.random() - 0.5) * 1, -Math.sin(r.a) * 1.3 + (Math.random() - 0.5) * 1, 12 + Math.random() * 5, 6.5 + Math.random() * 3.5);   // flame trail
      let tx = null, ty = 0;
      if (r.kind === "hunter" && r.tgt && hunters.indexOf(r.tgt) < 0) r.tgt = nextHunterFor(r.x, r.y);   // v1.18: its hunter is already gone: chase the next one
      if (r.tgt) {
        if (r.kind === "pipe") { if (pipes.indexOf(r.tgt) >= 0 && sideLive(r.tgt, r.side)) { const aim = pipeAim(r.tgt, r.side); tx = aim.x; ty = aim.y; } }
        else if (r.kind === "hunter" ? hunters.indexOf(r.tgt) >= 0 : projectiles.indexOf(r.tgt) >= 0) { tx = r.tgt.x; ty = r.tgt.y; }
      }
      if (tx !== null) {
        let da = Math.atan2(ty - r.y, tx - r.x) - r.a;
        while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
        r.a += Math.max(-0.17, Math.min(0.17, da));
      } else r.a *= 0.97;
      r.sp = Math.min(7.2, r.sp + 0.14);
      r.x += Math.cos(r.a) * r.sp; r.y += Math.sin(r.a) * r.sp;
      let pop = false;
      const sg = r.kind === "pipe" || !r.tgt ? pipeSegAt(r.x, r.y, 8) : null;   // v1.18: rockets chasing a hunter / bolt fly past pipes
      if (sg) { pop = true; crackPipe(sg.p, sg.side, 3, r.x, r.y); poofFx(r.x, r.y, true); fireBurst(r.x, r.y, 14); zapFx(r.x, r.y, 3); sparkRing(r.x, r.y, 8, 3.2); screenShake = Math.max(screenShake, 0.2); }
      if (!pop && tx !== null && r.kind !== "pipe") {
        const dx = tx - r.x, dy = ty - r.y;
        if (dx * dx + dy * dy < 22 * 22) {
          pop = true;
          if (r.kind === "hunter") { hurtHunter(r.tgt, 2, Math.round(150 * pk().popStun), 6); fireBurst(r.x, r.y, 16); sparkRing(r.x, r.y, 8, 3.4); screenShake = Math.max(screenShake, 0.2); }
          else { const k = projectiles.indexOf(r.tgt); if (k >= 0) projectiles.splice(k, 1); poofFx(r.x, r.y, true); fireBurst(r.x, r.y, 12); sparkRing(r.x, r.y, 6, 3); }
        }
      }
      if (!pop && (r.life <= 0 || r.x > W + 14 || r.y < -10 || r.y > PLAY_H + 10)) { pop = true; if (r.x < W + 4 && r.y > 0 && r.y < PLAY_H) { poofFx(r.x, r.y, true); fireBurst(r.x, r.y, 7); } }
      if (pop) popRockets.splice(i, 1);
    }
  }
  function pill(txt, x, y, col, size) {
    ctx.font = "bold " + size + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const w = ctx.measureText(txt).width + 14, h = size + 8, px = Math.max(w / 2 + 2, Math.min(W - w / 2 - 2, x));
    ctx.fillStyle = col; ctx.strokeStyle = "rgba(255,255,255,0.95)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px - w / 2 + h / 2, y - h / 2); ctx.lineTo(px + w / 2 - h / 2, y - h / 2); ctx.arc(px + w / 2 - h / 2, y, h / 2, -Math.PI / 2, Math.PI / 2); ctx.lineTo(px - w / 2 + h / 2, y + h / 2); ctx.arc(px - w / 2 + h / 2, y, h / 2, Math.PI / 2, -Math.PI / 2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#ffffff"; ctx.fillText(txt, px, y + 0.5);
  }
  function drawPoofToy(x, y, rot, s) {
    // a round, smiling toy: mint body, pink polka dots, yellow cap, ring pull. Clearly a toy.
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
    ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.beginPath(); ctx.arc(0, 1, 14, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(6.5, -12.5, 3.4, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#2ee6b0"; ctx.strokeStyle = "#0b6f5c"; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.ellipse(0, 1, 9, 9.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.beginPath(); ctx.arc(-4.6, -3, 1.9, 0, Math.PI * 2); ctx.arc(5.2, 5, 1.7, 0, Math.PI * 2); ctx.arc(-3, 7, 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffd24a"; ctx.strokeStyle = "#0b6f5c"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.rect(-4, -12.6, 8, 4.6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#ff5fa2"; ctx.beginPath(); ctx.rect(2.2, -14.6, 5, 2.2); ctx.fill();
    ctx.fillStyle = "#17415c"; ctx.beginPath(); ctx.arc(-2.4, 0, 1.2, 0, Math.PI * 2); ctx.arc(2.6, 0, 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#17415c"; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.arc(0.1, 1.8, 2.6, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.restore();
  }
  /** cracks on a pipe half in the world's own style: stage 1 hairline, 2 crack + branch, 3 wide crack with chips; flash right after a hit. */
  function drawPipeCracks(p, topH, botY) {
    const fx = obstFx(p), full = Math.max(2, pipeHp());
    for (const side of ["t", "b"]) {
      const hp = (side === "t" ? p.hpT : p.hpB) | 0; if (hp < 1 || sideGone(p, side)) continue;
      const st = hp >= full * 0.7 ? 3 : (hp >= full * 0.4 ? 2 : 1);
      const e = side === "t" ? topH - PIPE_CAP : botY + PIPE_CAP, d = side === "t" ? -1 : 1, x0 = p.x + p.w * 0.5;
      const hf = side === "t" ? p.hitT : p.hitB;
      ctx.save(); ctx.lineJoin = "round"; ctx.lineCap = "round";
      const path = () => {
        ctx.beginPath(); ctx.moveTo(x0 - 6, e); ctx.lineTo(x0 - 1, e + d * 12);
        if (st >= 2) { ctx.lineTo(x0 - 8, e + d * 24); ctx.lineTo(x0 + 2, e + d * 38); ctx.moveTo(x0 - 1, e + d * 12); ctx.lineTo(x0 + 10, e + d * 20); }
        if (st >= 3) { ctx.lineTo(x0 + 8, e + d * 34); ctx.moveTo(x0 - 8, e + d * 24); ctx.lineTo(x0 - 15, e + d * 34); ctx.moveTo(x0 + 2, e + d * 38); ctx.lineTo(x0 + 9, e + d * 52); ctx.moveTo(x0 - 6, e); ctx.lineTo(x0 - 16, e + d * 8); }
      };
      if (fx.glow && st >= 2) { ctx.strokeStyle = fx.glow; ctx.lineWidth = st >= 3 ? 8 : 5.5; path(); ctx.stroke(); }
      ctx.strokeStyle = fx.crack; ctx.lineWidth = st >= 3 ? 3 : (st === 2 ? 2.4 : 1.6); path(); ctx.stroke();
      ctx.strokeStyle = fx.hi; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0 - 4, e); ctx.lineTo(x0 + 1, e + d * 12); if (st >= 2) ctx.lineTo(x0 - 6, e + d * 24); ctx.stroke();
      if (st >= 3) { ctx.fillStyle = fx.cols[1]; for (let k = 0; k < 3; k++) { const wob = Math.sin(frame * 0.3 + k * 2 + (side === "t" ? 0 : 1)) * 1.2; ctx.fillRect(x0 - 12 + k * 11 + wob, e + d * (4 + k * 3) - 1.5, 3, 3); } }
      if (hf !== undefined && frame - hf < 5) { ctx.globalAlpha = 0.5 - (frame - hf) * 0.1; ctx.fillStyle = "#ffffff"; ctx.fillRect(p.x + 3, side === "t" ? topH - PIPE_CAP - 40 : botY, p.w - 6, 40 + PIPE_CAP); }
      ctx.restore();
    }
  }
  /** the short capped stump a crumbled half regrows in later worlds (a visible, fair box; the original gap is never made smaller) */
  function drawPipeStub(p, topH, botY, body, rs, bx, bw, capT, capB) {
    const h = stubH(p); if (h <= 1 || !p.cr) return;
    const side = p.cr, fx = obstFx(p);
    ctx.save();
    if (side === "t") {
      ctx.beginPath(); ctx.rect(p.x - 4, topH - h, p.w + 8, h); ctx.clip();
      ctx.drawImage(body.c, bx * rs, Math.max(0, PLAY_H - h) * rs, bw * rs, h * rs, p.x + bx, topH - h, bw, h);
      ctx.drawImage(capT.c, p.x - 2, topH - PIPE_CAP - 2, capT.w, capT.h);
    } else {
      ctx.beginPath(); ctx.rect(p.x - 4, botY, p.w + 8, h); ctx.clip();
      ctx.drawImage(body.c, bx * rs, 0, bw * rs, h * rs, p.x + bx, botY, bw, h);
      ctx.drawImage(capB.c, p.x - 2, botY - 2, capB.w, capB.h);
    }
    ctx.restore();
    // rough broken end with the style's chip colour
    const ey = side === "t" ? topH - h : botY + h, dd = side === "t" ? -1 : 1;
    ctx.fillStyle = fx.cols[0]; ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(p.x - 1, ey);
    const n = 5, w = (p.w + 2) / n; for (let i = 0; i < n; i++) { ctx.lineTo(p.x - 1 + w * (i + 0.5), ey + dd * (i % 2 ? 2 : 7)); ctx.lineTo(p.x - 1 + w * (i + 1), ey); }
    ctx.lineTo(p.x + p.w + 1, ey - dd * 0.5); ctx.lineTo(p.x - 1, ey - dd * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  function drawChunks() {
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i]; ctx.globalAlpha = Math.min(1, c.life / 14); ctx.fillStyle = c.c; ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot);
      const s = c.s; ctx.beginPath();
      if (c.k === "shard") { ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, s * 0.8); ctx.lineTo(-s * 0.7, s * 0.6); ctx.closePath(); }
      else if (c.k === "brick") ctx.rect(-s * 0.8, -s * 0.55, s * 1.6, s * 1.1);
      else if (c.k === "blob") ctx.arc(0, 0, s * 0.75, 0, Math.PI * 2);
      else if (c.k === "splinter") ctx.rect(-s * 0.2, -s, s * 0.45, s * 2);
      else if (c.k === "spine") { ctx.moveTo(0, -s * 1.1); ctx.lineTo(s * 0.25, s * 0.9); ctx.lineTo(-s * 0.25, s * 0.9); ctx.closePath(); }
      else { ctx.moveTo(-s, -s * 0.3); ctx.lineTo(-s * 0.2, -s * 0.9); ctx.lineTo(s * 0.9, -s * 0.4); ctx.lineTo(s * 0.7, s * 0.7); ctx.lineTo(-s * 0.5, s * 0.8); ctx.closePath(); }
      ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  function drawBurstFx() {
    drawChunks();
    // v1.17: short name tag above a Pellet Burst / Rocket Pop pickup so it is easy to spot
    for (let i = 0; i < powerups.length; i++) {
      const u = powerups[i]; if ((u.kind !== "pellet" && u.kind !== "pop" && u.kind !== "poof" && u.kind !== "zap") || u.x < 10 || u.x > W + 20) continue;
      const info = POWERUP_INFO[u.kind], y = u.y + Math.sin(u.bob) * 3;
      for (let k = 0; k < 4; k++) { const a = frame * 0.06 + k * 1.571, rr = POWERUP_R + 14 + Math.sin(frame * 0.2 + k) * 2; ctx.globalAlpha = 0.9; ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(u.x + Math.cos(a) * rr, y + Math.sin(a) * rr, 2, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    for (let i = 0; i < pellets.length; i++) {
      // v1.19: pellet size and look are back to the 1.17 geometry (core radius 6.8, glow 12, ring 8.2, small 3-bit tail); only the colour cycles through the rainbow
      const p = pellets[i], col = PELLET_COLS[p.c % PELLET_COLS.length], sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1, ux = p.vx / sp, uy = p.vy / sp;
      ctx.lineCap = "round"; ctx.strokeStyle = col; ctx.globalAlpha = 0.35; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(p.x - ux * 22, p.y - uy * 22); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.globalAlpha = 1; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.x - ux * 11, p.y - uy * 11); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.x, p.y, PELLET_R * 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(p.x - 0.8, p.y - 0.8, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    // flame trail (behind the rockets): white-yellow core, orange, red tips
    for (let i = 0; i < flames.length; i++) {
      const c = flames[i], t = c.life / c.max;
      ctx.globalAlpha = Math.min(0.95, t * 1.3); ctx.fillStyle = t > 0.66 ? "#fff3a0" : (t > 0.33 ? "#ffb02e" : "#ff4b2a");
      ctx.beginPath(); ctx.arc(c.x, c.y, c.s * (0.55 + t * 0.7), 0, Math.PI * 2); ctx.fill();
      if (t > 0.5) { ctx.globalAlpha = 0.5; ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(c.x, c.y, c.s * 0.3, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < popRockets.length; i++) {
      const r = popRockets[i], hi = ((frame >> 1) + i * 7) % 36;
      ctx.globalAlpha = 0.3; ctx.fillStyle = RB[hi]; ctx.beginPath(); ctx.arc(r.x, r.y, 19, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.a); ctx.scale(2.1, 2.1);
      ctx.fillStyle = RB[(hi + 12) % 36]; ctx.beginPath(); ctx.moveTo(-3, -4); ctx.lineTo(-9, -8); ctx.lineTo(-7, -2); ctx.closePath(); ctx.moveTo(-3, 4); ctx.lineTo(-9, 8); ctx.lineTo(-7, 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#5a2fd0"; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-8, -3.6); ctx.lineTo(4, -3.6); ctx.quadraticCurveTo(11, 0, 4, 3.6); ctx.lineTo(-8, 3.6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = RB[hi]; ctx.beginPath(); ctx.moveTo(3, -3.4); ctx.quadraticCurveTo(10, 0, 3, 3.4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = RB[(hi + 8) % 36]; ctx.fillRect(-6, -3.4, 2.4, 6.8); ctx.fillStyle = RB[(hi + 22) % 36]; ctx.fillRect(-2.4, -3.4, 2.4, 6.8);
      ctx.fillStyle = "#6ad4ff"; ctx.beginPath(); ctx.arc(1, 0, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    for (let i = 0; i < puffs.length; i++) {
      const c = puffs[i]; ctx.globalAlpha = Math.min(0.85, c.life / c.max * 1.1); ctx.fillStyle = SMOKE_COLS[c.c];
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = Math.min(0.5, c.life / c.max); ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // cartoon starbursts (a spiky rainbow flash that pops open and fades)
    for (let i = 0; i < blasts.length; i++) {
      const b = blasts[i], pr = 1 - b.life / b.max, rr = b.r * (0.35 + 0.85 * pr), flick = ((frame >> 1) & 1) === 0;
      ctx.globalAlpha = Math.min(1, b.life / 6) * 0.95;
      for (let layer = 0; layer < 2; layer++) {
        const R2 = layer ? rr * 0.55 : rr;
        if (b.f) { ctx.fillStyle = layer ? (flick ? "#fff2a0" : "#ffd24a") : (flick ? "#ff7a1a" : "#ff4a1a"); ctx.strokeStyle = layer ? "#ffb347" : "#b8220a"; } else { ctx.fillStyle = layer ? (flick ? "#fff7a0" : "#ffffff") : (flick ? "#59e0ff" : "#ffe94a"); ctx.strokeStyle = layer ? "#ffffff" : "#1a8fd8"; } ctx.lineWidth = layer ? 1 : 2.4;
        ctx.beginPath(); for (let k = 0; k < 16; k++) { const rad = k % 2 ? R2 * 0.52 : R2, a = -Math.PI / 2 + k * Math.PI / 8 + pr * 0.5; ctx.lineTo(b.x + Math.cos(a) * rad, b.y + Math.sin(a) * rad); } ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < sparks.length; i++) {
      const c = sparks[i]; ctx.globalAlpha = Math.min(1, c.life / 14);
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot); ctx.fillStyle = c.col || (c.c ? "#fff2a8" : "#ffd000"); ctx.strokeStyle = c.col ? "#ffffff" : "#e08a00"; ctx.lineWidth = 1.2;
      ctx.beginPath(); for (let k = 0; k < 10; k++) { const rr = k % 2 ? c.w * 0.45 : c.w, a = -Math.PI / 2 + k * Math.PI / 5; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < confetti.length; i++) {
      const c = confetti[i]; ctx.globalAlpha = Math.min(1, c.life / 18);
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot); ctx.fillStyle = CONFETTI_COLS[c.c];
      if (c.c % 3 === 0) { ctx.beginPath(); ctx.arc(0, 0, c.w * 0.5, 0, Math.PI * 2); ctx.fill(); } else ctx.fillRect(-c.w / 2, -c.w * 0.3, c.w, c.w * 0.6);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < toys.length; i++) { ctx.globalAlpha = 0.28 + Math.sin(frame * 0.5 + i) * 0.1; ctx.fillStyle = "#7ff0d0"; ctx.beginPath(); ctx.arc(toys[i].x, toys[i].y, 20, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; drawPoofToy(toys[i].x, toys[i].y, toys[i].spin, 1.4); }
    for (let i = 0; i < zaps.length; i++) {   // v1.19 Zap Wand orb: electric blue glow, yellow ring, white core
      const z = zaps[i], fl = 1 + Math.sin(frame * 0.9 + i) * 0.15;
      ctx.globalAlpha = 0.35; ctx.fillStyle = "#3aa8ff"; ctx.beginPath(); ctx.arc(z.x, z.y, 13 * fl, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = "#7fd8ff"; ctx.beginPath(); ctx.arc(z.x, z.y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#ffe14a"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(z.x, z.y, 3.2, 0, Math.PI * 2); ctx.fill();
    }
    // lightning arcs: a white core inside a rainbow glow
    if (bolts.length) {
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      for (let i = 0; i < bolts.length; i++) {
        const b = bolts[i]; ctx.globalAlpha = Math.min(1, b.life / 3); ctx.beginPath(); ctx.moveTo(b.pts[0][0], b.pts[0][1]); for (let k = 1; k < b.pts.length; k++) ctx.lineTo(b.pts[k][0], b.pts[k][1]);
        ctx.strokeStyle = RB[b.c]; ctx.lineWidth = 9; ctx.globalAlpha = Math.min(1, b.life / 3) * 0.35; ctx.stroke(); ctx.globalAlpha = Math.min(1, b.life / 3); ctx.lineWidth = 5; ctx.stroke(); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2.2; ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (false && burstBanner) {
      const t = burstBanner.life, s = 1 + Math.max(0, t - 68) * 0.03; ctx.save(); ctx.globalAlpha = Math.min(1, t / 14); ctx.translate(W / 2, 182); ctx.scale(s, s);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }


  /** Called from spawnPipe BEFORE coins. Returns true when this pipe carries a power-up (no coin then). */
  function maybeSpawnPowerup(p) {
    puPipesSince++;
    puRunPipes++;
    let kind = POWERUP_INFO[puForceKind] ? puForceKind : null; // unknown / retired kinds are ignored
    // A running helper blocks the next helper offer until that helper is fully gone (no pellets, rockets, toys, or zaps left).
    const helperLive = weaponOccupied();
    // v1.18 pity timer: when the helper clock runs out, the next free pipe carries the least-recently-seen helper pickup (never on top of another pickup / ride / boss window)
    if (!kind && !helperLive && !wpnHoldOn && wpnClock >= wpnDue && !powerups.length && !puMode) { const wk = wpnPick(); if (wk) kind = wk; }
    if (!kind && magClock >= MAG_DUE && !powerups.length && !puMode && puMagnetFrames <= 0 && (wpnHoldOn || wpnClock < wpnDue - 150)) kind = "magnet";
    // v1.16: guarantee the first Rocket Boost / Spaceship of a run (needs a free slot: no pickup on screen, no ride mode active)
    if (!kind && !puRideSeen && puRunPipes >= PU_GUARANTEE_PIPES && level >= PU_MIN_LEVEL && !powerups.length && !puMode) kind = Math.random() < 0.5 ? "rocket" : "ship";
    // v1.17: guaranteed first Pellet Burst (about run pipe 12) and first Rocket Pop (by about pipe 20, level 3+); never on a boss level or the level before one
    if (!kind && !helperLive && !wpnHoldOn && !powerups.length && burstSpawnOk() && (wpnSeq === 0 || wpnClock >= 150)) {
      if (!puPelletSeen && puRunPipes >= PU_PELLET_GUARANTEE_PIPES) kind = "pellet";
      else if (!puPopSeen && puRunPipes >= PU_POP_GUARANTEE_PIPES && !puMode && burstSpawnOk(3)) kind = "pop";
      else if (!puPoofSeen && level >= PU_POOF_MIN_LEVEL && puRunPipes >= PU_POOF_GUARANTEE_PIPES && burstSpawnOk(PU_POOF_MIN_LEVEL)) kind = "poof";
    }
    if (!kind) {
      if (level < PU_MIN_LEVEL || powerups.length || puPipesSince < PU_MIN_GAP_PIPES - pk().puGapCut || Math.random() >= PU_CHANCE) return false;
      const pool = POWERUP_KINDS.filter(function (k) { return !(k === "shield" && shieldUp()) && !(PU_MODE_KINDS[k] && puMode); });
      // Swallow Rocket Recharge: Rocket Boosts are more common (and the gap between power-ups is shorter)
      // v1.17: Pellet Burst / Rocket Pop join the pool from level 2 (never on or right before a boss level); Rocket Boost + Spaceship keep ~40% of the pickups
      if (level >= PU_NEW_MIN_LEVEL) {
        if (!puMode) pool.push("rocket", "ship");
      }
      const rw = pk().rocketWeight;
      if (rw > 1 && pool.indexOf("rocket") >= 0) for (let i = 1; i < rw; i++) pool.push("rocket");
      kind = pool[Math.floor(Math.random() * pool.length)];
    }
    puForceKind = null;
    puPipesSince = 0;
    if (kind === "rocket" || kind === "ship") puRideSeen = true;
    if (kind === "pellet") puPelletSeen = true;
    if (kind === "pop") puPopSeen = true;
    if (kind === "poof") puPoofSeen = true;
    if (kind === "magnet") magClock = 0;
    if (WPN_MIN_LV[kind]) wpnPlaced(kind);
    powerups.push({ x: p.x + p.w / 2, y: p.gapY, kind: kind, pipe: p, dx: p.w / 2, gy: 0, bob: Math.random() * 6 });
    return true;
  }

  function grantPowerup(kind) {
    if (!POWERUP_INFO[kind]) return; // unknown / retired kinds are ignored
    if (WPN_MIN_LV[kind]) { wpnLog.push({ run: wpnRun, t: wpnT, kind: kind, lv: level, ev: "got" }); if (wpnLog.length > 4000) wpnLog.shift(); }
    puCollected++;
    const info = POWERUP_INFO[kind];
    if (kind === "shield") {
      shieldCharges = Math.max(shieldCharges, 1);
      sfxShieldUp();
    } else if (kind === "magnet") {
      puMagnetFrames = Math.round(PU_MAGNET_FRAMES * pk().magnetMul);
      sfxMagnet();
    } else if (kind === "pellet" || kind === "pop" || kind === "poof" || kind === "zap") {
      if (burstAllowed()) storeWeapon(kind);
    } else if (PU_MODE_KINDS[kind]) {
      startPuMode(kind);
    }
    rings.push({ x: bird.x, y: bird.y, r: 8, max: 40, life: 1, color: info.ring });
    if (particles.length < maxParticles() - 8) spawnParticles(bird.x, bird.y, 6, "#ffffff");
    puPop = { kind: kind, life: 34, color: info.ring || "255,255,255" };   // wordless icon pop
    haptic("score");
  }

  let puPop = null;
  function drawPuPop() {
    if (!puPop) return;
    const t = puPop.life / 34, k = 1 - t;
    ctx.save(); ctx.translate(bird.x, bird.y);
    ctx.globalAlpha = 0.45 * t; ctx.fillStyle = "rgba(" + puPop.color + ",1)"; ctx.beginPath(); ctx.arc(0, 0, bird.r + 6 + k * 16, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = t; ctx.strokeStyle = "rgba(" + puPop.color + ",1)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, bird.r + 10 + k * 26, 0, Math.PI * 2); ctx.stroke();
    ctx.translate(0, -bird.r - 14 - k * 10); const s = 0.6 + Math.min(1, k * 4) * 0.5; ctx.scale(s, s);
    try { const sp = powerupSprite(puPop.kind); ctx.drawImage(sp.c, -sp.w / 2, -sp.h / 2, sp.w, sp.h); } catch (_) {}
    ctx.restore(); ctx.globalAlpha = 1;
    if (--puPop.life <= 0) puPop = null;
  }
  function updatePowerups() {
    for (let i = powerups.length - 1; i >= 0; i--) {
      const u = powerups[i];
      if (u.pipe && pipes.indexOf(u.pipe) >= 0) {
        u.x = u.pipe.x + u.dx;
        u.y = u.pipe.gapY;
      } else {
        u.pipe = null;
        if (!(u.pulled && puMagnetFrames > 0)) u.x -= pipeSpeed * ws;
      }
      u.bob += 0.08;
      if (state === State.PLAY && puMagnetFrames > 0) {   // v1.19c: the running Magnet pulls pickups in too
        const mx = bird.x - u.x, my = bird.y - u.y, md = Math.hypot(mx, my) || 1;
        if (md < MAG_PICK_R) { u.pipe = null; u.pulled = true; const sp = Math.min(md, 6 + (1 - md / MAG_PICK_R) * 6); u.x += mx / md * sp; u.y += my / md * sp; }
      }
      if (state === State.PLAY) {
        const dx = bird.x - u.x, dy = bird.y - (u.y + Math.sin(u.bob) * 3);
        const rr = POWERUP_R + bird.r;
        if (dx * dx + dy * dy < rr * rr) {
          powerups.splice(i, 1);
          grantPowerup(u.kind);
          continue;
        }
      }
      if (u.x < -30) powerups.splice(i, 1);
    }
  }


  // —— v1.11 ride modes: Rocket Boost / Power Bird / Spaceship (count pipes, can't crash while active) ——
  function startPuMode(kind) {
    puMode = kind;
    puModeTotal = kind === "rocket" ? ROCKET_PIPES : kind === "ship" ? SHIP_PIPES : POWER_MIN + Math.floor(Math.random() * (POWER_MAX - POWER_MIN + 1)) + (kind === "power" ? pk().powerBonus : 0);
    puModeLeft = puModeTotal;
    puModeT = 0;
    shipFireCd = 10;
    if (kind === "rocket") sweep(220, 880, 0.35, "sawtooth", 0.05);
    else if (kind === "power") sweep(160, 90, 0.35, "square", 0.06);
    else sweep(500, 1200, 0.3, "triangle", 0.05);
    screenShake = Math.max(screenShake, 0.3);
  }
  function endPuMode() {
    if (!puMode) return;
    puMode = null;
    puModeLeft = 0;
    shipRockets.length = 0;
    // never end inside a pipe: anything overlapping the bird now is passable, plus a short grace
    for (const p of pipes) if (p.x < bird.x + bird.r + 6 && p.x + p.w > bird.x - bird.r - 6) p.ghostPass = true;
    invulnFrames = Math.max(invulnFrames, 45);

  }
  function onPuModePipe() {
    if (!puMode) return;
    puModeLeft--;
    if (puModeLeft <= 0) endPuMode();
  }
  function smashPipe(p, x, y) {
    if (p.smashed) return;
    p.smashed = true;
    p.ghostPass = true;
    pipesSmashed++;
    const pd = pipeStyleDef(p.style == null ? 0 : p.style);
    const col = pd.body[1];
    const n = quality >= 2 ? 6 : 12;
    for (let i = 0; i < n && particles.length < maxParticles() - 2; i++) {
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 4;
      addParticle(x != null ? x : p.x + p.w / 2, (y != null ? y : p.gapY) + (Math.random() - 0.5) * 120, Math.cos(a) * sp, Math.sin(a) * sp - 1, 22 + Math.random() * 14, 36, i % 3 ? col : pd.cap, 3 + Math.random() * 3);
    }
    screenShake = Math.max(screenShake, 0.45);
    beep(90 + Math.random() * 40, 0.12, "square", 0.05);
    haptic("near");
  }
  /** Per-frame (PLAY only). Called before pipes move. */
  function tickPuMode() {
    puVis += ((puMode === "power" ? POWER_SCALE : 1) - puVis) * 0.15;
    if (Math.abs(puVis - 1) < 0.004) puVis = 1;
    if (!puMode) return;
    puModeT++;
    if (puMode === "rocket") {
      let tp = null;
      for (const q of pipes) if (!q.scored && q.x + q.w > bird.x - bird.r && (!tp || q.x < tp.x)) tp = q;
      const ty = tp ? tp.gapY : PLAY_H / 2;
      bird.y += (ty - bird.y) * 0.16;
      bird.vy = 0;
      if (frame % (quality >= 2 ? 3 : 1) === 0 && particles.length < maxParticles() - 4) addParticle(bird.x - 20, bird.y + 6 + (Math.random() * 6 - 3), -5 - Math.random() * 2, (Math.random() - 0.5), 14, 14, Math.random() < 0.5 ? "#ffb02e" : "#ff5a1a", 3);
    } else if (puMode === "ship") {
      if (--shipFireCd <= 0) {
        let tp = null;
        for (const q of pipes) if (!q.smashed && !q.shipTarget && q.x > bird.x + 10 && q.x < bird.x + 300 && (!tp || q.x < tp.x)) tp = q;
        if (tp) { tp.shipTarget = true; shipRockets.push({ x: bird.x + 26, y: bird.y + 14, pipe: tp }); sweep(900, 300, 0.12, "square", 0.03); shipFireCd = 16; }
        else shipFireCd = 4;
      }
      for (let i = shipRockets.length - 1; i >= 0; i--) {
        const r = shipRockets[i];
        r.x += 9 + pipeSpeed * ws;
        r.y += (r.pipe.gapY - r.y) * 0.08;
        if (r.x >= r.pipe.x + 4 || pipes.indexOf(r.pipe) < 0) { if (pipes.indexOf(r.pipe) >= 0) smashPipe(r.pipe, r.pipe.x + 4, r.y); shipRockets.splice(i, 1); }
      }
    }
  }
  function puModeWorldMul() { return puMode === "rocket" ? ROCKET_WORLD_MUL : 1; }
  /** Power Bird: bigger hit circle for smashing (visual size). */
  function powerHits(p) {
    if (!p.bits || p.smashed) return false;
    const r = bird.r * puVis;
    return window.SkyHopObstacles.hitIndex(bird.x, bird.y, r, p.x, p.gapY, p.bits, frame) >= 0;
  }
  /** Drawn behind the bird: rocket pack / spaceship. Bird-centred coordinates. */
  function drawPuModeBack() {
    if (state !== State.PLAY || !puMode) return;
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.scale(BIRD_VISUAL_SCALE, BIRD_VISUAL_SCALE);
    if (puMode === "rocket") {
      ctx.fillStyle = "#c92a2a"; roundRect(-26, -2, 20, 10, 4); ctx.fill();
      ctx.fillStyle = "#e9ecef"; ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(2, 3); ctx.lineTo(-6, 8); ctx.closePath(); ctx.fill();
      const fl = 10 + Math.sin(frame * 0.9) * 4;
      ctx.fillStyle = "#ffb02e"; ctx.beginPath(); ctx.moveTo(-26, -1); ctx.lineTo(-26 - fl, 3); ctx.lineTo(-26, 7); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff3bf"; ctx.beginPath(); ctx.moveTo(-26, 1); ctx.lineTo(-26 - fl * 0.5, 3); ctx.lineTo(-26, 5); ctx.closePath(); ctx.fill();
    } else if (puMode === "ship") {
      const sp = sprite("puShip", 96, 48, function () {
        ctx.fillStyle = "#4dabf7";
        ctx.beginPath(); ctx.moveTo(6, 28); ctx.quadraticCurveTo(40, 12, 88, 26); ctx.quadraticCurveTo(60, 40, 10, 38); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#1c7ed6"; ctx.fillRect(10, 34, 70, 4);
        ctx.fillStyle = "#e9ecef"; ctx.beginPath(); ctx.moveTo(20, 30); ctx.lineTo(6, 14); ctx.lineTo(30, 26); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(20, 36); ctx.lineTo(4, 46); ctx.lineTo(34, 38); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#868e96"; ctx.fillRect(62, 34, 20, 5);
        ctx.fillStyle = "#ffd43b"; ctx.beginPath(); ctx.arc(70, 27, 3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(20, 26); ctx.quadraticCurveTo(44, 18, 80, 25); ctx.stroke();
      });
      ctx.drawImage(sp.c, -50, -8, sp.w, sp.h);
      const fl = 8 + Math.sin(frame * 0.8) * 3;
      ctx.fillStyle = "#74c0fc"; ctx.beginPath(); ctx.moveTo(-44, 20); ctx.lineTo(-44 - fl, 24); ctx.lineTo(-44, 28); ctx.closePath(); ctx.fill();
    } else if (puMode === "power") {
      ctx.globalAlpha = 0.25 + Math.sin(frame * 0.3) * 0.1;
      ctx.fillStyle = "#ff6b6b";
      ctx.beginPath(); ctx.arc(0, 0, 16 * puVis + 8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function drawShipRockets() {
    if (!shipRockets.length) return;
    for (const r of shipRockets) {
      ctx.fillStyle = "#ff8787"; roundRect(r.x - 8, r.y - 2.5, 14, 5, 2.5); ctx.fill();
      ctx.fillStyle = "#ffd43b"; ctx.beginPath(); ctx.moveTo(r.x - 8, r.y - 2); ctx.lineTo(r.x - 16, r.y); ctx.lineTo(r.x - 8, r.y + 2); ctx.closePath(); ctx.fill();
    }
  }
  function drawPuModeHud() {
    if (state !== State.PLAY || !puMode) return;
    const info = POWERUP_INFO[puMode];
    const txt = (puMode === "rocket" ? "🚀 " : puMode === "ship" ? "🛸 " : "💥 ") + puModeLeft;
    ctx.fillStyle = "rgba(10,20,40,0.6)";
    roundRect(W / 2 - 34, 108, 68, 24, 12); ctx.fill();
    ctx.fillStyle = info.color; ctx.fillRect(W / 2 - 26, 128, 52 * (puModeLeft / puModeTotal), 2);
    flashText("pumode", txt, 14, "#ffffff", "rgba(0,0,0,0.4)", 3, W / 2, 120, 1);
  }

  // —— v1.11 black hole / wormhole: VERY rare, rides in a pipe gap, warps the bird 5 levels ahead ——
  const BH_MIN_LEVEL = 6, BH_CHANCE = 0.01, BH_MIN_GAP_PIPES = 80, BH_MAX_PER_RUN = 2, BH_SKIP = 5, BH_R = 17;
  const blackholes = [];       // { x, y, pipe, dx, spin }
  let bhPipesSince = 0, bhRun = 0, bhForce = false, warpFlash = 0, bhUsed = 0;
  function maybeSpawnBlackHole(p) {
    if (!bhForce) {
      if (level < BH_MIN_LEVEL || isBossLevel(level) || puMode || blackholes.length || bhRun >= BH_MAX_PER_RUN || bhPipesSince < BH_MIN_GAP_PIPES || level + BH_SKIP > MAX_LEVEL) return false;
      if (Math.random() >= BH_CHANCE) return false;
    }
    bhForce = false;
    bhPipesSince = 0;
    bhRun++;
    blackholes.push({ x: p.x + p.w / 2, y: p.gapY, pipe: p, dx: p.w / 2, spin: 0 });
    return true;
  }
  function updateBlackHoles() {
    if (warpFlash > 0) warpFlash = Math.max(0, warpFlash - 0.025);
    for (let i = blackholes.length - 1; i >= 0; i--) {
      const h = blackholes[i];
      if (h.pipe && pipes.indexOf(h.pipe) >= 0) { h.x = h.pipe.x + h.dx; h.y = h.pipe.gapY; }
      else { h.pipe = null; h.x -= pipeSpeed * ws; }
      h.spin += 0.12;
      if (state === State.PLAY) {
        const dx = bird.x - h.x, dy = bird.y - h.y, rr = BH_R + bird.r * 0.7;
        if (dx * dx + dy * dy < rr * rr) { blackholes.splice(i, 1); enterBlackHole(); return; }
      }
      if (h.x < -40) blackholes.splice(i, 1);
    }
  }
  function enterBlackHole() {
    const prevScore = score;
    const target = Math.min(MAX_LEVEL, level + BH_SKIP);
    score = Math.max(score, (target - 1) * PIPES_PER_LEVEL);
    bhUsed++;
    pipes.length = 0;
    clearCoins();
    powerups.length = 0;
    blackholes.length = 0;
    shipRockets.length = 0;
    nextSpawn = Math.round(spawnEvery * 0.8);
    invulnFrames = Math.max(invulnFrames, 70);
    bird.vy = 0;
    onScoreChanged(prevScore);
    runCheckpoint = Math.max(runCheckpoint, E.checkpointFor(level));
    warpFlash = 1;
    sweep(1400, 60, 0.9, "sine", 0.07);
    screenShake = Math.max(screenShake, 0.8);
    haptic("evolve");
    pushToast("Wormhole! Jumped ahead " + BH_SKIP + " levels", "#b197fc", null, 2);
  }
  function drawBlackHoles() {
    for (const h of blackholes) {
      if (h.x < -40 || h.x > W + 40) continue;
      const sp = sprite("bhCore", 60, 60, function () {
        const g = ctx.createRadialGradient(30, 30, 2, 30, 30, 29);
        g.addColorStop(0, "#000000"); g.addColorStop(0.45, "#05000f"); g.addColorStop(0.62, "#5f3dc4"); g.addColorStop(0.8, "rgba(177,151,252,0.6)"); g.addColorStop(1, "rgba(177,151,252,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(30, 30, 29, 0, Math.PI * 2); ctx.fill();
      });
      ctx.drawImage(sp.c, h.x - 30, h.y - 30, 60, 60);
      ctx.strokeStyle = "rgba(229,219,255,0.85)";
      ctx.lineWidth = 2;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.arc(h.x, h.y, 12 + k * 5, h.spin * (1 + k * 0.3) + k * 2, h.spin * (1 + k * 0.3) + k * 2 + 1.6);
        ctx.stroke();
      }
    }
  }
  function drawWarpFlash() {
    if (warpFlash <= 0) return;
    ctx.globalAlpha = Math.min(1, warpFlash * 1.2) * 0.75;
    ctx.fillStyle = "#e5dbff";
    ctx.fillRect(0, 0, W, PLAY_H);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(95,61,196," + (warpFlash * 0.8).toFixed(2) + ")";
    ctx.lineWidth = 3;
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(bird.x, bird.y, (1 - warpFlash) * 300 + k * 30, 0, Math.PI * 2); ctx.stroke(); }
  }

  function tickPowerupTimers() {
    if (weaponOccupied()) { wpnClock = 0; wpnDue = WPN_AFTER_MIN + Math.floor(Math.random() * (WPN_AFTER_MAX - WPN_AFTER_MIN + 1)); wpnBusyF++; } else if (!puMode) wpnClock++; wpnT++; if (puMagnetFrames <= 0) magClock++;   // a stored or running burst, or a ride, holds the next burst offer
   
    if (puMagnetFrames > 0) puMagnetFrames--;
  }

  function resetRun110() {
    powerups.length = 0;
    magClock = MAG_DUE - MAG_FIRST; wpnClock = 0; wpnDue = wpnNextDue(); wpnT = 0; wpnRun++; hunterAnn = -1; wpnLast.pellet = wpnLast.pop = wpnLast.poof = wpnLast.zap = 0; puPipesSince = PU_MIN_GAP_PIPES - 4; puRunPipes = 0; puRideSeen = false; // first one can come after a few pipes (still needs level 3)
    puMagnetFrames = 0; resetBurst(); burstCoins = 0; bstat.defeated = bstat.crumbled = bstat.cracked = 0; puPelletSeen = false; puPopSeen = false; puPoofSeen = false;
    puCollected = 0;
    puMode = null; puModeLeft = 0; puModeTotal = 0; puVis = 1;
    shipRockets.length = 0; pipesSmashed = 0;
    blackholes.length = 0; bhPipesSince = 0; bhRun = 0; warpFlash = 0;
    bossesCleared = 0;
    bigBannerT = 0;
  }

  function powerupSprite(kind) {
    const info = POWERUP_INFO[kind];
    const R = POWERUP_R;
    return sprite("pu:" + kind, R * 2 + 8, R * 2 + 8, function () {
      const c = R + 4;
      const g = ctx.createRadialGradient(c - 4, c - 5, 2, c, c, R + 2);
      g.addColorStop(0, "rgba(255,255,255,0.95)");
      g.addColorStop(0.45, info.color);
      g.addColorStop(1, "rgba(0,0,0,0.25)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c, c, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.2;
      if (kind === "shield") {
        ctx.beginPath();
        ctx.moveTo(c, c - 7); ctx.lineTo(c + 6, c - 4.5); ctx.lineTo(c + 5, c + 2); ctx.quadraticCurveTo(c + 3, c + 6, c, c + 8);
        ctx.quadraticCurveTo(c - 3, c + 6, c - 5, c + 2); ctx.lineTo(c - 6, c - 4.5); ctx.closePath();
        ctx.fill();
        ctx.fillStyle = info.color;
        ctx.fillRect(c - 1, c - 4, 2, 9);
      } else if (kind === "rocket") {
        ctx.beginPath(); ctx.moveTo(c + 8, c - 8); ctx.quadraticCurveTo(c + 2, c - 6, c - 3, c - 1); ctx.lineTo(c + 1, c + 3); ctx.quadraticCurveTo(c + 6, c - 2, c + 8, c - 8); ctx.fill();
        ctx.beginPath(); ctx.moveTo(c - 3, c - 1); ctx.lineTo(c - 7, c - 1); ctx.lineTo(c - 4, c - 4); ctx.closePath(); ctx.moveTo(c + 1, c + 3); ctx.lineTo(c + 1, c + 7); ctx.lineTo(c + 4, c + 4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#ffe066"; ctx.beginPath(); ctx.moveTo(c - 2, c + 2); ctx.lineTo(c - 8, c + 8); ctx.lineTo(c - 1, c + 5); ctx.closePath(); ctx.fill();
      } else if (kind === "power") {
        ctx.beginPath(); ctx.moveTo(c - 6, c - 6); ctx.lineTo(c - 2, c - 2); ctx.moveTo(c + 6, c - 6); ctx.lineTo(c + 2, c - 2); ctx.moveTo(c - 6, c + 6); ctx.lineTo(c - 2, c + 2); ctx.moveTo(c + 6, c + 6); ctx.lineTo(c + 2, c + 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(c, c, 3, 0, Math.PI * 2); ctx.fill();
      } else if (kind === "ship") {
        ctx.beginPath(); ctx.ellipse(c, c + 2, 8, 3.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(c, c - 1, 4, Math.PI, 0); ctx.fill();
        ctx.fillStyle = POWERUP_INFO.ship.color; ctx.fillRect(c - 5, c + 1, 2, 2); ctx.fillRect(c - 1, c + 1, 2, 2); ctx.fillRect(c + 3, c + 1, 2, 2);
      } else if (kind === "pellet") {
        ctx.beginPath(); ctx.arc(c - 6, c + 3, 2.4, 0, Math.PI * 2); ctx.arc(c - 1, c, 2.8, 0, Math.PI * 2); ctx.arc(c + 5, c - 3, 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(c - 3, c + 6, 1.4, 0, Math.PI * 2); ctx.arc(c + 3, c + 3, 1.4, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      } else if (kind === "zap") {
        ctx.beginPath(); ctx.moveTo(c + 3, c - 10); ctx.lineTo(c - 6, c + 1); ctx.lineTo(c - 0.5, c + 1); ctx.lineTo(c - 4, c + 10); ctx.lineTo(c + 6, c - 2); ctx.lineTo(c + 0.8, c - 2); ctx.closePath(); ctx.fill();
      } else if (kind === "poof") {
        ctx.beginPath(); ctx.arc(c - 1, c + 2, 7.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(c - 5, c - 8.6, 8, 3.4);
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(c + 6, c - 7, 3, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.6; ctx.fillRect(c + 8, c + 4, 2.4, 2.4); ctx.fillRect(c + 6, c + 8, 2, 2); ctx.globalAlpha = 1;
      } else if (kind === "pop") {
        ctx.save(); ctx.translate(c + 1, c - 1); ctx.rotate(-0.6);
        ctx.beginPath(); ctx.moveTo(-5, -2.6); ctx.lineTo(3, -2.6); ctx.quadraticCurveTo(8, 0, 3, 2.6); ctx.lineTo(-5, 2.6); ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.beginPath(); ctx.arc(c - 6, c + 5, 2.6, 0, Math.PI * 2); ctx.arc(c - 3, c + 7, 2, 0, Math.PI * 2); ctx.fill();
      } else {
        // horseshoe magnet, opening up, red pole tips
        ctx.lineWidth = 3.6;
        ctx.lineCap = "butt";
        ctx.beginPath();
        ctx.arc(c, c + 1, 5.2, 0, Math.PI, false);
        ctx.moveTo(c - 5.2, c + 1); ctx.lineTo(c - 5.2, c - 5);
        ctx.moveTo(c + 5.2, c + 1); ctx.lineTo(c + 5.2, c - 5);
        ctx.stroke();
        ctx.fillStyle = "#ff2d55";
        ctx.fillRect(c - 7, c - 8, 3.6, 3.4);
        ctx.fillRect(c + 3.4, c - 8, 3.6, 3.4);
      }
    });
  }

  /** Owl Pathfinder: a soft glow marks the centre of the next safe gap (visual hint only). */
  function drawPathfinder() {
    if (state !== State.PLAY) return;
    const n = pk().pathfinder;
    if (!n) return;
    const nextP = [];
    for (const q of pipes) if (!q.scored && !q.ghostPass && q.x + q.w > bird.x - bird.r) nextP.push(q);
    nextP.sort(function (a, b) { return a.x - b.x; });
    for (let i = 0; i < n && i < nextP.length; i++) {
      const q = nextP[i];
      const cx = q.x + q.w / 2, cy = q.gapY;
      if (cx > W + 30) continue;
      const pulse = 1 + Math.sin(frame * 0.12) * 0.12;
      ctx.save();
      ctx.globalAlpha = i === 0 ? 1 : 0.55;
      ctx.fillStyle = "rgba(160,255,240,0.2)";
      ctx.beginPath(); ctx.arc(cx, cy, 16 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(190,255,248,0.95)";
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(cx, cy, 11 * pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function drawPowerups() {
    for (let i = 0; i < powerups.length; i++) {
      const u = powerups[i];
      if (u.x < -30 || u.x > W + 30) continue;
      const y = u.y + Math.sin(u.bob) * 3;
      const nb = u.kind === "pellet" || u.kind === "pop" || u.kind === "poof" || u.kind === "zap";   // v1.17: brighter, bigger glow for the two new pickups
      ctx.globalAlpha = nb ? 0.55 + Math.sin(frame * 0.2 + i) * 0.15 : 0.28 + Math.sin(frame * 0.15 + i) * 0.1;
      ctx.fillStyle = POWERUP_INFO[u.kind].color;
      ctx.beginPath();
      ctx.arc(u.x, y, POWERUP_R + (nb ? 12 + Math.sin(frame * 0.2) * 2 : 6), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      const sp = powerupSprite(u.kind);
      if (nb) { ctx.save(); ctx.translate(u.x, y); ctx.scale(1.3, 1.3); ctx.drawImage(sp.c, -sp.w / 2, -sp.h / 2, sp.w, sp.h); ctx.restore(); } else ctx.drawImage(sp.c, u.x - sp.w / 2, y - sp.h / 2, sp.w, sp.h);
    }
  }

  /** Small timers for collected magnet / shield pickups (top-left, below the coins). */
  function drawPowerupHud() {
    if (state !== State.PLAY) return;
    let x = 6;
    const y = 64;
    const items = [];
    if (puMagnetFrames > 0) items.push(["magnet", Math.min(1, puMagnetFrames / PU_MAGNET_FRAMES)]);
    if (shieldCharges > 0) items.push(["shield", 1]);
    if (pelletFrames > 0) items.push(["pellet", Math.min(1, pelletFrames / Math.max(1, pelletTotal))]);
    if (popQueue > 0 || popRockets.length) items.push(["pop", Math.min(1, popQueue / Math.max(1, popTotal))]);
    if (poofQueue > 0) items.push(["poof", Math.min(1, poofQueue / Math.max(1, poofTotal))]);
    if (zapQueue > 0) items.push(["zap", Math.min(1, zapQueue / Math.max(1, zapTotal))]);
    for (const it of items) {
      const sp = powerupSprite(it[0]);
      ctx.fillStyle = "rgba(0,20,40,0.5)";
      roundRect(x, y, 26, 30, 7);
      ctx.fill();
      ctx.drawImage(sp.c, x + 13 - 10, y + 2, 20, 20);
      ctx.fillStyle = POWERUP_INFO[it[0]].color;
      ctx.fillRect(x + 3, y + 25, 20 * it[1], 3);
      x += 30;
    }
  }

  // —— World art (cached sprites per world; only the current + previous world stay in memory) ——
  function wkey(wi, k) { return "w" + (((wi % WORLDS.length) + WORLDS.length) % WORLDS.length) + ":" + k; }
  function evictWorldSprites() {
    const keep0 = wkey(worldIdx, ""), keep1 = wkey(worldFromIdx, "");
    for (const k of Array.from(spriteCache.keys())) {
      if (k.charAt(0) === "w" && k.indexOf(":") > 0 && k.indexOf(keep0) !== 0 && k.indexOf(keep1) !== 0 && /^w\d+:/.test(k)) spriteCache.delete(k);
    }
  }
  function hash01(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  function worldSkySprite(wi) {
    const d = worldDefAt(wi);
    return sprite(wkey(wi, "sky"), W, PLAY_H, function () {
      const g = ctx.createLinearGradient(0, 0, 0, PLAY_H);
      g.addColorStop(0, d.sky[0]);
      g.addColorStop(0.55, d.sky[1]);
      g.addColorStop(1, d.sky[2]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, PLAY_H);
      if (d.stars) {
        for (let i = 0; i < d.stars; i++) {
          const sx = hash01(i + wi * 50) * W, sy = hash01(i * 3.7 + 9) * PLAY_H * (d.id === "space" ? 0.95 : 0.6);
          ctx.fillStyle = "rgba(255,255,255," + (0.35 + hash01(i * 7.3) * 0.6).toFixed(2) + ")";
          const r = 0.6 + hash01(i * 1.9) * 1.3;
          ctx.fillRect(sx, sy, r, r);
        }
      }
      if (d.sun) {
        ctx.fillStyle = d.sun.glow;
        ctx.beginPath(); ctx.arc(d.sun.x, d.sun.y, d.sun.r * 1.7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = d.sun.c;
        ctx.beginPath(); ctx.arc(d.sun.x, d.sun.y, d.sun.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,150,90,0.35)";
        for (let i = 0; i < 3; i++) ctx.fillRect(d.sun.x - d.sun.r, d.sun.y + 8 + i * 10, d.sun.r * 2, 3);
      }
      if (d.moon) {
        ctx.fillStyle = "rgba(255,250,220,0.18)";
        ctx.beginPath(); ctx.arc(d.moon.x, d.moon.y, d.moon.r * 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff6d8";
        ctx.beginPath(); ctx.arc(d.moon.x, d.moon.y, d.moon.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = d.sky[0];
        ctx.beginPath(); ctx.arc(d.moon.x + 9, d.moon.y - 6, d.moon.r * 0.85, 0, Math.PI * 2); ctx.fill();
      }
      if (d.planet) {
        const p = d.planet;
        const pg = ctx.createRadialGradient(p.x - 12, p.y - 12, 4, p.x, p.y, p.r);
        pg.addColorStop(0, "#ffd0a0"); pg.addColorStop(0.6, "#e0703a"); pg.addColorStop(1, "#5a1f3a");
        ctx.fillStyle = pg;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(255,220,180,0.7)";
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 1.7, p.r * 0.38, -0.35, 0, Math.PI * 2); ctx.stroke();
        // nebula
        const ng = ctx.createRadialGradient(90, 300, 10, 90, 300, 160);
        ng.addColorStop(0, "rgba(255,90,200,0.22)"); ng.addColorStop(1, "rgba(255,90,200,0)");
        ctx.fillStyle = ng;
        ctx.fillRect(0, 120, 260, 360);
      }
    });
  }

  const FAR_TILE = 200;
  function worldFarSprite(wi) {
    const d = worldDefAt(wi);
    const f = d.far;
    const h = f.h;
    return sprite(wkey(wi, "far"), W + FAR_TILE * 2, h, function () {
      const tw = W + FAR_TILE * 2;
      if (f.kind === "dunes" || f.kind === "hillsPink") {
        ctx.fillStyle = f.c1;
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= tw; x += 4) ctx.lineTo(x, h - (h * 0.55) - Math.sin((x / FAR_TILE) * Math.PI * 2) * h * 0.22 - Math.sin((x / FAR_TILE) * Math.PI * 4 + 1) * h * 0.08);
        ctx.lineTo(tw, h); ctx.closePath(); ctx.fill();
        ctx.fillStyle = f.c2;
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= tw; x += 4) ctx.lineTo(x, h - h * 0.3 - Math.sin((x / FAR_TILE) * Math.PI * 2 + 2) * h * 0.15);
        ctx.lineTo(tw, h); ctx.closePath(); ctx.fill();
        if (f.kind === "dunes") {
          // sandstone mesa
          for (let x0 = 0; x0 < tw; x0 += FAR_TILE) {
            ctx.fillStyle = "#b8643a";
            ctx.fillRect(x0 + 120, h - 62, 46, 62);
            ctx.fillRect(x0 + 112, h - 66, 62, 8);
          }
        }
      } else if (f.kind === "peaks") {
        for (let x0 = -FAR_TILE; x0 < tw; x0 += FAR_TILE) {
          for (const [ox, ph, pw] of [[0, h, 130], [90, h * 0.75, 110]]) {
            ctx.fillStyle = f.c1;
            ctx.beginPath(); ctx.moveTo(x0 + ox, h); ctx.lineTo(x0 + ox + pw / 2, h - ph); ctx.lineTo(x0 + ox + pw, h); ctx.closePath(); ctx.fill();
            ctx.fillStyle = f.c2;
            ctx.beginPath(); ctx.moveTo(x0 + ox + pw / 2, h - ph); ctx.lineTo(x0 + ox + pw / 2 + pw * 0.16, h - ph * 0.68);
            ctx.lineTo(x0 + ox + pw / 2 + 4, h - ph * 0.74); ctx.lineTo(x0 + ox + pw / 2 - 6, h - ph * 0.64); ctx.lineTo(x0 + ox + pw / 2 - pw * 0.16, h - ph * 0.68); ctx.closePath(); ctx.fill();
          }
        }
      } else if (f.kind === "skyline") {
        for (let x0 = 0; x0 < tw; x0 += FAR_TILE) {
          const bl = [[0, 110, 34], [36, 150, 28], [66, 90, 40], [108, 165, 30], [140, 120, 36], [178, 75, 22]];
          for (let b = 0; b < bl.length; b++) {
            const [bx, bh, bw] = bl[b];
            ctx.fillStyle = f.c1;
            ctx.fillRect(x0 + bx, h - bh, bw, bh);
            for (let wy = h - bh + 8; wy < h - 6; wy += 11) {
              for (let wx = 4; wx < bw - 4; wx += 8) {
                if (hash01(x0 * 0 + b * 31 + wy * 0.7 + wx * 1.3) < 0.42) {
                  ctx.fillStyle = hash01(b + wy + wx) < 0.25 ? "rgba(120,220,255,0.75)" : "rgba(255,216,107,0.75)";
                  ctx.fillRect(x0 + bx + wx, wy, 4, 5);
                }
              }
            }
          }
          ctx.fillStyle = "#ff4fd8";
          ctx.fillRect(x0 + 120, h - 165 - 14, 2, 14);
        }
      } else if (f.kind === "reef") {
        for (let x0 = 0; x0 < tw; x0 += FAR_TILE) {
          ctx.fillStyle = f.c1;
          ctx.beginPath(); ctx.moveTo(x0, h);
          for (let x = 0; x <= FAR_TILE; x += 8) ctx.lineTo(x0 + x, h - 30 - Math.sin(x / 30) * 12);
          ctx.lineTo(x0 + FAR_TILE, h); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = "#2f9a6a"; ctx.lineWidth = 4;
          for (const kx of [20, 70, 150]) { ctx.beginPath(); ctx.moveTo(x0 + kx, h); ctx.quadraticCurveTo(x0 + kx + 14, h - 50, x0 + kx - 4, h - 95); ctx.stroke(); }
          ctx.strokeStyle = f.c2; ctx.lineWidth = 5; ctx.lineCap = "round";
          for (const cx of [110, 185]) { ctx.beginPath(); ctx.moveTo(x0 + cx, h - 20); ctx.lineTo(x0 + cx, h - 58); ctx.moveTo(x0 + cx, h - 38); ctx.lineTo(x0 + cx - 12, h - 56); ctx.moveTo(x0 + cx, h - 44); ctx.lineTo(x0 + cx + 11, h - 66); ctx.stroke(); }
          ctx.lineCap = "butt";
        }
      } else if (f.kind === "volcano") {
        for (let x0 = 0; x0 < tw; x0 += FAR_TILE) {
          ctx.fillStyle = f.c1;
          ctx.beginPath(); ctx.moveTo(x0 + 10, h); ctx.lineTo(x0 + 80, h - 120); ctx.lineTo(x0 + 110, h - 120); ctx.lineTo(x0 + 190, h); ctx.closePath(); ctx.fill();
          ctx.fillStyle = f.c2;
          ctx.beginPath(); ctx.moveTo(x0 + 80, h - 120); ctx.lineTo(x0 + 110, h - 120); ctx.lineTo(x0 + 104, h - 104); ctx.lineTo(x0 + 98, h - 70); ctx.lineTo(x0 + 92, h - 102); ctx.closePath(); ctx.fill();
          ctx.fillStyle = "rgba(255,120,30,0.35)";
          ctx.beginPath(); ctx.arc(x0 + 95, h - 124, 22, 0, Math.PI * 2); ctx.fill();
        }
      } else if (f.kind === "candy") {
        ctx.fillStyle = f.c1;
        ctx.beginPath(); ctx.moveTo(0, h);
        for (let x = 0; x <= tw; x += 4) ctx.lineTo(x, h - 40 - Math.sin((x / FAR_TILE) * Math.PI * 2) * 14);
        ctx.lineTo(tw, h); ctx.closePath(); ctx.fill();
        for (let x0 = 0; x0 < tw; x0 += FAR_TILE) {
          for (const [lx, lh, c] of [[40, 90, "#ff7ab8"], [130, 70, "#7ad0ff"]]) {
            ctx.fillStyle = "#ffffff"; ctx.fillRect(x0 + lx - 2, h - lh, 4, lh);
            ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x0 + lx, h - lh, 16, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x0 + lx, h - lh, 9, 0, Math.PI * 1.5); ctx.stroke();
          }
        }
      } else if (f.kind === "asteroids") {
        for (let x0 = 0; x0 < tw; x0 += FAR_TILE) {
          for (let i = 0; i < 4; i++) {
            const ax = x0 + 20 + i * 48 + hash01(i * 5) * 20, ay = 20 + hash01(i * 9 + 3) * (h - 40), ar = 7 + hash01(i * 2.1) * 14;
            ctx.fillStyle = i % 2 ? f.c1 : f.c2;
            ctx.beginPath(); ctx.ellipse(ax, ay, ar, ar * 0.8, i, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "rgba(0,0,0,0.25)";
            ctx.beginPath(); ctx.arc(ax + ar * 0.25, ay - ar * 0.1, ar * 0.3, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
    });
  }

  function worldGroundSprite(wi) {
    const d = worldDefAt(wi);
    const gd = d.ground;
    return sprite(wkey(wi, "ground"), GROUND_TILE + W, GROUND_H, function () {
      const tw = GROUND_TILE + W;
      ctx.fillStyle = gd.base;
      ctx.fillRect(0, 0, tw, GROUND_H);
      const top = ctx.createLinearGradient(0, 0, 0, 18);
      top.addColorStop(0, gd.top[0]);
      top.addColorStop(1, gd.top[1]);
      ctx.fillStyle = top;
      ctx.fillRect(0, 0, tw, 18);
      ctx.fillStyle = gd.stripe;
      for (let x = 0; x < tw; x += 48) ctx.fillRect(x, 20, 24, GROUND_H - 20);
      if (gd.lane) {
        ctx.fillStyle = "rgba(255,220,120,0.6)";
        for (let x = 0; x < tw; x += 48) ctx.fillRect(x + 8, 9, 22, 3);
      }
      ctx.fillStyle = gd.dots;
      ctx.beginPath();
      for (let x0 = 0; x0 < tw; x0 += GROUND_TILE) {
        for (let i = 0; i < 14; i++) {
          const dx = x0 + ((i * 53 + 17) % GROUND_TILE);
          const r = gd.craters ? 4 + (i % 3) * 2 : 2.5;
          ctx.moveTo(dx + r, 38 + (i % 3) * 8);
          ctx.arc(dx, 38 + (i % 3) * 8, r, 0, Math.PI * 2);
        }
      }
      ctx.fill();
    });
  }

  function drawWorldBackground(wi, alpha) {
    const d = worldDefAt(wi);
    if (alpha < 1) ctx.globalAlpha = alpha;
    if (!d.far) {
      // Day Sky = the classic 1.9.2 look
      drawSky(); drawClouds(); drawHills();
      ctx.globalAlpha = 1;
      return;
    }
    blit(worldSkySprite(wi), 0, 0);
    // clouds / wisps (same motion as the classic clouds)
    const P = W + 220;
    const base = cloudX - scrollAlpha(0.25);
    ctx.fillStyle = d.cloud;
    drawCloud((((base + 80) % P) + P) % P - 70, 70, 1);
    drawCloud((((base + 280) % P) + P) % P - 70, 140, 0.7);
    if (d.id !== "space" && !d.noClouds) drawCloud((((base + 450) % P) + P) % P - 70, 45, 1.1);
    const fs = worldFarSprite(wi);
    const off = ((((farX - scrollAlpha(0.5)) % FAR_TILE) + FAR_TILE) % FAR_TILE) - FAR_TILE;
    ctx.drawImage(fs.c, off, PLAY_H - fs.h, fs.w, fs.h);
    ctx.globalAlpha = 1;
  }

  /** Sky + far layer for the current world (cross-fades for ~1 s after a world change). */
  function drawWorldSky() {
    if (worldFade < 1 && worldFromIdx !== worldIdx) {
      drawWorldBackground(worldFromIdx, 1);
      drawWorldBackground(worldIdx, worldFade);
    } else {
      drawWorldBackground(worldIdx, 1);
    }
  }

  function drawWorldGround() {
    const d = worldDefAt(worldIdx);
    if (!d.ground) { drawGround(); return; }
    const gs = worldGroundSprite(worldIdx);
    const off = ((((groundX - scrollAlpha(1)) % GROUND_TILE) + GROUND_TILE) % GROUND_TILE) - GROUND_TILE;
    ctx.drawImage(gs.c, off, PLAY_H, gs.w, gs.h);
  }

  // Weather in front of the background (cheap: ≤ 24 dots, no allocation)
  function drawWorldWeather() {
    const d = worldDefAt(worldIdx);
    if (d.bubbles || d.embers || d.sprinkles) { drawWorldWeather111(d); return; }
    if (!d.snow && !d.petals) return;
    const n = quality >= 2 ? 12 : 24;
    ctx.fillStyle = d.snow ? "rgba(255,255,255,0.85)" : "rgba(255,160,200,0.85)";
    for (let i = 0; i < n; i++) {
      const sp = 0.5 + hash01(i * 3.3) * 0.8;
      const x = ((hash01(i) * (W + 40) - frame * sp * (d.snow ? 0.6 : 1.1)) % (W + 40) + (W + 40)) % (W + 40) - 20;
      const y = ((hash01(i * 7.7) * PLAY_H + frame * sp * (d.snow ? 0.9 : 0.6)) % PLAY_H);
      const r = d.snow ? 1.2 + hash01(i * 2.2) * 1.6 : 2;
      if (d.snow) ctx.fillRect(x, y, r, r);
      else { ctx.beginPath(); ctx.ellipse(x, y, r * 1.4, r * 0.8, i, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  const SPRINKLE_C = ["#ff5c8a", "#7ad0ff", "#ffe066", "#9bff9b"];
  function drawWorldWeather111(d) {
    const n = quality >= 2 ? 10 : 20;
    for (let i = 0; i < n; i++) {
      const sp = 0.5 + hash01(i * 3.3) * 0.8;
      const x = ((hash01(i) * (W + 40) - frame * sp * 0.5) % (W + 40) + (W + 40)) % (W + 40) - 20;
      if (d.bubbles || d.embers) {
        const y = PLAY_H - ((hash01(i * 7.7) * PLAY_H + frame * sp * (d.bubbles ? 0.9 : 1.3)) % PLAY_H);
        if (d.bubbles) { ctx.strokeStyle = "rgba(220,250,255,0.6)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 2 + hash01(i * 2.2) * 3, 0, Math.PI * 2); ctx.stroke(); }
        else { ctx.fillStyle = i % 3 ? "rgba(255,140,40,0.8)" : "rgba(255,220,120,0.8)"; ctx.fillRect(x, y, 2, 2); }
      } else {
        const y = (hash01(i * 7.7) * PLAY_H + frame * sp * 0.7) % PLAY_H;
        ctx.fillStyle = SPRINKLE_C[i % 4];
        ctx.fillRect(x, y, 4, 1.6);
      }
    }
  }

  function drawBossOverlay() {
    if (!bossOn || (state !== State.PLAY && state !== State.OVER)) return;
    const vs = sprite("bossVignette", W, PLAY_H, function () {
      ctx.fillStyle = "rgba(255,30,40,0.10)";
      ctx.fillRect(0, 0, W, PLAY_H);
      const g = ctx.createRadialGradient(W / 2, PLAY_H / 2, PLAY_H * 0.3, W / 2, PLAY_H / 2, PLAY_H * 0.75);
      g.addColorStop(0, "rgba(120,0,10,0)");
      g.addColorStop(1, "rgba(120,0,10,0.45)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, PLAY_H);
    });
    ctx.globalAlpha = 0.85 + Math.sin(frame * 0.08) * 0.15;
    blit(vs, 0, 0);
    ctx.globalAlpha = 1;
  }

  function drawBigBanner() {
    if (bigBannerT <= 0 || state !== State.PLAY) return;
    const t = bigBannerT;
    // Sits just under the score/level HUD (not over the middle of the play area) and fades quickly.
    const a = Math.min(1, t / 20, (130 - t) / 12 + 0.2);
    const slide = Math.max(0, (t - 115) / 15) * 20;
    const y = 212 - slide;
    ctx.globalAlpha = Math.max(0, a) * 0.6;
    ctx.fillStyle = bigBannerBoss ? "rgba(60,0,8,0.85)" : "rgba(10,20,40,0.72)";
    roundRect(40, y - 22, W - 80, bigBannerSub ? 50 : 38, 12);
    ctx.fill();
    ctx.globalAlpha = Math.max(0, a);
    flashText("bigbanner", bigBannerText, bigBannerBoss ? 24 : 19, bigBannerColor, "rgba(0,0,0,0.55)", 4, W / 2, y - 4, Math.max(0, a));
    if (bigBannerSub) flashText("bigbannersub", bigBannerSub, 11, "#ffffff", "rgba(0,0,0,0.45)", 3, W / 2, y + 17, Math.max(0, a));
    ctx.globalAlpha = 1;
  }

  function tickWorld110() {
    if (worldFade < 1) worldFade = Math.min(1, worldFade + 1 / 60);
    if (bigBannerT > 0) bigBannerT--;
  }

  // —— v1.12 world obstacles (original art, drawn in code) ——
  // Each world has its own obstacle look. The collision box is untouched: the full pipe rectangle p.x .. p.x + p.w from the
  // screen edge to the gap edge (see hitPipe). Body art stays inside x = p.x+4 .. p.x+w-4 like the old tubes, and every cap
  // fills the full width of the box at its gap-facing end, so what you see is what hits you. Nothing is ever drawn inside the gap.
  const OBST_KINDS = { cactus: 1, icepillar: 1, tower: 1, asteroid: 1, trunk: 1, coralcol: 1, lavarock: 1, cane: 1 };
  function obstGrad(x0, x1, cols) {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    for (let i = 0; i < cols.length; i++) g.addColorStop(i / (cols.length - 1), cols[i]);
    return g;
  }
  function obstBodyPaint(kind, w, pd) {
    const x0 = 0, x1 = w, bw = x1 - x0, H = PLAY_H; // full box width (the old tubes left 4 px each side)
    const B = pd.body;
    ctx.fillStyle = obstGrad(x0, x1, [B[0], B[1], B[2], B[3]]);
    ctx.fillRect(x0, 0, bw, H);
    if (kind === "cactus") {
      // saguaro column: vertical ribs, light spines, a few pink flowers
      ctx.fillStyle = "rgba(20,70,30,0.35)";
      for (let i = 1; i < 5; i++) ctx.fillRect(x0 + Math.round(bw * i / 5), 0, 2, H);
      ctx.fillStyle = "rgba(220,255,200,0.16)";
      for (let i = 0; i < 5; i++) ctx.fillRect(x0 + Math.round(bw * i / 5) + 3, 0, 2, H);
      ctx.fillStyle = "rgba(255,248,210,0.85)";
      for (let i = 0; i < H / 6; i++) {
        const sx = x0 + 4 + hash01(i * 3.3 + 1) * (bw - 8), sy = hash01(i * 7.1 + 2) * H;
        ctx.fillRect(sx, sy, 1.4, 3); ctx.fillRect(sx - 1.2, sy + 1, 4, 1);
      }
      for (let i = 0; i < 6; i++) {
        const fx = x0 + 8 + hash01(i * 11 + 3) * (bw - 16), fy = 40 + i * (H / 6) + hash01(i + 9) * 30;
        ctx.fillStyle = "#ff7fb0"; ctx.beginPath(); ctx.arc(fx, fy, 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ffe36b"; ctx.beginPath(); ctx.arc(fx, fy, 1.2, 0, Math.PI * 2); ctx.fill();
      }
    } else if (kind === "icepillar") {
      // faceted ice: light diagonal facets, white core, cracks
      ctx.fillStyle = "rgba(255,255,255,0.32)"; ctx.fillRect(x0 + 8, 0, 7, H);
      ctx.fillStyle = "rgba(255,255,255,0.14)"; ctx.fillRect(x0 + 18, 0, 4, H);
      for (let y = -20; y < H; y += 46) {
        ctx.fillStyle = "rgba(255,255,255,0.20)";
        ctx.beginPath(); ctx.moveTo(x0, y + 30); ctx.lineTo(x1, y); ctx.lineTo(x1, y + 16); ctx.lineTo(x0, y + 46); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "rgba(40,100,170,0.18)";
        ctx.beginPath(); ctx.moveTo(x0, y + 46); ctx.lineTo(x1, y + 16); ctx.lineTo(x1, y + 22); ctx.lineTo(x0, y + 52); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 9; i++) { const cx = x0 + 6 + hash01(i * 5.3) * (bw - 12), cy = hash01(i * 2.9 + 4) * H; ctx.moveTo(cx, cy); ctx.lineTo(cx + 5, cy + 9); ctx.lineTo(cx + 1, cy + 17); }
      ctx.stroke();
      ctx.fillStyle = "rgba(30,80,150,0.85)"; ctx.fillRect(x0, 0, 2, H); ctx.fillRect(x1 - 2, 0, 2, H);
    } else if (kind === "tower") {
      // skyscraper facade: floors, lit / dark windows, neon edges
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      for (let y = 0; y < H; y += 28) ctx.fillRect(x0, y, bw, 2);
      for (let y = 6, r = 0; y < H; y += 14, r++) for (let x = x0 + 6, c = 0; x < x1 - 8; x += 10, c++) {
        const hv = hash01(r * 17 + c * 5.3);
        ctx.fillStyle = hv < 0.45 ? "rgba(255,216,107,0.85)" : hv < 0.6 ? "rgba(120,220,255,0.6)" : "rgba(10,14,40,0.55)";
        ctx.fillRect(x, y, 5, 7);
      }
      ctx.fillStyle = "rgba(120,130,200,0.25)"; ctx.fillRect(x0 + 2, 0, 2, H); ctx.fillRect(x1 - 4, 0, 2, H);
      ctx.fillStyle = "rgba(80,255,255,0.85)"; ctx.fillRect(x0, 0, 2, H); ctx.fillRect(x1 - 2, 0, 2, H);
    } else if (kind === "asteroid") {
      // rough rock column: ragged edges, craters, glowing mineral veins
      ctx.fillStyle = "rgba(20,10,40,0.35)";
      for (let i = 0; i < H / 11; i++) { const y = i * 11; ctx.fillRect(x0, y, 1 + hash01(i * 3.7) * 4, 11); ctx.fillRect(x1 - 1 - hash01(i * 8.1) * 4, y, 6, 11); }
      for (let i = 0; i < 12; i++) {
        const cx = x0 + 10 + hash01(i * 4.7) * (bw - 20), cy = 14 + (i + hash01(i)) * (H / 12), r = 4 + hash01(i * 9.1) * 6;
        ctx.fillStyle = "rgba(30,20,50,0.55)"; ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(210,200,240,0.4)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(cx - 0.5, cy - 0.8, r, r * 0.7, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
      }
      ctx.strokeStyle = "rgba(120,255,214,0.8)"; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let i = 0; i < 6; i++) { const vx = x0 + 6 + hash01(i * 6.3 + 1) * (bw - 12), vy = hash01(i * 3.1 + 2) * H; ctx.moveTo(vx, vy); ctx.lineTo(vx + 6, vy + 8); ctx.lineTo(vx + 1, vy + 16); }
      ctx.stroke();
      ctx.fillStyle = "rgba(10,5,30,0.7)"; ctx.fillRect(x0, 0, 2, H); ctx.fillRect(x1 - 2, 0, 2, H);
    } else if (kind === "trunk") {
      // bark: wavy grooves, knots, moss, stuck blossom petals
      ctx.strokeStyle = "rgba(40,20,10,0.5)"; ctx.lineWidth = 2;
      for (let k = 1; k < 5; k++) {
        ctx.beginPath();
        for (let y = 0; y <= H; y += 8) { const x = x0 + bw * k / 5 + Math.sin(y * 0.09 + k * 1.7) * 2.2; if (y === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(255,220,190,0.18)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); for (let y = 0; y <= H; y += 8) { const x = x0 + bw * 0.28 + Math.sin(y * 0.09 + 1) * 2.2 + 3; if (y === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const kx = x0 + 10 + hash01(i * 5.9) * (bw - 20), ky = 30 + i * (H / 6) + hash01(i * 2.3) * 25;
        ctx.fillStyle = "rgba(30,15,8,0.6)"; ctx.beginPath(); ctx.ellipse(kx, ky, 4.5, 6.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(110,70,45,0.9)"; ctx.beginPath(); ctx.ellipse(kx, ky, 2.4, 3.6, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = "rgba(110,170,80,0.55)";
      for (let i = 0; i < 9; i++) ctx.fillRect(x0 + 1 + hash01(i * 7.7) * 8, hash01(i * 3.3 + 8) * H, 5, 9);
      ctx.fillStyle = "#ffb3d1";
      for (let i = 0; i < 12; i++) { const px = x0 + 4 + hash01(i * 6.1 + 2) * (bw - 8), py = hash01(i * 4.4 + 6) * H; ctx.beginPath(); ctx.ellipse(px, py, 2.6, 1.7, hash01(i) * 3, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = "rgba(40,20,10,0.8)"; ctx.fillRect(x0, 0, 2, H); ctx.fillRect(x1 - 2, 0, 2, H);
    } else if (kind === "coralcol") {
      // coral trunk: bumpy lobes, polyp dots, light veins
      ctx.fillStyle = "rgba(120,20,60,0.28)";
      for (let i = 1; i < 5; i++) { ctx.beginPath(); for (let y = 0; y <= H; y += 6) { const x = x0 + bw * i / 5 + Math.sin(y * 0.13 + i * 2) * 3; if (y === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.lineTo(x0 + bw * i / 5 + 3, H); ctx.lineTo(x0 + bw * i / 5 + 3, 0); ctx.fill(); }
      for (let i = 0; i < H / 7; i++) {
        const px = x0 + 4 + hash01(i * 3.9) * (bw - 8), py = hash01(i * 6.7 + 1) * H;
        ctx.fillStyle = "rgba(255,225,235,0.75)"; ctx.beginPath(); ctx.arc(px, py, 2.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(140,30,70,0.7)"; ctx.beginPath(); ctx.arc(px, py, 0.9, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(x0 + 6, 0, 5, H);
      ctx.fillStyle = "rgba(110,20,50,0.6)"; ctx.fillRect(x0, 0, 2, H); ctx.fillRect(x1 - 2, 0, 2, H);
    } else if (kind === "lavarock") {
      // basalt columns with glowing cracks and slow lava drips
      ctx.fillStyle = "rgba(0,0,0,0.38)";
      ctx.fillRect(x0 + Math.round(bw / 3), 0, 2, H); ctx.fillRect(x0 + Math.round(bw * 2 / 3), 0, 2, H);
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      ctx.fillRect(x0 + 4, 0, 4, H); ctx.fillRect(x0 + Math.round(bw / 3) + 5, 0, 3, H); ctx.fillRect(x0 + Math.round(bw * 2 / 3) + 5, 0, 3, H);
      ctx.strokeStyle = "rgba(255,120,30,0.9)"; ctx.lineWidth = 1.8; ctx.beginPath();
      for (let y = 6; y < H; y += 44) { const cx = x0 + 6 + hash01(y * 0.37) * (bw - 16); ctx.moveTo(cx, y); ctx.lineTo(cx + 5, y + 11); ctx.lineTo(cx + 1, y + 21); ctx.lineTo(cx + 7, y + 33); }
      ctx.stroke();
      for (let i = 0; i < 7; i++) {
        const dx = x0 + 6 + hash01(i * 8.3 + 1) * (bw - 12), dy = 20 + i * (H / 7) + hash01(i) * 30, dl = 14 + hash01(i * 3.7) * 22;
        ctx.fillStyle = "rgba(255,110,20,0.9)"; ctx.fillRect(dx - 1.5, dy, 3, dl);
        ctx.beginPath(); ctx.arc(dx, dy + dl, 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,225,110,0.9)"; ctx.fillRect(dx - 0.6, dy, 1.2, dl);
      }
      ctx.fillStyle = "rgba(255,110,30,0.7)"; ctx.fillRect(x0, 0, 2, H); ctx.fillRect(x1 - 2, 0, 2, H);
    } else if (kind === "cane") {
      // swirled pastel pillar: bold diagonal red stripes, gloss, soft outline
      ctx.save(); ctx.beginPath(); ctx.rect(x0, 0, bw, H); ctx.clip();
      ctx.fillStyle = "#e8344f";
      for (let y = -bw; y < H + bw; y += 30) { ctx.beginPath(); ctx.moveTo(x0, y + 12); ctx.lineTo(x1, y - 14); ctx.lineTo(x1, y + 1); ctx.lineTo(x0, y + 27); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.fillRect(x0 + 6, 0, 5, H);
      ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(x0 + 13, 0, 3, H);
      ctx.fillStyle = "rgba(120,20,50,0.18)"; ctx.fillRect(x1 - 9, 0, 6, H);
      ctx.fillStyle = "rgba(190,30,70,0.8)"; ctx.fillRect(x0, 0, 2, H); ctx.fillRect(x1 - 2, 0, 2, H);
    }
  }
  /** Gap-facing end of the obstacle. Drawn in "bottom pipe" orientation (gap edge at the top of the sprite, y = 2);
   *  the top pipe's copy is mirrored vertically (lava drips are drawn un-mirrored so gravity stays right). */
  function obstCapPaint(kind, w, bottom, pd) {
    const H = PIPE_CAP, xa = 2, xb = w + 2, cw = xb - xa;
    ctx.save();
    if (!bottom && kind !== "lavarock") { ctx.translate(0, H + 4); ctx.scale(1, -1); }
    const fill = (cols) => { ctx.fillStyle = obstGrad(xa, xb, cols); };
    if (kind === "cactus") {
      fill(["#2f7d3a", "#6cc467", "#4aa650", "#27622f"]);
      roundRect(xa, 2, cw, H, 11); ctx.fill();
      ctx.fillStyle = "rgba(20,70,30,0.35)"; for (let i = 1; i < 5; i++) ctx.fillRect(xa + Math.round(cw * i / 5), 8, 2, H - 6);
      ctx.fillStyle = "rgba(255,248,210,0.85)"; for (let i = 0; i < 7; i++) { ctx.fillRect(xa + 6 + i * 7.5, 12 + (i % 2) * 5, 1.4, 3); ctx.fillRect(xa + 4.8 + i * 7.5, 13 + (i % 2) * 5, 4, 1); }
      ctx.fillStyle = "#ff7fb0"; ctx.beginPath(); ctx.arc(w / 2 + 2, 8, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffe36b"; ctx.beginPath(); ctx.arc(w / 2 + 2, 8, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(15,60,25,0.8)"; ctx.lineWidth = 2; roundRect(xa, 2, cw, H, 11); ctx.stroke();
    } else if (kind === "icepillar") {
      fill(["#7fb6e6", "#e6f6ff", "#b5dcf8", "#5f9bd0"]);
      ctx.fillRect(xa, 10, cw, H - 8);
      const tips = [3.5, 0.5, 4, 1.5], n = 4, sw = cw / n;
      for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.moveTo(xa + i * sw, 11); ctx.lineTo(xa + i * sw + sw * 0.5, 2 + tips[i]); ctx.lineTo(xa + (i + 1) * sw, 11); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.moveTo(xa + i * sw + sw * 0.5, 2 + tips[i]); ctx.lineTo(xa + i * sw + sw * 0.62, 11); ctx.lineTo(xa + i * sw + sw * 0.42, 11); ctx.closePath(); ctx.fill(); }
      ctx.strokeStyle = "rgba(30,80,150,0.85)"; ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(xa, H + 2); ctx.lineTo(xa, 11);
      for (let i = 0; i < n; i++) { ctx.lineTo(xa + i * sw + sw * 0.5, 2 + tips[i]); ctx.lineTo(xa + (i + 1) * sw, 11); }
      ctx.lineTo(xb, H + 2); ctx.stroke();
    } else if (kind === "tower") {
      fill(["#1d2248", "#4a5390", "#2f3768", "#141836"]);
      ctx.fillRect(xa, 5, cw, H - 3);
      ctx.fillStyle = "rgba(80,255,255,0.9)"; ctx.fillRect(xa, 5, cw, 2);
      ctx.fillStyle = "rgba(255,79,216,0.8)"; ctx.fillRect(xa, 7, cw, 1.5);
      ctx.fillStyle = "#262c5a"; ctx.fillRect(xa + 8, 2, 14, 4); ctx.fillRect(xb - 20, 3, 10, 3);
      ctx.fillStyle = "#7d86c8"; ctx.fillRect(xa + 29, 2, 2.5, 4);
      ctx.fillStyle = "rgba(255,70,70,0.35)"; ctx.beginPath(); ctx.arc(xa + 30.2, 3, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ff3b3b"; ctx.beginPath(); ctx.arc(xa + 30.2, 3, 1.8, 0, Math.PI * 2); ctx.fill();
      for (let x = xa + 6; x < xb - 8; x += 10) { ctx.fillStyle = hash01(x * 1.7) < 0.5 ? "rgba(255,216,107,0.8)" : "rgba(10,14,40,0.6)"; ctx.fillRect(x, 13, 5, 6); }
      ctx.fillStyle = "rgba(80,255,255,0.8)"; ctx.fillRect(xa, 5, 2, H); ctx.fillRect(xb - 2, 5, 2, H);
    } else if (kind === "asteroid") {
      fill(["#463d68", "#8b7fb8", "#675c92", "#2f2750"]);
      ctx.fillRect(xa, 12, cw, H - 10);
      const lobes = [[xa + 7, 10, 8], [xa + 20, 9, 8.5], [xa + 33, 10.5, 8], [xa + 47, 9.5, 8.5], [xb - 5, 11, 7]];
      for (const l of lobes) { ctx.beginPath(); ctx.arc(l[0], l[1], l[2], 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = "rgba(25,15,45,0.55)"; ctx.beginPath(); ctx.ellipse(xa + 18, 14, 4.5, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(xa + 40, 15, 3.5, 2.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(120,255,214,0.85)"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(xa + 28, 6); ctx.lineTo(xa + 31, 12); ctx.lineTo(xa + 28, 18); ctx.stroke();
      ctx.strokeStyle = "rgba(15,8,35,0.8)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(xa, H + 2); ctx.lineTo(xa, 11); for (const l of lobes) { ctx.arc(l[0], l[1], l[2], Math.PI, Math.PI * 2); } ctx.lineTo(xb, H + 2); ctx.stroke();
    } else if (kind === "trunk") {
      fill(["#4e2d1d", "#9a6648", "#7b4c35", "#3d2316"]);
      ctx.fillRect(xa, 12, cw, H - 10);
      ctx.strokeStyle = "rgba(40,20,10,0.5)"; ctx.lineWidth = 2; for (let k = 1; k < 5; k++) { ctx.beginPath(); ctx.moveTo(xa + cw * k / 5, 12); ctx.lineTo(xa + cw * k / 5 + 1, H + 2); ctx.stroke(); }
      const bl = [[xa + 6, 9, 7, "#ff9ec8"], [xa + 18, 7, 7.5, "#ffc2dc"], [xa + 30, 8, 8, "#ff9ec8"], [xa + 43, 7, 7.5, "#ffc2dc"], [xb - 5, 9, 6.5, "#ff9ec8"], [xa + 12, 12, 5, "#ffb3d1"], [xa + 37, 12, 5, "#ffb3d1"]];
      for (const b of bl) {
        ctx.fillStyle = b[3]; ctx.beginPath(); ctx.arc(b[0], b[1], b[2], 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.beginPath(); ctx.arc(b[0] - 1.5, b[1] - 1.5, b[2] * 0.42, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#e0558f"; ctx.beginPath(); ctx.arc(b[0] + 1, b[1] + 1, 1.3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = "rgba(160,50,100,0.55)"; ctx.lineWidth = 1; for (const b of bl) { ctx.beginPath(); ctx.arc(b[0], b[1], b[2], 0, Math.PI * 2); ctx.stroke(); }
    } else if (kind === "coralcol") {
      fill(["#b53a62", "#ff9ab0", "#ec6685", "#82284a"]);
      ctx.fillRect(xa, 12, cw, H - 10);
      const lobes = [[xa + 7, 10, 7.5], [xa + 20, 8.5, 8], [xa + 33, 10, 8], [xa + 46, 8.5, 8], [xb - 5, 11, 6.5]];
      for (const l of lobes) { ctx.beginPath(); ctx.arc(l[0], l[1], l[2], 0, Math.PI * 2); ctx.fill(); }
      for (const l of lobes) { ctx.fillStyle = "rgba(255,230,240,0.8)"; ctx.beginPath(); ctx.arc(l[0], l[1] - 1, 2.4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "rgba(140,30,70,0.8)"; ctx.beginPath(); ctx.arc(l[0], l[1] - 1, 1, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = "rgba(100,20,50,0.7)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(xa, H + 2); ctx.lineTo(xa, 11); for (const l of lobes) ctx.arc(l[0], l[1], l[2], Math.PI, Math.PI * 2); ctx.lineTo(xb, H + 2); ctx.stroke();
    } else if (kind === "cane") {
      ctx.fillStyle = "#ffffff"; roundRect(xa, 2, cw, H, 11); ctx.fill();
      ctx.save(); roundRect(xa, 2, cw, H, 11); ctx.clip(); ctx.fillStyle = "#e8344f";
      for (let x = xa - 20; x < xb + 20; x += 18) { ctx.beginPath(); ctx.moveTo(x, 2 + H); ctx.lineTo(x + 9, 2 + H); ctx.lineTo(x + 24, 2); ctx.lineTo(x + 15, 2); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      ctx.fillStyle = "rgba(255,255,255,0.55)"; roundRect(xa + 5, 4, cw - 10, 4, 2); ctx.fill();
      ctx.strokeStyle = "rgba(190,30,70,0.85)"; ctx.lineWidth = 2; roundRect(xa, 2, cw, H, 11); ctx.stroke();
    } else if (kind === "lavarock") {
      // un-mirrored: crust sits on the gap edge, drips hang down the rock face
      ctx.restore(); ctx.save();
      const edgeY = bottom ? 2 : H + 2 - 6;
      fill(["#17131a", "#4d424c", "#352d36", "#100c10"]);
      roundRect(xa, 2, cw, H, 5); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(xa + 19, 2, 2, H); ctx.fillRect(xa + 39, 2, 2, H);
      ctx.fillStyle = "#ff7a1a"; ctx.fillRect(xa, edgeY, cw, 6);
      ctx.fillStyle = "#ffd25a"; ctx.fillRect(xa + 2, edgeY + 1.5, cw - 4, 2);
      for (let i = 0; i < 5; i++) {
        const dx = xa + 6 + i * 11 + (i % 2) * 2, dl = bottom ? 5 + (i % 3) * 4 : 3 + (i % 3) * 3;
        ctx.fillStyle = "#ff7a1a";
        if (bottom) { ctx.fillRect(dx - 1.6, edgeY + 5, 3.2, dl); ctx.beginPath(); ctx.arc(dx, edgeY + 5 + dl, 3, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#ffd25a"; ctx.fillRect(dx - 0.6, edgeY + 5, 1.2, dl); }
        else { ctx.fillRect(dx - 1.6, 4, 3.2, dl + 2); ctx.beginPath(); ctx.arc(dx, 5 + dl, 3, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#ffd25a"; ctx.fillRect(dx - 0.6, 4, 1.2, dl + 2); }
      }
      ctx.strokeStyle = "rgba(255,110,30,0.9)"; ctx.lineWidth = 1.5; roundRect(xa, 2, cw, H, 5); ctx.stroke();
    }
    ctx.restore();
  }

  // —— Pipe art per world (+ the boss style) ——
  function pipeStyleDef(st) {
    if (st === "boss") return BOSS_PIPE;
    return worldDefAt(st | 0).pipe;
  }
  function stylePipeBody(st, w) {
    const pd = pipeStyleDef(st);
    if (OBST_KINDS[pd.deco]) return sprite("pb:" + st + ":" + w, w, PLAY_H, function () { obstBodyPaint(pd.deco, w, pd); });
    return sprite("pb:" + st + ":" + w, w, PLAY_H, function () {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, pd.body[0]); g.addColorStop(0.35, pd.body[1]); g.addColorStop(0.7, pd.body[2]); g.addColorStop(1, pd.body[3]);
      ctx.fillStyle = g;
      ctx.fillRect(4, 0, w - 8, PLAY_H);
      if (pd.deco === "bands") {
        ctx.fillStyle = "rgba(90,40,10,0.22)";
        for (let y = 10; y < PLAY_H; y += 26) ctx.fillRect(4, y, w - 8, 5);
        ctx.fillStyle = "rgba(255,230,180,0.18)";
        for (let y = 18; y < PLAY_H; y += 26) ctx.fillRect(4, y, w - 8, 2);
      } else if (pd.deco === "frost") {
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.fillRect(12, 0, 6, PLAY_H);
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        for (let y = 0; y < PLAY_H; y += 34) { ctx.beginPath(); ctx.moveTo(w - 14, y); ctx.lineTo(w - 8, y + 12); ctx.lineTo(w - 18, y + 22); ctx.closePath(); ctx.fill(); }
      } else if (pd.deco === "windows") {
        for (let y = 6; y < PLAY_H; y += 14) for (let x = 10; x < w - 12; x += 10) {
          ctx.fillStyle = hash01(x * 3 + y) < 0.5 ? "rgba(255,216,107,0.7)" : "rgba(120,220,255,0.35)";
          ctx.fillRect(x, y, 5, 6);
        }
        ctx.fillStyle = "rgba(80,255,255,0.8)";
        ctx.fillRect(4, 0, 2, PLAY_H); ctx.fillRect(w - 6, 0, 2, PLAY_H);
      } else if (pd.deco === "lights") {
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        for (let y = 0; y < PLAY_H; y += 40) ctx.fillRect(4, y, w - 8, 2);
        for (let y = 20; y < PLAY_H; y += 40) { ctx.fillStyle = "rgba(120,255,200,0.9)"; ctx.fillRect(w / 2 - 3, y, 6, 3); }
      } else if (pd.deco === "petals") {
        ctx.fillStyle = "rgba(0,0,0,0.12)";
        for (let y = 0; y < PLAY_H; y += 30) { ctx.fillRect(10, y, 3, 18); ctx.fillRect(w - 18, y + 12, 3, 14); }
      } else if (pd.deco === "stone") {
        // stacked stone blocks: mortar courses + staggered joints, a soft sky-blue inlay stripe, slate outline
        const bx0 = 4, bx1 = w - 4, cw = bx1 - bx0, CH = 24;
        ctx.fillStyle = "rgba(60,88,124,0.30)";
        for (let y = 0, r = 0; y < PLAY_H; y += CH, r++) {
          ctx.fillRect(bx0, y, cw, 2);
          const jx = bx0 + (r % 2 ? cw * 0.34 : cw * 0.68);
          ctx.fillRect(Math.round(jx), y + 2, 2, CH - 2);
        }
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        for (let y = 2; y < PLAY_H; y += CH) ctx.fillRect(bx0 + 2, y, cw - 4, 1);
        ctx.fillStyle = "rgba(110,180,240,0.22)";
        ctx.fillRect(bx0 + 7, 0, 4, PLAY_H);
        ctx.fillStyle = "rgba(40,62,94,0.18)";
        for (let i = 0; i < PLAY_H / 7; i++) { const sx = bx0 + 3 + hash01(i * 13 + 5) * (cw - 6), sy = hash01(i * 7 + 2) * PLAY_H; ctx.fillRect(sx, sy, 2, 1); }
        ctx.fillStyle = "rgba(46,70,104,0.85)";
        ctx.fillRect(bx0, 0, 2, PLAY_H); ctx.fillRect(bx1 - 2, 0, 2, PLAY_H);
      } else if (pd.deco === "tube") {
        // plain green tube: soft highlight + shadow stripes (no rim anywhere)
        ctx.fillStyle = "rgba(255,255,255,0.28)";
        ctx.fillRect(12, 0, 6, PLAY_H);
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.fillRect(20, 0, 3, PLAY_H);
        ctx.fillStyle = "rgba(20,70,15,0.85)";
        ctx.fillRect(4, 0, 2, PLAY_H); ctx.fillRect(w - 6, 0, 2, PLAY_H);
      } else if (pd.deco === "coral") {
        ctx.fillStyle = "rgba(255,255,255,0.22)";
        for (let i = 0; i < PLAY_H / 9; i++) { ctx.beginPath(); ctx.arc(8 + hash01(i * 3.1) * (w - 16), hash01(i * 5.7) * PLAY_H, 1.5 + hash01(i) * 2, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = "rgba(110,20,50,0.25)";
        for (let y = 0; y < PLAY_H; y += 28) ctx.fillRect(4, y, w - 8, 3);
      } else if (pd.deco === "magma") {
        ctx.strokeStyle = "rgba(255,120,30,0.85)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let y = 0; y < PLAY_H; y += 36) { const x0 = 10 + hash01(y) * (w - 24); ctx.moveTo(x0, y); ctx.lineTo(x0 + 6, y + 12); ctx.lineTo(x0 + 2, y + 22); ctx.lineTo(x0 + 9, y + 32); }
        ctx.stroke();
        ctx.fillStyle = "rgba(255,110,30,0.6)";
        ctx.fillRect(4, 0, 2, PLAY_H); ctx.fillRect(w - 6, 0, 2, PLAY_H);
      } else if (pd.deco === "candy") {
        ctx.save();
        ctx.beginPath(); ctx.rect(4, 0, w - 8, PLAY_H); ctx.clip();
        ctx.fillStyle = "#ff5c8a";
        for (let y = -w; y < PLAY_H + w; y += 22) { ctx.beginPath(); ctx.moveTo(4, y); ctx.lineTo(w - 4, y - 18); ctx.lineTo(w - 4, y - 8); ctx.lineTo(4, y + 10); ctx.closePath(); ctx.fill(); }
        ctx.restore();
        ctx.fillStyle = "rgba(200,40,90,0.6)";
        ctx.fillRect(4, 0, 2, PLAY_H); ctx.fillRect(w - 6, 0, 2, PLAY_H);
      } else if (pd.deco === "spikes") {
        ctx.fillStyle = "rgba(255,80,60,0.55)";
        ctx.fillRect(4, 0, 3, PLAY_H); ctx.fillRect(w - 7, 0, 3, PLAY_H);
        ctx.fillStyle = "rgba(255,120,60,0.25)";
        for (let y = 0; y < PLAY_H; y += 22) { ctx.beginPath(); ctx.moveTo(w / 2 - 8, y); ctx.lineTo(w / 2, y + 10); ctx.lineTo(w / 2 + 8, y); ctx.closePath(); ctx.fill(); }
      }
    });
  }
  function stylePipeCap(st, w, bottom) {
    const pd = pipeStyleDef(st);
    if (OBST_KINDS[pd.deco]) return sprite("pc:" + st + ":" + w + (bottom ? "b" : "t"), w + 4, PIPE_CAP + 4, function () { obstCapPaint(pd.deco, w, bottom, pd); });
    if (pd.deco === "stone") return stoneSlabCap(st, w, bottom, pd);
    if (pd.deco === "tube") return plainTubeCap(st, w, bottom, pd);
    return sprite("pc:" + st + ":" + w + (bottom ? "b" : "t"), w + 4, PIPE_CAP + 4, function () {
      ctx.fillStyle = pd.cap;
      roundRect(2, 2, w, PIPE_CAP, pd.deco === "windows" || pd.deco === "lights" ? 3 : 6);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillRect(10, 6, 8, PIPE_CAP - 8);
      if (pd.deco === "spikes") {
        ctx.fillStyle = "#ffcf5a";
        for (let x = 6; x < w - 2; x += 10) {
          ctx.beginPath();
          if (bottom) { ctx.moveTo(x, 4); ctx.lineTo(x + 4, 0); ctx.lineTo(x + 8, 4); }
          else { ctx.moveTo(x, PIPE_CAP); ctx.lineTo(x + 4, PIPE_CAP + 4); ctx.lineTo(x + 8, PIPE_CAP); }
          ctx.closePath(); ctx.fill();
        }
      }
      if (pd.deco === "frost") {
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        for (let x = 4; x < w; x += 9) ctx.fillRect(x, bottom ? 2 : PIPE_CAP - 1, 4, 3);
      }
      ctx.strokeStyle = pd.edge;
      ctx.lineWidth = 2;
      roundRect(2, 2, w, PIPE_CAP, pd.deco === "windows" || pd.deco === "lights" ? 3 : 6);
      ctx.stroke();
    });
  }
  /** v1.11 world 1: flat end band of a plain green tube. It is exactly as wide as the tube body (no rim/lip). */
  function plainTubeCap(st, w, bottom, pd) {
    return sprite("pc:" + st + ":" + w + (bottom ? "b" : "t"), w + 4, PIPE_CAP + 4, function () {
      // sprite is drawn at p.x - 2, the body spans p.x + 4 .. p.x + w - 4  →  sprite x 6 .. w - 2
      const x0 = 6, x1 = w - 2, H = PIPE_CAP;
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, "#3f9a2e"); g.addColorStop(0.35, pd.cap); g.addColorStop(1, "#2d7a22");
      ctx.fillStyle = g;
      ctx.fillRect(x0, 2, x1 - x0, H);
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.fillRect(x0 + 6, 4, 6, H - 4);
      ctx.fillStyle = "rgba(20,70,15,0.55)";
      ctx.fillRect(x0, bottom ? 2 : H, x1 - x0, 2); // thin seam on the gap side
      ctx.fillStyle = pd.edge;
      ctx.fillRect(x0, 2, 2, H); ctx.fillRect(x1 - 2, 2, 2, H);
    });
  }
  /** Day Sky "sky stone" slab: a flat carved block (two courses, square corners), not a tube rim. */
  function stoneSlabCap(st, w, bottom, pd) {
    return sprite("pc:" + st + ":" + w + (bottom ? "b" : "t"), w + 4, PIPE_CAP + 4, function () {
      const x0 = 3, x1 = w + 1, H = PIPE_CAP;
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, "#c3d2e3"); g.addColorStop(0.4, pd.cap); g.addColorStop(1, "#a9bbd0");
      ctx.fillStyle = g;
      ctx.fillRect(x0, 2, x1 - x0, H);
      // carved course line + blue inlay groove (towards the gap side)
      const gy = bottom ? 2 + H * 0.38 : 2 + H * 0.62;
      ctx.fillStyle = "rgba(60,88,124,0.45)";
      ctx.fillRect(x0, Math.round(gy), x1 - x0, 2);
      ctx.fillStyle = "rgba(110,180,240,0.6)";
      ctx.fillRect(x0 + 3, bottom ? 4 : H - 2, x1 - x0 - 6, 2);
      // block joints
      ctx.fillStyle = "rgba(60,88,124,0.4)";
      const ja = bottom ? [2, gy] : [gy + 2, H + 2];
      ctx.fillRect(Math.round(x0 + (x1 - x0) * 0.3), ja[0], 2, ja[1] - ja[0]);
      ctx.fillRect(Math.round(x0 + (x1 - x0) * 0.72), bottom ? gy + 2 : 2, 2, bottom ? H + 2 - gy - 2 : gy - 2);
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillRect(x0 + 2, 3, x1 - x0 - 4, 1);
      ctx.strokeStyle = pd.edge;
      ctx.lineWidth = 2;
      ctx.strokeRect(x0, 2, x1 - x0, H);
    });
  }
  /** Draws a world/boss pipe. Every pipe now has a style (Day Sky = style 0, "sky stone"). */
  // ---- v1.19 obstacle shapes (helper art only: every shape uses the same column box as a pipe, so gaps and collisions are unchanged) ----
  const OBST_SHAPES = ["pipe", "blocks", "balloons", "clouds", "rocks", "crystal", "barricade", "monster", "windmill"];
  const OBST_MIX = [
    ["blocks", "balloons", "clouds", "monster", "barricade"],   // 0 tube world
    ["rocks", "barricade", "monster", "windmill"],              // 1 cactus
    ["crystal", "rocks", "monster", "clouds"],                  // 2 ice
    ["blocks", "crystal", "windmill", "monster"],               // 3 tower
    ["rocks", "crystal", "monster"],                            // 4 asteroid
    ["barricade", "rocks", "windmill", "monster"],              // 5 trunk
    ["balloons", "crystal", "monster", "clouds"],               // 6 coral
    ["rocks", "barricade", "monster"],                          // 7 lava
    ["blocks", "balloons", "clouds", "monster"],                // 8 pastel
  ];
  const OBST_PLAIN = 0.3;   // about 30% stay the world's own column
  let obstForce = null;
  function obstShapeFor(st) {
    if (st === "boss") return "pipe";   // boss levels keep the spiked column
    if (obstForce) return obstForce;
    const mix = OBST_MIX[st] || OBST_MIX[0];
    if (Math.random() < OBST_PLAIN) return "pipe";
    return mix[(Math.random() * mix.length) | 0];
  }
  // world tints: [main, dark, light]
  const OBST_TINT = [["#55c86a", "#2f8a45", "#b9f3c4"], ["#e0a05a", "#9a6330", "#ffe0b0"], ["#8fd8ff", "#4a95c8", "#e6f8ff"], ["#b9a3ff", "#6f58c8", "#ece4ff"],
    ["#9aa4c0", "#5d6684", "#dfe4f4"], ["#c8935a", "#7c552c", "#f2d7b2"], ["#ff8fb6", "#c4517d", "#ffe0ec"], ["#ff7a45", "#a8401e", "#ffd2a8"], ["#ffa6d8", "#c86aa6", "#fff0f8"]];
  const OBST_TILE = 44;
  function obstRR(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function obstTile(sh, t, w, y, k) {   // one OBST_TILE-high piece of the column body
    const T = OBST_TILE, m = t[0], d = t[1], l = t[2];
    ctx.lineWidth = 2.5; ctx.strokeStyle = "#3a2a4a";
    if (sh === "blocks") {
      const cols = ["#ff6b8a", "#ffd23a", "#4cc3ff", "#6bdc6b", m];
      for (let r = 0; r < 2; r++) { const bw2 = w / 2, off = (k + r) % 2 ? 0 : bw2; for (let c = 0; c < 2; c++) { ctx.fillStyle = cols[(k * 3 + r * 2 + c) % cols.length]; obstRR(((c * bw2 + off) % w) + 1.5, y + r * T / 2 + 1.5, bw2 - 3, T / 2 - 3, 4); ctx.fill(); ctx.stroke(); ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.fillRect(((c * bw2 + off) % w) + 5, y + r * T / 2 + 5, bw2 - 12, 3); } }
    } else if (sh === "balloons") {
      const cols = ["#ff5fa2", "#ffd000", "#37d6ff", "#b197fc", m];
      for (let c = 0; c < 2; c++) { const cx = w * (0.28 + c * 0.44), cy = y + T * (0.4 + (c ^ (k & 1)) * 0.2); ctx.fillStyle = cols[(k * 2 + c) % cols.length]; ctx.beginPath(); ctx.ellipse(cx, cy, w * 0.21, T * 0.34, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.beginPath(); ctx.ellipse(cx - 4, cy - 6, 3, 5, -0.4, 0, Math.PI * 2); ctx.fill(); }
    } else if (sh === "clouds") {
      ctx.fillStyle = "#ffffff"; ctx.strokeStyle = l; ctx.lineWidth = 3;
      for (let c = 0; c < 3; c++) { ctx.beginPath(); ctx.arc(w * (0.22 + c * 0.28), y + T * (0.5 + ((c + k) % 2 ? -0.12 : 0.12)), w * 0.24, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      ctx.fillStyle = "#ffffff"; ctx.fillRect(w * 0.16, y + T * 0.3, w * 0.68, T * 0.4);
    } else if (sh === "rocks") {
      ctx.fillStyle = k % 2 ? m : d; obstRR(2, y + 2, w * 0.58, T * 0.55, 10); ctx.fill(); ctx.stroke();
      ctx.fillStyle = k % 2 ? d : m; obstRR(w * 0.42, y + T * 0.38, w * 0.56, T * 0.6, 11); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.beginPath(); ctx.arc(w * 0.2, y + 10, 4, 0, Math.PI * 2); ctx.arc(w * 0.62, y + T * 0.5, 3.5, 0, Math.PI * 2); ctx.fill();
    } else if (sh === "crystal") {
      ctx.fillStyle = d; ctx.fillRect(0, y, w, T);
      for (let c = 0; c < 3; c++) { const cx = w * (0.18 + c * 0.32), hw = w * 0.15; ctx.fillStyle = c === 1 ? l : m; ctx.beginPath(); ctx.moveTo(cx, y + 1); ctx.lineTo(cx + hw, y + T * 0.3); ctx.lineTo(cx + hw, y + T - 1); ctx.lineTo(cx - hw, y + T - 1); ctx.lineTo(cx - hw, y + T * 0.3); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.fillRect(w * 0.47, y + 8, 3, T * 0.6);
    } else if (sh === "barricade") {
      ctx.fillStyle = k % 2 ? "#c98a4b" : "#b07436"; ctx.fillRect(1, y + 1, w - 2, T - 2); ctx.strokeRect(1, y + 1, w - 2, T - 2);
      ctx.strokeStyle = "#7a4a1e"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(4, y + 4); ctx.lineTo(w - 4, y + T - 4); ctx.moveTo(w - 4, y + 4); ctx.lineTo(4, y + T - 4); ctx.stroke();
      ctx.fillStyle = "#ffe08a"; ctx.beginPath(); ctx.arc(6, y + 6, 2, 0, Math.PI * 2); ctx.arc(w - 6, y + 6, 2, 0, Math.PI * 2); ctx.arc(6, y + T - 6, 2, 0, Math.PI * 2); ctx.arc(w - 6, y + T - 6, 2, 0, Math.PI * 2); ctx.fill();
    } else if (sh === "monster") {   // a wobbly jelly column (slime friend body)
      ctx.fillStyle = m; ctx.fillRect(0, y, w, T); ctx.fillStyle = l; ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.arc(w * (0.25 + (k % 3) * 0.2), y + T * 0.4, 5, 0, Math.PI * 2); ctx.arc(w * 0.7, y + T * 0.75, 3, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = d; ctx.fillRect(0, y, 3, T); ctx.fillRect(w - 3, y, 3, T);
    } else if (sh === "windmill") {   // lattice tower
      ctx.fillStyle = l; ctx.fillRect(w * 0.18, y, w * 0.64, T); ctx.strokeStyle = d; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(w * 0.18, y); ctx.lineTo(w * 0.82, y + T); ctx.moveTo(w * 0.82, y); ctx.lineTo(w * 0.18, y + T); ctx.moveTo(w * 0.18, y); ctx.lineTo(w * 0.18, y + T); ctx.moveTo(w * 0.82, y); ctx.lineTo(w * 0.82, y + T); ctx.stroke();
    }
  }
  function obstBody(sh, st, w) {
    return sprite("ob:" + sh + ":" + st + ":" + w, w, PLAY_H, function () { const t = OBST_TINT[st] || OBST_TINT[0]; for (let k = 0, y = 0; y < PLAY_H; k++, y += OBST_TILE) obstTile(sh, t, w, y, k); });
  }
  // the end piece next to the gap (drawn live for the ones that move; always inside the column box so the gap stays fair)
  function obstEnd(sh, st, p, edgeY, dir) {   // dir -1: top column (gap below edgeY), +1: bottom column
    const t = OBST_TINT[st] || OBST_TINT[0], w = p.w, x0 = p.x, H = PIPE_CAP + 4, y0 = dir < 0 ? edgeY - H : edgeY, cx = x0 + w / 2;
    ctx.lineWidth = 2.5; ctx.strokeStyle = "#3a2a4a";
    if (sh === "monster" && false) {
      const bob = (Math.sin(frame * 0.12 + p.x * 0.05) * 0.5 + 0.5) * 4, fy = dir < 0 ? edgeY - 14 - bob : edgeY + 14 + bob;   // bobs away from the gap only
      ctx.fillStyle = t[0]; ctx.beginPath(); ctx.ellipse(cx, dir < 0 ? edgeY - 16 - bob * 0.5 : edgeY + 16 + bob * 0.5, w / 2, 16, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(cx - 9, fy - 2, 6, 0, Math.PI * 2); ctx.arc(cx + 9, fy - 2, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#2a1a3a"; const lk = Math.sin(frame * 0.05 + p.x) * 1.5; ctx.beginPath(); ctx.arc(cx - 9 + lk, fy - 1, 3, 0, Math.PI * 2); ctx.arc(cx + 9 + lk, fy - 1, 3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#2a1a3a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, fy + 3, 5, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      ctx.fillStyle = "rgba(255,120,160,0.55)"; ctx.beginPath(); ctx.arc(cx - 17, fy + 4, 3.2, 0, Math.PI * 2); ctx.arc(cx + 17, fy + 4, 3.2, 0, Math.PI * 2); ctx.fill();
    } else if (sh === "windmill") {
      const hy = dir < 0 ? edgeY - w / 2 : edgeY + w / 2, a = frame * 0.06 * (p.x % 2 ? 1 : -1), R = w / 2 - 2;
      ctx.fillStyle = t[2]; ctx.strokeStyle = t[1];
      for (let b = 0; b < 4; b++) { const an = a + b * Math.PI / 2; ctx.save(); ctx.translate(cx, hy); ctx.rotate(an); ctx.fillStyle = b % 2 ? t[0] : "#ffffff"; ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(R, -7); ctx.lineTo(R, 3); ctx.lineTo(0, 3); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#3a2a4a"; ctx.lineWidth = 2; ctx.stroke(); ctx.restore(); }
      ctx.fillStyle = "#ffd23a"; ctx.beginPath(); ctx.arc(cx, hy, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (sh === "balloons") {
      const sw = Math.sin(frame * 0.08 + p.x * 0.03) * 2; ctx.fillStyle = "#ff5fa2"; ctx.beginPath(); ctx.ellipse(cx + sw, dir < 0 ? edgeY - 15 : edgeY + 15, w / 2 - 6, 14, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.beginPath(); ctx.ellipse(cx + sw - 8, (dir < 0 ? edgeY - 15 : edgeY + 15) - 5, 4, 6, -0.4, 0, Math.PI * 2); ctx.fill();
    } else {
      const c = sprite("oe:" + sh + ":" + st + ":" + w + ":" + dir, w + 4, H, function () {
        ctx.lineWidth = 2.5; ctx.strokeStyle = "#3a2a4a";
        if (sh === "clouds") { ctx.fillStyle = "#ffffff"; ctx.strokeStyle = t[2]; ctx.lineWidth = 3; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(11 + i * (w - 18) / 2, H / 2, H / 2 - 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); } }
        else if (sh === "barricade") { ctx.fillStyle = "#ffd23a"; ctx.fillRect(1, 2, w + 2, H - 4); ctx.strokeRect(1, 2, w + 2, H - 4); ctx.fillStyle = "#ff5a4a"; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(4 + i * 16, H - 3); ctx.lineTo(12 + i * 16, 3); ctx.lineTo(20 + i * 16, 3); ctx.lineTo(12 + i * 16, H - 3); ctx.closePath(); ctx.fill(); } }
        else if (sh === "blocks") { ctx.fillStyle = "#ffd23a"; obstRR(2, 2, w, H - 4, 6); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#ff6b8a"; ctx.beginPath(); ctx.arc(w / 2 + 2, H / 2, 5, 0, Math.PI * 2); ctx.fill(); }
        else if (sh === "rocks") { ctx.fillStyle = t[0]; obstRR(1, 1, w + 2, H - 2, 11); ctx.fill(); ctx.stroke(); ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.fillRect(10, 6, w * 0.4, 3); }
        else if (sh === "crystal") { ctx.fillStyle = t[2]; ctx.beginPath(); if (dir < 0) { ctx.moveTo(2, 0); ctx.lineTo(w + 2, 0); ctx.lineTo(w * 0.75, H - 1); ctx.lineTo(w * 0.5, H * 0.55); ctx.lineTo(w * 0.25, H - 1); } else { ctx.moveTo(2, H); ctx.lineTo(w + 2, H); ctx.lineTo(w * 0.75, 1); ctx.lineTo(w * 0.5, H * 0.45); ctx.lineTo(w * 0.25, 1); } ctx.closePath(); ctx.fill(); ctx.stroke(); }
      });
      ctx.drawImage(c.c, x0 - 2, y0, c.w, c.h);
    }
  }
  function drawObstShape(p, st, topH, botY, botH) {
    const sh = p.shape, sst = st === "boss" ? 0 : st, rs = renderScale;
    if (sh === "monster") {   // v1.19b: free-standing monsters, no column behind them
      if (!p.noT && !p.crT && topH > 0) { const h = p.lT || Math.min(topH, 64); drawMonsterAt(p, topH - h, h, -1); }
      if (!p.noB && !p.crB && botH > 0) { const h = p.lB || Math.min(botH, 64); drawMonsterAt(p, botY, h, 1); }
      return;
    }
    const b = obstBody(sh, sst, p.w);
    if (topH > 0 && !p.crT && !p.noT) { const L = Math.min(PLAY_H, p.lT || topH), y0 = topH - L; ctx.drawImage(b.c, 0, (PLAY_H - L) * rs, p.w * rs, L * rs, p.x, y0, p.w, L); obstEnd(sh, sst, p, topH, -1); if (p.lT && L > PIPE_CAP * 2 + 6) obstEnd(sh, sst, p, y0, 1); }
    if (botH > 0 && !p.crB && !p.noB) { const L = Math.min(PLAY_H, p.lB || botH); ctx.drawImage(b.c, 0, 0, p.w * rs, L * rs, p.x, botY, p.w, L); obstEnd(sh, sst, p, botY, 1); if (p.lB && L > PIPE_CAP * 2 + 6) obstEnd(sh, sst, p, botY + L, -1); }
  }

  // ---- v1.19b obstacle sizes: helper shapes come in different widths and lengths. The hit box is always the drawn box:
  // top piece = [gapTop - lT, gapTop] (or 0..gapTop when lT is unset), bottom piece = [gapBot, gapBot + lB]. The gap itself
  // (pipeGap from the difficulty curve) never shrinks, so pieces that float only ever add room.
  const OBST_FORMS = ["col", "slim", "chunky", "float", "stub", "single"];
  const OBST_FORM_W = [0.3, 0.15, 0.15, 0.15, 0.15, 0.1];
  let obstFormForce = null, obstMonForce = null;
  // 8 villain monster designs; each world shows its own few
  const MON_KINDS = ["blob", "spiky", "horned", "cyclops", "fuzzy", "rocky", "antenna", "squid"];
  const MON_WORLD = [["blob", "antenna", "fuzzy"], ["spiky", "rocky", "horned"], ["fuzzy", "cyclops", "blob"], ["antenna", "horned", "cyclops"],
    ["rocky", "cyclops", "antenna"], ["horned", "fuzzy", "rocky"], ["squid", "blob", "spiky"], ["rocky", "spiky", "horned"], ["blob", "squid", "fuzzy"]];
  const MON_COL = { blob: ["#3fcf6a", "#1c7a4a", "#0e4a30", "#a8f5b8"], spiky: ["#ff8a2a", "#c8461a", "#6a2208", "#ffd0a0"], horned: ["#9a5cff", "#5a2ad0", "#2c1270", "#d8c4ff"], cyclops: ["#3aa8ff", "#1a5ad8", "#0c2c70", "#b8e4ff"],
    fuzzy: ["#ff4aa0", "#c01a6a", "#5e0c36", "#ffc0e0"], rocky: ["#8a9ab4", "#4c5a74", "#232c40", "#dce4f0"], antenna: ["#ffc83a", "#d08a10", "#5e3e08", "#fff0b0"], squid: ["#ff5a6a", "#c41a40", "#5e0a20", "#ffc8cc"] };   // v1.19e polished: base, shadow, outline, highlight
  function obstPick(arr, wts) { let r = Math.random(), i = 0; for (; i < arr.length - 1; i++) { r -= wts[i]; if (r < 0) break; } return arr[i]; }
  function obstApplyForm(p) {
    if (!p.shape || p.shape === "pipe" || p.amp || p.bAmp || p.style === "boss") return;
    const topH = p.gapY - p.gap / 2, botH = PLAY_H - (p.gapY + p.gap / 2), rnd = (a, b) => a + Math.random() * (b - a);
    if (p.shape === "monster") {
      const wi = typeof p.style === "number" ? p.style : 0, pool = MON_WORLD[wi] || MON_WORLD[0];
      p.mon = obstMonForce || pool[(Math.random() * pool.length) | 0];
      if (obstMonForce) p.mon2 = obstMonForce; else { const rest = MON_KINDS.filter(k => k !== p.mon); p.mon2 = Math.random() < 0.6 ? (pool.filter(k => k !== p.mon)[(Math.random() * (pool.length - 1)) | 0] || rest[0]) : rest[(Math.random() * rest.length) | 0]; }   // top and bottom are never the same monster
      p.monHue = obstMonForce ? 0 : ((wi * 37 + ((Math.random() * 3) | 0) * 25) % 360);   // per-world colour shift
      p.form = obstFormForce === "single" || (!obstFormForce && Math.random() < 0.35) ? "single" : "pair";
      p.w = Math.round(PIPE_W * rnd(1.05, 1.3));
      const h = Math.round(rnd(52, 66));
      p.lT = h; p.lB = h;
      if (p.form === "single") { if (topH > botH) p.noB = 1; else p.noT = 1; }
    } else {
      let f = obstFormForce || obstPick(OBST_FORMS, OBST_FORM_W);
      if (p.shape === "windmill" && f !== "col" && f !== "slim") f = "col";   // the spinning blades need a full-length tower
      p.form = f;
      if (f === "slim") p.w = Math.round(PIPE_W * 0.7);
      else if (f === "chunky") { p.w = Math.round(PIPE_W * 1.55); if (Math.random() < 0.5) { p.lT = Math.round(rnd(70, 110)); p.lB = Math.round(rnd(70, 110)); } }
      else if (f === "float") { p.w = Math.round(PIPE_W * rnd(0.8, 1.1)); p.lT = Math.round(rnd(44, 90)); p.lB = Math.round(rnd(44, 90)); }
      else if (f === "stub") { if (Math.random() < 0.5) p.lT = Math.round(rnd(36, 46)); else p.lB = Math.round(rnd(36, 46)); }
      else if (f === "single") { p.w = Math.round(PIPE_W * rnd(0.8, 1.2)); const L = Math.round(rnd(56, 90)); if (topH > botH) { p.noB = 1; p.lT = L; } else { p.noT = 1; p.lB = L; } }
    }
    if (p.lT && p.lT >= topH - 2) delete p.lT;   // piece reaches the edge: plain full length
    if (p.lB && p.lB >= botH - 2) delete p.lB;
  }
  function segTopA(p) { return p.lT ? p.gapY - p.gap / 2 - p.lT : -1e5; }   // upper end of the top piece
  function segBotB(p) { return p.lB ? p.gapY + p.gap / 2 + p.lB : 1e5; }    // lower end of the bottom piece
  // one polished villain monster filling the box (x, y, w, h); it looks toward the gap (dir -1: gap below, +1: gap above)
  function drawMonsterArt(kind, x, y, w, h, dir, seed) {
    const c = MON_COL[kind] || MON_COL.blob, cx = x + w / 2, cy = y + h / 2, rx = w / 2 - 2, ry = h / 2 - 2, line = c[2];
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    const top = kind === "horned" || kind === "antenna" ? 0.8 : 1, bcy = cy + ry * (1 - top), bry = ry * top;
    const body = () => {   // the body outline as one clean path
      ctx.beginPath();
      if (kind === "spiky") { const n = 10; for (let i = 0; i <= n * 2; i++) { const a = i * Math.PI / n - Math.PI / 2, rr = i % 2 ? 0.74 : 1; const px = cx + Math.cos(a) * rx * rr, py = cy + Math.sin(a) * ry * rr; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); }
      else if (kind === "rocky") { const pts = [[-0.98, -0.42], [-0.55, -1], [0.45, -1], [1, -0.4], [0.94, 0.5], [0.45, 1], [-0.5, 1], [-1, 0.45]]; pts.forEach((q, i) => { const px = cx + q[0] * rx, py = cy + q[1] * ry; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.closePath(); }
      else if (kind === "fuzzy") { const n = 16; ctx.moveTo(cx + rx * 0.9, cy); for (let i = 0; i < n; i++) { const a = i * Math.PI * 2 / n, a2 = a + Math.PI / n, a3 = a + Math.PI * 2 / n; ctx.quadraticCurveTo(cx + Math.cos(a2) * rx * 1.04, cy + Math.sin(a2) * ry * 1.04, cx + Math.cos(a3) * rx * 0.9, cy + Math.sin(a3) * ry * 0.9); } ctx.closePath(); }
      else if (kind === "squid") { ctx.ellipse(cx, cy - ry * 0.22, rx, ry * 0.72, 0, 0, Math.PI * 2); }
      else ctx.ellipse(cx, bcy, rx, bry, 0, 0, Math.PI * 2);
    };
    const shade = (x0, y0, r0) => { const g = ctx.createRadialGradient(x0, y0, 1, x0, y0, r0); g.addColorStop(0, c[3]); g.addColorStop(0.45, c[0]); g.addColorStop(1, c[1]); return g; };
    // behind the body: horns, antennae, tentacles
    if (kind === "horned") {
      for (const s of [-1, 1]) {
        const g = ctx.createLinearGradient(cx + s * rx * 0.2, cy, cx + s * rx * 0.8, y); g.addColorStop(0, "#d9c9a8"); g.addColorStop(1, "#fffaf0");
        ctx.fillStyle = g; ctx.strokeStyle = "#5a4a3a"; ctx.lineWidth = 1.4; ctx.beginPath();
        ctx.moveTo(cx + s * rx * 0.12, bcy - bry * 0.82); ctx.quadraticCurveTo(cx + s * rx * 0.95, bcy - bry * 0.95, cx + s * rx * 0.86, y + 1);
        ctx.quadraticCurveTo(cx + s * rx * 0.7, bcy - bry * 0.62, cx + s * rx * 0.55, bcy - bry * 0.55); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    if (kind === "antenna") {
      for (const s of [-1, 1]) {
        ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx + s * rx * 0.2, bcy - bry * 0.8); ctx.quadraticCurveTo(cx + s * rx * 0.25, y + 4, cx + s * rx * 0.6, y + 5); ctx.stroke();
        ctx.save(); ctx.shadowColor = "#5afff0"; ctx.shadowBlur = 6; const g = ctx.createRadialGradient(cx + s * rx * 0.6 - 1, y + 4, 0.5, cx + s * rx * 0.6, y + 5, 4); g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#22d8e8");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx + s * rx * 0.6, y + 5, 3.8, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
    }
    if (kind === "squid") {
      for (let i = 0; i < 4; i++) {
        const tx = cx - rx * 0.66 + i * rx * 0.44, cv = (i < 2 ? -1 : 1) * rx * 0.16;
        ctx.fillStyle = shade(tx, cy + ry * 0.3, ry * 0.8); ctx.strokeStyle = line; ctx.lineWidth = 1.5; ctx.beginPath();
        ctx.moveTo(tx - rx * 0.16, cy + ry * 0.2); ctx.quadraticCurveTo(tx - rx * 0.14, cy + ry * 0.8, tx + cv, y + h - 1); ctx.quadraticCurveTo(tx + rx * 0.1, cy + ry * 0.7, tx + rx * 0.16, cy + ry * 0.2); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    // body: soft gradient, rim light, glossy highlight, thin even outline
    const lx = cx - rx * 0.35, ly = (kind === "squid" ? cy - ry * 0.5 : bcy - bry * 0.4);
    body(); ctx.fillStyle = shade(lx, ly, Math.max(rx, ry) * 1.5); ctx.fill();
    ctx.save(); body(); ctx.clip();
    ctx.translate(-2.2, -2.6); body(); ctx.strokeStyle = "rgba(255,255,255,0.38)"; ctx.lineWidth = 2.4; ctx.stroke(); ctx.translate(2.2, 2.6);   // rim light on the lower right
    if (kind === "rocky") { ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.beginPath(); ctx.moveTo(cx - rx * 0.55, cy - ry); ctx.lineTo(cx + rx * 0.45, cy - ry); ctx.lineTo(cx + rx * 0.2, cy - ry * 0.45); ctx.lineTo(cx - rx * 0.45, cy - ry * 0.45); ctx.closePath(); ctx.fill(); }   // clean top facet
    const sp = ctx.createRadialGradient(lx - rx * 0.1, ly - 2, 0.5, lx - rx * 0.1, ly - 2, rx * 0.45); sp.addColorStop(0, "rgba(255,255,255,0.75)"); sp.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sp; ctx.beginPath(); ctx.ellipse(lx - rx * 0.1, ly - 2, rx * 0.42, ry * 0.2, -0.35, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    body(); ctx.strokeStyle = line; ctx.lineWidth = 1.6; ctx.stroke();
    // face: sleek angled eyes with a soft glow, a confident smirk with small neat fangs
    const fy = (kind === "squid" ? cy - ry * 0.25 : kind === "horned" || kind === "antenna" ? bcy - 1 : cy - 1), es = Math.min(w, h);
    const GLOW = { blob: "#d8ff7a", spiky: "#fff27a", horned: "#ff9a7a", cyclops: "#ffd27a", fuzzy: "#ffe07a", rocky: "#7afff0", antenna: "#aaffff", squid: "#fff0a0" }[kind] || "#fff27a";
    const eye = (ex, r, s) => {   // s: -1 left, +1 right, 0 single; inner corner sits low for a sharp, confident look
      const ia = s === 0 ? 0.15 : 0.3, oa = s === 0 ? 0.15 : -0.25, xi = ex - (s || -1) * r, xo = ex + (s || -1) * r;
      const yi = fy + r * ia, yo = fy + r * oa;
      ctx.save(); ctx.shadowColor = GLOW; ctx.shadowBlur = 4; ctx.fillStyle = GLOW; ctx.beginPath();
      ctx.moveTo(xi, yi); ctx.quadraticCurveTo(ex, fy - r * 0.55 + (s === 0 ? r * 0.25 : 0), xo, yo); ctx.quadraticCurveTo(ex, fy + r * 0.85, xi, yi); ctx.closePath(); ctx.fill(); ctx.restore();
      ctx.save(); ctx.clip(); ctx.fillStyle = "#1c1030"; ctx.beginPath(); ctx.ellipse(ex + (s || 0) * r * 0.1, fy + r * 0.12, r * 0.32, r * 0.42, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(ex + (s || 0) * r * 0.1 - r * 0.12, fy - r * 0.02, Math.max(0.9, r * 0.12), 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = line; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(xi, yi); ctx.quadraticCurveTo(ex, fy - r * 0.55 + (s === 0 ? r * 0.25 : 0), xo, yo); ctx.stroke();
      ctx.fillStyle = line; ctx.beginPath();   // tapered brow
      if (s === 0) { ctx.moveTo(ex - r * 1.2, fy - r * 0.85); ctx.quadraticCurveTo(ex, fy - r * 0.2, ex + r * 1.2, fy - r * 0.85); ctx.quadraticCurveTo(ex, fy - r * 0.55, ex - r * 1.2, fy - r * 0.85); }
      else { ctx.moveTo(xo + s * r * 0.2, fy - r * 0.95); ctx.quadraticCurveTo(ex, fy - r * 0.75, xi - s * r * 0.1, fy - r * 0.2); ctx.lineTo(xi + s * r * 0.15, fy - r * 0.45); ctx.quadraticCurveTo(ex, fy - r * 1.05, xo + s * r * 0.2, fy - r * 0.95); }
      ctx.fill();
    };
    if (kind === "cyclops") eye(cx, es * 0.2, 0);
    else { const sep = { rocky: 0.18, fuzzy: 0.16, squid: 0.15 }[kind] || 0.17, r = { rocky: 0.11, fuzzy: 0.12, squid: 0.11 }[kind] || 0.12; eye(cx - es * sep, es * r, -1); eye(cx + es * sep, es * r, 1); }
    const my = fy + es * 0.22, mw = es * (kind === "spiky" || kind === "cyclops" ? 0.2 : 0.16);
    const fang = (fx, fy0, len) => { ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.moveTo(fx - 1.5, fy0); ctx.lineTo(fx + 1.5, fy0); ctx.lineTo(fx, fy0 + len); ctx.closePath(); ctx.fill(); };
    ctx.fillStyle = "#2a1030"; ctx.strokeStyle = line; ctx.lineWidth = 1.2;
    if (kind === "spiky") {   // wide confident grin, neat even teeth
      ctx.beginPath(); ctx.moveTo(cx - mw, my - 2.5); ctx.quadraticCurveTo(cx, my + 6, cx + mw, my - 3.5); ctx.quadraticCurveTo(cx, my + 0.5, cx - mw, my - 2.5); ctx.fill();
      for (let i = 0; i < 4; i++) fang(cx - mw * 0.6 + i * mw * 0.4, my - 1.2 + (i === 0 || i === 3 ? -0.6 : 0), 2.6);
    } else if (kind === "squid") {   // small snarl
      ctx.beginPath(); ctx.moveTo(cx - mw, my - 0.5); ctx.quadraticCurveTo(cx, my - 2.5, cx + mw, my - 1.5); ctx.quadraticCurveTo(cx, my + 4, cx - mw, my - 0.5); ctx.fill(); fang(cx - mw * 0.4, my - 1.3, 3.2); fang(cx + mw * 0.4, my - 1.6, 3.2);
    } else {   // one-sided smirk with two small fangs
      ctx.beginPath(); ctx.moveTo(cx - mw, my + 0.5); ctx.quadraticCurveTo(cx - mw * 0.1, my + 3.2, cx + mw, my - 2.5); ctx.quadraticCurveTo(cx, my + 0.8, cx - mw, my + 0.5); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx + mw, my - 2.5); ctx.lineTo(cx + mw + 1.5, my - 3.5); ctx.stroke();
      fang(cx - mw * 0.35, my + 0.7, 3.2); fang(cx + mw * 0.3, my - 0.2, 3.2);
    }
    ctx.lineCap = "butt";
  }
  function monsterSprite(kind, w, h, dir, hue) {
    return sprite("mon:" + kind + ":" + w + ":" + h + ":" + dir + ":" + (hue | 0), w + 2, h + 2, function () { if (hue) ctx.filter = "hue-rotate(" + (hue | 0) + "deg)"; drawMonsterArt(kind, 1, 1, w, h, dir, 0); ctx.filter = "none"; });
  }
  function drawMonsterAt(p, sideY0, h, dir) {
    const bob = Math.sin(frame * 0.1 + p.x * 0.05) * 1.2, s = monsterSprite((dir > 0 && p.mon2) || p.mon || "blob", p.w, h, dir, p.monHue);
    ctx.save(); ctx.translate(p.x + p.w / 2, sideY0 + h / 2); ctx.scale(1 + bob * 0.012, 1 - bob * 0.012);   // gentle squish, stays inside the box
    ctx.drawImage(s.c, -s.w / 2, -s.h / 2, s.w, s.h); ctx.restore();
  }

  function drawStyledPipe(p) {
    const st = p.style == null ? 0 : p.style;
    if (p.x > W + 4 || p.x + p.w < -4) return true;
    const topH = p.gapY - p.gap / 2;
    const botY = p.gapY + p.gap / 2;
    const botH = PLAY_H - botY;
    const body = stylePipeBody(st, p.w);
    const rs = renderScale;
    const fullW = !!OBST_KINDS[pipeStyleDef(st).deco];
    const bx = fullW ? 0 : 4;
    const bw = p.w - bx * 2;
    // top pipe: source taken from the BOTTOM of the sprite so its pattern meets the cap the same way every time
    const isSh = !!(p.shape && p.shape !== "pipe");
    if (isSh) drawObstShape(p, st, topH, botY, botH);
    if (!isSh && topH > 0 && !p.crT) ctx.drawImage(body.c, bx * rs, Math.max(0, PLAY_H - topH) * rs, bw * rs, Math.min(PLAY_H, topH) * rs, p.x + bx, 0, bw, topH);
    if (!isSh && botH > 0 && !p.crB) ctx.drawImage(body.c, bx * rs, 0, bw * rs, Math.min(PLAY_H, botH) * rs, p.x + bx, botY, bw, botH);
    const capT = stylePipeCap(st, p.w, false);
    const capB = stylePipeCap(st, p.w, true);
    if (!isSh && !p.crT) ctx.drawImage(capT.c, p.x - 2, topH - PIPE_CAP - 2, capT.w, capT.h);
    if (!isSh && !p.crB) ctx.drawImage(capB.c, p.x - 2, botY - 2, capB.w, capB.h);
    if (p.hpT || p.hpB) drawPipeCracks(p, topH, botY);
    if (p.stubT !== undefined) drawPipeStub(p, topH, botY, body, rs, bx, bw, capT, capB);
    if (p.amp || p.bAmp) {
      // moving pipe tell: small chevrons on the caps
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      const cx = p.x + p.w / 2;
      ctx.beginPath();
      ctx.moveTo(cx - 5, topH - 8); ctx.lineTo(cx, topH - 13); ctx.lineTo(cx + 5, topH - 8);
      ctx.moveTo(cx - 5, botY + 8); ctx.lineTo(cx, botY + 13); ctx.lineTo(cx + 5, botY + 8);
      ctx.fill();
    }
    return true;
  }
  /** Bake the next world's sprites ahead of time (called on spare frames near a world change). */
  let warmWorldFor = -1;
  function warmNextWorld() {
    if (state !== State.PLAY) return;
    const lv = level;
    const nextWi = worldIndexFor(lv + 1);
    const want = nextWi !== worldIndexFor(lv) ? nextWi : -1;
    const bossNext = isBossLevel(lv + 1);
    if (want < 0 && !bossNext) return;
    const key = want * 1000 + (bossNext ? 1 : 0) + lv * 7;
    if (warmWorldFor === key) return;
    warmWorldFor = key;
    try {
      if (want >= 0) {
        const d = worldDefAt(want);
        if (d.far) { worldSkySprite(want); worldFarSprite(want); worldGroundSprite(want); }
        stylePipeBody(want % WORLDS.length, PIPE_W); stylePipeCap(want % WORLDS.length, PIPE_W, false); stylePipeCap(want % WORLDS.length, PIPE_W, true);
      }
      if (bossNext) { stylePipeBody("boss", PIPE_W); stylePipeCap("boss", PIPE_W, false); stylePipeCap("boss", PIPE_W, true); }
    } catch (_) {}
  }

  // —— World music: original 32-step chiptune loops, one per world (synthesized live; no samples) ——
  function mf(m) { return m ? 440 * Math.pow(2, (m - 69) / 12) : 0; }
  function seqM(arr) { return arr.map(mf); }
  const SONGS = [
    null, // 0 = the classic 1.9.2 loop (LEAD/BASS/ARP above)
    { name: "Dune Drift", bpm: 116, leadWave: "triangle", bassWave: "triangle", // D Hijaz-flavoured
      lead: seqM([62, 0, 63, 66, 67, 0, 66, 63, 62, 0, 0, 69, 70, 69, 67, 66, 67, 0, 66, 63, 62, 0, 63, 0, 66, 67, 69, 67, 66, 63, 62, 0]),
      bass: seqM([38, 0, 0, 38, 45, 0, 38, 0, 38, 0, 0, 38, 46, 0, 45, 0, 43, 0, 0, 43, 38, 0, 45, 0, 38, 0, 0, 38, 45, 0, 38, 0]),
      arp: seqM([0, 74, 0, 0, 0, 78, 0, 0, 0, 74, 0, 0, 0, 79, 0, 0, 0, 74, 0, 0, 0, 78, 0, 0, 0, 74, 0, 0, 0, 75, 0, 0]),
      kick: [0, 6, 8, 14, 16, 22, 24, 28] },
    { name: "Frost Bells", bpm: 104, leadWave: "sine", bassWave: "triangle", // E major, bell-like
      lead: seqM([76, 0, 71, 0, 73, 0, 75, 0, 76, 0, 78, 0, 80, 0, 0, 0, 78, 0, 76, 0, 75, 0, 73, 0, 71, 0, 73, 0, 75, 0, 0, 0]),
      bass: seqM([40, 0, 0, 0, 47, 0, 0, 0, 44, 0, 0, 0, 45, 0, 0, 0, 42, 0, 0, 0, 47, 0, 0, 0, 45, 0, 0, 0, 47, 0, 0, 0]),
      arp: seqM([88, 0, 83, 0, 87, 0, 83, 0, 88, 0, 85, 0, 92, 0, 85, 0, 90, 0, 85, 0, 87, 0, 83, 0, 85, 0, 81, 0, 87, 0, 83, 0]),
      kick: [0, 16] },
    { name: "Neon Nights", bpm: 120, leadWave: "square", bassWave: "sawtooth", // A minor synth-pop
      lead: seqM([69, 0, 72, 0, 76, 0, 74, 72, 71, 0, 0, 67, 69, 0, 0, 0, 65, 0, 69, 0, 72, 0, 71, 69, 67, 0, 71, 0, 74, 0, 0, 0]),
      bass: seqM([45, 45, 0, 45, 0, 45, 57, 0, 43, 43, 0, 43, 0, 43, 55, 0, 41, 41, 0, 41, 0, 41, 53, 0, 43, 43, 0, 43, 0, 43, 55, 0]),
      arp: seqM([81, 76, 72, 76, 81, 76, 72, 76, 79, 74, 71, 74, 79, 74, 71, 74, 77, 72, 69, 72, 77, 72, 69, 72, 79, 74, 71, 74, 79, 74, 71, 74]),
      kick: [0, 4, 8, 12, 16, 20, 24, 28] },
    { name: "Star Drift", bpm: 96, leadWave: "sine", bassWave: "sine", // C lydian, floaty
      lead: seqM([72, 0, 0, 0, 76, 0, 78, 0, 79, 0, 0, 0, 0, 0, 78, 0, 76, 0, 0, 0, 74, 0, 72, 0, 74, 0, 0, 0, 0, 0, 0, 0]),
      bass: seqM([36, 0, 0, 0, 0, 0, 0, 0, 38, 0, 0, 0, 0, 0, 0, 0, 33, 0, 0, 0, 0, 0, 0, 0, 38, 0, 0, 0, 0, 0, 0, 0]),
      arp: seqM([84, 0, 79, 0, 88, 0, 79, 0, 86, 0, 78, 0, 90, 0, 78, 0, 84, 0, 76, 0, 81, 0, 76, 0, 86, 0, 78, 0, 83, 0, 78, 0]),
      kick: [0] },
    { name: "Petal Breeze", bpm: 124, leadWave: "triangle", bassWave: "triangle", // G major pentatonic
      lead: seqM([79, 0, 76, 74, 76, 0, 79, 0, 81, 0, 79, 76, 74, 0, 0, 0, 76, 0, 74, 71, 74, 0, 76, 0, 79, 0, 76, 74, 71, 0, 0, 0]),
      bass: seqM([43, 0, 50, 0, 43, 0, 50, 0, 40, 0, 47, 0, 40, 0, 47, 0, 36, 0, 43, 0, 36, 0, 43, 0, 38, 0, 45, 0, 38, 0, 50, 0]),
      arp: seqM([0, 0, 86, 0, 0, 0, 83, 0, 0, 0, 88, 0, 0, 0, 83, 0, 0, 0, 84, 0, 0, 0, 79, 0, 0, 0, 86, 0, 0, 0, 81, 0]),
      kick: [0, 8, 16, 24] },
  ];
  let songIdx = 0;
  let songBoss = false;
  let musicStepDur = MUSIC_STEP;
  function setSongForWorld() {
    const s = state === State.START ? 0 : worldDefAt(worldIdx).song;
    if (s === songIdx && songBoss === bossOn) return;
    songIdx = s;
    songBoss = bossOn && state !== State.START;
    const bpm = (SONGS[s] ? SONGS[s].bpm : MUSIC_BPM) * (songBoss ? 1.12 : 1);
    musicStepDur = 60 / bpm / 4;
    musicStep = 0; // start the new loop from its first bar
  }
  /** Schedules one 16th-note step of the current world's loop (boss: faster + low pulse). */
  function scheduleWorldNote(step, when) {
    const song = SONGS[songIdx];
    const sd = musicStepDur;
    if (!song) {
      const i = step % LEAD.length;
      if (LEAD[i]) playTone(LEAD[i], when, sd * 0.85, "square", 0.55, musicGain);
      if (BASS[i]) playTone(songBoss ? BASS[i] / 2 : BASS[i], when, sd * 1.05, songBoss ? "sawtooth" : "triangle", songBoss ? 0.45 : 0.7, musicGain);
      if (ARP[i]) playTone(ARP[i], when, sd * 0.55, "triangle", 0.28, musicGain);
      if (i % 8 === 0) playTone(90, when, sd * 0.45, "sine", 0.45, musicGain);
      else if (i % 4 === 0) playTone(120, when, sd * 0.3, "sine", 0.22, musicGain);
      if (songBoss && i % 2 === 1) playTone(55, when, sd * 0.4, "square", 0.12, musicGain);
      return;
    }
    const i = step % song.lead.length;
    const l = song.lead[i], b = song.bass[i], a = song.arp[i];
    if (l) playTone(l, when, sd * (song.leadWave === "sine" ? 1.6 : 0.85), song.leadWave, song.leadWave === "square" ? 0.42 : 0.6, musicGain);
    if (b) playTone(songBoss ? b / 2 : b, when, sd * 1.05, songBoss ? "sawtooth" : song.bassWave, song.bassWave === "sawtooth" || songBoss ? 0.32 : 0.7, musicGain);
    if (a) playTone(a, when, sd * 0.5, "triangle", 0.22, musicGain);
    if (song.kick.indexOf(i) >= 0) playTone(90, when, sd * 0.45, "sine", 0.45, musicGain);
    if (songBoss && i % 2 === 1) playTone(55, when, sd * 0.4, "square", 0.12, musicGain);
  }
  function sfxBoss() {
    sweep(220, 90, 0.35, "sawtooth", 0.05);
    beep(110, 0.18, "square", 0.04, 0.12);
    beep(110, 0.18, "square", 0.04, 0.32);
  }

  function debug110() {
    return {
      world: worldIdx, worldName: worldNameAt(worldIdx), worldFade: worldFade, boss: bossOn, bossesCleared: bossesCleared,
      banner: bigBannerT > 0 ? bigBannerText + (bigBannerSub ? " | " + bigBannerSub : "") : "",
      powerups: powerups.map(function (u) { return { kind: u.kind, x: u.x, y: u.y, attached: !!u.pipe }; }),
      puMode: puMode, puModeLeft: puModeLeft, puModeTotal: puModeTotal, puVis: puVis, pipesSmashed: pipesSmashed, shipRockets: shipRockets.length,
      blackholes: blackholes.map(function (h) { return { x: h.x, y: h.y, attached: !!h.pipe }; }), bhUsed: bhUsed, bhRun: bhRun, warpFlash: warpFlash,
      smashedPipes: pipes.filter(function (p) { return p.smashed; }).length,
      puMagnet: puMagnetFrames, shieldCharges: shieldCharges, puCollected: puCollected,
      song: songIdx, songBoss: songBoss, stepDur: musicStepDur,
      movingPipes: pipes.filter(function (p) { return p.amp || p.bAmp; }).map(function (p) { return { x: p.x, gapY: p.gapY, gapY0: p.gapY0, gap: p.gap, gap0: p.gap0, amp: p.amp, bAmp: p.bAmp, style: p.style }; }),
      pipeStyles: pipes.map(function (p) { return p.style; }),
      pipeGap: pipeGap, spawnEvery: spawnEvery, gapMargin: gapMargin,
    };
  }

  // ======================================================================================
  // v1.12 — combo meter, daily streak popup, free reward chest. COINS ONLY: nothing here costs
  // real money (no paid spins / loot boxes / randomized purchases). The only ad is an opt-in
  // "double it" button the player taps; nothing plays automatically.
  // ======================================================================================
  const comboSt = E.comboNew();
  let comboCoinSincePass = false;
  let runBestCombo = 0, runBestMult = 1, runSoClose = 0, runChestCoins = 0, chestGivenThisRun = false;
  let comboPulse = 0, comboPulseRGB = "255,215,90", comboHudPop = 0, comboLostT = 0;
  let chest = null;               // { phase: closed|opening|open|done, t, tier, base, coins, doubled }
  let streakPop = null;           // { t, count, coins, info }
  let chestForceTier = null;      // debug only
  const COMBO_COLORS = ["#ffffff", "#9dffc4", "#6ee7ff", "#ffe066", "#ffa94d", "#ff7ac8", "#c39bff", "#ff5c5c"];
  const COMBO_RGB = ["255,255,255", "157,255,196", "110,231,255", "255,224,102", "255,169,77", "255,122,200", "195,155,255", "255,92,92"];
  const CHEST_SHOW_AT = 22;       // game-over frames before the chest card appears
  const CHEST_OPEN_FRAMES = 34;   // rattle time before the lid opens
  function comboColor(m) { return COMBO_COLORS[Math.max(0, Math.min(7, m - 1))]; }
  function comboRGB(m) { return COMBO_RGB[Math.max(0, Math.min(7, m - 1))]; }
  function dbgFlag(name) { return !!debugMode && new RegExp("[?&]" + name + "=1\\b").test(String(location.search)); }

  function resetRun112(fresh) {
    E.comboBreak(comboSt);
    comboCoinSincePass = false;
    comboPulse = 0; comboHudPop = 0; comboLostT = 0;
    chest = null;
    if (fresh) { runBestCombo = 0; runBestMult = 1; runSoClose = 0; runChestCoins = 0; chestGivenThisRun = false; }
  }

  // —— sounds (all synthesized) ——
  function sfxComboUp(m) {
    const b = 480 * Math.pow(1.085, m);
    beep(b, 0.07, "triangle", 0.05);
    beep(b * 1.25, 0.08, "triangle", 0.05, 0.06);
    beep(b * 1.5, 0.12, "sine", 0.055, 0.12);
    if (m >= 5) beep(b * 2, 0.16, "sine", 0.05, 0.19);
    if (m >= 8) sweep(500, 2400, 0.3, "sawtooth", 0.025, 0.1);
  }
  function sfxComboLost() { sweep(560, 190, 0.22, "triangle", 0.045); }
  function sfxChestOpenStart() { sweep(220, 660, 0.18, "square", 0.03); }
  function sfxChestTier(id) {
    if (id === "jackpot") {
      const n = [523, 659, 784, 1046, 1318, 1568];
      for (let i = 0; i < n.length; i++) beep(n[i], 0.16, "triangle", 0.06, i * 0.07);
      sweep(300, 2600, 0.5, "sawtooth", 0.025, 0.05);
    } else if (id === "medium") {
      const n = [659, 784, 988, 1319];
      for (let i = 0; i < n.length; i++) beep(n[i], 0.12, "triangle", 0.055, i * 0.07);
      sweep(400, 1600, 0.25, "sine", 0.03, 0.05);
    } else {
      beep(784, 0.08, "triangle", 0.05);
      beep(988, 0.08, "triangle", 0.05, 0.08);
      beep(1175, 0.14, "sine", 0.05, 0.16);
    }
  }

  // —— combo events ——
  function comboFloat(text, color, px, dy) {
    if (floaters.length > 6) floaters.shift();
    floaters.push({ x: Math.max(80, Math.min(W - 80, bird.x + 62)), y: Math.max(80, Math.min(PLAY_H - 50, bird.y + (dy || -50))), text: text, life: 58, color: color, big: true, px: px, pop: true, age: 0 });
  }
  function comboEvent(ev) {
    if (state !== State.PLAY || puMode) return null;
    const r = E.comboApply(comboSt, ev);
    if (comboSt.count > runBestCombo) runBestCombo = comboSt.count;
    if (comboSt.mult > runBestMult) runBestMult = comboSt.mult;
    if (r.reset) {
      comboLostT = 1;
      sfxComboLost();
    }
    if (r.up) comboCelebrate(r);
    else if (ev !== "plain") comboHudPop = Math.max(comboHudPop, 0.55);
    return r;
  }
  function comboCelebrate(r) {
    const m = r.mult;
    const col = comboColor(m), rgb = comboRGB(m);
    comboHudPop = 1;
    comboFloat("COMBO ×" + m + "!", col, 18 + Math.min(m, 8) * 2.5, -52);
    rings.push({ x: bird.x, y: bird.y, r: 10, max: 38 + m * 8, life: 1, color: rgb });
    spawnParticles(bird.x, bird.y, 6 + m * 3, col);
    sfxComboUp(m);
    if (m >= 3) {
      // BURST: second ring, star sparkles, screen pulse + a little shake
      rings.push({ x: bird.x, y: bird.y, r: 24, max: 70 + m * 10, life: 1, color: rgb });
      spawnParticles(bird.x, bird.y, 10 + m * 2, "#ffffff");
      comboPulse = Math.min(1, 0.4 + m * 0.09);
      comboPulseRGB = rgb;
      screenShake = Math.max(screenShake, 0.25 + m * 0.05);
      haptic("score");
    }
    if (m >= 5) {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const p = addParticle(bird.x, bird.y, Math.cos(a) * 3.4, Math.sin(a) * 3.4, 30, 34, col, 3);
        if (p) p.star = true;
      }
    }
    if (r.bonus > 0) {
      const n = E.addCoins(save, r.bonus);
      runCoins += n;
      coinPop = 1;
      comboFloat("+" + n + " bonus coins", "#ffd24a", 15, -26);
    }
  }
  function soCloseBonus() {
    const n = E.addCoins(save, E.SO_CLOSE_COINS);
    runCoins += n;
    runSoClose++;
    coinPop = 1;
  }

  // —— daily streak popup ——
  function streakCheckinNow() {
    try {
      if (dbgFlag("nostreak")) return null;
      const r = E.streakCheckin(save, todayKey());
      if (r.show && save.streak.pending > 0) streakPop = { t: 0, count: save.streak.count, coins: save.streak.pending, info: save.streak.pendingInfo };
      persist();
      return r;
    } catch (_) { return null; }
  }
  function streakPopActive() { return !!streakPop && (state === State.START || (state === State.OVER && !chestActive())); }
  function streakCollect() {
    if (!streakPop) return 0;
    const n = E.streakClaim(save);
    const info = streakPop.info;
    streakPop = null;
    persist();
    coinPop = 1;
    sfxBigCoin();
    spawnParticles(W / 2, 330, 18, "#ffe066");
    shopToast = 1.2;
    shopToastText = "Streak bonus +" + n + (info && info.freezeEarned ? "  ·  ❄ Streak Freeze earned" : "");
    ignoreInputFrames = Math.max(ignoreInputFrames, 8);
    return n;
  }

  // —— reward chest ——
  function chestActive() { return state === State.OVER && !!chest && chest.phase !== "done"; }
  function chestOffer() {
    chest = null;
    if (chestGivenThisRun || dbgFlag("nochest") || !E.chestEligible(score)) return;
    chestGivenThisRun = true;
    let tier = E.chestRoll(Math.random);
    if (chestForceTier) { for (const t of E.CHEST_TIERS) if (t.id === chestForceTier) tier = t; chestForceTier = null; }
    const base = E.chestBase(score, runBestCombo);
    const n = E.addCoins(save, E.chestPrize(tier, base));
    runCoins += n;
    runChestCoins += n;
    save.stats.chests++;
    chest = { phase: "closed", t: 0, tier: tier, base: base, coins: n, doubled: false };
  }
  function chestTierFx(first) {
    const id = chest.tier.id;
    const cx = W / 2, cy = 232;
    sfxChestTier(id);
    coinPop = 1;
    const col = id === "jackpot" ? "#ffe066" : (id === "medium" ? "#9be7ff" : "#ffffff");
    spawnParticles(cx, cy, id === "jackpot" ? 40 : (id === "medium" ? 24 : 12), col);
    rings.push({ x: cx, y: cy, r: 10, max: id === "jackpot" ? 150 : 90, life: 1, color: id === "jackpot" ? "255,220,90" : "160,225,255" });
    if (id !== "small") {
      comboPulse = id === "jackpot" ? 1 : 0.6;
      comboPulseRGB = id === "jackpot" ? "255,215,90" : "130,210,255";
      screenShake = Math.max(screenShake, id === "jackpot" ? 0.9 : 0.4);
      haptic("evolve");
    }
  }
  function chestReveal() {
    chest.phase = "open";
    chest.t = 0;
    chestTierFx();
  }
  function chestTap() {
    if (!chest || chest.phase === "done") return false;
    if (overTimer < CHEST_SHOW_AT + 8) return true;
    if (chest.phase === "closed") { chest.phase = "opening"; chest.t = 0; sfxChestOpenStart(); haptic("near"); }
    else if (chest.phase === "opening") { if (chest.t >= 8) chestReveal(); }
    else if (chest.phase === "open") { if (chest.t >= 12) { chest.phase = "done"; ignoreInputFrames = Math.max(ignoreInputFrames, 6); } }
    return true;
  }
  function chestTick() {
    if (!chestActive() || overTimer < CHEST_SHOW_AT) return;
    chest.t++;
    if (chest.phase === "opening") {
      if (chest.t % 5 === 0) beep(170 + chest.t * 6, 0.05, "square", 0.035);
      if (chest.t >= CHEST_OPEN_FRAMES) chestReveal();
    } else if (chest.phase === "open") {
      const id = chest.tier.id;
      if (chest.t < 40 && (id !== "small" || chest.t < 10) && chest.t % 2 === 0) {
        const n = id === "jackpot" ? 3 : 1;
        for (let i = 0; i < n; i++) addParticle(W / 2 + (Math.random() - 0.5) * 50, 222, (Math.random() - 0.5) * 4.5, -3 - Math.random() * 4.5, 42, 42, id === "jackpot" ? "#ffd23a" : "#ffe9a0", 2 + Math.random() * 2);
      }
    }
  }
  function canOfferChestDouble() {
    return !!chest && chest.phase === "open" && !chest.doubled && chest.coins > 0 && state === State.OVER && !rewardBusy && !continueBusy && (canNativeUnlockAd() || isBrowserPlay());
  }
  function grantChestDouble() {
    if (!chest || chest.doubled) return;
    const n = E.addCoins(save, chest.coins);
    chest.coins += n; chest.doubled = true;
    runCoins += n; runChestCoins += n;
    persist();
    coinPop = 1;
    sfxBigCoin();
    spawnParticles(W / 2, 232, 24, "#ffe066");
  }
  /** Opt-in only: runs when the player taps the button. Native: rewarded "unlock" unit; web: demo. */
  async function requestChestDouble() {
    if (!canOfferChestDouble()) return;
    if (isBrowserPlay()) { grantChestDouble(); return; }
    const ads = adsApi();
    if (!ads || typeof ads.showRewarded !== "function") return;
    rewardBusy = true;
    const rq = newAdReq();
    try {
      const ok = await ads.showRewarded("unlock", rq.opts);
      if (rq.stale()) return;
      rewardBusy = false;
      if (ok) grantChestDouble();
      else if (!lastAdCancelled()) showAdFailureNotice();
    } catch (_) {
      if (rq.stale()) return;
      rewardBusy = false;
      showAdFailureNotice();
    }
  }
  function endRun112() {
    save.stats.bestCombo = Math.max(save.stats.bestCombo | 0, runBestCombo);
    E.comboBreak(comboSt);
    comboPulse = 0;
    chestOffer();
  }
  function tickV112() {
    if (comboPulse > 0.01) comboPulse *= 0.9; else comboPulse = 0;
    if (comboHudPop > 0.01) comboHudPop *= 0.88; else comboHudPop = 0;
    if (comboLostT > 0.02) comboLostT *= 0.92; else comboLostT = 0;
    if (streakPop) streakPop.t++;
    chestTick();
  }

  // —— drawing ——
  function drawComboHud() {
    if (state !== State.PLAY) return;
    const m = comboSt.mult;
    if (comboSt.count <= 0) {
      if (comboLostT > 0.08) flashText("comboLost", "Combo lost", 13, "#ffb4b4", "rgba(60,0,0,0.4)", 3, 62, 92, Math.min(1, comboLostT));
      return;
    }
    const col = comboColor(m);
    const w = 108, h = 26, sc = 1 + comboHudPop * 0.28;
    const x = 8 + w / 2, y = 92;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sc, sc);
    ctx.fillStyle = "rgba(10,20,40,0.62)";
    roundRect(-w / 2, -h / 2, w, h, 9);
    ctx.fill();
    const warn = comboSt.strikes > 0;
    ctx.strokeStyle = warn && (frame % 16 < 8) ? "#ff6b6b" : col;
    ctx.lineWidth = 2;
    roundRect(-w / 2, -h / 2, w, h, 9);
    ctx.stroke();
    const prog = m >= E.COMBO_CAP ? 1 : (comboSt.count - 2 * (m - 1)) / 2;
    ctx.fillStyle = col;
    ctx.fillRect(-w / 2 + 6, h / 2 - 6, (w - 12) * Math.max(0.05, prog), 3);
    const sl = textSlot("combo", "COMBO ×" + m, 13, true, col, "rgba(0,0,0,0.45)", 3);
    drawSlot(sl, -sl.w / 2, -sl.h / 2 - 2);
    ctx.restore();
  }
  function drawGlowText(text, x, y, px, fill) {
    ctx.font = "bold " + px + "px " + FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 5;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(40,20,0,0.55)";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }
  function drawChestBox(cx, cy, sc, open, rgb, shake) {
    ctx.save();
    ctx.translate(cx, cy);
    if (shake) ctx.rotate(Math.sin(chest.t * 1.9) * 0.07 * shake);
    ctx.scale(sc, sc);
    if (open > 0.02) {
      const g = ctx.createRadialGradient(0, -14, 4, 0, -14, 120);
      g.addColorStop(0, "rgba(" + rgb + "," + (0.9 * open).toFixed(3) + ")");
      g.addColorStop(1, "rgba(" + rgb + ",0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, -14, 120, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#6d3410"; roundRect(-50, 0, 100, 58, 8); ctx.fill();
    ctx.fillStyle = "#8f4d1d"; roundRect(-50, 0, 100, 20, 6); ctx.fill();
    if (open > 0.05) { ctx.fillStyle = "rgba(255,226,120," + open.toFixed(3) + ")"; roundRect(-44, -3, 88, 11, 5); ctx.fill(); }
    ctx.fillStyle = "#f2b630";
    ctx.fillRect(-50, 28, 100, 7); ctx.fillRect(-32, 0, 9, 58); ctx.fillRect(23, 0, 9, 58);
    // lid: shut = sits on the body; open = hops up and tilts back, leaving a glowing gap
    ctx.save();
    ctx.translate(0, -open * 30);
    ctx.rotate(-open * 0.1);
    ctx.fillStyle = "#99521f"; roundRect(-50, -36, 100, 36, 15); ctx.fill();
    ctx.fillStyle = "#f2b630";
    ctx.fillRect(-50, -14, 100, 7); ctx.fillRect(-32, -36, 9, 36); ctx.fillRect(23, -36, 9, 36);
    ctx.fillStyle = "rgba(255,255,255,0.18)"; roundRect(-44, -32, 88, 6, 3); ctx.fill();
    ctx.restore();
    if (open < 0.4) {
      ctx.fillStyle = "#ffd84a"; roundRect(-10, -8, 20, 24, 5); ctx.fill();
      ctx.fillStyle = "#7a4a00"; ctx.beginPath(); ctx.arc(0, 2, 3.2, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(-1.2, 3, 2.4, 7);
    }
    ctx.restore();
  }
  function drawChestOverlay() {
    uiButtons.chestDouble = null;
    uiButtons.chestCollect = null;
    if (!chestActive() || overTimer < CHEST_SHOW_AT) return;
    const c = chest, id = c.tier.id;
    const fade = Math.min(1, (overTimer - CHEST_SHOW_AT) / 8);
    const rgb = id === "jackpot" ? "255,214,80" : (id === "medium" ? "130,215,255" : "255,236,170");
    const open = c.phase === "open" ? Math.min(1, c.t / 10) : 0;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = "rgba(6,12,34,0.95)";
    ctx.fillRect(0, 0, W, H);
    if (c.phase === "open" && id !== "small") {
      ctx.save();
      ctx.translate(W / 2, 232);
      ctx.rotate(c.t * 0.012);
      ctx.fillStyle = "rgba(" + rgb + "," + (id === "jackpot" ? 0.15 : 0.09) + ")";
      for (let i = 0; i < 12; i++) {
        ctx.rotate(Math.PI / 6);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-26, -300); ctx.lineTo(26, -300); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    drawGlowText("REWARD CHEST", W / 2, 84, 26, "#ffd24a");
    ctx.font = "bold 12px " + FONT; ctx.fillStyle = "#b8c8e8"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("Score " + score + (runBestCombo >= 2 ? "  ·  best combo ×" + E.comboMultFor(runBestCombo) : ""), W / 2, 112);
    const bounce = c.phase === "closed" ? Math.sin(c.t * 0.14) * 4 : 0;
    const sc = c.phase === "closed" ? 1 + Math.sin(c.t * 0.14) * 0.03 : (c.phase === "open" ? 1 + Math.max(0, 1 - c.t / 10) * 0.15 : 1.04);
    drawChestBox(W / 2, 236 + bounce, 1.45 * sc, open, rgb, c.phase === "opening" ? 0.6 + c.t / CHEST_OPEN_FRAMES : 0);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    let btnY = 440;
    if (c.phase === "closed") {
      const a = 0.65 + 0.35 * Math.sin(c.t * 0.2);
      ctx.globalAlpha = fade * a;
      drawGlowText("Tap to open!", W / 2, 352, 26, "#ffffff");
      ctx.globalAlpha = fade;
      ctx.font = "13px " + FONT; ctx.fillStyle = "#b8c8e8";
      ctx.fillText("Free prize \u2014 bigger with score and combo", W / 2, 382);
    } else if (c.phase === "opening") {
      drawGlowText("Opening\u2026", W / 2, 352, 26, "#ffe9a0");
    } else {
      const pulse = 1 + Math.max(0, 1 - c.t / 12) * 0.35;
      drawGlowText(id === "jackpot" ? "JACKPOT!" : (id === "medium" ? "Nice! Medium prize" : "Small prize"), W / 2, 346, id === "jackpot" ? 34 : 24, id === "jackpot" ? "#ffe066" : (id === "medium" ? "#9be7ff" : "#ffffff"));
      ctx.save();
      ctx.translate(W / 2, 392);
      ctx.scale(pulse, pulse);
      drawCoinIcon(-56, 0, 14, 1);
      drawGlowText("+" + c.coins, 12, 0, 36, "#ffd23a");
      ctx.restore();
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = "12px " + FONT; ctx.fillStyle = "#b8c8e8";
      ctx.fillText(c.doubled ? "Doubled!" : "Base " + c.base + " \u00d7 " + c.tier.mult, W / 2, 422);
      if (c.t >= 12) {
        if (canOfferChestDouble()) {
          const lbl = isBrowserPlay() ? "Demo: double chest +" + c.coins : "\u25b6 Watch ad \u2014 double chest +" + c.coins;
          uiButtons.chestDouble = drawButton(W / 2 - 150, 440, 300, 40, lbl, "rgba(100,70,180,0.95)", "#fff", "bold 13px " + FONT);
          btnY = 490;
        }
        uiButtons.chestCollect = drawButton(W / 2 - 110, btnY, 220, 40, "Continue", "rgba(40,150,90,0.95)", "#fff", "bold 15px " + FONT);
      }
    }
    ctx.font = "11px " + FONT; ctx.fillStyle = "#8ea2c8"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("Chance: Small " + Math.round(100 * E.CHEST_TIERS[0].weight / E.chestWeightTotal()) + "% \u00b7 Medium " + Math.round(100 * E.CHEST_TIERS[1].weight / E.chestWeightTotal()) + "% \u00b7 Jackpot " + Math.round(100 * E.CHEST_TIERS[2].weight / E.chestWeightTotal()) + "%", W / 2, H - 38);
    ctx.fillText("Always free \u2014 coins only, no purchase", W / 2, H - 22);
    ctx.restore();
  }
  function drawStreakPopup() {
    uiButtons.streakCollect = null;
    if (!streakPopActive()) return;
    const s = streakPop, info = s.info || {};
    const fade = Math.min(1, s.t / 8);
    const cx = W / 2;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = "rgba(6,12,34,0.82)";
    ctx.fillRect(0, 0, W, H);
    const px = 36, py = 100, pw = W - 72, ph = 376;
    ctx.fillStyle = "#101c3c"; roundRect(px, py, pw, ph, 20); ctx.fill();
    ctx.strokeStyle = "#ffb020"; ctx.lineWidth = 3; roundRect(px, py, pw, ph, 20); ctx.stroke();
    drawGlowText("DAILY STREAK", cx, py + 34, 24, "#ffd24a");
    const flame = 1 + Math.sin(s.t * 0.2) * 0.06;
    ctx.save(); ctx.translate(cx, py + 92); ctx.scale(flame, flame);
    ctx.font = "44px " + FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("\ud83d\udd25", 0, 0);
    ctx.restore();
    drawGlowText("Day " + s.count, cx, py + 150, 34, "#ffffff");
    // 7-day track
    const pos = ((s.count - 1) % 7) + 1;
    for (let i = 1; i <= 7; i++) {
      const dx = cx + (i - 4) * 38, dy = py + 196;
      ctx.beginPath(); ctx.arc(dx, dy, 12, 0, Math.PI * 2);
      ctx.fillStyle = i <= pos ? "#ffb020" : "rgba(255,255,255,0.14)"; ctx.fill();
      if (i === pos) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.fillStyle = i <= pos ? "#3a2200" : "#8ea2c8"; ctx.font = "bold 11px " + FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(i === 7 ? "\u2605" : String(i), dx, dy + 0.5);
    }
    ctx.save(); ctx.translate(cx, py + 244);
    drawCoinIcon(-52, 0, 13, 1);
    drawGlowText("+" + s.coins, 10, 0, 30, "#ffd23a");
    ctx.restore();
    ctx.font = "12px " + FONT; ctx.fillStyle = "#b8c8e8"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    let line;
    if (info.status === "freeze") line = "\u2744 Streak Freeze saved your streak!";
    else if (info.status === "reset") line = "Fresh start \u2014 play daily to build it up";
    else if (info.status === "new") line = "Play every day to grow your streak";
    else line = "Streak grows! Tomorrow: +" + E.streakReward(s.count + 1) + " coins";
    ctx.fillText(line, cx, py + 280);
    if (info.freezeEarned) { ctx.fillStyle = "#9be7ff"; ctx.fillText("\u2744 You earned a Streak Freeze (covers 1 missed day)", cx, py + 300); }
    else { ctx.fillStyle = "#8ea2c8"; ctx.fillText("Freezes: " + (save.streak.freezes | 0) + "/" + E.STREAK_MAX_FREEZES + "  \u00b7  Best: " + (save.streak.best | 0) + " days", cx, py + 300); }
    if (s.t >= 8) uiButtons.streakCollect = drawButton(cx - 100, py + ph - 56, 200, 40, "Collect", "rgba(40,150,90,0.95)", "#fff", "bold 16px " + FONT);
    ctx.restore();
  }
  function drawStreakChip() {
    const st = save.streak;
    if (!st || st.count <= 0) return;
    ctx.save();
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.font = "bold 14px " + FONT;
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,30,60,0.35)";
    const t = "\ud83d\udd25 " + st.count + (st.freezes > 0 ? "  \u2744" : "");
    ctx.strokeText(t, W - 12, 24);
    ctx.fillStyle = "#ffe08a";
    ctx.fillText(t, W - 12, 24);
    ctx.restore();
  }

  // —— Reset ——
  function clearExtras() {
    trees.length = 0;
    animals.length = 0;
    hunters.length = 0;
    projectiles.length = 0;
    waterfalls.length = 0;
    nextTree = 50;
    nextAnimal = 90;
    nextHunter = 180;
    nextWaterfall = 120;
  }

  function resetGame() {
    bird.y = PLAY_H / 2;
    bird.vy = 0;
    bird.rot = 0;
    bird.wing = 0;
    pipes.length = 0;
    score = 0;
    level = 1;
    frame = 0;
    nextSpawn = 40;
    flash = 0;
    scorePop = 0;
    overTimer = 0;
    levelFlash = 0;
    levelFlashText = "";
    milestoneFlash = 0;
    milestoneFlashText = "";
    evolveFlash = 0;
    evoMoment = null;
    evolveFlashText = "";
    trophyFlash = 0;
    trophyFlashText = "";
    newRecordFlash = 0;
    newRecordText = "";
    beatBestScore = false;
    beatBestLevel = false;
    cleanStreak = 0;
    pipeStreak = 0;
    scoreMult = 1;
    multPop = 0;
    nearMissFlash = 0;
    screenShake = 0;
    flapPop = 0;
    almostLine = "";
    clearParticles();
    clearCoins();
    floaters.length = 0;
    rings.length = 0;
    clearExtras();
    resetRun110();
    applyDifficulty();
    syncWorld(false);
  }

  // v1.20 save & continue helper: the run is auto-saved (level, a safe restart at the start of that level, run coins,
  // the active pickup, the held save point) on every level-up, pause, app background and quit. A crash keeps the last
  // 10-level save point. Level progress, bird, coins and upgrades live in the main save and are never touched here.
  const RESUME_KEY = "skyhop_resume_v1";
  function loadResume() {
    try { const r = JSON.parse(localStorage.getItem(RESUME_KEY) || "null"); if (r && r.v === 1 && (r.level | 0) >= 1) { r.level = Math.max(1, Math.min(MAX_LEVEL, r.level | 0)); r.cp = Math.max(0, Math.min(r.level, r.cp | 0)); return r; } } catch (_) {}
    return null;
  }
  let resumeRec = loadResume(), newGameConfirm = 0, resumeQuit = false;
  function writeResume(r) { resumeRec = r; try { localStorage.setItem(RESUME_KEY, r ? JSON.stringify(r) : "null"); } catch (_) {} }   // tiny, only on level-up / pause / crash
  function snapshotRun(kind) {
    return { v: 1, kind: kind, level: level, cp: runCheckpoint | 0, runCoins: runCoins | 0, runEvo: E.evoStageForLevel(level), pellet: 0, pop: 0, poof: 0, zap: 0, mag: Math.max(0, puMagnetFrames | 0), held: heldWeapon && heldWeapon.ammo > 0 ? { k: heldWeapon.kind, a: heldWeapon.ammo | 0, m: heldWeapon.max | 0 } : null, cont: !!continueUsedThisRun, t: Date.now() };
  }
  function saveRunNow(kind) { if (state === State.PLAY) writeResume(snapshotRun(kind || "auto")); }
  function resumeRun() {
    const r = resumeRec || loadResume();
    if (!r) { startPlay(); return; }
    startPlay({ checkpoint: r.level });
    runCheckpoint = r.cp | 0; checkpointUsedThisRun = false;
    runCoins = r.runCoins | 0; continueUsedThisRun = !!r.cont;
    runEvo = r.runEvo != null ? Math.max(0, Math.min(39, r.runEvo | 0)) : E.evoStageForLevel(r.level);
    palMemo.r = null;
    heldWeapon = null; weaponFiring = false; keyFire = false; fireIds.clear();
    if (r.held && (r.held.a | 0) > 0 && WPN_LABEL[r.held.k]) heldWeapon = { kind: r.held.k, ammo: r.held.a | 0, max: Math.max(r.held.a | 0, r.held.m | 0) };
    else if ((r.pellet | 0) > 0) heldWeapon = { kind: "pellet", ammo: r.pellet | 0, max: r.pellet | 0 };
    else if ((r.pop | 0) > 0) heldWeapon = { kind: "pop", ammo: r.pop | 0, max: r.pop | 0 };
    else if ((r.zap | 0) > 0) heldWeapon = { kind: "zap", ammo: r.zap | 0, max: r.zap | 0 };
    else if ((r.poof | 0) > 0) heldWeapon = { kind: "poof", ammo: r.poof | 0, max: r.poof | 0 };
    pelletFrames = 0; popQueue = 0; poofQueue = 0; zapQueue = 0; puMagnetFrames = r.mag | 0;
    shopToastText = "▶ Continuing from Level " + formatLevel(level);
    pauseMode = 2; pauseCount = PAUSE_STEP * 3; pauseQuitArmed = false;   // 3-2-1 before the bird moves
    writeResume(snapshotRun("resume"));
  }
  function startNewGame() { newGameConfirm = 0; writeResume(null); startPlay(); }
  function startPlay(opts) {
    pauseMode = 0; pauseCount = 0; pauseQuitArmed = false;
    flushSaves("start");
    const fromCheckpoint = opts && opts.checkpoint ? opts.checkpoint | 0 : 0;
    const keepSafe = safeStartActive;
    const keepSafeFrames = safeStartFrames;
    resetGame();
    resetRun112(!fromCheckpoint);
    pipesPassed = 0;
    runMaxStreak = 0;
    almostLines = [];
    banners.length = 0;
    toasts.length = 0;
    celebrations.length = 0;
    overCards.length = 0;
    if (!fromCheckpoint) {
      // Fresh run from Level 1
      if (resumeRec) writeResume(null);
      runCoins = 0;
      runCoinFrac = 0;
      doubleCoinsUsed = false;
      runCheckpoint = 0;
      checkpointUsedThisRun = false;
      bonusLevelBase = 1;
      save.stats.runs++;
      missionProgress("runs", 1);
    }
    if (keepSafe) {
      safeStartActive = true;
      safeStartFrames = keepSafeFrames > 0 ? keepSafeFrames : 20;
      applyDifficulty();
    }
    continueUsedThisRun = !!fromCheckpoint; // checkpoint restart consumes the run's resume too
    continueBusy = false;
    rewardBusy = false;
    continueSnapshot = null;
    invulnFrames = 0;
    ignoreInputFrames = 0;
    offerSafeStart = false;
    almostLine = "";
    featuredUnlockId = null;
    runStartFrame = frame;
    resetRunPerks();
    if (fromCheckpoint) {
      score = (fromCheckpoint - 1) * PIPES_PER_LEVEL;
      level = levelFromScore(score);
      applyDifficulty();
      runCheckpoint = fromCheckpoint;
      checkpointUsedThisRun = true;
      bonusLevelBase = level;
      invulnFrames = 90;
      graceBudget = 60;
      ignoreInputFrames = 20;
      nextSpawn = 70;
      shopToast = 1.4;
      shopToastText = "⚑ Continuing from Level " + formatLevel(level) + " checkpoint";
    }
    runGate = 0;
    recoveryExtra = 0;
    heldWeapon = null;
    weaponFiring = false; keyFire = false; fireIds.clear(); fireCd = 0;
    runEvo = fromCheckpoint ? E.evoStageForLevel(level) : 0;
    palMemo.r = null;
    state = State.PLAY;
    syncWorld(!!fromCheckpoint);
    setSongForWorld();
    ensureAudio();
    startMusicLoop(true);
    sfxFlap();
    haptic("flap");
    bird.vy = FLAP;
    flapPop = 1;
    unlockTrophy(1);
    ensureMissions(true);
    notifyAdsState();
  }

  function gameOver() {
    if (state !== State.PLAY) return;
    if (pauseMode) return;
    if (invulnFrames > 0) return;
    if (puMode) return; // v1.11 ride modes can't crash
    if (absorbHitWithShield()) return;
    if (trySecondWind()) return;
    finishRun();
  }

  /** The part of game over that banks the run (also used by Quit to menu on the pause screen). */
  function finishRun() {
    if (resumeQuit) resumeQuit = false;
    else writeResume(runCheckpoint > 0 ? Object.assign(snapshotRun("crash"), { level: runCheckpoint, runEvo: E.evoStageForLevel(runCheckpoint), runCoins: 0, pellet: 0, pop: 0, poof: 0, zap: 0, mag: 0, held: null, cont: false }) : null);
    state = State.OVER;
    overTimer = 0;
    toasts.length = 0;
    while (celebrations.length) overCards.push(celebrations.shift());
    flash = 1;
    screenShake = 1;
    // Leave PLAY: clear skill toast so "Ghost!" etc. cannot stick on OVER/menu
    ghostPipesLeft = 0; // a ghost never carries into a rewarded continue
    shopToast = 0;
    shopToastText = "";
    softenMusic();
    sfxHit();
    haptic("crash");
    almostLine = computeAlmostLine(score, level);
    const feat = pickFeaturedUnlock();
    featuredUnlockId = feat ? feat.id : null;
    // Harsh early death streak → optional safe-start nudge (not every death)
    const runFrames = Math.max(0, frame - runStartFrame);
    const harsh = score < 8 && runFrames < 320;
    if (harsh) deathStreakHarsh++;
    else deathStreakHarsh = 0;
    offerSafeStart = deathStreakHarsh >= 3;
    if (offerSafeStart) deathStreakHarsh = 0; // reset after offering once
    beatBestScore = false;
    beatBestLevel = false;
    if (score > best) {
      best = score;
      lsSet(STORAGE_KEY, String(best));
      beatBestScore = true;
    }
    submitRunScore(score); // v1.9 weekly leaderboard (Android app only; no-op on the web)
    if (level > bestLevel) {
      bestLevel = level;
      lsSet(BEST_LEVEL_KEY, String(bestLevel));
      beatBestLevel = true;
    }
    if (beatBestScore || beatBestLevel) {
      newRecordFlash = 1.25;
      if (beatBestScore && beatBestLevel) newRecordText = "✦ NEW RECORD ✦";
      else if (beatBestScore) newRecordText = "✦ BEST SCORE ✦";
      else newRecordText = "✦ BEST LEVEL ✦";
      sfxNewRecord();
    }
    cleanStreak = 0;
    pipeStreak = 0;
    scoreMult = 1;
    checkDailyOnGameOver();
    // v1.5: bank the level bonus, refresh goals, compute "almost" moments
    runBonusCoins = E.runBonus(level, bonusLevelBase);
    bonusLevelBase = Math.max(bonusLevelBase, level);
    if (runBonusCoins > 0) {
      E.addCoins(save, runBonusCoins);
      runCoins += runBonusCoins;
    }
    missionProgress("level", level);
    endRun112(); // combo stats + free reward chest (coins are credited right here, so closing the app can't lose or re-roll it)
    persist();
    computeAlmostLines();
    notifyAdsState();
  }

  function computeAlmostLines() {
    const lines = E.almostMoments({
      score: score, best: best, beatBest: beatBestScore, coins: save.coins,
      goal: E.cheapestGoal(save, peakLevel()), missions: ensureMissions(),
      level: level, runCheckpoint: runCheckpoint,
      nextSkill: E.nextSkillUnlock(save, peakLevel()), peak: peakLevel(),
    });
    if (almostLine && lines.indexOf(almostLine) < 0) lines.push(almostLine);
    almostLines = lines.slice(0, 2);
  }

  function notifyAdsState() {
    const ads = adsApi();
    if (!ads) return;
    try {
      if (state === State.PLAY) ads.onPlaying();
      else if (state === State.OVER) ads.onGameOver();
      else ads.onMenu();
    } catch (_) {}
  }

  function cloneEntities(arr) {
    const out = [];
    for (let i = 0; i < arr.length; i++) out.push(Object.assign({}, arr[i]));
    return out;
  }

  /** Snapshot mid-run state before a continue ad so resume can restore if corrupted. */
  function takeContinueSnapshot() {
    continueSnapshot = {
      score: score,
      level: level,
      pipes: cloneEntities(pipes),
      hunters: cloneEntities(hunters),
      animals: cloneEntities(animals),
      projectiles: cloneEntities(projectiles),
      bird: { x: bird.x, y: bird.y, vy: bird.vy, rot: bird.rot, wing: bird.wing },
      continueUsedThisRun: continueUsedThisRun,
      nextSpawn: nextSpawn,
      pipeGap: pipeGap,
      pipeSpeed: pipeSpeed,
      spawnEvery: spawnEvery,
      gapMargin: gapMargin,
    };
  }

  function restoreContinueSnapshot() {
    const snap = continueSnapshot;
    if (!snap) return false;
    score = snap.score;
    level = snap.level;
    pipes.length = 0;
    for (let i = 0; i < snap.pipes.length; i++) pipes.push(Object.assign({}, snap.pipes[i]));
    hunters.length = 0;
    for (let i = 0; i < snap.hunters.length; i++) hunters.push(Object.assign({}, snap.hunters[i]));
    animals.length = 0;
    for (let i = 0; i < snap.animals.length; i++) animals.push(Object.assign({}, snap.animals[i]));
    projectiles.length = 0;
    for (let i = 0; i < snap.projectiles.length; i++) projectiles.push(Object.assign({}, snap.projectiles[i]));
    bird.x = snap.bird.x;
    bird.y = snap.bird.y;
    bird.vy = snap.bird.vy;
    bird.rot = snap.bird.rot;
    bird.wing = snap.bird.wing;
    nextSpawn = snap.nextSpawn;
    pipeGap = snap.pipeGap;
    pipeSpeed = snap.pipeSpeed;
    spawnEvery = snap.spawnEvery;
    gapMargin = snap.gapMargin;
    syncWorld(false);
    return true;
  }

  /** Resume mid-run after a completed rewarded video (one continue per run). */
  function continuePlay() {
    if (state !== State.OVER) return;
    // Never call startPlay/resetGame here — that would wipe score/level.
    const snap = continueSnapshot;
    const corrupted = !snap || score !== snap.score || level !== snap.level;
    if (corrupted && snap) {
      restoreContinueSnapshot();
    } else if (snap) {
      // Keep live score/level; still restore pipes/hazards if arrays were wiped
      if (pipes.length === 0 && snap.pipes.length > 0) {
        restoreContinueSnapshot();
      }
    }
    continueUsedThisRun = true;
    continueBusy = false;
    // Keep score/level/pipes progress — only clear pipes that would kill on resume
    // (overlap bird or sit within ~1.5 screens ahead). Do NOT resetGame/startPlay.
    const clearUntil = bird.x + W * 1.5;
    for (let i = pipes.length - 1; i >= 0; i--) {
      if (pipes[i].x < clearUntil) pipes.splice(i, 1);
    }
    // Also clear nearby extras hazards so continue always feels fair
    for (let i = hunters.length - 1; i >= 0; i--) {
      if (hunters[i].x < clearUntil) hunters.splice(i, 1);
    }
    for (let i = projectiles.length - 1; i >= 0; i--) {
      if (projectiles[i].x < clearUntil) projectiles.splice(i, 1);
    }
    for (let i = animals.length - 1; i >= 0; i--) {
      if (animals[i].hazard && animals[i].x < clearUntil) animals.splice(i, 1);
    }
    // Brief spawn delay so a new pipe doesn't appear on top of the bird
    nextSpawn = Math.max(nextSpawn, Math.floor(spawnEvery * 0.9) || 50);
    for (let i = coins.length - 1; i >= 0; i--) {
      if (coins[i].x < clearUntil) removeCoinAt(i);
    }
    flushSaves("resume");
    state = State.PLAY;
    overTimer = 0;
    flash = 0;
    almostLine = "";
    offerSafeStart = false;
    bird.y = PLAY_H / 2;
    bird.vy = FLAP;
    bird.rot = 0;
    bird.wing = 1;
    flapPop = 1;
    invulnFrames = 100;
    graceBudget = 60;
    ignoreInputFrames = 48; // ~0.8s — absorb post-ad click-through / retry taps
    shopToast = 1.35;
    shopToastText = "Resumed at Level " + formatLevel(level) + " · Score " + score;
    continueSnapshot = null;
    ensureAudio();
    startMusicLoop(true);
    sfxFlap();
    haptic("flap");
    notifyAdsState();
  }

  async function requestRewardedContinue() {
    if (continueUsedThisRun || continueBusy || state !== State.OVER) return;
    // Snapshot before any ad/token path so resume can restore if state is corrupted
    takeContinueSnapshot();
    // Free continue token from daily streak reward
    if (continueTokens > 0) {
      if (spendContinueToken()) {
        continuePlay();
        shopToast = 1.35;
        shopToastText = "Resumed at Level " + formatLevel(level) + " · Score " + score +
          " (🎫 " + continueTokens + " left)";
        return;
      }
    }
    // Browser demo path (same idea as unlock simulate) — no AdMob in browser
    if (isBrowserPlay()) {
      continueBusy = true;
      try {
        continuePlay();
      } catch (_) {
        continueBusy = false;
      }
      return;
    }
    const ads = adsApi();
    if (!ads) return;
    const show = typeof ads.showRewarded === "function"
      ? function () { return ads.showRewarded("continue"); }
      : ads.showRewardedContinue;
    if (typeof show !== "function") return;
    if (typeof ads.canOfferContinue === "function" && !ads.canOfferContinue()) return;
    // v1.9.2: "No ad right now - tap to retry": start a fresh request without locking the screen.
    if (typeof ads.retryRewarded === "function" && rewardedStatus("continue") === "failed") {
      ads.retryRewarded("continue");
      adNoticeText = "Looking for an ad…";
      adNoticeUntil = Date.now() + 2500;
      return;
    }
    continueBusy = true;
    const rq = newAdReq();
    try {
      const ok = typeof ads.showRewarded === "function" ? await ads.showRewarded("continue", rq.opts) : await show();
      if (rq.stale()) return;
      if (ok && state === State.OVER) continuePlay();
      else {
        continueBusy = false;
        continueSnapshot = null;
        if (!ok && !lastAdCancelled()) showAdFailureNotice();
      }
    } catch (_) {
      if (rq.stale()) return;
      continueBusy = false;
      continueSnapshot = null;
      showAdFailureNotice();
    }
  }

  function canOfferCheckpoint() {
    if (state !== State.OVER || runCheckpoint <= 0 || checkpointUsedThisRun || resumeRec) return false;   // v1.20: any held save point counts; the free Continue replaces this offer
    if (continueBusy || rewardBusy) return false;
    const ads = adsApi();
    const canAd = !!(ads && typeof ads.canOfferContinue === "function" && ads.canOfferContinue());
    return canAd || isBrowserPlay();
  }

  /** Rewarded (native) / demo (web): restart the run from the last checkpoint reached. */
  async function requestCheckpointContinue() {
    if (!canOfferCheckpoint()) return;
    const lv = runCheckpoint;
    if (isBrowserPlay()) {
      startPlay({ checkpoint: lv });
      return;
    }
    const ads = adsApi();
    if (!ads || typeof ads.showRewarded !== "function") return;
    rewardBusy = true;
    const rq = newAdReq();
    try {
      const ok = await ads.showRewarded("continue", rq.opts);
      if (rq.stale()) return;
      rewardBusy = false;
      if (ok && state === State.OVER) startPlay({ checkpoint: lv });
      else if (!ok && !lastAdCancelled()) showAdFailureNotice();
    } catch (_) {
      if (rq.stale()) return;
      rewardBusy = false;
      showAdFailureNotice();
    }
  }

  function canOfferDoubleCoins() {
    if (state !== State.OVER || doubleCoinsUsed || runCoins - runChestCoins <= 0 || rewardBusy || continueBusy) return false;
    return canNativeUnlockAd() || isBrowserPlay();
  }

  function grantDoubleCoins() {
    const n = E.addCoins(save, Math.max(0, runCoins - runChestCoins)); // the chest has its own opt-in double
    runCoins += n;
    doubleCoinsUsed = true;
    persist();
    coinPop = 1;
    shopToast = 1.4;
    shopToastText = "Coins doubled! +" + n;
    spawnParticles(W / 2, 250, 20, "#ffe066");
    sfxBigCoin();
    computeAlmostLines();
  }

  /** Rewarded (native, "unlock" unit) / demo (web): double this run's coins once. */
  async function requestDoubleCoins() {
    if (!canOfferDoubleCoins()) return;
    if (isBrowserPlay()) {
      grantDoubleCoins();
      return;
    }
    const ads = adsApi();
    if (!ads || typeof ads.showRewarded !== "function") return;
    rewardBusy = true;
    const rq = newAdReq();
    try {
      const ok = await ads.showRewarded("unlock", rq.opts);
      if (rq.stale()) return;
      rewardBusy = false;
      if (ok) grantDoubleCoins();
      else if (!lastAdCancelled()) showAdFailureNotice();
    } catch (_) {
      if (rq.stale()) return;
      rewardBusy = false;
      showAdFailureNotice();
    }
  }

  /** Early skill unlock via rewarded ads (native) or demo taps (web). */
  async function requestSkillAdUnlock(skillId) {
    const sk = E.SKILL_BY_ID[skillId];
    if (!sk || sk.catalogId || shopBusy || skillOwned(skillId)) return;
    shopBusy = true;
    try {
      const ads = adsApi();
      let ok = false;
      if (ads && typeof ads.showRewarded === "function" && canNativeUnlockAd()) {
        const from = state; // v1.9.2: no ad pops up after the player left this screen
        ok = await ads.showRewarded("unlock", { stillWanted: function () { return state === from; } });
        if (!ok && !lastAdCancelled()) showAdFailureNotice();
      } else if (isBrowserPlay()) {
        ok = true;
      }
      if (ok) {
        const key = "skill_" + skillId;
        const cur = (unlockProgress[key] | 0) + 1;
        if (cur >= sk.adWatches) {
          delete unlockProgress[key];
          save.skillEarly[skillId] = true;
          persist();
          checkNewUnlocks(false);
        } else {
          unlockProgress[key] = cur;
          shopToast = 1.1;
          shopToastText = sk.name + " " + cur + "/" + sk.adWatches;
        }
        saveUnlockProgress();
      }
    } catch (_) {
    } finally {
      shopBusy = false;
    }
  }

  function toast(msg) {
    shopToast = 1.3;
    shopToastText = msg;
  }

  /** Coin purchase dispatcher for shop / bird rows. */
  function buyWithCoins(kind, id) {
    let ok = false;
    let name = id;
    if (kind === "upgrade") {
      ok = E.buyUpgrade(save, id);
      name = E.UPGRADE_BY_ID[id].name + " Lv " + E.upgradeTier(save, id);
    } else if (kind === "skill") {
      ok = E.buySkillEarly(save, id);
      name = E.SKILL_BY_ID[id].name;
    } else if (kind === "node") {
      ok = E.buyTreeStep(save, id, peakLevel());
      const ni = E.treeInfo(save, peakLevel()).filter(function (x) { return x.id === id; })[0];
      name = E.TREE_BY_ID[id].name + " Lv " + (ni ? ni.level : 0);
      if (ok) refreshTailPower();
    } else if (kind === "catalog") {
      const price = catalogCoinPrice(id);
      if (price != null && !isOwned(id) && save.coins >= price) {
        save.coins -= price;
        grantOwned(id);
        ok = true;
        name = CATALOG_BY_ID[id].name;
        if (CATALOG_BY_ID[id].kind === "bird") equipBird(id);
      }
    }
    if (ok) {
      persist();
      sfxBuy();
      toast("Bought: " + name);
      spawnParticles(W / 2, H - 60, 14, "#ffe066");
      if (kind === "skill") checkNewUnlocks(false);
    } else {
      sfxDeny();
      toast("Not enough coins");
    }
    return ok;
  }

  const CATALOG_COIN_PRICES = { skill_ghost: 350 };
  function catalogCoinPrice(id) {
    if (E.SKIN_COIN_PRICES[id] != null) return E.SKIN_COIN_PRICES[id];
    for (const sk of E.NEW_SKINS) if (sk.id === id) return sk.price;
    for (const sk of E.WORLD_SKINS) if (sk.id === id) return sk.price;
    return CATALOG_COIN_PRICES[id] != null ? CATALOG_COIN_PRICES[id] : null;
  }

  async function requestUnlockWatch(itemId) {
    if (shopBusy || (state !== State.SHOP && state !== State.OVER && state !== State.BIRDS)) return;
    const item = CATALOG_BY_ID[itemId];
    if (!item || item.watches <= 0) return;
    if (unlocks.owned.indexOf(itemId) >= 0) return;
    shopBusy = true;
    try {
      const ads = adsApi();
      let ok = false;
      if (ads && typeof ads.showRewarded === "function" && canNativeUnlockAd()) {
        const from = state; // v1.9.2: no ad pops up after the player left this screen
        ok = await ads.showRewarded("unlock", { stillWanted: function () { return state === from; } });
        if (!ok && !lastAdCancelled()) showAdFailureNotice();
      } else if (isBrowserPlay()) {
        // Discreet web playtest path — no AdMob in browser
        ok = true;
      }
      if (ok) applyUnlockWatch(itemId);
    } catch (_) {
    } finally {
      shopBusy = false;
    }
  }

  function openShop() {
    adConfirm = null;
    prevMenuState = state === State.SHOP || state === State.TROPHIES ? prevMenuState : state;
    state = State.SHOP;
    shopScroll = 0;
    notifyAdsState();
  }

  function closeShop() {
    adConfirm = null;
    state = prevMenuState === State.PLAY ? State.START : prevMenuState;
    if (state === State.PLAY || state === State.TROPHIES || state === State.SHOP) state = State.START;
    notifyAdsState();
  }

  let perkView = null; // legacy (v1.15 bird perk page, no longer reachable)
  function openBirds() { openShop(); shopTab = 1; shopScroll = 0; }

  function closeBirds() {
    perkView = null;
    state = birdsReturnState === State.SHOP ? State.SHOP : (prevMenuState === State.OVER ? State.OVER : State.START);
    notifyAdsState();
  }

  function openMissions() {
    missionsReturnState = state === State.OVER ? State.OVER : State.START;
    ensureMissions(true);
    state = State.MISSIONS;
    notifyAdsState();
  }

  function closeMissions() {
    state = missionsReturnState;
    notifyAdsState();
  }

  function openTrophies() {
    prevMenuState = (state === State.TROPHIES || state === State.SHOP) ? prevMenuState : state;
    state = State.TROPHIES;
    shelfLevels = buildShelfLevels();
    trophyScroll = 0;
    notifyAdsState();
  }

  function closeTrophies() {
    state = prevMenuState === State.PLAY ? State.START : prevMenuState;
    if (state === State.PLAY || state === State.SHOP || state === State.TROPHIES) state = State.START;
    notifyAdsState();
  }

  // Hit-test regions for UI buttons drawn on canvas
  const uiButtons = {
    trophies: null, shop: null, back: null, close: null, continue: null,
    rows: null, skills: null, share: null, featured: null, safeStart: null,
    birds: null, missions: null, checkpoint: null, doubleCoins: null, tabs: null, birdsTop: null,
    privacy: null, privacyChoices: null, leaderboard: null, playStore: null,
    adYes: null, adNo: null, chestDouble: null, chestCollect: null, streakCollect: null,
  };

  function flap() {
    if (pauseMode) return;
    ensureAudio();
    // While rewarded continue is showing / just closed, never treat taps as retry/flap
    if (ignoreInputFrames > 0) return;
    if (state === State.TROPHIES || state === State.SHOP || state === State.BIRDS || state === State.MISSIONS) return;
    if (chestActive()) { if (!rewardBusy && !continueBusy) chestTap(); return; }
    if (streakPopActive()) { if (streakPop.t >= 8) streakCollect(); return; }
    if (state === State.START) {
      if (newGameConfirm) return;
      if (resumeRec) resumeRun(); else startPlay();
      return;
    }
    if (state === State.OVER) {
      // Stray tap during/after ad must NOT call startPlay (that resets score/pipes)
      if (continueBusy || rewardBusy) return;
      if (overTimer > 18) { if (resumeRec) resumeRun(); else startPlay(); }
      return;
    }
    if (state === State.PLAY) {
      const pgm = pk().gravMul;
      bird.vy = pgm === 1 ? FLAP : FLAP * Math.sqrt(pgm); // same flap height under the lighter gravity
      bird.wing = 1;
      flapPop = 1;
      sfxFlap();
      haptic("flap");
      spawnParticles(bird.x - 6, bird.y + 4, 4, "#ffffff");
      emitTrail(5);
    }
  }

  function trailColor() {
    const pal = activeBirdPalette(evoPipes());
    return pal.body1 || "#ffe566";
  }

  // v1.8: the canvas rect is re-read on every pointer DOWN (onPointer) and only reused for the
  // drag moves that follow it. Before 1.8 it was cached until a window resize/scroll, but the
  // native AdMob banner is an overlay: ads.js toggles --ad-banner-pad (moving the canvas) without
  // any window resize, so taps were mapped with a stale rect and landed 30-50 CSS px low (skill
  // buttons fell through to flap). getBoundingClientRect() is cheap here: layout is clean at input time.
  let canvasRectCache = null;
  window.addEventListener("scroll", function () { canvasRectCache = null; }, { passive: true });
  function canvasToLocal(e) {
    const rect = canvasRectCache || (canvasRectCache = canvas.getBoundingClientRect());
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    let clientX, clientY;
    if (e.__pt) {
      clientX = e.__pt.clientX;
      clientY = e.__pt.clientY;
    } else if (e.changedTouches && e.changedTouches.length) {
      // The finger that just went down/moved (not an older finger still held)
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else if (e.touches && e.touches.length) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if (e.changedTouches && e.changedTouches.length) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  function hitBtn(pt, btn) {
    if (!btn || !pt) return false;
    return pt.x >= btn.x && pt.x <= btn.x + btn.w && pt.y >= btn.y && pt.y <= btn.y + btn.h;
  }

  // v1.9.1: generous Back hit area (whole top-left corner of the canvas, incl. the margin above it),
  // so a slightly-high tap on a tall/wide screen still counts.
  function hitBack(pt) {
    const b = uiButtons.back;
    if (!b || !pt) return false;
    return pt.x >= -4 && pt.x <= b.x + b.w + 12 && pt.y >= -4 && pt.y <= b.y + b.h + 10;
  }

  // v1.9.1: Android system back (gesture / key) and Escape close the open menu screen.
  // Returns true when handled; false lets the system do its default (leave the app).
  function handleSystemBack() {
    // v1.18: Back (gesture, key or Escape) during a run pauses; on the pause screen it resumes; during the countdown it pauses again
    if (pauseMode === 2) { pauseMode = 1; pauseCount = 0; return true; }
    if (pauseMode === 1) { resumeGame(); return true; }
    if (state === State.PLAY && !chestActive() && !streakPopActive()) { pauseGame("back"); return true; }
    if (chestActive()) { if (chest.phase === "closed") chestTap(); else if (chest.phase === "open" && chest.t >= 12) chest.phase = "done"; else chestTap(); ignoreInputFrames = Math.max(ignoreInputFrames, 6); return true; }
    if (streakPopActive()) { if (streakPop.t >= 8) streakCollect(); return true; }
    if (adConfirm && (state === State.SHOP || state === State.BIRDS)) { adConfirm = null; ignoreInputFrames = Math.max(ignoreInputFrames, 6); return true; }
    if (state === State.SHOP) closeShop();
    else if (state === State.BIRDS) { if (perkView) perkView = null; else closeBirds(); }
    else if (state === State.TROPHIES) closeTrophies();
    else if (state === State.MISSIONS) closeMissions();
    else return false;
    shopDragY = null; trophyDragY = null;
    ignoreInputFrames = Math.max(ignoreInputFrames, 6);
    return true;
  }
  window.SkyHopBack = handleSystemBack;
  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape" || e.key === "GoBack" || e.key === "BrowserBack") { if (handleSystemBack()) { e.preventDefault(); e.stopImmediatePropagation(); } }
  });

  function isHudTarget(target) {
    if (!target) return false;
    if (target === muteBtn || target === extrasBtn) return true;
    if (target.closest && target.closest("#hud-btns")) return true;
    return false;
  }

  async function requestFeaturedUnlock() {
    if (!featuredUnlockId) {
      openShop();
      return;
    }
    const item = CATALOG_BY_ID[featuredUnlockId];
    if (!item) {
      openShop();
      return;
    }
    if (isOwned(item.id)) {
      openShop();
      return;
    }
    if (canNativeUnlockAd() || isBrowserPlay()) {
      await requestUnlockWatch(item.id);
      return;
    }
    openShop();
  }

  function hitRows(pt) {
    if (!uiButtons.rows) return null;
    for (const row of uiButtons.rows) if (hitBtn(pt, row)) return row;
    return null;
  }

  // —— v1.10: opt-in confirmation before any shop rewarded ad (reward shown BEFORE the ad plays) ——
  let adConfirm = null; // { action: "watch"|"simulate"|"skillAd", itemId }
  function openAdConfirm(action, itemId) {
    adConfirm = { action: action, itemId: itemId };
  }
  function adConfirmInfo(c) {
    if (c.action === "skillAd") {
      const sk = E.SKILL_BY_ID[c.itemId];
      const have = unlockProgress["skill_" + c.itemId] | 0;
      return { name: sk ? sk.name : c.itemId, kindLabel: "skill", have: have, need: sk ? sk.adWatches : 1, skill: c.itemId };
    }
    const it = CATALOG_BY_ID[c.itemId];
    const kindLabel = it && it.kind === "bird" ? "bird skin" : (it && it.kind === "skill" ? "skill" : "item");
    return { name: it ? it.name : c.itemId, kindLabel: kindLabel, have: progressFor(c.itemId), need: it ? it.watches : 1, skin: it && it.kind === "bird" ? c.itemId : null, skill: c.itemId === "skill_ghost" ? "ghost" : null };
  }
  function confirmAdAccepted() {
    const c = adConfirm;
    adConfirm = null;
    if (!c) return;
    if (c.action === "skillAd") requestSkillAdUnlock(c.itemId);
    else requestUnlockWatch(c.itemId);
  }
  function drawAdConfirm() {
    uiButtons.adYes = null;
    uiButtons.adNo = null;
    if (!adConfirm) return;
    const info = adConfirmInfo(adConfirm);
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, W, H);
    const pw = 320, ph = 268, px = (W - pw) / 2, py = 150;
    ctx.fillStyle = "rgba(22,34,58,0.98)";
    roundRect(px, py, pw, ph, 16);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,210,80,0.85)";
    ctx.lineWidth = 2;
    roundRect(px, py, pw, ph, 16);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffe08a";
    ctx.font = "bold 18px " + FONT;
    ctx.fillText(fitText("Unlock " + info.name + "?", pw - 24), W / 2, py + 26);
    // reward preview
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    roundRect(W / 2 - 46, py + 44, 92, 64, 12);
    ctx.fill();
    if (info.skin) {
      const pal = info.skin === "bird_default"
        ? speciesPreviewPalette(save.speciesEquipped)
        : Object.assign({}, BIRD_PALETTES[info.skin], { evo: evolutionMeta(0), birdId: info.skin, species: save.speciesEquipped });
      drawBirdPreview(W / 2, py + 76, 1.35, pal, frame);
    } else if (info.skill) {
      const def = E.SKILL_BY_ID[info.skill];
      drawSkillIcon(info.skill, W / 2, py + 76, 16, def ? def.color : "#fff");
    }
    const left = Math.max(1, info.need - info.have);
    ctx.font = "bold 13px " + FONT;
    ctx.fillStyle = "#ffffff";
    ctx.fillText("Reward: the " + info.name + " " + info.kindLabel + ", yours to keep", W / 2, py + 128);
    ctx.font = "12px " + FONT;
    ctx.fillStyle = "rgba(210,230,255,0.9)";
    const l2 = info.need > 1
      ? "Unlocks after " + info.need + " ads · you've watched " + info.have + ", " + left + " to go"
      : "Unlocks after 1 ad";
    ctx.fillText(fitText(l2, pw - 24), W / 2, py + 150);
    ctx.fillText(isBrowserPlay() ? "Web preview: no real ad plays here." : "Optional: a short video ad plays only if you tap Watch.", W / 2, py + 170);
    ctx.fillStyle = "rgba(200,215,235,0.7)";
    ctx.fillText("You can also buy it with coins.", W / 2, py + 188);
    uiButtons.adYes = drawButton(px + 18, py + ph - 56, 160, 40, isBrowserPlay() ? "▶ Demo ad" : "▶ Watch ad", "rgba(40,140,230,0.98)", "#fff", "bold 15px " + FONT);
    uiButtons.adNo = drawButton(px + pw - 18 - 116, py + ph - 56, 116, 40, "No thanks", "rgba(255,255,255,0.16)", "#e6eef8", "bold 14px " + FONT);
  }

  function handleRowAction(row) {
    const a = row.action;
    const id = row.itemId;
    if (a === "equip") equipBird(id);
    else if (a === "watch" || a === "simulate") {
      if (state === State.SHOP || state === State.BIRDS) openAdConfirm(a, id); // v1.10: opt-in card first
      else requestUnlockWatch(id);
    } else if (a === "skillAd") openAdConfirm(a, id);
    else if (a === "buyUpgrade") buyWithCoins("upgrade", id);
    else if (a === "buySkill") buyWithCoins("skill", id);
    else if (a === "buyCatalog") buyWithCoins("catalog", id);
    else if (a === "buyNode") buyWithCoins("node", id);
    else if (a === "openPerks") { perkView = id; ignoreInputFrames = Math.max(ignoreInputFrames, 2); }
    else if (a === "selectSpecies") {
      if (E.isSpeciesOwned(save, id, peakLevel())) {
        save.speciesEquipped = id;
        if (save.species.indexOf(id) < 0) save.species.push(id); // trophy unlock → owned
        persist();
        sfxBuy();
        toast(E.SPECIES_BY_ID[id].name + " selected");
      }
    } else if (a === "toggleDoubleTap") {
      save.doubleTapDash = !save.doubleTapDash;
      persist();
    } else if (a === "tab") {
      shopTab = Math.min(1, row.tab | 0);
      shopScroll = 0;
    } else if (a === "openBirds") openBirds();
  }

  function onPointer(e) {
    if (isHudTarget(e.target)) return;
    e.preventDefault();
    canvasRectCache = canvas.getBoundingClientRect(); // fresh rect for every tap (see canvasToLocal)
    // Multi-touch: a finger on Use fires while another finger flaps.
    if (e.changedTouches && e.changedTouches.length) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        const pt = canvasToLocal({ __pt: t });
        if (state === State.PLAY && fireHit(pt)) { fireIds.add(t.identifier); refreshFiring(); }
        else handlePointerAt(pt);
      }
      return;
    }
    const id = e.pointerId != null ? e.pointerId : "mouse";
    const pt = canvasToLocal(e);
    if (state === State.PLAY && fireHit(pt)) { fireIds.add(id); refreshFiring(); return; }
    handlePointerAt(pt);
  }

  function handlePointerAt(pt) {
    if (pauseMode) { pausePointer(pt); return; }
    if (state === State.PLAY && pauseBtnHit(pt)) { pauseGame("button"); return; }
    if (state === State.PLAY && fireHit(pt)) return;
    if (chestActive()) {
      if (rewardBusy || continueBusy) { abandonPendingAd(); return; }
      if (hitBtn(pt, uiButtons.chestDouble)) { requestChestDouble(); return; }
      chestTap();
      return;
    }
    if (streakPopActive()) {
      if (streakPop.t >= 8) streakCollect();
      return;
    }
    if (state === State.TROPHIES) {
      if (hitBack(pt)) {
        closeTrophies();
        return;
      }
      trophyDragY = pt.y;
      trophyDragScroll = trophyScroll;
      return;
    }

    if (state === State.MISSIONS) {
      if (hitBack(pt)) closeMissions();
      return;
    }

    if ((state === State.SHOP || state === State.BIRDS) && adConfirm) {
      if (hitBtn(pt, uiButtons.adYes)) confirmAdAccepted();
      else adConfirm = null; // "No thanks", Back or a tap outside: nothing plays
      return;
    }
    if (state === State.SHOP || state === State.BIRDS) {
      if (hitBack(pt)) {
        if (state === State.SHOP) closeShop();
        else if (perkView) perkView = null;
        else closeBirds();
        return;
      }
      if (uiButtons.tabs) {
        for (const t of uiButtons.tabs) if (hitBtn(pt, t)) { handleRowAction(t); return; }
      }
      if (state === State.SHOP && hitBtn(pt, uiButtons.birdsTop)) {
        openBirds();
        return;
      }
      const row = hitRows(pt);
      if (row) {
        handleRowAction(row);
        return;
      }
      if (state === State.SHOP) {
        shopDragY = pt.y;
        shopDragScroll = shopScroll;
      }
      return;
    }

    if (state === State.START && newGameConfirm) {
      if (hitBtn(pt, uiButtons.ngYes)) startNewGame();
      else if (hitBtn(pt, uiButtons.ngNo)) newGameConfirm = 0;
      return;
    }
    if (state === State.START && hitBtn(pt, uiButtons.resume)) { resumeRun(); return; }
    if (state === State.START && hitBtn(pt, uiButtons.newGame)) { newGameConfirm = 1; return; }
    if (state === State.START || state === State.OVER) {
      // While a rewarded ad is in flight, ignore retry and the other ad buttons. v1.9.2: the menu
      // buttons (Share / Leaderboard / Shop / Birds / Missions / Trophies) still work: they cancel
      // an ad that is only loading. Once an ad is on screen, every tap is ignored as before.
      if (state === State.OVER && (continueBusy || rewardBusy)) {
        const nav = ["share", "leaderboard", "shop", "birds", "missions", "trophies"];
        let hit = null;
        for (const k of nav) if (hitBtn(pt, uiButtons[k])) { hit = k; break; }
        if (!hit || !abandonPendingAd()) return;
      }
      if (state === State.OVER && hitBtn(pt, uiButtons.continue)) {
        requestRewardedContinue();
        return;
      }
      if (state === State.OVER && hitBtn(pt, uiButtons.checkpoint)) {
        requestCheckpointContinue();
        return;
      }
      if (state === State.OVER && hitBtn(pt, uiButtons.doubleCoins)) {
        requestDoubleCoins();
        return;
      }
      if (state === State.OVER && hitBtn(pt, uiButtons.safeStart)) {
        requestSafeStart();
        return;
      }
      if (state === State.OVER && hitBtn(pt, uiButtons.share)) {
        shareRun();
        return;
      }
      if (hitBtn(pt, uiButtons.leaderboard)) {
        openLeaderboard();
        return;
      }
      if (hitBtn(pt, uiButtons.playStore)) {
        openPlayStore();
        return;
      }
      if (state === State.OVER && hitBtn(pt, uiButtons.featured)) {
        requestFeaturedUnlock();
        return;
      }
      if (state === State.START && hitBtn(pt, uiButtons.privacy)) {
        openPrivacyPolicy();
        return;
      }
      if (state === State.START && hitBtn(pt, uiButtons.privacyChoices)) {
        openPrivacyChoices();
        return;
      }
      if (hitBtn(pt, uiButtons.shop)) {
        openShop();
        return;
      }
      if (hitBtn(pt, uiButtons.birds)) {
        openBirds();
        return;
      }
      if (hitBtn(pt, uiButtons.missions)) {
        openMissions();
        return;
      }
      if (hitBtn(pt, uiButtons.trophies)) {
        openTrophies();
        return;
      }
    }

    if (state === State.PLAY && uiButtons.skills && uiButtons.skills.length) {
      for (const b of uiButtons.skills) {
        const dx = pt.x - b.cx;
        const dy = pt.y - b.cy;
        if (dx * dx + dy * dy <= (b.r + 5) * (b.r + 5)) {
          useSkill(b.action);
          return;
        }
      }
    }

    if (state === State.PLAY && save.doubleTapDash && ignoreInputFrames <= 0) {
      const now = performance.now();
      if (now - lastFlapTapAt < 230 && skillAvailable("dash") && skillState.dash && skillState.dash.cd <= 0 && skillState.dash.active <= 0) {
        lastFlapTapAt = 0;
        useSkill("dash");
        return;
      }
      lastFlapTapAt = now;
    }

    flap();
  }

  function onPointerMove(e) {
    if (state === State.TROPHIES && trophyDragY != null) {
      e.preventDefault();
      const pt = canvasToLocal(e);
      const dy = trophyDragY - pt.y;
      trophyScroll = Math.max(0, trophyDragScroll + dy);
      clampTrophyScroll();
      return;
    }
    if (state === State.SHOP && shopDragY != null) {
      e.preventDefault();
      const pt = canvasToLocal(e);
      const dy = shopDragY - pt.y;
      shopScroll = Math.max(0, shopDragScroll + dy);
      clampShopScroll();
    }
  }

  function onPointerUp(e) {
    if (e && e.changedTouches) {
      for (let i = 0; i < e.changedTouches.length; i++) fireIds.delete(e.changedTouches[i].identifier);
    } else if (e) fireIds.delete(e.pointerId != null ? e.pointerId : "mouse");
    else fireIds.clear();
    refreshFiring();
    trophyDragY = null;
    shopDragY = null;
  }

  function clampShopScroll() {
    const rowH = SHOP_ROW_H;
    const visibleH = SHOP_LIST_BOT - SHOP_LIST_TOP;
    const maxScroll = Math.max(0, shopRowCount * rowH - visibleH);
    shopScroll = Math.max(0, Math.min(maxScroll, shopScroll));
  }

  canvas.addEventListener("mousedown", onPointer);
  canvas.addEventListener("mousemove", onPointerMove);
  window.addEventListener("mouseup", onPointerUp);
  canvas.addEventListener("touchstart", onPointer, { passive: false });
  canvas.addEventListener("touchmove", onPointerMove, { passive: false });
  canvas.addEventListener("touchend", onPointerUp);
  canvas.addEventListener("wheel", (e) => {
    if (state === State.TROPHIES) {
      e.preventDefault();
      trophyScroll += e.deltaY * 0.5;
      clampTrophyScroll();
      return;
    }
    if (state === State.SHOP) {
      e.preventDefault();
      shopScroll += e.deltaY * 0.5;
      clampShopScroll();
    }
  }, { passive: false });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Escape" && state === State.TROPHIES) {
      e.preventDefault();
      closeTrophies();
      return;
    }
    if (e.code === "Escape" && state === State.SHOP) {
      e.preventDefault();
      closeShop();
      return;
    }
    if (e.code === "Escape" && state === State.BIRDS) {
      e.preventDefault();
      if (perkView) perkView = null; else closeBirds();
      return;
    }
    if (e.code === "Escape" && state === State.MISSIONS) {
      e.preventDefault();
      closeMissions();
      return;
    }
    if (e.code === "KeyP" && !e.repeat && (state === State.PLAY || pauseMode)) { e.preventDefault(); if (pauseMode === 1) resumeGame(); else if (pauseMode === 2) { pauseMode = 1; pauseCount = 0; } else pauseGame("key"); return; }
    if (e.code === "KeyF" && state === State.PLAY) { e.preventDefault(); keyFire = true; refreshFiring(); return; }
    if (e.code === "Space" || e.key === " " || e.code === "ArrowUp") {
      e.preventDefault();
      if (e.repeat) return;
      if (state !== State.TROPHIES && state !== State.SHOP && state !== State.BIRDS && state !== State.MISSIONS) flap();
      return;
    }
    if (state === State.PLAY && !e.repeat) {
      // Desktop shortcuts: 1–7 (also Shift / → = Dash)
      const map = { "1": "dash", "2": "shield", "3": "shrink", "6": "ghost" };
      if (map[e.key]) useSkill(map[e.key]);
      else if (e.code === "ShiftLeft" || e.code === "ShiftRight" || e.code === "ArrowRight") useSkill("dash");
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "KeyF") { keyFire = false; refreshFiring(); }
  });

  function clampTrophyScroll() {
    const rowH = 52;
    const visible = 8;
    const n = getShelfLevels().length;
    const maxScroll = Math.max(0, (n - visible) * rowH);
    trophyScroll = Math.max(0, Math.min(maxScroll, trophyScroll));
  }

  // —— Pipes ——
  function spawnPipe() {
    hitchNote("spawn");
    const margin = gapMargin;
    const gap = pipeGap;
    const minY = margin + gap / 2;
    const maxY = PLAY_H - margin - gap / 2 - 20;
    const span = Math.max(8, maxY - minY);
    const gapY = minY + Math.random() * span;
    const prev = pipes.length ? pipes[pipes.length - 1] : null;
    const np = {
      x: W + 10,
      gapY,
      gap,
      scored: false,
      w: PIPE_W,
      style: isBossLevel(level) ? "boss" : worldIndexFor(level) % WORLDS.length,
    };
    np.shape = "cluster";
    np.wi = worldIndexFor(level);
    // v1.10 moving pipes (level 50+): keep the whole sweep inside the normal gap limits
    const mv = pipeMotionFor(level, gap);
    if (mv) {
      const g0 = mv.bAmp ? gap + mv.bAmp * 0.5 : gap;
      const gMax = g0 + mv.bAmp;
      const lo = margin + gMax / 2, hi = PLAY_H - margin - gMax / 2 - 20;
      const room = Math.max(0, hi - lo);
      const amp = Math.min(mv.amp, room / 2);
      np.gap0 = g0;
      np.gap = g0;
      np.amp = amp;
      np.rate = mv.rate;
      np.ph = mv.ph;
      np.gapY0 = lo + amp + Math.random() * Math.max(0, room - amp * 2);
      if (mv.bAmp) { np.bAmp = mv.bAmp; np.bRate = mv.bRate; np.bPh = mv.bPh; }
      stepPipeMotion(np, 0);
    }
    // v1.21: compact disconnected obstacles. Never a ceiling-floor column.
    // A 20-obstacle cycle adds a challenge, a recovery stretch, and a bonus gate. The first challenge is obstacle 6.
    const O = window.SkyHopObstacles;
    const serial = gateSerial++;
    const gi = runGate++;
    const bossGate = np.style === "boss";
    const preview = bossGate ? null : O.beatFor(gi);
    let gapAdd = preview ? preview.gapAdd : 0;
    if (preview && E.hasMastery(save, "calm") && preview.role === "challenge" && preview.cue) gapAdd = 22;
    if (recoveryExtra > 0 && preview && preview.role === "recovery") { gapAdd += 14; recoveryExtra--; }
    if (gapAdd) np.gap += gapAdd;
    const built = O.layoutGate({
      level: level,
      serial: serial,
      gateIndex: bossGate ? null : gi,
      calmEntry: !bossGate && E.hasMastery(save, "calm"),
      ampScale: preview && preview.role === "challenge" && E.hasMastery(save, "anchor") ? 0.8 : 1,
      worldIndex: np.wi,
      boss: bossGate,
      playH: PLAY_H,
      gap: np.gap,
      gapMin: np.bAmp ? Math.max(100, (np.gap0 || np.gap) - np.bAmp) : np.gap,
      gapY0: np.gapY0 || np.gapY,
      pAmp: np.amp || 0,
      rng: O.mulberry((level * 100003 + serial * 9973 + (np.wi | 0) * 17) >>> 0),
    });
    np.bits = built.bits;
    np.beatRole = built.beat ? built.beat.role : "";
    np.beatCue = built.beat && built.beat.cue;
    if (np.beatCue) showBigBanner(np.beatCue, np.beatRole === "challenge" ? "Short section" : "Easy stretch", np.beatRole === "reward" ? "#ffe08a" : "#ffffff");
    np.pattern = built.pattern;
    np.fam = built.family;
    np.families = built.families;
    np.w = Math.max(36, built.w);
    np.gateLeft = built.left;
    pipes.push(np);
    bhPipesSince++;
    if (!maybeSpawnPowerup(np) && !maybeSpawnBlackHole(np)) spawnCoinsForPipe(np, prev);
  }

  function birdCircle() {
    return { x: bird.x, y: bird.y, r: bird.r - 2 };
  }

  function hitPipe(p) {
    if (!p.bits || p.smashed) return false;
    const b = birdCircle();
    return window.SkyHopObstacles.hitIndex(b.x, b.y, b.r, p.x, p.gapY, p.bits, frame) >= 0;
  }

  function circleRect(cx, cy, cr, rx, ry, rw, rh) {
    const nx = Math.max(rx, Math.min(cx, rx + rw));
    const ny = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy < cr * cr;
  }

  // Avoid spawning hazards that sit right in the upcoming pipe gap
  function nearPipeGap(x, y, pad) {
    for (const p of pipes) {
      if (Math.abs(p.x - x) > p.w + 40) continue;
      const top = p.gapY - p.gap / 2;
      const bot = p.gapY + p.gap / 2;
      if (y > top - pad && y < bot + pad) return true;
    }
    return false;
  }

  // —— Extras spawn helpers ——
  function spawnTree(forceHazard) {
    const layer = Math.random() < 0.45 ? "bg" : "fg";
    const hazard = false;
    // Light scenery trees even when extras off (bg only, never hazard)
    if (!extrasOn) {
      if (Math.random() > 0.35) return;
      trees.push({
        x: W + 40,
        baseY: PLAY_H,
        scale: 0.55 + Math.random() * 0.35,
        layer: "bg",
        hazard: false,
        hue: 100 + Math.random() * 40,
        sway: Math.random() * Math.PI * 2,
      });
      return;
    }
    trees.push({
      x: W + 40,
      baseY: PLAY_H,
      scale: hazard ? 0.9 + Math.random() * 0.35 : 0.5 + Math.random() * 0.55,
      layer: hazard ? "fg" : layer,
      hazard,
      trunkW: hazard ? 18 + Math.random() * 10 : 10,
      hue: 90 + Math.random() * 50,
      sway: Math.random() * Math.PI * 2,
    });
  }

  function spawnAnimal() {
    if (!extrasOn) return;
    const kinds = ["bunny", "butterfly", "squirrel", "dragonfly"];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const flying = kind === "butterfly" || kind === "dragonfly";
    let y;
    if (flying) {
      y = 40 + Math.random() * (PLAY_H - 100);
    } else {
      y = PLAY_H - 18;
    }
    // Mild hazards from mid levels: a few faster critters
    const hazard = level >= 30 && Math.random() < 0.18 + difficultyT(level) * 0.22;
    if (hazard && nearPipeGap(W + 30, y, 28)) {
      y = Math.min(PLAY_H - 40, y + 50);
    }
    animals.push({
      x: W + 30,
      y,
      kind,
      flying,
      hazard,
      vx: -(pipeSpeed * (0.6 + Math.random() * 0.5)),
      bob: Math.random() * Math.PI * 2,
      phase: Math.random() * Math.PI * 2,
      r: hazard ? 12 : 10,
    });
  }

  function spawnHunter() {
    if (!extrasOn || level < 35 || isBossLevel(level) || isBossLevel(level + 1)) return;   // v1.18: hunters never spawn on / right before a boss level
    // Ramp frequency with level
    let y = 50 + Math.random() * (PLAY_H - 120);
    if (nearPipeGap(W + 40, y, 36)) {
      y = y < PLAY_H / 2 ? y + 60 : y - 60;
      y = Math.max(40, Math.min(PLAY_H - 60, y));
    }
    hunters.push({
      x: W + 50,
      y,
      bob: Math.random() * Math.PI * 2,
      shootCD: 40 + Math.floor(Math.random() * 50),
      kind: Math.random() < 0.5 ? "net" : "bolt",
    });
    hunterTierInit(hunters[hunters.length - 1], level);
  }

  function spawnWaterfall() {
    const push = extrasOn && level >= 18 && Math.random() < 0.35 + difficultyT(level) * 0.25;
    let x = W + 20;
    // Don't put push zones smack in pipe gaps vertically — width is vertical band
    waterfalls.push({
      x,
      w: 36 + Math.random() * 28,
      push: push ? 0.12 + 0.18 * difficultyT(level) : 0,
      phase: Math.random() * Math.PI * 2,
    });
  }

  function fireProjectile(h) {
    if (projectiles.length >= MAX_PROJECTILES) return;
    const kind = h.kind;
    projectiles.push({
      x: h.x - 10,
      y: h.y + 8,
      vx: -(2.2 + 1.6 * difficultyT(level)),
      vy: (bird.y - h.y) * 0.008, // mild aim, still dodgeable
      kind,
      r: kind === "net" ? Math.round(14 * (h.netMul || 1)) : 7,
      life: 220,
    });
  }

  // —— Update ——
  function updateExtras() {
    const k = state === State.PLAY ? ws : 1; // dash / ride-mode world scale
    const scroll = pipeSpeed * k;
    const playing = state === State.PLAY;

    // Spawns (soft-capped cadence + hard entity caps for mobile)
    if (playing) {
      const tD = difficultyT(level);
      nextTree -= k;
      if (nextTree <= 0) {
        if (trees.length < MAX_TREES) spawnTree(false);
        nextTree = extrasOn
          ? Math.max(40, 90 - tD * 50)
          : 100 + Math.random() * 80;
      }
      if (extrasOn) {
        nextAnimal -= k;
        if (nextAnimal <= 0 && level >= 8) {
          if (animals.length < MAX_ANIMALS) spawnAnimal();
          nextAnimal = Math.max(70, 140 - tD * 65);
        }
        nextHunter -= k;
        if (nextHunter <= 0 && level >= 35) {
          if (hunters.length < MAX_HUNTERS) spawnHunter();
          // Floor ~120 frames even at soft-cap — never spam
          const dens = Math.max(120, 260 - tD * 130);
          nextHunter = dens + Math.random() * 40;
        }
        nextWaterfall -= k;
        if (nextWaterfall <= 0 && level >= 5) {
          if (waterfalls.length < MAX_WATERFALLS) spawnWaterfall();
          nextWaterfall = Math.max(120, 220 - tD * 90);
        }
      } else if (playing && frame % 180 === 0) {
        if (trees.length < MAX_TREES) spawnTree(false);
      }
    }

    // Trees
    for (let i = trees.length - 1; i >= 0; i--) {
      const t = trees[i];
      const mul = t.layer === "bg" ? 0.45 : 1;
      t.x -= scroll * mul * (state === State.PLAY ? 1 : 0.3);
      t.sway += 0.02;
      if (playing && t.hazard) {
        const tw = t.trunkW || 16;
        const th = 70 * t.scale;
        if (circleRect(bird.x, bird.y, bird.r - 2, t.x - tw / 2, PLAY_H - th, tw, th)) {
          gameOver();
          return;
        }
      }
      if (t.x < -80) trees.splice(i, 1);
    }

    // Waterfalls
    for (let i = waterfalls.length - 1; i >= 0; i--) {
      const wf = waterfalls[i];
      wf.x -= scroll * (state === State.PLAY ? 1 : 0.3);
      wf.phase += 0.15;
      if (playing && wf.push > 0 && skillActive("dash") <= 0) {
        if (bird.x > wf.x && bird.x < wf.x + wf.w) {
          // Mild downward push — fair, readable
          bird.vy = Math.min(MAX_FALL, bird.vy + wf.push * k);
        }
      }
      if (wf.x + wf.w < -20) waterfalls.splice(i, 1);
    }

    // Animals
    for (let i = animals.length - 1; i >= 0; i--) {
      const a = animals[i];
      a.x += a.vx * k; // a.vx already includes leftward motion
      a.bob += 0.08;
      a.phase += 0.12;
      if (a.flying) {
        a.y += Math.sin(a.bob) * 0.6;
      }
      if (playing && a.hazard) {
        const dx = bird.x - a.x;
        const dy = bird.y - a.y;
        if (dx * dx + dy * dy < (bird.r + a.r - 2) * (bird.r + a.r - 2)) {
          gameOver();
          return;
        }
      }
      if (a.x < -40) animals.splice(i, 1);
    }

    // Hunters
    for (let i = hunters.length - 1; i >= 0; i--) {
      const h = hunters[i];
      h.x -= scroll * 0.85 * (h.spd || 1);
      if (playing && k !== 1) h.shootCD += 1 - k; // shoot cadence follows world time
      h.bob += 0.05;
      h.y += Math.sin(h.bob) * 0.35;
      if (h.stun > 0) { h.stun--; h.x += h.kb || 0; h.kb = (h.kb || 0) * 0.9; }   // v1.16: dazed hunters drift back and cannot hurt the bird
      if (playing) {
        h.shootCD--;
        if (h.shootCD <= 0 && h.x < W - 20 && h.x > 40) {
          fireProjectile(h);
          h.shootCD = Math.max(60, (110 - difficultyT(level) * 40) * (h.cd || 1));
        }
        // Body collision
        if (!(h.stun > 0) && circleRect(bird.x, bird.y, bird.r - 2, h.x - 14 * (h.sc || 1), h.y - 18 * (h.sc || 1), 28 * (h.sc || 1), 36 * (h.sc || 1))) {
          if (tryTalonSmash("hunter", i)) continue;
          gameOver();
          return;
        }
      }
      if (h.x < -50) hunters.splice(i, 1);
    }

    // Projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.x += p.vx * k;
      p.y += p.vy * k;
      p.life -= k;
      if (playing) {
        const dx = bird.x - p.x;
        const dy = bird.y - p.y;
        const rr = bird.r + p.r - 3;
        if (dx * dx + dy * dy < rr * rr) {
          if (tryTalonSmash("projectile", i)) continue;
          gameOver();
          return;
        }
      }
      if (p.life <= 0 || p.x < -30) projectiles.splice(i, 1);
    }
  }

  function update() {
    if (freeze112) return;
    if (pauseMode) { tickPause(); return; } // v1.18: paused: nothing in the run advances
    frame++;
    if (flash > 0) flash *= 0.88;
    if (scorePop > 0) scorePop *= 0.9;
    if (levelFlash > 0) levelFlash *= 0.94;
    if (milestoneFlash > 0) milestoneFlash *= 0.955;
    if (evolveFlash > 0) evolveFlash *= 0.95;
    if (evoMoment && --evoMoment.t <= 0) evoMoment = null;
    if (trophyFlash > 0) trophyFlash *= 0.96;
    if (newRecordFlash > 0) newRecordFlash *= 0.97;
    if (multPop > 0) multPop *= 0.92;
    if (nearMissFlash > 0) nearMissFlash *= 0.9;
    if (screenShake > 0) screenShake *= 0.82;
    if (flapPop > 0) flapPop *= 0.78;
    if (shopToast > 0) {
      shopToast *= 0.96;
      if (shopToast < 0.05) {
        shopToast = 0;
        shopToastText = "";
      }
    }
    if (bird.wing > 0) bird.wing *= 0.85;
    if (invulnFrames > 0) invulnFrames--;
    if (ignoreInputFrames > 0) ignoreInputFrames--;
    if (coinPop > 0) coinPop *= 0.9;
    updateParticles();
    updateFx();
    tickV112();
    tickWorld110();

    if (state === State.TROPHIES || state === State.SHOP || state === State.BIRDS || state === State.MISSIONS) return;

    if (state === State.PLAY) tickSkills();
    const dashing = state === State.PLAY && skillActive("dash") > 0;
    ws = (dashing ? DASH_WORLD_MUL : 1) * (state === State.PLAY ? puModeWorldMul() : 1);
    const scrollMul = state === State.PLAY ? ws : (state === State.START ? 0.35 : 0.15);
    lastScrollMul = scrollMul;
    groundX = (groundX - pipeSpeed * scrollMul) % GROUND_TILE;
    cloudX = (cloudX - pipeSpeed * 0.25 * scrollMul) % (W + 220);
    hillX = (hillX - pipeSpeed * 0.5 * scrollMul) % HILL_TILE;
    farX = (farX - pipeSpeed * 0.5 * scrollMul) % FAR_TILE;

    if (state === State.OVER) {
      overTimer++;
      if (overTimer === 20) flushSaves("gameover");
      bird.vy = Math.min(bird.vy + GRAVITY * 1.2, MAX_FALL);
      bird.y += bird.vy;
      bird.rot = Math.min(1.2, bird.rot + 0.06);
      ws = 1;
      updateExtras();
      updateCoins();
      return;
    }

    if (state === State.START) {
      bird.y = PLAY_H / 2 + Math.sin(frame * 0.06) * 10;
      bird.vy = 0;
      bird.rot = Math.sin(frame * 0.06) * 0.15;
      bird.wing = 0.5 + Math.sin(frame * 0.2) * 0.5;
      // Idle light scenery
      if (frame % 100 === 0) spawnTree(false);
      ws = 1;
      updateExtras();
      return;
    }

    // PLAY
    tickPuMode();
    const perkGrav = pk().gravMul; // Hummingbird Tight Hover (1 = unchanged)
    let g = GRAVITY * perkGrav;
    if (puMode === "ship") g *= 0.6; // the ship floats a little
    if (dashing) {
      // Level, fast burst: no gravity, damp vertical motion
      bird.vy *= 0.6;
      bird.y += bird.vy;
      if (frame % (quality >= 2 ? 4 : 2) === 0 && particles.length < maxParticles() - 6) {
        addParticle(bird.x - 14, bird.y + (Math.random() * 10 - 5), -6, 0, 10, 10, "#fff4d0", 2);
      }
    } else if (puMode !== "rocket") {
      bird.vy = Math.min(bird.vy + g, MAX_FALL);
      bird.y += bird.vy;
    }
    bird.rot = dashing ? -0.1 : Math.max(-0.55, Math.min(1.15, bird.vy * 0.08));
    if (debugAuto) {
      // QA autopilot (?debug=1 only): glide toward the next gap center
      let tp = null;
      for (const q of pipes) if (q.x + q.w > bird.x - bird.r && (!tp || q.x < tp.x)) tp = q;
      const ty = tp ? tp.gapY : PLAY_H / 2;
      bird.y += (ty - bird.y) * 0.3;
      bird.vy = 0;
    }

    // v1.18: the one fixed Phoenix trail (red / orange / gold embers), always on while flying
    trailTick++;
    if (trailTick % 3 === 0) emitTrail(2);

    if (puMode && (bird.y - bird.r < 0 || bird.y + bird.r > PLAY_H)) {
      // ride modes never crash on the floor / ceiling
      bird.y = Math.max(bird.r + 1, Math.min(PLAY_H - bird.r - 1, bird.y));
      bird.vy = bird.y > PLAY_H / 2 ? FLAP * 0.7 : 1.5;
    }
    if (bird.y - bird.r < 0 || bird.y + bird.r > PLAY_H) {
      gameOver();
      if (state !== State.PLAY) return;
      // Protected (invulnerable / shield absorbed): bounce back into the play area
      if (bird.y + bird.r > PLAY_H) { bird.y = PLAY_H - bird.r - 1; bird.vy = FLAP * 0.85; }
      if (bird.y - bird.r < 0) { bird.y = bird.r + 1; bird.vy = 1.5; }
    }

    nextSpawn -= ws; // distance-based spacing (dash / ride modes keep pipe spacing fair)
    if (nextSpawn <= 0) {
      spawnPipe();
      nextSpawn = spawnEvery;
    }

    const pipeStep = pipeSpeed * ws;
    for (let i = pipes.length - 1; i >= 0; i--) {
      const p = pipes[i];
      p.x -= pipeStep;
      if (p.amp || p.bAmp) stepPipeMotion(p, ws);

      if (!p.scored && p.x + p.w < bird.x) {
        p.scored = true;
        // v1.9 Ghost: this pipe was flown through as a ghost (no near-miss credit for it).
        if (ghostPipesLeft > 0) { p.ghosted = true; p.ghostPass = true; }
        onPipeScored(p);
        if (p.ghosted) onGhostPipe();
        onPuModePipe();
      }

      if (puMode === "power" && !p.smashed && powerHits(p)) smashPipe(p, bird.x + 12, bird.y);
      if (!(ghostPipesLeft > 0 || p.ghostPass || puMode) && hitPipe(p)) {
        // Grace: emerging from a dash/shield hit inside a pipe shouldn't insta-kill
        if (invulnFrames > 0 && invulnFrames < 4 && graceBudget > 0) invulnFrames = 3;
        gameOver();
        if (state !== State.PLAY) return;
      }

      if (p.x + p.w < -20) pipes.splice(i, 1);
    }
    if (graceBudget > 0) graceBudget--;

    updateCoins();
    updatePowerups();
    updateBlackHoles();
    updateExtras();
    tickHeldFire();
    updateBurstFx();
  }

  function updateFx() {
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.y -= f.big ? 0.25 : 0.7;
      f.age = (f.age | 0) + 1;
      f.life--;
      if (f.life <= 0) floaters.splice(i, 1);
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.life -= 0.05;
      if (r.shrink) r.r = Math.max(0, r.r - r.max * 0.05 * 1.2);
      else r.r += (r.max - r.r) * 0.2;
      if (r.life <= 0) rings.splice(i, 1);
    }
    if (banners.length && state !== State.PLAY) {
      const b = banners[0];
      b.t++;
      if (b.t >= b.life) banners.shift();
    }
    if (toasts.length && state === State.PLAY) {
      const t = toasts[0];
      t.t++;
      // Queue backing up: move along faster
      if (toasts.length > 2 && t.t < t.life - 20 && t.t > 40) t.t = t.life - 20;
      if (t.t >= t.life) toasts.shift();
    }
    if (overCards.length && state === State.OVER && overTimer > 20) {
      const b = overCards[0];
      b.t++;
      if (b.t >= b.life && overCards.length > 1) overCards.shift();
      else if (b.t >= b.life) b.t = b.life - 16; // last card stays visible
    }
  }

  function emitTrail(n) {
    if (particles.length > maxParticles() - 12) return;
    if (quality >= 2) n = 1;
    for (let i = 0; i < n; i++) {
      const k = (Math.random() * 3) | 0;
      const tp = addParticle(bird.x - 12, bird.y + (Math.random() * 8 - 4), -1.5 - Math.random(), -0.6, 22, 22, k === 0 ? "#ff3b1f" : (k === 1 ? "#ff7a1a" : "#ffd23a"), 1.7 + Math.random() * 2.1);
      if (tp) tp.star = k === 2 && Math.random() < 0.4;
    }
  }

  // —— Draw helpers ——
  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawSky() {
    blit(sprite("sky", W, PLAY_H, function () {
      const g = ctx.createLinearGradient(0, 0, 0, PLAY_H);
      g.addColorStop(0, "#5eb8ff");
      g.addColorStop(0.55, "#8fd4ff");
      g.addColorStop(1, "#c8ecff");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, PLAY_H);
    }), 0, 0);
  }

  function drawCloud(cx, cy, s) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, 28 * s, 16 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - 22 * s, cy + 4 * s, 18 * s, 12 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 24 * s, cy + 2 * s, 20 * s, 13 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function scrollAlpha(mul) {
    return state === State.PLAY || state === State.START || state === State.OVER ? pipeSpeed * lastScrollMul * mul * renderAlpha : 0;
  }

  function drawClouds() {
    // Positive modulo so clouds drift fully off the left edge before wrapping (no pop-in).
    const P = W + 220;
    const base = cloudX - scrollAlpha(0.25);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    drawCloud((((base + 80) % P) + P) % P - 70, 70, 1);
    drawCloud((((base + 280) % P) + P) % P - 70, 120, 0.75);
    drawCloud((((base + 450) % P) + P) % P - 70, 55, 1.1);
  }

  function drawHills() {
    const hs = sprite("hills", W + HILL_TILE * 2, 60, function () {
      ctx.fillStyle = "#7bc96f";
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const x = i * HILL_TILE;
        ctx.moveTo(x, 60);
        ctx.quadraticCurveTo(x + 70, 60 - 55, x + 140, 60);
      }
      ctx.fill();
      ctx.fillStyle = "#5aad52";
      ctx.beginPath();
      for (let i = -1; i < 6; i++) {
        const x = 40 + i * HILL_TILE;
        ctx.moveTo(x, 60);
        ctx.quadraticCurveTo(x + 55, 60 - 36, x + 110, 60);
      }
      ctx.fill();
    });
    const off = ((((hillX - scrollAlpha(0.5)) % HILL_TILE) + HILL_TILE) % HILL_TILE) - HILL_TILE;
    ctx.drawImage(hs.c, off, PLAY_H - 60, hs.w, hs.h);
  }

  function drawTree(t) {
    const s = t.scale;
    const sway = Math.sin(t.sway) * (t.hazard ? 1.5 : 3);
    const trunkH = (t.hazard ? 75 : 55) * s;
    const trunkW = (t.trunkW || 12) * (t.hazard ? 1 : s);
    const tx = t.x + sway;
    const ty = t.baseY;

    // trunk
    const wt = worldDefAt(worldIdx).tree; // v1.10: trees take the world's colors
    ctx.fillStyle = wt ? wt.trunk : (t.hazard ? "#5a3a1a" : "#6b4423");
    ctx.fillRect(tx - trunkW / 2, ty - trunkH, trunkW, trunkH);

    // canopy
    const canopyY = ty - trunkH;
    const r1 = 22 * s;
    ctx.fillStyle = wt ? wt.canopy : (t.hazard ? "#2d6b2d" : `hsl(${t.hue}, 55%, 42%)`);
    ctx.beginPath();
    ctx.arc(tx, canopyY, r1, 0, Math.PI * 2);
    ctx.arc(tx - 14 * s, canopyY + 6 * s, r1 * 0.75, 0, Math.PI * 2);
    ctx.arc(tx + 14 * s, canopyY + 4 * s, r1 * 0.8, 0, Math.PI * 2);
    ctx.fill();
    // highlight
    ctx.fillStyle = wt && wt.snowcap ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.arc(tx - 6 * s, canopyY - 6 * s, r1 * (wt && wt.snowcap ? 0.6 : 0.35), 0, Math.PI * 2);
    ctx.fill();

    if (t.hazard) {
      // warning bark stripes
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(tx - trunkW / 2, ty - trunkH + 10, trunkW, 4);
      ctx.fillRect(tx - trunkW / 2, ty - trunkH + 24, trunkW, 4);
    }
  }

  function drawWaterfall(wf) {
    const x = wf.x;
    const w = wf.w;
    // mist
    ctx.fillStyle = "rgba(180,220,255,0.25)";
    ctx.fillRect(x - 4, 0, w + 8, PLAY_H);
    // streams
    for (let i = 0; i < 5; i++) {
      const sx = x + (i + 0.5) * (w / 5) + Math.sin(wf.phase + i) * 2;
      ctx.fillStyle = cachedGrad("waterfall", function () {
        const g = ctx.createLinearGradient(0, 0, 0, PLAY_H);
        g.addColorStop(0, "rgba(200,240,255,0.15)");
        g.addColorStop(0.5, "rgba(120,200,255,0.45)");
        g.addColorStop(1, "rgba(80,160,230,0.55)");
        return g;
      });
      ctx.fillRect(sx - 3, 0, 6, PLAY_H);
    }
    // foam at bottom
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    for (let i = 0; i < 4; i++) {
      const fx = x + ((i * 17 + wf.phase * 8) % w);
      ctx.beginPath();
      ctx.ellipse(fx, PLAY_H - 6, 8, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (wf.push > 0) {
      ctx.fillStyle = "rgba(100,180,255,0.12)";
      ctx.fillRect(x, 0, w, PLAY_H);
    }
  }

  function drawAnimal(a) {
    ctx.save();
    ctx.translate(a.x, a.y);
    if (a.kind === "butterfly") {
      const flap = Math.sin(a.phase) * 0.6;
      ctx.fillStyle = a.hazard ? "#e06080" : "#ff90c0";
      ctx.beginPath();
      ctx.ellipse(-6, 0, 7, 5, -0.4 + flap, 0, Math.PI * 2);
      ctx.ellipse(6, 0, 7, 5, 0.4 - flap, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#444";
      ctx.fillRect(-1, -4, 2, 8);
    } else if (a.kind === "dragonfly") {
      ctx.fillStyle = a.hazard ? "#40c0a0" : "#70e0c0";
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "#c0fff0";
      ctx.beginPath();
      ctx.ellipse(-2, -4, 8, 3, -0.2, 0, Math.PI * 2);
      ctx.ellipse(-2, 4, 8, 3, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (a.kind === "bunny") {
      ctx.fillStyle = a.hazard ? "#d0a080" : "#f5e6d3";
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      // ears
      ctx.beginPath();
      ctx.ellipse(-4, -10, 3, 8, -0.2, 0, Math.PI * 2);
      ctx.ellipse(4, -10, 3, 8, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#222";
      ctx.beginPath();
      ctx.arc(3, -2, 1.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // squirrel
      ctx.fillStyle = a.hazard ? "#a06030" : "#c07840";
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-10, -4, 6, 8, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#222";
      ctx.beginPath();
      ctx.arc(4, -2, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // —— v1.18: witch-hunters evolve ——
  // Four tiers that follow the worlds: bigger hats, a broom, new colours; more HP, faster, a wider net. They are still poofed away in a
  // cloud of confetti (cartoon, no blood), never appear on boss levels or before level 35.
  const HUNTER_TIERS = [
    { name: "Apprentice",  from: 35,  hp: 2, spd: 1.0,  net: 1.0, cd: 1.0,  sc: 1.0,  hatH: 10, brim: 12, body: "#2a1a10", hat: "#1a1008", band: null,      eye: "#ff4444", broom: false },
    { name: "Broom Rider", from: 61,  hp: 2, spd: 1.14, net: 1.2, cd: 0.95, sc: 1.08, hatH: 16, brim: 14, body: "#3a2060", hat: "#4b2a78", band: "#ff9ec8", eye: "#ff6688", broom: true },
    { name: "Sorcerer",    from: 101, hp: 3, spd: 1.27, net: 1.4, cd: 0.9,  sc: 1.17, hatH: 22, brim: 16, body: "#0e3340", hat: "#0f4a5c", band: "#7fe3ff", eye: "#7fe3ff", broom: true },
    { name: "Archwitch",   from: 141, hp: 4, spd: 1.4,  net: 1.6, cd: 0.85, sc: 1.27, hatH: 28, brim: 18, body: "#4a0c22", hat: "#6a0f2e", band: "#ffd24a", eye: "#ffd24a", broom: true },
  ];
  function hunterTierFor(lv) { let t = 0; for (let i = 0; i < HUNTER_TIERS.length; i++) if (lv >= HUNTER_TIERS[i].from) t = i; return t; }
  // v1.18: every tier also comes in several body shapes, rolled per hunter, so the witches are not all the same silhouette.
  // bx / by: body width / height, hatS: hat height, brimS: brim width, sc: overall size, spd: speed, lean: hunched forward (radians).
  // HP and the net come from the tier only, so every shape stays fair and readable. Shots hit a box that is never smaller than the classic one.
  const HUNTER_VARS = [
    { id: "classic", w: 28, bx: 1.0,  by: 1.0,  hatS: 1.0,  brimS: 1.0, sc: 1.0,  spd: 1.0,  lean: 0,    hat: "cone",   broom: "straight", head: 1.0 },
    { id: "tall",    w: 20, bx: 0.78, by: 1.24, hatS: 1.3,  brimS: 0.85, sc: 1.0, spd: 1.0,  lean: 0,    hat: "cone",   broom: "straight", head: 0.92 },
    { id: "round",   w: 20, bx: 1.34, by: 0.82, hatS: 0.8,  brimS: 1.1, sc: 1.0,  spd: 0.94, lean: 0,    hat: "floppy", broom: "stub",     head: 1.12 },
    { id: "hunched", w: 14, bx: 1.0,  by: 0.92, hatS: 0.95, brimS: 1.0, sc: 1.0,  spd: 1.0,  lean: 0.34, hat: "hook",   broom: "twig",     head: 1.0 },
    { id: "bighat",  w: 9,  bx: 0.96, by: 0.98, hatS: 1.5,  brimS: 1.75, sc: 1.04, spd: 0.97, lean: 0,    hat: "wide",   broom: "straight", head: 1.0 },
    { id: "tiny",    w: 14, bx: 0.9,  by: 0.9,  hatS: 0.85, brimS: 0.9, sc: 0.78, spd: 1.2,  lean: 0,    hat: "cone",   broom: "curly",    head: 1.0 },
  ];
  function hunterRollVariant() { let tot = 0; for (let i = 0; i < HUNTER_VARS.length; i++) tot += HUNTER_VARS[i].w; let r = Math.random() * tot; for (let i = 0; i < HUNTER_VARS.length; i++) { r -= HUNTER_VARS[i].w; if (r < 0) return i; } return 0; }
  let hunterAnn = -1;
  function hunterTierInit(h, lv, forceTier, forceVar) {
    const t = forceTier === undefined || forceTier === null ? hunterTierFor(lv) : Math.max(0, Math.min(HUNTER_TIERS.length - 1, forceTier | 0)), T = HUNTER_TIERS[t];
    const vi = forceVar !== undefined && forceVar !== null ? Math.max(0, Math.min(HUNTER_VARS.length - 1, forceVar | 0)) : (forceTier === undefined ? hunterRollVariant() : 0), V = HUNTER_VARS[vi];
    h.tier = t; h.v = vi; h.hp = T.hp; h.spd = T.spd * V.spd; h.netMul = T.net; h.cd = T.cd; h.sc = T.sc * V.sc;
    h.hw = Math.max(17, Math.round(17 * h.sc * Math.max(1, V.bx))); h.hh = Math.max(21, Math.round(21 * h.sc * Math.max(1, V.by)));   // the area a pellet has to touch: never smaller than the classic witch
    if (forceTier === undefined && t > hunterAnn && state === State.PLAY) { hunterAnn = t; floaters.push({ x: W - 78, y: 96, text: T.name + "s ahead!", life: 100, color: T.eye }); }
  }
  function drawHunter(h) {
    const T = HUNTER_TIERS[h.tier | 0] || HUNTER_TIERS[0], V = HUNTER_VARS[h.v | 0] || HUNTER_VARS[0], s = h.sc || T.sc;
    const bx = V.bx, by = V.by, bodyTop = 6 - 16 * by, headY = bodyTop - 2, headR = 8 * V.head, hatBase = headY - 5, hatH = T.hatH * V.hatS, brim = T.brim * V.brimS;
    ctx.save();
    ctx.translate(h.x, h.y);
    if (h.stun > 0) ctx.rotate(Math.sin(h.stun * 0.35) * 0.1);
    ctx.scale(s, s);
    if (T.broom || V.broom !== "straight") {   // broom under the hunter: a different broom per shape
      ctx.lineCap = "round"; ctx.strokeStyle = "#8a5a2b"; ctx.lineWidth = 3;
      if (V.broom === "stub") {
        ctx.lineWidth = 4.5; ctx.beginPath(); ctx.moveTo(-14, 22); ctx.lineTo(24, 18); ctx.stroke();
        ctx.fillStyle = "#e0b050"; ctx.beginPath(); ctx.ellipse(-20, 22, 9, 8, 0, 0, Math.PI * 2); ctx.fill();
      } else if (V.broom === "twig") {
        ctx.lineWidth = 2; for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(-20, 24 + k * 2); ctx.lineTo(26, 17 + k * 1.5); ctx.stroke(); }
        ctx.strokeStyle = "#a07a3a"; ctx.lineWidth = 1.4; for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.moveTo(-20, 24); ctx.lineTo(-36 - (k % 2) * 3, 14 + k * 4); ctx.stroke(); }
      } else if (V.broom === "curly") {
        ctx.beginPath(); ctx.moveTo(-18, 24); ctx.lineTo(24, 18); ctx.stroke();
        ctx.beginPath(); ctx.arc(26, 13, 5, Math.PI * 0.5, Math.PI * 2.1); ctx.stroke();
        ctx.fillStyle = "#ffb0d8"; ctx.beginPath(); ctx.moveTo(-18, 24); ctx.lineTo(-38, 12); ctx.lineTo(-33, 24); ctx.lineTo(-38, 36); ctx.closePath(); ctx.fill();
      } else {
        ctx.beginPath(); ctx.moveTo(-24, 24); ctx.lineTo(26, 17); ctx.stroke();
        ctx.fillStyle = "#e0b050"; ctx.beginPath(); ctx.moveTo(-22, 24); ctx.lineTo(-40, 15); ctx.lineTo(-38, 25); ctx.lineTo(-40, 34); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#b8872d"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-30, 21); ctx.lineTo(-38, 25); ctx.moveTo(-30, 27); ctx.lineTo(-38, 25); ctx.stroke();
      }
    }
    // hunched shapes lean the whole upper body forward
    ctx.save();
    if (V.lean) { ctx.translate(0, 16); ctx.rotate(V.lean); ctx.translate(0, -16); }
    ctx.fillStyle = T.body;
    ctx.beginPath(); ctx.ellipse(0, 6, 12 * bx, 16 * by, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(V.lean ? 3 : 0, headY, headR, 0, Math.PI * 2); ctx.fill();
    if (h.tier >= 3) { ctx.fillStyle = "#ffd24a"; ctx.fillRect(-11 * bx, 8, 22 * bx, 3); }   // gold belt
    ctx.save(); if (V.lean) ctx.translate(3, 0);
    // pointy hat: the cone gets taller every tier; each shape has its own hat (cone, floppy, hooked, wide-brim)
    ctx.fillStyle = T.hat;
    ctx.beginPath(); ctx.ellipse(0, hatBase, brim, 3.6, 0, 0, Math.PI * 2); ctx.fill();
    const hw2 = V.hat === "wide" ? 10 : 7, tipX = V.hat === "cone" ? (h.tier ? 3 : 0) : 0;
    let sx = tipX, sy = hatBase - 1 - hatH - 3;
    ctx.beginPath(); ctx.moveTo(-hw2, hatBase - 1); ctx.lineTo(hw2, hatBase - 1);
    if (V.hat === "floppy") { sx = -9; sy = hatBase - 4 - hatH * 0.55; ctx.quadraticCurveTo(4, hatBase - hatH * 0.9, sx, sy); ctx.quadraticCurveTo(-5, hatBase - hatH * 0.8, -hw2, hatBase - 1); }
    else if (V.hat === "hook") { sx = 11; sy = hatBase - 3 - hatH * 0.8; ctx.quadraticCurveTo(3, hatBase - hatH * 1.2, sx, sy); ctx.quadraticCurveTo(-1, hatBase - hatH * 0.7, -hw2, hatBase - 1); }
    else ctx.lineTo(sx, sy);
    ctx.closePath(); ctx.fill();
    if (T.band) { ctx.fillStyle = T.band; ctx.fillRect(-hw2, hatBase - 4, hw2 * 2, 3); }
    if (V.hat === "floppy") { ctx.fillStyle = T.band || "#ffd24a"; ctx.beginPath(); ctx.arc(sx, sy, 2.6, 0, Math.PI * 2); ctx.fill(); }
    if (h.tier >= 2) { ctx.fillStyle = h.tier >= 3 ? "#ffd24a" : "#ffffff"; ctx.beginPath(); for (let k = 0; k < 10; k++) { const rr = k % 2 ? 1.6 : 3.6, a = -Math.PI / 2 + k * Math.PI / 5; ctx.lineTo(sx * 0.4 + Math.cos(a) * rr, sy * 0.6 + hatBase * 0.4 + Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); }
    // glowing eyes (readable threat; they turn pale when dazed)
    ctx.fillStyle = h.stun > 0 ? "#d6e0ff" : T.eye;
    ctx.beginPath(); ctx.arc(-3, headY - 1, 1.8, 0, Math.PI * 2); ctx.arc(3, headY - 1, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.restore();
    // arm + net / stick
    ctx.strokeStyle = "#1a1008"; ctx.lineWidth = 3; ctx.lineCap = "butt";
    ctx.beginPath(); ctx.moveTo(8 * bx, 0); ctx.lineTo(22, 6); ctx.stroke();
    if (h.kind === "net") {
      ctx.strokeStyle = h.tier ? T.band || "#4a3020" : "#4a3020"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(22 + 4 * T.net, 8, 8 * T.net, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.fillStyle = "#3a2818"; ctx.fillRect(20, 3, 14 + 4 * (T.net - 1) * 3, 4);
    }
    ctx.restore();
    // HP pips above the hat: one per hit left (they pop away when the hunter is bonked)
    const n = hunterHp(h), left = Math.max(0, n - (h.dmg | 0)), py = (Math.min(sy, hatBase - 8) - 10) * s;
    for (let i = 0; i < n; i++) {
      const px = h.x + (i - (n - 1) / 2) * 8;
      ctx.fillStyle = i < left ? "#ffd24a" : "rgba(255,255,255,0.28)"; ctx.strokeStyle = "rgba(60,30,20,0.8)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(px, h.y + py, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    if (h.stun > 0) {
      // dazed: little stars circle over the head
      for (let i = 0; i < 3; i++) {
        const a = frame * 0.14 + i * 2.094, qx = h.x + Math.cos(a) * 11 * s, qy = h.y + (hatBase - hatH * 0.4) * s + Math.sin(a) * 3.5;
        ctx.fillStyle = "#ffe066"; ctx.beginPath(); ctx.arc(qx, qy, 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(qx - 0.7, qy - 0.7, 0.9, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawProjectile(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.kind === "net") {
      ctx.strokeStyle = "rgba(80,50,20,0.85)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, p.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-p.r, 0);
      ctx.lineTo(p.r, 0);
      ctx.moveTo(0, -p.r);
      ctx.lineTo(0, p.r);
      ctx.moveTo(-p.r * 0.7, -p.r * 0.7);
      ctx.lineTo(p.r * 0.7, p.r * 0.7);
      ctx.stroke();
    } else {
      ctx.fillStyle = "#ff6633";
      ctx.beginPath();
      ctx.ellipse(0, 0, p.r + 2, p.r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffcc66";
      ctx.beginPath();
      ctx.arc(-2, 0, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  const PIPE_CAP = 22;
  function drawCrackMarks(r, stage) {
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-r * 0.15, -r * 0.45);
    ctx.lineTo(r * 0.05, -r * 0.1);
    ctx.lineTo(-r * 0.22, r * 0.18);
    if (stage >= 2) {
      ctx.moveTo(r * 0.05, -r * 0.1);
      ctx.lineTo(r * 0.32, r * 0.05);
      ctx.moveTo(-r * 0.22, r * 0.18);
      ctx.lineTo(-r * 0.05, r * 0.42);
    }
    if (stage >= 3) {
      ctx.moveTo(r * 0.32, r * 0.05);
      ctx.lineTo(r * 0.15, r * 0.38);
      ctx.moveTo(-r * 0.15, -r * 0.45);
      ctx.lineTo(-r * 0.42, -r * 0.22);
    }
    ctx.stroke();
    ctx.restore();
  }
  function drawGateBit(bit) {
    const r = bit.r;
    const seed = bit.seed || 1;
    const kind = bit.kind;
    const rot = (bit.spin || 0) * frame + ((seed % 7) * 0.2);
    ctx.save();
    ctx.rotate(kind === "gear" || kind === "tri" || kind === "crystal" || kind === "kite" || kind === "debris" ? rot : (seed % 5) * 0.04);
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    if (kind === "rock") {
      ctx.fillStyle = "#8a8074";
      ctx.strokeStyle = "#3a342c";
      ctx.beginPath();
      ctx.moveTo(-r * 0.2, -r * 0.85);
      ctx.lineTo(r * 0.55, -r * 0.45);
      ctx.lineTo(r * 0.9, r * 0.05);
      ctx.lineTo(r * 0.45, r * 0.8);
      ctx.lineTo(-r * 0.35, r * 0.85);
      ctx.lineTo(-r * 0.9, r * 0.2);
      ctx.lineTo(-r * 0.7, -r * 0.35);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#6f9a45";
      ctx.beginPath();
      ctx.moveTo(-r * 0.15, -r * 0.7);
      ctx.quadraticCurveTo(-r * 0.05, -r * 0.98, r * 0.18, -r * 0.72);
      ctx.quadraticCurveTo(r * 0.05, -r * 0.55, -r * 0.15, -r * 0.7);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.beginPath(); ctx.ellipse(-r * 0.25, -r * 0.15, r * 0.22, r * 0.12, -0.4, 0, Math.PI * 2); ctx.fill();
    } else if (kind === "crystal") {
      const cols = ["#7a5cff", "#3ec6ff", "#d56bff", "#8f7bff"];
      ctx.fillStyle = cols[Math.abs(seed) % cols.length];
      ctx.strokeStyle = "#2a1860";
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.72, -r * 0.15);
      ctx.lineTo(r * 0.42, r * 0.95);
      ctx.lineTo(-r * 0.42, r * 0.95);
      ctx.lineTo(-r * 0.72, -r * 0.15);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.72);
      ctx.lineTo(r * 0.18, -r * 0.05);
      ctx.lineTo(0, r * 0.55);
      ctx.lineTo(-r * 0.16, -r * 0.05);
      ctx.closePath();
      ctx.fill();
    } else if (kind === "gear") {
      ctx.fillStyle = "#e0a93c";
      ctx.strokeStyle = "#5a3a10";
      const n = 8;
      ctx.beginPath();
      for (let i = 0; i < n * 2; i++) {
        const a = i * Math.PI / n, rr = i % 2 ? r * 0.72 : r;
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#ff7a1a";
      ctx.beginPath(); ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#5a3a10"; ctx.stroke();
      ctx.fillStyle = "#fff6d0";
      ctx.beginPath(); ctx.arc(-r * 0.1, -r * 0.1, r * 0.1, 0, Math.PI * 2); ctx.fill();
    } else if (kind === "tri") {
      ctx.strokeStyle = "#4a3018";
      ctx.lineWidth = Math.max(3, r * 0.16);
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + i * Math.PI * 2 / 3;
        const px = Math.cos(a) * r * 0.78, py = Math.sin(a) * r * 0.78;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + i * Math.PI * 2 / 3;
        ctx.save();
        ctx.translate(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78);
        ctx.rotate(a + Math.PI / 2);
        ctx.fillStyle = "#6a5848";
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.28);
        ctx.lineTo(r * 0.16, r * 0.08);
        ctx.lineTo(-r * 0.16, r * 0.08);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = "#ff8a1a";
      ctx.beginPath(); ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffe08a";
      ctx.beginPath(); ctx.arc(-r * 0.08, -r * 0.08, r * 0.08, 0, Math.PI * 2); ctx.fill();
    } else if (kind === "debris") {
      ctx.fillStyle = "#5c564e";
      ctx.strokeStyle = "#241e1a";
      ctx.beginPath();
      ctx.moveTo(-r * 0.8, -r * 0.2);
      ctx.lineTo(-r * 0.15, -r * 0.9);
      ctx.lineTo(r * 0.7, -r * 0.35);
      ctx.lineTo(r * 0.85, r * 0.4);
      ctx.lineTo(r * 0.1, r * 0.9);
      ctx.lineTo(-r * 0.75, r * 0.45);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-r * 0.2, -r * 0.4);
      ctx.lineTo(r * 0.15, r * 0.1);
      ctx.lineTo(-r * 0.05, r * 0.45);
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      const dir = bit.drift ? Math.sign(Math.cos((bit.dph || 0) + frame * (bit.drate || 0.015))) : 1;
      ctx.beginPath();
      ctx.moveTo(dir * r * 0.1, r * 0.15);
      ctx.lineTo(dir * r * 0.45, r * 0.15);
      ctx.lineTo(dir * r * 0.28, r * 0.34);
      ctx.closePath();
      ctx.fill();
    } else if (kind === "slab") {
      ctx.fillStyle = "#e0a56a";
      ctx.strokeStyle = "#7a4e28";
      ctx.beginPath();
      ctx.moveTo(-r * 0.9, -r * 0.2);
      ctx.lineTo(-r * 0.4, -r * 0.75);
      ctx.lineTo(r * 0.7, -r * 0.55);
      ctx.lineTo(r * 0.95, r * 0.15);
      ctx.lineTo(r * 0.2, r * 0.8);
      ctx.lineTo(-r * 0.85, r * 0.45);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "rgba(90,40,10,0.35)";
      ctx.beginPath(); ctx.moveTo(-r * 0.4, -r * 0.2); ctx.lineTo(r * 0.5, r * 0.15); ctx.stroke();
    } else if (kind === "cactusball") {
      ctx.fillStyle = "#3d9a48";
      ctx.strokeStyle = "#1c5a28";
      ctx.beginPath(); ctx.ellipse(0, r * 0.05, r * 0.72, r * 0.62, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#2f7d3a";
      ctx.beginPath(); ctx.ellipse(-r * 0.55, -r * 0.05, r * 0.28, r * 0.18, -0.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(r * 0.5, -r * 0.15, r * 0.26, r * 0.16, 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#ff7fb0";
      ctx.beginPath(); ctx.arc(r * 0.1, -r * 0.15, r * 0.12, 0, Math.PI * 2); ctx.fill();
    } else if (kind === "ice") {
      ctx.fillStyle = "#d7f3ff";
      ctx.strokeStyle = "#2a6498";
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.86, -r * 0.2);
      ctx.lineTo(r * 0.45, r * 0.9);
      ctx.lineTo(-r * 0.55, r * 0.7);
      ctx.lineTo(-r * 0.8, -r * 0.25);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.beginPath();
      ctx.moveTo(-r * 0.1, -r * 0.55);
      ctx.lineTo(r * 0.15, -r * 0.1);
      ctx.lineTo(-r * 0.05, r * 0.35);
      ctx.closePath();
      ctx.fill();
    } else if (kind === "snowball") {
      ctx.fillStyle = "#f7fbff";
      ctx.strokeStyle = "#7f98b0";
      ctx.beginPath(); ctx.arc(-r * 0.15, r * 0.08, r * 0.62, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(r * 0.28, -r * 0.22, r * 0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath(); ctx.arc(-r * 0.28, -r * 0.08, r * 0.12, 0, Math.PI * 2); ctx.fill();
    } else if (kind === "sign") {
      ctx.fillStyle = "#241848";
      ctx.strokeStyle = "#7dfff2";
      ctx.lineWidth = 3;
      roundRect(-r * 0.85, -r * 0.48, r * 1.7, r * 0.96, r * 0.18);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#ff4fd8";
      ctx.fillRect(-r * 0.45, -r * 0.12, r * 0.9, r * 0.16);
      ctx.fillStyle = "#7dfff2";
      ctx.fillRect(-r * 0.28, r * 0.12, r * 0.55, r * 0.1);
    } else if (kind === "asteroid") {
      ctx.fillStyle = "#6d628c";
      ctx.strokeStyle = "#241830";
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.86, r * 0.72, 0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(20,10,40,0.35)";
      ctx.beginPath(); ctx.ellipse(-r * 0.2, -r * 0.1, r * 0.18, r * 0.12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(r * 0.28, r * 0.18, r * 0.12, r * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    } else if (kind === "petal") {
      ctx.fillStyle = "#c4a07a";
      ctx.strokeStyle = "#6a4030";
      ctx.beginPath(); ctx.ellipse(0, r * 0.1, r * 0.7, r * 0.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#ff9ec8";
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(-r * 0.3 + i * r * 0.3, -r * 0.25, r * 0.18, r * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (kind === "log") {
      ctx.fillStyle = "#a86b3e";
      ctx.strokeStyle = "#4a2c16";
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.95, r * 0.42, 0.1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "rgba(60,30,10,0.45)";
      ctx.beginPath(); ctx.arc(-r * 0.7, 0, r * 0.28, 0.2, Math.PI - 0.2); ctx.stroke();
      ctx.fillStyle = "#6d8a48";
      ctx.beginPath(); ctx.ellipse(r * 0.55, -r * 0.28, r * 0.16, r * 0.1, -0.4, 0, Math.PI * 2); ctx.fill();
    } else if (kind === "coral") {
      ctx.fillStyle = "#ff7f9c";
      ctx.strokeStyle = "#8a2048";
      ctx.beginPath(); ctx.ellipse(0, r * 0.15, r * 0.46, r * 0.38, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(-r * 0.38, -r * 0.15, r * 0.28, r * 0.36, -0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(r * 0.4, -r * 0.2, r * 0.26, r * 0.34, 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.beginPath(); ctx.arc(-r * 0.38, -r * 0.28, r * 0.08, 0, Math.PI * 2); ctx.arc(r * 0.4, -r * 0.34, r * 0.07, 0, Math.PI * 2); ctx.fill();
    } else if (kind === "shell") {
      ctx.fillStyle = "#f0d2b4";
      ctx.strokeStyle = "#8a5a40";
      ctx.beginPath(); ctx.arc(0, r * 0.1, r * 0.72, Math.PI * 0.15, Math.PI * 1.15, true); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "rgba(120,70,40,0.55)";
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath(); ctx.arc(-r * 0.05, r * 0.15, r * (0.18 * i), Math.PI * 0.3, Math.PI * 0.95); ctx.stroke();
      }
    } else if (kind === "lavabomb") {
      ctx.fillStyle = "#3a3036";
      ctx.strokeStyle = "#1a1014";
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.82, r * 0.74, 0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "#ff7a1a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-r * 0.3, -r * 0.2);
      ctx.lineTo(r * 0.05, r * 0.05);
      ctx.lineTo(-r * 0.1, r * 0.4);
      ctx.moveTo(r * 0.05, r * 0.05);
      ctx.lineTo(r * 0.4, -r * 0.15);
      ctx.stroke();
      ctx.fillStyle = "#ffd25a";
      ctx.beginPath(); ctx.arc(r * 0.05, r * 0.05, r * 0.08, 0, Math.PI * 2); ctx.fill();
    } else if (kind === "gumdrop") {
      ctx.fillStyle = (Math.abs(seed) % 2) ? "#ff7ab8" : "#b48cff";
      ctx.strokeStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(-r * 0.7, r * 0.35);
      ctx.quadraticCurveTo(-r * 0.85, -r * 0.45, 0, -r * 0.9);
      ctx.quadraticCurveTo(r * 0.85, -r * 0.45, r * 0.7, r * 0.35);
      ctx.quadraticCurveTo(0, r * 0.85, -r * 0.7, r * 0.35);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.beginPath(); ctx.ellipse(-r * 0.18, -r * 0.25, r * 0.16, r * 0.22, -0.4, 0, Math.PI * 2); ctx.fill();
    } else if (kind === "lantern") {
      ctx.fillStyle = "#ffb03a";
      ctx.strokeStyle = "#8a4010";
      ctx.beginPath(); ctx.ellipse(0, r * 0.08, r * 0.55, r * 0.68, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#e23a3a";
      ctx.fillRect(-r * 0.28, -r * 0.78, r * 0.56, r * 0.16);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.beginPath(); ctx.ellipse(-r * 0.12, -r * 0.05, r * 0.12, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    } else if (kind === "buoy") {
      ctx.fillStyle = "#f4f7fb";
      ctx.strokeStyle = "#14324a";
      ctx.beginPath(); ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#ff5a4a";
      ctx.beginPath(); ctx.arc(0, 0, r * 0.72, 0.15, Math.PI - 0.15); ctx.fill();
      ctx.fillStyle = "#1a6a9a";
      ctx.fillRect(-r * 0.08, -r * 0.72, r * 0.16, r * 0.28);
    } else if (kind === "anvil") {
      ctx.fillStyle = "#8b93a6";
      ctx.strokeStyle = "#2a3140";
      ctx.beginPath();
      ctx.moveTo(-r * 0.9, -r * 0.15);
      ctx.lineTo(-r * 0.55, -r * 0.55);
      ctx.lineTo(r * 0.55, -r * 0.55);
      ctx.lineTo(r * 0.9, -r * 0.15);
      ctx.lineTo(r * 0.45, -r * 0.15);
      ctx.lineTo(r * 0.45, r * 0.55);
      ctx.lineTo(-r * 0.45, r * 0.55);
      ctx.lineTo(-r * 0.45, -r * 0.15);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#d5dbe6";
      ctx.fillRect(-r * 0.2, -r * 0.42, r * 0.12, r * 0.18);
    } else if (kind === "kite") {
      ctx.fillStyle = (Math.abs(seed) % 2) ? "#ff5a8a" : "#7ad0ff";
      ctx.strokeStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.9);
      ctx.lineTo(r * 0.7, 0);
      ctx.lineTo(0, r * 0.7);
      ctx.lineTo(-r * 0.7, 0);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.beginPath(); ctx.moveTo(0, -r * 0.9); ctx.lineTo(0, r * 0.7); ctx.moveTo(-r * 0.7, 0); ctx.lineTo(r * 0.7, 0); ctx.stroke();
    } else {
      const pal = ["#3fcf6a", "#ff8a2a", "#9a5cff", "#3aa8ff", "#ff4aa0", "#8a9ab4", "#ffc83a", "#ff5a6a"];
      ctx.fillStyle = pal[(bit.variant || 0) % pal.length];
      ctx.strokeStyle = "#201028";
      ctx.beginPath(); ctx.ellipse(0, r * 0.05, r * 0.7, r * 0.62, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff7d0";
      ctx.beginPath(); ctx.arc(-r * 0.22, -r * 0.05, r * 0.14, 0, Math.PI * 2); ctx.arc(r * 0.22, -r * 0.05, r * 0.14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#1c1030";
      ctx.beginPath(); ctx.arc(-r * 0.18, -r * 0.02, r * 0.06, 0, Math.PI * 2); ctx.arc(r * 0.26, -r * 0.02, r * 0.06, 0, Math.PI * 2); ctx.fill();
    }
    const full = Math.max(2, pipeHp());
    const hp = bit.hp | 0;
    if (hp > 0 && !bit.gone) {
      const st = hp >= full * 0.66 ? 3 : (hp >= full * 0.33 ? 2 : 1);
      const fx = bitFx(bit);
      ctx.strokeStyle = fx.crack;
      ctx.lineWidth = st >= 3 ? 2.6 : 1.7;
      drawCrackMarks(r, st);
      if (st >= 3) {
        ctx.fillStyle = fx.cols[1] || "#ffffff";
        ctx.fillRect(-r * 0.2, r * 0.1, 3, 3);
        ctx.fillRect(r * 0.15, -r * 0.05, 3, 3);
      }
    }
    if (bit.hit != null && frame - bit.hit < 5) {
      ctx.globalAlpha = 0.45 - (frame - bit.hit) * 0.08;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function drawGate(p) {
    if (!p.bits) return;
    for (let i = 0; i < p.bits.length; i++) {
      const bit = p.bits[i];
      if (!bit || bit.gone) continue;
      const q = window.SkyHopObstacles.bitXY(p.x, p.gapY, bit, frame);
      if (q.x + bit.r < -20 || q.x - bit.r > W + 30) continue;
      if (bit.amp > 1) {
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(q.x, q.y - bit.amp);
        ctx.lineTo(q.x, q.y + bit.amp);
        ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.translate(q.x, q.y);
      drawGateBit(bit);
      ctx.restore();
    }
  }
  function drawPipe(p) {
    if (p.smashed) return;
    if (p.bits && p.bits.length) { drawGate(p); return; }
  }

  function drawGround() {
    const gs = sprite("ground", GROUND_TILE + W, GROUND_H, function () {
      const tw = GROUND_TILE + W;
      ctx.fillStyle = "#d4a84b";
      ctx.fillRect(0, 0, tw, GROUND_H);
      const grass = ctx.createLinearGradient(0, 0, 0, 18);
      grass.addColorStop(0, "#5ecf5a");
      grass.addColorStop(1, "#3aaa38");
      ctx.fillStyle = grass;
      ctx.fillRect(0, 0, tw, 18);
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      for (let x = 0; x < tw; x += 48) ctx.fillRect(x, 20, 24, GROUND_H - 20);
      ctx.fillStyle = "rgba(120,70,20,0.25)";
      ctx.beginPath();
      for (let x0 = 0; x0 < tw; x0 += GROUND_TILE) {
        for (let i = 0; i < 14; i++) {
          const dx = x0 + ((i * 53 + 17) % GROUND_TILE);
          ctx.moveTo(dx + 2.5, 38 + (i % 3) * 8);
          ctx.arc(dx, 38 + (i % 3) * 8, 2.5, 0, Math.PI * 2);
        }
      }
      ctx.fill();
    });
    const off = ((((groundX - scrollAlpha(1)) % GROUND_TILE) + GROUND_TILE) % GROUND_TILE) - GROUND_TILE;
    ctx.drawImage(gs.c, off, PLAY_H, gs.w, gs.h);
  }

  const SPECIES_DIMS = {
    sparrow: [17, 14, 1], swallow: [19, 12, 1.3], owl: [17, 16, 0.95],
    hummingbird: [15, 12, 1.1], parrot: [17, 14, 1.05], eagle: [19, 15, 1.25],
  };

  // —— v1.10 original bird skins (shape accents drawn on top of the chosen bird) ——
  const SKIN_EXTRA = { skin_pigeon: 1, skin_duck: 1, skin_dragon: 1, skin_robo: 1, skin_cloud: 1, skin_penguin: 1, skin_phoenix: 1, skin_bee: 1, skin_galaxy: 1, skin_toucan: 1 };
  function drawSkinBack(id, pal) {
    if (id === "skin_dragon") {
      // back spines + spade-tipped tail
      ctx.fillStyle = pal.body2;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const x = -12 + i * 5, y = -10 - (i === 1 || i === 2 ? 3 : 1);
        ctx.moveTo(x - 3, y + 4); ctx.lineTo(x, y - 5); ctx.lineTo(x + 3, y + 4);
      }
      ctx.fill();
      ctx.strokeStyle = pal.body2;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-14, 4); ctx.quadraticCurveTo(-26, 12, -32, 4);
      ctx.stroke();
      ctx.fillStyle = pal.wing;
      ctx.beginPath();
      ctx.moveTo(-31, 4); ctx.lineTo(-40, -1); ctx.lineTo(-38, 8); ctx.closePath();
      ctx.fill();
    } else if (id === "skin_cloud") {
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "rgba(160,180,215,0.6)";
      ctx.lineWidth = 1;
      for (const c of [[-12, -8, 7], [-3, -13, 7], [7, -12, 6], [-16, 4, 6], [-6, 12, 6], [6, 12, 5]]) {
        ctx.beginPath();
        ctx.arc(c[0], c[1], c[2], 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else if (id === "skin_phoenix") {
      // flame tail feathers + crest
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i === 1 ? "#ffd43b" : "#ff6b1a";
        ctx.beginPath(); ctx.moveTo(-12, -2 + i * 4); ctx.quadraticCurveTo(-26, -8 + i * 8 + Math.sin(frame * 0.3 + i) * 2, -34, -6 + i * 7); ctx.quadraticCurveTo(-24, 0 + i * 4, -12, 4 + i * 3); ctx.fill();
      }
      ctx.fillStyle = "#ff922b";
      ctx.beginPath(); ctx.moveTo(-2, -12); ctx.quadraticCurveTo(-4, -24, 4, -26); ctx.quadraticCurveTo(2, -18, 6, -13); ctx.fill();
    } else if (id === "skin_galaxy") {
      ctx.fillStyle = "rgba(180,140,255,0.25)";
      ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill();
    } else if (id === "skin_bee") {
      ctx.fillStyle = "rgba(220,240,255,0.8)";
      ctx.strokeStyle = "rgba(120,140,170,0.6)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(-4, -14, 7, 4.5, -0.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(3, -15, 6, 4, -0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (id === "skin_robo") {
      ctx.strokeStyle = "#6b778c";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -12); ctx.lineTo(-3, -24);
      ctx.stroke();
      ctx.fillStyle = (frame % 60) < 30 ? "#ff4040" : "#ffb0b0";
      ctx.beginPath();
      ctx.arc(-3, -25, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const SD_SHIFT = {};
  function drawSkinFront(id, pal, sp) { ctx.save(); if (SD_SHIFT[id]) ctx.translate(0, SD_SHIFT[id]); drawSkinFrontRaw(id, pal, sp); ctx.restore(); }
  function drawSkinFrontRaw(id, pal, sp) {
    if (id === "skin_pigeon") {
      ctx.strokeStyle = cachedGrad("pigeonNeck", function () {
        const g = ctx.createLinearGradient(0, -10, 6, 10);
        g.addColorStop(0, "#5fd38a"); g.addColorStop(0.5, "#8a5fd3"); g.addColorStop(1, "#5fd38a");
        return g;
      });
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(9, -1, 10, Math.PI * 0.62, Math.PI * 1.12);
      ctx.stroke();
      ctx.strokeStyle = "#ff8a3a";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(sp === "owl" ? 5.5 : 8, -4, sp === "owl" ? 5.4 : 6.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#f4f4f8";
      ctx.beginPath();
      ctx.ellipse(15.5, -1.8, 2.6, 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(40,44,60,0.55)";
      ctx.fillRect(-8, 2, 9, 2);
      ctx.fillRect(-7, 6, 9, 2);
    } else if (id === "skin_duck") {
      ctx.fillStyle = "#ff8a1a";
      ctx.beginPath();
      ctx.ellipse(20, 2.5, 9, 4.2, 0.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(150,60,0,0.55)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(13, 2.8); ctx.lineTo(28, 2.8);
      ctx.stroke();
      ctx.strokeStyle = pal.body2;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-2, -13); ctx.quadraticCurveTo(-4, -20, 1, -21);
      ctx.moveTo(1, -13); ctx.quadraticCurveTo(1, -19, 5, -19);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.beginPath();
      ctx.ellipse(-6, -7, 4, 2.5, -0.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (id === "skin_dragon") {
      ctx.fillStyle = "#fff1c8";
      ctx.strokeStyle = "rgba(120,90,40,0.6)";
      ctx.lineWidth = 1;
      for (const hx of [0, 7]) {
        ctx.beginPath();
        ctx.moveTo(hx - 2, -11); ctx.quadraticCurveTo(hx - 4, -19, hx - 9, -21); ctx.quadraticCurveTo(hx - 3, -17, hx + 3, -12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(255,226,150,0.85)";
      for (let i = 0; i < 3; i++) ctx.fillRect(-2 + i * 4, 7, 3, 2);
      if ((frame % 150) < 36) {
        const t = (frame % 150) / 36;
        ctx.fillStyle = "rgba(200,200,210," + (0.6 * (1 - t)).toFixed(2) + ")";
        ctx.beginPath();
        ctx.arc(26 + t * 10, -2 - t * 6, 2.5 + t * 3, 0, Math.PI * 2);
        ctx.arc(31 + t * 12, -6 - t * 8, 1.8 + t * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (id === "skin_robo") {
      ctx.fillStyle = "rgba(40,220,255,0.28)";
      ctx.strokeStyle = "rgba(40,220,255,0.95)";
      ctx.lineWidth = 1.4;
      roundRect(2, -9.5, 14, 10, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#4b5870";
      for (const r of [[-9, -3], [-9, 4], [-4, 9], [-13, 0]]) {
        ctx.beginPath();
        ctx.arc(r[0], r[1], 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (id === "skin_penguin") {
      ctx.save(); sdBodyClipPath(); ctx.clip();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.ellipse(4, 6.5, 10.5, 8.5, 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = "#ff922b";
      ctx.beginPath(); ctx.moveTo(-3, 13); ctx.lineTo(1, 19); ctx.lineTo(5, 13); ctx.closePath(); ctx.fill();
    } else if (id === "skin_bee") {
      ctx.save(); sdBodyClipPath(); ctx.clip();
      ctx.fillStyle = "#212529";
      ctx.fillRect(-10, -12, 4, 26); ctx.fillRect(-3, -12, 4, 26);
      ctx.restore();
      ctx.strokeStyle = "#212529"; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(8, -10); ctx.quadraticCurveTo(10, -18, 15, -19); ctx.moveTo(4, -11); ctx.quadraticCurveTo(4, -19, 8, -21); ctx.stroke();
      ctx.fillStyle = "#212529"; ctx.beginPath(); ctx.arc(15, -19, 1.6, 0, Math.PI * 2); ctx.arc(8, -21, 1.6, 0, Math.PI * 2); ctx.fill();
    } else if (id === "skin_galaxy") {
      for (let i = 0; i < 7; i++) {
        ctx.fillStyle = (frame + i * 9) % 40 < 20 ? "#ffffff" : "#d0bfff";
        ctx.fillRect(-10 + hash01(i * 4.1) * 18, -9 + hash01(i * 2.7) * 16, 1.8, 1.8);
      }
    } else if (id === "skin_toucan") {
      ctx.fillStyle = "#ff922b";
      ctx.beginPath(); ctx.moveTo(12, -6); ctx.quadraticCurveTo(30, -8, 32, 2); ctx.quadraticCurveTo(24, 4, 12, 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ffd43b"; ctx.beginPath(); ctx.moveTo(12, -6); ctx.quadraticCurveTo(20, -7, 22, -2); ctx.lineTo(12, -1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#212529"; ctx.beginPath(); ctx.arc(31, 0, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff9db"; ctx.beginPath(); ctx.ellipse(10, 5, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
    } else if (id === "skin_cloud") {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.arc(-1, -14, 5, 0, Math.PI * 2);
      ctx.arc(5, -15, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // v1.13-candidate: visual-only bird size. The hit circle (bird.r = 16 * birdScale, minus 2), physics and gaps are NOT affected.
  const BIRD_VISUAL_SCALE = 0.65;
  // v1.19 size helper: measure the drawn bird (solid pixels only, the soft glow is ignored) and shrink any stage whose
  // footprint is more than 5% wider or taller than the starter bird. Measured once per look and cached.
  const EVO_FIT_MAX = 1.05, evoFitMemo = {};
  let evoFitBusy = false, evoFitLast = 1;
  function evoMeasure(pal) {
    const N = 200, c = document.createElement("canvas"); c.width = N; c.height = N;
    const x = c.getContext("2d"), prev = ctx; ctx = x; evoFitBusy = true;
    try { x.translate(N / 2, N / 2); drawBirdFigureRaw(pal, 0); } finally { ctx = prev; evoFitBusy = false; }
    const d = x.getImageData(0, 0, N, N).data; let x0 = N, x1 = -1, y0 = N, y1 = -1;
    for (let yy = 0; yy < N; yy++) for (let xx = 0; xx < N; xx++) if (d[(yy * N + xx) * 4 + 3] > 150) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
    return x1 < 0 ? [1, 1] : [x1 - x0 + 1, y1 - y0 + 1];
  }
  function evoFit(pal) {
    const key = (pal.species || "sparrow") + "|" + (pal.birdId || "") + "|" + scStep(pal.evo);
    let k = evoFitMemo[key];
    if (k !== undefined) return k;
    try {
      const base = evoMeasure(Object.assign({}, pal, { evo: Object.assign({}, pal.evo || {}, { tier: 0 }) })), cur = evoMeasure(pal);
      const sx = base[0] / Math.max(1, cur[0]), sy = base[1] / Math.max(1, cur[1]);
      k = Math.min(1, EVO_FIT_MAX * Math.min(sx, sy));
      if (!(k > 0)) k = 1;
      k = Math.max(0.48, k);
    } catch (_) { k = 1; }
    evoFitMemo[key] = k; return k;
  }
  function drawBirdFigure(pal, wingAngle) {
    ctx.save();
    const fk = evoFitBusy ? 1 : evoFit(pal); evoFitLast = fk;
    ctx.scale(BIRD_VISUAL_SCALE * fk, BIRD_VISUAL_SCALE * fk);
    drawBirdFigureRaw(pal, wingAngle);
    ctx.restore();
  }
  // v1.16-candidate: "Style C+" birds: the original simple round 1.10 look (round colourful body, big wing, fan tail)
  // with a SLIGHT upgrade: soft body shading, a thin cartoon outline, a glossy eye with highlights and a soft top highlight.
  // Shape-based evolution from 1.15 is kept (bigger wings + finger feathers, more tail feathers, growing soft crest);
  // skins / species only recolour whatever form the bird has reached. Everything is visual only:
  // the hit circle (bird.r), physics, gaps and BIRD_VISUAL_SCALE are NOT touched. Original drawing code, nose at +x.
  // Owl: round head, tiny rounded tufts only. Eagle: friendly round eye, no brow. No spiky phoenix shapes.
  const SC_LINE = "#0e1230";
  // per species: tail kind + extra length beyond the body, eye (x, y, radius), beak (kind, length, height), wing (length, half-width)
  const SC_GEO = {
    sparrow:     { tail: ["fan", 10],  eye: [8.5, -4.4, 5.4], beak: ["cone", 9, 7],   wing: [15, 7.4] },
    swallow:     { tail: ["fork", 19], eye: [9.5, -3.6, 5],   beak: ["cone", 7, 5.6], wing: [20, 6.4] },
    owl:         { tail: ["fan", 6],   eye: [5.2, -3.6, 5.4], beak: ["owl", 5, 6],    wing: [14, 8] },
    hummingbird: { tail: ["fan", 9],   eye: [8, -4.2, 4.8],   beak: ["needle", 19, 2.4], wing: [17, 5.6] },
    parrot:      { tail: ["long", 24], eye: [8.8, -4.4, 5.6], beak: ["hook", 11, 10], wing: [16, 7.4] },
    eagle:       { tail: ["fan", 11],  eye: [9, -4.4, 5.6],   beak: ["hook", 11, 9.5], wing: [19, 8.4] },
  };
  // Evolution shape per form (tier 0..9; prestige keeps the full form): wing length, wing width, tail length, crest feathers.
  // v1.17: 20 level-based stages. Per stage: wing length, wing width, tail length, crest plumes (0..7), body size (visual only).
  const SC_FORM = [];
  // v1.21: every stage, including the starter, keeps a swept-back crest and feathered wings.
  // Body scale stays 1. Later stages add feathers only. The hit circle is unchanged.
  for (let i = 0; i < 40; i++) {
    const crest = Math.min(5, 3 + Math.floor(i / 8));
    const grow = 1 + 0.002 * Math.min(i, 12);
    SC_FORM.push([grow, grow, 1 + 0.0012 * Math.min(i, 12), crest, 1]);
  }
  // Swept-back crest tips (negative x streams behind the head, slight lift). Not an upright mohawk.
  const SC_CREST = [
    null,
    [[-30, -2]],
    [[-32, -4], [-22, 3]],
    [[-34, -5], [-24, 0], [-16, 5]],
    [[-36, -6], [-26, -1], [-18, 4], [-12, 8]],
    [[-38, -6], [-28, -2], [-20, 2], [-14, 6], [-8, 9]],
  ];
  // v1.17 power tail: coloured feather tips for every skill branch the player owns (set by game.js from the skill tree)
  let tailPow = [], tailPowKey = "";
  function setTailPower(list) { tailPow = list || []; tailPowKey = tailPow.map(function (t) { return t.rgb + ":" + Math.round(t.k * 10); }).join(","); }
  function getTailPowKey() { return tailPowKey; }
  function scStep(evo) { return Math.max(0, Math.min(39, (evo && evo.tier) | 0)); }
  function scHex(c) {
    if (!c) return "#888888";
    if (c[0] === "#") return c.length === 4 ? "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3] : c.slice(0, 7);
    const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(c);
    if (!m) return "#888888";
    return "#" + ((1 << 24) + (+m[1] << 16) + (+m[2] << 8) + +m[3]).toString(16).slice(1);
  }
  function scRgb(h) { h = scHex(h); return parseInt(h.slice(1, 3), 16) + "," + parseInt(h.slice(3, 5), 16) + "," + parseInt(h.slice(5, 7), 16); }
  function scAlpha(c) { const m = /rgba\([^)]*,\s*([\d.]+)\s*\)/.exec(c || ""); return m ? parseFloat(m[1]) : 1; }
  function scLum(h) { h = scHex(h); return (0.299 * parseInt(h.slice(1, 3), 16) + 0.587 * parseInt(h.slice(3, 5), 16) + 0.114 * parseInt(h.slice(5, 7), 16)) / 255; }
  function scYellowish(h) { h = scHex(h); const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16); return r > 200 && g > 150 && b < 150; }
  // path helpers that APPEND to the current path (so one stroke() draws a whole silhouette without double-painting overlaps)
  function scEllP(x, y, rx, ry, rot) { rot = rot || 0; ctx.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot)); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); }
  function scEll(x, y, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2); }
  /** Rounded feather from (x0,y0) to (tx,ty): an ellipse laid along the line. */
  function scFeatherP(f) { const dx = f.tx - f.x0, dy = f.ty - f.y0; scEllP(f.x0 + dx / 2, f.y0 + dy / 2, Math.hypot(dx, dy) / 2 + 1.4, f.hw, Math.atan2(dy, dx)); }
  const SC_G = {};
  function scGeo(sp, st) {
    st = st | 0;
    const gk = sp + st;
    let g = SC_G[gk];
    if (g) return g;
    const s = SC_GEO[sp] || SC_GEO.sparrow;
    const dims = SPECIES_DIMS[sp] || SPECIES_DIMS.sparrow;
    const f = SC_FORM[st] || SC_FORM[0];
    const BW = dims[0], BH = dims[1];
    g = { sp: sp, st: st, bw: BW, bh: BH, eye: s.eye, beak: s.beak, wing: [s.wing[0] * f[0], s.wing[1] * f[1]], tips: Math.min(5, Math.floor((st + 1) / 4)), crestN: f[3], size: f[4] };
    const kind = s.tail[0], L = s.tail[1] * f[2], out = [];
    const xr = -BW + 3;
    const mk = function (tx, ty, hw, y0) { out.push({ x0: xr, y0: y0 == null ? 2 : y0, tx: tx, ty: ty, hw: hw }); };
    // v1.17: the tail grows a pair of feathers every 3 stages, then long streamers
    const pairs = Math.min(6, Math.floor(st / 3));
    for (let k = 0; k < pairs; k++) { const sp2 = 3.6 + k * 2.6, tx2 = xr - L - 2 - (k % 2) * 5 - k; mk(tx2, -sp2 - 5, 2.8, -1); mk(tx2, sp2 + 9, 2.8, 5); }
    if (st >= 8) { mk(xr - L - 12, 0, 2.6); mk(xr - L - 12, 8, 2.6); }
    if (st >= 14) { mk(xr - L - 20, -3, 2.4); mk(xr - L - 20, 11, 2.4); }
    if (kind === "fan") { mk(xr - L - 4, -5, 4.2); mk(xr - L - 6, 2, 4.4); mk(xr - L - 4, 9, 4.2); }
    else if (kind === "fork") { mk(xr - L - 4, -8, 3.2); mk(xr - L - 4, 13, 3.2); mk(xr - L + 3, 2, 3.4); }
    else if (kind === "long") { mk(xr - L - 4, -3, 3.6); mk(xr - L - 6, 4, 3.8); mk(xr - L - 3, 11, 3.5); }
    g.tails = out;
    g.tailSorted = out.slice().sort(function (a, b) { return a.ty - b.ty; });
    // crest: tiny rounded plumes on top of the head (Owl: little round bumps, never ear-like tufts)
    const cr = [];
    const n = g.crestN, rx = g.eye[0] - 3, topY = -BH * Math.sqrt(Math.max(0.2, 1 - (rx * rx) / (BW * BW))) + 1.5;
    if (n > 0 && sp === "owl") {
      const xs = n === 1 ? [0] : n === 2 ? [-4, 3] : n === 3 ? [-6, -1, 4] : n === 4 ? [-7, -3, 1, 5] : [-8, -4.5, -1, 2.5, 6];
      for (let i = 0; i < n; i++) cr.push({ bump: true, x: 9 + xs[i], y: -BH + 1.4 - (n > 2 ? (1 - Math.abs(i - (n - 1) / 2) / ((n - 1) / 2)) * 1.4 : 0) + 1.6, r: 2.9 });
    } else if (n > 0) {
      const tips = SC_CREST[n], bx0 = rx + 1, by0 = topY + 2;
      for (let i = 0; i < n; i++) cr.push({ x0: bx0 + (i - (n - 1) / 2) * 1.6, y0: by0 + 1, tx: bx0 + tips[i][0], ty: by0 + tips[i][1], hw: 3.5 });
    }
    if (n === 0 && sp === "owl") { cr.push({ bump: true, x: 1.5, y: -BH + 1.8, r: 2.6 }); cr.push({ bump: true, x: 13, y: -BH + 3.6, r: 2.4 }); }
    g.crest = cr;
    SC_G[gk] = g;
    return g;
  }
  function scCrestP(c) { if (c.bump) { ctx.moveTo(c.x + c.r, c.y); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); } else scFeatherP(c); }
  function scWingP(g, wingAngle, tipsOnly) {
    const L2 = g.wing[0], W = g.wing[1] * 0.9;
    ctx.save(); ctx.translate(3, 3); ctx.rotate(Math.PI + 0.2 + wingAngle * 0.9);
    if (tipsOnly) {
      // finger feathers trailing off the wing's rear edge (evolved forms)
      for (let i = 0; i < g.tips; i++) {
        const y = (i - (g.tips - 1) / 2) * W * 0.66;
        const cx = L2 * 0.98 + 1.6 + i * 0.4;
        ctx.moveTo(cx + 5.4, y * 1.08); ctx.ellipse(cx, y * 1.08, 5.4, 2.7, 0, 0, Math.PI * 2);
      }
    } else { ctx.moveTo(L2, 0); ctx.ellipse(L2 / 2, 0, L2 / 2, W, 0, 0, Math.PI * 2); }
    ctx.restore();
  }
  function scBeakP(g) {
    const kind = g.beak[0], len = g.beak[1], h = g.beak[2];
    const bx = g.bw - 4.5, by = g.eye[1] + 5.4;
    if (kind === "cone") {
      ctx.moveTo(bx, by - h / 2); ctx.quadraticCurveTo(bx + len * 0.75, by - h * 0.42, bx + len, by + 0.6);
      ctx.quadraticCurveTo(bx + len * 0.72, by + h * 0.48, bx, by + h / 2); ctx.closePath();
    } else if (kind === "hook") {
      ctx.moveTo(bx, by - h / 2); ctx.quadraticCurveTo(bx + len * 0.95, by - h / 2 - 1.2, bx + len, by + h * 0.34);
      ctx.quadraticCurveTo(bx + len * 0.62, by + h * 0.12, bx + len * 0.44, by + h * 0.5); ctx.lineTo(bx, by + h / 2); ctx.closePath();
    } else if (kind === "owl") {
      const ox = g.eye[0] + 4.3, oy = g.eye[1] + 3.2;
      ctx.moveTo(ox - 3, oy); ctx.quadraticCurveTo(ox, oy - 1.4, ox + 3, oy); ctx.quadraticCurveTo(ox + 1.6, oy + h * 0.85, ox, oy + h); ctx.quadraticCurveTo(ox - 1.6, oy + h * 0.85, ox - 3, oy); ctx.closePath();
    }
  }
  let sdCur = null; // current body geometry (skin clip helpers)
  function sdBodyClipPath() { const g = sdCur || scGeo("sparrow"); scEll(0, 0, g.bw, g.bh); }

  const SC_MEMO = {};
  /** Colours for a palette: species / skin colours straight from the palette (radial body shading), plus derived shading colours. */
  function scColors(pal, sp) {
    const key = sp + "|" + pal.body0 + pal.body1 + pal.body2 + pal.wing + pal.wingDark + pal.belly + pal.beak + pal.cheek;
    let c = SC_MEMO[key];
    if (c) return c;
    const main = scHex(pal.body1), wing = scHex(pal.wing), wd = scHex(pal.wingDark);
    const bodyLum = scLum(main) * 0.6 + scLum(scHex(pal.body2)) * 0.4;
    const wingLum = scLum(wing);
    c = {
      line: mixHex(scHex(pal.body2), SC_LINE, 0.62),
      wingLine: mixHex(wd, SC_LINE, 0.3),
      wingLight: sp === "sparrow" ? mixHex(wing, "#ffb23a", 0.55) : mixHex(wing, "#ffffff", 0.38),
      tail: sp === "eagle" ? "#fffaf0" : sp === "sparrow" ? "#e8442a" : mixHex(wing, scHex(pal.body2), 0.28),
      tailLine: sp === "eagle" ? mixHex("#fffaf0", "#5a6a92", 0.7) : sp === "sparrow" ? "#6e1210" : mixHex(wd, SC_LINE, 0.5),
      beak: scYellowish(main) ? beakCol(pal) : scHex(pal.beak),
      // dark birds (night / dragon / robo ...) get a light rim so they read on the dark worlds
      dark: Math.min(bodyLum, (bodyLum + wingLum) / 2) < 0.34 ? 1 : (bodyLum < 0.46 ? 0.45 : 0),
      cheekOk: scAlpha(pal.cheek) >= 0.3,
    };
    c.headCol = sp === "eagle" ? "#fffaf0" : null;
    SC_MEMO[key] = c;
    return c;
  }
  function scBodyGrad(pal) {
    return cachedGrad("scb|" + pal.body0 + pal.body1 + pal.body2, function () {
      const g = ctx.createRadialGradient(-5, -6, 2, 0, 0, 24);
      g.addColorStop(0, pal.body0); g.addColorStop(0.52, pal.body1); g.addColorStop(1, pal.body2);
      return g;
    });
  }
  function scSoft(x, y, rx, ry, rot, a) {
    // soft white highlight blob (radial falloff in unit space)
    const g = cachedGrad("scSoft", function () { const r = ctx.createRadialGradient(0, 0, 0, 0, 0, 1); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.55, "rgba(255,255,255,0.45)"); r.addColorStop(1, "rgba(255,255,255,0)"); return r; });
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.scale(rx, ry); ctx.globalAlpha *= a; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  function scEye(ex, ey, R, owl, pal, birdId, evo) {
    // glossy eye: white with a soft edge shade, big dark pupil, a glossy highlight pair, thin outline
    const eg = cachedGrad("scEyeW", function () { const g = ctx.createRadialGradient(-0.2, -0.3, 0.1, 0, 0, 1); g.addColorStop(0, "#ffffff"); g.addColorStop(0.72, "#fbfdff"); g.addColorStop(1, "#d4def0"); return g; });
    ctx.save(); ctx.translate(ex, ey); ctx.scale(R, R);
    ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "rgba(20,28,70,0.55)"; ctx.lineWidth = 1; scEll(ex, ey, R, R); ctx.stroke();
    if (owl) {
      const ig = cachedGrad("scOwlIris", function () { const g = ctx.createRadialGradient(0, -0.35, 0.1, 0, 0, 1); g.addColorStop(0, "#ffd45a"); g.addColorStop(0.7, "#ffa21a"); g.addColorStop(1, "#d97a0a"); return g; });
      ctx.save(); ctx.translate(ex + 0.5, ey + 0.2); ctx.scale(R * 0.74, R * 0.74); ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.fillStyle = "#14182f"; scEll(ex + 0.7, ey + 0.3, R * 0.4, R * 0.42); ctx.fill();
    } else {
      const night = birdId === "bird_night" || (evo && evo.accent === "eclipse");
      const pg = cachedGrad("scPupil" + (night ? "n" : ""), function () { const g = ctx.createRadialGradient(0, -0.25, 0.1, 0, 0, 1); g.addColorStop(0, night ? "#3a4a8a" : "#2b3566"); g.addColorStop(0.55, "#161c3e"); g.addColorStop(1, "#0b0e24"); return g; });
      ctx.save(); ctx.translate(ex + 1.0, ey + 0.4); ctx.scale(R * 0.66, R * 0.68); ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    ctx.fillStyle = "rgba(255,255,255,0.96)"; scEll(ex + R * 0.38, ey - R * 0.34, R * 0.27, R * 0.27); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.65)"; scEll(ex + R * 0.1, ey + R * 0.42, R * 0.13, R * 0.13); ctx.fill();
  }

  /** Draws the bird at the current transform (0,0 = body centre, facing right). Style C+ (round, softly shaded). */
  // v1.17 stages 21-40: cartoon "war machine" parts drawn ON the same phoenix (toy machinery only: clockwork gears, rotors, an Air Force ace with a
  // striped toy popper, heavy treads). Visual only: no hit-circle change; ~30 cheap path ops, drawn live (tier > 0 is never baked).
  function scGear(x, y, rad, n, rot, fill) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, rr = i % 2 ? rad * 0.8 : rad * 1.12, c = Math.cos(a) * rr, d = Math.sin(a) * rr; if (i) ctx.lineTo(x + c, y + d); else ctx.moveTo(x + c, y + d); }
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 0.9; ctx.strokeStyle = SC_LINE; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, rad * 0.32, 0, Math.PI * 2); ctx.fillStyle = "#5a3a10"; ctx.fill();
  }
  function scStar(x, y, rad, fill) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? rad * 0.45 : rad; if (i) ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  }
  function scStripeTube(x, y, len, h, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, -h / 2, len, h);
    ctx.fillStyle = "#e23a4a"; for (let i = 0; i < len; i += 5) ctx.fillRect(i + 1.2, -h / 2, 2.6, h);
    ctx.lineWidth = 1; ctx.strokeStyle = SC_LINE; ctx.strokeRect(0, -h / 2, len, h);
    ctx.beginPath(); ctx.arc(len + 1, 0, h * 0.62, 0, Math.PI * 2); ctx.fillStyle = "#ff5fa2"; ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function scMachine(st, g, wa) {
    const k = st - 19;
    if (k < 1) return;
    const BW = g.bw, BH = g.bh, T = frame, BR = "#e0a93c", STL = "#b9c4d6", STD = "#55627a", RD = "#d62839";
    ctx.save(); ctx.lineJoin = "round"; ctx.lineCap = "round";
    // clockwork (stages 21+): brass rivets on the wing, a gear at the wing root
    const nr = Math.min(5, k + 1);
    for (let i = 0; i < nr; i++) { const x = g.wing[0] * (0.3 + 0.13 * i), y = -g.wing[1] * 0.5 + (i % 2) * 2.6; ctx.fillStyle = BR; ctx.beginPath(); ctx.arc(x, y, 1.45, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.fillRect(x - 0.6, y - 0.7, 0.8, 0.8); }
    ctx.strokeStyle = BR; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.ellipse(0, 0, BW * 0.93, BH * 0.93, 0, 0.25 * Math.PI, 0.78 * Math.PI); ctx.stroke(); ctx.fillStyle = "#fff3c4"; ctx.beginPath(); ctx.arc(-BW * 0.25, BH * 0.86, 0.9, 0, Math.PI * 2); ctx.arc(BW * 0.25, BH * 0.86, 0.9, 0, Math.PI * 2); ctx.fill();
    if (k >= 2) scGear(-2.4, 5.6, Math.min(6.2, 3.6 + 0.4 * k), 8, T * 0.05, BR);
    if (k >= 2 && k <= 5) {   // wind-up key on the back
      const sx = -BW * 0.25, sy = -BH + 1, w = Math.abs(Math.cos(T * 0.07)) * (2.4 + k * 0.7) + 1;
      ctx.strokeStyle = STD; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - 6); ctx.stroke();
      ctx.fillStyle = BR; ctx.strokeStyle = SC_LINE; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.ellipse(sx - w * 0.7, sy - 7, w, 2.8, 0, 0, Math.PI * 2); ctx.ellipse(sx + w * 0.7, sy - 7, w, 2.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    if (k >= 4 && k <= 10) {  // little smokestack with toy puffs
      const sx = -BW * 0.62, sy = -BH * 0.78;
      ctx.fillStyle = STL; ctx.fillRect(sx - 2, sy - 5, 4, 6); ctx.strokeStyle = SC_LINE; ctx.lineWidth = 0.9; ctx.strokeRect(sx - 2, sy - 5, 4, 6);
      ctx.fillStyle = RD; ctx.fillRect(sx - 2, sy - 5, 4, 1.8);
      ctx.fillStyle = "rgba(255,255,255,0.72)"; for (let i = 0; i < 2; i++) { const u = ((T * 0.03 + i * 0.5) % 1); ctx.beginPath(); ctx.arc(sx - 1 - u * 5, sy - 7 - u * 9, 1.8 + u * 2.4, 0, Math.PI * 2); ctx.globalAlpha = 0.8 * (1 - u); ctx.fill(); ctx.globalAlpha = 1; }
    }
    if (k >= 5 && k <= 10) { ctx.fillStyle = BR; ctx.strokeStyle = SC_LINE; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.ellipse(-BW - 5, 0, 2.6, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    // helicopter rotors (stages 26-30)
    if (k >= 6 && k <= 10) {
      const Lr = 13 + 2.6 * (k - 6), a = T * 0.9, cx = Math.cos(a) * Lr;
      ctx.strokeStyle = STD; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -BH + 1); ctx.lineTo(0, -BH - 6); ctx.stroke();
      ctx.fillStyle = "rgba(255,240,200,0.2)"; ctx.beginPath(); ctx.ellipse(0, -BH - 7, Lr, 2.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = STL; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(-cx, -BH - 7); ctx.lineTo(cx, -BH - 7); ctx.stroke();
      ctx.fillStyle = RD; ctx.beginPath(); ctx.arc(cx, -BH - 7, 1.7, 0, Math.PI * 2); ctx.arc(-cx, -BH - 7, 1.7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = BR; ctx.beginPath(); ctx.arc(0, -BH - 7, 2.2, 0, Math.PI * 2); ctx.fill();
      if (k >= 8) { const ty = Math.cos(T * 1.1) * 5, hx = -BW - 14;
        ctx.strokeStyle = STD; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-BW + 3, -1); ctx.lineTo(hx, -3); ctx.stroke();
        ctx.strokeStyle = STL; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hx, -3 - ty); ctx.lineTo(hx, -3 + ty); ctx.stroke(); ctx.fillStyle = BR; ctx.beginPath(); ctx.arc(hx, -3, 1.6, 0, Math.PI * 2); ctx.fill(); }
      if (k >= 9) { const L2 = Lr * 0.68, c2 = Math.cos(a + 1.3) * L2, mx = -BW * 0.6;
        ctx.strokeStyle = STD; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(mx, -BH * 0.75); ctx.lineTo(mx, -BH - 3); ctx.stroke();
        ctx.fillStyle = "rgba(255,240,200,0.18)"; ctx.beginPath(); ctx.ellipse(mx, -BH - 4, L2, 2.2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = STL; ctx.lineWidth = 2.1; ctx.beginPath(); ctx.moveTo(mx - c2, -BH - 4); ctx.lineTo(mx + c2, -BH - 4); ctx.stroke(); }
      if (k >= 10) { ctx.strokeStyle = STD; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(-BW * 0.75, BH + 6); ctx.lineTo(BW * 0.8, BH + 6); ctx.moveTo(-BW * 0.4, BH * 0.7); ctx.lineTo(-BW * 0.45, BH + 6); ctx.moveTo(BW * 0.4, BH * 0.7); ctx.lineTo(BW * 0.45, BH + 6); ctx.stroke(); }
    }
    // Air Force ace (stages 31-35 and on): goggles, jet nozzle with a bright flame, tail fin, star badge, striped toy popper
    if (k >= 11) {
      const ex = g.eye[0], ey = g.eye[1], R = g.eye[2];
      ctx.strokeStyle = "#3a2a20"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ex - R - 1, ey); ctx.lineTo(-BW * 0.6, ey + 1); ctx.stroke();
      ctx.fillStyle = "rgba(150,220,255,0.32)"; ctx.beginPath(); ctx.arc(ex, ey, R + 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = BR; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ex, ey, R + 1.6, 0, Math.PI * 2); ctx.stroke();
      const fl = 6 + (k - 11) * 0.6 + Math.sin(T * 0.6) * 1.6;
      ctx.beginPath(); ctx.moveTo(-BW - 2, -3.4); ctx.lineTo(-BW - 9, -2.6); ctx.lineTo(-BW - 9, 2.6); ctx.lineTo(-BW - 2, 3.4); ctx.closePath(); ctx.fillStyle = STL; ctx.fill(); ctx.lineWidth = 0.9; ctx.strokeStyle = SC_LINE; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-BW - 9, -2.4); ctx.lineTo(-BW - 9 - fl, 0); ctx.lineTo(-BW - 9, 2.4); ctx.closePath(); ctx.fillStyle = "#ffb12a"; ctx.fill();
      ctx.beginPath(); ctx.moveTo(-BW - 9, -1.3); ctx.lineTo(-BW - 9 - fl * 0.6, 0); ctx.lineTo(-BW - 9, 1.3); ctx.closePath(); ctx.fillStyle = "#fff6c0"; ctx.fill();
      if (k >= 12) { ctx.beginPath(); ctx.moveTo(-BW - 1, -3); ctx.lineTo(-BW - 6, -17); ctx.lineTo(-BW - 13, -17); ctx.lineTo(-BW - 9, -3); ctx.closePath(); ctx.fillStyle = RD; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = SC_LINE; ctx.stroke(); }
      if (k >= 13) { const sx = -BW * 0.3, sy = -BH * 0.25; ctx.beginPath(); ctx.arc(sx, sy, 4.4, 0, Math.PI * 2); ctx.fillStyle = "#7b2fb0"; ctx.fill(); ctx.lineWidth = 0.9; ctx.strokeStyle = SC_LINE; ctx.stroke(); scStar(sx, sy, 3.2, "#ffe066"); }
      const tl = 9 + (k - 11) * 1.4;
      scStripeTube(BW * 0.25, BH * 0.62, tl, 3.6, 0.05);
      if (k >= 13) scStripeTube(BW * 0.1, BH * 0.62 + 4.6, tl - 2, 3.2, 0.05);
      if (k >= 15) { const tx = BW * 0.25 + tl + 3, ty = BH * 0.62; ctx.save(); ctx.translate(tx, ty); ctx.rotate(T * 0.1); scStar(0, 0, 2.8 + Math.sin(T * 0.3), "#fff6a0"); ctx.restore(); }
    }
    // heavy machinery (stages 36-40): armour plates, tread base, smokestack, back popper, gear crown
    if (k >= 16) {
      const n = k - 15;
      ctx.save(); scEll(0, 0, BW, BH); ctx.clip();
      for (let i = 0; i < n; i++) { const x = -BW * 0.55 + i * BW * 0.24; ctx.fillStyle = "rgba(185,196,214,0.82)"; ctx.fillRect(x, -BH, BW * 0.17, BH * 2); ctx.fillStyle = "rgba(90,104,130,0.8)"; ctx.fillRect(x, -BH, 1, BH * 2); ctx.fillStyle = BR; ctx.beginPath(); ctx.arc(x + BW * 0.085, -BH * 0.5, 1.2, 0, Math.PI * 2); ctx.arc(x + BW * 0.085, BH * 0.5, 1.2, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      const ty = BH + 2.4;
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-BW * 0.9, ty, BW * 1.75, 7, 3.4); else ctx.rect(-BW * 0.9, ty, BW * 1.75, 7);
      ctx.fillStyle = "#2f3442"; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = SC_LINE; ctx.stroke();
      ctx.fillStyle = STL; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(-BW * 0.62 + i * BW * 0.42, ty + 3.5, 2.5, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.lineDashOffset = -T * 0.5; ctx.beginPath(); ctx.moveTo(-BW * 0.8, ty + 6.2); ctx.lineTo(BW * 0.75, ty + 6.2); ctx.stroke(); ctx.setLineDash([]);
      const sx = -BW * 0.3, sy = -BH * 0.85, sh = 6 + n * 0.8;
      ctx.fillStyle = STL; ctx.fillRect(sx - 2.4, sy - sh, 4.8, sh + 2); ctx.strokeStyle = SC_LINE; ctx.lineWidth = 0.9; ctx.strokeRect(sx - 2.4, sy - sh, 4.8, sh + 2); ctx.fillStyle = RD; ctx.fillRect(sx - 2.4, sy - sh, 4.8, 2);
      for (let i = 0; i < 2; i++) { const u = ((T * 0.025 + i * 0.5) % 1); ctx.globalAlpha = 0.75 * (1 - u); ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(sx - u * 6, sy - sh - 3 - u * 10, 2 + u * 3, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
      if (k >= 18) { const bl = 11 + (k - 18) * 2.4; scStripeTube(BW * 0.15, -BH + 2, bl, 4.2, -0.5); ctx.beginPath(); ctx.arc(BW * 0.15, -BH + 2, 3.4, 0, Math.PI * 2); ctx.fillStyle = BR; ctx.fill(); ctx.lineWidth = 0.9; ctx.strokeStyle = SC_LINE; ctx.stroke(); }
      if (k >= 20) { scGear(BW * 0.55, -BH - 4, 3.4, 6, T * 0.06, BR); scGear(BW * 0.55 + 6.2, -BH - 6.6, 2.5, 6, -T * 0.08, BR); scGear(BW * 0.55 - 6, -BH - 6.2, 2.5, 6, -T * 0.08, BR); scStar(BW * 0.1, 3, 3.6, "#ffe066"); }
    }
    ctx.restore();
  }
  /** Detailed flight feathers. Same shoulder pivot as the old wing, so flap timing is unchanged. */
  function drawFeatheredWing(pal, g, wingAngle, warm, C) {
    ctx.save();
    ctx.translate(3, 3);
    ctx.rotate(Math.PI + 0.2 + wingAngle * 0.9);
    const L = g.wing[0];
    const ol = C.wingLine;
    const gold = mixHex(scHex(pal.wing), "#ffe08a", warm ? 0.15 : 0.35);
    const feathers = [
      [2, 1.2, L * 1.05, g.wing[1] * 1.55, 3.3, warm ? "#c81e22" : pal.wingDark],
      [1, 0.2, L * 1.18, g.wing[1] * 0.45, 3.4, warm ? "#ff4a24" : pal.wing],
      [0, -1.1, L * 1.08, -g.wing[1] * 0.5, 3.2, warm ? "#ffb13a" : gold],
      [-1, -2.2, L * 0.92, -g.wing[1] * 1.5, 2.9, warm ? "#ffe08a" : mixHex(scHex(pal.wing), "#ffffff", 0.45)],
    ];
    const extra = Math.min(2, g.tips | 0);
    if (extra >= 1) feathers.push([3, 2.2, L * 0.82, g.wing[1] * 2.05, 2.4, warm ? "#9a1418" : pal.wingDark]);
    if (extra >= 2) feathers.push([-1, -3.2, L * 0.72, -g.wing[1] * 2.0, 2.3, warm ? "#fff4c4" : mixHex(scHex(pal.wing), "#ffffff", 0.55)]);
    for (let i = 0; i < feathers.length; i++) {
      const f = feathers[i];
      blade(f[0], f[1], f[4], f[2], f[3], f[5], ol, 1.15);
    }
    ctx.restore();
  }
  function drawBirdFigureRaw(pal, wingAngle) {
    const evo = pal.evo;
    const birdId = pal.birdId;
    const sp = pal.species || "sparrow";
    const st = scStep(evo);
    const g = scGeo(sp, st);
    sdCur = g;
    const C = scColors(pal, sp);
    const BW = g.bw, BH = g.bh;
    ctx.save(); if (g.size > 1.001) ctx.scale(g.size, g.size);
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath(); ctx.ellipse(2, 18, 14, 5, 0, 0, Math.PI * 2); ctx.fill();

    const WARM = sp === "sparrow" && birdId === "bird_default";   // v1.17: the one bird is a crimson / gold fire phoenix
    if (WARM) {
      // fire glow: a soft radial halo that gets hotter with every evolution stage (v1.19: fixed size)
      const A = Math.min(0.6, 0.2 + 0.02 * st), R = 26;
      const fg = ctx.createRadialGradient(-1, 0, 5, -1, 0, R);
      fg.addColorStop(0, "rgba(255,226,120," + A.toFixed(2) + ")"); fg.addColorStop(0.55, "rgba(255,140,40," + (A * 0.5).toFixed(2) + ")"); fg.addColorStop(1, "rgba(255,80,20,0)");
      ctx.fillStyle = fg; ctx.beginPath(); ctx.ellipse(-1, 0, R + 4, R * 0.86, 0, 0, Math.PI * 2); ctx.fill();
    } else if (pal.glow) {
      ctx.fillStyle = pal.glow;
      ctx.beginPath(); ctx.ellipse(0, 0, 22 + evo.prestige, 18 + evo.prestige * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (!WARM && (evo.accent === "glow" || evo.accent === "halo" || evo.accent === "phoenix" || evo.accent === "nova" || evo.prestige > 0)) {
      ctx.save();
      ctx.globalAlpha = 0.28 + evo.feel * 0.45 + evo.prestige * 0.06;
      ctx.fillStyle = pal.glow || "rgba(255,255,255,0.4)";
      ctx.beginPath(); ctx.ellipse(0, 0, 28, 23, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.lineJoin = "round"; ctx.lineCap = "round";

    // soft light rim around the whole silhouette: keeps every bird readable on dark worlds (stronger on dark birds / skins)
    {
      ctx.beginPath();
      for (let i = 0; i < g.tails.length; i++) scFeatherP(g.tails[i]);
      for (let i = 0; i < g.crest.length; i++) scCrestP(g.crest[i]);
      scEllP(0, 0, BW, BH); scBeakP(g); scWingP(g, wingAngle); if (g.tips) scWingP(g, wingAngle, true);
      if (C.dark > 0) { ctx.strokeStyle = "rgba(205,225,255," + (0.16 * C.dark).toFixed(3) + ")"; ctx.lineWidth = 7.5; ctx.stroke(); }
      ctx.strokeStyle = "rgba(225,242,255," + (0.17 + 0.5 * C.dark).toFixed(3) + ")"; ctx.lineWidth = 3.6; ctx.stroke();
    }
    if (birdId === "bird_neon") {
      ctx.save(); ctx.strokeStyle = "rgba(0,229,255,0.85)"; ctx.lineWidth = 5; ctx.beginPath();
      for (let i = 0; i < g.tails.length; i++) scFeatherP(g.tails[i]);
      scEllP(0, 0, BW, BH); scWingP(g, wingAngle); ctx.stroke(); ctx.restore();
    }

    if (SKIN_EXTRA[birdId]) drawSkinBack(birdId, pal);

    // tail feathers (rounded, with a pale spine)
    for (let i = 0; i < g.tails.length; i++) {
      const s = g.tails[i];
      let col = C.tail;
      if (sp === "parrot" && birdId === "bird_default") col = i % 3 === 0 ? scHex(pal.wing) : i % 3 === 1 ? scHex(pal.body1) : scHex(pal.wingDark);
      else if (WARM) col = i % 2 === 1 ? "#ff9e24" : "#e8442a";
      else if (i % 2 === 1 && sp !== "eagle") col = mixHex(C.tail, SC_LINE, 0.12);
      ctx.beginPath(); scFeatherP(s); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 1.3; ctx.strokeStyle = C.tailLine; ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.28)"; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(s.x0 - 3, s.y0); ctx.lineTo(s.tx + 3, s.ty); ctx.stroke();
    }
    // v1.17 power tail: each owned skill branch tints a tail feather and lights its tip (brighter and bigger with its level)
    if (tailPow.length && g.tailSorted.length) {
      const ts = g.tailSorted, n = ts.length, cnt = tailPow.length, used = {};
      for (let i = 0; i < cnt; i++) {
        const tp = tailPow[i];
        const fi = cnt === 1 ? Math.floor(n / 2) : Math.round(i * (n - 1) / (cnt - 1));
        const j = used[fi] | 0; used[fi] = j + 1;
        const s = ts[fi];
        ctx.beginPath(); scFeatherP(s); ctx.fillStyle = "rgba(" + tp.rgb + "," + (0.1 + 0.3 * tp.k).toFixed(2) + ")"; ctx.fill();
        const f = 1 - 0.3 * j, px = s.x0 + (s.tx - s.x0) * f, py = s.y0 + (s.ty - s.y0) * f;
        ctx.fillStyle = "rgba(" + tp.rgb + "," + (0.28 + 0.2 * tp.k).toFixed(2) + ")"; scEll(px, py, 4 + 3.4 * tp.k, 4 + 3.4 * tp.k); ctx.fill();
        ctx.fillStyle = "rgb(" + tp.rgb + ")"; scEll(px, py, 2.1 + 1.5 * tp.k, 2.1 + 1.5 * tp.k); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 0.9; ctx.stroke();
      }
    }
    // crest (grows with the form): soft round-tipped plumes behind the head
    for (let i = 0; i < g.crest.length; i++) {
      const c = g.crest[i];
      ctx.beginPath(); scCrestP(c);
      ctx.fillStyle = WARM ? (i % 2 ? "#ffc23a" : "#ff7a1c") : c.bump ? scHex(pal.body1) : mixHex(i % 2 ? scHex(pal.body1) : scHex(pal.wing), "#ffffff", i % 2 ? 0.22 : 0.12);
      ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = C.line; ctx.stroke();
    }

    // round body (radial shading) + thin outline
    scEll(0, 0, BW, BH); ctx.fillStyle = scBodyGrad(pal); ctx.fill();
    ctx.save(); scEll(0, 0, BW, BH); ctx.clip();
    // eagle: soft white head
    if (sp === "eagle") {
      const hg = cachedGrad("scEagleHead", function () { const r = ctx.createRadialGradient(6, -8, 1, 8, -4, 14); r.addColorStop(0, "#ffffff"); r.addColorStop(0.7, "#fffaf0"); r.addColorStop(1, "#e7dfcf"); return r; });
      ctx.fillStyle = hg; scEll(9.5, -5.5, 10, 9, 0.15); ctx.fill();
      ctx.strokeStyle = "rgba(90,100,130,0.35)"; ctx.lineWidth = 1; ctx.stroke();
    }
    // belly. The starter phoenix keeps a small gold chest so the body stays red, not a yellow bird.
    if (WARM) { ctx.fillStyle = "rgba(255,198,96,0.72)"; scEll(1.5, BH * 0.38, BW * 0.36, BH * 0.28, 0.04); ctx.fill(); }
    else if (sp !== "eagle") { ctx.fillStyle = pal.belly; scEll(2, BH * 0.4, BW * 0.62, BH * 0.52, 0.05); ctx.fill(); }
    // owl facial disc
    if (sp === "owl") { ctx.fillStyle = "rgba(255,255,255,0.8)"; scEll(9, -2.2, 11.5, 9.6, 0); ctx.fill(); ctx.strokeStyle = "rgba(110,150,205,0.4)"; ctx.lineWidth = 1; ctx.stroke(); }
    if (sp === "parrot") { ctx.fillStyle = "rgba(255,255,255,0.86)"; scEll(10, -2.8, 7, 6, 0); ctx.fill(); ctx.strokeStyle = "rgba(60,80,120,0.35)"; ctx.lineWidth = 1; ctx.stroke(); }
    if (sp === "swallow") { ctx.fillStyle = "rgba(255,140,100,0.9)"; scEll(12.5, 2.6, 5.4, 4, 0.1); ctx.fill(); }
    if (sp === "hummingbird") { ctx.fillStyle = "rgba(255,70,140,0.88)"; scEll(10.5, 5, 5.2, 3.6, 0.3); ctx.fill(); }
    // lower shade + soft top highlight
    const sg = cachedGrad("scShade" + BH, function () { const r = ctx.createLinearGradient(0, -BH * 0.2, 0, BH); r.addColorStop(0, "rgba(14,18,60,0)"); r.addColorStop(1, "rgba(14,18,60,0.26)"); return r; });
    ctx.fillStyle = sg; ctx.fillRect(-BW - 2, -BH * 0.2, BW * 2 + 4, BH * 1.3);
    scSoft(-3.5, -BH * 0.58, BW * 0.5, BH * 0.26, -0.18, 0.5);
    if (C.cheekOk && sp !== "owl" && sp !== "eagle") { ctx.fillStyle = pal.cheek; scEll(4.5, 4.6, 4, 2.4, 0); ctx.fill(); }
    ctx.restore();
    ctx.lineWidth = 1.4; ctx.strokeStyle = C.line; scEll(0, 0, BW, BH); ctx.stroke();

    // —— evolution / skin accents ——
    const hx = g.eye[0] + 1, hy = g.eye[1], topY = -BH + 2;
    const A1 = birdId === "bird_default" ? "255,140,30" : scRgb(mixHex(scHex(pal.wing), "#ffffff", 0.35));
    const A2 = birdId === "bird_default" ? "255,226,140" : scRgb(mixHex(scHex(pal.body1), "#ffffff", 0.6));
    if (evo.accent === "streaks") {
      ctx.strokeStyle = "rgba(" + A2 + ",0.92)"; ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-BW - 2, -2); ctx.quadraticCurveTo(-BW - 14, -10, -BW - 26, 0);
      ctx.moveTo(-BW - 1, 5); ctx.quadraticCurveTo(-BW - 12, 4, -BW - 24, 12);
      ctx.moveTo(-BW + 1, 10); ctx.quadraticCurveTo(-BW - 8, 14, -BW - 18, 18);
      ctx.stroke();
    }
    if (evo.accent === "electric") {
      // soft wavy spark trail (smooth curves, not jagged)
      ctx.strokeStyle = WARM ? "rgba(255,196,80,0.95)" : "rgba(180,210,255,0.95)"; ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-BW - 1, -4); ctx.bezierCurveTo(-BW - 8, -12, -BW - 11, 2, -BW - 18, -6);
      ctx.moveTo(-BW, 5); ctx.bezierCurveTo(-BW - 7, 13, -BW - 10, -1, -BW - 17, 8);
      ctx.stroke();
      ctx.fillStyle = WARM ? "rgba(255,230,140,0.95)" : "rgba(200,230,255,0.9)"; ctx.beginPath(); ctx.arc(-BW - 19, -6, 2.1, 0, Math.PI * 2); ctx.arc(-BW - 18, 8, 2.1, 0, Math.PI * 2); ctx.fill();
    }
    if (evo.accent === "phoenix") {
      // soft rounded glow-feather trails (rounded ends, no flame spikes)
      ctx.fillStyle = "rgba(" + A1 + ",0.55)"; scEll(-BW - 6, 0, 7, 3.6, -0.12); ctx.fill();
      ctx.fillStyle = "rgba(" + A2 + ",0.6)"; scEll(-BW - 5, 5, 6, 2.6, 0.22); ctx.fill();
      ctx.fillStyle = "rgba(" + A2 + ",0.5)"; scEll(-BW - 4, -5, 5, 2.4, -0.3); ctx.fill();
    }
    if (evo.accent === "aurora") {
      ctx.strokeStyle = "rgba(" + A1 + ",0.75)"; ctx.lineWidth = 3; scEll(1, 6, 13, 8.5); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.65)"; ctx.lineWidth = 2; scEll(1, 6, 10, 6.5); ctx.stroke();
      ctx.strokeStyle = "rgba(" + A1 + ",0.6)"; scEll(1, 6, 7, 4.6); ctx.stroke();
    }
    if (evo.accent === "nova") {
      ctx.fillStyle = WARM ? "#fff0b0" : "#e8ffff";
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + frame * 0.06; ctx.beginPath(); ctx.arc(2 + Math.cos(a) * 5.5, 6 + Math.sin(a) * 3.8, 2, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = WARM ? "rgba(255,214,110,0.9)" : "rgba(220,255,255,0.8)"; ctx.beginPath(); ctx.arc(2, 6, 3.4, 0, Math.PI * 2); ctx.fill();
    }
    if (sp !== "owl" && birdId === "bird_night" && st === 0) {
      // the Night skin's own soft rounded plumes on the base form (evolved forms use the growing crest above)
      const cols = [scHex(pal.wing), mixHex(scHex(pal.wing), "#ffffff", 0.3), scHex(pal.wing)];
      const tips = [[-8, -6], [-2, -8.5], [4, -7]];
      for (let i = 0; i < 3; i++) {
        const f = { x0: hx - 4 + i * 2.2, y0: topY + 3, tx: hx - 4 + i * 2.2 + tips[i][0] * 0.7, ty: topY + 3 + tips[i][1], hw: 2.8 };
        ctx.beginPath(); scFeatherP(f); ctx.fillStyle = mixHex(cols[i], "#ffffff", 0.2); ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1.2; ctx.stroke();
      }
    }
    if (birdId === "bird_royal") {
      const cy = topY + 3.5, cx = hx - 4;
      ctx.fillStyle = "#ffd700"; ctx.strokeStyle = C.line; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(cx - 6, cy); ctx.lineTo(cx - 6.5, cy - 5); ctx.quadraticCurveTo(cx - 5, cy - 6, cx - 3, cy - 3); ctx.quadraticCurveTo(cx, cy - 8.5, cx + 3, cy - 3); ctx.quadraticCurveTo(cx + 5, cy - 6, cx + 6.5, cy - 5); ctx.lineTo(cx + 6, cy); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    if (evo.accent === "eclipse") {
      ctx.strokeStyle = WARM ? "rgba(255,214,110,0.95)" : evo.prestige ? "rgba(255,255,255,0.95)" : "rgba(215,245,255,0.9)"; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(hx - 2, hy, 13.5, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
      ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(hx - 2, hy, 16.5, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
    }
    if (evo.accent === "halo") {
      const hy2 = topY + 1 - g.crestN * 0.6;
      ctx.strokeStyle = WARM ? "rgba(255,224,110,0.98)" : "rgba(255,255,255,0.95)"; ctx.lineWidth = 3; scEll(hx - 3, hy2, 12, 3.8); ctx.stroke();
      ctx.strokeStyle = WARM ? "rgba(255,150,40,0.8)" : "rgba(200,220,255,0.7)"; ctx.lineWidth = 1.5; scEll(hx - 3, hy2, 9.2, 2.4); ctx.stroke();
    }

    // Layered flight feathers. Local +x is swung behind the bird by the same shoulder rotation as before.
    drawFeatheredWing(pal, g, wingAngle, WARM, C);

    // beak
    if (g.beak[0] === "needle") {
      const bx = BW - 5, by = g.eye[1] + 6, len = g.beak[1];
      ctx.beginPath(); ctx.moveTo(bx, by - 2.2); ctx.lineTo(bx + len, by + 1.6); ctx.quadraticCurveTo(bx + len + 1.2, by + 2.2, bx + len - 0.5, by + 2.6); ctx.lineTo(bx, by + 2.4); ctx.closePath();
      ctx.fillStyle = C.beak; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = C.line; ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(bx + 1, by - 0.8); ctx.lineTo(bx + len - 3, by + 1); ctx.stroke();
    } else {
      ctx.beginPath(); scBeakP(g); ctx.fillStyle = C.beak; ctx.fill(); ctx.lineWidth = 1.3; ctx.strokeStyle = C.line; ctx.stroke();
      if (g.beak[0] === "cone") {
        // gentle two-tone: lighter top, mouth line
        ctx.save(); ctx.clip(); ctx.fillStyle = "rgba(255,255,255,0.28)"; ctx.fillRect(g.bw - 6, g.eye[1] + 1, 16, 2.6); ctx.restore();
        ctx.strokeStyle = "rgba(14,18,48,0.4)"; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(g.bw - 4, g.eye[1] + 6); ctx.lineTo(g.bw - 4 + g.beak[1] * 0.8, g.eye[1] + 6); ctx.stroke();
      } else if (g.beak[0] === "hook" && sp === "parrot") {
        ctx.fillStyle = "rgba(60,64,84,0.55)"; const bx = g.bw - 4.5, by = g.eye[1] + 5.4, len = g.beak[1], h = g.beak[2];
        ctx.beginPath(); ctx.moveTo(bx + 1, by + h * 0.12); ctx.quadraticCurveTo(bx + len * 0.5, by + h * 0.1, bx + len * 0.46, by + h * 0.46); ctx.lineTo(bx + 1, by + h / 2 - 0.4); ctx.closePath(); ctx.fill();
      } else if (g.beak[0] === "hook") {
        ctx.save(); ctx.clip(); ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.fillRect(g.bw - 6, g.eye[1] + 0.2, 18, 2.4); ctx.restore();
      }
    }
    // eyes (glossy, friendly: round, no brow)
    if (sp === "owl") { scEye(5.2, -3.4, 5.4, true, pal, birdId, evo); scEye(14, -3.4, 5, true, pal, birdId, evo); }
    else scEye(g.eye[0], g.eye[1], g.eye[2], false, pal, birdId, evo);
    if (SKIN_EXTRA[birdId]) drawSkinFront(birdId, pal, sp);

    if (WARM && st >= 20) { ctx.save(); ctx.scale(0.8, 0.8); scMachine(st, g, wingAngle); ctx.restore(); }
    if (evo.prestige > 0) {
      ctx.strokeStyle = evo.glow || "rgba(150,235,255,0.6)";
      ctx.lineWidth = 1.5 + evo.prestige * 0.4;
      ctx.beginPath(); ctx.ellipse(0, 0, 20, 17, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  // —— v1.12 sharper bird drawing helpers (local coords, nose at +x) ——
  const OL_MEMO = {};
  function outlineCol(pal) {
    const k = pal.body2;
    let v = OL_MEMO[k];
    if (!v) v = OL_MEMO[k] = mixHex(k, "#140a2a", 0.72);
    return v;
  }
  const BEAK_MEMO = {};
  function beakCol(pal) {
    const k = pal.beak;
    let v = BEAK_MEMO[k];
    if (v) return v;
    v = k;
    if (k && k[0] === "#" && k.length === 7) {
      const r = parseInt(k.slice(1, 3), 16), g = parseInt(k.slice(3, 5), 16), b = parseInt(k.slice(5, 7), 16);
      // orange / amber / yellow beaks (the Flappy Bird look) become dark slate; other colours stay
      if (r > 190 && g > 70 && g < 225 && b < 140) v = mixHex(k, "#262b3a", 0.78);
    }
    BEAK_MEMO[k] = v;
    return v;
  }
  /** Slim, pointed-head body (about 36 x 22 at scale 1). */
  function bodyPath(BW, BH) {
    const sx = BW / 17, sy = BH / 14;
    ctx.beginPath();
    ctx.moveTo(-18 * sx, 1 * sy);
    ctx.quadraticCurveTo(-10 * sx, -11 * sy, 4 * sx, -11.5 * sy);
    ctx.quadraticCurveTo(12 * sx, -11.5 * sy, 16.5 * sx, -6 * sy);
    ctx.lineTo(19.5 * sx, -1.5 * sy);
    ctx.lineTo(16 * sx, 3.2 * sy);
    ctx.quadraticCurveTo(12 * sx, 7 * sy, 7 * sx, 10.5 * sy);
    ctx.quadraticCurveTo(-3 * sx, 12.5 * sy, -18 * sx, 1 * sy);
    ctx.closePath();
  }
  function blade(x0, y0, hw, tx, ty, fill, ol, lw) {
    const mx = x0 + (tx - x0) * 0.55, my = y0 + (ty - y0) * 0.5;
    ctx.beginPath();
    ctx.moveTo(x0, y0 - hw);
    ctx.quadraticCurveTo(mx, my - hw * 1.25, tx, ty);
    ctx.quadraticCurveTo(mx, my + hw * 1.25, x0, y0 + hw);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    // layered shading: darker lower vane + light spine
    ctx.fillStyle = "rgba(20,10,40,0.24)";
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(tx, ty); ctx.lineTo(x0, y0 + hw * 0.95); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.42)"; ctx.lineWidth = 0.9; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x0 - 1, y0); ctx.lineTo(tx + (x0 - tx) * 0.12, ty + (y0 - ty) * 0.12); ctx.stroke();
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(x0, y0 - hw);
    ctx.quadraticCurveTo(mx, my - hw * 1.25, tx, ty);
    ctx.quadraticCurveTo(mx, my + hw * 1.25, x0, y0 + hw);
    ctx.closePath();
    ctx.strokeStyle = ol; ctx.lineWidth = lw; ctx.lineJoin = "miter"; ctx.miterLimit = 3; ctx.stroke();
  }
  function drawSpeciesBack(sp, pal) {
    const ol = outlineCol(pal);
    let feathers, cols;
    if (sp === "swallow") { feathers = [[-47, -13, -1, 3.4], [-31, 1, 2, 3.4], [-47, 14, 4, 3.4]]; cols = [pal.wingDark, pal.wing, pal.wingDark]; }
    else if (sp === "parrot") { feathers = [[-48, -7, 0, 4], [-52, 4, 2, 4], [-43, 12, 4, 3.6]]; cols = [pal.body1, pal.wing, pal.wingDark]; }
    else if (sp === "eagle") { feathers = [[-36, -11, -2, 4.4], [-41, 0, 1, 4.6], [-36, 11, 5, 4.4]]; cols = ["#e6e1d2", "#f4f1e8", "#e6e1d2"]; }
    else if (sp === "owl") { feathers = [[-28, -6, 0, 4.2], [-32, 3, 2, 4.2], [-27, 10, 4, 4.2]]; cols = [pal.wingDark, pal.body2, pal.wingDark]; }
    else if (sp === "hummingbird") { feathers = [[-36, -6, 1, 3], [-40, 6, 3, 3]]; cols = [pal.wingDark, pal.wing]; }
    else { feathers = [[-38, -9, -1, 4], [-44, 1, 2, 3.8], [-38, 10, 4, 4]]; cols = [pal.wingDark, pal.wing, pal.wingDark]; }
    for (let i = 0; i < feathers.length; i++) {
      const f = feathers[i];
      blade(-12, f[2], f[3], f[0], f[1], cols[i], ol, 1.5);
    }
  }
  function crestFeather(bx, by, tx, ty, fill, ol) {
    ctx.beginPath();
    ctx.moveTo(bx - 3, by + 1.5);
    ctx.quadraticCurveTo(bx - 3.5 + (tx - bx) * 0.25, by + (ty - by) * 0.62, tx, ty);
    ctx.quadraticCurveTo(bx + 2.5 + (tx - bx) * 0.3, by + (ty - by) * 0.5, bx + 3.2, by + 1.5);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = ol; ctx.lineWidth = 1.5; ctx.lineJoin = "miter"; ctx.miterLimit = 3; ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.45)"; ctx.lineWidth = 0.8; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + (tx - bx) * 0.8, by + (ty - by) * 0.8); ctx.stroke();
    ctx.lineCap = "butt";
  }
  /** One signature feature on every bird: a swept-back crest of 3 graded feathers (owls keep their ear tufts). */
  function drawSignatureCrest(sp, pal, birdId, evo) {
    const ol = outlineCol(pal);
    if (sp === "owl") {
      crestFeather(3, -10, -9, -25, pal.body2, ol);
      crestFeather(12, -10.5, 7, -27, pal.body1, ol);
      return;
    }
    if (birdId === "bird_night" || birdId === "bird_royal" || evo.accent === "crest" || evo.accent === "eclipse") return;
    const k = sp === "hummingbird" ? 0.8 : 1;
    crestFeather(4, -10, -11, -19 * k, pal.wingDark, ol);
    crestFeather(8.5, -11, -4, -24 * k, pal.body1, ol);
    crestFeather(13, -10, 5, -21 * k, pal.body0, ol);
  }
  /** Angular swept wing with three feather tips; pivots at the shoulder like the old wing (hitbox/flap timing unchanged). */
  function drawSweptWing(pal, evo, sp, WING_L, wingAngle, ol) {
    const L = WING_L * (1 + evo.feel * 0.2);
    ctx.save();
    ctx.translate(-2, 2);
    ctx.rotate(wingAngle);
    if (sp === "hummingbird") ctx.globalAlpha *= 0.8;
    const P = function (x, y) { return [x * (x < 0 ? L : 1), y]; };
    const pts = [P(8, -3), P(-6, -9), P(-24, -10), P(-17, -4.5), P(-29, -2.5), P(-19, 1.5), P(-27, 6.5), P(-12, 6.5), P(5, 5)];
    const path = function () {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) { if (i === 0) ctx.moveTo(pts[i][0], pts[i][1]); else ctx.lineTo(pts[i][0], pts[i][1]); }
      ctx.closePath();
    };
    path();
    ctx.fillStyle = pal.wing; ctx.fill();
    ctx.save(); ctx.clip();
    // trailing flight feathers (darker) with separation lines from the shoulder
    ctx.fillStyle = pal.wingDark;
    ctx.beginPath(); ctx.moveTo(8, -3); ctx.lineTo(-30 * L, 0.5); ctx.lineTo(-30 * L, 9); ctx.lineTo(5, 7); ctx.closePath(); ctx.fill();
    // soft gradient: shadowed trailing edge, lit leading edge (palette-independent gradients, cached)
    ctx.fillStyle = cachedGrad("wingShade", function () {
      const g = ctx.createLinearGradient(0, -10, 0, 8);
      g.addColorStop(0, "rgba(255,255,255,0.16)"); g.addColorStop(0.45, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(20,10,50,0.26)");
      return g;
    });
    ctx.fillRect(-34 * L, -12, 46 * L, 22);
    ctx.strokeStyle = "rgba(20,10,40,0.34)"; ctx.lineWidth = 1;
    for (let i = 3; i < 8; i += 2) { ctx.beginPath(); ctx.moveTo(1, -1); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); }
    // upper covert row: lighter band with a pointed scalloped lower edge
    ctx.fillStyle = "rgba(255,255,255,0.13)";
    ctx.beginPath(); ctx.moveTo(8, -3); ctx.lineTo(-6, -9); ctx.lineTo(-18 * L, -9.4);
    ctx.lineTo(-13 * L, -4.6); ctx.lineTo(-9 * L, -6.2); ctx.lineTo(-4 * L, -2.2); ctx.lineTo(0, -3.4); ctx.lineTo(5, 0.5); ctx.closePath(); ctx.fill();
    ctx.restore();
    // leading-edge highlight
    ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 1.1; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(pts[0][0] - 1, pts[0][1] + 0.6); ctx.lineTo(pts[1][0], pts[1][1] + 0.9); ctx.lineTo(pts[2][0] + 3, pts[2][1] + 0.9); ctx.stroke();
    ctx.lineCap = "butt";
    path();
    ctx.strokeStyle = ol; ctx.lineWidth = 2.2; ctx.lineJoin = "miter"; ctx.miterLimit = 3; ctx.stroke();
    ctx.restore();
  }

  function drawSpeciesFront(sp, pal) {
    // (drawn clipped to the body)
    if (sp === "owl") {
      ctx.fillStyle = "rgba(255,245,225,0.6)";
      ctx.beginPath(); ctx.ellipse(11, -3, 8.5, 7.5, 0, 0, Math.PI * 2); ctx.fill();
    } else if (sp === "eagle") {
      ctx.fillStyle = "#f7f5ee";
      ctx.beginPath(); ctx.ellipse(12, -4, 9, 9, 0.2, 0, Math.PI * 2); ctx.fill();
    } else if (sp === "hummingbird") {
      ctx.fillStyle = "rgba(255,40,140,0.9)";
      ctx.beginPath(); ctx.ellipse(14, 4, 5.5, 3.6, 0.5, 0, Math.PI * 2); ctx.fill();
    } else if (sp === "swallow") {
      ctx.fillStyle = "rgba(210,80,50,0.92)";
      ctx.beginPath(); ctx.ellipse(15, 2, 4.5, 3.4, 0.4, 0, Math.PI * 2); ctx.fill();
    } else if (sp === "parrot") {
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.beginPath(); ctx.ellipse(13, -1.5, 5.5, 4.8, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawSpeciesFace(sp, pal, evo, birdId) {
    const ol = outlineCol(pal);
    const bk = beakCol(pal);
    if (sp === "owl") {
      for (const ex of [6.5, 14.5]) {
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(ex, -4, 3.8, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = ol; ctx.lineWidth = 1.4; ctx.stroke();
        ctx.fillStyle = "#ffb000";
        ctx.beginPath(); ctx.arc(ex + 0.5, -4, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#111";
        ctx.beginPath(); ctx.arc(ex + 0.7, -4, 1.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(ex + 1.5, -4.9, 0.85, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex - 0.4, -3, 0.4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = ol; ctx.lineWidth = 2; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(2.5, -9.5); ctx.lineTo(10.5, -7.5); ctx.lineTo(18.5, -9.5); ctx.stroke();
      ctx.lineCap = "butt";
      ctx.fillStyle = bk; ctx.strokeStyle = ol; ctx.lineWidth = 1.6; ctx.lineJoin = "miter"; ctx.miterLimit = 3;
      ctx.beginPath(); ctx.moveTo(15, -0.5); ctx.lineTo(19.5, -0.5); ctx.lineTo(17.5, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      return;
    }
    // beak first (the eye overlaps its base)
    ctx.fillStyle = bk; ctx.strokeStyle = ol; ctx.lineWidth = 1.8; ctx.lineJoin = "miter"; ctx.miterLimit = 3;
    if (sp === "hummingbird") {
      ctx.strokeStyle = ol; ctx.lineWidth = 4; ctx.lineCap = "butt";
      ctx.beginPath(); ctx.moveTo(18, -0.5); ctx.lineTo(42, 3); ctx.stroke();
      ctx.strokeStyle = bk === "#222222" ? "#3a3a44" : bk; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(18, -0.5); ctx.lineTo(41, 3); ctx.stroke();
    } else if (sp === "parrot" || sp === "eagle") {
      ctx.beginPath();
      ctx.moveTo(17, -4.5);
      ctx.quadraticCurveTo(30, -5, 27.5, 8);
      ctx.lineTo(23, 3);
      ctx.lineTo(17, 3.8);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (sp === "swallow") {
      ctx.beginPath(); ctx.moveTo(18, -2.8); ctx.lineTo(27, 1); ctx.lineTo(18, 3.4); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(18, -3.6); ctx.lineTo(32 + (evo.accent === "nova" ? 2 : 0), 1); ctx.lineTo(17.5, 3.8); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.45)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(19, -1.6); ctx.lineTo(28, 0.4); ctx.stroke();
    }
    // smaller glossy eye with a sharp brow
    const ex = 11.5, ey = sp === "hummingbird" ? -3.6 : -4.4, er = sp === "hummingbird" ? 3.2 : 3.7;
    glossyEye(ex, ey, er, pal, birdId === "bird_night" || evo.accent === "eclipse", birdId === "bird_neon");
    ctx.strokeStyle = ol; ctx.lineWidth = sp === "eagle" ? 2.6 : 2.1; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(ex - 5, ey - 4.6); ctx.lineTo(ex + 5.2, ey - 1.9); ctx.stroke();
    ctx.lineCap = "butt";
  }
  /** Eye with gradient sclera, tinted iris, pupil, a big and a small shine and a shaded upper lid. */
  function glossyEye(ex, ey, er, pal, dark, neon, iris) {
    const ol = outlineCol(pal);
    ctx.save();
    ctx.translate(ex, ey);
    ctx.fillStyle = dark ? "#dfe8ff" : cachedGrad("eyeW", function () {
      const g = ctx.createRadialGradient(-0.8, -1, 0.4, 0, 0, 4.2);
      g.addColorStop(0, "#ffffff"); g.addColorStop(0.75, "#f4f7ff"); g.addColorStop(1, "#cdd8ea");
      return g;
    });
    ctx.beginPath(); ctx.arc(0, 0, er, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = ol; ctx.lineWidth = 1.4; ctx.stroke();
    // iris (species/skin tinted, dark) + pupil
    const ir = er * 0.66;
    ctx.fillStyle = iris || mixHex(pal.body2, "#10101a", 0.5);
    ctx.beginPath(); ctx.arc(er * 0.3, 0.1, ir, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = neon ? "#000" : "#101018";
    ctx.beginPath(); ctx.arc(er * 0.34, 0.15, ir * 0.62, 0, Math.PI * 2); ctx.fill();
    // shines
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(er * 0.6, -er * 0.34, Math.max(1.1, er * 0.3), 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha *= 0.75;
    ctx.beginPath(); ctx.arc(er * 0.05, er * 0.38, Math.max(0.45, er * 0.12), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function speciesPreviewPalette(id) {
    const sp = E.SPECIES_BY_ID[id] || E.SPECIES_BY_ID.sparrow;
    return Object.assign({}, sp.palette, { evo: evolutionMeta(evoPipes()), birdId: "bird_default", species: sp.id });
  }

  /** Static bird for menus / bird select. */
  function drawBirdPreview(x, y, scale, pal, t) {
    ctx.save();
    ctx.translate(x, y);
    const ph = (t == null ? frame : t);
    ctx.rotate(Math.sin(ph * 0.05) * 0.08);
    const hum = pal.species === "hummingbird";
    const wa = hum ? -0.4 + Math.sin(ph * 1.4) * 0.8 : -0.5 + (0.5 + Math.sin(ph * 0.2) * 0.5) * 1.1;
    if (pal.evo && pal.evo.tier <= 0 && ctx === mainCtx) {
      // baked sprite per (look, wing step); 8 wing steps over the flap range
      const q = hum ? Math.round((wa + 1.2) / 1.6 * 8) : Math.round((wa + 0.5) / 1.1 * 8);
      const wq = hum ? -1.2 + q / 8 * 1.6 : -0.5 + q / 8 * 1.1;
      const key = "bp|" + scale + "|" + pal.birdId + "|" + pal.species + "|" + pal.body0 + pal.body1 + pal.body2 + pal.wing + pal.wingDark + pal.belly + pal.beak + pal.cheek + (pal.glow || "") + "|" + getTailPowKey() + "|" + q;
      const sp = sprite(key, 112 * scale, 66 * scale, function () {
        ctx.translate(60 * scale, 34 * scale);
        ctx.scale(scale, scale);
        drawBirdFigure(pal, wq);
      });
      ctx.drawImage(sp.c, -60 * scale, -34 * scale, sp.w, sp.h);
    } else {
      ctx.scale(scale, scale);
      drawBirdFigure(pal, wa);
    }
    ctx.restore();
  }

  function drawBird() {
    ctx.save();
    const dashA = skillActive("dash");
    const dashOff = state === State.PLAY && dashA > 0 ? Math.sin((dashA / ((skillState.dash && skillState.dash.activeMax) || DASH_FRAMES)) * Math.PI) * 22 : 0;
    ctx.translate(bird.x + dashOff, bird.y);

    // v1.19 Magnet pickup field: a soft pulsing pull ring + glow at the real pull range while the pickup runs (fades out at the end)
    if (state === State.PLAY && puMagnetFrames > 0) {
      const mpick = puMagnetFrames > 0, pulse = Math.sin(frame * 0.09);
      const R = MAG_PICK_R + pulse * 2.5 + magnetGlow * 3;
      ctx.save(); 
      ctx.strokeStyle = "#ff7fb0"; ctx.lineWidth = 14; ctx.globalAlpha = 0.09 + 0.1 * magnetGlow + (mpick ? 0.08 : 0) + pulse * 0.025;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "#ffb3d1"; ctx.lineWidth = 5; ctx.globalAlpha = 0.2 + 0.2 * magnetGlow + pulse * 0.05;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = mpick ? "#ff5f9a" : "#ffe3ef"; ctx.lineWidth = 2.2; ctx.globalAlpha = Math.min(1, 0.55 + 0.35 * magnetGlow);
      ctx.setLineDash([7, 8]); ctx.lineDashOffset = -frame * 0.9;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#ff8ab8"; ctx.globalAlpha = 0.85;
      for (let k = 0; k < 3; k++) { const oa = frame * 0.035 + k * 2.094; ctx.beginPath(); ctx.arc(Math.cos(oa) * R, Math.sin(oa) * R, 3.2, 0, Math.PI * 2); ctx.fill(); }
      if (magnetGlow > 0.05) {
        ctx.globalAlpha = 0.6 * magnetGlow; ctx.strokeStyle = "#ff9ac4"; ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let i = 0; i < coins.length; i++) {
          const c = coins[i];
          if (!c.pulled) continue;
          const ddx = c.x - bird.x, ddy = c.y - bird.y;
          if (ddx * ddx + ddy * ddy > R * R) continue;
          ctx.moveTo(ddx, ddy); ctx.lineTo(ddx * 0.55, ddy * 0.55);
        }
        ctx.stroke();
      }
      // first Magnet ever collected: a short label so players learn what the pink ring does
      
      if (magnetLabelT > 0) {
        magnetLabelT--;
        const lt = "🧲 Magnet · pulls coins in", lw = 170, lh = 22, ly = -bird.r - 40;
        ctx.globalAlpha = Math.min(1, magnetLabelT / 25, (330 - magnetLabelT) / 12);
        ctx.fillStyle = "rgba(255,95,154,0.95)"; roundRect(-lw / 2, ly - lh / 2, lw, lh, 11); ctx.fill();
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.8; roundRect(-lw / 2, ly - lh / 2, lw, lh, 11); ctx.stroke();
        ctx.fillStyle = "#ffffff"; ctx.font = "bold 12px " + FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(lt, 0, ly + 0.5);
      }
      ctx.restore();
    }
    // Dash afterimages
    if (dashOff > 0) {
      ctx.fillStyle = "rgba(255,230,170,0.25)";
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.ellipse(-i * 12 * BIRD_VISUAL_SCALE, 0, 16 * birdScale * BIRD_VISUAL_SCALE, 12 * birdScale * BIRD_VISUAL_SCALE, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    let sc = birdScale * (state === State.PLAY ? puVis : 1);
    if (flapPop > 0.04) sc *= 1 + flapPop * 0.18;
    ctx.scale(sc, sc);
    ctx.rotate(bird.rot);

    // Evolution feel: slightly snappier wing visual at higher tiers (cosmetic only)
    const showPipes = evoPipes();
    const pal = activeBirdPalette(showPipes);
    const evo = pal.evo;
    const wingBoost = 1 + (evo.feel || 0) * 0.35;
    let wingAngle = -0.5 + bird.wing * 1.1 * wingBoost;
    if (pal.species === "hummingbird") wingAngle = -0.4 + Math.sin(frame * 1.4) * 0.8;

    // Invulnerability blink (continue / checkpoint / post-shield)
    const blink = state === State.PLAY && invulnFrames > 0 && dashA <= 0 && (frame % 8) < 3;
    if (blink) ctx.globalAlpha = 0.5;
    // v1.9 Ghost: see-through bird with a pale aura; flickers on the last pipe as a warning.
    const ghosting = state === State.PLAY && ghostPipesLeft > 0;
    if (ghosting) {
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = "#e6ecff";
      ctx.beginPath();
      ctx.arc(0, 0, (25 + Math.sin(frame * 0.2) * 2) * BIRD_VISUAL_SCALE, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = ghostPipesLeft === 1 && (frame % 10) < 5 ? 0.75 : 0.38;
    }
    drawBirdFigure(pal, wingAngle);
    ctx.globalAlpha = 1;

    // Shield bubble
    if (state === State.PLAY && shieldUp()) {
      const act = skillActive("shield");
      const ending = act > 0 && act < 60 && (frame % 10) < 5;
      ctx.rotate(-bird.rot);
      ctx.scale(BIRD_VISUAL_SCALE, BIRD_VISUAL_SCALE);
      if (!shieldGrad) {
        shieldGrad = ctx.createRadialGradient(-6, -8, 4, 0, 0, 26);
        shieldGrad.addColorStop(0, "rgba(255,255,255,0.05)");
        shieldGrad.addColorStop(0.8, "rgba(140,200,255,0.18)");
        shieldGrad.addColorStop(1, "rgba(170,220,255,0.45)");
      }
      ctx.globalAlpha = ending ? 0.4 : 1;
      ctx.fillStyle = shieldGrad;
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(190,230,255,0.9)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 21, -2.4 + Math.sin(frame * 0.05) * 0.2, -1.6 + Math.sin(frame * 0.05) * 0.2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  let hudScoreFor = -1, hudScoreText = "", hudLevelFor = -1, hudLevelText = "", hudMultFor = -1, hudMultText = "";
  let hudFormFor = -1, hudFormLabel = "", hudGoalFor = -1, hudGoal = null;
  /** v1.17 evolution moment: a card with the new form, its stage, and the free upgrade(s). Gameplay keeps running underneath. */
  function drawEvoMoment() {
    const m = evoMoment, a = Math.min(1, m.t / 30, (200 - m.t) / 10 + 0.15);
    const pw = 300, ph = m.rewards.length > 1 ? 104 : 90, px = (W - pw) / 2, py = 88;
    const sc = 0.88 + 0.12 * Math.min(1, (200 - m.t) / 12);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    ctx.translate(W / 2, py + ph / 2); ctx.scale(sc, sc); ctx.translate(-W / 2, -(py + ph / 2));
    ctx.fillStyle = "rgba(8,24,44,0.9)"; roundRect(px, py, pw, ph, 16); ctx.fill();
    ctx.strokeStyle = "#ffb02e"; ctx.lineWidth = 2.5; roundRect(px, py, pw, ph, 16); ctx.stroke();
    // rings behind the new bird
    const bx = px + 52, by = py + ph / 2 + 2, ph2 = (200 - m.t) / 40;
    ctx.strokeStyle = "rgba(255,170,50," + Math.max(0, 0.75 - ph2 * 0.3).toFixed(2) + ")"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(bx, by, 22 + (ph2 % 2) * 14, 0, Math.PI * 2); ctx.stroke();
    drawBirdPreview(bx, by, 1.05, Object.assign({}, speciesPreviewPalette("sparrow")), frame);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#ffe08a"; ctx.font = "bold 19px " + FONT; ctx.fillText("★ EVOLUTION! ★", px + 96, py + 28);
    ctx.fillStyle = "#ffffff"; ctx.font = "bold 14px " + FONT; ctx.fillText(fitText(m.name, pw - 108), px + 96, py + 50);
    ctx.fillStyle = "#ffd98a"; ctx.font = "12px " + FONT;
    const rl = "Stage " + (m.stage + 1) + " of " + E.EVO_LEVELS.length + (m.rewards.length ? " · Free upgrade: " + m.rewards.join(", ") : "");
    wrapLines(rl, pw - 108, 3).forEach(function (ln, k) { ctx.fillText(ln, px + 96, py + 68 + k * 14); });
    ctx.restore();
  }
  function drawScoreHUD() {
    if (state !== State.PLAY && state !== State.OVER) return;

    // Cached text sprites: re-rasterized only when the text changes.
    if (hudScoreFor !== score) { hudScoreFor = score; hudScoreText = String(score); }
    drawScoreDigits(hudScoreText, W / 2, 48, 1 + scorePop * 0.45);

    if (hudLevelFor !== level) { hudLevelFor = level; hudLevelText = (isBossLevel(level) ? "BOSS · " : "") + "Level " + formatLevel(level) + " / " + formatLevel(MAX_LEVEL); }
    const ls = textSlot("level", hudLevelText, 15, true, isBossLevel(level) ? "#ff8a8a" : (level >= MAX_LEVEL ? "#ffe08a" : "rgba(255,255,255,0.92)"), "rgba(0,0,0,0.28)", 3);
    drawSlot(ls, W / 2 - ls.w / 2, 82 - ls.h / 2);

    // Combo / multiplier
    if (state === State.PLAY && (scoreMult > 1 || cleanStreak >= 2)) {
      if (hudMultFor !== scoreMult * 1000 + cleanStreak) { hudMultFor = scoreMult * 1000 + cleanStreak; hudMultText = "×" + (Math.round(scoreMult * 100) / 100) + "  ·  streak " + cleanStreak; }
      const msp = textSlot("mult", hudMultText, 13, true, scoreMult >= 2 ? "#7dffb0" : "#c8ffe0", "rgba(0,40,20,0.3)", 3);
      const ms = 1 + multPop * 0.3;
      drawSlot(msp, W / 2 - (msp.w * ms) / 2, 102 - (msp.h * ms) / 2, msp.w * ms, msp.h * ms);
    }

    if (nearMissFlash > 0.05 && state === State.PLAY) {
      flashText("near", "So close!  +" + E.SO_CLOSE_COINS, 14, "#e8fbff", "rgba(0,40,80,0.35)", 3, W / 2, bird.y - 40, Math.min(1, nearMissFlash));
    }

    drawComboHud();

    if (levelFlash > 0.04 && state === State.PLAY) {
      flashText("lvlflash", levelFlashText, 20, "#ffe566", "rgba(0,40,80,0.35)", 4, W / 2, 122 + (1 - levelFlash) * 10, Math.min(1, levelFlash * 1.15));
    }

    if (milestoneFlash > 0.05 && state === State.PLAY) {
      flashText("mileflash", milestoneFlashText, 18, "#ff9cf0", "rgba(60,20,80,0.4)", 4, W / 2, 150 + (1 - Math.min(1, milestoneFlash)) * 12, Math.min(1, milestoneFlash));
    }

    if (evolveFlash > 0.05 && state === State.PLAY) {
      flashText("evoflash", evolveFlashText, 17, "#7dffb0", "rgba(20,60,40,0.45)", 4, W / 2, (milestoneFlash > 0.05 ? 172 : 158) + (1 - Math.min(1, evolveFlash)) * 10, Math.min(1, evolveFlash));
    }

    if (evoMoment && state === State.PLAY) drawEvoMoment();
    // Current evolution form (top-left — clearly readable). Hidden while a top toast shows.
    if (state === State.PLAY) {
      const toastA = toastAlpha();
      if (toastA < 0.99) {
        if (toastA > 0) ctx.globalAlpha = 1 - toastA;
        if (hudFormFor !== runEvo) { hudFormFor = runEvo; hudFormLabel = "Stage " + (runEvo + 1) + "/" + E.EVO_LEVELS.length + " · " + E.EVO_NAMES[runEvo]; }
        const label = hudFormLabel;
        const fp = slot("form", label, measureCached(label, "bold 13px " + FONT_FALLBACK) + 20, 24, function () {
          const tw = measureCached(label, "bold 13px " + FONT_FALLBACK);
          ctx.fillStyle = "rgba(0,30,50,0.55)";
          roundRect(2, 2, tw + 12, 20, 6);
          ctx.fill();
          ctx.font = "bold 13px " + FONT_FALLBACK;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.lineWidth = 3;
          ctx.strokeStyle = "rgba(0,40,60,0.55)";
          ctx.strokeText(label, 8, 12);
          ctx.fillStyle = "#ffffff";
          ctx.fillText(label, 8, 12);
        });
        drawSlot(fp, 4, 10);
        {
          // evolution progress bar (levels toward the next stage)
          const ep = E.evoProgress(Math.max(level, peakLevel(), E.EVO_LEVELS[save.evo | 0]));
          ctx.fillStyle = "rgba(50,8,8,0.6)"; roundRect(6, 36, 96, 8, 4); ctx.fill();
          if (ep.frac > 0.01) { ctx.fillStyle = ep.next ? "#ff9a2a" : "#ffe08a"; roundRect(7, 37, Math.max(4, 94 * ep.frac), 6, 3); ctx.fill(); }
        }

        // On-run goal chip (top-right): closer of next bird / next level
        if (hudGoalFor !== score) { hudGoalFor = score; hudGoal = goalChipInfo(score); }
        const goal = hudGoal;
        if (goal.text) {
          const col = goal.prefer === "evo" ? "#7dffb0" : "#ffe08a";
          const gw = measureCached(goal.text, "bold 12px " + FONT_FALLBACK) + 14;
          const gs = slot("goal", goal.text + col, gw + 4, 24, function () {
            ctx.fillStyle = "rgba(20,50,30,0.55)";
            roundRect(2, 2, gw, 20, 6);
            ctx.fill();
            ctx.font = "bold 12px " + FONT_FALLBACK;
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";
            ctx.fillStyle = col;
            ctx.fillText(goal.text, gw - 4, 12);
          });
          drawSlot(gs, W - 6 - gw - 2, 10);
        }
        ctx.globalAlpha = 1;
      }

      // Coins + checkpoint (top-left, under the form pill)
      const pill = drawCoinPill(6, 37, runCoins, "left", coinPop);
      if (runCheckpoint > 0) {
        const ct = "⚑ L" + formatLevel(runCheckpoint);
        const cw = measureCached(ct, "bold 12px " + FONT) + 14;
        const cs = slot("checkpoint", ct, cw, 22, function () {
          ctx.fillStyle = "rgba(0,60,80,0.55)";
          roundRect(0, 0, cw, 22, 11);
          ctx.fill();
          ctx.font = "bold 12px " + FONT;
          ctx.fillStyle = "#9fe7ff";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(ct, 7, 11.5);
        });
        drawSlot(cs, pill.x + pill.w + 4, 37, cw, 22);
      }
    }

    if (trophyFlash > 0.05) {
      const y = 172 + (state === State.PLAY ? (milestoneFlash > 0.05 ? 20 : 0) + (evolveFlash > 0.05 ? 20 : 0) : 0) + (1 - trophyFlash) * 10;
      flashText("trophyflash", trophyFlashText, 14, "#ffd700", "rgba(40,20,0,0.4)", 3, W / 2, y, Math.min(1, trophyFlash * 1.2));
    }

    if (newRecordFlash > 0.05 && state === State.OVER) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, newRecordFlash);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 22px 'Segoe UI', system-ui, sans-serif";
      const y = 28 + Math.sin(frame * 0.2) * 2;
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(80,40,0,0.45)";
      ctx.strokeText(newRecordText, W / 2, y);
      ctx.fillStyle = "#ffd24a";
      ctx.fillText(newRecordText, W / 2, y);
      ctx.restore();
    }
  }

  function drawPanel(title, lines, hint) {
    const pw = 280;
    const ph = 200 + lines.length * 28;
    const px = (W - pw) / 2;
    const py = (PLAY_H - ph) / 2 + 10;

    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "rgba(255,255,255,0.94)";
    roundRect(px, py, pw, ph, 18);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    roundRect(px, py, pw, ph, 18);
    ctx.stroke();

    ctx.fillStyle = "#ffb020";
    roundRect(px, py, pw, 8, 4);
    ctx.fill();

    ctx.textAlign = "center";
    ctx.fillStyle = "#1a2a3a";
    ctx.font = "bold 32px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(title, W / 2, py + 52);

    ctx.font = "18px 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = "#3a5060";
    lines.forEach((ln, i) => {
      ctx.fillText(ln, W / 2, py + 95 + i * 28);
    });

    const pulse = 0.65 + Math.sin(frame * 0.1) * 0.35;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = "#ff8a20";
    ctx.font = "bold 16px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(hint, W / 2, py + ph - 28);
    ctx.globalAlpha = 1;

    return { px, py, pw, ph };
  }

  function drawTrophyButton(cx, cy) {
    const bw = 120;
    const bh = 34;
    const bx = cx - bw / 2;
    const by = cy - bh / 2;
    ctx.fillStyle = "rgba(255,200,60,0.92)";
    roundRect(bx, by, bw, bh, 10);
    ctx.fill();
    ctx.strokeStyle = "rgba(180,120,0,0.5)";
    ctx.lineWidth = 2;
    roundRect(bx, by, bw, bh, 10);
    ctx.stroke();
    ctx.fillStyle = "#4a3000";
    ctx.font = "bold 14px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🏆 Trophies", cx, cy);
    uiButtons.trophies = { x: bx, y: by, w: bw, h: bh };
  }

  function drawShopButton(cx, cy) {
    const bw = 120;
    const bh = 34;
    const bx = cx - bw / 2;
    const by = cy - bh / 2;
    ctx.fillStyle = "rgba(80,160,255,0.92)";
    roundRect(bx, by, bw, bh, 10);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 2;
    roundRect(bx, by, bw, bh, 10);
    ctx.stroke();
    ctx.fillStyle = "#062040";
    ctx.font = "bold 14px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⭐ Skills", cx, cy);
    uiButtons.shop = { x: bx, y: by, w: bw, h: bh };
  }

  function drawTrophyIcon(x, y, lv, unlockedFlag) {
    ctx.save();
    ctx.translate(x, y);
    if (unlockedFlag) {
      const g = ctx.createLinearGradient(-10, -14, 10, 14);
      g.addColorStop(0, "#ffe566");
      g.addColorStop(0.5, "#ffb020");
      g.addColorStop(1, "#e89010");
      ctx.fillStyle = g;
      // cup
      ctx.beginPath();
      ctx.moveTo(-10, -8);
      ctx.lineTo(-8, 4);
      ctx.lineTo(8, 4);
      ctx.lineTo(10, -8);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-4, 4, 8, 5);
      ctx.fillRect(-7, 9, 14, 3);
      // shine
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillRect(-6, -6, 3, 8);
      // level number tiny
      ctx.fillStyle = "#6a4000";
      ctx.font = "bold 9px 'Segoe UI', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(lv), 0, -2);
    } else {
      ctx.fillStyle = "rgba(80,90,100,0.45)";
      ctx.beginPath();
      ctx.moveTo(-10, -8);
      ctx.lineTo(-8, 4);
      ctx.lineTo(8, 4);
      ctx.lineTo(10, -8);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-4, 4, 8, 5);
      ctx.fillRect(-7, 9, 14, 3);
      ctx.fillStyle = "rgba(40,50,60,0.6)";
      ctx.font = "bold 11px 'Segoe UI', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("?", 0, -1);
    }
    ctx.restore();
  }

  function drawTrophiesScreen() {
    ctx.fillStyle = "rgba(10,20,35,0.92)";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 26px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Trophy Shelf", W / 2, 42);
    ctx.font = "13px 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,220,120,0.9)";
    ctx.fillText(
      "Peak " + formatLevel(highestUnlocked) + " / " + formatLevel(MAX_LEVEL) +
      "  ·  milestones shown",
      W / 2, 66
    );

    // Back button
    const bw = 80;
    const bh = 32;
    const bx = 16;
    const by = 20;
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    roundRect(bx, by, bw, bh, 8);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 14px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("← Back", bx + bw / 2, by + bh / 2);
    uiButtons.back = { x: bx, y: by, w: bw, h: bh };

    // Finite milestone list (not 10k rows)
    const listTop = 88;
    const listBot = H - 24;
    const rowH = 52;
    const levels = getShelfLevels();
    ctx.save();
    ctx.beginPath();
    ctx.rect(12, listTop, W - 24, listBot - listTop);
    ctx.clip();

    const startIdx = Math.floor(trophyScroll / rowH);
    const endIdx = Math.min(levels.length, startIdx + Math.ceil((listBot - listTop) / rowH) + 1);

    for (let i = startIdx; i < endIdx; i++) {
      const lv = levels[i];
      const y = listTop + i * rowH - trophyScroll;
      const on = lv <= highestUnlocked;
      const isLandmark = LANDMARKS.indexOf(lv) >= 0;
      const isPeak = lv === highestUnlocked && highestUnlocked > 0;

      ctx.fillStyle = on
        ? (isLandmark ? "rgba(255,200,80,0.2)" : "rgba(255,200,80,0.1)")
        : "rgba(255,255,255,0.05)";
      roundRect(20, y + 4, W - 40, rowH - 8, 10);
      ctx.fill();

      drawTrophyIcon(48, y + rowH / 2, lv, on);

      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "bold 13px 'Segoe UI', system-ui, sans-serif";
      ctx.fillStyle = on ? "#ffe8a0" : "rgba(180,190,200,0.55)";
      let label = on ? trophyNameFor(lv) : "Locked";
      if (isPeak && on) label = "★ " + label;
      ctx.fillText(label, 72, y + rowH / 2 - 8);
      ctx.font = "11px 'Segoe UI', system-ui, sans-serif";
      ctx.fillStyle = on ? "rgba(255,230,160,0.7)" : "rgba(140,150,160,0.45)";
      let sub = "Level " + formatLevel(lv);
      if (isLandmark) sub += "  ·  landmark";
      else if (isPeak) sub += "  ·  highest";
      ctx.fillText(sub, 72, y + rowH / 2 + 10);
    }
    ctx.restore();

    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "11px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Milestones · landmarks · peak  ·  Esc", W / 2, H - 10);
  }


  function drawFlash() {
    if (comboPulse > 0.02) {
      ctx.fillStyle = "rgba(" + comboPulseRGB + "," + (comboPulse * 0.16).toFixed(3) + ")";
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(" + comboPulseRGB + "," + Math.min(1, comboPulse * 0.9).toFixed(3) + ")";
      ctx.lineWidth = 6 + comboPulse * 10;
      ctx.strokeRect(0, 0, W, H);
    }
    if (flash < 0.02) return;
    ctx.fillStyle = `rgba(255,255,255,${flash * 0.55})`;
    ctx.fillRect(0, 0, W, H);
  }

  function drawWorldExtras(layer) {
    // layer: "bg" before pipes, "fg" after pipes
    if (layer === "bg") {
      for (const wf of waterfalls) drawWaterfall(wf);
      for (const t of trees) {
        if (t.layer === "bg") drawTree(t);
      }
    } else {
      for (const t of trees) {
        if (t.layer === "fg") drawTree(t);
      }
      for (const a of animals) drawAnimal(a);
      for (const h of hunters) drawHunter(h);
      for (const p of projectiles) drawProjectile(p);
    }
  }

  // —— v1.5 UI helpers ——
  const FONT = "'Segoe UI', system-ui, sans-serif";
  const SHOP_LIST_TOP = 122;
  const SHOP_LIST_BOT = H - 30;
  const SHOP_ROW_H = 62;

  function fitText(text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
    return t + "…";
  }

  function wrapLines(text, maxW, maxLines) {
    const words = String(text).split(" ");
    const lines = [];
    let cur = "";
    for (const w of words) {
      const test = cur ? cur + " " + w : w;
      if (ctx.measureText(test).width > maxW && cur) {
        lines.push(cur);
        cur = w;
      } else cur = test;
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {
      lines.length = maxLines;
      lines[maxLines - 1] = fitText(lines[maxLines - 1] + "…", maxW);
    }
    return lines;
  }

  function drawButton(x, y, w, h, label, fill, textColor, font, stroke) {
    ctx.fillStyle = fill;
    roundRect(x, y, w, h, Math.min(12, h / 2.6));
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      roundRect(x, y, w, h, Math.min(12, h / 2.6));
      ctx.stroke();
    }
    ctx.fillStyle = textColor || "#fff";
    ctx.font = font || "bold 13px " + FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(fitText(label, w - 10), x + w / 2, y + h / 2 + 0.5);
    return { x: x, y: y, w: w, h: h };
  }

  function drawCoinIcon(x, y, r, squash) {
    const sx = squash == null ? 1 : Math.max(0.2, squash);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sx, 1);
    ctx.fillStyle = "#c98a00";
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffd23a";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#e0a000";
    ctx.lineWidth = Math.max(1, r * 0.16);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.52, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath();
    ctx.arc(-r * 0.32, -r * 0.34, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Coin amount pill. align: "left" (x = left edge) or "right" (x = right edge). */
  function drawCoinPill(x, y, amount, align, pop) {
    const txt = amount === pillLastAmount ? pillLastText : (pillLastAmount = amount, pillLastText = String(amount));
    let wKey = coinPillWidths.get(txt);
    if (wKey == null) {
      ctx.save();
      ctx.font = "bold 14px " + FONT;
      wKey = ctx.measureText(txt).width + 34;
      ctx.restore();
      if (coinPillWidths.size > 200) coinPillWidths.clear();
      coinPillWidths.set(txt, wKey);
    }
    const w = wKey;
    const h = 22;
    const left = align === "right" ? x - w : x;
    const ps = slot("pill@" + x + "," + y, txt, w, h, function () {
      ctx.fillStyle = "rgba(0,25,45,0.6)";
      roundRect(0, 0, w, h, 11);
      ctx.fill();
      drawCoinIcon(12, h / 2, 7.5);
      ctx.fillStyle = "#ffe27a";
      ctx.font = "bold 14px " + FONT;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(txt, 24, h / 2 + 0.5);
    });
    if (pop > 0.05) {
      const k = 1 + pop * 0.15;
      drawSlot(ps, left + w / 2 - (w * k) / 2, y + h / 2 - (h * k) / 2, w * k, h * k);
    } else {
      drawSlot(ps, left, y, w, h);
    }
    return { x: left, y: y, w: w, h: h };
  }
  const coinPillWidths = new Map();
  let pillLastAmount = -1, pillLastText = "";

  function drawBackButton() {
    const r = drawButton(14, 18, 78, 32, "← Back", "rgba(255,255,255,0.18)", "#fff", "bold 14px " + FONT);
    uiButtons.back = r;
  }

  function drawSkillIcon(id, cx, cy, s, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const k = s / 10;
    ctx.scale(k, k);
    ctx.beginPath();
    if (id === "dash") {
      ctx.moveTo(-7, -6); ctx.lineTo(-1, 0); ctx.lineTo(-7, 6);
      ctx.moveTo(0, -6); ctx.lineTo(6, 0); ctx.lineTo(0, 6);
      ctx.stroke();
    } else if (id === "shield") {
      ctx.moveTo(0, -8); ctx.lineTo(7, -5); ctx.quadraticCurveTo(7, 5, 0, 9); ctx.quadraticCurveTo(-7, 5, -7, -5); ctx.closePath();
      ctx.stroke();
      ctx.globalAlpha = 0.4; ctx.fill();
    } else if (id === "shrink") {
      ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-8, -8); ctx.lineTo(-4.5, -4.5); ctx.moveTo(8, -8); ctx.lineTo(4.5, -4.5);
      ctx.moveTo(-8, 8); ctx.lineTo(-4.5, 4.5); ctx.moveTo(8, 8); ctx.lineTo(4.5, 4.5);
      ctx.stroke();
    } else if (id === "magnet") {
      ctx.lineWidth = 3.4;
      ctx.arc(0, -1, 5.5, Math.PI, 0); ctx.moveTo(5.5, -1); ctx.lineTo(5.5, 6); ctx.moveTo(-5.5, -1); ctx.lineTo(-5.5, 6);
      ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.fillRect(-7.2, 4, 3.4, 3); ctx.fillRect(3.8, 4, 3.4, 3);
    } else if (id === "ghost") {
      // little ghost: round head, wavy hem, two eyes
      ctx.moveTo(-7, 8); ctx.lineTo(-7, -1); ctx.arc(0, -1, 7, Math.PI, 0); ctx.lineTo(7, 8);
      ctx.lineTo(4.7, 5.5); ctx.lineTo(2.3, 8); ctx.lineTo(0, 5.5); ctx.lineTo(-2.3, 8); ctx.lineTo(-4.7, 5.5); ctx.closePath();
      ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = "#1a2a4a";
      ctx.beginPath(); ctx.arc(-2.6, -1, 1.5, 0, Math.PI * 2); ctx.arc(2.6, -1, 1.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // —— Coins / FX drawing ——
  function coinSprite(r, label) {
    return sprite("coin" + r + (label || ""), r * 2 + 2, r * 2 + 2, function () {
      drawCoinIcon(r + 1, r + 1, r);
      if (label) {
        ctx.fillStyle = "#8a5a00";
        ctx.font = "bold 10px " + FONT;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, r + 1, r + 1.5);
      }
    });
  }
  let coinRefs = null;
  function coinSpriteFast(risky, labeled) {
    if (!coinRefs || coinRefs.gen !== spriteGen) coinRefs = { gen: spriteGen, n: coinSprite(COIN_R, ""), b: coinSprite(BIG_COIN_R, ""), b5: coinSprite(BIG_COIN_R, "5") };
    return risky ? (labeled ? coinRefs.b5 : coinRefs.b) : coinRefs.n;
  }
  function drawCoins() {
    const glowA = 0.35 + Math.sin(frame * 0.2) * 0.15;
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (c.x < -20 || c.x > W + 20) continue;
      const sq = Math.max(0.2, Math.abs(Math.cos(c.spin)));
      const r = c.risky ? BIG_COIN_R : COIN_R;
      if (c.risky) {
        ctx.globalAlpha = glowA;
        ctx.fillStyle = "#fff2a0";
        ctx.beginPath();
        ctx.arc(c.x, c.y, BIG_COIN_R + 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      const cs = coinSpriteFast(c.risky, c.risky && sq > 0.5);
      const hw = (r + 1) * sq;
      ctx.drawImage(cs.c, c.x - hw, c.y - r - 1, hw * 2, cs.h);
    }
  }

  function drawFx() {
    for (const r of rings) {
      ctx.strokeStyle = "rgba(" + r.color + "," + Math.max(0, r.life).toFixed(3) + ")";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(r.x, r.y, Math.max(0.1, r.r), 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const f of floaters) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, f.life / 20);
      ctx.font = "bold " + (f.px || (f.big ? 16 : 13)) + "px " + FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,20,40,0.5)";
      if (f.pop) {
        // v1.12: combo text pops in (scale overshoot) then settles
        const k = 1 + Math.max(0, 1 - (f.age | 0) / 9) * 0.7;
        ctx.translate(f.x, f.y);
        ctx.scale(k, k);
        ctx.strokeText(f.text, 0, 0);
        ctx.fillStyle = f.color || "#fff";
        ctx.fillText(f.text, 0, 0);
      } else {
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = f.color || "#fff";
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.restore();
    }
  }

  function drawBannerCard(y, queue) {
    const q = queue || banners;
    if (!q.length) return;
    const b = q[0];
    const tIn = Math.min(1, b.t / 12);
    const tOut = Math.min(1, (b.life - b.t) / 15);
    const a = Math.min(tIn, tOut);
    const w = 320;
    const h = 56;
    const x = (W - w) / 2;
    const yy = y - (1 - tIn) * 20;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = "rgba(8,20,40,0.88)";
    roundRect(x, yy, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 2;
    roundRect(x, yy, w, h, 14);
    ctx.stroke();
    // icon
    const ix = x + 30;
    const iy = yy + h / 2;
    if (b.icon && b.icon.indexOf("skill:") === 0) {
      const id = b.icon.slice(6);
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.beginPath();
      ctx.arc(ix, iy, 19, 0, Math.PI * 2);
      ctx.fill();
      drawSkillIcon(id, ix, iy, 12, b.color);
    } else if (b.icon && b.icon.indexOf("bird:") === 0) {
      drawBirdPreview(ix, iy + 2, 0.9, speciesPreviewPalette(b.icon.slice(5)));
    } else {
      drawCoinIcon(ix, iy, 13, Math.abs(Math.cos(frame * 0.08)));
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = "bold 16px " + FONT;
    ctx.fillStyle = b.color;
    ctx.fillText(fitText(b.title, w - 70), x + 58, yy + 19);
    ctx.font = "12px " + FONT;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillText(fitText(b.sub, w - 70), x + 58, yy + 38);
    ctx.restore();
  }

  // —— Skill bar (ground strip, below the play area) ——
  const SKILL_BTN_R = 22;
  const skillHudList = [];
  const skillHitPool = [];
  const skillBtnRefs = {};
  function skillBtnSpriteFast(id, variant, col) {
    let e = skillBtnRefs[id];
    if (!e || e.gen !== spriteGen) e = skillBtnRefs[id] = { gen: spriteGen, ready: null, active: null, cd: null };
    return e[variant] || (e[variant] = skillBtnSprite(id, variant, col));
  }
  const cdDigitRefs = [];
  let cdDigitGen = -1;
  function cdDigitSprite(n) {
    if (cdDigitGen !== spriteGen) { cdDigitRefs.length = 0; cdDigitGen = spriteGen; }
    return cdDigitRefs[n] || (cdDigitRefs[n] = textSprite(String(n), 13, true, "#fff", "rgba(0,0,0,0.35)", 2));
  }
  function skillBtnSprite(id, variant, col) {
    const r = SKILL_BTN_R;
    return sprite("sk|" + id + "|" + variant, r * 2 + 4, r * 2 + 4, function () {
      const c = r + 2;
      ctx.fillStyle = variant === "active" ? "rgba(255,255,255,0.22)" : "rgba(10,25,45,0.72)";
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.fill();
      if (variant === "ready") drawSkillIcon(id, c, c, 11, "#fff");
      else if (variant === "active") drawSkillIcon(id, c, c, 11, col);
      else drawSkillIcon(id, c, c, 11, "rgba(255,255,255,0.35)");
    });
  }
  /** v1.19: Ghost reload ring, no numbers and no pips: a thin ring around the button fills while the next charge reloads (like the other helpers), and glows when a ghost is ready. */
  function drawGhostCharges(cx, cy, r, col) {
    const full = ghostCharges >= ghostMaxCharges(), rr = r + 3.2;
    ctx.lineWidth = 3;
    if (full) { ctx.strokeStyle = "rgba(255,255,255," + (0.55 + Math.sin(frame * 0.12) * 0.2).toFixed(2) + ")"; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke(); return; }
    ctx.strokeStyle = "rgba(255,255,255,0.28)"; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = ghostCharges > 0 ? "#ffffff" : col; ctx.beginPath(); ctx.arc(cx, cy, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, ghostRegen / ghostRegenNeed())); ctx.stroke();
  }
  function drawFireButton() {
    if (!heldWeapon || heldWeapon.ammo <= 0 || state !== State.PLAY) return;
    const b = FIRE_BTN;
    const info = POWERUP_INFO[heldWeapon.kind] || { color: "#fff" };
    ctx.save();
    ctx.fillStyle = weaponFiring ? "#fff4cc" : info.color;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.stroke();
    ctx.fillStyle = "#1a1208"; ctx.font = "bold 12px " + FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("Use", b.x, b.y - 6);
    const frac = heldWeapon.max > 0 ? heldWeapon.ammo / heldWeapon.max : 0;
    ctx.font = "bold 10px " + FONT;
    ctx.fillText(heldWeapon.kind === "pellet" ? Math.ceil(heldWeapon.ammo / 60) + "s" : String(heldWeapon.ammo), b.x, b.y + 8);
    ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); ctx.stroke();
    ctx.restore();
  }
  function drawSkillHud() {
    if (!uiButtons.skills) uiButtons.skills = [];
    uiButtons.skills.length = 0;
    if (state !== State.PLAY) return;
    const list = skillHudList;
    list.length = 0;
    for (let i = 0; i < SKILL_ORDER.length; i++) if (skillAvailable(SKILL_ORDER[i])) list.push(SKILL_ORDER[i]);
    if (list.length) {
      const r = SKILL_BTN_R;
      const gap = list.length > 6 ? 8 : 12;
      const total = list.length * r * 2 + (list.length - 1) * gap;
      let cx = (W - total) / 2 + r;
      const cy = PLAY_H + GROUND_H / 2 + 1;
      // strip backing so the buttons read clearly on the ground
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      roundRect(cx - r - 8, cy - r - 6, total + 16, r * 2 + 12, r + 6);
      ctx.fill();
      for (const id of list) {
        const st = skillState[id];
        const def = E.SKILL_BY_ID[id];
        const col = def.color;
        const ready = st.cd <= 0 && st.active <= 0 && !(id === "ghost" && ghostCharges <= 0);
        // base disk + icon (cached sprite)
        const bs = skillBtnSpriteFast(id, ready ? "ready" : st.active > 0 ? "active" : "cd", col);
        ctx.drawImage(bs.c, cx - r - 2, cy - r - 2, bs.w, bs.h);
        if (ready) {
          const pulse = st.readyPulse;
          ctx.strokeStyle = col;
          ctx.lineWidth = 3 + pulse * 3;
          ctx.beginPath();
          ctx.arc(cx, cy, r - 1.5, 0, Math.PI * 2);
          ctx.stroke();
          if (pulse > 0.05) {
            ctx.globalAlpha = pulse;
            ctx.beginPath();
            ctx.arc(cx, cy, r + 6 * (1 - pulse) + 2, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        } else if (st.active > 0) {
          // active: bright ring draining clockwise
          const f = st.active / Math.max(1, st.activeMax);
          ctx.strokeStyle = "rgba(255,255,255,0.25)";
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = col;
          ctx.beginPath();
          ctx.arc(cx, cy, r - 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f);
          ctx.stroke();
        } else if (id === "ghost" && ghostCharges <= 0) {
          // v1.18: out of charges: dimmed, with the slow recharge ring filling
          ctx.fillStyle = "rgba(0,0,0,0.5)";
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = col;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(cx, cy, r - 1.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, ghostRegen / ghostRegenNeed()));
          ctx.stroke();
        } else {
          // cooldown: dim pie + filling ring + seconds
          const f = 1 - st.cd / Math.max(1, st.cdMax);
          ctx.fillStyle = "rgba(0,0,0,0.45)";
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, r, -Math.PI / 2 + Math.PI * 2 * f, Math.PI * 1.5);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = col;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(cx, cy, r - 1.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f);
          ctx.stroke();
          if (id !== "ghost") drawTextSprite(cdDigitSprite(Math.ceil(st.cd / 60)), cx, cy + 0.5);
        }
        if (id === "ghost") drawGhostCharges(cx, cy, r, col);
        if (finePointer) drawTextSprite(textSprite(def.key, 9, true, "rgba(255,255,255,0.7)", null, 0), cx + r - 3, cy + r - 6);
        let hb = skillHitPool[uiButtons.skills.length];
        if (!hb) hb = skillHitPool[uiButtons.skills.length] = { cx: 0, cy: 0, r: 0, action: "" };
        hb.cx = cx; hb.cy = cy; hb.r = r; hb.action = id;
        uiButtons.skills.push(hb);
        cx += r * 2 + gap;
      }
    }
    // Fading toast only (e.g. "Dash!") — never a permanent label
    if (shopToast > 0.05 && shopToastText) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, shopToast);
      ctx.fillStyle = "#ffe566";
      ctx.font = "bold 14px " + FONT;
      ctx.textAlign = "center";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,30,60,0.4)";
      ctx.strokeText(shopToastText, W / 2, PLAY_H - 18);
      ctx.fillText(shopToastText, W / 2, PLAY_H - 18);
      ctx.restore();
    }
  }

  /** v1.9 Ghost countdown pill (👻 5-4-3-2-1), follows the bird and ticks down per pipe passed. */
  function drawGhostCountdown() {
    if (state !== State.PLAY || ghostPipesLeft <= 0) return;
    const txt = "👻 " + ghostPipesLeft;
    const sc = 1 + ghostPop * 0.45;
    const x = Math.min(W - 40, bird.x + 50);
    const y = Math.max(30, Math.min(PLAY_H - 30, bird.y - 34));
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sc, sc);
    ctx.fillStyle = ghostPipesLeft === 1 ? "rgba(120,30,60,0.78)" : "rgba(20,30,70,0.72)";
    roundRect(-31, -16, 62, 32, 16);
    ctx.fill();
    ctx.strokeStyle = "rgba(220,230,255,0.9)";
    ctx.lineWidth = 2;
    roundRect(-31, -16, 62, 32, 16);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 19px " + FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(txt, 0, 1);
    ctx.restore();
  }

  // —— Menu ——
  function missionRows(x, y, w, rowH, compact) {
    const ms = ensureMissions();
    if (!ms) return;
    ms.list.forEach(function (m, i) {
      const yy = y + i * rowH;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = (compact ? "bold 11px " : "bold 13px ") + FONT;
      ctx.fillStyle = m.done ? "#7dffb0" : "#fff";
      const mark = m.done ? "✓ " : "";
      ctx.fillText(fitText(mark + m.label, w * 0.55), x, yy);
      // progress bar
      const bx = x + w * 0.58;
      const bw = w * 0.26;
      const f = Math.min(1, m.progress / m.target);
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      roundRect(bx, yy - 4, bw, 8, 4);
      ctx.fill();
      ctx.fillStyle = m.done ? "#46d98a" : "#ffc93a";
      if (f > 0) { roundRect(bx, yy - 4, Math.max(8, bw * f), 8, 4); ctx.fill(); }
      ctx.textAlign = "right";
      ctx.font = "bold 11px " + FONT;
      ctx.fillStyle = m.done ? "#7dffb0" : "#ffe27a";
      ctx.fillText(m.done ? "+" + (m.paid || m.reward) : m.progress + "/" + m.target, x + w, yy);
    });
  }

  function drawStart() {
    uiButtons.resume = null; uiButtons.newGame = null; uiButtons.ngYes = null; uiButtons.ngNo = null;
    uiButtons.trophies = null;
    uiButtons.shop = null;
    uiButtons.continue = null;
    uiButtons.share = null;
    uiButtons.featured = null;
    uiButtons.safeStart = null;
    uiButtons.checkpoint = null;
    uiButtons.doubleCoins = null;
    uiButtons.birds = null;
    uiButtons.missions = null;
    uiButtons.privacy = null;
    uiButtons.privacyChoices = null;
    uiButtons.leaderboard = null;
    uiButtons.playStore = null;
    drawCoinPill(8, 10, save.coins, "left", coinPop);
    drawStreakChip();

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#fff";
    ctx.font = "bold 50px " + FONT;
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(0,40,80,0.25)";
    ctx.strokeText("Sky Hop", W / 2, 76);
    ctx.fillText("Sky Hop", W / 2, 76);
    ctx.font = "15px " + FONT;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText("Flap through the clouds!", W / 2, 100);
    ctx.font = "12px " + FONT;
    ctx.fillStyle = "rgba(255,255,220,0.85)";
    ctx.fillText(formatLevel(MAX_LEVEL) + " levels · ⚑ checkpoint every " + E.CHECKPOINT_EVERY + " levels", W / 2, 120);

    // Daily challenge chip (existing streak system)
    const daily = ensureDaily();
    if (daily && daily.challenge) {
      ctx.fillStyle = "rgba(0,30,60,0.55)";
      roundRect(W / 2 - 150, 132, 300, 40, 10);
      ctx.fill();
      ctx.fillStyle = daily.completed ? "#7dffb0" : "#ffe08a";
      ctx.font = "bold 13px " + FONT;
      ctx.fillText("Daily: " + daily.challenge.label, W / 2, 149);
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = "11px " + FONT;
      const streakBit = (daily.streak | 0) > 0 ? " · 🔥 " + daily.streak : "";
      const tok = continueTokens > 0 ? " · 🎫 " + continueTokens : "";
      ctx.fillText((daily.completed ? "Completed today" : "Play to complete") + streakBit + tok, W / 2, 165);
    }

    // v1.9: Weekly leaderboard (Android app) or "Get it on Google Play" (itch.io web build)
    if (leaderboardAvailable()) {
      uiButtons.leaderboard = drawButton(W / 2 - 120, 182, 240, 38, "🏅 Weekly leaderboard", "rgba(20,120,90,0.95)", "#fff", "bold 15px " + FONT, "rgba(255,255,255,0.45)");
    } else if (ITCH_BUILD) {
      uiButtons.playStore = drawPlayStoreButton(W / 2 - 130, 180, 260, 42);
    }

    // Species card (bird floats at left, x≈90)
    const sp = E.SPECIES_BY_ID[save.speciesEquipped] || E.SPECIES_BY_ID.sparrow;
    ctx.fillStyle = "rgba(0,30,60,0.45)";
    roundRect(140, 234, 236, 52, 10);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.font = "bold 14px " + FONT;
    ctx.fillStyle = "#fff";
    ctx.fillText(sp.name, 152, 254);
    ctx.font = "11px " + FONT;
    ctx.fillStyle = "#bfe4ff";
    ctx.fillText(fitText(sp.perk, 214), 152, 272);

    // Missions panel (tap → details)
    const ms = ensureMissions();
    const left = E.missionsLeft(ms);
    const my = 300;
    ctx.fillStyle = "rgba(0,30,60,0.6)";
    roundRect(24, my, W - 48, 112, 12);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.font = "bold 13px " + FONT;
    ctx.fillStyle = "#ffe08a";
    ctx.fillText("Daily missions  " + (3 - left) + "/3", 38, my + 18);
    ctx.textAlign = "right";
    ctx.font = "11px " + FONT;
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    const mult = E.streakMultiplier(daily ? daily.streak : 0);
    ctx.fillText((mult > 1 ? "🔥 +" + Math.round((mult - 1) * 100) + "% rewards · " : "") + "details ›", W - 38, my + 18);
    missionRows(38, my + 44, W - 76, 24, true);
    uiButtons.missions = { x: 24, y: my, w: W - 48, h: 112 };

    // Buttons
    const by = 424;
    uiButtons.shop = drawButton(W / 2 - 180, by, 114, 36, "⭐ Skills", "rgba(80,160,255,0.95)", "#062040", "bold 14px " + FONT, "rgba(255,255,255,0.45)");
    uiButtons.birds = drawButton(W / 2 - 57, by, 114, 36, "🧬 Evolve", "rgba(255,140,190,0.95)", "#3a0620", "bold 14px " + FONT, "rgba(255,255,255,0.45)");
    uiButtons.trophies = drawButton(W / 2 + 66, by, 114, 36, "🏆 Trophies", "rgba(255,200,60,0.95)", "#4a3000", "bold 14px " + FONT, "rgba(180,120,0,0.5)");

    const pulse = 0.55 + Math.sin(frame * 0.12) * 0.45;
    if (resumeRec) {   // v1.20: big Continue + New Game
      uiButtons.resume = drawButton(W / 2 - 160, 466, 214, 44, "▶ Continue · Level " + formatLevel(resumeRec.level), "rgba(40,200,110,0.97)", "#032a14", "bold 17px " + FONT, "rgba(255,255,255,0.6)");
      uiButtons.newGame = drawButton(W / 2 + 62, 466, 98, 44, "New Game", "rgba(0,30,60,0.75)", "#fff", "bold 13px " + FONT, "rgba(255,255,255,0.4)");
    } else {
    ctx.globalAlpha = pulse;
    ctx.font = "bold 20px " + FONT;
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("Tap / Space to start", W / 2, 490);
    ctx.globalAlpha = 1;
    }

    ctx.globalAlpha = 0.85;
    ctx.font = "13px " + FONT;
    const bestBits = [];
    if (best > 0) bestBits.push("Best score " + best);
    if (bestLevel > 0) bestBits.push("Best level " + formatLevel(bestLevel));
    bestBits.push("🏆 " + formatLevel(trophyCount()));
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.font = "13px " + FONT; ctx.fillStyle = "#fff";
    ctx.fillText(bestBits.join("  ·  "), W / 2, resumeRec ? 528 : 514);
    ctx.globalAlpha = 1;

    // v1.7 privacy row (on the ground strip): policy link always; UMP "Privacy choices" where required.
    const showChoices = privacyChoicesAvailable();
    const pbw = 150, pby = 544, pbh = 26;
    const pbx = showChoices ? W / 2 - pbw - 5 : W / 2 - pbw / 2;
    uiButtons.privacy = drawButton(pbx, pby, pbw, pbh, "🔒 Privacy policy", "rgba(0,30,60,0.72)", "#fff", "bold 12px " + FONT, "rgba(255,255,255,0.35)");
    if (showChoices) {
      uiButtons.privacyChoices = drawButton(W / 2 + 5, pby, pbw, pbh, "⚙ Privacy choices", "rgba(0,30,60,0.72)", "#fff", "bold 12px " + FONT, "rgba(255,255,255,0.35)");
    }

    drawBannerCard(228);
    // v1.9: leaderboard sign-in notice, just under the leaderboard button
    if (adNoticeText && Date.now() < adNoticeUntil && uiButtons.leaderboard) {
      ctx.fillStyle = "rgba(0,0,0,0.85)";
      roundRect(W / 2 - 150, 224, 300, 26, 8);
      ctx.fill();
      ctx.fillStyle = "#ffe566";
      ctx.font = "bold 12px " + FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(fitText(adNoticeText, 290), W / 2, 237);
    }
    if (newGameConfirm && resumeRec) {   // v1.20 New Game confirmation
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(10,30,60,0.97)"; roundRect(40, 190, W - 80, 190, 14); ctx.fill();
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillStyle = "#fff"; ctx.font = "bold 20px " + FONT;
      ctx.fillText("Start a new game?", W / 2, 228);
      ctx.font = "13px " + FONT; ctx.fillStyle = "#cfe6ff";
      ctx.fillText("Your saved run at Level " + formatLevel(resumeRec.level) + " will be replaced.", W / 2, 256);
      ctx.fillText("Your bird, coins, upgrades and best level stay.", W / 2, 276);
      uiButtons.ngYes = drawButton(64, 310, 130, 48, "Start new", "rgba(255,120,80,0.97)", "#3a0a00", "bold 16px " + FONT, "rgba(255,255,255,0.5)");
      uiButtons.ngNo = drawButton(W - 194, 310, 130, 48, "Cancel", "rgba(80,160,255,0.97)", "#062040", "bold 16px " + FONT, "rgba(255,255,255,0.5)");
    }
  }

  // —— Game over ——
  function drawOver() {
    uiButtons.leaderboard = null;
    uiButtons.playStore = null;
    overButtonsBottom = 0;
    uiButtons.trophies = null;
    uiButtons.shop = null;
    uiButtons.continue = null;
    uiButtons.share = null;
    uiButtons.featured = null;
    uiButtons.safeStart = null;
    uiButtons.checkpoint = null;
    uiButtons.doubleCoins = null;
    uiButtons.birds = null;
    uiButtons.missions = null;
    uiButtons.privacy = null;
    uiButtons.privacyChoices = null;

    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(0, 0, W, H);
    const px = 34, pw = W - 68, py = 40, ph = 262;
    ctx.fillStyle = "#fbfdff";
    roundRect(px, py, pw, ph, 18);
    ctx.fill();
    ctx.fillStyle = "#ffb020";
    roundRect(px, py, pw, 8, 4);
    ctx.fill();

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#1a2a3a";
    ctx.font = "bold 28px " + FONT;
    ctx.fillText("Game Over", W / 2, py + 40);

    // stats row
    const cols = [
      ["SCORE", String(score), beatBestScore],
      ["LEVEL", formatLevel(level), beatBestLevel],
      ["BEST", String(best), false],
    ];
    cols.forEach(function (c, i) {
      const cx = px + pw * (i + 0.5) / 3;
      ctx.font = "bold 10px " + FONT;
      ctx.fillStyle = "#7890a0";
      ctx.fillText(c[0], cx, py + 62);
      ctx.font = "bold 22px " + FONT;
      ctx.fillStyle = c[2] ? "#e08a00" : "#1a2a3a";
      ctx.fillText(c[1], cx, py + 86);
    });

    // coins row
    ctx.fillStyle = "rgba(255,200,60,0.18)";
    roundRect(px + 14, py + 98, pw - 28, 28, 8);
    ctx.fill();
    drawCoinIcon(px + 32, py + 112, 8, 1);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = "bold 14px " + FONT;
    ctx.fillStyle = "#7a5000";
    const earned = "+" + runCoins + " coins" + (doubleCoinsUsed ? " (doubled!)" : runBonusCoins > 0 ? "  (incl. +" + runBonusCoins + " level bonus)" : "");
    ctx.fillText(fitText(earned, pw - 120), px + 46, py + 112);
    ctx.textAlign = "right";
    ctx.font = "12px " + FONT;
    ctx.fillStyle = "#8a6a20";
    ctx.fillText("total " + save.coins, px + pw - 22, py + 112);

    // almost moments
    let ly = py + 144;
    ctx.textAlign = "center";
    for (const t of almostLines) {
      ctx.font = "bold 13px " + FONT;
      ctx.fillStyle = "#e0620a";
      ctx.fillText(fitText(t, pw - 24), W / 2, ly);
      ly += 18;
    }
    if (!almostLines.length && (beatBestScore || beatBestLevel)) {
      ctx.font = "bold 13px " + FONT;
      ctx.fillStyle = "#e08a00";
      ctx.fillText("✦ New record!", W / 2, ly);
      ly += 18;
    }

    // missions (compact) — dark-on-light
    const ms = ensureMissions();
    const my = py + 186;
    ctx.fillStyle = "rgba(20,40,60,0.9)";
    roundRect(px + 10, my - 12, pw - 20, 58, 8);
    ctx.fill();
    missionRows(px + 20, my, pw - 40, 17, true);
    uiButtons.missions = { x: px + 10, y: my - 12, w: pw - 20, h: 58 };

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const pulse = 0.65 + Math.sin(frame * 0.1) * 0.35;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = "#ff7a10";
    ctx.font = "bold 14px " + FONT;
    ctx.fillText(overTimer > 18 ? (resumeRec ? "Tap / Space to continue from Level " + formatLevel(resumeRec.level) : "Tap / Space to retry free from Level 1") : "…", W / 2, py + ph - 10);
    ctx.globalAlpha = 1;

    if (overTimer <= 18) return;

    // —— Offers (each at most one row) ——
    let y = py + ph + 10;
    const BW = 300, bx = (W - BW) / 2;
    const ads = adsApi();
    const canAdContinue = !!(ads && typeof ads.canOfferContinue === "function" && ads.canOfferContinue());
    const canDemoContinue = isBrowserPlay();
    const offerContinue = !continueUsedThisRun && !continueBusy && !rewardBusy &&
      (continueTokens > 0 || canAdContinue || canDemoContinue);

    if (offerContinue) {
      let cLabel;
      if (continueTokens > 0) cLabel = "▶ Continue — resume Level " + formatLevel(level) + " (🎫 " + continueTokens + ")";
      else if (canDemoContinue && !canAdContinue) cLabel = "▶ Continue (demo) — resume Level " + formatLevel(level);
      else if (rewardedStatus("continue") === "failed") cLabel = "↻ No ad right now — tap to retry";
      else cLabel = "▶ Watch ad — resume Level " + formatLevel(level);
      const noAd = continueTokens <= 0 && canAdContinue && rewardedStatus("continue") === "failed";
      uiButtons.continue = drawButton(bx, y, BW, 38, cLabel, noAd ? "rgba(90,100,120,0.92)" : "rgba(40,120,200,0.95)", "#fff", "bold 13px " + FONT, "rgba(255,255,255,0.55)");
      y += 46;
    } else if (canOfferCheckpoint()) {
      const demo = isBrowserPlay() && !canAdContinue;
      const lbl = (demo ? "⚑ Continue (demo) from Level " : "⚑ Watch ad — continue from Level ") + formatLevel(runCheckpoint) + " checkpoint";
      uiButtons.checkpoint = drawButton(bx, y, BW, 38, lbl, "rgba(20,150,170,0.95)", "#fff", "bold 13px " + FONT, "rgba(255,255,255,0.55)");
      y += 46;
    } else if (continueBusy || rewardBusy) {
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = "12px " + FONT;
      ctx.textAlign = "center";
      ctx.fillText(rewardedLoadingNow() ? "Loading ad… (other buttons still work)" : "Watching ad…", W / 2, y + 12);
      y += 26;
    } else if (continueUsedThisRun) {
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "11px " + FONT;
      ctx.textAlign = "center";
      ctx.fillText(checkpointUsedThisRun ? "Continue + checkpoint used this run" : "Continue already used this run", W / 2, y + 10);
      y += 22;
    }
    if (adNoticeText && Date.now() < adNoticeUntil) {
      ctx.fillStyle = "#ffe566";
      ctx.font = "bold 12px " + FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(adNoticeText, W / 2, y + 6);
      y += 20;
    }

    if (canOfferDoubleCoins()) {
      const demo = isBrowserPlay() && !canNativeUnlockAd();
      const r = { x: bx, y: y, w: BW, h: 34 };
      ctx.fillStyle = "rgba(240,170,20,0.96)";
      roundRect(r.x, r.y, r.w, r.h, 11);
      ctx.fill();
      drawCoinIcon(r.x + 22, r.y + r.h / 2, 8, Math.abs(Math.cos(frame * 0.08)));
      ctx.fillStyle = "#3a2400";
      ctx.font = "bold 13px " + FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText((demo ? "Double coins (demo)" : "Watch ad — double coins") + "  +" + runCoins, r.x + r.w / 2 + 8, r.y + r.h / 2 + 0.5);
      uiButtons.doubleCoins = r;
      y += 42;
    }

    // Safe-start nudge (after continue) OR featured unlock tease — one row max
    if (offerSafeStart && canOfferSafeStartNudge() && !continueBusy && !rewardBusy) {
      // v1.7: after the daily free use this button plays a rewarded ad, so it says so.
      const ssLabel = safeStartFreeToday()
        ? "Practice restart (easy start) — free today"
        : "▶ Watch ad — easy start (first pipes gentler)";
      uiButtons.safeStart = drawButton(bx, y, BW, 32, ssLabel, "rgba(60,160,100,0.94)", "#fff", "bold 12px " + FONT);
      y += 40;
    } else if (ITCH_BUILD) {
      // v1.9 itch.io build: no ads to watch, so this slot is the "Get it on Google Play" button.
      uiButtons.playStore = drawPlayStoreButton(bx, y, BW, 40);
      y += 48;
    } else if (featuredUnlockId) {
      const item = CATALOG_BY_ID[featuredUnlockId];
      if (item) {
        const owned = isOwned(item.id);
        let label;
        if (owned) label = "Shop · " + item.name + " ready";
        else if (canNativeUnlockAd()) {
          // v1.7: rewarded disclosure — how many ads are left and what they unlock.
          const pr = progressFor(item.id);
          const left = Math.max(1, item.watches - pr);
          label = "▶ Watch " + left + " ad" + (left > 1 ? "s" : "") + " — unlock " + item.name + " (" + pr + "/" + item.watches + ")";
        } else if (isBrowserPlay()) label = "Demo unlock " + item.name + " (" + progressFor(item.id) + "/" + item.watches + ")";
        else label = "Shop tease · " + item.name;
        uiButtons.featured = drawButton(bx, y, BW, 32, label, owned ? "rgba(80,120,80,0.88)" : "rgba(100,70,180,0.92)", "#fff", "bold 12px " + FONT);
        uiButtons.featured.itemId = item.id;
        y += 40;
      }
    }

    if (ITCH_BUILD && !uiButtons.playStore) {
      // itch: the safe-start nudge took the slot above; still show the Play button
      uiButtons.playStore = drawPlayStoreButton(bx, y, BW, 40);
      y += 48;
    }

    if (leaderboardAvailable()) {
      // v1.9 Android: Share your score · Weekly leaderboard, then Shop · Birds · Trophies
      const RW = 348, g2 = 4;
      const x0 = (W - RW) / 2;
      const bw2 = (RW - g2) / 2;
      uiButtons.share = drawButton(x0, y, bw2, 34, "📤 Share score", "rgba(30,140,200,0.95)", "#fff", "bold 13px " + FONT, "rgba(255,255,255,0.45)");
      uiButtons.leaderboard = drawButton(x0 + bw2 + g2, y, bw2, 34, "🏅 Leaderboard", "rgba(20,120,90,0.95)", "#fff", "bold 13px " + FONT, "rgba(255,255,255,0.45)");
      y += 40;
      const bw3 = (RW - g2 * 2) / 3;
      let x3 = x0;
      uiButtons.shop = drawButton(x3, y, bw3, 32, "⭐ Skills", "rgba(80,160,255,0.95)", "#062040", "bold 12px " + FONT); x3 += bw3 + g2;
      uiButtons.birds = drawButton(x3, y, bw3, 32, "🧬 Evolve", "rgba(255,140,190,0.95)", "#3a0620", "bold 12px " + FONT); x3 += bw3 + g2;
      uiButtons.trophies = drawButton(x3, y, bw3, 32, "🏆 Trophies", "rgba(255,200,60,0.95)", "#4a3000", "bold 12px " + FONT);
      overButtonsBottom = y + 32;
      return;
    }

    // Share · Shop · Birds · Trophies
    const bw4 = 84, g4 = 4;
    let x4 = (W - (bw4 * 4 + g4 * 3)) / 2;
    uiButtons.share = drawButton(x4, y, bw4, 32, "📤 Share", "rgba(30,140,200,0.92)", "#fff", "bold 12px " + FONT); x4 += bw4 + g4;
    uiButtons.shop = drawButton(x4, y, bw4, 32, "⭐ Skills", "rgba(80,160,255,0.95)", "#062040", "bold 12px " + FONT); x4 += bw4 + g4;
    uiButtons.birds = drawButton(x4, y, bw4, 32, "🧬 Evolve", "rgba(255,140,190,0.95)", "#3a0620", "bold 12px " + FONT); x4 += bw4 + g4;
    uiButtons.trophies = drawButton(x4, y, bw4, 32, "🏆 Trophies", "rgba(255,200,60,0.95)", "#4a3000", "bold 11px " + FONT);
    overButtonsBottom = y + 32;
  }

  // —— Shop (tabs) ——
  function upgradeValueText(u, v) {
    if (u.id === "recharge") return "−" + Math.round((1 - v) * 100) + "%";
    if (u.id === "lucky") return "+" + v + "%";
    if (u.id === "magnetRad") return v + "px";
    return v + "s";
  }
  const UPGRADE_UNIT = { dashCd: "cooldown", shieldDur: "shield", shrinkDur: "shrink", magnetRad: "radius", recharge: "cooldowns", lucky: "coins" };

  function priceChip(price, action, itemId) {
    const afford = save.coins >= price;
    return { label: String(price), coin: true, action: action, itemId: itemId,
      fill: afford ? "rgba(255,200,40,0.95)" : "rgba(255,200,40,0.35)", text: afford ? "#3a2800" : "rgba(255,240,200,0.8)" };
  }

  function adChip(watchKeyProgress, need, action, itemId) {
    if (canNativeUnlockAd()) return { label: "▶ Ad " + watchKeyProgress + "/" + need, action: action, itemId: itemId, fill: "rgba(40,120,200,0.92)", text: "#fff" };
    if (isBrowserPlay()) return { label: "Demo " + watchKeyProgress + "/" + need, action: action, itemId: itemId, fill: "rgba(120,100,200,0.9)", text: "#fff" };
    return null;
  }

  function evoRowIcon(i) { return Object.assign({}, speciesPreviewPalette("sparrow"), { evo: evolutionMeta(i * 10) }); }
  function buildShopRows() {
    const rows = [];
    const peak = peakLevel();
    if (shopTab === 0) {
      rows.push({ header: "Your Phoenix's skills · bought with coins you earn" });
      for (const n of E.treeInfo(save, peak)) {
        const chips = [];
        let sub;
        if (!n.next) { sub = "MAX · " + n.blurb; chips.push({ label: "MAX", fill: "rgba(80,160,100,0.7)", text: "#fff" }); }
        else { sub = "Lv " + (n.level + 1) + ": " + n.next.text; chips.push(priceChip(n.next.price, "buyNode", n.id)); }
        rows.push({ title: n.name + " · Lv " + n.level + "/" + n.max, sub: sub, pips: [n.level, n.max], icon: { node: n.id }, chips: chips, wrap: true });
      }
      const ex = E.EXTRA_SKILLS[0], item = CATALOG_BY_ID[ex.catalogId], owned = isOwned(ex.catalogId), chips = [];
      if (owned) chips.push({ label: "Unlocked ✓", fill: "rgba(80,160,100,0.7)", text: "#fff" });
      else {
        chips.push(priceChip(catalogCoinPrice(ex.catalogId), "buyCatalog", ex.catalogId));
        const ad = adChip(progressFor(ex.catalogId), item.watches, canNativeUnlockAd() ? "watch" : "simulate", ex.catalogId);
        if (ad) chips.push(ad);
      }
      rows.push({ title: ex.name, sub: owned ? ghostMaxCharges() + " charges per run · " + GHOST_PIPES + " pipes each · recharges" : (item.freeLevel ? "Free at level " + item.freeLevel + " · " : "") + ex.desc, icon: { skill: ex.id }, chips: chips, dim: !owned });
      rows.push({ title: "Double-tap to Dash", sub: "Off = use the Dash button (safer for fast flapping)", icon: { skill: "dash" },
        chips: [{ label: save.doubleTapDash ? "ON" : "OFF", action: "toggleDoubleTap", fill: save.doubleTapDash ? "rgba(80,160,100,0.9)" : "rgba(255,255,255,0.2)", text: "#fff" }] });
      return rows;
    }
    if (shopTab === 1) {
      const lvNow = Math.max(peak, state === State.PLAY ? level : 0, E.EVO_LEVELS[save.evo | 0]), pr = E.evoProgress(lvNow), st = save.evo | 0;
      const nxtR = E.EVO_REWARDS[st + 1];
      rows.push({ bar: { title: "Stage " + (st + 1) + " of " + E.EVO_LEVELS.length + " · " + E.EVO_NAMES[st], frac: pr.frac, left: "Lv " + pr.level, right: pr.next ? "Lv " + pr.next : "MAX",
        sub: pr.next ? (pr.next - lvNow) + (pr.next - lvNow === 1 ? " level" : " levels") + " to " + E.EVO_NAMES[st + 1] + (nxtR ? " · free: " + nxtR[2] : "") : "Fully evolved. You are a Grand Titan!" } });
      for (let i = 0; i < E.EVO_LEVELS.length; i++) {
        const reached = i <= st, cur = i === st, rw = E.EVO_REWARDS[i];
        rows.push({ title: "Stage " + (i + 1) + " · " + E.EVO_NAMES[i], sub: (i === 0 ? "Where every Phoenix starts" : "Reach level " + E.EVO_LEVELS[i] + " · free upgrade: " + (rw ? rw[2] : "none")),
          icon: { evo: i }, wrap: true, hi: cur, dim: !reached,
          chips: [cur ? { label: "You're here", fill: "rgba(80,160,100,0.85)", text: "#fff" } : reached ? { label: "✓ Reached", fill: "rgba(80,160,100,0.45)", text: "#e8fff0" } : { label: "Lv " + E.EVO_LEVELS[i], fill: "rgba(255,255,255,0.14)", text: "#dfe9f5" }] });
      }
      return rows;
    }
    return rows;
  }
  function buildShopRowsOld() {
    const rows = [];
    const peak = peakLevel();
    if (shopTab === 0) {
      for (const u of E.UPGRADES) {
        const t = E.upgradeTier(save, u.id);
        const max = u.prices.length;
        const anySkill = E.SKILLS.some((k) => skillOwned(k.id));
        const locked = (u.skill && !skillOwned(u.skill)) || (u.needsAnySkill && !anySkill);
        const cur = u.values[t];
        let sub;
        if (locked) sub = "Unlock " + E.SKILL_BY_ID[u.skill || "dash"].name + " first (best level " + E.SKILL_BY_ID[u.skill || "dash"].unlockLevel + ")";
        else if (t >= max) sub = "MAX · " + upgradeValueText(u, cur) + " " + UPGRADE_UNIT[u.id];
        else sub = upgradeValueText(u, cur) + " → " + upgradeValueText(u, u.values[t + 1]) + " " + UPGRADE_UNIT[u.id];
        const chips = [];
        if (locked) chips.push({ label: "🔒 Locked", fill: "rgba(80,80,90,0.55)", text: "#ccd" });
        else if (t >= max) chips.push({ label: "MAX", fill: "rgba(80,160,100,0.7)", text: "#fff" });
        else chips.push(priceChip(u.prices[t], "buyUpgrade", u.id));
        rows.push({ title: u.name, sub: sub, pips: [t, max], icon: u.skill ? { skill: u.skill } : { coin: u.id === "lucky", skill: u.id === "recharge" ? "dash" : null }, chips: chips, dim: locked });
      }
    } else if (shopTab === 1) {
      for (const sk of E.SKILLS) {
        const owned = skillOwned(sk.id);
        const st = skillStatsFor(sk.id);
        const chips = [];
        let sub;
        if (owned) {
          sub = "Cooldown " + st.cd + "s" + (sk.id === "dash" ? "" : " · lasts " + st.dur + "s") + (finePointer ? " · key " + sk.key : "");
          chips.push({ label: "Unlocked ✓", fill: "rgba(80,160,100,0.7)", text: "#fff" });
        } else {
          sub = "Free at best Lv " + sk.unlockLevel + " (you: " + peak + ")";
          chips.push(priceChip(sk.coinPrice, "buySkill", sk.id));
          const ad = adChip(unlockProgress["skill_" + sk.id] | 0, sk.adWatches, "skillAd", sk.id);
          if (ad) chips.push(ad);
        }
        rows.push({ title: sk.name, sub: sk.desc, sub2: sub, icon: { skill: sk.id }, chips: chips, dim: !owned });
      }
      for (const ex of E.EXTRA_SKILLS) {
        const item = CATALOG_BY_ID[ex.catalogId];
        const owned = isOwned(ex.catalogId);
        const chips = [];
        const st = skillStatsFor(ex.id);
        let sub;
        if (owned) {
          sub = (ex.id === "ghost" ? ghostMaxCharges() + " charges per run · " + GHOST_PIPES + " pipes each · recharges" : "Cooldown " + st.cd + "s") + (finePointer ? " · key " + ex.key : "");
          chips.push({ label: "Unlocked ✓", fill: "rgba(80,160,100,0.7)", text: "#fff" });
        } else {
          sub = (item.freeLevel ? "Free at level " + item.freeLevel + " · " : "") + ex.desc;
          chips.push(priceChip(catalogCoinPrice(ex.catalogId), "buyCatalog", ex.catalogId));
          const ad = adChip(progressFor(ex.catalogId), item.watches, canNativeUnlockAd() ? "watch" : "simulate", ex.catalogId);
          if (ad) chips.push(ad);
        }
        rows.push({ title: ex.name, sub: ex.desc, sub2: sub, icon: { skill: ex.id }, chips: chips, dim: !owned });
      }
      rows.push({ title: "Double-tap to Dash", sub: "Off = use the Dash button (safer for fast flapping)", icon: { skill: "dash" },
        chips: [{ label: save.doubleTapDash ? "ON" : "OFF", action: "toggleDoubleTap", fill: save.doubleTapDash ? "rgba(80,160,100,0.9)" : "rgba(255,255,255,0.2)", text: "#fff" }] });
    } else {
      rows.push({ header: "Bird skins" });
      for (const it of CATALOG) {
        if (it.kind !== "bird") continue;
        const owned = isOwned(it.id);
        const equipped = unlocks.equippedBird === it.id;
        const chips = [];
        if (owned) {
          chips.push(equipped ? { label: "Equipped", fill: "rgba(80,160,100,0.8)", text: "#fff" } : { label: "Equip", action: "equip", itemId: it.id, fill: "rgba(255,200,60,0.92)", text: "#3a2800" });
        } else {
          const price = catalogCoinPrice(it.id);
          if (price != null) chips.push(priceChip(price, "buyCatalog", it.id));
          if (it.watches > 0) {
            const ad = adChip(progressFor(it.id), it.watches, canNativeUnlockAd() ? "watch" : "simulate", it.id);
            if (ad) chips.push(ad);
          }
        }
        const name = it.id === "bird_default" ? "Natural colors" : (it.isNew110 && !owned ? "NEW · " + it.name : it.name);
        const sub = it.id === "bird_default" ? "Each bird's own look; evolves every 10 pipes" : (it.blurb || "Keeps these colors through evolutions");
        rows.push({ title: name, sub: sub, icon: { skin: it.id }, chips: chips, hi: equipped });
      }
    }
    return rows;
  }

  const NODE_COL = { dash: "#ff9f43", shield: "#74c0fc", magnet: "#ff6b9a", shrink: "#b197fc", recharge: "#9be7ff", glide: "#c9f2ff", second: "#7dffb0", coins: "#ffd24a", reach: "#ffe08a", rocket: "#ff8a4c", power: "#ffb86b", pellets: "#ff2d8a", pop: "#7a4cff", poof: "#2ee6b0", cannon: "#ff4d4d", rotor: "#9be7ff", rapid: "#b39dff", bounty: "#ffd24a", crumble: "#c9a066" };
  function drawNodeIcon(id, x, y) {
    const col = NODE_COL[id] || "#fff";
    if (id === "dash" || id === "shield" || id === "magnet" || id === "shrink") { drawRowIcon({ skill: id }, x, y); return; }
    ctx.fillStyle = "rgba(255,255,255,0.1)"; ctx.beginPath(); ctx.arc(x, y, 17, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (id === "coins" || id === "reach") { ctx.restore(); drawCoinIcon(x, y, 9.5, 1); if (id === "reach") { ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(x, y, 14.5, 0, Math.PI * 2); ctx.stroke(); } return; }
    ctx.beginPath();
    if (id === "glide") { ctx.moveTo(-9, 3); ctx.quadraticCurveTo(-2, -9, 9, -4); ctx.quadraticCurveTo(2, -2, 3, 6); ctx.quadraticCurveTo(-2, 1, -9, 3); ctx.fill(); }
    else if (id === "second") { ctx.moveTo(0, 8); ctx.bezierCurveTo(-13, -1, -7, -10, 0, -3); ctx.bezierCurveTo(7, -10, 13, -1, 0, 8); ctx.fill(); }
    else if (id === "rocket" || id === "pop") { ctx.moveTo(8, 0); ctx.lineTo(-4, -5); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.fillStyle = "#ffd24a"; ctx.moveTo(-5, -3); ctx.lineTo(-10, 0); ctx.lineTo(-5, 3); ctx.closePath(); ctx.fill(); if (id === "pop") { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(9, -8, 1.8, 0, 7); ctx.arc(10, 7, 1.8, 0, 7); ctx.fill(); } }
    else if (id === "poof") { ctx.arc(-1, 2, 7.4, 0, 7); ctx.fill(); ctx.fillRect(-5, -9, 8, 3.4); ctx.beginPath(); ctx.lineWidth = 1.8; ctx.arc(6, -7, 3, 0, 7); ctx.stroke(); ctx.fillStyle = "#ff5fa2"; ctx.fillRect(8, 4, 3, 3); ctx.fillStyle = "#ffd000"; ctx.fillRect(5, 9, 3, 3); }
    else if (id === "pellets") { ctx.arc(-6, 0, 3.2, 0, 7); ctx.fill(); ctx.beginPath(); ctx.fillStyle = "#ffd000"; ctx.arc(1, -3, 3.2, 0, 7); ctx.fill(); ctx.beginPath(); ctx.fillStyle = "#00cfff"; ctx.arc(8, 2, 3.2, 0, 7); ctx.fill(); }
    else if (id === "power") { for (let i = 0; i < 10; i++) { const r = i % 2 ? 4.2 : 10, ang = -Math.PI / 2 + i * Math.PI / 5; ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r); } ctx.closePath(); ctx.fill(); }
    else if (id === "cannon") { ctx.fillRect(-9, -2, 14, 6); ctx.beginPath(); ctx.fillStyle = "#fff"; ctx.fillRect(5, -3, 5, 8); ctx.beginPath(); ctx.fillStyle = "#ff5fa2"; ctx.arc(-9, 6, 3.4, 0, 7); ctx.fill(); }
    else if (id === "rotor") { ctx.moveTo(-11, -6); ctx.lineTo(11, -6); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, -1); ctx.stroke(); ctx.beginPath(); ctx.ellipse(0, 4, 6.5, 4.5, 0, 0, Math.PI * 2); ctx.fill(); }
    else if (id === "rapid") { for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-9 + i * 6, -6); ctx.lineTo(-3 + i * 6, 0); ctx.lineTo(-9 + i * 6, 6); ctx.stroke(); } }
    else if (id === "bounty") { ctx.restore(); drawCoinIcon(x, y, 8.5, 1); ctx.save(); ctx.translate(x, y); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(9, -9, 2.2, 0, 7); ctx.arc(-10, 7, 1.8, 0, 7); ctx.fill(); }
    else if (id === "crumble") { ctx.fillRect(-9, -8, 8, 8); ctx.fillRect(1, -4, 8, 8); ctx.fillRect(-6, 2, 6, 6); }
    else if (id === "recharge") { ctx.arc(0, 0, 7.5, 0.5, Math.PI * 1.7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(4, -10); ctx.lineTo(8, -5); ctx.lineTo(1.5, -4); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
  function drawEvoBarRow(b, y, rh) {
    ctx.fillStyle = "rgba(255,120,40,0.18)"; roundRect(18, y + 3, W - 36, rh - 6, 10); ctx.fill();
    ctx.strokeStyle = "rgba(255,170,50,0.85)"; ctx.lineWidth = 1.5; roundRect(18, y + 3, W - 36, rh - 6, 10); ctx.stroke();
    ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillStyle = "#fff"; ctx.font = "bold 14px " + FONT;
    ctx.fillText(fitText(b.title, W - 60), 30, y + 17);
    const bx = 30, bw = W - 60;
    ctx.fillStyle = "rgba(0,0,0,0.35)"; roundRect(bx, y + 27, bw, 11, 5); ctx.fill();
    if (b.frac > 0.01) { ctx.fillStyle = "#ff9a2a"; roundRect(bx + 1, y + 28, Math.max(8, (bw - 2) * b.frac), 9, 4); ctx.fill(); }
    ctx.font = "bold 9px " + FONT; ctx.fillStyle = "#cfe6ff"; ctx.textAlign = "left"; ctx.fillText(b.left, bx, y + 47);
    ctx.textAlign = "right"; ctx.fillText(b.right, bx + bw, y + 47);
    ctx.font = "11px " + FONT; ctx.fillStyle = "#ffe08a"; ctx.textAlign = "center"; ctx.fillText(fitText(b.sub, bw - 70), W / 2, y + 47);
  }
  function drawRowIcon(icon, x, y) {
    if (!icon) return;
    if (icon.node) { drawNodeIcon(icon.node, x, y); return; }
    if (icon.evo != null) {
      ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.fill();
      ctx.save(); if (icon.evo > (save.evo | 0)) ctx.globalAlpha = 0.45;
      drawBirdPreview(x + 4, y + 1, 0.72, evoRowIcon(icon.evo), 0);
      ctx.restore(); return;
    }
    if (icon.skill) {
      const def = E.SKILL_BY_ID[icon.skill];
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.beginPath();
      ctx.arc(x, y, 17, 0, Math.PI * 2);
      ctx.fill();
      drawSkillIcon(icon.skill, x, y, 10, def ? def.color : "#fff");
    } else if (icon.coin) {
      drawCoinIcon(x, y, 12, 1);
    } else if (icon.skin) {
      const pal = icon.skin === "bird_default"
        ? speciesPreviewPalette(save.speciesEquipped)
        : Object.assign({}, BIRD_PALETTES[icon.skin], { evo: evolutionMeta(0), birdId: icon.skin, species: save.speciesEquipped });
      drawBirdPreview(x, y + 1, 0.8, pal, 0);
    } else if ("trail" in icon) {
      const id = icon.trail;
      for (let i = 0; i < 5; i++) {
        let c = "rgba(255,255,255,0.25)";
        if (id === "spark") c = "#ffd54a";
        else if (id === "rainbow") c = "hsl(" + i * 60 + ",90%,62%)";
        else if (id === "bubbles") c = "rgba(200,240,255,0.85)";
        else if (id === "stars") c = i % 2 ? "#fff6b0" : "#ffffff";
        else if (id === "fire") c = i % 2 ? "#ff7a1a" : "#ffd23a";
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(x + 12 - i * 6, y + Math.sin(i) * 3, 3.2 - i * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawChip(c, x, y, w, h) {
    ctx.fillStyle = c.fill;
    roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.fillStyle = c.text || "#fff";
    ctx.font = "bold 12px " + FONT;
    ctx.textBaseline = "middle";
    if (c.coin) {
      drawCoinIcon(x + 13, y + h / 2, 6.5, 1);
      ctx.textAlign = "center";
      ctx.fillText(c.label, x + w / 2 + 7, y + h / 2 + 0.5);
    } else {
      ctx.textAlign = "center";
      ctx.fillText(fitText(c.label, w - 6), x + w / 2, y + h / 2 + 0.5);
    }
  }

  function drawShopScreen() {
    ctx.fillStyle = "rgba(10,20,35,0.93)";
    ctx.fillRect(0, 0, W, H);
    uiButtons.rows = [];
    uiButtons.tabs = [];
    drawBackButton();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 24px " + FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("Skills & Evolution", W / 2, 44);
    drawCoinPill(W - 14, 22, save.coins, "right", coinPop);
    // Birds shortcut
    uiButtons.birdsTop = null;

    const tabs = ["🌳 Skills", "🧬 Evolution"];
    const tw = (W - 40) / 2;
    tabs.forEach(function (t, i) {
      const x = 20 + i * tw;
      const on = shopTab === i;
      const r = drawButton(x + 2, 84, tw - 4, 30, t, on ? "rgba(255,200,60,0.95)" : "rgba(255,255,255,0.12)", on ? "#3a2800" : "#dde", "bold 13px " + FONT);
      r.action = "tab";
      r.tab = i;
      uiButtons.tabs.push(r);
    });

    const rows = buildShopRows();
    shopRowCount = rows.length;
    clampShopScroll();
    const top = SHOP_LIST_TOP;
    const bot = SHOP_LIST_BOT;
    const rh = SHOP_ROW_H;
    ctx.save();
    ctx.beginPath();
    ctx.rect(10, top, W - 20, bot - top);
    ctx.clip();
    const i0 = Math.max(0, Math.floor(shopScroll / rh));
    const i1 = Math.min(rows.length, i0 + Math.ceil((bot - top) / rh) + 1);
    for (let i = i0; i < i1; i++) {
      const row = rows[i];
      const y = top + i * rh - shopScroll;
      if (row.header) {
        ctx.fillStyle = "#ffe08a";
        ctx.font = "bold 13px " + FONT;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(row.header, 24, y + rh / 2 + 8);
        continue;
      }
      if (row.bar) { drawEvoBarRow(row.bar, y, rh); continue; }
      ctx.fillStyle = row.hi ? "rgba(80,180,120,0.22)" : row.dim ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.1)";
      roundRect(18, y + 3, W - 36, rh - 6, 10);
      ctx.fill();
      drawRowIcon(row.icon, 42, y + rh / 2);
      const chips = row.chips || [];
      const cw = row.wrap ? 74 : (chips.length > 1 ? 66 : 88);
      const chipsW = chips.length * cw + Math.max(0, chips.length - 1) * 6;
      const textW = W - 28 - chipsW - 70 - 8;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "bold 13px " + FONT;
      ctx.fillStyle = row.dim ? "rgba(210,220,230,0.75)" : "#eef6ff";
      const two = !!(row.pips || row.sub2);
      if (row.wrap) {
        // v1.17 wrapped rows: title, two lines of text, optional level pips
        ctx.fillText(fitText(row.title, textW), 66, y + 15);
        ctx.font = "10.5px " + FONT;
        ctx.fillStyle = row.dim ? "rgba(170,180,190,0.7)" : "rgba(200,230,255,0.85)";
        wrapLines(row.sub || "", textW, 2).forEach(function (ln, k) { ctx.fillText(ln, 66, y + 29 + k * 12); });
        if (row.pips) {
          const pw2 = Math.min(14, Math.floor((textW - 2) / row.pips[1]) - 1);
          for (let k = 0; k < row.pips[1]; k++) {
            ctx.fillStyle = k < row.pips[0] ? "#ffc93a" : "rgba(255,255,255,0.18)";
            roundRect(66 + k * (pw2 + 2), y + 51, pw2, 5, 2.5);
            ctx.fill();
          }
        }
      } else {
      ctx.fillText(fitText(row.title, textW), 66, y + rh / 2 - (two ? 14 : 9));
      ctx.font = "11px " + FONT;
      ctx.fillStyle = row.dim ? "rgba(170,180,190,0.65)" : "rgba(200,230,255,0.75)";
      ctx.fillText(fitText(row.sub || "", textW), 66, y + rh / 2 + (two ? 2 : 9));
      if (row.sub2) {
        ctx.fillStyle = row.dim ? "#ffe08a" : "rgba(160,255,200,0.8)";
        ctx.fillText(fitText(row.sub2, textW), 66, y + rh / 2 + 17);
      }
      if (row.pips) {
        for (let k = 0; k < row.pips[1]; k++) {
          ctx.fillStyle = k < row.pips[0] ? "#ffc93a" : "rgba(255,255,255,0.18)";
          roundRect(66 + k * 16, y + rh / 2 + 14, 12, 6, 3);
          ctx.fill();
        }
      }
      }
      let cx = W - 28 - chipsW;
      for (const c of chips) {
        const ch = 30;
        const cy = y + (rh - ch) / 2;
        drawChip(c, cx, cy, cw, ch);
        if (c.action && cy + ch > top && cy < bot) uiButtons.rows.push({ x: cx, y: Math.max(top, cy), w: cw, h: ch, action: c.action, itemId: c.itemId });
        cx += cw + 6;
      }
    }
    ctx.restore();
    drawShopToast();
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "11px " + FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(isBrowserPlay() ? "Web preview: 'Demo' = ad stand-in · Esc to close" : (canNativeUnlockAd() ? "▶ Ad = watch a rewarded video ad · drag to scroll" : "Coins from runs & missions · drag to scroll"), W / 2, H - 10);
  }

  function drawShopToast(ty) {
    if (shopToast > 0.05 && shopToastText) {
      const y = ty == null ? H - 62 : ty;
      ctx.save();
      ctx.globalAlpha = Math.min(1, shopToast);
      ctx.fillStyle = "rgba(0,0,0,0.85)";
      roundRect(W / 2 - 130, y, 260, 28, 8);
      ctx.fill();
      ctx.fillStyle = "#ffe566";
      ctx.font = "bold 13px " + FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(fitText(shopToastText, 250), W / 2, y + 14);
      ctx.restore();
    }
  }

  // —— Bird select ——
  /** v1.15: one bird's perk page: what it does, its evolution, and its 3 coin-bought upgrade levels. */
  function drawBirdPerks() {
    const sp = E.SPECIES_BY_ID[perkView] || E.SPECIES_BY_ID.sparrow;
    const def = E.BIRD_PERKS[sp.id];
    const peak = peakLevel();
    const owned = E.isSpeciesOwned(save, sp.id, peak);
    const sel = save.speciesEquipped === sp.id;
    const lv = E.birdPerkLevel(save, sp.id);
    ctx.fillStyle = "rgba(10,20,35,0.95)";
    ctx.fillRect(0, 0, W, H);
    uiButtons.rows = [];
    uiButtons.tabs = null;
    drawBackButton();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 22px " + FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(sp.name + " Perks", W / 2, 44);
    drawCoinPill(W - 14, 22, save.coins, "right", coinPop);
    // header card: bird + base perk + select
    ctx.fillStyle = sel ? "rgba(80,180,120,0.22)" : "rgba(255,255,255,0.08)";
    roundRect(16, 58, W - 32, 96, 14); ctx.fill();
    if (sel) { ctx.strokeStyle = "#7dffb0"; ctx.lineWidth = 2; roundRect(16, 58, W - 32, 96, 14); ctx.stroke(); }
    ctx.save();
    if (!owned) ctx.globalAlpha = 0.6;
    drawBirdPreview(76, 108, 1.7, speciesPreviewPalette(sp.id), frame);
    ctx.restore();
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#fff"; ctx.font = "bold 16px " + FONT;
    ctx.fillText(def.title, 134, 82);
    ctx.font = "11px " + FONT; ctx.fillStyle = "#bfe4ff";
    ctx.fillText("Bird perk:", 134, 98);
    wrapLines(sp.perk, W - 32 - 134 + 8, 2).forEach(function (ln, k) { ctx.fillText(ln, 134, 112 + k * 13); });
    ctx.fillStyle = "#ffe08a"; ctx.font = "bold 11px " + FONT;
    ctx.fillText(lv >= 3 ? "Perk level: MAX" : "Perk level: " + lv + " / 3", 134, 146);
    if (owned && !sel) {
      const c = { label: "Select", fill: "rgba(255,200,60,0.95)", text: "#3a2800" };
      drawChip(c, W - 16 - 84, 124, 72, 24);
      uiButtons.rows.push({ x: W - 16 - 84, y: 124, w: 72, h: 24, action: "selectSpecies", itemId: sp.id });
    } else if (sel) {
      drawChip({ label: "Selected", fill: "rgba(80,160,100,0.85)", text: "#fff" }, W - 16 - 84, 124, 72, 24);
    }
    // evolution strip: shape grows with the form
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    roundRect(16, 162, W - 32, 76, 12); ctx.fill();
    ctx.textAlign = "center"; ctx.fillStyle = "rgba(200,225,255,0.85)"; ctx.font = "10.5px " + FONT;
    ctx.fillText("Evolves as you level up: wings grow, tail lengthens, a crest sprouts", W / 2, 177);
    const steps = [0, 2, 4, 6, 9];
    steps.forEach(function (t, i) {
      const px = 16 + (W - 32) * (i + 0.5) / steps.length;
      const pal = Object.assign({}, speciesPreviewPalette(sp.id), { evo: evolutionMeta(t * 10) });
      drawBirdPreview(px, 208, 0.82, pal, frame * 0.5 + i * 7);
      ctx.fillStyle = "rgba(200,225,255,0.65)"; ctx.font = "9px " + FONT; ctx.textAlign = "center";
      ctx.fillText(t * 10 + " pipes", px, 232);
    });
    // three upgrade levels
    const rx = 16, rw = W - 32, rh = 78, ry0 = 246;
    def.levels.forEach(function (L, i) {
      const y = ry0 + i * (rh + 6);
      const have = lv > i, next = lv === i;
      ctx.fillStyle = have ? "rgba(80,180,120,0.2)" : next ? "rgba(255,255,255,0.11)" : "rgba(255,255,255,0.04)";
      roundRect(rx, y, rw, rh, 12); ctx.fill();
      if (have) { ctx.strokeStyle = "rgba(125,255,176,0.8)"; ctx.lineWidth = 1.5; roundRect(rx, y, rw, rh, 12); ctx.stroke(); }
      else if (next) { ctx.strokeStyle = "rgba(255,200,60,0.75)"; ctx.lineWidth = 1.5; roundRect(rx, y, rw, rh, 12); ctx.stroke(); }
      // level badge
      ctx.fillStyle = have ? "#4fd68a" : next ? "#ffc83c" : "rgba(255,255,255,0.2)";
      ctx.beginPath(); ctx.arc(rx + 24, y + rh / 2, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = have || next ? "#12212e" : "rgba(255,255,255,0.75)";
      ctx.font = "bold 15px " + FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(have ? "✓" : String(i + 1), rx + 24, y + rh / 2 + 1);
      ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      ctx.fillStyle = have || next ? "#fff" : "rgba(255,255,255,0.55)";
      ctx.font = "bold 14px " + FONT;
      ctx.fillText(L.name, rx + 48, y + 20);
      ctx.font = "11px " + FONT;
      ctx.fillStyle = have || next ? "#cfe6ff" : "rgba(200,220,245,0.5)";
      wrapLines(L.desc, rw - 48 - 100, 4).forEach(function (ln, k) { ctx.fillText(ln, rx + 48, y + 36 + k * 13); });
      // status / buy
      const bx = rx + rw - 90, bw = 80;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      if (have) {
        ctx.fillStyle = "#7dffb0"; ctx.font = "bold 12px " + FONT;
        ctx.fillText("Owned", bx + bw / 2, y + rh / 2);
      } else if (next && owned) {
        const chip = priceChip(E.BIRD_PERK_PRICES[i], "buyBirdPerk", sp.id);
        drawChip(chip, bx, y + rh / 2 - 15, bw, 30);
        uiButtons.rows.push({ x: bx, y: y + rh / 2 - 15, w: bw, h: 30, action: "buyBirdPerk", itemId: sp.id });
      } else if (next) {
        ctx.fillStyle = "rgba(255,224,138,0.85)"; ctx.font = "bold 10.5px " + FONT;
        ctx.fillText("Get the bird", bx + bw / 2, y + rh / 2 - 7);
        ctx.fillText("first", bx + bw / 2, y + rh / 2 + 7);
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.font = "bold 11px " + FONT;
        ctx.fillText("🔒 " + E.BIRD_PERK_PRICES[i], bx + bw / 2, y + rh / 2);
      }
    });
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(200,225,255,0.7)"; ctx.font = "10.5px " + FONT;
    ctx.fillText("Perks apply to the selected bird from Level 21 on, and pause on boss levels.", W / 2, ry0 + 3 * (rh + 6) + 10);
    ctx.fillText("Upgrades cost coins you earn by playing. Levels 1–20 play exactly as before.", W / 2, ry0 + 3 * (rh + 6) + 25);
    drawShopToast(58);
  }

  function drawBirdsScreen() {
    if (perkView) { drawBirdPerks(); return; }
    ctx.fillStyle = "rgba(10,20,35,0.93)";
    ctx.fillRect(0, 0, W, H);
    uiButtons.rows = [];
    uiButtons.tabs = null;
    drawBackButton();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 24px " + FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("Birds", W / 2, 44);
    drawCoinPill(W - 14, 22, save.coins, "right", coinPop);
    ctx.font = "11px " + FONT;
    ctx.fillStyle = "rgba(200,225,255,0.8)";
    ctx.fillText("Each bird has a perk · tap a bird for its upgrades", W / 2, 72);

    const peak = peakLevel();
    const cw = 176, chh = 160, gx = 16, x0 = (W - cw * 2 - gx) / 2, y0 = 84;
    E.SPECIES.forEach(function (sp, i) {
      const col = i % 2;
      const rowI = Math.floor(i / 2);
      const x = x0 + col * (cw + gx);
      const y = y0 + rowI * (chh + 8);
      const owned = E.isSpeciesOwned(save, sp.id, peak);
      const sel = save.speciesEquipped === sp.id;
      ctx.fillStyle = sel ? "rgba(80,180,120,0.25)" : "rgba(255,255,255,0.08)";
      roundRect(x, y, cw, chh, 14);
      ctx.fill();
      if (sel) {
        ctx.strokeStyle = "#7dffb0";
        ctx.lineWidth = 2;
        roundRect(x, y, cw, chh, 14);
        ctx.stroke();
      }
      ctx.save();
      if (!owned) ctx.globalAlpha = 0.55;
      drawBirdPreview(x + cw / 2, y + 40, 1.45, speciesPreviewPalette(sp.id), frame + i * 13);
      ctx.restore();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 15px " + FONT;
      ctx.fillStyle = "#fff";
      ctx.fillText(sp.name, x + cw / 2, y + 82);
      ctx.font = "11px " + FONT;
      ctx.fillStyle = "#bfe4ff";
      const lines = wrapLines(sp.perk, cw - 16, 2);
      lines.forEach(function (ln, k) { ctx.fillText(ln, x + cw / 2, y + 100 + k * 14); });
      const chipY = y + chh - 34;
      let chip;
      if (sel) chip = { label: "Selected", fill: "rgba(80,160,100,0.85)", text: "#fff" };
      else if (owned) chip = { label: "Select", action: "selectSpecies", itemId: sp.id, fill: "rgba(255,200,60,0.95)", text: "#3a2800" };
      else chip = priceChip(sp.price, "buySpecies", sp.id);
      const chipW = owned || sel ? cw - 40 : 82;
      const chipX = owned || sel ? x + 20 : x + 10;
      drawChip(chip, chipX, chipY, chipW, 26);
      if (chip.action) uiButtons.rows.push({ x: chipX, y: chipY, w: chipW, h: 26, action: chip.action, itemId: sp.id });
      if (!owned) {
        ctx.font = "bold 11px " + FONT;
        ctx.fillStyle = "#ffe08a";
        ctx.textAlign = "center";
        ctx.fillText("or 🏆 Level " + sp.trophyLevel, x + cw - 46, chipY + 13);
      }
      // v1.15: perk level pill (top-right) + the whole card opens the bird's upgrade page
      const plv = E.birdPerkLevel(save, sp.id);
      ctx.fillStyle = plv > 0 ? "rgba(255,200,60,0.9)" : "rgba(255,255,255,0.16)";
      roundRect(x + cw - 50, y + 7, 42, 17, 8); ctx.fill();
      ctx.fillStyle = plv > 0 ? "#3a2800" : "#dbeaff";
      ctx.font = "bold 10px " + FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("★ " + plv + "/3", x + cw - 29, y + 16);
      uiButtons.rows.push({ x: x, y: y, w: cw, h: chh, action: "openPerks", itemId: sp.id });
    });
    drawShopToast(58);
  }

  // —— Missions detail ——
  function drawMissionsScreen() {
    ctx.fillStyle = "rgba(10,20,35,0.93)";
    ctx.fillRect(0, 0, W, H);
    drawBackButton();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 24px " + FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("Daily Missions", W / 2, 44);
    drawCoinPill(W - 14, 22, save.coins, "right", coinPop);
    const daily = ensureDaily();
    const streak = daily ? daily.streak | 0 : 0;
    const mult = E.streakMultiplier(streak);
    const now = new Date();
    const mid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const mins = Math.max(0, Math.floor((mid - now) / 60000));
    ctx.font = "12px " + FONT;
    ctx.fillStyle = "rgba(200,225,255,0.85)";
    ctx.fillText("New missions in " + Math.floor(mins / 60) + "h " + (mins % 60) + "m  ·  🔥 streak " + streak + (mult > 1 ? " (+" + Math.round((mult - 1) * 100) + "% rewards)" : ""), W / 2, 72);

    const ms = ensureMissions();
    let y = 90;
    ms.list.forEach(function (m) {
      ctx.fillStyle = m.done ? "rgba(80,180,120,0.22)" : "rgba(255,255,255,0.08)";
      roundRect(20, y, W - 40, 78, 12);
      ctx.fill();
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "bold 16px " + FONT;
      ctx.fillStyle = m.done ? "#7dffb0" : "#fff";
      ctx.fillText((m.done ? "✓ " : "") + m.label, 36, y + 22);
      ctx.font = "11px " + FONT;
      ctx.fillStyle = "rgba(200,225,255,0.7)";
      ctx.fillText(m.scope === "run" ? "In a single run" : "Total today, across runs", 36, y + 40);
      const f = Math.min(1, m.progress / m.target);
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      roundRect(36, y + 52, W - 170, 12, 6);
      ctx.fill();
      if (f > 0) {
        ctx.fillStyle = m.done ? "#46d98a" : "#ffc93a";
        roundRect(36, y + 52, Math.max(12, (W - 170) * f), 12, 6);
        ctx.fill();
      }
      ctx.font = "bold 12px " + FONT;
      ctx.fillStyle = "#fff";
      ctx.fillText(m.progress + " / " + m.target, W - 124, y + 58);
      const reward = m.paid || Math.round(m.reward * mult);
      drawCoinIcon(W - 60, y + 30, 9, 1);
      ctx.font = "bold 15px " + FONT;
      ctx.fillStyle = "#ffe27a";
      ctx.fillText("+" + reward, W - 48, y + 31);
      y += 88;
    });
    // bonus + daily challenge tie-in
    ctx.fillStyle = ms.bonusGiven ? "rgba(255,210,74,0.22)" : "rgba(255,255,255,0.06)";
    roundRect(20, y, W - 40, 62, 12);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.font = "bold 14px " + FONT;
    ctx.fillStyle = "#ffd24a";
    ctx.fillText((ms.bonusGiven ? "✓ " : "") + "Finish all 3: +" + E.ALL_MISSIONS_BONUS + " bonus", 36, y + 22);
    ctx.font = "11px " + FONT;
    ctx.fillStyle = "rgba(255,240,200,0.8)";
    ctx.fillText("…and it counts as today's Daily — keeps your 🔥 streak going", 36, y + 42);
    y += 72;
    if (daily && daily.challenge) {
      ctx.fillStyle = "rgba(0,30,60,0.6)";
      roundRect(20, y, W - 40, 52, 12);
      ctx.fill();
      ctx.font = "bold 13px " + FONT;
      ctx.fillStyle = daily.completed ? "#7dffb0" : "#ffe08a";
      ctx.fillText((daily.completed ? "✓ " : "") + "Daily challenge: " + daily.challenge.label, 36, y + 19);
      ctx.font = "11px " + FONT;
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillText("Reward: +1 free continue 🎫 · streak multiplies mission coins", 36, y + 37);
    }
  }

  // —— Fit canvas ——
  let lastFitW = 0;
  let lastFitH = 0;
  function fitCanvas() {
    canvasRectCache = null;
    const wrap = document.getElementById("game-wrap");
    // v1.8: fit inside the content box. clientWidth/clientHeight include #game-wrap's padding-bottom
    // (--ad-banner-pad), so sizing from them made the canvas taller than the space above the banner
    // and CSS max-height then squashed it (inner Fold screen).
    const cs = getComputedStyle(wrap);
    const aw = wrap.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    const ah = wrap.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
    const scale = Math.min(aw / W, ah / H);
    const dw = Math.floor(W * scale);
    const dh = Math.floor(H * scale);
    if (dw === lastFitW && dh === lastFitH) return;
    lastFitW = dw;
    lastFitH = dh;
    hitchNote("resize");
    canvas.style.width = dw + "px";
    canvas.style.height = dh + "px";
    applyRenderScale(dw / W);
  }
  let resizeQueued = false;
  function queueFit() {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(function () { resizeQueued = false; fitCanvas(); });
  }
  window.addEventListener("resize", queueFit);
  window.addEventListener("orientationchange", queueFit);
  // v1.8: banner padding changes fire no window "resize" (the native banner is an overlay), so
  // re-fit (and drop the cached rect) whenever ads.js changes --ad-banner-pad: its own event, a
  // MutationObserver on <html style> as a second path, and a ResizeObserver on #game-wrap as backstop.
  function onLayoutShift() { canvasRectCache = null; queueFit(); }
  window.addEventListener("skyhop:bannerpad", onLayoutShift);
  try {
    if (typeof MutationObserver === "function") {
      new MutationObserver(onLayoutShift).observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
    }
  } catch (_) {}
  try {
    if (typeof ResizeObserver === "function") new ResizeObserver(onLayoutShift).observe(document.getElementById("game-wrap"));
  } catch (_) {}
  fitCanvas();

  // —— Loop (fixed 60 Hz simulation; renders every display frame) ——
  // Keeps game speed identical on 60/90/120 Hz phones; caps catch-up after tab switches.
  // Rendering extrapolates the scrolling world by the leftover fraction of a step
  // (renderAlpha) so 90/120 Hz displays get smooth motion instead of 2-1-2 judder.
  let lastTs = 0;
  let acc = 0;
  let renderAlpha = 0;
  const REFRESH_MS = [1000 / 120, 1000 / 60, 1000 / 90, 1000 / 144];
  function loop(ts) {
    requestAnimationFrame(loop);
    const tWork = performance.now();
    if (!lastTs) lastTs = ts || 0;
    const rawDt = Math.max(0, (ts || 0) - lastTs);
    // Snap near-exact refresh intervals (60/90/120/144 Hz) so timestamp jitter never
    // produces a 2-steps-then-0 pattern (judder) at high refresh rates.
    let dt = Math.min(100, rawDt);
    for (let k = 0; k < REFRESH_MS.length; k++) {
      const c = REFRESH_MS[k];
      const n = Math.round(dt / c);
      if (n >= 1 && n <= 3 && Math.abs(dt - n * c) < 0.9) { dt = n * c; break; }
    }
    lastTs = ts || 0;
    acc += dt;
    let steps = 0;
    while (acc >= STEP_MS - 1 && steps < 5) {
      update();
      acc -= STEP_MS;
      steps++;
    }
    if (acc > STEP_MS * 2) acc = 0;
    if (acc < -STEP_MS) acc = 0;
    renderAlpha = pauseMode ? 0 : Math.max(0, Math.min(1, acc / STEP_MS)); // paused: no extrapolated motion
    perfSample(rawDt);
    // Low quality on a high-refresh screen: only redraw when the simulation advanced.
    if (steps === 0 && quality >= 2 && frameCount > 2) { sfxThisFrame = 0; hitchFrame(rawDt, performance.now() - tWork); return; }
    frameCount++;
    render();
    if (ITCH_BUILD) syncPlayLink();
    // Pre-measure the HUD strings the NEXT pipe will need (level-up text, goal chip, streak) on a
    // spare frame (at 90/120 Hz: a frame with no sim step), so a level-up frame doesn't stack
    // text shaping on top of sounds, missions and trophy work.
    if (state === State.PLAY && (frame % 6) === 0) warmNextWorld();
    if (state === State.PLAY && prewarmFor !== score) {
      if (steps === 0 || prewarmWait++ >= 1) { prewarmWait = 0; prewarmFor = score; prewarmHudText(); }
    }
    if (sfxThisFrame) { hitchNote("sound×" + sfxThisFrame); sfxThisFrame = 0; }
    hitchFrame(rawDt, performance.now() - tWork);
  }
  let frameCount = 0;
  let prewarmFor = -1, prewarmWait = 0;
  function prewarmHudText() {
    try {
      const s1 = score + 1;
      const g = goalChipInfo(s1);
      if (g && g.text) measureCached(g.text, "bold 12px " + FONT_FALLBACK);
      const lv1 = levelFromScore(s1);
      if (lv1 > level) {
        const t = "Level " + formatLevel(lv1) + " / " + formatLevel(MAX_LEVEL);
        measureCached(t, "bold 15px " + FONT_FALLBACK);
        measureCached(t, "bold 20px " + FONT_FALLBACK);
      }
      measureCached("×" + (Math.round(scoreMult * 100) / 100) + "  ·  streak " + (cleanStreak + 1), "bold 13px " + FONT_FALLBACK);
      measureCached("Stage 40/40 · Chopper Phoenix", "bold 13px " + FONT_FALLBACK);
    } catch (_) {}
  }

  let warmedAt = 0;
  /** Bake the static sprites up front (and after a render-scale change) so gameplay never pays for it. */
  function warmSprites() {
    warmedAt = renderScale;
    const prev = ctx;
    try {
      stylePipeBody(0, PIPE_W);
      stylePipeCap(0, PIPE_W, false);
      stylePipeCap(0, PIPE_W, true);
      coinSprite(COIN_R, "");
      coinSprite(BIG_COIN_R, "");
      coinSprite(BIG_COIN_R, "5");
      for (const id of SKILL_ORDER) {
        const def = E.SKILL_BY_ID[id];
        const col = def ? def.color : "#fff";
        skillBtnSprite(id, "ready", col);
        skillBtnSprite(id, "active", col);
        skillBtnSprite(id, "cd", col);
      }
      for (let n = 1; n <= 30; n++) cdDigitSprite(n);
      for (let d = 0; d <= 9; d++) { scoreDigit(String(d), "s"); scoreDigit(String(d), "f"); }
      // Allocate the toast / flash slots up front (a first-use canvas allocation mid-run stalled a frame)
      slot("toast", "__warm", W - 30, 26, function () { ctx.font = "bold 12px " + FONT_FALLBACK; ctx.fillText("Warm ⚑✓", 20, 12); });
      for (const nm of ["lvlflash", "mileflash", "evoflash", "trophyflash", "near"]) textSlot(nm, "Warm Level 0123456789", 20, true, "#fff", "#000", 4);
      // Pre-load symbol/emoji glyphs used in run texts (first use of a fallback font can stall a frame)
      const gc = document.createElement("canvas");
      gc.width = 64; gc.height = 32;
      const gx = gc.getContext("2d");
      const glyphs = "⚑✦★✓🔥🏆🎫×·—…→←0123456789+!:/%()' ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz";
      for (const f of ["bold 20px ", "bold 18px ", "bold 17px ", "bold 15px ", "bold 14px ", "bold 13px ", "bold 12px ", "bold 48px "]) {
        gx.font = f + FONT_FALLBACK;
        gx.fillText(glyphs, 0, 20);
        gx.strokeText(glyphs, 0, 20);
      }
    } catch (_) {}
    ctx = prev;
  }

  function render() {
    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    if (warmedAt !== renderScale) {
      drawSky(); drawHills(); drawGround();
      warmSprites();
    }
    if (state === State.TROPHIES || state === State.SHOP || state === State.BIRDS || state === State.MISSIONS) {
      drawSky();
      drawClouds();
      drawHills();
      drawGround();
      if (state === State.TROPHIES) drawTrophiesScreen();
      else if (state === State.SHOP) { drawShopScreen(); drawAdConfirm(); }
      else if (state === State.BIRDS) { drawBirdsScreen(); drawAdConfirm(); }
      else drawMissionsScreen();
      drawParticles();
      return;
    }

    const shakeOn = !pauseMode && screenShake > 0.04 && (state === State.PLAY || state === State.OVER);
    if (shakeOn) {
      ctx.fillStyle = "#2a4055";
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      const mag = screenShake * 5;
      ctx.translate((Math.random() - 0.5) * mag * 2, (Math.random() - 0.5) * mag * 2);
    }

    const playing = state === State.PLAY;
    const shiftX = playing ? pipeSpeed * ws * renderAlpha : 0;
    if (state === State.START && (worldIdx !== 0 || bossOn)) syncWorld(false);
    drawWorldSky();
    drawWorldWeather();
    ctx.save();
    if (shiftX) ctx.translate(-shiftX, 0);
    drawWorldExtras("bg");
    for (let i = 0; i < pipes.length; i++) drawPipe(pipes[i]);
    if (state !== State.START) { drawCoins(); drawPowerups(); drawPathfinder(); drawBlackHoles(); drawShipRockets(); }
    drawWorldExtras("fg");
    drawBurstFx(); drawPuPop();
    ctx.restore();
    drawWorldGround();
    drawBossOverlay();

    if (state === State.START) {
      drawBird();
      drawStart();
      drawStreakPopup();
    } else {
      // Extrapolate the bird's vertical motion by the same fraction of a step
      const by = bird.y;
      if (playing && skillActive("dash") <= 0) bird.y = by + bird.vy * renderAlpha;
      drawPuModeBack();
      drawBird();
      bird.y = by;
      drawWarpFlash();
      drawFx();
      drawScoreHUD();
      // Skill HUD + skill toasts only while playing (never on OVER/START)
      if (state === State.PLAY) {
        drawFireButton();
        drawSkillHud();
        drawGhostCountdown();
        drawPowerupHud();
        drawPuModeHud();
        drawBigBanner();
        drawToast();
      }
      if (state === State.OVER) {
        drawOver();
        if (overCards.length && overTimer > 20 && overButtonsBottom > 0) {
          drawBannerCard(Math.min(overButtonsBottom + 12, H - 62), overCards);
        }
        drawChestOverlay();
        drawStreakPopup();
      }
    }

    drawParticles();
    drawFlash();
    if (shakeOn) ctx.restore();
    drawPauseUi();
  }

  // Persist coins if the app is backgrounded / closed mid-run
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") { pauseGame("hidden"); saveDirty = true; flushSaves("hidden"); }
    else if (document.visibilityState === "visible" && !streakPop && state !== State.PLAY) streakCheckinNow(); // new day while the app was backgrounded
  });
  window.addEventListener("pagehide", function () { pauseGame("pagehide"); saveDirty = true; flushSaves("pagehide"); });
  window.addEventListener("blur", function () { pauseGame("blur"); }); // web: the tab or window lost focus

  /** First launch of 1.5 for an experienced player: one summary banner instead of a flood. */
  function announceInitialUnlocks() {
    // v1.17: one Sparrow, one skill tree. Convert old saves once: free evolution upgrades for levels already reached, skins refunded, notice shown.
    try {
      const evoGot = E.evoSync(save, peakLevel());
      if (E.masterySync(save, peakLevel()).length) persist();
      let back = 0;
      if (!lsGet("skyhop_v117_skin")) {
        for (const sk of E.NEW_SKINS) if (unlocks.owned.indexOf(sk.id) >= 0) back += sk.price;
        lsSet("skyhop_v117_skin", "1");
        if (back > 0) save.coins += back;
      }
      unlocks.equippedBird = "bird_default"; saveUnlocks();
      if (!lsGet("skyhop_v117_note") && (peakLevel() > 1 || save.coins > 0 || (save.birdRefund | 0) > 0)) {
        lsSet("skyhop_v117_note", "1");
        const bits = [];
        if ((save.birdRefund | 0) > 0 || back > 0) bits.push("Coins spent on birds & skins refunded: " + ((save.birdRefund | 0) + back));
        bits.push("Stage " + (save.evo + 1) + " of " + E.EVO_LEVELS.length + (evoGot.length ? " · " + evoGot.length + " free upgrades added" : ""));
        pushBanner("One Phoenix, one skill tree", bits.join(" · "), "#ffb02e", "bird:sparrow", true, "Your Phoenix now evolves as you level up");
      }
      if ((save.trailRefund | 0) > 0 && !lsGet("skyhop_v118_trail")) {
        lsSet("skyhop_v118_trail", "1");
        pushBanner("Trails retired", "Coins spent on trails refunded: " + (save.trailRefund | 0) + " · your Phoenix now always flies with a fiery trail", "#ff7a1a", "bird:sparrow", true, "One fixed fiery trail for everyone");
      }
      if ((save.magnetRefund | 0) > 0 && !lsGet("skyhop_v118_magnet")) {
        lsSet("skyhop_v118_magnet", "1");

      }
      refreshTailPower();
    } catch (_) {}
    const newSkills = E.SKILLS.filter((sk) => !save.skillsSeen[sk.id] && E.isSkillUnlocked(save, sk.id, peakLevel()));
    const newBirds = E.SPECIES.filter((sp) => sp.trophyLevel > 0 && !save.speciesSeen[sp.id] && E.isSpeciesOwned(save, sp.id, peakLevel()));
    if (newSkills.length > 1) {
      pushBanner(newSkills.length + " new skills unlocked!", newSkills.map((sk) => sk.name).join(" · "), "#ffd24a", "skill:" + newSkills[0].id);
      for (const sk of newSkills) save.skillsSeen[sk.id] = true;
    }
    if (newBirds.length > 1) {
      pushBanner(newBirds.length + " new birds unlocked!", newBirds.map((sp) => sp.name).join(" · "), "#ffb4e0", "bird:" + newBirds[0].id);
      for (const sp of newBirds) save.speciesSeen[sp.id] = true;
    }
    persist();
    checkNewUnlocks(false); // singles
    // v1.9: one-time heads-up for players whose Glide unlock just became Ghost.
    if (ghostMigrated) {
      const gh = E.SKILL_BY_ID.ghost;
      pushBanner("New skill: Ghost 👻", gh.desc + " · several charges per run", gh.color, "skill:ghost", true, "Ghost unlocked — tap its button below");
    }
  }

  // Debug / QA hook (only with ?debug=1) — used by the headless smoke test.
  try {
    debugMode = /[?&]debug=1\b/.test(String(location.search));
  } catch (_) {}
  if (debugMode) {
    window.SkyHopDebug = {
      get: function () {
        return { state: state, score: score, level: level, coins: save.coins, runCoins: runCoins, bird: { x: bird.x, y: bird.y, r: bird.r, vy: bird.vy },
          pipes: pipes.map((p) => ({ x: p.x, w: p.w, gapY: p.gapY, gap: p.gap, scored: p.scored })), coinsOnScreen: coins.length, coinList: coins.map((c) => ({ x: c.x, y: c.y, value: c.value, risky: c.risky, attached: !!c.pipe, pipeX: c.pipe ? c.pipe.x : null, gapY: c.pipe ? c.pipe.gapY : null })),
          skills: JSON.parse(JSON.stringify(skillState)), missions: save.missions, runCheckpoint: runCheckpoint, invuln: invulnFrames,
          shield: shieldUp(), birdScale: birdScale, ws: ws, pipesPassed: pipesPassed, save: save, almost: almostLines,
          frame: frame, pipeSpeed: pipeSpeed, ghostPipesLeft: ghostPipesLeft, ghostUsedThisRun: ghostUsedThisRun, ghostCharges: ghostCharges, ghostMax: ghostMaxCharges(), ghostRegen: ghostRegen, ghostRegenNeed: ghostRegenNeed(),
          unlocksOwned: unlocks.owned.slice(), unlockProgress: Object.assign({}, unlockProgress), lbPending: lbPendingScore, lbSubmits: lbSubmitLog.slice(), toasts: toasts.map((t) => t.text), overCards: overCards.map((b) => b.title), banners: banners.map((b) => b.title),
          particles: particles.length, pools: { particles: particlePool.length, coins: coinPool.length }, perf: window.SkyHopPerf.info(),
          v110: debug110(), adConfirm: adConfirm ? Object.assign({}, adConfirm) : null, equippedBird: unlocks.equippedBird };
      },
      step: function (n) { for (let i = 0; i < (n || 1); i++) update(); },
      perkInfo: function () { return { on: perkOn(), pk: pk(), secondWindLeft: secondWindLeft, talonSmashLeft: talonSmashLeft, perkView: perkView, hunters: hunters.length, projectiles: projectiles.length, puMode: puMode, puModeTotal: puModeTotal, puMagnetFrames: puMagnetFrames, gravity: GRAVITY * pk().gravMul }; },
      setTree: function (id, lv) { const n = E.TREE_BY_ID[id]; if (!n) return false; if (!save.tree) save.tree = {};
        for (const st of n.steps) { if (st[0] === "skill") delete save.skillEarly[st[1]]; else if (st[0] === "up") delete save.upgrades[st[1]]; else delete save.tree[st[1]]; }
        for (let i = 0; i < Math.min(lv | 0, n.steps.length); i++) E.grantPart(save, n.steps[i][0], n.steps[i][1]);
        persist(); refreshTailPower(); return true; },
      evoFit: function () { return +evoFitLast.toFixed(3); },
      evoSize: function () { const out = []; const pal = activeBirdPalette(); for (let s = 0; s < 40; s++) { const p = Object.assign({}, pal, { evo: Object.assign({}, pal.evo || {}, { tier: s }) }); const f = evoFit(p); const m = evoMeasure(p); out.push([s + 1, +f.toFixed(3), Math.round(m[0] * f), Math.round(m[1] * f)]); } return out; },
      setEvo: function (st) { save.evo = Math.max(0, Math.min(39, st | 0)); persist(); palMemo.r = null; refreshTailPower(); },
      evoSyncDbg: function (lv) { const r = E.evoSync(save, lv); persist(); refreshTailPower(); return r; },
      evoMomentInfo: function () { return evoMoment ? { t: evoMoment.t, stage: evoMoment.stage, name: evoMoment.name, rewards: evoMoment.rewards } : null; },
      showEvoMoment: function (st) { evoMoment = { t: 160, stage: st, name: E.EVO_NAMES[st], rewards: E.EVO_REWARDS[st] ? [E.EVO_REWARDS[st][2]] : [], pal: null }; },
      treeInfo: function () { return E.treeInfo(save, peakLevel()); },
      buyNode: function (id) { const ok = E.buyTreeStep(save, id, peakLevel()); persist(); refreshTailPower(); return ok; },
      setPerk: function (id, lv) { if (!save.birdPerks) save.birdPerks = {}; save.birdPerks[id] = lv | 0; if (save.species.indexOf(id) < 0) save.species.push(id); persist(); },
      equipSpecies: function (id) { save.speciesEquipped = id; if (save.species.indexOf(id) < 0) save.species.push(id); persist(); },
      resetRunPerks: resetRunPerks,
      spawnHunterAt: function (x, y, tier, vr) { const h = { x: x, y: y, bob: 0, shootCD: 9999, kind: "net" }; hunters.push(h); hunterTierInit(h, level, tier === undefined ? 0 : tier, vr); },
      hunterVariants: function () { return HUNTER_VARS.map(function (v) { return { id: v.id, w: v.w, sc: v.sc, spd: v.spd, bx: v.bx, by: v.by, hat: v.hat, broom: v.broom }; }); },
      hunterRollVariants: function (n) { const o = {}; for (let i = 0; i < n; i++) { const k = HUNTER_VARS[hunterRollVariant()].id; o[k] = (o[k] || 0) + 1; } return o; },
      hunterTierFor: hunterTierFor, hunterTiers: function () { return HUNTER_TIERS.map(function (t) { return { name: t.name, from: t.from, hp: t.hp, spd: t.spd, net: t.net }; }); },
      fireAt: function (x, y) { projectiles.push({ x: x, y: y, vx: 0, vy: 0, kind: "net", r: 14, life: 200 }); },
      pickCoin: function (c) { collectCoin(c || { value: 1, x: bird.x, y: bird.y, risky: false }); },
      skillDur: function (id) { return skillStatsFor(id).dur; },
      dashFrames: function () { return skillState.dash ? skillState.dash.activeMax : 0; },
      shieldUpFn: shieldUp,
      wpnHold: function (b) { wpnHoldOn = !!b; },
      wpnPickNow: function (n) { const o = {}; for (let i = 0; i < (n || 1); i++) { const k = wpnPick() || "none"; o[k] = (o[k] || 0) + 1; } return o; },
      ridingNow: function () { return puMode ? 1 : 0; },
      puList: function () { return powerups.map(function (q) { if (!q.__id) q.__id = (window.__puSeq = (window.__puSeq || 0) + 1); return { id: q.__id, k: q.kind, x: q.x, y: q.y }; }); },
      wpnInfo: function (clear) { const o = { clock: wpnClock, due: wpnDue, t: wpnT, run: wpnRun, log: wpnLog.slice() }; if (clear) wpnLog.length = 0; return o; },
      helperSpacingProbe: function () {
        debugAuto = true;
        startPlay();
        const prev = score; score = 5 * PIPES_PER_LEVEL; onScoreChanged(prev);
        wpnLog.length = 0;
        let guard = 0, offer = null;
        while (!offer && guard < 6000) {
          for (let i = powerups.length - 1; i >= 0; i--) if (!WPN_MIN_LV[powerups[i].kind]) powerups.splice(i, 1);
          invulnFrames = 8;
          update();
          guard++;
          if (state !== State.PLAY) return { ok: false, reason: "run ended before a helper offer", state: state, guard: guard };
          for (let i = 0; i < powerups.length; i++) if (WPN_MIN_LV[powerups[i].kind]) { offer = powerups[i]; break; }
        }
        if (!offer) return { ok: false, reason: "no helper offer", guard: guard, log: wpnLog.slice() };
        const offered = offer.kind;
        bird.x = offer.x; bird.y = offer.y; bird.vy = 0;
        updatePowerups();
        if (!heldWeapon || heldWeapon.kind !== offered || weaponNow().length) return { ok: false, reason: "pickup should store, not start", offered: offered, held: heldWeapon, active: weaponNow() };
        const ammo0 = heldWeapon.ammo;
        wpnLog.length = 0;
        const spawnedWhile = [];
        for (let i = 0; i < 90; i++) { invulnFrames = 8; update(); }
        if (!heldWeapon || heldWeapon.ammo !== ammo0) return { ok: false, reason: "ammo changed while unused", ammo0: ammo0, ammo: heldWeapon && heldWeapon.ammo };
        for (let i = 0; i < wpnLog.length; i++) if (wpnLog[i].ev === "spawn" && WPN_MIN_LV[wpnLog[i].kind]) spawnedWhile.push(wpnLog[i].kind);
        keyFire = true; refreshFiring();
        let steps = 0;
        while (heldWeapon && heldWeapon.ammo > 0 && steps < 8000) {
          invulnFrames = 8; update(); steps++;
          for (let i = 0; i < wpnLog.length; i++) if (wpnLog[i].ev === "spawn" && WPN_MIN_LV[wpnLog[i].kind]) spawnedWhile.push(wpnLog[i].kind);
        }
        keyFire = false; refreshFiring();
        let tail = 0;
        while (weaponNow().length && tail < 400) { invulnFrames = 8; update(); tail++; }
        if (heldWeapon || weaponNow().length) return { ok: false, reason: "burst did not run out", steps: steps, held: heldWeapon, active: weaponNow() };
        const endedAt = wpnT;
        wpnLog.length = 0;
        let after = 0, next = null;
        while (!next && after < 900) {
          for (let i = powerups.length - 1; i >= 0; i--) if (!WPN_MIN_LV[powerups[i].kind]) powerups.splice(i, 1);
          invulnFrames = 8;
          update();
          after++;
          if (state !== State.PLAY) return { ok: false, reason: "run ended while waiting for next helper", after: after };
          for (let i = 0; i < wpnLog.length; i++) if (wpnLog[i].ev === "spawn" && WPN_MIN_LV[wpnLog[i].kind]) { next = wpnLog[i]; break; }
        }
        debugAuto = false;
        const gap = next ? next.t - endedAt : null;
        return { ok: spawnedWhile.length === 0 && gap !== null && gap >= WPN_AFTER_MIN - 2, offered: offered, stored: true, ammo0: ammo0, stepsWhile: steps, spawnedWhile: spawnedWhile, framesAfterEnd: gap, nextKind: next && next.kind, afterMin: WPN_AFTER_MIN, afterMax: WPN_AFTER_MAX };
      },
      puGap: function () { return PU_MIN_GAP_PIPES - pk().puGapCut; },
      addCoinAt: function (x, y, risky) { coins.push({ x: x, y: y, value: 1, risky: !!risky, spin: 0, pulled: false, pipe: null, dx: 0, gy: 0 }); },
      clearCoinsFn: clearCoins,
      puSpawnSim: function (n, since) { const out = { spawns: 0, kinds: {} }; const sv = [puRunPipes, puRideSeen, puPelletSeen, puPopSeen, puPoofSeen]; puRideSeen = true; puPelletSeen = true; puPopSeen = true; puPoofSeen = true; for (let i = 0; i < n; i++) { powerups.length = 0; puPipesSince = since; puForceKind = null; const fake = { x: W + 10, w: PIPE_W, gapY: 300 }; if (maybeSpawnPowerup(fake)) { out.spawns++; const k = powerups[0].kind; out.kinds[k] = (out.kinds[k] || 0) + 1; } } powerups.length = 0; puRunPipes = sv[0]; puRideSeen = sv[1]; puPelletSeen = sv[2]; puPopSeen = sv[3]; puPoofSeen = sv[4]; return out; },
      stunAll: function (f) { for (const h of hunters) { h.stun = f; h.kb = 0; } },
      burstInfo: function () { let st = 0; for (const h of hunters) if (h.stun > 0) st++; return { pelletFrames: pelletFrames, popQueue: popQueue, pellets: pellets.length, rockets: popRockets.length, hunters: hunters.length, stunned: st, allowed: burstAllowed(), pus: powerups.map(function (u) { return u.kind; }), pusPos: powerups.map(function (u) { return { kind: u.kind, x: u.x, y: u.y }; }), rideSeen: puRideSeen, pelletSeen: puPelletSeen, popSeen: puPopSeen, poofSeen: puPoofSeen, runPipes: puRunPipes }; },
      zapInfo: function () { return { queue: zapQueue, hold: zapHold, strikes: zapStrikes, total: zapTotal }; },
      setGhost: function (c, f) { ghostCharges = c; ghostRegen = Math.round(ghostRegenNeed() * f); },
      weaponNow: function () { return weaponNow(); },
      heldInfo: function () { return heldWeapon ? { kind: heldWeapon.kind, ammo: heldWeapon.ammo, max: heldWeapon.max, firing: weaponFiring } : null; },
      setFiring: function (on) { keyFire = !!on; refreshFiring(); },
      runBird: function () { return { runEvo: runEvo, saveEvo: save.evo | 0, name: E.EVO_NAMES[runEvo] || "", level: level }; },
      masteryInfo: function () { return Object.assign({}, save.mastery || {}); },
      beatAt: function (i) { return window.SkyHopObstacles.beatFor(i); },
      poofInfo: function () { return { queue: poofQueue, toys: toys.length, confetti: confetti.length, hold: poofHold }; },
      stubTest: function (i) { var p = pipes[i]; return p ? { cr: p.cr || null, stubT: p.stubT === undefined ? null : p.stubT, h: stubH(p), chunks: chunks.length, fx: obstFx(p).chip } : null; },
      crumbleStub: function (i, side) { var p = pipes[i]; crumblePipe(p, side); p.stubT = frame - STUB_GROW - 2; },
      pelletDims: function () { return { core: PELLET_R, ring: PELLET_RING, glow: PELLET_GLOW }; },
      fxMulNow: function () { return fxMul; },
      fxCounts: function () { return { blasts: blasts.length, eblasts: blasts.filter(function (b) { return !b.f; }).length, bolts: bolts.length, flames: flames.length, sparks: sparks.length, chunks: chunks.length, pellets: pellets.length, rockets: popRockets.length, toys: toys.length, particles: particles.length, confetti: confetti.length, puffs: puffs.length }; },
      burstStats: function () { return { defeated: bstat.defeated, crumbled: bstat.crumbled, cracked: bstat.cracked, coins: burstCoins, pelletTotal: pelletTotal, popTotal: popTotal, popQueue: popQueue, level: level }; },
      pipeInfo: function () { return pipes.map(function (p) { return { x: p.x, w: p.w, gapY: p.gapY, gap: p.gap, pattern: p.pattern || null, fam: p.fam || null, families: p.families || [], smashed: !!p.smashed, shape: p.shape || "cluster", bits: (p.bits || []).map(function (b) { return { kind: b.kind, r: +b.r.toFixed(2), ox: +b.ox.toFixed(1), rel: +b.rel.toFixed(1), hp: b.hp | 0, gone: !!b.gone, amp: b.amp || 0, spin: b.spin || 0, drift: b.drift || 0 }; }) }; }); },
      crackBit: function (gi, bi, dmg) { const p = pipes[gi]; if (!p) return null; crackPipe(p, bi, dmg == null ? 1 : dmg, p.x, p.gapY, dmg === 1, dmg >= 3 ? "rocket" : "pellet"); return { hp: p.bits[bi].hp, gone: !!p.bits[bi].gone, hpMax: pipeHp() }; },
      bitWorld: function (gi, bi) { const p = pipes[gi], b = p && p.bits && p.bits[bi]; if (!b) return null; return window.SkyHopObstacles.bitXY(p.x, p.gapY, b, frame); },
      shotSetup: function (lv) {
        state = State.PLAY; pauseMode = 0; invulnFrames = 0; ghostPipesLeft = 0; puMode = null;
        const prev = score; score = (Math.max(1, lv | 0) - 1) * PIPES_PER_LEVEL; onScoreChanged(prev);
        pipes.length = 0; coins.length = 0; hunters.length = 0; projectiles.length = 0; trees.length = 0; animals.length = 0; waterfalls.length = 0;
        blackholes.length = 0; powerups.length = 0; pellets.length = 0; popRockets.length = 0; toys.length = 0; zaps.length = 0;
        confetti.length = 0; bolts.length = 0; flames.length = 0; sparks.length = 0; chunks.length = 0; puffs.length = 0; blasts.length = 0;
        particles.length = 0; floaters.length = 0; rings.length = 0; shipRockets.length = 0;
        toasts.length = 0; banners.length = 0;
        pelletFrames = 0; popQueue = 0; poofQueue = 0; zapQueue = 0; puMagnetFrames = 0; puMode = null;
        applyDifficulty();
        worldIdx = -1; syncWorld(false);
        milestoneFlash = 0; bigBannerT = 0; levelFlash = 0; evoMoment = null;
        for (let i = 0; i < 3; i++) { spawnPipe(); pipes[pipes.length - 1].x = 130 + i * 145; }
        blackholes.length = 0; powerups.length = 0;
        const p = pipes[0];
        bird.x = 78; bird.y = p ? p.gapY : PLAY_H / 2; bird.vy = 0; bird.rot = -0.15; birdScale = 1; bird.r = 16;
        freeze112 = true;
        const wi = worldIndexFor(level);
        return { level: level, world: worldNameAt(wi), pattern: p && p.pattern, fam: p && p.fam, families: p && p.families, gap: p && p.gap, gapY: p && p.gapY, birdR: bird.r, kinds: p ? p.bits.map(function (b) { return b.kind; }) : [] };
      },
      birdSheet: function () {
        const c = document.createElement("canvas"); c.width = 760; c.height = 200;
        const x = c.getContext("2d"); const prev = ctx; ctx = x;
        try {
          x.fillStyle = "#8fd4ff"; x.fillRect(0, 0, 760, 200);
          const stages = [0, 8, 19, 39];
          for (let i = 0; i < stages.length; i++) {
            const pal = activeBirdPalette();
            const p = Object.assign({}, pal, { evo: Object.assign({}, pal.evo || {}, { tier: stages[i] }) });
            x.save(); x.translate(90 + i * 180, 108); x.scale(2.4, 2.4); drawBirdFigure(p, -0.15); x.restore();
            x.fillStyle = "#14324a"; x.font = "bold 14px sans-serif"; x.textAlign = "center";
            x.fillText("stage " + (stages[i] + 1), 90 + i * 180, 24);
          }
        } finally { ctx = prev; }
        return c.toDataURL("image/png");
      },
      hunterInfo: function () { return hunters.map(function (h) { return { x: h.x, y: h.y, dmg: h.dmg | 0, stun: h.stun | 0, tier: h.tier | 0, v: h.v | 0, hp: hunterHp(h), hw: h.hw, hh: h.hh, sc: h.sc }; }); },
      crumbleTest: function (i, side) { crumblePipe(pipes[i], side); },
      grantPU: function (k) { grantPowerup(k); return { total: puModeTotal, mag: puMagnetFrames }; },
      flap: flap,
      useSkill: useSkill,
      startPlay: startPlay,
      resumeInfo: function () { return { rec: resumeRec, stored: localStorage.getItem(RESUME_KEY), pauseMode: pauseMode, pauseCount: pauseCount, confirm: newGameConfirm, cp: runCheckpoint, runCoins: runCoins, pellet: pelletFrames, pop: popQueue, poof: poofQueue, zap: zapQueue, mag: puMagnetFrames }; },
      resumeRun: function () { resumeRun(); }, newGameTap: function () { newGameConfirm = 1; }, newGameYes: function () { startNewGame(); }, saveRunNow: function (k) { saveRunNow(k); }, quitFromPause: function () { quitRunFromPause(); },
      gameOver: function () { puMode = null; invulnFrames = 0; shieldCharges = 0; if (skillState.shield) skillState.shield.active = 0; gameOver(); overTimer = 30; },
      setScore: function (s2) { const prev = score; score = s2; onScoreChanged(prev); },
      open: function (name) { if (name === "shop") openShop(); else if (name === "birds") openBirds(); else if (name === "missions") openMissions(); else if (name === "trophies") openTrophies(); else if (name.indexOf("perks:") === 0) { openBirds(); perkView = name.slice(6); } },
      setShopTab: function (t) { shopTab = Math.min(1, t | 0); shopScroll = 0; },
      shopInfo: function () { return { tab: shopTab, tabLabels: (uiButtons.tabs || []).map(function (b) { return b.tab; }), rows: buildShopRows().map(function (r) { return r.title || r.header || (r.bar && r.bar.title) || ""; }) }; },
      addCoins: function (n) { E.addCoins(save, n); persist(); },
      tap: function (x, y) { handlePointerAt({ x: x, y: y }); },
      back: function () { return handleSystemBack(); },
      setBird: function (y, vy) { bird.y = y; if (vy != null) bird.vy = vy; },
      autopilot: function (on) { debugAuto = !!on; },
      motionStats: function (lv, n) { let moving = 0, breathe = 0, maxAmp = 0, maxB = 0; for (let i = 0; i < n; i++) { const m = pipeMotionFor(lv, 120); if (m) { moving++; maxAmp = Math.max(maxAmp, m.amp); if (m.bAmp) { breathe++; maxB = Math.max(maxB, m.bAmp); } } } return { moving: moving / n, breathe: breathe / n, maxAmp: maxAmp, maxB: maxB }; },
      worldInfo: function (lv) { const wi = worldIndexFor(lv); const pd = isBossLevel(lv) ? BOSS_PIPE : worldDefAt(wi).pipe; return { wi: wi, name: worldNameAt(wi), boss: isBossLevel(lv), bonus: bossBonusFor(lv), pipe: pd ? { deco: pd.deco, body: pd.body.slice(), cap: pd.cap } : null }; },
      playH: PLAY_H,
      setLevel: function (lv) { const prev = score; score = (Math.max(1, lv | 0) - 1) * PIPES_PER_LEVEL; onScoreChanged(prev); },
      forcePowerup: function (kind) { puForceKind = kind; },
      forceBlackHole: function () { bhForce = true; },
      bhConsts: function () { return { BH_MIN_LEVEL: BH_MIN_LEVEL, BH_CHANCE: BH_CHANCE, BH_MIN_GAP_PIPES: BH_MIN_GAP_PIPES, BH_MAX_PER_RUN: BH_MAX_PER_RUN, BH_SKIP: BH_SKIP, PU_CHANCE: PU_CHANCE, PU_MIN_GAP_PIPES: PU_MIN_GAP_PIPES, BOSS_SPEED_MUL: BOSS_SPEED_MUL, WORLDS: WORLDS.length, POWERUP_KINDS: POWERUP_KINDS.slice() }; },
      bhSpawnRate: function (lv, n) { const sv = [level, bhPipesSince, bhRun, blackholes.length]; level = lv; let c = 0, pipesSeen = 0; for (let i = 0; i < n; i++) { bhPipesSince++; pipesSeen++; const fake = { x: W + 10, w: PIPE_W, gapY: 300 }; if (maybeSpawnBlackHole(fake)) { c++; blackholes.length = 0; bhRun = 0; } } level = sv[0]; bhPipesSince = sv[1]; bhRun = sv[2]; blackholes.length = 0; return c / pipesSeen; },
      grantPowerup: function (kind) { grantPowerup(kind); },
      equip: function (id) { equipBird(id); },
      grant: function (id) { grantOwned(id); },
      shopRows: function () { return buildShopRows().map(function (r) { return { title: r.title, header: r.header, sub: r.sub, chips: (r.chips || []).map(function (c) { return { label: c.label, action: c.action, itemId: c.itemId }; }) }; }); },
      setShopScroll: function (y) { shopScroll = y; clampShopScroll(); },
      clearHazardsForShot: function () { trees.length = 0; animals.length = 0; hunters.length = 0; projectiles.length = 0; waterfalls.length = 0; },
      buttons: function () { return JSON.parse(JSON.stringify(uiButtons)); },
      expectedSpeed: function (lv, sc) { const t = difficultyT(lv); let sp = BASE_SPEED + (MAX_SPEED - BASE_SPEED) * t; const early = 1 - Math.max(0, Math.min(20, sc)) / 20; if (early > 0.02) sp *= 1 - 0.18 * early; return sp * midEase(lv).speedMul; },
      oldSpeed: function (lv) { const t = difficultyT(lv); return BASE_SPEED + (MAX_SPEED - BASE_SPEED) * t; },
      oldGap: function (lv) { const t = difficultyT(lv); return BASE_GAP + (MIN_GAP - BASE_GAP) * t; },
      easeConsts: function () { return { EASE_FROM_LEVEL: EASE_FROM_LEVEL, EASE_RAMP_LEVELS: EASE_RAMP_LEVELS, EASE_GAP_PX: EASE_GAP_PX, EASE_SPEED_MUL: EASE_SPEED_MUL, EASE_SPAWN_FRAMES: EASE_SPAWN_FRAMES, BASE_GAP: BASE_GAP, MIN_GAP: MIN_GAP, BASE_SPEED: BASE_SPEED, MAX_SPEED: MAX_SPEED, BASE_SPAWN: BASE_SPAWN, MIN_SPAWN: MIN_SPAWN }; },
      midEase: function (lv) { return midEase(lv); },
      comboInfo: function () { return { count: comboSt.count, mult: comboSt.mult, strikes: comboSt.strikes, best: runBestCombo, bestMult: runBestMult, soClose: runSoClose, pulse: comboPulse, hudPop: comboHudPop, runCoins: runCoins, runChestCoins: runChestCoins }; },
      comboEvent: function (ev) { return comboEvent(ev); },
      comboReset: function () { E.comboBreak(comboSt); },
      chestInfo: function () { return chest ? { phase: chest.phase, t: chest.t, tier: chest.tier.id, base: chest.base, coins: chest.coins, doubled: chest.doubled, canDouble: canOfferChestDouble() } : null; },
      forceChestTier: function (id) { chestForceTier = id; },
      chestTap: function () { return chestTap(); },
      streakInfo: function () { return { streak: JSON.parse(JSON.stringify(save.streak)), pop: streakPop ? { count: streakPop.count, coins: streakPop.coins, t: streakPop.t } : null, active: streakPopActive() }; },
      streakCheckin: function (key) { const r = E.streakCheckin(save, key || todayKey()); if (r.show && save.streak.pending > 0) streakPop = { t: 0, count: save.streak.count, coins: save.streak.pending, info: save.streak.pendingInfo }; persist(); return r; },
      streakCollect: function () { return streakCollect(); },
      flushSave: function () { flushSaves("debug"); },
      ads112: function () { return { rewardBusy: rewardBusy, continueBusy: continueBusy }; },
      score112: function (n) { score = n | 0; },
      pipeGap112: function () { return pipeGap; },
      freeze112: function (on) { freeze112 = !!on; },
      pauseGame: function (r) { return pauseGame(r || "debug"); },
      resumeGame: function () { return resumeGame(); },
      pauseInfo: function () { return { mode: pauseMode, count: pauseCount, quitArmed: pauseQuitArmed, btn: PAUSE_BTN, resume: PAUSE_RESUME, quit: PAUSE_QUIT }; },
      tapAt: function (x, y) { handlePointerAt({ x: x, y: y }); },
      puPopInfo: function () { return puPop ? { kind: puPop.kind, life: puPop.life } : null; },
      addPickupAt: function (x, y, kind) { powerups.push({ x: x, y: y, kind: kind, pipe: null, dx: 0, gy: 0, bob: 0 }); return powerups.length; },
      pickupList: function () { return powerups.map(function (u) { return { x: u.x, y: u.y, kind: u.kind, pulled: !!u.pulled }; }); },
      setMagnetFrames: function (n) { puMagnetFrames = n | 0; },
      magnetLabelInfo: function () { return { t: magnetLabelT }; },
      endMagnetForTest: function () { puMagnetFrames = 0; },
      magnetInfo: function () { return { r: puMagnetFrames > 0 ? MAG_PICK_R : 0, s: puMagnetFrames > 0 ? 1 : 0, glow: magnetGlow, evo: save.evo, frames: puMagnetFrames, clock: magClock }; },
      pauseKey: function () { return handleSystemBack(); },
      flightInfo: function () { return { zaps: zaps.map(function (z) { return { x: z.x, y: z.y, a: z.a }; }), toys: toys.map(function (q) { return { arc: q.arc, sway: q.sway, x: q.x, y: q.y }; }), pellets: pellets.map(function (p) { return { vx: p.vx, vy: p.vy }; }), rockets: popRockets.length }; },
      holdPipe119: function (x, calm) { if (pipes[0]) { pipes[0].x = x; pipes.length = 1; } if (calm) { hunters.length = 0; projectiles.length = 0; if (pipes[0]) { pipes[0].amp = 0; pipes[0].bAmp = 0; } } },
      addPipe119: function (x, gapY, gap, sh) { const p = { x: x, gapY: gapY, gap: gap, scored: false, w: PIPE_W, style: isBossLevel(level) ? "boss" : worldIndexFor(level) % WORLDS.length }; p.shape = sh || obstShapeFor(p.style); pipes.push(p); return p.shape; },
      artBoxes: function () {   // drawn extents of each obstacle piece (solid pixels), for the hit-box test
        const out = [], prev = ctx, c = document.createElement("canvas"); c.width = W; c.height = PLAY_H; const x = c.getContext("2d");
        for (const p of pipes) { x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, PLAY_H); ctx = x; try { drawStyledPipe(p); } finally { ctx = prev; }
          const d = x.getImageData(0, 0, W, PLAY_H).data, g = p.gapY; const box = (y0, y1) => { let a = 1e9, b = -1, l = 1e9, r = -1; for (let yy = Math.max(0, y0 | 0); yy < Math.min(PLAY_H, y1); yy++) for (let xx = 0; xx < W; xx++) if (d[(yy * W + xx) * 4 + 3] > 120) { if (yy < a) a = yy; if (yy > b) b = yy; if (xx < l) l = xx; if (xx > r) r = xx; } return b < 0 ? null : [a, b + 1, l, r + 1]; };
          out.push({ top: box(0, g), bot: box(g, PLAY_H) }); }
        return out; },
      spawnMany: function (n) { const keep = pipes.slice(), res = []; for (let i = 0; i < n; i++) { pipes.length = 0; spawnPipe(); const p = pipes[0]; res.push({ form: p.form || "col", shape: p.shape, mon: p.mon || null, mon2: p.mon2 || null, gap: p.gap, want: pipeGap, amp: p.amp || 0, gapY: p.gapY, w: p.w, top: p.noT ? null : [Math.max(0, segTopA(p)), p.gapY - p.gap / 2], bot: p.noB ? null : [p.gapY + p.gap / 2, Math.min(PLAY_H, segBotB(p))] }); } pipes.length = 0; for (const q of keep) pipes.push(q); coins.length = 0; return { playH: PLAY_H, birdR: bird.r, res: res }; },
      formLast: function (f, mon) { const p = pipes[pipes.length - 1]; if (!p) return null; delete p.lT; delete p.lB; delete p.noT; delete p.noB; p.w = PIPE_W; obstFormForce = f || null; obstMonForce = mon || null; obstApplyForm(p); obstFormForce = null; obstMonForce = null; return p.form || "col"; },
      setObstForm: function (f, mon) { obstFormForce = f || null; obstMonForce = mon || null; return { forms: OBST_FORMS.slice(), monsters: MON_KINDS.slice(), perWorld: MON_WORLD }; },
      obstBoxes: function () { return pipes.map(function (p) { const t = p.gapY - p.gap / 2, b = p.gapY + p.gap / 2; return { x: p.x, w: p.w, shape: p.shape, form: p.form || "col", mon: p.mon || null, gap: p.gap, top: p.noT ? null : [Math.max(0, segTopA(p)), t], bot: p.noB ? null : [b, Math.min(PLAY_H, segBotB(p))], crT: !!p.crT, crB: !!p.crB }; }); },
      hitAt: function (x, y, r) { const sv = [bird.x, bird.y, bird.r]; bird.x = x; bird.y = y; bird.r = (r || 2) + 2; let h = false; for (const p of pipes) if (hitPipe(p)) h = true; bird.x = sv[0]; bird.y = sv[1]; bird.r = sv[2]; return h; },
      applyForm: function () { for (const p of pipes) { delete p.lT; delete p.lB; delete p.noT; delete p.noB; p.w = PIPE_W; obstApplyForm(p); } return pipes.map(function (p) { return p.form || "col"; }); },
      setObstShape: function (sh) { obstForce = sh || null; return OBST_SHAPES.slice(); },
      obstMix: function (st) { return (OBST_MIX[st] || []).slice(); },
      placePipe112: function (x, gapY, gap) { const p = { x: x, gapY: gapY, gap: gap, scored: false, w: PIPE_W, style: isBossLevel(level) ? "boss" : worldIndexFor(level) % WORLDS.length }; p.shape = obstShapeFor(p.style); pipes.length = 0; coins.length = 0; pipes.push(p); return p.style; },
      hitPipe112: function () { return pipes.length ? hitPipe(pipes[0]) : null; },
      obstacleKinds112: function () { return WORLDS.map(function (w) { return { id: w.id, name: w.name, deco: w.pipe.deco }; }); },
      pipeW112: function () { return { PIPE_W: PIPE_W, PIPE_CAP: PIPE_CAP }; },
      clearCoins112: function () { coins.length = 0; },
      consts: function () { return { GRAVITY: GRAVITY, FLAP: FLAP, MAX_FALL: MAX_FALL, BASE_SPEED: BASE_SPEED, MAX_SPEED: MAX_SPEED, STEP_MS: STEP_MS }; },
    };
  }

  resetGame();
  resetRunPerks();
  state = State.START;
  ensureDaily();
  ensureMissions(true);
  streakCheckinNow(); // v1.12 daily play streak (popup waits on the menu; coins are paid when the player taps Collect)
  announceInitialUnlocks();
  notifyAdsState();
  requestAnimationFrame(loop);
})();
