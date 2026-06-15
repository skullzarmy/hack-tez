---
title: CloudNine
slug: cloudnine
status: production
version: 1.0.1
kind: extension
summary: Browser extension that watches your Bluesky feed for Teia + objkt links and drops an inline Buy / Mint button onto the post.
repo: https://github.com/skullzarmy/cloudnine
privacy: https://fafolab.xyz/terms/cloudnine/privacy
chromeStore: https://chromewebstore.google.com/detail/cloudnine/hmehfjenhbpmknbfjjfadaaiafdkggkk
file: ""
browsers: [Chrome, Firefox]
wallets: [Temple, Kukai, Umami]
updated: 2026-06-15
---

## What it does

CloudNine watches your Bluesky feed for links to Tezos NFT marketplaces. When it spots one, it adds a **Buy** (or **Mint**, for open editions) button directly on the post. Click it, connect your Tezos wallet, sign — the NFT is yours and you never left your feed. Works on `bsky.app` and `ovoid.at`.

- Detects **Teia** (`teia.art/objkt/<id>`) and **objkt.com** (`objkt.com/tokens/<contract>/<id>`, including named collections like `open_objkt`) links in posts
- Resolves the cheapest active listing — or an active open edition — for each token
- Renders an inline **Buy X ꜩ** / **Mint X ꜩ** button on the post
- Connects your Tezos wallet (Kukai, Temple, Umami, etc.) and builds + broadcasts the purchase itself — no clicking off to the marketplace
- Post-purchase: one-tap **Share on Bluesky** opens the composer pre-filled, plus a local purchase history in the toolbar popup
- Privacy-first: no tracking, no telemetry, no accounts. Settings and history are local-only.

## Scope

- **Bluesky web only.** Native apps and other clients can't be extended; supported surfaces are `bsky.app` and `ovoid.at` in a desktop browser.
- **Native ꜩ-priced listings only.** Listings priced in other tokens (USDt, etc.) are skipped.
- **No condition-gated listings yet.** Whitelist / allowlist-gated objkt listings are skipped.
- **Mainnet only.**
- **Auctions skipped.** English / Dutch auctions live on separate contracts and aren't supported yet.

## Install

### Chrome / Edge / Brave

Install directly from the [Chrome Web Store](https://chromewebstore.google.com/detail/cloudnine/hmehfjenhbpmknbfjjfadaaiafdkggkk) — no developer mode required.

### Firefox

Firefox add-on is currently **in review** on the Mozilla Add-ons store. Check back soon.

## Reporting

Issues, marketplace URLs that should be supported, unhinged ideas — [GitHub repo](https://github.com/skullzarmy/cloudnine). Privacy policy [here](https://fafolab.xyz/terms/cloudnine/privacy).
