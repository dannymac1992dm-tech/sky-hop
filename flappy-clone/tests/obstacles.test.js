/**
 * Node checks for Sky Hop 1.21 obstacle layout, collisions, and 1.20 save compatibility.
 * Levels are procedural. This does not claim 10,000 hand-authored stages.
 */
"use strict";

const assert = require("assert");
const path = require("path");

require(path.join(__dirname, "..", "obstacles.js"));
const O = globalThis.SkyHopObstacles;
const E = require(path.join(__dirname, "..", "economy.js"));

const PLAY_H = 528;
let fails = 0;
function check(name, cond, extra) {
  if (!cond) {
    fails++;
    console.error("FAIL", name, extra || "");
  }
}

function gapFor(level) {
  const t = 1 - Math.exp(-0.006 * Math.max(0, level - 1));
  let gap = 148 + (102 - 148) * t;
  const earlyScore = Math.min(20, Math.max(0, (level - 1) * 5));
  const early = 1 - earlyScore / 20;
  if (early > 0.02) gap += 28 * early;
  const easeT = Math.max(0, Math.min(1, (level - 20) / 20));
  gap += 8 * easeT;
  return gap;
}

function centers(level, gap) {
  const margin = 40 + (58 - 40) * (1 - Math.exp(-0.006 * (level - 1)));
  const minY = margin + gap / 2;
  const maxY = PLAY_H - margin - gap / 2 - 20;
  const mid = (minY + maxY) / 2;
  return [minY + 1, mid, Math.max(minY + 1, maxY - 1)];
}

const sampleLevels = [1, 2, 8, 10, 19, 20, 21, 40, 50, 70, 100, 130, 150, 170, 200, 500, 1000, 2500, 5000, 7500, 10000];
const families = {};
const patterns = {};
const worldPrimary = {};
let gates = 0;
let empty = 0;
let corridorFail = 0;
let columnFail = 0;
let huge = 0;
const t0 = Date.now();

for (const level of sampleLevels) {
  const gap = gapFor(level);
  const gapMin = Math.max(100, gap - (level >= 65 ? 18 : 0));
  const wi = Math.floor((level - 1) / 20);
  const ys = centers(level, gap);
  for (let serial = 0; serial < 12; serial++) {
    for (const gapY of ys) {
      for (const pAmp of level >= 50 ? [0, 18] : [0]) {
        const gate = O.layoutGate({
          level: level,
          serial: serial,
          worldIndex: wi,
          boss: level >= 10 && level % 10 === 0,
          playH: PLAY_H,
          gap: gap,
          gapMin: gapMin,
          gapY0: gapY,
          pAmp: pAmp,
          rng: O.mulberry((level * 100003 + serial * 9973 + wi * 17 + Math.round(gapY)) >>> 0),
        });
        gates++;
        if (!gate.bits.length) empty++;
        if (!O.corridorClear(gate, gapY, pAmp, 90)) corridorFail++;
        if (O.columnLike(gate, PLAY_H)) columnFail++;
        if (O.maxDiameter(gate) > O.MAX_R * 2 + 0.01) huge++;
        patterns[gate.pattern] = (patterns[gate.pattern] || 0) + 1;
        for (const b of gate.bits) {
          families[b.kind] = (families[b.kind] || 0) + 1;
          if (b.r > O.MAX_R + 0.01 || b.r < O.MIN_R - 0.01) huge++;
        }
        const pool = O.poolFor(wi, level);
        worldPrimary[pool.world.id] = worldPrimary[pool.world.id] || { primary: pool.primary, hit: 0, n: 0 };
        worldPrimary[pool.world.id].n++;
        if (gate.families.indexOf(pool.primary) >= 0) worldPrimary[pool.world.id].hit++;
      }
    }
  }
}

const sweep0 = Date.now();
let sweepN = 0;
for (let level = 1; level <= 10000; level += 1) {
  const wi = Math.floor((level - 1) / 20);
  const gap = 120;
  for (let serial = 0; serial < 2; serial++) {
    const gate = O.layoutGate({
      level: level, serial: serial, worldIndex: wi, playH: PLAY_H,
      gap: gap, gapMin: gap, gapY0: 260, pAmp: 0,
      rng: O.mulberry((level * 97 + serial * 13) >>> 0),
    });
    sweepN++;
    if (!gate.bits.length) empty++;
    if (O.columnLike(gate, PLAY_H)) columnFail++;
    if (!O.corridorClear(gate, 260, 0, 30)) corridorFail++;
    patterns[gate.pattern] = (patterns[gate.pattern] || 0) + 1;
    for (const b of gate.bits) families[b.kind] = (families[b.kind] || 0) + 1;
  }
}
const sweepMs = Date.now() - sweep0;

check("no empty gates", empty === 0, "empty=" + empty);
check("corridor stays open", corridorFail === 0, "fail=" + corridorFail);
check("no tall columns", columnFail === 0, "fail=" + columnFail);
check("radii stay compact", huge === 0, "huge=" + huge);
check("many families", Object.keys(families).length >= 16, JSON.stringify(families));
check("many patterns", Object.keys(patterns).length >= 8, JSON.stringify(patterns));
for (const id of Object.keys(worldPrimary)) {
  const w = worldPrimary[id];
  check("world " + id + " uses its own shapes", w.hit / w.n >= 0.25, w.hit + "/" + w.n + " primary " + w.primary);
}

const early = O.layoutGate({ level: 1, serial: 0, worldIndex: 0, playH: PLAY_H, gap: 176, gapMin: 176, gapY0: 260, pAmp: 0, rng: O.mulberry(1) });
check("level 1 is a simple gate", early.pattern === "solo" && early.bits.length === 1, early.pattern + " bits " + early.bits.length);
check("level 1 is not yellow-column sized", early.bits[0].r <= 34);

