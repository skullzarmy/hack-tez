import { useState, useEffect } from "react";
import { getTedContracts } from "../config/tezos";
import type { TedContracts } from "../config/tezos";

/** Async hook around getTedContracts() — returns null while resolving. */
export function useTedContracts(): TedContracts | null {
    const [contracts, setContracts] = useState<TedContracts | null>(null);

    useEffect(() => {
        let cancelled = false;
        getTedContracts()
            .then((c) => { if (!cancelled) setContracts(c); })
            .catch(() => { /* best-effort — null means unavailable */ });
        return () => { cancelled = true; };
    }, []);

    return contracts;
}
