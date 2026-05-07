/**
 * Name That Artist — TTC Edition (Hackcade)
 *
 * Single-player web version of the Discord trivia game for TheTezosCommunity.
 * Fetches NFTs from the TTC prize wallet via objkt.com GraphQL, displays the
 * artwork and 4 artist name choices. Points = baseScore × (timeRemaining / roundTime).
 *
 * Architecture:
 *   1. Boot: sdk.ready() → show menu (no network yet)
 *   2. Difficulty select → preloader screen:
 *        a) Fetch ALL tokens from objkt (paginated, cached in-memory)
 *        b) Resolve artist display names (batch)
 *        c) Apply blacklist filters
 *        d) Select random rounds (no repeat artists)
 *        e) Preload ALL images for this game's rounds
 *   3. Play: every image is already cached, rounds are instant
 *   4. Game over → sdk.gameOver()
 */

import sdk from "./hackcade-sdk.js";

// ──────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────

const TTC_WALLET = "tz1RZN17j7FuPtDpGpXKgMXbx57WEhpZGF6B";
const OBJKT_GQL = "https://data.objkt.com/v3/graphql";
const IPFS_GATEWAY = "https://ipfs.fileship.xyz";
const BASE_SCORE = 100;

const DIFFICULTIES = {
    easy:   { rounds: 10, timeSec: 15, label: "EASY" },
    medium: { rounds: 20, timeSec: 10, label: "MEDIUM" },
    hard:   { rounds: 30, timeSec: 7, label: "HARD" },
};

// ── Blacklists ──
// Entire contracts to exclude (too recognizable / branded)
const BLACKLISTED_CONTRACTS = new Set([
    "KT1RRTZ6DGnAPYTxXx4kzzQZFiZ8yo76pULU",
    "KT1XchTXdjPJNgR2bPSK9FipqNYfCcSgrmHb",
    "KT1LBXXg9UFvyfdvPmRMc4JZQsYWdyPCS6ue", // collect-united-23-24
    "KT1VVScVG9KyGNJpm66LQ9e2wqEZtf3q9iMF",
    "KT1ASdLCaRrd6tHyssWYDkZKdMm2KrwwbQeN",
    "KT1Byp9f8D6i5oQGvXS9EoVmbgg643Xq4aTN",
    "KT1HwhxuoZqKgauNHi9vzShCbvYDESd2dfhv",
    "KT1GUnPCc3zQq6oshCh91nmnfTvhiWFj6Qci",
    "KT1UidJGfFQBhyufakh5PNc13i5t67jA4cvx",
    "KT1AxhmvtycdsMjDTEfSmgyduMartH32Nhp2",
    "KT1JUt1DNTsZC14KAxdSop34TWBZhvZ7P9a3"
]);

// Specific tokens to exclude: "contract:tokenId"
const BLACKLISTED_TOKENS = new Set([
    // e.g. "KT1abc...:42"
]);

// Artists to exclude entirely from the game
const BLACKLISTED_ARTISTS = new Set([
    "tz2W1hS4DURJckg7iZaLXL18kh8C3SJuUaxv"
]);

// ──────────────────────────────────────────────
// DOM references
// ──────────────────────────────────────────────

const $ = (id) => document.getElementById(id);
const $hudScore    = $("hud-score");
const $playerName  = $("player-name");
const $roundInd    = $("round-indicator");
const $hudCenter   = $("hud-center");
const $loadScreen  = $("screen-loading");
const $loadStatus  = $("load-status");
const $menuScreen  = $("screen-menu");
const $tokenCount  = $("token-count");
const $playScreen  = $("screen-play");
const $timerFill   = $("timer-fill");
const $timerText   = $("timer-text");
const $artImage    = $("art-image");
const $artLoader   = $("art-loader");
const $choices     = $("choices");
const $resultScreen = $("screen-result");
const $resultContent = $("result-content");
const $overScreen  = $("screen-gameover");
const $finalScore  = $("final-score");
const $finalStats  = $("final-stats");
const $playAgain   = $("btn-play-again");

