# tezosx-resolve — Requirements

Status: DRAFT for Joe's review. No implementation begins until this document is approved.
Working name: `tezosx-resolve` (neutral; npm availability to be verified at publish time). Steward: hack.tez / FAFOlab. License: MIT.

## Purpose

The reference TypeScript library for name and identity resolution on Tezos X: given a name or address, produce the identity's addresses on both interfaces with explicit provenance, correctly and identically everywhere it runs. Built to be adopted by Tezos Domains (TED) when they arrive on Tezos X, and free for any wallet, indexer, explorer, or dApp to use. The library is the executable form of a written spec; the spec, its test vectors, and the code ship together and never disagree.

## Goals

1. Deterministic alias derivation both directions, byte-exact with the chain.
2. Name resolution with defined, documented precedence semantics.
3. Provenance on every result: a consumer always knows whether an address was declared, derived, or native input.
4. Adoptable by TED with zero rework: neutral naming, MIT, pluggable data sources, no hack.tez coupling in the core.
5. Survive the network's churn: kernel upgrades and network resets must be detected, not absorbed silently.

## Non-goals (v1)

- Reverse resolution (0x → name). The alias functions are one-way hashes; reversal requires an index. Documented as out of scope, with the extension point named.
- Registration, records writing, or any transaction construction. Read-only.
- Non-TypeScript implementations. The spec and vectors are written so others can conform; we ship TS only.
- On-chain resolver contracts (that is phase 3 of the broader plan, a separate work).

## Architecture

Three layers, strictly separated:

| Layer | Contents | I/O | Dependencies |
|---|---|---|---|
| `core` | classify, validate, derive (tz→0x, 0x→KT1), vendored keccak-256 / blake2b-160 / base58check | none | zero |
| `resolve` | name→identity pipeline, precedence rule, provenance types, error taxonomy | via injected `Source` | core only |
| `chain` | materialization checks, balance queries, precompile verification (when ABI exists) | fetch, injectable endpoints | core only |

A consumer can import `core` alone and get pure functions with no runtime dependencies at all.

## Functional requirements

### Core

- R1. Classify any input string as `tz` (tz1/tz2/tz3), `kt1`, `evm`, or `invalid`, with base58 checksum validation for Tezos forms and length/hex validation for EVM forms.
- R2. Derive the EVM alias of any valid Tezos address: `keccak256(utf8(base58check_string))[0:20]`, lowercase 0x output. Input is used exactly as written after trim; the spec defines whether derivation is case-normalized (it is not: base58 is case-sensitive by construction).
- R3. Derive the Michelson alias of any valid EVM address: `KT1(blake2b_160(address_bytes))`, parsing hex case-insensitively.
- R4. Vendored primitives (keccak-256, blake2b-160, base58check + KT1 prefix) with no runtime dependency, each validated against published vectors and differentially tested in CI (see audits).
- R5. tz4 (BLS) addresses: explicitly rejected with a distinct error until the network defines their aliasing; the spec records this as an open question with a tracking link.
- R6. All functions total over strings: any input produces a typed result or a typed error, never a throw from deep inside a primitive.

### Resolution

- R7. `Source` interface: `resolveName(name) → { address: tz | null, records: Map<string,string> }`. Shipped implementations: TED GraphQL (configurable endpoint) and a static/in-memory source for tests. TED on-chain views become a third implementation later without API change.
- R8. Precedence for a name's EVM address: a declared `etherlink:address` record that validates as an EVM address wins; otherwise the derived alias of the resolved tz address. Invalid declared records are reported as a warning in the result, never silently ignored.
- R9. Every resolved address carries provenance: `"declared" | "derived" | "native"`, plus the record key it came from when declared.
- R10. Name handling: full names and labels accepted per configured parent domain (e.g. `.hack.tez`); the parent is configuration, not a constant — TED must be able to use this for `.tez` directly.
- R11. Error taxonomy: `InvalidInput`, `NameNotFound`, `NoAddressSet`, `SourceUnavailable`, `ChainUnavailable` — machine-distinguishable, each carrying the failing input.

### Chain layer

- R12. Materialization check per interface via injectable endpoints (EVM JSON-RPC, TzKT-compatible REST). No endpoint, chain ID, or rollup address is hardcoded in `core` or `resolve`; `chain` ships previewnet defaults clearly marked as defaults.
- R13. Precision utilities: mutez (6) vs wei-of-tez (18) formatting and the 10^12 truncation predicate.
- R14. Precompile verification (`originOf`, `resolveAddress` at `0xff…07`) lands as soon as an ABI is published, behind the same interface as R12 so consumers upgrade without code changes. Blocked-on-upstream; not a v1.0 gate.

