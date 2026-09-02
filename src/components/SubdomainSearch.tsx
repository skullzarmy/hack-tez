import { useState } from "react";
import { checkAvailability, validateLabel, isReserved } from "../lib/domains";
import { useTezos } from "../context/TezosContext";
import config from "../config/tezos";
import { useEligibility } from "../hooks/useEligibility";
import { useContractConfig, formatDuration } from "../hooks/useContractConfig";
import { submitCommit, labelToHexBytes, generateSalt } from "../lib/contract";
import { loadPendingCommits, savePendingCommit } from "../lib/commits";

type Status = "idle" | "checking" | "available" | "taken" | "committing" | "error";

export default function SubdomainSearch({ onCommit }: { onCommit?: () => void }) {
    const { client, address } = useTezos();
    const eligibility = useEligibility(address);
    const contractConfig = useContractConfig();
    const minCommitAgeMs = contractConfig.minCommitAgeSec * 1000;
    const [label, setLabel] = useState("");
    const [status, setStatus] = useState<Status>("idle");
    const [error, setError] = useState<string | null>(null);

    const handleSearch = async () => {
        setError(null);

        const validation = validateLabel(label);
        if (!validation.valid) {
            setError(validation.error ?? "That label isn't valid.");
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
            setStatus(available ? "available" : "taken");
        } catch {
            if (searchLabel !== label) return;
            setStatus("error");
            setError("Failed to check availability");
        }
    };

    const handleCommit = async () => {
        if (!client || !address) return;

        // Block if an active commitment already exists for a different label
        const allCommits = loadPendingCommits();
        const activeForAddress = allCommits.find(
            (c) => c.targetAddress === address && Date.now() - c.commitTime < contractConfig.maxCommitAgeSec * 1000
        );
        if (activeForAddress && activeForAddress.label !== label) {
            setStatus("error");
            setError(`You already have an active commitment for "${activeForAddress.label}". Release it or wait for it to expire.`);
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

            savePendingCommit({
                label,
                targetAddress: address,
                salt,
                commitHash: result.commitmentHash,
                commitTime: Date.now(),
                txHash: result.transactionHash,
            });
            onCommit?.();
            setLabel("");
            setStatus("idle");
            setError(null);
        } catch (e) {
            if (import.meta.env.DEV) console.error("Commit failed:", e);
            setStatus("error");
            setError(e instanceof Error ? e.message : "Commit failed");
        }
    };

    const waitDescription = formatDuration(contractConfig.minCommitAgeSec);
    // suppress unused warning — minCommitAgeMs used in future
    void minCommitAgeMs;

    return (
        <div style={{ width: "100%" }}>
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
                <button type="button"
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
                            <button type="button" onClick={handleCommit} className="btn btn-primary btn-full">
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
        </div>
    );
}
