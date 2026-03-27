import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import {
    DAppClient,
    NetworkType,
    PermissionScope,
    BeaconEvent,
    type Network,
} from "@tezos-x/octez.connect-sdk";
import config from "../config/tezos";
import { resolveAddressToDomain } from "../lib/domains";

interface TezosState {
    client: DAppClient;
    address: string | null;
    domain: string | null;
    balance: number | null;
    connecting: boolean;
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    resetConnection: () => Promise<void>;
}

const TezosContext = createContext<TezosState | null>(null);

// Use CUSTOM network type with explicit RPC URL for non-mainnet.
// This bypasses wallet extension's internal network lookup which can fail
// if the wallet doesn't recognize the network name (e.g. older Temple versions).
function buildNetwork(): Network {
    if (config.name === "mainnet") {
        return { type: NetworkType.MAINNET };
    }
    return {
        type: NetworkType.CUSTOM,
        name: config.name.charAt(0).toUpperCase() + config.name.slice(1),
        rpcUrl: config.rpcUrl,
    };
}

function createClient(): DAppClient {
    return new DAppClient({
        name: "hack.tez",
        network: buildNetwork(),
    });
}

let dAppClient = createClient();

async function fetchBalance(addr: string): Promise<number | null> {
    try {
        const res = await fetch(`${config.rpcUrl}/chains/main/blocks/head/context/contracts/${addr}/balance`);
        const raw = await res.json();
        return parseInt(raw, 10) / 1_000_000;
    } catch {
        return null;
    }
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

export function TezosProvider({ children }: { children: ReactNode }) {
    const [address, setAddress] = useState<string | null>(null);
    const [domain, setDomain] = useState<string | null>(null);
    const [balance, setBalance] = useState<number | null>(null);
    const [connecting, setConnecting] = useState(false);
    const clientRef = useRef(dAppClient);

    const hydrateAccount = useCallback(async (addr: string) => {
        setAddress(addr);
        resolveAddressToDomain(addr).then(setDomain).catch(() => {});
        fetchBalance(addr).then(setBalance);
    }, []);

    useEffect(() => {
        // Check for an existing active account (session restore)
        clientRef.current.getActiveAccount().then((account) => {
            if (account) hydrateAccount(account.address);
        });

        clientRef.current.subscribeToEvent(BeaconEvent.ACTIVE_ACCOUNT_SET, (account) => {
            if (account) {
                hydrateAccount(account.address);
            } else {
                setAddress(null);
                setDomain(null);
                setBalance(null);
            }
        });
    }, [hydrateAccount]);

    const connect = useCallback(async () => {
        setConnecting(true);
        try {
            // BCD pattern: check for existing active account first
            const existing = await clientRef.current.getActiveAccount();
            if (existing) {
                await hydrateAccount(existing.address);
                return;
            }

            const scopes = [PermissionScope.OPERATION_REQUEST, PermissionScope.SIGN];
            await clientRef.current.requestPermissions({ scopes });

            const account = await clientRef.current.getActiveAccount();
            if (account) {
                await hydrateAccount(account.address);
            }
        } catch (err: unknown) {
            const errObj = err as Record<string, unknown>;
            console.error("Wallet connection failed:", {
                errorType: errObj?.errorType,
                description: errObj?.description,
                message: errObj?.message,
                raw: err,
            });
        } finally {
            setConnecting(false);
        }
    }, [hydrateAccount]);

    const disconnect = useCallback(async () => {
        await clientRef.current.clearActiveAccount();
        setAddress(null);
        setDomain(null);
        setBalance(null);
    }, []);

    // Nuclear option: wipe all beacon state and recreate the client
    const resetConnection = useCallback(async () => {
        try {
            await clientRef.current.destroy();
        } catch { /* may already be destroyed */ }
        clearBeaconState();
        dAppClient = createClient();
        clientRef.current = dAppClient;
        setAddress(null);
        setDomain(null);
        setBalance(null);
    }, []);

    return (
        <TezosContext.Provider
            value={{
                client: clientRef.current,
                address,
                domain,
                balance,
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
