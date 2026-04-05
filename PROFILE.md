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

> **⚠️ Verify before implementing:** Confirm on BetterCallDev that domain owners can call `set_child_record` on the NameRegistry directly, or whether they must go through the SetChildRecord proxy (`KT1HpddfW7rX5aT2cTdsDaQZnH46bU7jQSTU`). If the NameRegistry restricts callers to the proxy, the implementation must route through the proxy instead.

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

function verifyPinRequest(address: string, timestamp: number, nonce: string, signature: string, publicKey: string): boolean {
  const message = `hack.tez:pin:${timestamp}:${nonce}`;
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

## IPFS Pinning via Pinata

Images (avatars, project logos) are stored on IPFS via **Pinata** — a managed pinning service. No self-hosted infrastructure needed.

### Architecture

```
frontend  ──POST /api/v1/pin (blob + sig)──▶  Netlify Function  ──POST pinFileToIPFS──▶  Pinata API
                                                     │                                        │
                                              validates signature                        pins blob
                                              holds PINATA_JWT                          returns CID
                                              never exposed                                  │
                                                     ◀──────────────────────────── { IpfsHash }
                                                     │
frontend  ◀───────────────────── { cid: "bafybei..." }
    │
    └── displays via https://ipfs.fileship.xyz/ipfs/<CID>
```

### Netlify Function (`netlify/functions/pin.mts`)

Proxies blob uploads to Pinata. The `PINATA_JWT` env var lives only in Netlify — never shipped to the browser.

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /api/v1/pin` | wallet signature | Accepts multipart blob + signature, forwards to Pinata, returns `{ cid }` |

**Constraints enforced by the function:**
- Max file size: 4MB (enforced before forwarding)
- Allowed MIME types: `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/svg+xml`
- `PINATA_JWT` is a server-only Netlify env var (no `VITE_` prefix)

**Auth — wallet signature verification:**

The function requires proof that the caller owns a hack.tez domain. No database or session needed — fully stateless.

Request shape (multipart form data):
```
file:       <blob>
address:    "tz1..."
publicKey:  "edpk..."
timestamp:  1712345678
nonce:      "a3f9c2..."
signature:  "<sig of `hack.tez:pin:<timestamp>:<nonce>` signed by address>"
```

Function validation steps:
1. Reject if `timestamp` is older than 5 minutes (replay protection)
2. Confirm `publicKey` hashes to `address` (prevents pubkey substitution attacks)
3. Verify `signature` is valid for `publicKey` over the expected message `hack.tez:pin:<timestamp>:<nonce>`
4. Call TED GraphQL to confirm `address` owns at least one `*.hack.tez` domain
5. If all pass → forward file to Pinata `pinFileToIPFS`, return CID
6. Any failure → `401 Unauthorized`

**Note on replay protection:** Nonce dedup is intentionally omitted. Netlify Functions are stateless — no shared memory between invocations makes server-side nonce tracking impractical without an external store. The 5-minute timestamp window provides sufficient protection since a replayed pin request is idempotent (re-pinning the same file is harmless). The nonce remains in the signed message to ensure each signature is unique, but we don't track seen nonces server-side.

The `publicKey` is available from the wallet after connection — Beacon exposes it as part of the active account. No TzKT lookup needed.

**Response:**
```json
{ "cid": "bafybei..." }
```

**Pinata API call:**
```ts
const form = new FormData();
form.append("file", fileBlob, filename);

const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.PINATA_JWT}` },
  body: form,
});
const { IpfsHash } = await res.json(); // → "bafybei..."
```

### Gateway

All IPFS content is served via the public gateway:

```
https://ipfs.fileship.xyz/ipfs/<CID>
```

The frontend constructs this URL from the CID returned by `/api/v1/pin`. No gateway auth needed — content is public by CID. Pinata handles pinning and IPFS network propagation; the display gateway is a separate concern.

### Frontend Integration

