# Copilot Agent Instructions — hack.tez

## Project Summary

hack.tez is a free Tezos subdomain registrar. Users connect a Tezos wallet and claim `name.hack.tez` via a SmartPy smart contract on ghostnet (or mainnet). Subdomains are real Tezos Domains (TED) records — users get full on-chain ownership.

The frontend is a Vite + React + TypeScript SPA hosted on Netlify with server-side Netlify Functions (REST API, IPFS pinning, profile-page SSR). Chat is powered by a separate Cloudflare Workers + PartyKit + D1 stack in the `chat/` directory. Push notifications use the Web Push API with VAPID, managed by the CF Worker.

**Stack:** TypeScript · React 19 · Vite 8 · Tailwind CSS 4 · Taquito v24 · octez.connect-sdk (Beacon wallet) · Netlify (SPA + Functions v2) · Cloudflare Workers + PartyKit + D1 (chat) · Web Push / VAPID (notifications)

**Runtime:** Node.js ≥ 24, npm ≥ 11. SmartPy contract compilation requires Docker and `pip install smartpy-tezos` (v0.24.1).

## Build & Validation Commands

Always run `npm install` before building if `node_modules/` is missing or `package.json` changed.

| Task | Command | Notes |
|------|---------|-------|
| Install deps | `npm install` | Must complete before any other command |
| Type check | `npx tsc -b` | Runs both `tsconfig.app.json` (src/) and `tsconfig.node.json` (vite.config.ts) |
| Build (production) | `npm run build` | Runs `tsc -b && vite build && vite build --ssr && tsx scripts/prerender.ts`. Output in `dist/` (client) + `dist-server/` (SSR). |
| Dev server | `npm run dev` | Vite dev server on localhost:5173 |
| Full local stack | `npm run netlify:dev` | Netlify CLI on :8888, proxies Vite + Functions |
| Preview built app | `npm run preview` | Serves `dist/` |

**Validation sequence after any code change:**
```bash
npx tsc -b && npm run build
```
Both must exit 0. The `tsc -b` step is strict: `noUnusedLocals`, `noUnusedParameters`, `strict`, `verbatimModuleSyntax`, and `erasableSyntaxOnly` are all enabled. Any unused import or variable will fail the build.

**Known warnings (safe to ignore):**
- Chunk size warnings (>500 kB) — the Tezos SDK bundle is large; this is normal.

## Chat Deployment (hackchat)

The chat system has two components that **must be deployed together** — they share source code (auth, types). Deploying only one can cause runtime errors or WebSocket connection failures.

```bash
cd chat
npx tsc --noEmit               # type-check worker (must pass before deploy)
npx wrangler deploy             # CF Worker (REST API, auth, push)
npx partykit deploy             # PartyKit (WebSocket rooms)
```

D1 migrations (when schema changes):

```bash
cd chat
npx wrangler d1 migrations apply hackchat --remote
```

## TypeScript Conventions

- `"module": "ESNext"` with `"moduleResolution": "bundler"` — use ESM imports only.
- `"verbatimModuleSyntax": true` — always use `import type { X }` for type-only imports.
- `"erasableSyntaxOnly": true` — no `enum`, no `namespace`, no parameter properties. Use `const` objects or union types instead.
- `"noEmit": true` — TypeScript is check-only; Vite handles bundling.
- `"jsx": "react-jsx"` — no need to import React in `.tsx` files.
- Tailwind CSS 4 is used via `@tailwindcss/vite` plugin — styles use utility classes, no separate CSS files beyond `src/index.css` which contains `@import "tailwindcss"`.
- Tailwind CSS 4 spacing utilities (px-\*, py-\*, gap-\*, m\*-\*, p\*-\*) do NOT work in lazily-loaded chat components. Use explicit inline styles for all spacing in `src/components/chat/`.

## React / Data-Fetching Rules

