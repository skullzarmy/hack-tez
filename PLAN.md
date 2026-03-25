# hack.tez — Free Subdomain Service

## Problem

Build a modern web frontend for the Tezos domain `hack.tez` that allows anyone with a Tezos wallet to:

1. **Claim** a free subdomain (e.g., `myname.hack.tez`)
2. **Manage** what address the subdomain points to
3. **Optionally set** an HTTP redirect at `[slug].hack.tez.page`

Hosted entirely on Netlify. Free for users — no tez charged.

---

## Anti-Gaming Rules

Instead of charging, we gate registrations with:

| Check | How | Why |
|---|---|---|
| **Wallet signature** | User signs a message via octez.connect | Proves wallet ownership |
| **Account revealed** | TzKT: `GET /v1/accounts/{addr}` → `revealed: true` | Account has made ≥1 on-chain op (costs gas, natural sybil cost) |
| **Account age ≥ 4 hours** | TzKT: `firstActivityTime` vs now | Prevents instant throwaway accounts |
| **Max 5 subdomains per wallet** | On-chain counter in registrar contract | Prevents hoarding |
| **User pays gas** (~0.01 tez) | User submits the on-chain tx | Natural economic sybil resistance |

---

## Architecture

### Stack

- **Frontend**: Vite + React + TypeScript (SPA)
- **Wallet**: `@tezos-x/octez.connect-sdk` (DAppClient) + `@taquito/taquito` (Wallet API)
- **Backend**: Netlify Functions (permit issuance, redirect storage)
- **Storage**: Netlify Blobs (redirect mappings) + on-chain (Tezos Domains)
- **Redirect Engine**: Netlify Edge Function (wildcard `*.hack.tez.page`)
- **On-chain**: SmartPy registrar contract (permit-gated `set_child_record`)
- **Network**: Env-toggled Mainnet / Ghostnet

### Smart Contract: HackTezRegistrar

A SmartPy contract deployed on Tezos that becomes the `owner` of the `hack.tez` forward record. This means the contract — not any human wallet — controls subdomain creation.

```
HackTezRegistrar contract storage:
  admin_public_key : key         # Server's public key (for permit verification)
  admin_address    : address     # Admin who can reclaim/update settings
  registrations    : big_map(address, nat)  # count per wallet (max 5)
  used_permits     : big_map(bytes, bool)   # replay protection
  name_registry    : address     # NameRegistry.SetChildRecord proxy address

Entrypoints:
  register(label: bytes, target_address: address, permit_sig: signature, expiry: timestamp)
    1. Verify expiry > now
    2. Pack (label, sender, target_address, expiry) → payload
    3. Check permit_sig against admin_public_key + payload hash
    4. Check permit not already used (replay protection)
    5. Check registrations[sender] < 5
    6. Call set_child_record on NameRegistry proxy:
       - label = label
       - parent = "hack.tez" (encoded bytes)
       - address = Some(target_address)
       - owner = sender  (buyer owns their subdomain!)
       - data = {}
       - expiry = None (inherits from hack.tez)
    7. Increment registrations[sender]
    8. Mark permit as used

  update_admin(new_key, new_address)        # admin only
  update_registry(new_address)              # admin only
  reclaim_ownership(new_owner)              # admin only — emergency escape hatch
  update_parent_record(address, data)       # admin only — change hack.tez resolution/data
  delegate_to_ted(delegate_address)         # admin only — delegate management wallet to TED
  transfer_domain(new_owner_address)        # admin only — transfer hack.tez to new address
```

### Signing Architecture: Permit Pattern

```
┌──────────┐    1. connect + sign message     ┌──────────────┐
│  Browser  │ ─────────────────────────────── │  User Wallet  │
│ (React)   │                                  └──────────────┘
│           │    2. POST /api/permit
│           │       { address, label, target,   ┌──────────────┐
│           │         walletSignature }    ───→  │  Netlify Fn   │
│           │                                    │  (permit.ts)  │
│           │    3. Returns { permitSig,         │               │
│           │       expiry }              ←───  │ Verifies:     │
│           │                                    │ - wallet sig  │
│           │    4. Submit tx to contract        │ - TzKT checks │
│           │       register(label, addr,        │ - signs permit│
│           │         permitSig, expiry)         └──────────────┘
│           │ ──────────────────────────────→ ┌──────────────┐
└──────────┘                                  │ HackTez      │
                                               │ Registrar    │
                                               │ (on-chain)   │
                                               │              │
                                               │ Verifies sig │
                                               │ Calls TED    │
                                               │ set_child_   │
                                               │ record       │
                                               └──────────────┘
```

