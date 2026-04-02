# Messaging Research — hack.tez

## Status: Tabled — revisit when Tezlink testnet is live (est. summer 2026)

---

## The Goal

Add connectivity/messaging to hack.tez domains. Users have on-chain identities (`alice.hack.tez`) — make those identities useful for communication. Handhold UX, seamless, feels like a feature not infrastructure.

---

## What We Explored & Why We Ruled It Out

### Nostr + NIP-05

**Idea:** Derive Nostr keypair, store pubkey in TED `data["nostr"]`, serve `/.well-known/nostr.json`, run a relay at `wss://relay.hack.tez`.

**Problem:** NIP-05 identifiers are web-domain-bound. `alice@hack.tez` would require serving from `https://hack.tez/` — `.tez` is not a real web TLD. The site is hosted at `hack.fafolab.xyz`, making the identifier `alice@hack.fafolab.xyz`, which breaks the whole premise. No workaround exists.

**Also ruled out:** Deriving a Nostr privkey from a wallet signature — a wallet signature is deterministic and replayable. Anyone who knows the signed message can reproduce the key. Not secure.

### XMTP

**Idea:** Wallet-native encrypted messaging. hack.tez → wallet address → XMTP inbox.

**Problem:** XMTP identity is built on EIP-191 Ethereum signatures. Tezos wallets use a different signing scheme entirely. No adapter exists, no prior art. Not compatible.

### Waku (Status protocol)

**Idea:** Decentralized p2p messaging, keypair-based identity, no domain dependency.

**Problem:** Less mature JS SDK, smaller ecosystem, still requires managing a separate keypair outside the Tezos wallet. Not compelling enough vs the complexity.

### Farcaster

**Idea:** Store Farcaster FID in TED data map, hack.tez as a discovery layer.

**Problem:** Farcaster is Ethereum-native. Getting a FID requires an ETH wallet. Not Tezos-native, round trip for users.

### On-chain L1 Inbox Contract

**Idea:** SmartPy companion contract — `send(to_label, encrypted_bytes)`, bigmap inbox keyed by hack.tez label, small XTZ spam fee to deter spam.

**Why we passed:** Viable but siloed — messages only between hack.tez users, no external reach. More importantly: with Tezlink a few months out, building on L1 now is a day late and a dollar short. Better primitives are coming.

---

## Where We Landed

Every mature decentralized messaging protocol has a hard dependency on one of:

- A real web domain (Nostr NIP-05, Matrix, ActivityPub)
- An Ethereum wallet (XMTP, PUSH Protocol, Lens)
- A separate keypair outside your existing wallet (Waku, raw libp2p)

**None are native to Tezos wallet identity.** No prior art exists for Tezos-native decentralized messaging. This is genuinely unsolved territory.

---

## The Bet: Wait for Tezlink

**Tezlink** is a Tezos L2 Smart Rollup with:

- Sub-500ms block latency (vs 6s on L1)
- Same Michelson/SmartPy/LIGO toolchain
- TzKT explorer compatibility
- Security inherited from Tezos L1
- **Atomic composability with Etherlink (EVM rollup) — coming soon**

The **Etherlink composability** is the key unlock. When a Tezos wallet can make atomic calls into an EVM rollup, XMTP and other EVM-native messaging protocols become reachable without users needing a separate ETH wallet.

Tezlink testnet estimated **summer 2026** (confirmed at TezDev).

---

## Ideas to Revisit When Tezlink Lands

**1. Purpose-built messaging rollup on Tezlink**
A dedicated rollup where hack.tez domain identity is the auth layer. First-of-kind. TED records are the address book. Messages stored on the rollup, not L1. Sub-500ms delivery.

**2. Etherlink bridge to XMTP**
If Tezlink → Etherlink atomic calls work cleanly, a Tezos wallet could authenticate to XMTP via the EVM bridge. hack.tez domains remain the human-readable identity on top.

**3. Nostr revisited**
If Tezlink enables a rollup with its own resolvable domain layer, `alice@<that-domain>` becomes possible. Long shot but worth watching.

---

## Checklist for When Tezlink Testnet Drops

- [ ] Get on the testnet early — map what a messaging contract costs/feels like at sub-500ms
- [ ] Verify whether TED domain records (`alice.hack.tez`) are accessible from Tezlink L2
- [ ] Determine if Etherlink atomic composability is production-ready
- [ ] Evaluate purpose-built messaging rollup feasibility vs bridging to existing EVM protocols
- [ ] Revisit XMTP if Etherlink auth bridge is viable
- [ ] Check if any Tezos-native messaging tooling has emerged in the ecosystem
