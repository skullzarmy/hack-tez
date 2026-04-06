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
| `src/types/profile.ts`        | Profile types, parsing, validation                                         |
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

Base URL: `https://hack.tez` (locally: `http://localhost:8888`)

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
- **JWT is the trust boundary.** CF Worker issues JWT after verifying wallet signature + TED domain ownership. PartyKit only accepts connections with valid JWT. Both share `CHAT_JWT_SECRET`.
- **Hackatars are server-generated.** Generative avatars are built server-side in `api.mts`, seeded by a salted domain name (deterministic). Cached immutably in Netlify Blobs. The frontend `<Hackatar>` component uses `<img>` tags pointing to `/api/v1/hackatar/:label`. The engine lives in `src/lib/hackatar/` (pure JS, no DOM deps). See `HACKATARS.md` for the seeding roadmap.

---

## Environment Variables

| Variable                 | Used by                 | Notes                                             |
| ------------------------ | ----------------------- | ------------------------------------------------- |
| `VITE_TEZOS_NETWORK`     | Frontend + API function | `ghostnet` (default) or `mainnet`                 |
| `VITE_REGISTRAR_ADDRESS` | Frontend + API function | Contract address override                         |
| `TEZOS_WALLET_PUB_KEY`   | Deploy scripts only     | Actually the `edsk...` secret key (legacy naming) |
| `PINATA_JWT`             | Netlify server-only     | Pinata API JWT token for IPFS pinning             |
| `VITE_HACKCHAT_URL`     | Frontend                | Chat worker URL (default `http://localhost:8787`) |
| `VITE_PARTYKIT_HOST`    | Frontend                | PartyKit host (default `localhost:1999`)          |
| `CHAT_JWT_SECRET`        | CF Worker + PartyKit    | Shared JWT signing secret (set via wrangler/partykit) |

---

## External APIs Used

| Service                | URL                                          | Purpose                                      |
| ---------------------- | -------------------------------------------- | -------------------------------------------- |
| TED GraphQL (ghostnet) | `https://ghostnet-api.tezos.domains/graphql` | Domain records, availability, reverse lookup |
| TED GraphQL (mainnet)  | `https://api.tezos.domains/graphql`          | Same, mainnet                                |
| TzKT (ghostnet)        | `https://api.ghostnet.tzkt.io`               | Contract storage, transaction history        |
| TzKT (mainnet)         | `https://api.tzkt.io`                        | Same, mainnet                                |
| PartyKit               | `https://hackchat.skullzarmy.partykit.dev`   | WebSocket rooms (global + DM)                |
