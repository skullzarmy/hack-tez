import { useState, useCallback } from "react";
import { useTezos } from "../context/TezosContext";
import { useSubdomains } from "../hooks/useSubdomains";
import config from "../config/tezos";
import type { SubdomainRecord } from "../lib/domains";
import SubdomainManager from "./SubdomainManager";
import PushSubscribeButton from "./PushSubscribeButton";

const TED_APP_URL = config.tedAppUrl;

function SubdomainCard({ domain, onMutate }: { domain: SubdomainRecord; onMutate: () => void }) {
    return (
        <div className="domain-card">
            <div
                style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "1rem",
                    flexWrap: "wrap",
                }}
            >
                <div>
                    <div className="domain-name">{domain.name}</div>
                    <div className="domain-meta">
                        →{" "}
                        {domain.address
                            ? `${domain.address.slice(0, 10)}…${domain.address.slice(-6)}`
                            : "no address set"}
                    </div>
                </div>
                <a
                    href={`${TED_APP_URL}/domain/${domain.name}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-sm"
                    aria-label={`Manage ${domain.name} on Tezos Domains (opens in new tab)`}
                >
                    Manage ↗
                </a>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                <a
                    href={`/u/${domain.name.replace(`.hack.${config.tld}`, "")}`}
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: "0.7rem" }}
                >
                    View profile
                </a>
                <a
                    href={`/u/${domain.name.replace(`.hack.${config.tld}`, "")}?edit=true`}
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: "0.7rem" }}
                >
                    Edit profile
                </a>
            </div>
            <SubdomainManager domain={domain} onMutate={onMutate} />
        </div>
    );
}

export default function Dashboard() {
    const { address } = useTezos();
    const { subdomains, loading, error, refresh } = useSubdomains(address);
    const [refreshing, setRefreshing] = useState(false);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        await refresh();
        setRefreshing(false);
    }, [refresh]);

    // Only show direct hack.tez subdomains (level 3), not sub-subdomains
    const topLevel = subdomains.filter((d) => d.name.split(".").length === 3);

    if (!address) {
        return (
            <div
                style={{
                    textAlign: "center",
                    padding: "4rem 1rem",
                    fontFamily: "var(--font)",
                    color: "var(--fg-2)",
                    fontSize: "0.85rem",
                }}
                role="status"
            >
                Connect your wallet to view your subdomains.
            </div>
        );
    }

    if (loading) {
        return (
            <div
                style={{
                    textAlign: "center",
                    padding: "4rem 1rem",
                    fontFamily: "var(--font)",
                    color: "var(--fg-3)",
                    fontSize: "0.8rem",
                }}
                role="status"
                aria-live="polite"
            >
                Loading…
            </div>
        );
    }

    if (error) {
        return (
            <div className="status-panel status-panel--err" role="alert">
                Error: {error}
            </div>
        );
    }

    return (
        <div className="container" style={{ paddingBlock: "3rem 5rem" }}>
            <header style={{ marginBottom: "2rem" }}>
                <h1
                    style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "clamp(1.4rem, 4vw, 2rem)",
                        letterSpacing: "-0.02em",
                        marginBottom: "0.5rem",
                    }}
                >
                    // MANAGE
                </h1>
                <p style={{ color: "var(--fg-muted)", fontSize: "0.9rem" }}>
                    Your domains, profiles, and subdomains.
                </p>
            </header>
            <div
                style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", marginBottom: "2rem" }}
            >
                <p
                    className="text-subtle"
                    style={{ fontFamily: "var(--font)", fontSize: "0.7rem", letterSpacing: "0.06em" }}
                >
                    You own your subdomains on Tezos Domains. Manage them directly on TED.
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <PushSubscribeButton />
                    <button
                        onClick={() => void handleRefresh()}
                        className="btn btn-ghost btn-sm"
                        aria-label="Refresh subdomain list"
                        disabled={refreshing}
                        style={{ transition: "opacity 0.15s", opacity: refreshing ? 0.5 : 1 }}
                    >
                        <span style={{ display: "inline-block", animation: refreshing ? "spin 0.6s linear infinite" : "none" }}>↻</span> Refresh
                    </button>
                </div>
            </div>

            {topLevel.length === 0 ? (
                <div
                    style={{
                        textAlign: "center",
                        padding: "3rem",
                        border: "1px solid var(--border-2)",
                        fontFamily: "var(--font)",
                        fontSize: "0.8rem",
                        color: "var(--fg-2)",
                    }}
                    role="status"
                >
                    <p style={{ marginBottom: "0.75rem" }}>No subdomains yet.</p>
                    <a href="/" className="btn btn-primary btn-sm">
                        Claim your name →
                    </a>
                </div>
            ) : (
                <div role="list" aria-label="Your subdomains">
                    {topLevel.map((d) => (
                        <div key={d.name} role="listitem">
                            <SubdomainCard domain={d} onMutate={refresh} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
