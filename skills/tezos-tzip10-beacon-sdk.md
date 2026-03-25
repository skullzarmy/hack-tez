# Skill: octez.connect SDK — Tezos Wallet Interaction (tzip-10)

```yaml
skill_type: hybrid
domain: Tezos blockchain / dApp & wallet development
version: 1.0
```

## Overview: What is octez.connect and tzip-10

**octez.connect** is a TypeScript SDK that implements the **tzip-10 wallet interaction standard** for the Tezos blockchain. It enables decentralised applications (dApps) and wallets to communicate securely over multiple transport layers (P2P, browser extension, mobile deep-link) without a centralised relay.

| Property | Value |
|---|---|
| npm package | `@tezos-x/octez.connect-sdk` |
| GitHub | https://github.com/trilitech/octez.connect |
| Docs | https://octez-connect.tezos.com |
| License | MIT |
| Language | TypeScript (95%), CSS (3.6%), JS (1.1%) |
| Maintained by | Trilitech (fork of `airgap-it/beacon-sdk`) |
| Initial release | February 13, 2026 |

**tzip-10** is the Tezos improvement proposal that standardises the handshake, pairing, and message-passing protocol between a dApp and a Tezos wallet. The SDK abstracts this protocol into two primary client classes:

- **`DAppClient`** — used in frontend applications to request permissions and send operations to a connected wallet.
- **`WalletClient`** — used inside wallet implementations to receive and respond to messages from dApps.

> **When to use this SDK directly vs. Octez.js + BeaconWallet:** For simple permission requests and account reading, use `DAppClient` directly. For complex smart-contract interactions (calling entrypoints, estimating fees, batch operations), prefer **Octez.js** with its `BeaconWallet` class, which wraps this SDK with higher-level contract helpers.

---

## Installation

```bash
npm i --save @tezos-x/octez.connect-sdk
```

TypeScript import:

```typescript
import {
  DAppClient,
  WalletClient,
  BeaconEvent,
  BeaconMessageType,
  PermissionScope,
  Network,
  NetworkType,
} from '@tezos-x/octez.connect-sdk';
```

**Prerequisites:**
- Node.js and npm installed
- TypeScript project (the SDK is TypeScript-first; type definitions are bundled)
- Basic familiarity with Tezos accounts, public keys, and network identifiers
- `async`/`await` patterns in TypeScript/JavaScript

---

## DApp Integration

### 1. Instantiate DAppClient

The minimum required option is `name` — this string is shown to the user in the wallet pairing UI.

```typescript
const dAppClient = new DAppClient({ name: 'My Tezos dApp' });
```

Extended options (all optional beyond `name`):

```typescript
const dAppClient = new DAppClient({
  name: 'My Tezos dApp',
  // Additional options available — see octez-connect.tezos.com for full API
});
```

### 2. Subscribe to Active Account Changes

Register an event listener **before** requesting permissions. The callback fires whenever the connected account changes (initial connection, wallet switch, disconnect).

```typescript
dAppClient.subscribeToEvent(
  BeaconEvent.ACTIVE_ACCOUNT_SET,
  async (account) => {
    if (account) {
      console.log('Active account:', account.address);
    } else {
      console.log('Wallet disconnected');
    }
  }
);
```

### 3. Request Permissions

