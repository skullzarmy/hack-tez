# hack.tez Profile System

Every `name.hack.tez` domain is a builder identity. This document defines the spec, implementation plan, and key decisions for the profile layer built on top of Tezos Domains (TED) infrastructure.

---

## What is this?

Tezos Domains records support a `data` map — an arbitrary `map(string, bytes)` stored on-chain. We standardize the `hack:*` key namespace as the official profile spec for hack.tez holders. The spec lives here. The data lives on-chain. Profiles are readable by anyone via TED's GraphQL API without needing a server.

Every hack.tez domain becomes a portable, self-sovereign builder identity. Data is stored on-chain in the TED domain record's `data` map and is readable by anyone via TED's GraphQL API.

```
openid:name         → "Joe Peterson"
openid:nickname     → "joe"
openid:website      → "https://yoursite.xyz"
openid:picture      → "https://..." (or gravatar:hash)
github:username     → "yourhandle"
twitter:handle      → "yourhandle"
project:repository_url → "https://github.com/yourhandle/yourproject"
web:content_url     → "ipfs://..."
hack:bio            → "building tezos tooling one commit at a time"
hack:location       → "Berlin"
hack:status         → "building"
hack:skills         → ["SmartPy", "TypeScript", "Taquito"]
hack:projects       → [{"name":"hack.tez","url":"https://hack.tez","desc":"free tezos subdomains"}]
```

Projects are a first-class concept. The primary artifact of a hack.tez profile is *what you've built*.

---

## Phase 1 — Schema Definition

### Key Namespace

We use **TED's canonical keys** where they exist. The `hack:` prefix is reserved only for fields TED doesn't define. This means data set via the official TED app is automatically visible in hack.tez profiles, and vice versa.

**TED canonical key reference** (from `@tezos-domains/core`):
- `openid:*` — standard OpenID Connect profile fields
- `github:username`, `gitlab:username`, `twitter:handle`, `instagram:handle`, `keybase:username`
- `gravatar:hash`, `etherlink:address`
- `web:content_url`, `web:redirect_url`, `web:governance_profile_url`
- `project:repository_url`
- `td:ttl`

#### Fields shown in hack.tez profiles

| Key | Source | Description |
|-----|--------|-------------|
| `openid:name` | TED native | Display name |
| `openid:nickname` | TED native | Short handle / alias |
| `openid:website` | TED native | Personal or studio site |
| `openid:picture` | TED native | Avatar image URL — store as `ipfs://` URI, display via fileship gateway. Fallback order: `openid:picture` → `gravatar:hash` → generated avatar |
| `github:username` | TED native | GitHub username |
| `twitter:handle` | TED native | Twitter/X handle |
| `project:repository_url` | TED native | Primary repo URL |
| `hack:bio` | hack.tez | Short bio / tagline (160 chars) |
| `hack:location` | hack.tez | City, country, or "anon" (60 chars) |
| `hack:status` | hack.tez | Builder status enum (see below) |
| `hack:skills` | hack.tez | JSON `string[]`, max 10 tags |
| `hack:projects` | hack.tez | JSON `ProjectEntry[]`, no hard limit (see below) |

#### Builder Status Enum (`hack:status`)

`"building"` · `"open-to-collab"` · `"available"` · `"hiring"`

#### Project Entry Schema (`hack:projects`)

```ts
interface ProjectEntry {
  // Required
  name: string;          // project name, max 60 chars
  desc: string;          // one-line description, max 120 chars

  // At least one of these should be present
  url?: string;          // live site / app URL
  repo?: string;         // source repo URL (github, gitlab, etc.)

  // Where it lives
  environment?: "web" | "tezos" | "etherlink" | "tezlink" | "other";
  address?: string;      // contract or account address for the given environment

  // Sub-subdomain (set after claiming, e.g. "myproject" → myproject.name.hack.tez)
  subdomain?: string;    // label only, no dots — the pinned sub-subdomain for this project

  // Project state
  status?: "live" | "wip" | "archived" | "open-source";

  // Media
  logo?: string;         // image URL or IPFS URI (square, displayed as icon)
}
```

