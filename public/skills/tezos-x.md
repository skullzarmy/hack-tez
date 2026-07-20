---
title: "Tezos X"
description: "Reference for Tezos X, the unified execution layer where the EVM and Michelson interfaces share one chain with native atomic composability. Covers previewnet endpoints, accounts and aliases, cross-interface calls, and current limitations."
tags: [tezos, tezos-x, tezlink, etherlink, evm, michelson, rollup, previewnet]
---

# Skill: Tezos X (Previewnet)

```yaml
skill_type: reference
domain: Tezos X unified execution layer / cross-runtime development
version: 1.0
last_verified: 2026-07-20
```

## Overview

Tezos X is a fast, non-custodial execution layer enshrined in the Tezos protocol, settling to Tezos Layer 1 for security. It exposes a **single blockchain addressable through two interfaces**:

| Interface | Runtime | Formerly | RPC standard | Tooling |
|---|---|---|---|---|
| EVM | EVM runtime | Etherlink | Ethereum JSON-RPC | MetaMask, viem, ethers, Hardhat, Foundry |
| Michelson | Michelson runtime | Tezlink | Tezos RPC | octez-client, Taquito, Temple, Kukai, Umami |

Contracts on one interface can call contracts on the other **atomically in a single transaction** (Native Atomic Composability, "NAC"). Solidity and Michelson/SmartPy/LIGO code coexist on one ledger, one economic space.

**Status (2026-07-20):** experimental, previewnet only, no mainnet date announced. The sequencer targets ~500ms blocks with ~50ms preconfirmations and is currently a single instance operated by Nomadic Labs. Expect breaking resets: the network was reset at v0.7 (2026-07-20), wiping all prior state.

Not to be confused with: **Shadownet** on teztnets.com is a plain long-running Tezos L1 testnet, unrelated to Tezos X. "Tezlink Shadownet" (Jan-May 2026) was the Michelson-only predecessor testnet and is dead; previewnet replaced it.

## Previewnet endpoints

| Service | URL |
|---|---|
| Dashboard / status | https://previewnet.tezosx.nomadic-labs.com |
| EVM RPC | https://evm.previewnet.tezosx.nomadic-labs.com |
| Michelson RPC | https://michelson.previewnet.tezosx.nomadic-labs.com |
| EVM explorer (Blockscout) | https://blockscout.previewnet.tezosx.nomadic-labs.com |
| Michelson explorer (TzKT) | https://tzkt.previewnet.tezosx.nomadic-labs.com |
| Cross-interface explorer | https://experimental-explorer.previewnet.tezosx.nomadic-labs.com |
| Faucet (funds 0x and tz1, no rate limit) | https://faucet.previewnet.tezosx.nomadic-labs.com |
| Bridge (L1 <-> previewnet, both directions) | https://bridge.previewnet.tezosx.nomadic-labs.com |
| Canonical params (chain IDs, rollup address) | https://github.com/trilitech/tezos-x-previewnet |
| Docs | https://x.tezos.com/docs |
| Changelog | gitlab.com/tezos/tezos: `etherlink/CHANGES_TEZOSX.md` |

Chain IDs and the rollup address change on network resets. Never hardcode them; read them from the canonical repo or the RPC.

```bash
# Point octez-client at the Michelson interface
octez-client --endpoint https://michelson.previewnet.tezosx.nomadic-labs.com config update
```

```ts
// Taquito works unchanged against the Michelson RPC
const Tezos = new TezosToolkit("https://michelson.previewnet.tezosx.nomadic-labs.com");
```

MetaMask: add network with RPC `https://evm.previewnet.tezosx.nomadic-labs.com`, currency symbol XTZ, chain ID from the canonical repo (or one-click via the dashboard).

## Accounts and aliases

Every account is **native to exactly one interface** and behaves exactly as it would on its home chain (EVM account like Ethereum, Tezos account like L1). Existing wallets and indexers work unmodified.

Each native account automatically gets a deterministic **alias** on the other interface:

```text
# EVM alias of a Tezos account (an EIP-7702 delegated AliasForwarder)
evm_alias = keccak256(utf8(tz_address_base58check))[0:20]

# Michelson alias of an EVM account (a KT1 forwarder contract)
kt1_alias = KT1(blake2b_160(evm_address_bytes))
```

Both are computable off-chain. Aliases forward any tez they receive to their native counterpart via the gateway. One user therefore controls up to four addresses: tz native, 0x native, and one alias on each side. No wallet aggregates this today; tooling that presents a unified view is an open niche.

Caveats:

