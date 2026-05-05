/* Flappy Bower — neon flappy clone. Tap to flap, dodge gates. */
import sdk from "./hackcade-sdk.js";

const cv = document.getElementById("game");
const ctx = cv.getContext("2d");
const hudScore = document.getElementById("hud-score");
const hudBest = document.getElementById("hud-best");
const muteBtn = document.getElementById("mute");
const muteOn = document.getElementById("mute-on");
const muteOff = document.getElementById("mute-off");
const overlay = document.getElementById("overlay");
const endScreen = document.getElementById("end");
const endTitle = document.getElementById("end-title");
const endScore = document.getElementById("end-score");
const endBest = document.getElementById("end-best");
const endTime = document.getElementById("end-time");
const endBadge = document.getElementById("end-badge");
const startBtn = document.getElementById("start");
const retryBtn = document.getElementById("retry");
const flash = document.getElementById("flash");
const ready = document.getElementById("ready");
const readyCount = document.getElementById("ready-count");

const BEST_KEY = "flappy-bower:best";
const MUTE_KEY = "flappy-bower:muted";

const GRAVITY = 1500;
const FLAP_V = -440;
const PIPE_W = 70;
const BASE_GAP = 180;
const MIN_GAP = 130;
const BASE_SPEED = 180;
const SPAWN_INTERVAL = 1.5;

let W = 0, H = 0, dpr = 1;
let bird, pipes, particles, stars, score, best, alive, started, t0, last, spawn, speed, gap, shake;

best = parseInt(localStorage.getItem(BEST_KEY) || "0", 10) || 0;
hudBest.textContent = best;

let muted = localStorage.getItem(MUTE_KEY) === "1";
applyMuteUI();

muteBtn.addEventListener("click", () => {
  muted = !muted;
  localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  applyMuteUI();
});

function applyMuteUI() {
  muteBtn.setAttribute("aria-pressed", String(muted));
  muteOn.style.display = muted ? "none" : "";
  muteOff.style.display = muted ? "" : "none";
}

/* ---------- Web Audio SFX ---------- */
let actx = null;
function audio() {
  if (muted) return null;
  if (!actx) {
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { return null; }
  }
  if (actx.state === "suspended") actx.resume();
  return actx;
}
function blip(freq, dur = 0.08, type = "square", vol = 0.18, slide = 0) {
  const a = audio(); if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), a.currentTime + dur);
  g.gain.setValueAtTime(vol, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  o.connect(g); g.connect(a.destination);
  o.start(); o.stop(a.currentTime + dur);
}
const sfx = {
  flap: () => blip(520, 0.07, "square", 0.12, 180),
  point: () => { blip(880, 0.06, "triangle", 0.18); setTimeout(() => blip(1320, 0.08, "triangle", 0.16), 50); },
  hit: () => { blip(180, 0.18, "sawtooth", 0.25, -120); setTimeout(() => blip(90, 0.25, "sawtooth", 0.22, -50), 80); },
  gameover: () => {
    const seq = [[440, 0.12], [330, 0.12], [220, 0.18], [165, 0.28]];
    let t = 0;
    for (const [f, d] of seq) {
      setTimeout(() => blip(f, d, "triangle", 0.22), t * 1000);
      t += d * 0.85;
    }
  },
};

/* ---------- Sizing ---------- */
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  cv.style.width = W + "px";
  cv.style.height = H + "px";
  cv.width = W * dpr; cv.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!stars) seedStars();
}
window.addEventListener("resize", resize);

function seedStars() {
  stars = [];
  const n = 80;
  for (let i = 0; i < n; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.4 + 0.3,
      s: Math.random() * 30 + 10,
      tw: Math.random() * Math.PI * 2,
    });
  }
}

/* ---------- Game state ---------- */
function reset() {
  resize();
  bird = { x: W * 0.28, y: H * 0.5, v: 0, r: 14, rot: 0 };
  pipes = [];
  particles = [];
  score = 0;
  spawn = 0.6;
  speed = BASE_SPEED;
  gap = BASE_GAP;
  alive = true;
  shake = 0;
  hudScore.textContent = "0";
  t0 = performance.now();
  last = t0;
}

