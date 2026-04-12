import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import type { DAppClient } from "@tezos-x/octez.connect-sdk";
import config, { hackchatUrl } from "../config/tezos";
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

const AUTH_STORAGE_KEY = "hack-tez-auth-session";
const REFRESH_LEAD_MS = 60 * 60 * 1000; // refresh 1 hour before expiry

interface AuthSession {
    token: string;
    domains: string[];
    activeDomain: string | null;
}

interface TezosState {
    client: DAppClient | null;
    address: string | null;
    domain: string | null;
    connecting: boolean;
    token: string | null;
    chatDomains: string[];
    activeDomain: string | null;
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    resetConnection: () => Promise<void>;
    refreshToken: () => Promise<void>;
    setActiveDomain: (domain: string) => void;
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

function getJwtExpiry(token: string): number | null {
    try {
        const seg = token.split(".")[1];
        const base64 = seg.replace(/-/g, "+").replace(/_/g, "/");
        const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
        const payload = JSON.parse(atob(padded));
        return payload.exp ? payload.exp * 1000 : null;
    } catch {
        return null;
    }
}

function saveAuthSession(session: AuthSession) {
    try {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    } catch { /* quota exceeded — ignore */ }
}

function loadAuthSession(): AuthSession | null {
    try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEY);
        if (!raw) return null;
        const session = JSON.parse(raw) as AuthSession;
        const expiry = getJwtExpiry(session.token);
        if (!expiry || expiry < Date.now() + 60_000) {
            localStorage.removeItem(AUTH_STORAGE_KEY);
            return null;
        }
        return session;
    } catch {
        return null;
    }
}

function clearAuthSession() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
}

