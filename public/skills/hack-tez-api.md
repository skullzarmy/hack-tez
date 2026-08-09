---
title: "hack.tez API Reference"
description: "REST API and smart contract reference for the hack.tez free Tezos subdomain registrar. Covers all endpoints, registration flow, label validation, and error handling."
tags: [tezos, api, hack-tez, rest, registration]
---
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
**Cache:** responses are CDN-cached at the edge; the `/domains` list and the directory snapshot behind `/members` + `/projects` are additionally cached in Upstash Redis with serve-stale-while-revalidate (60 s fresh, 10 min hard TTL)

---

## Directory API

The whole community in one call. `/domains` is the **registry** view (one row per registration); `/members` and `/projects` are the **directory** view — every member with their complete profile, every project with all of its metadata plus the slug and canonical page URL the site itself resolves it at.

Use the directory endpoints when you want profiles and projects. Use `/domains` when you want registration facts.

All three read one Redis-cached snapshot and filter it in memory, so filters are free. Every response carries:

- `X-Cache` header — `HIT`, `STALE` or `MISS`
- `generatedAt` — ISO timestamp of when the snapshot was built
- `count` — rows in this page; `total` — rows in the filtered set

---

### GET /api/v1/members

Every hack.tez member with their full profile: bio, location, builder status, skills, every social handle, tip jar config, and every project with all of its metadata. **Returns all members by default** — no paging required.

**Query parameters:**

| Param         | Type                     | Default      | Description                                                                              |
| ------------- | ------------------------ | ------------ | ---------------------------------------------------------------------------------------- |
| `limit`       | integer                  | 1000 (all)   | Max members to return (max 1000)                                                          |
| `offset`      | integer                  | 0            | Skip this many members, applied after filtering                                           |
| `sort`        | `name`/`newest`/`oldest` | `name`       | Alphabetical, or by registration time (members with no known registration sort last)      |
| `status`      | string                   | —            | Builder status: `building`, `open-to-collab`, `available`, `hiring`                       |
| `skill`       | string                   | —            | Exact skill match, case-insensitive                                                       |
| `q`           | string                   | —            | Substring search over label, name, nickname, bio, location, skills, project names + descs |
| `hasProjects` | `1`                      | —            | Only members with at least one project                                                    |
| `projects`    | `none`                   | —            | Omit project bodies for a lighter payload (`counts.projects` stays accurate)              |
| `tips`        | `1`                      | —            | Include chain-verified tip counters as `tipCounters`                                      |

**Response:**

```json
{
    "data": [
        {
            "name": "alice.hack.tez",
            "label": "alice",
            "owner": "tz1...",
            "address": "tz1...",
            "registeredAt": "2025-03-27T08:01:29Z",
            "opHash": "oo...",
            "urls": {
                "profile": "https://hacktez.com/u/alice",
                "api": "https://hacktez.com/api/v1/members/alice",
                "avatar": "https://hacktez.com/api/v1/avatar/alice",
                "hackatar": "https://hacktez.com/api/v1/hackatar/alice",
                "shareCard": "https://hacktez.com/api/v1/share-card/alice",
                "tips": "https://hacktez.com/api/v1/tips/alice"
            },
            "profile": {
                "name": "Alice",
                "picture": "ipfs://bafybei...",
                "bio": "building on tezos",
                "location": "berlin",
                "status": "building",
                "skills": ["typescript", "smartpy"],
                "github": "alice",
                "tips": { "enabled": true, "amounts": ["1", "5", "10"] },
                "projects": [
                    {
                        "name": "Cold Milk",
                        "desc": "on-chain generative art",
                        "url": "https://coldmilk.xyz",
                        "repo": "https://github.com/alice/coldmilk",
                        "environment": "tezos",
                        "address": "KT1...",
                        "status": "live",
                        "logo": "ipfs://bafybei...",
                        "tips": { "enabled": true, "amounts": ["5"] },
                        "slug": "cold-milk",
                        "urls": { "page": "https://hacktez.com/u/alice/p/cold-milk" }
                    }
                ]
            },
            "counts": { "projects": 1, "skills": 2 }
        }
    ],
    "count": 1,
    "total": 1,
    "limit": 1000,
    "offset": 0,
    "network": "mainnet",
    "generatedAt": "2025-03-27T08:05:00.000Z"
}
```

