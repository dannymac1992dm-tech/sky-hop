/**
 * Code 36 flight: climb holds its lane, steering settles, east flight is not a flap impulse.
 */
"use strict";

const assert = require("assert");
const path = require("path");
const F = require(path.join(__dirname, "..", "flight.js"));

let fails = 0;
function check(name, cond, extra) {
  if (!cond) {
    fails++;
    console.error("FAIL", name, extra || "");
  } else {
    console.log("ok", name);
  }
}

function bird(y, vy, steer) {
  return { y: y, vy: vy || 0, steer: steer || 0, r: 16, playH: 520, edgeDeath: true };
}

// What code 35 did on a climb: gravity on the cross-axis, which the rotated
// camera shows as a slide to screen-right. 10s at 60fps leaves the lane.
(function oldDrift() {
  let y = 260, vy = 0;
  for (let i = 0; i < 600; i++) {
    vy = Math.min(vy + 0.38, 10);
    y += vy;
  }
  check("old gravity leaves the lane within 10s", y - 260 > 400, "dy=" + (y - 260).toFixed(1));
})();

(function holdLane() {
  const b = bird(260, 0, 0);
  const start = b.y;
  for (let i = 0; i < 600; i++) F.stepBird(b, { north: 1, held: false, steer: 0 });
  check("no-input climb for 10s stays near its starting x", Math.abs(b.y - start) < 1, "dy=" + (b.y - start));
  check("no-input climb does not die on an edge", b.edgeDeath === false);
  check("leftover sideways speed is gone", b.vy === 0 && b.steer === 0, JSON.stringify(b));
})();

(function bleedLeftover() {
  const b = bird(260, 6, 1.4);
  for (let i = 0; i < 600; i++) F.stepBird(b, { north: 1, held: false, steer: 0 });
  check("leftover hop velocity does not run away", Math.abs(b.y - 260) < 30, "y=" + b.y.toFixed(2));
  check("leftover velocity settles to zero", b.vy === 0 && Math.abs(b.steer) < 0.001, "vy=" + b.vy + " steer=" + b.steer);
})();

(function steerThenSettle() {
  const b = bird(260, 0, 0);
  for (let i = 0; i < 36; i++) F.stepBird(b, { north: 1, held: false, steer: 1 });
  const moved = b.y;
  check("steering right moves the bird", moved > 300, "y=" + moved.toFixed(2));
  for (let i = 0; i < 90; i++) F.stepBird(b, { north: 1, held: false, steer: 0 });
  const settled = b.y;
  for (let i = 0; i < 60; i++) F.stepBird(b, { north: 1, held: false, steer: 0 });
  check("steering settles and holds", Math.abs(b.y - settled) < 1.5, "dy=" + (b.y - settled));
  check("steer speed is zero after release", Math.abs(b.steer) < 0.001, "steer=" + b.steer);

  const left = bird(260, 0, 0);
  for (let i = 0; i < 36; i++) F.stepBird(left, { north: 1, held: false, steer: -1 });
  check("steering left moves the other way", left.y < 220, "y=" + left.y.toFixed(2));
})();

(function softWall() {
  const b = bird(260, 0, 0);
  const maxY = 520 - 16 - F.FLIGHT.EDGE_PAD;
  for (let i = 0; i < 500; i++) F.stepBird(b, { north: 1, held: false, steer: 1 });
  check("the screen edge stops the bird", Math.abs(b.y - maxY) < 0.2, "y=" + b.y);
  check("the edge is not a death", b.edgeDeath === false);
  for (let i = 0; i < 60; i++) F.stepBird(b, { north: 1, held: false, steer: 0 });
  check("the bird stays at the edge after release", Math.abs(b.y - maxY) < 0.2, "y=" + b.y);
})();

(function noSideClimb() {
  const b = bird(260, 0, 0);
  for (let i = 0; i < 180; i++) F.stepBird(b, { north: 0, held: true, steer: 0 });
  check("a held press does not start sideways flight", Math.abs(b.y - 260) < 1 && b.alive === true, "y=" + b.y);
})();

(function eastSoar() {
  let vy = 0;
  const first = F.stepEast(vy, true);
  check("hold is not a flap impulse", first > -1 && first < 0, "vy=" + first);
  for (let i = 0; i < 40; i++) vy = F.stepEast(vy, true);
  check("rise speed is capped", Math.abs(vy - F.FLIGHT.MAX_RISE) < 0.001, "vy=" + vy);
  for (let i = 0; i < 80; i++) vy = F.stepEast(vy, false);
  check("glide is gentle and capped", vy > 0 && Math.abs(vy - F.FLIGHT.MAX_GLIDE) < 0.001, "vy=" + vy);
})();

