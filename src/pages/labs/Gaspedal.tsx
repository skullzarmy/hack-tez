/** biome-ignore-all lint/suspicious/noCommentText: <I said so> */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, ExternalLink, Lock, RefreshCw } from "lucide-react";
import { getLab } from "../../lib/labs";
import { useTezos } from "../../context/TezosContext";
import { usePageMeta } from "../../hooks/usePageMeta";
import ConnectWallet from "../../components/ConnectWallet";
import config from "../../config/tezos";
import {
    formatTezFromMutez,
    parseRequiredReplacementFee,
    scanForStuckOps,
    submitDisplaceOp,
    type RpcScanResult,
    type StuckOp,
} from "../../lib/gaspedal";

interface DisplaceResult {
    status: "idle" | "signing" | "done" | "error";
    txHash?: string;
    error?: string;
    /** Higher fee the node demanded on the last attempt — surfaces a "retry with N" prompt. */
    requiredFeeMutez?: number;
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

const BUCKET_COLOR: Record<string, string> = {
    validated: "var(--warn)",
    refused: "var(--err, #ff6b6b)",
    branch_refused: "var(--err, #ff6b6b)",
    branch_delayed: "var(--warn)",
    outdated: "var(--fg-muted)",
    unprocessed: "var(--fg-muted)",
};

function StuckRow({
    op,
    state,
    onGo,
}: {
    op: StuckOp;
    state: DisplaceResult;
    onGo: (feeMutez: number) => void;
}) {
    const requiredFee = state.requiredFeeMutez ?? parseRequiredReplacementFee(JSON.stringify(op.error ?? "")) ?? null;
    // Default fee guess: phantom's totalFee + 50% bump (Tezos prefilter typically wants ~10% per gas unit
    // plus a flat increment; 50% is conservative). If the node has told us a hard floor, use that × 1.05.
    const suggestedFee = Math.max(
        requiredFee ? Math.ceil(requiredFee * 1.05) : Math.ceil(op.totalFeeMutez * 1.5) + 1000,
        1000,
    );
    const busy = state.status === "signing";
    const done = state.status === "done";

    const firstContent = op.contents[0] ?? {};
    const ep = firstContent.parameters?.entrypoint;
    const dest = firstContent.destination ?? "?";

    // On success, the row should communicate a win — the phantom's
    // original badge/reason color (red/warn) would otherwise read as "broken".
    const badgeColor = done ? "var(--ok)" : (BUCKET_COLOR[op.bucket] ?? "var(--fg-muted)");
    const badgeLabel = done ? "EVICTED" : op.bucket;
    const reasonColor = done ? "var(--ok)" : (BUCKET_COLOR[op.bucket] ?? "var(--fg)");
    const reasonText = done ? "displaced — counter advanced past phantom" : op.reason;

    return (
        <li
            style={{
                border: `1px solid ${done ? "var(--ok)" : "var(--border)"}`,
                background: "var(--bg-card)",
                padding: "0.85rem 1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.45rem",
            }}
        >
            <div
                style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                    alignItems: "center",
                    justifyContent: "space-between",
                }}
            >
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", minWidth: 0 }}>
                    <span
                        style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.6rem",
                            padding: "0.15em 0.45em",
                            color: badgeColor,
                            border: `1px solid ${badgeColor}`,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                        }}
                    >
                        {badgeLabel}
                    </span>
                    <span
                        style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.7rem",
                            color: "var(--fg-muted)",
                        }}
                    >
                        on {op.rpc.label} · counter {op.counter}
                    </span>
                </div>
                <a
                    href={`https://tzkt.io/${op.hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.68rem",
                        color: "var(--fg-muted)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3em",
                        textDecoration: done ? "line-through" : "none",
                    }}
                >
                    {op.hash.slice(0, 10)}… <ExternalLink size={10} aria-hidden="true" />
                </a>
            </div>

            <div
                style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.72rem",
                    color: done ? "var(--fg-muted)" : "var(--fg)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    textDecoration: done ? "line-through" : "none",
                }}
            >
                {ep ? `${ep} → ${dest.slice(0, 16)}…` : `→ ${dest.slice(0, 16)}…`}
                {op.contents.length > 1 && (
                    <span style={{ color: "var(--fg-muted)" }}> · +{op.contents.length - 1} more</span>
                )}
            </div>

            <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--fg-muted)" }}>
                <span style={{ color: reasonColor }}>{reasonText}</span>
                {!done && (
                    <>
                        {" · "}
                        paid: {formatTezFromMutez(op.totalFeeMutez)} ꜩ
                        {requiredFee ? (
                            <>
                                {" · "}
                                needs ≥ {formatTezFromMutez(requiredFee)} ꜩ to displace
                            </>
                        ) : null}
                    </>
                )}
            </div>

            <div
                style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: "0.15rem",
                }}
            >
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.68rem", color: "var(--fg-muted)" }}>
                    {done && state.txHash ? (
                        <a
                            href={`https://tzkt.io/${state.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                color: "var(--ok)",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.3em",
                            }}
                        >
                            displaced by {state.txHash.slice(0, 10)}… <ExternalLink size={10} aria-hidden="true" />
                        </a>
                    ) : state.status === "error" ? (
                        <span
                            style={{
                                color: "var(--err, #ff6b6b)",
                                maxWidth: "60ch",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                display: "inline-block",
                            }}
                            title={state.error}
                        >
                            {state.error}
                        </span>
                    ) : (
                        <span>
                            displacement op: 1 mutez self-transfer, fee {formatTezFromMutez(suggestedFee)} ꜩ
                        </span>
                    )}
                </div>
                {done ? (
                    <span
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.35rem",
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.78rem",
                            padding: "0.4rem 0.85rem",
                            border: "1px solid var(--ok)",
                            background: "var(--ok-bg)",
                            color: "var(--ok)",
                        }}
                    >
                        <Check size={13} aria-hidden="true" /> cleared
                    </span>
                ) : (
                    <button
                        type="button"
                        onClick={() => onGo(suggestedFee)}
                        disabled={busy}
                        style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.78rem",
                            padding: "0.4rem 0.85rem",
                            border: "1px solid var(--fg)",
                            background: "var(--fg)",
                            color: "var(--bg)",
                            cursor: busy ? "wait" : "pointer",
                        }}
                    >
                        {busy ? "signing…" : "floor it"}
                    </button>
                )}
            </div>
        </li>
    );
}

