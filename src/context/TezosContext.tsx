import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import type { DAppClient } from "@tezos-x/octez.connect-sdk";
import config from "../config/tezos";
import { resolveDisplayName } from "../lib/domains";

// Lazy-load the heavy Tezos SDK only when needed (connect or session restore).
// This keeps ~2 MB of wallet/blockchain code out of the initial bundle,
// dramatically improving FCP and TTI for first-time visitors.
type SDKModule = typeof import("@tezos-x/octez.connect-sdk");
let sdkPromise: Promise<SDKModule> | null = null;
function loadSDK(): Promise<SDKModule> {
    if (!sdkPromise) sdkPromise = import("@tezos-x/octez.connect-sdk");
    return sdkPromise;
}

interface TezosState {
    client: DAppClient | null;
    address: string | null;
    domain: string | null;
    connecting: boolean;
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    resetConnection: () => Promise<void>;
}

// Preserve context identity across HMR — a new createContext() call on every
// hot reload would break all consumers (they'd read from a different context
// object than the one TezosProvider is writing to).
declare global {
    interface Window {
        __TEZOS_CONTEXT__?: ReturnType<typeof createContext<TezosState | null>>;
    }
}
const TezosContext: ReturnType<typeof createContext<TezosState | null>> =
    (import.meta.env.DEV && typeof window !== "undefined" && window.__TEZOS_CONTEXT__) ||
    createContext<TezosState | null>(null);

if (import.meta.env.DEV && typeof window !== "undefined") {
    window.__TEZOS_CONTEXT__ = TezosContext;
}

// Use CUSTOM network type with explicit RPC URL for non-mainnet.
// This bypasses wallet extension's internal network lookup which can fail
// if the wallet doesn't recognize the network name (e.g. older Temple versions).
function buildNetwork(sdk: SDKModule) {
    if (config.name === "mainnet") {
        return { type: sdk.NetworkType.MAINNET };
    }
    return {
        type: sdk.NetworkType.CUSTOM,
        name: config.name.charAt(0).toUpperCase() + config.name.slice(1),
        rpcUrl: config.rpcUrl,
    };
}

// Module-level singleton — recreated on resetConnection
let dAppClient: DAppClient | null = null;

async function getOrCreateClient(): Promise<DAppClient> {
    if (dAppClient) return dAppClient;
    const sdk = await loadSDK();
    dAppClient = new sdk.DAppClient({ name: "hack.tez", network: buildNetwork(sdk) });
    return dAppClient;
}

// Clear all beacon-related localStorage entries to reset stale state
function clearBeaconState() {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith("beacon:")) keysToRemove.push(key);
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
}

// Quick localStorage check — avoids loading the SDK on cold visits
function hasBeaconSession(): boolean {
    for (let i = 0; i < localStorage.length; i++) {
        if (localStorage.key(i)?.startsWith("beacon:")) return true;
    }
    return false;
}

export function TezosProvider({ children }: { children: ReactNode }) {
    const [address, setAddress] = useState<string | null>(null);
    const [domain, setDomain] = useState<string | null>(null);
    const [connecting, setConnecting] = useState(false);
    const [client, setClient] = useState<DAppClient | null>(null);
    const subscribedRef = useRef(false);

    const hydrateAccount = useCallback(async (addr: string) => {
        setAddress(addr);
        resolveDisplayName(addr)
            .then(setDomain)
            .catch(() => {});
    }, []);

    // Set up event subscription and return (or create) the client.
    // Idempotent — safe to call from both session-restore and connect().
    const initClient = useCallback(async (): Promise<DAppClient> => {
        const c = await getOrCreateClient();
        if (!subscribedRef.current) {
            subscribedRef.current = true;
            const sdk = await loadSDK();
            c.subscribeToEvent(sdk.BeaconEvent.ACTIVE_ACCOUNT_SET, (account) => {
                if (account) {
                    hydrateAccount(account.address);
                } else {
                    setAddress(null);
                    setDomain(null);
                }
            });
        }
        setClient(c);
        return c;
    }, [hydrateAccount]);

    useEffect(() => {
        // Only load the SDK when a prior session exists — cold visitors skip this entirely
        if (!hasBeaconSession()) return;
        initClient().then((c) => {
            c.getActiveAccount().then((account) => {
                if (account) hydrateAccount(account.address);
            });
        });
    }, [hydrateAccount, initClient]);

    const connect = useCallback(async () => {
        setConnecting(true);
        try {
            const sdk = await loadSDK();
            const c = await initClient();

            // BCD pattern: check for existing active account first
            const existing = await c.getActiveAccount();
            if (existing) {
                await hydrateAccount(existing.address);
                return;
            }

            const scopes = [sdk.PermissionScope.OPERATION_REQUEST];
            await c.requestPermissions({ scopes });

            const account = await c.getActiveAccount();
            if (account) {
                await hydrateAccount(account.address);
            }
        } catch (err: unknown) {
            const errObj = err as Record<string, unknown>;
            if (import.meta.env.DEV) {
                console.error("Wallet connection failed:", {
                    errorType: errObj?.errorType,
                    description: errObj?.description,
                    message: errObj?.message,
                    raw: err,
                });
            }
        } finally {
            setConnecting(false);
        }
    }, [hydrateAccount, initClient]);

    const disconnect = useCallback(async () => {
        if (client) await client.clearActiveAccount();
        setAddress(null);
        setDomain(null);
    }, [client]);

    // Nuclear option: wipe all beacon state and recreate the client
    const resetConnection = useCallback(async () => {
        try {
            if (dAppClient) await dAppClient.destroy();
        } catch {
            /* may already be destroyed */
        }
        clearBeaconState();
        dAppClient = null;
        subscribedRef.current = false;
        setClient(null);
        setAddress(null);
        setDomain(null);
    }, []);

    return (
        <TezosContext.Provider
            value={{
                client,
                address,
                domain,
                connecting,
                connect,
                disconnect,
                resetConnection,
            }}
        >
            {children}
        </TezosContext.Provider>
    );
}

export function useTezos() {
    const ctx = useContext(TezosContext);
    if (!ctx) throw new Error("useTezos must be used within TezosProvider");
    return ctx;
}