**Notes:**

- `profile` is exactly what `/api/v1/profile/:name` returns, with `slug` and `urls` added to each project. Every other key is the on-chain value verbatim.
- Keys the member never set are **absent**, not null. Treat every profile field as optional.
- Nested subdomains (`a.b.hack.tez`) belong to a member and are never listed as one.
- With `?tips=1`, `tipCounters` is `null` when the counter store is unreachable — distinguishable from a genuine zero. Counters are only looked up for members who actually have a tip jar; the lookup is pipelined, so it costs a couple of round trips regardless of directory size.

**Usage:**

```typescript
// The entire community, profiles and projects included
const { data, total } = await fetch("https://hacktez.com/api/v1/members").then((r) => r.json());

for (const m of data) {
    console.log(m.label, m.profile.status, `${m.counts.projects} projects`);
    for (const p of m.profile.projects ?? []) {
        console.log("  ", p.name, "→", p.urls.page);
    }
}

// Everyone open to collaboration who writes SmartPy
const smartpy = await fetch("https://hacktez.com/api/v1/members?status=open-to-collab&skill=smartpy").then((r) =>
    r.json(),
);
```

**Cache:** `s-maxage=120, stale-while-revalidate=300` + Redis SWR (60 s fresh / 10 min hard TTL)

---

### GET /api/v1/members/:name

One member, in exactly the shape the list returns — code written against `/members` works unchanged on a single record. Accepts a bare label (`alice`) or the full name (`alice.hack.tez`).

Reads through to TED rather than the directory snapshot, so a profile edit is visible immediately. Prefer this over `/api/v1/profile/:name` when you want project slugs and page URLs resolved for you.

**Query parameters:** `tips=1` — include chain-verified tip counters.

**Response:**

```json
{
    "data": {
        "name": "alice.hack.tez",
        "label": "alice",
        "owner": "tz1...",
        "address": "tz1...",
        "registeredAt": "2025-03-27T08:01:29Z",
        "opHash": "oo...",
        "urls": { "profile": "https://hacktez.com/u/alice", "...": "..." },
        "profile": { "name": "Alice", "projects": ["..."] },
        "counts": { "projects": 1, "skills": 2 },
        "tipCounters": {
            "count": 4,
            "totals": [{ "asset": "tez", "symbol": "tez", "total": "21.5" }],
            "projects": [{ "slug": "cold-milk", "count": 2, "totals": [{ "asset": "tez", "symbol": "tez", "total": "10" }] }]
        }
    },
    "network": "mainnet"
}
```

**Errors:**

| Status | Code            | Reason                        |
| ------ | --------------- | ----------------------------- |
| 400    | `INVALID_INPUT` | Label fails validation        |
| 404    | `NOT_FOUND`     | Name is not registered        |

---

### GET /api/v1/projects

The same directory pivoted so projects are the rows: every project every member has published, with full metadata plus an embedded `member` block. Use it to build an ecosystem showcase without walking members yourself.

**Query parameters:**

| Param         | Type    | Default    | Description                                             |
| ------------- | ------- | ---------- | ------------------------------------------------------- |
| `environment` | string  | —          | `web`, `tezos`, `etherlink`, `tezlink`, `other`          |
| `status`      | string  | —          | Project status: `live`, `wip`, `archived`, `open-source` |
| `member`      | string  | —          | Only this member's projects (label or full name)         |
| `q`           | string  | —          | Substring search over name, desc, url, repo, member label |
| `limit`       | integer | 1000 (all) | Max projects to return (max 1000)                        |
| `offset`      | integer | 0          | Skip this many projects, applied after filtering         |

