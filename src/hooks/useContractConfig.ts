import { useState, useEffect } from "react";
import config from "../config/tezos";

interface ContractConfig {
    loading: boolean;
    minCommitAgeSec: number;
    maxCommitAgeSec: number;
    maxPerWallet: number;
    paused: boolean;
    registryTampered: boolean;
}

const DEFAULTS: ContractConfig = {
    loading: true,
    minCommitAgeSec: 30,
    maxCommitAgeSec: 86400,
    maxPerWallet: 1,
    paused: false,
    registryTampered: false,
};

const cache = new Map<string, { config: ContractConfig; time: number }>();
const CACHE_TTL = 300_000; // 5 minutes

export function useContractConfig(): ContractConfig {
    const cacheKey = config.registrarAddress ?? "";
    const cached = cache.get(cacheKey);
    const [state, setState] = useState<ContractConfig>(
        cached && Date.now() - cached.time < CACHE_TTL ? cached.config : DEFAULTS,
    );

    useEffect(() => {
        const hit = cache.get(cacheKey);
        if (hit && Date.now() - hit.time < CACHE_TTL) return;
        if (!cacheKey.length) return;

        fetch(`${config.tzktApi}/v1/contracts/${cacheKey}/storage`)
            .then((r) => r.json())
            .then((storage) => {
                const expected = config.expectedNameRegistry;
                const result: ContractConfig = {
                    loading: false,
                    minCommitAgeSec: parseInt(storage.min_commit_age, 10) || DEFAULTS.minCommitAgeSec,
                    maxCommitAgeSec: parseInt(storage.max_commit_age, 10) || DEFAULTS.maxCommitAgeSec,
                    maxPerWallet: parseInt(storage.max_per_wallet, 10) || DEFAULTS.maxPerWallet,
                    paused: storage.paused === true,
                    registryTampered: !!expected && storage.name_registry !== expected,
                };
                cache.set(cacheKey, { config: result, time: Date.now() });
                setState(result);
            })
            .catch(() => {
                setState({ ...DEFAULTS, loading: false });
            });
    }, [cacheKey]);

    return state;
}

/** Format seconds into human-readable "Xh Ym" or "Xm Ys" */
export function formatDuration(seconds: number): string {
    if (seconds >= 3600) {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
    }
    if (seconds >= 60) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    }
    return `${seconds}s`;
}
