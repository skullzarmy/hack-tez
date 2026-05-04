/**
 * Hackcade SDK — postMessage bridge between game iframe and hack.tez platform.
 *
 * This is NOT a game engine. It is a thin umbilical to the platform:
 *   - Identity (current player domain, label, address, avatar URL)
 *   - Score reporting (live updates + final submission)
 *   - Lifecycle events (start, pause, resume)
 *
 * Use any rendering / physics / input / audio you like. The SDK does not care.
 *
 * Usage:
 *   const sdk = window.hackcade;
 *   const player = await sdk.getPlayer();   // identity
 *   await sdk.ready();                       // signal we're loaded
 *   sdk.on('start', () => startGame());
 *   sdk.updateScore(123);                    // live score in the chrome
 *   sdk.gameOver(456, { level: 3 });         // final score → leaderboard
 */
(function () {
    "use strict";

    if (window.hackcade) return; // already injected

    /** @typedef {{domain:string,label:string,address:string,avatarUrl:string,hackatarUrl:string}} HackcadePlayer */

    /** @type {string|null} */
    let sessionId = null;
    /** @type {HackcadePlayer|null} */
    let player = null;
    let initResolver = null;
    /** @type {Promise<HackcadePlayer>} */
    const initPromise = new Promise((resolve) => { initResolver = resolve; });

    /** @type {Record<string, Set<() => void>>} */
    const listeners = { start: new Set(), pause: new Set(), resume: new Set() };

    function send(msg) {
        try {
            window.parent.postMessage(msg, "*");
        } catch (_) {
            // parent gone or cross-origin issue — drop silently
        }
    }

    window.addEventListener("message", (e) => {
        const data = e && e.data;
        if (!data || typeof data !== "object") return;
        const type = data.type;
        if (typeof type !== "string" || !type.startsWith("hackcade:")) return;

        if (type === "hackcade:init") {
            sessionId = typeof data.sessionId === "string" ? data.sessionId : null;
            player = data.player || null;
            if (initResolver) {
                initResolver(player);
                initResolver = null;
            }
            return;
        }

        if (type === "hackcade:start" || type === "hackcade:pause" || type === "hackcade:resume") {
            const event = type.slice("hackcade:".length);
            const set = listeners[event];
            if (set) set.forEach((cb) => { try { cb(); } catch (_) {} });
        }
    });

    const sdk = {
        /** Tell the platform we're loaded and ready. Resolves once init has arrived. */
        async ready() {
            send({ type: "hackcade:ready" });
            await initPromise;
        },

        /** Get the current player. Resolves after init. Guests have empty domain/label="guest"/empty address. */
        async getPlayer() {
            if (player) return player;
            return initPromise;
        },

        /** Whether the current player is a guest (no hack.tez domain). */
        isGuest() {
            return !player || !player.domain;
        },

        /** Live score — shown in the platform chrome above the iframe. */
        updateScore(score) {
            if (typeof score !== "number" || !isFinite(score)) return;
            send({ type: "hackcade:score", score: Math.floor(score), sessionId });
        },

        /** Final score — submits to the leaderboard (if authenticated). */
        gameOver(finalScore, metadata) {
            if (typeof finalScore !== "number" || !isFinite(finalScore)) finalScore = 0;
            send({
                type: "hackcade:gameover",
                score: Math.floor(finalScore),
                sessionId,
                metadata: metadata && typeof metadata === "object" ? metadata : undefined,
            });
        },

        /** Subscribe to platform lifecycle events. Returns an unsubscribe fn. */
        on(event, callback) {
            const set = listeners[event];
            if (!set || typeof callback !== "function") return () => {};
            set.add(callback);
            return () => set.delete(callback);
        },
    };

    Object.defineProperty(window, "hackcade", { value: sdk, writable: false, configurable: false });
})();
