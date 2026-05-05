/* Hackatar Match — flip pairs of real registered hackatars.
   - Fetches recent hackers from /api/v1/domains
   - Difficulty: easy(6) / normal(8) / hard(12) pairs
   - Combo system: consecutive matches multiply score gain
   - Scoring: per match base + combo bonus + time bonus, less move penalty
*/
import sdk from "./hackcade-sdk.js";

/* ---------- DOM ---------- */
const board = document.getElementById("board");
const hudMoves = document.getElementById("hud-moves").querySelector("b");
const hudTime = document.getElementById("hud-time").querySelector("b");
const hudScore = document.getElementById("hud-score").querySelector("b");
const hudCombo = document.getElementById("hud-combo");
const hudComboNum = hudCombo.querySelector("b");
const overlay = document.getElementById("overlay");
const endscreen = document.getElementById("endscreen");
const startBtn = document.getElementById("start");
const playAgainBtn = document.getElementById("play-again");
const loadingMsg = document.getElementById("loading-msg");
const errorMsg = document.getElementById("error-msg");
const matchBanner = document.getElementById("match-banner");
const diffBtns = Array.from(document.querySelectorAll(".diff-btn"));
const soundToggle = document.getElementById("sound-toggle");
const sndOn = document.getElementById("sound-on");
const sndOff = document.getElementById("sound-off");

/* ---------- config ---------- */
const API_BASE = "/api/v1";
const FALLBACK_SEEDS = ["arcade", "pixel", "neon", "glitch", "cabinet", "coin", "reggie", "bower", "zap", "void", "byte", "core"];
const DIFFICULTY = {
  easy:   { pairs: 6,  cols: 4, rows: 3, label: "EASY" },
  normal: { pairs: 8,  cols: 4, rows: 4, label: "NORMAL" },
  hard:   { pairs: 12, cols: 6, rows: 4, label: "HARD" },
};
const TIME_BONUS_CAP = 90;        // seconds before time bonus zeroes out
const TIME_BONUS_PER_SEC = 8;     // points per remaining second
const MOVE_PENALTY = 25;          // per move
const MATCH_BASE = 200;           // base per matched pair
const COMBO_BONUS = 80;           // additional per combo level above 1

/* ---------- state ---------- */
let cards = [];
let flipped = [];
let moves = 0;
let matchedCount = 0;
let locked = false;
let elapsed = 0;
let tick = null;
let started = false;
let combo = 0;
let bestCombo = 0;
let score = 0;
let perfect = true;        // remained perfect = no misses
let difficulty = "normal";
let labelPool = null;      // cached labels from API

/* ---------- audio (synthesized, no asset deps) ---------- */
const MUTE_KEY = "hackatar-match:muted";
let muted = localStorage.getItem(MUTE_KEY) === "1";
let actx = null;
function ensureAudio() {
  if (!actx) {
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { actx = null; }
  }
  return actx;
}
function tone({ freq = 440, dur = 0.12, type = "sine", gain = 0.18, slide = 0, delay = 0 } = {}) {
  if (muted) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
function noiseBurst({ dur = 0.18, gain = 0.15, delay = 0 } = {}) {
  if (muted) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const filter = ctx.createBiquadFilter(); filter.type = "bandpass"; filter.frequency.value = 1200;
  const g = ctx.createGain(); g.gain.value = gain;
  src.connect(filter).connect(g).connect(ctx.destination);
  src.start(t0); src.stop(t0 + dur);
}
const SFX = {
  flip()  { tone({ freq: 520, dur: 0.06, type: "square", gain: 0.1, slide: 200 }); },
  match(level) {
    const root = 440 + Math.min(level - 1, 6) * 60;
    tone({ freq: root, dur: 0.12, type: "triangle", gain: 0.18 });
    tone({ freq: root * 1.5, dur: 0.12, type: "triangle", gain: 0.14, delay: 0.05 });
    tone({ freq: root * 2, dur: 0.18, type: "sine", gain: 0.12, delay: 0.11 });
  },
  miss()  {
    tone({ freq: 220, dur: 0.18, type: "sawtooth", gain: 0.12, slide: -120 });
    noiseBurst({ dur: 0.12, gain: 0.06, delay: 0.02 });
  },
  combo(level) {
    const f = 600 + level * 80;
    tone({ freq: f, dur: 0.08, type: "square", gain: 0.16 });
    tone({ freq: f * 1.5, dur: 0.08, type: "square", gain: 0.12, delay: 0.05 });
  },
  victory() {
    const notes = [523, 659, 784, 988, 1175];
    notes.forEach((n, i) => tone({ freq: n, dur: 0.2, type: "triangle", gain: 0.18, delay: i * 0.1 }));
  },
};

function setMuteIcon() {
  sndOn.style.display = muted ? "none" : "block";
  sndOff.style.display = muted ? "block" : "none";
}
soundToggle.addEventListener("click", () => {
  muted = !muted;
  localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  setMuteIcon();
});
setMuteIcon();

/* ---------- difficulty UI ---------- */
diffBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    diffBtns.forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    difficulty = btn.dataset.diff;
  });
});

