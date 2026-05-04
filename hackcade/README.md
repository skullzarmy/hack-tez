# Hackcade

Build browser arcade games for **hack.tez**. Drop a zip with an `index.html`, get pinned to IPFS, show up on the lobby with your hack.tez identity stamped on it.

> _Insert coin. Claim your name._

This directory contains:

```
hackcade/
├── sdk/                       # Canonical SDK (don't fork — the platform overwrites your copy on submit)
│   ├── hackcade-sdk.js        # ~100 LOC postMessage bridge
│   └── hackcade-sdk.d.ts      # TypeScript types
├── template/                  # Bare-minimum starting point — copy and edit
└── games/                     # Built-in starter games (zip-ready bundles)
```

---

## Quickstart

```bash
cp -R hackcade/template my-cool-game
cd my-cool-game
# edit index.html, game.js, style.css …
zip -r ../my-cool-game.zip .   # zip the contents (index.html at root)
```

Then sign in with your hack.tez wallet, hit **Submit Game** on `/arcade`, drop the zip. `admin.hack.tez` reviews and approves. Done.

> **Heads up:** The platform always overwrites `hackcade-sdk.js` in your bundle with the canonical SDK from this folder. Don't try to ship a tampered SDK — submitters can't fake the player object or session token.

---

## SDK at a glance

```js
const sdk = window.hackcade;

await sdk.ready();                               // tell platform we're booted
const player = await sdk.getPlayer();            // { domain, label, address, avatarUrl, hackatarUrl }

sdk.updateScore(123);                            // live score in chrome
sdk.gameOver(456, { level: 3 });                 // final → leaderboard

const off = sdk.on("pause", () => pauseGame());  // returns unsubscribe fn
```

Full API + protocol + worked example: see [`src/skills/hackcade-sdk.md`](../src/skills/hackcade-sdk.md). It's the LLM-ready skill — point your AI agent at it and let it write your game.

---

## Bundle rules

| Requirement | Detail |
|---|---|
| Entry point | `index.html` at the bundle root |
| Max zip size | 5 MB compressed |
| Max uncompressed | 25 MB |
| Max files | 200 |
| Max per file | 4 MB |
| Allowed extensions | `html, htm, js, mjs, css, json, png, jpg, jpeg, gif, webp, svg, wav, mp3, ogg, woff, woff2, ttf, txt, map` |
| Static only | iframe sandbox is `allow-scripts` — no same-origin, no top-nav, no popups |

A single top-level wrapper directory is auto-stripped (`my-game/index.html` → `index.html`). macOS metadata (`__MACOSX/`, `.DS_Store`, `._*`) is filtered out.

---

## Mobile-first

Most hack.tez users are on phones. Build for a thumb in portrait orientation:

- Use `pointerdown` / `touchstart`, never rely on `:hover`.
- Add the viewport meta tag.
- Size your canvas to its container, honor `devicePixelRatio`.
- Put interactive UI in the lower 2/3 of the screen.

---

## Local development

The SDK is bundled in every game folder. To test standalone (no platform), mock the parent:

```js
// dev-mock.js — load BEFORE hackcade-sdk.js during local dev
window.addEventListener("message", (e) => {
    if (e.data?.type === "hackcade:ready") {
        window.postMessage({
            type: "hackcade:init",
            sessionId: "dev",
            player: { domain: "dev.hack.tez", label: "dev", address: "tz1Dev", avatarUrl: "", hackatarUrl: "" },
        }, "*");
    }
});
```

Then just open `index.html` in a browser. (For mobile testing, `npx serve .`.)

---

## Anti-cheat

When you submit a game you can declare:

- `maxPossibleScore` — server rejects any score above this.
- `maxScorePerSecond` — server rejects scores above `maxScorePerSecond * durationSeconds + 5`.

Set these realistically. The server enforces them.

The session token (`sessionId`) is bound to one play. The SDK echoes it on every score message, so any other tab on the IPFS gateway can't spoof scores into your game's session.

---

## Submission, updates, moderation

- Submit → status `pending` → admin previews + approves → `active` (live in the lobby).
- Update: upload a new zip from your game's page. Optional "reset leaderboard" checkbox. The current version keeps serving until the new one is approved.
- Removal: scores are preserved for audit; affected player stats are recomputed.

See `src/skills/hackcade-sdk.md` for the full protocol, anti-cheat details, and a complete working example.