// ──────────────────────────────────────────────
// State
// ──────────────────────────────────────────────

let allTokens = [];           // full filtered collection
let allArtists = [];          // unique artist addresses
let artistNames = {};         // address → { displayName, hasResolution }
let gameRounds = [];          // [{token, choices}] for current game
let currentRound = 0;
let score = 0;
let correctCount = 0;
let incorrectCount = 0;
let difficulty = null;
let timerInterval = null;
let roundStartTime = 0;
let roundTimeSec = 15;
let answered = false;
let paused = false;
let startedAt = 0;

// Token cache: only fetch from objkt once per session
let tokensCached = false;

// ──────────────────────────────────────────────
// IPFS helpers
// ──────────────────────────────────────────────

function ipfsToUrl(uri) {
    if (!uri || typeof uri !== "string") return null;
    if (uri.startsWith("ipfs://")) {
        let cid = uri.slice(7);
        if (cid.startsWith("ipfs/")) cid = cid.slice(5);
        return `${IPFS_GATEWAY}/${cid}`;
    }
    if (uri.startsWith("http")) return uri;
    return null;
}

// ──────────────────────────────────────────────
// objkt.com GraphQL
// ──────────────────────────────────────────────

async function gql(query, variables = {}, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(OBJKT_GQL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query, variables }),
            });
            if (!res.ok) throw new Error(`objkt API ${res.status}`);
            const json = await res.json();
            if (json.errors) throw new Error(json.errors[0].message);
            return json.data;
        } catch (err) {
            if (i === retries - 1) throw err;
            // Wait before retrying (exponential backoff)
            await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
        }
    }
}

const TOKENS_QUERY = `
    query GetWalletTokens($address: String!, $limit: Int!, $offset: Int!) {
        holder(where: { address: { _eq: $address } }) {
            held_tokens(
                offset: $offset,
                limit: $limit,
                distinct_on: token_pk,
                where: { quantity: { _gt: 0 } }
            ) {
                token {
                    token_id
                    name
                    display_uri
                    thumbnail_uri
                    artifact_uri
                    fa_contract
                    creators { creator_address }
                }
            }
        }
    }
`;

const ARTIST_BATCH_QUERY = `
    query GetArtists($addresses: [String!]!) {
        holder(where: { address: { _in: $addresses } }) {
            address
            alias
            tzdomain
        }
    }
`;

async function fetchAllTokens(onProgress) {
    if (tokensCached && allTokens.length > 0) {
        onProgress?.(`Using cached collection (${allTokens.length} pieces)`);
        return;
    }

    const raw = [];
    let offset = 0;
    const batchSize = 500;
    let page = 0;

    let totalApprox = 3000; // Best guess for TTC collection size

    while (true) {
        onProgress?.(`Fetching tokens… (${raw.length} so far)`, Math.min(100, (raw.length / totalApprox) * 100));
        const data = await gql(TOKENS_QUERY, {
            address: TTC_WALLET,
            limit: batchSize,
            offset,
        });

        const held = data.holder?.[0]?.held_tokens ?? [];
        if (held.length === 0) break;

        for (const ht of held) {
            const t = ht.token;
            const imageUri = t.thumbnail_uri || t.display_uri || t.artifact_uri;
            const fullUri = t.display_uri || t.artifact_uri || t.thumbnail_uri;
            const artists = (t.creators || []).map((c) => c.creator_address);
            const primaryArtist = artists[0] || null;
            const key = `${t.fa_contract}:${t.token_id}`;

            // Skip blacklisted
            if (BLACKLISTED_CONTRACTS.has(t.fa_contract)) continue;
            if (BLACKLISTED_TOKENS.has(key)) continue;
            if (BLACKLISTED_ARTISTS.has(primaryArtist)) continue;
            if (!primaryArtist) continue;

            const imageUrl = ipfsToUrl(imageUri);
            if (!imageUrl) continue;

            raw.push({
                tokenId: t.token_id,
                name: t.name || "Untitled",
                imageUrl,
                fullImageUrl: ipfsToUrl(fullUri) || imageUrl,
                primaryArtist,
                contract: t.fa_contract,
            });
        }

        offset += held.length;
        page++;
        if (held.length < batchSize) break;
    }

    allTokens = raw;
    tokensCached = true;
    onProgress?.(`Loaded ${allTokens.length} pieces`, 100);
}