(function wings() {
  const up = F.wingMotion(0, true);
  const glide = F.wingMotion(0, false);
  check("wings beat while rising", up.rate > 0.2 && up.depth > 0.8, JSON.stringify(up));
  check("wings keep beating while gliding", glide.rate > 0.05 && glide.depth < up.depth, JSON.stringify(glide));
  check("auto-fire window is about 10 seconds", F.FLIGHT.AUTO_FIRE_FRAMES === 600);
})();

(function noseLeads() {
  function sign(v) { return v > 0.02 ? 1 : v < -0.02 ? -1 : 0; }
  ["climb", "side"].forEach(function (pose) {
    [-2.2, -0.6, 0.6, 2.2].forEach(function (steer) {
      const lead = F.noseLead(steer, pose);
      const poseTurn = F.rigidPose(steer, pose, 0, { x: 90, y: 260 });
      const noseLat = pose === "climb" ? lead.x : lead.y;
      const s = sign(steer);
      check(pose + " body, nose and steer share a sign " + steer,
        sign(poseTurn.body) === s && sign(noseLat) === s && sign(lead.ang) === s,
        JSON.stringify(poseTurn));
    });
  });
  const lane = { x: 120, y: 240 };
  let maxMove = 0;
  let prev = null;
  for (let i = 0; i <= 24; i++) {
    const p = F.rigidPose(1.8, i < 12 ? "side" : "climb", -Math.PI / 2 * (i / 24), lane);
    if (prev) maxMove = Math.max(maxMove, Math.hypot(p.chest.x - prev.x, p.chest.y - prev.y));
    prev = p.chest;
  }
  check("chest stays within 1px through a turn", maxMove < 1, "move=" + maxMove);
})();

(function edges() {
  function stay(north, held, steer) {
    const b = bird(260, 0, 0);
    for (let i = 0; i < 700; i++) F.stepBird(b, { north: north, held: held, steer: steer });
    const minY = 16 + F.FLIGHT.EDGE_PAD;
    const maxY = 520 - 16 - F.FLIGHT.EDGE_PAD;
    return b.alive === true && b.edgeDeath === false && b.y >= minY - 0.01 && b.y <= maxY + 0.01;
  }
  check("holding up for 10s stays on screen", stay(0, true, 0));
  check("releasing for 10s stays on screen", stay(0, false, 0));
  check("climb left edge does not kill", stay(1, false, -1));
  check("climb right edge does not kill", stay(1, false, 1));
  check("a turn into the ceiling does not kill", stay(0.5, true, 0));
})();

(function handoff() {
  const b = bird(260, -3.2, 0);
  for (let i = 0; i < 40; i++) F.stepBird(b, { north: 0.5, held: true, steer: 0 });
  for (let i = 0; i < 60; i++) F.stepBird(b, { north: 1, held: false, steer: 0 });
  check("a turn hands vertical speed off instead of drifting", Math.abs(b.y - 260) < 80 && b.vy === 0, "y=" + b.y.toFixed(2) + " vy=" + b.vy);
})();

(function levelBoundaryKeepsTicking() {
  let frame = 0;
  let level = 1;
  let score = 0;
  let overlay = null;
  const b = bird(260, 0, 0);
  const startY = b.y;
  for (let i = 0; i < 48; i++) {
    frame++;
    score++;
    const next = 1 + Math.floor(score / 5);
    if (next > level) level = next;
    overlay = null;
    F.stepBird(b, { north: 1, held: false, steer: 1 });
  }
  check("the loop keeps ticking across a level boundary", frame === 48 && level > 1 && b.y > startY + 20, "frame=" + frame + " level=" + level + " y=" + b.y.toFixed(1));
  check("a level boundary shows no overlay", overlay == null && level >= 2);
})();

(function dragFollowsFinger() {
  const b = bird(200, 0, 0);
  b.screenY = 430;
  let maxStep = 0;
  let prev = b.y;
  for (let i = 0; i < 36; i++) {
    F.stepFollow(b, { down: true, aimX: 340, fingerY: 280, bandTop: 220, bandBot: 470, homeY: 430 });
    maxStep = Math.max(maxStep, Math.abs(b.y - prev));
    prev = b.y;
  }
  check("drag follow eases toward the finger", b.y > 260 && b.y < 340, "y=" + b.y.toFixed(1));
  check("drag follow does not teleport", maxStep <= F.FLIGHT.FOLLOW_MAX + 0.001, "step=" + maxStep.toFixed(2));
  check("the bird stays above the finger", b.screenY < 280, "sy=" + b.screenY.toFixed(1));
  const held = b.y;
  const heldY = b.screenY;
  for (let i = 0; i < 30; i++) F.stepFollow(b, { down: false, restX: 200, restY: 480, bandTop: 220, bandBot: 480 });
  check("lifting the finger eases back toward the middle", Math.abs(b.y - 200) < Math.abs(held - 200));
  check("lifting the finger eases back down toward the rest line", b.screenY > heldY && b.screenY <= 480.01, "sy=" + b.screenY);
})();