- **Never wipe the DOM on background refresh.** When a hook or component re-fetches data (polling, post-mutation refresh, `refreshKey` increment), do NOT set `loading=true` if data already exists. Only show a loading spinner/skeleton on the very first fetch. Use a `hasFetched` ref to track this. Subsequent fetches silently update state in place.
- **Network-dependent URLs must come from `config` (`src/config/tezos.ts`).** Never construct TED, TzKT, or GraphQL URLs ad-hoc in components. Use `config.tedAppUrl`, `config.tzktApi`, `config.domainsGraphql`, etc.

## Project Layout

```
├── index.html                    # Vite entry point
├── vite.config.ts                # Vite config (React, Tailwind, manual polyfills)
├── netlify.toml                  # Build config, SPA redirects, CSP headers
├── package.json                  # Scripts: dev, netlify:dev, build, preview
├── tsconfig.json                 # References tsconfig.app.json + tsconfig.node.json
├── tsconfig.app.json             # Strict TS config for src/ (includes: ["src"])
├── tsconfig.node.json            # TS config for vite.config.ts only
├── .env.example                  # Env var template
│
├── src/
│   ├── main.tsx                  # React entry point (client hydration)
│   ├── entry-server.tsx          # SSR entry point for pre-rendering
│   ├── App.tsx                   # Router, nav, theme switcher, error boundary
│   ├── index.css                 # Tailwind import + custom CSS layers
│   ├── config/
│   │   └── tezos.ts              # Network config, contract addresses, TED discovery
│   ├── context/
│   │   └── TezosContext.tsx       # Wallet state + JWT auth via octez.connect-sdk (Beacon)
│   ├── pages/
│   │   ├── Home.tsx              # Landing page with search/register flow
│   │   ├── Hackers.tsx           # Public directory of registered hackers
│   │   ├── Developers.tsx        # Developer docs and API reference
│   │   ├── Profile.tsx           # /u/:subdomain — user profile with hackatar
│   │   ├── Skills.tsx            # Skills index (Tezos/SmartPy reference docs)
│   │   ├── SkillDetail.tsx       # Individual skill page (rendered from markdown)
│   │   ├── Manifesto.tsx         # Project manifesto
│   │   └── Policies.tsx          # Privacy/terms
│   ├── components/
│   │   ├── ConnectWallet.tsx      # Wallet connect/disconnect/reset UI
│   │   ├── SubdomainSearch.tsx    # Search + commit-reveal registration flow
│   │   ├── Dashboard.tsx         # /manage — owned subdomains, profile editing
│   │   ├── SubdomainManager.tsx  # Subdomain detail management
│   │   ├── ProfileEditForm.tsx   # Profile data editor (bio, links, avatar)
│   │   ├── ProfileShareStudio.tsx # Share card generator
│   │   ├── Hackatar.tsx          # <img> component → /api/v1/hackatar/:label
│   │   ├── PushSubscribeButton.tsx # Push notification subscribe/unsubscribe button
│   │   ├── ActivityFeedPanel.tsx # Desktop activity feed sidebar
│   │   ├── ActivityToastQueue.tsx # Mobile activity toasts
│   │   ├── EligibilityPanel.tsx  # Wallet eligibility check UI
│   │   ├── PendingCommitsPanel.tsx # Pending commit-reveal status
│   │   ├── ClaimedView.tsx       # Post-registration success view
│   │   ├── ClaimUsedView.tsx     # "Claim already used" view
│   │   ├── CircuitBackground.tsx # Decorative background
│   │   ├── Footer.tsx            # Site footer
│   │   ├── chat/                 # hackchat components (lazy-loaded)
│   │   │   ├── ChatPage.tsx      # Chat entry (wallet → JWT → enter)
│   │   │   ├── ChatLayout.tsx    # Chat layout (sidebar + messages)
│   │   │   ├── ChatSidebar.tsx   # Room/DM list sidebar
│   │   │   ├── ChatNotificationSettingsMenu.tsx # Push + in-app notification settings
│   │   │   ├── DMView.tsx        # Direct message view
│   │   │   ├── MessageBubble.tsx # Individual message rendering
│   │   │   ├── MessageInput.tsx  # Message compose input
│   │   │   ├── IdentitySelector.tsx # Multi-domain identity picker
│   │   │   └── NewDMModal.tsx    # New DM conversation modal
│   │   └── ui/                   # Shared UI primitives (Select, dropdown, switch)
│   ├── hooks/
│   │   ├── useContractConfig.ts  # Contract storage from TzKT (cached)
│   │   ├── useEligibility.ts     # Wallet revealed status + age via TzKT
│   │   ├── useSubdomains.ts      # Owned subdomains via TED GraphQL
│   │   ├── useTedContracts.ts    # TED proxy contract discovery
│   │   ├── useRecentActivity.ts  # On-chain activity feed polling
│   │   ├── useRegistrationCount.ts # Per-wallet registration count
│   │   ├── useBuilders.ts        # Builder directory data
│   │   ├── useHackerProfiles.ts  # Hacker profile aggregation
│   │   ├── useSign.ts            # Wallet message signing hook
│   │   ├── useChat.ts            # Global chat WebSocket (PartyKit)
│   │   ├── useDM.ts              # DM WebSocket hook
│   │   └── useDMList.ts          # DM conversation list (polling)
│   ├── lib/
│   │   ├── contract.ts           # submitCommit(), submitRegister(), submitProfileUpdate()
│   │   ├── commitment.ts         # blake2b commitment hash
│   │   ├── domains.ts            # TED GraphQL queries, label validation, reserved names
│   │   ├── signing.ts            # Wallet message signing for authenticated requests
│   │   ├── pin.ts                # Pinata IPFS upload client
│   │   ├── pushSubscription.ts   # Client-side Web Push subscription management
│   │   ├── profileShare.ts       # Profile share card generation logic
│   │   ├── commits.ts            # localStorage commit persistence
│   │   ├── skills.ts             # Skill metadata + markdown loading
│   │   ├── tzkt.ts               # TzKT API helpers
│   │   ├── chatNotifications.ts  # Browser notification permissions
│   │   └── hackatar/             # Generative avatar engine (pure JS, no DOM)
│   │       ├── index.ts          # Public API: seed → PRNG → traits → frames
│   │       ├── prng.ts           # Seeded PRNG
│   │       ├── traits.ts         # Trait selection from seed
│   │       ├── grid.ts           # Grid interference pattern
│   │       ├── glitch.ts         # Glitch effects
│   │       ├── palette.ts        # Color palette generation
│   │       └── render.ts         # RGBA frame rendering
│   ├── types/
│   │   └── profile.ts            # Profile types, parsing, validation
│   └── skills/                   # Markdown skill docs (copied to public/ at build)
│
├── netlify/
│   └── functions/
│       ├── api.mts               # Public REST API — all /api/v1/* routes
│       ├── pin.mts               # IPFS pin proxy (wallet-sig authenticated)
│       ├── profile-page.mts      # SSR for /u/:subdomain (OpenGraph meta injection)
│       └── textToPath.ts         # SVG text-to-path helper for share cards
│
├── chat/                          # hackchat — separate CF Workers + PartyKit project
│   ├── src/
│   │   ├── worker.ts             # CF Worker: auth, DM REST API, push dispatch, admin
│   │   ├── push.ts               # Web Push notification sending (VAPID, per-user prefs)
│   │   ├── auth/                 # Tezos signature verification + TED ownership check
│   │   └── party/
│   │       ├── global.ts         # Global chat room (PartyKit server)
│   │       └── dm.ts             # DM room server (1-on-1, read receipts)
│   ├── migrations/               # D1 SQLite schema
│   ├── wrangler.jsonc.example    # CF Worker config template
│   └── partykit.json.example     # PartyKit config template
│
├── contract/
│   ├── hack_tez_registrar.py     # SmartPy contract (inline tests)
│   ├── deploy.ts                 # Generic deploy script
│   └── tests/                    # Empty — tests are inline in the .py file
│
├── scripts/
│   ├── prerender.ts              # SSG: pre-renders static routes after vite build
│   ├── redeploy-ghostnet.ts      # Deploy to ghostnet
│   ├── deploy-mainnet.ts         # Deploy to mainnet
│   ├── test-ghostnet.ts          # E2E test: commit → wait → register
│   └── netlify-dev-patch.cjs     # Node.js preload for netlify dev (ECONNRESET fix)
│
├── docs/
│   └── messaging-research.md     # Chat architecture research notes
│
└── public/
    └── favicon.svg
```

