/**
 * Authenticated fetch wrapper with rolling refresh, pre-flight expiry, and 401 retry.
 *
 * Design:
 * - Module-level singleton holding the current JWT + active domain.
 * - TezosContext owns the lifecycle (sets token on login, clears on logout) and
 *   provides the refresh implementation via `setAuthHandlers`.
 * - All authenticated network calls (chat REST, wiki, push, etc.) go through
 *   `authedFetch`. Hooks/components never touch the raw token themselves.
 * - Cross-tab sync via BroadcastChannel ('hack-tez-auth'). The `storage` event
 *   is fragile (doesn't fire in same tab, fires for unrelated keys); BroadcastChannel
 *   is purpose-built for this.
 * - Refresh leader election via `navigator.locks` so multiple tabs don't all
 *   hammer /auth/refresh on focus simultaneously.
 *
 * What this is NOT:
 * - It is not a state manager. Components subscribe to TezosContext for UI state.
 *   This module is purely the network/storage layer.
 */

const CHANNEL_NAME = "hack-tez-auth";
const REFRESH_LOCK = "hack-tez-auth-refresh";

/** Refresh proactively when token has less than this much life left. */
// Refresh when <3 days remain on the 30-day token. Plenty of slack for offline users.
export const REFRESH_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;

export interface SessionSnapshot {
  token: string | null;
  activeDomain: string | null;
  domains: string[];
  /**
   * The wallet's primary domain. Optional and unused by authedFetch itself —
   * it only rides along so a refresh result can carry it back to the context.
   * Absent on older stored sessions and on workers that predate the field.
   */
  primary?: string | null;
}

/**
 * Result of a refresh attempt. Discriminated so callers can distinguish
 * "the server explicitly rejected this token" (permanent — clear the session)
 * from "couldn't reach / 5xx / network blip" (transient — preserve and retry).
 *
 * Conflating these was the root cause of "session randomly disappears": a
 * single TED-graphql 502 used to cascade into a permanent logout.
 */
export type RefreshResult =
  | { ok: true; session: SessionSnapshot & { token: string } }
  | { ok: false; permanent: boolean };

let current: SessionSnapshot = { token: null, activeDomain: null, domains: [] };
const subscribers = new Set<(s: SessionSnapshot) => void>();
let channel: BroadcastChannel | null = null;

interface AuthHandlers {
  /** Called when authedFetch needs a fresh token. Should update state via setSession on success. */
  refresh: () => Promise<RefreshResult>;
  /** Called when refresh fails irrecoverably (server says no). Should clear local session. */
  onAuthLost: () => void;
}

let handlers: AuthHandlers | null = null;

