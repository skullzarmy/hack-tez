-- Seed categories from wiki-staging/categories and articles from wiki-staging/*.md
-- Safe-upsert style: categories/tags upsert by slug; articles insert if missing; revision #1 inserted if missing.

-- Categories
INSERT INTO wiki_categories (id, slug, name, description, sort_order)
VALUES
  ('cat-tezos', 'tezos', 'Tezos', 'Protocol overview, accounts, fees, networks.', 10),
  ('cat-wallets', 'wallets', 'Wallets', 'Temple, Kukai, and Beacon-compatible wallets.', 20),
  ('cat-tooling', 'tooling', 'Tooling', 'SDKs, CLIs, developer tools, and workflows.', 30),
  ('cat-data', 'data', 'Data', 'Indexers, GraphQL, and analytics.', 40),
  ('cat-contracts', 'contracts', 'Contracts', 'Writing, testing, and deploying Tezos smart contracts.', 50),
  ('cat-domains', 'domains', 'Domains', 'Tezos Domains (TED), naming, and profiles.', 60),
  ('cat-network', 'network', 'Network', 'Ghostnet vs mainnet, RPCs, environments.', 70),
  ('cat-hacktez', 'hacktez', 'hack.tez', 'Registrar, profiles, and Hackatars.', 80),
  ('cat-meta', 'meta', 'Meta', 'Wiki process, contribution guidelines, and admin.', 90)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order;

-- Tags
INSERT INTO wiki_tags (id, slug, name) VALUES
  ('tag-ghostnet', 'ghostnet', 'Ghostnet'),
  ('tag-mainnet', 'mainnet', 'Mainnet'),
  ('tag-networks', 'networks', 'Networks'),
  ('tag-rpc', 'rpc', 'RPC'),
  ('tag-hackatar', 'hackatar', 'Hackatar'),
  ('tag-avatars', 'avatars', 'Avatars'),
  ('tag-generative', 'generative', 'Generative'),
  ('tag-gif', 'gif', 'GIF'),
  ('tag-beacon', 'beacon', 'Beacon'),
  ('tag-octez-connect', 'octez-connect', 'Octez Connect'),
  ('tag-wallet', 'wallet', 'Wallet'),
  ('tag-dapp', 'dapp', 'dApp'),
  ('tag-registrar', 'registrar', 'Registrar'),
  ('tag-commit-reveal', 'commit-reveal', 'Commit Reveal'),
  ('tag-contracts', 'contracts', 'Contracts'),
  ('tag-smartpy', 'smartpy', 'SmartPy'),
  ('tag-python', 'python', 'Python'),
  ('tag-taquito', 'taquito', 'Taquito'),
  ('tag-typescript', 'typescript', 'TypeScript'),
  ('tag-sdk', 'sdk', 'SDK'),
  ('tag-ted', 'ted', 'TED'),
  ('tag-graphql', 'graphql', 'GraphQL'),
  ('tag-domains', 'domains', 'Domains'),
  ('tag-tezos-domains', 'tezos-domains', 'Tezos Domains'),
  ('tag-hack-tez', 'hack.tez', 'hack.tez'),
  ('tag-naming', 'naming', 'Naming'),
  ('tag-tezos', 'tezos', 'Tezos'),
  ('tag-overview', 'overview', 'Overview'),
  ('tag-accounts', 'accounts', 'Accounts'),
  ('tag-fees', 'fees', 'Fees'),
  ('tag-tzkt', 'tzkt', 'TzKT'),
  ('tag-indexer', 'indexer', 'Indexer'),
  ('tag-analytics', 'analytics', 'Analytics'),
  ('tag-temple', 'temple', 'Temple'),
  ('tag-kukai', 'kukai', 'Kukai'),
  ('tag-testnet', 'testnet', 'Testnet'),
  ('tag-wiki', 'wiki', 'Wiki'),
  ('tag-contribution', 'contribution', 'Contribution'),
  ('tag-moderation', 'moderation', 'Moderation')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;

-- Helper: resolve category id by slug
-- Articles and their initial revision (rev 1)

-- 1) Tezos Overview
WITH cat AS (
  SELECT id FROM wiki_categories WHERE slug = 'tezos'
), ins AS (
  INSERT INTO wiki_articles (id, slug, title, content, markdown, summary, category_id, author, last_editor)
  VALUES (
    'art-tezos-overview', 'tezos-overview', 'Tezos Overview',
    $$# Tezos Overview

Tezos is a smart‑contract blockchain designed for long‑term evolution. It features self‑amendment (on‑chain upgrades without forks), an energy‑efficient Proof‑of‑Stake consensus, and a mature developer ecosystem.

## Why Tezos

- Upgrades without downtime or contentious forks via on‑chain governance.
- Strong culture of formal methods and security (Michelson, SmartPy, Archetype).
- Low fees and predictable confirmation times.
- Thriving digital art and collectibles ecosystem.

## Accounts and Contracts

- Implicit accounts (wallets): `tz1*`, `tz2*`, `tz3*` (different cryptographic curves). Hold tez and initiate operations.
- Smart contracts: `KT1*` addresses (originated contracts). Maintain storage and expose entrypoints.

## Fees and Gas

Tezos charges fees in tez and sets gas/storage limits per operation. Tooling typically estimates limits automatically; you can set maximums to avoid failures. Storage burn applies when data is added on‑chain (e.g., `big_map` entries).

## Networks

- Mainnet — production.
- Testnets — long‑lived testnets and protocol‑specific testnets evolve over time. Check https://teztnets.com/ for current recommendations.

## Core Tooling

- Taquito (TypeScript SDK) for dApps and scripts.
- SmartPy and Archetype for smart-contract development.
- TzKT for indexing and rich queries.

## Where to Start

1. Get a wallet (Temple, Kukai) and obtain test tez on a current testnet (public faucet).
2. Explore the chain via TzKT explorer and REST API.
3. Try basic operations with Taquito or a wallet transfer.
4. Review an example contract in SmartPy and deploy to a testnet.

## References

- https://tezos.com/
- https://teztnets.com/
- https://api.ghostnet.tzkt.io
- https://ghostnet.tzkt.io
$$,
    $$# Tezos Overview

Tezos is a smart‑contract blockchain designed for long‑term evolution. It features self‑amendment (on‑chain upgrades without forks), an energy‑efficient Proof‑of‑Stake consensus, and a mature developer ecosystem.

## Why Tezos

- Upgrades without downtime or contentious forks via on‑chain governance.
- Strong culture of formal methods and security (Michelson, SmartPy, Archetype).
- Low fees and predictable confirmation times.
- Thriving digital art and collectibles ecosystem.

## Accounts and Contracts

- Implicit accounts (wallets): `tz1*`, `tz2*`, `tz3*` (different cryptographic curves). Hold tez and initiate operations.
- Smart contracts: `KT1*` addresses (originated contracts). Maintain storage and expose entrypoints.

## Fees and Gas

Tezos charges fees in tez and sets gas/storage limits per operation. Tooling typically estimates limits automatically; you can set maximums to avoid failures. Storage burn applies when data is added on‑chain (e.g., `big_map` entries).

## Networks

- Mainnet — production.
- Testnets — long‑lived testnets and protocol‑specific testnets evolve over time. Check https://teztnets.com/ for current recommendations.

## Core Tooling

- Taquito (TypeScript SDK) for dApps and scripts.
- SmartPy and Archetype for smart-contract development.
- TzKT for indexing and rich queries.

## Where to Start

1. Get a wallet (Temple, Kukai) and obtain test tez on a current testnet (public faucet).
2. Explore the chain via TzKT explorer and REST API.
3. Try basic operations with Taquito or a wallet transfer.
4. Review an example contract in SmartPy and deploy to a testnet.

## References

- https://tezos.com/
- https://teztnets.com/
- https://api.ghostnet.tzkt.io
- https://ghostnet.tzkt.io
$$,
    'A concise introduction to Tezos: accounts, contracts, fees, and why it matters.',
    (SELECT id FROM cat), 'admin.hack.tez', 'admin.hack.tez'
  ) ON CONFLICT (slug) DO NOTHING RETURNING id
)
INSERT INTO wiki_revisions (id, article_id, revision, title, content, markdown, summary, editor, edit_summary)
SELECT 'rev-tezos-overview-1',
  COALESCE((SELECT id FROM ins), (SELECT id FROM wiki_articles WHERE slug = 'tezos-overview')),
  1,
  'Tezos Overview',
  $$# Tezos Overview

Tezos is a smart‑contract blockchain designed for long‑term evolution. It features self‑amendment (on‑chain upgrades without forks), an energy‑efficient Proof‑of‑Stake consensus, and a mature developer ecosystem.

## Why Tezos

- Upgrades without downtime or contentious forks via on‑chain governance.
- Strong culture of formal methods and security (Michelson, SmartPy, Archetype).
- Low fees and predictable confirmation times.
- Thriving digital art and collectibles ecosystem.

## Accounts and Contracts

- Implicit accounts (wallets): `tz1*`, `tz2*`, `tz3*` (different cryptographic curves). Hold tez and initiate operations.
- Smart contracts: `KT1*` addresses (originated contracts). Maintain storage and expose entrypoints.

## Fees and Gas

Tezos charges fees in tez and sets gas/storage limits per operation. Tooling typically estimates limits automatically; you can set maximums to avoid failures. Storage burn applies when data is added on‑chain (e.g., `big_map` entries).

## Networks

- Mainnet — production.
- Testnets — long‑lived testnets and protocol‑specific testnets evolve over time. Check https://teztnets.com/ for current recommendations.

## Core Tooling

- Taquito (TypeScript SDK) for dApps and scripts.
- SmartPy and Archetype for smart-contract development.
- TzKT for indexing and rich queries.

## Where to Start

1. Get a wallet (Temple, Kukai) and obtain test tez on a current testnet (public faucet).
2. Explore the chain via TzKT explorer and REST API.
3. Try basic operations with Taquito or a wallet transfer.
4. Review an example contract in SmartPy and deploy to a testnet.

## References

- https://tezos.com/
- https://teztnets.com/
- https://api.ghostnet.tzkt.io
- https://ghostnet.tzkt.io
$$,
  $$# Tezos Overview

Tezos is a smart‑contract blockchain designed for long‑term evolution. It features self‑amendment (on‑chain upgrades without forks), an energy‑efficient Proof‑of‑Stake consensus, and a mature developer ecosystem.

## Why Tezos

- Upgrades without downtime or contentious forks via on‑chain governance.
- Strong culture of formal methods and security (Michelson, SmartPy, Archetype).
- Low fees and predictable confirmation times.
- Thriving digital art and collectibles ecosystem.

## Accounts and Contracts

- Implicit accounts (wallets): `tz1*`, `tz2*`, `tz3*` (different cryptographic curves). Hold tez and initiate operations.
- Smart contracts: `KT1*` addresses (originated contracts). Maintain storage and expose entrypoints.

## Fees and Gas

Tezos charges fees in tez and sets gas/storage limits per operation. Tooling typically estimates limits automatically; you can set maximums to avoid failures. Storage burn applies when data is added on‑chain (e.g., `big_map` entries).

## Networks

- Mainnet — production.
- Testnets — long‑lived testnets and protocol‑specific testnets evolve over time. Check https://teztnets.com/ for current recommendations.

## Core Tooling

- Taquito (TypeScript SDK) for dApps and scripts.
- SmartPy and Archetype for smart-contract development.
- TzKT for indexing and rich queries.

## Where to Start

1. Get a wallet (Temple, Kukai) and obtain test tez on a current testnet (public faucet).
2. Explore the chain via TzKT explorer and REST API.
3. Try basic operations with Taquito or a wallet transfer.
4. Review an example contract in SmartPy and deploy to a testnet.

## References

- https://tezos.com/
- https://teztnets.com/
- https://api.ghostnet.tzkt.io
- https://ghostnet.tzkt.io
$$,
  'A concise introduction to Tezos: accounts, contracts, fees, and why it matters.',
  'admin.hack.tez', 'Initial creation'
)
WHERE NOT EXISTS (
  SELECT 1 FROM wiki_revisions WHERE article_id = COALESCE((SELECT id FROM ins), (SELECT id FROM wiki_articles WHERE slug = 'tezos-overview')) AND revision = 1
);

-- 2) Wallets on Tezos
WITH cat AS (SELECT id FROM wiki_categories WHERE slug = 'wallets'),
ins AS (
  INSERT INTO wiki_articles (id, slug, title, content, markdown, summary, category_id, author, last_editor)
  VALUES (
    'art-wallets-on-tezos', 'wallets-on-tezos', 'Wallets on Tezos',
    $$# Wallets on Tezos

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
$$,
    $$# Wallets on Tezos

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
$$,
    'Popular Tezos wallets, connecting to dApps, and testnet funding.',
    (SELECT id FROM cat), 'admin.hack.tez', 'admin.hack.tez'
  ) ON CONFLICT (slug) DO NOTHING RETURNING id
)
INSERT INTO wiki_revisions (id, article_id, revision, title, content, markdown, summary, editor, edit_summary)
SELECT 'rev-wallets-on-tezos-1',
  COALESCE((SELECT id FROM ins), (SELECT id FROM wiki_articles WHERE slug = 'wallets-on-tezos')),
  1,
  'Wallets on Tezos',
  $$# Wallets on Tezos

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
$$,
  $$# Wallets on Tezos

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
$$,
  'Popular Tezos wallets, connecting to dApps, and testnet funding.',
  'admin.hack.tez', 'Initial creation'
)
WHERE NOT EXISTS (
  SELECT 1 FROM wiki_revisions WHERE article_id = COALESCE((SELECT id FROM ins), (SELECT id FROM wiki_articles WHERE slug = 'wallets-on-tezos')) AND revision = 1
);

-- 3) Tezos Domains and hack.tez
WITH cat AS (SELECT id FROM wiki_categories WHERE slug = 'domains'),
ins AS (
  INSERT INTO wiki_articles (id, slug, title, content, markdown, summary, category_id, author, last_editor)
  VALUES (
    'art-tezos-domains-and-hack-tez', 'tezos-domains-and-hack-tez', 'Tezos Domains and hack.tez',
    $$# Tezos Domains and hack.tez

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
$$,
    $$# Tezos Domains and hack.tez

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
$$,
    'How Tezos Domains (TED) records work and how hack.tez subdomains provide on-chain ownership.',
    (SELECT id FROM cat), 'admin.hack.tez', 'admin.hack.tez'
  ) ON CONFLICT (slug) DO NOTHING RETURNING id
)
INSERT INTO wiki_revisions (id, article_id, revision, title, content, markdown, summary, editor, edit_summary)
SELECT 'rev-tezos-domains-and-hack-tez-1',
  COALESCE((SELECT id FROM ins), (SELECT id FROM wiki_articles WHERE slug = 'tezos-domains-and-hack-tez')),
  1,
  'Tezos Domains and hack.tez',
  $$# Tezos Domains and hack.tez

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
$$,
  $$# Tezos Domains and hack.tez

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
$$,
  'How Tezos Domains (TED) records work and how hack.tez subdomains provide on-chain ownership.',
  'admin.hack.tez', 'Initial creation'
)
WHERE NOT EXISTS (
  SELECT 1 FROM wiki_revisions WHERE article_id = COALESCE((SELECT id FROM ins), (SELECT id FROM wiki_articles WHERE slug = 'tezos-domains-and-hack-tez')) AND revision = 1
);

-- 4) TED GraphQL Guide
WITH cat AS (SELECT id FROM wiki_categories WHERE slug = 'data'),
ins AS (
  INSERT INTO wiki_articles (id, slug, title, content, markdown, summary, category_id, author, last_editor)
  VALUES (
    'art-ted-graphql-guide', 'ted-graphql-guide', 'TED GraphQL Guide',
    $$# TED GraphQL: Where to Start

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
$$,
    $$# TED GraphQL: Where to Start

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
$$,
    'Querying Tezos Domains via GraphQL for records, availability, and reverse lookups.',
    (SELECT id FROM cat), 'admin.hack.tez', 'admin.hack.tez'
  ) ON CONFLICT (slug) DO NOTHING RETURNING id
)
INSERT INTO wiki_revisions (id, article_id, revision, title, content, markdown, summary, editor, edit_summary)
SELECT 'rev-ted-graphql-guide-1',
  COALESCE((SELECT id FROM ins), (SELECT id FROM wiki_articles WHERE slug = 'ted-graphql-guide')),
  1,
  'TED GraphQL Guide',
  $$# TED GraphQL: Where to Start

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
$$,
  $$# TED GraphQL: Where to Start

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
$$,
  'Querying Tezos Domains via GraphQL for records, availability, and reverse lookups.',
  'admin.hack.tez', 'Initial creation'
)
WHERE NOT EXISTS (
  SELECT 1 FROM wiki_revisions WHERE article_id = COALESCE((SELECT id FROM ins), (SELECT id FROM wiki_articles WHERE slug = 'ted-graphql-guide')) AND revision = 1
);

-- 5) TzKT and Data Indexing
WITH cat AS (SELECT id FROM wiki_categories WHERE slug = 'data'),
ins AS (
  INSERT INTO wiki_articles (id, slug, title, content, markdown, summary, category_id, author, last_editor)
  VALUES (
    'art-tzkt-and-data-indexing', 'tzkt-and-data-indexing', 'TzKT and Data Indexing',
    $$# TzKT and Data Indexing

TzKT is a widely used Tezos indexer and explorer. Its REST API exposes blocks, accounts, operations, contracts, storage, big_maps, tokens, and more.

## Common Queries

- Contract storage snapshot: `/v1/contracts/KT1.../storage`
- Big_map keys and updates: `/v1/bigmaps/{id}/keys`, `/v1/bigmaps/updates`
- Operation history and confirmations: `/v1/operations/transactions?target=KT1...`
- Account operations: `/v1/operations/transactions?sender=tz1...` (and related endpoints)

## Tips

- Prefer pagination (`limit`/`offset`) for lists and avoid unbounded scans.
- Use `select` to project only needed fields and reduce payloads.
- Filter early (e.g., `target=`, `sender=`, `timestamp.ge=`) to shrink result sets.
- Cache hot queries at the edge where possible.

For full filter syntax and advanced endpoints, see the TzKT API docs.

## References

- Mainnet: https://api.tzkt.io
- Testnets: network‑specific subdomains (see https://teztnets.com for current networks)
- Explorer: https://tzkt.io (switch network as needed)
$$,
    $$# TzKT and Data Indexing

TzKT is a widely used Tezos indexer and explorer. Its REST API exposes blocks, accounts, operations, contracts, storage, big_maps, tokens, and more.

## Common Queries

- Contract storage snapshot: `/v1/contracts/KT1.../storage`
- Big_map keys and updates: `/v1/bigmaps/{id}/keys`, `/v1/bigmaps/updates`
- Operation history and confirmations: `/v1/operations/transactions?target=KT1...`
- Account operations: `/v1/operations/transactions?sender=tz1...` (and related endpoints)

## Tips

- Prefer pagination (`limit`/`offset`) for lists and avoid unbounded scans.
- Use `select` to project only needed fields and reduce payloads.
- Filter early (e.g., `target=`, `sender=`, `timestamp.ge=`) to shrink result sets.
- Cache hot queries at the edge where possible.

For full filter syntax and advanced endpoints, see the TzKT API docs.

## References

- Mainnet: https://api.tzkt.io
- Testnets: network‑specific subdomains (see https://teztnets.com for current networks)
- Explorer: https://tzkt.io (switch network as needed)
$$,
    'Using the TzKT REST API for contract storage, history, and analytics.',
    (SELECT id FROM cat), 'admin.hack.tez', 'admin.hack.tez'
  ) ON CONFLICT (slug) DO NOTHING RETURNING id
)
INSERT INTO wiki_revisions (id, article_id, revision, title, content, markdown, summary, editor, edit_summary)
SELECT 'rev-tzkt-and-data-indexing-1',
  COALESCE((SELECT id FROM ins), (SELECT id FROM wiki_articles WHERE slug = 'tzkt-and-data-indexing')),
  1,
  'TzKT and Data Indexing',
  $$# TzKT and Data Indexing

TzKT is a widely used Tezos indexer and explorer. Its REST API exposes blocks, accounts, operations, contracts, storage, big_maps, tokens, and more.

## Common Queries

- Contract storage snapshot: `/v1/contracts/KT1.../storage`
- Big_map keys and updates: `/v1/bigmaps/{id}/keys`, `/v1/bigmaps/updates`
- Operation history and confirmations: `/v1/operations/transactions?target=KT1...`
- Account operations: `/v1/operations/transactions?sender=tz1...` (and related endpoints)

## Tips

- Prefer pagination (`limit`/`offset`) for lists and avoid unbounded scans.
- Use `select` to project only needed fields and reduce payloads.
- Filter early (e.g., `target=`, `sender=`, `timestamp.ge=`) to shrink result sets.
- Cache hot queries at the edge where possible.

For full filter syntax and advanced endpoints, see the TzKT API docs.

## References

- Mainnet: https://api.tzkt.io
- Testnets: network‑specific subdomains (see https://teztnets.com for current networks)
- Explorer: https://tzkt.io (switch network as needed)
$$,
  $$# TzKT and Data Indexing

TzKT is a widely used Tezos indexer and explorer. Its REST API exposes blocks, accounts, operations, contracts, storage, big_maps, tokens, and more.

## Common Queries

- Contract storage snapshot: `/v1/contracts/KT1.../storage`
- Big_map keys and updates: `/v1/bigmaps/{id}/keys`, `/v1/bigmaps/updates`
- Operation history and confirmations: `/v1/operations/transactions?target=KT1...`
- Account operations: `/v1/operations/transactions?sender=tz1...` (and related endpoints)

## Tips

- Prefer pagination (`limit`/`offset`) for lists and avoid unbounded scans.
- Use `select` to project only needed fields and reduce payloads.
- Filter early (e.g., `target=`, `sender=`, `timestamp.ge=`) to shrink result sets.
- Cache hot queries at the edge where possible.

For full filter syntax and advanced endpoints, see the TzKT API docs.

## References

- Mainnet: https://api.tzkt.io
- Testnets: network‑specific subdomains (see https://teztnets.com for current networks)
- Explorer: https://tzkt.io (switch network as needed)
$$,
  'Using the TzKT REST API for contract storage, history, and analytics.',
  'admin.hack.tez', 'Initial creation'
)
WHERE NOT EXISTS (
  SELECT 1 FROM wiki_revisions WHERE article_id = COALESCE((SELECT id FROM ins), (SELECT id FROM wiki_articles WHERE slug = 'tzkt-and-data-indexing')) AND revision = 1
);

-- 6) Ghostnet vs Mainnet (networks)
WITH cat AS (SELECT id FROM wiki_categories WHERE slug = 'network'),
ins AS (
  INSERT INTO wiki_articles (id, slug, title, content, markdown, summary, category_id, author, last_editor)
  VALUES (
    'art-ghostnet-vs-mainnet', 'ghostnet-vs-mainnet', 'Ghostnet vs Mainnet',
    $$# Networks: Testnets and Mainnet

Tezos maintains mainnet plus a set of evolving test networks. Historically, ghostnet has been the long‑lived testnet, but this has recently been sunset. Shadownet is now the preferred long-running test network. Tezos also runs protocol‑specific testnets and transitional networks.

## When to use a Testnet

- Iterating on contracts and UI.
- Testing fee/gas assumptions and indexer queries.
- Dry‑running operational scripts.

## RPC and Indexers (Examples)

- Choose reliable RPC providers appropriate for the current testnet and mainnet.
- TzKT indexer: `https://api.tzkt.io` (mainnet) and network‑specific subdomains for testnets.

## Migration Checklist

1. Remove faucet/private keys from code and config.
2. Switch RPCs and indexers to mainnet endpoints.
3. Confirm contract addresses and originated KT1s.
4. Re-audit limits/fees and metadata.

## References

- https://teztnets.com/ — current list of public Tezos networks
- https://tzkt.io — mainnet explorer (switch network as needed)
$$,
    $$# Networks: Testnets and Mainnet

Tezos maintains mainnet plus a set of evolving test networks. Historically, ghostnet has been the long‑lived testnet, but this has recently been sunset. Shadownet is now the preferred long-running test network. Tezos also runs protocol‑specific testnets and transitional networks.

## When to use a Testnet

- Iterating on contracts and UI.
- Testing fee/gas assumptions and indexer queries.
- Dry‑running operational scripts.

## RPC and Indexers (Examples)

- Choose reliable RPC providers appropriate for the current testnet and mainnet.
- TzKT indexer: `https://api.tzkt.io` (mainnet) and network‑specific subdomains for testnets.

## Migration Checklist

1. Remove faucet/private keys from code and config.
2. Switch RPCs and indexers to mainnet endpoints.
3. Confirm contract addresses and originated KT1s.
4. Re-audit limits/fees and metadata.

## References

- https://teztnets.com/ — current list of public Tezos networks
- https://tzkt.io — mainnet explorer (switch network as needed)
$$,
    'Choosing the right network, faucet funding, RPC selection, and migration tips.',
    (SELECT id FROM cat), 'admin.hack.tez', 'admin.hack.tez'
  ) ON CONFLICT (slug) DO NOTHING RETURNING id
)
INSERT INTO wiki_revisions (id, article_id, revision, title, content, markdown, summary, editor, edit_summary)
SELECT 'rev-ghostnet-vs-mainnet-1',
  COALESCE((SELECT id FROM ins), (SELECT id FROM wiki_articles WHERE slug = 'ghostnet-vs-mainnet')),
  1,
  'Ghostnet vs Mainnet',
  $$# Networks: Testnets and Mainnet

Tezos maintains mainnet plus a set of evolving test networks. Historically, ghostnet has been the long‑lived testnet, but this has recently been sunset. Shadownet is now the preferred long-running test network. Tezos also runs protocol‑specific testnets and transitional networks.

## When to use a Testnet

- Iterating on contracts and UI.
- Testing fee/gas assumptions and indexer queries.
- Dry‑running operational scripts.

## RPC and Indexers (Examples)

- Choose reliable RPC providers appropriate for the current testnet and mainnet.
- TzKT indexer: `https://api.tzkt.io` (mainnet) and network‑specific subdomains for testnets.

## Migration Checklist

1. Remove faucet/private keys from code and config.
2. Switch RPCs and indexers to mainnet endpoints.
3. Confirm contract addresses and originated KT1s.
4. Re-audit limits/fees and metadata.

## References

- https://teztnets.com/ — current list of public Tezos networks
- https://tzkt.io — mainnet explorer (switch network as needed)
$$,
  $$# Networks: Testnets and Mainnet

Tezos maintains mainnet plus a set of evolving test networks. Historically, ghostnet has been the long‑lived testnet, but this has recently been sunset. Shadownet is now the preferred long-running test network. Tezos also runs protocol‑specific testnets and transitional networks.

## When to use a Testnet

- Iterating on contracts and UI.
- Testing fee/gas assumptions and indexer queries.
- Dry‑running operational scripts.

## RPC and Indexers (Examples)

- Choose reliable RPC providers appropriate for the current testnet and mainnet.
- TzKT indexer: `https://api.tzkt.io` (mainnet) and network‑specific subdomains for testnets.

## Migration Checklist

1. Remove faucet/private keys from code and config.
2. Switch RPCs and indexers to mainnet endpoints.
3. Confirm contract addresses and originated KT1s.
4. Re-audit limits/fees and metadata.

## References

- https://teztnets.com/ — current list of public Tezos networks
- https://tzkt.io — mainnet explorer (switch network as needed)
$$,
  'Choosing the right network, faucet funding, RPC selection, and migration tips.',
  'admin.hack.tez', 'Initial creation'
)
WHERE NOT EXISTS (
  SELECT 1 FROM wiki_revisions WHERE article_id = COALESCE((SELECT id FROM ins), (SELECT id FROM wiki_articles WHERE slug = 'ghostnet-vs-mainnet')) AND revision = 1
);

-- 7) SmartPy Quickstart (links-focused)
WITH cat AS (SELECT id FROM wiki_categories WHERE slug = 'contracts'),
ins AS (
  INSERT INTO wiki_articles (id, slug, title, content, markdown, summary, category_id, author, last_editor)
  VALUES (
    'art-smartpy-quickstart', 'smartpy-quickstart', 'SmartPy Quickstart',
    $$# SmartPy: Where to Start

SmartPy is a Pythonic DSL for writing Tezos smart contracts that compile to Michelson. Rather than duplicating the official quickstart, this page points to the most useful, up‑to‑date entry points.

## Get Started

- Docs home: https://smartpy.io/
- Tutorials and examples: https://smartpy.io/ide?templates=true
- CLI and toolchain: https://smartpy.io/docs/cli
- Patterns and best practices: https://smartpy.io/docs/patterns

## Concepts to Know

- Entrypoints: callable functions that modify storage or emit operations.
- Storage types: define on‑chain state; types must match exactly.
- Off‑chain views: read‑only helpers returned by contracts.

## Tips

- Keep storage minimal; prefer big_maps for sparse data.
- Write unit tests alongside contracts; assert both storage and emitted ops.
- Compile locally and deploy to a testnet before mainnet.
$$,
    $$# SmartPy: Where to Start

SmartPy is a Pythonic DSL for writing Tezos smart contracts that compile to Michelson. Rather than duplicating the official quickstart, this page points to the most useful, up‑to‑date entry points.

## Get Started

- Docs home: https://smartpy.io/
- Tutorials and examples: https://smartpy.io/ide?templates=true
- CLI and toolchain: https://smartpy.io/docs/cli
- Patterns and best practices: https://smartpy.io/docs/patterns

## Concepts to Know

- Entrypoints: callable functions that modify storage or emit operations.
- Storage types: define on‑chain state; types must match exactly.
- Off‑chain views: read‑only helpers returned by contracts.

## Tips

- Keep storage minimal; prefer big_maps for sparse data.
- Write unit tests alongside contracts; assert both storage and emitted ops.
- Compile locally and deploy to a testnet before mainnet.
$$,
    'From zero to a deployed SmartPy contract on ghostnet.',
    (SELECT id FROM cat), 'admin.hack.tez', 'admin.hack.tez'
  ) ON CONFLICT (slug) DO NOTHING RETURNING id
)
INSERT INTO wiki_revisions (id, article_id, revision, title, content, markdown, summary, editor, edit_summary)
SELECT 'rev-smartpy-quickstart-1',
  COALESCE((SELECT id FROM ins), (SELECT id FROM wiki_articles WHERE slug = 'smartpy-quickstart')),
  1,
  'SmartPy Quickstart',
  $$# SmartPy: Where to Start

SmartPy is a Pythonic DSL for writing Tezos smart contracts that compile to Michelson. Rather than duplicating the official quickstart, this page points to the most useful, up‑to‑date entry points.

## Get Started

- Docs home: https://smartpy.io/
- Tutorials and examples: https://smartpy.io/ide?templates=true
- CLI and toolchain: https://smartpy.io/docs/cli
- Patterns and best practices: https://smartpy.io/docs/patterns

## Concepts to Know

- Entrypoints: callable functions that modify storage or emit operations.
- Storage types: define on‑chain state; types must match exactly.
- Off‑chain views: read‑only helpers returned by contracts.

## Tips

- Keep storage minimal; prefer big_maps for sparse data.
- Write unit tests alongside contracts; assert both storage and emitted ops.
- Compile locally and deploy to a testnet before mainnet.
$$,
  $$# SmartPy: Where to Start

SmartPy is a Pythonic DSL for writing Tezos smart contracts that compile to Michelson. Rather than duplicating the official quickstart, this page points to the most useful, up‑to‑date entry points.

## Get Started

- Docs home: https://smartpy.io/
- Tutorials and examples: https://smartpy.io/ide?templates=true
- CLI and toolchain: https://smartpy.io/docs/cli
- Patterns and best practices: https://smartpy.io/docs/patterns

## Concepts to Know

- Entrypoints: callable functions that modify storage or emit operations.
- Storage types: define on‑chain state; types must match exactly.
- Off‑chain views: read‑only helpers returned by contracts.

## Tips

- Keep storage minimal; prefer big_maps for sparse data.
- Write unit tests alongside contracts; assert both storage and emitted ops.
- Compile locally and deploy to a testnet before mainnet.
$$,
  'From zero to a deployed SmartPy contract on ghostnet.',
  'admin.hack.tez', 'Initial creation'
)
WHERE NOT EXISTS (
  SELECT 1 FROM wiki_revisions WHERE article_id = COALESCE((SELECT id FROM ins), (SELECT id FROM wiki_articles WHERE slug = 'smartpy-quickstart')) AND revision = 1
);

-- 8) Taquito Quickstart (links-focused)
WITH cat AS (SELECT id FROM wiki_categories WHERE slug = 'tooling'),
ins AS (
  INSERT INTO wiki_articles (id, slug, title, content, markdown, summary, category_id, author, last_editor)
  VALUES (
    'art-taquito-quickstart', 'taquito-quickstart', 'Taquito Quickstart',
    $$# Taquito: Where to Start

Taquito is the canonical TypeScript SDK for Tezos.

## What it Provides

- `Tezos.contract.*` — direct signing with a Signer (scripts, services).
- `Tezos.wallet.*` — delegated signing via a wallet provider (browser dApps).

## Get Started

- Quickstart and Docs: https://tezostaquito.io/
- Examples: https://tezostaquito.io/docs/quick_start
- Contract Calls: https://tezostaquito.io/docs/contract
- Wallet API: https://tezostaquito.io/docs/wallet_api

## Tips

- Reuse a single `TezosToolkit` where possible.
- Distinguish between tez (1e6 mutez) and mutez for amounts.
- For browser dApps, prefer the Wallet API with a Beacon provider.
$$,
    $$# Taquito: Where to Start

Taquito is the canonical TypeScript SDK for Tezos.

## What it Provides

- `Tezos.contract.*` — direct signing with a Signer (scripts, services).
- `Tezos.wallet.*` — delegated signing via a wallet provider (browser dApps).

## Get Started

- Quickstart and Docs: https://tezostaquito.io/
- Examples: https://tezostaquito.io/docs/quick_start
- Contract Calls: https://tezostaquito.io/docs/contract
- Wallet API: https://tezostaquito.io/docs/wallet_api

## Tips

- Reuse a single `TezosToolkit` where possible.
- Distinguish between tez (1e6 mutez) and mutez for amounts.
- For browser dApps, prefer the Wallet API with a Beacon provider.
$$,
    'Practical Taquito setup and the difference between Contract vs Wallet APIs.',
    (SELECT id FROM cat), 'admin.hack.tez', 'admin.hack.tez'
  ) ON CONFLICT (slug) DO NOTHING RETURNING id
)
INSERT INTO wiki_revisions (id, article_id, revision, title, content, markdown, summary, editor, edit_summary)
SELECT 'rev-taquito-quickstart-1',
  COALESCE((SELECT id FROM ins), (SELECT id FROM wiki_articles WHERE slug = 'taquito-quickstart')),
  1,
  'Taquito Quickstart',
  $$# Taquito: Where to Start

Taquito is the canonical TypeScript SDK for Tezos.

## What it Provides

- `Tezos.contract.*` — direct signing with a Signer (scripts, services).
- `Tezos.wallet.*` — delegated signing via a wallet provider (browser dApps).

## Get Started

- Quickstart and Docs: https://tezostaquito.io/
- Examples: https://tezostaquito.io/docs/quick_start
- Contract Calls: https://tezostaquito.io/docs/contract
- Wallet API: https://tezostaquito.io/docs/wallet_api

## Tips

- Reuse a single `TezosToolkit` where possible.
- Distinguish between tez (1e6 mutez) and mutez for amounts.
- For browser dApps, prefer the Wallet API with a Beacon provider.
$$,
  $$# Taquito: Where to Start

Taquito is the canonical TypeScript SDK for Tezos.

## What it Provides

- `Tezos.contract.*` — direct signing with a Signer (scripts, services).
- `Tezos.wallet.*` — delegated signing via a wallet provider (browser dApps).

## Get Started

- Quickstart and Docs: https://tezostaquito.io/
- Examples: https://tezostaquito.io/docs/quick_start
- Contract Calls: https://tezostaquito.io/docs/contract
- Wallet API: https://tezostaquito.io/docs/wallet_api

## Tips

- Reuse a single `TezosToolkit` where possible.
- Distinguish between tez (1e6 mutez) and mutez for amounts.
- For browser dApps, prefer the Wallet API with a Beacon provider.
$$,
  'Practical Taquito setup and the difference between Contract vs Wallet APIs.',
  'admin.hack.tez', 'Initial creation'
)
WHERE NOT EXISTS (
  SELECT 1 FROM wiki_revisions WHERE article_id = COALESCE((SELECT id FROM ins), (SELECT id FROM wiki_articles WHERE slug = 'taquito-quickstart')) AND revision = 1
);

-- 9) Octez Connect Integration
WITH cat AS (SELECT id FROM wiki_categories WHERE slug = 'hacktez'),
ins AS (
  INSERT INTO wiki_articles (id, slug, title, content, markdown, summary, category_id, author, last_editor)
  VALUES (
    'art-octez-connect-integration', 'octez-connect-integration', 'Octez Connect Integration (hack.tez)',
    $$# Octez Connect Integration (hack.tez)

hack.tez uses `@tezos-x/octez.connect-sdk` (Beacon) for wallet connections and raw operation requests. The app lazily loads the SDK to keep the initial bundle small and restores sessions on reload.

## Key Patterns

1) Lazy-load the SDK and build a `DAppClient` with a custom network on non‑mainnet to avoid wallet network lookup issues.

```ts
// see src/context/TezosContext.tsx
import type { DAppClient } from "@tezos-x/octez.connect-sdk";

let dAppClient: DAppClient | null = null;
async function getOrCreateClient() {
  const sdk = await import("@tezos-x/octez.connect-sdk");
  if (dAppClient) return dAppClient;
  dAppClient = new sdk.DAppClient({ name: "hack.tez", network: {
    type: sdk.NetworkType.CUSTOM, name: "Ghostnet", rpcUrl: "https://rpc.ghostnet.teztnets.com"
  }});
  return dAppClient;
}
```

2) Request permissions with both `OPERATION_REQUEST` and `SIGN` scopes so the app can submit transactions and sign messages.

```ts
const sdk = await import("@tezos-x/octez.connect-sdk");
const client = await getOrCreateClient();
await client.requestPermissions({ scopes: [sdk.PermissionScope.OPERATION_REQUEST, sdk.PermissionScope.SIGN] });
```

3) Listen for `ACTIVE_ACCOUNT_SET` to keep address/domain state in sync and clear session state on disconnect.

```ts
client.subscribeToEvent(sdk.BeaconEvent.ACTIVE_ACCOUNT_SET, (account) => {
  if (!account) { /* clear app state */ } else { /* hydrate address → domain */ }
});
```

## Raw Operation Requests

This app uses raw Michelson with `DAppClient.requestOperation()` instead of Taquito abstractions for registrar calls.

```ts
// see src/lib/contract.ts
await client.requestOperation({
  operationDetails: [{
    kind: "transaction",
    destination: registrarAddress,
    amount: "0",
    parameters: { entrypoint: "commit", value: { bytes: commitmentHash } },
  }],
});
```

For registration:

```ts
await client.requestOperation({
  operationDetails: [{
    kind: "transaction",
    destination: registrarAddress,
    amount: "0",
    parameters: {
      entrypoint: "register",
      value: { prim: "Pair", args: [
        { bytes: labelHex },
        { prim: "Pair", args: [{ bytes: saltHex }, { string: targetAddress }] },
      ]},
    },
  }],
});
```

## Message Signing for Chat Auth

The app signs a challenge to obtain a JWT for chat (CF Worker). Payload is Micheline‑encoded to match wallet expectations.

```ts
// see src/lib/signing.ts
import { SigningType } from "@tezos-x/octez.connect-sdk";
const payload = packMichelineString("hack.tez-chat:" + ts + ":" + nonce);
const { signature } = await client.requestSignPayload({ signingType: SigningType.MICHELINE, payload });
```

The signed challenge is POSTed to `/auth` on the chat worker to exchange for a JWT, which the UI stores and refreshes.

## Session Restore

On load, the app restores Beacon wallet state and a previously issued JWT (if valid), then resolves the user’s preferred domain for display.
$$,
    $$# Octez Connect Integration (hack.tez)

hack.tez uses `@tezos-x/octez.connect-sdk` (Beacon) for wallet connections and raw operation requests. The app lazily loads the SDK to keep the initial bundle small and restores sessions on reload.

## Key Patterns

1) Lazy-load the SDK and build a `DAppClient` with a custom network on non‑mainnet to avoid wallet network lookup issues.

```ts
// see src/context/TezosContext.tsx
import type { DAppClient } from "@tezos-x/octez.connect-sdk";

