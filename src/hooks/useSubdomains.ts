import { useState, useEffect, useCallback } from "react";
import { getSubdomainsByOwner, type SubdomainRecord } from "../lib/domains";

export function useSubdomains(address: string | null) {
    const [subdomains, setSubdomains] = useState<SubdomainRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!address) {
            setSubdomains([]);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const results = await getSubdomainsByOwner(address);
            setSubdomains(results);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load subdomains");
        } finally {
            setLoading(false);
        }
    }, [address]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { subdomains, loading, error, refresh };
}
