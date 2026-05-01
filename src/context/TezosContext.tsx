import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import type { DAppClient } from "@tezos-x/octez.connect-sdk";
import config, { hackchatUrl, siteUrl } from "../config/tezos";
import { resolveDisplayName } from "../lib/domains";
import {
    setSession,
    subscribeToSession,
    setAuthHandlers,
    refreshSession,
    getTokenExpiryMs,
    REFRESH_THRESHOLD_MS,
    type SessionSnapshot,
} from "../lib/authedFetch";
import type { Network } from "../../auth/types";

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
    /** True while restoring a previous wallet session on mount. */
    restoring: boolean;
    token: string | null;
    chatDomains: string[];
    activeDomain: string | null;
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    resetConnection: () => Promise<void>;
    authError: string | null;
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

let dAppClient: DAppClient | null = null;

async function getOrCreateClient(): Promise<DAppClient> {
    if (dAppClient) return dAppClient;
    const sdk = await loadSDK();
    dAppClient = new sdk.DAppClient({ name: "hack.tez", network: buildNetwork(sdk) });
    return dAppClient;
}

function clearBeaconState() {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith("beacon:")) keysToRemove.push(key);
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
}

function hasBeaconSession(): boolean {
    for (let i = 0; i < localStorage.length; i++) {
        if (localStorage.key(i)?.startsWith("beacon:")) return true;
    }
    return false;
}

function saveAuthSession(session: AuthSession) {
    try {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    } catch { /* quota exceeded */ }
}

/** Minimum acceptable token version. Bump in lockstep with shared `auth/types.ts`. */
const MIN_TOKEN_VERSION = 2;

/** Decode a JWT payload without verifying the signature. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
    try {
        const seg = token.split(".")[1];
        if (!seg) return null;
        const base64 = seg.replace(/-/g, "+").replace(/_/g, "/");
        const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
        return JSON.parse(atob(padded)) as Record<string, unknown>;
    } catch {
        return null;
    }
}

function loadAuthSession(): AuthSession | null {
    try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEY);
        if (!raw) return null;
        const session = JSON.parse(raw) as AuthSession;
        // Discard if already expired or expiring within 60s.
        const expiry = getTokenExpiryMs(session.token);
        if (!expiry || expiry < Date.now() + 60_000) {
            localStorage.removeItem(AUTH_STORAGE_KEY);
            return null;
        }
        // Discard any token below MIN_TOKEN_VERSION — the server will reject it anyway,
        // and reusing an obsolete token here causes a "session expired" loop on chat.
        const payload = decodeJwtPayload(session.token);
        const version = typeof payload?.v === "number" ? (payload.v as number) : 0;
        if (version < MIN_TOKEN_VERSION) {
            localStorage.removeItem(AUTH_STORAGE_KEY);
            return null;
        }
        return session;
    } catch {
        return null;
    }
}

function clearAuthStorage() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
}

/** Map TezosNetwork → auth Network (collapses shadownet → ghostnet for SIWE chain ID purposes). */
function authNetwork(): Network {
    return config.name === "mainnet" ? "mainnet" : "ghostnet";
}

