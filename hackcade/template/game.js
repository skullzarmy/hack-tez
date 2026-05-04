// Minimal Hackcade game template.
// Replace this with your own game. The SDK is on `window.hackcade`.

(async function () {
    const sdk = window.hackcade;
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

    function show(...screens) {
        for (const el of [$menu, $play, $over]) el.classList.add("hidden");
        for (const el of screens) el.classList.remove("hidden");
    }

    function startGame() {
        score = 0;
        $score.textContent = "0";
        startedAt = Date.now();
        show($play);
        // 30s rounds
        timer = setTimeout(endGame, 30_000);
    }

    function endGame() {
        clearTimeout(timer);
        $final.textContent = String(score);
        show($over);
        sdk.gameOver(score, { durationMs: Date.now() - startedAt });
    }

    function tap() {
        score += 1;
        $score.textContent = String(score);
        sdk.updateScore(score);
    }

    // Wire UI
    $start.addEventListener("click", startGame);
    $again.addEventListener("click", startGame);
    $target.addEventListener("pointerdown", tap, { passive: true });

    // Lifecycle hooks (the platform may pause/resume)
    sdk.on("pause", () => clearTimeout(timer));
    sdk.on("resume", () => { /* resume timer if you want */ });

    // Init: tell platform we're ready, then read identity
    await sdk.ready();
    const player = await sdk.getPlayer();
    $player.textContent = player.domain || "guest";
    show($menu);
})();
