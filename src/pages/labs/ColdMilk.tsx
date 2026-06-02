/** biome-ignore-all lint/suspicious/noCommentText: <I said so> */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, Lock, RefreshCw } from "lucide-react";
import { getLab } from "../../lib/labs";
import { useTezos } from "../../context/TezosContext";
import { usePageMeta } from "../../hooks/usePageMeta";
import ConnectWallet from "../../components/ConnectWallet";
import config from "../../config/tezos";
import {
    findUserSpicyLPs,
    formatBalance,
    submitBreakLPs,
    SPICY_TZKT,
    type SpicyLPBalance,
} from "../../lib/spicy";

interface PositionRow extends SpicyLPBalance {
    /** Per-pair UI state. The break op is per-pair so each row tracks its own. */
    selected: boolean;
}

interface BreakResult {
    status: "idle" | "signing" | "broadcasting" | "done" | "error";
    txHash?: string;
    error?: string;
}

function StatusBadge() {
    return (
        <span
            style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.62rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                padding: "0.18em 0.55em",
                color: "var(--warn)",
                background: "var(--warn-bg)",
                border: "1px solid var(--warn)",
                whiteSpace: "nowrap",
            }}
        >
            alpha
        </span>
    );
}

function AccessGate() {
    return (
        <div
            style={{
                border: "1px solid var(--border)",
                background: "var(--bg-card)",
                padding: "2rem 1.5rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "1rem",
                textAlign: "center",
                marginTop: "2rem",
            }}
        >
            <Lock size={28} aria-hidden="true" style={{ color: "var(--fg-muted)" }} />
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.9rem", color: "var(--fg)" }}>// members only</p>
            <ConnectWallet />
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--fg-muted)" }}>
                <Link to="/" style={{ color: "var(--fg)" }}>
                    claim a subdomain →
                </Link>
            </p>
        </div>
    );
}

function NetworkGate() {
    return (
        <div
            style={{
                border: "1px solid var(--warn)",
                background: "var(--warn-bg)",
                padding: "1.25rem 1.5rem",
                marginTop: "2rem",
                fontFamily: "var(--font-mono)",
                fontSize: "0.85rem",
                color: "var(--fg)",
            }}
        >
            <p style={{ marginBottom: "0.35rem", color: "var(--warn)" }}>// mainnet only</p>
            <p style={{ color: "var(--fg-muted)", fontSize: "0.78rem" }}>
                connected to <span style={{ color: "var(--fg)" }}>{config.name}</span>.
            </p>
        </div>
    );
}