const hitGate = O.layoutGate({ level: 100, serial: 3, worldIndex: 4, playH: PLAY_H, gap: 120, gapMin: 120, gapY0: 260, pAmp: 0, rng: O.mulberry(99) });
const bit = hitGate.bits[0];
const q = O.bitXY(400, 260, bit, 0);
check("bit center collides", O.hitIndex(q.x, q.y, 2, 400, 260, hitGate.bits, 0) === 0);
check("corridor center is open", O.hitIndex(400, 260, 14, 400, 260, hitGate.bits, 0) < 0);

const mem = { store: {} };
const storage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem.store, k) ? mem.store[k] : null; },
  setItem: function (k, v) { mem.store[k] = String(v); },
};
const raw = {
  v: 15,
  coins: 4321,
  lifetimeCoins: 9000,
  upgrades: { dashCd: 2 },
  skillEarly: { dash: true, shield: true },
  tree: { glide: 3, pellet: 2 },
  evo: 12,
  evoSeen: 11,
  skins: ["skin_phoenix"],
  species: ["sparrow"],
  speciesEquipped: "sparrow",
  doubleTapDash: true,
  magnetRefund: 1,
  trailRefund: 1,
  birdRefund: 1,
  stats: { runs: 40, dashes: 10, shieldBlocks: 3, bestCombo: 6, chests: 2 },
  streak: { count: 4, best: 4, lastDay: "2026-11-01", freezes: 0, pending: 0, pendingInfo: null },
};
storage.setItem(E.SAVE_KEY, JSON.stringify(raw));
const loaded = E.loadSave(storage, { unlocks: { owned: [] } });
check("save coins kept", loaded.save.coins === 4321, loaded.save.coins);
check("save evo kept", loaded.save.evo === 12);
check("save tree kept", loaded.save.tree.glide === 3 && loaded.save.tree.pellet === 2);
check("save upgrade kept", loaded.save.upgrades.dashCd === 2);
check("save skill kept", loaded.save.skillEarly.dash === true && loaded.save.skillEarly.shield === true);
check("save skin kept", loaded.save.skins.indexOf("skin_phoenix") >= 0);
check("phoenix species stays equipped", loaded.save.speciesEquipped === "sparrow");
check("legacy best key untouched", storage.getItem("skyhop_best") === null);

const famCount = Object.keys(families).length;
console.log(JSON.stringify({
  gatesSampled: gates,
  fullSweepGates: sweepN,
  sweepMs: sweepMs,
  families: famCount,
  familyIds: Object.keys(families).sort(),
  patterns: patterns,
  worlds: worldPrimary,
  fails: fails,
}, null, 2));

const first = O.beatFor(0);
const sixth = O.beatFor(5);
const within200 = {};
for (let i = 0; i < 200; i++) within200[O.beatFor(i).pattern] = 1;
check("first obstacles are a recovery", first.role === "recovery" && first.pattern === "solo", JSON.stringify(first));
check("first challenge is before obstacle 100", sixth.role === "challenge" && sixth.index === 5, JSON.stringify(sixth));
check("several behaviors before obstacle 200", Object.keys(within200).length >= 4, JSON.stringify(within200));
const leg0 = O.flightLeg(0);
const leg5 = O.flightLeg(5);
const leg8 = O.flightLeg(8);
const leg12 = O.flightLeg(12);
const leg17 = O.flightLeg(17);
const leg20 = O.flightLeg(20);
check("cycle opens side-scrolling", leg0.dir === "east" && leg0.ang === 0, JSON.stringify(leg0));
check("first challenge stays side-scrolling", leg5.dir === "east" && sixth.role === "challenge");
check("a bank north follows the first challenge", leg8.dir === "turn" && leg8.turn === "north" && leg8.cue === "Banking north");
check("the second challenge climbs", leg12.dir === "north" && O.beatFor(12).role === "challenge");
check("bonus gates level back east", leg17.dir === "turn" && leg17.turn === "east");
check("the next cycle returns to east", leg20.dir === "east" && leg20.step === 0);
let dirs = {};
for (let i = 0; i < 20; i++) dirs[O.flightLeg(i).dir] = 1;
check("each cycle mixes east, a turn, and north", dirs.east && dirs.turn && dirs.north);
for (let i = 0; i < 120; i++) {
  const b = O.beatFor(i);
  const gate = O.layoutGate({ level: 12, serial: i, gateIndex: i, worldIndex: 0, playH: PLAY_H, gap: 140, gapMin: 140, gapY0: 260, pAmp: 0, rng: O.mulberry(i + 9) });
  if (O.columnLike(gate, PLAY_H) || !O.corridorClear(gate, 260, 0, 20)) check("beat gate stays fair", false, i + " " + b.pattern);
}
const mem2 = { store: {} };
const storage2 = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem2.store, k) ? mem2.store[k] : null; },
  setItem: function (k, v) { mem2.store[k] = String(v); },
};
storage2.setItem(E.SAVE_KEY, JSON.stringify({ v: 1, coins: 50, evo: 20, tree: { glide: 2 }, mastery: { calm: 1 } }));
const kept = E.loadSave(storage2, { unlocks: { owned: [] } }).save;
check("old mastery flag migrates", kept.mastery.calm === 1);
check("old evo and tree stay", kept.evo === 20 && kept.tree.glide === 2 && kept.coins === 50);
const late = E.masterySync(kept, 8000);
check("late mastery grants the later choices", late.length >= 4 && kept.mastery.anchor === 1, JSON.stringify(late));
check("early peak does not grant late mastery", E.masterySync({ mastery: {} }, 100).length === 0);

if (fails) {
  console.error(fails + " checks failed");
  process.exit(1);
}
console.log("obstacles.test.js OK");