async function resolveArtistNames(addresses, onProgress) {
    // Only resolve names we haven't seen
    const toResolve = addresses.filter((a) => !artistNames[a]);
    if (toResolve.length === 0) {
        onProgress?.("Resolving artists…", 100);
        return;
    }

    // Batch in chunks of 50 (GraphQL _in has limits)
    const chunkSize = 50;
    let resolvedCount = 0;
    for (let i = 0; i < toResolve.length; i += chunkSize) {
        onProgress?.(`Resolving ${toResolve.length} artist names…`, (resolvedCount / toResolve.length) * 100);
        const chunk = toResolve.slice(i, i + chunkSize);
        try {
            const data = await gql(ARTIST_BATCH_QUERY, { addresses: chunk });
            const holders = data.holder || [];
            for (const h of holders) {
                const displayName = h.alias || h.tzdomain || null;
                artistNames[h.address] = {
                    displayName: displayName || shortenAddress(h.address),
                    hasResolution: !!displayName,
                };
            }
        } catch {
            // If batch fails, fill with shortened addresses
        }
        // Fill any missing
        for (const addr of chunk) {
            if (!artistNames[addr]) {
                artistNames[addr] = {
                    displayName: shortenAddress(addr),
                    hasResolution: false,
                };
            }
        }
        resolvedCount += chunk.length;
    }

    // Filter tokens to only those with resolved artist names
    allTokens = allTokens.filter((t) => artistNames[t.primaryArtist]?.hasResolution);
    allArtists = [...new Set(allTokens.map((t) => t.primaryArtist))];

    onProgress?.(`${allArtists.length} artists with known names`, 100);
}

