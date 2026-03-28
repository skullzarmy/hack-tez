import { useState, useEffect } from "react";
import { useTezos } from "../context/TezosContext";
import { useContractConfig } from "../hooks/useContractConfig";
import { loadPendingCommits, removePendingCommit, type PendingCommit } from "../lib/commits";
import { submitRegister, submitReleaseCommitment, labelToHexBytes } from "../lib/contract";
import config from "../config/tezos";

type ClaimState = "idle" | "claiming" | "success" | "error";
type ReleaseState = "idle" | "releasing" | "error";

export default function PendingCommitsPanel() {
    const { client, address } = useTezos();
    const contractConfig = useContractConfig();
    const minCommitAgeMs = contractConfig.minCommitAgeSec * 1000;
    const maxCommitAgeMs = contractConfig.maxCommitAgeSec * 1000;
    const [commits, setCommits] = useState<PendingCommit[]>([]);
    const [claimState, setClaimState] = useState<Record<string, ClaimState>>({});
    const [claimError, setClaimError] = useState<Record<string, string>>({});
    const [releaseState, setReleaseState] = useState<Record<string, ReleaseState>>({});
    const [releaseError, setReleaseError] = useState<Record<string, string>>({});
    const [, setTick] = useState(0);

    useEffect(() => {
        if (!address) return;
        const all = loadPendingCommits().filter((c) => c.targetAddress === address);
        const now = Date.now();
        all.filter((c) => now - c.commitTime >= maxCommitAgeMs).forEach((c) => removePendingCommit(c.label));
        setCommits(all.filter((c) => now - c.commitTime < maxCommitAgeMs));
    }, [address, maxCommitAgeMs]);

    useEffect(() => {
        if (commits.length === 0) return;
        const interval = setInterval(() => setTick((t) => t + 1), 1000);
        return () => clearInterval(interval);
    }, [commits.length]);

    const handleClaim = async (commit: PendingCommit) => {
        if (!client || !address) return;
        setClaimState((s) => ({ ...s, [commit.label]: "claiming" }));
        setClaimError((s) => ({ ...s, [commit.label]: "" }));
        try {
            await submitRegister(client, {
                label: labelToHexBytes(commit.label),
                targetAddress: address,
                salt: commit.salt,
            });
            removePendingCommit(commit.label);
            setCommits((prev) => prev.filter((c) => c.label !== commit.label));
            setClaimState((s) => ({ ...s, [commit.label]: "success" }));
        } catch (e) {
            if (import.meta.env.DEV) console.error("Claim failed:", e);
            setClaimState((s) => ({ ...s, [commit.label]: "error" }));
            setClaimError((s) => ({
                ...s,
                [commit.label]: e instanceof Error ? e.message : "Registration failed",
            }));
        }
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

                return (
                    <div key={commit.label} className="pending-commit-card">
                        <div className="pending-commit-header">
                            <span className={ready ? "commit-badge commit-badge--ready" : "commit-badge commit-badge--waiting"}>
                                {ready ? "▶ CLAIM NOW" : "⏸ WAITING"}
                            </span>
                            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                                <span className="pending-expiry">expires in {expiresDisplay}</span>
                                <button
                                    className="btn-inline pending-dismiss"
                                    aria-label={`Release commitment for ${commit.label}`}
                                    disabled={relState === "releasing"}
                                    onClick={() => handleRelease(commit)}
                                >
                                    {relState === "releasing" ? "releasing…" : "✕ release"}
                                </button>
                                {relState === "error" && (
                                    <span className="pending-err" style={{ fontSize: "0.7rem" }}>
                                        {releaseError[commit.label] || "Failed"}{" "}
                                        <button onClick={() => handleRelease(commit)} className="btn-inline" aria-label="Retry release">
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
                                onClick={() => handleClaim(commit)}
                                className="btn btn-primary btn-full"
                                style={{ marginTop: "0.75rem" }}
                            >
                                Claim {commit.label}.hack.{config.tld}
                            </button>
                        )}

                        {state === "claiming" && (
                            <p className="pending-claiming">Claiming… approve in your wallet.</p>
                        )}

                        {state === "error" && (
                            <p className="pending-err">
                                {claimError[commit.label] || "Failed"} —{" "}
                                <button onClick={() => handleClaim(commit)} className="btn-inline" aria-label="Retry claim">
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
