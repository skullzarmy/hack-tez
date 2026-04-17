import { useState, useEffect } from "react";
import config from "../config/tezos";

/** O(1) domain count via TzKT transaction count — works at any scale. */
export function useDomainCount(): number | null {
    const [count, setCount] = useState<number | null>(null);
    useEffect(() => {
        if (!config.registrarAddress) return;
        const ac = new AbortController();
        const url = `${config.tzktApi}/v1/operations/transactions/count?target=${config.registrarAddress}&entrypoint=register&status=applied`;
        fetch(url, { signal: ac.signal })
            .then((r) => r.json())
            .then((n) => {
                if (typeof n === "number") setCount(n);
            })
            .catch(() => {});
        return () => ac.abort();
    }, []);
    return count;
}
