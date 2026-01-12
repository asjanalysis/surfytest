(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const levelLabel = document.getElementById("level");
  const scoreLabel = document.getElementById("score");
  const statusLabel = document.getElementById("status");
  const restartButton = document.getElementById("restart");
  const muteButton = document.getElementById("mute");

  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const PLAYER_X = WIDTH * 0.28;
  const GRAVITY = 0.28;
  const TAP_IMPULSE = -3.4;
  const WAVE_SUCTION = 0.08;
  const SWEET_SPOT_RANGE = 10;
  const MARGIN = 6;

  const state = {
    mode: "TITLE",
    levelIndex: 0,
    time: 0,
    levelTime: 0,
    score: 0,
    sweetTimer: 0,
    muted: false
  };

  const player = {
    y: HEIGHT * 0.5,
    vy: 0,
    wobble: 0,
    pose: 0
  };

  const levels = [
    {
      name: "Sunrise Peel",
      duration: 12,
      amplitude: 32,
      pocket: 48,
      scroll: 1.1,
      chop: 3.5,
      barrelChance: 0.2,
      barrelStrength: 0.55
    },
    {
      name: "Glass Reef",
      duration: 16,
      amplitude: 38,
      pocket: 42,
      scroll: 1.25,
      chop: 4.5,
      barrelChance: 0.25,
      barrelStrength: 0.6
    },
    {
      name: "Thunder Bowl",
      duration: 22,
      amplitude: 46,
      pocket: 36,
      scroll: 1.4,
      chop: 5.2,
      barrelChance: 0.32,
      barrelStrength: 0.68
    }
  ];

  const events = {
    barrelTimer: 0,
    chopBurst: 0
  };

  function currentLevel() {
    return levels[Math.min(state.levelIndex, levels.length - 1)];
  }

  function resetPlayer() {
    player.y = HEIGHT * 0.5;
    player.vy = 0;
    player.pose = 0;
  }

  function startLevel() {
    const level = currentLevel();
    state.levelTime = 0;
    state.mode = "READY";
    state.time = 0;
    events.barrelTimer = 0;
    events.chopBurst = 0;
    resetPlayer();
    updateHud(level);
  }

  function updateHud(level) {
    levelLabel.textContent = `Wave ${state.levelIndex + 1}: ${level.name}`;
    scoreLabel.textContent = `${Math.floor(state.score)}`;
  }

  function waveCenter(t, x, level) {
    const scroll = t * level.scroll;
    const baseY = HEIGHT * 0.55;
    const phase = (scroll + x * 0.02) * 0.6;
    const chop = Math.sin((scroll + x * 0.03) * 1.4) * level.chop;
    return baseY + Math.sin(phase) * level.amplitude + chop;
  }

  function pocketOffsets(t, level) {
    const barrel = events.barrelTimer > 0 ? level.barrelStrength : 0;
    const pocket = level.pocket - barrel * 18;
    const sway = Math.sin(t * 1.2) * 2.5;
    return {
      top: pocket * 0.45 - sway,
      bottom: pocket * 0.55 + sway
    };
  }

  function waveBounds(t, x, level) {
    const center = waveCenter(t, x, level);
    const offsets = pocketOffsets(t, level);
    return {
      center,
      upper: center - offsets.top,
      lower: center + offsets.bottom
    };
  }

  function update(dt) {
    const level = currentLevel();
    state.time += dt;

    if (state.mode === "READY") {
      player.wobble = Math.sin(state.time * 2) * 0.4;
      return;
    }

    if (state.mode === "PLAYING") {
      state.levelTime += dt;
      const bounds = waveBounds(state.time, PLAYER_X, level);
      const centerPull = (bounds.center - player.y) * WAVE_SUCTION;
      player.vy += GRAVITY + centerPull;
      player.y += player.vy;
      player.wobble = player.vy * 0.2;

      if (Math.abs(player.y - bounds.center) < SWEET_SPOT_RANGE) {
        state.sweetTimer += dt;
        state.score += 3 * dt;
      } else {
        state.sweetTimer = 0;
      }

      state.score += 6 * dt;

      if (player.y < bounds.upper + MARGIN || player.y > bounds.lower - MARGIN) {
        state.mode = "WIPEOUT";
        statusLabel.textContent = "Wipeout! Tap to retry.";
      }

      if (state.levelTime >= level.duration) {
        state.mode = "LEVEL_COMPLETE";
        statusLabel.textContent = "Shaka! Next wave incoming.";
      }

      if (events.barrelTimer <= 0 && Math.random() < level.barrelChance * dt * 0.5) {
        events.barrelTimer = util.randRange(1.3, 2.4);
      }
      if (events.chopBurst <= 0 && Math.random() < 0.4 * dt) {
        events.chopBurst = util.randRange(0.6, 1.2);
      }

      events.barrelTimer = Math.max(0, events.barrelTimer - dt);
      events.chopBurst = Math.max(0, events.chopBurst - dt);

      updateHud(level);
    }

    if (state.mode === "WIPEOUT") {
      player.vy += GRAVITY * 1.6;
      player.y += player.vy;
      player.wobble = Math.sin(state.time * 3) * 2.2;
    }

    if (state.mode === "LEVEL_COMPLETE") {
      player.y = util.lerp(player.y, HEIGHT * 0.35, 0.03);
      player.wobble = Math.sin(state.time * 2) * 0.6;
      if (state.time > 1.8) {
        state.levelIndex += 1;
        startLevel();
        statusLabel.textContent = "Tap to drop in";
      }
    }
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    gradient.addColorStop(0, "#6bd0ff");
    gradient.addColorStop(0.45, "#f5d47b");
    gradient.addColorStop(0.7, "#5aa0d8");
    gradient.addColorStop(1, "#0a3e7a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = "rgba(255,255,255,0.5)";
    for (let i = 0; i < 24; i += 1) {
      const x = (i * 18 + state.time * 12) % WIDTH;
      ctx.fillRect(x, 26 + Math.sin(i * 0.8) * 3, 10, 2);
    }
  }

  function drawWave() {
    const level = currentLevel();
    const step = 8;
    ctx.beginPath();
    for (let x = 0; x <= WIDTH + step; x += step) {
      const { upper } = waveBounds(state.time, x, level);
      ctx.lineTo(x, upper);
    }
    ctx.lineTo(WIDTH + step, HEIGHT + step);
    ctx.lineTo(0, HEIGHT + step);
    ctx.closePath();
    ctx.fillStyle = "#0f6cb8";
    ctx.fill();

    ctx.beginPath();
    for (let x = 0; x <= WIDTH + step; x += step) {
      const { lower } = waveBounds(state.time, x, level);
      ctx.lineTo(x, lower);
    }
    ctx.lineTo(WIDTH + step, HEIGHT + step);
    ctx.lineTo(0, HEIGHT + step);
    ctx.closePath();
    ctx.fillStyle = "rgba(9, 40, 90, 0.55)";
    ctx.fill();

    ctx.beginPath();
    for (let x = 0; x <= WIDTH + step; x += step) {
      const { lower } = waveBounds(state.time, x, level);
      const foam = lower + 4 + Math.sin((state.time * 3 + x) * 0.2) * 2;
      ctx.lineTo(x, foam);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.65)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    for (let x = 0; x <= WIDTH + step; x += step) {
      const { upper } = waveBounds(state.time, x, level);
      ctx.lineTo(x, upper + 6);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 4;
    ctx.stroke();

    if (events.barrelTimer > 0) {
      ctx.fillStyle = "rgba(10, 28, 56, 0.35)";
      ctx.fillRect(WIDTH * 0.5, HEIGHT * 0.12, WIDTH * 0.5, HEIGHT * 0.35);
    }
  }

  function drawPlayer() {
    ctx.save();
    ctx.translate(PLAYER_X, player.y);
    ctx.rotate(player.wobble * 0.02);

    ctx.fillStyle = "#ffcf4a";
    ctx.fillRect(-12, 6, 24, 6);

    ctx.fillStyle = "#f9b54e";
    ctx.fillRect(-5, -12, 10, 12);

    ctx.fillStyle = "#f4d9b3";
    ctx.fillRect(-2, -18, 6, 6);

    ctx.fillStyle = "#0a2d4d";
    ctx.fillRect(6, -10, 4, 6);
    ctx.fillRect(-10, -10, 4, 6);

    ctx.restore();

    if (state.mode === "WIPEOUT") {
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.beginPath();
      ctx.arc(PLAYER_X + 18, player.y + 8, 10, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawOverlay() {
    if (state.mode === "TITLE") {
      ctx.fillStyle = "rgba(4, 16, 30, 0.5)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = "#ffffff";
      ctx.font = "16px sans-serif";
      ctx.fillText("BIG WAVE POCKET", 120, 96);
      ctx.font = "10px sans-serif";
      ctx.fillText("Tap to drop in", 150, 116);
    }
  }

  function render() {
    drawBackground();
    drawWave();
    drawPlayer();
    drawOverlay();
  }

  function loop(timestamp) {
    if (!state.lastTime) state.lastTime = timestamp;
    const dt = Math.min(0.032, (timestamp - state.lastTime) / 1000);
    state.lastTime = timestamp;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function handleTap() {
    if (state.mode === "TITLE") {
      state.mode = "READY";
      statusLabel.textContent = "Tap to drop in";
      return;
    }
    if (state.mode === "READY") {
      state.mode = "PLAYING";
      statusLabel.textContent = "Hold the pocket";
    }
    if (state.mode === "PLAYING") {
      player.vy = TAP_IMPULSE;
      player.pose = (player.pose + 1) % 3;
      state.score += 2;
    }
    if (state.mode === "WIPEOUT") {
      state.score = 0;
      state.levelIndex = 0;
      startLevel();
      statusLabel.textContent = "Tap to drop in";
    }
  }

  function handleRestart() {
    state.score = 0;
    state.levelIndex = 0;
    startLevel();
    statusLabel.textContent = "Tap to drop in";
  }

  restartButton.addEventListener("click", handleRestart);
  muteButton.addEventListener("click", () => {
    state.muted = !state.muted;
    muteButton.textContent = state.muted ? "Unmute" : "Mute";
  });

  window.addEventListener("keydown", (event) => {
    if (event.code === "Space") {
      handleTap();
    }
  });

  canvas.addEventListener("pointerdown", handleTap);

  startLevel();
  requestAnimationFrame(loop);
})();
