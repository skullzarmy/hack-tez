---
title: "Octez Connect Integration (hack.tez)"
slug: "octez-connect-integration"
summary: "How hack.tez integrates Beacon via @tezos-x/octez.connect-sdk for wallet connect, operation requests, and chat auth."
category: "hacktez"
tags: [beacon, octez-connect, wallet, dapp]
status: "draft"
author: "admin.hack.tez"
---

# Octez Connect Integration (hack.tez)

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