> `status` here is the **project** status, not the builder status used by `/members`.

**Response:**

```json
{
    "data": [
        {
            "name": "Cold Milk",
            "desc": "on-chain generative art",
            "url": "https://coldmilk.xyz",
            "repo": "https://github.com/alice/coldmilk",
            "environment": "tezos",
            "address": "KT1...",
            "status": "live",
            "logo": "ipfs://bafybei...",
            "tips": { "enabled": true, "amounts": ["5"] },
            "slug": "cold-milk",
            "urls": { "page": "https://hacktez.com/u/alice/p/cold-milk" },
            "member": {
                "name": "alice.hack.tez",
                "label": "alice",
                "address": "tz1...",
                "owner": "tz1...",
                "displayName": "Alice",
                "picture": "ipfs://bafybei...",
                "urls": {
                    "profile": "https://hacktez.com/u/alice",
                    "api": "https://hacktez.com/api/v1/members/alice",
                    "avatar": "https://hacktez.com/api/v1/avatar/alice"
                }
            }
        }
    ],
    "count": 1,
    "total": 1,
    "limit": 1000,
    "offset": 0,
    "network": "mainnet",
    "generatedAt": "2025-03-27T08:05:00.000Z"
}
```

**Usage:**

```typescript
const { data } = await fetch("https://hacktez.com/api/v1/projects?environment=tezos&status=live").then((r) =>
    r.json(),
);

data.forEach((p) => console.log(`${p.name} by ${p.member.displayName} — ${p.urls.page}`));
```

---

### Profile field reference

Every key the directory can return. All are optional — a key the member never set is absent from the object.

| Field           | Type              | TED key                 | Notes                                                       |
| --------------- | ----------------- | ----------------------- | ----------------------------------------------------------- |
| `name`          | string            | `openid:name`           | Display name                                                |
| `nickname`      | string            | `openid:nickname`       |                                                             |
| `website`       | string            | `openid:website`        | `https://` or `ipfs://`                                     |
| `picture`       | string            | `openid:picture`        | Avatar; `ipfs://` or `https://`. Not called `avatar`.       |
| `github`        | string            | `github:username`       | Bare username, not a URL                                    |
| `twitter`       | string            | `twitter:handle`        | Bare handle                                                 |
| `bluesky`       | string            | `bluesky:did`           | DID, not a handle                                           |
| `repositoryUrl` | string            | `project:repository_url`|                                                             |
| `bio`           | string            | `hack:bio`              | Max 160 chars                                               |
| `location`      | string            | `hack:location`         | Max 60 chars                                                |
| `status`        | enum              | `hack:status`           | `building`, `open-to-collab`, `available`, `hiring`         |
| `skills`        | string[]          | `hack:skills`           | Max 10                                                      |
| `projects`      | ProjectEntry[]    | `hack:projects`         | See below                                                   |
| `tips`          | TipJar            | `hack:tips`             | Profile-level tip jar                                       |
| `mastodon`      | string            | `hack:mastodon`         |                                                             |
| `farcaster`     | string            | `hack:farcaster`        |                                                             |
| `telegram`      | string            | `hack:telegram`         |                                                             |
| `discord`       | string            | `hack:discord`          |                                                             |
| `instagram`     | string            | `hack:instagram`        |                                                             |
| `youtube`       | string            | `hack:youtube`          |                                                             |
| `twitch`        | string            | `hack:twitch`           |                                                             |

**ProjectEntry** — `name` and `desc` are required, everything else is optional:

