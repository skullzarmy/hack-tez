/**
 * useArcade — data fetch + cache for the Hackcade lobby and game pages.
 *
 * - All authenticated mutations go through `authedFetch` (submit, score, flag,
 *   admin actions) — never construct an Authorization header here.
 * - Public reads go through plain `fetch`. Guests can see the lobby and play
 *   any game without ever touching the auth path.
 * - Background refreshes never wipe state: components read `data` and `loading`
 *   together, but `loading` only goes true on the very first fetch.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { authedFetch } from "../lib/authedFetch";

const API_BASE = "/api/v1/arcade";

export interface ArcadeGame {
    slug: string;
    title: string;
    description: string;
    category: string;
    builder: { domain: string; label: string; address: string };
    ipfsCid: string;
    version: number;
    playCount: number;
    playerCount: number;
    createdAt: string;
    updatedAt: string;
    // Detail-only fields:
    sourceUrl?: string | null;
    maxPossibleScore?: number | null;
    maxScorePerSecond?: number | null;
    status?: string;
}

export interface ArcadeScoreRow {
    rank: number;
    domain: string;
    label: string;
    score: number;
    lastPlayed: string;
}

export interface ArcadeGameDetail extends ArcadeGame {
    leaderboard: Array<{ domain: string; label: string; score: number; lastPlayed: string }>;
}

interface FetchState<T> {
    data: T | null;
    loading: boolean;
    error: string | null;
}

function emptyState<T>(): FetchState<T> {
    return { data: null, loading: true, error: null };
}

/** Generic poller that doesn't blank the UI on background refresh. */
function useFetched<T>(
    url: string | null,
    opts: { intervalMs?: number; auth?: boolean } = {},
): FetchState<T> & { reload: () => void } {
    const { intervalMs = 0, auth = false } = opts;
    const [state, setState] = useState<FetchState<T>>(emptyState<T>());
    const hasFetched = useRef(false);
    const tick = useRef(0);

    const load = useCallback(async () => {
        if (!url) return;
        const myTick = ++tick.current;
        if (!hasFetched.current) {
            setState((s) => ({ ...s, loading: true }));
        }
        try {
            const res = await (auth ? authedFetch(url) : fetch(url));
            const json = (await res.json()) as Record<string, unknown>;
            if (myTick !== tick.current) return;
            if (!res.ok) {
                const e = (json.error as string) || `HTTP ${res.status}`;
                setState({ data: null, loading: false, error: e });
                return;
            }
            hasFetched.current = true;
            setState({ data: json as T, loading: false, error: null });
        } catch (e) {
            if (myTick !== tick.current) return;
            const msg = e instanceof Error ? e.message : "fetch failed";
            setState({ data: null, loading: false, error: msg });
        }
    }, [url, auth]);

    useEffect(() => {
        hasFetched.current = false;
        load();
        if (!intervalMs) return;
        const id = setInterval(load, intervalMs);
        return () => clearInterval(id);
    }, [load, intervalMs]);

    return { ...state, reload: load };
}

export function useArcadeGames() {
    return useFetched<{ games: ArcadeGame[] }>(`${API_BASE}/games`);
}

export function useArcadeGame(slug: string | undefined) {
    return useFetched<{ game: ArcadeGameDetail; leaderboard: Array<{ domain: string; label: string; score: number; lastPlayed: string }> }>(
        slug ? `${API_BASE}/games/${encodeURIComponent(slug)}` : null,
    );
}

export function useArcadeLeaderboard(slug: string | undefined) {
    return useFetched<{ slug: string; leaderboard: ArcadeScoreRow[] }>(
        slug ? `${API_BASE}/leaderboard/${encodeURIComponent(slug)}` : null,
    );
}

export function useMyGames(domain: string | null) {
    const { reload, ...state } = useFetched<{ games: ArcadeGame[] }>(domain ? `${API_BASE}/my-games` : null, {
        auth: true,
    });
    return { ...state, reload };
}

export function useArcadePending(isAdmin: boolean) {
    return useFetched<{ pending: ArcadeGame[] }>(isAdmin ? `${API_BASE}/pending` : null, { auth: true });
}

export function useArcadePendingUpdates(isAdmin: boolean) {
    return useFetched<{ pendingUpdates: any[] }>(isAdmin ? `${API_BASE}/pending-updates` : null, { auth: true });
}

export function useArcadeFlagged(isAdmin: boolean) {
    return useFetched<{ flagged: ArcadeGame[] }>(isAdmin ? `${API_BASE}/flagged` : null, { auth: true });
}

export interface SessionResult {
    sessionId: string;
    gameId: string;
    ttlSeconds: number;
}

export async function startArcadeSession(slug: string): Promise<SessionResult> {
    const res = await authedFetch(`${API_BASE}/session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug }),
    });
    if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as any)?.error || `HTTP ${res.status}`);
    }
    return (await res.json()) as SessionResult;
}

export async function submitArcadeScore(args: {
    sessionId: string;
    score: number;
    durationSeconds: number;
    metadata?: unknown;
}): Promise<{ rank: number; isPersonalBest: boolean }> {
    const res = await authedFetch(`${API_BASE}/score`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(args),
    });
    if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as any)?.error || `HTTP ${res.status}`);
    }
    return (await res.json()) as { rank: number; isPersonalBest: boolean };
}

export async function flagArcadeGame(slug: string, reason: string): Promise<void> {
    const res = await authedFetch(`${API_BASE}/games/${encodeURIComponent(slug)}/flag`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
    });
    if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as any)?.error || `HTTP ${res.status}`);
    }
}

export async function adminAction(
    slug: string,
    action: "approve" | "reject" | "remove" | "approve-update" | "reject-update" | "unflag",
    body?: Record<string, unknown>,
): Promise<void> {
    const res = await authedFetch(`${API_BASE}/games/${encodeURIComponent(slug)}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as any)?.error || `HTTP ${res.status}`);
    }
}

export async function submitArcadeGame(form: FormData): Promise<{ slug: string; ipfsCid: string }> {
    const res = await authedFetch(`${API_BASE}/submit`, { method: "POST", body: form });
    if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as any)?.error || `HTTP ${res.status}`);
    }
    return (await res.json()) as { slug: string; ipfsCid: string };
}

export async function updateArcadeGame(slug: string, form: FormData): Promise<{ version: number; ipfsCid: string }> {
    const res = await authedFetch(`${API_BASE}/games/${encodeURIComponent(slug)}/update`, {
        method: "POST",
        body: form,
    });
    if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as any)?.error || `HTTP ${res.status}`);
    }
    return (await res.json()) as { version: number; ipfsCid: string };
}

/** Build the IPFS gateway URL for a game's index. Trailing slash is required. */
export function gameIframeUrl(cid: string): string {
    const gw = (import.meta.env.VITE_IPFS_GATEWAY as string | undefined) || "gateway.pinata.cloud";
    return `https://${gw}/ipfs/${cid}/`;
}