- Michelson `SOURCE` returns the null address (`tz1Ke2h7sDdakHJQh8WX4Z372du1KChsksyU`) for operations originating from cross-interface calls.
- Aliases resolve to one shared upgradable forwarder implementation (since v0.7); pre-reset alias addresses are invalid.
- An alias may be *derived* (computable, no account yet) or *materialized* (account exists). Sending value to a derived alias without materializing it first is a footgun; use the resolver precompile below.

### Tez precision

| Interface | Unit | Decimals |
|---|---|---|
| Michelson | mutez | 6 |
| EVM | wei-of-tez | 18 |

Cross-interface transfers scale by 10^12. EVM amounts that are not multiples of 10^12 truncate when landing in mutez.

## Native Atomic Composability

Two gateway contracts let each runtime call into the other within one atomic transaction; if either leg fails, everything reverts, including cross-runtime deposits (refund-on-revert since v0.7).

Read paths (no value transfer, STATICCALL-safe):

- EVM -> Michelson: call Michelson **views** through the gateway (since v0.2).
- Michelson -> EVM: a `VIEW` reaching the gateway returns live EVM state, including real block values like base fee and gas limit (since v0.5/v0.7). Works inside Michelson view bodies.

Identity across runtimes (since v0.6):

- EVM `ORIGIN` (`tx.origin`) resolves to the real transaction originator across cross-interface calls; `msg.sender` stays the immediate caller. Preserved through EVM -> Michelson -> EVM round trips.
- The runtime gateway precompile at `0xff...07` exposes two read-only selectors:
  - `originOf(addr, sourceRuntime)` classifies an address as Native, Alias, or Unknown. Use it to reject a foreign account's alias where a genuine local account is expected.
  - `resolveAddress(addr, sourceRuntime, targetRuntime)` returns the same identity's address on the other runtime and whether it is materialized or merely derived.

Budgets and semantics:

- Gas: Michelson operations up to 3,000,000 gas; EVM transactions up to 30,000,000. Cross-runtime gas is rebalanced per release; refresh cached estimates after kernel upgrades.
- Storage: Michelson operations pay storage burn like L1 (originations, storage growth, first credit to a fresh implicit account). Big-map usage counts.
- Cross-runtime call depth is capped at 128; recursive gateway cycles fail cleanly.
- Receipts bracket each cross-runtime call with start/end markers (v0.7), so call trees are reconstructable; failed calls always record receipts.

## Current limitations (v0.7, 2026-07-20)

- **State is disposable.** The v0.7 reset wiped every account, balance, and contract; assume future resets. Redeploy and re-fund from the faucet.
- **Tickets are disabled** in the Michelson runtime, temporarily. FA1.2/FA2 are unaffected (they do not use tickets).
- **Native operations must anchor a recent Tezos X block**, not an L1 block. Tooling that builds Michelson operations by hand must fetch the branch from the Michelson RPC.
- Contract addresses are now computed L1-style; addresses from before the reset do not match and must not be reused.
- Delegation, votes, attestations, and other consensus operations intentionally do not exist in the rollup context.
- No TED / Tezos Domains deployment, thin indexer ecosystem: TzKT and Blockscout run per interface, plus the experimental unified explorer.
- Single sequencer (Nomadic Labs); decentralized sequencing and a RISC-V engine are roadmap items.

## Release history (previewnet kernel)

| Version | Date | Highlights |
|---|---|---|
| v0.1 | 2026-04-24 | First consolidated release: Michelson interface live on top of Etherlink, both gateways, atomic cross-calls |
| v0.2 | 2026-04-29 | EVM contracts read Michelson views |
| v0.3 | 2026-05-06 | Michelson gas to 3M; receipt/event fixes (followed by a Michelson-state-loss incident, resolved 05-07) |
| v0.4 | 2026-05-13 | Real storage receipts; deposit events for indexers |
| v0.5 | 2026-05-21 | Michelson reads EVM state; L1-style storage burn; account regeneration required |
| v0.6 | 2026-06-03 | Cross-runtime `tx.origin` fix; `originOf` / `resolveAddress` precompile views |
| v0.7 | 2026-07-20 | Network reset; L1-parity address derivation; malleability fixes; tickets disabled; refund-on-revert |

## Sources

- https://x.tezos.com/docs (overview, accounts-and-aliases, native-atomic-composability, testnet)
- https://previewnet.tezosx.nomadic-labs.com (dashboard, changelog summaries)
- https://github.com/trilitech/tezos-x-previewnet (canonical network params)
- https://spotlight.tezos.com/tezlink-shadownet/ (predecessor testnet, retired 2026-05-18)
- https://teztnets.com (Shadownet is L1-only, unrelated to Tezos X)
