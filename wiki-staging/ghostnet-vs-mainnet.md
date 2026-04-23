---
title: "Ghostnet vs Mainnet"
slug: "ghostnet-vs-mainnet"
summary: "Choosing the right network, faucet funding, RPC selection, and migration tips."
category: "network"
tags: [ghostnet, mainnet, networks, rpc]
status: "draft"
author: "admin.hack.tez"
---

# Ghostnet vs Mainnet

Ghostnet is the long-lived Tezos testnet. Use it for development, experimentation, and staging. Mainnet is for production.

## When to use Ghostnet
- Iterating on contracts and UI.
- Testing fee/gas assumptions and indexer queries.
- Dry-running operational scripts.

## RPC and Indexers
- RPC: `https://ghostnet.ecadinfra.com` (example). Choose reliable providers.
- Indexer: `https://api.ghostnet.tzkt.io` with the TzKT explorer and REST API.

## Migration Checklist
1. Remove faucet/private keys from code and config.
2. Switch RPCs and indexers to mainnet endpoints.
3. Confirm contract addresses and originated KT1s.
4. Re-audit limits/fees and metadata.

## References
- https://teztnets.com/
- https://ghostnet.tzkt.io

