/** biome-ignore-all lint/suspicious/noCommentText: <I said so> */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, Lock, ScanEye } from "lucide-react";
import { getLab } from "../../lib/labs";
import { useTezos } from "../../context/TezosContext";
import { usePageMeta } from "../../hooks/usePageMeta";
import ConnectWallet from "../../components/ConnectWallet";
import {
    classifyAddress,
    derivePair,
    formatXtz,
    getEvmCorner,
    getMichelsonCorner,
    TEZOSX_BLOCKSCOUT,
    TEZOSX_FAUCET,
    TEZOSX_TZKT_UI,
    truncatesInMutez,
    type AliasPair,
    type CornerState,
} from "../../lib/xray";

interface XrayResult {
    pair: AliasPair;
    native?: CornerState;
    alias?: CornerState;
    /** Set when chain queries failed; derivation is still shown. */
    queryError?: string;
}

function explorerUrl(address: string): string {
    return address.startsWith("0x") ? `${TEZOSX_BLOCKSCOUT}/address/${address}` : `${TEZOSX_TZKT_UI}/${address}`;
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

function CornerCard({
    label,
    address,
    corner,
    isAlias,
}: {
    label: string;
    address: string;
    corner?: CornerState;
    isAlias: boolean;
}) {
    const iface = address.startsWith("0x") ? "evm" : "michelson";
    return (
        <div
            style={{
                border: "1px solid var(--border)",
                background: "var(--bg-card)",
                padding: "1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                minWidth: 0,
            }}
        >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                <span
                    style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.68rem",
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "var(--fg-muted)",
                    }}
                >
                    {label}
                </span>
                {corner && (
                    <span
                        style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.62rem",
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            padding: "0.15em 0.5em",
                            color: corner.materialized ? "var(--ok)" : "var(--fg-muted)",
                            border: `1px solid ${corner.materialized ? "var(--ok)" : "var(--border)"}`,
                            background: corner.materialized ? "var(--ok-bg)" : "var(--bg)",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {corner.materialized ? "materialized" : isAlias ? "derived only" : "not seen"}
                    </span>
                )}
            </div>
            <a
                href={explorerUrl(address)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.78rem",
                    color: "var(--fg)",
                    wordBreak: "break-all",
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "baseline",
                    gap: "0.3em",
                }}
            >
                {address} <ExternalLink size={10} aria-hidden="true" style={{ flexShrink: 0 }} />
            </a>
            {corner && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--fg-muted)" }}>
                    {formatXtz(corner.balance, corner.interface)} ꜩ
                    {corner.interface === "evm" && truncatesInMutez(corner.balance) && (
                        <span title="not a multiple of 10^12 wei; cross-interface transfer would truncate">
                            {" "}
                            · truncates in mutez
                        </span>
                    )}
                    {corner.hasCode && " · has code"}
                </span>
            )}
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "var(--fg-muted)" }}>
                {iface === "evm" ? "EVM interface" : "Michelson interface"}
                {isAlias && " · alias"}
            </span>
        </div>
    );
}