## Routes

| Path | Component | Notes |
|------|-----------|-------|
| `/` | Home | Landing page + registration flow |
| `/hackers` | Hackers | Registered hacker directory |
| `/developers` | Developers | API docs and developer guide |
| `/skills` | Skills | Tezos/SmartPy/Taquito reference docs |
| `/skills/:slug` | SkillDetail | Individual skill page |
| `/u/:subdomain` | Profile | User profile (SSR via profile-page.mts for OpenGraph) |
| `/manage` | Dashboard | Owned subdomains, profile editing (lazy) |
| `/chat` | ChatPage | hackchat (lazy, requires wallet + domain) |
| `/manifesto` | Manifesto | Project manifesto (pre-rendered) |
| `/policies` | Policies | Privacy/terms (pre-rendered) |

Pre-rendered routes (SSG at build time): `/manifesto`, `/policies`, `/developers`, `/skills`, `/skills/*`.

## Public REST API

Base URL: `https://hacktez.com` (locally via `npm run netlify:dev`: `http://localhost:8888`)

All responses: `{ data: ..., network: "ghostnet" | "mainnet" }` on success, `{ error: "...", code: "..." }` on failure.

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/domains?limit=50&offset=0` | Paginated list of all registrations (TzKT-backed, includes timestamp + opHash) |
| `GET /api/v1/domain/:name` | Domain record by label or full name. `available: true` + `data: null` if unclaimed |
| `GET /api/v1/profile/:name` | Domain record + parsed builder profile data |
| `GET /api/v1/availability/:label` | Returns `{ available: boolean }` |
| `GET /api/v1/owner/:address` | All hack.tez domains owned by a wallet |
| `GET /api/v1/resolve/:address` | Reverse-resolve wallet → primary domain (hack.tez preferred over .tez) |
| `GET /api/v1/config` | Contract config: `minCommitAgeSec`, `maxCommitAgeSec`, `maxPerWallet`, `paused` |
| `GET /api/v1/activity?limit=30` | Recent on-chain claim + commit events |
| `GET /api/v1/hackatar/:label` | Generative avatar GIF (animated). Add `?static=1` for single-frame still. |
| `GET /api/v1/share-card/:label` | Profile share card image (PNG, server-rendered SVG → resvg) |
| `POST /api/v1/pin` | IPFS pin via Pinata (wallet-signature authenticated, rate-limited via Upstash Redis) |

**Adding a new endpoint:** Add a handler function in `netlify/functions/api.mts` and register it in the `handler` dispatch block. The `export const config = { path: "/api/v1/:route*" }` at the bottom routes all `/api/v1/*` requests — no `netlify.toml` redirect needed.

## Smart Contract (SmartPy)

Contract source: `contract/hack_tez_registrar.py`. Contains both the contract class and inline test scenarios.

**Registration flow:**

1. `commit(hash)` — user submits blake2b hash of `(label, nonce, sender)`. Stored in `pending_commits` big_map.
2. Wait ≥ `min_commit_age` seconds (default 30s on ghostnet).
3. `register(label, nonce, address?, data?)` — on-chain verifies hash matches, calls TED SetChildRecord, records wallet as registered.

**Compile and test:**
```bash
pip install smartpy-tezos    # Requires Docker running
python contract/hack_tez_registrar.py
```
Produces test output directories in project root — **clean up after** (`rm -rf Commit/ Admin_functions/` etc).

**Critical contract knowledge:**
- `t_set_child_record` type has a `.layout()` override to match TED's non-alphabetical field order: `("label", ("parent", ("address", ("owner", ("data", "expiry")))))`. Do not change field order without updating this.
- `parent_name` is the full domain name as hex bytes: ghostnet = `6861636b2e67686f` ("hack.gho"), mainnet = `6861636b2e74657a` ("hack.tez").
- The contract sets `owner=sp.sender` in the TED call, giving users full ownership.
- Storage fields are always alphabetically ordered by SmartPy in compiled Michelson.

**Deploy:**
```bash
export $(grep -v '^#' .env | xargs)
npx tsx scripts/redeploy-ghostnet.ts   # ghostnet
npx tsx scripts/deploy-mainnet.ts      # mainnet
```
Requires `TEZOS_WALLET_PUB_KEY` env var (which is actually the secret key `edsk...`). After deployment, the contract must be added as an operator on the parent domain NFT in the TED NameRegistry.

## Key Contract Addresses (Ghostnet)

| Contract | Address |
|----------|---------|
| HackTezRegistrar | Configured via `VITE_REGISTRAR_ADDRESS` env var |
| TED CheckAddress | `KT1B3j3At2XMF5P8bVoPD2WeJbZ9eaPiu3pD` |
| TED SetChildRecord proxy | `KT1HpddfW7rX5aT2cTdsDaQZnH46bU7jQSTU` |
| TED UpdateRecord proxy | `KT1Ln4t64RdCG1bK8zkH6Xi4nNQVxz7qNgyj` |

TED NameRegistry address is discovered at runtime from CheckAddress storage (see `getTedContracts()` in `src/config/tezos.ts`).

## Environment Variables

| Variable | Used by | Notes |
|----------|---------|-------|
| `VITE_TEZOS_NETWORK` | Frontend + API function | `ghostnet` (default) or `mainnet` |
| `VITE_REGISTRAR_ADDRESS` | Frontend + API function | HackTezRegistrar contract address (**required**) |
| `VITE_SITE_URL` | Frontend | Absolute web URL (default `https://hacktez.com`) |
| `LEGACY_REGISTRARS` | API function | Comma-separated previous contract addresses for continuous activity feed |
| `PINATA_JWT` | Netlify server-only | Pinata API JWT for IPFS pinning |
| `UPSTASH_REDIS_REST_URL` | Netlify server-only | Upstash Redis for signature replay protection (optional) |
| `UPSTASH_REDIS_REST_TOKEN` | Netlify server-only | Upstash Redis token (optional) |
| `TEZOS_WALLET_PUB_KEY` | Deploy scripts only | Actually the `edsk...` secret key (legacy naming) |
| `VITE_HACKCHAT_URL` | Frontend | Chat worker URL (default `http://localhost:8787`) |
| `VITE_PARTYKIT_HOST` | Frontend | PartyKit host (default `localhost:1999`) |
| `CHAT_JWT_SECRET` | CF Worker + PartyKit | Shared JWT signing secret |
| `VAPID_PUBLIC_KEY` | CF Worker | VAPID public key for Web Push |
| `VAPID_PRIVATE_KEY` | CF Worker | VAPID private key for Web Push |
| `VAPID_SUBJECT` | CF Worker | VAPID subject (mailto: or URL) |
| `VITE_VAPID_PUBLIC_KEY` | Frontend (optional) | Build-time VAPID key (avoids runtime fetch) |

## Architecture Decisions (don't reverse these)

- **Owner = sender.** Users own TED records directly. The contract sets `owner=sp.sender` in TED calls.
- **1 claim per wallet (permanent).** `registrations` big_map tracks claims. Even if TED record is removed, the claim slot is spent. Admin can use `set_registration_count` to grant exceptions.
- **Commit-reveal flow.** Two transactions: commit (hash), wait ≥ min_commit_age, then register (reveal). Pending commits are stored in `localStorage` under key `hack-tez-pending-commits`.
- **Wallet SDK is `@tezos-x/octez.connect-sdk`** (Beacon-compatible). Raw Michelson operations via `DAppClient.requestOperation()` — NOT Taquito's `ContractAbstraction`.
- **JWT issued at wallet connect.** `TezosContext.connect()` requests SIGN scope, signs a challenge, and exchanges it for a JWT from the CF Worker. The JWT is stored in `localStorage` and auto-refreshed. Wallets without domains get a JWT with `activeDomain: null`. JWT refresh happens automatically after domain claims (`refreshToken()` in `PendingCommitsPanel`).
- **signing.ts must be dynamically imported in TezosContext.** It imports `SigningType` from the wallet SDK which isn't available in Node.js (SSR). Use `const { signMessage } = await import("../lib/signing")` inside `authenticateWallet()`.
- **Netlify Functions v2** — use `export const config: Config = { path: "..." }` for routing, not `netlify.toml` redirects. The API (`api.mts`) is a pure proxy to TED GraphQL + TzKT — no custom database.
- **TED contract discovery at runtime.** Only `tedCheckAddress` is hardcoded per network. NameRegistry is resolved from CheckAddress storage. Proxy addresses (SetChildRecord, UpdateRecord) are stable and hardcoded in `src/config/tezos.ts`.
- **Domain = chat identity.** Messages are stored with `sender_domain`, not wallet address. Transferring a domain transfers the chat identity. Wallets with multiple domains get an identity selector.
- **JWT is the chat trust boundary.** CF Worker issues JWT after verifying wallet signature + TED domain ownership. PartyKit only accepts connections with valid JWT. Both share `CHAT_JWT_SECRET`.
- **Push notifications are per-device.** Each browser/device subscribes independently via PushManager. `isPushSubscribed()` checks local state. UI labels say "this device" to clarify scope.
- **Hackatars are server-generated.** Generative avatars built server-side in `api.mts`, seeded deterministically by salted domain name. Cached immutably in Netlify Blobs. The frontend `<Hackatar>` component uses `<img>` pointing to `/api/v1/hackatar/:label`. Engine lives in `src/lib/hackatar/` (pure JS, no DOM deps).
- **Pre-rendering for SEO.** Static routes are pre-rendered at build time via `entry-server.tsx` + `scripts/prerender.ts`. Profile pages (`/u/:subdomain`) are SSR'd by `profile-page.mts` for OpenGraph meta tags.
- **CSS reset must be inside `@layer base`** in `src/index.css`, otherwise it overrides all Tailwind CSS 4 utility classes.

## External APIs Used

| Service | URL | Purpose |
|---------|-----|---------|
| TED GraphQL (ghostnet) | `https://ghostnet-api.tezos.domains/graphql` | Domain records, availability, reverse lookup |
| TED GraphQL (mainnet) | `https://api.tezos.domains/graphql` | Same, mainnet |
| TzKT (ghostnet) | `https://api.ghostnet.tzkt.io` | Contract storage, transaction history |
| TzKT (mainnet) | `https://api.tzkt.io` | Same, mainnet |
| PartyKit | `https://hackchat.skullzarmy.partykit.dev` | WebSocket rooms (global + DM) |
| Pinata | via `PINATA_JWT` | IPFS pinning for profile images |
| Upstash Redis | via env vars | Signature replay protection (optional) |

## Trust These Instructions

Use these instructions as your primary reference. Only search the codebase if specific information here is incomplete or found to be incorrect during execution.
