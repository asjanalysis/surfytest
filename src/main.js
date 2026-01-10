import { clamp, formatScore, lerp, makeNoise1D, makeRng, shuffleInPlace } from "./util.js";

const INTERNAL_W = 384;
const INTERNAL_H = 216;
const BASE_PLAYER_X = INTERNAL_W * 0.28;
const STORAGE_PREFIX = "bwp_";

const STATE = {
  TITLE: "TITLE",
  READY: "READY",
  PLAYING: "PLAYING",
  WIPEOUT: "WIPEOUT",
  LEVEL_COMPLETE: "LEVEL_COMPLETE",
};

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const buffer = document.createElement("canvas");
buffer.width = INTERNAL_W;
buffer.height = INTERNAL_H;
const bctx = buffer.getContext("2d");
bctx.imageSmoothingEnabled = false;

const panel = document.querySelector("#panel");
const panelTitle = document.querySelector("#panel-title");
const panelBody = document.querySelector("#panel-body");
const panelButton = document.querySelector("#panel-button");
const hudLevel = document.querySelector("#hud-level");
const hudScore = document.querySelector("#hud-score");
const hudBest = document.querySelector("#hud-best");
const crtToggle = document.querySelector("#crt-toggle");

let state = STATE.TITLE;
let lastTime = 0;
let didTap = false;
let level = 1;
let score = 0;
let bestScore = Number(localStorage.getItem(`${STORAGE_PREFIX}best`) || 0);
let crtEnabled = localStorage.getItem(`${STORAGE_PREFIX}crt`) === "1";

let rng = makeRng(1);
let noise = makeNoise1D(1);

const player = {
  x: BASE_PLAYER_X,
  y: INTERNAL_H * 0.5,
  vy: 0,
};

const wave = {
  time: 0,
  speed: 0.55,
  baseThickness: 74,
  amplitude: 28,
  rideDuration: 22,
  suction: 0.9,
  gravity: 80,
  impulse: -140,
  maxVy: 150,
  barrelEvents: [],
};

function resetWave() {
  const levelSeed = 1000 + level * 77;
  rng = makeRng(levelSeed);
  noise = makeNoise1D(levelSeed);
  wave.time = 0;
  wave.speed = 0.55 + level * 0.06;
  wave.amplitude = 22 + level * 6;
  wave.baseThickness = clamp(84 - level * 4.5, 44, 84);
  wave.rideDuration = 20 + level * 5;
  wave.suction = 0.7 + level * 0.05;
  wave.gravity = 80 + level * 6;
  wave.impulse = -145 - level * 2;
  wave.maxVy = 170 + level * 6;
  wave.barrelEvents = createBarrels(levelSeed);

  player.x = BASE_PLAYER_X;
  player.y = INTERNAL_H * 0.5;
  player.vy = 0;
}

function createBarrels(seed) {
  const barrelRng = makeRng(seed + 23);
  const count = clamp(2 + Math.floor(level / 2), 2, 5);
  const events = [];
  const slots = shuffleInPlace(
    Array.from({ length: 8 }, (_, i) => i),
    barrelRng
  ).slice(0, count);
  slots.forEach((slot) => {
    const start = lerp(0.15, 0.8, (slot + barrelRng() * 0.3) / 8);
    events.push({
      start,
      duration: lerp(0.08, 0.14, barrelRng()),
      squeeze: lerp(0.25, 0.4, barrelRng()),
    });
  });
  return events.sort((a, b) => a.start - b.start);
}

function pocketAt(x, time) {
  const t = time * wave.speed;
  const wavePhase = t + x * 0.018;
  const gentle = Math.sin(wavePhase) * wave.amplitude;
  const harmonic = Math.sin(wavePhase * 0.5 + 1.7) * (wave.amplitude * 0.5);
  const noiseVal = noise(t * 0.6 + x * 0.03) * 8;
  const center = INTERNAL_H * 0.5 + gentle + harmonic + noiseVal;
  let thickness = wave.baseThickness;

  const progress = time / wave.rideDuration;
  wave.barrelEvents.forEach((event) => {
    const localT = (progress - event.start) / event.duration;
    if (localT > 0 && localT < 1) {
      const squeeze = Math.sin(localT * Math.PI) * event.squeeze;
      thickness *= 1 - squeeze;
    }
  });

  const upper = center - thickness * 0.5;
  const lower = center + thickness * 0.5;
  return { center, upper, lower, thickness };
}

