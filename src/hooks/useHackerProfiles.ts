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

interface DomainsApiRecord {
    name: string;
    label: string;
    owner: string;
    address: string | null;
    registeredAt: string | null;
    opHash: string | null;
    profile: HackProfile;
}

const POLL_INTERVAL_MS = 60_000;
const LIMIT = 200;

async function fetchHackers(): Promise<HackerEntry[]> {
    const res = await fetch(`/api/v1/domains?limit=${LIMIT}&offset=0`);
    if (!res.ok) return [];
    const json: { data: DomainsApiRecord[] } = await res.json();
    return json.data.map((d): HackerEntry => ({
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
