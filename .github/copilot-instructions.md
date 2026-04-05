# Copilot Agent Instructions — hack.tez

## Project Summary

hack.tez is a free Tezos subdomain registrar. Users connect a Tezos wallet, claim `name.hack.tez` via a SmartPy smart contract on ghostnet, and gain full Tezos Domains (TED) ownership of the record. The frontend is a Vite + React + TypeScript SPA hosted on Netlify. The contract uses a commit-reveal registration pattern enforced entirely on-chain.

**Languages/Frameworks:** TypeScript (frontend + scripts), Python (SmartPy contract), React 19, Vite 8, Tailwind CSS 4, Taquito SDK, octez.connect-sdk (Beacon wallet).
**Runtime:** Node.js ≥ 24, npm ≥ 11. SmartPy contract compilation requires Docker and `pip install smartpy-tezos` (v0.24.1).

## Build & Validation Commands

Always run `npm install` before building if `node_modules/` is missing or `package.json` changed.

| Task | Command | Notes |
|------|---------|-------|
| Install deps | `npm install` | Must complete before any other command |
| Type check | `npx tsc -b` | Runs both `tsconfig.app.json` (src/) and `tsconfig.node.json` (vite.config.ts) |
| Build (production) | `npm run build` | Runs `tsc -b && vite build`. Output in `dist/`. ~2s. |
| Dev server | `npm run dev` | Vite dev server on localhost:5173 |
| Preview built app | `npm run preview` | Serves `dist/` |
| Lint | `npm run lint` | **Currently broken** — no `eslint.config.js` exists. ESLint 9 requires flat config. Do NOT rely on this passing. |

**Validation sequence after any code change:**
```bash
npx tsc -b && npm run build
```
Both must exit 0. The `tsc -b` step is strict: `noUnusedLocals`, `noUnusedParameters`, `strict`, `verbatimModuleSyntax`, and `erasableSyntaxOnly` are all enabled. Any unused import or variable will fail the build.

**Known warnings (safe to ignore):**
- `vite-plugin-node-polyfills` emits a deprecation warning about `esbuild` option — cosmetic only.
- `"vm"` and `"fs"` externalized for browser compatibility — expected from Tezos SDK dependencies.
- Chunk size warning (>500 kB) — the Tezos SDK bundle is large; this is normal.

## TypeScript Conventions

- `"module": "ESNext"` with `"moduleResolution": "bundler"` — use ESM imports only.
- `"verbatimModuleSyntax": true` — always use `import type { X }` for type-only imports.
- `"erasableSyntaxOnly": true` — no `enum`, no `namespace`, no parameter properties. Use `const` objects or union types instead.
- `"noEmit": true` — TypeScript is check-only; Vite handles bundling.
- `"jsx": "react-jsx"` — no need to import React in `.tsx` files.
- Tailwind CSS 4 is used via `@tailwindcss/vite` plugin — styles use utility classes, no separate CSS files beyond `src/index.css` which contains only `@import "tailwindcss"`.

## React / Data-Fetching Rules

- **Never wipe the DOM on background refresh.** When a hook or component re-fetches data (polling, post-mutation refresh, `refreshKey` increment), do NOT set `loading=true` if data already exists. Only show a loading spinner/skeleton on the very first fetch. Use a `hasFetched` ref to track this. Subsequent fetches silently update state in place.
- **Network-dependent URLs must come from `config` (`src/config/tezos.ts`).** Never construct TED, TzKT, or GraphQL URLs ad-hoc in components. Use `config.tedAppUrl`, `config.tzktApi`, `config.domainsGraphql`, etc.

## Project Layout

