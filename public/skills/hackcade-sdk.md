---
title: "Hackcade Game SDK"
description: "Build arcade games for the hack.tez Hackcade. ESM SDK reference, two-way postMessage protocol, identity examples, anti-cheat constraints, local sandbox, and a working example."
tags: [hackcade, games, sdk, arcade, netlify-blobs, postmessage]
---

# Hackcade Game SDK

Hackcade games are static web bundles (HTML/JS/CSS/assets) that run inside a sandboxed iframe served from Netlify Blobs. The platform passes the player's hack.tez identity into the game and accepts score reports back.

The SDK is intentionally tiny (~150 lines). It does **not** ship a renderer, physics, audio, or game loop — pick any tools you like (vanilla canvas, Phaser, PixiJS, Kaboom.js, plain DOM). The SDK is just the umbilical to the platform: identity in, score out, lifecycle in both directions.

> **ESM only.** The SDK is a JavaScript module. Import it with `<script type="module">`. There is no global `window.hackcade`.

## Get the SDK + template

The SDK and a starter template live in the [hack-tez repo](https://github.com/skullzarmy/hack-tez) under `hackcade/`. Direct downloads:

| File | Direct (raw) URL |
|---|---|
| Canonical SDK | <https://raw.githubusercontent.com/skullzarmy/hack-tez/main/hackcade/sdk/hackcade-sdk.js> |
| TypeScript types | <https://raw.githubusercontent.com/skullzarmy/hack-tez/main/hackcade/sdk/hackcade-sdk.d.ts> |
| Template `index.html` | <https://raw.githubusercontent.com/skullzarmy/hack-tez/main/hackcade/template/index.html> |
| Template `style.css` | <https://raw.githubusercontent.com/skullzarmy/hack-tez/main/hackcade/template/style.css> |
| Template `game.js` | <https://raw.githubusercontent.com/skullzarmy/hack-tez/main/hackcade/template/game.js> |
| Browse template dir | <https://github.com/skullzarmy/hack-tez/tree/main/hackcade/template> |
| Reference game (whack-a-reggie) | <https://github.com/skullzarmy/hack-tez/tree/main/hackcade/games/whack-a-reggie> |

```bash
# scaffold a new game in one go
mkdir my-cool-game && cd my-cool-game
for f in index.html style.css game.js; do
  curl -O "https://raw.githubusercontent.com/skullzarmy/hack-tez/main/hackcade/template/$f"
done
curl -O https://raw.githubusercontent.com/skullzarmy/hack-tez/main/hackcade/sdk/hackcade-sdk.js
```

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
2. Auto-inject `<script type="module" src="hackcade-sdk.js"></script>` into `index.html` if missing.
3. Always overwrite `hackcade-sdk.js` with the canonical SDK so submitters can't tamper with player identity or session tokens.
4. Store the bundle in Netlify Blobs.

## SDK API

```ts
interface HackcadePlayer {
    domain: string;       // "skull.hack.tez" — empty for guests
    label: string;        // "skull" — "guest" for guests
    address: string;      // "tz1..." — empty for guests
    avatarUrl: string;    // profile picture or hackatar URL
    hackatarUrl: string;  // generative hackatar (always present for authed players)
}

type HackcadeEventName = "init" | "start" | "pause" | "resume" | "visibility";

interface HackcadeGameOverOptions {
    durationSeconds?: number;
    durationMs?: number;
    metadata?: Record<string, unknown>;
}

interface HackcadeSDK {
    readonly events: EventTarget;            // typed lifecycle events
    readonly player: HackcadePlayer | null;  // null until ready
    readonly session: string | null;
    readonly isReady: boolean;

    ready(): Promise<HackcadePlayer>;
    getPlayer(): HackcadePlayer | null;
    isGuest(): boolean;
    greeting(): string;                      // "Hi, skull.hack.tez" or "Hi, guest"

    updateScore(score: number): void;
    gameOver(finalScore: number, options?: HackcadeGameOverOptions): void;

    on(event: HackcadeEventName, handler: (e: Event) => void): () => void;
}

declare const sdk: HackcadeSDK;

export default sdk;
export const events: EventTarget;
```

### Hello, player

```html
<script type="module">
  import sdk from "./hackcade-sdk.js";

  // Wait for the platform to send identity.
  const player = await sdk.ready();

  // Use it however you want.
  document.getElementById("hi").textContent = sdk.greeting(); // "Hi, skull.hack.tez"
  if (player.hackatarUrl) {
    const img = new Image();
    img.src = player.hackatarUrl;
    document.body.appendChild(img);
  }
</script>
```

### Live score + game over

```js
import sdk from "./hackcade-sdk.js";

let score = 0;
const startedAt = Date.now();

function tap() {
  score += 1;
  sdk.updateScore(score);   // shown in platform chrome above the iframe
}

function endRound() {
  sdk.gameOver(score, {
    durationMs: Date.now() - startedAt,
    metadata: { difficulty: "normal" },  // anything JSON-serialisable
  });
}
```

> **Note**: `gameOver` takes the final score as the first argument and an options object as the second. The options object can carry `durationSeconds` OR `durationMs` (the platform converts to ms server-side) plus arbitrary metadata.

### Two-way: react to platform lifecycle

The platform may pause your game (e.g. the player swipes the leaderboard panel open). Your game should respect it:

```js
import sdk from "./hackcade-sdk.js";

let paused = false;

sdk.on("pause", () => {
  paused = true;
  myAudio.pause();
});

sdk.on("resume", () => {
  paused = false;
  myAudio.play();
});

// `start` is sent after the player explicitly starts a session from the
// platform side. Most games also have their own start screen — that's fine.
sdk.on("start", () => console.log("platform sent start"));

// `visibility` fires when the iframe is hidden/shown (tab switch, etc).
sdk.on("visibility", (e) => {
  // CustomEvent with detail: { hidden: boolean }
  console.log("visible:", !e.detail.hidden);
});
```

`sdk.on(event, handler)` is sugar for `sdk.events.addEventListener(event, handler)` and returns an unsubscribe function. You can also use `sdk.events` directly if you prefer.

## postMessage protocol

The SDK is a thin wrapper around `window.parent.postMessage`. The two-way protocol:

```
Game → Platform                 Platform → Game
─────────────────               ─────────────────────
hackcade:ready          ───►    hackcade:init { player, sessionId }
                                hackcade:start
                                hackcade:pause
                                hackcade:resume
                                hackcade:visibility { hidden }

hackcade:score          ───►
hackcade:gameover       ───►
```

If you want to bypass the SDK (rare), here is the raw protocol:

```ts
type ParentMessage =
  | { type: "hackcade:init"; player: HackcadePlayer; sessionId: string }
  | { type: "hackcade:start" }
  | { type: "hackcade:pause" }
  | { type: "hackcade:resume" }
  | { type: "hackcade:visibility"; hidden: boolean };

type GameMessage =
  | { type: "hackcade:ready" }
  | { type: "hackcade:score"; score: number; sessionId: string }
  | { type: "hackcade:gameover"; score: number; sessionId: string; metadata?: object };
```

The blob origin may be shared with other hosted blobs, so the platform validates messages by `sessionId`, not by `event.origin`. The SDK echoes the sessionId for you automatically.

## Local sandbox

You don't need to submit to test. The platform ships a local sandbox at **`/arcade/sandbox`** — drop your zip in, it runs entirely in your browser. Same SDK injection, same iframe sandboxing, plus:

- Mock identity panel (toggle guest vs. named, edit label/address).
- Lifecycle controls (Send start / pause / resume).
- Live event log of every `hackcade:*` message in both directions.
- Reload button to restart the iframe with fresh identity.

The sandbox is also embedded into the Submit form — once you pick a zip, click **▶ Preview locally** before hitting Submit.

## Mobile-first guidance

Most hack.tez users are on phones. Build mobile-first:
- Use `pointerdown`/`touchstart` rather than `click` for responsiveness.
- Size the canvas to its container; honor `devicePixelRatio` for crisp rendering.
- Don't rely on `:hover` states.
- Prefer portrait layouts — most users won't rotate.
- Put interactive UI in the lower 2/3 of the screen (thumb reach).
- Add `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />`.

## Complete working example

A minimal tap-the-target game that reads identity, reports score live, and submits a final score after 30 seconds:

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
    <script type="module">
      import sdk from "./hackcade-sdk.js";

      const player = await sdk.ready();
      document.getElementById("player").textContent = sdk.greeting();

      let score = 0;
      const t0 = Date.now();
      const target = document.getElementById("target");
      target.addEventListener("pointerdown", () => {
          score += 1;
          document.getElementById("score").textContent = String(score);
          sdk.updateScore(score);
      }, { passive: true });

      sdk.on("pause", () => target.style.opacity = "0.4");
      sdk.on("resume", () => target.style.opacity = "1");

      setTimeout(() => sdk.gameOver(score, { durationMs: Date.now() - t0 }), 30_000);
    </script>
</body>
</html>
```

## Anti-cheat tips for builders

- Set `maxPossibleScore` and `maxScorePerSecond` realistically when you submit. The server enforces them.
- Don't trust input that crosses the iframe boundary — the SDK already drops messages with a wrong `sessionId`, so "remote control" attacks against your game's scoring code are blocked at the platform layer.
- Rate-limit `updateScore` calls in your own game logic if you want a smoother chrome readout — every call is a postMessage.

## Submission flow

1. Zip the contents of your bundle (the `index.html` should be at the root of the zip — a single nested top-level dir is auto-stripped).
2. Visit `/arcade/submit` while connected with your hack.tez wallet.
3. Fill in title, description, category, and (optional) `maxPossibleScore` / `maxScorePerSecond`.
4. Upload your zip.
5. **Click "▶ Preview locally"** to verify it boots and identity wires up.
6. Submit. The platform validates, stores the bundle in Netlify Blobs, and queues your game for `admin.hack.tez` review.
7. Watch your "My Games" panel — once approved, your game goes live in the lobby and players can start submitting scores.

Updates work the same way: from your game's page, click **Update Game**, upload a new zip, optionally request a leaderboard wipe. The current version keeps serving until the new one is approved.