function shortenAddress(addr) {
    if (!addr || addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ──────────────────────────────────────────────
// Image preloader
// ──────────────────────────────────────────────

function preloadImage(url) {
    return new Promise((resolve) => {
        let isResolved = false;
        const img = new Image();

        const finish = (result) => {
            if (isResolved) return;
            isResolved = true;
            resolve(result);
        };

        img.onload = () => finish(true);
        img.onerror = () => finish(false);
        
        // Force resolve after 5s if the IPFS gateway hangs
        setTimeout(() => finish(false), 5000);

        img.src = url;
    });
}

async function preloadGameImages(rounds, onProgress) {
    const total = rounds.length;
    if (total === 0) {
        onProgress?.(`Preloading artwork…`, 100);
        return;
    }

    const initialBatchSize = Math.min(5, total);
    let loaded = 0;

    // 1. Await only the first batch sequentially to unblock the game quickly
    for (let i = 0; i < initialBatchSize; i++) {
        await preloadImage(rounds[i].token.imageUrl);
        loaded++;
        onProgress?.(`Preloading artwork… ${loaded}/${initialBatchSize}`, (loaded / initialBatchSize) * 100);
    }

    // 2. Fire off the rest in the background sequentially so we don't trigger IPFS rate limits
    if (total > initialBatchSize) {
        (async () => {
            for (let i = initialBatchSize; i < total; i++) {
                await preloadImage(rounds[i].token.imageUrl);
            }
        })();
    }
}

// ──────────────────────────────────────────────
// Game round generation
// ──────────────────────────────────────────────

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function selectRounds(count) {
    // Shuffle tokens, pick unique-artist rounds (no repeat artists)
    const shuffled = shuffle(allTokens);
    const usedArtists = new Set();
    const selected = [];

    for (const token of shuffled) {
        if (selected.length >= count) break;
        if (usedArtists.has(token.primaryArtist)) continue;
        usedArtists.add(token.primaryArtist);
        selected.push(token);
    }

    // If we couldn't get enough unique artists, fill with any remaining
    if (selected.length < count) {
        for (const token of shuffled) {
            if (selected.length >= count) break;
            if (selected.includes(token)) continue;
            selected.push(token);
        }
    }

    return selected.map((token) => ({
        token,
        choices: generateChoices(token),
    }));
}

function generateChoices(token) {
    const correctArtist = token.primaryArtist;
    const otherArtists = allArtists.filter((a) => a !== correctArtist);
    const distractors = shuffle(otherArtists).slice(0, 3);
    const all = shuffle([correctArtist, ...distractors]);

    const labels = ["A", "B", "C", "D"];
    return all.map((artist, i) => ({
        label: labels[i],
        artist,
        displayName: artistNames[artist]?.displayName || shortenAddress(artist),
        isCorrect: artist === correctArtist,
    }));
}

// ──────────────────────────────────────────────
// Screen management
// ──────────────────────────────────────────────

const screens = [$loadScreen, $menuScreen, $playScreen, $resultScreen, $overScreen];
function showScreen(screen) {
    for (const s of screens) s.classList.add("hidden");
    screen.classList.remove("hidden");
}

// ──────────────────────────────────────────────
// Timer
// ──────────────────────────────────────────────

function startTimer() {
    roundStartTime = Date.now();
    answered = false;

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(tickTimer, 50);
    tickTimer();
}

function tickTimer() {
    if (paused || answered) return;

    const elapsed = (Date.now() - roundStartTime) / 1000;
    const remaining = Math.max(0, roundTimeSec - elapsed);
    const pct = (remaining / roundTimeSec) * 100;

    $timerFill.style.width = `${pct}%`;
    $timerText.textContent = `${Math.ceil(remaining)}s`;

    // Color warnings
    const warn = remaining <= roundTimeSec * 0.35;
    const danger = remaining <= roundTimeSec * 0.15;

    $timerFill.classList.toggle("warn", warn && !danger);
    $timerFill.classList.toggle("danger", danger);
    $timerText.classList.toggle("warn", warn && !danger);
    $timerText.classList.toggle("danger", danger);

    if (remaining <= 0) {
        clearInterval(timerInterval);
        timerInterval = null;
        handleTimeout();
    }
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

// ──────────────────────────────────────────────
// Gameplay
// ──────────────────────────────────────────────

function startRound() {
    const round = gameRounds[currentRound];
    if (!round) return;

    $hudCenter.classList.remove("hidden");
    $roundInd.textContent = `${currentRound + 1} / ${gameRounds.length}`;

    // Show art — image is preloaded so should be instant
    $artImage.classList.remove("loaded");
    $artLoader.classList.remove("hidden");
    
    function loadArt(url, isFallback = false) {
        $artImage.onload = () => {
            $artImage.classList.add("loaded");
            $artLoader.classList.add("hidden");
        };
        $artImage.onerror = () => {
            if (!isFallback && url.includes("/ipfs/")) {
                // IPFS Gateway failed/rate-limited — fallback to Cloudflare
                const cid = url.split("/ipfs/")[1];
                loadArt(`https://cloudflare-ipfs.com/ipfs/${cid}`, true);
            } else {
                // Complete failure
                $artLoader.classList.add("hidden");
            }
        };
        $artImage.src = url;

        // The image might already be cached from preload
        if ($artImage.complete && $artImage.naturalWidth > 0) {
            $artImage.classList.add("loaded");
            $artLoader.classList.add("hidden");
        }
    }

    loadArt(round.token.imageUrl);

    // Build choice buttons
    $choices.innerHTML = "";
    for (const choice of round.choices) {
        const btn = document.createElement("button");
        btn.className = "choice-btn";
        btn.type = "button";
        btn.innerHTML = `
            <span class="choice-btn__letter">${choice.label}</span>
            <span>${choice.displayName}</span>
        `;
        btn.addEventListener("click", () => handleAnswer(choice, btn));
        $choices.appendChild(btn);
    }

    showScreen($playScreen);
    startTimer();
}

function handleAnswer(choice, btnEl) {
    if (answered) return;

    const round = gameRounds[currentRound];
    const allBtns = $choices.querySelectorAll(".choice-btn");

    if (choice.isCorrect) {
        answered = true;
        stopTimer();

        const elapsed = (Date.now() - roundStartTime) / 1000;
        const remaining = Math.max(0, roundTimeSec - elapsed);
        const points = Math.round(BASE_SCORE * (remaining / roundTimeSec));

        score += points;
        correctCount++;
        $hudScore.textContent = String(score);
        sdk.updateScore(score);

        // Highlight correct
        btnEl.classList.add("correct");
        for (const b of allBtns) {
            if (b !== btnEl) b.classList.add("dimmed");
            b.disabled = true;
        }

        setTimeout(() => showRoundResult("correct", points, round), 800);
    } else {
        // Wrong answer
        btnEl.classList.add("wrong");
        btnEl.disabled = true;

        answered = true;
        stopTimer();
        incorrectCount++;

        // Show correct answer
        for (const b of allBtns) {
            b.disabled = true;
            const letter = b.querySelector(".choice-btn__letter").textContent;
            const correctChoice = round.choices.find((c) => c.label === letter);
            if (correctChoice?.isCorrect) b.classList.add("correct");
            if (b !== btnEl && !correctChoice?.isCorrect) b.classList.add("dimmed");
        }

        setTimeout(() => showRoundResult("wrong", 0, round), 800);
    }
}

function handleTimeout() {
    if (answered) return;
    answered = true;
    incorrectCount++;

    const round = gameRounds[currentRound];
    const allBtns = $choices.querySelectorAll(".choice-btn");

    for (const b of allBtns) {
        b.disabled = true;
        const letter = b.querySelector(".choice-btn__letter").textContent;
        const correctChoice = round.choices.find((c) => c.label === letter);
        if (correctChoice?.isCorrect) b.classList.add("correct");
        else b.classList.add("dimmed");
    }

    setTimeout(() => showRoundResult("timeout", 0, round), 800);
}

function showRoundResult(outcome, points, round) {
    const artistName = artistNames[round.token.primaryArtist]?.displayName || "Unknown";
    const titles = { correct: "Correct!", wrong: "Wrong!", timeout: "Time's Up!" };

    $resultContent.innerHTML = `
        <h2 class="result-card__title ${outcome}">${titles[outcome]}</h2>
        ${points > 0 ? `<div class="result-card__points">+${points}</div>` : ""}
        <div class="result-card__art-preview">
            <img class="result-card__art-thumb" src="${round.token.imageUrl}" alt="" />
            <div class="result-card__art-info">
                <div class="result-card__art-name">${escapeHtml(round.token.name)}</div>
                <div class="result-card__art-artist">${escapeHtml(artistName)}</div>
            </div>
        </div>
        <p class="result-card__detail">
            Round ${currentRound + 1} of ${gameRounds.length}
            ${score > 0 ? ` · Total: ${score}` : ""}
        </p>
    `;

    showScreen($resultScreen);

    // Auto-advance after delay
    setTimeout(() => {
        currentRound++;
        if (currentRound >= gameRounds.length) {
            endGame();
        } else {
            startRound();
        }
    }, 2200);
}

function endGame() {
    stopTimer();
    $hudCenter.classList.add("hidden");

    const totalRounds = gameRounds.length;
    const accuracy = totalRounds > 0 ? Math.round((correctCount / totalRounds) * 100) : 0;
    const durationSec = Math.round((Date.now() - startedAt) / 1000);

    $finalScore.textContent = score.toLocaleString();
    $finalStats.innerHTML = `
        <div class="stat-pill stat-pill--correct">
            <span class="stat-pill__value">${correctCount}</span>
            <span class="stat-pill__label">Correct</span>
        </div>
        <div class="stat-pill stat-pill--wrong">
            <span class="stat-pill__value">${incorrectCount}</span>
            <span class="stat-pill__label">Wrong</span>
        </div>
        <div class="stat-pill stat-pill--accuracy">
            <span class="stat-pill__value">${accuracy}%</span>
            <span class="stat-pill__label">Accuracy</span>
        </div>
        <div class="stat-pill">
            <span class="stat-pill__value">${formatDuration(durationSec)}</span>
            <span class="stat-pill__label">Time</span>
        </div>
    `;

    showScreen($overScreen);

    // Submit to Hackcade leaderboard
    sdk.gameOver(score, {
        durationSeconds: durationSec,
        metadata: {
            difficulty,
            correctCount,
            incorrectCount,
            accuracy,
            totalRounds,
        },
    });
}

function formatDuration(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

// ──────────────────────────────────────────────
// Game start flow (with preloader)
// ──────────────────────────────────────────────

async function startGameFlow(diff) {
    difficulty = diff;
    const cfg = DIFFICULTIES[diff];
    roundTimeSec = cfg.timeSec;
    currentRound = 0;
    score = 0;
    correctCount = 0;
    incorrectCount = 0;
    answered = false;
    paused = false;
    $hudScore.textContent = "0";

    const $loadProgressBar = document.getElementById("load-progress-bar");
    function updateLoading(msg, pct) {
        $loadStatus.textContent = msg;
        if ($loadProgressBar) $loadProgressBar.style.width = `${pct}%`;
    }

    // Show loading screen for prefetch
    showScreen($loadScreen);

    try {
        updateLoading("Initializing…", 0);

        // 1. Fetch all tokens (cached after first load)
        await fetchAllTokens((msg, pct) => updateLoading(msg, pct * 0.3)); // 0-30%

        // 2. Extract unique artists and resolve names
        const artistAddresses = [...new Set(allTokens.map((t) => t.primaryArtist))];
        await resolveArtistNames(artistAddresses, (msg, pct) => updateLoading(msg, 30 + (pct * 0.3))); // 30-60%

        // Check we have enough
        if (allArtists.length < 4) {
            updateLoading("Not enough artists with resolved names. Try again later.", 100);
            setTimeout(() => showScreen($menuScreen), 2000);
            return;
        }

        // 3. Select rounds
        updateLoading("Building rounds…", 60);
        gameRounds = selectRounds(Math.min(cfg.rounds, allTokens.length));

        if (gameRounds.length < cfg.rounds) {
            // Adjust if not enough unique tokens
            updateLoading(`Only ${gameRounds.length} rounds available (wanted ${cfg.rounds})`, 60);
        }

        // 4. Preload ALL images for this game
        await preloadGameImages(gameRounds, (msg, pct) => updateLoading(msg, 60 + (pct * 0.4))); // 60-100%

        updateLoading("Ready!", 100);
        await sleep(300);

        // 5. Start!
        startedAt = Date.now();
        startRound();
    } catch (err) {
        console.error("Game start failed:", err);
        $loadStatus.textContent = `Error: ${err.message}. Tap to retry.`;
        $loadScreen.addEventListener("click", () => startGameFlow(diff), { once: true });
    }
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

// ──────────────────────────────────────────────
// Event wiring
// ──────────────────────────────────────────────

// Difficulty select
for (const btn of document.querySelectorAll(".diff-card")) {
    btn.addEventListener("click", () => {
        const diff = btn.dataset.difficulty;
        if (diff && DIFFICULTIES[diff]) {
            startGameFlow(diff);
        }
    });
}

// Play again
$playAgain.addEventListener("click", () => showScreen($menuScreen));

// Hackcade SDK lifecycle
sdk.on("pause", () => {
    paused = true;
    stopTimer();
});
sdk.on("resume", () => {
    paused = false;
    if (!answered && gameRounds[currentRound]) {
        // Resume timer from where we left off
        timerInterval = setInterval(tickTimer, 50);
    }
});

// ──────────────────────────────────────────────
// Boot — signal ready, show menu
// ──────────────────────────────────────────────

const player = await sdk.ready();
$playerName.textContent = sdk.greeting();
showScreen($menuScreen);
