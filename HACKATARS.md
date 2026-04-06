# Hackatars

Deterministic generative avatars for hack.tez domains. Every domain gets a unique hackatar — a glitchy, LED-pixel-grid identity derived from a seeded PRNG.

## How It Works

The hackatar engine (`src/lib/hackatar/`) is a pure-JS generative art pipeline:

1. **Seed** → 32-bit integer derived from a deterministic input string
2. **PRNG** → mulberry32 seeded with that integer
3. **Traits** → palette, grid density, symmetry, glitch effects selected by PRNG
4. **Grid** → wave-interference pattern rendered to a pixel grid
5. **Glitch** → RGB shift, scanlines, jitter, noise, frame splits layered on top
6. **Output** → RGBA pixel frames (192×192) encoded to GIF server-side

Same seed → same hackatar, always.

---

## Seeding Strategy

### Phase 1 — Salted Domain Name (current)

Every hackatar is seeded from a deterministic string:

```
SALT + PEPPER + label
```

- **Salt:** `ReggieRocksFAFO4life` — project-specific constant
- **Pepper:** `a7f3c9e2b1d4f805` — fixed pseudorandom hex string
- **Label:** the bare subdomain label (e.g. `skllz`)

This guarantees every registered domain gets a hackatar regardless of how it was registered (contract call, admin preload, etc). The string is hashed via djb2 to produce the 32-bit PRNG seed.

**Trade-off:** Hackatars are tied to the label, not to a unique on-chain event. Two different registrars with the same label would produce the same hackatar. Acceptable for phase 1.

### Phase 2 — Rerandomize via Transaction

Add a **rerandomize** action that lets users spend a nominal fee (a few mutez) to generate a new on-chain transaction. The resulting `opHash` replaces the salted-domain seed for that label.

**Flow:**
1. User clicks "Rerandomize" on their profile
2. Frontend sends a small transaction to a rerandomize entrypoint on the registrar contract
3. Transaction confirms → new `opHash` is recorded
4. Server invalidates the cached hackatar and regenerates with the new opHash seed
5. User sees their new hackatar

**Contract changes needed:**
- New `rerandomize` entrypoint that accepts a nominal tez amount (e.g. 0.01 XTZ)
- Stores `rerandomize_hash` in a big_map keyed by label
- Only the domain owner can call it

**Server changes needed:**
- `handleHackatar` checks for a `rerandomize_hash` before falling back to salted domain
- Blob cache invalidation on rerandomize (versioned cache keys or TTL)

**Revenue potential:** Even at 0.01 XTZ per rerandomize, this creates a fun micro-transaction loop. Users who want to "reroll" their identity pay a tiny fee. Could accumulate meaningfully at scale.

### Phase 3 — Mintable Hackatars

Hackatars become mintable NFTs (FA2 tokens on Tezos). The generative art is frozen at mint time — the seed used to generate the minted hackatar is recorded on-chain and immutable.

**Open questions:**
- Mint from the current hackatar state (salted or rerandomized)?
- Separate FA2 contract or extend the registrar?
- Metadata format (TZIP-21 with on-chain SVG/GIF or IPFS-pinned image)?
- Royalty structure?
- Can you mint and still rerandomize (mint snapshots the current state)?

---

## API

```
GET /api/v1/hackatar/:label          → animated GIF (30 frames, 80ms, 2.4s loop)
GET /api/v1/hackatar/:label?static=1 → single-frame still GIF
```

- 192×192 pixels, `image/gif`
- `Cache-Control: public, max-age=31536000, immutable`
- Cached in Netlify Blobs after first generation
- Returns 404 if domain not registered (verified via TED GraphQL)
- Returns 400 for invalid labels

## Engine Architecture

```
src/lib/hackatar/
├── index.ts      — public API: renderFrames(), renderSingleFrame()
├── prng.ts       — mulberry32 PRNG + seedFromHash()
├── palette.ts    — curated color palettes (neon, matrix, ember, ice, etc.)
├── traits.ts     — trait selection from PRNG (palette, density, symmetry, glitch config)
├── grid.ts       — wave-interference base pattern generator
├── glitch.ts     — glitch effect layers (RGB shift, scanlines, jitter, noise, splits)
└── render.ts     — frame compositor (grid + glitch → RGBA pixels)
```

All modules are pure JS — no DOM, no Canvas, no Node-specific APIs. Runs identically in browser and server.

## Frontend Component

`src/components/Hackatar.tsx` — `<img>` tag pointing to `/api/v1/hackatar/:label`.

Props:
- `label` — domain label (required)
- `size` — display size in px (default 48)
- `animated` — show animated GIF (default false = static)
- `hoverAnimate` — play on hover, still by default
- `playing` — external play/pause control
- `className`, `borderRadius` — styling

The component preloads the animated GIF in the background so hover-to-play swaps are instant. Uses `image-rendering: pixelated` for the crisp LED pixel aesthetic. Pure black `#000` background while loading.
