/* Hackatar Match — flip pairs of hackatars in as few moves as possible.
   Score = max(0, 5000 - moves * 60 - elapsedSeconds * 10) */
import sdk from "./hackcade-sdk.js";

const board = document.getElementById('board');
const hudMoves = document.getElementById('hud-moves');
const hudTime = document.getElementById('hud-time');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start');

const SEEDS = ['arcade', 'pixel', 'neon', 'glitch', 'cabinet', 'coin', 'reggie', 'bower'];

let cards = [], flipped = [], moves = 0, matched = 0, locked = false, elapsed = 0, tick = null, started = false;

function setMoves(n) { moves = n; hudMoves.textContent = `Moves: ${n}`; }
function setTime(n) { elapsed = n; hudTime.textContent = `${n}s`; }

function previewScore() {
  const s = Math.max(0, 5000 - moves * 60 - elapsed * 10);
  sdk.updateScore(s);
  return s;
}

function makeBoard() {
  const seeds = [...SEEDS, ...SEEDS].sort(() => Math.random() - 0.5);
  board.innerHTML = '';
  cards = seeds.map((seed, i) => {
    const w = document.createElement('div'); w.className = 'card-wrap';
    const c = document.createElement('div'); c.className = 'card';
    const face = document.createElement('div'); face.className = 'face'; face.textContent = '?';
    const img = document.createElement('div'); img.className = 'img';
    const ig = document.createElement('img');
    ig.src = `https://hacktez.com/api/v1/hackatar/${encodeURIComponent(seed)}?static=1`;
    ig.alt = seed; img.appendChild(ig);
    c.appendChild(face); c.appendChild(img); w.appendChild(c);
    c.addEventListener('click', () => onClick(i));
    board.appendChild(w);
    return { c, seed, matched: false };
  });
}

function onClick(i) {
  if (locked) return;
  const card = cards[i];
  if (card.matched || card.c.classList.contains('flipped')) return;
  card.c.classList.add('flipped');
  flipped.push(i);
  if (flipped.length === 2) {
    setMoves(moves + 1);
    locked = true;
    const [a, b] = flipped;
    if (cards[a].seed === cards[b].seed) {
      cards[a].matched = cards[b].matched = true;
      cards[a].c.classList.add('matched'); cards[b].c.classList.add('matched');
      matched += 2;
      flipped = []; locked = false;
      previewScore();
      if (matched === cards.length) end();
    } else {
      setTimeout(() => {
        cards[a].c.classList.remove('flipped'); cards[b].c.classList.remove('flipped');
        flipped = []; locked = false;
        previewScore();
      }, 700);
    }
  }
}

function start() {
  overlay.classList.add('hidden');
  setMoves(0); setTime(0); matched = 0; flipped = []; locked = false; started = true;
  makeBoard();
  tick = setInterval(() => setTime(elapsed + 1), 1000);
}

function end() {
  if (!started) return;
  started = false;
  clearInterval(tick);
  const final = previewScore();
  sdk.gameOver(final, { durationSeconds: elapsed, metadata: { moves } });
  overlay.classList.remove('hidden');
  overlay.querySelector('p').textContent = `Score: ${final} · ${moves} moves · ${elapsed}s`;
  startBtn.textContent = 'PLAY AGAIN';
}

startBtn.addEventListener('click', start);
sdk.ready();
