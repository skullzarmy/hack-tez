---
title: "Hackcade Game SDK"
description: "Build arcade games for the hack.tez Hackcade. Complete SDK reference, bundle format, postMessage protocol, anti-cheat constraints, and a working example for browser games that integrate with hack.tez identity and leaderboards."
tags: [hackcade, games, sdk, arcade, ipfs, postmessage]
---

# Hackcade Game SDK

Hackcade games are static web bundles (HTML/JS/CSS/assets) that run inside a sandboxed iframe served from IPFS. The platform passes the player's hack.tez identity into the game and accepts score reports back.

The SDK is intentionally tiny (~100 lines). It does **not** ship a renderer, physics, audio, or game loop — pick any tools you like (vanilla canvas, Phaser, PixiJS, Kaboom.js, plain DOM). The SDK is just the umbilical to the platform.

## Bundle format

| Requirement | Detail |
|---|---|
| Entry point | `index.html` at the bundle root |
| Max zip size | 5 MB compressed |
| Max uncompressed | 25 MB total |
| Max files | 200 entries |
| Max per file | 4 MB |
| Allowed extensions | `html, htm, js, mjs, css, json, png, jpg, jpeg, gif, webp, svg, wav, mp3, ogg, woff, woff2, ttf, txt, map` |
| Static only | No server-side code; iframe runs with `sandbox="allow-scripts"` (no same-origin, no top-nav, no popups) |
| SDK | `hackcade-sdk.js` is auto-injected by the platform — do not bundle a different copy; submission overwrites it with the canonical SDK |

The platform will:
1. Strip macOS noise (`__MACOSX/`, `.DS_Store`, `._*`).
2. Auto-inject `<script src="hackcade-sdk.js"></script>` into `index.html` if missing (preferred location: just before `</head>`).
3. Always overwrite `hackcade-sdk.js` with the canonical SDK so submitters can't tamper with player identity or session tokens.
4. Pin the directory to IPFS via Pinata. The game then loads from `https://gateway.pinata.cloud/ipfs/<cid>/`.

## SDK API

```ts
interface HackcadePlayer {
    domain: string;       // "skull.hack.tez" — empty for guests
    label: string;        // "skull" — "guest" for guests
    address: string;      // "tz1..." — empty for guests
    avatarUrl: string;    // profile picture or hackatar URL
    hackatarUrl: string;  // generative hackatar (always present for authenticated players)
}

interface HackcadeSDK {
    ready(): Promise<HackcadePlayer>;          // resolve when platform sends init
    getPlayer(): Promise<HackcadePlayer>;
    isGuest(): boolean;                        // true if no hack.tez domain
    updateScore(score: number): void;          // live, shown in chrome
    gameOver(finalScore: number, metadata?: Record<string, unknown>): void;
    on(event: 'start' | 'pause' | 'resume', cb: () => void): () => void;
}

declare const hackcade: HackcadeSDK; // window.hackcade
```

### `ready()`

Call once during boot. Sends `hackcade:ready` to the platform and resolves once `hackcade:init` arrives. The platform shows a CRT-style loader until `ready()` is signalled or 30 s elapse (the player sees a retry button on timeout).

```js
const player = await window.hackcade.ready();
```

### `getPlayer()`

Returns the player object. Resolves after init. For guests `domain === ""` and `label === "guest"` — you can still play, but `gameOver()` will not submit a leaderboard entry.

### `updateScore(score)`

Push the live score to the platform chrome above the iframe. Cheap; safe to call on every frame, but don't spam — once per change is enough.

### `gameOver(finalScore, metadata?)`

Final score. The platform performs sanity checks server-side:
- `finalScore <= maxPossibleScore` (set by the builder at submit time, optional)
- `finalScore <= maxScorePerSecond * durationSeconds + 5` (optional)
- session must be active, unsubmitted, and ≤2 h old
- one score per session — start a new session for another play

Pass any extra context in `metadata` (level reached, accuracy, etc.). Stored in `arcade_scores.metadata` (JSONB).

### `on(event, cb)`

Subscribe to platform lifecycle events. Returns an unsubscribe function.
- `start` — sent after the player explicitly starts a session (you may already have an in-game start screen; this is the *platform* start).
- `pause` — platform requests you pause (e.g. user opened the leaderboard panel).
- `resume` — platform requests you resume.

## postMessage protocol

The SDK is a thin wrapper around `window.parent.postMessage`. If you want to bypass the SDK (rare), here is the raw protocol:

```ts
// Platform → game
type ParentMessage =
  | { type: 'hackcade:init'; player: HackcadePlayer; sessionId: string }
  | { type: 'hackcade:start' }
  | { type: 'hackcade:pause' }
  | { type: 'hackcade:resume' };

// Game → platform — sessionId is REQUIRED on score-bearing messages
type GameMessage =
  | { type: 'hackcade:ready' }
  | { type: 'hackcade:score'; score: number; sessionId: string }
  | { type: 'hackcade:gameover'; score: number; sessionId: string; metadata?: object };
```

The IPFS gateway origin (`https://gateway.pinata.cloud`) is shared with every IPFS-hosted page in the world, so the platform validates messages by `sessionId`, not by `event.origin`. The SDK echoes the sessionId for you automatically.

## Mobile-first guidance

Most hack.tez users are on phones. Build mobile-first:
- Use `pointerdown`/`touchstart` rather than `click` for responsiveness.
- Size the canvas to its container; honor `devicePixelRatio` for crisp rendering.
- Don't rely on `:hover` states.
- Prefer portrait layouts — most users won't rotate.
- Put interactive UI in the lower 2/3 of the screen (thumb reach).
- Add `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />`.

## Complete working example

A minimal tap-the-target game (counts taps for 30 s):

```html
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <title>Tap Trainer</title>
    <style>
        html, body { margin: 0; height: 100%; background: #0a0e0d; color: #e6fff8;
            font-family: system-ui, sans-serif; user-select: none; touch-action: manipulation; }
        #stage { position: fixed; inset: 0; display: flex; flex-direction: column; }
        .hud { display: flex; justify-content: space-between; padding: 0.75rem 1rem;
            background: rgba(0,0,0,0.35); font-weight: 700; }
        #score { color: #00ffc8; font-variant-numeric: tabular-nums; }
        .center { flex: 1; display: flex; align-items: center; justify-content: center; }
        #target { width: 40vmin; height: 40vmin; border-radius: 50%; background: #00ffc8;
            color: #000; display: flex; align-items: center; justify-content: center;
            font-weight: 700; font-size: 1.5rem; }
        #target:active { transform: scale(0.92); }
    </style>
</head>
<body>
    <div id="stage">
        <div class="hud"><span id="player">…</span><span id="score">0</span></div>
        <div class="center"><div id="target">TAP</div></div>
    </div>
    <script src="hackcade-sdk.js"></script>
    <script>
    (async () => {
        const sdk = window.hackcade;
        await sdk.ready();
        const player = await sdk.getPlayer();
        document.getElementById("player").textContent = player.domain || "guest";

        let score = 0;
        const t0 = Date.now();
        const target = document.getElementById("target");
        target.addEventListener("pointerdown", () => {
            score += 1;
            document.getElementById("score").textContent = String(score);
            sdk.updateScore(score);
        }, { passive: true });

        setTimeout(() => sdk.gameOver(score, { durationMs: Date.now() - t0 }), 30_000);
    })();
    </script>
</body>
</html>
```

## Anti-cheat tips for builders

- Set `maxPossibleScore` and `maxScorePerSecond` realistically when you submit. The server enforces them.
- Don't trust input that crosses the boundary — the SDK already drops messages with a wrong `sessionId`, so any "remote control" attacks against your game's scoring code are already blocked at the platform layer.
- Rate-limit `updateScore` calls in your own game logic if you want a smoother chrome readout — every call is a postMessage.

## Local development

The SDK degrades gracefully when there's no parent — `ready()` will hang forever. To develop standalone, mock the parent:

```js
// dev-mock.js — load BEFORE hackcade-sdk.js
window.addEventListener("message", (e) => {
    if (e.data?.type === "hackcade:ready") {
        window.postMessage({
            type: "hackcade:init",
            sessionId: "dev",
            player: {
                domain: "dev.hack.tez", label: "dev", address: "tz1Dev",
                avatarUrl: "", hackatarUrl: "",
            },
        }, "*");
    }
});
```

## Submission flow

1. Zip the contents of your bundle (the `index.html` should be at the root of the zip — a single nested top-level dir is auto-stripped).
2. Visit `/arcade/submit` while connected with your hack.tez wallet.
3. Fill in title, description, category, and (optional) `maxPossibleScore` / `maxScorePerSecond`.
4. Upload. The platform validates, pins to IPFS, and queues your game for `admin.hack.tez` review.
5. Watch your "My Games" panel — once approved, your game goes live in the lobby and players can start submitting scores.

Updates work the same way: from your game's page, click **Update Game**, upload a new zip, optionally request a leaderboard wipe. The current version keeps serving until the new one is approved.