## Non-functional requirements

- N1. Test vectors ship as a language-agnostic JSON fixture file: inputs, expected classifications, expected derivations, expected precedence outcomes, including every adversarial case found during audits. The vector file is versioned and is itself part of the public spec.
- N2. The spec (`SPEC.md`) is a standalone normative document: someone implementing in Rust conforms using the spec and vectors alone.
- N3. Dual ESM/CJS builds, browser + Node ≥ 18, no DOM assumptions in any layer, `fetch` injectable for exotic runtimes.
- N4. 100% branch coverage on `core`; property-based tests (round-trips, malformed unicode, oversized inputs, mixed case) alongside the fixed vectors.
- N5. Supply chain: zero runtime dependencies in all layers; dev dependencies pinned; CI runs on GitHub Actions; releases tagged, signed, and published with provenance.
- N6. Semver with a written stability policy: derivation outputs are covered by semver — a change in any derived address for a valid input is a breaking change, full stop.
- N7. Docs: README quick start, generated API docs, and the SPEC. hack.tez's own `src/lib/xray` becomes a consumer of this package once published (dogfood requirement).

## Adversarial audit and review stages

Each stage produces a written findings document in the repo (`audits/`), findings mapped to requirement IDs, and has explicit exit criteria. No stage is skipped; later stages do not start until the prior stage's blocking findings are resolved.

- **A. Spec red-team** (before any code). Fresh-context adversarial review of SPEC.md draft with an attacker brief: homoglyph and unicode names, case-mutation attacks on both address forms, KT1-as-input aliasing questions, tz4 handling, garbage and malicious TED record values, precision-truncation abuse, provenance-spoofing scenarios. Exit: all findings resolved in the spec or explicitly accepted with rationale.
- **B. Differential crypto audit** (after core). Vendored keccak/blake2b/base58 differentially tested in CI against at least two independent implementations each (dev-deps only), across random inputs (10^5+ per primitive) plus edge lengths (0, 1, rate-boundary, rate±1, large). Exit: zero divergence; the differential suite becomes a permanent CI job.
- **C. Independent adversarial code reviews** (after resolve + chain). Two separate fresh-context reviews with different briefs: one hunting logic and semantics bugs against the spec, one hunting the code itself (error paths, injection via names into URLs/GraphQL, DoS via pathological input, prototype pollution, unsafe defaults). Findings filed as issues. Exit: all high/medium findings fixed with regression vectors added to N1.
- **D. Public review window** (release candidate). Published repo, announcement to TED people and Tezos dev Discord/Agora, minimum two weeks, all API-affecting feedback triaged before v1.0. Exit: window elapsed and triage complete.
- **E. Live conformance harness** (ongoing, post-v1.0). A scheduled job derives aliases for known accounts and compares against chain-observed reality on previewnet (and successors), so a kernel release that changes semantics pages us before it bites a consumer. Failures open issues automatically.

## Milestones

1. **M0** — SPEC.md draft + initial vector file. → Stage A.
2. **M1** — `core` implemented against the post-audit spec. → Stage B.
3. **M2** — `resolve` + `chain`, hack.tez xray lib migrated in a branch as the first consumer. → Stage C.
4. **M3** — docs, CI, packaging, release candidate. → Stage D.
5. **v1.0** — publish with provenance; stand up Stage E harness; open the TED conversation with the finished artifact.

## Risks

- Alias formulas change in a kernel release: caught by Stage E; semver policy N6 governs the response; spec carries a network-version applicability note.
- Precompile ABI never published or published incompatibly: R14 is deliberately not a v1.0 gate.
- npm name availability: fallbacks decided at M3, neutrality principle holds.
- TED indifference: the library is useful to wallets and indexers regardless; adoption pitch is phase 3's concern, not a v1.0 dependency.

## Open questions for review

1. Should the TED GraphQL source ship in v1, or is a static source enough with GraphQL as v1.1? (Current draft: ship it, it is the semantics carrier.)
2. Repo name = package name (`tezosx-resolve`) or repo `tezosx-resolve` with scoped package later if npm squatted?
3. Does Stage D warrant a small bounty, or is review-window-plus-credits sufficient at this scale?
