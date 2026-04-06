# Skill: hack.tez API & Contract Reference

```yaml
skill_type: hybrid
domain: Tezos / hack.tez subdomain registrar
version: 1.0
api_base: https://hacktez.com
network_default: ghostnet
```

## Overview

hack.tez is a free Tezos subdomain registrar. Anyone can claim `name.hack.tez` (mainnet) or `name.hack.gho` (ghostnet) at no cost. Claimed subdomains are real Tezos Domains (TED) on-chain records — the owner has full TED ownership and can set addresses and manage their record.

**Key properties:**

- 1 subdomain per wallet (permanent — claim slot is spent even if TED record is later removed)
- 2-step commit-reveal registration (prevents front-running)
- Owner = the registering wallet (not a custodian)
- No API key required for the public REST API
- CORS open (`Access-Control-Allow-Origin: *`)

---

## Public REST API

**Base URL:** `https://hacktez.com`
**Local dev:** `http://localhost:8888`
**Response envelope (success):** `{ "data": ..., "network": "ghostnet" | "mainnet" }`
**Response envelope (error):** `{ "error": "...", "code": "INVALID_INPUT" | "UPSTREAM_ERROR" | "METHOD_NOT_ALLOWED" }`
**Cache:** responses are CDN-cached at the edge (`s-maxage=30–60s`)

---

### GET /api/v1/domains

Paginated list of all hack.tez registrations, newest first. Backed by on-chain transaction history (TzKT) so includes registration timestamp and operation hash.

**Query parameters:**

| Param   | Type    | Default | Max | Description       |
| ------- | ------- | ------- | --- | ----------------- |
| `limit` | integer | 50      | 50  | Number of results |

**Response:**

```json
{
    "data": [
        {
            "name": "skllz.hack.tez",
            "label": "skllz",
            "owner": "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY",
            "address": "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY",
            "registeredAt": "2025-03-27T08:01:29Z",
            "opHash": "oo..."
        }
    ],
    "count": 1,
    "limit": 50,
    "network": "mainnet"
}
```

**Usage:**

```typescript
// Fetch up to 50 registrations
const res = await fetch("https://hacktez.com/api/v1/domains?limit=50");
const { data, count } = await res.json();
```

---

### GET /api/v1/domain/:name

Fetch the TED domain record for a hack.tez subdomain. Accepts either the bare label (`alice`) or the full name (`alice.hack.tez` / `alice.hack.gho`).

Returns `{ data: null, available: true }` if the domain is not registered.

**Response (registered):**

```json
{
    "data": {
        "name": "alice.hack.tez",
        "label": "alice",
        "address": "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
        "owner": "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb"
    },
    "available": false,
    "network": "mainnet"
}
```

**Response (not registered):**

```json
{ "data": null, "available": true, "network": "mainnet" }
```

**Usage:**

```typescript
const res = await fetch("https://hacktez.com/api/v1/domain/alice");
const { data, available } = await res.json();

if (available) {
    console.log("alice.hack.tez is free to register");
} else {
    console.log("Owned by:", data.owner);
}
```

---

### GET /api/v1/availability/:label

Lightweight availability check. Returns only the `available` boolean — faster than `/api/domain` when you don't need the full record.

**Response:**

```json
{ "label": "alice", "available": false, "network": "mainnet" }
```

**Validation errors (400):**

- Label shorter than 3 characters
- Label longer than 63 characters
- Label contains characters other than lowercase `[a-z0-9-]`

**Usage:**

```typescript
const { available } = await fetch("https://hacktez.com/api/v1/availability/myname").then((r) => r.json());
```

---

### GET /api/v1/owner/:address

All hack.tez subdomains owned by a given Tezos wallet. Returns an empty array (not 404) if the address owns none.

**Path parameter:** Any valid `tz1...`, `tz2...`, `tz3...`, or `KT1...` address.

**Response:**

```json
{
    "data": [
        {
            "name": "alice.hack.tez",
            "label": "alice",
            "address": "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
            "owner": "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb"
        }
    ],
    "count": 1,
    "network": "mainnet"
}
```

**Usage:**

```typescript
const { data } = await fetch("https://hacktez.com/api/v1/owner/tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb").then((r) =>
    r.json(),
);

const hasHackTez = data.length > 0;
```

---

### GET /api/v1/resolve/:address

Reverse-resolve a Tezos address to its primary domain and all owned hack.tez subdomains. `primary` is the TED reverse record — what the user explicitly set. `hackTez` is an array of all hack.tez subdomains currently owned (they are NFTs and transferable, so ownership can change).

**Response:**

```json
{
    "address": "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
    "primary": "alice.tez",
    "hackTez": ["alice.hack.tez", "builder.hack.tez"],
    "network": "mainnet"
}
```

**Fields:**

- `primary` — TED reverse record if set, else first owned hack.tez subdomain, else null.
- `hackTez` — array of all hack.tez subdomains currently owned by this address. Empty array if none.

