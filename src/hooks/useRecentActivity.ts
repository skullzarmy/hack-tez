import { useState, useEffect, useRef, useCallback } from "react";

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

async function fetchActivity(limit = 30): Promise<ActivityEvent[]> {
    const res = await fetch(`/api/v1/activity?limit=${limit}`);
    if (!res.ok) return [];
    const { data } = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map(
        (e: { opHash: string; type: ActivityType; address: string; name: string | null; timestamp: string }) => ({
            id: e.opHash,
            type: e.type,
            address: e.address,
            name: e.name,
            timestamp: new Date(e.timestamp),
        }),
    );
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
            const fetched = await fetchActivity(30);

            // Find genuinely new events (not seen in any previous poll)
            const fresh: ActivityEvent[] = [];
            for (const event of fetched) {
                if (!seenIds.current.has(event.id)) {
                    fresh.push(event);
                    seenIds.current.add(event.id);
                }
            }

            setEvents(fetched);

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
