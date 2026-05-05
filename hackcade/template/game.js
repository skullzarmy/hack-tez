// Hackcade game template — minimal, ESM.
// The platform auto-injects ./hackcade-sdk.js into your bundle, so you can
// import it directly. Your game logic goes here.

import sdk from "./hackcade-sdk.js";

const $score = document.getElementById("score");
const $player = document.getElementById("player");
const $final = document.getElementById("final");
const $menu = document.getElementById("menu");
const $play = document.getElementById("play");
const $over = document.getElementById("over");
const $start = document.getElementById("start");
const $again = document.getElementById("again");
const $target = document.getElementById("target");

let score = 0;
let timer = null;
let startedAt = 0;
let paused = false;

function show(...screens) {
    for (const el of [$menu, $play, $over]) el.classList.add("hidden");
    for (const el of screens) el.classList.remove("hidden");
}

function startGame() {
    score = 0;
    $score.textContent = "0";
    startedAt = Date.now();
    paused = false;
    show($play);
    timer = setTimeout(endGame, 30_000);
}

function endGame() {
    clearTimeout(timer);
    timer = null;
    $final.textContent = String(score);
    show($over);
    sdk.gameOver(score, { durationMs: Date.now() - startedAt });
}

function tap() {
    if (paused) return;
    score += 1;
    $score.textContent = String(score);
    sdk.updateScore(score);
}

// Wire UI
$start.addEventListener("click", startGame);
$again.addEventListener("click", startGame);
$target.addEventListener("pointerdown", tap, { passive: true });

// Two-way: react to platform lifecycle events.
sdk.on("pause", () => {
    paused = true;
    if (timer) {
        clearTimeout(timer);
        timer = null;
    }
});
sdk.on("resume", () => {
    paused = false;
    // Resume your game loop here. Skipping for brevity in the template.
});

// Boot sequence: signal ready, then read identity for the HUD.
const player = await sdk.ready();
$player.textContent = sdk.greeting();
if (player.hackatarUrl) {
    // Example use of the player avatar — show their hackatar somewhere if you want.
    // const img = new Image(); img.src = player.hackatarUrl;
}
show($menu);
