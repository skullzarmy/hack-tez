---
title: "Tezos Domains"
description: "Developer reference for the Tezos Domains on-chain naming system (TED). Covers GraphQL API, record types, ownership, and integration patterns for resolving and registering .tez names."
tags: [tezos, domains, ted, naming, graphql, nft]
---
# Skill: Tezos Domains Developer Reference

```yaml
skill_type: hybrid
domain: Blockchain / Tezos Naming System
version: 1.0
```

## Overview & Core Concepts

Tezos Domains is a distributed, open, and extensible **on-chain naming system** built on the Tezos blockchain. Its primary purpose is bidirectional translation between human-readable aliases (e.g., `alice.tez`) and Tezos addresses (e.g., `tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb`).

**Analogy:** It mirrors the Internet's DNS — a hierarchical, decentralised naming system that associates human-readable labels with machine-readable identifiers. The key differences: names are stored on-chain, ownership is enforced by smart contracts, and every 2nd-level domain is an NFT.

### Key Properties

| Property | Detail |
|---|---|
| **Forward resolution** | Alias → Tezos address |
| **Reverse resolution** | Tezos address → Alias |
| **Global consistency** | All blockchain participants see the same binding |
| **NFT ownership** | All 2nd-level domains are FA2-compliant NFTs |
| **Auditability** | Open-source contracts audited by Quantstamp and Inference |
| **Upgradeability** | Achieved via proxy + underlying contract pattern |

### Domain Hierarchy

```
tez                     ← Top-level domain (TLD), managed by administrative multisig
alice.tez               ← Second-level domain (2LD), sold/auctioned by TLDRegistrar
subdomain.alice.tez     ← Third-and-higher-level domain, managed by the 2LD owner
```

---

## Smart Contract Architecture

### Upgradeability Design

The system uses a two-layer contract architecture:

1. **Underlying (implementation) contracts** — store data and mutable code as Michelson lambdas stored in bigmaps. Code stored this way can be updated by the administrative multisig without redeploying the entire contract.
2. **Proxy contracts** — present stable, fixed entrypoint addresses to the outside world. Clients always call proxy contracts. If a major upgrade requires storage migration, the proxy can be repointed to a new underlying contract.

**Rule:** Always interact with proxy contract addresses. Never hardcode underlying contract addresses — retrieve them from the proxy's storage using annotations.

### Proxy Contract Storage Shape

```michelson
storage (pair
    (address %contract)   ; address of the current underlying contract
    ( ... )
);
```

- Read the `%contract` field from a proxy's storage to find the current underlying contract address.
- **Do not** rely on a fixed underlying contract address or storage layout — use annotations.

### Core Contracts: NameRegistry

An upgradeable contract that stores the actual domain records.

#### Forward Records (name → address)

Stored in the `records` bigmap, keyed by UTF-8 encoded name bytes. Each record contains:

| Field | Type | Description |
|---|---|---|
| `owner` | `address` | Account authorised to modify the record and manage subdomains |
| `address` | `address option` | Address this domain resolves to (optional) |
| `data` | `(string, bytes) map` | Arbitrary additional metadata |
| `expiry_key` | `bytes option` | Key into the `expiry_map` bigmap for validity timestamp |
| `validator` | `nat option` | Validator contract reference for subdomain name validation |
| TZIP-12 token ID | (internal) | NFT token ID; only present on 2nd-level domains |

#### Reverse Records (address → name)

Stored in the `reverse_records` bigmap, keyed by `address`. Each record contains:

| Field | Type | Description |
|---|---|---|
| `owner` | `address` | Account authorised to modify this reverse record |
| `name` | `bytes option` | UTF-8 encoded name this address resolves to (optional) |
| `data` | `(string, bytes) map` | Arbitrary additional metadata |

**Consistency guarantee:** If a reverse record exists and points to a name, that name's forward record must resolve back to the same address — enforced on-chain.

#### Storage Shape (reference)

