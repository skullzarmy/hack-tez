---
title: "Taquito Quickstart"
slug: "taquito-quickstart"
summary: "Practical Taquito setup and the difference between Contract vs Wallet APIs."
category: "tooling"
tags: [taquito, typescript, sdk]
status: "draft"
author: "admin.hack.tez"
---

# Taquito Quickstart

Taquito is the canonical TypeScript SDK for Tezos. It exposes two surfaces:

- `Tezos.contract.*` — direct signing with a Signer (server scripts, CLI, secure services).
- `Tezos.wallet.*` — delegated signing through a wallet provider (browser dApps).

## Setup
```bash
npm install @taquito/taquito
```

```ts
import { TezosToolkit } from "@taquito/taquito";
const Tezos = new TezosToolkit("https://ghostnet.ecadinfra.com");
```

## Transfers
```ts
const op = await Tezos.contract.transfer({ to: "tz1...", amount: 1 });
await op.confirmation(1);
```

See the full Skill for deeper coverage of contract calls, signers, and the Wallet API.

## References
- https://tezostaquito.io/

