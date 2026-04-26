---
title: "Registrar Flow: Commit → Register"
slug: "registrar-flow"
summary: "How hack.tez registrations work on-chain: commitment, waiting period, and register reveal."
category: "hacktez"
tags: [registrar, commit-reveal, contracts]
status: "draft"
author: "admin.hack.tez"
---

# Registrar Flow: Commit → Register

The hack.tez registrar uses a two‑phase commit‑reveal to prevent front‑running.

## 1) Commit

Compute a commitment hash over the label, sender, target address, and a random salt. The contract stores only the hash.

```ts
// see src/lib/commitment
const labelHex = labelToHexBytes(label);      // hex bytes of the UTF‑8 label
const saltHex = generateSalt();               // 16‑byte random salt (hex)
const hash = computeCommitmentHash(labelHex, sender, target, saltHex);

await client.requestOperation({ operationDetails: [{
  kind: "transaction",
  destination: registrarAddress,
  amount: "0",
  parameters: { entrypoint: "commit", value: { bytes: hash } },
}]});
```

## 2) Wait ≥ min_commit_age

You must wait at least `min_commit_age` seconds before revealing. Fetch the value via the public API:

```http
GET /api/v1/config → { minCommitAgeSec, maxCommitAgeSec, maxPerWallet, paused }
```

## 3) Register (Reveal)

Reveal the label and salt to the registrar. The registrar verifies the hash and calls TED to set the record. Owner is set to the sender (wallet).

```ts
await client.requestOperation({ operationDetails: [{
  kind: "transaction",
  destination: registrarAddress,
  amount: "0",
  parameters: {
    entrypoint: "register",
    value: { prim: "Pair", args: [
      { bytes: labelHex },
      { prim: "Pair", args: [{ bytes: saltHex }, { string: targetAddress }] },
    ]},
  },
}]});
```

## Constraints

- Owner = sender. Users own the TED record directly.
- 1 claim per wallet (permanent). Even if a TED record is removed later, the claim slot remains spent.
- Paused. If the contract is paused, registrations are temporarily disabled.

## After Registration

Use the TED UpdateRecord proxy to update profile data (JSON‑encoded data map) and SetChildRecord to create sub‑subdomains. See `src/lib/contract.ts` for raw parameter layouts.