let dAppClient: DAppClient | null = null;
async function getOrCreateClient() {
  const sdk = await import("@tezos-x/octez.connect-sdk");
  if (dAppClient) return dAppClient;
  dAppClient = new sdk.DAppClient({ name: "hack.tez", network: {
    type: sdk.NetworkType.CUSTOM, name: "Ghostnet", rpcUrl: "https://rpc.ghostnet.teztnets.com"
  }});
  return dAppClient;
}
```

2) Request permissions with both `OPERATION_REQUEST` and `SIGN` scopes so the app can submit transactions and sign messages.

```ts
const sdk = await import("@tezos-x/octez.connect-sdk");
const client = await getOrCreateClient();
await client.requestPermissions({ scopes: [sdk.PermissionScope.OPERATION_REQUEST, sdk.PermissionScope.SIGN] });
```

3) Listen for `ACTIVE_ACCOUNT_SET` to keep address/domain state in sync and clear session state on disconnect.

```ts
client.subscribeToEvent(sdk.BeaconEvent.ACTIVE_ACCOUNT_SET, (account) => {
  if (!account) { /* clear app state */ } else { /* hydrate address → domain */ }
});
```

## Raw Operation Requests

This app uses raw Michelson with `DAppClient.requestOperation()` instead of Taquito abstractions for registrar calls.

```ts
// see src/lib/contract.ts
await client.requestOperation({
  operationDetails: [{
    kind: "transaction",
    destination: registrarAddress,
    amount: "0",
    parameters: { entrypoint: "commit", value: { bytes: commitmentHash } },
  }],
});
```

For registration:

```ts
await client.requestOperation({
  operationDetails: [{
    kind: "transaction",
    destination: registrarAddress,
    amount: "0",
    parameters: {
      entrypoint: "register",
      value: { prim: "Pair", args: [
        { bytes: labelHex },
        { prim: "Pair", args: [{ bytes: saltHex }, { string: targetAddress }] },
      ]},
    },
  }],
});
```

## Message Signing for Chat Auth

The app signs a challenge to obtain a JWT for chat (CF Worker). Payload is Micheline‑encoded to match wallet expectations.

```ts
// see src/lib/signing.ts
import { SigningType } from "@tezos-x/octez.connect-sdk";
const payload = packMichelineString("hack.tez-chat:" + ts + ":" + nonce);
const { signature } = await client.requestSignPayload({ signingType: SigningType.MICHELINE, payload });
```

The signed challenge is POSTed to `/auth` on the chat worker to exchange for a JWT, which the UI stores and refreshes.

## Session Restore

On load, the app restores Beacon wallet state and a previously issued JWT (if valid), then resolves the user’s preferred domain for display.
$$,
    'How hack.tez integrates Beacon via @tezos-x/octez.connect-sdk for wallet connect, operation requests, and chat auth.',
    (SELECT id FROM cat), 'admin.hack.tez', 'admin.hack.tez'
  ) ON CONFLICT (slug) DO NOTHING RETURNING id
)
INSERT INTO wiki_revisions (id, article_id, revision, title, content, markdown, summary, editor, edit_summary)
SELECT 'rev-octez-connect-integration-1',
  COALESCE((SELECT id FROM ins), (SELECT id FROM wiki_articles WHERE slug = 'octez-connect-integration')),
  1,
  'Octez Connect Integration (hack.tez)',
  $$# Octez Connect Integration (hack.tez)

hack.tez uses `@tezos-x/octez.connect-sdk` (Beacon) for wallet connections and raw operation requests. The app lazily loads the SDK to keep the initial bundle small and restores sessions on reload.

## Key Patterns

1) Lazy-load the SDK and build a `DAppClient` with a custom network on non‑mainnet to avoid wallet network lookup issues.

```ts
// see src/context/TezosContext.tsx
import type { DAppClient } from "@tezos-x/octez.connect-sdk";