/* ---------- API ---------- */
async function fetchHackatarLabels(needed) {
  if (labelPool && labelPool.length >= needed) return labelPool;
  try {
    const res = await fetch(`${API_BASE}/domains?limit=80`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const labels = (json.data || [])
      .map(d => d.label)
      .filter(l => typeof l === "string" && /^[a-z0-9-]+$/.test(l));
    if (labels.length < needed) throw new Error(`only ${labels.length} hackers`);
    labelPool = labels;
    return labelPool;
  } catch (e) {
    console.warn("[hackatar-match] API fetch failed, using fallback seeds:", e);
    labelPool = [...FALLBACK_SEEDS];
    return labelPool;
  }
}

function pickLabels(pool, n) {
  const copy = [...pool];
  const out = [];
  while (out.length < n && copy.length) {
    const i = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  // pad with fallback if pool was too small
  while (out.length < n) out.push(FALLBACK_SEEDS[out.length % FALLBACK_SEEDS.length] + "_" + out.length);
  return out;
}

function preloadImages(labels) {
  return Promise.all(labels.map(label => new Promise(resolve => {
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    img.src = `${API_BASE}/hackatar/${encodeURIComponent(label)}?static=1`;
  })));
}

/* ---------- HUD ---------- */
function setMoves(n) { moves = n; hudMoves.textContent = String(n); }
function setTime(n)  { elapsed = n; hudTime.textContent = `${n}s`; }
function setScore(n) { score = n; hudScore.textContent = String(n); }
function setCombo(n) {
  combo = n;
  if (n >= 2) {
    hudCombo.classList.remove("hidden");
    hudComboNum.textContent = String(n);
    // restart pulse animation
    hudCombo.style.animation = "none"; void hudCombo.offsetWidth; hudCombo.style.animation = "";
  } else {
    hudCombo.classList.add("hidden");
  }
  if (n > bestCombo) bestCombo = n;
}

function showBanner(text) {
  matchBanner.textContent = text;
  matchBanner.classList.remove("hidden");
  matchBanner.style.animation = "none"; void matchBanner.offsetWidth;
  matchBanner.style.animation = "bannerIn .8s ease-out forwards";
  setTimeout(() => matchBanner.classList.add("hidden"), 850);
}

/* ---------- board ---------- */
function makeBoard(labels) {
  const conf = DIFFICULTY[difficulty];
  board.className = `diff-${difficulty}`;
  const seeds = [...labels, ...labels].sort(() => Math.random() - 0.5);
  board.innerHTML = "";
  cards = seeds.map((seed, i) => {
    const w = document.createElement("div"); w.className = "card-wrap";
    const c = document.createElement("div"); c.className = "card";
    const face = document.createElement("div"); face.className = "face";
    const img = document.createElement("div"); img.className = "img";
    const ig = document.createElement("img");
    ig.src = `${API_BASE}/hackatar/${encodeURIComponent(seed)}?static=1`;
    ig.alt = seed; ig.loading = "eager"; ig.decoding = "async";
    img.appendChild(ig);
    c.appendChild(face); c.appendChild(img); w.appendChild(c);
    c.addEventListener("click", () => onClick(i));
    board.appendChild(w);
    return { c, seed, matched: false };
  });
}

/* ---------- gameplay ---------- */
function onClick(i) {
  if (locked || !started) return;
  const card = cards[i];
  if (card.matched || card.c.classList.contains("flipped")) return;

  card.c.classList.add("flipped");
  SFX.flip();
  flipped.push(i);

  if (flipped.length === 2) {
    setMoves(moves + 1);
    locked = true;
    const [a, b] = flipped;
    if (cards[a].seed === cards[b].seed) {
      // match
      cards[a].matched = cards[b].matched = true;
      cards[a].c.classList.add("matched");
      cards[b].c.classList.add("matched");
      matchedCount += 2;
      setCombo(combo + 1);
      const gain = MATCH_BASE + Math.max(0, combo - 1) * COMBO_BONUS;
      setScore(score + gain);
      if (combo >= 2) {
        SFX.combo(combo);
        showBanner(`COMBO ×${combo}  +${gain}`);
      } else {
        SFX.match(combo);
        showBanner(`+${gain} · ${cards[a].seed}.hack.tez`);
      }
      flipped = []; locked = false;
      if (matchedCount === cards.length) end(true);
    } else {
      // miss
      perfect = false;
      cards[a].c.classList.add("miss");
      cards[b].c.classList.add("miss");
      SFX.miss();
      setCombo(0);
      setTimeout(() => {
        cards[a].c.classList.remove("flipped", "miss");
        cards[b].c.classList.remove("flipped", "miss");
        flipped = []; locked = false;
      }, 700);
    }
    sdk.updateScore(score);
  }
}

function timeBonus() {
  return Math.max(0, (TIME_BONUS_CAP - elapsed) * TIME_BONUS_PER_SEC);
}

function finalScore() {
  return Math.max(0, score + timeBonus() - moves * MOVE_PENALTY);
}

async function start() {
  // user gesture — unlock audio
  ensureAudio()?.resume?.();

  startBtn.disabled = true;
  errorMsg.classList.add("hidden");
  loadingMsg.classList.remove("hidden");

  try {
    const conf = DIFFICULTY[difficulty];
    const pool = await fetchHackatarLabels(conf.pairs);
    const labels = pickLabels(pool, conf.pairs);
    await preloadImages(labels);

    setMoves(0); setTime(0); setScore(0); setCombo(0);
    matchedCount = 0; flipped = []; locked = false; perfect = true; bestCombo = 0;
    started = true;
    makeBoard(labels);

    overlay.classList.add("hidden");
    endscreen.classList.add("hidden");
    if (tick) clearInterval(tick);
    tick = setInterval(() => {
      setTime(elapsed + 1);
      sdk.updateScore(finalScore());
    }, 1000);
  } catch (e) {
    errorMsg.textContent = e?.message || "Failed to start.";
    errorMsg.classList.remove("hidden");
  } finally {
    loadingMsg.classList.add("hidden");
    startBtn.disabled = false;
  }
}

function end(victory) {
  if (!started) return;
  started = false;
  clearInterval(tick); tick = null;
  const final = finalScore();
  if (victory) SFX.victory();

  document.getElementById("end-title").textContent = victory ? "VICTORY" : "GAME OVER";
  document.getElementById("end-score").textContent = String(final);
  document.getElementById("end-moves").textContent = String(moves);
  document.getElementById("end-time").textContent = `${elapsed}s`;
  document.getElementById("end-combo").textContent = `×${bestCombo || 1}`;
  document.getElementById("end-perfect").textContent = perfect ? "YES ★" : "no";

  endscreen.classList.remove("hidden");

  sdk.gameOver(final, {
    durationSeconds: elapsed,
    metadata: {
      moves,
      bestCombo,
      perfect,
      difficulty,
      pairs: DIFFICULTY[difficulty].pairs,
    },
  });
}

startBtn.addEventListener("click", start);
playAgainBtn.addEventListener("click", () => {
  endscreen.classList.add("hidden");
  overlay.classList.remove("hidden");
});

await sdk.ready();
