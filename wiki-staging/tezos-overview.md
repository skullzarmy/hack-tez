---
title: "Tezos Overview"
slug: "tezos-overview"
summary: "A concise introduction to Tezos: accounts, contracts, fees, and why it matters."
category: "tezos"
tags: [tezos, overview, accounts, contracts, fees]
status: "draft"
author: "admin.hack.tez"
---

# Tezos Overview

Tezos is a smart-contract blockchain known for on-chain governance and formal verification tooling. It supports account abstraction-like flows, upgradeable protocols via self-amendment, and an energy-efficient PoS consensus.

## Accounts and Contracts
- Implicit accounts: `tz1*`, `tz2*`, `tz3*` (wallets). Hold tez and initiate operations.
- Smart contracts: `KT1*` addresses (originated contracts). Maintain storage and expose entrypoints.

## Fees and Gas
Tezos charges fees in tez and sets gas/storage limits per operation. Tooling typically estimates limits automatically; you can set maximums to avoid failures. Storage costs (burn) apply when data is added on-chain (e.g., big_map entries).

## Networks
- Mainnet — production.
- Ghostnet — long-lived testnet for development.

## Core Tooling
- Taquito (TypeScript SDK) for dApps and scripts.
- SmartPy and Archetype for smart-contract development.
- TzKT for indexing and rich queries.

## Where to Start
1. Get a wallet (Temple, Kukai) and some test tez from a faucet (ghostnet).
2. Explore the chain via TzKT explorer.
3. Try basic operations with Taquito or a wallet.
4. Read an example contract in SmartPy and deploy to ghostnet.

## References
- https://tezos.com/
- https://teztnets.com/
- https://api.ghostnet.tzkt.io
- https://ghostnet.tzkt.io

