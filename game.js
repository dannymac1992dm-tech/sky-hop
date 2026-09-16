(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
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

  // —— State ——
  const State = { START: 0, PLAY: 1, OVER: 2, TROPHIES: 3, SHOP: 4 };
  let state = State.START;
  let prevMenuState = State.START;
  let score = 0;
  let best = parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10) || 0;
  let bestLevel = parseInt(localStorage.getItem(BEST_LEVEL_KEY) || "0", 10) || 0;
  let muted = localStorage.getItem(MUTE_KEY) === "1";
  // Extras default ON for first-time players
  let extrasOn = localStorage.getItem(EXTRAS_KEY) !== "0";
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

  // —— Freemium unlock catalog v1 ——
  const CATALOG = [
    { id: "bird_default", name: "Classic", kind: "bird", watches: 0 },
    { id: "bird_gold", name: "Golden Hop", kind: "bird", watches: 1 },
    { id: "bird_night", name: "Night Owl", kind: "bird", watches: 1 },
    { id: "bird_neon", name: "Neon Flap", kind: "bird", watches: 2 },
    { id: "bird_royal", name: "Royal Crow", kind: "bird", watches: 3 },
    { id: "feat_trail", name: "Spark trail", kind: "feat", watches: 1 },
    { id: "feat_hint", name: "Gap flash", kind: "feat", watches: 2, freeLevel: 20 },
    { id: "feat_slowmo", name: "Slow-mo", kind: "feat", watches: 2 },
    { id: "skill_glide", name: "Glide", kind: "skill", watches: 2, freeLevel: 40 },
    { id: "skill_double", name: "Double flap", kind: "skill", watches: 2, freeLevel: 60 },
    { id: "skill_shield", name: "Feather shield", kind: "skill", watches: 3, freeLevel: 80 },
  ];
  const CATALOG_BY_ID = {};
  for (const it of CATALOG) CATALOG_BY_ID[it.id] = it;

  const BIRD_PALETTES = {
    bird_default: {
      body0: "#fff5a0", body1: "#ffd54a", body2: "#f0a820",
      wing: "#ffb020", wingDark: "#e89010", belly: "rgba(255,255,255,0.55)",
      beak: "#ff6b2d", cheek: "rgba(255,100,100,0.35)", glow: null,
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
    {
      id: "hatchling", name: "Hatchling", accent: "none", feel: 0,
      // palette: null → use shop equipped bird (classic yellow by default)
      palette: null,
    },
    {
      id: "fledgling", name: "Fledgling", accent: "crest", feel: 0.04,
      palette: {
        body0: "#fff6c0", body1: "#ffc107", body2: "#e65100",
        wing: "#ffb300", wingDark: "#ef6c00", belly: "rgba(255,248,220,0.7)",
        beak: "#ff6f00", cheek: "rgba(255,160,40,0.55)", glow: "rgba(255,193,7,0.4)",
      },
    },
    {
      id: "sky_hopper", name: "Sky Hopper", accent: "glow", feel: 0.05,
      palette: {
        body0: "#e1f5fe", body1: "#29b6f6", body2: "#01579b",
        wing: "#4fc3f7", wingDark: "#0277bd", belly: "rgba(200,240,255,0.6)",
        beak: "#ffb74d", cheek: "rgba(80,180,255,0.45)", glow: "rgba(79,195,247,0.5)",
      },
    },
    {
      id: "gale_wing", name: "Gale Wing", accent: "streaks", feel: 0.06,
      palette: {
        body0: "#e0fff4", body1: "#26a69a", body2: "#004d40",
        wing: "#80cbc4", wingDark: "#00695c", belly: "rgba(200,255,240,0.55)",
        beak: "#ffca28", cheek: "rgba(100,220,180,0.4)", glow: "rgba(38,166,154,0.4)",
      },
    },
    {
      id: "storm_rider", name: "Storm Rider", accent: "electric", feel: 0.07,
      palette: {
        body0: "#e8eaf6", body1: "#5c6bc0", body2: "#1a237e",
        wing: "#7986cb", wingDark: "#303f9f", belly: "rgba(200,210,255,0.5)",
        beak: "#ffd54f", cheek: "rgba(140,160,255,0.45)", glow: "rgba(100,140,255,0.5)",
      },
    },
    {
      id: "aurora", name: "Aurora Flap", accent: "aurora", feel: 0.08,
      palette: {
        body0: "#ffe0f0", body1: "#ec407a", body2: "#880e4f",
        wing: "#f48fb1", wingDark: "#ad1457", belly: "rgba(255,200,230,0.55)",
        beak: "#ff80ab", cheek: "rgba(255,120,180,0.5)", glow: "rgba(236,64,122,0.45)",
      },
    },
    {
      id: "nova", name: "Nova Beak", accent: "nova", feel: 0.09,
      palette: {
        body0: "#fffde7", body1: "#ffee58", body2: "#f9a825",
        wing: "#fff176", wingDark: "#fbc02d", belly: "rgba(255,255,220,0.7)",
        beak: "#ff6f00", cheek: "rgba(255,220,80,0.5)", glow: "rgba(255,235,59,0.55)",
      },
    },
    {
      id: "eclipse", name: "Eclipse Crow", accent: "eclipse", feel: 0.1,
      palette: {
        body0: "#b39ddb", body1: "#512da8", body2: "#12005e",
        wing: "#7e57c2", wingDark: "#311b92", belly: "rgba(200,180,255,0.4)",
        beak: "#ce93d8", cheek: "rgba(160,120,255,0.45)", glow: "rgba(126,87,194,0.5)",
      },
    },
    {
      id: "celestial", name: "Celestial", accent: "halo", feel: 0.11,
      palette: {
        body0: "#fafafa", body1: "#e0e7ff", body2: "#90a4ae",
        wing: "#cfd8dc", wingDark: "#78909c", belly: "rgba(255,255,255,0.65)",
        beak: "#ffd54f", cheek: "rgba(200,220,255,0.45)", glow: "rgba(230,240,255,0.55)",
      },
    },
    {
      id: "phoenix", name: "Mythic Phoenix", accent: "phoenix", feel: 0.12,
      palette: {
        body0: "#ffe0b2", body1: "#ff5722", body2: "#bf360c",
        wing: "#ff7043", wingDark: "#d84315", belly: "rgba(255,220,180,0.55)",
        beak: "#ffab00", cheek: "rgba(255,120,40,0.5)", glow: "rgba(255,87,34,0.55)",
      },
    },
  ];
  const PRESTIGE_LABELS = ["", "★ ", "◆ ", "✦ ", "✧ "];
  const PRESTIGE_GLOWS = [
    null,
    "rgba(255,215,0,0.4)",
    "rgba(200,220,255,0.45)",
    "rgba(255,140,220,0.4)",
    "rgba(120,255,200,0.4)",
  ];

  function evolutionTier(pipes) {
    // Tier from pipes passed (score), not level — upgrade every 10 pipes.
    const p = Math.max(0, pipes | 0);
    return Math.floor(p / 10);
  }

  function evolutionMeta(lv) {
    const tier = evolutionTier(lv);
    const n = EVOLUTION_LADDER.length;
    const idx = tier % n;
    const prestige = Math.min(PRESTIGE_LABELS.length - 1, Math.floor(tier / n));
    const base = EVOLUTION_LADDER[idx];
    const prefix = PRESTIGE_LABELS[prestige] || "";
    return {
      tier: tier,
      idx: idx,
      prestige: prestige,
      id: base.id,
      name: prefix + base.name,
      accent: base.accent,
      feel: base.feel,
      palette: base.palette,
      glow: PRESTIGE_GLOWS[prestige] || null,
    };
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

  function activeBirdPalette(pipes) {
    const baseId = unlocks.equippedBird;
    const base = BIRD_PALETTES[baseId] || BIRD_PALETTES.bird_default;
    const evo = evolutionMeta(pipes == null ? score : pipes);
    // Tier 0 (Hatchling): shop skin is the body.
    // Tier >= 1: evolution ladder palette IS the bird — clearly different each form.
    // Shop may lightly tint beak only; body/wings come entirely from evolution.
    if (evo.tier <= 0 || !evo.palette) {
      return {
        body0: base.body0,
        body1: base.body1,
        body2: base.body2,
        wing: base.wing,
        wingDark: base.wingDark,
        belly: base.belly,
        beak: base.beak,
        cheek: base.cheek,
        glow: evo.glow || base.glow,
        evo: evo,
        birdId: baseId,
      };
    }
    const p = evo.palette;
    // Prestige cycles: slight warm/cool shift so repeat forms still feel upgraded
    const prestShift = evo.prestige > 0
      ? (evo.prestige === 1 ? "#ffe566" : evo.prestige === 2 ? "#c8e0ff" : evo.prestige === 3 ? "#ffb0e8" : "#90ffe0")
      : null;
    const ps = prestShift ? Math.min(0.22, 0.08 + evo.prestige * 0.04) : 0;
    return {
      body0: mixHex(p.body0, prestShift || p.body0, ps),
      body1: mixHex(p.body1, prestShift || p.body1, ps),
      body2: mixHex(p.body2, prestShift || p.body2, ps * 0.8),
      wing: mixHex(p.wing, prestShift || p.wing, ps * 0.7),
      wingDark: p.wingDark,
      belly: p.belly,
      beak: mixHex(p.beak, base.beak, 0.12),
      cheek: p.cheek,
      glow: evo.glow || p.glow,
      evo: evo,
      birdId: baseId,
    };
  }

  let unlocks = loadUnlocks();
  let unlockProgress = loadUnlockProgress();
  let shopScroll = 0;
  let shopDragY = null;
  let shopDragScroll = 0;
  let shopBusy = false;
  let shopToast = 0;
  let shopToastText = "";
  // Per-run perk state (reset in startPlay)
  let glideFlapsLeft = 0;
  let glideUsedThisRun = false;
  let doubleUsedThisRun = false;
  let shieldCharges = 0;
  let slowmoFrames = 0;
  let slowmoUsedThisRun = false;
  let hintFlashFrames = 0;
  let hintPipeId = null;
  let trailTick = 0;

  function loadUnlocks() {
    try {
      const raw = localStorage.getItem(UNLOCKS_KEY);
      if (!raw) {
        return { owned: ["bird_default"], equippedBird: "bird_default", equippedTrail: false };
      }
      const data = JSON.parse(raw);
      const owned = Array.isArray(data.owned) ? data.owned.map(String) : [];
      if (owned.indexOf("bird_default") < 0) owned.unshift("bird_default");
      let bird = typeof data.equippedBird === "string" ? data.equippedBird : "bird_default";
      if (owned.indexOf(bird) < 0) bird = "bird_default";
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
      localStorage.setItem(UNLOCKS_KEY, JSON.stringify({
        owned: unlocks.owned,
        equippedBird: unlocks.equippedBird,
        equippedTrail: !!unlocks.equippedTrail,
      }));
    } catch (_) {}
  }

  function loadUnlockProgress() {
    try {
      const raw = localStorage.getItem(UNLOCK_PROGRESS_KEY);
      if (!raw) return {};
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object" || Array.isArray(data)) return {};
      const out = {};
      for (const k of Object.keys(data)) {
        const n = parseInt(data[k], 10);
        if (Number.isFinite(n) && n > 0) out[k] = n;
      }
      return out;
    } catch (_) {
      return {};
    }
  }

  function saveUnlockProgress() {
    try {
      localStorage.setItem(UNLOCK_PROGRESS_KEY, JSON.stringify(unlockProgress));
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

  function toggleTrailEquip() {
    if (!isOwned("feat_trail")) return;
    unlocks.equippedTrail = !unlocks.equippedTrail;
    saveUnlocks();
  }

  function adsApi() {
    return typeof window !== "undefined" ? window.SkyHopAds : null;
  }

  function canNativeUnlockAd() {
    const ads = adsApi();
    return !!(ads && typeof ads.canOfferUnlock === "function" && ads.canOfferUnlock());
  }

  function isBrowserPlay() {
    const ads = adsApi();
    if (!ads) return true;
    try {
      return !(typeof ads.isNative === "function" && ads.isNative());
    } catch (_) {
      return true;
    }
  }

  function resetRunPerks() {
    glideFlapsLeft = 0;
    glideUsedThisRun = false;
    doubleUsedThisRun = false;
    shieldCharges = isOwned("skill_shield") ? 1 : 0;
    slowmoFrames = 0;
    slowmoUsedThisRun = false;
    hintFlashFrames = 0;
    hintPipeId = null;
    trailTick = 0;
  }

  function tryActivateGlide() {
    if (state !== State.PLAY || glideUsedThisRun || !isOwned("skill_glide")) return false;
    glideUsedThisRun = true;
    glideFlapsLeft = 3;
    shopToast = 0.9;
    shopToastText = "Glide!";
    return true;
  }

  function tryActivateDouble() {
    if (state !== State.PLAY || doubleUsedThisRun || !isOwned("skill_double")) return false;
    doubleUsedThisRun = true;
    bird.vy = FLAP * 1.35;
    bird.wing = 1;
    spawnParticles(bird.x, bird.y, 10, "#7dffb0");
    sfxFlap();
    shopToast = 0.9;
    shopToastText = "Double flap!";
    return true;
  }

  function tryActivateSlowmo() {
    if (state !== State.PLAY || slowmoUsedThisRun || !isOwned("feat_slowmo")) return false;
    slowmoUsedThisRun = true;
    slowmoFrames = 90; // ~1.5s at 60fps wall, applied as time scale
    shopToast = 0.9;
    shopToastText = "Slow-mo!";
    return true;
  }

  function triggerHintFlash() {
    if (!isOwned("feat_hint")) return;
    // Flash the nearest upcoming unscored pipe gap
    let best = null;
    for (const p of pipes) {
      if (p.scored) continue;
      if (p.x + p.w < bird.x - 10) continue;
      if (!best || p.x < best.x) best = p;
    }
    if (!best) return;
    hintPipeId = best;
    hintFlashFrames = 55;
  }

  function absorbHitWithShield() {
    if (shieldCharges <= 0) return false;
    shieldCharges = 0;
    invulnFrames = Math.max(invulnFrames, 60);
    flash = 0.55;
    spawnParticles(bird.x, bird.y, 16, "#c8e0ff");
    shopToast = 1;
    shopToastText = "Shield!";
    sfxNearMiss();
    return true;
  }

  // —— Levels & trophies (scalable to 10,000) ——
  const MAX_LEVEL = 10000;
  // Named landmark trophies (shelf highlights)
  const LANDMARKS = [1, 10, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
  const LANDMARK_NAMES = {
    1: "First Flap",
    10: "Tenfold Glide",
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
    try { localStorage.setItem(BEST_LEVEL_KEY, String(bestLevel)); } catch (_) {}
  }

  function loadHighestUnlocked() {
    try {
      const raw = localStorage.getItem(TROPHY_KEY);
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
        localStorage.setItem(TROPHY_KEY, JSON.stringify({ h }));
        return h;
      }
      return 0;
    } catch (_) {
      return 0;
    }
  }

  function saveHighestUnlocked() {
    localStorage.setItem(TROPHY_KEY, JSON.stringify({ h: highestUnlocked }));
  }

  function trophyNameFor(lv) {
    if (LANDMARK_NAMES[lv]) return LANDMARK_NAMES[lv];
    const prefixes = [
      "Cloud", "Sky", "Wind", "Dawn", "Sun", "Mist", "Peak", "Breeze",
      "Nest", "Wing", "Feather", "Horizon", "Glide", "Zephyr", "Aether",
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

  function unlockTrophy(lv) {
    if (lv < 1 || lv > MAX_LEVEL) return false;
    if (lv <= highestUnlocked) return false;
    const prev = highestUnlocked;
    highestUnlocked = lv;
    saveHighestUnlocked();
    shelfLevels = buildShelfLevels();
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
  // Entity caps (mobile-safe — never unbounded)
  const MAX_TREES = 14;
  const MAX_ANIMALS = 8;
  const MAX_HUNTERS = 3;
  const MAX_PROJECTILES = 8;
  const MAX_WATERFALLS = 4;
  const MAX_PARTICLES = 48;
  const NEAR_MISS_PX = 14;

  // —— Pipes ——
  const pipes = [];
  const PIPE_W = 58;
  let pipeGap = BASE_GAP;
  let pipeSpeed = BASE_SPEED;
  let spawnEvery = BASE_SPAWN;
  let gapMargin = BASE_GAP_MARGIN;
  let nextSpawn = 0;

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
      if (!muted) scheduleMusicNote(musicStep, nextNoteTime);
      musicStep++;
      nextNoteTime += MUSIC_STEP;
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

  function beep(freq, dur, type, gain) {
    if (muted || !audioCtx) return;
    try {
      const t0 = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = type || "square";
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(gain ?? 0.06, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch (_) {}
  }

  function sfxFlap() {
    beep(520, 0.07, "square", 0.045);
  }
  function sfxScore() {
    beep(660, 0.08, "triangle", 0.07);
    setTimeout(() => beep(880, 0.1, "triangle", 0.06), 70);
  }
  function sfxHit() {
    beep(140, 0.18, "sawtooth", 0.08);
  }
  function sfxLevel() {
    beep(520, 0.06, "triangle", 0.05);
    setTimeout(() => beep(720, 0.07, "triangle", 0.055), 55);
    setTimeout(() => beep(920, 0.09, "triangle", 0.05), 110);
  }
  function sfxTrophy() {
    beep(440, 0.07, "triangle", 0.06);
    setTimeout(() => beep(554, 0.08, "triangle", 0.06), 60);
    setTimeout(() => beep(659, 0.12, "triangle", 0.07), 130);
  }
  function sfxMilestone() {
    beep(523, 0.07, "triangle", 0.06);
    setTimeout(() => beep(659, 0.08, "triangle", 0.065), 70);
    setTimeout(() => beep(784, 0.1, "triangle", 0.07), 140);
    setTimeout(() => beep(1046, 0.14, "sine", 0.05), 220);
  }
  function sfxNearMiss() {
    beep(980, 0.04, "sine", 0.035);
    setTimeout(() => beep(1320, 0.05, "sine", 0.03), 40);
  }
  function sfxStreak() {
    beep(700, 0.05, "triangle", 0.04);
    setTimeout(() => beep(940, 0.07, "triangle", 0.045), 50);
  }
  function sfxNewRecord() {
    beep(392, 0.08, "triangle", 0.06);
    setTimeout(() => beep(523, 0.08, "triangle", 0.06), 80);
    setTimeout(() => beep(659, 0.09, "triangle", 0.065), 160);
    setTimeout(() => beep(784, 0.12, "triangle", 0.07), 250);
    setTimeout(() => beep(1046, 0.16, "sine", 0.055), 360);
  }

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
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
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
      localStorage.setItem(EXTRAS_KEY, extrasOn ? "1" : "0");
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
    pipeSpeed = BASE_SPEED + (MAX_SPEED - BASE_SPEED) * t;
    pipeGap = BASE_GAP + (MIN_GAP - BASE_GAP) * t;
    spawnEvery = Math.round(BASE_SPAWN + (MIN_SPAWN - BASE_SPAWN) * t);
    gapMargin = BASE_GAP_MARGIN + (MAX_GAP_MARGIN - BASE_GAP_MARGIN) * t;
  }

  function updateScoreMult() {
    // 1.0 → 2.5 based on clean streak (no near-miss)
    scoreMult = Math.min(2.5, 1 + Math.floor(cleanStreak / 3) * 0.25);
  }

  function onScoreChanged(prevScore) {
    const prev = level;
    level = levelFromScore(score);
    applyDifficulty();
    // Bird evolution every 10 pipes — independent of level-ups
    const before = prevScore == null ? Math.max(0, score - 1) : prevScore;
    const prevTier = evolutionTier(before);
    const nextTier = evolutionTier(score);
    if (nextTier > prevTier) {
      const evo = evolutionMeta(score);
      evolveFlash = 1.25;
      evolveFlashText = "Bird evolved! " + evo.name;
      sfxMilestone();
      const pal = activeBirdPalette(score);
      spawnParticles(bird.x, bird.y, 18, pal.body1 || "#ffe566");
      spawnParticles(bird.x, bird.y - 6, 10, pal.glow ? "#fff6a0" : (pal.body0 || "#fff"));
    }
    if (level > prev) {
      levelFlash = 1;
      levelFlashText = "Level " + formatLevel(level) + " / " + formatLevel(MAX_LEVEL);
      sfxLevel();
      unlockTrophy(level);
      if (level % 1000 === 0) {
        milestoneFlash = 1.2;
        milestoneFlashText = "✦ " + formatLevel(level) + " MILESTONE ✦";
        sfxMilestone();
      } else if (level % 100 === 0) {
        milestoneFlash = 1.1;
        milestoneFlashText = "★ Level " + formatLevel(level) + "! ★";
        sfxMilestone();
      } else if (level % 10 === 0) {
        milestoneFlash = 1;
        milestoneFlashText = "Level " + formatLevel(level);
        sfxLevel();
      }
    }
  }

  function spawnParticles(x, y, n, color) {
    const count = Math.min(n, MAX_PARTICLES - particles.length);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 3.5;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 1,
        life: 18 + Math.random() * 16,
        max: 34,
        color: color || "#ffe566",
        r: 1.5 + Math.random() * 2.5,
      });
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12;
      p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Clearance to gap edge when scoring a pipe; small = near-miss. */
  function pipeClearance(p) {
    const top = p.gapY - p.gap / 2;
    const bot = p.gapY + p.gap / 2;
    const toTop = bird.y - bird.r - top;
    const toBot = bot - (bird.y + bird.r);
    return Math.min(toTop, toBot);
  }

  function onPipeScored(p) {
    const clearance = pipeClearance(p);
    const nearMiss = clearance < NEAR_MISS_PX;
    pipeStreak++;
    if (nearMiss) {
      cleanStreak = 0;
      nearMissFlash = 1;
      spawnParticles(bird.x + 10, bird.y, 12, "#fff6a0");
      spawnParticles(bird.x, bird.y - 8, 8, "#ffd54a");
      sfxNearMiss();
      // Soft assist: auto slow-mo once per run on near-miss if owned
      if (isOwned("feat_slowmo") && !slowmoUsedThisRun) tryActivateSlowmo();
    } else {
      cleanStreak++;
      if (cleanStreak > 0 && cleanStreak % 3 === 0) {
        multPop = 1;
        sfxStreak();
        spawnParticles(W / 2, 100, 10, "#a0ffd0");
      }
    }
    updateScoreMult();
    // Base +1 always (level formula). Bonus points from clean streak (capped).
    let add = 1;
    if (scoreMult >= 2) add += 1;
    if (scoreMult >= 2.5) add += 1;
    if (nearMiss) add += 0; // sparkle only — no streak bonus
    const prevScore = score;
    score += add;
    scorePop = 1;
    onScoreChanged(prevScore);
    sfxScore();
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
    particles.length = 0;
    clearExtras();
    applyDifficulty();
  }

  function startPlay() {
    resetGame();
    continueUsedThisRun = false;
    continueBusy = false;
    invulnFrames = 0;
    resetRunPerks();
    state = State.PLAY;
    ensureAudio();
    startMusicLoop(true);
    sfxFlap();
    bird.vy = FLAP;
    unlockTrophy(1);
    // Auto gap-flash once at run start if owned
    if (isOwned("feat_hint")) {
      setTimeout(function () { if (state === State.PLAY) triggerHintFlash(); }, 400);
    }
    notifyAdsState();
  }

  function gameOver() {
    if (state !== State.PLAY) return;
    if (invulnFrames > 0) return;
    if (absorbHitWithShield()) return;
    state = State.OVER;
    overTimer = 0;
    flash = 1;
    softenMusic();
    sfxHit();
    beatBestScore = false;
    beatBestLevel = false;
    if (score > best) {
      best = score;
      localStorage.setItem(STORAGE_KEY, String(best));
      beatBestScore = true;
    }
    if (level > bestLevel) {
      bestLevel = level;
      localStorage.setItem(BEST_LEVEL_KEY, String(bestLevel));
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
    notifyAdsState();
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

  /** Resume mid-run after a completed rewarded video (one continue per run). */
  function continuePlay() {
    if (state !== State.OVER) return;
    continueUsedThisRun = true;
    continueBusy = false;
    state = State.PLAY;
    overTimer = 0;
    flash = 0;
    bird.y = PLAY_H / 2;
    bird.vy = FLAP;
    bird.rot = 0;
    bird.wing = 1;
    invulnFrames = 90;
    ensureAudio();
    startMusicLoop(true);
    sfxFlap();
    notifyAdsState();
  }

  async function requestRewardedContinue() {
    if (continueUsedThisRun || continueBusy || state !== State.OVER) return;
    const ads = adsApi();
    if (!ads) return;
    const show = typeof ads.showRewarded === "function"
      ? function () { return ads.showRewarded("continue"); }
      : ads.showRewardedContinue;
    if (typeof show !== "function") return;
    if (typeof ads.canOfferContinue === "function" && !ads.canOfferContinue()) return;
    continueBusy = true;
    try {
      const ok = await show();
      if (ok) continuePlay();
      else continueBusy = false;
    } catch (_) {
      continueBusy = false;
    }
  }

  async function requestUnlockWatch(itemId) {
    if (shopBusy || state !== State.SHOP) return;
    const item = CATALOG_BY_ID[itemId];
    if (!item || item.watches <= 0) return;
    if (unlocks.owned.indexOf(itemId) >= 0) return;
    shopBusy = true;
    try {
      const ads = adsApi();
      let ok = false;
      if (ads && typeof ads.showRewarded === "function" && canNativeUnlockAd()) {
        ok = await ads.showRewarded("unlock");
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
    prevMenuState = state === State.SHOP || state === State.TROPHIES ? prevMenuState : state;
    state = State.SHOP;
    shopScroll = 0;
    notifyAdsState();
  }

  function closeShop() {
    state = prevMenuState === State.PLAY ? State.START : prevMenuState;
    if (state === State.PLAY || state === State.TROPHIES || state === State.SHOP) state = State.START;
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
    rows: null, skills: null,
  };

  function flap() {
    ensureAudio();
    if (state === State.TROPHIES || state === State.SHOP) return;
    if (state === State.START) {
      startPlay();
      return;
    }
    if (state === State.OVER) {
      if (overTimer > 18) startPlay();
      return;
    }
    if (state === State.PLAY) {
      bird.vy = FLAP;
      bird.wing = 1;
      sfxFlap();
      if (glideFlapsLeft > 0) glideFlapsLeft--;
      if (unlocks.equippedTrail && isOwned("feat_trail")) {
        spawnParticles(bird.x - 8, bird.y, 6, trailColor());
      }
    }
  }

  function trailColor() {
    const pal = activeBirdPalette(score);
    return pal.body1 || "#ffe566";
  }

  function canvasToLocal(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    let clientX, clientY;
    if (e.touches && e.touches.length) {
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

  function isHudTarget(target) {
    if (!target) return false;
    if (target === muteBtn || target === extrasBtn) return true;
    if (target.closest && target.closest("#hud-btns")) return true;
    return false;
  }

  function onPointer(e) {
    if (isHudTarget(e.target)) return;
    e.preventDefault();
    const pt = canvasToLocal(e);

    if (state === State.TROPHIES) {
      if (hitBtn(pt, uiButtons.back)) {
        closeTrophies();
        return;
      }
      // start drag for scroll
      trophyDragY = pt.y;
      trophyDragScroll = trophyScroll;
      return;
    }

    if (state === State.START || state === State.OVER) {
      if (state === State.OVER && hitBtn(pt, uiButtons.continue)) {
        requestRewardedContinue();
        return;
      }
      if (hitBtn(pt, uiButtons.trophies)) {
        openTrophies();
        return;
      }
    }

    flap();
  }

  function onPointerMove(e) {
    if (state !== State.TROPHIES || trophyDragY == null) return;
    e.preventDefault();
    const pt = canvasToLocal(e);
    const dy = trophyDragY - pt.y;
    trophyScroll = Math.max(0, trophyDragScroll + dy);
    clampTrophyScroll();
  }

  function onPointerUp() {
    trophyDragY = null;
  }

  canvas.addEventListener("mousedown", onPointer);
  canvas.addEventListener("mousemove", onPointerMove);
  window.addEventListener("mouseup", onPointerUp);
  canvas.addEventListener("touchstart", onPointer, { passive: false });
  canvas.addEventListener("touchmove", onPointerMove, { passive: false });
  canvas.addEventListener("touchend", onPointerUp);
  canvas.addEventListener("wheel", (e) => {
    if (state !== State.TROPHIES) return;
    e.preventDefault();
    trophyScroll += e.deltaY * 0.5;
    clampTrophyScroll();
  }, { passive: false });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Escape" && state === State.TROPHIES) {
      e.preventDefault();
      closeTrophies();
      return;
    }
    if (e.code === "Space" || e.key === " ") {
      e.preventDefault();
      if (state !== State.TROPHIES) flap();
    }
  });

  function clampTrophyScroll() {
    const rowH = 52;
    const visible = 8;
    const n = shelfLevels.length;
    const maxScroll = Math.max(0, (n - visible) * rowH);
    trophyScroll = Math.max(0, Math.min(maxScroll, trophyScroll));
  }

  // —— Pipes ——
  function spawnPipe() {
    const margin = gapMargin;
    const gap = pipeGap;
    const minY = margin + gap / 2;
    const maxY = PLAY_H - margin - gap / 2 - 20;
    const span = Math.max(8, maxY - minY);
    const gapY = minY + Math.random() * span;
    pipes.push({
      x: W + 10,
      gapY,
      gap,
      scored: false,
      w: PIPE_W,
    });
  }

  function birdCircle() {
    return { x: bird.x, y: bird.y, r: bird.r - 2 };
  }

  function hitPipe(p) {
    const b = birdCircle();
    const left = p.x;
    const right = p.x + p.w;
    const topBot = p.gapY - p.gap / 2;
    const botTop = p.gapY + p.gap / 2;
    if (b.x + b.r < left || b.x - b.r > right) return false;
    if (b.y - b.r < topBot || b.y + b.r > botTop) return true;
    return false;
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
    let hazard = false;
    const tDiff = difficultyT(level);
    if (extrasOn && (forceHazard || (level >= 20 && Math.random() < 0.12 + tDiff * 0.2))) {
      hazard = true;
    }
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
    if (!extrasOn || level < 35) return;
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
      r: kind === "net" ? 14 : 7,
      life: 220,
    });
  }

  // —— Update ——
  function updateExtras() {
    const scroll = pipeSpeed;
    const playing = state === State.PLAY;

    // Spawns (soft-capped cadence + hard entity caps for mobile)
    if (playing) {
      const tD = difficultyT(level);
      nextTree--;
      if (nextTree <= 0) {
        if (trees.length < MAX_TREES) spawnTree(false);
        nextTree = extrasOn
          ? Math.max(40, 90 - tD * 50)
          : 100 + Math.random() * 80;
      }
      if (extrasOn) {
        nextAnimal--;
        if (nextAnimal <= 0 && level >= 8) {
          if (animals.length < MAX_ANIMALS) spawnAnimal();
          nextAnimal = Math.max(70, 140 - tD * 65);
        }
        nextHunter--;
        if (nextHunter <= 0 && level >= 35) {
          if (hunters.length < MAX_HUNTERS) spawnHunter();
          // Floor ~120 frames even at soft-cap — never spam
          const dens = Math.max(120, 260 - tD * 130);
          nextHunter = dens + Math.random() * 40;
        }
        nextWaterfall--;
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
      if (playing && wf.push > 0) {
        if (bird.x > wf.x && bird.x < wf.x + wf.w) {
          // Mild downward push — fair, readable
          bird.vy = Math.min(MAX_FALL, bird.vy + wf.push);
        }
      }
      if (wf.x + wf.w < -20) waterfalls.splice(i, 1);
    }

    // Animals
    for (let i = animals.length - 1; i >= 0; i--) {
      const a = animals[i];
      a.x += a.vx; // a.vx already includes leftward motion
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
      h.x -= scroll * 0.85;
      h.bob += 0.05;
      h.y += Math.sin(h.bob) * 0.35;
      if (playing) {
        h.shootCD--;
        if (h.shootCD <= 0 && h.x < W - 20 && h.x > 40) {
          fireProjectile(h);
          h.shootCD = Math.max(70, 110 - difficultyT(level) * 40);
        }
        // Body collision
        if (circleRect(bird.x, bird.y, bird.r - 2, h.x - 14, h.y - 18, 28, 36)) {
          gameOver();
          return;
        }
      }
      if (h.x < -50) hunters.splice(i, 1);
    }

    // Projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      if (playing) {
        const dx = bird.x - p.x;
        const dy = bird.y - p.y;
        const rr = bird.r + p.r - 3;
        if (dx * dx + dy * dy < rr * rr) {
          gameOver();
          return;
        }
      }
      if (p.life <= 0 || p.x < -30) projectiles.splice(i, 1);
    }
  }

  function update() {
    frame++;
    if (flash > 0) flash *= 0.88;
    if (scorePop > 0) scorePop *= 0.9;
    if (levelFlash > 0) levelFlash *= 0.94;
    if (milestoneFlash > 0) milestoneFlash *= 0.955;
    if (evolveFlash > 0) evolveFlash *= 0.95;
    if (trophyFlash > 0) trophyFlash *= 0.96;
    if (newRecordFlash > 0) newRecordFlash *= 0.97;
    if (multPop > 0) multPop *= 0.92;
    if (nearMissFlash > 0) nearMissFlash *= 0.9;
    if (shopToast > 0) shopToast *= 0.96;
    if (bird.wing > 0) bird.wing *= 0.85;
    if (invulnFrames > 0) invulnFrames--;
    if (hintFlashFrames > 0) hintFlashFrames--;
    if (slowmoFrames > 0) slowmoFrames--;
    updateParticles();

    if (state === State.TROPHIES || state === State.SHOP) return;

    const timeScale = (state === State.PLAY && slowmoFrames > 0) ? 0.45 : 1;
    const scrollMul = (state === State.PLAY ? 1 : state === State.START ? 0.35 : 0.15) * timeScale;
    groundX = (groundX - pipeSpeed * scrollMul) % 48;
    cloudX = (cloudX - pipeSpeed * 0.25 * scrollMul) % (W + 200);
    hillX = (hillX - pipeSpeed * 0.5 * scrollMul) % (W + 120);

    if (state === State.OVER) {
      overTimer++;
      bird.vy = Math.min(bird.vy + GRAVITY * 1.2, MAX_FALL);
      bird.y += bird.vy;
      bird.rot = Math.min(1.2, bird.rot + 0.06);
      updateExtras();
      return;
    }

    if (state === State.START) {
      bird.y = PLAY_H / 2 + Math.sin(frame * 0.06) * 10;
      bird.vy = 0;
      bird.rot = Math.sin(frame * 0.06) * 0.15;
      bird.wing = 0.5 + Math.sin(frame * 0.2) * 0.5;
      // Idle light scenery
      if (frame % 100 === 0) spawnTree(false);
      updateExtras();
      return;
    }

    // PLAY
    let g = GRAVITY;
    if (glideFlapsLeft > 0) g = GRAVITY * 0.42;
    if (slowmoFrames > 0) g *= timeScale;
    bird.vy = Math.min(bird.vy + g, MAX_FALL);
    bird.y += bird.vy * (slowmoFrames > 0 ? timeScale : 1);
    bird.rot = Math.max(-0.55, Math.min(1.15, bird.vy * 0.08));

    // Spark trail while flying with trail equipped
    if (unlocks.equippedTrail && isOwned("feat_trail")) {
      trailTick++;
      if (trailTick % 3 === 0) {
        spawnParticles(bird.x - 10, bird.y + (Math.random() * 6 - 3), 2, trailColor());
      }
    }

    // Periodic gap hint while owned (every ~4s if no active flash)
    if (isOwned("feat_hint") && hintFlashFrames <= 0 && frame % 240 === 0) {
      triggerHintFlash();
    }

    if (bird.y - bird.r < 0 || bird.y + bird.r > PLAY_H) {
      gameOver();
      return;
    }

    nextSpawn--;
    // Slow spawn countdown roughly with time scale
    if (slowmoFrames > 0 && frame % 2 === 0) {
      /* already decremented once */
    }
    if (nextSpawn <= 0) {
      spawnPipe();
      nextSpawn = spawnEvery;
      if (isOwned("feat_hint") && hintFlashFrames <= 0) triggerHintFlash();
    }

    const pipeStep = pipeSpeed * timeScale;
    for (let i = pipes.length - 1; i >= 0; i--) {
      const p = pipes[i];
      p.x -= pipeStep;

      if (!p.scored && p.x + p.w < bird.x) {
        p.scored = true;
        onPipeScored(p);
      }

      if (hitPipe(p)) {
        gameOver();
        return;
      }

      if (p.x + p.w < -20) pipes.splice(i, 1);
    }

    updateExtras();
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
    const g = ctx.createLinearGradient(0, 0, 0, PLAY_H);
    g.addColorStop(0, "#5eb8ff");
    g.addColorStop(0.55, "#8fd4ff");
    g.addColorStop(1, "#c8ecff");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, PLAY_H);
  }

  function drawCloud(cx, cy, s) {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.ellipse(cx, cy, 28 * s, 16 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - 22 * s, cy + 4 * s, 18 * s, 12 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 24 * s, cy + 2 * s, 20 * s, 13 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawClouds() {
    const base = cloudX;
    drawCloud((base + 80) % (W + 200) - 40, 70, 1);
    drawCloud((base + 280) % (W + 200) - 40, 120, 0.75);
    drawCloud((base + 450) % (W + 200) - 40, 55, 1.1);
  }

  function drawHills() {
    ctx.fillStyle = "#7bc96f";
    ctx.beginPath();
    const ox = hillX;
    for (let i = -1; i < 5; i++) {
      const x = ox + i * 140;
      ctx.moveTo(x, PLAY_H);
      ctx.quadraticCurveTo(x + 70, PLAY_H - 55, x + 140, PLAY_H);
    }
    ctx.fill();
    ctx.fillStyle = "#5aad52";
    ctx.beginPath();
    for (let i = -1; i < 5; i++) {
      const x = ox + 40 + i * 140;
      ctx.moveTo(x, PLAY_H);
      ctx.quadraticCurveTo(x + 55, PLAY_H - 36, x + 110, PLAY_H);
    }
    ctx.fill();
  }

  function drawTree(t) {
    const s = t.scale;
    const sway = Math.sin(t.sway) * (t.hazard ? 1.5 : 3);
    const trunkH = (t.hazard ? 75 : 55) * s;
    const trunkW = (t.trunkW || 12) * (t.hazard ? 1 : s);
    const tx = t.x + sway;
    const ty = t.baseY;

    // trunk
    ctx.fillStyle = t.hazard ? "#5a3a1a" : "#6b4423";
    ctx.fillRect(tx - trunkW / 2, ty - trunkH, trunkW, trunkH);

    // canopy
    const canopyY = ty - trunkH;
    const r1 = 22 * s;
    ctx.fillStyle = t.hazard ? "#2d6b2d" : `hsl(${t.hue}, 55%, 42%)`;
    ctx.beginPath();
    ctx.arc(tx, canopyY, r1, 0, Math.PI * 2);
    ctx.arc(tx - 14 * s, canopyY + 6 * s, r1 * 0.75, 0, Math.PI * 2);
    ctx.arc(tx + 14 * s, canopyY + 4 * s, r1 * 0.8, 0, Math.PI * 2);
    ctx.fill();
    // highlight
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.arc(tx - 6 * s, canopyY - 6 * s, r1 * 0.35, 0, Math.PI * 2);
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
      const g = ctx.createLinearGradient(sx, 0, sx, PLAY_H);
      g.addColorStop(0, "rgba(200,240,255,0.15)");
      g.addColorStop(0.5, "rgba(120,200,255,0.45)");
      g.addColorStop(1, "rgba(80,160,230,0.55)");
      ctx.fillStyle = g;
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

  function drawHunter(h) {
    ctx.save();
    ctx.translate(h.x, h.y);
    // silhouette body
    ctx.fillStyle = "#2a1a10";
    ctx.beginPath();
    ctx.ellipse(0, 6, 12, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    // head + hat
    ctx.beginPath();
    ctx.arc(0, -12, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1008";
    ctx.fillRect(-12, -18, 24, 5);
    ctx.fillRect(-4, -26, 8, 10);
    // arm + weapon
    ctx.strokeStyle = "#1a1008";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(22, 6);
    ctx.stroke();
    if (h.kind === "net") {
      ctx.strokeStyle = "#4a3020";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(26, 8, 8, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = "#3a2818";
      ctx.fillRect(20, 3, 14, 4);
    }
    // glowing eyes (readable threat)
    ctx.fillStyle = "#ff4444";
    ctx.beginPath();
    ctx.arc(-3, -13, 1.8, 0, Math.PI * 2);
    ctx.arc(3, -13, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
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

  function drawPipe(p) {
    const topH = p.gapY - p.gap / 2;
    const botY = p.gapY + p.gap / 2;
    const botH = PLAY_H - botY;
    const cap = 22;

    const bodyGrad = ctx.createLinearGradient(p.x, 0, p.x + p.w, 0);
    bodyGrad.addColorStop(0, "#2d8f45");
    bodyGrad.addColorStop(0.35, "#3cb85a");
    bodyGrad.addColorStop(0.7, "#2a9a48");
    bodyGrad.addColorStop(1, "#1f6e34");

    ctx.fillStyle = bodyGrad;
    ctx.fillRect(p.x + 4, 0, p.w - 8, topH);
    ctx.fillRect(p.x + 4, botY, p.w - 8, botH);

    ctx.fillStyle = "#48c96a";
    roundRect(p.x, topH - cap, p.w, cap, 6);
    ctx.fill();
    roundRect(p.x, botY, p.w, cap, 6);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(p.x + 8, topH - cap + 4, 8, cap - 8);
    ctx.fillRect(p.x + 8, botY + 4, 8, cap - 8);

    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.lineWidth = 2;
    roundRect(p.x, topH - cap, p.w, cap, 6);
    ctx.stroke();
    roundRect(p.x, botY, p.w, cap, 6);
    ctx.stroke();
  }

  function drawGround() {
    ctx.fillStyle = "#d4a84b";
    ctx.fillRect(0, PLAY_H, W, GROUND_H);

    const grass = ctx.createLinearGradient(0, PLAY_H, 0, PLAY_H + 18);
    grass.addColorStop(0, "#5ecf5a");
    grass.addColorStop(1, "#3aaa38");
    ctx.fillStyle = grass;
    ctx.fillRect(0, PLAY_H, W, 18);

    ctx.fillStyle = "rgba(0,0,0,0.08)";
    for (let x = groundX; x < W + 48; x += 48) {
      ctx.fillRect(x, PLAY_H + 20, 24, GROUND_H - 20);
    }

    ctx.fillStyle = "rgba(120,70,20,0.25)";
    for (let i = 0; i < 12; i++) {
      const dx = ((i * 53 + groundX * 2) % W + W) % W;
      ctx.beginPath();
      ctx.arc(dx, PLAY_H + 38 + (i % 3) * 8, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBird() {
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(bird.rot);

    // Evolution feel: slightly snappier wing visual at higher tiers (cosmetic only)
    const showPipes = (state === State.PLAY || state === State.OVER) ? score : 0;
    const pal = activeBirdPalette(showPipes);
    const evo = pal.evo;
    const birdId = pal.birdId;
    const wingBoost = 1 + (evo.feel || 0) * 0.35;
    const wingAngle = -0.5 + bird.wing * 1.1 * wingBoost;

    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath();
    ctx.ellipse(2, 18, 14, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    if (pal.glow) {
      ctx.fillStyle = pal.glow;
      ctx.beginPath();
      ctx.ellipse(0, 0, 22 + evo.prestige, 18 + evo.prestige * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Evolution outer aura (higher forms / prestige) — stronger so forms read at a glance
    if (evo.accent === "glow" || evo.accent === "halo" || evo.accent === "phoenix" || evo.accent === "nova" || evo.prestige > 0) {
      ctx.save();
      ctx.globalAlpha = 0.28 + evo.feel * 0.45 + evo.prestige * 0.06;
      ctx.fillStyle = pal.glow || "rgba(255,255,255,0.4)";
      ctx.beginPath();
      ctx.ellipse(0, 0, 28, 23, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const body = ctx.createRadialGradient(-4, -4, 2, 0, 0, 18);
    body.addColorStop(0, pal.body0);
    body.addColorStop(0.5, pal.body1);
    body.addColorStop(1, pal.body2);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 0, 17, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Shop skin accents (base family)
    if (birdId === "bird_neon") {
      ctx.strokeStyle = "#00e5ff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 17, 14, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (birdId === "bird_royal" || evo.accent === "eclipse") {
      ctx.fillStyle = birdId === "bird_royal" ? "#ffd700" : (evo.prestige ? "#ffe566" : "#c0a0ff");
      ctx.beginPath();
      ctx.moveTo(-6, -12);
      ctx.lineTo(-3, -18);
      ctx.lineTo(0, -13);
      ctx.lineTo(3, -18);
      ctx.lineTo(6, -12);
      ctx.closePath();
      ctx.fill();
    }
    if (birdId === "bird_night" || evo.accent === "eclipse" || evo.accent === "crest") {
      const crestBoost = evo.accent === "crest" ? 5 : (evo.accent === "eclipse" ? 3 : 0);
      ctx.fillStyle = pal.wingDark;
      ctx.beginPath();
      ctx.moveTo(-10, -8);
      ctx.lineTo(-15, -16 - crestBoost);
      ctx.lineTo(-4, -10);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(2, -10);
      ctx.lineTo(-1, -17 - crestBoost);
      ctx.lineTo(8, -9);
      ctx.fill();
    }

    // Evolution-only accents (ladder forms) — kept large so forms are unmistakable
    if (evo.accent === "crest" && birdId !== "bird_night") {
      ctx.fillStyle = pal.glow || pal.body0;
      ctx.beginPath();
      ctx.moveTo(-4, -11);
      ctx.lineTo(0, -24);
      ctx.lineTo(5, -12);
      ctx.fill();
      ctx.fillStyle = pal.body1;
      ctx.beginPath();
      ctx.moveTo(1, -12);
      ctx.lineTo(6, -22);
      ctx.lineTo(10, -11);
      ctx.fill();
      ctx.fillStyle = pal.beak;
      ctx.beginPath();
      ctx.moveTo(4, -12);
      ctx.lineTo(10, -19);
      ctx.lineTo(12, -10);
      ctx.fill();
    }
    if (evo.accent === "streaks") {
      ctx.strokeStyle = "rgba(180,255,230,0.9)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-18, -2);
      ctx.quadraticCurveTo(-30, -10, -42, 0);
      ctx.moveTo(-17, 5);
      ctx.quadraticCurveTo(-28, 4, -40, 12);
      ctx.moveTo(-15, 10);
      ctx.quadraticCurveTo(-24, 14, -34, 18);
      ctx.stroke();
    }
    if (evo.accent === "electric") {
      ctx.strokeStyle = "rgba(180,210,255,0.95)";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-16, -6);
      ctx.lineTo(-24, -14);
      ctx.lineTo(-18, -4);
      ctx.lineTo(-28, 2);
      ctx.lineTo(-20, 4);
      ctx.lineTo(-26, 12);
      ctx.stroke();
      ctx.fillStyle = "rgba(200,230,255,0.85)";
      ctx.beginPath();
      ctx.arc(-26, 12, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    if (evo.accent === "aurora") {
      ctx.strokeStyle = "rgba(255,100,200,0.7)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(2, 5, 13, 9, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(60,220,255,0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(2, 5, 10, 7, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(180,120,255,0.5)";
      ctx.beginPath();
      ctx.ellipse(2, 5, 7, 5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (evo.accent === "nova") {
      ctx.fillStyle = "#fff8c0";
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3 + frame * 0.06;
        ctx.beginPath();
        ctx.arc(18 + Math.cos(a) * 5, 2 + Math.sin(a) * 3.5, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(255,255,200,0.7)";
      ctx.beginPath();
      ctx.arc(18, 2, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (evo.accent === "halo") {
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, -18, 14, 4.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(200,220,255,0.55)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, -18, 11, 3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (evo.accent === "phoenix") {
      ctx.fillStyle = "rgba(255,80,20,0.7)";
      ctx.beginPath();
      ctx.moveTo(-14, 2);
      ctx.quadraticCurveTo(-32, -12, -46, 2);
      ctx.quadraticCurveTo(-30, 10, -14, 8);
      ctx.fill();
      ctx.fillStyle = "rgba(255,180,40,0.65)";
      ctx.beginPath();
      ctx.moveTo(-12, 4);
      ctx.quadraticCurveTo(-28, -2, -40, 10);
      ctx.quadraticCurveTo(-24, 12, -12, 10);
      ctx.fill();
      ctx.fillStyle = "rgba(255,240,120,0.55)";
      ctx.beginPath();
      ctx.moveTo(-12, 6);
      ctx.quadraticCurveTo(-22, 8, -32, 16);
      ctx.quadraticCurveTo(-18, 12, -12, 10);
      ctx.fill();
    }

    ctx.fillStyle = pal.belly;
    ctx.beginPath();
    ctx.ellipse(2, 5, 10, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(-2, 2);
    ctx.rotate(wingAngle);
    ctx.fillStyle = pal.wing;
    ctx.beginPath();
    ctx.ellipse(0, 0, 12 + evo.feel * 4, 7 + evo.feel * 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.wingDark;
    ctx.beginPath();
    ctx.ellipse(-2, 0, 7, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = birdId === "bird_night" || evo.accent === "eclipse" ? "#e8f0ff" : "#fff";
    ctx.beginPath();
    ctx.arc(8, -4, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = birdId === "bird_neon" ? "#111" : "#222";
    ctx.beginPath();
    ctx.arc(9.5, -4, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(10.5, -5.2, 1.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = pal.beak;
    ctx.beginPath();
    ctx.moveTo(14, -1);
    ctx.lineTo(24 + (evo.accent === "nova" ? 2 : 0), 2);
    ctx.lineTo(14, 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(14, 2);
    ctx.lineTo(22, 2);
    ctx.stroke();

    ctx.fillStyle = pal.cheek;
    ctx.beginPath();
    ctx.ellipse(4, 3, 4, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Prestige rim
    if (evo.prestige > 0) {
      ctx.strokeStyle = evo.glow || "rgba(255,215,0,0.55)";
      ctx.lineWidth = 1.5 + evo.prestige * 0.4;
      ctx.beginPath();
      ctx.ellipse(0, 0, 18, 15, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Shield bubble
    if (state === State.PLAY && shieldCharges > 0) {
      ctx.strokeStyle = "rgba(180,220,255,0.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawScoreHUD() {
    if (state !== State.PLAY && state !== State.OVER) return;

    const text = String(score);
    const scale = 1 + scorePop * 0.35;
    ctx.save();
    ctx.translate(W / 2, 48);
    ctx.scale(scale, scale);
    ctx.font = "bold 48px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = "#fff";
    ctx.fillText(text, 0, 0);
    ctx.restore();

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 15px 'Segoe UI', system-ui, sans-serif";
    const lv = "Level " + formatLevel(level) + " / " + formatLevel(MAX_LEVEL);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.strokeText(lv, W / 2, 82);
    ctx.fillStyle = level >= MAX_LEVEL ? "#ffe08a" : "rgba(255,255,255,0.92)";
    ctx.fillText(lv, W / 2, 82);
    ctx.restore();

    // Combo / multiplier
    if (state === State.PLAY && (scoreMult > 1 || cleanStreak >= 2)) {
      ctx.save();
      const ms = 1 + multPop * 0.3;
      ctx.translate(W / 2, 102);
      ctx.scale(ms, ms);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 13px 'Segoe UI', system-ui, sans-serif";
      const mt = "×" + (Math.round(scoreMult * 100) / 100) + "  ·  streak " + cleanStreak;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,40,20,0.3)";
      ctx.strokeText(mt, 0, 0);
      ctx.fillStyle = scoreMult >= 2 ? "#7dffb0" : "#c8ffe0";
      ctx.fillText(mt, 0, 0);
      ctx.restore();
    }

    if (nearMissFlash > 0.05 && state === State.PLAY) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, nearMissFlash);
      ctx.textAlign = "center";
      ctx.font = "bold 14px 'Segoe UI', system-ui, sans-serif";
      ctx.fillStyle = "#fff6a0";
      ctx.fillText("Close call!", W / 2, bird.y - 36);
      ctx.restore();
    }

    if (levelFlash > 0.04 && state === State.PLAY) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, levelFlash * 1.15);
      const y = 122 + (1 - levelFlash) * 10;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 20px 'Segoe UI', system-ui, sans-serif";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(0,40,80,0.35)";
      ctx.strokeText(levelFlashText, W / 2, y);
      ctx.fillStyle = "#ffe566";
      ctx.fillText(levelFlashText, W / 2, y);
      ctx.restore();
    }

    if (milestoneFlash > 0.05 && state === State.PLAY) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, milestoneFlash);
      const y = 150 + (1 - Math.min(1, milestoneFlash)) * 12;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 18px 'Segoe UI', system-ui, sans-serif";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(60,20,80,0.4)";
      ctx.strokeText(milestoneFlashText, W / 2, y);
      ctx.fillStyle = "#ff9cf0";
      ctx.fillText(milestoneFlashText, W / 2, y);
      ctx.restore();
    }

    if (evolveFlash > 0.05 && state === State.PLAY) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, evolveFlash);
      const y = 168 + (1 - Math.min(1, evolveFlash)) * 14;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 17px 'Segoe UI', system-ui, sans-serif";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(20,60,40,0.45)";
      ctx.strokeText(evolveFlashText, W / 2, y);
      ctx.fillStyle = "#7dffb0";
      ctx.fillText(evolveFlashText, W / 2, y);
      ctx.restore();
    }

    // Current evolution form (top-left — clearly readable)
    if (state === State.PLAY) {
      const evo = evolutionMeta(score);
      const label = "Form: " + evo.name;
      ctx.save();
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "bold 13px 'Segoe UI', system-ui, sans-serif";
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(0,30,50,0.55)";
      ctx.beginPath();
      // rounded pill behind name
      const px = 6, py = 12, pw = tw + 12, ph = 20, r = 6;
      ctx.moveTo(px + r, py);
      ctx.arcTo(px + pw, py, px + pw, py + ph, r);
      ctx.arcTo(px + pw, py + ph, px, py + ph, r);
      ctx.arcTo(px, py + ph, px, py, r);
      ctx.arcTo(px, py, px + pw, py, r);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,40,60,0.55)";
      ctx.strokeText(label, 12, 22);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, 12, 22);
      ctx.restore();
    }

    if (trophyFlash > 0.05) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, trophyFlash * 1.2);
      const y = 172 + (1 - trophyFlash) * 14;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 14px 'Segoe UI', system-ui, sans-serif";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(40,20,0,0.4)";
      ctx.strokeText(trophyFlashText, W / 2, y);
      ctx.fillStyle = "#ffd700";
      ctx.fillText(trophyFlashText, W / 2, y);
      ctx.restore();
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
    ctx.fillText("🛒 Shop", cx, cy);
    uiButtons.shop = { x: bx, y: by, w: bw, h: bh };
  }

  function drawStart() {
    uiButtons.trophies = null;
    uiButtons.shop = null;
    uiButtons.continue = null;
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.font = "bold 52px 'Segoe UI', system-ui, sans-serif";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(0,40,80,0.25)";
    ctx.strokeText("Sky Hop", W / 2, 78);
    ctx.fillText("Sky Hop", W / 2, 78);

    ctx.font = "16px 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillText("Flap through the clouds!", W / 2, 112);

    ctx.font = "14px 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText(formatLevel(MAX_LEVEL) + " levels — every " + PIPES_PER_LEVEL + " pipes", W / 2, 136);

    // Ready/menu: show starting form + evolution cadence
    const menuEvo = evolutionMeta(1);
    ctx.font = "bold 13px 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,220,0.92)";
    ctx.fillText("Form: " + menuEvo.name + "  ·  evolves every 10 pipes", W / 2, 158);

    if (extrasOn) {
      ctx.fillStyle = "rgba(255,255,200,0.7)";
      ctx.font = "12px 'Segoe UI', system-ui, sans-serif";
      ctx.fillText("Extras on — trees, critters & hunters!", W / 2, 178);
    }

    drawShopButton(W / 2 - 70, PLAY_H - 88);
    drawTrophyButton(W / 2 + 70, PLAY_H - 88);

    const pulse = 0.55 + Math.sin(frame * 0.12) * 0.45;
    ctx.globalAlpha = pulse;
    ctx.font = "bold 20px 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText("Tap / Space to start", W / 2, PLAY_H - 40);
    ctx.globalAlpha = 1;

    ctx.globalAlpha = 0.85;
    ctx.font = "13px 'Segoe UI', system-ui, sans-serif";
    const bestBits = [];
    if (best > 0) bestBits.push("Best score " + best);
    if (bestLevel > 0) bestBits.push("Best level " + formatLevel(bestLevel));
    bestBits.push("🏆 " + formatLevel(trophyCount()));
    ctx.fillText(bestBits.join("  ·  "), W / 2, PLAY_H - 14);
    ctx.globalAlpha = 1;
  }

  function drawOver() {
    uiButtons.trophies = null;
    uiButtons.shop = null;
    uiButtons.continue = null;
    const lines = [
      "Level  " + formatLevel(level),
      "Score  " + score,
      "Best score  " + best,
      "Best level  " + formatLevel(bestLevel),
    ];
    if (beatBestScore || beatBestLevel) lines.push("✦ New record!");
    const panel = drawPanel(
      "Game Over",
      lines,
      overTimer > 18 ? "Tap / Space to retry (free)" : "…"
    );
    // Keep Retry / continue / trophies above native banner (padding via --ad-banner-pad)
    let y = panel.py + panel.ph + 24;
    const ads = typeof window !== "undefined" ? window.SkyHopAds : null;
    const offerContinue =
      overTimer > 18 &&
      !continueUsedThisRun &&
      !continueBusy &&
      ads &&
      typeof ads.canOfferContinue === "function" &&
      ads.canOfferContinue();

    if (offerContinue) {
      const bw = 240;
      const bh = 40;
      const bx = (W - bw) / 2;
      const by = y;
      ctx.fillStyle = "rgba(40, 120, 200, 0.92)";
      roundRect(bx, by, bw, bh, 12);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 2;
      roundRect(bx, by, bw, bh, 12);
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 15px 'Segoe UI', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Watch ad to continue", bx + bw / 2, by + bh / 2);
      uiButtons.continue = { x: bx, y: by, w: bw, h: bh };
      y += bh + 16;
    } else if (continueUsedThisRun && overTimer > 18) {
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "12px 'Segoe UI', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Continue already used this run", W / 2, y + 8);
      y += 28;
    }

    drawShopButton(W / 2 - 70, y + 8);
    drawTrophyButton(W / 2 + 70, y + 8);
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
    const levels = shelfLevels;
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


  function drawShopScreen() {
    ctx.fillStyle = "rgba(10,20,35,0.92)";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 26px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Shop", W / 2, 42);
    ctx.font = "12px 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = "rgba(180,210,255,0.9)";
    const browser = isBrowserPlay();
    ctx.fillText(
      browser ? "Preview · Simulate unlock (web) for playtesting" : "Watch ads to unlock · Free Retry always",
      W / 2, 66
    );

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
    uiButtons.rows = [];

    const listTop = 88;
    const listBot = H - 28;
    const rowH = 58;
    ctx.save();
    ctx.beginPath();
    ctx.rect(12, listTop, W - 24, listBot - listTop);
    ctx.clip();

    const startIdx = Math.floor(shopScroll / rowH);
    const endIdx = Math.min(CATALOG.length, startIdx + Math.ceil((listBot - listTop) / rowH) + 1);

    for (let i = startIdx; i < endIdx; i++) {
      const item = CATALOG[i];
      const y = listTop + i * rowH - shopScroll;
      const owned = isOwned(item.id);
      const inOwnedList = unlocks.owned.indexOf(item.id) >= 0;
      const freeByLevel = !!(item.freeLevel && peakLevel() >= item.freeLevel);
      const prog = progressFor(item.id);
      const need = item.watches;
      const equipped = item.kind === "bird" && unlocks.equippedBird === item.id;
      const trailOn = item.id === "feat_trail" && unlocks.equippedTrail;

      ctx.fillStyle = owned
        ? (equipped || trailOn ? "rgba(80,180,120,0.22)" : "rgba(255,255,255,0.1)")
        : "rgba(255,255,255,0.05)";
      roundRect(20, y + 4, W - 40, rowH - 8, 10);
      ctx.fill();

      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "bold 13px 'Segoe UI', system-ui, sans-serif";
      ctx.fillStyle = owned ? "#e8f4ff" : "rgba(180,190,200,0.7)";
      let title = item.name;
      if (item.kind === "bird") title = "🐦 " + title;
      else if (item.kind === "feat") title = "✨ " + title;
      else title = "⚡ " + title;
      ctx.fillText(title, 32, y + rowH / 2 - 10);

      ctx.font = "11px 'Segoe UI', system-ui, sans-serif";
      let sub;
      if (owned) {
        if (item.kind === "bird" && equipped) sub = "Owned · Equipped";
        else if (item.id === "feat_trail" && trailOn) sub = "Owned · Trail ON";
        else if (item.id === "feat_trail") sub = "Owned · tap to toggle";
        else if (freeByLevel && !inOwnedList) sub = "Owned · free @ L" + item.freeLevel;
        else sub = "Owned";
      } else {
        sub = "Locked · " + prog + "/" + need + " ads";
        if (item.freeLevel) sub += " · free @ L" + item.freeLevel;
      }
      ctx.fillStyle = owned ? "rgba(200,230,255,0.65)" : "rgba(160,170,180,0.55)";
      ctx.fillText(sub, 32, y + rowH / 2 + 10);

      // Action chip on the right
      const chipW = 96;
      const chipH = 28;
      const chipX = W - 28 - chipW;
      const chipY = y + (rowH - chipH) / 2;
      let action = null;
      let label = "";
      let chipFill = "rgba(255,255,255,0.12)";
      let chipText = "#fff";

      if (owned && item.kind === "bird") {
        if (!equipped) {
          action = "equip";
          label = "Equip";
          chipFill = "rgba(255,200,60,0.9)";
          chipText = "#3a2800";
        } else {
          label = "Equipped";
          chipFill = "rgba(80,160,100,0.7)";
        }
      } else if (owned && item.id === "feat_trail") {
        action = "toggleTrail";
        label = trailOn ? "Trail ON" : "Enable";
        chipFill = trailOn ? "rgba(80,160,100,0.85)" : "rgba(80,140,220,0.85)";
      } else if (owned) {
        label = "Ready";
        chipFill = "rgba(80,160,100,0.55)";
      } else if (need > 0) {
        if (browser) {
          action = "simulate";
          label = "Simulate";
          chipFill = "rgba(120,100,200,0.85)";
        } else if (canNativeUnlockAd()) {
          action = "watch";
          label = "Watch " + prog + "/" + need;
          chipFill = "rgba(40,120,200,0.92)";
        } else {
          label = "App only";
          chipFill = "rgba(80,80,90,0.55)";
        }
      }

      if (label) {
        ctx.fillStyle = chipFill;
        roundRect(chipX, chipY, chipW, chipH, 8);
        ctx.fill();
        ctx.fillStyle = chipText;
        ctx.font = "bold 11px 'Segoe UI', system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, chipX + chipW / 2, chipY + chipH / 2);
      }

      if (action) {
        uiButtons.rows.push({
          x: chipX, y: chipY, w: chipW, h: chipH,
          itemId: item.id, action: action,
        });
      }
    }
    ctx.restore();

    if (shopToast > 0.05) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, shopToast);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      roundRect(W / 2 - 120, H - 52, 240, 28, 8);
      ctx.fill();
      ctx.fillStyle = "#ffe566";
      ctx.font = "bold 13px 'Segoe UI', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(shopToastText, W / 2, H - 38);
      ctx.restore();
    }

    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "11px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Birds · features · skills  ·  Esc", W / 2, H - 10);
  }

  function drawGapHint() {
    if (hintFlashFrames <= 0 || !hintPipeId) return;
    const p = hintPipeId;
    if (pipes.indexOf(p) < 0) return;
    const top = p.gapY - p.gap / 2;
    const bot = p.gapY + p.gap / 2;
    const a = Math.min(1, hintFlashFrames / 40) * 0.55;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = "#fff6a0";
    ctx.fillRect(p.x - 4, top, p.w + 8, bot - top);
    ctx.strokeStyle = "#ffe566";
    ctx.lineWidth = 3;
    ctx.strokeRect(p.x - 4, top, p.w + 8, bot - top);
    ctx.restore();
  }

  function drawSkillHud() {
    uiButtons.skills = [];
    if (state !== State.PLAY) return;
    const buttons = [];
    if (isOwned("skill_glide") && !glideUsedThisRun) buttons.push({ action: "glide", label: "Glide", hot: "1" });
    if (isOwned("skill_double") && !doubleUsedThisRun) buttons.push({ action: "double", label: "Boost", hot: "2" });
    if (isOwned("feat_slowmo") && !slowmoUsedThisRun) buttons.push({ action: "slowmo", label: "Slow", hot: "3" });
    if (isOwned("feat_hint")) buttons.push({ action: "hint", label: "Hint", hot: "4" });
    if (!buttons.length) return;
    const bw = 54;
    const bh = 28;
    const gap = 6;
    const totalW = buttons.length * bw + (buttons.length - 1) * gap;
    let x = (W - totalW) / 2;
    const y = H - GROUND_H - 36;
    for (const b of buttons) {
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      roundRect(x, y, bw, bh, 8);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1;
      roundRect(x, y, bw, bh, 8);
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px 'Segoe UI', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(b.label, x + bw / 2, y + bh / 2);
      uiButtons.skills.push({ x: x, y: y, w: bw, h: bh, action: b.action });
      x += bw + gap;
    }
    if (slowmoFrames > 0) {
      ctx.fillStyle = "rgba(100,180,255,0.15)";
      ctx.fillRect(0, 0, W, H);
    }
    if (shopToast > 0.05 && state === State.PLAY) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, shopToast);
      ctx.fillStyle = "#ffe566";
      ctx.font = "bold 14px 'Segoe UI', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(shopToastText, W / 2, PLAY_H - 56);
      ctx.restore();
    }
  }


  function drawFlash() {
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

  // —— Fit canvas ——
  function fitCanvas() {
    const wrap = document.getElementById("game-wrap");
    const aw = wrap.clientWidth;
    const ah = wrap.clientHeight;
    const scale = Math.min(aw / W, ah / H);
    const dw = Math.floor(W * scale);
    const dh = Math.floor(H * scale);
    canvas.style.width = dw + "px";
    canvas.style.height = dh + "px";
  }
  window.addEventListener("resize", fitCanvas);
  fitCanvas();

  // —— Loop ——
  function loop() {
    update();

    if (state === State.TROPHIES) {
      drawSky();
      drawClouds();
      drawHills();
      drawGround();
      drawTrophiesScreen();
      requestAnimationFrame(loop);
      return;
    }

    if (state === State.SHOP) {
      drawSky();
      drawClouds();
      drawHills();
      drawGround();
      drawShopScreen();
      requestAnimationFrame(loop);
      return;
    }

    drawSky();
    drawClouds();
    drawHills();
    drawWorldExtras("bg");

    for (const p of pipes) drawPipe(p);
    drawGapHint();

    drawWorldExtras("fg");
    drawGround();

    if (state === State.START) {
      drawBird();
      drawStart();
    } else {
      drawBird();
      drawScoreHUD();
      drawSkillHud();
      if (state === State.OVER) drawOver();
    }

    drawParticles();
    drawFlash();
    requestAnimationFrame(loop);
  }

  resetGame();
  state = State.START;
  notifyAdsState();
  requestAnimationFrame(loop);
})();
