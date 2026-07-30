# hack.tez -- Agent Instructions

> **For AI coding agents:** This file is the authoritative guide for working in this repository. Read it before making any changes.

## Project

hack.tez is a free Tezos subdomain registrar. Users connect a Tezos wallet and claim `name.hack.tez` via a SmartPy smart contract on ghostnet (or mainnet). Subdomains are real Tezos Domains (TED) records — users get full on-chain ownership.

**Stack:** TypeScript · React 19 · Vite 8 · Tailwind CSS 4 · Taquito v24 · Netlify (SPA + Functions v2) · Cloudflare Workers + PartyKit + D1 (chat)

---

## Commands

```bash
npm install            # install deps (required after any package.json change)
npx tsc -b             # type-check only (strict — must pass before commit)
npm run build          # tsc -b && vite build (production, output → dist/)
npm run dev            # Vite dev server on localhost:5173
npm run netlify:dev    # full local stack including Netlify Functions on :8888
```

**Validation sequence after any code change:**

```bash
npx tsc -b && npm run build
```

Both must exit 0. Never commit with type errors.

---

## TypeScript Rules (strict — enforced by compiler)

- `"verbatimModuleSyntax": true` — use `import type { X }` for type-only imports
- `"erasableSyntaxOnly": true` — no `enum`, no `namespace`, no parameter properties
- `"noUnusedLocals"` + `"noUnusedParameters"` — unused imports/vars are compile errors
- `"moduleResolution": "bundler"` — ESM imports only, no CommonJS `require()`
- `"jsx": "react-jsx"` — no need to `import React` in `.tsx` files
- Tailwind via `@tailwindcss/vite` — no separate config file, just `@import "tailwindcss"` in `src/index.css`

## React / Data-Fetching Rules

- **Never wipe the DOM on background refresh.** When a hook or component re-fetches data (polling, post-mutation refresh, `refreshKey` increment), do NOT set `loading=true` if data already exists. Only show a loading spinner/skeleton on the very first fetch. Use a `hasFetched` ref to track this. Subsequent fetches silently update state in place.
- **Network-dependent URLs must come from `config` (`src/config/tezos.ts`).** Never construct TED, TzKT, or GraphQL URLs ad-hoc in components. Use `config.tedAppUrl`, `config.tzktApi`, `config.domainsGraphql`, etc.

---

## Key Files

| Path                           | Purpose                                                                    |
| ------------------------------ | -------------------------------------------------------------------------- |
| `src/config/tezos.ts`          | Network config (ghostnet/mainnet), contract addresses, API URLs            |
| `src/lib/domains.ts`           | TED GraphQL queries, label validation, reserved names                      |
| `src/lib/contract.ts`          | `submitCommit()` and `submitRegister()` — raw Michelson ops via DAppClient |
| `src/lib/commitment.ts`        | blake2b commitment hash (must match on-chain computation)                  |
| `src/lib/hackatar/`            | Hackatar engine — seeded generative avatar (PRNG, traits, grid, glitch, render) |
| `src/components/Hackatar.tsx`  | Hackatar `<img>` component — serves from `/api/v1/hackatar/:label`         |
| `src/context/TezosContext.tsx` | Wallet state via `@tezos-x/octez.connect-sdk` (Beacon)                     |
| `src/types/profile.ts`        | **Shared** profile schema/parsing (client + API). Import-free by design — see below |
| `src/lib/tips.ts`             | Tip jar — TzKT token metadata lookup, unit conversion, FA1.2/FA2 transfer ops |
| `src/lib/tipShare.ts`         | Post-tip share text + X/Bluesky intent URLs                                 |
| `netlify/functions/tipCounters.ts` | Chain verification + Redis aggregate counters for tips                 |
| `src/components/TipJar.tsx`   | Tip jar view widget (profile + project pages)                              |
| `src/components/TipJarEditor.tsx` | Tip jar editor section (reused for profile and per-project jars)        |
| `src/pages/ProjectPage.tsx`   | Project detail page at `/u/:label/p/:slug`                                 |
| `src/lib/signing.ts`          | Wallet message signing for authenticated requests                          |
| `src/lib/pin.ts`              | Pinata upload client                                                       |
| `netlify/functions/api.mts`    | Public REST API — all `/api/v1/*` routes (Netlify v2 function)                |
| `netlify/functions/pin.mts`   | Internal IPFS pin proxy (not public API — wallet-sig authenticated)          |
| `netlify.toml`                 | Build config, SPA redirect, security headers/CSP                           |
| `chat/src/worker.ts`           | Chat auth endpoint + DM REST API (CF Worker)                               |
| `chat/src/auth/verify.ts`      | Tezos signature verification + TED domain ownership check                  |
| `chat/src/party/global.ts`     | Global chat room (PartyKit — JWT auth, messages, presence, typing)         |
| `chat/src/party/dm.ts`         | DM room server (PartyKit — 1-on-1 messaging, read receipts)               |
| `src/hooks/useChat.ts`         | Global chat WebSocket hook (PartyKit connection, messages, presence)       |
| `src/hooks/useDM.ts`           | DM WebSocket hook                                                          |
| `src/hooks/useDMList.ts`       | DM conversation list (polling)                                             |
| `src/components/chat/ChatPage.tsx` | Chat auth gate (wallet → sign → enter)                                 |

