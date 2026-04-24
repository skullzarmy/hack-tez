---
title: "Ghostnet vs Mainnet"
slug: "ghostnet-vs-mainnet"
summary: "Choosing the right network, faucet funding, RPC selection, and migration tips."
category: "network"
tags: [ghostnet, mainnet, networks, rpc]
status: "draft"
author: "admin.hack.tez"
---

# Networks: Testnets and Mainnet

Tezos maintains mainnet plus a set of evolving test networks. Historically, ghostnet has been the long‑lived testnet, but this has recently been sunset. Shadownet is now the preferred long-running test network. Tezos also runs protocol‑specific testnets and transitional networks.

## When to use a Testnet

- Iterating on contracts and UI.
- Testing fee/gas assumptions and indexer queries.
- Dry‑running operational scripts.

## RPC and Indexers (Examples)

- Choose reliable RPC providers appropriate for the current testnet and mainnet.
- TzKT indexer: `https://api.tzkt.io` (mainnet) and network‑specific subdomains for testnets.

## Migration Checklist

1. Remove faucet/private keys from code and config.
2. Switch RPCs and indexers to mainnet endpoints.
3. Confirm contract addresses and originated KT1s.
4. Re-audit limits/fees and metadata.

## References

- https://teztnets.com/ — current list of public Tezos networks
- https://tzkt.io — mainnet explorer (switch network as needed)
