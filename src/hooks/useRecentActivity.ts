import { useState, useEffect, useRef, useCallback } from "react";
import config from "../config/tezos";

export type ActivityType = "claimed" | "committed";

export interface ActivityEvent {
    id: string; // op hash — dedup key
    type: ActivityType;
    address: string; // raw address
    name: string | null; // label.tld — null for commits (hash is unrecoverable)
    timestamp: Date;
}

function truncateAddress(addr: string): string {
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}…${addr.slice(-3)}`;
}

/** TzKT returns Michelson `bytes` fields as lowercase hex strings — decode to UTF-8. */
function hexToUtf8(hex: string): string {
    try {
        const bytes = new Uint8Array(
            (hex.match(/.{1,2}/g) ?? []).map((b) => parseInt(b, 16)),
        );
        return new TextDecoder().decode(bytes);
    } catch {
        return hex;
    }
}

interface TzKTOp {
    hash: string;
    sender: { address: string; alias?: string };
    timestamp: string;
    parameter?: {
        entrypoint: string;
        value: Record<string, string>;
    };
    status: string;
}

async function fetchOps(entrypoint: "register" | "commit", limit = 20): Promise<ActivityEvent[]> {
    if (!config.registrarAddress) return [];

    const url = `${config.tzktApi}/v1/operations/transactions?target=${config.registrarAddress}&entrypoint=${entrypoint}&status=applied&limit=${limit}&sort.desc=id`;

    const res = await fetch(url);
    if (!res.ok) return [];

    const ops: TzKTOp[] = await res.json();

    return ops.map((op) => {
        const rawLabel = entrypoint === "register" ? op.parameter?.value?.label ?? null : null;
        const label = rawLabel ? hexToUtf8(rawLabel) : null;
        const name = label ? `${label}.hack.${config.tld}` : null;

        return {
            id: op.hash,
            type: entrypoint === "register" ? "claimed" : "committed",
            address: op.sender.address,
            name,
            timestamp: new Date(op.timestamp),
        };
    });
}

const POLL_INTERVAL_MS = 30_000;

export function truncateAddr(addr: string): string {
    return truncateAddress(addr);
}

export interface UseRecentActivityResult {
    events: ActivityEvent[];
    newEvents: ActivityEvent[];
    isLoading: boolean;
}

export function useRecentActivity(): UseRecentActivityResult {
    const [events, setEvents] = useState<ActivityEvent[]>([]);
    const [newEvents, setNewEvents] = useState<ActivityEvent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const seenIds = useRef<Set<string>>(new Set());
    const isFirstLoad = useRef(true);

    const poll = useCallback(async () => {
        try {
            const [claims, commits] = await Promise.all([
                fetchOps("register", 20),
                fetchOps("commit", 10),
            ]);

            const merged = [...claims, ...commits].sort(
                (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
            );

            // Deduplicate by id
            const seen = new Set<string>();
            const deduped = merged.filter((e) => {
                if (seen.has(e.id)) return false;
                seen.add(e.id);
                return true;
            });

            // Find genuinely new events (not seen in any previous poll)
            const fresh: ActivityEvent[] = [];
            for (const event of deduped) {
                if (!seenIds.current.has(event.id)) {
                    fresh.push(event);
                    seenIds.current.add(event.id);
                }
            }

            setEvents(deduped.slice(0, 30));

            // On first load we don't fire toasts — just seed the seen set
            if (!isFirstLoad.current && fresh.length > 0) {
                setNewEvents(fresh);
            }

            isFirstLoad.current = false;
        } catch {
            // Silently swallow — feed is best-effort
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        poll();
        const id = setInterval(poll, POLL_INTERVAL_MS);
        return () => clearInterval(id);
    }, [poll]);

    return { events, newEvents, isLoading };
}
