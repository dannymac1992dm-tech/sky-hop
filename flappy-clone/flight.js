/**
 * Sky Hop 1.21 code 42 flight.
 * The bird always climbs north. bird.y is the left/right lane.
 * A positive lane speed is screen-right. Edges stop the bird; they do not kill.
 * A finger drag eases the bird toward the touch. Screen-down is backward and is ignored.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SkyHopFlight = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var FLIGHT = {
    RISE_ACCEL: -0.16,
    GLIDE_ACCEL: 0.09,
    MAX_RISE: -3.2,
    MAX_GLIDE: 2.2,
    STEER_ACCEL: 0.16,
    STEER_MAX: 2.8,
    STEER_DAMP: 0.14,
    EDGE_PAD: 8,
    AUTO_FIRE_FRAMES: 600,
    FOLLOW_EASE: 0.18,
    FOLLOW_MAX: 4.8,
    FINGER_LIFT: 46,
    FORWARD_HEADING: -Math.PI / 2
  };

  function clamp(v, lo, hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }

  function stepEast(vy, held, gravMul) {
    var m = gravMul == null ? 1 : gravMul;
    if (held) {
      vy += FLIGHT.RISE_ACCEL;
      if (vy < FLIGHT.MAX_RISE) vy = FLIGHT.MAX_RISE;
    } else {
      vy += FLIGHT.GLIDE_ACCEL * m;
      var cap = FLIGHT.MAX_GLIDE * (m > 1 ? Math.min(1.35, m) : 1);
      if (vy > cap) vy = cap;
    }
    return vy;
  }

  function stepSteer(vx, dir) {
    if (dir < 0) {
      vx -= FLIGHT.STEER_ACCEL;
      if (vx < -FLIGHT.STEER_MAX) vx = -FLIGHT.STEER_MAX;
    } else if (dir > 0) {
      vx += FLIGHT.STEER_ACCEL;
      if (vx > FLIGHT.STEER_MAX) vx = FLIGHT.STEER_MAX;
    } else if (vx > 0) {
      vx = Math.max(0, vx - FLIGHT.STEER_DAMP);
    } else if (vx < 0) {
      vx = Math.min(0, vx + FLIGHT.STEER_DAMP);
    }
    return vx;
  }

  /**
   * Always a north climb. steer is -1 (screen left), 0, or 1 (screen right).
   * The north argument is ignored so a side heading cannot come back.
   */
  function stepBird(b, input) {
    var steerIn = input.steer || 0;
    if (b.steer == null) b.steer = 0;
    b.vy *= 0.5;
    if (Math.abs(b.vy) < 0.08) b.vy = 0;
    b.steer = stepSteer(b.steer, steerIn);
    b.y += b.vy + b.steer;
    var r = b.r || 16;
    var playH = b.playH || 520;
    var minY = r + FLIGHT.EDGE_PAD;
    var maxY = playH - r - FLIGHT.EDGE_PAD;
    if (b.y < minY) {
      b.y = minY;
      if (b.steer < 0) b.steer = 0;
      if (b.vy < 0) b.vy = 0;
    }
    if (b.y > maxY) {
      b.y = maxY;
      if (b.steer > 0) b.steer = 0;
      if (b.vy > 0) b.vy = 0;
    }
    b.edgeDeath = false;
    b.alive = true;
    return b;
  }

  /**
   * Drag-to-follow. aimX is the lane under the finger. fingerY is screen y (down is positive).
   * The bird eases toward the finger, stays above it, and never increases screenY (never flies backward).
   */
  function stepFollow(b, input) {
    input = input || {};
    if (b.screenY == null) b.screenY = input.homeY != null ? input.homeY : 430;
    var ease = FLIGHT.FOLLOW_EASE;
    var max = FLIGHT.FOLLOW_MAX;
    var aimX = b.y;
    var aimY = b.screenY;
    if (input.down) {
      if (input.aimX != null) aimX = input.aimX;
      var fingerY = input.fingerY != null ? input.fingerY : b.screenY;
      var lifted = fingerY - FLIGHT.FINGER_LIFT;
      if (lifted < b.screenY) aimY = lifted;
    }
    if (input.bandTop != null && aimY < input.bandTop) aimY = input.bandTop;
    if (input.bandBot != null && aimY > input.bandBot) aimY = input.bandBot;
    if (aimY > b.screenY) aimY = b.screenY;
    var dx = aimX - b.y;
    var dy = aimY - b.screenY;
    var sx = clamp(dx * ease, -max, max);
    var sy = dy * ease;
    if (sy < -max) sy = -max;
    if (sy > 0) sy = 0;
    var y0 = b.y;
    var s0 = b.screenY;
    b.y += sx;
    b.screenY += sy;
    b.steer = sx;
    var r = b.r || 16;
    var playH = b.playH || 520;
    var minY = input.laneMin != null ? input.laneMin : r + FLIGHT.EDGE_PAD;
    var maxY = input.laneMax != null ? input.laneMax : playH - r - FLIGHT.EDGE_PAD;
    if (b.y < minY) { b.y = minY; if (b.steer < 0) b.steer = 0; }
    if (b.y > maxY) { b.y = maxY; if (b.steer > 0) b.steer = 0; }
    b.edgeDeath = false;
    b.alive = true;
    b.vy = 0;
    b.stepX = b.y - y0;
    b.backDy = b.screenY - s0;
    return b;
  }

  /** A speed boost adds forward pace only. Lane, steer, and heading stay as they are. */
  function stepBoost(b) {
    var y0 = b.y;
    b.boostVx = 0;
    b.heading = FLIGHT.FORWARD_HEADING;
    b.boostSide = 0;
    return { dy: b.y - y0, steer: b.steer || 0, heading: b.heading, boostVx: 0, y: b.y };
  }

  /** One clockwise bank for the whole bird. Positive steer is screen-right. */
  function noseAngle(steer) {
    var a = (steer || 0) * 0.2;
    if (a > 0.62) a = 0.62;
    if (a < -0.62) a = -0.62;
    return a;
  }

  function rotCW(x, y, ang) {
    var c = Math.cos(ang), s = Math.sin(ang);
    return { x: x * c - y * s, y: x * s + y * c };
  }

  function noseLead(steer, pose) {
    var ang = noseAngle(steer);
    var nx = pose === "climb" ? 0 : 1;
    var ny = pose === "climb" ? -1 : 0;
    var nose = rotCW(nx, ny, ang);
    nose.ang = ang;
    return nose;
  }

  /** Chest stays on the lane point. Body heading and nose heading are the same angle. */
  function rigidPose(steer, pose, heading, lane) {
    var bank = noseAngle(steer);
    var ang = (heading || 0) + bank;
    var at = lane || { x: 0, y: 0 };
    var nx = pose === "climb" ? 0 : 1;
    var ny = pose === "climb" ? -1 : 0;
    var nose = rotCW(nx, ny, ang);
    return {
      ang: ang,
      bank: bank,
      body: ang,
      chest: { x: at.x, y: at.y },
      nose: { x: at.x + nose.x, y: at.y + nose.y }
    };
  }

  /** Continuous wingbeat. rate is never 0. depth is shallower while gliding. */
  function wingMotion(phase, rising) {
    var depth = rising ? 0.92 : 0.4;
    var rate = rising ? 0.28 : 0.11;
    var next = (phase || 0) + rate;
    var u = Math.sin(next) * depth;
    var pose;
    if (u >= 0) pose = { a: 1, b: 0, f: u };
    else pose = { a: 1, b: 2, f: -u };
    pose.phase = next;
    pose.depth = depth;
    pose.rate = rate;
    return pose;
  }

  return {
    FLIGHT: FLIGHT,
    stepEast: stepEast,
    stepSteer: stepSteer,
    stepBird: stepBird,
    noseAngle: noseAngle,
    noseLead: noseLead,
    rigidPose: rigidPose,
    wingMotion: wingMotion,
    stepFollow: stepFollow,
    stepBoost: stepBoost
  };
});