```
├── index.html                    # Vite entry point
├── vite.config.ts                # Vite config (React, Tailwind, Netlify, node polyfills)
├── netlify.toml                  # Netlify build config, SPA redirects, security headers (CSP)
├── package.json                  # Scripts: dev, build, lint, preview, deploy
├── tsconfig.json                 # References tsconfig.app.json + tsconfig.node.json
├── tsconfig.app.json             # Strict TS config for src/ (includes: ["src"])
├── tsconfig.node.json            # TS config for vite.config.ts only
├── .env.example                  # Env var template
├── AUDIT.md                      # Security audit findings (partially outdated after simplification)
├── PLAN.md                       # Architecture and workplan
│
├── src/
│   ├── main.tsx                  # React entry point
│   ├── App.tsx                   # Router: / → Home, /manage → Manage
│   ├── index.css                 # Tailwind import only
│   ├── config/
│   │   └── tezos.ts              # Network config (ghostnet/mainnet/shadownet), contract addresses
│   ├── context/
│   │   └── TezosContext.tsx       # Wallet connection via octez.connect-sdk (Beacon)
│   ├── components/
│   │   ├── ConnectWallet.tsx      # Wallet connect/disconnect/reset UI
│   │   ├── SubdomainSearch.tsx    # Search + commit-reveal registration flow (main UI)
│   │   └── Dashboard.tsx         # Lists owned subdomains, links to TED for management
│   ├── hooks/
│   │   ├── useContractConfig.ts  # Fetches contract storage from TzKT (5-min cached)
│   │   ├── useEligibility.ts     # Checks wallet revealed status + age via TzKT
│   │   └── useSubdomains.ts      # Fetches owned subdomains via TED GraphQL
│   └── lib/
│       ├── contract.ts           # submitCommit() and submitRegister() via raw Michelson ops
│       ├── commitment.ts         # blake2b commitment hash (must match on-chain computation)
│       └── domains.ts            # TED GraphQL queries, label validation, reserved names
│
├── contract/
│   ├── hack_tez_registrar.py     # SmartPy contract (~1165 lines, 16 inline tests)
│   ├── deploy.ts                 # Generic deploy script (needs --code and --storage .tz files)
│   └── tests/                    # Empty — tests are inline in the .py file
│
├── scripts/
│   ├── redeploy-ghostnet.ts      # Deploys using compiled JSON Michelson + structured storage
│   └── test-ghostnet.ts          # E2E test: commit → wait → register on ghostnet
│
├── skills/                       # LLM context files for Tezos/SmartPy/Taquito (reference only)
└── public/
    └── favicon.svg
```

## Smart Contract (SmartPy)

The contract source is `contract/hack_tez_registrar.py`. It contains both the contract class and 16 inline test scenarios.

**Compile and test:**
```bash
pip install smartpy-tezos    # Requires Docker running
python contract/hack_tez_registrar.py
```
This produces test output directories (e.g., `Commit/`, `Admin_functions/`, etc.) in the project root. Compiled Michelson is at `<TestName>/step_001_cont_0_contract.json` and `.tz`. **Clean up these directories after compilation** — they are not committed.

**Critical contract knowledge:**
- `t_set_child_record` type has a `.layout()` override to match TED's non-alphabetical field order. SmartPy alphabetizes fields by default. If you change record fields in the contract, you MUST preserve the layout: `("label", ("parent", ("address", ("owner", ("data", "expiry")))))`.
- `parent_name` is the full domain name as hex bytes: ghostnet = `6861636b2e67686f` ("hack.gho"), mainnet = `6861636b2e74657a` ("hack.tez").
- The contract sets `owner=sp.sender` in the TED call, giving users full ownership.
- Storage fields are always alphabetically ordered by SmartPy in compiled Michelson.

**Deploy to ghostnet:**
```bash
export $(grep -v '^#' .env | xargs)
npx tsx scripts/redeploy-ghostnet.ts
```
Requires `TEZOS_WALLET_PUB_KEY` env var (which is actually the secret key `edsk...`). After deployment, the contract must be added as an operator on the hack.gho NFT (token_id 3577) in the TED NameRegistry.

## Key Contract Addresses (Ghostnet)

| Contract | Address |
|----------|---------|
| HackTezRegistrar (current) | `KT1X2ZbjZBaeRnnkzLyaZ3FtGp7wKuaimbzg` |
| TED NameRegistry (FA2) | `KT1REqKBXwULnmU6RpZxnRBUgcBmESnXhCWs` |
| TED SetChildRecord proxy | `KT1HpddfW7rX5aT2cTdsDaQZnH46bU7jQSTU` |
| TED UpdateRecord proxy | `KT1Ln4t64RdCG1bK8zkH6Xi4nNQVxz7qNgyj` |
| hack.gho token ID | 3577 |

## Environment Variables

Frontend (prefixed `VITE_`): `VITE_TEZOS_NETWORK` (ghostnet/mainnet), `VITE_REGISTRAR_ADDRESS` (optional override).
Server/scripts: `TEZOS_WALLET_PUB_KEY` (actually the edsk secret key — legacy naming).

## Architecture Decisions

- **No server-side code.** All Netlify Functions and edge functions were removed. The contract + TED handle everything.
- **Owner = sender.** Users own their TED records directly and manage them on Tezos Domains.
- **1 claim per wallet (permanent).** The `registrations` big_map tracks claims, not ownership. Even if admin unregisters at TED level, the wallet's claim is spent. Admin can use `set_registration_count` to grant exceptions.
- **Commit-reveal flow.** Two transactions: commit (hash), wait ≥ min_commit_age, then register (reveal). Pending commits are stored in `localStorage` under key `hack-tez-pending-commits`.
- **Wallet SDK is `@tezos-x/octez.connect-sdk`** (Beacon-compatible). Raw Michelson operations via `DAppClient.requestOperation()` — NOT Taquito's `ContractAbstraction`.

## Trust These Instructions

Use these instructions as your primary reference. Only search the codebase if specific information here is incomplete or found to be incorrect during execution.