let dAppClient: DAppClient | null = null;
async function getOrCreateClient() {
  const sdk = await import("@tezos-x/octez.connect-sdk");
  if (dAppClient) return dAppClient;
  dAppClient = new sdk.DAppClient({ name: "hack.tez", network: {
    type: sdk.NetworkType.CUSTOM, name: "Ghostnet", rpcUrl: "https://rpc.ghostnet.teztnets.com"
  }});
  return dAppClient;
}
```

2) Request permissions with both `OPERATION_REQUEST` and `SIGN` scopes so the app can submit transactions and sign messages.

```ts
const sdk = await import("@tezos-x/octez.connect-sdk");
const client = await getOrCreateClient();
await client.requestPermissions({ scopes: [sdk.PermissionScope.OPERATION_REQUEST, sdk.PermissionScope.SIGN] });
```

3) Listen for `ACTIVE_ACCOUNT_SET` to keep address/domain state in sync and clear session state on disconnect.

```ts
client.subscribeToEvent(sdk.BeaconEvent.ACTIVE_ACCOUNT_SET, (account) => {
  if (!account) { /* clear app state */ } else { /* hydrate address → domain */ }
});
```

## Raw Operation Requests

This app uses raw Michelson with `DAppClient.requestOperation()` instead of Taquito abstractions for registrar calls.

```ts
// see src/lib/contract.ts
await client.requestOperation({
  operationDetails: [{
    kind: "transaction",
    destination: registrarAddress,
    amount: "0",
    parameters: { entrypoint: "commit", value: { bytes: commitmentHash } },
  }],
});
```

For registration:

```ts
await client.requestOperation({
  operationDetails: [{
    kind: "transaction",
    destination: registrarAddress,
    amount: "0",
    parameters: {
      entrypoint: "register",
      value: { prim: "Pair", args: [
        { bytes: labelHex },
        { prim: "Pair", args: [{ bytes: saltHex }, { string: targetAddress }] },
      ]},
    },
  }],
});
```

## Message Signing for Chat Auth

The app signs a challenge to obtain a JWT for chat (CF Worker). Payload is Micheline‑encoded to match wallet expectations.

```ts
// see src/lib/signing.ts
import { SigningType } from "@tezos-x/octez.connect-sdk";
const payload = packMichelineString("hack.tez-chat:" + ts + ":" + nonce);
const { signature } = await client.requestSignPayload({ signingType: SigningType.MICHELINE, payload });
```

The signed challenge is POSTed to `/auth` on the chat worker to exchange for a JWT, which the UI stores and refreshes.

## Session Restore

On load, the app restores Beacon wallet state and a previously issued JWT (if valid), then resolves the user’s preferred domain for display.
$$,
  $$# Octez Connect Integration (hack.tez)

hack.tez uses `@tezos-x/octez.connect-sdk` (Beacon) for wallet connections and raw operation requests. The app lazily loads the SDK to keep the initial bundle small and restores sessions on reload.

## Key Patterns

1) Lazy-load the SDK and build a `DAppClient` with a custom network on non‑mainnet to avoid wallet network lookup issues.

```ts
// see src/context/TezosContext.tsx
import type { DAppClient } from "@tezos-x/octez.connect-sdk";

