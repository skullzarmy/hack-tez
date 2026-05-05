# Hackcade

Build browser arcade games for **hack.tez**. Drop a zip with an `index.html`, get pinned to IPFS, show up on the lobby with your hack.tez identity stamped on it.

> _Insert coin. Claim your name._

This directory contains:

```
hackcade/
├── sdk/                       # Canonical SDK (don't fork — the platform overwrites your copy on submit)
│   ├── hackcade-sdk.js        # ESM postMessage bridge (~150 LOC)
│   └── hackcade-sdk.d.ts      # TypeScript types
├── template/                  # Bare-minimum starting point — copy and edit
└── games/                     # Reference games (zip-ready bundles)
    └── whack-a-reggie/        # Canonical reference — read this for a real example
```

---

## Quickstart

**Option A — clone the template directly via curl:**

```bash
mkdir my-cool-game && cd my-cool-game
curl -O https://raw.githubusercontent.com/skullzarmy/hack-tez/main/hackcade/template/index.html
curl -O https://raw.githubusercontent.com/skullzarmy/hack-tez/main/hackcade/template/style.css
curl -O https://raw.githubusercontent.com/skullzarmy/hack-tez/main/hackcade/template/game.js
curl -O https://raw.githubusercontent.com/skullzarmy/hack-tez/main/hackcade/sdk/hackcade-sdk.js
# edit index.html, game.js, style.css …
zip -r ../my-cool-game.zip .   # zip the contents (index.html at root)
```

**Option B — clone the repo and copy:**

```bash
git clone https://github.com/skullzarmy/hack-tez.git
cp -R hack-tez/hackcade/template my-cool-game
cd my-cool-game
zip -r ../my-cool-game.zip .
```

Then sign in with your hack.tez wallet, hit **Submit Game** on `/arcade`, drop the zip. `admin.hack.tez` reviews and approves. Done.

> **Heads up:** The platform always overwrites `hackcade-sdk.js` in your bundle with the canonical SDK from this folder. Don't try to ship a tampered SDK — submitters can't fake the player object or session token.

### Direct downloads

| File | Direct (raw) URL |
|---|---|
| Canonical SDK | <https://raw.githubusercontent.com/skullzarmy/hack-tez/main/hackcade/sdk/hackcade-sdk.js> |
| TypeScript types | <https://raw.githubusercontent.com/skullzarmy/hack-tez/main/hackcade/sdk/hackcade-sdk.d.ts> |
| Template (browse) | <https://github.com/skullzarmy/hack-tez/tree/main/hackcade/template> |
| Skills doc (LLM) | <https://raw.githubusercontent.com/skullzarmy/hack-tez/main/src/skills/hackcade-sdk.md> |

---

## SDK at a glance

The SDK is **ESM only**. Import it as a module:

```html
<script type="module" src="game.js"></script>
```

```js
// game.js
import sdk from "./hackcade-sdk.js";

// Boot: signal ready, then read identity.
const player = await sdk.ready();
document.getElementById("hi").textContent = sdk.greeting();   // "Hi, skull.hack.tez"

// Live score (shown in platform chrome).
sdk.updateScore(123);

// Final score → leaderboard.
sdk.gameOver(456, { durationMs: 30_000, metadata: { level: 3 } });

// Two-way: react to platform pause/resume.
sdk.on("pause", pauseGame);
sdk.on("resume", resumeGame);
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

Easiest path: use the **`/arcade/sandbox`** page on the live site (or your local dev server) — drop your zip in, it runs entirely in your browser with mocked identity, lifecycle controls, and a full event log. No server, no submission needed.

The same sandbox is also embedded in the Submit form as **▶ Preview locally** — always preview before you submit.

If you want to run truly standalone (no hack.tez at all), the SDK degrades gracefully: `ready()` will hang because there's no parent. Mock the parent yourself:

```js
// dev-mock.js — load BEFORE the SDK module during local dev
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

---

## Anti-cheat

When you submit a game you can declare:

- `maxPossibleScore` — server rejects any score above this.
- `maxScorePerSecond` — server rejects scores above `maxScorePerSecond * durationSeconds + 5`.

Set these realistically. The server enforces them.

The session token (`sessionId`) is bound to one play. The SDK echoes it on every score message, so any other tab on the IPFS gateway can't spoof scores into your game's session.

---

## Submission, updates, moderation

- **Submit** → status `pending` → admin previews + approves → `active` (live in the lobby).
- **Edit (pending)** → creator can change description, category, source URL, score caps, and even swap the zip in place — no version bump, still pending.
- **Edit (active/flagged)** → creator can edit metadata only. To ship a new build, use Update.
- **Update** → upload a new zip from your game's page. Optional "reset leaderboard" checkbox. Current version keeps serving until the new one is approved.
- **Rescind (pending)** → creator can hard-delete their own pending submission before review.
- **Removal** → admin-only, on `flagged` games. Scores are preserved for audit; affected player stats are recomputed.

See `src/skills/hackcade-sdk.md` for the full protocol, anti-cheat details, and a complete working example.
