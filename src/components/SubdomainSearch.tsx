import { useState, useEffect } from "react";
import { checkAvailability, validateLabel, isReserved } from "../lib/domains";
import { useTezos } from "../context/TezosContext";
import config from "../config/tezos";
import { useEligibility } from "../hooks/useEligibility";
import { useContractConfig, formatDuration } from "../hooks/useContractConfig";
import { submitCommit, submitRegister, labelToHexBytes, generateSalt } from "../lib/contract";
import {
    type PendingCommit,
    loadPendingCommits,
    savePendingCommit,
    removePendingCommit,
} from "../lib/commits";

type Status =
    | "idle"
    | "checking"
    | "available"
    | "taken"
    | "committing"
    | "committed"
    | "waiting"
    | "registering"
    | "success"
    | "error";

export default function SubdomainSearch() {
    const { client, address } = useTezos();
    const eligibility = useEligibility(address);
    const contractConfig = useContractConfig();
    const minCommitAgeMs = contractConfig.minCommitAgeSec * 1000;
    const [label, setLabel] = useState("");
    const [status, setStatus] = useState<Status>("idle");
    const [error, setError] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);
    const [pendingCommit, setPendingCommit] = useState<PendingCommit | null>(null);
    const [timeLeft, setTimeLeft] = useState<string | null>(null);

    // Check for existing pending commit when label changes
    useEffect(() => {
        if (!label || !address) return;
        const commits = loadPendingCommits();
        const existing = commits.find((c) => c.label === label && c.targetAddress === address);
        if (existing) {
            const elapsed = Date.now() - existing.commitTime;
            const maxCommitAgeMs = contractConfig.maxCommitAgeSec * 1000;
            if (elapsed > maxCommitAgeMs) {
                // Commitment expired — clean up
                removePendingCommit(existing.label);
                setPendingCommit(null);
                setStatus("idle");
                return;
            }
            setPendingCommit(existing);
            if (elapsed >= minCommitAgeMs) {
                setStatus("committed");
            } else {
                setStatus("waiting");
            }
        }
    }, [label, address, minCommitAgeMs, contractConfig.maxCommitAgeSec]);

    // Countdown timer for waiting state
    useEffect(() => {
        if (status !== "waiting" || !pendingCommit) return;
        const tick = () => {
            const elapsed = Date.now() - pendingCommit.commitTime;
            const remaining = minCommitAgeMs - elapsed;
            if (remaining <= 0) {
                setStatus("committed");
                setTimeLeft(null);
                return true;
            }
            const hrs = Math.floor(remaining / 3600000);
            const mins = Math.floor((remaining % 3600000) / 60000);
            const secs = Math.floor((remaining % 60000) / 1000);
            if (hrs > 0) {
                setTimeLeft(`${hrs}h ${mins}m ${secs}s`);
            } else if (mins > 0) {
                setTimeLeft(`${mins}m ${secs}s`);
            } else {
                setTimeLeft(`${secs}s`);
            }
            return false;
        };
        if (tick()) return;
        const interval = setInterval(() => {
            if (tick()) clearInterval(interval);
        }, 1000);
        return () => clearInterval(interval);
    }, [status, pendingCommit, minCommitAgeMs]);

    const handleSearch = async () => {
        setError(null);
        setTxHash(null);

        const validation = validateLabel(label);
        if (!validation.valid) {
            setError(validation.error!);
            return;
        }
        if (isReserved(label)) {
            setError("This name is reserved");
            return;
        }

        setStatus("checking");
        const searchLabel = label;
        try {
            const available = await checkAvailability(searchLabel);
            if (searchLabel !== label) return;
            if (!available) {
                setStatus("taken");
                return;
            }
            // Check for existing pending commit
            if (address) {
                const commits = loadPendingCommits();
                const existing = commits.find((c) => c.label === searchLabel && c.targetAddress === address);
                if (existing) {
                    setPendingCommit(existing);
                    const elapsed = Date.now() - existing.commitTime;
                    setStatus(elapsed >= minCommitAgeMs ? "committed" : "waiting");
                    return;
                }
            }
            setStatus("available");
        } catch {
            if (searchLabel !== label) return;
            setStatus("error");
            setError("Failed to check availability");
        }
    };

    const handleCommit = async () => {
        if (!client || !address) return;

        // Block if an active commitment already exists for this address (contract enforces 1 per wallet)
        const allCommits = loadPendingCommits();
        const activeForAddress = allCommits.find(
            (c) => c.targetAddress === address && Date.now() - c.commitTime < contractConfig.maxCommitAgeSec * 1000
        );
        if (activeForAddress && activeForAddress.label !== label) {
            setStatus("error");
            setError(`You already have an active commitment for "${activeForAddress.label}". Release it or wait for it to expire before committing a new name.`);
            return;
        }

        setStatus("committing");
        setError(null);

        try {
            const salt = generateSalt();
            const labelBytes = labelToHexBytes(label);

            const result = await submitCommit(client, {
                labelHex: labelBytes,
                sender: address,
                targetAddress: address,
                saltHex: salt,
            });

            const commit: PendingCommit = {
                label,
                targetAddress: address,
                salt,
                commitHash: result.commitmentHash,
                commitTime: Date.now(),
                txHash: result.transactionHash,
            };
            savePendingCommit(commit);
            setPendingCommit(commit);
            setTxHash(result.transactionHash);
            setStatus("waiting");
        } catch (e) {
            if (import.meta.env.DEV) console.error("Commit failed:", e);
            setStatus("error");
            setError(e instanceof Error ? e.message : "Commit failed");
        }
    };

    const handleRegister = async () => {
        if (!client || !address || !pendingCommit) return;

        setStatus("registering");
        setError(null);

        try {
            const result = await submitRegister(client, {
                label: labelToHexBytes(label),
                targetAddress: address,
                salt: pendingCommit.salt,
            });

            removePendingCommit(label);
            setPendingCommit(null);
            setTxHash(result.transactionHash);
            setStatus("success");
        } catch (e) {
            if (import.meta.env.DEV) console.error("Registration failed:", e);
            setStatus("error");
            setError(e instanceof Error ? e.message : "Registration failed");
        }
    };

    const waitDescription = formatDuration(contractConfig.minCommitAgeSec);

    return (
        <div style={{ width: "100%" }}>
            {/* Contract paused banner */}
            {contractConfig.paused && (
                <div className="status-panel status-panel--err" role="alert">
                    ⚠ Registrations are temporarily paused. Please check back later.
                </div>
            )}

            <div className="search-row" role="search">
                <div className="search-input-wrap">
                    <label htmlFor="subdomain-input" className="sr-only">
                        Subdomain name
                    </label>
                    <input
                        id="subdomain-input"
                        type="text"
                        value={label}
                        onChange={(e) => {
                            setLabel(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                            setStatus("idle");
                            setError(null);
                            setPendingCommit(null);
                        }}
                        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                        placeholder="yourname"
                        className="search-input"
                        autoComplete="off"
                        spellCheck={false}
                        aria-label="Enter subdomain name"
                        aria-describedby="search-suffix"
                    />
                    <span id="search-suffix" className="search-suffix" aria-hidden="true">
                        .hack.{config.tld}
                    </span>
                </div>
                <button
                    onClick={handleSearch}
                    disabled={!label || status === "checking" || contractConfig.paused}
                    className="search-btn"
                    aria-label={status === "checking" ? "Checking availability…" : "Search for subdomain"}
                >
                    {status === "checking" ? "…" : "Search"}
                </button>
            </div>

            {error && (
                <div className="status-panel status-panel--err" role="alert">
                    {error}
                </div>
            )}

            {status === "taken" && (
                <div className="status-panel status-panel--warn" role="status">
                    <strong>{label}.hack.{config.tld}</strong> is already taken.
                </div>
            )}

            {status === "available" && (
                <div className="status-panel status-panel--ok" role="status">
                    <p style={{ marginBottom: "0.6rem" }}>
                        ✓ <strong>{label}.hack.{config.tld}</strong> is available.
                    </p>

                    {!address && (
                        <p style={{ color: "var(--fg-2)", fontSize: "0.75rem" }}>
                            Connect your wallet to register this name.
                        </p>
                    )}

                    {address && !eligibility.eligible && (
                        <p style={{ color: "var(--warn)", fontSize: "0.75rem" }}>{eligibility.reason}</p>
                    )}

                    {address && eligibility.eligible && (
                        <div className="panel-action">
                            <p style={{ color: "var(--fg-2)", fontSize: "0.75rem", marginBottom: "0.75rem" }}>
                                Two steps: commit now, then register after {waitDescription}. Prevents frontrunning.
                            </p>
                            <button onClick={handleCommit} className="btn btn-primary btn-full">
                                Step 1 — Commit to {label}.hack.{config.tld}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {status === "committing" && (
                <div className="status-panel status-panel--info" role="status" aria-live="polite">
                    Submitting commitment… approve the transaction in your wallet.
                </div>
            )}

            {status === "waiting" && (
                <div className="status-panel status-panel--warn" role="status" aria-live="polite">
                    <p style={{ marginBottom: "0.35rem" }}>
                        ⏳ Committed — <strong>{label}.hack.{config.tld}</strong>
                    </p>
                    <p style={{ fontSize: "0.75rem" }}>
                        Register in: <strong className="mono">{timeLeft}</strong>
                    </p>
                    <p style={{ fontSize: "0.65rem", color: "var(--fg-2)", marginTop: "0.4rem" }}>
                        Safe to close — commitment saved locally and on-chain.
                    </p>
                    {pendingCommit?.txHash && (
                        <a
                            href={`https://${config.name === "mainnet" ? "" : `${config.name}.`}tzkt.io/${pendingCommit.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: "0.65rem", display: "inline-block", marginTop: "0.5rem" }}
                            aria-label="View commit transaction on TzKT (opens in new tab)"
                        >
                            View commit tx ↗
                        </a>
                    )}
                </div>
            )}

            {status === "committed" && (
                <div className="status-panel status-panel--ok" role="status">
                    <p style={{ marginBottom: "0.75rem" }}>
                        ✓ Commitment ready — <strong>{label}.hack.{config.tld}</strong>
                    </p>
                    <button onClick={handleRegister} className="btn btn-primary btn-full">
                        Step 2 — Register {label}.hack.{config.tld}
                    </button>
                </div>
            )}

            {status === "registering" && (
                <div className="status-panel status-panel--info" role="status" aria-live="polite">
                    Registering… approve the transaction in your wallet.
                </div>
            )}

            {status === "success" && (
                <div className="status-panel status-panel--ok" role="status" aria-live="polite">
                    <p style={{ marginBottom: "0.75rem" }}>
                        ✓ <strong>{label}.hack.{config.tld}</strong> registered.
                    </p>
                    <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                        {txHash && (
                            <a
                                href={`https://${config.name === "mainnet" ? "" : `${config.name}.`}tzkt.io/${txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ fontSize: "0.7rem" }}
                                aria-label="View registration transaction on TzKT (opens in new tab)"
                            >
                                View on TzKT ↗
                            </a>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