let dAppClient: DAppClient | null = null;
async function getOrCreateClient() {
  const sdk = await import("@tezos-x/octez.connect-sdk");
  if (dAppClient) return dAppClient;
  dAppClient = new sdk.DAppClient({ name: "hack.tez", network: {
    type: sdk.NetworkType.CUSTOM, name: "Ghostnet", rpcUrl: "https://rpc.ghostnet.teztnets.com"
  }});
  return dAppClient;
}
```

2) Request permissions with both `OPERATION_REQUEST` and `SIGN` scopes so the app can submit transactions and sign messages.

```ts
const sdk = await import("@tezos-x/octez.connect-sdk");
const client = await getOrCreateClient();
await client.requestPermissions({ scopes: [sdk.PermissionScope.OPERATION_REQUEST, sdk.PermissionScope.SIGN] });
```

3) Listen for `ACTIVE_ACCOUNT_SET` to keep address/domain state in sync and clear session state on disconnect.

```ts
client.subscribeToEvent(sdk.BeaconEvent.ACTIVE_ACCOUNT_SET, (account) => {
  if (!account) { /* clear app state */ } else { /* hydrate address → domain */ }
});
```

## Raw Operation Requests

This app uses raw Michelson with `DAppClient.requestOperation()` instead of Taquito abstractions for registrar calls.

```ts
// see src/lib/contract.ts
await client.requestOperation({
  operationDetails: [{
    kind: "transaction",
    destination: registrarAddress,
    amount: "0",
    parameters: { entrypoint: "commit", value: { bytes: commitmentHash } },
  }],
});
```

For registration:

```ts
await client.requestOperation({
  operationDetails: [{
    kind: "transaction",
    destination: registrarAddress,
    amount: "0",
    parameters: {
      entrypoint: "register",
      value: { prim: "Pair", args: [
        { bytes: labelHex },
        { prim: "Pair", args: [{ bytes: saltHex }, { string: targetAddress }] },
      ]},
    },
  }],
});
```

## Message Signing for Chat Auth

The app signs a challenge to obtain a JWT for chat (CF Worker). Payload is Micheline‑encoded to match wallet expectations.

```ts
// see src/lib/signing.ts
import { SigningType } from "@tezos-x/octez.connect-sdk";
const payload = packMichelineString("hack.tez-chat:" + ts + ":" + nonce);
const { signature } = await client.requestSignPayload({ signingType: SigningType.MICHELINE, payload });
```

The signed challenge is POSTed to `/auth` on the chat worker to exchange for a JWT, which the UI stores and refreshes.

## Session Restore

On load, the app restores Beacon wallet state and a previously issued JWT (if valid), then resolves the user’s preferred domain for display.
$$,
  'How hack.tez integrates Beacon via @tezos-x/octez.connect-sdk for wallet connect, operation requests, and chat auth.',
  'admin.hack.tez', 'Initial creation'
)
WHERE NOT EXISTS (
  SELECT 1 FROM wiki_revisions WHERE article_id = COALESCE((SELECT id FROM ins), (SELECT id FROM wiki_articles WHERE slug = 'octez-connect-integration')) AND revision = 1
);

-- 10) Registrar Flow
WITH cat AS (SELECT id FROM wiki_categories WHERE slug = 'hacktez'),
ins AS (
  INSERT INTO wiki_articles (id, slug, title, content, markdown, summary, category_id, author, last_editor)
  VALUES (
    'art-registrar-flow', 'registrar-flow', 'Registrar Flow: Commit → Register',
    $$# Registrar Flow: Commit → Register

The hack.tez registrar uses a two‑phase commit‑reveal to prevent front‑running.

## 1) Commit

Compute a commitment hash over the label, sender, target address, and a random salt. The contract stores only the hash.

```ts
// see src/lib/commitment
const labelHex = labelToHexBytes(label);      // hex bytes of the UTF‑8 label
const saltHex = generateSalt();               // 16‑byte random salt (hex)
const hash = computeCommitmentHash(labelHex, sender, target, saltHex);