| Field         | Type    | Notes                                                                 |
| ------------- | ------- | --------------------------------------------------------------------- |
| `name`        | string  | Required                                                              |
| `desc`        | string  | Required                                                              |
| `url`         | string  | Live project URL                                                      |
| `repo`        | string  | Source repository                                                     |
| `environment` | enum    | `web`, `tezos`, `etherlink`, `tezlink`, `other`                       |
| `address`     | string  | Contract or account the project runs at (`KT1…` / `tz…`)              |
| `subdomain`   | string  | Provisioned hack.tez subdomain for the project                        |
| `status`      | enum    | `live`, `wip`, `archived`, `open-source`                              |
| `logo`        | string  | `ipfs://` or `https://`                                               |
| `tips`        | TipJar  | Per-project tip jar, independent of the profile-level one             |
| `slug`        | string  | **Added by the API** — see below                                      |
| `urls.page`   | string  | **Added by the API** — `/u/:label/p/:slug`                            |

Unknown project keys are preserved verbatim, so a member can carry extra metadata and it survives the API round trip.

**TipJar** — `{ enabled, title?, desc?, amounts?, customAmount?, payTo?, tokens? }`. `amounts` are tez decimal strings (max 3). `tokens[]` are `{ contract, tokenId, standard: "fa1.2"|"fa2", symbol, name?, decimals, thumbnail?, amounts? }`. This is jar *configuration*; for how much has actually been tipped, use `?tips=1` or `/api/v1/tips/:name`.

**Slugs.** `slug` is derived from the project name: lowercased, runs of non-alphanumerics collapsed to a single dash, leading/trailing dashes stripped, truncated to 60 characters. It is unique per member only if their project names are — two projects that slugify identically share a URL, and `/u/:label/p/:slug` resolves to the first. Key on `member.label` + `slug`, never on `slug` alone.

---

### GET /api/v1/domains

Paginated list of all hack.tez registrations. Backed by TED GraphQL (domain + profile data) and TzKT (registration timestamps and operation hashes). Response is served from Redis cache when warm (~5 ms) with background revalidation.

> Registry view — one row per registration, default 50. If you want profiles and projects, use [`/api/v1/members`](#get-apiv1members) instead: it returns everyone by default, resolves project slugs and URLs, and supports filtering.

**Query parameters:**

| Param   | Type    | Default | Max  | Description       |
| ------- | ------- | ------- | ---- | ----------------- |
| `limit` | integer | 50      | 1000 | Number of results |

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
            "opHash": "oo...",
            "profile": {
                "name": "skllz",
                "bio": "building hack.tez",
                "status": "building",
                "skills": ["typescript", "smartpy"],
                "picture": "ipfs://bafybei...",
                "github": "skullzarmy",
                "twitter": "skaborern"
            }
        }
    ],
    "count": 1,
    "limit": 50,
    "network": "mainnet"
}
```

**Usage:**

```typescript
// Fetch up to 50 registrations (includes profile data)
const res = await fetch("https://hacktez.com/api/v1/domains?limit=50");
const { data, count } = await res.json();

