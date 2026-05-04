/* Flappy Bower — tap-to-flap. Each cleared pipe pair = 1 point. */
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const hud = document.getElementById('hud-score');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start');

let W = 0, H = 0;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = cv.clientWidth = window.innerWidth;
  H = cv.clientHeight = window.innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);

const GRAVITY = 1500, FLAP = -440, PIPE_GAP = 170, PIPE_W = 70, PIPE_INTERVAL = 1.4;
let bird, pipes, t0, last, score, alive, spawn, started = false;

function reset() {
  resize();
  bird = { x: W * 0.28, y: H * 0.5, v: 0, r: 16 };
  pipes = []; score = 0; spawn = 0; alive = true; t0 = performance.now(); last = t0;
  hud.textContent = '0';
}

function flap() { if (alive && started) bird.v = FLAP; }
window.addEventListener('pointerdown', flap);
window.addEventListener('keydown', (e) => { if (e.code === 'Space') flap(); });

function loop(ts) {
  if (!started) return;
  const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
  if (alive) update(dt);
  draw();
  requestAnimationFrame(loop);
}

function update(dt) {
  bird.v += GRAVITY * dt; bird.y += bird.v * dt;
  spawn -= dt;
  if (spawn <= 0) {
    spawn = PIPE_INTERVAL;
    const margin = 60;
    const gapY = margin + Math.random() * (H - PIPE_GAP - margin * 2);
    pipes.push({ x: W + 20, gapY, passed: false });
  }
  for (const p of pipes) {
    p.x -= 180 * dt;
    if (!p.passed && p.x + PIPE_W < bird.x) {
      p.passed = true; score++; hud.textContent = score; window.hackcade.updateScore(score);
    }
    if (
      bird.x + bird.r > p.x && bird.x - bird.r < p.x + PIPE_W &&
      (bird.y - bird.r < p.gapY || bird.y + bird.r > p.gapY + PIPE_GAP)
    ) die();
  }
  pipes = pipes.filter((p) => p.x + PIPE_W > -10);
  if (bird.y + bird.r > H || bird.y - bird.r < 0) die();
}

function draw() {
  ctx.fillStyle = '#08081a'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#0d9c70';
  for (const p of pipes) {
    ctx.fillRect(p.x, 0, PIPE_W, p.gapY);
    ctx.fillRect(p.x, p.gapY + PIPE_GAP, PIPE_W, H - (p.gapY + PIPE_GAP));
  }
  ctx.beginPath(); ctx.fillStyle = '#ffe66d';
  ctx.arc(bird.x, bird.y, bird.r, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.fillStyle = '#000';
  ctx.arc(bird.x + 5, bird.y - 4, 3, 0, Math.PI * 2); ctx.fill();
}

function die() {
  if (!alive) return;
  alive = false;
  const dur = Math.round((performance.now() - t0) / 1000);
  window.hackcade.gameOver({ score, durationSeconds: dur });
  overlay.classList.remove('hidden');
  overlay.querySelector('p').textContent = `Score: ${score} · ${dur}s. Tap Start to retry.`;
  startBtn.textContent = 'PLAY AGAIN';
  started = false;
}

startBtn.addEventListener('click', () => {
  overlay.classList.add('hidden');
  reset(); started = true;
  requestAnimationFrame(loop);
});

window.hackcade.ready();