await client.requestOperation({ operationDetails: [{
  kind: "transaction",
  destination: registrarAddress,
  amount: "0",
  parameters: { entrypoint: "commit", value: { bytes: hash } },
}]});
```

## 2) Wait ≥ min_commit_age

You must wait at least `min_commit_age` seconds before revealing. Fetch the value via the public API:

```http
GET /api/v1/config → { minCommitAgeSec, maxCommitAgeSec, maxPerWallet, paused }
```

## 3) Register (Reveal)

Reveal the label and salt to the registrar. The registrar verifies the hash and calls TED to set the record. Owner is set to the sender (wallet).

```ts
await client.requestOperation({ operationDetails: [{
  kind: "transaction",
  destination: registrarAddress,
  amount: "0",
  parameters: {
    entrypoint: "register",
    value: { prim: "Pair", args: [
      { bytes: labelHex },
      { prim: "Pair", args: [{ bytes: saltHex }, { string: targetAddress }] },
    ]},
  },
}]});
```

## Constraints

- Owner = sender. Users own the TED record directly.
- 1 claim per wallet (permanent). Even if a TED record is removed later, the claim slot remains spent.
- Paused. If the contract is paused, registrations are temporarily disabled.

## After Registration

Use the TED UpdateRecord proxy to update profile data (JSON‑encoded data map) and SetChildRecord to create sub‑subdomains. See `src/lib/contract.ts` for raw parameter layouts.
$$,
    $$# Registrar Flow: Commit → Register

The hack.tez registrar uses a two‑phase commit‑reveal to prevent front‑running.

## 1) Commit

Compute a commitment hash over the label, sender, target address, and a random salt. The contract stores only the hash.

```ts
// see src/lib/commitment
const labelHex = labelToHexBytes(label);      // hex bytes of the UTF‑8 label
const saltHex = generateSalt();               // 16‑byte random salt (hex)
const hash = computeCommitmentHash(labelHex, sender, target, saltHex);