**Usage:**

```typescript
const { primary, hackTez } = await fetch(`https://hacktez.com/api/v1/resolve/${walletAddress}`).then((r) =>
    r.json(),
);

const displayName = primary ?? hackTez[0] ?? walletAddress.slice(0, 8) + "…";
```

---

### GET /api/v1/config

Current contract configuration. Use this before starting registration to get commit timing requirements and check if registration is paused.

**Response:**

```json
{
    "data": {
        "minCommitAgeSec": 30,
        "maxCommitAgeSec": 86400,
        "maxPerWallet": 1,
        "paused": false,
        "registrarAddress": "KT1X2ZbjZBaeRnnkzLyaZ3FtGp7wKuaimbzg"
    },
    "network": "ghostnet"
}
```

**Fields:**

- `minCommitAgeSec` — must wait at least this many seconds between commit and register
- `maxCommitAgeSec` — commit expires after this many seconds (must re-commit if expired)
- `maxPerWallet` — max subdomains per wallet (currently 1)
- `paused` — if `true`, registration is disabled on-chain

---

### GET /api/v1/activity

Recent on-chain claim and commit events, merged and sorted by time. Commit events have `name: null` since the hash is not recoverable off-chain. Used by the activity feed on the site.

**Query params:** `limit` (default 30, max 100)

**Response:**

```json
{
    "data": [
        { "type": "claimed", "address": "tz1...", "name": "alice.hack.gho", "timestamp": "2025-01-01T00:00:00Z", "opHash": "op..." },
        { "type": "committed", "address": "tz1...", "name": null, "timestamp": "2025-01-01T00:00:00Z", "opHash": "op..." }
    ],
    "count": 2,
    "limit": 30,
    "network": "ghostnet"
}
```

**Fields:**

- `type` — `"claimed"` (register entrypoint applied) or `"committed"` (commit entrypoint applied)
- `name` — full domain name for claims, `null` for commits
- `opHash` — deduplication key

**Cache:** `s-maxage=20, stale-while-revalidate=40`

---

### GET /api/v1/hackatar/:label

Generative avatar GIF for a hack.tez subdomain. Deterministically generated from a salted domain name — same domain always produces the same hackatar. Cached immutably after first generation.

**Path:** `label` — bare subdomain label (e.g. `skllz`)
**Query:** `static=1` — returns single-frame still instead of animated loop

**Response:** Binary GIF image (`Content-Type: image/gif`)
- Animated: 30 frames at 80ms, 192×192px
- Static: single frame, 192×192px
- `Cache-Control: public, max-age=31536000, immutable`

```
GET https://hacktez.com/api/v1/hackatar/skllz         → animated GIF
GET https://hacktez.com/api/v1/hackatar/skllz?static=1 → still GIF
```

**Usage:**

```html
<img src="https://hacktez.com/api/v1/hackatar/skllz" alt="skllz hackatar" />
```

---

### GET /api/v1/profile/:name

Parsed builder profile for a hack.tez subdomain. Accepts bare label or full name. Returns `profile: {}` if domain exists but has no hack: data.

**Response:**

```json
{
    "data": {
        "name": "alice.hack.tez",
        "owner": "tz1...",
        "address": "tz1...",
        "profile": { "name": "Alice", "picture": "ipfs://...", "bio": "...", "status": "hacking" },
        "registrationHash": "op...",
        "registeredAt": "2025-03-27T08:01:29Z"
    },
    "network": "ghostnet"
}
```

Profile uses `picture` (from `openid:picture`), not `avatar`. `registrationHash` / `registeredAt` may be `null` for preloaded domains.

---

## Registration Flow (Contract Interaction)

The registrar uses a commit-reveal scheme to prevent front-running.

### Step 1: Compute commitment hash

The commitment is a blake2b-256 hash of the packed Michelson bytes of `(label, nonce, sender_address)`.

```typescript
import { blake2b } from "blakejs";
import { encodePacked } from "@taquito/utils"; // or manual Michelson packing

// label: string (e.g. "alice")
// nonce: random 32-byte hex string
// sender: tz1... address of the registering wallet

function computeCommitment(label: string, nonce: string, sender: string): string {
    // Pack as Michelson pair(pair(bytes(label), bytes(nonce)), address(sender))
    // See src/lib/commitment.ts for the canonical implementation
    const packed = packCommitmentMichelson(label, nonce, sender);
    const hash = blake2b(packed, undefined, 32);
    return Buffer.from(hash).toString("hex");
}
```

> **Important:** The commitment hash MUST match what the on-chain contract computes. Use the canonical implementation in `src/lib/commitment.ts` — do not re-implement.

### Step 2: Submit commit transaction

```typescript
// Via DAppClient (Beacon) — raw Michelson operation
await dAppClient.requestOperation({
    operationDetails: [
        {
            kind: TezosOperationType.TRANSACTION,
            destination: REGISTRAR_ADDRESS,
            amount: "0",
            parameters: {
                entrypoint: "commit",
                value: { string: commitmentHex }, // bytes in Michelson
            },
        },
    ],
});