function setState(next) {
  state = next;
  panel.classList.toggle("hidden", next === STATE.PLAYING);

  if (next === STATE.TITLE) {
    panelTitle.textContent = "Big Wave Pocket";
    panelBody.textContent = "Ride the pocket. Tap to pump. Stay inside the wave.";
    panelButton.textContent = "Start";
  }

  if (next === STATE.READY) {
    panelTitle.textContent = `Level ${level}`;
    panelBody.textContent = "Tap to drop in. Stay in the pocket to survive the ride.";
    panelButton.textContent = "Drop In";
  }

  if (next === STATE.WIPEOUT) {
    panelTitle.textContent = "Wipeout!";
    panelBody.textContent = "You fell out of the pocket. Tap to retry.";
    panelButton.textContent = "Retry";
  }

  if (next === STATE.LEVEL_COMPLETE) {
    panelTitle.textContent = "Wave Complete!";
    panelBody.textContent = "Shaka! Catching a bigger one...";
    panelButton.textContent = "Next";
  }
}

function updateScore(dt) {
  const pocket = pocketAt(player.x, wave.time);
  const distFromCenter = Math.abs(player.y - pocket.center);
  const sweetSpot = clamp(1 - distFromCenter / (pocket.thickness * 0.5), 0, 1);
  score += dt * (40 + sweetSpot * 30);
}

function updatePlayer(dt) {
  player.vy += wave.gravity * dt;

  if (didTap) {
    player.vy = wave.impulse;
  }

  const pocket = pocketAt(player.x, wave.time);
  player.vy += (pocket.center - player.y) * wave.suction * dt;
  player.vy = clamp(player.vy, -wave.maxVy, wave.maxVy);
  player.y += player.vy * dt;

  const margin = 4;
  if (player.y < pocket.upper + margin || player.y > pocket.lower - margin) {
    triggerWipeout();
  }
}

function triggerWipeout() {
  bestScore = Math.max(bestScore, Math.floor(score));
  localStorage.setItem(`${STORAGE_PREFIX}best`, String(bestScore));
  hudBest.textContent = formatScore(bestScore);
  setState(STATE.WIPEOUT);
}

function completeLevel() {
  bestScore = Math.max(bestScore, Math.floor(score));
  localStorage.setItem(`${STORAGE_PREFIX}best`, String(bestScore));
  hudBest.textContent = formatScore(bestScore);
  setState(STATE.LEVEL_COMPLETE);
}

function update(dt) {
  didTap = false;

  if (state === STATE.PLAYING) {
    wave.time += dt;
    updatePlayer(dt);
    updateScore(dt);

    if (wave.time >= wave.rideDuration) {
      completeLevel();
    }
  }
}

function drawBackground() {
  bctx.fillStyle = "#05070f";
  bctx.fillRect(0, 0, INTERNAL_W, INTERNAL_H);

  bctx.fillStyle = "#0c1533";
  bctx.fillRect(0, INTERNAL_H * 0.6, INTERNAL_W, INTERNAL_H * 0.4);

  bctx.fillStyle = "#1b2b5f";
  bctx.fillRect(0, INTERNAL_H * 0.2, INTERNAL_W, INTERNAL_H * 0.2);

  bctx.fillStyle = "#13204a";
  for (let i = 0; i < 6; i += 1) {
    const x = (i * 70 + wave.time * 20) % INTERNAL_W;
    bctx.fillRect(INTERNAL_W - x, INTERNAL_H * 0.12, 30, 18);
  }
}

function drawWave() {
  const points = [];
  const step = 8;
  for (let x = 0; x <= INTERNAL_W + step; x += step) {
    const pocket = pocketAt(x, wave.time);
    points.push({ x, upper: pocket.upper, lower: pocket.lower });
  }

  bctx.fillStyle = "#0b3c6f";
  bctx.beginPath();
  bctx.moveTo(0, INTERNAL_H);
  points.forEach((p) => bctx.lineTo(p.x, p.lower));
  bctx.lineTo(INTERNAL_W, INTERNAL_H);
  bctx.closePath();
  bctx.fill();

  bctx.fillStyle = "#0e5696";
  bctx.beginPath();
  bctx.moveTo(0, INTERNAL_H);
  points.forEach((p) => bctx.lineTo(p.x, p.upper));
  bctx.lineTo(INTERNAL_W, INTERNAL_H);
  bctx.closePath();
  bctx.fill();

  bctx.strokeStyle = "#6fe9ff";
  bctx.lineWidth = 2;
  bctx.beginPath();
  points.forEach((p, i) => {
    if (i === 0) {
      bctx.moveTo(p.x, p.upper + 4);
    } else {
      bctx.lineTo(p.x, p.upper + 4);
    }
  });
  bctx.stroke();

  bctx.strokeStyle = "#e3f9ff";
  bctx.lineWidth = 2;
  bctx.beginPath();
  points.forEach((p, i) => {
    const foamY = p.lower - 2;
    if (i === 0) {
      bctx.moveTo(p.x, foamY);
    } else {
      bctx.lineTo(p.x, foamY);
    }
  });
  bctx.stroke();
}

