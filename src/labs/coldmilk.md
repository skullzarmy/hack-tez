---
title: ColdMilk
slug: coldmilk
status: alpha
version: 0.1.0
kind: tool
interactive: true
summary: Find every SpicySwap LP token your wallet holds and break them — properly batched so the pair actually burns. Cools down what spicy left stuck.
updated: 2026-06-02
---

## What it does

SpicySwap's `remove_liquidity` doesn't burn LP from your wallet directly — it burns whatever the pair contract holds at the moment of the call. If you call it on its own you get **"not enough burned"**, because no LP ever made it to the pair.

ColdMilk does the dance for you:

1. Scans your wallet for every SpicySwap LP token (token_id 0 on any pair originated by SpicySwap Router v1).
2. For each position you pick, batches **two ops in one signature**:
    - FA2 `transfer` your LP → the pair contract itself.
    - `remove_liquidity(your_address)` on the same pair.
3. The pair internally runs the balance_of callbacks, finalizes the burn, and sends both underlying tokens back to you.

You can break one position or all of them in a single op group.

## Scope (v0)

- **Mainnet only.** SpicySwap is not deployed on ghostnet — coldmilk refuses to operate on any other network.
- **Direct path only.** No router / no swap-to-one-side. You receive both underlying tokens of each pair.
- **No WTZ unwrap yet.** If a pair returns WTZ, you'll get the WTZ token; unwrap separately for now.
- **No farm un-staking.** If your LP is staked into a Spicy farm, withdraw from the farm first, then come back here.

## Reporting

Stuck? Open an issue on the hack.tez repo or ping in the chat.
