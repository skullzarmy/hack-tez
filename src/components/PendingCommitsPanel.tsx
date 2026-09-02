import { useState, useEffect } from "react";
import { useTezos } from "../context/TezosContext";
import { useContractConfig } from "../hooks/useContractConfig";
import { loadPendingCommits, removePendingCommit, type PendingCommit } from "../lib/commits";
import { submitRegister, submitReleaseCommitment, labelToHexBytes } from "../lib/contract";
import { waitForOperation } from "../lib/tzkt";
import { getSubdomainsByOwner, type SubdomainRecord } from "../lib/domains";
import config from "../config/tezos";

type ClaimState = "idle" | "claiming" | "confirming" | "fetching" | "success" | "error";
type ReleaseState = "idle" | "releasing" | "error";

const SUBDOMAIN_FETCH_RETRIES = 8;
const SUBDOMAIN_FETCH_DELAY_MS = 3000;

async function fetchSubdomainWithRetry(address: string, label: string): Promise<SubdomainRecord> {
    const expected = `${label}.hack.${config.tld}`;
    for (let i = 0; i < SUBDOMAIN_FETCH_RETRIES; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, SUBDOMAIN_FETCH_DELAY_MS));
        const subs = await getSubdomainsByOwner(address);
        const match = subs.find((s) => s.name === expected);
        if (match) return match;
    }
    // GraphQL indexer still hasn't caught up — return a minimal record from known data
    return { name: expected, address, owner: address, data: [], profile: {} };
}

