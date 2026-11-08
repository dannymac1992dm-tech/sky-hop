/**
 * Sky Hop 1.21 procedural gates.
 * Compact, disconnected obstacles. No ceiling-to-floor columns.
 * Layout is deterministic from level + serial. Levels are not hand-authored.
 */
(function (root) {
  "use strict";

  var PLAY_H_DEFAULT = 528;
  var MIN_R = 14;
  var MAX_R = 34;
  var CUSHION = 6;

  var WORLD_BANDS = [
    { id: "day", name: "Day Sky", bands: [
      ["rock", "lantern"],
      ["rock", "lantern", "kite"],
      ["rock", "kite", "lantern", "crystal"],
      ["rock", "kite", "crystal", "debris", "gear"]
    ]},
    { id: "desert", name: "Sunset Desert", bands: [
      ["slab", "cactusball"],
      ["slab", "cactusball", "debris"],
      ["slab", "cactusball", "debris", "anvil"],
      ["slab", "debris", "anvil", "gear", "tri"]
    ]},
    { id: "snow", name: "Snowy Peaks", bands: [
      ["ice", "snowball"],
      ["ice", "snowball", "crystal"],
      ["ice", "crystal", "snowball", "debris"],
      ["crystal", "ice", "debris", "snowball"]
    ]},
    { id: "city", name: "Night City", bands: [
      ["sign", "gear"],
      ["gear", "sign", "tri"],
      ["gear", "tri", "anvil", "sign"],
      ["gear", "tri", "debris", "anvil", "sign"]
    ]},
    { id: "space", name: "Outer Space", bands: [
      ["asteroid", "crystal"],
      ["asteroid", "crystal", "debris"],
      ["debris", "asteroid", "crystal", "gear"],
      ["debris", "crystal", "asteroid", "gear", "tri"]
    ]},
    { id: "blossom", name: "Blossom Valley", bands: [
      ["petal", "log"],
      ["petal", "log", "lantern"],
      ["petal", "kite", "lantern", "log"],
      ["petal", "kite", "debris", "crystal"]
    ]},
    { id: "reef", name: "Coral Reef", bands: [
      ["coral", "shell"],
      ["coral", "shell", "buoy"],
      ["coral", "buoy", "shell", "crystal"],
      ["coral", "debris", "crystal", "buoy", "shell"]
    ]},
    { id: "volcano", name: "Lava Land", bands: [
      ["lavabomb", "rock"],
      ["lavabomb", "debris", "rock"],
      ["lavabomb", "debris", "gear", "rock"],
      ["debris", "lavabomb", "gear", "tri", "rock"]
    ]},
    { id: "candy", name: "Pastel Skies", bands: [
      ["gumdrop", "lantern"],
      ["gumdrop", "lantern", "crystal"],
      ["gumdrop", "crystal", "kite", "lantern"],
      ["gumdrop", "crystal", "gear", "kite", "debris"]
    ]}
  ];

  var KIND_META = {
    rock: { crack: "#2c261f", chip: ["#8d8478", "#d5c7b0", "#5e584e"], hi: "#f3ecdf" },
    crystal: { crack: "#2a1860", chip: ["#7a5cff", "#d7c6ff", "#3ec0ff"], hi: "#f4f0ff" },
    gear: { crack: "#3a2a10", chip: ["#e0a93c", "#8a5a18", "#fff1c4"], hi: "#fff6d8" },
    tri: { crack: "#3a1408", chip: ["#ff7a1a", "#6a3010", "#ffd27a"], hi: "#ffe7b8" },
    debris: { crack: "#1c1816", chip: ["#6e655c", "#3a342e", "#b7aa9c"], hi: "#e6ddd2" },
    slab: { crack: "#5a3414", chip: ["#e0a05a", "#a86830", "#f3d2a4"], hi: "#fff0d8" },
    cactusball: { crack: "#14381c", chip: ["#3f9a45", "#1e5c28", "#b7e38a"], hi: "#e7ffc8" },
    ice: { crack: "#1a3c68", chip: ["#d7f1ff", "#7eb6e6", "#f7fbff"], hi: "#ffffff" },
    snowball: { crack: "#4a6078", chip: ["#ffffff", "#d5e4f2", "#9bb4cc"], hi: "#ffffff" },
    sign: { crack: "#14082a", chip: ["#6a5cff", "#ff4fd8", "#1a1438"], hi: "#d8fff8" },
    asteroid: { crack: "#1a1030", chip: ["#8b7fb8", "#3d3560", "#d9d0ee"], hi: "#f0eaff" },
    petal: { crack: "#6a2048", chip: ["#ff9ec8", "#c45a88", "#ffe0ee"], hi: "#fff5f8" },
    log: { crack: "#3a2414", chip: ["#8a5a32", "#c48a58", "#4e321c"], hi: "#f0d2b0" },
    coral: { crack: "#5a1830", chip: ["#ff8aa4", "#c43a62", "#ffd0dc"], hi: "#fff0f4" },
    shell: { crack: "#5a4030", chip: ["#f2d2b0", "#c48a6a", "#fff6ea"], hi: "#fffaf4" },
    lavabomb: { crack: "#2a0c08", chip: ["#3a2a30", "#ff6a1a", "#ffd25a"], hi: "#ffe0b0" },
    gumdrop: { crack: "#6a2060", chip: ["#ff7ab8", "#b48cff", "#fff0c8"], hi: "#ffffff" },
    lantern: { crack: "#6a3010", chip: ["#ffb03a", "#e23a3a", "#fff1c4"], hi: "#fff8e0" },
    buoy: { crack: "#0c3050", chip: ["#ff5a4a", "#f4f7fb", "#1a6a9a"], hi: "#ffffff" },
    anvil: { crack: "#1a1c24", chip: ["#8a93a6", "#3a404e", "#d5dbe8"], hi: "#f4f7fb" },
    kite: { crack: "#6a1848", chip: ["#ff5a8a", "#7ad0ff", "#ffe08a"], hi: "#ffffff" },
    critter: { crack: "#201028", chip: ["#9a5cff", "#3fcf6a", "#ff8a2a"], hi: "#ffe8ff" }
  };

  var PATTERNS = ["solo", "stagger", "gateway", "triangle", "bob", "drift", "orbit", "wave", "ring", "gauntlet"];

  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
      return a / 4294967296;
    };
  }

  function bandIndex(level) {
    if (level < 40) return 0;
    if (level < 200) return 1;
    if (level < 1000) return 2;
    return 3;
  }

  function worldSlot(worldIndex) {
    var n = WORLD_BANDS.length;
    var i = ((worldIndex % n) + n) % n;
    return { def: WORLD_BANDS[i], lap: Math.floor(Math.max(0, worldIndex) / n), mod: i };
  }

  function pickWeighted(rng, items, weights) {
    var t = 0, i;
    for (i = 0; i < weights.length; i++) t += weights[i];
    var r = rng() * t;
    for (i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  function pickPattern(level, boss, milestone, rng) {
    if (milestone) return "ring";
    if (boss) return rng() < 0.55 ? "gauntlet" : "ring";
    if (level <= 8) return "solo";
    var worldOpen = level > 1 && ((level - 1) % 20) === 0;
    if (worldOpen) return rng() < 0.65 ? "solo" : "stagger";
    if (level < 30) return rng() < 0.7 ? "solo" : "stagger";
    if (level < 80) return pickWeighted(rng, ["solo", "stagger", "gateway", "bob"], [0.22, 0.38, 0.24, 0.16]);
    if (level < 250) return pickWeighted(rng, ["stagger", "gateway", "triangle", "bob", "drift"], [0.22, 0.22, 0.22, 0.18, 0.16]);
    if (level < 1000) return pickWeighted(rng, ["triangle", "wave", "drift", "orbit", "bob", "gateway"], [0.18, 0.18, 0.18, 0.16, 0.14, 0.16]);
    if (level < 5000) return pickWeighted(rng, ["wave", "drift", "orbit", "triangle", "gauntlet", "gateway"], [0.2, 0.2, 0.18, 0.16, 0.12, 0.14]);
    return pickWeighted(rng, ["wave", "drift", "orbit", "gauntlet", "ring", "triangle"], [0.2, 0.2, 0.18, 0.16, 0.12, 0.14]);
  }

  function poolFor(worldIndex, level) {
    var w = worldSlot(worldIndex);
    var list = w.def.bands[bandIndex(level)].slice();
    var next = WORLD_BANDS[(w.mod + 1) % WORLD_BANDS.length];
    var phase = (level - 1) % 20;
    if (phase >= 17) list.push(next.bands[0][0]);
    if (w.lap >= 1 && level >= 180) list.push(next.bands[Math.min(1, next.bands.length - 1)][0]);
    if (level >= 40) list.push("critter");
    return { list: list, primary: w.def.bands[0][0], world: w.def, lap: w.lap, mod: w.mod };
  }

  function pickKind(pool, pattern, level, rng, primaryBias) {
    if (pattern === "drift" && rng() < 0.5) return "debris";
    if (pattern === "orbit" && rng() < 0.4) return rng() < 0.5 ? "gear" : "tri";
    if (primaryBias && rng() < 0.72) return pool.primary;
    if (level < 40 && rng() < 0.6) return pool.primary;
    return pool.list[(rng() * pool.list.length) | 0];
  }

  function radiusFor(pattern, level, rng) {
    var lo = 22, hi = 32;
    if (level < 15) { lo = 26; hi = 34; }
    else if (level < 100) { lo = 22; hi = 30; }
    else if (pattern === "ring" || pattern === "wave" || pattern === "gauntlet") { lo = 16; hi = 24; }
    else { lo = 18; hi = 28; }
    var r = lo + rng() * (hi - lo);
    if (r < MIN_R) r = MIN_R;
    if (r > MAX_R) r = MAX_R;
    return r;
  }

  function slotsFor(pattern, rng) {
    if (pattern === "solo") return [{ side: rng() < 0.5 ? -1 : 1, ox: (rng() - 0.5) * 16 }];
    if (pattern === "stagger") return [
      { side: -1, ox: -18 - rng() * 10 },
      { side: 1, ox: 16 + rng() * 14 }
    ];
    if (pattern === "gateway") return [
      { side: -1, ox: -6 + rng() * 8 },
      { side: 1, ox: 4 + rng() * 8 }
    ];
    if (pattern === "triangle") return [
      { side: -1, ox: -8 },
      { side: 1, ox: -26 },
      { side: 1, ox: 30 }
    ];
    if (pattern === "bob") return [
      { side: rng() < 0.5 ? -1 : 1, ox: -8, motion: "bob" },
      { side: rng() < 0.5 ? 1 : -1, ox: 24, motion: "bob" }
    ];
    if (pattern === "drift") return [
      { side: -1, ox: -10, motion: "drift" },
      { side: 1, ox: 22, motion: "drift" }
    ];
    if (pattern === "orbit") return [
      { side: rng() < 0.5 ? -1 : 1, ox: 0, motion: "orbit" },
      { side: rng() < 0.5 ? 1 : -1, ox: 34, motion: "orbit" }
    ];
    if (pattern === "wave") return [
      { side: -1, ox: -8, motion: "bob" },
      { side: 1, ox: 28, motion: "drift" },
      { side: -1, ox: 62, motion: "bob" }
    ];
    if (pattern === "ring") return [
      { side: -1, ox: -20 },
      { side: -1, ox: 26 },
      { side: 1, ox: -16 },
      { side: 1, ox: 30 }
    ];
    return [
      { side: -1, ox: -12, motion: "orbit" },
      { side: 1, ox: 8, motion: "bob" },
      { side: 1, ox: 48, motion: "drift" }
    ];
  }

  function roomAbove(gapY0, pAmp, half) {
    return (gapY0 - pAmp - half) - 18;
  }
  function roomBelow(gapY0, pAmp, half, playH) {
    return (playH - 18) - (gapY0 + pAmp + half);
  }

  function pushBit(bits, spec) {
    var side = spec.side;
    var r = spec.r;
    var amp = spec.amp || 0;
    var room = side < 0 ? roomAbove(spec.gapY0, spec.pAmp, spec.half) : roomBelow(spec.gapY0, spec.pAmp, spec.half, spec.playH);
    var need = 2 * r + amp * 2 + CUSHION;
    if (room + 0.5 < need) {
      var fit = (room - CUSHION) / 2;
      if (fit < MIN_R) return false;
      r = Math.min(r, fit);
      amp = 0;
      if (2 * r + CUSHION > room + 0.5) return false;
    }
    var rel = side < 0 ? -(spec.half + r + amp + CUSHION) : (spec.half + r + amp + CUSHION);
    bits.push({
      ox: spec.ox || 0,
      rel: rel,
      r: r,
      kind: spec.kind,
      amp: amp,
      rate: spec.rate || 0,
      ph: spec.ph || 0,
      drift: spec.drift || 0,
      drate: spec.drate || 0,
      dph: spec.dph || 0,
      spin: spec.spin || 0,
      seed: spec.seed || 1,
      variant: spec.variant || 0,
      hp: 0,
      gone: false
    });
    return true;
  }

  function layoutGate(opts) {
    var level = Math.max(1, opts.level | 0);
    var rng = opts.rng || mulberry((level * 100003 + (opts.serial | 0) * 9973 + 17) >>> 0);
    var playH = opts.playH || PLAY_H_DEFAULT;
    var gap = opts.gap > 0 ? opts.gap : 140;
    var gapMin = opts.gapMin > 0 ? opts.gapMin : gap;
    if (gapMin < 100) gapMin = 100;
    var half = gapMin / 2;
    var gapY0 = opts.gapY0 != null ? opts.gapY0 : (opts.gapY != null ? opts.gapY : playH / 2);
    var pAmp = opts.pAmp || 0;
    var boss = !!opts.boss || (level >= 10 && level % 10 === 0);
    var milestone = level % 1000 === 0;
    var pattern = opts.pattern || pickPattern(level, boss, milestone, rng);
    var pool = poolFor(opts.worldIndex | 0, level);
    var rawSlots = slotsFor(pattern, rng);
    var bits = [];
    var i;
    for (i = 0; i < rawSlots.length; i++) {
      var s = rawSlots[i];
      var motion = s.motion || (pattern === "bob" ? "bob" : "");
      var kind = pickKind(pool, motion === "drift" || pattern === "drift" ? "drift" : (motion === "orbit" || pattern === "orbit" ? "orbit" : pattern), level, rng, i === 0);
      if (kind === "critter" && level < 40) kind = pool.primary;
      var critters = 0;
      for (var c = 0; c < bits.length; c++) if (bits[c].kind === "critter") critters++;
      if (kind === "critter" && critters >= 1) kind = pool.primary;
      var r = radiusFor(pattern, level, rng);
      var amp = 0, drift = 0, spin = 0, rate = 0, drate = 0;
      if (motion === "bob" || kind === "debris" && pattern !== "solo") {
        amp = 8 + rng() * 8;
        rate = 0.018 + rng() * 0.012;
      }
      if (motion === "drift" || kind === "debris") {
        drift = 8 + rng() * 10;
        drate = 0.012 + rng() * 0.01;
        if (amp < 6) { amp = 6 + rng() * 6; rate = 0.02; }
      }
      if (motion === "orbit" || kind === "gear" || kind === "tri") {
        spin = (rng() < 0.5 ? -1 : 1) * (0.03 + rng() * (pattern === "orbit" || pattern === "gauntlet" ? 0.05 : 0.03));
      }
      if (level < 20 && pattern === "solo") { amp = 0; drift = 0; }
      if (boss && motion) amp = Math.min(amp, 12);
      var ok = pushBit(bits, {
        side: s.side, ox: s.ox, r: r, amp: amp, rate: rate, ph: rng() * Math.PI * 2,
        drift: drift, drate: drate, dph: rng() * Math.PI * 2, spin: spin,
        kind: kind, seed: (rng() * 1e9) | 0, variant: (rng() * 8) | 0,
        gapY0: gapY0, pAmp: pAmp, half: half, playH: playH
      });
      if (!ok && s.side) {
        pushBit(bits, {
          side: -s.side, ox: s.ox, r: Math.max(MIN_R, r * 0.85), amp: 0, rate: 0, ph: 0,
          drift: 0, drate: 0, dph: 0, spin: spin, kind: kind, seed: (rng() * 1e9) | 0, variant: (rng() * 8) | 0,
          gapY0: gapY0, pAmp: pAmp, half: half, playH: playH
        });
      }
    }
    if (!bits.length) {
      var ra = roomAbove(gapY0, pAmp, half);
      var rb = roomBelow(gapY0, pAmp, half, playH);
      var side = ra >= rb ? -1 : 1;
      var room = Math.max(ra, rb);
      var fr = Math.max(MIN_R, Math.min(22, (room - CUSHION) / 2));
      if (!(fr >= MIN_R && room >= 2 * MIN_R + CUSHION)) fr = MIN_R;
      pushBit(bits, {
        side: side, ox: 0, r: fr, amp: 0, kind: pool.primary, seed: 1, variant: 0,
        gapY0: gapY0, pAmp: pAmp, half: half, playH: playH, spin: 0
      });
    }
    if ((level - 1) % 20 >= 17 && bits.length) {
      var accent = WORLD_BANDS[(pool.mod + 1) % WORLD_BANDS.length].bands[0][0];
      bits[bits.length - 1].kind = accent;
    }
    var right = 24, left = 0, kinds = {}, k;
    for (i = 0; i < bits.length; i++) {
      var b = bits[i];
      var reach = (b.drift || 0);
      if (b.ox + b.r + reach > right) right = b.ox + b.r + reach;
      if (b.ox - b.r - reach < left) left = b.ox - b.r - reach;
      kinds[b.kind] = 1;
    }
    var fams = [];
    for (k in kinds) fams.push(k);
    return {
      bits: bits,
      w: Math.ceil(right + 6),
      left: left,
      pattern: pattern,
      family: fams[0] || pool.primary,
      families: fams,
      worldId: pool.world.id,
      worldName: pool.world.name,
      lap: pool.lap,
      gapMin: gapMin,
      half: half
    };
  }

  function bitXY(gateX, gapY, bit, frame) {
    var wob = bit.amp ? Math.sin((bit.ph || 0) + frame * (bit.rate || 0.02)) * bit.amp : 0;
    var dx = bit.drift ? Math.sin((bit.dph || 0) + frame * (bit.drate || 0.015)) * bit.drift : 0;
    return { x: gateX + (bit.ox || 0) + dx, y: gapY + bit.rel + wob };
  }

  function hitIndex(x, y, rad, gateX, gapY, bits, frame) {
    if (!bits) return -1;
    for (var i = 0; i < bits.length; i++) {
      var b = bits[i];
      if (!b || b.gone) continue;
      var q = bitXY(gateX, gapY, b, frame);
      var dx = x - q.x, dy = y - q.y;
      var rr = rad + b.r;
      if (dx * dx + dy * dy < rr * rr) return i;
    }
    return -1;
  }

  /** True when every live bit stays outside the open corridor for the sampled frames. */
  function corridorClear(gate, gapY0, pAmp, frames) {
    var half = gate.half || gate.gapMin / 2;
    var step = 4;
    var f, i, g, b, q, top, bot, cTop, cBot;
    for (f = 0; f <= frames; f += step) {
      var gy = gapY0 + (pAmp ? Math.sin(f * 0.02) * pAmp : 0);
      cTop = gy - half;
      cBot = gy + half;
      for (i = 0; i < gate.bits.length; i++) {
        b = gate.bits[i];
        if (b.gone) continue;
        q = bitXY(0, gy, b, f);
        top = q.y - b.r;
        bot = q.y + b.r;
        if (top < cBot - 0.5 && bot > cTop + 0.5) return false;
      }
    }
    return true;
  }

  function maxDiameter(gate) {
    var m = 0, i;
    for (i = 0; i < gate.bits.length; i++) {
      var d = gate.bits[i].r * 2;
      if (d > m) m = d;
    }
    return m;
  }

  function columnLike(gate, playH) {
    var limit = Math.min(96, playH * 0.22);
    var i;
    for (i = 0; i < gate.bits.length; i++) {
      if (gate.bits[i].r * 2 > limit) return true;
    }
    return false;
  }

  root.SkyHopObstacles = {
    WORLD_BANDS: WORLD_BANDS,
    KIND_META: KIND_META,
    PATTERNS: PATTERNS,
    MIN_R: MIN_R,
    MAX_R: MAX_R,
    mulberry: mulberry,
    layoutGate: layoutGate,
    bitXY: bitXY,
    hitIndex: hitIndex,
    corridorClear: corridorClear,
    maxDiameter: maxDiameter,
    columnLike: columnLike,
    poolFor: poolFor,
    pickPattern: pickPattern
  };
})(typeof window !== "undefined" ? window : globalThis);