```ocaml
type storage = {
    records:         (bytes, record) big_map;       (* forward records *)
    reverse_records: (address, reverse_record) big_map;
    expiry_map:      (bytes, timestamp) big_map;    (* expiry per 2LD *)
    (* ... internal fields *)
}
```

### Core Contracts: TLDRegistrar

Manages top-level domains. Sells and auctions second-level domains. Tracks owners and expiration times.

---

## The .tez TLD

- The only currently supported production TLD is **`.tez`**.
- On testnets (Ghostnet), the TLD name reflects the protocol version (e.g., `.ghostnet`) to avoid confusion with Mainnet.
- The `.tez` TLD adds additional label validation on top of IDNA 2008 / UTS 46:
  - Labels must contain only: **`a–z`**, **`0–9`**, and **hyphens (`-`)**.
  - Hyphens **cannot** appear as the first or last character.
- Additional TLDs for other character scripts may be introduced in the future.

---

## Ownership Scheme

The ownership chain flows top-to-bottom:

1. **Top-level domains** are created by the **administrative multisig** and transferred to the TLDRegistrar contract.
2. **Second-level domains** are created by TLDRegistrar on behalf of buyers and transferred to them on purchase/auction settlement.
3. **Third-and-higher-level domains** are created and managed entirely by the 2LD owner — no registrar involvement.

### Administrative Multisig

