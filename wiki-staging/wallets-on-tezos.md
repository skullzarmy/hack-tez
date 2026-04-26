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

In plain terms, a wallet is your key to the chain. It:
- Generates and stores your private keys securely.
- Shows your balances and assets.
- Signs operations (e.g., transfers, contract calls) when a dApp requests them.

For browser dApps, Beacon‑compatible wallets provide a standard connection flow that lets sites request permissions and operations.

## Popular Wallets

- Temple — browser extension with Beacon support and rich features.
- Kukai — web wallet with simple onboarding, including social login.

## Connecting to dApps

- Many dApps use Beacon (e.g., via `@tezos-x/octez.connect-sdk`) to request permissions and operations.
- Always verify the site origin and the scope of permissions before approving.

## Testnet Funding

- On ghostnet, use a public faucet or a faucet JSON for local scripts. Never reuse test keys on mainnet.

## Quick Start (Kukai)

1) Visit https://wallet.kukai.app/
2) Create a wallet with a social login or email provider.
3) Fund with a small amount of tez (on testnet, use a public faucet).
4) Connect to a Beacon dApp and approve requested permissions.

## Tips

- Prefer hardware‑backed keys for significant value (Temple + Ledger, for example).
- Keep separate accounts for development and production.

## References

- https://templewallet.com/
- https://wallet.kukai.app/
- https://docs.walletbeacon.io/