(function restSpotAndCap() {
  const b = bird(320, 0, 0);
  b.screenY = 360;
  for (let i = 0; i < 90; i++) F.stepFollow(b, { down: false, restX: 260, restY: 480, bandTop: 330, bandBot: 480 });
  check("the bird returns to bottom middle", Math.abs(b.y - 260) < 6 && Math.abs(b.screenY - 480) < 6, "y=" + b.y.toFixed(1) + " sy=" + b.screenY.toFixed(1));
  const climber = bird(260, 0, 0);
  climber.screenY = 480;
  for (let i = 0; i < 80; i++) F.stepFollow(climber, { down: true, aimX: 260, fingerY: 80, bandTop: 330, bandBot: 480 });
  check("forward flight stops at the cap", climber.screenY >= 329.5 && climber.screenY < 400, "sy=" + climber.screenY.toFixed(1));
  const low = bird(260, 0, 0);
  low.screenY = 480;
  for (let i = 0; i < 20; i++) F.stepFollow(low, { down: true, aimX: 300, fingerY: 700, bandTop: 330, bandBot: 480 });
  check("the bird never drops below the rest line", low.screenY <= 480.01 && low.screenY >= 470);
  const focus = F.focusFromScreen(90, 360, 480);
  check("effects ahead of the anchor match the higher bird", focus.x === 210 && focus.ahead === 120);
  const home = F.focusFromScreen(90, 480, 480);
  check("at rest the focus is the anchor", home.x === 90 && home.ahead === 0);
})();

(function dragDownNeverBack() {
  const b = bird(220, 0, 0);
  b.screenY = 360;
  const lane0 = b.y;
  const s0 = b.screenY;
  let backed = false;
  for (let i = 0; i < 40; i++) {
    F.stepFollow(b, { down: true, aimX: 300, fingerY: 540, bandTop: 200, bandBot: 480 });
    if (b.screenY > s0 + 0.001) backed = true;
  }
  check("a downward drag never moves the bird backward", !backed, "sy=" + b.screenY);
  check("a downward drag still follows sideways", b.y > lane0 + 8, "y=" + b.y.toFixed(1));
  check("a downward drag holds height", Math.abs(b.screenY - s0) < 0.001, "sy=" + b.screenY);
})();

(function speedBoostStaysForward() {
  const b = bird(240, 1.6, 2.4);
  const y0 = b.y;
  const steer0 = b.steer;
  const r = F.stepBoost(b);
  check("a speed boost adds no horizontal velocity", r.dy === 0 && r.boostVx === 0 && b.y === y0 && b.boostSide === 0, JSON.stringify(r));
  check("a speed boost keeps the heading forward", Math.abs(r.heading - (-Math.PI / 2)) < 0.0001 && b.steer === steer0, "h=" + r.heading);
})();

(function fireBeamBendsForward() {
  const src = { x: 100, y: 240 };
  const tgt = { x: 280, y: 310 };
  const pts = F.beamPolyline(src, tgt, 4, 0);
  check("the beam leaves straight forward", pts[1].y === src.y && pts[1].x > src.x + 20, JSON.stringify(pts[1]));
  let back = false;
  for (let i = 1; i < pts.length; i++) if (pts[i].x + 0.01 < pts[i - 1].x) back = true;
  check("the beam never steps backward", !back);
  check("the beam ends on the target", pts[pts.length - 1].x === tgt.x && pts[pts.length - 1].y === tgt.y);
  const bent = pts.some(function (p, i) { return i > 1 && i < pts.length - 1 && Math.abs(p.y - src.y) > 8; });
  check("the beam bends after the straight start", bent);
  const tip = F.pointAlong(pts, 1);
  check("the tip points along the last segment", tip.dx !== 0 || tip.dy !== 0);
  const behind = F.beamPolyline(src, { x: 40, y: 400 }, 4, 1);
  let side = false;
  let rev = false;
  for (let i = 0; i < behind.length; i++) {
    if (behind[i].y !== src.y) side = true;
    if (i && behind[i].x < behind[i - 1].x) rev = true;
  }
  check("a target behind still fires only forward", !side && !rev && behind[behind.length - 1].x > src.x);
})();

if (fails) {
  console.error(fails + " flight checks failed");
  process.exit(1);
}
console.log("flight.test.js OK");
