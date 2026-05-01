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
export const REFRESH_THRESHOLD_MS = 30 * 60 * 1000;

export interface SessionSnapshot {
  token: string | null;
  activeDomain: string | null;
  domains: string[];
}

let current: SessionSnapshot = { token: null, activeDomain: null, domains: [] };
const subscribers = new Set<(s: SessionSnapshot) => void>();
let channel: BroadcastChannel | null = null;

interface AuthHandlers {
  /** Called when authedFetch needs a fresh token. Should update state via setSession on success. */
  refresh: () => Promise<SessionSnapshot | null>;
  /** Called when refresh fails irrecoverably (server says no). Should clear local session. */
  onAuthLost: () => void;
}

let handlers: AuthHandlers | null = null;

/** Initialize the BroadcastChannel listener. Idempotent. */
function ensureChannel() {
  if (channel || typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event) => {
    const data = event.data as { type: string; session?: SessionSnapshot };
    if (data.type === "session") {
      // Apply remote session WITHOUT rebroadcasting to avoid loops.
      current = data.session ?? { token: null, activeDomain: null, domains: [] };
      subscribers.forEach((cb) => cb(current));
    }
  };
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
  if (opts.broadcast !== false) {
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

let refreshInflight: Promise<SessionSnapshot | null> | null = null;

/**
 * Refresh the token. Coalesces concurrent calls in the same tab and uses
 * navigator.locks to coalesce across tabs.
 */
export async function refreshSession(): Promise<SessionSnapshot | null> {
  if (!handlers) return null;
  if (refreshInflight) return refreshInflight;
  refreshInflight = (async () => {
    try {
      return await withRefreshLock(async () => {
        // Re-check current token under the lock — another tab may have just refreshed.
        const tokenAtStart = current.token;
        const expAtStart = tokenAtStart ? getTokenExpiryMs(tokenAtStart) : null;
        // If another tab already refreshed and we now have plenty of life left, skip.
        if (expAtStart && expAtStart - Date.now() > REFRESH_THRESHOLD_MS) {
          return current;
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
 * On unrecoverable auth failure (refresh returns null, second 401), the underlying
 * Response is returned so the caller can decide. We do NOT throw — callers may
 * want to fall back to anonymous behavior.
 */
export async function authedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);

  // Pre-flight: refresh if expiring soon.
  const token = current.token;
  if (token) {
    const exp = getTokenExpiryMs(token);
    if (exp && exp - Date.now() < REFRESH_THRESHOLD_MS) {
      const refreshed = await refreshSession();
      if (refreshed?.token) {
        headers.set("Authorization", `Bearer ${refreshed.token}`);
        if (refreshed.activeDomain) headers.set("X-Active-Domain", refreshed.activeDomain);
      } else if (current.token) {
        // Refresh failed but token still locally present — try with what we have.
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
    const refreshed = await refreshSession();
    if (refreshed?.token) {
      const retryHeaders = new Headers(init.headers);
      retryHeaders.set("Authorization", `Bearer ${refreshed.token}`);
      if (refreshed.activeDomain) retryHeaders.set("X-Active-Domain", refreshed.activeDomain);
      res = await fetch(input, { ...init, headers: retryHeaders });
      if (res.status === 401) {
        handlers?.onAuthLost();
      }
    } else {
      handlers?.onAuthLost();
    }
  }

  return res;
}
