import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { HackProfile } from "../types/profile";
import { truncateAddr } from "./useRecentActivity";

export interface HackerEntry {
    label: string;
    name: string;
    owner: string;
    ownerShort: string;
    address: string | null;
    profile: HackProfile;
    /** Registration timestamp from the builders API (if available) */
    timestamp: Date | null;
    /** Registration opHash — hackatar seed */
    opHash: string | null;
}

interface MembersApiRecord {
    name: string;
    label: string;
    owner: string;
    address: string | null;
    registeredAt: string | null;
    opHash: string | null;
    profile: HackProfile;
}

interface MembersApiPage {
    data: MembersApiRecord[];
    total: number;
}

const POLL_INTERVAL_MS = 60_000;
/** /api/v1/members page size cap — we page until `total`, so this is not a directory cap. */
const PAGE_SIZE = 1000;
/** Backstop so a misbehaving `total` can't spin forever. */
const MAX_PAGES = 50;

/**
 * Every registration, paged from /api/v1/members (one row per domain, same
 * cached snapshot the public API serves). This used to be a single
 * `/api/v1/domains?limit=200` call, which silently dropped everyone past
 * the 200th name alphabetically — from the directory and from sprinkles.
 */
async function fetchHackers(): Promise<HackerEntry[]> {
    const rows: MembersApiRecord[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
        const res = await fetch(`/api/v1/members?limit=${PAGE_SIZE}&offset=${rows.length}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: MembersApiPage = await res.json();
        rows.push(...json.data);
        if (json.data.length === 0 || rows.length >= json.total) break;
    }
    return rows.map((d): HackerEntry => ({
        label: d.label,
        name: d.name,
        owner: d.owner,
        ownerShort: truncateAddr(d.owner),
        address: d.address,
        profile: d.profile,
        timestamp: d.registeredAt ? new Date(d.registeredAt) : null,
        opHash: d.opHash,
    }));
}

export interface UseHackerProfilesResult {
    hackers: HackerEntry[];
    isLoading: boolean;
    refresh: () => void;
    lastUpdated: Date | null;
}

export function useHackerProfiles(): UseHackerProfilesResult {
    const [hackers, setHackers] = useState<HackerEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const hasFetched = useRef(false);

    const load = useCallback(async () => {
        // Only show loading spinner on the very first fetch
        if (!hasFetched.current) {
            setIsLoading(true);
        }
        try {
            const data = await fetchHackers();
            setHackers(data);
            setLastUpdated(new Date());
            hasFetched.current = true;
        } catch {
            // best-effort
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
        const id = setInterval(load, POLL_INTERVAL_MS);
        return () => clearInterval(id);
    }, [load]);

    // Stable memoized value — only changes when hackers array reference changes
    const stableHackers = useMemo(() => hackers, [hackers]);

    return { hackers: stableHackers, isLoading, refresh: load, lastUpdated };
}
