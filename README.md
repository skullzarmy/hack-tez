# hack.tez

Free Tezos subdomains. No permission required.

Connect a wallet. Claim `yourname.hack.tez`. Set up your builder profile. That's it.

Your name is a real on-chain record — it resolves, routes, and can be queried by contracts. Manage it at [Tezos Domains](https://tezos.domains). Set an address, configure your record. It's yours.

One claim per wallet. Permanent.

---

## Parts

| Directory | What it is |
|---|---|
| `src/` | React  the frontend |SPA 
| `contract/` | SmartPy registrar contract |
| `bot/` | Telegram event bot |
| `chat/` | Owner-gated web chat (CF Worker + PartyKit + D1) |
| `netlify/functions/` | Public REST API |
| `scripts/` | Deploy + e2e test scripts |

---

## Frontend (`src/`)

Vite + React 19 + TypeScript + Tailwind CSS 4. Hosted on Netlify.

Wallet: `@tezos-x/octez.connect-sdk` ( raw Michelson ops via `DAppClient.requestOperation()`. Domain data from TED GraphQL + TzKT.Beacon) 

```bash
npm install
npm run dev          # localhost:5173
npm run netlify:dev  # localhost: includes API functions8888 
```

**Validate before committing:**

```bash
npx tsc -b && npm run build
```

TypeScript is  unused imports are compile errors. Both must exit 0.strict 

---

## Contract (`contract/`)

`hack_tez_registrar. SmartPy. Commit-reveal pattern, no admin key for registrations.py` 

**Flow:**
1. `commit( blake2b hash of `(label, nonce, sender_address)`hash)` 
2. Wait >= min commit age (30s ghostnet)
3. `register(label,  verifies hash on-chain, calls TED `SetChildRecord`, records the claimnonce)` 

The contract sets `owner = sp. users get full TED ownership, not a proxy. `registrations` big_map tracks claims by wallet. Even if the TED record is removed, the claim slot is spent.sender` 

**Compile and test locally** (requires Docker):

```bash
pip install smartpy-tezos
python contract/hack_tez_registrar.py
```

Clean up output dirs after (`rm -rf Commit/ Admin_functions/` etc).

**Deploy:**

```bash
export $(grep -v '^#' .env | xargs)
npx tsx scripts/redeploy-ghostnet.ts
```

**Ghostnet addresses:**

| Contract | Address |
|---|---|
| HackTezRegistrar | `KT1X2ZbjZBaeRnnkzLyaZ3FtGp7wKuaimbzg` |
| TED NameRegistry (FA2) | `KT1REqKBXwULnmU6RpZxnRBUgcBmESnXhCWs` |
| TED SetChildRecord proxy | `KT1HpddfW7rX5aT2cTdsDaQZnH46bU7jQSTU` |
| TED UpdateRecord proxy | `KT1Ln4t64RdCG1bK8zkH6Xi4nNQVxz7qNgyj` |

---

## Telegram Bot (`bot/`)

Private admin bot (grammy + Bun) that watches the registrar contract via TzKT and sends Telegram notifications for commits and claims.

Polls TzKT every 30s. Admin- all non-admin messages are rejected. State stored in SQLite.only 

**Commands:**

| Command | Description |
|---|---|
| `/sub <label> [claims\|commits\|all]` | Subscribe to alerts for a subdomain |
| `/unsub <label>` | Unsubscribe |
| `/subs` | List active subscriptions |
| `/claims on\|off <label>` | Toggle claim alerts |
| `/commits on\|off <label>` | Toggle commit alerts |

**Run:**

```bash
cd bot
bun run src/index.ts
```

**Env vars:**

| Variable | Required | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Yes | BotFather token |
| `TELEGRAM_ADMIN_USER_ID` | Yes | Telegram user ID allowed to use the bot |
| `REGISTRAR_ADDRESS` | Yes | Contract address to watch |
| `TEZOS_NETWORK` | No | `ghostnet` (default), `mainnet`, `shadownet` |
| `POLL_INTERVAL_MS` | No | ms between polls (default: 30000) |
| `DB_PATH` | No | SQLite path (default: `./data/bot.db`) |

---

## Chat (`chat/`)

Real-time web chat gated to hack.tez domain holders. Your domain name is your identity — not your wallet.

**Access:** `/chat` on the site. Connect wallet → sign message → enter. No hack.tez domain = no entry.

**Identity:** Messages are tied to your domain name. Transfer the domain, the new owner inherits the chat identity. Wallets with multiple domains get a selector.

**Rooms:** Global room + direct messages. Messages persist. Ownership re-verified every 15 minutes.

**Stack:** Cloudflare Worker (auth) + PartyKit (WebSocket) + D1 (SQLite). Self-contained in `chat/`.

**Local dev:**

```bash
cd chat
npm install
cp .dev.vars.example .dev.vars  # set CHAT_JWT_SECRET
npx wrangler dev                # Worker on localhost:8787
npx partykit dev                # WebSocket on localhost:1999
```

**Deploy:**

```bash
cd chat
npx wrangler deploy             # CF Worker
npx partykit deploy             # PartyKit rooms
```

---

## Public REST API (`netlify/functions/api.mts`)

All `/api/v1/*` routes. No auth. Pure proxy to TED GraphQL + TzKT.

| Endpoint | Description |
|---|---|
| `GET /api/v1/domain/:name` | Domain record or `available: true` if unclaimed |
| `GET /api/v1/availability/:label` | `{ available: boolean }` |
| `GET /api/v1/owner/:address` | All hack.tez domains for a wallet |
| `GET /api/v1/resolve/:address` | Reverse-resolve wallet to primary domain |
| `GET /api/v1/domains?limit=50&offset=0` | Paginated list of all registrations |
| `GET /api/v1/config` | Contract config (commit ages, max per wallet, paused) |
| `GET /api/v1/activity?limit=30` | Recent on-chain claim + commit events |
| `GET /api/v1/profile/:name` | Parsed builder profile for a domain |
| `GET /api/v1/hackatar/:label` | Generative avatar GIF (animated). `?static=1` for single frame. |

Response shape: `{ data: ..., network: "ghostnet" | "mainnet" }` on success, `{ error: "...", code: "..." }` on failure.

---

## Frontend Env Vars

| Variable | Description |
|---|---|
| `VITE_TEZOS_NETWORK` | `ghostnet` (default) or `mainnet` |
| `VITE_REGISTRAR_ADDRESS` | Contract address override |
| `VITE_HACKCHAT_URL` | Chat worker URL (default: `http://localhost:8787`) |
| `VITE_PARTYKIT_HOST` | PartyKit host (default: `localhost:1999`) |

---

Unlicensed. No rights reserved. Take it.
