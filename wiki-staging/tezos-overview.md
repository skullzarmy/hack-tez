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

Tezos is a smart‑contract blockchain designed for long‑term evolution. It features self‑amendment (on‑chain upgrades without forks), an energy‑efficient Proof‑of‑Stake consensus, and a mature developer ecosystem.

## Why Tezos

- Upgrades without downtime or contentious forks via on‑chain governance.
- Strong culture of formal methods and security (Michelson, SmartPy, Archetype).
- Low fees and predictable confirmation times.
- Thriving digital art and collectibles ecosystem.

## Accounts and Contracts

- Implicit accounts (wallets): `tz1*`, `tz2*`, `tz3*` (different cryptographic curves). Hold tez and initiate operations.
- Smart contracts: `KT1*` addresses (originated contracts). Maintain storage and expose entrypoints.

## Fees and Gas

Tezos charges fees in tez and sets gas/storage limits per operation. Tooling typically estimates limits automatically; you can set maximums to avoid failures. Storage burn applies when data is added on‑chain (e.g., `big_map` entries).

## Networks

- Mainnet — production.
- Testnets — long‑lived testnets and protocol‑specific testnets evolve over time. Check https://teztnets.com/ for current recommendations.

## Core Tooling

- Taquito (TypeScript SDK) for dApps and scripts.
- SmartPy and Archetype for smart-contract development.
- TzKT for indexing and rich queries.

## Where to Start

1. Get a wallet (Temple, Kukai) and obtain test tez on a current testnet (public faucet).
2. Explore the chain via TzKT explorer and REST API.
3. Try basic operations with Taquito or a wallet transfer.
4. Review an example contract in SmartPy and deploy to a testnet.

## References

- https://tezos.com/
- https://teztnets.com/
- https://api.ghostnet.tzkt.io
- https://ghostnet.tzkt.io