function drawPlayer() {
  bctx.fillStyle = "#fdd66a";
  bctx.fillRect(player.x - 3, player.y - 8, 8, 8);

  bctx.fillStyle = "#a03c00";
  bctx.fillRect(player.x - 2, player.y - 4, 6, 4);

  bctx.fillStyle = "#ffffff";
  bctx.fillRect(player.x - 6, player.y + 2, 12, 3);

  bctx.fillStyle = "#2c8ec8";
  bctx.fillRect(player.x - 1, player.y - 12, 2, 4);
}

function drawCelebration(t) {
  const progress = clamp(t / 1.8, 0, 1);
  const lift = Math.sin(progress * Math.PI) * 14;
  player.x = lerp(BASE_PLAYER_X, INTERNAL_W + 40, progress);
  player.y = INTERNAL_H * 0.45 - lift;
  drawPlayer();

  bctx.fillStyle = "#ffe06b";
  bctx.fillRect(player.x + 10, player.y - 18, 6, 4);
  bctx.fillRect(player.x + 14, player.y - 22, 4, 6);
}

function drawHUD() {
  hudLevel.textContent = level;
  hudScore.textContent = formatScore(score);
  hudBest.textContent = formatScore(bestScore);
}

function drawCRT() {
  if (!crtEnabled) {
    return;
  }
  bctx.fillStyle = "rgba(0, 0, 0, 0.15)";
  for (let y = 0; y < INTERNAL_H; y += 2) {
    bctx.fillRect(0, y, INTERNAL_W, 1);
  }

  const vignette = bctx.createRadialGradient(
    INTERNAL_W * 0.5,
    INTERNAL_H * 0.5,
    INTERNAL_W * 0.2,
    INTERNAL_W * 0.5,
    INTERNAL_H * 0.5,
    INTERNAL_W * 0.65
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.35)");
  bctx.fillStyle = vignette;
  bctx.fillRect(0, 0, INTERNAL_W, INTERNAL_H);
}

let levelCompleteTimer = 0;
function render(dt) {
  drawBackground();
  drawWave();

  if (state === STATE.LEVEL_COMPLETE) {
    levelCompleteTimer += dt;
    drawCelebration(levelCompleteTimer);
    if (levelCompleteTimer > 2.4) {
      level += 1;
      resetWave();
      score = 0;
      levelCompleteTimer = 0;
      setState(STATE.READY);
    }
  } else {
    drawPlayer();
  }

  if (state === STATE.READY) {
    bctx.fillStyle = "rgba(0,0,0,0.5)";
    bctx.fillRect(0, 0, INTERNAL_W, INTERNAL_H);
    bctx.fillStyle = "#78f0ff";
    bctx.fillRect(INTERNAL_W * 0.2, INTERNAL_H * 0.45, INTERNAL_W * 0.6, 24);
    bctx.fillStyle = "#091225";
    bctx.font = "10px 'Press Start 2P', sans-serif";
    bctx.fillText("TAP TO DROP IN", INTERNAL_W * 0.26, INTERNAL_H * 0.48 + 12);
  }

  drawCRT();

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(buffer, 0, 0, canvas.width, canvas.height);

  drawHUD();
}

function loop(timestamp) {
  const delta = (timestamp - lastTime) / 1000 || 0;
  lastTime = timestamp;
  const dt = clamp(delta, 0, 0.033);

  update(dt);
  render(dt);

  requestAnimationFrame(loop);
}

function handleTap() {
  if (state === STATE.TITLE) {
    resetWave();
    score = 0;
    setState(STATE.READY);
    return;
  }

  if (state === STATE.READY) {
    setState(STATE.PLAYING);
    return;
  }

  if (state === STATE.WIPEOUT) {
    resetWave();
    score = 0;
    setState(STATE.READY);
    return;
  }

  if (state === STATE.LEVEL_COMPLETE) {
    return;
  }

  if (state === STATE.PLAYING) {
    didTap = true;
  }
}

canvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  handleTap();
});

panelButton.addEventListener("click", () => {
  handleTap();
});

crtToggle.addEventListener("click", () => {
  crtEnabled = !crtEnabled;
  localStorage.setItem(`${STORAGE_PREFIX}crt`, crtEnabled ? "1" : "0");
  crtToggle.textContent = `CRT: ${crtEnabled ? "ON" : "OFF"}`;
});

crtToggle.textContent = `CRT: ${crtEnabled ? "ON" : "OFF"}`;
hudBest.textContent = formatScore(bestScore);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

resetWave();
setState(STATE.TITLE);
requestAnimationFrame(loop);

// Self-check:
// 1. Start a run: load page, click Start, then Tap to drop in.
// 2. Survive full ride: stay in pocket until level complete and next level begins.
// 3. Cause wipeout: exit pocket, then retry using tap or Retry button.
// 4. Toggle CRT, reload page, confirm the toggle persists.