export default function XRay() {
    const lab = getLab("x-ray");
    const { address, domain, restoring } = useTezos();

    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<XrayResult | null>(null);

    usePageMeta({
        title: "X-Ray — Tezos X identity lens — Labs — hack.tez",
        description:
            "See every address you are on Tezos X. Paste a tz, KT1, or 0x address, or a hack.tez name, and get the full identity picture: native address, derived alias, balances on both interfaces.",
        path: "/labs/x-ray",
    });

    const showTool = !restoring && !!domain;

    const inspect = useCallback(async (raw: string) => {
        const value = raw.trim();
        if (!value) return;
        setBusy(true);
        setError(null);
        setResult(null);
        try {
            let target = value;
            // Names resolve through the hack.tez API; anything else must be an address.
            if (classifyAddress(value) === "invalid") {
                const label = value.replace(/\.hack\.tez$/, "");
                const res = await fetch(`/api/v1/domain/${encodeURIComponent(label)}`);
                if (!res.ok) throw new Error("name lookup failed");
                const body = (await res.json()) as { data?: { address?: string | null } | null };
                if (!body.data?.address) throw new Error(`no address set for ${label}.hack.tez`);
                target = body.data.address;
            }
            const pair = derivePair(target);
            setResult({ pair });
            // Enrich with live chain state; derivation stands even if this fails.
            try {
                const [nativeCorner, aliasCorner] = await Promise.all([
                    pair.kind === "evm" ? getEvmCorner(pair.native) : getMichelsonCorner(pair.native),
                    pair.aliasInterface === "evm" ? getEvmCorner(pair.alias) : getMichelsonCorner(pair.alias),
                ]);
                setResult({ pair, native: nativeCorner, alias: aliasCorner });
            } catch (err) {
                setResult({
                    pair,
                    queryError: err instanceof Error ? err.message : "chain query failed",
                });
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "inspection failed");
        } finally {
            setBusy(false);
        }
    }, []);

    // Auto-inspect the connected wallet on first load.
    useEffect(() => {
        if (showTool && address && !result && !busy && !input) {
            setInput(address);
            void inspect(address);
        }
    }, [showTool, address, result, busy, input, inspect]);

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
                            {lab?.title ?? "X-Ray"}
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
            ) : (
                <>
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            void inspect(input);
                        }}
                        style={{ marginTop: "1.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
                    >
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="tz1… / KT1… / 0x… / name.hack.tez"
                            spellCheck={false}
                            aria-label="address or hack.tez name"
                            style={{
                                flex: "1 1 320px",
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.82rem",
                                padding: "0.55rem 0.75rem",
                                border: "1px solid var(--border)",
                                background: "var(--bg-card)",
                                color: "var(--fg)",
                                minWidth: 0,
                            }}
                        />
                        <button
                            type="submit"
                            disabled={busy || !input.trim()}
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.4rem",
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.82rem",
                                padding: "0.55rem 1.1rem",
                                border: "1px solid var(--fg)",
                                background: "var(--fg)",
                                color: "var(--bg)",
                                cursor: busy ? "wait" : "pointer",
                                opacity: !input.trim() ? 0.5 : 1,
                            }}
                        >
                            <ScanEye size={14} aria-hidden="true" />
                            {busy ? "scanning…" : "x-ray"}
                        </button>
                    </form>

                    {error && (
                        <p
                            role="alert"
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.75rem",
                                color: "var(--err, #ff6b6b)",
                                marginTop: "0.75rem",
                            }}
                        >
                            // {error}
                        </p>
                    )}

                    {result && (
                        <section style={{ marginTop: "1.5rem" }}>
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                                    gap: "0.75rem",
                                }}
                            >
                                <CornerCard
                                    label={result.pair.kind === "evm" ? "native · EVM" : "native · Tezos"}
                                    address={result.pair.native}
                                    corner={result.native}
                                    isAlias={false}
                                />
                                <CornerCard
                                    label={
                                        result.pair.aliasInterface === "evm"
                                            ? "alias on EVM"
                                            : "alias on Michelson"
                                    }
                                    address={result.pair.alias}
                                    corner={result.alias}
                                    isAlias
                                />
                            </div>

                            {result.queryError && (
                                <p
                                    style={{
                                        fontFamily: "var(--font-mono)",
                                        fontSize: "0.72rem",
                                        color: "var(--warn)",
                                        marginTop: "0.75rem",
                                    }}
                                >
                                    // previewnet unreachable, showing derivation only ({result.queryError})
                                </p>
                            )}

                            <p
                                style={{
                                    fontFamily: "var(--font-mono)",
                                    fontSize: "0.7rem",
                                    color: "var(--fg-muted)",
                                    marginTop: "1rem",
                                    lineHeight: 1.6,
                                }}
                            >
                                // the alias is deterministic: anything sent to it on the other interface
                                reaches this identity. a "derived only" alias has no on-chain account yet.
                                fund either side at the{" "}
                                <a
                                    href={TEZOSX_FAUCET}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: "var(--fg)" }}
                                >
                                    previewnet faucet →
                                </a>
                            </p>
                        </section>
                    )}

                    <p
                        style={{
                            marginTop: "2rem",
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.72rem",
                            color: "var(--fg-muted)",
                        }}
                    >
                        // programmatic access:{" "}
                        <span style={{ color: "var(--fg)" }}>GET /api/v1/tezosx/:nameOrAddress</span>
                    </p>
                </>
            )}
        </div>
    );
}
