Wiki Staging
============

Use this folder to stage wiki articles as Markdown files with YAML frontmatter.
After review, we’ll import them into the wiki database via the API.

Frontmatter Schema
- title: Required string. Human-friendly title.
- slug: Optional string. Kebab-case; defaults to filename without .md.
- summary: Optional string. One-sentence abstract (≤ 200 chars).
- category: Required string. Category slug (e.g., tezos, wallets, tooling, data, contracts, domains, network, hacktez, meta).
- tags: Optional string array. Simple keywords.
- status: Optional string. One of draft|published. Defaults to draft during staging.
- author: Optional string. Domain or attribution (e.g., admin.hack.tez) used as initial author on import.

Example
---
title: "Ghostnet vs Mainnet"
slug: "ghostnet-vs-mainnet"
summary: "How to choose between ghostnet and mainnet, including RPCs, faucet funding, and migration tips."
category: "network"
tags: [tezos, network, ghostnet, mainnet]
status: "draft"
author: "admin.hack.tez"
---

# Heading

Body content in Markdown. Code fences, links, and lists are supported. Keep intros concise and actionable.

Guidelines
- Prefer short, scannable sections with clear headings.
- Start with an overview, then how-to, then references.
- Link to official docs and related wiki pages where helpful.
- Keep vendor URLs stable; prefer canonical docs over blogs.

