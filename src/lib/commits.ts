import config from "../config/tezos";

const COMMIT_STORAGE_KEY = "hack-tez-pending-commits";
const COMMIT_CONTRACT_KEY = "hack-tez-pending-commits-contract";

export interface PendingCommit {
    label: string;
    targetAddress: string;
    salt: string;
    commitHash: string;
    commitTime: number; // epoch ms
    txHash: string;
}

function clearIfContractChanged() {
    const stored = localStorage.getItem(COMMIT_CONTRACT_KEY);
    if (stored !== config.registrarAddress) {
        localStorage.removeItem(COMMIT_STORAGE_KEY);
        localStorage.setItem(COMMIT_CONTRACT_KEY, config.registrarAddress);
    }
}

export function loadPendingCommits(): PendingCommit[] {
    clearIfContractChanged();
    try {
        return JSON.parse(localStorage.getItem(COMMIT_STORAGE_KEY) || "[]");
    } catch {
        return [];
    }
}

export function savePendingCommit(commit: PendingCommit) {
    const commits = loadPendingCommits().filter((c) => c.label !== commit.label);
    commits.push(commit);
    localStorage.setItem(COMMIT_STORAGE_KEY, JSON.stringify(commits));
}

export function removePendingCommit(label: string) {
    const commits = loadPendingCommits().filter((c) => c.label !== label);
    localStorage.setItem(COMMIT_STORAGE_KEY, JSON.stringify(commits));
}