// Each item has: name, label, owner, address, registeredAt, opHash, profile
data.forEach((d) => console.log(d.label, d.profile.status));
```

**Cache:** `s-maxage=120, stale-while-revalidate=300` + Redis SWR (60 s fresh / 10 min hard TTL)

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

### GET /api/v1/tezosx/:nameOrAddress

Resolve a hack.tez name or any address to its identity on **Tezos X previewnet**: the native address on one interface plus its deterministic alias on the other, with live chain state for each. See the `tezos-x` skill for the underlying alias math and network reference.

Accepts a hack.tez name (label or full form), a Tezos address (tz1/tz2/tz3/KT1), or an EVM address (0x).

Resolution precedence for a name's EVM address: a declared TED `etherlink:address` record wins; otherwise the deterministic Tezos X alias derived from the resolved tz address. The `evmSource` field reports which one you got.

**Response:**

```json
{
    "data": {
        "input": "alice",
        "name": "alice.hack.tez",
        "tz": "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
        "evm": "0x16142132dd616dd8f61b8972ae4b9fcf8a22a450",
        "evmSource": "derived",
        "kt1Alias": null,
        "corners": [
            { "role": "native", "address": "tz1…", "interface": "michelson", "materialized": true, "balance": "1250000" },
            { "role": "alias", "address": "0x1614…a450", "interface": "evm", "materialized": false, "balance": "0" }
        ],
        "cornersError": null
    },
    "network": "tezosx-previewnet"
}
```

**Fields:**

- `evmSource` — `"declared"` (explicit TED `etherlink:address` record), `"derived"` (computed Tezos X alias), or `"native"` (the input itself was an EVM address).
- `kt1Alias` — the Michelson-side alias, only set when the input is a native EVM address.
- `corners[].materialized` — the account exists on chain. A derived-only alias is a valid destination but has no account yet.
- `corners[].balance` — raw units per interface: mutez (6 decimals) on `michelson`, wei-of-tez (18 decimals) on `evm`.
- `cornersError` — set when previewnet was unreachable; derivation fields are still valid.

**Usage:**

```typescript
const { data } = await fetch(`https://hacktez.com/api/v1/tezosx/${name}`).then((r) => r.json());
console.log(`${data.name} on Tezos X:`, data.tz, "→", data.evm, `(${data.evmSource})`);
```

Interactive version: the X-Ray lab at `https://hacktez.com/labs/x-ray`.

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
        {
            "type": "claimed",
            "address": "tz1...",
            "name": "alice.hack.gho",
            "timestamp": "2025-01-01T00:00:00Z",
            "opHash": "op..."
        },
        {
            "type": "committed",
            "address": "tz1...",
            "name": null,
            "timestamp": "2025-01-01T00:00:00Z",
            "opHash": "op..."
        }
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

Returns a generative avatar GIF for the given hack.tez subdomain label. The image is deterministically generated from a salted domain name — same domain always produces the same hackatar. Cached immutably in Netlify Blobs after first generation.

**Path parameters:**

| Param   | Type   | Description                                       |
| ------- | ------ | ------------------------------------------------- |
| `label` | string | The subdomain label (e.g. `skllz`, not `skllz.hack.tez`) |

**Query parameters:**

| Param    | Type   | Default | Description                                 |
| -------- | ------ | ------- | ------------------------------------------- |
| `static` | `"1"`  | —       | If set, returns a single-frame still image   |

**Response:** Binary GIF image (`Content-Type: image/gif`).

- Animated (default): 30 frames at 80ms = 2.4s seamless loop, 192×192 pixels
- Static (`?static=1`): Single-frame GIF, 192×192 pixels
- `Cache-Control: public, max-age=31536000, immutable`

**Example:**

```
GET https://hacktez.com/api/v1/hackatar/skllz
→ animated GIF (binary)

GET https://hacktez.com/api/v1/hackatar/skllz?static=1
→ single-frame GIF (binary)
```

**Errors:**

| Status | Code             | Reason                       |
| ------ | ---------------- | ---------------------------- |
| 400    | `INVALID_INPUT`  | Label fails validation       |
| 404    | `NOT_FOUND`      | Domain not registered        |
| 502    | `UPSTREAM_ERROR` | Server-side rendering error  |

**How it works:**
1. Validates the label
2. Checks Netlify Blobs cache — serves immediately if cached
3. Verifies domain is registered via TED GraphQL
4. Seeds the hackatar engine with a salted domain name
5. Generates both animated + static GIFs, caches both
6. Returns the requested variant

**Usage in HTML/Markdown:**

```html
<img src="https://hacktez.com/api/v1/hackatar/skllz" alt="skllz hackatar" />
```

---

### GET /api/v1/profile/:name

Returns the parsed builder profile for a hack.tez subdomain. Accepts a bare label (`alice`) or full domain name (`alice.hack.tez`). Returns `profile: {}` if the domain exists but has no hack: data keys.

**Response:**