**Constraints:**
- `name` and `desc` are required
- `address` is interpreted in context of `environment` — a `KT1...` for Tezos L1, `0x...` for Etherlink/Tezlink, etc.
- `environment` defaults to `"web"` if omitted
- `status` defaults to `"live"` if omitted
- `subdomain` is the label of a sub-subdomain the user has registered under their own domain (e.g. `myproject` → `myproject.name.hack.tez`). Stored as a reference only — the actual TED record is separate.
- All other fields are optional to keep the barrier low

### Encoding

TED accepts data values as either **JSON** or **hex bytes**. All `hack:*` profile values are stored as **JSON-encoded strings** — the simplest case being a plain JSON string value:

```
hack:bio → "building tezos tooling one commit at a time"
```

Stored on-chain as the JSON representation (i.e. the bytes of the JSON string literal including quotes). This is human-readable on BetterCallDev and extensible — future keys could store JSON objects or arrays if needed.

When reading: parse the value as JSON → string.  
When writing: `JSON.stringify(value)` → bytes.

### Safe Merge Rule

When updating a profile, always:

1. Read the current `data` map from the domain record
2. Update only the keys your UI touched (`hack:*` and specific TED native keys we expose)
3. Preserve all other keys untouched — pass them through as-is, byte-for-byte, without re-encoding
4. Remove keys whose new value is empty string / null (deletion)

**Critical:** Never re-encode values you didn't write. TED native keys (`github:username`, `twitter:handle`, etc.) may be stored as raw bytes or in a different encoding than `JSON.stringify()` produces. If you read a TED native value and write it back through `JSON.stringify()`, you corrupt it. Only write keys the hack.tez profile editor owns. For TED native keys the editor exposes (e.g. `github:username`), write exactly the string value as bytes — no JSON wrapping.

---

## Phase 2 — Read Layer

### GraphQL

Extend domain queries to include `data { key value }` fields. Parse only `hack:*` keys into a typed `HackProfile` object.

**New function:** `getDomainProfile(name: string): Promise<HackProfile | null>`

**Extended:** `getSubdomainsByOwner()` to include profile data.

### API Endpoint

`GET /api/v1/profile/:name`

Returns:

```json
{
    "name": "joe.hack.tez",
    "owner": "tz1...",
    "address": "tz1...",
    "profile": {
        "bio": "...",
        "github": "yourhandle",
        "x": "yourhandle",
        "website": "https://...",
        "location": "Berlin",
        "status": "building",
        "skills": ["SmartPy", "TypeScript"],
        "projects": [{ "name": "...", "url": "...", "desc": "..." }]
    },
    "network": "mainnet"
}
```

Returns `404` with `{ error: "not found" }` if the domain doesn't exist.  
Returns `200` with `profile: {}` if the domain exists but has no hack: data set.

### Profile Page

Route: `/u/:subdomain` (e.g. `/u/joe`)

- Works without a connected wallet (pure read)
- Shows: deterministic avatar, label + `.hack.tez` badge, bio, links, owner address
- Shows "Edit profile" button only if connected wallet === domain owner
- Empty state: "This hacker hasn't set up their profile yet"
- 404 state: domain not registered

---

## Phase 3 — Write Layer

### UpdateRecord Contract

The TED UpdateRecord proxy (`KT1Ln4t64RdCG1bK8zkH6Xi4nNQVxz7qNgyj` on ghostnet) allows domain owners to update their record's `data` map. The caller must be the domain `owner` or an approved `operator`.

**New function:** `submitProfileUpdate(label: string, profile: Partial<HackProfile>): Promise<string>`

Flow:

