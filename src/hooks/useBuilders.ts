import { useState, useEffect, useCallback } from "react";
import config from "../config/tezos";
import { truncateAddr } from "./useRecentActivity";

export interface BuilderRecord {
    name: string;
    owner: string;
    ownerShort: string;
    timestamp: Date;
    opHash: string;
}

const POLL_INTERVAL_MS = 30_000;
const LIMIT = 200;

async function fetchBuilders(): Promise<BuilderRecord[]> {
    if (!config.registrarAddress) return [];

    const res = await fetch(`/api/v1/domains?limit=${LIMIT}&offset=0`);
    if (!res.ok) return [];

    const json: {
        data: Array<{ name: string; owner: string; registeredAt: string; opHash: string }>;
    } = await res.json();

    return json.data.map((d) => ({
        name: d.name,
        owner: d.owner,
        ownerShort: truncateAddr(d.owner),
        timestamp: new Date(d.registeredAt),
        opHash: d.opHash,
    }));
}

export interface UseBuildersResult {
    builders: BuilderRecord[];
    isLoading: boolean;
    refresh: () => void;
    lastUpdated: Date | null;
}

export function useBuilders(): UseBuildersResult {
    const [builders, setBuilders] = useState<BuilderRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await fetchBuilders();
            setBuilders(data);
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

    return { builders, isLoading, refresh: load, lastUpdated };
}
