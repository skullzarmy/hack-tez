---
title: FA2 Deployer
slug: fa2-deployer
status: beta
version: 0.1.0
kind: tool
icon: factory
interactive: true
summary: Originate FA2 multi-asset tokens with no code, on Tezos X, Shadownet, or Mainnet.
updated: 2026-06-21
---

A no-code FA2 token factory — a revival of the long-dead [KStasi/fa2-deployer](https://github.com/KStasi/fa2-deployer), rebuilt on hack.tez's wallet stack (octez.connect) and pointed at the networks that exist in 2026.

Fill in an admin address, contract metadata, and one or more assets, then originate a **Basic** (single global pause) or **Granular** (per-token pause) FA2 multi-asset contract. The whole initial supply is minted to the admin.

Pick a deploy target from the network dropdown:

- **Tezos X (Previewnet)** — the Michelson (Tezlink) side of Tezos X. Experimental; grab test tez from the [faucet](https://faucet.previewnet.tezosx.nomadic-labs.com/).
- **Shadownet** — classic L1 pre-production testnet.
- **Mainnet** — real tez.

On the network hack.tez itself runs (e.g. mainnet), it reuses your site wallet — no extra connect. On any other network it connects a wallet just for the deployer, so switching targets never disturbs your main session.