export default function ColdMilk() {
    const lab = getLab("coldmilk");
    const { client, address, domain, restoring } = useTezos();

    const [positions, setPositions] = useState<PositionRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [scanError, setScanError] = useState<string | null>(null);
    const [hasScanned, setHasScanned] = useState(false);
    const [breakState, setBreakState] = useState<Record<string, BreakResult>>({});
    const [bulkState, setBulkState] = useState<BreakResult>({ status: "idle" });

    usePageMeta({
        title: "ColdMilk — break Spicy LP — Labs — hack.tez",
        description:
            "Find every SpicySwap LP your wallet holds and break them — properly batched so the pair actually burns.",
        path: "/labs/coldmilk",
    });

    const isMainnet = config.name === "mainnet";
    const showTool = !restoring && !!domain && isMainnet && !!address;

    const scan = useCallback(async () => {
        if (!address) return;
        setLoading(true);
        setScanError(null);
        try {
            const lps = await findUserSpicyLPs(address);
            setPositions(lps.map((lp) => ({ ...lp, selected: true })));
            setHasScanned(true);
        } catch (err) {
            setScanError(err instanceof Error ? err.message : "scan failed");
        } finally {
            setLoading(false);
        }
    }, [address]);

    useEffect(() => {
        if (showTool && !hasScanned && !loading) {
            void scan();
        }
    }, [showTool, hasScanned, loading, scan]);

    function toggle(addr: string) {
        setPositions((rows) =>
            rows.map((r) => (r.pair.address === addr ? { ...r, selected: !r.selected } : r)),
        );
    }

    async function breakOne(row: PositionRow) {
        if (!client || !address) return;
        const key = row.pair.address;
        setBreakState((s) => ({ ...s, [key]: { status: "signing" } }));
        try {
            const { transactionHash } = await submitBreakLPs(client, address, [
                { pairAddress: row.pair.address, lpAmount: row.balance },
            ]);
            setBreakState((s) => ({ ...s, [key]: { status: "done", txHash: transactionHash } }));
        } catch (err) {
            setBreakState((s) => ({
                ...s,
                [key]: { status: "error", error: err instanceof Error ? err.message : "broken" },
            }));
        }
    }

    async function breakSelected() {
        if (!client || !address) return;
        const selected = positions.filter((r) => r.selected);
        if (selected.length === 0) return;
        setBulkState({ status: "signing" });
        try {
            const { transactionHash } = await submitBreakLPs(
                client,
                address,
                selected.map((r) => ({ pairAddress: r.pair.address, lpAmount: r.balance })),
            );
            setBulkState({ status: "done", txHash: transactionHash });
        } catch (err) {
            setBulkState({ status: "error", error: err instanceof Error ? err.message : "broken" });
        }
    }

    const selectedCount = positions.filter((r) => r.selected).length;
    const bulkBusy = bulkState.status === "signing" || bulkState.status === "broadcasting";

    return (
        <div className="container" style={{ paddingBlock: "3rem", maxWidth: "780px" }}>
            <Link
                to="/labs"
                style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.8rem",
                    color: "var(--fg-muted)",
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35em",
                    marginBottom: "1rem",
                }}
            >
                <ArrowLeft size={14} aria-hidden="true" /> labs
            </Link>

            <div
                style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "1rem",
                    paddingBottom: "1.25rem",
                    borderBottom: "1px solid var(--border)",
                }}
            >
                <div style={{ minWidth: 0 }}>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.6rem",
                            flexWrap: "wrap",
                            marginBottom: "0.4rem",
                        }}
                    >
                        <h1
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "clamp(1.2rem, 3.5vw, 1.75rem)",
                                letterSpacing: "-0.02em",
                                margin: 0,
                            }}
                        >
                            {lab?.title ?? "ColdMilk"}
                        </h1>
                        <StatusBadge />
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--fg-muted)" }}>
                            v{lab?.version ?? "0.1.0"}
                        </span>
                    </div>
                    {lab?.summary && (
                        <p style={{ color: "var(--fg-muted)", fontSize: "0.875rem", maxWidth: "60ch" }}>
                            {lab.summary}
                        </p>
                    )}
                </div>
            </div>

            {restoring ? (
                <p
                    style={{
                        fontFamily: "var(--font-mono)",
                        color: "var(--fg-muted)",
                        fontSize: "0.8rem",
                        marginTop: "2rem",
                    }}
                >
                    // restoring session…
                </p>
            ) : !domain ? (
                <AccessGate />
            ) : !isMainnet ? (
                <NetworkGate />
            ) : (
                <>
                    <section style={{ marginTop: "1.5rem" }}>
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "flex-end",
                                gap: "0.5rem",
                                marginBottom: "0.75rem",
                            }}
                        >
                            <button
                                type="button"
                                onClick={() => void scan()}
                                disabled={loading || !address}
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.4rem",
                                    fontFamily: "var(--font-mono)",
                                    fontSize: "0.75rem",
                                    padding: "0.35rem 0.7rem",
                                    border: "1px solid var(--border)",
                                    background: "var(--bg-card)",
                                    color: "var(--fg)",
                                    cursor: loading ? "wait" : "pointer",
                                }}
                            >
                                <RefreshCw size={12} aria-hidden="true" />
                                {loading ? "…" : "rescan"}
                            </button>
                        </div>

                        {scanError && (
                            <p
                                role="alert"
                                style={{
                                    fontFamily: "var(--font-mono)",
                                    fontSize: "0.75rem",
                                    color: "var(--err, #ff6b6b)",
                                    marginBottom: "0.75rem",
                                }}
                            >
                                // {scanError}
                            </p>
                        )}

                        {!hasScanned && loading && (
                            <p
                                style={{
                                    fontFamily: "var(--font-mono)",
                                    color: "var(--fg-muted)",
                                    fontSize: "0.78rem",
                                }}
                            >
                                // scanning…
                            </p>
                        )}

                        {hasScanned && positions.length === 0 && !loading && (
                            <p
                                style={{
                                    fontFamily: "var(--font-mono)",
                                    color: "var(--fg-muted)",
                                    fontSize: "0.78rem",
                                }}
                            >
                                // no Spicy LP found. staked-in-farm LP isn't visible here.
                            </p>
                        )}

                        {positions.length > 0 && (
                            <ul
                                style={{
                                    listStyle: "none",
                                    padding: 0,
                                    margin: 0,
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "0.5rem",
                                }}
                            >
                                {positions.map((row) => {
                                    const state = breakState[row.pair.address] ?? { status: "idle" as const };
                                    const busy = state.status === "signing" || state.status === "broadcasting";
                                    return (
                                        <li
                                            key={row.pair.address}
                                            style={{
                                                border: "1px solid var(--border)",
                                                background: "var(--bg-card)",
                                                padding: "0.85rem 1rem",
                                                display: "flex",
                                                flexWrap: "wrap",
                                                gap: "0.75rem",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                            }}
                                        >
                                            <label
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: "0.6rem",
                                                    minWidth: 0,
                                                    flex: "1 1 280px",
                                                    cursor: "pointer",
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={row.selected}
                                                    onChange={() => toggle(row.pair.address)}
                                                    aria-label={`select ${row.pair.alias}`}
                                                />
                                                <span style={{ minWidth: 0 }}>
                                                    <span
                                                        style={{
                                                            display: "block",
                                                            fontFamily: "var(--font-mono)",
                                                            fontSize: "0.85rem",
                                                            color: "var(--fg)",
                                                            overflow: "hidden",
                                                            textOverflow: "ellipsis",
                                                            whiteSpace: "nowrap",
                                                        }}
                                                    >
                                                        {row.pair.alias}
                                                    </span>
                                                    <span
                                                        style={{
                                                            display: "block",
                                                            fontFamily: "var(--font-mono)",
                                                            fontSize: "0.7rem",
                                                            color: "var(--fg-muted)",
                                                            marginTop: "0.15rem",
                                                        }}
                                                    >
                                                        {formatBalance(row.balance)} LP ·{" "}
                                                        <a
                                                            href={`${SPICY_TZKT.replace("api.", "")}/${row.pair.address}/operations`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            style={{ color: "var(--fg-muted)" }}
                                                        >
                                                            {row.pair.address.slice(0, 10)}…
                                                        </a>
                                                    </span>
                                                </span>
                                            </label>
                                            <div
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: "0.6rem",
                                                    flexWrap: "wrap",
                                                }}
                                            >
                                                {state.status === "done" && state.txHash && (
                                                    <a
                                                        href={`https://tzkt.io/${state.txHash}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{
                                                            fontFamily: "var(--font-mono)",
                                                            fontSize: "0.7rem",
                                                            color: "var(--ok)",
                                                            display: "inline-flex",
                                                            alignItems: "center",
                                                            gap: "0.3em",
                                                        }}
                                                    >
                                                        broken <ExternalLink size={11} aria-hidden="true" />
                                                    </a>
                                                )}
                                                {state.status === "error" && (
                                                    <span
                                                        style={{
                                                            fontFamily: "var(--font-mono)",
                                                            fontSize: "0.68rem",
                                                            color: "var(--err, #ff6b6b)",
                                                            maxWidth: "22ch",
                                                            overflow: "hidden",
                                                            textOverflow: "ellipsis",
                                                            whiteSpace: "nowrap",
                                                        }}
                                                        title={state.error}
                                                    >
                                                        {state.error}
                                                    </span>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => void breakOne(row)}
                                                    disabled={busy || state.status === "done"}
                                                    style={{
                                                        fontFamily: "var(--font-mono)",
                                                        fontSize: "0.78rem",
                                                        padding: "0.4rem 0.85rem",
                                                        border: "1px solid var(--fg)",
                                                        background:
                                                            state.status === "done" ? "var(--bg)" : "var(--fg)",
                                                        color: state.status === "done" ? "var(--fg)" : "var(--bg)",
                                                        cursor: busy ? "wait" : "pointer",
                                                        opacity: state.status === "done" ? 0.5 : 1,
                                                    }}
                                                >
                                                    {busy
                                                        ? "signing…"
                                                        : state.status === "done"
                                                          ? "done"
                                                          : "break"}
                                                </button>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}

                        {positions.length > 1 && (
                            <div
                                style={{
                                    marginTop: "1rem",
                                    padding: "0.85rem 1rem",
                                    border: "1px solid var(--border)",
                                    background: "var(--bg-card)",
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: "0.75rem",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                }}
                            >
                                <span
                                    style={{
                                        fontFamily: "var(--font-mono)",
                                        fontSize: "0.78rem",
                                        color: "var(--fg-muted)",
                                    }}
                                >
                                    // {selectedCount} selected
                                </span>
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "0.6rem",
                                        flexWrap: "wrap",
                                    }}
                                >
                                    {bulkState.status === "done" && bulkState.txHash && (
                                        <a
                                            href={`https://tzkt.io/${bulkState.txHash}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{
                                                fontFamily: "var(--font-mono)",
                                                fontSize: "0.72rem",
                                                color: "var(--ok)",
                                                display: "inline-flex",
                                                alignItems: "center",
                                                gap: "0.3em",
                                            }}
                                        >
                                            broadcasted <ExternalLink size={11} aria-hidden="true" />
                                        </a>
                                    )}
                                    {bulkState.status === "error" && (
                                        <span
                                            style={{
                                                fontFamily: "var(--font-mono)",
                                                fontSize: "0.7rem",
                                                color: "var(--err, #ff6b6b)",
                                            }}
                                        >
                                            {bulkState.error}
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => void breakSelected()}
                                        disabled={bulkBusy || selectedCount === 0}
                                        style={{
                                            fontFamily: "var(--font-mono)",
                                            fontSize: "0.82rem",
                                            padding: "0.5rem 1.1rem",
                                            border: "1px solid var(--fg)",
                                            background: "var(--fg)",
                                            color: "var(--bg)",
                                            cursor: bulkBusy ? "wait" : "pointer",
                                            opacity: selectedCount === 0 ? 0.5 : 1,
                                        }}
                                    >
                                        {bulkBusy ? "signing…" : `break ${selectedCount}`}
                                    </button>
                                </div>
                            </div>
                        )}
                    </section>

                </>
            )}
        </div>
    );
}