await client.requestOperation({ operationDetails: [{
  kind: "transaction",
  destination: registrarAddress,
  amount: "0",
  parameters: { entrypoint: "commit", value: { bytes: hash } },
}]});
```

## 2) Wait ≥ min_commit_age

You must wait at least `min_commit_age` seconds before revealing. Fetch the value via the public API:

```http
GET /api/v1/config → { minCommitAgeSec, maxCommitAgeSec, maxPerWallet, paused }
```

## 3) Register (Reveal)

Reveal the label and salt to the registrar. The registrar verifies the hash and calls TED to set the record. Owner is set to the sender (wallet).

```ts
await client.requestOperation({ operationDetails: [{
  kind: "transaction",
  destination: registrarAddress,
  amount: "0",
  parameters: {
    entrypoint: "register",
    value: { prim: "Pair", args: [
      { bytes: labelHex },
      { prim: "Pair", args: [{ bytes: saltHex }, { string: targetAddress }] },
    ]},
  },
}]});
```

## Constraints

- Owner = sender. Users own the TED record directly.
- 1 claim per wallet (permanent). Even if a TED record is removed later, the claim slot remains spent.
- Paused. If the contract is paused, registrations are temporarily disabled.

## After Registration

Use the TED UpdateRecord proxy to update profile data (JSON‑encoded data map) and SetChildRecord to create sub‑subdomains. See `src/lib/contract.ts` for raw parameter layouts.
$$,
    'How hack.tez registrations work on-chain: commitment, waiting period, and register reveal.',
    (SELECT id FROM cat), 'admin.hack.tez', 'admin.hack.tez'
  ) ON CONFLICT (slug) DO NOTHING RETURNING id
)
INSERT INTO wiki_revisions (id, article_id, revision, title, content, markdown, summary, editor, edit_summary)
SELECT 'rev-registrar-flow-1',
  COALESCE((SELECT id FROM ins), (SELECT id FROM wiki_articles WHERE slug = 'registrar-flow')),
  1,
  'Registrar Flow: Commit → Register',
  $$# Registrar Flow: Commit → Register

The hack.tez registrar uses a two‑phase commit‑reveal to prevent front‑running.

## 1) Commit

Compute a commitment hash over the label, sender, target address, and a random salt. The contract stores only the hash.

```ts
// see src/lib/commitment
const labelHex = labelToHexBytes(label);      // hex bytes of the UTF‑8 label
const saltHex = generateSalt();               // 16‑byte random salt (hex)
const hash = computeCommitmentHash(labelHex, sender, target, saltHex);