---

## Public REST API

Base URL: `https://hacktez.com` (locally: `http://localhost:8888`)

All responses: `{ data: ..., network: "ghostnet" | "mainnet" }` on success, `{ error: "...", code: "..." }` on failure.

| Endpoint                             | Description                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| `GET /api/v1/domains?limit=50&offset=0` | Paginated list of all registrations (TzKT-backed, includes timestamp + opHash)     |
| `GET /api/v1/domain/:name`              | Domain record by label or full name. `available: true` + `data: null` if unclaimed |
| `GET /api/v1/availability/:label`       | Returns `{ available: boolean }`                                                   |
| `GET /api/v1/owner/:address`            | All hack.tez domains owned by a wallet                                             |
| `GET /api/v1/resolve/:address`          | Reverse-resolve wallet → primary domain (hack.tez preferred over .tez)             |
| `GET /api/v1/config`                    | Contract config: `minCommitAgeSec`, `maxCommitAgeSec`, `maxPerWallet`, `paused`    |
| `GET /api/v1/activity?limit=30`         | Recent on-chain claim + commit events                                              |
| `GET /api/v1/profile/:name`             | Parsed builder profile for a domain                                                |
| `GET /api/v1/hackatar/:label`           | Generative avatar GIF (animated). Add `?static=1` for single-frame still.          |
| `GET /api/v1/tips/:name`                | Public tip counters for a domain — count + per-asset totals, plus per-project     |
| `POST /api/v1/tips/report`              | Report a tip op hash for counting. Body `{ opHash, label, project? }`. Verified against TzKT |

**Adding a new endpoint:** Add a handler function in `netlify/functions/api.mts` and register it in the `handler` dispatch block. The `export const config = { path: "/api/v1/:route*" }` at the bottom of that file registers all `/api/v1/*` routes — no `netlify.toml` redirect needed.

---

## Smart Contract (SmartPy)

Contract: `contract/hack_tez_registrar.py`

**Registration flow:**

1. `commit(hash)` — user submits blake2b hash of `(label, nonce, sender)`. Stored in `pending_commits` big_map.
2. Wait ≥ `min_commit_age` seconds (default 30s on ghostnet).
3. `register(label, nonce, address?, data?)` — on-chain verifies hash matches, calls TED SetChildRecord, records wallet as registered.

**Critical layout constraint:** `t_set_child_record` has a `.layout()` override matching TED's non-alphabetical field order: `("label", ("parent", ("address", ("owner", ("data", "expiry")))))`. Do not change field order without updating this.

**Compile + test:**

```bash
pip install smartpy-tezos   # requires Docker
python contract/hack_tez_registrar.py
```

Produces output dirs in project root — clean up after (`rm -rf Commit/ Admin_functions/` etc).

---

## Contract Addresses (Mainnet)

| Contract                 | Address                                |
| ------------------------ | -------------------------------------- |
| HackTezRegistrar         | `KT1UKAt5ioGdbKb435ziP25FRDzqgC7BUeB4` |
| TED CheckAddress         | `KT1F7JKNqwaoLzRsMio1MQC7zv3jG9dHcDdJ` |
| TED SetChildRecord proxy | `KT1QHLk1EMUA8BPH3FvRUeUmbTspmAhb7kpd` |
| TED UpdateRecord proxy   | `KT1H1MqmUM4aK9i1833EBmYCCEfkbt6ZdSBc` |

