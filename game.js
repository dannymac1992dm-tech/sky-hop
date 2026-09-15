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
  const MUTE_KEY = "skyhop_mute";
  const EXTRAS_KEY = "skyhop_extras";
  const TROPHY_KEY = "skyhop_trophies";

  // —— State ——
  const State = { START: 0, PLAY: 1, OVER: 2, TROPHIES: 3 };
  let state = State.START;
  let prevMenuState = State.START;
  let score = 0;
  let best = parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10) || 0;
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
  let trophyFlash = 0;
  let trophyFlashText = "";
  let trophyScroll = 0;
  let trophyDragY = null;
  let trophyDragScroll = 0;
  // Rewarded continue: one per run; free Retry always available via flap/space
  let continueUsedThisRun = false;
  let invulnFrames = 0;
  let continueBusy = false;

  // —— Trophies (levels 1–100) ——
  const MAX_LEVEL = 100;
  const trophyNames = buildTrophyNames();
  let unlocked = loadTrophies();

  function buildTrophyNames() {
    const prefixes = [
      "Cloud", "Sky", "Wind", "Dawn", "Sun", "Mist", "Peak", "Breeze",
      "Nest", "Wing", "Feather", "Horizon", "Glide", "Zephyr", "Aether",
      "Summit", "Drift", "Aurora", "Ember", "Crystal",
    ];
    const suffixes = [
      "Hop", "Badge", "Medal", "Crest", "Star", "Gem", "Seal", "Mark",
      "Token", "Emblem", "Charm", "Shard", "Spark", "Ring", "Orb",
    ];
    const names = [];
    for (let i = 1; i <= MAX_LEVEL; i++) {
      const p = prefixes[(i - 1) % prefixes.length];
      const s = suffixes[Math.floor((i - 1) / prefixes.length) % suffixes.length];
      names[i] = p + " " + s;
      if (i === 1) names[i] = "First Flap";
      if (i === 10) names[i] = "Tenfold Glide";
      if (i === 25) names[i] = "Quarter Sky";
      if (i === 50) names[i] = "Halfway Horizon";
      if (i === 75) names[i] = "Three-Quarter Peak";
      if (i === 100) names[i] = "Sky Master Crown";
    }
    return names;
  }

  function loadTrophies() {
    try {
      const raw = localStorage.getItem(TROPHY_KEY);
      if (!raw) return {};
      const arr = JSON.parse(raw);
      const map = {};
      if (Array.isArray(arr)) {
        for (const n of arr) {
          const v = parseInt(n, 10);
          if (v >= 1 && v <= MAX_LEVEL) map[v] = true;
        }
      }
      return map;
    } catch (_) {
      return {};
    }
  }

  function saveTrophies() {
    const arr = [];
    for (let i = 1; i <= MAX_LEVEL; i++) if (unlocked[i]) arr.push(i);
    localStorage.setItem(TROPHY_KEY, JSON.stringify(arr));
  }

  function unlockTrophy(lv) {
    if (lv < 1 || lv > MAX_LEVEL) return false;
    if (unlocked[lv]) return false;
    unlocked[lv] = true;
    saveTrophies();
    trophyFlash = 1;
    trophyFlashText = "🏆 " + trophyNames[lv];
    sfxTrophy();
    return true;
  }

  function trophyCount() {
    let n = 0;
    for (let i = 1; i <= MAX_LEVEL; i++) if (unlocked[i]) n++;
    return n;
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

  // —— Levels (1–100) ——
  const PIPES_PER_LEVEL = 5;
  const BASE_SPEED = 2.4;
  const MAX_SPEED = 4.15;
  const BASE_GAP = 148;
  const MIN_GAP = 102;
  const BASE_SPAWN = 95;
  const MIN_SPAWN = 70;
  const BASE_GAP_MARGIN = 40;
  const MAX_GAP_MARGIN = 58;

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
  function levelFromScore(s) {
    return Math.min(MAX_LEVEL, 1 + Math.floor(s / PIPES_PER_LEVEL));
  }

  function applyDifficulty() {
    const t = (Math.min(level, MAX_LEVEL) - 1) / (MAX_LEVEL - 1);
    pipeSpeed = BASE_SPEED + (MAX_SPEED - BASE_SPEED) * t;
    pipeGap = BASE_GAP + (MIN_GAP - BASE_GAP) * t;
    spawnEvery = Math.round(BASE_SPAWN + (MIN_SPAWN - BASE_SPAWN) * t);
    gapMargin = BASE_GAP_MARGIN + (MAX_GAP_MARGIN - BASE_GAP_MARGIN) * t;
  }

  function onScoreChanged() {
    const prev = level;
    level = levelFromScore(score);
    applyDifficulty();
    if (level > prev) {
      levelFlash = 1;
      levelFlashText = "Level " + level;
      sfxLevel();
      unlockTrophy(level);
    }
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
    trophyFlash = 0;
    trophyFlashText = "";
    clearExtras();
    applyDifficulty();
  }

  function startPlay() {
    resetGame();
    continueUsedThisRun = false;
    continueBusy = false;
    invulnFrames = 0;
    state = State.PLAY;
    ensureAudio();
    startMusicLoop(true);
    sfxFlap();
    bird.vy = FLAP;
    unlockTrophy(1);
    notifyAdsState();
  }

  function gameOver() {
    if (state !== State.PLAY) return;
    if (invulnFrames > 0) return;
    state = State.OVER;
    overTimer = 0;
    flash = 1;
    softenMusic();
    sfxHit();
    if (score > best) {
      best = score;
      localStorage.setItem(STORAGE_KEY, String(best));
    }
    notifyAdsState();
  }

  function notifyAdsState() {
    const ads = typeof window !== "undefined" ? window.SkyHopAds : null;
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
    const ads = window.SkyHopAds;
    if (!ads || typeof ads.showRewardedContinue !== "function") return;
    if (typeof ads.canOfferContinue === "function" && !ads.canOfferContinue()) return;
    continueBusy = true;
    try {
      const ok = await ads.showRewardedContinue();
      if (ok) continuePlay();
      else continueBusy = false;
    } catch (_) {
      continueBusy = false;
    }
  }

  function openTrophies() {
    prevMenuState = state === State.TROPHIES ? prevMenuState : state;
    state = State.TROPHIES;
    trophyScroll = 0;
    notifyAdsState();
  }

  function closeTrophies() {
    state = prevMenuState === State.PLAY ? State.START : prevMenuState;
    if (state === State.PLAY) state = State.START;
    notifyAdsState();
  }

  // Hit-test regions for UI buttons drawn on canvas
  const uiButtons = { trophies: null, back: null, close: null, continue: null };

  function flap() {
    ensureAudio();
    if (state === State.TROPHIES) return;
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
    }
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
    const maxScroll = Math.max(0, (MAX_LEVEL - visible) * rowH);
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
    if (extrasOn && (forceHazard || (level >= 20 && Math.random() < 0.12 + level * 0.002))) {
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
    const hazard = level >= 30 && Math.random() < 0.18 + (level - 30) * 0.003;
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
    const push = extrasOn && level >= 18 && Math.random() < 0.35 + level * 0.002;
    let x = W + 20;
    // Don't put push zones smack in pipe gaps vertically — width is vertical band
    waterfalls.push({
      x,
      w: 36 + Math.random() * 28,
      push: push ? 0.12 + Math.min(0.18, level * 0.0015) : 0,
      phase: Math.random() * Math.PI * 2,
    });
  }

  function fireProjectile(h) {
    const kind = h.kind;
    projectiles.push({
      x: h.x - 10,
      y: h.y + 8,
      vx: -(2.2 + Math.min(1.6, level * 0.015)),
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

    // Spawns
    if (playing) {
      nextTree--;
      if (nextTree <= 0) {
        spawnTree(false);
        nextTree = extrasOn
          ? Math.max(35, 90 - level * 0.4)
          : 100 + Math.random() * 80;
      }
      if (extrasOn) {
        nextAnimal--;
        if (nextAnimal <= 0 && level >= 8) {
          spawnAnimal();
          nextAnimal = Math.max(55, 140 - level * 0.7);
        }
        nextHunter--;
        if (nextHunter <= 0 && level >= 35) {
          spawnHunter();
          const dens = Math.max(90, 260 - level * 1.2);
          nextHunter = dens + Math.random() * 40;
        }
        nextWaterfall--;
        if (nextWaterfall <= 0 && level >= 5) {
          spawnWaterfall();
          nextWaterfall = Math.max(100, 220 - level * 0.8);
        }
      } else if (playing && frame % 180 === 0) {
        // rare light bg tree when extras off
        spawnTree(false);
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
          h.shootCD = Math.max(55, 110 - level * 0.35);
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
    if (trophyFlash > 0) trophyFlash *= 0.96;
    if (bird.wing > 0) bird.wing *= 0.85;
    if (invulnFrames > 0) invulnFrames--;

    if (state === State.TROPHIES) return;

    const scrollMul = state === State.PLAY ? 1 : state === State.START ? 0.35 : 0.15;
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
    bird.vy = Math.min(bird.vy + GRAVITY, MAX_FALL);
    bird.y += bird.vy;
    bird.rot = Math.max(-0.55, Math.min(1.15, bird.vy * 0.08));

    if (bird.y - bird.r < 0 || bird.y + bird.r > PLAY_H) {
      gameOver();
      return;
    }

    nextSpawn--;
    if (nextSpawn <= 0) {
      spawnPipe();
      nextSpawn = spawnEvery;
    }

    for (let i = pipes.length - 1; i >= 0; i--) {
      const p = pipes[i];
      p.x -= pipeSpeed;

      if (!p.scored && p.x + p.w < bird.x) {
        p.scored = true;
        score++;
        scorePop = 1;
        onScoreChanged();
        sfxScore();
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

    const wingAngle = -0.5 + bird.wing * 1.1;

    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath();
    ctx.ellipse(2, 18, 14, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    const body = ctx.createRadialGradient(-4, -4, 2, 0, 0, 18);
    body.addColorStop(0, "#fff5a0");
    body.addColorStop(0.5, "#ffd54a");
    body.addColorStop(1, "#f0a820");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 0, 17, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.ellipse(2, 5, 10, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(-2, 2);
    ctx.rotate(wingAngle);
    ctx.fillStyle = "#ffb020";
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e89010";
    ctx.beginPath();
    ctx.ellipse(-2, 0, 7, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(8, -4, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.arc(9.5, -4, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(10.5, -5.2, 1.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ff6b2d";
    ctx.beginPath();
    ctx.moveTo(14, -1);
    ctx.lineTo(24, 2);
    ctx.lineTo(14, 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(14, 2);
    ctx.lineTo(22, 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,100,100,0.35)";
    ctx.beginPath();
    ctx.ellipse(4, 3, 4, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();

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
    ctx.font = "bold 16px 'Segoe UI', system-ui, sans-serif";
    const lv = "Level " + level;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.strokeText(lv, W / 2, 82);
    ctx.fillStyle = level >= MAX_LEVEL ? "#ffe08a" : "rgba(255,255,255,0.92)";
    ctx.fillText(lv, W / 2, 82);
    ctx.restore();

    if (levelFlash > 0.04 && state === State.PLAY) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, levelFlash * 1.15);
      const y = 118 + (1 - levelFlash) * 10;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 22px 'Segoe UI', system-ui, sans-serif";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(0,40,80,0.35)";
      ctx.strokeText(levelFlashText, W / 2, y);
      ctx.fillStyle = "#ffe566";
      ctx.fillText(levelFlashText, W / 2, y);
      ctx.restore();
    }

    if (trophyFlash > 0.05) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, trophyFlash * 1.2);
      const y = 148 + (1 - trophyFlash) * 14;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 15px 'Segoe UI', system-ui, sans-serif";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(40,20,0,0.4)";
      ctx.strokeText(trophyFlashText, W / 2, y);
      ctx.fillStyle = "#ffd700";
      ctx.fillText(trophyFlashText, W / 2, y);
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

  function drawStart() {
    uiButtons.trophies = null;
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
    ctx.fillText("100 levels — every " + PIPES_PER_LEVEL + " pipes", W / 2, 136);

    if (extrasOn) {
      ctx.fillStyle = "rgba(255,255,200,0.7)";
      ctx.font = "12px 'Segoe UI', system-ui, sans-serif";
      ctx.fillText("Extras on — trees, critters & hunters!", W / 2, 158);
    }

    drawTrophyButton(W / 2, PLAY_H - 78);

    const pulse = 0.55 + Math.sin(frame * 0.12) * 0.45;
    ctx.globalAlpha = pulse;
    ctx.font = "bold 20px 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText("Tap / Space to start", W / 2, PLAY_H - 40);
    ctx.globalAlpha = 1;

    if (best > 0) {
      ctx.globalAlpha = 0.85;
      ctx.font = "15px 'Segoe UI', system-ui, sans-serif";
      ctx.fillText("Best: " + best + "  ·  🏆 " + trophyCount() + "/" + MAX_LEVEL, W / 2, PLAY_H - 14);
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = 0.75;
      ctx.font = "14px 'Segoe UI', system-ui, sans-serif";
      ctx.fillText("🏆 " + trophyCount() + "/" + MAX_LEVEL, W / 2, PLAY_H - 14);
      ctx.globalAlpha = 1;
    }
  }

  function drawOver() {
    uiButtons.trophies = null;
    uiButtons.continue = null;
    const panel = drawPanel(
      "Game Over",
      ["Level  " + level, "Score  " + score, "Best   " + best, "Trophies  " + trophyCount() + "/" + MAX_LEVEL],
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

    drawTrophyButton(W / 2, y + 8);
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
    ctx.font = "14px 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,220,120,0.9)";
    ctx.fillText(trophyCount() + " / " + MAX_LEVEL + " unlocked", W / 2, 66);

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

    // List area
    const listTop = 88;
    const listBot = H - 24;
    const rowH = 52;
    ctx.save();
    ctx.beginPath();
    ctx.rect(12, listTop, W - 24, listBot - listTop);
    ctx.clip();

    const startIdx = Math.floor(trophyScroll / rowH);
    const endIdx = Math.min(MAX_LEVEL, startIdx + Math.ceil((listBot - listTop) / rowH) + 1);

    for (let i = startIdx; i < endIdx; i++) {
      const lv = i + 1;
      const y = listTop + i * rowH - trophyScroll;
      const on = !!unlocked[lv];

      ctx.fillStyle = on ? "rgba(255,200,80,0.12)" : "rgba(255,255,255,0.05)";
      roundRect(20, y + 4, W - 40, rowH - 8, 10);
      ctx.fill();

      drawTrophyIcon(48, y + rowH / 2, lv, on);

      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "bold 14px 'Segoe UI', system-ui, sans-serif";
      ctx.fillStyle = on ? "#ffe8a0" : "rgba(180,190,200,0.55)";
      ctx.fillText(on ? trophyNames[lv] : "Locked", 72, y + rowH / 2 - 8);
      ctx.font = "12px 'Segoe UI', system-ui, sans-serif";
      ctx.fillStyle = on ? "rgba(255,230,160,0.7)" : "rgba(140,150,160,0.45)";
      ctx.fillText("Level " + lv, 72, y + rowH / 2 + 10);
    }
    ctx.restore();

    // Scroll hint
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "11px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Drag or scroll  ·  Esc to close", W / 2, H - 10);
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

    drawSky();
    drawClouds();
    drawHills();
    drawWorldExtras("bg");

    for (const p of pipes) drawPipe(p);

    drawWorldExtras("fg");
    drawGround();

    // Foreground trees after ground base? Keep trunks on playfield
    // (trees already drawn in fg layer above ground strip — OK for canopy look)

    if (state === State.START) {
      drawBird();
      drawStart();
    } else {
      drawBird();
      drawScoreHUD();
      if (state === State.OVER) drawOver();
    }

    drawFlash();
    requestAnimationFrame(loop);
  }

  resetGame();
  state = State.START;
  notifyAdsState();
  requestAnimationFrame(loop);
})();
