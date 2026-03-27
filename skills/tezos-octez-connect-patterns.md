# Skill: octez.connect DAppClient — Battle-Tested Patterns

```yaml
skill_type: patterns
domain: Tezos blockchain / dApp wallet integration
version: 1.0
derived_from: Real-world debugging of hack.tez + BCD (Better Call Dev) source analysis
```

## Overview

Hard-won patterns for using `@tezos-x/octez.connect-sdk`'s `DAppClient` in production dApps. These patterns address **actual failure modes** encountered when connecting to Temple Wallet (and other Tezos wallet extensions) via the beacon protocol.

---

## 1. Network Configuration — ALWAYS Use CUSTOM for Non-Mainnet

### The Problem

Temple Wallet's beacon handler maps `network.type` strings to internal chain IDs. If the wallet version doesn't recognize a network name (e.g. `"ghostnet"`), it throws `PARAMETERS_INVALID_ERROR` — a completely opaque error with no description.

Temple's internal `NetworkType` definition may NOT include all networks that `@tezos-x/octez.connect-types` defines. The SDK has `NetworkType.GHOSTNET`, `NetworkType.WEEKLYNET`, etc., but Temple may only know `mainnet | custom | rionet | seoulnet`.

### The Fix

```typescript
import { DAppClient, NetworkType, type Network } from "@tezos-x/octez.connect-sdk";

function buildNetwork(name: string, rpcUrl: string): Network {
    if (name === "mainnet") {
        return { type: NetworkType.MAINNET };
    }
    // For ANY non-mainnet network, use CUSTOM with explicit RPC URL.
    // This bypasses the wallet's internal network lookup entirely.
    return {
        type: NetworkType.CUSTOM,
        name: name.charAt(0).toUpperCase() + name.slice(1), // "Ghostnet"
        rpcUrl: rpcUrl, // e.g. "https://rpc.ghostnet.teztnets.com"
    };
}

const client = new DAppClient({
    name: "My dApp",
    network: buildNetwork("ghostnet", "https://rpc.ghostnet.teztnets.com"),
});
```

### Why This Works

Temple's beacon message handler (`getTempleReq` in `actions.ts`) has this exact code path:

```javascript
const network = req.network.type === 'custom'
    ? { name: req.network.name!, rpc: req.network.rpcUrl! }  // ← uses YOUR RPC directly
    : req.network.type;  // ← string goes through internal lookup (CAN FAIL)
```

BCD also uses this pattern — see `CORRECT_NETWORK_TYPES` in `baking-bad/bcd/src/utils/wallet.js`:

```javascript
const CORRECT_NETWORK_TYPES = {
    "sandboxnet": NetworkType.CUSTOM,
    "rollupnet": NetworkType.CUSTOM,
}
```

---

## 2. Use `network` NOT `preferredNetwork`

### The Problem

`DAppClient` accepts both `config.network` (a `Network` object) and `config.preferredNetwork` (a `NetworkType` enum). The constructor resolves them like:

```javascript
this.network = config.network ?? { type: config.preferredNetwork ?? NetworkType.MAINNET };
```

If you use `preferredNetwork`, you can only pass an enum value — no RPC URL, no name. This means you can't use `CUSTOM` network type, which is the safe path.

### The Fix

Always use `network` (the object form), never `preferredNetwork`:

```typescript
// ❌ BAD — can't provide rpcUrl
new DAppClient({ name: "app", preferredNetwork: NetworkType.GHOSTNET });

// ✅ GOOD — full control
new DAppClient({ name: "app", network: { type: NetworkType.CUSTOM, name: "Ghostnet", rpcUrl: "https://..." } });
```

---

## 3. Check Active Account Before Requesting Permissions

### The Pattern (from BCD)

```typescript
const connect = async () => {
    // Check if there's already a connected account from a previous session
    const existing = await client.getActiveAccount();
    if (existing) {
        // Already connected — just hydrate your UI state
        updateUI(existing.address);
        return;
    }

    // No active account — request fresh permissions
    await client.requestPermissions({
        scopes: [PermissionScope.OPERATION_REQUEST, PermissionScope.SIGN],
    });

    const account = await client.getActiveAccount();
    if (account) updateUI(account.address);
};
```

