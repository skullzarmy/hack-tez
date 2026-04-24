---
title: "Taquito Quickstart"
slug: "taquito-quickstart"
summary: "Practical Taquito setup and the difference between Contract vs Wallet APIs."
category: "tooling"
tags: [taquito, typescript, sdk]
status: "draft"
author: "admin.hack.tez"
---

# Taquito: Where to Start

Taquito is the canonical TypeScript SDK for Tezos.

## What it Provides

- `Tezos.contract.*` — direct signing with a Signer (scripts, services).
- `Tezos.wallet.*` — delegated signing via a wallet provider (browser dApps).

## Get Started

- Quickstart and Docs: https://tezostaquito.io/
- Examples: https://tezostaquito.io/docs/quick_start
- Contract Calls: https://tezostaquito.io/docs/contract
- Wallet API: https://tezostaquito.io/docs/wallet_api

## Tips

- Reuse a single `TezosToolkit` where possible.
- Distinguish between tez (1e6 mutez) and mutez for amounts.
- For browser dApps, prefer the Wallet API with a Beacon provider.