**Key security property**: The server key (in Netlify env) can ONLY sign permits. Even if leaked:
- Attacker can create permits, but still needs a revealed 4hr+ wallet to use them
- hack.tez ownership lives in the contract, not the leaked key
- Admin can rotate the key via `update_admin`
- Contract has `reclaim_ownership` escape hatch

### Flow: Register a Subdomain

```
User connects wallet (octez.connect)
  → Searches for subdomain availability (GraphQL API)
  → Confirms registration
  → Signs message: "Register foo.hack.tez for tz1..."
  → Frontend calls POST /api/permit with { address, label, target, walletSig }
  → Netlify Function:
      1. Verifies wallet signature
      2. Checks TzKT: account revealed, age ≥ 4hrs
      3. Signs permit with server key → { permitSig, expiry }
  → Frontend submits tx to HackTezRegistrar.register()
      (user pays gas ~0.01 tez, wallet prompts for approval)
  → Contract verifies permit → calls set_child_record → done
  → Frontend polls for confirmation
```

### Flow: Manage Subdomain

```
User connects wallet
  → Dashboard shows their subdomains (GraphQL query by owner address)
  → User can:
      a) Update target address → calls update_record via Wallet API
         (user is the record owner, signs directly — no server needed)
      b) Set HTTP redirect URL → calls POST /api/set-redirect
         (stores in Netlify Blobs: key=subdomain, value=redirect URL)
```

### Flow: HTTP Redirect (*.hack.tez.page)

```
Visitor hits myname.hack.tez.page
  → Netlify Edge Function (wildcard route)
  → Extracts "myname" from hostname
  → Looks up redirect URL in Netlify Blobs
  → Returns 302 redirect (or a branded "not configured" page)
```

---

## Workplan

### Phase 0: Smart Contract
- [ ] Write HackTezRegistrar in SmartPy
- [ ] Unit test: permit verification, replay protection, registration limit
- [ ] Unit test: set_child_record call forwarding
- [ ] Deploy to Ghostnet for testing
- [ ] Transfer hack.tez record ownership to contract (Ghostnet first)

### Phase 1: Project Setup
- [ ] Create GitHub repository `skullzarmy/hack-tez`
- [ ] Initialize Vite + React + TypeScript project
- [ ] Install dependencies (@taquito/taquito, @tezos-x/octez.connect-sdk, @netlify/vite-plugin, @netlify/blobs, @netlify/functions)
- [ ] Configure netlify.toml (build, SPA redirects, headers)
- [ ] Set up env-toggled network config (Mainnet/Ghostnet)
- [ ] Generate admin keypair for permit signing

### Phase 2: Wallet Connection
- [ ] Create TezosContext provider (TezosToolkit + DAppClient)
- [ ] Build Connect Wallet button component (handles connect/disconnect)
- [ ] Display connected address and balance
- [ ] Show account eligibility status (revealed, age)

### Phase 3: Subdomain Search & Registration
- [ ] Build subdomain search UI (input + availability check)
- [ ] Implement GraphQL availability check (Tezos Domains API)
- [ ] Build registration flow UI (confirm + sign)
- [ ] Implement message signing via wallet
- [ ] Build `/api/permit` Netlify Function:
  - Verify wallet signature (proving ownership)
  - Check TzKT for revealed + age ≥ 4hrs
  - Sign permit with server key
  - Return { permitSig, expiry }
- [ ] Submit register() tx to HackTezRegistrar via Wallet API
- [ ] Handle confirmation polling and success/error states