export default function Gaspedal() {
    const lab = getLab("gaspedal");
    const { client, address, domain, restoring } = useTezos();

    const [scans, setScans] = useState<RpcScanResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasScanned, setHasScanned] = useState(false);
    const [scanError, setScanError] = useState<string | null>(null);
    const [displaceState, setDisplaceState] = useState<Record<string, DisplaceResult>>({});

    usePageMeta({
        title: "Gaspedal — unstick stuck transactions — Labs — hack.tez",
        description:
            "Find stuck transactions clogging your account across public Tezos RPCs and apply more gas to displace them.",
        path: "/labs/gaspedal",
    });

    const isMainnet = config.name === "mainnet";
    const showTool = !restoring && !!domain && isMainnet && !!address;

    const scan = useCallback(async () => {
        if (!address) return;
        setLoading(true);
        setScanError(null);
        try {
            const results = await scanForStuckOps(address);
            setScans(results);
            setHasScanned(true);
        } catch (err) {
            setScanError(err instanceof Error ? err.message : "scan failed");
        } finally {
            setLoading(false);
        }
    }, [address]);

    useEffect(() => {
        if (showTool && !hasScanned && !loading) void scan();
    }, [showTool, hasScanned, loading, scan]);

    async function floorIt(op: StuckOp, feeMutez: number) {
        if (!client || !address) return;
        const key = `${op.rpc.label}:${op.hash}`;
        setDisplaceState((s) => ({ ...s, [key]: { status: "signing" } }));
        try {
            const { transactionHash } = await submitDisplaceOp(client, {
                owner: address,
                feeMutez,
            });
            setDisplaceState((s) => ({ ...s, [key]: { status: "done", txHash: transactionHash } }));
        } catch (err) {
            const msg = err instanceof Error ? err.message : "displacement failed";
            const required = parseRequiredReplacementFee(msg);
            setDisplaceState((s) => ({
                ...s,
                [key]: {
                    status: "error",
                    error: msg.slice(0, 280),
                    ...(required ? { requiredFeeMutez: required } : {}),
                },
            }));
        }
    }

    const allStuck = scans.flatMap((r) => r.stuck);
    // Each row's success state can mark an op as locally-done. Treat both as
    // "no longer needs action" — show only ops the chain hasn't moved past AND
    // we haven't just displaced from this session.
    const livePhantoms = allStuck.filter((op) => {
        if (op.isDead) return false;
        const key = `${op.rpc.label}:${op.hash}`;
        return displaceState[key]?.status !== "done";
    });
    const deadCount = allStuck.length - livePhantoms.length;

    return (
        <div className="container" style={{ paddingBlock: "3rem", maxWidth: "820px" }}>
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
                            {lab?.title ?? "Gaspedal"}
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
                            // scanning mempools…
                        </p>
                    )}

                    {hasScanned && livePhantoms.length === 0 && !loading && (
                        <p
                            style={{
                                fontFamily: "var(--font-mono)",
                                color: "var(--ok)",
                                fontSize: "0.78rem",
                            }}
                        >
                            // account clean — counter is unblocked.
                            {deadCount > 0 && (
                                <span style={{ color: "var(--fg-muted)" }}>
                                    {" "}
                                    ({deadCount} harmless residue op{deadCount > 1 ? "s" : ""} in mempool, will GC soon)
                                </span>
                            )}
                        </p>
                    )}

                    {livePhantoms.length > 0 && (
                        <ul
                            style={{
                                listStyle: "none",
                                padding: 0,
                                margin: 0,
                                display: "flex",
                                flexDirection: "column",
                                gap: "0.6rem",
                            }}
                        >
                            {livePhantoms.map((op) => {
                                const key = `${op.rpc.label}:${op.hash}`;
                                return (
                                    <StuckRow
                                        key={key}
                                        op={op}
                                        state={displaceState[key] ?? { status: "idle" }}
                                        onGo={(fee) => void floorIt(op, fee)}
                                    />
                                );
                            })}
                        </ul>
                    )}

                    {/* RPC status footer + escape hatch */}
                    {scans.length > 0 && (
                        <div
                            style={{
                                marginTop: "1.5rem",
                                paddingTop: "1rem",
                                borderTop: "1px solid var(--border)",
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.68rem",
                                color: "var(--fg-muted)",
                                display: "flex",
                                flexDirection: "column",
                                gap: "0.3rem",
                            }}
                        >
                            <p style={{ color: "var(--fg)", marginBottom: "0.2rem" }}>// rpcs probed</p>
                            {scans.map((r) => {
                                const liveOnRpc = r.stuck.filter((op) => !op.isDead).length;
                                const deadOnRpc = r.stuck.length - liveOnRpc;
                                return (
                                    <div
                                        key={r.rpc.label}
                                        style={{ display: "flex", justifyContent: "space-between" }}
                                    >
                                        <span>
                                            {r.rpc.label} —{" "}
                                            <span style={{ color: "var(--fg)" }}>{r.rpc.url}</span>
                                        </span>
                                        <span
                                            style={{
                                                color: r.ok
                                                    ? liveOnRpc > 0
                                                        ? "var(--warn)"
                                                        : "var(--ok)"
                                                    : "var(--err, #ff6b6b)",
                                            }}
                                        >
                                            {r.ok
                                                ? `${liveOnRpc} stuck${deadOnRpc > 0 ? ` · ${deadOnRpc} residue` : ""}`
                                                : (r.error ?? "down")}
                                        </span>
                                    </div>
                                );
                            })}
                            <p style={{ marginTop: "0.5rem" }}>
                                escape hatch: switch your wallet's RPC to any{" "}
                                <span style={{ color: "var(--ok)" }}>0-stuck</span> node above.
                            </p>
                        </div>
                    )}
                </section>
            )}
        </div>
    );
}
