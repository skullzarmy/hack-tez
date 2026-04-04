import { useTezos } from "../context/TezosContext";
import { useSubdomains } from "../hooks/useSubdomains";
import config from "../config/tezos";
import type { SubdomainRecord } from "../lib/domains";
import SubdomainManager from "./SubdomainManager";

const TED_APP_URL = config.name === "mainnet" ? "https://app.tezos.domains" : "https://ghostnet.app.tezos.domains";

function SubdomainCard({ domain }: { domain: SubdomainRecord }) {
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
            <SubdomainManager domain={domain} />
        </div>
    );
}

export default function Dashboard() {
    const { address } = useTezos();
    const { subdomains, loading, error, refresh } = useSubdomains(address);

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
        <div>
            <div
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2rem" }}
            >
                <p
                    className="text-subtle"
                    style={{ fontFamily: "var(--font)", fontSize: "0.7rem", letterSpacing: "0.06em" }}
                >
                    You own your subdomains on Tezos Domains. Manage them directly on TED.
                </p>
                <button onClick={refresh} className="btn btn-ghost btn-sm" aria-label="Refresh subdomain list">
                    ↻ Refresh
                </button>
            </div>

            {subdomains.length === 0 ? (
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
                    {subdomains.map((d) => (
                        <div key={d.name} role="listitem">
                            <SubdomainCard domain={d} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
