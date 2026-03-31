# Skill: Taquito v24.2.0 Quick Start

```yaml
skill_type: hybrid
domain: Tezos blockchain development / TypeScript-JavaScript SDK
version: 1.0
```

## Overview

Taquito v24.2.0 is the canonical TypeScript/JavaScript SDK for interacting with the Tezos blockchain. It exposes two parallel APIs — the **Contract API** (`Tezos.contract`) and the **Wallet API** (`Tezos.wallet`) — that cover balance queries, tez transfers, and smart contract interactions. Both follow an async/await pattern with confirmation polling. This skill covers full Quick Start scope: installation, toolkit setup, signer configuration, core operations, and relevant edge cases.

---

## Installation & Setup

### 1. Install the package

```bash
npm install @taquito/taquito
```

### 2. Import and instantiate TezosToolkit

```typescript
import { TezosToolkit } from '@taquito/taquito';

const Tezos = new TezosToolkit('https://ghostnet.ecadinfra.com');
```

**TezosToolkit constructor** accepts either:
- A plain RPC URL string (most common)
- An `RpcClient` object (for advanced configuration)

### 3. RPC URL selection

| Network  | Example RPC URL                        |
|----------|----------------------------------------|
| Ghostnet | `https://ghostnet.ecadinfra.com`       |
| Mainnet  | Use a trusted public or private node   |

A full list of public RPC nodes is maintained in the Taquito documentation.

### 4. Toolkit instance management

> **Recommended practice:** Create a single `TezosToolkit` instance and distribute it via your application's state management layer. Multiple instances are permitted (e.g., different RPC nodes or signer configs per instance) but require discipline to avoid confusion.

---

## Signer Configuration

A signer **must** be configured before any operation that injects data into the blockchain. Read-only operations (e.g., balance queries) do **not** require a signer.

Signer is always set via:

```typescript
Tezos.setProvider({ signer: <signerInstance> });
```

### Option A — InMemorySigner (development / testing only)

```bash
npm install @taquito/signer
```

```typescript
import { InMemorySigner, importKey } from '@taquito/signer';

// From a raw private key
Tezos.setProvider({
  signer: await InMemorySigner.fromSecretKey('edsk...')
});

// Or using the importKey helper (e.g., from a faucet JSON)
await importKey(
  Tezos,
  'email@example.com',
  'password',
  'mnemonic words here',
  'activation-code'
);
```

> ⚠️ **Security warning:** `InMemorySigner` stores private keys in process memory. It is **explicitly unsuitable for production** use with real-value tokens. Use only on testnets or in sandboxed environments.

### Option B — RemoteSigner (production-grade)

```bash
npm install @taquito/remote-signer
```

```typescript
import { RemoteSigner } from '@taquito/remote-signer';

const requestHeaders: { [key: string]: string } = {
  'api-key': 'your-api-key'
};

Tezos.setProvider({
  signer: new RemoteSigner(pkh, 'https://your-remote-signer-url/', {
    headers: requestHeaders
  })
});
```

`RemoteSigner` delegates signing to an external service (e.g., one backed by an HSM), keeping private keys off the application host.

### Option C — WalletProvider (browser dApps)

For browser-based dApps, use a `WalletProvider` (e.g., Beacon, Temple, Kukai). The Wallet API (`Tezos.wallet`) is the appropriate interface when using this option. Refer to the Taquito Wallet API documentation for wallet-specific setup.

---

## Reading Chain State

### Query an account balance

No signer required.

```typescript
const balance = await Tezos.tz.getBalance('tz1...');
console.log(balance.toNumber() / 1_000_000, 'tez');
```

