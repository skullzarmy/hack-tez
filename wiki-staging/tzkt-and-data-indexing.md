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

TzKT is the primary Tezos indexer and explorer. Its REST API exposes contracts, operations, storage, and historical analytics.

## Common Queries
- Contract storage snapshot
- Big_map diffs and historical values
- Operation history and confirmations

## Tips
- Prefer pagination (limit/offset) for lists.
- Cache hot queries at the edge where possible.

## References
- https://api.ghostnet.tzkt.io
- https://api.tzkt.io

