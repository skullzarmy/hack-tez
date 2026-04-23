---
title: "Wallets on Tezos"
slug: "wallets-on-tezos"
summary: "Popular Tezos wallets, connecting to dApps, and testnet funding."
category: "wallets"
tags: [wallets, beacon, temple, kukai, testnet]
status: "draft"
author: "admin.hack.tez"
---

# Wallets on Tezos

Tezos supports multiple production-grade wallets. For browser dApps, Beacon-compatible wallets provide a standard connection flow.

## Popular Wallets
- Temple — browser extension with Beacon support.
- Kukai — web wallet with social login options.
- AirGap — mobile + vault flows.

## Connecting to dApps
- Most dApps use Beacon (e.g., `@tezos-x/octez.connect-sdk`) to request permissions and operations.
- Always verify the origin and permissions requested.

## Testnet Funding
- On ghostnet, use a public faucet or the faucet JSON (for local scripts). Never reuse test keys on mainnet.

## Tips
- Prefer hardware-backed keys for significant value.
- Keep separate accounts for development and production.

## References
- https://templewallet.com/
- https://wallet.kukai.app/
- https://docs.walletbeacon.io/