### Why

Calling `requestPermissions()` when an active account already exists causes the SDK to either:
- Send a redundant permission request to the wallet (confusing UX)
- In some code paths, use `makeRequestBC` (broadcast channel) instead of `makeRequest`, which behaves differently

BCD's `getNewPermissions()` always checks `getActiveAccount()` first and only calls `requestPermissions()` if there's no active account.

---

## 4. Contract Operations — Use `requestOperation` with Raw Michelson

### The BCD Pattern

For calling smart contract entrypoints, use `client.requestOperation()` with raw Michelson `value` objects:

```typescript
import { TezosOperationType } from "@tezos-x/octez.connect-sdk";

const result = await client.requestOperation({
    operationDetails: [{
        kind: TezosOperationType.TRANSACTION,
        destination: "KT1...",
        amount: "0",
        parameters: {
            entrypoint: "set_child_record",
            value: {
                prim: "Pair",
                args: [
                    { bytes: "..." },
                    {
                        prim: "Pair",
                        args: [
                            { prim: "Some", args: [{ string: "tz1..." }] },
                            // ... rest of Michelson
                        ]
                    }
                ]
            }
        }
    }]
});
```

### Key Notes

- `amount` must be a **string** (mutez as string, e.g. `"0"`)
- `parameters.value` is a raw Michelson JSON object, NOT a Taquito `ContractMethod`
- Temple's beacon handler runs `formatOpParams()` which remaps `destination` → `to` and converts `amount` to number
- If you need to estimate gas/fees, let the wallet handle it — don't set `fee`, `gas_limit`, `storage_limit` unless you know what you're doing

---

## 5. Beacon State Corruption — The Nuclear Reset

### The Problem

The beacon SDK stores state in `localStorage` under keys prefixed with `beacon:`. This includes:
- `beacon:accounts` — all known accounts
- `beacon:active-account` — current active account identifier
- `beacon:postmessage-peers-dapp` — paired wallet extensions
- `beacon:sdk-secret-seed` — cryptographic seed for encrypted channel

If this state gets corrupted (e.g., from switching between beacon SDK forks, dual-client bugs, or interrupted pairing), you get mysterious errors that persist across page reloads.

### The Fix — Full State Wipe

```typescript
function clearBeaconState() {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith("beacon:")) keysToRemove.push(key);
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
}

async function resetConnection(client: DAppClient) {
    try { await client.destroy(); } catch { /* may already be destroyed */ }
    clearBeaconState();
    // Recreate the client from scratch
    return new DAppClient({ name: "app", network: buildNetwork(...) });
}
```

### Expose a Reset Button

Always give users a "Reset Connection" button. Wallet pairing is fragile and users WILL end up in broken states. A visible escape hatch saves support tickets.

---

## 6. The Beacon SDK Fork Situation

### Three Active Forks (as of 2026)

| Package prefix | Maintainer | Used by |
|---|---|---|
| `@airgap/beacon-*` | AirGap | Temple Wallet extension (internal) |
| `@ecadlabs/beacon-*` | ECAD Labs | `@taquito/beacon-wallet` |
| `@tezos-x/octez.connect-*` | Trilitech | BCD, standalone dApps |

### Critical Rule: NEVER Mix Forks in the Browser Bundle

Each fork creates its own `DAppClient` singleton, registers its own `postMessage` listener, and generates its own cryptographic keypair. If two forks coexist in the same page:

1. Both register `window.addEventListener('message', ...)` handlers
2. Both try to decrypt every message from the wallet extension
3. One succeeds, the other throws silently (or not silently)
4. The wrong one may "win" the response, corrupting state

**If you use `@tezos-x/octez.connect-sdk`, do NOT also import `@taquito/beacon-wallet` in browser code.** The `@taquito/beacon-wallet` package bundles `@ecadlabs/beacon-dapp` which creates a competing client.

You CAN use `@taquito/taquito`, `@taquito/signer`, `@taquito/utils` in **server-side code** (Netlify functions, Node.js) without conflict — the collision only happens in the browser.

---