await client.requestOperation({ operationDetails: [{
  kind: "transaction",
  destination: registrarAddress,
  amount: "0",
  parameters: { entrypoint: "commit", value: { bytes: hash } },
}]});
```

## 2) Wait ≥ min_commit_age

You must wait at least `min_commit_age` seconds before revealing. Fetch the value via the public API:

```http
GET /api/v1/config → { minCommitAgeSec, maxCommitAgeSec, maxPerWallet, paused }
```

## 3) Register (Reveal)

Reveal the label and salt to the registrar. The registrar verifies the hash and calls TED to set the record. Owner is set to the sender (wallet).

```ts
await client.requestOperation({ operationDetails: [{
  kind: "transaction",
  destination: registrarAddress,
  amount: "0",
  parameters: {
    entrypoint: "register",
    value: { prim: "Pair", args: [
      { bytes: labelHex },
      { prim: "Pair", args: [{ bytes: saltHex }, { string: targetAddress }] },
    ]},
  },
}]});
```

## Constraints

- Owner = sender. Users own the TED record directly.
- 1 claim per wallet (permanent). Even if a TED record is removed later, the claim slot remains spent.
- Paused. If the contract is paused, registrations are temporarily disabled.

## After Registration

Use the TED UpdateRecord proxy to update profile data (JSON‑encoded data map) and SetChildRecord to create sub‑subdomains. See `src/lib/contract.ts` for raw parameter layouts.
$$,
  $$# Registrar Flow: Commit → Register

The hack.tez registrar uses a two‑phase commit‑reveal to prevent front‑running.

## 1) Commit

Compute a commitment hash over the label, sender, target address, and a random salt. The contract stores only the hash.

```ts
// see src/lib/commitment
const labelHex = labelToHexBytes(label);      // hex bytes of the UTF‑8 label
const saltHex = generateSalt();               // 16‑byte random salt (hex)
const hash = computeCommitmentHash(labelHex, sender, target, saltHex);

