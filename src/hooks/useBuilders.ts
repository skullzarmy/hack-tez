import { useState, useEffect, useCallback } from "react";
import config from "../config/tezos";
import { hexToUtf8, truncateAddr } from "./useRecentActivity";

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

    const url = `${config.tzktApi}/v1/operations/transactions?target=${config.registrarAddress}&entrypoint=register&status=applied&limit=${LIMIT}&sort.desc=id`;
    const res = await fetch(url);
    if (!res.ok) return [];

    const ops: Array<{
        hash: string;
        sender: { address: string };
        timestamp: string;
        parameter?: { value?: { label?: string } };
    }> = await res.json();

    const seen = new Set<string>();
    const records: BuilderRecord[] = [];

    for (const op of ops) {
        const rawLabel = op.parameter?.value?.label ?? null;
        if (!rawLabel) continue;
        const label = hexToUtf8(rawLabel);
        const name = `${label}.hack.${config.tld}`;
        if (seen.has(name)) continue;
        seen.add(name);
        records.push({
            name,
            owner: op.sender.address,
            ownerShort: truncateAddr(op.sender.address),
            timestamp: new Date(op.timestamp),
            opHash: op.hash,
        });
    }

    return records.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
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