When a user uploads a profile image or project logo:
1. Frontend sends the file to `POST /api/v1/pin` with wallet signature fields
2. Netlify function validates signature + ownership, forwards to Pinata with JWT
3. Returns CID; frontend constructs the display URL as `https://ipfs.fileship.xyz/ipfs/<CID>` for immediate display
4. **Stores `ipfs://<CID>` in TED record** — not the gateway URL. Gateway is a frontend concern. The frontend always constructs the display URL from the raw `ipfs://` URI.

### Monorepo Structure

```
├── netlify/
│   └── functions/
│       ├── api.mts        # Existing REST API
│       └── pin.mts        # New: IPFS pin proxy (Pinata)
```

No separate `ipfs/` directory needed — Pinata is a managed service.

### Environment Variables

| Variable | Scope | Description |
|----------|-------|-------------|
| `PINATA_JWT` | Netlify server-only | Pinata API JWT token for `pinFileToIPFS` calls |

Set in Netlify environment settings. No `VITE_` prefix — never exposed to the browser.

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

---

## Documentation Updates

Each phase that ships user-facing changes must include corresponding docs updates. These are not afterthoughts — they ship with the feature.

### Home Page (`src/pages/Home.tsx`)

The "How it works" section currently ends at claiming a name. After the profile system lands:
- Add a 5th step: **"Set up your profile"** — bio, skills, projects, links. Link to `/u/:label` as a preview.
- The post-claim success state should prompt the user to set up their profile with a direct link to their profile page in edit mode (`/u/:label?edit=true` or similar).
- Mention that profiles are publicly readable — "Anyone can view your builder profile at `yourname.hack.tez`."

### Developers Page (`src/pages/Developers.tsx`)

This is the API reference. It must be updated in lockstep with new endpoints:

- **`GET /api/v1/profile/:name`** — add to the Endpoints section with the same expandable card pattern used by existing endpoints. Include request/response shape, error codes, and example.
- **`POST /api/v1/pin`** — document the authenticated pin endpoint: request shape (multipart + signature fields), constraints (4MB, allowed MIME types), response (`{ cid }`), auth flow summary.
- **Profile spec reference** — add a new top-level section (after Endpoints) documenting the `hack:*` key namespace, `ProjectEntry` schema, encoding rules, safe merge rule, and avatar fallback chain. This section is the canonical spec for third-party integrations — bots, aggregators, and other apps should be able to build on hack.tez profiles from this page alone.

### Policies Page (`src/pages/Policies.tsx`)

The existing "What we will remove" section covers hate speech, impersonation, and fraud at the domain level. Profiles expand the attack surface:

- **Profile content policy** — add a section clarifying that the same removal policy applies to profile data (bio, project descriptions, avatar images). Admin can clear profile fields via UpdateRecord if content violates policy.
- **Image hosting** — note that pinned images are permanent on IPFS. Admin can remove the `openid:picture` reference from the TED record but cannot delete the underlying IPFS content. Clarify this limitation.
- **No verification** — make explicit that `hack:status`, `hack:skills`, GitHub/Twitter handles, etc. are self-reported and unverified. hack.tez does not validate that a user actually controls the linked accounts.

### Hackers Page (`src/pages/Hackers.tsx`)

Currently a table of registered domains. Once profiles exist:
- Each row/card should show profile data when available (avatar, bio snippet, link icons).
- Link each entry to `/u/:label` instead of (or in addition to) the TED management page.
- Empty profiles show a minimal card with just the domain name and owner address.

### README.md

Minimal update — add one line after the existing tagline to mention profiles:
> Connect wallet → Claim `yourname.hack.tez` → Set up your builder profile → That's it.

Add `/api/v1/profile/:name` and `POST /api/v1/pin` to the API endpoints list if one exists in the README.

### AGENTS.md

Add the profile-related files to the "Key Files" table:
- `src/types/profile.ts` — Profile types and parsing
- `src/lib/signing.ts` — Wallet message signing
- `src/lib/pin.ts` — Pinata upload client
- `netlify/functions/pin.mts` — Authenticated IPFS pin proxy

Add `PINATA_JWT` to the Environment Variables section.