function flap() {
  if (!started || !alive) return;
  bird.v = FLAP_V;
  sfx.flap();
}

window.addEventListener("pointerdown", (e) => {
  if (e.target && e.target.closest && e.target.closest("button")) return;
  flap();
});
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp") {
    e.preventDefault();
    flap();
  }
});

/* ---------- Loop ---------- */
function loop(ts) {
  if (!started) return;
  const dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  if (alive) update(dt);
  draw(dt);
  requestAnimationFrame(loop);
}

function update(dt) {
  bird.v += GRAVITY * dt;
  bird.y += bird.v * dt;
  bird.rot = Math.max(-0.5, Math.min(1.4, bird.v / 600));

  spawn -= dt;
  if (spawn <= 0) {
    spawn = SPAWN_INTERVAL * (1 - Math.min(0.35, score * 0.02));
    const margin = 70;
    const g = Math.max(MIN_GAP, gap - score * 1.5);
    const gapY = margin + Math.random() * Math.max(60, H - g - margin * 2);
    pipes.push({ x: W + 20, gapY, gap: g, passed: false });
  }

  speed = BASE_SPEED + Math.min(160, score * 6);

  for (const p of pipes) {
    p.x -= speed * dt;
    if (!p.passed && p.x + PIPE_W < bird.x) {
      p.passed = true;
      score++;
      hudScore.textContent = score;
      sdk.updateScore(score);
      sfx.point();
      spawnSpark(p.x + PIPE_W / 2, p.gapY + p.gap / 2, "#5ef0ff", 14);
    }
    if (
      bird.x + bird.r > p.x &&
      bird.x - bird.r < p.x + PIPE_W &&
      (bird.y - bird.r < p.gapY || bird.y + bird.r > p.gapY + p.gap)
    ) {
      die();
    }
  }
  pipes = pipes.filter((p) => p.x + PIPE_W > -10);

  if (bird.y + bird.r > H || bird.y - bird.r < 0) die();

  for (const s of stars) {
    s.x -= s.s * dt * 0.4;
    if (s.x < -2) { s.x = W + 2; s.y = Math.random() * H; }
    s.tw += dt * 4;
  }

  for (const pt of particles) {
    pt.vy += 600 * dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);

  if (shake > 0) shake = Math.max(0, shake - dt * 4);
}

function spawnSpark(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 80 + Math.random() * 180;
    particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 40,
      life: 0.5 + Math.random() * 0.4,
      color,
      size: 2 + Math.random() * 2,
    });
  }
}

/* ---------- Draw ---------- */
function draw() {
  ctx.save();
  if (shake > 0) {
    const sx = (Math.random() - 0.5) * shake * 14;
    const sy = (Math.random() - 0.5) * shake * 14;
    ctx.translate(sx, sy);
  }

  // background gradient
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#1a0a3a");
  g.addColorStop(0.6, "#06061a");
  g.addColorStop(1, "#000");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // stars
  for (const s of stars) {
    const tw = (Math.sin(s.tw) + 1) * 0.5;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.25 + tw * 0.55})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // ground glow line
  ctx.strokeStyle = "rgba(94, 240, 255, 0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, H - 1);
  ctx.lineTo(W, H - 1);
  ctx.stroke();

  // pipes (neon gates)
  for (const p of pipes) {
    drawPipe(p.x, 0, PIPE_W, p.gapY, "top");
    drawPipe(p.x, p.gapY + p.gap, PIPE_W, H - (p.gapY + p.gap), "bot");
  }

  // particles
  for (const pt of particles) {
    const a = Math.max(0, Math.min(1, pt.life));
    ctx.fillStyle = pt.color;
    ctx.globalAlpha = a;
    ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;

  // bird
  drawBird(bird.x, bird.y, bird.r, bird.rot);

  ctx.restore();
}