> **Unit note:** `getBalance` returns the balance in **mutez** (1 tez = 1,000,000 mutez). Always divide by `1_000_000` before displaying to users. See [Unit Conversion Reference](#unit-conversion-reference).

**What to expect:** Returns a `BigNumber` instance. Call `.toNumber()` or `.toString()` as needed.

---

## Tez Transfers — Contract API

Use `Tezos.contract` when you control the private key directly (InMemorySigner or RemoteSigner).

```typescript
try {
  const operation = await Tezos.contract.transfer({
    to: 'tz1RecipientAddress...',
    amount: 1   // in whole tez
  });

  console.log('Operation hash:', operation.hash);

  const hash = await operation.confirmation(1);
  console.log('Confirmed! Block hash:', hash);
  console.log(`Explorer: https://ghostnet.tzkt.io/${operation.hash}/operations`);

} catch (error) {
  console.error(JSON.stringify(error, null, 2));
}
```

**Key properties:**
| Property | Value |
|---|---|
| Operation hash | `operation.hash` |
| Confirmation return | `await operation.confirmation(1)` → returns hash directly (string) |
| Amount unit | Whole tez (not mutez) |

---

## Tez Transfers — Wallet API

Use `Tezos.wallet` when signing is delegated to a browser wallet (e.g., Temple, Kukai).

```typescript
try {
  const operation = await Tezos.wallet
    .transfer({ to: 'tz1RecipientAddress...', amount: 1 })
    .send();

  console.log('Operation hash:', operation.opHash);

  const confirmation = await operation.confirmation(1);
  console.log('Confirmed in block:', confirmation.block.hash);
  console.log(`Explorer: https://ghostnet.tzkt.io/${operation.opHash}/operations`);

} catch (error) {
  console.error(JSON.stringify(error, null, 2));
}
```

**Key properties:**
| Property | Value |
|---|---|
| Operation hash | `operation.opHash` |
| `.send()` required | Yes — Wallet API requires explicit `.send()` call |
| Confirmation return | `await operation.confirmation(1)` → returns a **confirmation object** |
| Block hash from confirmation | `confirmation.block.hash` |

---

## Smart Contract Calls — Contract API

### Step-by-step

1. Resolve the contract instance at its KT1 address
2. Access an entrypoint via `methodsObject`
3. Call `.send()` to inject the operation
4. Poll for confirmation

```typescript
try {
  const contract = await Tezos.contract.at('KT1BJadpDyLCACMH7Tt9xtpx4dQZVKw9cDF7');

  const operation = await contract.methodsObject.increment(7).send();

  console.log('Operation hash:', operation.hash);

  const hash = await operation.confirmation(1);
  console.log('Confirmed:', hash);
  console.log(`Explorer: https://ghostnet.tzkt.io/${operation.hash}/operations`);

} catch (error) {
  console.error(JSON.stringify(error, null, 2));
}
```

**What to expect:** `contract.methodsObject` is dynamically populated from the contract's on-chain type information. Entrypoint names match those defined in the contract's Michelson interface.

---

## Smart Contract Calls — Wallet API

```typescript
try {
  const contract = await Tezos.wallet.at('KT1BJadpDyLCACMH7Tt9xtpx4dQZVKw9cDF7');

  const operation = await contract.methodsObject.increment(7).send();

  console.log('Operation hash:', operation.opHash);

  const confirmation = await operation.confirmation(1);
  console.log('Confirmed in block:', confirmation.block.hash);
  console.log(`Explorer: https://ghostnet.tzkt.io/${operation.opHash}/operations`);

} catch (error) {
  console.error(JSON.stringify(error, null, 2));
}
```

**What to expect:** The wallet prompt appears in the user's browser extension before the operation is injected. The flow resumes once the user approves.

---

## Contract API vs Wallet API — Comparison Table

| Dimension | Contract API (`Tezos.contract`) | Wallet API (`Tezos.wallet`) |
|---|---|---|
| Entry point | `Tezos.contract.transfer(...)` | `Tezos.wallet.transfer(...).send()` |
| Explicit `.send()` | Not required for transfers | **Required** on all operations |
| Contract resolution | `Tezos.contract.at(KT1...)` | `Tezos.wallet.at(KT1...)` |
| Operation hash property | `operation.hash` | `operation.opHash` |
| `confirmation(n)` return type | Hash string directly | Confirmation object |
| Block hash from confirmation | N/A (hash is returned directly) | `confirmation.block.hash` |
| Typical signer | InMemorySigner / RemoteSigner | WalletProvider (browser wallet) |
| Use case | Server-side, scripts, bots | Browser dApps with user wallets |

---

## Unit Conversion Reference

| Unit | Relationship | When used |
|---|---|---|
| **mutez** | 1 tez = 1,000,000 mutez | `getBalance` return value |
| **tez** | Base display unit | `transfer({ amount })` parameter |

```typescript
// mutez → tez (for display)
const tez = balance.toNumber() / 1_000_000;

