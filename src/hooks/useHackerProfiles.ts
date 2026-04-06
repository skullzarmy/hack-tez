import { useState, useEffect, useCallback, useMemo } from "react";
import type { HackProfile } from "../types/profile";
import type { SubdomainWithProfile } from "../lib/domains";
import { getAllSubdomains } from "../lib/domains";
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

interface BuilderApiRecord {
    name: string;
    owner: string;
    registeredAt: string;
    opHash: string;
}

const POLL_INTERVAL_MS = 60_000;

async function fetchBuildersApi(): Promise<BuilderApiRecord[]> {
    try {
        const res = await fetch("/api/v1/domains?limit=50&offset=0");
        if (!res.ok) return [];
        const json: { data: BuilderApiRecord[] } = await res.json();
        return json.data;
    } catch {
        return [];
    }
}

export interface UseHackerProfilesResult {
    hackers: HackerEntry[];
    isLoading: boolean;
    refresh: () => void;
    lastUpdated: Date | null;
}

export function useHackerProfiles(): UseHackerProfilesResult {
    const [subdomains, setSubdomains] = useState<SubdomainWithProfile[]>([]);
    const [builders, setBuilders] = useState<BuilderApiRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const [subs, blds] = await Promise.all([
                getAllSubdomains(),
                fetchBuildersApi(),
            ]);
            setSubdomains(subs);
            setBuilders(blds);
            setLastUpdated(new Date());
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

    const hackers = useMemo(() => {
        const builderMap = new Map<string, BuilderApiRecord>();
        for (const b of builders) {
            builderMap.set(b.name, b);
        }

        return subdomains.map((sub): HackerEntry => {
            const builder = builderMap.get(sub.name);
            return {
                label: sub.label,
                name: sub.name,
                owner: sub.owner,
                ownerShort: truncateAddr(sub.owner),
                address: sub.address,
                profile: sub.profile,
                timestamp: builder?.registeredAt ? new Date(builder.registeredAt) : null,
                opHash: builder?.opHash ?? null,
            };
        });
    }, [subdomains, builders]);

    return { hackers, isLoading, refresh: load, lastUpdated };
}