## Contract Addresses (Ghostnet)

| Contract                 | Address                                |
| ------------------------ | -------------------------------------- |
| HackTezRegistrar         | `KT1X2ZbjZBaeRnnkzLyaZ3FtGp7wKuaimbzg` |
| TED NameRegistry (FA2)   | `KT1REqKBXwULnmU6RpZxnRBUgcBmESnXhCWs` |
| TED SetChildRecord proxy | `KT1HpddfW7rX5aT2cTdsDaQZnH46bU7jQSTU` |
| TED UpdateRecord proxy   | `KT1Ln4t64RdCG1bK8zkH6Xi4nNQVxz7qNgyj` |

---

## Architecture Decisions (don't reverse these)

- **No server-side auth.** No API keys, no sessions, no database. Contract + TED handle state.
- **Owner = sender.** Users own TED records directly. The contract sets `owner=sp.sender` in TED calls.
- **1 claim per wallet (permanent).** `registrations` big_map tracks claims. Even if TED record is removed, the claim slot is spent.
- **Wallet SDK is `@tezos-x/octez.connect-sdk`** (Beacon). Use `DAppClient.requestOperation()` with raw Michelson — NOT Taquito's `ContractAbstraction`.
- **No Netlify Functions for resolution.** The API in `netlify/functions/api.mts` is a pure proxy to TED GraphQL + TzKT.
- **Netlify Functions v2** — use `export const config: Config = { path: "..." }` for routing, not `netlify.toml` redirects.
- **Domain = chat identity.** Messages are stored with `sender_domain`, not wallet address. Transferring a domain transfers the chat identity. Wallets with multiple domains get an identity selector.
- **JWT is the trust boundary.** CF Worker issues short-lived JWTs (2h TTL, rolling refresh) after verifying wallet signature + TED domain ownership. JWTs include `kid` (for secret rotation) and `sid` (for revocation via D1 `auth_sessions` table). All authenticated client calls go through `src/lib/authedFetch.ts` (singleton with `BroadcastChannel` cross-tab sync, `navigator.locks` refresh dedupe, pre-flight expiry check, single-401-retry).
- **Auth challenge is SIWE-style** (see `auth/challenge.ts`): structured `domain / address / statement / URI / Version / Chain ID / Nonce / Issued At` message. Server re-parses to enforce nonce + freshness for replay protection.
- **WebSocket auth uses single-use tickets.** Client calls `POST /auth/ws-ticket` (60s TTL, sid-bound) before connecting; ticket goes in WS query string, not the long-lived JWT. PartyKit verifies tickets locally via shared `auth/ticket.ts` — no worker round-trip per connection.
- **Shared `auth/` module at repo root** is the single source of truth for all session/auth logic across CF Worker, PartyKit, Netlify Functions, and the React client. Runtime-agnostic (Web Crypto + jose). Never duplicate JWT logic anywhere else.
- **WS failures NEVER nuke the app session.** Chat WebSocket close events do not clear auth state. Only `authedFetch` failure → refresh failure can clear the session.
- **Hackatars are server-generated.** Generative avatars are built server-side in `api.mts`, seeded by a salted domain name (deterministic). Cached immutably in Netlify Blobs. The frontend `<Hackatar>` component uses `<img>` tags pointing to `/api/v1/hackatar/:label`. The engine lives in `src/lib/hackatar/` (pure JS, no DOM deps). See `HACKATARS.md` for the seeding roadmap.
- **`src/types/profile.ts` is the single source of truth for profile data, and has ZERO imports.** Both the Vite client and `netlify/functions/api.mts` import it directly. It must never import `config`, `lib/domains`, or anything reaching `import.meta.env` — that breaks the Functions runtime and forces the API to fork a second parser (it used to, and the copies drifted). Same rule and reasoning as the shared `auth/` module.
- **Tips are non-custodial and fee-free.** hack.tez never touches a tip. The client resolves the recipient from their TED record, builds the transfer op locally (`src/lib/tips.ts`), and hands it to the tipper's wallet — no escrow contract, no cut, no server. Tip jars live in the TED data map under `hack:tips` (profile) and inside `hack:projects` entries (per project), and are **off by default**.
- **Tip amounts are stored in display units.** Presets are saved as decimal strings ("1.5"), converted to raw units with the token's TZIP-12 `decimals` only at send time. Never store raw units in a profile — decimals can differ per token and the profile stays human-readable.
- **Only fungible FA tokens can be tipped.** `lookupToken()` reads metadata from TzKT and rejects anything that isn't FA1.2 (TZIP-7) or FA2 (TZIP-12), has no readable `decimals`, or has the canonical NFT shape (`decimals: 0` + `totalSupply: 1`).
- **Tip counters are chain-verified and aggregate-only.** Nothing on-chain marks a transfer as a tip, so the client reports an op hash after inclusion and the server proves it against TzKT: it must be `applied` and must actually have paid one of the domain's accepted addresses (resolution address, owner, or a jar `payTo`). Amounts come from chain, never from the client. Dedup is `SET NX` on the op hash. We store **no sender and no per-tip rows** — only counts and per-asset totals in Redis. Counters are best-effort: if Redis is unset the endpoints degrade to zeros rather than failing.
- **Tip totals accumulate in 6dp fixed-point, not raw units.** Redis `HINCRBY` is int64, and raw 18-decimal amounts overflow it at ~9.2 tokens. `rawToAcc()` normalizes every asset to 6 decimals before accumulating. Sub-microunit dust rounds away, which is irrelevant at tip scale.
- **Project pages are derived, not stored.** `/u/:label/p/:slug` resolves by slugifying each project's `name` (`projectSlug()`); there is no separate project record. Renaming a project changes its URL — that's accepted, since the profile is the source of truth.