```json
{
    "data": {
        "name": "alice.hack.tez",
        "owner": "tz1...",
        "address": "tz1...",
        "profile": {
            "name": "Alice",
            "picture": "ipfs://bafybei...",
            "bio": "building on tezos",
            "status": "building",
            "skills": ["typescript", "smartpy"],
            "projects": [...]
        },
        "registrationHash": "op...",
        "registeredAt": "2025-03-27T08:01:29Z"
    },
    "network": "ghostnet"
}
```

**Notes:**

- `profile` uses the `picture` field (mapped from `openid:picture`), not `avatar`
- `registrationHash` / `registeredAt` may be `null` for preloaded domains
- Returns `profile: {}` if the domain exists but has no hack: data keys

**Errors:**

| Status | Code            | Reason                |
| ------ | --------------- | --------------------- |
| 400    | `INVALID_INPUT` | Invalid domain name   |
| 404    | —               | Domain not registered (returns `{ "error": "not found" }`) |

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
| Registrar          | `KT1X2ZbjZBaeRnnkzLyaZ3FtGp7wKuaimbzg`       | `KT1UKAt5ioGdbKb435ziP25FRDzqgC7BUeB4` |
| TED GraphQL        | `https://ghostnet-api.tezos.domains/graphql` | `https://api.tezos.domains/graphql`  |
| TzKT API           | `https://api.ghostnet.tzkt.io`               | `https://api.tzkt.io`                |
| RPC                | `https://rpc.ghostnet.teztnets.com`          | `https://mainnet.tezos.marigold.dev` |

Network is selected via `VITE_TEZOS_NETWORK` env var (default: `ghostnet`).

---

## Error Handling

| Code                 | HTTP    | When                                                                   |
| -------------------- | ------- | ---------------------------------------------------------------------- |
| `INVALID_INPUT`      | 400     | Bad label (too short/long/invalid chars), invalid Tezos address format, bad `limit` / `offset` / `sort` |
| `NOT_FOUND`          | 404     | Name or resource does not exist                                        |
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
// The /domains endpoint returns up to 1000 results.
// Default limit is 50; includes profile data for each domain.
const { data, count } = await fetch("https://hacktez.com/api/v1/domains?limit=200").then((r) => r.json());
console.log(`Got ${data.length} of ${count} total domains`);

// Profile data is included — no need for separate /profile calls
data.forEach((d) => {
    console.log(d.label, d.profile.bio, d.profile.skills);
});
```

### Mirror the whole community

```typescript
// One call gets every member, every profile field, every project.
const { data: members, total, generatedAt } = await fetch("https://hacktez.com/api/v1/members").then((r) => r.json());

const rows = members.flatMap((m) =>
    (m.profile.projects ?? []).map((p) => ({
        project: p.name,
        env: p.environment ?? "unknown",
        status: p.status ?? "unknown",
        page: p.urls.page,
        builder: m.profile.name ?? m.label,
        builderPage: m.urls.profile,
    })),
);

console.log(`${rows.length} projects from ${total} members (snapshot ${generatedAt})`);
```

### Build a project showcase

```typescript
// Live Tezos projects, newest members first — projects are the rows here.
const { data } = await fetch("https://hacktez.com/api/v1/projects?environment=tezos&status=live").then((r) =>
    r.json(),
);

const cards = data.map((p) => ({
    title: p.name,
    blurb: p.desc,
    logo: p.logo,
    contract: p.address ?? null,
    links: { site: p.url, repo: p.repo, hacktez: p.urls.page },
    by: { name: p.member.displayName, avatar: p.member.urls.avatar, profile: p.member.urls.profile },
}));
```

### Resolve a builder's whole public presence

```typescript
// Everything the site itself knows about one member, in one request.
const { data } = await fetch("https://hacktez.com/api/v1/members/alice?tips=1").then((r) => r.json());

console.log(data.profile.bio, data.profile.skills);
console.log("avatar:", data.urls.avatar); // falls back to a generated hackatar
console.log("tipped:", data.tipCounters?.count ?? "unknown");
```