await client.requestOperation({ operationDetails: [{
  kind: "transaction",
  destination: registrarAddress,
  amount: "0",
  parameters: { entrypoint: "commit", value: { bytes: hash } },
}]});
```

## 2) Wait ≥ min_commit_age

You must wait at least `min_commit_age` seconds before revealing. Fetch the value via the public API:

```http
GET /api/v1/config → { minCommitAgeSec, maxCommitAgeSec, maxPerWallet, paused }
```

## 3) Register (Reveal)

Reveal the label and salt to the registrar. The registrar verifies the hash and calls TED to set the record. Owner is set to the sender (wallet).

```ts
await client.requestOperation({ operationDetails: [{
  kind: "transaction",
  destination: registrarAddress,
  amount: "0",
  parameters: {
    entrypoint: "register",
    value: { prim: "Pair", args: [
      { bytes: labelHex },
      { prim: "Pair", args: [{ bytes: saltHex }, { string: targetAddress }] },
    ]},
  },
}]});
```

## Constraints

- Owner = sender. Users own the TED record directly.
- 1 claim per wallet (permanent). Even if a TED record is removed later, the claim slot remains spent.
- Paused. If the contract is paused, registrations are temporarily disabled.

## After Registration

Use the TED UpdateRecord proxy to update profile data (JSON‑encoded data map) and SetChildRecord to create sub‑subdomains. See `src/lib/contract.ts` for raw parameter layouts.
$$,
  'How hack.tez registrations work on-chain: commitment, waiting period, and register reveal.',
  'admin.hack.tez', 'Initial creation'
)
WHERE NOT EXISTS (
  SELECT 1 FROM wiki_revisions WHERE article_id = COALESCE((SELECT id FROM ins), (SELECT id FROM wiki_articles WHERE slug = 'registrar-flow')) AND revision = 1
);

-- 11) Hackatar Architecture
WITH cat AS (SELECT id FROM wiki_categories WHERE slug = 'hacktez'),
ins AS (
  INSERT INTO wiki_articles (id, slug, title, content, markdown, summary, category_id, author, last_editor)
  VALUES (
    'art-hackatar-architecture', 'hackatar-architecture', 'Hackatar Architecture',
    $$# Hackatar Architecture

Hackatars are server‑rendered, deterministic avatars generated from a salted domain label. They’re lightweight, unique, and instantly recognizable — a generative identity you own with your domain.

## Pipeline

1. Seed: salted label → PRNG
2. Traits: select features via PRNG
3. Render: compose frames and encode as animated GIF (or static frame)
4. Cache: store in Netlify Blobs and serve at `/api/v1/hackatar/:label`

## Client Usage

Use the `<Hackatar>` component, which renders an `<img>` pointing to the API. Add `?static=1` for a single‑frame image. Avatars load fast and cache well, making them great for lists and chats.

## Design Notes

- Deterministic: the same label always yields the same art.
- Privacy‑preserving: no tracking pixels or client‑side RNG.
- Fun: glitch effects and traits keep the style playful and on‑brand.

## References

- See `src/lib/hackatar/` and `netlify/functions/api.mts`
$$,
    $$# Hackatar Architecture

Hackatars are server‑rendered, deterministic avatars generated from a salted domain label. They’re lightweight, unique, and instantly recognizable — a generative identity you own with your domain.

## Pipeline

1. Seed: salted label → PRNG
2. Traits: select features via PRNG
3. Render: compose frames and encode as animated GIF (or static frame)
4. Cache: store in Netlify Blobs and serve at `/api/v1/hackatar/:label`

## Client Usage

Use the `<Hackatar>` component, which renders an `<img>` pointing to the API. Add `?static=1` for a single‑frame image. Avatars load fast and cache well, making them great for lists and chats.

## Design Notes

- Deterministic: the same label always yields the same art.
- Privacy‑preserving: no tracking pixels or client‑side RNG.
- Fun: glitch effects and traits keep the style playful and on‑brand.

## References

- See `src/lib/hackatar/` and `netlify/functions/api.mts`
$$,
    'How Hackatars are deterministically generated and served from the API.',
    (SELECT id FROM cat), 'admin.hack.tez', 'admin.hack.tez'
  ) ON CONFLICT (slug) DO NOTHING RETURNING id
)
INSERT INTO wiki_revisions (id, article_id, revision, title, content, markdown, summary, editor, edit_summary)
SELECT 'rev-hackatar-architecture-1',
  COALESCE((SELECT id FROM ins), (SELECT id FROM wiki_articles WHERE slug = 'hackatar-architecture')),
  1,
  'Hackatar Architecture',
  $$# Hackatar Architecture

Hackatars are server‑rendered, deterministic avatars generated from a salted domain label. They’re lightweight, unique, and instantly recognizable — a generative identity you own with your domain.

## Pipeline

1. Seed: salted label → PRNG
2. Traits: select features via PRNG
3. Render: compose frames and encode as animated GIF (or static frame)
4. Cache: store in Netlify Blobs and serve at `/api/v1/hackatar/:label`

## Client Usage

Use the `<Hackatar>` component, which renders an `<img>` pointing to the API. Add `?static=1` for a single‑frame image. Avatars load fast and cache well, making them great for lists and chats.

## Design Notes

- Deterministic: the same label always yields the same art.
- Privacy‑preserving: no tracking pixels or client‑side RNG.
- Fun: glitch effects and traits keep the style playful and on‑brand.

## References

- See `src/lib/hackatar/` and `netlify/functions/api.mts`
$$,
  $$# Hackatar Architecture

Hackatars are server‑rendered, deterministic avatars generated from a salted domain label. They’re lightweight, unique, and instantly recognizable — a generative identity you own with your domain.

## Pipeline

1. Seed: salted label → PRNG
2. Traits: select features via PRNG
3. Render: compose frames and encode as animated GIF (or static frame)
4. Cache: store in Netlify Blobs and serve at `/api/v1/hackatar/:label`

## Client Usage

Use the `<Hackatar>` component, which renders an `<img>` pointing to the API. Add `?static=1` for a single‑frame image. Avatars load fast and cache well, making them great for lists and chats.

## Design Notes

- Deterministic: the same label always yields the same art.
- Privacy‑preserving: no tracking pixels or client‑side RNG.
- Fun: glitch effects and traits keep the style playful and on‑brand.

## References

- See `src/lib/hackatar/` and `netlify/functions/api.mts`
$$,
  'How Hackatars are deterministically generated and served from the API.',
  'admin.hack.tez', 'Initial creation'
)
WHERE NOT EXISTS (
  SELECT 1 FROM wiki_revisions WHERE article_id = COALESCE((SELECT id FROM ins), (SELECT id FROM wiki_articles WHERE slug = 'hackatar-architecture')) AND revision = 1
);

-- 12) Wiki Contribution Guide
WITH cat AS (SELECT id FROM wiki_categories WHERE slug = 'meta'),
ins AS (
  INSERT INTO wiki_articles (id, slug, title, content, markdown, summary, category_id, author, last_editor)
  VALUES (
    'art-wiki-contribution-guide', 'wiki-contribution-guide', 'Wiki Contribution Guide',
    $$# Wiki Contribution Guide

Anyone with a hack.tez domain can create and edit articles. There is no pre‑publish moderation queue — changes go live immediately unless a page has been locked.

## Workflow

1. Create a new article or edit an existing one.
2. Include a concise summary and relevant tags.
3. Link to primary sources where possible.
4. Keep changes incremental; prefer small, focused edits.

## Standards

- Keep content neutral and verifiable.
- Avoid shilling or non-factual claims.
- Prefer canonical docs over third-party blogs.

## Moderation

- Moderators can lock or archive pages in case of disputes or abuse. Locked pages remain visible but cannot be edited until unlocked.
- Admins can add/remove moderators.
- Persistent abuse may result in a soft ban. See the moderation dashboard for actions and audit log.

## Authentication

- To contribute, connect your wallet and sign the chat/auth challenge to receive a JWT. Your active hack.tez domain becomes your contributor identity.
$$,
    $$# Wiki Contribution Guide

Anyone with a hack.tez domain can create and edit articles. There is no pre‑publish moderation queue — changes go live immediately unless a page has been locked.

## Workflow

1. Create a new article or edit an existing one.
2. Include a concise summary and relevant tags.
3. Link to primary sources where possible.
4. Keep changes incremental; prefer small, focused edits.

## Standards

- Keep content neutral and verifiable.
- Avoid shilling or non-factual claims.
- Prefer canonical docs over third-party blogs.

## Moderation

- Moderators can lock or archive pages in case of disputes or abuse. Locked pages remain visible but cannot be edited until unlocked.
- Admins can add/remove moderators.
- Persistent abuse may result in a soft ban. See the moderation dashboard for actions and audit log.

## Authentication

- To contribute, connect your wallet and sign the chat/auth challenge to receive a JWT. Your active hack.tez domain becomes your contributor identity.
$$,
    'How hack.tez holders can propose, edit, and moderate wiki content.',
    (SELECT id FROM cat), 'admin.hack.tez', 'admin.hack.tez'
  ) ON CONFLICT (slug) DO NOTHING RETURNING id
)
INSERT INTO wiki_revisions (id, article_id, revision, title, content, markdown, summary, editor, edit_summary)
SELECT 'rev-wiki-contribution-guide-1',
  COALESCE((SELECT id FROM ins), (SELECT id FROM wiki_articles WHERE slug = 'wiki-contribution-guide')),
  1,
  'Wiki Contribution Guide',
  $$# Wiki Contribution Guide

Anyone with a hack.tez domain can create and edit articles. There is no pre‑publish moderation queue — changes go live immediately unless a page has been locked.

## Workflow

1. Create a new article or edit an existing one.
2. Include a concise summary and relevant tags.
3. Link to primary sources where possible.
4. Keep changes incremental; prefer small, focused edits.

## Standards

- Keep content neutral and verifiable.
- Avoid shilling or non-factual claims.
- Prefer canonical docs over third-party blogs.

## Moderation

- Moderators can lock or archive pages in case of disputes or abuse. Locked pages remain visible but cannot be edited until unlocked.
- Admins can add/remove moderators.
- Persistent abuse may result in a soft ban. See the moderation dashboard for actions and audit log.

## Authentication

- To contribute, connect your wallet and sign the chat/auth challenge to receive a JWT. Your active hack.tez domain becomes your contributor identity.
$$,
  $$# Wiki Contribution Guide

Anyone with a hack.tez domain can create and edit articles. There is no pre‑publish moderation queue — changes go live immediately unless a page has been locked.

## Workflow

1. Create a new article or edit an existing one.
2. Include a concise summary and relevant tags.
3. Link to primary sources where possible.
4. Keep changes incremental; prefer small, focused edits.

## Standards

- Keep content neutral and verifiable.
- Avoid shilling or non-factual claims.
- Prefer canonical docs over third-party blogs.

## Moderation

- Moderators can lock or archive pages in case of disputes or abuse. Locked pages remain visible but cannot be edited until unlocked.
- Admins can add/remove moderators.
- Persistent abuse may result in a soft ban. See the moderation dashboard for actions and audit log.

## Authentication

- To contribute, connect your wallet and sign the chat/auth challenge to receive a JWT. Your active hack.tez domain becomes your contributor identity.
$$,
  'How hack.tez holders can propose, edit, and moderate wiki content.',
  'admin.hack.tez', 'Initial creation'
)
WHERE NOT EXISTS (
  SELECT 1 FROM wiki_revisions WHERE article_id = COALESCE((SELECT id FROM ins), (SELECT id FROM wiki_articles WHERE slug = 'wiki-contribution-guide')) AND revision = 1
);

-- Article tags mapping
-- Tezos Overview
INSERT INTO wiki_article_tags (article_id, tag_id)
SELECT a.id, t.id FROM (SELECT id FROM wiki_articles WHERE slug = 'tezos-overview') a CROSS JOIN LATERAL (VALUES
  ('tezos'), ('overview'), ('accounts'), ('contracts'), ('fees')
) v(slug)
JOIN wiki_tags t ON t.slug = v.slug
ON CONFLICT DO NOTHING;

-- Wallets on Tezos
INSERT INTO wiki_article_tags (article_id, tag_id)
SELECT a.id, t.id FROM (SELECT id FROM wiki_articles WHERE slug = 'wallets-on-tezos') a CROSS JOIN LATERAL (VALUES
  ('wallets'), ('beacon'), ('temple'), ('kukai'), ('testnet')
) v(slug)
JOIN wiki_tags t ON t.slug = v.slug
ON CONFLICT DO NOTHING;

-- Tezos Domains and hack.tez
INSERT INTO wiki_article_tags (article_id, tag_id)
SELECT a.id, t.id FROM (SELECT id FROM wiki_articles WHERE slug = 'tezos-domains-and-hack-tez') a CROSS JOIN LATERAL (VALUES
  ('tezos-domains'), ('ted'), ('hack-tez'), ('naming')
) v(slug)
JOIN wiki_tags t ON t.slug = v.slug
ON CONFLICT DO NOTHING;

-- TED GraphQL Guide
INSERT INTO wiki_article_tags (article_id, tag_id)
SELECT a.id, t.id FROM (SELECT id FROM wiki_articles WHERE slug = 'ted-graphql-guide') a CROSS JOIN LATERAL (VALUES
  ('ted'), ('graphql'), ('domains')
) v(slug)
JOIN wiki_tags t ON t.slug = v.slug
ON CONFLICT DO NOTHING;

-- TzKT and Data Indexing
INSERT INTO wiki_article_tags (article_id, tag_id)
SELECT a.id, t.id FROM (SELECT id FROM wiki_articles WHERE slug = 'tzkt-and-data-indexing') a CROSS JOIN LATERAL (VALUES
  ('tzkt'), ('indexer'), ('analytics')
) v(slug)
JOIN wiki_tags t ON t.slug = v.slug
ON CONFLICT DO NOTHING;

-- Ghostnet vs Mainnet
INSERT INTO wiki_article_tags (article_id, tag_id)
SELECT a.id, t.id FROM (SELECT id FROM wiki_articles WHERE slug = 'ghostnet-vs-mainnet') a CROSS JOIN LATERAL (VALUES
  ('ghostnet'), ('mainnet'), ('networks'), ('rpc')
) v(slug)
JOIN wiki_tags t ON t.slug = v.slug
ON CONFLICT DO NOTHING;

-- SmartPy Quickstart
INSERT INTO wiki_article_tags (article_id, tag_id)
SELECT a.id, t.id FROM (SELECT id FROM wiki_articles WHERE slug = 'smartpy-quickstart') a CROSS JOIN LATERAL (VALUES
  ('smartpy'), ('contracts'), ('python')
) v(slug)
JOIN wiki_tags t ON t.slug = v.slug
ON CONFLICT DO NOTHING;

-- Taquito Quickstart
INSERT INTO wiki_article_tags (article_id, tag_id)
SELECT a.id, t.id FROM (SELECT id FROM wiki_articles WHERE slug = 'taquito-quickstart') a CROSS JOIN LATERAL (VALUES
  ('taquito'), ('typescript'), ('sdk')
) v(slug)
JOIN wiki_tags t ON t.slug = v.slug
ON CONFLICT DO NOTHING;

-- Octez Connect Integration
INSERT INTO wiki_article_tags (article_id, tag_id)
SELECT a.id, t.id FROM (SELECT id FROM wiki_articles WHERE slug = 'octez-connect-integration') a CROSS JOIN LATERAL (VALUES
  ('beacon'), ('octez-connect'), ('wallet'), ('dapp')
) v(slug)
JOIN wiki_tags t ON t.slug = v.slug
ON CONFLICT DO NOTHING;

-- Registrar Flow
INSERT INTO wiki_article_tags (article_id, tag_id)
SELECT a.id, t.id FROM (SELECT id FROM wiki_articles WHERE slug = 'registrar-flow') a CROSS JOIN LATERAL (VALUES
  ('registrar'), ('commit-reveal'), ('contracts')
) v(slug)
JOIN wiki_tags t ON t.slug = v.slug
ON CONFLICT DO NOTHING;

-- Hackatar Architecture
INSERT INTO wiki_article_tags (article_id, tag_id)
SELECT a.id, t.id FROM (SELECT id FROM wiki_articles WHERE slug = 'hackatar-architecture') a CROSS JOIN LATERAL (VALUES
  ('hackatar'), ('avatars'), ('generative'), ('gif')
) v(slug)
JOIN wiki_tags t ON t.slug = v.slug
ON CONFLICT DO NOTHING;

-- Wiki Contribution Guide
INSERT INTO wiki_article_tags (article_id, tag_id)
SELECT a.id, t.id FROM (SELECT id FROM wiki_articles WHERE slug = 'wiki-contribution-guide') a CROSS JOIN LATERAL (VALUES
  ('wiki'), ('contribution'), ('moderation')
) v(slug)
JOIN wiki_tags t ON t.slug = v.slug
ON CONFLICT DO NOTHING;

