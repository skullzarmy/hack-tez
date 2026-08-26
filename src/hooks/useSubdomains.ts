import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { getSubdomainsByOwner, pickPrimary, type SubdomainRecord } from "../lib/domains";

const POLL_INTERVAL_MS = 30_000; // 30s auto-refresh

export function useSubdomains(address: string | null) {
    const [subdomains, setSubdomains] = useState<SubdomainRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const isMounted = useRef(true);
    const hasFetched = useRef(false);

    const refresh = useCallback(async () => {
        if (!address) {
            setSubdomains([]);
            return;
        }
        if (!hasFetched.current) setLoading(true);
        try {
            const results = await getSubdomainsByOwner(address);
            if (isMounted.current) {
                setSubdomains(results);
                setError(null);
                hasFetched.current = true;
            }
        } catch (e) {
            if (isMounted.current && !hasFetched.current) {
                setError(e instanceof Error ? e.message : "Failed to load subdomains");
            }
        } finally {
            if (isMounted.current) setLoading(false);
        }
    }, [address]);

    useEffect(() => {
        isMounted.current = true;
        hasFetched.current = false;
        refresh();
        const id = setInterval(refresh, POLL_INTERVAL_MS);
        return () => {
            isMounted.current = false;
            clearInterval(id);
        };
    }, [refresh]);

    // The wallet's primary record: the hack:primary marker if set, else the
    // lexicographically first owned domain. Null when they own none.
    const primary = useMemo(
        () => (address ? pickPrimary(address, subdomains) : null),
        [address, subdomains],
    );

    return { subdomains, primary, loading, error, refresh };
}
