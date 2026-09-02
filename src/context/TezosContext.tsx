import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import type { DAppClient } from "@tezos-x/octez.connect-sdk";
import config, { hackchatUrl, siteUrl } from "../config/tezos";
import { resolveDisplayName } from "../lib/domains";
import {
    setSession,
    getSession,
    subscribeToSession,
    setAuthHandlers,
    refreshSession,
    broadcastLogout,
    getTokenExpiryMs,
    REFRESH_THRESHOLD_MS,
    type SessionSnapshot,
    type RefreshResult,
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
    /** Optional: sessions stored before primary domains existed lack it. */
    primary?: string | null;
}

/** Body of /auth and /auth/refresh. `primary` is absent on older workers. */
interface AuthResponse {
    token: string;
    domains: string[];
    activeDomain: string | null;
    primary?: string | null;
}

interface TezosState {
    client: DAppClient | null;
    address: string | null;
    domain: string | null;
    connecting: boolean;
    /** True while the wallet is showing the sign-in signature request. Lets the
     *  UI say "approve this in your wallet" instead of a generic spinner. */
    awaitingSignature: boolean;
    /** True while restoring a previous wallet session on mount. */
    restoring: boolean;
    token: string | null;
    chatDomains: string[];
    activeDomain: string | null;
    /** The wallet's designated primary domain — the identity we sign them into
     *  and the default for anything that needs "which one is you". */
    primaryDomain: string | null;
    /** True if any of the wallet's owned domains is the network's admin domain
     *  (admin.hack.tez on mainnet, admin.hack.gho on ghostnet). Centralized so
     *  no component re-implements admin gating. */
    isAdmin: boolean;
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
    keysToRemove.forEach((k) => {
        localStorage.removeItem(k);
    });
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

    const data = (await res.json()) as AuthResponse;
    return {
        token: data.token,
        domains: data.domains,
        activeDomain: data.activeDomain,
        primary: data.primary ?? null,
    };
}

/**
 * Call /auth/refresh.
 *
 * Returns a discriminated RefreshResult:
 *  - { ok: true, session }: server issued a fresh token
 *  - { ok: false, permanent: true }: server explicitly rejected (401/403) — token is dead
 *  - { ok: false, permanent: false }: transient failure (network, 5xx, gateway) — preserve session
 *
 * Conflating these (the previous `null` return) caused permanent logouts on
 * a single TED graphql 502.
 */
