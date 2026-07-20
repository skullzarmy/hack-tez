# X-Ray: hack.tez on Tezos X

Working vision, 2026-07-20. Three phases. Phases 1 and 2 ship now; phase 3 is the goal we build toward.

## The landscape

Tezos X (previewnet, experimental) is one chain with two interfaces: EVM (formerly Etherlink) and Michelson (formerly Tezlink), with native atomic composability between them. Every user ends up with up to four addresses: a native tz, a native 0x, and a deterministic alias on each opposite interface. The alias math:

```
evm_alias = keccak256(utf8(tz_address_base58check))[0:20]
kt1_alias = KT1(blake2b_160(evm_address_bytes))
```

Aliases can be *derived* (computable, no account on chain) or *materialized* (account exists). Sending value to a derived alias without materializing it is the network's first foot-gun. The docs explicitly note that no wallet or indexer presents a unified view. Tezos Domains (TED) is not deployed on Tezos X; no name resolution exists there at all.

We do not operate a registrar. hack.tez names are TED subdomains: the name-to-address truth lives in TED's NameRegistry on Tezos L1, and we drive issuance for the hack.tez subtree through TED's proxy contracts. Any plan that pretends we own the root is wrong. The play is resolution semantics and tooling, not registry authority.

## Phase 1 — X-Ray, the lab (ships now)

A read-only lab at `/labs/x-ray`. Paste any tz1/tz2/tz3/KT1/0x address or hack.tez name and see the full identity square:

- All four addresses, computed client-side (vendored keccak-256, blakejs, taquito b58).
- Live balances from both sides: TzKT previewnet for Michelson, `eth_getBalance` on the EVM RPC.
- Verification against the chain via the resolver precompile (`0xff…07`): `originOf` classifies native/alias, `resolveAddress` reports materialized vs derived. Our math, confirmed on-chain, via read-only `eth_call` — no wallet needed.
- Correct formatting on both sides (mutez 6 decimals vs wei-of-tez 18, 10^12 scaling, truncation warnings).
- Links into TzKT, Blockscout, and the experimental unified explorer.

Infra: none. Static frontend, public Nomadic endpoints. Degrades to computed-only mode if endpoints are unreachable.

## Phase 2 — resolution API (ships with phase 1)

`GET /api/v1/tezosx/:nameOrAddress` on the existing hack.tez API. Input: a hack.tez name (label or full), or any tz/0x address. Output: the address square plus materialized flags.

Resolution semantics (the part worth being first on):

1. If input is a name, resolve name → tz via TED data on L1 (as the existing API already does).
2. The EVM address for a tz identity is the **declared record if present, else the derived alias**. TED's schema already reserves `etherlink:address`; a correct resolver honors an explicit record over the derived fallback. We implement that precedence now, so the reference behavior exists before anyone else defines it.

Infra: one route on a function we already run. Marginal cost ~zero.

Together, phases 1 and 2 make hack.tez names resolve on Tezos X today, without deploying anything and without claiming anything that isn't ours.

## Phase 3 — the TED play (the goal)

TED's position: they own naming on Tezos, they have an EVM-address record key already, and deploying to a new network takes engineering they must fund through a DAO that moves slowly. Starting from scratch on Tezos X is a big ask of that DAO.

Our position after phases 1 and 2: a working resolver with defined semantics, a live API, a tool people use, and the reference doc (`tezos-x` skill) that builders read. Battle-tested against every previewnet reset.

The play: **arrive with it done.** Build the on-chain piece as a working system on previewnet, then bring it to the TED DAO as a finished contribution rather than a funding request:

- A Michelson registry/resolver contract on Tezos X exposing resolve views, designed so **EVM contracts resolve names natively** through the NAC gateway (Solidity staticcall → gateway → Michelson view). One deploy serves both ecosystems. This is the piece nobody else has even sketched.
- A sync path from L1 TED records to the Tezos X mirror (scheduled push to start; whatever TED prefers long-term).
- Scripted deterministic deploys, so previewnet resets are a non-event: redeploy in minutes, every time. By the time mainnet conversations happen, the thing has survived a dozen resets.
- Scoped honestly: we prove it on the hack.tez subtree first (member perk: "hack.tez members resolve on Tezos X first"), with the architecture written for the full namespace.

The DAO pitch writes itself: adopt a working, tested Tezos X deployment path for TED, contributed by an ecosystem partner who already runs it, versus fund and design one from zero. Cheaper, faster, de-risked, and it keeps naming continuous for both Tezos users and incoming EVM users. We're not competing with TED; we're handing them their Tezos X story.

What we get: spec influence (our resolution semantics become the semantics), first-mover identity tooling, member perks, and the standing that comes from being the contributor who solved it.

## Costs and risks

- Phase 1: $0 infra. Risk: Nomadic endpoint availability/CORS → computed-only fallback.
- Phase 2: ~$0 (existing function). Risk: none meaningful.
- Phase 3: faucet tez is free; real cost is a deploy script, a sync job on existing bot/schedule infra, and maintenance attention. On an eventual mainnet, storage burn means real tez per record; funding is part of the DAO conversation, from incumbency.
- Cross-phase: alias derivation could change in a kernel release (formulas live in one lib + the skill; single patch point). Chain IDs and rollup address change every reset (never hardcode; fetch live).

## Groundwork checklist (what phases 1+2 must leave behind)

- [x] Alias math in one shared lib (`src/lib/xray/`), usable by frontend and netlify functions, keccak verified against published vectors, KT1 encoding validated via taquito.
- [ ] Precompile call encoding (`originOf`, `resolveAddress`) as reusable helpers — blocked on a published ABI; v1 determines materialization via direct account-existence checks instead.
- [x] Resolution precedence (declared `etherlink:address` record over derived alias) implemented in `/api/v1/tezosx` and documented there.
- [x] API endpoint live: `GET /api/v1/tezosx/:nameOrAddress`.
- [x] tezos-x skill current with last_verified dating.
