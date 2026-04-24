---
title: "TED GraphQL Guide"
slug: "ted-graphql-guide"
summary: "Querying Tezos Domains via GraphQL for records, availability, and reverse lookups."
category: "data"
tags: [ted, graphql, domains]
status: "draft"
author: "admin.hack.tez"
---

# TED GraphQL: Where to Start

The Tezos Domains (TED) GraphQL API is the preferred way to resolve domains, check availability, and fetch profile data. Rather than duplicating their docs, this page links the essentials and shows minimal examples.

## Endpoints

- Mainnet: `https://api.tezos.domains/graphql`
- Ghostnet: `https://ghostnet-api.tezos.domains/graphql`

## Common Queries

- Resolve a full name to owner/address/data
- Check availability for a label under a parent domain
- Reverse‑resolve a wallet to its preferred domain

```graphql
query Resolve($name: String!) {
    domain(name: $name) {
        name
        owner
        address
        data {
            key
            value
        }
    }
}
```

```graphql
query Availability($label: String!, $parent: String!) {
    isAvailable(label: $label, parent: $parent)
}
```

```graphql
query Reverse($address: String!) {
    reverseRecord(address: $address) {
        domain {
            name
        }
    }
}
```

## Tips

- Use variables and persisted queries where possible.
- Respect caching headers; many responses are cacheable.

## References

- Docs: https://tezos.domains/
- GraphQL schema explorer: open the endpoint in a GraphQL IDE and use introspection.
