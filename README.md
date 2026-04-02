# hack.tez

Free Tezos subdomains. No permission required.

Connect a wallet. Claim `yourname.hack.tez`. Pay gas. That's it.

Your name is a real on-chain record — it resolves, routes, and can be queried by contracts. Manage it at [Tezos Domains](https://tezos.domains). Set an address, a redirect, an IPFS hash. It's yours.

One claim per wallet. Permanent.

---

## Stack

- **Frontend**: Vite + React 19 + TypeScript + Tailwind CSS 4
- **Wallet**: `@tezos-x/octez.connect-sdk` (Beacon) — raw Michelson ops via `DAppClient.requestOperation()`
- **Contract**: SmartPy — commit-reveal registrar on ghostnet, calls TED `SetChildRecord`
- **Hosting**: Netlify (SPA + Functions v2 for the public REST API)
- **Domain data**: TED GraphQL + TzKT

## Dev

```bash
npm install
npm run dev          # localhost:5173
npm run netlify:dev  # localhost:8888 (includes API functions)
```

**Validate before committing:**

```bash
npx tsc -b && npm run build
```

Both must exit 0. TypeScript is strict — unused imports are compile errors.

## Contract

`contract/hack_tez_registrar.py` — SmartPy. Commit-reveal pattern:

1. `commit(hash)` — hash of `(label, nonce, sender)`
2. Wait ≥ min commit age (~30s ghostnet)
3. `register(label, nonce)` — verifies hash, calls TED, records claim

Compile and test locally (requires Docker):

```bash
pip install smartpy-tezos
python contract/hack_tez_registrar.py
```

## Public API

All `/api/*` routes via `netlify/functions/api.mts`.

| Endpoint                       | Description                                 |
| ------------------------------ | ------------------------------------------- |
| `GET /api/domain/:name`        | Domain record or `available: true`          |
| `GET /api/availability/:label` | `{ available: boolean }`                    |
| `GET /api/owner/:address`      | All hack.tez domains for a wallet           |
| `GET /api/resolve/:address`    | Reverse-resolve wallet → primary domain     |
| `GET /api/domains`             | Paginated list of all registrations         |
| `GET /api/config`              | Contract config (commit ages, paused, etc.) |

## Contract Addresses (Ghostnet)

| Contract           | Address                                |
| ------------------ | -------------------------------------- |
| HackTezRegistrar   | `KT1X2ZbjZBaeRnnkzLyaZ3FtGp7wKuaimbzg` |
| TED NameRegistry   | `KT1REqKBXwULnmU6RpZxnRBUgcBmESnXhCWs` |
| TED SetChildRecord | `KT1HpddfW7rX5aT2cTdsDaQZnH46bU7jQSTU` |

---

Unlicensed. No rights reserved. Take it.
