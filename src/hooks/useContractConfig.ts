import { useState, useEffect } from "react";
import config from "../config/tezos";

interface ContractConfig {
    loading: boolean;
    minCommitAgeSec: number;
    maxCommitAgeSec: number;
    maxPerWallet: number;
    paused: boolean;
}

const DEFAULTS: ContractConfig = {
    loading: true,
    minCommitAgeSec: 14400, // 4 hours fallback
    maxCommitAgeSec: 86400,
    maxPerWallet: 1,
    paused: false,
};

let cachedConfig: ContractConfig | null = null;
let cacheTime = 0;
const CACHE_TTL = 300_000; // 5 minutes

export function useContractConfig(): ContractConfig {
    const [state, setState] = useState<ContractConfig>(cachedConfig ?? DEFAULTS);

    useEffect(() => {
        if (cachedConfig && Date.now() - cacheTime < CACHE_TTL) return;
        if (!config.registrarAddress?.length) return;

        fetch(`${config.tzktApi}/v1/contracts/${config.registrarAddress}/storage`)
            .then((r) => r.json())
            .then((storage) => {
                const result: ContractConfig = {
                    loading: false,
                    minCommitAgeSec: parseInt(storage.min_commit_age, 10) || DEFAULTS.minCommitAgeSec,
                    maxCommitAgeSec: parseInt(storage.max_commit_age, 10) || DEFAULTS.maxCommitAgeSec,
                    maxPerWallet: parseInt(storage.max_per_wallet, 10) || DEFAULTS.maxPerWallet,
                    paused: storage.paused === true,
                };
                cachedConfig = result;
                cacheTime = Date.now();
                setState(result);
            })
            .catch(() => {
                setState({ ...DEFAULTS, loading: false });
            });
    }, []);

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
