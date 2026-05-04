/* Whack-a-Reggie — tap registrars before they vanish. 30s round. */
const grid = document.getElementById('grid');
const hudScore = document.getElementById('hud-score');
const hudTime = document.getElementById('hud-time');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start');

const HOLES = 9;
const ROUND_SECS = 30;

const holes = [];
for (let i = 0; i < HOLES; i++) {
  const h = document.createElement('div'); h.className = 'hole';
  const r = document.createElement('div'); r.className = 'reggie';
  h.appendChild(r); grid.appendChild(h); holes.push(r);
}

let score = 0, ending = false, popTimer = null, tickTimer = null, elapsed = 0;

function setScore(n) { score = n; hudScore.textContent = n; window.hackcade.updateScore(n); }

function popRandom() {
  if (ending) return;
  const idx = Math.floor(Math.random() * holes.length);
  const r = holes[idx];
  if (r.classList.contains('up')) return scheduleNext();
  r.classList.add('up');
  const upMs = Math.max(420, 900 - elapsed * 18);
  const t = setTimeout(() => r.classList.remove('up'), upMs);
  r.onclick = r.ontouchstart = (e) => {
    e.preventDefault();
    if (!r.classList.contains('up')) return;
    clearTimeout(t);
    r.classList.add('bonk'); r.classList.remove('up');
    setScore(score + 10);
    setTimeout(() => r.classList.remove('bonk'), 200);
  };
  scheduleNext();
}

function scheduleNext() {
  const wait = Math.max(180, 700 - elapsed * 14);
  popTimer = setTimeout(popRandom, wait);
}

function start() {
  overlay.classList.add('hidden');
  setScore(0); elapsed = 0; ending = false;
  hudTime.textContent = ROUND_SECS;
  popRandom();
  tickTimer = setInterval(() => {
    elapsed++;
    const left = ROUND_SECS - elapsed;
    hudTime.textContent = Math.max(0, left);
    if (left <= 0) end();
  }, 1000);
}

function end() {
  ending = true;
  clearTimeout(popTimer); clearInterval(tickTimer);
  holes.forEach(h => h.classList.remove('up'));
  window.hackcade.gameOver({ score, durationSeconds: ROUND_SECS });
  overlay.classList.remove('hidden');
  overlay.querySelector('p').textContent = `Final: ${score}. Tap to play again.`;
  startBtn.textContent = 'PLAY AGAIN';
}

startBtn.addEventListener('click', start);
window.hackcade.ready();