// tez → mutez (if needed for low-level APIs)
const mutez = tezAmount * 1_000_000;
```

---

## Error Handling Patterns

Always wrap operations in `try/catch`. Tezos operation errors are structured objects — use `JSON.stringify` to surface their full content:

```typescript
try {
  const operation = await Tezos.contract.transfer({ to: '...', amount: 1 });
  await operation.confirmation(1);
} catch (error) {
  // Structured Tezos errors lose detail with .toString()
  console.error(JSON.stringify(error, null, 2));
}
```

**Common failure points:**
- Insufficient balance for transfer + fees
- No signer configured before an injecting operation
- Invalid KT1 or tz1 address format
- RPC node timeout or returning stale state
- Contract entrypoint argument type mismatch

---

## Testnet Resources

| Resource | URL |
|---|---|
| Ghostnet faucet (get test tez) | https://teztnets.com/ |
| Ghostnet block explorer | https://ghostnet.tzkt.io/ |
| Example contract (Ghostnet) | `KT1BJadpDyLCACMH7Tt9xtpx4dQZVKw9cDF7` |

**Funding a testnet account:**
1. Visit https://teztnets.com/
2. Select Ghostnet
3. Submit your `tz1...` address to receive test tez

**Verifying an operation:**
```
https://ghostnet.tzkt.io/<operation-hash>/operations
```

---

## Multi-Instance TezosToolkit Patterns

Multiple `TezosToolkit` instances are valid and useful for:
- Targeting different RPC nodes simultaneously (e.g., fallback logic)
- Using different signers for different accounts in the same application
- Separating read-only queries from write operations

```typescript
const readonlyTezos = new TezosToolkit('https://ghostnet.ecadinfra.com');
const signingTezos  = new TezosToolkit('https://ghostnet.ecadinfra.com');

signingTezos.setProvider({
  signer: await InMemorySigner.fromSecretKey('edsk...')
});
```

> Use dependency injection or a context/store pattern to avoid passing instances across component boundaries ad hoc.

---

## Boilerplate Templates

Taquito ships starter templates for common frontend frameworks:

| Framework | Availability |
|---|---|
| React | ✅ Available |
| Vue | ✅ Available |

Templates include TezosToolkit instantiation, wallet connection, and example contract calls pre-wired.

---

## Caveats & Limitations

1. **InMemorySigner is not production-safe.** It holds private keys in process memory. Any use with real-value tokens on Mainnet is strongly discouraged. Use `RemoteSigner` (backed by HSM) or a `WalletProvider` instead.

2. **A signer must be configured before injecting operations.** Read-only calls (`getBalance`, `contract.at` for inspection) work without a signer; transfer and contract-call operations will throw if none is set.

3. **Contract API and Wallet API are not interchangeable.** They differ in method chaining (`.send()` requirement), hash property names (`hash` vs `opHash`), and the shape of the value returned by `confirmation()`. Mixing them inadvertently causes silent bugs.

4. **`transfer({ amount })` takes whole tez, not mutez.** `getBalance` returns mutez. Failure to convert causes 1,000,000× over/under-payment errors.

5. **`confirmation(n)` depth matters.** `n=1` is sufficient for testnets and low-stakes ops; for Mainnet finality guarantees, consider a higher value (e.g., `n=3` or more).

6. **RPC node reliability is external.** Public nodes can be overloaded or return stale data. For production, use a private or dedicated RPC endpoint.

7. **This skill is scoped to the Quick Start page only.** Advanced Taquito topics — batch operations, FA2 tokens, BigMap queries, Sapling, Lambda views, origination with initial storage, etc. — are documented in separate sections not covered here.

8. **Version specificity.** This document reflects Taquito `24.2.0`. Prior versions (`24.1.0`, `24.0.0`, `23.x`) may differ in API surface. Always confirm the installed package version matches this skill.