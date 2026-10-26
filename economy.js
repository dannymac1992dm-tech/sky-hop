/**
 * Sky Hop 1.5 — economy, save data, skills, birds, missions (pure logic).
 * Browser: window.SkyHopEconomy. Node: module.exports (for tests/simulations).
 * No DOM access here; game.js owns rendering and storage I/O.
 */
(function (global) {
  "use strict";

  const SAVE_KEY = "skyhop_v15";
  const SAVE_VERSION = 1;
  const FPS = 60;

  // —— Skills ——
  // cd = base cooldown (s), dur = base active duration (s). unlockLevel = best level needed.
  const SKILLS = [
    { id: "dash", name: "Dash", key: "1", unlockLevel: 10, cd: 10, dur: 0.35, coinPrice: 75, adWatches: 2, color: "#ff9f43",
      desc: "Burst forward, brief invulnerability" },
    { id: "shield", name: "Shield", key: "2", unlockLevel: 25, cd: 25, dur: 6, coinPrice: 150, adWatches: 2, color: "#74c0fc",
      desc: "Absorbs one hit" },
    { id: "shrink", name: "Shrink", key: "3", unlockLevel: 40, cd: 20, dur: 5, coinPrice: 225, adWatches: 2, color: "#b197fc",
      desc: "Tiny hitbox for a few seconds" },
    { id: "magnet", name: "Magnet", key: "5", unlockLevel: 80, cd: 20, dur: 6, coinPrice: 375, adWatches: 3, color: "#ff6b9a",
      desc: "Pulls in nearby coins" },
  ];
  // Legacy catalog skills that stay on their own unlock path (ads / free level) but use the skill bar.
  const EXTRA_SKILLS = [
    // v1.9: Ghost replaced Glide in the same slot (key 6, catalog unlock: 2 rewarded ads / 350 coins / free at level 40).
    // Once per run; lasts 5 pipes (not seconds), so cd/dur are unused for it. Glide owners are migrated in game.js.
    { id: "ghost", name: "Ghost", key: "6", cd: 0, dur: 0, color: "#c9d6ff", catalogId: "skill_ghost", oncePerRun: true, pipes: 5, desc: "Fly through the next 5 pipes" },
  ];
  const SKILL_BY_ID = {};
  for (const s of SKILLS.concat(EXTRA_SKILLS)) SKILL_BY_ID[s.id] = s;

  // —— Upgrades (coins) ——
  // values[t] = effect at tier t (t=0 is base). prices[t] = cost to buy tier t+1.
  const UPGRADES = [
    { id: "dashCd", name: "Dash Recharge", skill: "dash", unit: "s cooldown", values: [10, 8.5, 7.5, 6.5, 5.5], prices: [30, 75, 150, 275] },
    { id: "shieldDur", name: "Sturdy Shield", skill: "shield", unit: "s shield", values: [6, 8, 10, 12, 15], prices: [30, 75, 150, 275] },
    { id: "shrinkDur", name: "Tiny Time", skill: "shrink", unit: "s shrink", values: [5, 6, 7, 8, 9], prices: [35, 80, 160, 290] },
    { id: "magnetRad", name: "Magnet Range", skill: "magnet", unit: "px radius", values: [90, 115, 140, 170, 200], prices: [40, 90, 170, 300] },
    { id: "recharge", name: "Quick Recharge", skill: null, needsAnySkill: true, unit: "× all cooldowns", values: [1, 0.94, 0.88, 0.82, 0.76, 0.7], prices: [50, 110, 200, 325, 500] },
    { id: "lucky", name: "Lucky Coins", skill: null, unit: "% coin bonus", values: [0, 10, 20, 30], prices: [15, 120, 350] },
  ];
  const UPGRADE_BY_ID = {};
  for (const u of UPGRADES) UPGRADE_BY_ID[u.id] = u;

  // —— Collectible birds (species: shape + perk) ——
  const SPECIES = [
    { id: "sparrow", name: "Sparrow", perk: "All-rounder: cooldowns −5%", price: 0, trophyLevel: 0,
      palette: { body0: "#fff5a0", body1: "#ffd54a", body2: "#f0a820", wing: "#ffb020", wingDark: "#e89010", belly: "rgba(255,255,255,0.55)", beak: "#ff6b2d", cheek: "rgba(255,100,100,0.35)", glow: null } },
    { id: "swallow", name: "Swallow", perk: "Dash cooldown −30%", price: 150, trophyLevel: 15,
      palette: { body0: "#8fb8ff", body1: "#2f5fd0", body2: "#15306e", wing: "#1f3f8f", wingDark: "#0f2250", belly: "rgba(255,235,220,0.85)", beak: "#3a2a20", cheek: "rgba(230,90,60,0.55)", glow: null } },
    { id: "owl", name: "Owl", perk: "Starts every run with a Shield", price: 250, trophyLevel: 30,
      palette: { body0: "#e8d2b0", body1: "#a07850", body2: "#5a3e24", wing: "#8a6440", wingDark: "#5a3e24", belly: "rgba(255,240,215,0.75)", beak: "#e0a030", cheek: "rgba(200,140,90,0.35)", glow: null } },
    { id: "hummingbird", name: "Hummingbird", perk: "Shrink lasts 50% longer", price: 325, trophyLevel: 45,
      palette: { body0: "#b8ffd8", body1: "#20c080", body2: "#0a6a48", wing: "#6ae0ff", wingDark: "#2090c0", belly: "rgba(255,255,255,0.6)", beak: "#222222", cheek: "rgba(255,40,120,0.7)", glow: null } },
    { id: "parrot", name: "Parrot", perk: "+25% coins", price: 400, trophyLevel: 60,
      palette: { body0: "#ff9a8a", body1: "#e8332a", body2: "#8a1010", wing: "#2a7de0", wingDark: "#f0c020", belly: "rgba(255,230,120,0.6)", beak: "#f5f0e0", cheek: "rgba(255,255,255,0.55)", glow: null } },
    { id: "eagle", name: "Eagle", perk: "Magnet lasts 50% longer", price: 550, trophyLevel: 100,
      palette: { body0: "#a07a5a", body1: "#6a4428", body2: "#3a2210", wing: "#5a3820", wingDark: "#2e1a0c", belly: "rgba(255,255,255,0.15)", beak: "#ffc20e", cheek: "rgba(0,0,0,0)", glow: null } },
  ];
  const SPECIES_BY_ID = {};
  for (const s of SPECIES) SPECIES_BY_ID[s.id] = s;

  // —— Cosmetics ——
  // Existing ad skins (catalog ids) also get a coin price; new coin-only skins listed with palettes.
  const SKIN_COIN_PRICES = { bird_gold: 125, bird_night: 125, bird_neon: 200, bird_royal: 300 };
  const NEW_SKINS = [
    { id: "skin_candy", name: "Candy Pop", price: 150,
      palette: { body0: "#fff0fa", body1: "#ff8fd0", body2: "#d0408f", wing: "#8ff0d8", wingDark: "#40c0a0", belly: "rgba(255,255,255,0.7)", beak: "#ffb347", cheek: "rgba(255,80,160,0.45)", glow: "rgba(255,143,208,0.3)" } },
    { id: "skin_frost", name: "Frost", price: 175,
      palette: { body0: "#ffffff", body1: "#bfe8ff", body2: "#5aa8e0", wing: "#e0f6ff", wingDark: "#88c8f0", belly: "rgba(255,255,255,0.8)", beak: "#6ab0ff", cheek: "rgba(140,200,255,0.5)", glow: "rgba(190,235,255,0.45)" } },
    { id: "skin_lava", name: "Lava", price: 250,
      palette: { body0: "#ffe08a", body1: "#ff5a1f", body2: "#5a0f00", wing: "#2a0a04", wingDark: "#ff3d00", belly: "rgba(255,200,80,0.55)", beak: "#ffd000", cheek: "rgba(255,120,0,0.6)", glow: "rgba(255,90,31,0.45)" } },
  ];
  // v1.10: original skins (no famous characters). Unlock with the Rewarded Unlock ad (opt-in) or coins.
  const WORLD_SKINS = [
    { id: "skin_pigeon", name: "City Pigeon", price: 150, watches: 1, blurb: "Shiny green-purple neck, grey wing bars",
      palette: { body0: "#e3e7ef", body1: "#9aa3b5", body2: "#5d6578", wing: "#b7bfcd", wingDark: "#4a5061", belly: "rgba(230,232,242,0.5)", beak: "#3a3a44", cheek: "rgba(0,0,0,0)", glow: null } },
    { id: "skin_duck", name: "Rubber Duck", price: 250, watches: 2, blurb: "Squeaky-clean yellow with a flat orange bill",
      palette: { body0: "#fffbd0", body1: "#ffe03a", body2: "#f0b400", wing: "#ffd21a", wingDark: "#e8a800", belly: "rgba(255,255,255,0.5)", beak: "#ff8a1a", cheek: "rgba(255,140,60,0.45)", glow: null } },
    { id: "skin_robo", name: "Robo Hopper", price: 300, watches: 2, blurb: "Chrome body, visor and a blinking antenna",
      palette: { body0: "#f2f5fa", body1: "#b8c2d3", body2: "#6b778c", wing: "#8fa0b8", wingDark: "#4b5870", belly: "rgba(120,220,255,0.35)", beak: "#ffb02e", cheek: "rgba(80,220,255,0.5)", glow: "rgba(80,220,255,0.22)" } },
    { id: "skin_cloud", name: "Cloud Puff", price: 300, watches: 2, blurb: "A fluffy little cloud with rosy cheeks",
      palette: { body0: "#ffffff", body1: "#eef4ff", body2: "#b9c8e6", wing: "#ffffff", wingDark: "#d6e2f5", belly: "rgba(255,255,255,0.8)", beak: "#ffb36b", cheek: "rgba(255,140,180,0.55)", glow: "rgba(255,255,255,0.3)" } },
    { id: "skin_dragon", name: "Little Dragon", price: 450, watches: 3, blurb: "Emerald scales, tiny horns, puffs of smoke",
      palette: { body0: "#b8f5d0", body1: "#2fbf7a", body2: "#146b48", wing: "#ff9f43", wingDark: "#d9632a", belly: "rgba(255,226,150,0.75)", beak: "#1f7a52", cheek: "rgba(255,120,80,0.4)", glow: "rgba(80,255,170,0.22)" } },
    // v1.11: more original birds (same opt-in rewarded unlock or coins)
    { id: "skin_penguin", name: "Penguin Pal", price: 200, watches: 1, blurb: "Tuxedo feathers and little orange feet",
      palette: { body0: "#5a6070", body1: "#2b2f3a", body2: "#141720", wing: "#2b2f3a", wingDark: "#0d0f14", belly: "rgba(255,255,255,0.0)", beak: "#ff922b", cheek: "rgba(255,150,170,0.35)", glow: null } },
    { id: "skin_bee", name: "Bumble Bee", price: 250, watches: 2, blurb: "Fuzzy stripes, see-through wings, antennae",
      palette: { body0: "#fff3a0", body1: "#ffd43b", body2: "#e8a800", wing: "#fff9db", wingDark: "#d9c46a", belly: "rgba(255,255,255,0.3)", beak: "#212529", cheek: "rgba(255,140,60,0.4)", glow: null } },
    { id: "skin_toucan", name: "Jungle Toucan", price: 300, watches: 2, blurb: "Jet-black feathers and a giant sunset beak",
      palette: { body0: "#4a4f5c", body1: "#22252d", body2: "#0f1115", wing: "#2b2f3a", wingDark: "#0d0f14", belly: "rgba(255,249,219,0.4)", beak: "#ff922b", cheek: "rgba(0,0,0,0)", glow: null } },
    { id: "skin_phoenix", name: "Fire Phoenix", price: 450, watches: 3, blurb: "Blazing tail feathers and a flame crest",
      palette: { body0: "#ffe8a3", body1: "#ff6b1a", body2: "#c92a2a", wing: "#ffa94d", wingDark: "#e8590c", belly: "rgba(255,236,153,0.7)", beak: "#ffd43b", cheek: "rgba(255,80,40,0.45)", glow: "rgba(255,120,40,0.28)" } },
    { id: "skin_galaxy", name: "Galaxy Hopper", price: 500, watches: 3, blurb: "Deep-space purple with twinkling stars",
      palette: { body0: "#9775fa", body1: "#5f3dc4", body2: "#2b1a6b", wing: "#7048e8", wingDark: "#3b2293", belly: "rgba(200,180,255,0.35)", beak: "#ffd43b", cheek: "rgba(255,120,220,0.45)", glow: "rgba(150,110,255,0.3)" } },
  ];
  const TRAILS = [
    { id: "spark", name: "Spark trail", price: 75, catalogId: "feat_trail" },
    { id: "rainbow", name: "Rainbow trail", price: 150 },
    { id: "bubbles", name: "Bubble trail", price: 175 },
    { id: "stars", name: "Star trail", price: 200 },
    { id: "fire", name: "Fire trail", price: 250 },
  ];
  const TRAIL_BY_ID = {};
  for (const t of TRAILS) TRAIL_BY_ID[t.id] = t;

  // —— Coins ——
  const COIN_VALUE = 1;
  const BIG_COIN_VALUE = 5;
  const CHECKPOINT_EVERY = 10; // levels

  function checkpointFor(level) {
    return Math.floor((level | 0) / CHECKPOINT_EVERY) * CHECKPOINT_EVERY; // 0 = none yet
  }

  /** End-of-run bonus: 1 coin per level gained this run (score based). */
  function runBonus(levelReached, startLevel) {
    return Math.max(0, (levelReached | 0) - Math.max(1, startLevel | 0));
  }

  // —— RNG ——
  function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Coin pattern for a freshly spawned pipe (positions relative to the pipe's left x).
   * v1.5 round 3 ("still too many coins"): at most ONE coin per gap, centered in the gap,
   * in ~27% of gaps; a risky 5-coin coin in ~1 of 40 gaps instead. Never any coins placed
   * before/after the pipe (no trails/arcs) — every coin rides with its pipe, which spawns
   * off-screen to the right, so coins never pop into view.
   * prev/spacing are accepted for API compatibility but unused.
   */
  const COIN_CHANCE = 0.27;
  const RISKY_CHANCE = 0.025; // ≈ 1 in 40 pipes
  function planCoins(pipe, prev, rng) {
    const out = [];
    const r = rng();
    const cx = pipe.w / 2;
    if (r < COIN_CHANCE) {
      out.push({ dx: cx, y: pipe.gapY, value: COIN_VALUE });
    } else if (r < COIN_CHANCE + RISKY_CHANCE) {
      const edge = rng() < 0.5 ? -1 : 1;
      out.push({ dx: cx, y: pipe.gapY + edge * (pipe.gap / 2 - 16), value: BIG_COIN_VALUE, risky: true });
    }
    return out;
  }

  // —— Save data ——
  function defaultSave() {
    return {
      v: SAVE_VERSION,
      coins: 0,
      lifetimeCoins: 0,
      upgrades: {},        // id -> tier
      skillEarly: {},      // skill id -> true (bought with coins / ads / legacy)
      skillsSeen: {},      // skill id -> true (after "New skill unlocked!" moment)
      speciesSeen: {},     // species id -> true (after "New bird unlocked!" moment)
      species: ["sparrow"],
      speciesEquipped: "sparrow",
      skins: [],           // coin-bought skin ids (catalog skins also accepted)
      trails: [],          // owned trail ids
      trailEquipped: null,
      doubleTapDash: false,
      missions: null,
      stats: { runs: 0, dashes: 0, shieldBlocks: 0, bestCombo: 0, chests: 0 },
      streak: { count: 0, best: 0, lastDay: null, freezes: 0, pending: 0, pendingInfo: null }, // v1.12 daily play streak
    };
  }

  function clampInt(n, lo, hi) {
    n = parseInt(n, 10);
    if (!Number.isFinite(n)) n = lo;
    return Math.max(lo, Math.min(hi, n));
  }

  /** Sanitize any parsed object into a valid save (never throws). */
  function normalizeSave(raw) {
    const d = defaultSave();
    if (!raw || typeof raw !== "object") return d;
    d.coins = clampInt(raw.coins, 0, 1e9);
    // v1.11.1: a retired skill was removed. Refund what players paid for it (300 early unlock + upgrade tiers 40/90/170/300).
    // The retired ids are dropped below, so once the save is written back this never refunds twice.
    let refund = 0;
    if (raw.skillEarly && typeof raw.skillEarly === "object" && raw.skillEarly["slow" + "mo"]) refund += 300;
    if (raw.upgrades && typeof raw.upgrades === "object") {
      const t = clampInt(raw.upgrades["slow" + "Dur"], 0, 4), tiers = [40, 90, 170, 300];
      for (let i = 0; i < t; i++) refund += tiers[i];
    }
    if (refund > 0) { d.coins = clampInt(d.coins + refund, 0, 1e9); d.retiredRefund = refund; }
    d.lifetimeCoins = clampInt(raw.lifetimeCoins, 0, 1e12);
    if (raw.upgrades && typeof raw.upgrades === "object") {
      for (const u of UPGRADES) {
        if (raw.upgrades[u.id] != null) d.upgrades[u.id] = clampInt(raw.upgrades[u.id], 0, u.prices.length);
      }
    }
    for (const key of ["skillEarly", "skillsSeen"]) {
      if (raw[key] && typeof raw[key] === "object") {
        for (const id of Object.keys(raw[key])) if (SKILL_BY_ID[id] && raw[key][id]) d[key][id] = true;
      }
    }
    if (raw.speciesSeen && typeof raw.speciesSeen === "object") {
      for (const id of Object.keys(raw.speciesSeen)) if (SPECIES_BY_ID[id] && raw.speciesSeen[id]) d.speciesSeen[id] = true;
    }
    if (Array.isArray(raw.species)) {
      for (const id of raw.species) if (SPECIES_BY_ID[id] && d.species.indexOf(id) < 0) d.species.push(id);
    }
    if (typeof raw.speciesEquipped === "string" && d.species.indexOf(raw.speciesEquipped) >= 0) d.speciesEquipped = raw.speciesEquipped;
    if (Array.isArray(raw.skins)) d.skins = raw.skins.filter((s) => typeof s === "string").slice(0, 50);
    if (Array.isArray(raw.trails)) d.trails = raw.trails.filter((t) => TRAIL_BY_ID[t]);
    if (typeof raw.trailEquipped === "string" && d.trails.indexOf(raw.trailEquipped) >= 0) d.trailEquipped = raw.trailEquipped;
    d.doubleTapDash = !!raw.doubleTapDash;
    if (raw.missions && typeof raw.missions === "object" && Array.isArray(raw.missions.list)) d.missions = raw.missions;
    if (raw.stats && typeof raw.stats === "object") {
      for (const k of Object.keys(d.stats)) d.stats[k] = clampInt(raw.stats[k], 0, 1e9);
    }
    d.streak = normalizeStreak(raw.streak);
    return d;
  }

  /**
   * Load save. `legacy` = { unlocks: {owned, equippedTrail} } from pre-1.5 keys.
   * Never modifies legacy keys (best score / level / trophies stay untouched).
   */
  function loadSave(storage, legacy) {
    let raw = null;
    try { raw = storage.getItem(SAVE_KEY); } catch (_) {}
    if (raw) {
      try { return { save: normalizeSave(JSON.parse(raw)), migrated: false }; } catch (_) { /* fall through */ }
    }
    const s = defaultSave();
    // Migrate v1.4 ad-unlocked perks into the new skill system (players keep what they earned).
    const owned = (legacy && legacy.unlocks && Array.isArray(legacy.unlocks.owned)) ? legacy.unlocks.owned : [];
    if (owned.indexOf("skill_double") >= 0) s.skillEarly.dash = true;     // Double flap → Dash
    if (owned.indexOf("skill_shield") >= 0) s.skillEarly.shield = true;   // Feather shield → Shield
    if (owned.indexOf("feat_trail") >= 0) {
      s.trails.push("spark");
      if (legacy.unlocks.equippedTrail) s.trailEquipped = "spark";
    }
    return { save: s, migrated: true };
  }

  function serializeSave(s) {
    return JSON.stringify(s);
  }

  // —— Skill / upgrade queries ——
  function upgradeTier(save, id) {
    const u = UPGRADE_BY_ID[id];
    if (!u) return 0;
    return clampInt(save.upgrades[id] || 0, 0, u.prices.length);
  }
  function upgradeValue(save, id) {
    const u = UPGRADE_BY_ID[id];
    return u ? u.values[upgradeTier(save, id)] : 0;
  }
  function nextUpgradePrice(save, id) {
    const u = UPGRADE_BY_ID[id];
    if (!u) return null;
    const t = upgradeTier(save, id);
    return t < u.prices.length ? u.prices[t] : null;
  }
  function buyUpgrade(save, id) {
    const price = nextUpgradePrice(save, id);
    if (price == null || save.coins < price) return false;
    save.coins -= price;
    save.upgrades[id] = upgradeTier(save, id) + 1;
    return true;
  }

  /** Is a core skill usable? peak = best level reached ever. */
  function isSkillUnlocked(save, id, peak) {
    const s = SKILL_BY_ID[id];
    if (!s || s.catalogId) return false; // extra skills are checked against the catalog in game.js
    return (peak | 0) >= s.unlockLevel || !!save.skillEarly[id];
  }

  function buySkillEarly(save, id) {
    const s = SKILL_BY_ID[id];
    if (!s || s.catalogId || save.skillEarly[id] || save.coins < s.coinPrice) return false;
    save.coins -= s.coinPrice;
    save.skillEarly[id] = true;
    return true;
  }

  /** Next locked core skill by level, or null. */
  function nextSkillUnlock(save, peak) {
    for (const s of SKILLS) if (!isSkillUnlocked(save, s.id, peak)) return s;
    return null;
  }

  /** Effective seconds for skill cooldown/duration given save + species. */
  function skillStats(save, id, speciesId) {
    const s = SKILL_BY_ID[id];
    if (!s) return { cd: 0, dur: 0 };
    let cd = s.cd;
    let dur = s.dur;
    if (id === "dash") cd = upgradeValue(save, "dashCd");
    if (id === "shield") dur = upgradeValue(save, "shieldDur");
    if (id === "shrink") dur = upgradeValue(save, "shrinkDur");
    cd *= upgradeValue(save, "recharge");
    if (speciesId === "sparrow") cd *= 0.95;
    if (speciesId === "swallow" && id === "dash") cd *= 0.7;
    if (speciesId === "hummingbird" && id === "shrink") dur *= 1.5;
    if (speciesId === "eagle" && id === "magnet") dur *= 1.5;
    return { cd: Math.round(cd * 10) / 10, dur: Math.round(dur * 100) / 100 };
  }

  function magnetRadius(save) {
    return upgradeValue(save, "magnetRad");
  }

  function coinMultiplier(save, speciesId) {
    let m = 1 + upgradeValue(save, "lucky") / 100;
    if (speciesId === "parrot") m += 0.25;
    return m;
  }

  // —— Species ——
  function isSpeciesOwned(save, id, trophyPeak) {
    const sp = SPECIES_BY_ID[id];
    if (!sp) return false;
    if (save.species.indexOf(id) >= 0) return true;
    return sp.trophyLevel > 0 && (trophyPeak | 0) >= sp.trophyLevel;
  }
  function buySpecies(save, id) {
    const sp = SPECIES_BY_ID[id];
    if (!sp || save.species.indexOf(id) >= 0 || save.coins < sp.price) return false;
    save.coins -= sp.price;
    save.species.push(id);
    return true;
  }

  // —— Coins ——
  function addCoins(save, n) {
    n = Math.max(0, Math.floor(n));
    save.coins += n;
    save.lifetimeCoins += n;
    return n;
  }

  /** Cheapest thing the player can't afford yet that is purchasable now. */
  function cheapestGoal(save, peak) {
    let best = null;
    function consider(price, label) {
      if (price == null || price <= save.coins) return;
      if (!best || price < best.price) best = { price: price, label: label };
    }
    const anySkill = SKILLS.some((s) => isSkillUnlocked(save, s.id, peak));
    for (const u of UPGRADES) {
      if (u.skill && !isSkillUnlocked(save, u.skill, peak)) continue;
      if (u.needsAnySkill && !anySkill) continue;
      consider(nextUpgradePrice(save, u.id), u.name);
    }
    for (const s of SKILLS) if (!isSkillUnlocked(save, s.id, peak)) consider(s.coinPrice, s.name + " (early)");
    for (const sp of SPECIES) if (!isSpeciesOwned(save, sp.id, peak)) consider(sp.price, sp.name);
    return best;
  }

  // —— Daily missions ——
  // Round 3 rebalance: coins are ~4× rarer, so prices were halved and rewards scaled to match.
  // "bigcoin" stays defined (old saved missions still resolve) but is no longer generated
  // because risky coins are now ~1 per 40 pipes.
  const MISSION_TYPES = [
    { id: "pipes", scope: "day", targets: [25, 40, 60], rewards: [8, 14, 20], label: (n) => "Pass " + n + " pipes" },
    { id: "coins", scope: "day", targets: [5, 8, 12], rewards: [8, 14, 20], label: (n) => "Collect " + n + " coins" },
    { id: "level", scope: "run", targets: null, rewards: [10, 15, 20], label: (n) => "Reach level " + n },
    { id: "near", scope: "day", targets: [3, 5, 8], rewards: [8, 12, 16], label: (n) => "Get " + n + " close calls" },
    { id: "runs", scope: "day", targets: [3, 5, 7], rewards: [5, 8, 12], label: (n) => "Play " + n + " runs" },
    { id: "streak", scope: "run", targets: [4, 6, 9], rewards: [8, 14, 18], label: (n) => "Clean streak of " + n },
    { id: "bigcoin", scope: "day", retired: true, targets: [1, 1, 1], rewards: [10, 10, 10], label: (n) => "Grab " + n + " risky big coin" + (n > 1 ? "s" : "") },
    { id: "dash", scope: "day", needs: "dash", targets: [3, 5, 8], rewards: [8, 12, 16], label: (n) => "Use Dash " + n + " times" },
    { id: "shield", scope: "day", needs: "shield", targets: [1, 2, 3], rewards: [10, 15, 20], label: (n) => "Block " + n + " hit" + (n > 1 ? "s" : "") + " with Shield" },
    { id: "skills", scope: "day", needs: "any", targets: [5, 8, 12], rewards: [8, 12, 16], label: (n) => "Use skills " + n + " times" },
    { id: "magnet", scope: "day", needs: "magnet", targets: [3, 5, 8], rewards: [10, 15, 20], label: (n) => "Magnet " + n + " coins" },
  ];
  const MISSION_BY_ID = {};
  for (const m of MISSION_TYPES) MISSION_BY_ID[m.id] = m;
  const ALL_MISSIONS_BONUS = 15;

  function levelTarget(bestLevel, tier) {
    const b = Math.max(1, bestLevel | 0);
    return Math.max(3, Math.min(60, 3 + Math.floor(b * 0.5) + tier * 2));
  }

  /**
   * Deterministic 3 missions for a date. Eligibility (unlocked skills) filters the pool,
   * so a player only gets skill missions for skills they can use.
   */
  function generateMissions(dateKey, ctx) {
    const c = ctx || {};
    const unlocked = c.unlockedSkills || [];
    const rng = mulberry32(hashStr("missions:" + dateKey));
    const pool = MISSION_TYPES.filter(function (m) {
      if (m.retired) return false;
      if (!m.needs) return true;
      if (m.needs === "any") return unlocked.length > 0;
      return unlocked.indexOf(m.needs) >= 0;
    });
    // Seeded Fisher–Yates
    const arr = pool.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    const picked = [];
    let skillCount = 0;
    for (const m of arr) {
      if (picked.length >= 3) break;
      if (m.needs) { if (skillCount >= 1) continue; skillCount++; }
      picked.push(m);
    }
    const list = picked.map(function (m) {
      const tier = Math.floor(rng() * 3);
      const target = m.id === "level" ? levelTarget(c.bestLevel, tier) : m.targets[tier];
      return { id: m.id, target: target, reward: m.rewards[tier], progress: 0, done: false, label: m.label(target), scope: m.scope };
    });
    return { date: dateKey, list: list, bonusGiven: false };
  }

  function streakMultiplier(streak) {
    return 1 + Math.min(0.5, 0.1 * Math.max(0, streak | 0));
  }

  /**
   * Apply progress. For "day" scope: progress += amount. For "run" scope: progress = max(progress, amount).
   * Returns array of newly completed missions.
   */
  function progressMission(missions, id, amount) {
    const done = [];
    if (!missions || !missions.list) return done;
    for (const m of missions.list) {
      if (m.id !== id || m.done) continue;
      if (m.scope === "run") m.progress = Math.max(m.progress, amount | 0);
      else m.progress += amount | 0;
      if (m.progress >= m.target) {
        m.progress = m.target;
        m.done = true;
        done.push(m);
      }
    }
    return done;
  }

  function missionsLeft(missions) {
    if (!missions || !missions.list) return 0;
    return missions.list.filter((m) => !m.done).length;
  }

  // —— "Almost" moments ——
  /** ctx: { score, best, beatBest, coins, goal:{price,label}, missions, level, runCheckpoint, nextSkill:{name,unlockLevel}, peak } */
  function almostMoments(ctx) {
    const out = [];
    const c = ctx || {};
    if (!c.beatBest && c.best > 0) {
      const d = c.best - c.score;
      if (d > 0 && d <= 5) out.push({ p: 10, t: d + (d === 1 ? " point" : " points") + " from a new best!" });
    }
    if (c.goal) {
      const need = c.goal.price - c.coins;
      if (need > 0 && (need <= 30 || need <= c.goal.price * 0.25)) {
        out.push({ p: 9, t: need + (need === 1 ? " coin" : " coins") + " from " + c.goal.label + "!" });
      }
    }
    if (c.missions && c.missions.list) {
      const left = c.missions.list.filter((m) => !m.done);
      if (left.length === 1) out.push({ p: 8, t: "1 mission left today: " + left[0].label });
      for (const m of left) {
        const rem = m.target - m.progress;
        if (m.scope === "day" && rem > 0 && rem <= Math.max(2, Math.ceil(m.target * 0.2))) {
          out.push({ p: 7, t: rem + " to go: " + m.label });
          break;
        }
      }
    }
    if (c.nextSkill && c.peak > 0) {
      const d = c.nextSkill.unlockLevel - c.peak;
      if (d > 0 && d <= 3) out.push({ p: 8.5, t: c.nextSkill.name + " unlocks at level " + c.nextSkill.unlockLevel + " — " + d + " to go!" });
    }
    if (c.level > 0) {
      const nextCp = (Math.floor(c.level / CHECKPOINT_EVERY) + 1) * CHECKPOINT_EVERY;
      const d = nextCp - c.level;
      if (d >= 1 && d <= 2 && nextCp > (c.runCheckpoint | 0)) out.push({ p: 6, t: "Checkpoint L" + nextCp + " was " + d + (d === 1 ? " level" : " levels") + " away!" });
    }
    out.sort((a, b) => b.p - a.p);
    return out.map((o) => o.t);
  }


  // ======================================================================================
  // v1.12 — combo meter, daily play streak, reward chest. Pure logic (no DOM); game.js draws it.
  // COINS ONLY. Nothing here is bought with real money: no paid spins, no paid loot boxes.
  // ======================================================================================

  // —— Combo ——
  const COMBO_CAP = 8;            // multiplier cap (x8)
  const COMBO_EDGE_PX = 40;       // a pipe passed within this clearance of a gap edge = "near-edge" (+1)
  const COMBO_SO_CLOSE_PX = 14;   // within this = "So close!" (+2 and a bonus coin) — same as the old near-miss
  const COMBO_STRIKES = 2;        // 2 comfortable middle-of-the-gap passes in a row (no coin between) break the combo
  const COMBO_MILESTONES = { 3: 1, 5: 2, 8: 5 }; // bonus coins the first time a chain reaches x3 / x5 / x8
  const SO_CLOSE_COINS = 1;
  function comboMultFor(count) { return Math.min(COMBO_CAP, 1 + Math.floor(Math.max(0, count | 0) / 2)); }
  function comboCoinFactor(mult) { return 1 + 0.25 * (Math.max(1, Math.min(COMBO_CAP, mult | 0)) - 1); } // x8 → 2.75x coin pickups
  function comboNew() { return { count: 0, strikes: 0, mult: 1, best: 0 }; }
  /** ev: "edge" (+1) | "close" (+2) | "coin" (+1) | "plain". Returns what changed so the game can celebrate. */
  function comboApply(st, ev) {
    const prevMult = st.mult;
    let reset = false, lost = 0;
    if (ev === "plain") {
      st.strikes++;
      if (st.strikes >= COMBO_STRIKES) { if (st.count > 0) { reset = true; lost = st.count; } st.count = 0; st.strikes = 0; }
    } else {
      st.count += ev === "close" ? 2 : 1;
      st.strikes = 0;
    }
    st.mult = comboMultFor(st.count);
    if (st.count > st.best) st.best = st.count;
    let bonus = 0;
    for (let m = prevMult + 1; m <= st.mult; m++) bonus += COMBO_MILESTONES[m] || 0;
    return { prevMult: prevMult, mult: st.mult, up: st.mult > prevMult, reset: reset, lost: lost, bonus: bonus };
  }
  function comboBreak(st) { const lost = st.count; st.count = 0; st.strikes = 0; st.mult = 1; return lost; }

  // —— Daily play streak ——
  const STREAK_MAX_FREEZES = 1;
  function dayNum(key) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key == null ? "" : key));
    if (!m) return null;
    return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000);
  }
  /** Coins for reaching day N of the streak: 5, 8, 11 … up to 47 (day 15+), plus bonuses on day 7 / 14 / every 30. */
  function streakReward(count) {
    const c = Math.max(1, count | 0);
    let coins = 5 + 3 * (Math.min(c, 15) - 1);
    if (c === 7) coins += 15;
    else if (c === 14) coins += 25;
    else if (c % 30 === 0) coins += 50;
    return coins;
  }
  function freezeEarnedAt(count) { return count > 0 && count % 7 === 0; }
  function normalizeStreak(raw) {
    const s = { count: 0, best: 0, lastDay: null, freezes: 0, pending: 0, pendingInfo: null };
    if (!raw || typeof raw !== "object") return s;
    s.count = clampInt(raw.count, 0, 100000);
    s.best = Math.max(s.count, clampInt(raw.best, 0, 100000));
    s.lastDay = dayNum(raw.lastDay) != null ? String(raw.lastDay) : null;
    s.freezes = clampInt(raw.freezes, 0, STREAK_MAX_FREEZES);
    s.pending = clampInt(raw.pending, 0, 100000);
    if (s.pending > 0 && raw.pendingInfo && typeof raw.pendingInfo === "object") {
      const p = raw.pendingInfo;
      s.pendingInfo = { count: clampInt(p.count, 0, 100000), status: ["new", "next", "freeze", "reset"].indexOf(p.status) >= 0 ? p.status : "next",
        freezeUsed: !!p.freezeUsed, freezeEarned: !!p.freezeEarned };
    }
    if (s.pending > 0 && !s.pendingInfo) s.pendingInfo = { count: s.count, status: "next", freezeUsed: false, freezeEarned: false };
    return s;
  }
  /**
   * Once per calendar day (local date key "YYYY-MM-DD"). Consecutive day → +1; one missed day is covered by a Streak Freeze
   * if held; otherwise the streak restarts at 1. A clock that goes backwards never changes anything.
   * The day's coins wait in streak.pending until the player taps Collect (streakClaim).
   */
  function streakCheckin(save, today) {
    const s = save.streak || (save.streak = normalizeStreak(null));
    const tn = dayNum(today);
    if (tn == null) return { status: "invalid", show: false };
    if (s.lastDay != null) {
      const ln = dayNum(s.lastDay);
      if (ln != null && tn <= ln) {
        return s.pending > 0 ? { status: "pending", show: true, count: s.count, coins: s.pending, info: s.pendingInfo } : { status: "same", show: false, count: s.count };
      }
    }
    if (s.pending > 0) { addCoins(save, s.pending); s.pending = 0; s.pendingInfo = null; } // an unclaimed earlier day is paid, never lost
    const ln2 = s.lastDay != null ? dayNum(s.lastDay) : null;
    const prevCount = s.count;
    let status, freezeUsed = false;
    if (ln2 == null || prevCount <= 0) { s.count = 1; status = "new"; }
    else {
      const missed = tn - ln2 - 1;
      if (missed <= 0) { s.count = prevCount + 1; status = "next"; }
      else if (missed <= s.freezes) { s.freezes -= missed; s.count = prevCount + 1; status = "freeze"; freezeUsed = true; }
      else { s.count = 1; status = "reset"; }
    }
    s.lastDay = String(today);
    if (s.count > s.best) s.best = s.count;
    let freezeEarned = false;
    if (freezeEarnedAt(s.count) && s.freezes < STREAK_MAX_FREEZES) { s.freezes++; freezeEarned = true; }
    const coins = streakReward(s.count);
    s.pending = coins;
    s.pendingInfo = { count: s.count, status: status, freezeUsed: freezeUsed, freezeEarned: freezeEarned };
    return { status: status, show: true, count: s.count, coins: coins, info: s.pendingInfo, prevCount: prevCount };
  }
  /** Pay out the waiting streak coins (idempotent: a second call pays 0). */
  function streakClaim(save) {
    const s = save.streak;
    if (!s || s.pending <= 0) return 0;
    const n = addCoins(save, s.pending);
    s.pending = 0;
    s.pendingInfo = null;
    return n;
  }

  // —— Reward chest (free, end of run, coins only) ——
  // Tier odds are out of 100 and are shown to the player on the reveal card.
  const CHEST_TIERS = [
    { id: "small", name: "Small", weight: 70, mult: 1 },
    { id: "medium", name: "Medium", weight: 25, mult: 3 },
    { id: "jackpot", name: "JACKPOT", weight: 5, mult: 10 },
  ];
  const CHEST_MIN_SCORE = 5;
  function chestWeightTotal() { let t = 0; for (const c of CHEST_TIERS) t += c.weight; return t; }
  function chestBase(score, bestCombo) {
    return Math.max(1, Math.min(12, 1 + Math.floor(Math.max(0, score | 0) / 15) + Math.floor(Math.max(0, bestCombo | 0) / 4)));
  }
  function chestRoll(rng) {
    const total = chestWeightTotal();
    let r = rng() * total;
    for (const c of CHEST_TIERS) { if (r < c.weight) return c; r -= c.weight; }
    return CHEST_TIERS[CHEST_TIERS.length - 1];
  }
  function chestPrize(tier, base) { return Math.max(1, base | 0) * tier.mult; }
  function chestEligible(score) { return (score | 0) >= CHEST_MIN_SCORE; }

  const api = {
    SAVE_KEY, SAVE_VERSION, FPS,
    SKILLS, EXTRA_SKILLS, SKILL_BY_ID, UPGRADES, UPGRADE_BY_ID, SPECIES, SPECIES_BY_ID,
    SKIN_COIN_PRICES, NEW_SKINS, WORLD_SKINS, TRAILS, TRAIL_BY_ID, MISSION_TYPES, MISSION_BY_ID,
    COIN_VALUE, BIG_COIN_VALUE, CHECKPOINT_EVERY, ALL_MISSIONS_BONUS,
    checkpointFor, runBonus, hashStr, mulberry32, planCoins,
    defaultSave, normalizeSave, loadSave, serializeSave,
    upgradeTier, upgradeValue, nextUpgradePrice, buyUpgrade,
    isSkillUnlocked, buySkillEarly, nextSkillUnlock, skillStats, magnetRadius, coinMultiplier,
    isSpeciesOwned, buySpecies, addCoins, cheapestGoal,
    generateMissions, streakMultiplier, progressMission, missionsLeft, levelTarget,
    almostMoments,
    COMBO_CAP, COMBO_EDGE_PX, COMBO_SO_CLOSE_PX, COMBO_STRIKES, COMBO_MILESTONES, SO_CLOSE_COINS,
    comboMultFor, comboCoinFactor, comboNew, comboApply, comboBreak,
    STREAK_MAX_FREEZES, dayNum, streakReward, freezeEarnedAt, normalizeStreak, streakCheckin, streakClaim,
    CHEST_TIERS, CHEST_MIN_SCORE, chestWeightTotal, chestBase, chestRoll, chestPrize, chestEligible,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.SkyHopEconomy = api;
})(typeof window !== "undefined" ? window : globalThis);
