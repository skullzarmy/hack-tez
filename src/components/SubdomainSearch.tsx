import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { checkAvailability, validateLabel, isReserved } from "../lib/domains";
import { useTezos } from "../context/TezosContext";
import config from "../config/tezos";
import { useEligibility } from "../hooks/useEligibility";
import { useContractConfig, formatDuration } from "../hooks/useContractConfig";
import { submitCommit, submitRegister, labelToHexBytes, generateSalt } from "../lib/contract";

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

function savePendingCommit(commit: PendingCommit) {
    const commits = loadPendingCommits().filter((c) => c.label !== commit.label);
    commits.push(commit);
    localStorage.setItem(COMMIT_STORAGE_KEY, JSON.stringify(commits));
}

function removePendingCommit(label: string) {
    const commits = loadPendingCommits().filter((c) => c.label !== label);
    localStorage.setItem(COMMIT_STORAGE_KEY, JSON.stringify(commits));
}

export default function SubdomainSearch() {
    const navigate = useNavigate();
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
        try {
            const available = await checkAvailability(label);
            if (!available) {
                setStatus("taken");
                return;
            }
            // Check for existing pending commit
            if (address) {
                const commits = loadPendingCommits();
                const existing = commits.find((c) => c.label === label && c.targetAddress === address);
                if (existing) {
                    setPendingCommit(existing);
                    const elapsed = Date.now() - existing.commitTime;
                    setStatus(elapsed >= minCommitAgeMs ? "committed" : "waiting");
                    return;
                }
            }
            setStatus("available");
        } catch {
            setStatus("error");
            setError("Failed to check availability");
        }
    };

    const handleCommit = async () => {
        if (!client || !address) return;

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
            console.error("Commit failed:", e);
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
            console.error("Registration failed:", e);
            setStatus("error");
            setError(e instanceof Error ? e.message : "Registration failed");
        }
    };

    const waitDescription = formatDuration(contractConfig.minCommitAgeSec);

    return (
        <div className="w-full max-w-lg mx-auto">
            {/* Contract paused banner */}
            {contractConfig.paused && (
                <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm text-center">
                    ⚠️ Registrations are temporarily paused. Please check back later.
                </div>
            )}

            <div className="flex gap-2">
                <div className="flex-1 relative">
                    <input
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
                        className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 font-mono text-sm">
                        .hack.{config.tld}
                    </span>
                </div>
                <button
                    onClick={handleSearch}
                    disabled={!label || status === "checking" || contractConfig.paused}
                    className="px-6 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors disabled:opacity-50 cursor-pointer"
                >
                    {status === "checking" ? "…" : "Search"}
                </button>
            </div>

            {error && (
                <div className="mt-3 p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">
                    {error}
                </div>
            )}

            {status === "taken" && (
                <div className="mt-3 p-3 rounded-lg bg-yellow-900/30 border border-yellow-800 text-yellow-300 text-sm">
                    <strong>
                        {label}.hack.{config.tld}
                    </strong>{" "}
                    is already taken.
                </div>
            )}

            {status === "available" && (
                <div className="mt-3 p-4 rounded-lg bg-emerald-900/30 border border-emerald-800">
                    <p className="text-emerald-300 font-medium mb-3">
                        ✓{" "}
                        <strong>
                            {label}.hack.{config.tld}
                        </strong>{" "}
                        is available!
                    </p>

                    {!address && (
                        <p className="text-gray-400 text-sm">Connect your wallet to register this subdomain.</p>
                    )}

                    {address && !eligibility.eligible && (
                        <p className="text-yellow-300 text-sm">{eligibility.reason}</p>
                    )}

                    {address && eligibility.eligible && (
                        <div>
                            <p className="text-gray-400 text-sm mb-3">
                                Registration is two steps: commit now, then register after {waitDescription}. This
                                prevents name frontrunning.
                            </p>
                            <button
                                onClick={handleCommit}
                                className="w-full px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors cursor-pointer"
                            >
                                Step 1: Commit to {label}.hack.{config.tld} (gas only)
                            </button>
                        </div>
                    )}
                </div>
            )}

            {status === "committing" && (
                <div className="mt-3 p-4 rounded-lg bg-blue-900/30 border border-blue-800 text-blue-300 text-sm">
                    Submitting commitment… please approve the transaction in your wallet.
                </div>
            )}

            {status === "waiting" && (
                <div className="mt-3 p-4 rounded-lg bg-amber-900/30 border border-amber-800">
                    <p className="text-amber-300 font-medium mb-1">
                        ⏳ Commitment submitted for{" "}
                        <strong>
                            {label}.hack.{config.tld}
                        </strong>
                    </p>
                    <p className="text-amber-200 text-sm">
                        You can register in: <strong className="font-mono">{timeLeft}</strong>
                    </p>
                    <p className="text-gray-400 text-xs mt-2">
                        You can close this page and come back later. Your commitment is saved locally and on-chain.
                    </p>
                    {pendingCommit?.txHash && (
                        <a
                            href={`https://${config.name === "mainnet" ? "" : `${config.name}.`}tzkt.io/${pendingCommit.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-amber-400 text-xs underline mt-1 inline-block"
                        >
                            View commit tx ↗
                        </a>
                    )}
                </div>
            )}

            {status === "committed" && (
                <div className="mt-3 p-4 rounded-lg bg-emerald-900/30 border border-emerald-800">
                    <p className="text-emerald-300 font-medium mb-3">
                        ✓ Your commitment for{" "}
                        <strong>
                            {label}.hack.{config.tld}
                        </strong>{" "}
                        is ready!
                    </p>
                    <button
                        onClick={handleRegister}
                        className="w-full px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors cursor-pointer"
                    >
                        Step 2: Register {label}.hack.{config.tld} (gas only)
                    </button>
                </div>
            )}

            {status === "registering" && (
                <div className="mt-3 p-4 rounded-lg bg-blue-900/30 border border-blue-800 text-blue-300 text-sm">
                    Registering… please approve the transaction in your wallet.
                </div>
            )}

            {status === "success" && (
                <div className="mt-3 p-4 rounded-lg bg-emerald-900/30 border border-emerald-800">
                    <p className="text-emerald-300 font-medium mb-2">
                        🎉{" "}
                        <strong>
                            {label}.hack.{config.tld}
                        </strong>{" "}
                        registered successfully!
                    </p>
                    <div className="flex items-center gap-3">
                        {txHash && (
                            <a
                                href={`https://${config.name === "mainnet" ? "" : `${config.name}.`}tzkt.io/${txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-emerald-400 text-xs underline"
                            >
                                View on TzKT ↗
                            </a>
                        )}
                        <button
                            onClick={() => navigate("/manage")}
                            className="text-emerald-400 text-xs underline cursor-pointer"
                        >
                            Manage your subdomains →
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