async function callRefresh(token: string, activeDomainOverride?: string): Promise<RefreshResult> {
    try {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        };
        if (activeDomainOverride) headers["X-Active-Domain"] = activeDomainOverride;
        const res = await fetch(`${hackchatUrl}/auth/refresh`, { method: "POST", headers });
        if (res.ok) {
            const data = (await res.json()) as AuthResponse;
            return {
                ok: true,
                session: {
                    token: data.token,
                    domains: data.domains,
                    activeDomain: data.activeDomain,
                    primary: data.primary ?? null,
                },
            };
        }
        // 401/403: server says this token is invalid/revoked. Permanent.
        if (res.status === 401 || res.status === 403) {
            return { ok: false, permanent: true };
        }
        // Anything else (5xx, 502 from TED lookup, 504 timeout, etc.): transient.
        return { ok: false, permanent: false };
    } catch {
        // Network error / fetch threw — never permanent.
        return { ok: false, permanent: false };
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
        seed?.activeDomain ?? seed?.primary ?? seed?.domains[0] ?? null,
    );
    const [connecting, setConnecting] = useState(false);
    const [awaitingSignature, setAwaitingSignature] = useState(false);
    const [restoring, setRestoring] = useState(
        () => typeof window !== "undefined" && hasBeaconSession(),
    );
    const [client, setClient] = useState<DAppClient | null>(null);
    const [authError, setAuthError] = useState<string | null>(null);
    const subscribedRef = useRef(false);

    const [token, setToken] = useState<string | null>(seed?.token ?? null);
    const [chatDomains, setChatDomains] = useState<string[]>(seed?.domains ?? []);
    const [activeDomain, setActiveDomainState] = useState<string | null>(seed?.activeDomain ?? null);
    const [primaryDomain, setPrimaryDomain] = useState<string | null>(seed?.primary ?? null);
    const tokenRef = useRef<string | null>(seed?.token ?? null);
    // User's last explicit picker choice. Survives across in-flight refreshes
    // so a stale-in-flight /auth/refresh response (still echoing the old
    // activeDomain because it was sent before the click) cannot snap the user
    // back. applySession() honors this intent over the server's echo.
    const activeDomainIntentRef = useRef<string | null>(seed?.activeDomain ?? null);

    // Admin gating follows the ACTIVE domain, not just ownership. Owning
    // admin.hack.tez but having skllz.hack.tez active should NOT show admin UI.
    // Switch identity via the wallet menu's domain picker to surface admin tools.
    const isAdmin = useMemo(() => {
        const adminDomain = `admin.hack.${config.tld}`;
        return activeDomain === adminDomain;
    }, [activeDomain]);

    // Push the seed into authedFetch's module state immediately so any pre-mount
    // network call (unlikely but possible) sees it. Must run EXACTLY ONCE — if
    // re-run after a token rotation, the stale seed snapshot would replay
    // through the cross-tab subscriber and stomp the live session (this was
    // the wallet-picker snap-back bug).
    const seedPushedRef = useRef(false);
    if (!seedPushedRef.current && seed && typeof window !== "undefined") {
        seedPushedRef.current = true;
        const snapshot = getSessionSnapshotIfStale(seed);
        if (snapshot) setSession(snapshot, { broadcast: false });
    }

    const applySession = useCallback((session: AuthSession, opts: { broadcast?: boolean } = {}) => {
        // Honor user's most-recent picker choice if it's still owned. Defends
        // against stale in-flight refresh responses overwriting the user's
        // domain switch.
        const intent = activeDomainIntentRef.current;
        const effectiveActive = intent && session.domains.includes(intent)
            ? intent
            : session.activeDomain;
        const effective: AuthSession = effectiveActive === session.activeDomain
            ? session
            : { ...session, activeDomain: effectiveActive };
        setToken(effective.token);
        setChatDomains(effective.domains);
        setActiveDomainState(effective.activeDomain);
        setPrimaryDomain(effective.primary ?? null);
        tokenRef.current = effective.token;
        // Keep the intent in sync with what we actually applied so future
        // applySession calls have a fresh anchor (rather than locking forever
        // on the very first user pick).
        activeDomainIntentRef.current = effective.activeDomain;
        saveAuthSession(effective);
        setSession(
            { token: effective.token, activeDomain: effective.activeDomain, domains: effective.domains },
            { broadcast: opts.broadcast },
        );
    }, []);

    const clearSession = useCallback((opts: { broadcast?: boolean } = {}) => {
        setToken(null);
        setChatDomains([]);
        setActiveDomainState(null);
        setPrimaryDomain(null);
        tokenRef.current = null;
        activeDomainIntentRef.current = null;
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
        const result = await callRefresh(t);
        if (result.ok) applySession(result.session);
        // Transient or permanent failure: the public refresher is a best-effort
        // hint; the regular auth lifecycle (authedFetch) will react to a real
        // 401 the next time we hit the server.
    }, [client, address, applySession]);

    // Wire up authedFetch handlers ONCE per provider lifetime.
    // The handlers close over tokenRef so they always see the latest token.
    useEffect(() => {
        setAuthHandlers({
            refresh: async (): Promise<RefreshResult> => {
                const t = tokenRef.current;
                if (!t) {
                    // No local token to refresh — treat as definitively logged out.
                    return { ok: false, permanent: true };
                }
                // Pass current activeDomain as X-Active-Domain so a refresh
                // triggered concurrently with a domain switch doesn't reset
                // the user's identity to whatever's in the (stale) JWT claims.
                const active = getSession().activeDomain ?? undefined;
                const result = await callRefresh(t, active);
                if (result.ok) {
                    applySession(result.session);
                }
                return result;
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
                setPrimaryDomain(null);
                tokenRef.current = null;
                clearAuthStorage();
                return;
            }
            // Another tab refreshed/logged in — adopt their session.
            // The broadcast snapshot carries only what authedFetch needs, so
            // read `primary` back off the shared storage the other tab wrote.
            const primary = loadAuthSession()?.primary ?? null;
            setToken(snap.token);
            setChatDomains(snap.domains);
            setActiveDomainState(snap.activeDomain);
            setPrimaryDomain(primary);
            tokenRef.current = snap.token;
            saveAuthSession({
                token: snap.token,
                domains: snap.domains,
                activeDomain: snap.activeDomain,
                primary,
            });
        });
        return unsub;
    }, []);

    // Visibility/focus refresh: when the tab becomes visible OR window focused,
    // and the token is in the refresh window, kick off a refresh. This is THE
    // mechanism that fixes "session invalid after a few minutes" — before, we
    // only had a setTimeout that could be killed by the OS suspending the tab.
    useEffect(() => {
        async function maybeRefresh() {
            const t = tokenRef.current;
            if (!t) return;
            const exp = getTokenExpiryMs(t);
            if (!exp) return;
            const remaining = exp - Date.now();
            if (remaining < REFRESH_THRESHOLD_MS) {
                // Includes already-expired (remaining <= 0). Try to refresh
                // FIRST. Only clear on permanent (server-rejected) failure.
                // If we were offline when the timer fired, a transient failure
                // here must NOT cost the user their session.
                const result = await refreshSession();
                if (!result.ok && result.permanent) {
                    clearSession();
                }
            }
        }
        function onFocus() { void maybeRefresh(); }
        function onVisibilityChange() {
            if (document.visibilityState === "visible") void maybeRefresh();
        }
        window.addEventListener("focus", onFocus);
        document.addEventListener("visibilitychange", onVisibilityChange);
        // Also schedule a periodic check every 5 minutes — covers the case where
        // the tab is visible the whole time and we never get a focus event.
        const interval = setInterval(() => { void maybeRefresh(); }, 5 * 60 * 1000);
        // Fire one immediately to catch any seed token that's already in the window.
        void maybeRefresh();
        return () => {
            window.removeEventListener("focus", onFocus);
            document.removeEventListener("visibilitychange", onVisibilityChange);
            clearInterval(interval);
        };
    }, [clearSession]);

    const hydrateAccount = useCallback(async (addr: string) => {
        setAddress(addr);
        const name = await resolveDisplayName(addr).catch(() => null);
        setDomain(name);
    }, []);

    // True while connect() is between "wallet permissions granted" and "SIWE
    // signature accepted". Publishing `address` in that window would flip the
    // whole app into its signed-in UI while the wallet is still showing the
    // sign prompt, so the connect flow holds it back until auth lands.
    const awaitingAuthRef = useRef(false);

    const initClient = useCallback(async (): Promise<DAppClient> => {
        const c = await getOrCreateClient();
        if (!subscribedRef.current) {
            subscribedRef.current = true;
            const sdk = await loadSDK();
            c.subscribeToEvent(sdk.BeaconEvent.ACTIVE_ACCOUNT_SET, (account) => {
                if (account) {
                    // requestPermissions() fires this before we've asked for a
                    // signature. connect() hydrates once authenticated.
                    if (!awaitingAuthRef.current) hydrateAccount(account.address);
                }
                // Beacon emits ACTIVE_ACCOUNT_SET with `account=null` during
                // transient reconnect/restore flux even when the wallet is
                // still connected. Do NOT clear address/session here — that
                // would silently nuke a valid JWT and force a re-sign-in.
                // Real disconnects come via the explicit disconnect() call;
                // real address changes are handled by the address-change
                // effect below; server-rejected refreshes are handled by
                // onAuthLost.
            });
        }
        setClient(c);
        return c;
    }, [hydrateAccount]);

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
        awaitingAuthRef.current = true;
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

            // Reuse stored JWT only if it's for THIS address (loadAuthSession
            // already enforces version + expiry).
            const stored = loadAuthSession();
            if (stored) {
                const payload = decodeJwtPayload(stored.token);
                const sub = (payload?.sub ?? payload?.address) as string | undefined;
                if (sub === addr) {
                    applySession(stored);
                    awaitingAuthRef.current = false;
                    void hydrateAccount(addr);
                    return;
                }
            }

            // Signature first — the signed-in UI only appears once the wallet
            // has actually approved the challenge.
            setAwaitingSignature(true);
            const session = await authenticateWallet(c, addr);
            applySession(session);
            awaitingAuthRef.current = false;
            void hydrateAccount(addr);
        } catch (err: unknown) {
            const errObj = err as Record<string, unknown>;
            const raw = err instanceof Error ? err.message : String(errObj?.message || "Authentication failed");
            // Beacon reports a user-rejected permission/signature as an abort.
            // That's a choice, not a fault — word it that way.
            const aborted =
                errObj?.errorType === "ABORTED_ERROR" || /abort|reject|denied|cancel/i.test(raw);
            setAuthError(
                aborted
                    ? "Sign-in cancelled — approve the signature request in your wallet to continue."
                    : raw,
            );
            if (import.meta.env.DEV) {
                console.error("Wallet connection failed:", {
                    errorType: errObj?.errorType,
                    description: errObj?.description,
                    message: errObj?.message,
                    raw: err,
                });
            }
        } finally {
            // Never leave the gate closed: a rejected signature leaves the
            // wallet paired but signed-out, and the next connect() goes
            // straight back to the sign prompt.
            awaitingAuthRef.current = false;
            setAwaitingSignature(false);
            setConnecting(false);
        }
    }, [hydrateAccount, initClient, applySession]);

    const setActiveDomain = useCallback(
        (newDomain: string) => {
            // Record user intent BEFORE any async work so concurrent
            // applySession calls (from in-flight refreshes) honor it.
            activeDomainIntentRef.current = newDomain;
            // Optimistic React state update.
            setActiveDomainState(newDomain);
            const stored = loadAuthSession();
            if (stored) {
                stored.activeDomain = newDomain;
                saveAuthSession(stored);
            }
            // Push the new activeDomain into authedFetch's module state
            // immediately so concurrent authedFetches send the correct
            // X-Active-Domain header.
            const t = tokenRef.current;
            if (t) {
                setSession(
                    { token: t, activeDomain: newDomain, domains: chatDomains },
                    { broadcast: false },
                );
            }
            if (!t) return;
            void (async () => {
                const result = await callRefresh(t, newDomain);
                if (result.ok) applySession(result.session);
                // Transient/permanent failure: keep optimistic update; the
                // next authedFetch will reconcile if the server disagrees.
            })();
        },
        [applySession, chatDomains],
    );

    const disconnect = useCallback(async () => {
        // Capture address BEFORE we tear down state — needed for the
        // cross-tab logout broadcast.
        const walletAddr = address;
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
        // Full teardown so the user never needs a separate "refresh" button.
        try {
            if (client) await client.clearActiveAccount();
        } catch { /* noop */ }
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
        // Notify other tabs AFTER local cleanup. Receivers compare against
        // their own JWT's sub claim and only clear if they're holding a
        // session for the same wallet.
        if (walletAddr) broadcastLogout(walletAddr);
    }, [address, client, clearSession]);

    const resetConnection = useCallback(async () => {
        // Retained for API compatibility — same behaviour as disconnect now.
        await disconnect();
    }, [disconnect]);

    // Track `restoring` via ref so the address-change effect can gate on the
    // current value without re-firing whenever `restoring` flips. During
    // Beacon hydration `address` may transition spuriously; we must not nuke
    // the session in that window.
    const restoringRef = useRef(restoring);
    useEffect(() => {
        restoringRef.current = restoring;
    }, [restoring]);

    // Clear JWT when wallet address changes (genuine wallet swap or explicit
    // disconnect). Skipped during the Beacon hydration phase to avoid
    // false-positive clears caused by transient null transitions.
    const prevAddressRef = useRef(address);
    useEffect(() => {
        const prev = prevAddressRef.current;
        prevAddressRef.current = address;
        if (restoringRef.current) return;
        if (address && prev && address !== prev) {
            // True wallet swap: previous and new are both real, and different.
            clearSession();
        }
        // We intentionally do NOT clear on `!address && prev`. The only
        // legitimate path to that transition is disconnect(), which clears
        // the session itself. Anything else (Beacon flux, hydration race,
        // SDK reset) is transient and must not cost the user their JWT.
    }, [address, clearSession]);

    return (
        <TezosContext.Provider
            value={{
                client,
                address,
                domain,
                connecting,
                awaitingSignature,
                restoring,
                token,
                chatDomains,
                activeDomain,
                primaryDomain,
                isAdmin,
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