function drawPipe(x, y, w, h, dir) {
  if (h <= 0) return;
  const grad = ctx.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, "rgba(255, 74, 216, 0.85)");
  grad.addColorStop(0.5, "rgba(182, 255, 94, 0.95)");
  grad.addColorStop(1, "rgba(255, 74, 216, 0.85)");
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  // edges
  ctx.strokeStyle = "rgba(94, 240, 255, 0.9)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  // cap
  const capH = 14;
  const capY = dir === "top" ? y + h - capH : y;
  const capX = x - 4;
  const capW = w + 8;
  const capG = ctx.createLinearGradient(0, capY, 0, capY + capH);
  capG.addColorStop(0, "#ff4ad8");
  capG.addColorStop(1, "#5ef0ff");
  ctx.fillStyle = capG;
  ctx.fillRect(capX, capY, capW, capH);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
  ctx.strokeRect(capX + 0.5, capY + 0.5, capW - 1, capH - 1);

  // glow inset line
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 6, y + 4);
  ctx.lineTo(x + 6, y + h - 4);
  ctx.stroke();
}

function drawBird(x, y, r, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);

  // glow
  ctx.shadowColor = "rgba(255, 230, 109, 0.9)";
  ctx.shadowBlur = 16;

  // body
  ctx.fillStyle = "#ffe66d";
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  // body outline
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#ff4ad8";
  ctx.lineWidth = 2;
  ctx.stroke();

  // wing
  ctx.fillStyle = "#ff4ad8";
  ctx.beginPath();
  const wingY = Math.sin(performance.now() * 0.02) * 3;
  ctx.ellipse(-3, 2 + wingY, 7, 4, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // eye
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(5, -3, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(6, -3, 2, 0, Math.PI * 2);
  ctx.fill();

  // beak
  ctx.fillStyle = "#ff8a3d";
  ctx.beginPath();
  ctx.moveTo(r - 2, -1);
  ctx.lineTo(r + 7, 1);
  ctx.lineTo(r - 2, 4);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/* ---------- Death ---------- */
function die() {
  if (!alive) return;
  alive = false;
  shake = 1;
  flash.classList.add("hit");
  setTimeout(() => flash.classList.remove("hit"), 90);
  spawnSpark(bird.x, bird.y, "#ff5577", 30);
  spawnSpark(bird.x, bird.y, "#ffe66d", 18);
  sfx.hit();
  setTimeout(() => sfx.gameover(), 200);

  const dur = Math.max(1, Math.round((performance.now() - t0) / 1000));
  const isBest = score > best;
  if (isBest) {
    best = score;
    localStorage.setItem(BEST_KEY, String(best));
    hudBest.textContent = best;
  }
  sdk.gameOver(score, { durationSeconds: dur });

  setTimeout(() => {
    endTitle.textContent = isBest && score > 0 ? "NEW HIGH SCORE" : "GAME OVER";
    endScore.textContent = score;
    endBest.textContent = best;
    endTime.textContent = `${dur}s`;
    endBadge.classList.toggle("hidden", !(isBest && score > 0));
    endScreen.classList.remove("hidden");
  }, 700);
}

/* ---------- Start / Retry ---------- */
function beginCountdown(then) {
  ready.classList.remove("hidden");
  let n = 3;
  readyCount.textContent = n;
  const tick = () => {
    n--;
    if (n <= 0) {
      ready.classList.add("hidden");
      then();
      return;
    }
    readyCount.textContent = n === 0 ? "GO!" : n;
    readyCount.style.animation = "none";
    void readyCount.offsetWidth;
    readyCount.style.animation = "";
    setTimeout(tick, 700);
  };
  setTimeout(tick, 700);
}

startBtn.addEventListener("click", () => {
  audio();
  overlay.classList.add("hidden");
  reset();
  started = true;
  alive = false;
  beginCountdown(() => {
    alive = true;
    t0 = performance.now();
    last = t0;
    requestAnimationFrame(loop);
  });
});

retryBtn.addEventListener("click", () => {
  endScreen.classList.add("hidden");
  reset();
  started = true;
  alive = false;
  beginCountdown(() => {
    alive = true;
    t0 = performance.now();
    last = t0;
    requestAnimationFrame(loop);
  });
});

resize();
sdk.ready();