// Store pending commit locally
localStorage.setItem(
    "hack-tez-pending-commits",
    JSON.stringify({
        label,
        nonce,
        commitHash,
        timestamp: Date.now(),
    }),
);
```

### Step 3: Wait for commit age

```typescript
const config = await fetch("https://hacktez.com/api/v1/config").then((r) => r.json());
const waitMs = config.data.minCommitAgeSec * 1000;

// Check /api/config for current values — don't hardcode
await new Promise((resolve) => setTimeout(resolve, waitMs));
```

### Step 4: Submit register transaction

```typescript
await dAppClient.requestOperation({
    operationDetails: [
        {
            kind: TezosOperationType.TRANSACTION,
            destination: REGISTRAR_ADDRESS,
            amount: "0",
            parameters: {
                entrypoint: "register",
                value: {
                    prim: "Pair",
                    args: [
                        { string: labelHex }, // label as Michelson bytes
                        { string: nonceHex }, // nonce as Michelson bytes
                        // optional: address to resolve to, optional data map
                    ],
                },
            },
        },
    ],
});
```

> See `src/lib/contract.ts` for the canonical `submitCommit()` and `submitRegister()` implementations.

---

## Label Validation Rules

Before calling any API or contract endpoint, validate the label client-side:

```typescript
function validateLabel(label: string): { valid: boolean; error?: string } {
    if (label.length < 3) return { valid: false, error: "Min 3 characters" };
    if (label.length > 63) return { valid: false, error: "Max 63 characters" };
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(label)) {
        return { valid: false, error: "Lowercase alphanumeric and hyphens only" };
    }
    return { valid: true };
}
```

**Reserved labels** (cannot be registered — enforced on-chain):
`admin`, `support`, `help`, `www`, `mail`, `ftp`, `api`, `app`, `ns1`, `ns2`, `dns`, `mx`, `smtp`, `imap`, `pop`, `ssh`, `hack`, `tez`, `tezos`, `test`, `dev`, `staging`, `prod`, `official`, `bot`, `system`, `root`, `null`, `undefined`

---

## Network Configuration

| Property           | Ghostnet                                     | Mainnet                              |
| ------------------ | -------------------------------------------- | ------------------------------------ |
| TLD                | `.gho`                                       | `.tez`                               |
| Full domain format | `label.hack.gho`                             | `label.hack.tez`                     |
| Registrar          | `KT1X2ZbjZBaeRnnkzLyaZ3FtGp7wKuaimbzg`       | Set via `VITE_REGISTRAR_ADDRESS`     |
| TED GraphQL        | `https://ghostnet-api.tezos.domains/graphql` | `https://api.tezos.domains/graphql`  |
| TzKT API           | `https://api.ghostnet.tzkt.io`               | `https://api.tzkt.io`                |
| RPC                | `https://rpc.ghostnet.teztnets.com`          | `https://mainnet.tezos.marigold.dev` |

Network is selected via `VITE_TEZOS_NETWORK` env var (default: `ghostnet`).

---

## Error Handling

| Code                 | HTTP    | When                                                                   |
| -------------------- | ------- | ---------------------------------------------------------------------- |
| `INVALID_INPUT`      | 400     | Bad label (too short/long/invalid chars), invalid Tezos address format |
| `METHOD_NOT_ALLOWED` | 405     | Non-GET request                                                        |
| `UPSTREAM_ERROR`     | 502/503 | TED GraphQL or TzKT unreachable, or registrar address not configured   |

All errors include a human-readable `error` string alongside the `code`.

---

## Common Patterns

### Check availability then show registration UI

```typescript
async function checkAndShow(label: string) {
    const [validationResult, configResult] = await Promise.all([
        fetch(`https://hacktez.com/api/v1/availability/${label}`).then((r) => r.json()),
        fetch("https://hacktez.com/api/v1/config").then((r) => r.json()),
    ]);

    if (configResult.data.paused) return showPausedMessage();
    if (!validationResult.available) return showTakenMessage();

    showRegistrationForm({ minCommitAgeSec: configResult.data.minCommitAgeSec });
}
```

### Resolve address for display

```typescript
async function getDisplayName(address: string): Promise<string> {
    try {
        const { primary, hackTez } = await fetch(`https://hacktez.com/api/v1/resolve/${address}`).then((r) =>
            r.json(),
        );
        return primary ?? hackTez[0] ?? `${address.slice(0, 6)}…${address.slice(-4)}`;
    } catch {
        return `${address.slice(0, 6)}…${address.slice(-4)}`;
    }
}
```

### Fetch all registrations

```typescript
// The /domains endpoint returns up to 50 results in a single call.
// For most use cases, one request is sufficient.
const { data, count } = await fetch("https://hacktez.com/api/v1/domains?limit=50").then((r) => r.json());
console.log(`Got ${data.length} of ${count} total domains`);
```