## 7. Temple Wallet Specifics

### Temple Has TWO Message Protocols

1. **Native Temple protocol** (`@temple-wallet/dapp`) — simpler postMessage API
2. **Beacon protocol** — the `@tezos-x/octez.connect-sdk` path

When a beacon message arrives, Temple's `beacon.ts` decrypts it, then `actions.ts` maps it to Temple's internal format via `getTempleReq()`. Errors at ANY point in this chain get mapped to generic `PARAMETERS_INVALID_ERROR`.

### `appMetadata.name` Must Be a String

Temple's `requestPermission()` validates:
```javascript
if (typeof req?.appMeta?.name !== 'string') throw new Error(TempleDAppErrorType.InvalidParams);
```

If `DAppClient.name` is undefined/null, the `getOwnAppMetadata()` returns `{ name: undefined, ... }` and Temple rejects it.

### Temple's `dAppNetworksChainIds` Map

Temple internally maps network names to chain IDs. As of recent versions:
```javascript
const dAppNetworksChainIds = {
    mainnet: TEZOS_MAINNET_CHAIN_ID,
    ghostnet: TempleTezosChainId.Ghostnet,
    shadownet: TempleTezosChainId.Shadownet,
    tezlink: TempleTezosChainId.Tezlink,
    rionet: TempleTezosChainId.Rio,
    seoulnet: TempleTezosChainId.Seoul,
    tallinnnet: TempleTezosChainId.Tallinn,
};
```

Newer Temple versions DO include ghostnet. Older versions may not. Using `CUSTOM` network type is the safe path that works across ALL Temple versions.

---

## 8. Debugging Checklist

When `requestPermissions()` fails:

1. **Open devtools → Application → Local Storage** — look for `beacon:*` keys. Stale state? Nuke them.
2. **Check the error type** — `PARAMETERS_INVALID_ERROR` almost always means the wallet rejected the message format, not your code logic.
3. **Log the request object** — Add `console.log` before `requestPermissions()` to see the exact scopes/network being sent.
4. **Check for dual clients** — Search your bundle for multiple beacon SDK forks: `grep -r "postmessage-pairing" dist/`
5. **Try mainnet** — If ghostnet fails but mainnet works, it's the network type issue. Use `CUSTOM`.
6. **Try a different wallet** — If Temple fails, try Kukai or another wallet to isolate whether it's a Temple-specific issue.
7. **Check the `ACTIVE_ACCOUNT_SET` warning** — "An active account has been received, but no active subscription was found" means you're creating the client before subscribing to events. Subscribe in `useEffect`, not after user interaction.

---

## 9. Minimal Working React Pattern

```tsx
import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { DAppClient, NetworkType, PermissionScope, BeaconEvent } from "@tezos-x/octez.connect-sdk";

function createClient() {
    return new DAppClient({
        name: "my-dapp",
        network: {
            type: NetworkType.CUSTOM,
            name: "Ghostnet",
            rpcUrl: "https://rpc.ghostnet.teztnets.com",
        },
    });
}

let client = createClient();

export function WalletProvider({ children }) {
    const [address, setAddress] = useState(null);
    const clientRef = useRef(client);

    useEffect(() => {
        clientRef.current.getActiveAccount().then((acct) => {
            if (acct) setAddress(acct.address);
        });
        clientRef.current.subscribeToEvent(BeaconEvent.ACTIVE_ACCOUNT_SET, (acct) => {
            setAddress(acct?.address ?? null);
        });
    }, []);

    const connect = useCallback(async () => {
        const existing = await clientRef.current.getActiveAccount();
        if (existing) { setAddress(existing.address); return; }
        await clientRef.current.requestPermissions({
            scopes: [PermissionScope.OPERATION_REQUEST, PermissionScope.SIGN],
        });
        const acct = await clientRef.current.getActiveAccount();
        if (acct) setAddress(acct.address);
    }, []);

    const disconnect = useCallback(async () => {
        await clientRef.current.clearActiveAccount();
        setAddress(null);
    }, []);

    return <Ctx.Provider value={{ client: clientRef.current, address, connect, disconnect }}>{children}</Ctx.Provider>;
}
```