### Phase 4: Subdomain Management Dashboard
- [ ] Build dashboard page (list user's subdomains)
- [ ] Query subdomains owned by connected address (GraphQL)
- [ ] Build "Update Address" UI (calls update_record via wallet)
- [ ] Build "Set Redirect URL" UI (calls /api/set-redirect)
- [ ] Build `/api/set-redirect` Netlify Function (stores in Blobs)

### Phase 5: HTTP Redirect Engine
- [ ] Build Edge Function for wildcard `*.hack.tez.page`
- [ ] Read redirect URL from Netlify Blobs
- [ ] Return 302 redirect or branded fallback page
- [ ] Build `/api/get-redirect` function (for dashboard display)

### Phase 6: Landing Page & Polish
- [ ] Design landing page (hero, features, how it works)
- [ ] Add responsive styling (Tailwind or CSS modules)
- [ ] Error handling and loading states throughout
- [ ] Mobile wallet support considerations
- [ ] Optional: donation button (simple tez transfer, no verification)

### Phase 7: Deployment & DNS
- [ ] Deploy to Netlify
- [ ] Configure custom domain hack.tez → Netlify
- [ ] Configure wildcard *.hack.tez.page (DNS + Netlify Pro SSL)
- [ ] Set environment variables (TEZOS_NETWORK, PERMIT_PRIVATE_KEY, contract addresses)
- [ ] Deploy contract to Mainnet
- [ ] Transfer hack.tez record ownership to Mainnet contract
- [ ] Smoke test end-to-end

---

## File Structure (Planned)

```
hack-tez/
├── contract/
│   ├── hack_tez_registrar.py    # SmartPy contract
│   └── tests/
│       └── test_registrar.py    # SmartPy tests
├── netlify.toml
├── netlify/
│   ├── functions/
│   │   ├── permit.ts            # Verify wallet + issue permit signature
│   │   ├── set-redirect.ts      # Store redirect URL in Blobs
│   │   ├── get-redirect.ts      # Read redirect URL
│   │   └── _shared/
│   │       ├── tzkt.ts          # TzKT API helpers (age, revealed checks)
│   │       └── permit-signer.ts # Server-side permit signing logic
│   └── edge-functions/
│       └── redirect.ts          # Wildcard *.hack.tez.page handler
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── config/
│   │   └── tezos.ts             # Network config, contract addresses
│   ├── context/
│   │   └── TezosContext.tsx      # Wallet + toolkit provider
│   ├── components/
│   │   ├── ConnectWallet.tsx
│   │   ├── SubdomainSearch.tsx
│   │   ├── RegisterFlow.tsx
│   │   ├── Dashboard.tsx
│   │   ├── UpdateAddress.tsx
│   │   └── SetRedirect.tsx
│   ├── hooks/
│   │   ├── useSubdomains.ts     # GraphQL query for user's subdomains
│   │   └── useEligibility.ts    # Check wallet age/revealed status
│   ├── lib/
│   │   ├── domains.ts           # GraphQL queries, name validation
│   │   ├── api.ts               # Fetch wrappers for Netlify Functions
│   │   └── contract.ts          # HackTezRegistrar interaction helpers
│   └── pages/
│       ├── Home.tsx
│       └── Manage.tsx
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
└── .env.example
```

---

## Key Contract Addresses (Reference)

### Tezos Domains — Mainnet
| Contract | Address |
|---|---|
| NameRegistry.SetChildRecord | `KT1QHLk1EMUA8BPH3FvRUeUmbTspmAhb7kpd` |
| NameRegistry.UpdateRecord | `KT1H1MqmUM4aK9i1833EBmYCCEfkbt6ZdSBc` |
| NameRegistry.ClaimReverseRecord | `KT1TnTr6b2YxSx2xUQ8Vz3MoWy771ta66yGx` |

### Tezos Domains — Ghostnet
| Contract | Address |
|---|---|
| NameRegistry.SetChildRecord | `KT1HpddfW7rX5aT2cTdsDaQZnH46bU7jQSTU` |
| NameRegistry.UpdateRecord | `KT1Ln4t64RdCG1bK8zkH6Xi4nNQVxz7qNgyj` |
| NameRegistry.ClaimReverseRecord | `KT1H19ouy5QwDBchKXcUw1QRFs5ZYyx1ezEJ` |

### HackTezRegistrar (TBD after deployment)
| Network | Address |
|---|---|
| Ghostnet | *deploy in Phase 0* |
| Mainnet | *deploy in Phase 7* |

---

## Notes

- **Free model**: No tez charged. User only pays gas (~0.01 tez per registration).
- **Subdomain ownership**: Registrants become the `owner` of their subdomain record. They can update the target address directly via their wallet (no server round-trip needed).
- **Subdomain expiry**: 3LD+ subdomains inherit the parent 2LD's expiry. If hack.tez itself expires, all subdomains break. Keep hack.tez renewed!
- **GraphQL rate limit**: Tezos Domains GraphQL API allows 100 req/min. Consider caching availability checks.
- **Netlify Pro required**: Wildcard SSL for `*.hack.tez.page` requires Netlify Pro plan.
- **Future monetization**: NFT-gated premium features (short names, custom redirects, vanity), optional donations. Not in scope for v1.
- **TzKT API**: Free tier is generous. Mainnet: `api.tzkt.io`, Ghostnet: `api.ghostnet.tzkt.io`.

## Security Mitigations (baked into plan)

- `/api/permit` rate-limited per address (1 req/min) and per IP (5 req/min)
- `/api/set-redirect` requires wallet signature + on-chain ownership verification via GraphQL
- Edge function uses `onError: "bypass"` to degrade gracefully on Blobs timeout
- Reserved names list for obvious squatting targets (admin, support, etc.)
- SmartPy skill saved locally for accurate contract syntax
