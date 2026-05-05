/* Whack-a-Reggie — tap registrars before they vanish. 30s round. */
import sdk from "./hackcade-sdk.js";

const grid = document.getElementById("grid");
const hudScore = document.getElementById("hud-score");
const hudTime = document.getElementById("hud-time");
const hudPlayer = document.getElementById("hud-player");
const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("start");

const HOLES = 9;
const ROUND_SECS = 30;

// Sound bank. Each entry holds an array of variant URLs and a small pool of
// pre-built Audio elements per variant so overlapping plays don't cut each
// other off. Title screen guarantees the first user gesture before any of
// these can fire, satisfying autoplay policy.
const SFX = {
    whack:  ["whack.mp3"],
    ow:     ["ow.mp3"],
    thud:   ["thud.mp3"],
    laugh:  ["laugh1.mp3", "laugh2.mp3"],
};
const POOL_SIZE = 4;
const audioPool = {};
for (const [k, urls] of Object.entries(SFX)) {
    audioPool[k] = urls.map((u) => {
        const pool = [];
        for (let i = 0; i < POOL_SIZE; i++) {
            const a = new Audio(u);
            a.preload = "auto";
            pool.push(a);
        }
        return { url: u, pool, idx: 0 };
    });
}
function play(kind, { volume = 1, rate = 1 } = {}) {
    if (muted) return;
    const variants = audioPool[kind];
    if (!variants || !variants.length) return;
    const v = variants[Math.floor(Math.random() * variants.length)];
    const a = v.pool[v.idx];
    v.idx = (v.idx + 1) % v.pool.length;
    try {
        a.currentTime = 0;
        a.volume = Math.max(0, Math.min(1, volume));
        a.playbackRate = rate;
        a.play().catch(() => { /* autoplay blocked, ignore */ });
    } catch { /* ignore */ }
}
const rand = (min, max) => min + Math.random() * (max - min);

// Batman-style pop-ups at the click point. Hit words rotate, miss words rotate.
const HIT_WORDS = ["POW!", "WHAM!", "BAM!", "BOOM!", "ZOK!", "BIFF!", "KAPOW!", "SOCK!", "THWACK!", "+10"];
const MISS_WORDS = ["WHIFF!", "MISS!", "OOF!", "AIR!", "NOPE!", "DOH!"];
function spawnPop(x, y, kind) {
    const el = document.createElement("div");
    el.className = `fx-pop ${kind}`;
    const words = kind === "hit" ? HIT_WORDS : MISS_WORDS;
    el.textContent = words[Math.floor(Math.random() * words.length)];
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.setProperty("--rot", `${rand(-15, 15).toFixed(1)}deg`);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 750);
}
function pointerCoords(e) {
    const t = e.touches?.[0] || e.changedTouches?.[0];
    if (t) return { x: t.clientX, y: t.clientY };
    return { x: e.clientX, y: e.clientY };
}

// Persisted mute toggle. Default ON (sound). Stored under a game-scoped key.
const MUTE_KEY = "whack-a-reggie:muted";
let muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === "1"; } catch { /* ignore */ }
const soundBtn = document.getElementById("sound-toggle");
const soundOnIcon = document.getElementById("sound-on-icon");
const soundOffIcon = document.getElementById("sound-off-icon");
function renderMute() {
    if (!soundBtn || !soundOnIcon || !soundOffIcon) return;
    soundOnIcon.style.display = muted ? "none" : "";
    soundOffIcon.style.display = muted ? "" : "none";
    soundBtn.classList.toggle("muted", muted);
    soundBtn.setAttribute("aria-pressed", muted ? "false" : "true");
    soundBtn.setAttribute("aria-label", muted ? "Unmute" : "Mute");
}
if (soundBtn) {
    soundBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        muted = !muted;
        try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch { /* ignore */ }
        renderMute();
    });
}
renderMute();

const holes = [];
const reggies = [];
for (let i = 0; i < HOLES; i++) {
    const h = document.createElement("div");
    h.className = "hole";
    const r = document.createElement("div");
    r.className = "reggie";
    h.appendChild(r);
    grid.appendChild(h);
    holes.push(h);
    reggies.push(r);
}