---

## Environment Variables

| Variable                 | Used by                 | Notes                                             |
| ------------------------ | ----------------------- | ------------------------------------------------- |
| `VITE_TEZOS_NETWORK`     | Frontend + API function | `ghostnet` (default) or `mainnet`                 |
| `VITE_REGISTRAR_ADDRESS` | Frontend + API function | Contract address override                         |
| `VITE_SITE_URL`          | Frontend                | Absolute web URL of the app (default `https://hacktez.com`). Used for profile share links. |
| `TEZOS_WALLET_PUB_KEY`   | Deploy scripts only     | Actually the `edsk...` secret key (legacy naming) |
| `PINATA_JWT`             | Netlify server-only     | Pinata API JWT token for IPFS pinning             |
| `VITE_HACKCHAT_URL`     | Frontend                | Chat worker URL (default `http://localhost:8787`) |
| `VITE_PARTYKIT_HOST`    | Frontend                | PartyKit host (default `localhost:1999`)          |
| `CHAT_JWT_SECRET`        | CF Worker + PartyKit    | Shared JWT signing secret (current key)           |
| `CHAT_JWT_KID`           | CF Worker + PartyKit    | Key id for current secret (default `v1`)          |
| `CHAT_JWT_SECRET_PREV`   | CF Worker + PartyKit    | Optional previous secret for rotation grace       |
| `CHAT_JWT_KID_PREV`      | CF Worker + PartyKit    | Optional previous kid                             |
| `AUTH_DOMAIN`            | CF Worker               | SIWE challenge domain (default `hacktez.com`)     |
| `INTERNAL_SECRET`        | CF Worker + Netlify     | Shared secret for `/auth/check-session` calls     |
| `HACKCHAT_INTERNAL_URL`  | Netlify Functions       | Internal worker URL for revocation checks         |

---

## External APIs Used

| Service                | URL                                          | Purpose                                      |
| ---------------------- | -------------------------------------------- | -------------------------------------------- |
| TED GraphQL (ghostnet) | `https://ghostnet-api.tezos.domains/graphql` | Domain records, availability, reverse lookup |
| TED GraphQL (mainnet)  | `https://api.tezos.domains/graphql`          | Same, mainnet                                |
| TzKT (ghostnet)        | `https://api.ghostnet.tzkt.io`               | Contract storage, transaction history        |
| TzKT (mainnet)         | `https://api.tzkt.io`                        | Same, mainnet                                |
| PartyKit               | `https://hackchat.skullzarmy.partykit.dev`   | WebSocket rooms (global + DM)                |
