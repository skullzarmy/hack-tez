/**
 * Hackcade SDK — postMessage bridge between game iframe and the hack.tez Hackcade.
 *
 * ESM only. Import as a module:
 *
 *     <script type="module">
 *       import sdk from "./hackcade-sdk.js";
 *       const player = await sdk.ready();
 *       sdk.events.addEventListener("start", () => start());
 *       sdk.updateScore(123);
 *       sdk.gameOver(456, { level: 3 });
 *     </script>
 *
 * The SDK is intentionally tiny — it does NOT ship a renderer, physics, audio,
 * or input. Use anything you like. The SDK is just the umbilical to the
 * platform: identity in, score out, lifecycle in both directions.
 *
 * Two-way protocol:
 *   game → platform:  hackcade:ready, hackcade:score, hackcade:gameover, hackcade:event
 *   platform → game:  hackcade:init, hackcade:start, hackcade:pause, hackcade:resume, hackcade:visibility
 *
 * @typedef {object} HackcadePlayer
 * @property {string} domain      Full name, e.g. "skull.hack.tez". Empty for guests.
 * @property {string} label       Label only, e.g. "skull". "guest" for unauthenticated.
 * @property {string} address     tz1... wallet address. Empty for guests.
 * @property {string} avatarUrl   Profile picture or hackatar URL.
 * @property {string} hackatarUrl Generative hackatar URL (always set for authed players).
 *
 * @typedef {"start"|"pause"|"resume"|"visibility"} HackcadeEventName
 */

const events = new EventTarget();

let _player = /** @type {HackcadePlayer|null} */ (null);
let _session = /** @type {string|null} */ (null);
let _ready = false;
let _resolveReady = /** @type {((p: HackcadePlayer) => void) | null} */ (null);
const _readyPromise = /** @type {Promise<HackcadePlayer>} */ (
    new Promise((res) => {
        _resolveReady = res;
    })
);

function send(msg) {
    try {
        window.parent.postMessage(msg, "*");
    } catch {
        /* parent gone */
    }
}

window.addEventListener("message", (e) => {
    const data = e && e.data;
    if (!data || typeof data !== "object") return;
    const type = data.type;
    if (typeof type !== "string" || !type.startsWith("hackcade:")) return;

    if (type === "hackcade:init") {
        _session = typeof data.sessionId === "string" ? data.sessionId : null;
        _player = data.player || makeGuest();
        _ready = true;
        if (_resolveReady) {
            _resolveReady(_player);
            _resolveReady = null;
        }
        events.dispatchEvent(new CustomEvent("init", { detail: { player: _player, session: _session } }));
        return;
    }

    const name = type.slice("hackcade:".length);
    if (name === "start" || name === "pause" || name === "resume" || name === "visibility") {
        events.dispatchEvent(new CustomEvent(name, { detail: data }));
    }
});

function makeGuest() {
    return {
        domain: "",
        label: "guest",
        address: "",
        avatarUrl: "",
        hackatarUrl: "",
    };
}

const sdk = {
    /** Live `EventTarget` for `init`, `start`, `pause`, `resume`, `visibility`. */
    events,

    /** Synchronous accessor for the current player. `null` until `ready()` resolves. */
    get player() {
        return _player;
    },

    /** Synchronous accessor for the current session id. `null` until `ready()` resolves. */
    get session() {
        return _session;
    },

    /** Whether the platform has sent `init`. */
    get isReady() {
        return _ready;
    },

    /**
     * Tell the platform we're loaded. Resolves with the player once `init` arrives.
     * Call this once during boot. Safe to await many times.
     * @returns {Promise<HackcadePlayer>}
     */
    async ready() {
        send({ type: "hackcade:ready" });
        return _readyPromise;
    },

    /**
     * Get the current player. Resolves after `init`.
     * @returns {Promise<HackcadePlayer>}
     */
    async getPlayer() {
        if (_player) return _player;
        return _readyPromise;
    },

    /** True if the player has no hack.tez domain. */
    isGuest() {
        return !_player || !_player.domain;
    },

    /**
     * Friendly greeting helper: "Hi, skull.hack.tez" or "Hi, guest".
     * @returns {string}
     */
    greeting() {
        if (!_player || !_player.domain) return "Hi, guest";
        return `Hi, ${_player.domain}`;
    },

    /**
     * Update the live score shown in the platform chrome above the iframe.
     * Call as often as you like during play.
     * @param {number} score
     */
    updateScore(score) {
        if (typeof score !== "number" || !isFinite(score)) return;
        send({ type: "hackcade:score", score: Math.floor(score), sessionId: _session });
    },

    /**
     * Submit the final score to the leaderboard. The platform will only persist
     * scores for authenticated players (guests' results are dropped).
     * @param {number} finalScore
     * @param {object} [options]
     * @param {number} [options.durationSeconds]  Duration of the round in seconds.
     * @param {number} [options.durationMs]       Or in milliseconds.
     * @param {Record<string, unknown>} [options.metadata]  Free-form metadata for the entry.
     */
    gameOver(finalScore, options) {
        let score = Math.floor(typeof finalScore === "number" && isFinite(finalScore) ? finalScore : 0);
        const durationSeconds = options && typeof options.durationSeconds === "number"
            ? options.durationSeconds
            : undefined;
        const durationMs = options && typeof options.durationMs === "number" ? options.durationMs : undefined;
        const metadata = options && options.metadata && typeof options.metadata === "object"
            ? options.metadata
            : undefined;
        send({
            type: "hackcade:gameover",
            score,
            sessionId: _session,
            durationSeconds,
            durationMs,
            metadata,
        });
    },

    /**
     * Convenience event subscription. Same as `events.addEventListener` but returns
     * an unsubscribe function.
     * @param {HackcadeEventName | "init"} event
     * @param {(detail: any) => void} handler
     * @returns {() => void}
     */
    on(event, handler) {
        const wrapped = (e) => handler(e.detail);
        events.addEventListener(event, wrapped);
        return () => events.removeEventListener(event, wrapped);
    },
};

export default sdk;
export { events };