/** Decode a JWT's `sub` claim without verifying. Returns null on any parse failure. */
function jwtSub(token: string): string | null {
  try {
    const seg = token.split(".")[1];
    if (!seg) return null;
    const base64 = seg.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as Record<string, unknown>;
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Initialize the BroadcastChannel listener. Idempotent. */
function ensureChannel() {
  if (channel || typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event) => {
    const data = event.data as { type: string; session?: SessionSnapshot; address?: string };
    if (data.type === "session" && data.session?.token) {
      // Only adopt POSITIVE remote sessions (login/refresh in another tab).
      // Remote nulls are NEVER propagated this way — see broadcastLogout for
      // explicit user logout. This prevents one tab's transient auth failure
      // from nuking other tabs' valid sessions.
      current = data.session;
      subscribers.forEach((cb) => cb(current));
    } else if (data.type === "logout" && typeof data.address === "string") {
      // Another tab told us a specific wallet logged out. Only clear if our
      // local session belongs to the same wallet — otherwise this logout
      // doesn't apply to us.
      const localSub = current.token ? jwtSub(current.token) : null;
      if (localSub && localSub === data.address) {
        current = { token: null, activeDomain: null, domains: [] };
        subscribers.forEach((cb) => cb(current));
      }
    }
  };
}

/**
 * Broadcast that a specific wallet has been intentionally disconnected.
 * Other tabs will clear their session ONLY if their JWT's sub claim matches
 * the given address. Use this from the explicit user-disconnect path.
 */
export function broadcastLogout(address: string) {
  ensureChannel();
  channel?.postMessage({ type: "logout", address });
}

/** Called by TezosContext to wire up the refresh + logout callbacks. */
export function setAuthHandlers(h: AuthHandlers) {
  handlers = h;
}

/** Get a snapshot of the current session. */
export function getSession(): SessionSnapshot {
  return current;
}

/** Update the current session (called by TezosContext on login/refresh/logout). */
export function setSession(snapshot: SessionSnapshot, opts: { broadcast?: boolean } = {}) {
  current = snapshot;
  subscribers.forEach((cb) => cb(snapshot));
  // Only broadcast POSITIVE snapshots (token present). Logout MUST go through
  // broadcastLogout(address) so receivers can verify the clear applies to them.
  if (opts.broadcast !== false && snapshot.token) {
    ensureChannel();
    channel?.postMessage({ type: "session", session: snapshot });
  }
}

/** Subscribe to session changes (cross-tab + local). Returns unsubscribe fn. */
export function subscribeToSession(cb: (s: SessionSnapshot) => void): () => void {
  ensureChannel();
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

/** Decode JWT exp claim without verifying signature (signature is server-side concern). */
export function getTokenExpiryMs(token: string): number | null {
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

/** Run a function under a navigator.locks lease so only one tab executes at a time. */
async function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator === "undefined" || !navigator.locks?.request) return fn();
  return navigator.locks.request(REFRESH_LOCK, fn);
}

let refreshInflight: Promise<RefreshResult> | null = null;

/**
 * Refresh the token. Coalesces concurrent calls in the same tab and uses
 * navigator.locks to coalesce across tabs.
 *
 * Returns a discriminated RefreshResult so callers can tell apart server
 * rejection (permanent) from transient failure (preserve session, retry later).
 */
export async function refreshSession(): Promise<RefreshResult> {
  if (!handlers) return { ok: false, permanent: false };
  if (refreshInflight) return refreshInflight;
  refreshInflight = (async () => {
    try {
      return await withRefreshLock(async () => {
        // Re-check current token under the lock — another tab may have just refreshed.
        const tokenAtStart = current.token;
        const expAtStart = tokenAtStart ? getTokenExpiryMs(tokenAtStart) : null;
        // If another tab already refreshed and we now have plenty of life left, skip.
        if (expAtStart && expAtStart - Date.now() > REFRESH_THRESHOLD_MS && tokenAtStart) {
          return { ok: true, session: { ...current, token: tokenAtStart } };
        }
        return handlers!.refresh();
      });
    } finally {
      refreshInflight = null;
    }
  })();
  return refreshInflight;
}

/**
 * Authenticated fetch. Attaches Bearer + X-Active-Domain (if set), refreshes
 * proactively when the token has <30min left, and retries once on 401.
 *
 * Session-clearing policy: onAuthLost is invoked ONLY when the server
 * explicitly rejects the token (refresh returns permanent failure, or the
 * post-refresh retry still 401s). Transient failures (network, 5xx, gateway
 * errors) are surfaced to the caller via the original Response — the session
 * stays intact and the next call will retry.
 */
export async function authedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);

  // Pre-flight: refresh if expiring soon.
  const token = current.token;
  if (token) {
    const exp = getTokenExpiryMs(token);
    if (exp && exp - Date.now() < REFRESH_THRESHOLD_MS) {
      const result = await refreshSession();
      if (result.ok && result.session.token) {
        headers.set("Authorization", `Bearer ${result.session.token}`);
        if (result.session.activeDomain) headers.set("X-Active-Domain", result.session.activeDomain);
      } else if (current.token) {
        // Refresh failed (transient or permanent) but token still locally
        // present — try with what we have. The server itself decides whether
        // it's actually still valid; we only react to its 401.
        headers.set("Authorization", `Bearer ${current.token}`);
        if (current.activeDomain) headers.set("X-Active-Domain", current.activeDomain);
      }
    } else {
      headers.set("Authorization", `Bearer ${token}`);
      if (current.activeDomain) headers.set("X-Active-Domain", current.activeDomain);
    }
  }

  let res = await fetch(input, { ...init, headers });

  if (res.status === 401 && current.token) {
    // Single retry: refresh + retry, then surface failure.
    const result = await refreshSession();
    if (result.ok && result.session.token) {
      const retryHeaders = new Headers(init.headers);
      retryHeaders.set("Authorization", `Bearer ${result.session.token}`);
      if (result.session.activeDomain) retryHeaders.set("X-Active-Domain", result.session.activeDomain);
      res = await fetch(input, { ...init, headers: retryHeaders });
      if (res.status === 401) {
        // Server has spoken twice — token really is dead.
        handlers?.onAuthLost();
      }
    } else if (!result.ok && result.permanent) {
      // Refresh endpoint returned 401/403 — the server is telling us the
      // session is revoked. Safe to clear.
      handlers?.onAuthLost();
    }
    // Transient refresh failure: do NOT clear the session. The original 401
    // may have been a transient server-side issue too; the next request
    // will get its own chance to refresh.
  }

  return res;
}
