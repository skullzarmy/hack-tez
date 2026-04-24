---
title: "Tezos Domains and hack.tez"
slug: "tezos-domains-and-hack-tez"
summary: "How Tezos Domains (TED) records work and how hack.tez subdomains provide on-chain ownership."
category: "domains"
tags: [tezos-domains, ted, hack.tez, naming]
status: "draft"
author: "admin.hack.tez"
---

# Tezos Domains and hack.tez

Tezos Domains (TED) is an on‑chain naming system. Domains map human‑readable names to data such as owners, addresses, and profile metadata.

## TED Records
TED maintains registry contracts (including an FA2 token for names) and exposes GraphQL APIs for resolution and discovery. Each record has an owner, optional address, and a `data` map of key/value pairs (e.g., profile fields).

## hack.tez Subdomains
`name.hack.tez` are real TED records. The hack.tez registrar contract sets you as the owner and writes the record via TED proxy entrypoints. Ownership is on‑chain; transferring the record transfers the identity.

## Profiles
Profiles are JSON‑encoded key/values in the TED data map: `openid:name`, `hack:bio`, skills, and more. Apps can parse and display these consistently. The TED GraphQL API returns these values already decoded.

## Resolution
- Forward: name → address/owner/data via TED GraphQL.
- Reverse: preferred domain for a given address.

## References
- https://tezos.domains/
- https://api.tezos.domains/graphql
- https://ghostnet-api.tezos.domains/graphql