/** Sign a SIWE-style challenge and exchange it for a JWT via the chat worker /auth endpoint. */
async function authenticateWallet(c: DAppClient, addr: string): Promise<AuthSession> {
    const { signMessage, buildAuthChallenge } = await import("../lib/signing");
    const url = new URL(siteUrl);
    const { message } = buildAuthChallenge({
        address: addr,
        domain: url.host,
        uri: siteUrl,
        network: authNetwork(),
    });
    const { signature, publicKey } = await signMessage(c, message);

    const res = await fetch(`${hackchatUrl}/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: addr, publicKey, signature, message }),
    });

    if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Auth failed" }));
        throw new Error((body as Record<string, string>).error ?? `HTTP ${res.status}`);
    }

    const data = (await res.json()) as { token: string; domains: string[]; activeDomain: string | null };
    return { token: data.token, domains: data.domains, activeDomain: data.activeDomain };
}

/** Call /auth/refresh, optionally requesting a different active domain. */
async function callRefresh(token: string, activeDomainOverride?: string): Promise<AuthSession | null> {
    try {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        };
        if (activeDomainOverride) headers["X-Active-Domain"] = activeDomainOverride;
        const res = await fetch(`${hackchatUrl}/auth/refresh`, { method: "POST", headers });
        if (!res.ok) return null;
        const data = (await res.json()) as { token: string; domains: string[]; activeDomain: string | null };
        return { token: data.token, domains: data.domains, activeDomain: data.activeDomain };
    } catch {
        return null;
    }
}

export function TezosProvider({ children }: { children: ReactNode }) {
    // Synchronously seed from stored JWT to prevent CLS on first render.
    const seedRef = useRef<AuthSession | null | undefined>(undefined);
    if (seedRef.current === undefined) {
        seedRef.current = typeof window !== "undefined" ? loadAuthSession() : null;
    }
    const seed = seedRef.current;

    const [address, setAddress] = useState<string | null>(null);
    const [domain, setDomain] = useState<string | null>(
        seed?.activeDomain ?? seed?.domains[0] ?? null,
    );
    const [connecting, setConnecting] = useState(false);
    const [restoring, setRestoring] = useState(
        () => typeof window !== "undefined" && hasBeaconSession(),
    );
    const [client, setClient] = useState<DAppClient | null>(null);
    const [authError, setAuthError] = useState<string | null>(null);
    const subscribedRef = useRef(false);

    const [token, setToken] = useState<string | null>(seed?.token ?? null);
    const [chatDomains, setChatDomains] = useState<string[]>(seed?.domains ?? []);
    const [activeDomain, setActiveDomainState] = useState<string | null>(seed?.activeDomain ?? null);
    const tokenRef = useRef<string | null>(seed?.token ?? null);

    // Push the seed into authedFetch's module state immediately so any pre-mount
    // network call (unlikely but possible) sees it.
    if (seed && typeof window !== "undefined") {
        const snapshot = getSessionSnapshotIfStale(seed);
        if (snapshot) setSession(snapshot, { broadcast: false });
    }

    const applySession = useCallback((session: AuthSession, opts: { broadcast?: boolean } = {}) => {
        setToken(session.token);
        setChatDomains(session.domains);
        setActiveDomainState(session.activeDomain);
        tokenRef.current = session.token;
        saveAuthSession(session);
        setSession(
            { token: session.token, activeDomain: session.activeDomain, domains: session.domains },
            { broadcast: opts.broadcast },
        );
    }, []);

    const clearSession = useCallback((opts: { broadcast?: boolean } = {}) => {
        setToken(null);
        setChatDomains([]);
        setActiveDomainState(null);
        tokenRef.current = null;
        clearAuthStorage();
        setSession({ token: null, activeDomain: null, domains: [] }, { broadcast: opts.broadcast });
    }, []);

    /** Public refresh — used by callers who just want to force a refresh (e.g. PendingCommitsPanel). */
    const refreshTokenFn = useCallback(async () => {
        const t = tokenRef.current;
        if (!t) {
            // No token but we have a wallet — full re-auth.
            if (client && address) {
                try {
                    const session = await authenticateWallet(client, address);
                    applySession(session);
                } catch { /* silent */ }
            }
            return;
        }
        const refreshed = await callRefresh(t);
        if (refreshed) applySession(refreshed);
    }, [client, address, applySession]);

    // Wire up authedFetch handlers ONCE per provider lifetime.
    // The handlers close over tokenRef so they always see the latest token.
    useEffect(() => {
        setAuthHandlers({
            refresh: async (): Promise<SessionSnapshot | null> => {
                const t = tokenRef.current;
                if (!t) return null;
                const refreshed = await callRefresh(t);
                if (!refreshed) return null;
                applySession(refreshed);
                return {
                    token: refreshed.token,
                    activeDomain: refreshed.activeDomain,
                    domains: refreshed.domains,
                };
            },
            onAuthLost: () => {
                // Refresh failed at the network layer — server says this token is dead.
                // Clear local session but KEEP wallet connected; user can re-sign on next action.
                clearSession();
                setAuthError("Your session expired. Please sign in again.");
            },
        });
    }, [applySession, clearSession]);

    // Subscribe to cross-tab session updates from BroadcastChannel.
    useEffect(() => {
        const unsub = subscribeToSession((snap) => {
            // Only act on REMOTE updates: if local state already matches, skip.
            if (snap.token === tokenRef.current) return;
            if (!snap.token) {
                // Another tab logged out.
                setToken(null);
                setChatDomains([]);
                setActiveDomainState(null);
                tokenRef.current = null;
                clearAuthStorage();
                return;
            }
            // Another tab refreshed/logged in — adopt their session.
            setToken(snap.token);
            setChatDomains(snap.domains);
            setActiveDomainState(snap.activeDomain);
            tokenRef.current = snap.token;
            saveAuthSession({
                token: snap.token,
                domains: snap.domains,
                activeDomain: snap.activeDomain,
            });
        });
        return unsub;
    }, []);

    // Visibility/focus refresh: when the tab becomes visible OR window focused,
    // and the token is in the refresh window, kick off a refresh. This is THE
    // mechanism that fixes "session invalid after a few minutes" — before, we
    // only had a setTimeout that could be killed by the OS suspending the tab.
    useEffect(() => {
        function maybeRefresh() {
            const t = tokenRef.current;
            if (!t) return;
            const exp = getTokenExpiryMs(t);
            if (!exp) return;
            const remaining = exp - Date.now();
            if (remaining <= 0) {
                // Already expired — clear and let the user re-sign.
                clearSession();
                return;
            }
            if (remaining < REFRESH_THRESHOLD_MS) {
                void refreshSession();
            }
        }
        function onVisibilityChange() {
            if (document.visibilityState === "visible") maybeRefresh();
        }
        window.addEventListener("focus", maybeRefresh);
        document.addEventListener("visibilitychange", onVisibilityChange);
        // Also schedule a periodic check every 5 minutes — covers the case where
        // the tab is visible the whole time and we never get a focus event.
        const interval = setInterval(maybeRefresh, 5 * 60 * 1000);
        // Fire one immediately to catch any seed token that's already in the window.
        maybeRefresh();
        return () => {
            window.removeEventListener("focus", maybeRefresh);
            document.removeEventListener("visibilitychange", onVisibilityChange);
            clearInterval(interval);
        };
    }, [clearSession]);

    const hydrateAccount = useCallback(async (addr: string) => {
        setAddress(addr);
        const name = await resolveDisplayName(addr).catch(() => null);
        setDomain(name);
    }, []);

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

    // Session restore on mount.
    useEffect(() => {
        if (!hasBeaconSession()) {
            setRestoring(false);
            return;
        }
        initClient().then((c) => {
            c.getActiveAccount().then(async (account) => {
                if (!account) {
                    setRestoring(false);
                    return;
                }
                const stored = loadAuthSession();
                if (stored) applySession(stored, { broadcast: false });
                await hydrateAccount(account.address);
                setRestoring(false);
            }).catch(() => setRestoring(false));
        }).catch(() => setRestoring(false));
    }, [hydrateAccount, initClient, applySession]);

    const connect = useCallback(async () => {
        setConnecting(true);
        setAuthError(null);
        try {
            const sdk = await loadSDK();
            const c = await initClient();

            const existing = await c.getActiveAccount();
            let addr: string;
            if (existing) {
                const hasSign = existing.scopes?.includes(sdk.PermissionScope.SIGN);
                if (hasSign) {
                    addr = existing.address;
                } else {
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

            void hydrateAccount(addr);

            // Reuse stored JWT only if it's for THIS address (loadAuthSession
            // already enforces version + expiry).
            const stored = loadAuthSession();
            if (stored) {
                const payload = decodeJwtPayload(stored.token);
                const sub = (payload?.sub ?? payload?.address) as string | undefined;
                if (sub === addr) {
                    applySession(stored);
                    return;
                }
            }

            const session = await authenticateWallet(c, addr);
            applySession(session);
        } catch (err: unknown) {
            const errObj = err as Record<string, unknown>;
            const msg = err instanceof Error ? err.message : String(errObj?.message || "Authentication failed");
            setAuthError(msg);
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
    }, [hydrateAccount, initClient, applySession]);

    const setActiveDomain = useCallback(
        (newDomain: string) => {
            // Optimistic update.
            setActiveDomainState(newDomain);
            const stored = loadAuthSession();
            if (stored) {
                stored.activeDomain = newDomain;
                saveAuthSession(stored);
            }
            const t = tokenRef.current;
            if (!t) return;
            void (async () => {
                const refreshed = await callRefresh(t, newDomain);
                if (refreshed) applySession(refreshed);
            })();
        },
        [applySession],
    );

    const disconnect = useCallback(async () => {
        // Best-effort: tell the server to revoke the session before we forget the token.
        const t = tokenRef.current;
        if (t) {
            try {
                await fetch(`${hackchatUrl}/auth/logout`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${t}` },
                });
            } catch { /* ignore — local cleanup is what matters for UX */ }
        }
        if (client) await client.clearActiveAccount();
        setAddress(null);
        setDomain(null);
        clearSession();
    }, [client, clearSession]);

    const resetConnection = useCallback(async () => {
        try {
            if (dAppClient) await dAppClient.destroy();
        } catch { /* may already be destroyed */ }
        clearBeaconState();
        dAppClient = null;
        subscribedRef.current = false;
        setClient(null);
        setAddress(null);
        setDomain(null);
        clearSession();
    }, [clearSession]);

    // Clear JWT when wallet address changes.
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
                restoring,
                token,
                chatDomains,
                activeDomain,
                connect,
                disconnect,
                resetConnection,
                authError,
                refreshToken: refreshTokenFn,
                setActiveDomain,
            }}
        >
            {children}
        </TezosContext.Provider>
    );
}

/**
 * Helper: returns the snapshot to push into authedFetch's module state from
 * a freshly-loaded localStorage seed. Returns null if the seed is unusable.
 */
function getSessionSnapshotIfStale(seed: AuthSession): SessionSnapshot | null {
    if (!seed.token) return null;
    return {
        token: seed.token,
        activeDomain: seed.activeDomain,
        domains: seed.domains,
    };
}

export function useTezos() {
    const ctx = useContext(TezosContext);
    if (!ctx) throw new Error("useTezos must be used within TezosProvider");
    return ctx;
}