/** Sign a challenge and exchange it for a JWT via the chat worker /auth endpoint. */
async function authenticateWallet(c: DAppClient, addr: string): Promise<AuthSession> {
    const { signMessage } = await import("../lib/signing");
    const timestamp = Math.floor(Date.now() / 1000);
    const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
    const nonce = Array.from(nonceBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

    const challenge = `hack.tez-chat:${timestamp}:${nonce}`;
    const { signature, publicKey } = await signMessage(c, challenge);

    const res = await fetch(`${hackchatUrl}/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: addr, publicKey, signature, timestamp, nonce }),
    });

    if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Auth failed" }));
        throw new Error((body as Record<string, string>).error ?? `HTTP ${res.status}`);
    }

    const data = (await res.json()) as { token: string; domains: string[]; activeDomain: string | null };
    return { token: data.token, domains: data.domains, activeDomain: data.activeDomain };
}

export function TezosProvider({ children }: { children: ReactNode }) {
    const [address, setAddress] = useState<string | null>(null);
    const [domain, setDomain] = useState<string | null>(null);
    const [connecting, setConnecting] = useState(false);
    const [client, setClient] = useState<DAppClient | null>(null);
    const subscribedRef = useRef(false);

    // JWT auth state
    const [token, setToken] = useState<string | null>(null);
    const [chatDomains, setChatDomains] = useState<string[]>([]);
    const [activeDomain, setActiveDomainState] = useState<string | null>(null);
    const tokenRef = useRef<string | null>(null);
    const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const applySession = useCallback((session: AuthSession) => {
        setToken(session.token);
        setChatDomains(session.domains);
        setActiveDomainState(session.activeDomain);
        tokenRef.current = session.token;
        saveAuthSession(session);
    }, []);

    const clearSession = useCallback(() => {
        if (refreshTimerRef.current) {
            clearTimeout(refreshTimerRef.current);
            refreshTimerRef.current = null;
        }
        setToken(null);
        setChatDomains([]);
        setActiveDomainState(null);
        tokenRef.current = null;
        clearAuthSession();
    }, []);

    const scheduleRefresh = useCallback(
        (currentToken: string) => {
            if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
            const expiry = getJwtExpiry(currentToken);
            if (!expiry) return;
            const delay = Math.max(expiry - Date.now() - REFRESH_LEAD_MS, 0);
            refreshTimerRef.current = setTimeout(async () => {
                try {
                    const t = tokenRef.current;
                    if (!t) return;
                    const res = await fetch(`${hackchatUrl}/auth/refresh`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${t}`,
                        },
                    });
                    if (!res.ok) throw new Error("Refresh failed");
                    const data = (await res.json()) as { token: string; domains: string[]; activeDomain: string | null };
                    const session: AuthSession = {
                        token: data.token,
                        domains: data.domains,
                        activeDomain: data.activeDomain,
                    };
                    applySession(session);
                    scheduleRefresh(data.token);
                } catch {
                    // Token refresh failed — clear auth but keep wallet connected.
                    // User will need to re-sign on next action that needs auth.
                    clearSession();
                }
            }, delay);
        },
        [applySession, clearSession],
    );

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
                    clearSession();
                }
            });
        }
        setClient(c);
        return c;
    }, [hydrateAccount, clearSession]);

    // Session restore: load wallet + JWT from storage on mount
    useEffect(() => {
        if (!hasBeaconSession()) return;
        initClient().then((c) => {
            c.getActiveAccount().then((account) => {
                if (!account) return;
                hydrateAccount(account.address);
                // Restore JWT from localStorage
                const stored = loadAuthSession();
                if (stored) {
                    applySession(stored);
                    scheduleRefresh(stored.token);
                }
                // If no stored session, user will need to re-sign (connect() handles it)
            });
        });
    }, [hydrateAccount, initClient, applySession, scheduleRefresh]);

    // Cross-tab sync: pick up JWT changes from other tabs
    useEffect(() => {
        function onStorage(e: StorageEvent) {
            if (e.key !== AUTH_STORAGE_KEY) return;
            if (!e.newValue) {
                clearSession();
                return;
            }
            try {
                const session = JSON.parse(e.newValue) as AuthSession;
                applySession(session);
                scheduleRefresh(session.token);
            } catch { /* ignore corrupt data */ }
        }
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, [applySession, clearSession, scheduleRefresh]);

    const connect = useCallback(async () => {
        setConnecting(true);
        try {
            const sdk = await loadSDK();
            const c = await initClient();

            // BCD pattern: check for existing active account first
            const existing = await c.getActiveAccount();
            let addr: string;
            if (existing) {
                // Re-request permissions if existing session lacks SIGN scope
                const hasSign = existing.scopes?.includes(sdk.PermissionScope.SIGN);
                if (hasSign) {
                    addr = existing.address;
                } else {
                    // Clear stale session before re-requesting with SIGN scope
                    await c.clearActiveAccount();
                    const scopes = [sdk.PermissionScope.OPERATION_REQUEST, sdk.PermissionScope.SIGN];
                    await c.requestPermissions({ scopes });
                    const account = await c.getActiveAccount();
                    if (!account) return;
                    addr = account.address;
                }
            } else {
                const scopes = [sdk.PermissionScope.OPERATION_REQUEST, sdk.PermissionScope.SIGN];
                await c.requestPermissions({ scopes });
                const account = await c.getActiveAccount();
                if (!account) return;
                addr = account.address;
            }

            await hydrateAccount(addr);

            // Check if we already have a valid JWT for this address
            const stored = loadAuthSession();
            if (stored) {
                try {
                    const seg = stored.token.split(".")[1];
                    const base64 = seg.replace(/-/g, "+").replace(/_/g, "/");
                    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
                    const payload = JSON.parse(atob(padded));
                    if (payload.address === addr) {
                        applySession(stored);
                        scheduleRefresh(stored.token);
                        return;
                    }
                } catch { /* token corrupt, continue to re-auth */ }
            }

            // Sign challenge + exchange for JWT
            const session = await authenticateWallet(c, addr);
            applySession(session);
            scheduleRefresh(session.token);
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
    }, [hydrateAccount, initClient, applySession, scheduleRefresh]);

    const refreshTokenFn = useCallback(async () => {
        const t = tokenRef.current;
        if (!t) {
            // No token — try full re-auth if we have a client + address
            if (client && address) {
                try {
                    const session = await authenticateWallet(client, address);
                    applySession(session);
                    scheduleRefresh(session.token);
                } catch { /* silent failure */ }
            }
            return;
        }
        try {
            const res = await fetch(`${hackchatUrl}/auth/refresh`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${t}`,
                },
            });
            if (!res.ok) throw new Error("Refresh failed");
            const data = (await res.json()) as { token: string; domains: string[]; activeDomain: string | null };
            const session: AuthSession = {
                token: data.token,
                domains: data.domains,
                activeDomain: data.activeDomain,
            };
            applySession(session);
            scheduleRefresh(data.token);
        } catch { /* silent failure */ }
    }, [client, address, applySession, scheduleRefresh]);

    const setActiveDomain = useCallback(
        (newDomain: string) => {
            setActiveDomainState(newDomain);

            // Persist + re-issue JWT with new active domain
            const stored = loadAuthSession();
            if (stored) {
                stored.activeDomain = newDomain;
                saveAuthSession(stored);
            }

            // Refresh JWT with X-Active-Domain header
            const t = tokenRef.current;
            if (t) {
                void (async () => {
                    try {
                        const res = await fetch(`${hackchatUrl}/auth/refresh`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${t}`,
                                "X-Active-Domain": newDomain,
                            },
                        });
                        if (!res.ok) return;
                        const data = (await res.json()) as { token: string; domains: string[]; activeDomain: string | null };
                        applySession({
                            token: data.token,
                            domains: data.domains,
                            activeDomain: data.activeDomain,
                        });
                    } catch { /* silent — optimistic update already applied */ }
                })();
            }
        },
        [applySession],
    );

    const disconnect = useCallback(async () => {
        if (client) await client.clearActiveAccount();
        setAddress(null);
        setDomain(null);
        clearSession();
    }, [client, clearSession]);

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
        clearSession();
    }, [clearSession]);

    // Clear JWT when wallet address changes
    const prevAddressRef = useRef(address);
    useEffect(() => {
        const prev = prevAddressRef.current;
        prevAddressRef.current = address;
        if (!address && prev) {
            clearSession();
        } else if (address && prev && address !== prev) {
            clearSession();
        }
    }, [address, clearSession]);

    return (
        <TezosContext.Provider
            value={{
                client,
                address,
                domain,
                connecting,
                token,
                chatDomains,
                activeDomain,
                connect,
                disconnect,
                resetConnection,
                refreshToken: refreshTokenFn,
                setActiveDomain,
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
