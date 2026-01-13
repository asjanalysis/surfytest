import { clamp, lerp, noise1, fmtInt } from "./util.js";

/**
 * Big Wave Pocket Surfer (MVP)
 * - One-button tap to pump upward
 * - Stay inside the moving wave pocket
 * - Survive ride duration -> celebration -> next level harder/longer
 * - Pixel vibe: low internal resolution + nearest-neighbor scaling
 */

const INTERNAL_W = 384;
const INTERNAL_H = 216;

const STATE = Object.freeze({
  TITLE: "TITLE",
  READY: "READY",
  PLAYING: "PLAYING",
  WIPEOUT: "WIPEOUT",
  LEVEL_COMPLETE: "LEVEL_COMPLETE",
});

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });

    // Offscreen "pixel" buffer
    this.buf = document.createElement("canvas");
    this.buf.width = INTERNAL_W;
    this.buf.height = INTERNAL_H;
    this.bctx = this.buf.getContext("2d", { alpha: false });

    // HUD elements
    this.elLevel = document.getElementById("hudLevel");
    this.elScore = document.getElementById("hudScore");
    this.elBest = document.getElementById("hudBest");
    this.elCrt = document.getElementById("hudCrt");

    this.centerPanel = document.getElementById("centerPanel");
    this.wipeoutPanel = document.getElementById("wipeoutPanel");
    this.levelPanel = document.getElementById("levelPanel");
    this.levelTitle = document.getElementById("levelTitle");

    this.btnStart = document.getElementById("btnStart");
    this.btnRetry = document.getElementById("btnRetry");
    this.btnCrt = document.getElementById("btnCrt");

    // Settings
    this.crtEnabled = (localStorage.getItem("bwp_crt") ?? "1") === "1";
    this.elCrt.textContent = this.crtEnabled ? "ON" : "OFF";

    // Persistent best score
    this.best = parseInt(localStorage.getItem("bwp_best") || "0", 10) || 0;
    this.elBest.textContent = fmtInt(this.best);

    // Input state
    this.didTap = false;

    // Timing
    this.lastTs = 0;

    // Game state
    this.state = STATE.TITLE;

    // Level & run state
    this.level = 1;
    this.score = 0;
    this.runTime = 0;

    // Player
    this.player = {
      x: Math.floor(INTERNAL_W * 0.28),
      y: Math.floor(INTERNAL_H * 0.55),
      vy: 0,
      radius: 6,
      wobble: 0,
      celebrating: false,
      dead: false,
    };

    // Wave params (set per level)
    this.wave = this.makeLevel(this.level);

    // Bind events
    window.addEventListener("resize", () => this.resize());
    this.resize();

    // Pointer/touch: tap anywhere to pump
    const tapHandler = (e) => {
      e.preventDefault();
      this.didTap = true;

      // If on title/wipeout, treat tap as start/retry
      if (this.state === STATE.TITLE) this.startRun();
      else if (this.state === STATE.WIPEOUT) this.startRun();
    };

    // Use pointer events (works for mouse + touch)
    canvas.addEventListener("pointerdown", tapHandler, { passive: false });

    // Buttons
    this.btnStart.addEventListener("click", () => this.startRun());
    this.btnRetry.addEventListener("click", () => this.startRun());
    this.btnCrt.addEventListener("click", () => this.toggleCrt());

    // Begin loop
    requestAnimationFrame((ts) => this.loop(ts));
  }

  toggleCrt() {
    this.crtEnabled = !this.crtEnabled;
    localStorage.setItem("bwp_crt", this.crtEnabled ? "1" : "0");
    this.elCrt.textContent = this.crtEnabled ? "ON" : "OFF";
  }

  resize() {
    // Fit the canvas to the window, then draw the pixel buffer scaled by an integer factor.
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    const w = Math.floor(window.innerWidth);
    const h = Math.floor(window.innerHeight);

    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Render scaling: integer scale in CSS pixels, then map to device pixels
    const scaleX = Math.floor(w / INTERNAL_W);
    const scaleY = Math.floor(h / INTERNAL_H);
    this.intScale = Math.max(1, Math.min(scaleX, scaleY));

    this.viewW = INTERNAL_W * this.intScale;
    this.viewH = INTERNAL_H * this.intScale;

    this.offsetX = Math.floor((w - this.viewW) / 2);
    this.offsetY = Math.floor((h - this.viewH) / 2);

    // Device-pixel transforms
    this.dpr = dpr;
  }

  makeLevel(n) {
    // Difficulty scaling: bigger amplitude, faster scroll, longer ride, narrower pocket.
    const baseAmp = 18;
    const baseSpeed = 36; // pixels/sec (affects wave phase)
    const basePocket = 54;

    const amp = baseAmp + (n - 1) * 4.2;
    const speed = baseSpeed + (n - 1) * 5.5;
    const pocket = Math.max(26, basePocket - (n - 1) * 2.2);

    const rideDuration = 10 + (n - 1) * 2.2; // seconds
    const chop = Math.min(1.0, 0.18 + (n - 1) * 0.03);

    // Barrel moments: occasional squeeze
    const barrelChance = Math.min(0.35, 0.10 + (n - 1) * 0.02);

    return {
      amp,
      speed,
      pocket,
      rideDuration,
      chop,
      barrelChance,
      seed: 1337 + n * 97,

      // dynamic barrel event
      barrelTimer: 0,
      barrelActive: false,
      barrelCooldown: 0,
    };
  }

  showPanels() {
    // HUD panels
    this.centerPanel.classList.toggle("hidden", !(this.state === STATE.TITLE));
    this.wipeoutPanel.classList.toggle("hidden", !(this.state === STATE.WIPEOUT));
    this.levelPanel.classList.toggle("hidden", !(this.state === STATE.LEVEL_COMPLETE));
  }

  startRun() {
    this.state = STATE.READY;

    this.score = 0;
    this.runTime = 0;

    this.player.y = Math.floor(INTERNAL_H * 0.52);
    this.player.vy = 0;
    this.player.dead = false;
    this.player.celebrating = false;
    this.player.wobble = 0;

    // Reset wave event state
    this.wave.barrelTimer = 0;
    this.wave.barrelActive = false;
    this.wave.barrelCooldown = 1.2;

    // Small delay then go
    this.readyTimer = 0.25;

    this.showPanels();
  }

  completeLevel() {
    this.state = STATE.LEVEL_COMPLETE;
    this.player.celebrating = true;

    this.levelTitle.textContent = `Wave ${this.level} Cleared!`;
    this.showPanels();

    // Brief intermission then next level
    this.levelCompleteTimer = 1.0;
  }

  wipeout() {
    this.state = STATE.WIPEOUT;
    this.player.dead = true;
    this.showPanels();

    // Best score update
    if (this.score > this.best) {
      this.best = Math.floor(this.score);
      localStorage.setItem("bwp_best", String(this.best));
      this.elBest.textContent = fmtInt(this.best);
    }
  }

  pump() {
    // Pump impulse (Flappy-ish)
    // If player is already moving up fast, don't overboost as harshly.
    const impulse = -210;
    this.player.vy = impulse;
    this.player.wobble = 1.0;

    // Start playing on first pump from READY
    if (this.state === STATE.READY) {
      this.state = STATE.PLAYING;
      this.showPanels();
    }
  }

  waveCenterAt(x, t) {
    // Create a traveling wave centerline. x in pixels, t in seconds.
    // Combine a sinusoid + smooth value noise for chop.
    const spatial = 0.018; // how fast wave varies across x
    const temporal = this.wave.speed * 0.02; // speed -> phase progression
    const phase = t * temporal + x * spatial;

    const sinA = Math.sin(phase * 2.0);
    const sinB = Math.sin(phase * 1.1 + 1.7);

    const base = INTERNAL_H * 0.55;
    const amp = this.wave.amp;

    // Chop: small noise varying with time and x
    const chopN = (noise1(phase * 2.2 + t * 0.7, this.wave.seed) - 0.5) * 2;
    const chop = chopN * amp * this.wave.chop;

    return base + (sinA * 0.65 + sinB * 0.35) * amp + chop;
  }

  pocketThicknessAt(t) {
    // Base pocket thickness with optional barrel squeeze events.
    let thick = this.wave.pocket;

    // Trigger barrel events occasionally (tight section)
    this.wave.barrelCooldown = Math.max(0, this.wave.barrelCooldown - this.dt);
    if (!this.wave.barrelActive && this.wave.barrelCooldown <= 0) {
      const roll = noise1(t * 1.7, this.wave.seed + 999);
      if (roll < this.wave.barrelChance) {
        this.wave.barrelActive = true;
        this.wave.barrelTimer = 0.9 + noise1(t * 2.3, this.wave.seed + 555) * 0.6;
      } else {
        this.wave.barrelCooldown = 1.0; // try again later
      }
    }

    if (this.wave.barrelActive) {
      this.wave.barrelTimer -= this.dt;
      // Squeeze pocket substantially
      thick *= 0.62;
      if (this.wave.barrelTimer <= 0) {
        this.wave.barrelActive = false;
        this.wave.barrelCooldown = 1.25;
      }
    }

    return thick;
  }

  update(dt) {
    this.dt = dt;

    // Input
    if (this.didTap) {
      this.didTap = false;
      this.pump();
    }

    // Update timers/state transitions
    if (this.state === STATE.READY) {
      this.readyTimer -= dt;
      // Let player hover slightly even before first pump
    }

    if (this.state === STATE.LEVEL_COMPLETE) {
      this.levelCompleteTimer -= dt;
      if (this.levelCompleteTimer <= 0) {
        this.level += 1;
        this.wave = this.makeLevel(this.level);
        this.elLevel.textContent = fmtInt(this.level);

        // Autostart next wave
        this.state = STATE.READY;
        this.player.celebrating = false;

        this.score = 0;
        this.runTime = 0;
        this.player.y = Math.floor(INTERNAL_H * 0.52);
        this.player.vy = 0;
        this.readyTimer = 0.25;

        this.levelPanel.classList.add("hidden");
      }
      return;
    }

    if (this.state !== STATE.PLAYING && this.state !== STATE.READY) {
      return;
    }

    // Run timer only once playing
    if (this.state === STATE.PLAYING) {
      this.runTime += dt;

      // Win condition
      if (this.runTime >= this.wave.rideDuration) {
        this.completeLevel();
        return;
      }
    }

    // Physics
    const gravity = 520;        // px/s^2
    const suction = 1.25;       // pull toward pocket center
    const maxVy = 520;

    // Compute current wave pocket at player x
    const t = this.runTime;
    const center = this.waveCenterAt(this.player.x, t);
    const thickness = this.pocketThicknessAt(t);

    // Wave “lift” / suction toward center (keeps it surf-y and less purely “falling”)
    const toCenter = center - this.player.y;

    this.player.vy += gravity * dt;
    this.player.vy = clamp(this.player.vy, -maxVy, maxVy);

    // Apply suction as a velocity adjustment (stable and responsive)
    this.player.vy += toCenter * suction * dt * 24;

    this.player.y += this.player.vy * dt;

    // Wobble decay
    this.player.wobble = Math.max(0, this.player.wobble - dt * 2.8);

    // Boundaries (lip and whitewater)
    const margin = 6;
    const upper = center - thickness * 0.5;
    const lower = center + thickness * 0.5;

    // Collision only once playing (READY is forgiving)
    if (this.state === STATE.PLAYING) {
      if (this.player.y < upper + margin || this.player.y > lower - margin) {
        this.wipeout();
        return;
      }

      // Scoring: time/distance + sweet spot bonus
      const distanceScore = dt * 100; // 100 pts per second survived
      const sweet = 1 - clamp(Math.abs(this.player.y - center) / (thickness * 0.5), 0, 1);
      const sweetBonus = dt * 60 * sweet * sweet;

      this.score += distanceScore + sweetBonus;
      this.elScore.textContent = fmtInt(this.score);
    }

    // Update HUD
    this.elLevel.textContent = fmtInt(this.level);
  }

  drawBackground(ctx) {
    // Simple pixel sky gradient bands
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, INTERNAL_W, INTERNAL_H);

    // Horizon band
    ctx.fillStyle = "#0f1b33";
    ctx.fillRect(0, 0, INTERNAL_W, Math.floor(INTERNAL_H * 0.52));

    // Sun / glow
    const sunX = Math.floor(INTERNAL_W * 0.78);
    const sunY = Math.floor(INTERNAL_H * 0.22);
    ctx.fillStyle = "#1c2b4e";
    ctx.fillRect(sunX - 18, sunY - 10, 36, 20);
    ctx.fillStyle = "#2b4a86";
    ctx.fillRect(sunX - 10, sunY - 6, 20, 12);

    // Distant cliffs (parallax-like)
    ctx.fillStyle = "#0a1630";
    for (let i = 0; i < 6; i++) {
      const x = (i * 70 + Math.floor(this.runTime * 12)) % (INTERNAL_W + 80) - 40;
      const y = Math.floor(INTERNAL_H * 0.48) + (i % 2) * 3;
      ctx.fillRect(x, y, 34, 10);
      ctx.fillRect(x + 6, y - 6, 18, 6);
    }
  }

  drawWave(ctx) {
    const t = this.runTime;
    const thickness = this.pocketThicknessAt(t);

    // Sample the wave curves across X
    const step = 6; // sampling step in pixels (pixel-art vibe)
    const upperPts = [];
    const lowerPts = [];

    for (let x = 0; x <= INTERNAL_W; x += step) {
      const c = this.waveCenterAt(x, t);
      const u = c - thickness * 0.5;
      const l = c + thickness * 0.5;

      upperPts.push([x, u]);
      lowerPts.push([x, l]);
    }

    // Face fill polygon
    ctx.fillStyle = "#0c3a57";
    ctx.beginPath();
    ctx.moveTo(upperPts[0][0], upperPts[0][1]);
    for (let i = 1; i < upperPts.length; i++) ctx.lineTo(upperPts[i][0], upperPts[i][1]);
    for (let i = lowerPts.length - 1; i >= 0; i--) ctx.lineTo(lowerPts[i][0], lowerPts[i][1]);
    ctx.closePath();
    ctx.fill();

    // Mid-tone band (dither-ish)
    ctx.fillStyle = "#0e5672";
    for (let x = 0; x <= INTERNAL_W; x += step) {
      const c = this.waveCenterAt(x, t);
      const bandY = c - thickness * 0.15;
      ctx.fillRect(x, Math.floor(bandY), step, 2);
    }

    // Highlight band near lip
    ctx.fillStyle = "#2aa6b6";
    for (let x = 0; x <= INTERNAL_W; x += step) {
      const c = this.waveCenterAt(x, t);
      const u = c - thickness * 0.5;
      if ((x / step) % 2 === 0) ctx.fillRect(x, Math.floor(u + 2), step, 1);
    }

    // Whitewater foam near lower boundary
    ctx.fillStyle = "#b8f3ff";
    for (let x = 0; x <= INTERNAL_W; x += step) {
      const c = this.waveCenterAt(x, t);
      const l = c + thickness * 0.5;
      const jitter = (noise1(x * 0.05 + t * 2.6, this.wave.seed + 200) - 0.5) * 6;
      ctx.fillRect(x, Math.floor(l - 2 + jitter * 0.2), step, 2);
    }
  }

  drawSurfer(ctx) {
    const p = this.player;

    // Celebration/autopilot (moves off screen)
    if (this.state === STATE.LEVEL_COMPLETE) {
      p.vy = lerp(p.vy, -120, 0.08);
      p.y += p.vy * this.dt;
      p.x += 80 * this.dt;
    } else {
      // Keep surfer x fixed during play
      p.x = Math.floor(INTERNAL_W * 0.28);
    }

    // Tiny pixel surfer placeholder: board + torso + head
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);

    // Spray particles (simple)
    if (this.state === STATE.PLAYING) {
      ctx.fillStyle = "#b8f3ff";
      for (let i = 0; i < 3; i++) {
        const px = x - 10 - i * 3;
        const py = y + 6 + (i % 2);
        ctx.fillRect(px, py, 1, 1);
      }
    }

    // Wipeout effect
    if (this.state === STATE.WIPEOUT) {
      // tumble blocks
      ctx.fillStyle = "#b8f3ff";
      ctx.fillRect(x - 4, y - 2, 8, 4);
      ctx.fillStyle = "#ff4d7d";
      ctx.fillRect(x - 2, y + 2, 4, 2);
      ctx.fillStyle = "#0b1220";
      ctx.fillRect(x - 1, y - 1, 2, 2);
      return;
    }

    // Board
    ctx.fillStyle = "#ff4d7d";
    ctx.fillRect(x - 10, y + 6, 18, 3);
    ctx.fillStyle = "#ff87a6";
    ctx.fillRect(x - 6, y + 7, 10, 1);

    // Body
    const wob = p.wobble;
    const bodyY = y + Math.floor(lerp(0, -2, wob));
    ctx.fillStyle = "#ffd3a6"; // skin-ish
    ctx.fillRect(x - 2, bodyY - 6, 4, 4); // head
    ctx.fillStyle = "#42d7ff";
    ctx.fillRect(x - 3, bodyY - 2, 6, 5); // torso
    ctx.fillStyle = "#1c2b4e";
    ctx.fillRect(x - 4, bodyY + 2, 8, 2); // legs

    // Shaka indicator while celebrating
    if (this.state === STATE.LEVEL_COMPLETE) {
      ctx.fillStyle = "#b8f3ff";
      ctx.fillRect(x + 6, bodyY - 6, 8, 2);
      ctx.fillRect(x + 11, bodyY - 8, 2, 6);
    }
  }

  drawCrtOverlay(ctx) {
    if (!this.crtEnabled) return;

    // Scanlines
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    for (let y = 0; y < INTERNAL_H; y += 2) {
      ctx.fillRect(0, y, INTERNAL_W, 1);
    }

    // Subtle vignette
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(0, 0, INTERNAL_W, 10);
    ctx.fillRect(0, INTERNAL_H - 10, INTERNAL_W, 10);
    ctx.fillRect(0, 0, 10, INTERNAL_H);
    ctx.fillRect(INTERNAL_W - 10, 0, 10, INTERNAL_H);
  }

  render() {
    const ctx = this.bctx;

    // Pixel buffer draw
    ctx.imageSmoothingEnabled = false;

    this.drawBackground(ctx);
    this.drawWave(ctx);
    this.drawSurfer(ctx);
    this.drawCrtOverlay(ctx);

    // Copy buffer -> screen with integer scaling and letterboxing
    const sctx = this.ctx;
    sctx.imageSmoothingEnabled = false;

    // Clear full canvas
    sctx.fillStyle = "#000";
    sctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Compute destination rect in device pixels
    const dx = this.offsetX * this.dpr;
    const dy = this.offsetY * this.dpr;
    const dw = this.viewW * this.dpr;
    const dh = this.viewH * this.dpr;

    sctx.drawImage(this.buf, dx, dy, dw, dh);
  }

  loop(ts) {
    const t = ts / 1000;
    const dt = this.lastTs ? Math.min(0.033, t - this.lastTs) : 0;
    this.lastTs = t;

    // State-driven panels
    this.showPanels();

    // Update
    if (dt > 0) this.update(dt);

    // Update HUD text while not playing
    if (this.state !== STATE.PLAYING) {
      this.elScore.textContent = fmtInt(this.score);
      this.elLevel.textContent = fmtInt(this.level);
    }

    // Render
    this.render();

    // Title/ready text tweaks
    if (this.state === STATE.TITLE) {
      // keep panels visible
    } else if (this.state === STATE.READY) {
      // hide title panel once run starts
      this.centerPanel.classList.add("hidden");
    }

    requestAnimationFrame((n) => this.loop(n));
  }
}

// Boot
const canvas = document.getElementById("screen");
const game = new Game(canvas);

// Initial UI setup
document.getElementById("hudLevel").textContent = "1";
document.getElementById("hudScore").textContent = "0";
