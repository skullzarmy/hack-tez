---
title: "TED GraphQL Guide"
slug: "ted-graphql-guide"
summary: "Querying Tezos Domains via GraphQL for records, availability, and reverse lookups."
category: "data"
tags: [ted, graphql, domains]
status: "draft"
author: "admin.hack.tez"
---

# TED GraphQL Guide

The Tezos Domains (TED) GraphQL API is the preferred way to resolve domains, check availability, and fetch profile data.

## Endpoints
- Mainnet: `https://api.tezos.domains/graphql`
- Ghostnet: `https://ghostnet-api.tezos.domains/graphql`

## Common Queries
- Resolve a full name to owner/address/data
- Check availability for a label under a parent domain
- Reverse-resolve a wallet to its preferred domain

## Tips
- Use variables and persisted queries where possible.
- Respect caching headers; many responses are cacheable.

## References
- https://tezos.domains/

