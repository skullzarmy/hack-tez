const COMMIT_STORAGE_KEY = "hack-tez-pending-commits";

export interface PendingCommit {
    label: string;
    targetAddress: string;
    salt: string;
    commitHash: string;
    commitTime: number; // epoch ms
    txHash: string;
}

export function loadPendingCommits(): PendingCommit[] {
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