let score = 0;
let ending = false;
let popTimer = null;
let tickTimer = null;
let elapsed = 0;
let paused = false;
let startedAt = 0;

function setScore(n) {
    score = n;
    hudScore.textContent = n;
    sdk.updateScore(n);
}

function popRandom() {
    if (ending || paused) return;
    const idx = Math.floor(Math.random() * reggies.length);
    const r = reggies[idx];
    const h = holes[idx];
    if (r.classList.contains("up")) return scheduleNext();
    r.classList.add("up");
    const ramp = Math.min(1, score / 300);
    const upMs = Math.max(450, Math.round(1400 - ramp * 900));
    let hit = false;
    const t = setTimeout(() => {
        r.classList.remove("up");
        // Reggie escaped without being whacked. Occasionally taunt with a
        // laugh — odds rise as the player ramps up so they really feel it.
        if (!hit && !ending) {
            const laughChance = 0.18 + ramp * 0.22;
            if (Math.random() < laughChance) {
                play("laugh", { volume: 0.7, rate: rand(0.95, 1.1) });
            }
        }
    }, upMs);
    const onWhack = (e) => {
        e.preventDefault();
        if (!r.classList.contains("up")) return;
        hit = true;
        clearTimeout(t);
        r.classList.add("bonk");
        r.classList.remove("up");
        setScore(score + 10);
        const c = pointerCoords(e);
        spawnPop(c.x, c.y, "hit");
        // Always the satisfying thwack, slight pitch variation per hit.
        play("whack", { volume: 0.9, rate: rand(0.92, 1.08) });
        // Layer an "ow" on a portion of hits so it stays fresh, never on
        // every one. Higher chance later in the round when reggies are tougher.
        if (Math.random() < 0.45 + ramp * 0.2) {
            const delay = 40 + Math.random() * 80;
            setTimeout(() => play("ow", { volume: 0.85, rate: rand(0.9, 1.12) }), delay);
        }
        setTimeout(() => r.classList.remove("bonk"), 200);
    };
    const onMiss = (e) => {
        // Tap on the hole that wasn't a reggie hit — empty thud.
        if (r.classList.contains("up") || r.classList.contains("bonk")) return;
        e.preventDefault();
        const c = pointerCoords(e);
        spawnPop(c.x, c.y, "miss");
        play("thud", { volume: 0.55, rate: rand(0.95, 1.08) });
    };
    h.onclick = (e) => { onWhack(e); onMiss(e); };
    h.ontouchstart = (e) => { onWhack(e); onMiss(e); };
    scheduleNext();
}

function scheduleNext() {
    const ramp = Math.min(1, score / 300);
    const wait = Math.max(260, Math.round(1200 - ramp * 900));
    popTimer = setTimeout(popRandom, wait);
}

function start() {
    overlay.classList.add("hidden");
    setScore(0);
    elapsed = 0;
    ending = false;
    paused = false;
    startedAt = Date.now();
    hudTime.textContent = ROUND_SECS;
    popRandom();
    tickTimer = setInterval(() => {
        if (paused) return;
        elapsed++;
        const left = ROUND_SECS - elapsed;
        hudTime.textContent = Math.max(0, left);
        if (left <= 0) end();
    }, 1000);
}

function end() {
    ending = true;
    clearTimeout(popTimer);
    clearInterval(tickTimer);
    reggies.forEach((r) => r.classList.remove("up"));
    holes.forEach((h) => { h.onclick = null; h.ontouchstart = null; });
    sdk.gameOver(score, { durationMs: Date.now() - startedAt });
    overlay.classList.remove("hidden");
    overlay.querySelector("p").textContent = `Final: ${score}. Smack 'em again?`;
    startBtn.textContent = "PLAY AGAIN";
    // Final taunt — reggies get the last laugh.
    setTimeout(() => play("laugh", { volume: 0.8, rate: rand(0.9, 1.05) }), 250);
}

startBtn.addEventListener("click", start);

// Two-way: respect platform pause/resume.
sdk.on("pause", () => { paused = true; });
sdk.on("resume", () => { paused = false; });

// Boot: signal ready, then show the player's name in the HUD.
await sdk.ready();
hudPlayer.textContent = sdk.greeting();