`requestPermissions()` is async and opens the wallet pairing/approval UI. On success it returns an object that includes at minimum an `address` field (the user's Tezos address).

```typescript
try {
  const permissions = await dAppClient.requestPermissions();
  console.log('Connected address:', permissions.address);
} catch (error) {
  console.error('Permission request failed or was rejected:', error);
}
```

**What to expect:**
- If no wallet is paired, the SDK displays a QR code or wallet-selector modal for pairing.
- If a wallet is already paired, the request is forwarded directly and the wallet prompts the user to approve.
- The resolved object contains `address`, `publicKey`, `network`, and granted `scopes`.

### 4. Full Minimal DApp Example

```typescript
import { DAppClient, BeaconEvent } from '@tezos-x/octez.connect-sdk';

const client = new DAppClient({ name: 'My dApp' });

client.subscribeToEvent(BeaconEvent.ACTIVE_ACCOUNT_SET, async (account) => {
  console.log('Account set:', account?.address ?? 'none');
});

document.getElementById('connectBtn')!.addEventListener('click', async () => {
  const permissions = await client.requestPermissions();
  console.log('Granted to address:', permissions.address);
});
```

---

## Wallet Integration

### 1. Instantiate WalletClient

```typescript
const walletClient = new WalletClient({ name: 'My Tezos Wallet' });
```

### 2. Initialise the Client

`init()` must be called before `connect()`. It establishes the P2P transport connection and prepares the client to receive incoming messages.

```typescript
await walletClient.init();
```

### 3. Connect and Handle Incoming Messages

`connect(messageHandler)` takes an **async callback** that is invoked for every incoming `BeaconMessage`. A production wallet must handle all `BeaconMessageType` variants (see reference below).

```typescript
await walletClient.connect(async (message) => {
  console.log('Received message type:', message.type);

  if (message.type === BeaconMessageType.PermissionRequest) {
    // Handle permission request — see workflow below
  }

  // Handle other message types (OperationRequest, SignPayloadRequest, etc.)
});
```

### 4. Respond to a PermissionRequest

When the wallet approves a permission request, call `walletClient.respond()` with a `PermissionResponseInput` object.

```typescript
await walletClient.respond({
  type: BeaconMessageType.PermissionResponse,
  id: message.id,                   // MUST match incoming message.id exactly
  publicKey: '<tezos-public-key>',  // Real edpk… / sppk… / p2pk… key
  network: message.network,         // Echo back the requested network
  scopes: [PermissionScope.OPERATION_REQUEST], // Scopes the wallet grants
});
```

> **Important:** The `id` field **must** match the `id` of the incoming message, or the dApp will ignore or reject the response.

### 5. Full Minimal Wallet Example

```typescript
import {
  WalletClient,
  BeaconMessageType,
  PermissionScope,
} from '@tezos-x/octez.connect-sdk';

const wallet = new WalletClient({ name: 'My Wallet' });

await wallet.init();

await wallet.connect(async (message) => {
  if (message.type === BeaconMessageType.PermissionRequest) {
    console.log('dApp requests permissions on network:', message.network);

    // Prompt user in wallet UI, then respond:
    await wallet.respond({
      type: BeaconMessageType.PermissionResponse,
      id: message.id,
      publicKey: userPublicKey,       // Retrieve from keystore
      network: message.network,
      scopes: [PermissionScope.OPERATION_REQUEST],
    });
  }
});
```

---

## BeaconEvent Reference

Subscribe to events on a `DAppClient` instance using `subscribeToEvent(eventType, callback)`.

| Event | Trigger | Callback payload |
|---|---|---|
| `BeaconEvent.ACTIVE_ACCOUNT_SET` | Account connected, switched, or cleared | `AccountInfo \| undefined` |

> The complete list of `BeaconEvent` values is documented at **octez-connect.tezos.com**. Common additional events include wallet pairing state changes, request success/failure notifications, and transport status updates.

**Subscription pattern:**

```typescript
client.subscribeToEvent(BeaconEvent.<EVENT_NAME>, async (payload) => {
  // handle payload
});
```

---

## BeaconMessageType Reference

`BeaconMessageType` is an enum used in both the `type` field of incoming messages and the `type` field of response objects. A production `WalletClient` must handle all relevant variants.

| Enum value | Direction | Description |
|---|---|---|
| `BeaconMessageType.PermissionRequest` | dApp → Wallet | Wallet should prompt user to grant access |
| `BeaconMessageType.PermissionResponse` | Wallet → dApp | Wallet grants or denies permission |
| `BeaconMessageType.OperationRequest` | dApp → Wallet | dApp requests that the wallet broadcast an operation |
| `BeaconMessageType.OperationResponse` | Wallet → dApp | Wallet returns the operation hash |
| `BeaconMessageType.SignPayloadRequest` | dApp → Wallet | dApp requests a payload signature |
| `BeaconMessageType.SignPayloadResponse` | Wallet → dApp | Wallet returns the signature |
| `BeaconMessageType.BroadcastRequest` | dApp → Wallet | dApp requests raw broadcast of a pre-signed operation |
| `BeaconMessageType.BroadcastResponse` | Wallet → dApp | Wallet returns the operation hash |
| `BeaconMessageType.Error` | Wallet → dApp | Wallet reports an error back to the dApp |
| `BeaconMessageType.Disconnect` | Either direction | Peer signals intentional disconnection |

> Refer to octez-connect.tezos.com for the complete, authoritative enum surface; the table above covers the most common variants.

---

## PermissionScope Reference

`PermissionScope` values are granted by the wallet in a `PermissionResponse` and declare what operations the dApp is allowed to request in subsequent messages.

| Scope | Meaning |
|---|---|
| `PermissionScope.OPERATION_REQUEST` | dApp may request the wallet to sign and broadcast operations |
| `PermissionScope.SIGN` | dApp may request the wallet to sign arbitrary payloads |

> Grant only the scopes the dApp actually needs. Wallets should validate requested scopes and may grant a subset of what was requested.

---

## PermissionResponseInput Schema

All fields are **required** when constructing a `PermissionResponse`.

| Field | Type | Description |
|---|---|---|
| `type` | `BeaconMessageType.PermissionResponse` | Must be this exact enum value |
| `id` | `string` | Must exactly match the `id` of the incoming `PermissionRequest` |
| `publicKey` | `string` | The user's Tezos public key (`edpk…`, `sppk…`, or `p2pk…`) |
| `network` | `Network` | Echo the `network` object from the incoming request |
| `scopes` | `PermissionScope[]` | Array of scopes the wallet grants to the dApp |

**Network object shape:**

```typescript
{
  type: NetworkType.MAINNET | NetworkType.GHOSTNET | NetworkType.CUSTOM,
  name?: string,   // Optional human-readable name (for custom networks)
  rpcUrl?: string, // Optional RPC endpoint (for custom networks)
}
```

---

## Common Workflows

### Full Permission Handshake (dApp ↔ Wallet)

```
dApp                                    Wallet
 │                                          │
 │── requestPermissions() ────────────────► │
 │   (BeaconMessageType.PermissionRequest)  │
 │                                          │── Prompt user
 │                                          │
 │◄─────────────── respond() ──────────────│
 │   (BeaconMessageType.PermissionResponse) │
 │                                          │
 │  ACTIVE_ACCOUNT_SET event fires          │
 │  permissions.address available           │
```

**Step-by-step:**
1. dApp instantiates `DAppClient` and subscribes to `BeaconEvent.ACTIVE_ACCOUNT_SET`.
2. dApp calls `dAppClient.requestPermissions()`.
3. SDK opens pairing modal or forwards to paired wallet via transport.
4. Wallet's `connect()` callback fires with a `PermissionRequest` message.
5. Wallet prompts user to approve.
6. Wallet calls `walletClient.respond()` with `PermissionResponseInput`.
7. dApp's `requestPermissions()` promise resolves with `permissions.address`.
8. `ACTIVE_ACCOUNT_SET` event fires on the dApp side.

### Operation Request Flow

```typescript
// dApp side — after permissions are granted
// Prefer Octez.js + BeaconWallet for this; shown here for completeness.

// Wallet side — in the connect() callback
if (message.type === BeaconMessageType.OperationRequest) {
  const operationHash = await signAndBroadcast(message.operationDetails);
  await wallet.respond({
    type: BeaconMessageType.OperationResponse,
    id: message.id,
    transactionHash: operationHash,
  });
}
```

### Sending an Error Back to the dApp

```typescript
await wallet.respond({
  type: BeaconMessageType.Error,
  id: message.id,
  errorType: BeaconErrorType.ABORTED_ERROR, // User cancelled
});
```

---

## Transport Layers

The SDK supports three transport mechanisms. Transport selection is automatic based on what is available in the environment.

| Transport | Use case | Notes |
|---|---|---|
| **P2P (Matrix)** | Cross-device pairing via QR code | Default; works in all environments |
| **Browser extension** | Same-browser wallet extension (e.g., Temple) | Requires files served over HTTP (`http://`), not `file://` |
| **Mobile deep-link (iOS URL scheme)** | Same-device iOS wallet pairing | iOS wallet must register a custom URL scheme |

### Browser Extension Requirement

> ⚠️ If testing locally with browser extension transport, you **must** serve your HTML files over a local web server. Opening `file://` URLs will cause the extension transport to fail silently.

```bash
# Serve locally on port 8000
python3 -m http.server 8000
# Then open: http://localhost:8000/example-dapp.html
```

### iOS Custom URL Scheme

iOS wallet apps that want to support same-device dApp connections must configure a **custom URL scheme** in their app's `Info.plist`. This scheme is registered in the `beacon-wallet-list` entry so dApps can deep-link directly to the wallet on the same device.

---

## Higher-Level Abstraction: Octez.js + BeaconWallet

For complex Tezos smart-contract interactions, do **not** use `DAppClient` directly. Instead use **Octez.js** (the Tezos TypeScript library) with its `BeaconWallet` adapter, which wraps this SDK.

```typescript
import { TezosToolkit } from '@taquito/taquito'; // or octez.js equivalent
import { BeaconWallet } from '@taquito/beacon-wallet'; // or octez.js equivalent

const Tezos = new TezosToolkit('https://ghostnet.ecadinfra.com');
const wallet = new BeaconWallet({ name: 'My dApp' });

Tezos.setWalletProvider(wallet);

// Request permissions
await wallet.requestPermissions({ network: { type: NetworkType.GHOSTNET } });

// Call a contract entrypoint
const contract = await Tezos.wallet.at('KT1...');
const op = await contract.methods.myEntrypoint(param).send();
await op.confirmation();
```

**Decision guide:**

| Need | Recommended tool |
|---|---|
| Connect wallet, read address | `DAppClient` directly |
| Sign payloads | `DAppClient` directly |
| Call contract entrypoints | Octez.js + `BeaconWallet` |
| Estimate fees, batch operations | Octez.js + `BeaconWallet` |
| Implement a wallet (receive messages) | `WalletClient` directly |

---

## Adding a Wallet to the Ecosystem

To make a new wallet visible in the octez.connect pairing modal (so dApps using `DAppClient` can discover it):

1. Fork the **`beacon-wallet-list`** repository (linked from the octez.connect GitHub org).
2. Add a wallet entry JSON file with your wallet's metadata: name, logo, desktop/mobile availability, browser-extension IDs, and (for iOS) the custom URL scheme.
3. Submit a pull request to the `beacon-wallet-list` repository.
4. Once merged, the octez.connect SDK will include your wallet in its discovery list.

**For iOS wallets:** the `urlScheme` field in your wallet entry must match the custom URL scheme registered in your app's `Info.plist`.

---

## Mobile SDKs

Native SDK alternatives exist for mobile wallet developers. These have **different APIs** from the TypeScript SDK — this document covers TypeScript only.

| Platform | Language | Repository |
|---|---|---|
| iOS | Swift | Available under the Trilitech GitHub organisation |
| Android | Kotlin | Available under the Trilitech GitHub organisation |

Refer to each platform's README for platform-specific initialisation, pairing, and message-handling APIs.

---

## Local Development and Testing

### Build from Source

```bash
git clone https://github.com/trilitech/octez.connect.git
cd octez.connect
npm i
npm run build
npm run test
```

The repository uses a **Lerna monorepo** structure. Packages are located under `/packages`.

### Run Example Files

The repo includes built example HTML files for browser testing:
- `example-dapp.html` / `dapp.html` — test DApp behaviour
- `example-wallet.html` / `wallet.html` — test Wallet behaviour

```bash
# Serve from the repo root
python3 -m http.server 8000

# Open in browser:
# http://localhost:8000/example-dapp.html   (dApp side)
# http://localhost:8000/example-wallet.html (Wallet side)
```

> Open both URLs in separate browser tabs or windows to simulate the full pairing flow locally.

---

## Edge Cases and Gotchas

### 1. `id` Mismatch in Responses

The `id` field in every response object **must exactly match** the `id` of the incoming request. If they differ, the dApp will not match the response to its pending promise and the request will hang indefinitely.

```typescript
// ✅ Correct
await wallet.respond({ type: BeaconMessageType.PermissionResponse, id: message.id, ... });

// ❌ Wrong — using a new or hardcoded id
await wallet.respond({ type: BeaconMessageType.PermissionResponse, id: 'some-other-id', ... });
```

### 2. Public Key Format

The `publicKey` field in `PermissionResponseInput` must be a **real, correctly-encoded Tezos public key** — not a placeholder string. Accepted prefixes:

| Key type | Prefix |
|---|---|
| Ed25519 | `edpk…` |
| Secp256k1 | `sppk…` |
| P-256 | `p2pk…` |

Passing a fake or malformed public key will cause address derivation to fail on the dApp side.

### 3. Scope Override Caution

The wallet example in the repository demonstrates overriding the dApp's requested scopes — granting only `OPERATION_REQUEST` regardless of what the dApp asked for. In a production wallet:
- Validate that requested scopes are recognised and safe.
- Present the user with exactly what is being granted.
- Consider rejecting requests for scopes your wallet does not support.

### 4. Browser Extension Requires HTTP Transport

Opening example files via `file://` disables browser-extension transport. Always serve files over `http://localhost` during development.

### 5. `init()` Before `connect()`

Calling `walletClient.connect()` without first calling `walletClient.init()` will fail. Always `await walletClient.init()` before `await walletClient.connect(handler)`.

### 6. Handle All Message Types in Production

The `connect()` callback receives **all** `BeaconMessageType` variants. A wallet that only handles `PermissionRequest` and ignores the rest will leave dApp operation requests hanging. Implement a handler branch (or an error response) for every type the wallet receives.

### 7. Inherited "Beacon" Naming

Because the SDK is forked from `airgap-it/beacon-sdk`, many identifiers retain the `Beacon` prefix (e.g., `BeaconEvent`, `BeaconMessageType`, `BeaconWallet`). These are **octez.connect SDK classes**, not a separate "Beacon Protocol" — the naming is a legacy convention from the upstream fork.

---

## Caveats & Limitations

- **Incomplete public API documentation in README:** The full surface of `BeaconEvent`, `BeaconMessageType`, and `PermissionScope` is not exhaustively listed in the GitHub README. Always cross-reference with **octez-connect.tezos.com** for the authoritative API reference.
- **Early-stage project:** The repository has a small number of stars and watchers as of the initial release (February 2026). Verify stability and release cadence before committing to production use.
- **No changelog or versioning in README:** Pin your dependency to a specific semver range and monitor the GitHub releases page for breaking changes.
- **Mobile SDK APIs differ:** iOS (Swift) and Android (Kotlin) SDKs have their own APIs; TypeScript patterns shown here do not apply directly.
- **Upstream fork divergence:** Future changes in `airgap-it/beacon-sdk` may or may not be merged into this fork. The two projects may diverge over time.
- **`BeaconWallet` / Octez.js integration details:** The exact import paths and API for `BeaconWallet` in Octez.js are governed by Octez.js documentation, not this SDK's README. Consult the Octez.js documentation separately.