export default function PendingCommitsPanel({
    commitKey = 0,
    onRelease,
    onClaim,
}: {
    commitKey?: number;
    onRelease?: () => void;
    onClaim?: (subdomain: SubdomainRecord) => void;
}) {
    const { client, address, refreshToken } = useTezos();
    const contractConfig = useContractConfig();
    const minCommitAgeMs = contractConfig.minCommitAgeSec * 1000;
    const maxCommitAgeMs = contractConfig.maxCommitAgeSec * 1000;
    const [commits, setCommits] = useState<PendingCommit[]>([]);
    const [claimState, setClaimState] = useState<Record<string, ClaimState>>({});
    const [claimError, setClaimError] = useState<Record<string, string>>({});
    const [releaseState, setReleaseState] = useState<Record<string, ReleaseState>>({});
    const [releaseError, setReleaseError] = useState<Record<string, string>>({});
    const [, setTick] = useState(0);

    // biome-ignore lint/correctness/useExhaustiveDependencies: commitKey is an intentional external refresh trigger
    useEffect(() => {
        if (!address) return;
        const load = () => {
            const all = loadPendingCommits().filter((c) => c.targetAddress === address);
            const now = Date.now();
            all.filter((c) => now - c.commitTime >= maxCommitAgeMs).forEach((c) => removePendingCommit(c.label));
            setCommits(all.filter((c) => now - c.commitTime < maxCommitAgeMs));
        };
        load();
        window.addEventListener("pendingcommit", load);
        return () => window.removeEventListener("pendingcommit", load);
    }, [address, maxCommitAgeMs, commitKey]);

    useEffect(() => {
        if (commits.length === 0) return;
        const interval = setInterval(() => setTick((t) => t + 1), 1000);
        return () => clearInterval(interval);
    }, [commits.length]);

    const handleClaim = async (commit: PendingCommit) => {
        if (!client || !address) return;
        setClaimError((s) => ({ ...s, [commit.label]: "" }));

        // Phase 1: wallet approval
        setClaimState((s) => ({ ...s, [commit.label]: "claiming" }));
        let opHash: string;
        try {
            const result = await submitRegister(client, {
                label: labelToHexBytes(commit.label),
                targetAddress: address,
                salt: commit.salt,
            });
            opHash = (result as { transactionHash: string }).transactionHash;
        } catch (e) {
            if (import.meta.env.DEV) console.error("Claim wallet error:", e);
            setClaimState((s) => ({ ...s, [commit.label]: "error" }));
            setClaimError((s) => ({
                ...s,
                [commit.label]: e instanceof Error ? e.message : "Wallet rejected",
            }));
            return;
        }

        // Phase 2: wait for on-chain confirmation
        setClaimState((s) => ({ ...s, [commit.label]: "confirming" }));
        let opResult: Awaited<ReturnType<typeof waitForOperation>>;
        try {
            opResult = await waitForOperation(opHash);
        } catch (e) {
            setClaimState((s) => ({ ...s, [commit.label]: "error" }));
            setClaimError((s) => ({
                ...s,
                [commit.label]: e instanceof Error ? e.message : "Confirmation timed out",
            }));
            return;
        }

        if (opResult.status !== "applied") {
            setClaimState((s) => ({ ...s, [commit.label]: "error" }));
            setClaimError((s) => ({
                ...s,
                [commit.label]: opResult.errorMessage ?? "Transaction failed on-chain",
            }));
            return;
        }

        // Phase 3: fetch the real subdomain record from the indexer
        setClaimState((s) => ({ ...s, [commit.label]: "fetching" }));
        let subdomain: SubdomainRecord;
        try {
            subdomain = await fetchSubdomainWithRetry(address, commit.label);
        } catch (_e) {
            setClaimState((s) => ({ ...s, [commit.label]: "error" }));
            setClaimError((s) => ({
                ...s,
                [commit.label]: "Registered on-chain but failed to fetch record — please refresh",
            }));
            return;
        }

        removePendingCommit(commit.label);
        setCommits((prev) => prev.filter((c) => c.label !== commit.label));
        setClaimState((s) => ({ ...s, [commit.label]: "success" }));
        onClaim?.(subdomain);
        onRelease?.();

        // Provision label.hacktez.com subdomain (CNAME + domain alias) — fire and forget
        fetch(`/api/v1/domain/${encodeURIComponent(commit.label)}/provision`, { method: "POST" }).catch(() => {});

        // Refresh JWT so the newly claimed domain is included
        void refreshToken();
    };

    const handleRelease = async (commit: PendingCommit) => {
        if (!client) return;
        setReleaseState((s) => ({ ...s, [commit.label]: "releasing" }));
        setReleaseError((s) => ({ ...s, [commit.label]: "" }));
        try {
            await submitReleaseCommitment(client);
            removePendingCommit(commit.label);
            setCommits((prev) => prev.filter((c) => c.label !== commit.label));
            setReleaseState((s) => ({ ...s, [commit.label]: "idle" }));
            onRelease?.();
        } catch (e) {
            if (import.meta.env.DEV) console.error("Release failed:", e);
            setReleaseState((s) => ({ ...s, [commit.label]: "error" }));
            setReleaseError((s) => ({
                ...s,
                [commit.label]: e instanceof Error ? e.message : "Release failed",
            }));
        }
    };

    if (commits.length === 0) return null;

    const now = Date.now();

    return (
        <div className="pending-panel">
            <div className="pending-panel-title">Pending Commitment</div>
            {commits.map((commit) => {
                const elapsed = now - commit.commitTime;
                const ready = elapsed >= minCommitAgeMs;
                const remaining = Math.max(0, minCommitAgeMs - elapsed);
                const remMins = Math.floor(remaining / 60000);
                const remSecs = Math.floor((remaining % 60000) / 1000);
                const timeLeft = remMins > 0 ? `${remMins}m ${remSecs}s` : `${remSecs}s`;
                const expiresInMs = Math.max(0, commit.commitTime + maxCommitAgeMs - now);
                const expiresHrs = Math.floor(expiresInMs / 3600000);
                const expiresMins = Math.floor((expiresInMs % 3600000) / 60000);
                const expiresDisplay = expiresHrs > 0 ? `${expiresHrs}h ${expiresMins}m` : `${expiresMins}m`;
                const state = claimState[commit.label] ?? "idle";
                const relState = releaseState[commit.label] ?? "idle";
                const isBusy = state === "claiming" || state === "confirming" || state === "fetching";

                return (
                    <div key={commit.label} className="pending-commit-card">
                        <div className="pending-commit-header">
                            <span
                                className={
                                    ready ? "commit-badge commit-badge--ready" : "commit-badge commit-badge--waiting"
                                }
                            >
                                {ready ? "▶ CLAIM NOW" : "⏸ WAITING"}
                            </span>
                            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                                <span className="pending-expiry">expires in {expiresDisplay}</span>
                                <button
                                    type="button"
                                    className="btn-inline pending-dismiss pending-release"
                                    aria-label={`Release commitment for ${commit.label}`}
                                    disabled={relState === "releasing" || isBusy}
                                    onClick={() => handleRelease(commit)}
                                >
                                    {relState === "releasing" ? "releasing…" : "✕ release"}
                                </button>
                                {relState === "error" && (
                                    <span className="pending-err" style={{ fontSize: "0.7rem" }}>
                                        {releaseError[commit.label] || "Failed"}{" "}
                                        <button
                                            type="button"
                                            onClick={() => handleRelease(commit)}
                                            className="btn-inline"
                                            aria-label="Retry release"
                                        >
                                            retry
                                        </button>
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="pending-commit-name mono">
                            {commit.label}.hack.{config.tld}
                        </div>

                        {!ready && (
                            <div className="pending-countdown">
                                <span className="pending-countdown-label">claimable in</span>
                                <span className="pending-countdown-timer mono">{timeLeft}</span>
                            </div>
                        )}

                        {ready && state === "idle" && (
                            <button
                                type="button"
                                onClick={() => handleClaim(commit)}
                                className="btn btn-primary btn-full"
                                style={{ marginTop: "0.75rem" }}
                            >
                                Claim {commit.label}.hack.{config.tld}
                            </button>
                        )}

                        {state === "claiming" && <p className="pending-claiming">Waiting for wallet approval…</p>}

                        {state === "confirming" && <p className="pending-claiming">Confirming on-chain…</p>}

                        {state === "fetching" && <p className="pending-claiming">Fetching your record…</p>}

                        {state === "error" && (
                            <p className="pending-err">
                                {claimError[commit.label] || "Failed"} —{" "}
                                <button
                                    type="button"
                                    onClick={() => handleClaim(commit)}
                                    className="btn-inline"
                                    aria-label="Retry claim"
                                >
                                    retry
                                </button>
                            </p>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
