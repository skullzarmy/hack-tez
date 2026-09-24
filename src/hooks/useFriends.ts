/**
 * useFriends — the signed-in wallet's follows (one-way, private).
 *
 * - One module-level store shared by every component, so a follow on a
 *   profile shows up in the directory's friends filter without a refetch.
 * - Loads once per signed-in wallet; background state never blanks.
 * - follow/unfollow are optimistic and roll back on failure.
 * - All requests go through `authedFetch`; guests just get an empty set.
 */

import { useCallback, useEffect, useState } from "react";
import { useTezos } from "../context/TezosContext";
import { authedFetch } from "../lib/authedFetch";

const API_BASE = "/api/v1/friends";

interface FriendsState {
    /** Wallet the set belongs to — null when signed out. */
    owner: string | null;
    following: ReadonlySet<string>;
    loaded: boolean;
    error: string | null;
}

let state: FriendsState = { owner: null, following: new Set(), loaded: false, error: null };
let inflight: string | null = null;
const subscribers = new Set<(s: FriendsState) => void>();

function setState(next: Partial<FriendsState>) {
    state = { ...state, ...next };
    for (const cb of subscribers) cb(state);
}

async function readError(res: Response): Promise<string> {
    try {
        const body = (await res.json()) as { error?: string };
        return body.error || `HTTP ${res.status}`;
    } catch {
        return `HTTP ${res.status}`;
    }
}

async function load(owner: string) {
    if (inflight === owner) return;
    inflight = owner;
    try {
        const res = await authedFetch(API_BASE);
        if (state.owner !== owner) return;
        if (!res.ok) {
            setState({ error: await readError(res) });
            return;
        }
        const body = (await res.json()) as { data: { following: string[] } };
        setState({ following: new Set(body.data.following), loaded: true, error: null });
    } catch {
        if (state.owner === owner) setState({ error: "Couldn't load your friends" });
    } finally {
        if (inflight === owner) inflight = null;
    }
}

async function mutate(target: string, add: boolean): Promise<boolean> {
    const before = state.following;
    const next = new Set(before);
    if (add) next.add(target);
    else next.delete(target);
    setState({ following: next, error: null });
    try {
        const res = await authedFetch(`${API_BASE}/${encodeURIComponent(target)}`, { method: add ? "PUT" : "DELETE" });
        if (res.ok) return true;
        setState({ following: before, error: await readError(res) });
    } catch {
        setState({ following: before, error: "Network error — try again" });
    }
    return false;
}

export interface UseFriendsResult {
    /** True once there's a signed-in session that can hold friends. */
    enabled: boolean;
    loaded: boolean;
    following: ReadonlySet<string>;
    error: string | null;
    isFollowing: (address: string) => boolean;
    follow: (address: string) => Promise<boolean>;
    unfollow: (address: string) => Promise<boolean>;
}

export function useFriends(): UseFriendsResult {
    const { address, token, activeDomain } = useTezos();
    const [snap, setSnap] = useState(state);
    const enabled = Boolean(address && token && activeDomain);

    useEffect(() => {
        subscribers.add(setSnap);
        return () => {
            subscribers.delete(setSnap);
        };
    }, []);

    useEffect(() => {
        const owner = enabled ? address : null;
        if (state.owner !== owner) setState({ owner, following: new Set(), loaded: false, error: null });
        if (owner && !state.loaded) void load(owner);
    }, [enabled, address]);

    const isFollowing = useCallback((a: string) => snap.following.has(a), [snap.following]);
    const follow = useCallback((a: string) => mutate(a, true), []);
    const unfollow = useCallback((a: string) => mutate(a, false), []);

    return {
        enabled,
        loaded: snap.loaded,
        following: snap.following,
        error: snap.error,
        isFollowing,
        follow,
        unfollow,
    };
}
