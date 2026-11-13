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

if (fails) {
  console.error(fails + " flight checks failed");
  process.exit(1);
}
console.log("flight.test.js OK");