1. Read current domain `data` via GraphQL
2. Merge new `hack:*` values (delete keys with empty string value)
3. Build raw Michelson op targeting UpdateRecord
4. Submit via `DAppClient.requestOperation()`
5. Return op hash

### Edit UI

Inline edit mode on the profile page:

- Click "Edit profile" → fields become inputs
- bio: textarea, 160 char limit, character counter
- github / x / website / location: plain text or URL inputs
- status: select from enum values
- skills: tag input (add/remove), max 10
- projects: add/remove cards with full ProjectEntry fields (see schema above)
  - each project card has a "Pin to subdomain" action (see Phase 3.5)
- Submit → pending toast → refresh on confirmation

---

## Phase 3.5 — Sub-Subdomains

Users who own `name.hack.tez` can create sub-subdomains directly — they are the TED owner of their domain and can call SetChildRecord with it as the parent. This requires no involvement from the hack.tez registrar contract.

**Examples:**
- `joe.hack.tez` → creates `myproject.joe.hack.tez`
- `studio.hack.tez` → creates `app.studio.hack.tez`, `api.studio.hack.tez`

### Dashboard UX

The Dashboard shows the user's owned domains. For each domain:
- "Manage subdomains" section lists existing sub-subdomains (queried from TED GraphQL)
- "New subdomain" button opens a create flow:
  - Enter a label
  - Optionally pick from their projects list (pre-fills label + sets `web:redirect_url` to the project URL)
  - Optionally set a redirect URL directly
  - Submits a raw Michelson op to TED's SetChildRecord proxy

### Project Pinning

On the project edit card, a "Pin to subdomain" button:
1. Prompts for a label (pre-filled from project name, slugified)
2. Creates the sub-subdomain with `web:redirect_url` set to the project `url`
3. Sets `subdomain` field in the `ProjectEntry` on success
4. Future: profile page renders the pinned subdomain as a clickable badge on the project card

### Contract

Sub-subdomains are created by calling the **TED NameRegistry directly** — not a proxy. Users own their domain and the NameRegistry allows the domain owner to call `set_child_record` with their domain as parent.

