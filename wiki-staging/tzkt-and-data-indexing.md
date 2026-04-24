---
title: "TzKT and Data Indexing"
slug: "tzkt-and-data-indexing"
summary: "Using the TzKT REST API for contract storage, history, and analytics."
category: "data"
tags: [tzkt, indexer, analytics]
status: "draft"
author: "admin.hack.tez"
---

# TzKT and Data Indexing

TzKT is a widely used Tezos indexer and explorer. Its REST API exposes blocks, accounts, operations, contracts, storage, big_maps, tokens, and more.

## Common Queries

- Contract storage snapshot: `/v1/contracts/KT1.../storage`
- Big_map keys and updates: `/v1/bigmaps/{id}/keys`, `/v1/bigmaps/updates`
- Operation history and confirmations: `/v1/operations/transactions?target=KT1...`
- Account operations: `/v1/operations/transactions?sender=tz1...` (and related endpoints)

## Tips

- Prefer pagination (`limit`/`offset`) for lists and avoid unbounded scans.
- Use `select` to project only needed fields and reduce payloads.
- Filter early (e.g., `target=`, `sender=`, `timestamp.ge=`) to shrink result sets.
- Cache hot queries at the edge where possible.

For full filter syntax and advanced endpoints, see the TzKT API docs.

## References

- Mainnet: https://api.tzkt.io
- Testnets: network‑specific subdomains (see https://teztnets.com for current networks)
- Explorer: https://tzkt.io (switch network as needed)
