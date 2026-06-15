---
title: CloudNine
slug: cloudnine
status: production
version: 0.4.0
kind: extension
summary: Browser extension that watches your Bluesky feed for Teia + objkt links and drops an inline Buy / Mint button onto the post.
repo: https://github.com/skullzarmy/cloudnine
privacy: https://fafolab.xyz/terms/cloudnine/privacy
chromeStore: https://chromewebstore.google.com/detail/cloudnine/hmehfjenhbpmknbfjjfadaaiafdkggkk
file: cloudnine-v0.4.0.zip
browsers: [Chrome, Firefox]
wallets: [Temple, Kukai, Umami]
updated: 2026-06-15
---

## What it does

CloudNine watches your Bluesky feed for links to Tezos NFT marketplaces. When it spots one, it adds a **Buy** (or **Mint**, for open editions) button directly on the post. Click it, connect your Tezos wallet, sign — the NFT is yours and you never left your feed.

- Detects **Teia** (`teia.art/objkt/<id>`) and **objkt.com** (`objkt.com/tokens/<contract>/<id>`, including named collections like `open_objkt`) links in posts
- Resolves the cheapest active listing — or an active open edition — for each token
- Renders an inline **Buy X ꜩ** / **Mint X ꜩ** button on the post
- Connects your Tezos wallet (Kukai, Temple, Umami, etc.) and builds + broadcasts the purchase itself — no clicking off to the marketplace
- Post-purchase: one-tap **Share on Bluesky** opens the composer pre-filled, plus a local purchase history in the toolbar popup
- Privacy-first: no tracking, no telemetry, no accounts. Settings and history are local-only.

## Scope (v0)

- **Bluesky web only.** Native apps and other clients can't be extended; the surface is `bsky.app` in a desktop browser.
- **Native ꜩ-priced listings only.** Listings priced in other tokens (USDt, etc.) are skipped.
- **No condition-gated listings yet.** Whitelist / allowlist-gated objkt listings are skipped.
- **Mainnet only.**
- **Auctions skipped.** English / Dutch auctions live on separate contracts and aren't supported yet.

## Install

### Chrome / Edge / Brave

Install directly from the [Chrome Web Store](https://chromewebstore.google.com/detail/cloudnine/hmehfjenhbpmknbfjjfadaaiafdkggkk) — no developer mode required.

Or install manually from the zip below:

1. Download the zip and unzip it somewhere stable (don't delete the folder — Chrome loads from the path).
2. Open `chrome://extensions`.
3. Toggle **Developer mode** on (top right).
4. Click **Load unpacked** and select the unzipped folder.
5. Visit `bsky.app` — Buy buttons appear on posts containing Teia or objkt links.

### Firefox

Firefox add-on is currently **in review** on the Mozilla Add-ons store. In the meantime, install manually:

1. Download and unzip.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and pick `manifest.json` inside the unzipped folder.
4. Firefox unloads temporary add-ons on restart — re-load after each browser session.

## Known issue: Firefox + web wallets (Kukai)

On Firefox, connecting a **web wallet** like Kukai doesn't work — the Beacon pairing dialog never finishes rendering its "Use Browser" action. This is a content-script limitation in the wallet SDK (octez.connect): it hands pairing data to its UI across Firefox's content-script / page compartment boundary, which Firefox blocks (`Permission denied to access property "then"`).

**Use an extension wallet (Temple) on Firefox.** Chrome is unaffected — all wallets work there. Full write-up + upstream report in the [repo](https://github.com/skullzarmy/cloudnine).

## Reporting

Issues, marketplace URLs that should be supported, unhinged ideas — [GitHub repo](https://github.com/skullzarmy/cloudnine). Privacy policy [here](https://fafolab.xyz/terms/cloudnine/privacy).