- TED NameRegistry (ghostnet): `KT1REqKBXwULnmU6RpZxnRBUgcBmESnXhCWs`
- The `parent` arg is the user's full domain name as hex bytes (e.g. `"joe.hack.gho"` → bytes)
- The `owner` is set to the caller's wallet address
- No expiry (sub-subdomains under user-owned domains don't expire separately)

**New function:** `submitCreateSubdomain(parentLabel: string, childLabel: string, redirectUrl?: string): Promise<string>`

---

## Phase 4 — Discovery

### /hackers Directory

Enhance the existing `/hackers` page (or create `/directory`) with a grid of profile cards. Each card shows:

- Deterministic avatar
- Label + `.hack.tez`
- Bio snippet (truncated)
- Link icons (github, x, website, etc.)

Paginated. Source: `/api/v1/domains` + profile data.

---

## Wallet Message Signing (`src/lib/signing.ts`)

Before the IPFS pin endpoint can use wallet signature auth, we need to implement message signing end-to-end. This is a prerequisite for the pin function and potentially other future authenticated endpoints.

### Client Side

Beacon (`@tezos-x/octez.connect-sdk`) supports `requestSignPayload()` for arbitrary message signing. The message must be a hex-encoded string prefixed to match Tezos signing conventions.

```ts
// src/lib/signing.ts

export function buildPinMessage(timestamp: number, nonce: string): string {
  // Human-readable message that users see in their wallet UI
  return `hack.tez:pin:${timestamp}:${nonce}`;
}

export async function signMessage(
  client: DAppClient,
  message: string
): Promise<{ signature: string; publicKey: string }> {
  // Tezos requires messages to be hex-encoded with a Micheline magic byte prefix
  const bytes = stringToHex(message);             // UTF-8 → hex
  const payloadBytes = TEZOS_SIGN_PREFIX + bytes; // 0x0501 prefix for Micheline strings

  const result = await client.requestSignPayload({
    signingType: SigningType.MICHELINE,
    payload: payloadBytes,
  });

  return { signature: result.signature, publicKey: result.signerPublicKey };
}
```

### Server Side (Netlify Function)

Verify the signature using `@taquito/utils` — already in the dependency tree via Taquito.

```ts
import { verifySignature, hex2buf } from "@taquito/utils";

function verifyPinRequest(address: string, timestamp: number, signature: string, publicKey: string): boolean {
  const message = `hack.tez:pin:${timestamp}`;
  const bytes = stringToHex(message);
  const payloadBytes = TEZOS_SIGN_PREFIX + bytes;
  return verifySignature(payloadBytes, publicKey, signature);
}
```

Then confirm `publicKey` hashes to `address` (prevents pubkey substitution attacks).

### What needs to be built

1. **`src/lib/signing.ts`** — `buildPinMessage()`, `signMessage()`, `stringToHex()`, prefix constants
2. **`src/hooks/useSign.ts`** — React hook wrapping `signMessage()` with loading/error state, using the `DAppClient` from context
3. **`netlify/functions/pin.mts`** — `verifyPinRequest()`, ownership check via TED GraphQL

The signing library is small and self-contained. Once it exists it can be reused for any future authenticated endpoint.

---

## IPFS Service (`ipfs/`)

Images (avatars, project logos) are stored on IPFS. We run our own Kubo node with a thin API layer for authenticated pinning. This lives as a separate service in the monorepo under `ipfs/`.

### Architecture

```
frontend  ──POST /api/pin (blob, no key)──▶  Netlify Function  ──POST /pin (+ secret key)──▶  Kubo RPC
                                                    │                                               │
                                             validates file                                    pins blob
                                             holds IPFS_API_KEY                               returns CID
                                             never exposed                                         │
                                                    ◀──────────────────────────────────── { cid }
                                                    │
frontend  ◀───────────────────── { cid: "bafybei..." }
    │
    └── displays via https://ipfs.fileship.xyz/ipfs/<CID>
```

### Kubo Node

- Runs as a standard Kubo daemon (`ipfs daemon`)
- RPC API bound to `localhost:5001` only — never exposed publicly
- Pins are permanent (no GC by default); future: add pin management endpoint

### Netlify Function (`netlify/functions/pin.mts`)

Proxies blob uploads to Kubo. The `IPFS_API_KEY` and `IPFS_PIN_URL` env vars live only in Netlify — never shipped to the browser.

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /api/pin` | none (caller is browser) | Accepts multipart blob, forwards to Kubo via API key, returns `{ cid }` |

**Constraints enforced by the function:**
- Max file size: 4MB (enforced before forwarding)
- Allowed MIME types: `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/svg+xml`
- `IPFS_API_KEY` and `IPFS_PIN_URL` are server-only Netlify env vars (no `VITE_` prefix)

**Auth — wallet signature verification:**

The function requires proof that the caller owns a hack.tez domain. No database or session needed — fully stateless.

Request shape:
```json
{
  "file": "<blob>",
  "address": "tz1...",
  "publicKey": "edpk...",
  "timestamp": 1712345678,
  "nonce": "a3f9c2...",
  "signature": "<sig of `hack.tez:pin:<timestamp>:<nonce>` signed by address>"
}
```

Function validation steps:
1. Reject if `timestamp` is older than 5 minutes (replay protection)
2. Confirm `publicKey` hashes to `address` (prevents pubkey substitution attacks)
3. Verify `signature` is valid for `publicKey` over the expected message
4. Reject if `nonce` has been seen before within the 5-minute window (in-memory set, prevents replay within window)
5. Call TED GraphQL to confirm `address` owns at least one `*.hack.tez` domain
6. If all pass → forward to Kubo, return CID
7. Any failure → `401 Unauthorized`

The `publicKey` is available from the wallet after connection — Beacon exposes it as part of the active account. No TzKT lookup needed.

**Response:**
```json
{ "cid": "bafybei..." }
```

### Gateway

All IPFS content is served via the public gateway:

```
https://ipfs.fileship.xyz/ipfs/<CID>
```

The frontend constructs this URL from the CID returned by `/api/pin`. No gateway auth needed — content is public by CID.

### Frontend Integration

When a user uploads a profile image or project logo:
1. Frontend sends the file to `POST /api/pin` — no credentials, just the blob + wallet signature
2. Netlify function validates, forwards to Kubo with the secret key
3. Returns CID; frontend constructs the display URL as `https://ipfs.fileship.xyz/ipfs/<CID>` for immediate display
4. **Stores `ipfs://<CID>` in TED record** — not the gateway URL. Gateway is a frontend concern. The frontend always constructs the display URL from the raw `ipfs://` URI.

### Monorepo Structure

```
├── ipfs/
│   ├── kubo.md            # Setup instructions for the Kubo node (systemd, config)
│   └── README.md          # Architecture overview
├── netlify/
│   └── functions/
│       ├── api.mts        # Existing REST API
│       └── pin.mts        # New: IPFS pin proxy
```

### Deployment Notes

- Kubo node runs on a VPS, RPC only on `localhost:5001`
- API layer (`ipfs/server.ts`) is not needed — Netlify function handles the proxy
- `IPFS_API_KEY` and `IPFS_PIN_URL` set in Netlify environment (server-only, no `VITE_` prefix)
- CORS on the Kubo VPS locked to the Netlify function's outbound IP range

---

## Implementation Notes

- **TED encoding:** `hack:*` scalar fields store plain UTF-8 strings. `hack:skills` and `hack:projects` store JSON arrays. TED native keys (e.g. `github:username`, `twitter:handle`) are stored as raw bytes by the TED app — write them as raw strings, never through `JSON.stringify()`.
- **Safe merge:** Only re-write keys the profile editor owns. Pass all other keys through byte-for-byte from the read.
- **`hack:projects` is one atomic blob.** All projects are stored in a single JSON array. A partial write failure loses nothing (transaction is atomic); a successful write replaces all. The UI should warn on unload if there are unsaved changes.
- **URL sanitization:** All `url`, `repo`, `website`, `logo` fields must be validated on write (allow `https://` and `ipfs://` only, reject `javascript:` and bare paths) and sanitized on render — never bind unvalidated URLs to `href` or `src`.
- **Avatar fallback chain:** `openid:picture` (if set) → `gravatar:hash` (construct gravatar URL) → deterministic generated avatar (from domain label).
- **`hack:status` is self-reported.** Show a "last profile update" timestamp derived from TzKT op history so viewers know how stale it might be.
- **`/u/:subdomain` network awareness:** Profile page must use `VITE_TEZOS_NETWORK` to construct the correct full domain name (`<label>.hack.gho` on ghostnet, `<label>.hack.tez` on mainnet) for the GraphQL lookup.
- **Discovery bulk query:** The `/hackers` directory must use a single TED GraphQL query with `data { key value }` included — never fetch profiles individually per domain. Use the `domains` query with parent filter and request all fields at once.
- **Safe merge race condition:** Read → merge → write is not atomic. Two simultaneous edits will silently overwrite each other. Document in the UI: warn if the on-chain data changed since the edit form was opened.
- **The UpdateRecord proxy entrypoint signature must be verified on BetterCallDev before implementing the write path.**
- **Profile pages are indexable** — no auth required to view.
- **All profile writes are user-signed on-chain transactions.** No server involvement.
- **`/developers` page** should be updated to serve as the canonical public reference for the profile spec — key namespace, ProjectEntry schema, encoding rules, API endpoint shape, and safe merge rule. Third-party apps and bots should be able to build on hack.tez profile data from that page alone.
