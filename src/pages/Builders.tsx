import { useBuilders } from "../hooks/useBuilders";
import { useState, useEffect } from "react";
import config from "../config/tezos";

const POLL_MS = 30_000;

function formatDate(d: Date): string {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Terminal-style ASCII poll bar */
function PollOrb({
    lastUpdated,
    isLoading,
    onRefresh,
}: {
    lastUpdated: Date | null;
    isLoading: boolean;
    onRefresh: () => void;
}) {
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        if (!lastUpdated) return;
        const tick = () => setProgress(Math.min((Date.now() - lastUpdated.getTime()) / POLL_MS, 1));
        tick();
        const id = setInterval(tick, 500);
        return () => clearInterval(id);
    }, [lastUpdated]);

    const BARS = 10;
    const filled = Math.round(progress * BARS);
    const bar = "█".repeat(filled) + "░".repeat(BARS - filled);

    return (
        <button
            onClick={onRefresh}
            disabled={isLoading}
            aria-label="Refresh builders list"
            title="click to refresh"
            style={{
                background: "none",
                border: "none",
                padding: "0.3rem 0.4rem",
                cursor: isLoading ? "default" : "pointer",
                fontFamily: "var(--font)",
                fontSize: "0.65rem",
                letterSpacing: "0.04em",
                color: "var(--ok)",
                opacity: isLoading ? 0.4 : 1,
                textShadow: "0 0 6px color-mix(in srgb, var(--ok) 40%, transparent)",
                minHeight: "24px",
                display: "inline-flex",
                alignItems: "center",
            }}
        >
            {isLoading ? <span className="poll-syncing">syncing_</span> : `[${bar}]`}
        </button>
    );
}

const TZKT_BASE: Record<string, string> = {
    "https://api.tzkt.io": "https://tzkt.io",
    "https://api.ghostnet.tzkt.io": "https://ghostnet.tzkt.io",
    "https://api.shadownet.tzkt.io": "https://shadownet.tzkt.io",
};

export default function Builders() {
    const { builders, isLoading, refresh, lastUpdated } = useBuilders();

    return (
        <div className="container" style={{ paddingBlock: "3rem 5rem" }}>
            <div
                style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "1rem",
                    marginBottom: "2rem",
                }}
            >
                <div>
                    <p className="section-label" style={{ marginBottom: "0.5rem" }}>
                        Builders
                    </p>
                    <h1 className="section-title" style={{ marginBottom: 0 }}>
                        Who's here.
                    </h1>
                </div>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        fontFamily: "var(--font)",
                        fontSize: "0.65rem",
                        color: "var(--fg-3)",
                        letterSpacing: "0.06em",
                    }}
                >
                    <span>auto-refresh</span>
                    <PollOrb lastUpdated={lastUpdated} isLoading={isLoading} onRefresh={refresh} />
                </div>
            </div>

            {isLoading && builders.length === 0 ? (
                <p className="section-body" style={{ color: "var(--fg-3)" }}>
                    Loading…
                </p>
            ) : builders.length === 0 ? (
                <p className="section-body" style={{ color: "var(--fg-3)" }}>
                    No claims found.
                </p>
            ) : (
                <>
                    <p className="section-body" style={{ marginBottom: "1.5rem", color: "var(--fg-3)" }}>
                        {builders.length} subdomain{builders.length !== 1 ? "s" : ""} claimed on hack.{config.tld}
                    </p>

                    <div style={{ overflowX: "auto" }}>
                        <table
                            style={{
                                width: "100%",
                                borderCollapse: "collapse",
                                fontFamily: "var(--font)",
                                fontSize: "0.75rem",
                            }}
                        >
                            <caption className="sr-only">Subdomains registered on hack.{config.tld}</caption>
                            <thead>
                                <tr style={{ borderBottom: "1px solid var(--border-2)" }}>
                                    <th
                                        scope="col"
                                        style={{
                                            textAlign: "left",
                                            padding: "0.5rem 0.75rem 0.75rem 0",
                                            color: "var(--fg-3)",
                                            fontWeight: 700,
                                            letterSpacing: "0.1em",
                                            fontSize: "0.65rem",
                                            textTransform: "uppercase",
                                        }}
                                    >
                                        #
                                    </th>
                                    <th
                                        scope="col"
                                        style={{
                                            textAlign: "left",
                                            padding: "0.5rem 0.75rem 0.75rem 0",
                                            color: "var(--fg-3)",
                                            fontWeight: 700,
                                            letterSpacing: "0.1em",
                                            fontSize: "0.65rem",
                                            textTransform: "uppercase",
                                        }}
                                    >
                                        Name
                                    </th>
                                    <th
                                        scope="col"
                                        style={{
                                            textAlign: "left",
                                            padding: "0.5rem 0.75rem 0.75rem 0",
                                            color: "var(--fg-3)",
                                            fontWeight: 700,
                                            letterSpacing: "0.1em",
                                            fontSize: "0.65rem",
                                            textTransform: "uppercase",
                                        }}
                                    >
                                        Owner
                                    </th>
                                    <th
                                        scope="col"
                                        style={{
                                            textAlign: "left",
                                            padding: "0.5rem 0 0.75rem 0",
                                            color: "var(--fg-3)",
                                            fontWeight: 700,
                                            letterSpacing: "0.1em",
                                            fontSize: "0.65rem",
                                            textTransform: "uppercase",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        Claimed
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {builders.map((b, i) => (
                                    <tr key={b.opHash} style={{ borderBottom: "1px solid var(--border)" }}>
                                        <td style={{ padding: "0.65rem 0.75rem 0.65rem 0", color: "var(--fg-3)" }}>
                                            {builders.length - i}
                                        </td>
                                        <td style={{ padding: "0.65rem 0.75rem 0.65rem 0" }}>
                                            <a
                                                href={`https://tezos.domains/domain/${b.name}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{ color: "var(--fg)", textDecoration: "none", fontWeight: 700 }}
                                            >
                                                {b.name}
                                            </a>
                                        </td>
                                        <td style={{ padding: "0.65rem 0.75rem 0.65rem 0" }}>
                                            <a
                                                href={`${TZKT_BASE[config.tzktApi] ?? "https://tzkt.io"}/${b.owner}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{
                                                    color: "var(--fg-2)",
                                                    textDecoration: "none",
                                                    fontFamily: "var(--font)",
                                                    letterSpacing: "0.04em",
                                                }}
                                                title={b.owner}
                                            >
                                                {b.ownerShort}
                                            </a>
                                        </td>
                                        <td
                                            style={{
                                                padding: "0.65rem 0 0.65rem 0",
                                                color: "var(--fg-3)",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {formatDate(b.timestamp)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}