- A **formally verified** multisig contract whose keys are held by well-known community members.
- Is the owner of all Tezos Domains contracts.
- Authorised actions: creating new TLDs, deploying contract upgrades.
- Details: [tezos.domains/about/keyholders](https://tezos.domains/about/keyholders)

---

## Name Resolution

### Forward Resolution (name → address)

**Recommended method (off-chain, view support):** Call the `resolve-name` TZIP-16 view on the NameRegistry contract.

- Input: `bytes` — UTF-8 encoded name (normalised using the encode algorithm below).
- Output: `resolved_domain option`

```ocaml
type resolved_domain = {
    name:    bytes;
    address: address option;
    data:    data_map;
    expiry:  timestamp option;
}
type return_type = resolved_domain option
```

**Manual storage lookup algorithm:**
1. Look up the name in the `records` bigmap. If absent → not resolvable.
2. Use `expiry_key` to look up `expiry_map`. If found and `timestamp ≤ NOW` → expired, not resolvable.
3. Extract `address` from the record. If `None` → not resolvable. Otherwise use the address.

### Reverse Resolution (address → name)

**Recommended method:** Call the `resolve-address` TZIP-16 view.

- Input: `address`
- Output: `resolved_domain option`

**Manual storage lookup algorithm:**
1. Look up address in `reverse_records` bigmap. If absent → not resolvable.
2. Extract optional `name`. If `None` → not resolvable.
3. Use the `name` to look up its forward record and validate its `expiry_key`. If expired → not resolvable.
4. Otherwise use the `name` value.

### On-Chain Address Validation

Contracts cannot perform name resolution directly. Instead, use `NameRegistry.CheckAddress`:

- **Entrypoint:** `check_address`
- **Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `name` | `bytes` | UTF-8 encoded name |
| `address` | `address` | Expected address |

- **Behaviour:** Does nothing if the name resolves to the given address. Fails with `NAME_ADDRESS_MISMATCH` otherwise.
- **Use case:** Pair a transfer transaction with a `check_address` call so both fail atomically if the name resolution is incorrect.

### Name Validation and Normalization

All names must conform to **IDNA 2008** (RFC 5891/5892/5893) via **UTS 46**.

#### Length Limits

| Scope | Limit |
|---|---|
| Single label | 1–100 characters |
| Full domain name | Up to 400 bytes (UTF-8) |

#### Encode Algorithm

1. Run the [UTS 46 `ToUnicode`](https://www.unicode.org/reports/tr46/#ToUnicode) algorithm with:
   - `CheckHyphens = true`
   - `CheckBidi = true`
   - `CheckJoiners = true`
   - `UseSTD3ASCIIRules = true`
   - `Transitional_Processing = false`
2. Encode the result as **UTF-8 bytes**.

The dot character (`.`) is permitted so the algorithm works on both full names and individual labels.

---

## Domain Registration & Renewal (Buys & Renewals)

Domain registration uses a **commit-and-reveal** scheme to prevent front-running.

### Step 1 — Commit (`TLDRegistrar.Commit`)

**Entrypoint:** `commit`  
**Amount:** Must be 0 tez.

| Parameter | Type | Description |
|---|---|---|
| commitment | `bytes` | SHA-512 hash of a Michelson-packed `pair (pair bytes address) nat` — `(label, owner, nonce)` |

- The random `nonce` prevents dictionary attacks.
- The commitment must be neither too recent nor too old when the `buy` call is made (configured by `min_commitment_age` and `max_commitment_age`).

**Errors:**

| Code | Meaning |
|---|---|
| `AMOUNT_NOT_ZERO` | Transferred tez must be zero |
| `COMMITMENT_EXISTS` | Identical commitment hash already exists; regenerate with a new nonce |

### Step 2 — Buy (`TLDRegistrar.Buy`)

**Entrypoint:** `buy`  
**Amount:** `standard_price_per_day * duration / 1_000_000` mutez (exact match required).

| Parameter | Type | Description |
|---|---|---|
| `label` | `bytes` | UTF-8 encoded 2LD label |
| `duration` | `nat` | Ownership duration in **days** (≥ `min_duration`) |
| `owner` | `address` | New owner of the domain |
| `address` | `address option` | Address the domain resolves to (optional) |
| `data` | `(string, bytes) map` | Initial metadata |
| `nonce` | `nat` | The nonce used when creating the commitment |

**Key errors:**

| Code | Meaning |
|---|---|
| `COMMITMENT_DOES_NOT_EXIST` | No matching commitment found |
| `COMMITMENT_TOO_OLD` | Commitment has expired; recreate it |
| `COMMITMENT_TOO_RECENT` | Wait for `min_commitment_age` seconds |
| `LABEL_TAKEN` | Domain exists and has not expired |
| `LABEL_NOT_AVAILABLE` | Domain is not available for FIFS registration |
| `LABEL_IN_AUCTION` | Domain is only available via auction |
| `INVALID_LABEL` / `LABEL_EMPTY` / `LABEL_TOO_LONG` / `NAME_TOO_LONG` | Validation failures |
| `DURATION_TOO_LOW` | Duration below minimum |
| `AMOUNT_TOO_LOW` / `AMOUNT_TOO_HIGH` | Incorrect tez sent |

### Renewal (`TLDRegistrar.Renew`)

**Entrypoint:** `renew`  
**Amount:** `standard_price_per_day * duration / 1_000_000` mutez (exact match required).

| Parameter | Type | Description |
|---|---|---|
| `label` | `bytes` | UTF-8 encoded 2LD label |
| `duration` | `nat` | Renewal duration in **days** |

- Can be called at any time before the domain expires.
- An expired domain cannot be renewed; it must be re-bought.

**Key errors:**

| Code | Meaning |
|---|---|
| `LABEL_NOT_FOUND` | Domain does not exist |
| `LABEL_EXPIRED` | Domain expired; use buy instead |
| `DURATION_TOO_LOW` | Below minimum duration |
| `AMOUNT_TOO_LOW` / `AMOUNT_TOO_HIGH` | Incorrect tez sent |

---

## Auction Operations

At service launch (and for recently expired domains), domains are sold via an **open ascending-price (English) auction**.

### Auction Lifecycle

```
Domain not yet registered
  → Auction opens on first bid
    → Bidding period (≥ min_auction_period)
      → Last bid + bid_additional_period → Auction ends
        → Settlement window (min_duration)
          → Highest bidder calls settle()
            → Domain transferred to chosen owner
```

If the highest bidder does not settle within the settlement window, the domain is treated as expired.

### Place a Bid (`TLDRegistrar.Bid`)

**Entrypoint:** `bid`  
**Amount:** Amount sent + caller's in-contract balance must cover the bid.

| Parameter | Type | Description |
|---|---|---|
| `label` | `bytes` | UTF-8 encoded label |
| `bid` | `tez` | Bid amount |

**Rules:**
- First bid ≥ `standard_price_per_day`.
- Subsequent bids ≥ `round_to_nearest_tenth(previous_bid * (100 + min_bid_increase_ratio) / 100)`.
- Outbid amount from the previous highest bidder is credited back (withdrawable).
- Auction end time is extended to `NOW + bid_additional_period` if needed.

**Key errors:**

| Code | Meaning |
|---|---|
| `AUCTION_ENDED` | Auction has already concluded |
| `LABEL_TAKEN` | Domain exists and is not expired |
| `BID_TOO_LOW` | Does not meet minimum bid increase ratio |
| `AMOUNT_TOO_LOW` | Insufficient amount sent (including balance) |

### Settle an Auction (`TLDRegistrar.Settle`)

**Entrypoint:** `settle`  
**Caller:** Must be the auction's highest bidder.  
**Amount:** Must be 0 tez.

| Parameter | Type | Description |
|---|---|---|
| `label` | `bytes` | UTF-8 encoded label |
| `owner` | `address` | Recipient of the domain |
| `address` | `address option` | Optional resolution address |
| `data` | `(string, bytes) map` | Initial metadata |

**Key errors:**

| Code | Meaning |
|---|---|
| `NOT_SETTLEABLE` | Settlement window expired or no auction found |
| `NOT_AUTHORIZED` | Caller is not the highest bidder |

### Withdraw In-Contract Balance (`TLDRegistrar.Withdraw`)

**Entrypoint:** `withdraw`  
**Parameter:** `address` — destination for the withdrawal.

- Withdraws the caller's full in-contract balance (credited from outbid refunds or excess bid amounts).
- Does nothing if balance is zero.

---

## Domain Operations

All domain-level write operations go through **NameRegistry proxy contracts**.

### Check Address (`NameRegistry.CheckAddress`)

Validates that a name resolves to an expected address. Fails with `NAME_ADDRESS_MISMATCH` if not.
See [Name Resolution → On-Chain Address Validation](#name-resolution) above.

### Claim Reverse Record (`NameRegistry.ClaimReverseRecord`)

**Entrypoint:** `claim_reverse_record`

| Parameter | Type | Description |
|---|---|---|
| `name` | `bytes option` | UTF-8 name to claim (or `None` to clear) |
| `owner` | `address` | Owner of the reverse record |

- Maps the **sender's** address to the given domain name.
- The forward record for the name must resolve to the sender's address.

**Key error:** `NAME_ADDRESS_MISMATCH` — forward record does not resolve to sender.

### Create or Update a Subdomain (`NameRegistry.SetChildRecord`)

**Entrypoint:** `set_child_record`  
**Caller:** Must be the owner of the **parent** record.

| Parameter | Type | Description |
|---|---|---|
| `label` | `bytes` | Label of the new/updated subdomain |
| `parent` | `bytes` | UTF-8 encoded parent domain |
| `address` | `address option` | Resolution address |
| `owner` | `address` | Owner of this record |
| `data` | `(string, bytes) map` | Metadata |
| `expiry` | `timestamp option` | Expiry (only applicable to 2LDs) |

**Key errors:** `PARENT_NOT_FOUND`, `NOT_AUTHORIZED`, label validation errors.

### Update an Existing Record (`NameRegistry.UpdateRecord`)

**Entrypoint:** `update_record`  
**Caller:** Must be the record's current owner.

| Parameter | Type | Description |
|---|---|---|
| `name` | `bytes` | UTF-8 encoded full domain name |
| `address` | `address option` | New resolution address |
| `owner` | `address` | New owner |
| `data` | `(string, bytes) map` | New metadata map |

**Note:** If the address changes, any existing reverse record pointing to this name is automatically set to `None` to preserve consistency.

### Update a Reverse Record (`NameRegistry.UpdateReverseRecord`)

**Entrypoint:** `update_reverse_record` (also called via `claim_reverse_record` proxy)  
**Caller:** Must be the record's current owner.

| Parameter | Type | Description |
|---|---|---|
| `address` | `address` | Address of the reverse record to update |
| `name` | `bytes option` | New name (`None` to unset) |
| `owner` | `address` | New owner |

---

## Domain Data (On-Chain Metadata)

Every forward record and reverse record includes a `data` map:

```michelson
map %data string bytes
```

Keys use namespaced prefixes. Reserved prefixes and standard keys:

### `td:` — Tezos Domains Metadata

| Key | Type | Description | Example |
|---|---|---|---|
| `td:ttl` | number (bytes) | Time-to-live in seconds for caching | `600` |

### `etherlink:` — Etherlink Integration

| Key | Type | Description | Example |
|---|---|---|---|
| `etherlink:address` | string | Associated Etherlink (EVM) address | `0x000...000` |

### `web:` — Website URLs

| Key | Type | Description |
|---|---|---|
| `web:governance_profile_url` | string | Governance profile URL for Tezos Domains Delegate program |

### `openid:` — OpenID Claims

| Key | Type | Description |
|---|---|---|
| `openid:<claim>` | per-spec | Standard OpenID Connect claims (e.g., `openid:name`) |

### `gravatar:` — Avatar

| Key | Type | Example |
|---|---|---|
| `gravatar:hash` | string | MD5 hash of Gravatar email: `"0bc83cb571cd1c50ba6f3e8a78ef1346"` |

### Social Media

| Key | Type | Example |
|---|---|---|
| `twitter:handle` | string | `"BillGates"` |
| `instagram:handle` | string | `"nasa"` |
| `github:username` | string | `"torvalds"` |
| `gitlab:username` | string | `"foobar"` |
| `keybase:username` | string | `"foobar"` |

### Source Control

| Key | Type | Example |
|---|---|---|
| `project:repository_url` | string | `"https://gitlab.com/tezos-domains/contracts.git"` |

**Custom keys:** Users may create arbitrary keys outside reserved namespaces.

---

## Contract Interoperability & Proxy Contracts

### Proxy Contract Pattern

Each functional entrypoint of the system is exposed via its own proxy contract. Naming convention:

```
<UnderlyingContract>.<EntrypointName>
```

Example: `NameRegistry.CheckAddress` is the proxy for the `check_address` entrypoint backed by the `NameRegistry` underlying contract.

### Finding the Underlying Contract (Off-chain)

1. Read the proxy contract's storage.
2. Extract the field annotated `%contract` — this is the current address of the underlying contract.
3. **Always use annotations, never positional field access.**

### On-Chain Routing

Contracts can call proxy entrypoints directly. The proxy automatically routes to the current underlying contract. This ensures client contracts remain functional even after underlying contract upgrades.

---

## Domains as NFTs

The `NameRegistry` contract is **FA2-compliant** ([TZIP-12](https://gitlab.com/tzip/tzip/-/blob/master/proposals/tzip-12/tzip-12.md)). All **2nd-level domains** have an associated NFT token ID.

### Key NFT Behaviours

| Behaviour | Detail |
|---|---|
| **Expired domain** | Owner's FA2 token balance drops to `0`. The token ID remains valid but the domain "disappears" as a tradeable NFT. |
| **Ownership transfer** | When a domain changes owners, **all existing FA2 operators are automatically dropped**. |
| **`all_tokens` view** | Not implemented — the token count is too large to return in a single call. |
| **Token ID scope** | Only 2nd-level domains have token IDs. Subdomains (3LD+) do not. |

### Transfer Mechanics

Use standard FA2 `transfer` entrypoints on the NameRegistry contract to transfer domain ownership. The domain's `owner` field in the forward record is updated atomically.

---

## Affiliated Buys & Renewals

Tezos Domains provides an **affiliate model** for partners (wallets, marketplaces, explorers) who want to earn a percentage of domain sale proceeds.

### How It Works

- A dedicated `AffiliateBuyRenew` contract wraps the standard `buy` and `renew` entrypoints with an additional `affiliate` parameter.
- The `affiliate` parameter is the Tezos address of the registered affiliate partner.
- The commitment step (`commit`) is performed against the standard `TLDRegistrar.Commit` contract as usual — no affiliate-specific commit step is needed.

### Affiliated Buy Entrypoint

Same parameters as `TLDRegistrar.Buy` plus:

| Parameter | Type | Description |
|---|---|---|
| `affiliate` | `address` | Registered affiliate partner address |

### Affiliated Renew Entrypoint

Same parameters as `TLDRegistrar.Renew` plus:

| Parameter | Type | Description |
|---|---|---|
| `affiliate` | `address` | Registered affiliate partner address |

**To join the affiliate program:** Register at [talk.tezos.domains](https://talk.tezos.domains/t/registration-verification-for-the-tezos-domains-affiliate-program/317).

---

## Client Libraries

Official JavaScript/TypeScript libraries are available, powered by either [Taquito](https://tezostaquito.io/) or [ConseilJS](https://cryptonomic.github.io/ConseilJS).

- **API docs:** [client-docs.tezos.domains](https://client-docs.tezos.domains/)
- **Examples:** [gitlab.com/tezos-domains/examples](https://gitlab.com/tezos-domains/examples)
- **Issues:** [gitlab.com/tezos-domains/client/issues](https://gitlab.com/tezos-domains/client/issues)

### Packages

| Package | Purpose |
|---|---|
| **`@tezos-domains/resolver`** | Resolve domain names to addresses and reverse; read domain metadata. Supports both Taquito and ConseilJS. |
| **`@tezos-domains/manager`** | Execute write operations: register, update, create subdomains, claim/update reverse records, auction interactions. **Taquito only** (ConseilJS not yet supported). |

---

## GraphQL API

A GraphQL API provides queryable access to the entire Tezos Domains catalogue, including **historical versions of each entity at each block**.

| Resource | URL |
|---|---|
| Mainnet endpoint | `POST https://api.tezos.domains/graphql` |
| Playground | [api.tezos.domains/playground](https://api.tezos.domains/playground) |
| Schema reference | [api-schema.tezos.domains](https://api-schema.tezos.domains/) |

- Pagination follows the **Relay Connection specification** (cursor-based).
- Rate limit: **100 requests per minute**. Exceeded requests receive HTTP `429` with `Retry-After` header.

### Example: Resolve Multiple Domains

```graphql
{
  domains(where: { name: { in: ["domains.tez", "registry.domains.tez"] } }) {
    items {
      address
      owner
      name
      level
    }
  }
}
```

### Example: Reverse Lookup by Address

```graphql
{
  reverseRecords(
    where: {
      address: {
        in: [
          "KT1Mqx5meQbhufngJnUAGEGpa4ZRxhPSiCgB"
          "KT1GBZmSxmnKJXGMdMLbugPfLyUPmuLSMwKS"
        ]
      }
    }
  ) {
    items {
      address
      owner
      domain {
        name
      }
    }
  }
}
```

### Example Response Shape

```json
{
  "data": {
    "domains": {
      "items": [
        { "address": "tz1VxM...", "name": "aaa.tez", "owner": "tz1VxM...", "level": 2 },
        { "address": null, "name": "a.aaa.tez", "owner": "tz1VxM...", "level": 3 }
      ]
    }
  }
}
```

---

## Deployed Contracts

### Mainnet

| Contract | Address |
|---|---|
| `NameRegistry.CheckAddress` | `KT1F7JKNqwaoLzRsMio1MQC7zv3jG9dHcDdJ` |
| `NameRegistry.SetChildRecord` | `KT1QHLk1EMUA8BPH3FvRUeUmbTspmAhb7kpd` |
| `NameRegistry.UpdateRecord` | `KT1H1MqmUM4aK9i1833EBmYCCEfkbt6ZdSBc` |
| `NameRegistry.ClaimReverseRecord` | `KT1TnTr6b2YxSx2xUQ8Vz3MoWy771ta66yGx` |
| `NameRegistry.UpdateReverseRecord` | `KT1J9VpjiH5cmcsskNb8gEXpBtjD4zrAx4Vo` |
| `NameRegistry` (underlying) | Resolve from `NameRegistry.CheckAddress` storage |
| `TLDRegistrar.Buy` | `KT191reDVKrLxU9rjTSxg53wRqj6zh8pnHgr` |
| `TLDRegistrar.Renew` | `KT1EVYBj3f1rZHNeUtq4ZvVxPTs77wuHwARU` |
| `TLDRegistrar.Commit` | `KT1P8n2qzJjwMPbHJfi4o8xu6Pe3gaU3u2A3` |
| `TLDRegistrar.Bid` | `KT1CaSP4dn8wasbMsfdtGiCPgYFW7bvnPRRT` |
| `TLDRegistrar.Withdraw` | `KT1CfuAbJQbAGYcjKfvEvbtNUx45LY5hfTVR` |
| `TLDRegistrar.Settle` | `KT1MeFfi4TzSCc8CF9j3qq5mecTPdc6YVUPp` |
| `TLDRegistrar` (underlying) | Resolve from `TLDRegistrar.Buy` storage |
| `AffiliateBuyRenew` | `KT1Hg3ymQBL5nfAbb1JZ8G8AGPZ4cpcko2H2` |
| `TED Token` | `KT1GY5qCWwmESfTv9dgjYyTYs2T5XGDSvRp1` |
| `TEDv Token` | `KT1R4KPQxpFHAkX8MKCFmdoiqTaNSSpnJXPL` |
| `Governance Pool` | `KT1Lu5om8u4ns2VWxcufgQRzjaLLhh3Qvf5B` |
| `Vesting Contract` | `KT1VxKQbYBVD8fSkqaewJGigL3tmcLWrsXcu` |

### Ghostnet (Testnet)

| Contract | Address |
|---|---|
| `NameRegistry.CheckAddress` | `KT1B3j3At2XMF5P8bVoPD2WeJbZ9eaPiu3pD` |
| `NameRegistry.SetChildRecord` | `KT1HpddfW7rX5aT2cTdsDaQZnH46bU7jQSTU` |
| `NameRegistry.UpdateRecord` | `KT1Ln4t64RdCG1bK8zkH6Xi4nNQVxz7qNgyj` |
| `NameRegistry.ClaimReverseRecord` | `KT1H19ouy5QwDBchKXcUw1QRFs5ZYyx1ezEJ` |
| `NameRegistry.UpdateReverseRecord` | `KT1HDUc2xtPHqWQcjE1WuinTTHajXQN3asdk` |
| `NameRegistry` (underlying) | Resolve from `NameRegistry.CheckAddress` storage |
| `TLDRegistrar.Buy` | `KT1Ks7BBTLLjD9PsdCboCL7fYEfq8z1mEvU1` |
| `TLDRegistrar.Renew` | `KT1Bv32pdMYmBJeMa2HsyUQZiC6FNj1dX6VR` |
| `TLDRegistrar.Commit` | `KT1PEnPDgGKyHvaGzWj6VJJYwobToiW2frff` |
| `TLDRegistrar.Bid` | `KT1P3wdbusZK2sj16YXxRViezzWCPXpiE28P` |
| `TLDRegistrar.Withdraw` | `KT1C7EF4c1pnPW9qcfNRiTPj5tBFMQJtvUhq` |
| `TLDRegistrar.Settle` | `KT1DMNPg3b3fJQpjXULcXjucEXfwq3zGTKGo` |
| `TLDRegistrar` (underlying) | Resolve from `TLDRegistrar.Buy` storage |
| `AffiliateBuyRenew` | `KT1EPAzYSkjvnwWYKqER6ZXihV7pxu3s1jr3` |

> **Note:** The Ghostnet TLD is named differently from `.tez` — check the [Ghostnet dApp](https://ghostnet.tezos.domains) for the current testnet TLD label.

---

## TLDRegistrar Configuration Parameters

The TLDRegistrar stores numeric configuration in a `config` bigmap. Keys and meanings:

| Key | Name | Unit | Description |
|---|---|---|---|
| `0` | `max_commitment_age` | seconds | Maximum age for a buy commitment to remain valid |
| `1` | `min_commitment_age` | seconds | Minimum age before a commitment can be used |
| `2` | `standard_price_per_day` | picotezos (1e-12 tez) | FIFS price per day; also the minimum initial auction bid |
| `3` | `min_duration` | seconds | Minimum registration or renewal period |
| `4` | `min_bid_increase_ratio` | percent | Minimum ratio of new bid to current highest bid |
| `5` | `min_auction_period` | seconds | Minimum auction duration from start |
| `6` | `bid_additional_period` | seconds | Auction extension window from last bid |
| `1000` | `launch_date` | Unix epoch (seconds) | Service launch date (start of initial auction period). `0` = not configured |
| `1000 + N` | *(per label length)* | Unix epoch (seconds) | Override launch date for labels of exactly `N` characters |

**Price formula:**
```
price_in_mutez = standard_price_per_day * duration_days / 1_000_000
```

---

## Security & Audits

| Auditor | Notes |
|---|---|
| **Quantstamp** | Formal security audit of Tezos Domains smart contracts |
| **Inference** | Formal security audit of Tezos Domains smart contracts |

The administrative multisig uses a **formally verified** contract (see [arxiv.org/pdf/1909.08671.pdf](https://arxiv.org/pdf/1909.08671.pdf)).

Proceeds from registrations and auctions accumulate in the TLDRegistrar contract. Only the administrative multisig can withdraw them. See [tezos.domains/about/proceeds](https://tezos.domains/about/proceeds) for future plans.

---

## Prerequisites

An agent consuming this skill should have:

- Understanding of Tezos address formats (`tz1…`, `KT1…`).
- Ability to construct and submit Michelson-typed transactions (e.g., via Taquito or direct RPC).
- Familiarity with FA2 (TZIP-12) token standard for NFT transfer operations.
- Ability to execute GraphQL POST requests for off-chain querying.
- Access to a Tezos RPC node or indexer endpoint.
- Key management capability for signing transactions.

---

## Caveats & Limitations

- **Contract addresses are immutable entry points (proxies), but underlying contracts can change.** Always resolve the underlying contract address from proxy storage at runtime for direct storage reads.
- **`all_tokens` FA2 view is not available.** Do not attempt to enumerate all tokens in a single call.
- **ConseilJS manager support is absent.** Write operations require Taquito-based library or direct RPC calls.
- **Ghostnet TLD label differs from `.tez`.** Do not assume `.tez` works on Ghostnet.
- **FIFS registration availability depends on auction history.** A domain is only available for FIFS after its auction ends with no bids, or if it has previously expired.
- **Rate limit on GraphQL API:** 100 requests/minute per client. Back off on HTTP 429.
- **Documentation last updated:** The deployed contract addresses page was last updated ~December 2024. Always verify addresses against the live documentation before mainnet operations involving value transfer.
- **No subdomain expiry management.** Only 2nd-level domains have independently configurable expiry. Subdomains (3LD+) inherit their ancestor 2LD's expiry.
- **Confusable character protection is TLD-level.** Each TLD restricts to a predefined character script set to prevent homograph attacks. The `.tez` TLD is restricted to Latin `a–z`, `0–9`, and hyphens.
- **TED is not deployed on Tezos X previewnet.** No name resolution exists on Tezos X (either interface) as of 2026-07. The `etherlink:address` record maps a domain to an EVM address, but resolving names on Tezos X itself requires custom tooling. See the `tezos-x` skill.