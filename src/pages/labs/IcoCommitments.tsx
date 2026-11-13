/** biome-ignore-all lint/suspicious/noCommentText: <I said so> */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
    AlertCircle,
    ArrowLeft,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Coins,
    Copy,
    Download,
    ExternalLink,
    RefreshCw,
    Search,
    Server,
    ShieldAlert,
    Wallet,
    X,
} from "lucide-react";
import { getLab } from "../../lib/labs";
import { usePageMeta } from "../../hooks/usePageMeta";
import { useTezos } from "../../context/TezosContext";
import {
    checkIcoInput,
    DEFAULT_MAINNET_RPC,
    exportUnclaimedCsv,
    fetchIcoStats,
    fetchRecentActivations,
    formatDate,
    formatFiat,
    formatNumber,
    formatXtz,
    shortAddress,
    verifyOnNodeRpc,
    type IcoCheckResult,
    type IcoCommitment,
    type IcoStats,
    type NodeRpcVerification,
} from "../../lib/commitments";

// Sample test items for quick-try buttons
const SAMPLES = {
    activatedOp: "oneVHfFbCU2UAu86SchGfgXSWdvC5TY49SqmAnq72HUmMt3oSeK",
    activatedTz1: "tz1dd9TDNzfWptP63wcsBT4Yr5mhNgZdF7dj",
    unclaimedBtz1: "btz1LL9tNH31aV19K4BTuKgJpri7GPryvp3C4",
    nonIcoTz1: "tz1burnburnburnburnburnburnburjAYjjX",
    exchangeSenderTz1: "tz1TKqshmjE5dJYdEpqQBPLgyABdLECSP3ta",
};

type RecentSortKey =
    | "level"
    | "amount"
    | "claimValue"
    | "currentBalance"
    | "toExchange"
    | "toWallet"
    | "account";

export default function IcoCommitments() {
    const lab = getLab("ico-commitments");
    const { address: connectedAddress } = useTezos();

    usePageMeta({
        title: "ICO Commitments — Tezos Fundraiser Verifier — Labs — hack.tez",
        description:
            "Understand Tezos fundraiser (ICO) commitments, verify whether any account or operation was a legitimate activation, and inspect unclaimed genesis balances and fund flows.",
        path: "/labs/ico-commitments",
    });

    // -------------------------------------------------------------------------
    // Currency Preference: USD vs EUR
    // -------------------------------------------------------------------------
    const [currency, setCurrency] = useState<"USD" | "EUR">("USD");

    // -------------------------------------------------------------------------
    // State: Stats & Unclaimed list
    // -------------------------------------------------------------------------
    const [stats, setStats] = useState<IcoStats | null>(null);
    const [unclaimedList, setUnclaimedList] = useState<IcoCommitment[]>([]);
    const [statsLoading, setStatsLoading] = useState(true);
    const [statsError, setStatsError] = useState<string | null>(null);
    const hasFetchedStats = useRef(false);

    // -------------------------------------------------------------------------
    // State: Recent activations
    // -------------------------------------------------------------------------
    const [recentActivations, setRecentActivations] = useState<IcoCommitment[]>([]);
    const [recentLoading, setRecentLoading] = useState(true);
    const [recentError, setRecentError] = useState<string | null>(null);
    const [recentFilter, setRecentFilter] = useState<"all" | "stayed" | "exchange" | "wallet">("all");
    const [recentSortKey, setRecentSortKey] = useState<RecentSortKey>("level");
    const [recentSortDir, setRecentSortDir] = useState<"asc" | "desc">("desc");
    const hasFetchedRecent = useRef(false);

    // -------------------------------------------------------------------------
    // State: Checker tool
    // -------------------------------------------------------------------------
    const [checkInput, setCheckInput] = useState("");
    const [checkBusy, setCheckBusy] = useState(false);
    const [checkResult, setCheckResult] = useState<IcoCheckResult | null>(null);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    // -------------------------------------------------------------------------
    // State: Unclaimed table controls
    // -------------------------------------------------------------------------
    const [unclaimedSearch, setUnclaimedSearch] = useState("");
    const [unclaimedFilterMode, setUnclaimedFilterMode] = useState<"all" | "whales" | "1k">("all");
    const [unclaimedSortKey, setUnclaimedSortKey] = useState<"balance" | "address">("balance");
    const [unclaimedSortDir, setUnclaimedSortDir] = useState<"asc" | "desc">("desc");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);

    // -------------------------------------------------------------------------
    // State: Node RPC verifier
    // -------------------------------------------------------------------------
    const [nodeAccordionOpen, setNodeAccordionOpen] = useState(false);
    const [rpcUrl, setRpcUrl] = useState(DEFAULT_MAINNET_RPC);
    const [rpcBtz1, setRpcBtz1] = useState("");
    const [rpcTz1, setRpcTz1] = useState("");
    const [rpcBusy, setRpcBusy] = useState(false);
    const [rpcError, setRpcError] = useState<string | null>(null);
    const [rpcResult, setRpcResult] = useState<NodeRpcVerification | null>(null);
    const [showRawRpcJson, setShowRawRpcJson] = useState(false);

    const nodeSectionRef = useRef<HTMLDivElement>(null);

    // -------------------------------------------------------------------------
    // Copy helper
    // -------------------------------------------------------------------------
    const copyToClipboard = useCallback((text: string, key: string) => {
        navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 1800);
    }, []);

    // -------------------------------------------------------------------------
    // Fetch stats & unclaimed list
    // -------------------------------------------------------------------------
    const loadStats = useCallback(async () => {
        if (!hasFetchedStats.current) {
            setStatsLoading(true);
        }
        setStatsError(null);
        try {
            const data = await fetchIcoStats();
            setStats(data.stats);
            setUnclaimedList(data.unclaimed);
            hasFetchedStats.current = true;
        } catch (err) {
            setStatsError(err instanceof Error ? err.message : "Failed to load commitment stats");
        } finally {
            setStatsLoading(false);
        }
    }, []);

    // -------------------------------------------------------------------------
    // Fetch recent activations
    // -------------------------------------------------------------------------
    const loadRecent = useCallback(async () => {
        if (!hasFetchedRecent.current) {
            setRecentLoading(true);
        }
        setRecentError(null);
        try {
            const list = await fetchRecentActivations(25);
            setRecentActivations(list);
            hasFetchedRecent.current = true;
        } catch (err) {
            setRecentError(err instanceof Error ? err.message : "Failed to load recent activations");
        } finally {
            setRecentLoading(false);
        }
    }, []);

    useEffect(() => {
        loadStats();
        loadRecent();
    }, [loadStats, loadRecent]);

    // -------------------------------------------------------------------------
    // Execute check
    // -------------------------------------------------------------------------
    const runCheck = useCallback(
        async (rawVal: string) => {
            const val = rawVal.trim();
            if (!val) return;
            setCheckBusy(true);
            try {
                const res = await checkIcoInput(val, unclaimedList);
                setCheckResult(res);
            } catch {
                setCheckResult({
                    status: "invalid",
                    verdict: "Verification check failed",
                    explanation: "Unable to complete check due to a network error. Please try again.",
                    input: val,
                    detectedType: "other",
                });
            } finally {
                setCheckBusy(false);
            }
        },
        [unclaimedList],
    );

    // -------------------------------------------------------------------------
    // Execute Node RPC verification
    // -------------------------------------------------------------------------
    const runRpcVerify = useCallback(async () => {
        const cleanBtz1 = rpcBtz1.trim();
        if (!cleanBtz1) {
            setRpcError("Please enter a blinded address (btz1…) to query on the node.");
            return;
        }
        setRpcBusy(true);
        setRpcError(null);
        setRpcResult(null);
        try {
            const res = await verifyOnNodeRpc(rpcUrl, cleanBtz1, rpcTz1);
            setRpcResult(res);
        } catch (err) {
            setRpcError(err instanceof Error ? err.message : "Node verification failed. Check RPC URL.");
        } finally {
            setRpcBusy(false);
        }
    }, [rpcUrl, rpcBtz1, rpcTz1]);

    const prefillNodeVerifier = useCallback((btz1: string, tz1?: string) => {
        setRpcBtz1(btz1);
        if (tz1) setRpcTz1(tz1);
        setNodeAccordionOpen(true);
        setTimeout(() => {
            nodeSectionRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
    }, []);

    // -------------------------------------------------------------------------
    // Sort & filter recent activations
    // -------------------------------------------------------------------------
    const handleRecentSort = (key: RecentSortKey) => {
        if (recentSortKey === key) {
            setRecentSortDir((d) => (d === "asc" ? "desc" : "asc"));
        } else {
            setRecentSortKey(key);
            setRecentSortDir("desc");
        }
    };

    const sortedRecentActivations = useMemo(() => {
        let list = recentActivations;

        if (recentFilter === "stayed") {
            list = list.filter((c) => (c.currentBalance ?? 0) >= (c.balance * 0.8));
        } else if (recentFilter === "exchange") {
            list = list.filter((c) => (c.toExchange ?? 0) > 0);
        } else if (recentFilter === "wallet") {
            list = list.filter((c) => (c.toWallet ?? 0) > 0);
        }

        return [...list].sort((a, b) => {
            let diff = 0;
            switch (recentSortKey) {
                case "level":
                    diff = (a.activationLevel ?? 0) - (b.activationLevel ?? 0);
                    break;
                case "amount":
                    diff = a.balance - b.balance;
                    break;
                case "claimValue": {
                    const priceA = currency === "USD" ? (a.quote?.usd ?? 0) : (a.quote?.eur ?? 0);
                    const priceB = currency === "USD" ? (b.quote?.usd ?? 0) : (b.quote?.eur ?? 0);
                    diff = (a.balance / 1e6) * priceA - (b.balance / 1e6) * priceB;
                    break;
                }
                case "currentBalance":
                    diff = (a.currentBalance ?? 0) - (b.currentBalance ?? 0);
                    break;
                case "toExchange":
                    diff = (a.toExchange ?? 0) - (b.toExchange ?? 0);
                    break;
                case "toWallet":
                    diff = (a.toWallet ?? 0) - (b.toWallet ?? 0);
                    break;
                case "account": {
                    const addrA = a.activatedAccount?.address || "";
                    const addrB = b.activatedAccount?.address || "";
                    diff = addrA.localeCompare(addrB);
                    break;
                }
            }
            return recentSortDir === "desc" ? -diff : diff;
        });
    }, [recentActivations, recentFilter, recentSortKey, recentSortDir, currency]);

    // -------------------------------------------------------------------------
    // Filter and sort unclaimed list
    // -------------------------------------------------------------------------
    const filteredUnclaimed = useMemo(() => {
        let result = unclaimedList;

        if (unclaimedFilterMode === "whales") {
            result = result.filter((c) => c.balance >= 10_000_000_000);
        } else if (unclaimedFilterMode === "1k") {
            result = result.filter((c) => c.balance >= 1_000_000_000);
        }

        if (unclaimedSearch.trim()) {
            const q = unclaimedSearch.trim().toLowerCase();
            result = result.filter((c) => {
                const xtz = (c.balance / 1e6).toString();
                return c.address.toLowerCase().includes(q) || xtz.includes(q);
            });
        }

        return [...result].sort((a, b) => {
            if (unclaimedSortKey === "balance") {
                return unclaimedSortDir === "desc" ? b.balance - a.balance : a.balance - b.balance;
            }
            return unclaimedSortDir === "desc"
                ? b.address.localeCompare(a.address)
                : a.address.localeCompare(b.address);
        });
    }, [unclaimedList, unclaimedFilterMode, unclaimedSearch, unclaimedSortKey, unclaimedSortDir]);

    const totalPages = Math.max(1, Math.ceil(filteredUnclaimed.length / pageSize));
    const paginatedUnclaimed = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredUnclaimed.slice(start, start + pageSize);
    }, [filteredUnclaimed, page, pageSize]);

    return (
        <div className="container" style={{ paddingBlock: "3rem", maxWidth: "1080px" }}>
            {/* Breadcrumb Navigation */}
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
                    marginBottom: "1.2rem",
                }}
            >
                <ArrowLeft size={14} aria-hidden="true" /> labs
            </Link>

            {/* Header */}
            <header style={{ marginBottom: "2rem" }}>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: "0.5rem",
                        marginBottom: "0.5rem",
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                        <Coins size={28} aria-hidden="true" style={{ color: "var(--ok)" }} />
                        <h1
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "clamp(1.5rem, 4vw, 2.2rem)",
                                letterSpacing: "-0.02em",
                                margin: 0,
                            }}
                        >
                            // ICO COMMITMENTS
                        </h1>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        {/* Currency Toggle */}
                        <div
                            role="group"
                            aria-label="Select currency for valuation quotes"
                            style={{
                                display: "inline-flex",
                                border: "1px solid var(--border)",
                                background: "var(--bg-2)",
                            }}
                        >
                            <button
                                type="button"
                                onClick={() => setCurrency("USD")}
                                aria-pressed={currency === "USD"}
                                style={{
                                    background: currency === "USD" ? "var(--fg)" : "transparent",
                                    color: currency === "USD" ? "var(--bg)" : "var(--fg-muted)",
                                    border: "none",
                                    fontFamily: "var(--font-mono)",
                                    fontSize: "0.72rem",
                                    padding: "0.3rem 0.65rem",
                                    minHeight: "34px",
                                    cursor: "pointer",
                                    fontWeight: currency === "USD" ? 700 : 400,
                                }}
                            >
                                USD ($)
                            </button>
                            <button
                                type="button"
                                onClick={() => setCurrency("EUR")}
                                aria-pressed={currency === "EUR"}
                                style={{
                                    background: currency === "EUR" ? "var(--fg)" : "transparent",
                                    color: currency === "EUR" ? "var(--bg)" : "var(--fg-muted)",
                                    border: "none",
                                    fontFamily: "var(--font-mono)",
                                    fontSize: "0.72rem",
                                    padding: "0.3rem 0.65rem",
                                    minHeight: "34px",
                                    cursor: "pointer",
                                    fontWeight: currency === "EUR" ? 700 : 400,
                                }}
                            >
                                EUR (€)
                            </button>
                        </div>

                        {lab && (
                            <span
                                style={{
                                    fontFamily: "var(--font-mono)",
                                    fontSize: "0.65rem",
                                    letterSpacing: "0.08em",
                                    textTransform: "uppercase",
                                    padding: "0.2em 0.6em",
                                    color: "var(--ok)",
                                    background: "var(--ok-bg)",
                                    border: "1px solid var(--ok)",
                                }}
                            >
                                mainnet verifier
                            </span>
                        )}
                    </div>
                </div>

                {/* Plain-language explainer (3-4 sentences max) */}
                <div
                    style={{
                        borderLeft: "3px solid var(--accent)",
                        paddingLeft: "1rem",
                        marginTop: "1rem",
                        color: "var(--fg-2)",
                        fontSize: "0.95rem",
                        lineHeight: 1.6,
                        maxWidth: "75ch",
                    }}
                >
                    <p style={{ margin: "0 0 0.5rem" }}>
                        In 2017 the Tezos fundraiser created a fixed list of commitments, fixed at genesis. Each holds a
                        balance until its owner activates it with a secret code.
                    </p>
                    <p style={{ margin: "0 0 0.5rem" }}>
                        Activation moves the balance to a normal tz1 account. It does not mint new tez.
                    </p>
                    <p style={{ margin: 0 }}>
                        The list is finite and public, so anyone can verify an activation.
                    </p>
                </div>
            </header>

            {/* ------------------------------------------------------------- */}
            {/* 1. Summary Cards (Finite Genesis Commitments)                 */}
            {/* ------------------------------------------------------------- */}
            <section aria-label="Commitment statistics" style={{ marginBottom: "2.5rem" }}>
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))",
                        gap: "0.75rem",
                    }}
                >
                    {/* Total Commitments */}
                    <div
                        style={{
                            border: "1px solid var(--border)",
                            background: "var(--bg-2)",
                            padding: "0.85rem 1rem",
                            minWidth: 0,
                            overflow: "hidden",
                        }}
                    >
                        <div
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.68rem",
                                color: "var(--fg-muted)",
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                marginBottom: "0.4rem",
                            }}
                        >
                            Total Commitments
                        </div>
                        <div
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "clamp(1.1rem, 1.8vw + 0.4rem, 1.4rem)",
                                fontWeight: 700,
                                color: "var(--fg)",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                            }}
                        >
                            {statsLoading ? "…" : formatNumber(stats?.totalCount ?? 31525)}
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "var(--fg-muted)", marginTop: "0.2rem" }}>
                            Fixed at genesis
                        </div>
                    </div>

                    {/* Claimed */}
                    <div
                        style={{
                            border: "1px solid var(--border)",
                            background: "var(--bg-2)",
                            padding: "0.85rem 1rem",
                            minWidth: 0,
                            overflow: "hidden",
                        }}
                    >
                        <div
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.68rem",
                                color: "var(--ok)",
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                marginBottom: "0.4rem",
                            }}
                        >
                            Claimed / Activated
                        </div>
                        <div
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "clamp(1.1rem, 1.8vw + 0.4rem, 1.4rem)",
                                fontWeight: 700,
                                color: "var(--ok)",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                            }}
                        >
                            {statsLoading ? "…" : formatNumber(stats?.claimedCount ?? 0)}
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "var(--fg-muted)", marginTop: "0.2rem" }}>
                            {stats
                                ? `${((stats.claimedCount / stats.totalCount) * 100).toFixed(1)}% of total`
                                : "Activated on-chain"}
                        </div>
                    </div>

                    {/* Unclaimed */}
                    <div
                        style={{
                            border: "1px solid var(--border)",
                            background: "var(--bg-2)",
                            padding: "0.85rem 1rem",
                            minWidth: 0,
                            overflow: "hidden",
                        }}
                    >
                        <div
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.68rem",
                                color: "var(--warn)",
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                marginBottom: "0.4rem",
                            }}
                        >
                            Unclaimed Count
                        </div>
                        <div
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "clamp(1.1rem, 1.8vw + 0.4rem, 1.4rem)",
                                fontWeight: 700,
                                color: "var(--warn)",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                            }}
                        >
                            {statsLoading ? "…" : formatNumber(stats?.unclaimedCount ?? 0)}
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "var(--fg-muted)", marginTop: "0.2rem" }}>
                            Awaiting activation
                        </div>
                    </div>

                    {/* Total Unclaimed XTZ (Dynamically sized single line, no logo wrapping) */}
                    <div
                        style={{
                            border: "1px solid var(--border)",
                            background: "var(--bg-2)",
                            padding: "0.85rem 1rem",
                            minWidth: 0,
                            overflow: "hidden",
                        }}
                    >
                        <div
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.68rem",
                                color: "var(--accent)",
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                marginBottom: "0.4rem",
                            }}
                        >
                            Unclaimed XTZ
                        </div>
                        <div
                            title={stats ? `${formatNumber(stats.unclaimedXtz)} ꜩ` : undefined}
                            style={{
                                display: "flex",
                                alignItems: "baseline",
                                gap: "0.35rem",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                            }}
                        >
                            <span
                                style={{
                                    fontFamily: "var(--font-mono)",
                                    fontSize: "clamp(1.02rem, 1.6vw + 0.35rem, 1.35rem)",
                                    fontWeight: 700,
                                    color: "var(--accent)",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    letterSpacing: "-0.01em",
                                }}
                            >
                                {statsLoading ? "…" : formatNumber(stats?.unclaimedXtz ?? 0)}
                            </span>
                            <span
                                style={{
                                    fontFamily: "var(--font-mono)",
                                    fontSize: "clamp(0.85rem, 1.3vw + 0.3rem, 1.05rem)",
                                    fontWeight: 600,
                                    color: "var(--accent)",
                                    whiteSpace: "nowrap",
                                    flexShrink: 0,
                                }}
                            >
                                ꜩ
                            </span>
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "var(--fg-muted)", marginTop: "0.2rem" }}>
                            ~20M tez still unclaimed
                        </div>
                    </div>

                    {/* Whales >= 10,000 XTZ */}
                    <div
                        style={{
                            border: "1px solid var(--border)",
                            background: "var(--bg-2)",
                            padding: "0.85rem 1rem",
                            minWidth: 0,
                            overflow: "hidden",
                        }}
                    >
                        <div
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.68rem",
                                color: "var(--purple)",
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                marginBottom: "0.4rem",
                            }}
                        >
                            Holding ≥ 10,000 ꜩ
                        </div>
                        <div
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "clamp(1.1rem, 1.8vw + 0.4rem, 1.4rem)",
                                fontWeight: 700,
                                color: "var(--purple)",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                            }}
                        >
                            {statsLoading ? "…" : formatNumber(stats?.over10kCount ?? 0)}
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "var(--fg-muted)", marginTop: "0.2rem" }}>
                            Unclaimed large commitments
                        </div>
                    </div>
                </div>

                {statsError && (
                    <div
                        role="alert"
                        style={{
                            marginTop: "0.75rem",
                            padding: "0.5rem 0.8rem",
                            fontSize: "0.8rem",
                            color: "var(--err)",
                            border: "1px solid var(--err)",
                            background: "var(--err-bg)",
                            fontFamily: "var(--font-mono)",
                        }}
                    >
                        {statsError}
                    </div>
                )}
            </section>

            {/* ------------------------------------------------------------- */}
            {/* 2. "Check Something" Box (Main Feature)                       */}
            {/* ------------------------------------------------------------- */}
            <section
                aria-labelledby="checker-heading"
                style={{
                    border: "1px solid var(--border-2)",
                    background: "var(--bg-2)",
                    padding: "clamp(1rem, 2.5vw, 1.5rem)",
                    marginBottom: "2.5rem",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: "0.5rem",
                        marginBottom: "0.8rem",
                    }}
                >
                    <h2
                        id="checker-heading"
                        style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "1.1rem",
                            margin: 0,
                            letterSpacing: "-0.01em",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                        }}
                    >
                        <Search size={18} aria-hidden="true" style={{ color: "var(--accent)" }} />
                        Check an account, blinded address, or operation
                    </h2>

                    {connectedAddress && (
                        <button
                            type="button"
                            onClick={() => {
                                setCheckInput(connectedAddress);
                                void runCheck(connectedAddress);
                            }}
                            style={{
                                background: "transparent",
                                border: "1px solid var(--border)",
                                color: "var(--fg)",
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.72rem",
                                padding: "0.35rem 0.65rem",
                                minHeight: "36px",
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.35rem",
                            }}
                            title="Check the connected wallet address"
                        >
                            <Wallet size={12} aria-hidden="true" />
                            Check my wallet ({shortAddress(connectedAddress, 5, 4)})
                        </button>
                    )}
                </div>

                <p style={{ color: "var(--fg-muted)", fontSize: "0.85rem", margin: "0 0 1rem" }}>
                    Paste an operation hash (<code>o…</code>), a <code>tz1…</code> account, or a blinded address (
                    <code>btz1…</code>). We will verify whether it matches a real Tezos fundraiser commitment, check its
                    current balance, and inspect multi-hop fund flows to major exchanges (Binance, Coinbase, Kraken, etc.).
                </p>

                {/* Input Form with WCAG label */}
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        void runCheck(checkInput);
                    }}
                    style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.8rem" }}
                >
                    <label htmlFor="ico-checker-input" style={{ position: "absolute", width: "1px", height: "1px", padding: 0, margin: "-1px", overflow: "hidden", clip: "rect(0,0,0,0)", border: 0 }}>
                        Address or operation hash to verify
                    </label>
                    <div style={{ flex: "1 1 280px", position: "relative" }}>
                        <input
                            id="ico-checker-input"
                            type="text"
                            value={checkInput}
                            onChange={(e) => setCheckInput(e.target.value)}
                            placeholder="Paste o…, tz1…, or btz1…"
                            style={{
                                width: "100%",
                                minHeight: "42px",
                                padding: "0.65rem 0.8rem",
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.85rem",
                                background: "var(--bg)",
                                color: "var(--fg)",
                                border: "1px solid var(--border)",
                                outline: "none",
                                boxSizing: "border-box",
                            }}
                        />
                        {checkInput && (
                            <button
                                type="button"
                                onClick={() => {
                                    setCheckInput("");
                                    setCheckResult(null);
                                }}
                                aria-label="Clear input"
                                style={{
                                    position: "absolute",
                                    right: "0.6rem",
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    background: "transparent",
                                    border: "none",
                                    color: "var(--fg-muted)",
                                    cursor: "pointer",
                                    padding: "0.4rem",
                                    minWidth: "32px",
                                    minHeight: "32px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                }}
                            >
                                <X size={16} aria-hidden="true" />
                            </button>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={checkBusy || !checkInput.trim()}
                        style={{
                            background: "var(--fg)",
                            color: "var(--bg)",
                            border: "none",
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.85rem",
                            fontWeight: 600,
                            padding: "0.65rem 1.4rem",
                            minHeight: "42px",
                            cursor: checkBusy || !checkInput.trim() ? "not-allowed" : "pointer",
                            opacity: checkBusy || !checkInput.trim() ? 0.6 : 1,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.4rem",
                        }}
                    >
                        {checkBusy ? (
                            <>
                                <RefreshCw size={14} className="animate-spin" aria-hidden="true" />
                                Checking…
                            </>
                        ) : (
                            <>Check</>
                        )}
                    </button>
                </form>

                {/* Example Quick-Pick Chips */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        flexWrap: "wrap",
                        fontSize: "0.72rem",
                        color: "var(--fg-muted)",
                    }}
                >
                    <span style={{ fontFamily: "var(--font-mono)" }}>Try:</span>
                    <button
                        type="button"
                        onClick={() => {
                            setCheckInput(SAMPLES.activatedOp);
                            void runCheck(SAMPLES.activatedOp);
                        }}
                        style={{
                            background: "var(--bg)",
                            border: "1px solid var(--border)",
                            color: "var(--fg-2)",
                            padding: "0.3rem 0.6rem",
                            minHeight: "34px",
                            cursor: "pointer",
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.72rem",
                            display: "inline-flex",
                            alignItems: "center",
                        }}
                    >
                        Activated op (o…)
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setCheckInput(SAMPLES.activatedTz1);
                            void runCheck(SAMPLES.activatedTz1);
                        }}
                        style={{
                            background: "var(--bg)",
                            border: "1px solid var(--border)",
                            color: "var(--fg-2)",
                            padding: "0.3rem 0.6rem",
                            minHeight: "34px",
                            cursor: "pointer",
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.72rem",
                            display: "inline-flex",
                            alignItems: "center",
                        }}
                    >
                        Activated account (tz1…)
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setCheckInput(SAMPLES.exchangeSenderTz1);
                            void runCheck(SAMPLES.exchangeSenderTz1);
                        }}
                        style={{
                            background: "var(--bg)",
                            border: "1px solid var(--border)",
                            color: "var(--warn)",
                            padding: "0.3rem 0.6rem",
                            minHeight: "34px",
                            cursor: "pointer",
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.72rem",
                            display: "inline-flex",
                            alignItems: "center",
                        }}
                    >
                        Sent to Binance (tz1…)
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setCheckInput(SAMPLES.unclaimedBtz1);
                            void runCheck(SAMPLES.unclaimedBtz1);
                        }}
                        style={{
                            background: "var(--bg)",
                            border: "1px solid var(--border)",
                            color: "var(--fg-2)",
                            padding: "0.3rem 0.6rem",
                            minHeight: "34px",
                            cursor: "pointer",
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.72rem",
                            display: "inline-flex",
                            alignItems: "center",
                        }}
                    >
                        Unclaimed commitment (btz1…)
                    </button>
                </div>

                {/* Verdict Display */}
                {checkResult && (
                    <div
                        role="status"
                        aria-live="polite"
                        style={{
                            marginTop: "1.5rem",
                            border: "1px solid",
                            borderColor:
                                checkResult.status === "activation"
                                    ? "var(--ok)"
                                    : checkResult.status === "unclaimed"
                                    ? "var(--warn)"
                                    : "var(--err)",
                            background:
                                checkResult.status === "activation"
                                    ? "var(--ok-bg)"
                                    : checkResult.status === "unclaimed"
                                    ? "var(--warn-bg)"
                                    : "var(--err-bg)",
                            padding: "1.2rem",
                        }}
                    >
                        {/* Verdict Header */}
                        <div
                            style={{
                                display: "flex",
                                alignItems: "flex-start",
                                justifyContent: "space-between",
                                flexWrap: "wrap",
                                gap: "0.5rem",
                                marginBottom: "0.6rem",
                            }}
                        >
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                {checkResult.status === "activation" && (
                                    <CheckCircle2 size={22} aria-hidden="true" style={{ color: "var(--ok)" }} />
                                )}
                                {checkResult.status === "unclaimed" && (
                                    <AlertCircle size={22} aria-hidden="true" style={{ color: "var(--warn)" }} />
                                )}
                                {checkResult.status !== "activation" && checkResult.status !== "unclaimed" && (
                                    <ShieldAlert size={22} aria-hidden="true" style={{ color: "var(--err)" }} />
                                )}

                                <span
                                    style={{
                                        fontFamily: "var(--font-mono)",
                                        fontWeight: 700,
                                        fontSize: "1.1rem",
                                        color:
                                            checkResult.status === "activation"
                                                ? "var(--ok)"
                                                : checkResult.status === "unclaimed"
                                                ? "var(--warn)"
                                                : "var(--err)",
                                    }}
                                >
                                    {checkResult.verdict}
                                </span>
                            </div>

                            {checkResult.tzktUrl && (
                                <a
                                    href={checkResult.tzktUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        fontFamily: "var(--font-mono)",
                                        fontSize: "0.72rem",
                                        color: "var(--fg)",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "0.25rem",
                                        textDecoration: "underline",
                                    }}
                                >
                                    View on TzKT <ExternalLink size={12} aria-hidden="true" />
                                </a>
                            )}
                        </div>

                        {/* Plain one-line explanation */}
                        <p
                            style={{
                                color: "var(--fg)",
                                fontSize: "0.9rem",
                                margin: "0 0 1rem",
                                lineHeight: 1.5,
                            }}
                        >
                            {checkResult.explanation}
                        </p>

                        {/* Detailed Key-Values for Activations and Unclaimed Commitments */}
                        {(checkResult.status === "activation" || checkResult.status === "unclaimed") && (
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                                    gap: "0.75rem",
                                    paddingTop: "0.8rem",
                                    borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                                }}
                            >
                                {checkResult.amountXtz !== undefined && (
                                    <div>
                                        <div
                                            style={{
                                                fontFamily: "var(--font-mono)",
                                                fontSize: "0.65rem",
                                                color: "var(--fg-muted)",
                                                textTransform: "uppercase",
                                            }}
                                        >
                                            Claimed ICO Amount
                                        </div>
                                        <div
                                            style={{
                                                fontFamily: "var(--font-mono)",
                                                fontSize: "1rem",
                                                fontWeight: 700,
                                                color: "var(--fg)",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {formatXtz(checkResult.amountMutez ?? 0, 6)} ꜩ
                                        </div>
                                        <div style={{ fontSize: "0.68rem", color: "var(--fg-muted)" }}>
                                            {formatNumber(checkResult.amountMutez ?? 0)} mutez
                                        </div>
                                    </div>
                                )}

                                {/* Quote at Claim Time */}
                                {checkResult.quote && (
                                    <div>
                                        <div
                                            style={{
                                                fontFamily: "var(--font-mono)",
                                                fontSize: "0.65rem",
                                                color: "var(--accent)",
                                                textTransform: "uppercase",
                                            }}
                                        >
                                            Value at Claim Time
                                        </div>
                                        <div
                                            style={{
                                                fontFamily: "var(--font-mono)",
                                                fontSize: "0.95rem",
                                                fontWeight: 700,
                                                color: "var(--accent)",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {currency === "USD"
                                                ? formatFiat(
                                                      (checkResult.amountXtz ?? 0) * (checkResult.quote.usd ?? 0),
                                                      "USD",
                                                  )
                                                : formatFiat(
                                                      (checkResult.amountXtz ?? 0) * (checkResult.quote.eur ?? 0),
                                                      "EUR",
                                                  )}
                                        </div>
                                        <div style={{ fontSize: "0.68rem", color: "var(--fg-muted)" }}>
                                            Rate:{" "}
                                            {currency === "USD"
                                                ? `$${(checkResult.quote.usd ?? 0).toFixed(4)}/ꜩ`
                                                : `€${(checkResult.quote.eur ?? 0).toFixed(4)}/ꜩ`}
                                        </div>
                                    </div>
                                )}

                                {/* Current Balance (Stayed) */}
                                {checkResult.currentBalanceXtz !== undefined && (
                                    <div>
                                        <div
                                            style={{
                                                fontFamily: "var(--font-mono)",
                                                fontSize: "0.65rem",
                                                color: "var(--ok)",
                                                textTransform: "uppercase",
                                            }}
                                        >
                                            Current Balance (Stayed)
                                        </div>
                                        <div
                                            style={{
                                                fontFamily: "var(--font-mono)",
                                                fontSize: "1rem",
                                                fontWeight: 700,
                                                color: "var(--ok)",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {formatXtz(checkResult.currentBalanceMutez ?? 0)} ꜩ
                                        </div>
                                        <div style={{ fontSize: "0.68rem", color: "var(--fg-muted)" }}>
                                            {checkResult.amountMutez
                                                ? `${(((checkResult.currentBalanceMutez ?? 0) / checkResult.amountMutez) * 100).toFixed(1)}% of claimed tez`
                                                : "Live account balance"}
                                        </div>
                                    </div>
                                )}

                                {/* Moved to Exchange */}
                                {checkResult.toExchangeXtz !== undefined && (
                                    <div>
                                        <div
                                            style={{
                                                fontFamily: "var(--font-mono)",
                                                fontSize: "0.65rem",
                                                color:
                                                    (checkResult.toExchangeXtz ?? 0) > 0
                                                        ? "var(--warn)"
                                                        : "var(--fg-muted)",
                                                textTransform: "uppercase",
                                            }}
                                        >
                                            Moved to Exchange
                                        </div>
                                        <div
                                            style={{
                                                fontFamily: "var(--font-mono)",
                                                fontSize: "1rem",
                                                fontWeight: 700,
                                                color:
                                                    (checkResult.toExchangeXtz ?? 0) > 0
                                                        ? "var(--warn)"
                                                        : "var(--fg-muted)",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {formatXtz(checkResult.toExchangeMutez ?? 0)} ꜩ
                                        </div>
                                        <div style={{ fontSize: "0.68rem", color: "var(--fg-muted)", lineHeight: 1.4 }}>
                                            {(checkResult.toExchangeXtz ?? 0) > 0 ? (
                                                checkResult.exchangeHops === 0 ? (
                                                    `Direct transfer to ${checkResult.exchangeName || "exchange"}`
                                                ) : (
                                                    <div>
                                                        <span style={{ color: "var(--fg)", fontWeight: 600 }}>No direct exchange transfers</span>
                                                        <div style={{ color: "var(--warn)", marginTop: "0.1rem" }}>
                                                            Reached {checkResult.exchangeName || "exchange"} in {checkResult.exchangeHops} hop{(checkResult.exchangeHops ?? 1) > 1 ? "s" : ""}
                                                            {checkResult.exchangeVia ? ` via ${shortAddress(checkResult.exchangeVia, 5, 4)}` : ""}
                                                        </div>
                                                    </div>
                                                )
                                            ) : (
                                                "No direct exchange transfers (none within 2 hops)"
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Moved to Other Wallet */}
                                {checkResult.toWalletXtz !== undefined && (
                                    <div>
                                        <div
                                            style={{
                                                fontFamily: "var(--font-mono)",
                                                fontSize: "0.65rem",
                                                color: "var(--fg-muted)",
                                                textTransform: "uppercase",
                                            }}
                                        >
                                            Moved to Other Wallet
                                        </div>
                                        <div
                                            style={{
                                                fontFamily: "var(--font-mono)",
                                                fontSize: "1rem",
                                                fontWeight: 700,
                                                color: "var(--fg)",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {formatXtz(checkResult.toWalletMutez ?? 0)} ꜩ
                                        </div>
                                        <div style={{ fontSize: "0.68rem", color: "var(--fg-muted)" }}>
                                            {(checkResult.toWalletXtz ?? 0) > 0
                                                ? "Sent to private address"
                                                : "No private transfers"}
                                        </div>
                                    </div>
                                )}

                                {checkResult.date && (
                                    <div>
                                        <div
                                            style={{
                                                fontFamily: "var(--font-mono)",
                                                fontSize: "0.65rem",
                                                color: "var(--fg-muted)",
                                                textTransform: "uppercase",
                                            }}
                                        >
                                            Activation Date
                                        </div>
                                        <div
                                            style={{
                                                fontFamily: "var(--font-mono)",
                                                fontSize: "0.85rem",
                                                color: "var(--fg)",
                                            }}
                                        >
                                            {formatDate(checkResult.date)}
                                        </div>
                                    </div>
                                )}

                                {checkResult.blindedAddress && (
                                    <div>
                                        <div
                                            style={{
                                                fontFamily: "var(--font-mono)",
                                                fontSize: "0.65rem",
                                                color: "var(--fg-muted)",
                                                textTransform: "uppercase",
                                            }}
                                        >
                                            Blinded Address (btz1)
                                        </div>
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "0.3rem",
                                                fontSize: "0.8rem",
                                                fontFamily: "var(--font-mono)",
                                            }}
                                        >
                                            <span title={checkResult.blindedAddress}>
                                                {shortAddress(checkResult.blindedAddress, 7, 5)}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    copyToClipboard(checkResult.blindedAddress!, "blinded")
                                                }
                                                aria-label="Copy blinded address"
                                                style={{
                                                    background: "transparent",
                                                    border: "none",
                                                    color: "var(--fg-muted)",
                                                    cursor: "pointer",
                                                    padding: "0.25rem",
                                                    minWidth: "28px",
                                                    minHeight: "28px",
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                }}
                                            >
                                                {copiedKey === "blinded" ? (
                                                    <Check size={12} style={{ color: "var(--ok)" }} />
                                                ) : (
                                                    <Copy size={12} />
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {checkResult.accountAddress && (
                                    <div>
                                        <div
                                            style={{
                                                fontFamily: "var(--font-mono)",
                                                fontSize: "0.65rem",
                                                color: "var(--fg-muted)",
                                                textTransform: "uppercase",
                                            }}
                                        >
                                            Activated Account (tz1)
                                        </div>
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "0.3rem",
                                                fontSize: "0.8rem",
                                                fontFamily: "var(--font-mono)",
                                            }}
                                        >
                                            <span title={checkResult.accountAddress}>
                                                {shortAddress(checkResult.accountAddress, 7, 5)}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    copyToClipboard(checkResult.accountAddress!, "account")
                                                }
                                                aria-label="Copy account address"
                                                style={{
                                                    background: "transparent",
                                                    border: "none",
                                                    color: "var(--fg-muted)",
                                                    cursor: "pointer",
                                                    padding: "0.25rem",
                                                    minWidth: "28px",
                                                    minHeight: "28px",
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                }}
                                            >
                                                {copiedKey === "account" ? (
                                                    <Check size={12} style={{ color: "var(--ok)" }} />
                                                ) : (
                                                    <Copy size={12} />
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Outgoing Transfers List if present */}
                        {checkResult.outgoingTransfers && checkResult.outgoingTransfers.length > 0 && (
                            <div
                                style={{
                                    marginTop: "1rem",
                                    paddingTop: "0.8rem",
                                    borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                                }}
                            >
                                <div
                                    style={{
                                        fontFamily: "var(--font-mono)",
                                        fontSize: "0.72rem",
                                        fontWeight: 600,
                                        color: "var(--fg)",
                                        marginBottom: "0.4rem",
                                    }}
                                >
                                    Outgoing Transfers ({checkResult.outgoingTransfers.length}):
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                                    {checkResult.outgoingTransfers.map((tx) => (
                                        <div
                                            key={tx.hash}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                flexWrap: "wrap",
                                                fontSize: "0.75rem",
                                                fontFamily: "var(--font-mono)",
                                                background: "rgba(0, 0, 0, 0.2)",
                                                padding: "0.3rem 0.5rem",
                                                border: "1px solid var(--border)",
                                            }}
                                        >
                                            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                                <span style={{ fontWeight: 600, color: "var(--fg)" }}>
                                                    {formatXtz(tx.amountMutez)} ꜩ
                                                </span>
                                                <span style={{ color: "var(--fg-muted)" }}>→</span>
                                                <span title={tx.targetAddress}>{shortAddress(tx.targetAddress, 7, 5)}</span>
                                                {tx.isExchange && (
                                                    <span
                                                        style={{
                                                            fontSize: "0.62rem",
                                                            textTransform: "uppercase",
                                                            padding: "0.1em 0.4em",
                                                            color: "var(--warn)",
                                                            background: "var(--warn-bg)",
                                                            border: "1px solid var(--warn)",
                                                            letterSpacing: "0.02em",
                                                        }}
                                                    >
                                                        {tx.hops === 0
                                                            ? `Direct • ${tx.exchangeName || "Exchange"}`
                                                            : `${tx.exchangeName || "Exchange"} (${tx.hops} hop${(tx.hops ?? 1) > 1 ? "s" : ""})`}
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                                <span style={{ color: "var(--fg-muted)", fontSize: "0.7rem" }}>
                                                    {formatDate(tx.timestamp)}
                                                </span>
                                                <a
                                                    href={`https://tzkt.io/${tx.hash}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    style={{ color: "var(--fg)", textDecoration: "underline" }}
                                                >
                                                    <ExternalLink size={11} aria-hidden="true" />
                                                </a>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Node verifier prefill button */}
                        {checkResult.blindedAddress && (
                            <div style={{ marginTop: "1rem", textAlign: "right" }}>
                                <button
                                    type="button"
                                    onClick={() =>
                                        prefillNodeVerifier(
                                            checkResult.blindedAddress!,
                                            checkResult.accountAddress,
                                        )
                                    }
                                    style={{
                                        background: "transparent",
                                        border: "1px solid var(--border)",
                                        color: "var(--fg)",
                                        fontFamily: "var(--font-mono)",
                                        fontSize: "0.72rem",
                                        padding: "0.3rem 0.7rem",
                                        cursor: "pointer",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "0.35rem",
                                    }}
                                >
                                    <Server size={13} aria-hidden="true" />
                                    Verify on node context →
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </section>

            {/* ------------------------------------------------------------- */}
            {/* 3. Recent Activations Table (With Sortable Headers & Flow)    */}
            {/* ------------------------------------------------------------- */}
            <section aria-labelledby="recent-heading" style={{ marginBottom: "2.5rem" }}>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: "0.5rem",
                        marginBottom: "0.8rem",
                    }}
                >
                    <div>
                        <h2
                            id="recent-heading"
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "1.1rem",
                                margin: "0 0 0.2rem",
                                letterSpacing: "-0.01em",
                            }}
                        >
                            Recent Activations & Flow Analysis
                        </h2>
                        <p style={{ color: "var(--fg-muted)", fontSize: "0.8rem", margin: 0 }}>
                            See current balances and whether claimed funds stayed in the wallet, went to an exchange (Binance, Coinbase, etc.), or moved elsewhere.
                        </p>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        {/* Flow Filter Buttons */}
                        <div
                            role="group"
                            aria-label="Filter recent activations by fund disposition"
                            style={{
                                display: "inline-flex",
                                border: "1px solid var(--border)",
                                background: "var(--bg-2)",
                            }}
                        >
                            <button
                                type="button"
                                onClick={() => setRecentFilter("all")}
                                aria-pressed={recentFilter === "all"}
                                style={{
                                    background: recentFilter === "all" ? "var(--fg)" : "transparent",
                                    color: recentFilter === "all" ? "var(--bg)" : "var(--fg-muted)",
                                    border: "none",
                                    fontFamily: "var(--font-mono)",
                                    fontSize: "0.72rem",
                                    padding: "0.3rem 0.6rem",
                                    minHeight: "34px",
                                    cursor: "pointer",
                                }}
                            >
                                All
                            </button>
                            <button
                                type="button"
                                onClick={() => setRecentFilter("stayed")}
                                aria-pressed={recentFilter === "stayed"}
                                style={{
                                    background: recentFilter === "stayed" ? "var(--fg)" : "transparent",
                                    color: recentFilter === "stayed" ? "var(--bg)" : "var(--fg-muted)",
                                    border: "none",
                                    fontFamily: "var(--font-mono)",
                                    fontSize: "0.72rem",
                                    padding: "0.3rem 0.6rem",
                                    minHeight: "34px",
                                    cursor: "pointer",
                                }}
                            >
                                Stayed (≥ 80%)
                            </button>
                            <button
                                type="button"
                                onClick={() => setRecentFilter("exchange")}
                                aria-pressed={recentFilter === "exchange"}
                                style={{
                                    background: recentFilter === "exchange" ? "var(--fg)" : "transparent",
                                    color: recentFilter === "exchange" ? "var(--bg)" : "var(--fg-muted)",
                                    border: "none",
                                    fontFamily: "var(--font-mono)",
                                    fontSize: "0.72rem",
                                    padding: "0.3rem 0.6rem",
                                    minHeight: "34px",
                                    cursor: "pointer",
                                }}
                            >
                                To Exchange
                            </button>
                            <button
                                type="button"
                                onClick={() => setRecentFilter("wallet")}
                                aria-pressed={recentFilter === "wallet"}
                                style={{
                                    background: recentFilter === "wallet" ? "var(--fg)" : "transparent",
                                    color: recentFilter === "wallet" ? "var(--bg)" : "var(--fg-muted)",
                                    border: "none",
                                    fontFamily: "var(--font-mono)",
                                    fontSize: "0.72rem",
                                    padding: "0.3rem 0.6rem",
                                    minHeight: "34px",
                                    cursor: "pointer",
                                }}
                            >
                                To Other Wallet
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={loadRecent}
                            disabled={recentLoading}
                            style={{
                                background: "transparent",
                                border: "1px solid var(--border)",
                                color: "var(--fg-muted)",
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.7rem",
                                padding: "0.3rem 0.6rem",
                                cursor: recentLoading ? "not-allowed" : "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.35rem",
                            }}
                        >
                            <RefreshCw size={12} className={recentLoading ? "animate-spin" : ""} aria-hidden="true" />
                            Refresh
                        </button>
                    </div>
                </div>

                <div
                    style={{
                        border: "1px solid var(--border)",
                        background: "var(--bg-2)",
                        overflowX: "auto",
                    }}
                >
                    <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                        <thead>
                            <tr
                                style={{
                                    borderBottom: "1px solid var(--border)",
                                    background: "var(--bg)",
                                    fontFamily: "var(--font-mono)",
                                    fontSize: "0.68rem",
                                    color: "var(--fg-muted)",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.04em",
                                }}
                            >
                                <th
                                    scope="col"
                                    aria-sort={recentSortKey === "level" ? (recentSortDir === "asc" ? "ascending" : "descending") : "none"}
                                    style={{ padding: "0.3rem 0.5rem", whiteSpace: "nowrap" }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => handleRecentSort("level")}
                                        style={{
                                            background: "none",
                                            border: "none",
                                            color: "inherit",
                                            font: "inherit",
                                            textTransform: "inherit",
                                            letterSpacing: "inherit",
                                            cursor: "pointer",
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: "0.3rem",
                                            padding: "0.3rem 0.4rem",
                                            minHeight: "36px",
                                        }}
                                    >
                                        <span>Date / Level</span>
                                        {recentSortKey === "level" &&
                                            (recentSortDir === "asc" ? (
                                                <ChevronUp size={12} aria-hidden="true" />
                                            ) : (
                                                <ChevronDown size={12} aria-hidden="true" />
                                            ))}
                                    </button>
                                </th>
                                <th
                                    scope="col"
                                    aria-sort={recentSortKey === "amount" ? (recentSortDir === "asc" ? "ascending" : "descending") : "none"}
                                    style={{ padding: "0.3rem 0.5rem", whiteSpace: "nowrap", textAlign: "right" }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => handleRecentSort("amount")}
                                        style={{
                                            background: "none",
                                            border: "none",
                                            color: "inherit",
                                            font: "inherit",
                                            textTransform: "inherit",
                                            letterSpacing: "inherit",
                                            cursor: "pointer",
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: "0.3rem",
                                            padding: "0.3rem 0.4rem",
                                            minHeight: "36px",
                                            marginLeft: "auto",
                                        }}
                                    >
                                        <span>Claimed (ꜩ)</span>
                                        {recentSortKey === "amount" &&
                                            (recentSortDir === "asc" ? (
                                                <ChevronUp size={12} aria-hidden="true" />
                                            ) : (
                                                <ChevronDown size={12} aria-hidden="true" />
                                            ))}
                                    </button>
                                </th>
                                <th
                                    scope="col"
                                    aria-sort={recentSortKey === "claimValue" ? (recentSortDir === "asc" ? "ascending" : "descending") : "none"}
                                    style={{ padding: "0.3rem 0.5rem", whiteSpace: "nowrap", textAlign: "right" }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => handleRecentSort("claimValue")}
                                        style={{
                                            background: "none",
                                            border: "none",
                                            color: "inherit",
                                            font: "inherit",
                                            textTransform: "inherit",
                                            letterSpacing: "inherit",
                                            cursor: "pointer",
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: "0.3rem",
                                            padding: "0.3rem 0.4rem",
                                            minHeight: "36px",
                                            marginLeft: "auto",
                                        }}
                                    >
                                        <span>Quote at Claim ({currency})</span>
                                        {recentSortKey === "claimValue" &&
                                            (recentSortDir === "asc" ? (
                                                <ChevronUp size={12} aria-hidden="true" />
                                            ) : (
                                                <ChevronDown size={12} aria-hidden="true" />
                                            ))}
                                    </button>
                                </th>
                                <th
                                    scope="col"
                                    aria-sort={recentSortKey === "currentBalance" ? (recentSortDir === "asc" ? "ascending" : "descending") : "none"}
                                    style={{ padding: "0.3rem 0.5rem", whiteSpace: "nowrap", textAlign: "right" }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => handleRecentSort("currentBalance")}
                                        style={{
                                            background: "none",
                                            border: "none",
                                            color: "inherit",
                                            font: "inherit",
                                            textTransform: "inherit",
                                            letterSpacing: "inherit",
                                            cursor: "pointer",
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: "0.3rem",
                                            padding: "0.3rem 0.4rem",
                                            minHeight: "36px",
                                            marginLeft: "auto",
                                        }}
                                    >
                                        <span>Stayed in Wallet</span>
                                        {recentSortKey === "currentBalance" &&
                                            (recentSortDir === "asc" ? (
                                                <ChevronUp size={12} aria-hidden="true" />
                                            ) : (
                                                <ChevronDown size={12} aria-hidden="true" />
                                            ))}
                                    </button>
                                </th>
                                <th
                                    scope="col"
                                    aria-sort={recentSortKey === "toExchange" ? (recentSortDir === "asc" ? "ascending" : "descending") : "none"}
                                    style={{ padding: "0.3rem 0.5rem", whiteSpace: "nowrap", textAlign: "right" }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => handleRecentSort("toExchange")}
                                        style={{
                                            background: "none",
                                            border: "none",
                                            color: "inherit",
                                            font: "inherit",
                                            textTransform: "inherit",
                                            letterSpacing: "inherit",
                                            cursor: "pointer",
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: "0.3rem",
                                            padding: "0.3rem 0.4rem",
                                            minHeight: "36px",
                                            marginLeft: "auto",
                                        }}
                                    >
                                        <span>To Exchange</span>
                                        {recentSortKey === "toExchange" &&
                                            (recentSortDir === "asc" ? (
                                                <ChevronUp size={12} aria-hidden="true" />
                                            ) : (
                                                <ChevronDown size={12} aria-hidden="true" />
                                            ))}
                                    </button>
                                </th>
                                <th
                                    scope="col"
                                    aria-sort={recentSortKey === "toWallet" ? (recentSortDir === "asc" ? "ascending" : "descending") : "none"}
                                    style={{ padding: "0.3rem 0.5rem", whiteSpace: "nowrap", textAlign: "right" }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => handleRecentSort("toWallet")}
                                        style={{
                                            background: "none",
                                            border: "none",
                                            color: "inherit",
                                            font: "inherit",
                                            textTransform: "inherit",
                                            letterSpacing: "inherit",
                                            cursor: "pointer",
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: "0.3rem",
                                            padding: "0.3rem 0.4rem",
                                            minHeight: "36px",
                                            marginLeft: "auto",
                                        }}
                                    >
                                        <span>To Other Wallet</span>
                                        {recentSortKey === "toWallet" &&
                                            (recentSortDir === "asc" ? (
                                                <ChevronUp size={12} aria-hidden="true" />
                                            ) : (
                                                <ChevronDown size={12} aria-hidden="true" />
                                            ))}
                                    </button>
                                </th>
                                <th
                                    scope="col"
                                    aria-sort={recentSortKey === "account" ? (recentSortDir === "asc" ? "ascending" : "descending") : "none"}
                                    style={{ padding: "0.3rem 0.5rem", whiteSpace: "nowrap" }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => handleRecentSort("account")}
                                        style={{
                                            background: "none",
                                            border: "none",
                                            color: "inherit",
                                            font: "inherit",
                                            textTransform: "inherit",
                                            letterSpacing: "inherit",
                                            cursor: "pointer",
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: "0.3rem",
                                            padding: "0.3rem 0.4rem",
                                            minHeight: "36px",
                                        }}
                                    >
                                        <span>Account (tz1)</span>
                                        {recentSortKey === "account" &&
                                            (recentSortDir === "asc" ? (
                                                <ChevronUp size={12} aria-hidden="true" />
                                            ) : (
                                                <ChevronDown size={12} aria-hidden="true" />
                                            ))}
                                    </button>
                                </th>
                                <th scope="col" style={{ padding: "0.6rem 0.7rem", textAlign: "right" }}>Inspect</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recentLoading && recentActivations.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={8}
                                        style={{
                                            padding: "2rem",
                                            textAlign: "center",
                                            color: "var(--fg-muted)",
                                            fontFamily: "var(--font-mono)",
                                            fontSize: "0.85rem",
                                        }}
                                    >
                                        Loading recent activations and fund flows…
                                    </td>
                                </tr>
                            ) : recentError ? (
                                <tr>
                                    <td
                                        colSpan={8}
                                        style={{
                                            padding: "1.5rem",
                                            textAlign: "center",
                                            color: "var(--err)",
                                            fontFamily: "var(--font-mono)",
                                            fontSize: "0.8rem",
                                        }}
                                    >
                                        {recentError}
                                    </td>
                                </tr>
                            ) : sortedRecentActivations.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={8}
                                        style={{
                                            padding: "2rem",
                                            textAlign: "center",
                                            color: "var(--fg-muted)",
                                            fontFamily: "var(--font-mono)",
                                            fontSize: "0.85rem",
                                        }}
                                    >
                                        No activations match this filter.
                                    </td>
                                </tr>
                            ) : (
                                sortedRecentActivations.map((c) => {
                                    const initXtz = c.balance / 1e6;
                                    const curMutez = c.currentBalance ?? c.balance;
                                    const exMutez = c.toExchange ?? 0;
                                    const exXtz = exMutez / 1e6;
                                    const wallMutez = c.toWallet ?? 0;
                                    const wallXtz = wallMutez / 1e6;
                                    const stayPct = c.balance > 0 ? (curMutez / c.balance) * 100 : 0;
                                    const rate = currency === "USD" ? (c.quote?.usd ?? 0) : (c.quote?.eur ?? 0);
                                    const fiatVal = initXtz * rate;

                                    return (
                                        <tr
                                            key={c.activatedAccount?.address || c.address}
                                            style={{
                                                borderBottom: "1px solid var(--border)",
                                                fontSize: "0.78rem",
                                                fontFamily: "var(--font-mono)",
                                            }}
                                        >
                                            {/* Date / Level */}
                                            <td style={{ padding: "0.55rem 0.7rem", whiteSpace: "nowrap" }}>
                                                <div>{formatDate(c.activationTime)}</div>
                                                <div style={{ fontSize: "0.68rem", color: "var(--fg-muted)" }}>
                                                    #{c.activationLevel?.toLocaleString()}
                                                </div>
                                            </td>

                                            {/* Claimed Amount */}
                                            <td
                                                style={{
                                                    padding: "0.55rem 0.7rem",
                                                    fontWeight: 700,
                                                    color: "var(--fg)",
                                                    textAlign: "right",
                                                    whiteSpace: "nowrap",
                                                }}
                                            >
                                                {formatXtz(c.balance)} ꜩ
                                            </td>

                                            {/* Fiat Quote at Claim */}
                                            <td style={{ padding: "0.55rem 0.7rem", textAlign: "right", whiteSpace: "nowrap" }}>
                                                {rate > 0 ? (
                                                    <div>
                                                        <div style={{ fontWeight: 600, color: "var(--accent)" }}>
                                                            {formatFiat(fiatVal, currency)}
                                                        </div>
                                                        <div style={{ fontSize: "0.65rem", color: "var(--fg-muted)" }}>
                                                            {currency === "USD" ? `$${rate.toFixed(3)}/ꜩ` : `€${rate.toFixed(3)}/ꜩ`}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span style={{ color: "var(--fg-muted)" }}>—</span>
                                                )}
                                            </td>

                                            {/* Stayed in Wallet */}
                                            <td
                                                style={{
                                                    padding: "0.55rem 0.7rem",
                                                    textAlign: "right",
                                                    whiteSpace: "nowrap",
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        fontWeight: 600,
                                                        color: stayPct >= 80 ? "var(--ok)" : "var(--fg-muted)",
                                                    }}
                                                >
                                                    {formatXtz(curMutez)} ꜩ
                                                </div>
                                                <div style={{ fontSize: "0.65rem", color: "var(--fg-muted)" }}>
                                                    {stayPct.toFixed(1)}% stayed
                                                </div>
                                            </td>

                                            {/* To Exchange */}
                                            <td
                                                style={{
                                                    padding: "0.55rem 0.7rem",
                                                    textAlign: "right",
                                                    whiteSpace: "nowrap",
                                                }}
                                            >
                                                {exXtz > 0 ? (
                                                    <div>
                                                        <div style={{ fontWeight: 600, color: "var(--warn)" }}>
                                                            {formatXtz(exMutez)} ꜩ
                                                        </div>
                                                        {c.exchangeHops === 0 ? (
                                                            <div
                                                                style={{
                                                                    fontSize: "0.65rem",
                                                                    color: "var(--warn)",
                                                                    textTransform: "uppercase",
                                                                }}
                                                            >
                                                                Direct • {c.exchangeName || "Exchange"}
                                                            </div>
                                                        ) : (
                                                            <div>
                                                                <span
                                                                    style={{
                                                                        fontSize: "0.62rem",
                                                                        color: "var(--warn)",
                                                                        background: "var(--warn-bg)",
                                                                        border: "1px solid var(--warn)",
                                                                        padding: "0.05rem 0.3rem",
                                                                        textTransform: "uppercase",
                                                                        display: "inline-block",
                                                                        marginTop: "0.1rem",
                                                                        fontWeight: 600,
                                                                    }}
                                                                >
                                                                    {c.exchangeName || "Exchange"} ({c.exchangeHops} hop{(c.exchangeHops ?? 1) > 1 ? "s" : ""})
                                                                </span>
                                                                <div style={{ fontSize: "0.62rem", color: "var(--fg-muted)", marginTop: "0.15rem" }}>
                                                                    No direct transfers • via {shortAddress(c.exchangeVia || "", 4, 3)}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <div style={{ color: "var(--fg-muted)" }}>0.00 ꜩ</div>
                                                        <div style={{ fontSize: "0.62rem", color: "var(--fg-muted)" }}>
                                                            No direct transfers
                                                        </div>
                                                    </div>
                                                )}
                                            </td>

                                            {/* To Other Wallet */}
                                            <td
                                                style={{
                                                    padding: "0.55rem 0.7rem",
                                                    textAlign: "right",
                                                    whiteSpace: "nowrap",
                                                }}
                                            >
                                                {wallXtz > 0 ? (
                                                    <div>
                                                        <div style={{ fontWeight: 600, color: "var(--fg)" }}>
                                                            {formatXtz(wallMutez)} ꜩ
                                                        </div>
                                                        {c.topRecipient && (
                                                            <div style={{ fontSize: "0.65rem", color: "var(--fg-muted)" }}>
                                                                → {shortAddress(c.topRecipient, 5, 3)}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span style={{ color: "var(--fg-muted)" }}>0.00 ꜩ</span>
                                                )}
                                            </td>

                                            {/* Activated Account */}
                                            <td style={{ padding: "0.55rem 0.7rem" }}>
                                                {c.activatedAccount?.address ? (
                                                    <span title={c.activatedAccount.address}>
                                                        {shortAddress(c.activatedAccount.address, 6, 4)}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: "var(--fg-muted)" }}>—</span>
                                                )}
                                            </td>

                                            {/* Action Button */}
                                            <td style={{ padding: "0.55rem 0.7rem", textAlign: "right" }}>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const target = c.activatedAccount?.address || c.address;
                                                        setCheckInput(target);
                                                        void runCheck(target);
                                                        window.scrollTo({ top: 300, behavior: "smooth" });
                                                    }}
                                                    style={{
                                                        background: "var(--bg)",
                                                        border: "1px solid var(--border)",
                                                        color: "var(--fg)",
                                                        fontFamily: "var(--font-mono)",
                                                        fontSize: "0.72rem",
                                                        padding: "0.25rem 0.55rem",
                                                        minHeight: "32px",
                                                        cursor: "pointer",
                                                    }}
                                                >
                                                    Inspect
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* ------------------------------------------------------------- */}
            {/* 4. Unclaimed List (Sortable, Paginated, CSV Export)           */}
            {/* ------------------------------------------------------------- */}
            <section aria-labelledby="unclaimed-heading" style={{ marginBottom: "2.5rem" }}>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: "0.6rem",
                        marginBottom: "0.8rem",
                    }}
                >
                    <div>
                        <h2
                            id="unclaimed-heading"
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "1.1rem",
                                margin: "0 0 0.2rem",
                                letterSpacing: "-0.01em",
                            }}
                        >
                            Unclaimed Commitments ({formatNumber(filteredUnclaimed.length)})
                        </h2>
                        <p style={{ color: "var(--fg-muted)", fontSize: "0.8rem", margin: 0 }}>
                            Genesis commitments that have never been activated. Each holds unspent fundraiser tez.
                        </p>
                    </div>

                    {/* CSV Export Button */}
                    <button
                        type="button"
                        onClick={() => exportUnclaimedCsv(filteredUnclaimed)}
                        disabled={filteredUnclaimed.length === 0}
                        style={{
                            background: "var(--bg-2)",
                            border: "1px solid var(--border)",
                            color: "var(--fg)",
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.75rem",
                            padding: "0.4rem 0.8rem",
                            cursor: filteredUnclaimed.length === 0 ? "not-allowed" : "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.4rem",
                        }}
                    >
                        <Download size={14} aria-hidden="true" />
                        Export CSV ({formatNumber(filteredUnclaimed.length)})
                    </button>
                </div>

                {/* Filter and Search Controls */}
                <div
                    style={{
                        display: "flex",
                        gap: "0.6rem",
                        flexWrap: "wrap",
                        alignItems: "center",
                        marginBottom: "0.8rem",
                    }}
                >
                    {/* Quick Filter Tabs */}
                    <div
                        role="group"
                        aria-label="Filter unclaimed commitments by balance"
                        style={{
                            display: "inline-flex",
                            border: "1px solid var(--border)",
                            background: "var(--bg)",
                        }}
                    >
                        <button
                            type="button"
                            onClick={() => {
                                setUnclaimedFilterMode("all");
                                setPage(1);
                            }}
                            aria-pressed={unclaimedFilterMode === "all"}
                            style={{
                                background: unclaimedFilterMode === "all" ? "var(--fg)" : "transparent",
                                color: unclaimedFilterMode === "all" ? "var(--bg)" : "var(--fg-muted)",
                                border: "none",
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.72rem",
                                padding: "0.35rem 0.65rem",
                                minHeight: "34px",
                                cursor: "pointer",
                            }}
                        >
                            All ({formatNumber(unclaimedList.length)})
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setUnclaimedFilterMode("whales");
                                setPage(1);
                            }}
                            aria-pressed={unclaimedFilterMode === "whales"}
                            style={{
                                background: unclaimedFilterMode === "whales" ? "var(--fg)" : "transparent",
                                color: unclaimedFilterMode === "whales" ? "var(--bg)" : "var(--fg-muted)",
                                border: "none",
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.72rem",
                                padding: "0.35rem 0.65rem",
                                minHeight: "34px",
                                cursor: "pointer",
                            }}
                        >
                            Whales (≥ 10k ꜩ)
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setUnclaimedFilterMode("1k");
                                setPage(1);
                            }}
                            aria-pressed={unclaimedFilterMode === "1k"}
                            style={{
                                background: unclaimedFilterMode === "1k" ? "var(--fg)" : "transparent",
                                color: unclaimedFilterMode === "1k" ? "var(--bg)" : "var(--fg-muted)",
                                border: "none",
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.72rem",
                                padding: "0.35rem 0.65rem",
                                minHeight: "34px",
                                cursor: "pointer",
                            }}
                        >
                            ≥ 1k ꜩ
                        </button>
                    </div>

                    {/* Search Input */}
                    <div style={{ flex: "1 1 200px" }}>
                        <label htmlFor="unclaimed-search" style={{ position: "absolute", width: "1px", height: "1px", padding: 0, margin: "-1px", overflow: "hidden", clip: "rect(0,0,0,0)", border: 0 }}>
                            Search unclaimed commitments
                        </label>
                        <input
                            id="unclaimed-search"
                            type="text"
                            value={unclaimedSearch}
                            onChange={(e) => {
                                setUnclaimedSearch(e.target.value);
                                setPage(1);
                            }}
                            placeholder="Filter by btz1 address or balance…"
                            style={{
                                width: "100%",
                                minHeight: "36px",
                                padding: "0.4rem 0.65rem",
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.78rem",
                                background: "var(--bg)",
                                color: "var(--fg)",
                                border: "1px solid var(--border)",
                                outline: "none",
                                boxSizing: "border-box",
                            }}
                        />
                    </div>

                    {/* Page Size Selector */}
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.3rem",
                            fontSize: "0.72rem",
                            color: "var(--fg-muted)",
                            fontFamily: "var(--font-mono)",
                        }}
                    >
                        <label htmlFor="unclaimed-page-size">Rows:</label>
                        <select
                            id="unclaimed-page-size"
                            value={pageSize}
                            onChange={(e) => {
                                setPageSize(Number(e.target.value));
                                setPage(1);
                            }}
                            style={{
                                background: "var(--bg)",
                                color: "var(--fg)",
                                border: "1px solid var(--border)",
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.72rem",
                                padding: "0.25rem 0.4rem",
                                minHeight: "36px",
                            }}
                        >
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                        </select>
                    </div>
                </div>

                {/* Table */}
                <div
                    style={{
                        border: "1px solid var(--border)",
                        background: "var(--bg-2)",
                        overflowX: "auto",
                    }}
                >
                    <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                        <thead>
                            <tr
                                style={{
                                    borderBottom: "1px solid var(--border)",
                                    background: "var(--bg)",
                                    fontFamily: "var(--font-mono)",
                                    fontSize: "0.68rem",
                                    color: "var(--fg-muted)",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.04em",
                                }}
                            >
                                <th scope="col" style={{ padding: "0.6rem 0.8rem", width: "50px" }}>#</th>
                                <th
                                    scope="col"
                                    aria-sort={unclaimedSortKey === "address" ? (unclaimedSortDir === "asc" ? "ascending" : "descending") : "none"}
                                    style={{ padding: "0.3rem 0.5rem" }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (unclaimedSortKey === "address") {
                                                setUnclaimedSortDir((d) => (d === "asc" ? "desc" : "asc"));
                                            } else {
                                                setUnclaimedSortKey("address");
                                                setUnclaimedSortDir("asc");
                                            }
                                        }}
                                        style={{
                                            background: "none",
                                            border: "none",
                                            color: "inherit",
                                            font: "inherit",
                                            textTransform: "inherit",
                                            letterSpacing: "inherit",
                                            cursor: "pointer",
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: "0.3rem",
                                            padding: "0.3rem 0.4rem",
                                            minHeight: "36px",
                                        }}
                                    >
                                        <span>Blinded Address (btz1)</span>
                                        {unclaimedSortKey === "address" &&
                                            (unclaimedSortDir === "asc" ? (
                                                <ChevronUp size={12} aria-hidden="true" />
                                            ) : (
                                                <ChevronDown size={12} aria-hidden="true" />
                                            ))}
                                    </button>
                                </th>
                                <th
                                    scope="col"
                                    aria-sort={unclaimedSortKey === "balance" ? (unclaimedSortDir === "asc" ? "ascending" : "descending") : "none"}
                                    style={{
                                        padding: "0.3rem 0.5rem",
                                        textAlign: "right",
                                    }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (unclaimedSortKey === "balance") {
                                                setUnclaimedSortDir((d) => (d === "asc" ? "desc" : "asc"));
                                            } else {
                                                setUnclaimedSortKey("balance");
                                                setUnclaimedSortDir("desc");
                                            }
                                        }}
                                        style={{
                                            background: "none",
                                            border: "none",
                                            color: "inherit",
                                            font: "inherit",
                                            textTransform: "inherit",
                                            letterSpacing: "inherit",
                                            cursor: "pointer",
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: "0.3rem",
                                            padding: "0.3rem 0.4rem",
                                            minHeight: "36px",
                                            marginLeft: "auto",
                                        }}
                                    >
                                        <span>Balance (XTZ)</span>
                                        {unclaimedSortKey === "balance" &&
                                            (unclaimedSortDir === "asc" ? (
                                                <ChevronUp size={12} aria-hidden="true" />
                                            ) : (
                                                <ChevronDown size={12} aria-hidden="true" />
                                            ))}
                                    </button>
                                </th>
                                <th scope="col" style={{ padding: "0.6rem 0.8rem", textAlign: "right" }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {statsLoading && unclaimedList.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={4}
                                        style={{
                                            padding: "2rem",
                                            textAlign: "center",
                                            color: "var(--fg-muted)",
                                            fontFamily: "var(--font-mono)",
                                            fontSize: "0.85rem",
                                        }}
                                    >
                                        Loading unclaimed commitments…
                                    </td>
                                </tr>
                            ) : paginatedUnclaimed.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={4}
                                        style={{
                                            padding: "2rem",
                                            textAlign: "center",
                                            color: "var(--fg-muted)",
                                            fontFamily: "var(--font-mono)",
                                            fontSize: "0.85rem",
                                        }}
                                    >
                                        No unclaimed commitments match this filter.
                                    </td>
                                </tr>
                            ) : (
                                paginatedUnclaimed.map((c, idx) => {
                                    const rowNum = (page - 1) * pageSize + idx + 1;
                                    return (
                                        <tr
                                            key={c.address}
                                            style={{
                                                borderBottom: "1px solid var(--border)",
                                                fontSize: "0.8rem",
                                                fontFamily: "var(--font-mono)",
                                            }}
                                        >
                                            <td style={{ padding: "0.55rem 0.8rem", color: "var(--fg-muted)" }}>
                                                {rowNum}
                                            </td>
                                            <td style={{ padding: "0.55rem 0.8rem" }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                                    <span title={c.address}>{c.address}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => copyToClipboard(c.address, c.address)}
                                                        aria-label={`Copy address ${c.address}`}
                                                        style={{
                                                            background: "transparent",
                                                            border: "none",
                                                            color: "var(--fg-muted)",
                                                            cursor: "pointer",
                                                            padding: "0.25rem",
                                                            minWidth: "28px",
                                                            minHeight: "28px",
                                                            display: "inline-flex",
                                                            alignItems: "center",
                                                            justifyContent: "center",
                                                        }}
                                                    >
                                                        {copiedKey === c.address ? (
                                                            <Check size={12} style={{ color: "var(--ok)" }} />
                                                        ) : (
                                                            <Copy size={12} />
                                                        )}
                                                    </button>
                                                </div>
                                            </td>
                                            <td
                                                style={{
                                                    padding: "0.55rem 0.8rem",
                                                    textAlign: "right",
                                                    fontWeight: 600,
                                                    color: c.balance >= 10_000_000_000 ? "var(--purple)" : "var(--warn)",
                                                }}
                                            >
                                                {formatXtz(c.balance)} ꜩ
                                            </td>
                                            <td style={{ padding: "0.55rem 0.8rem", textAlign: "right" }}>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setCheckInput(c.address);
                                                        void runCheck(c.address);
                                                        window.scrollTo({ top: 300, behavior: "smooth" });
                                                    }}
                                                    style={{
                                                        background: "var(--bg)",
                                                        border: "1px solid var(--border)",
                                                        color: "var(--fg)",
                                                        fontFamily: "var(--font-mono)",
                                                        fontSize: "0.72rem",
                                                        padding: "0.25rem 0.55rem",
                                                        minHeight: "32px",
                                                        cursor: "pointer",
                                                    }}
                                                >
                                                    Check
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: "0.5rem",
                            marginTop: "0.8rem",
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.75rem",
                            color: "var(--fg-muted)",
                        }}
                    >
                        <span>
                            Page {page} of {totalPages} ({formatNumber(filteredUnclaimed.length)} entries)
                        </span>

                        <div style={{ display: "flex", gap: "0.3rem" }}>
                            <button
                                type="button"
                                onClick={() => setPage(1)}
                                disabled={page <= 1}
                                aria-label="First page"
                                style={{
                                    background: "var(--bg-2)",
                                    border: "1px solid var(--border)",
                                    color: "var(--fg)",
                                    padding: "0.35rem 0.65rem",
                                    minHeight: "36px",
                                    cursor: page <= 1 ? "not-allowed" : "pointer",
                                    opacity: page <= 1 ? 0.5 : 1,
                                }}
                            >
                                First
                            </button>
                            <button
                                type="button"
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page <= 1}
                                aria-label="Previous page"
                                style={{
                                    background: "var(--bg-2)",
                                    border: "1px solid var(--border)",
                                    color: "var(--fg)",
                                    padding: "0.35rem 0.65rem",
                                    minHeight: "36px",
                                    minWidth: "36px",
                                    cursor: page <= 1 ? "not-allowed" : "pointer",
                                    opacity: page <= 1 ? 0.5 : 1,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                }}
                            >
                                <ChevronLeft size={14} aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                aria-label="Next page"
                                style={{
                                    background: "var(--bg-2)",
                                    border: "1px solid var(--border)",
                                    color: "var(--fg)",
                                    padding: "0.35rem 0.65rem",
                                    minHeight: "36px",
                                    minWidth: "36px",
                                    cursor: page >= totalPages ? "not-allowed" : "pointer",
                                    opacity: page >= totalPages ? 0.5 : 1,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                }}
                            >
                                <ChevronRight size={14} aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setPage(totalPages)}
                                disabled={page >= totalPages}
                                aria-label="Last page"
                                style={{
                                    background: "var(--bg-2)",
                                    border: "1px solid var(--border)",
                                    color: "var(--fg)",
                                    padding: "0.35rem 0.65rem",
                                    minHeight: "36px",
                                    cursor: page >= totalPages ? "not-allowed" : "pointer",
                                    opacity: page >= totalPages ? 0.5 : 1,
                                }}
                            >
                                Last
                            </button>
                        </div>
                    </div>
                )}
            </section>

            {/* ------------------------------------------------------------- */}
            {/* 5. Collapsible "Advanced: verify on your own node"             */}
            {/* ------------------------------------------------------------- */}
            <div
                ref={nodeSectionRef}
                style={{
                    border: "1px solid var(--border)",
                    background: "var(--bg-card)",
                }}
            >
                <button
                    type="button"
                    onClick={() => setNodeAccordionOpen((o) => !o)}
                    aria-expanded={nodeAccordionOpen}
                    style={{
                        width: "100%",
                        padding: "1rem 1.2rem",
                        background: "transparent",
                        border: "none",
                        color: "var(--fg)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        cursor: "pointer",
                        textAlign: "left",
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                        <Server size={18} aria-hidden="true" style={{ color: "var(--purple)" }} />
                        <div>
                            <span
                                style={{
                                    fontFamily: "var(--font-mono)",
                                    fontWeight: 600,
                                    fontSize: "0.95rem",
                                }}
                            >
                                Advanced: Verify on your own node
                            </span>
                            <div style={{ fontSize: "0.75rem", color: "var(--fg-muted)", marginTop: "0.1rem" }}>
                                For bakers & power users — query Tezos node RPC raw storage context directly
                            </div>
                        </div>
                    </div>
                    {nodeAccordionOpen ? (
                        <ChevronUp size={18} style={{ color: "var(--fg-muted)" }} />
                    ) : (
                        <ChevronDown size={18} style={{ color: "var(--fg-muted)" }} />
                    )}
                </button>

                {nodeAccordionOpen && (
                    <div
                        style={{
                            padding: "0 1.2rem 1.2rem",
                            borderTop: "1px solid var(--border)",
                            marginTop: "0.2rem",
                        }}
                    >
                        <p style={{ color: "var(--fg-muted)", fontSize: "0.82rem", lineHeight: 1.5, marginTop: "1rem" }}>
                            Tezos nodes track active unclaimed fundraiser commitments in the protocol context at:
                            <br />
                            <code>/chains/main/blocks/head/context/raw/json/commitments/{`{btz1}`}</code>.
                            <br />
                            When activated, the protocol consumes and deletes the commitment record from that context path.
                        </p>

                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                                gap: "0.8rem",
                                marginBottom: "1rem",
                            }}
                        >
                            {/* RPC URL Input */}
                            <div>
                                <label
                                    htmlFor="node-rpc-url"
                                    style={{
                                        display: "block",
                                        fontFamily: "var(--font-mono)",
                                        fontSize: "0.7rem",
                                        color: "var(--fg-muted)",
                                        marginBottom: "0.3rem",
                                        textTransform: "uppercase",
                                    }}
                                >
                                    Node RPC URL
                                </label>
                                <input
                                    id="node-rpc-url"
                                    type="text"
                                    value={rpcUrl}
                                    onChange={(e) => setRpcUrl(e.target.value)}
                                    placeholder="e.g. http://localhost:8732 or https://rpc.tzkt.io/mainnet"
                                    style={{
                                        width: "100%",
                                        minHeight: "38px",
                                        padding: "0.5rem 0.7rem",
                                        fontFamily: "var(--font-mono)",
                                        fontSize: "0.8rem",
                                        background: "var(--bg)",
                                        color: "var(--fg)",
                                        border: "1px solid var(--border)",
                                        outline: "none",
                                        boxSizing: "border-box",
                                    }}
                                />
                            </div>

                            {/* Blinded Address Input */}
                            <div>
                                <label
                                    htmlFor="node-rpc-btz1"
                                    style={{
                                        display: "block",
                                        fontFamily: "var(--font-mono)",
                                        fontSize: "0.7rem",
                                        color: "var(--fg-muted)",
                                        marginBottom: "0.3rem",
                                        textTransform: "uppercase",
                                    }}
                                >
                                    Blinded Address (btz1…)
                                </label>
                                <input
                                    id="node-rpc-btz1"
                                    type="text"
                                    value={rpcBtz1}
                                    onChange={(e) => setRpcBtz1(e.target.value)}
                                    placeholder="btz1…"
                                    style={{
                                        width: "100%",
                                        minHeight: "38px",
                                        padding: "0.5rem 0.7rem",
                                        fontFamily: "var(--font-mono)",
                                        fontSize: "0.8rem",
                                        background: "var(--bg)",
                                        color: "var(--fg)",
                                        border: "1px solid var(--border)",
                                        outline: "none",
                                        boxSizing: "border-box",
                                    }}
                                />
                            </div>

                            {/* Activated Account Input (Optional) */}
                            <div>
                                <label
                                    htmlFor="node-rpc-tz1"
                                    style={{
                                        display: "block",
                                        fontFamily: "var(--font-mono)",
                                        fontSize: "0.7rem",
                                        color: "var(--fg-muted)",
                                        marginBottom: "0.3rem",
                                        textTransform: "uppercase",
                                    }}
                                >
                                    Activated Account (tz1…, optional)
                                </label>
                                <input
                                    id="node-rpc-tz1"
                                    type="text"
                                    value={rpcTz1}
                                    onChange={(e) => setRpcTz1(e.target.value)}
                                    placeholder="tz1… to verify live node balance"
                                    style={{
                                        width: "100%",
                                        minHeight: "38px",
                                        padding: "0.5rem 0.7rem",
                                        fontFamily: "var(--font-mono)",
                                        fontSize: "0.8rem",
                                        background: "var(--bg)",
                                        color: "var(--fg)",
                                        border: "1px solid var(--border)",
                                        outline: "none",
                                        boxSizing: "border-box",
                                    }}
                                />
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={runRpcVerify}
                            disabled={rpcBusy || !rpcBtz1.trim()}
                            style={{
                                background: "var(--fg)",
                                color: "var(--bg)",
                                border: "none",
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.82rem",
                                fontWeight: 600,
                                padding: "0.6rem 1.2rem",
                                minHeight: "40px",
                                cursor: rpcBusy || !rpcBtz1.trim() ? "not-allowed" : "pointer",
                                opacity: rpcBusy || !rpcBtz1.trim() ? 0.6 : 1,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.4rem",
                            }}
                        >
                            {rpcBusy ? (
                                <>
                                    <RefreshCw size={13} className="animate-spin" aria-hidden="true" />
                                    Querying node…
                                </>
                            ) : (
                                <>Query Node RPC</>
                            )}
                        </button>

                        {/* Error notice */}
                        {rpcError && (
                            <div
                                role="alert"
                                style={{
                                    marginTop: "0.8rem",
                                    padding: "0.5rem 0.8rem",
                                    fontSize: "0.8rem",
                                    color: "var(--err)",
                                    border: "1px solid var(--err)",
                                    background: "var(--err-bg)",
                                    fontFamily: "var(--font-mono)",
                                }}
                            >
                                {rpcError}
                            </div>
                        )}

                        {/* Node Result Card */}
                        {rpcResult && (
                            <div
                                style={{
                                    marginTop: "1.2rem",
                                    border: "1px solid var(--border)",
                                    background: "var(--bg)",
                                    padding: "1rem",
                                }}
                            >
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        flexWrap: "wrap",
                                        gap: "0.5rem",
                                        marginBottom: "0.8rem",
                                        paddingBottom: "0.5rem",
                                        borderBottom: "1px solid var(--border)",
                                    }}
                                >
                                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.78rem" }}>
                                        <span style={{ color: "var(--fg-muted)" }}>Node Block Head:</span> #
                                        {rpcResult.headLevel.toLocaleString()} ({shortAddress(rpcResult.headHash, 8, 6)})
                                    </div>
                                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--fg-muted)" }}>
                                        {formatDate(rpcResult.headTime)}
                                    </div>
                                </div>

                                {/* Raw Context Verdict */}
                                <div style={{ marginBottom: "0.8rem" }}>
                                    <div
                                        style={{
                                            fontFamily: "var(--font-mono)",
                                            fontSize: "0.7rem",
                                            color: "var(--fg-muted)",
                                            textTransform: "uppercase",
                                            marginBottom: "0.2rem",
                                        }}
                                    >
                                        Context Status (/commitments/{rpcResult.btz1})
                                    </div>
                                    {rpcResult.commitmentExists ? (
                                        <div
                                            style={{
                                                display: "inline-flex",
                                                alignItems: "center",
                                                gap: "0.4rem",
                                                color: "var(--warn)",
                                                fontFamily: "var(--font-mono)",
                                                fontSize: "0.85rem",
                                                fontWeight: 600,
                                            }}
                                        >
                                            <AlertCircle size={16} aria-hidden="true" />
                                            FOUND IN RAW CONTEXT — UNCLAIMED ({formatNumber(rpcResult.commitmentMutez ?? "")} mutez /{" "}
                                            {formatXtz(rpcResult.commitmentMutez ?? "")} ꜩ)
                                        </div>
                                    ) : (
                                        <div
                                            style={{
                                                display: "inline-flex",
                                                alignItems: "center",
                                                gap: "0.4rem",
                                                color: "var(--ok)",
                                                fontFamily: "var(--font-mono)",
                                                fontSize: "0.85rem",
                                                fontWeight: 600,
                                            }}
                                        >
                                            <CheckCircle2 size={16} aria-hidden="true" />
                                            NOT IN RAW CONTEXT (HTTP 404) — Record consumed/activated on-chain
                                        </div>
                                    )}
                                </div>

                                {/* Tz1 Balance if checked */}
                                {rpcResult.tz1 && (
                                    <div style={{ marginBottom: "0.8rem" }}>
                                        <div
                                            style={{
                                                fontFamily: "var(--font-mono)",
                                                fontSize: "0.7rem",
                                                color: "var(--fg-muted)",
                                                textTransform: "uppercase",
                                                marginBottom: "0.2rem",
                                            }}
                                        >
                                            Account Node Balance (/contracts/{rpcResult.tz1}/balance)
                                        </div>
                                        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}>
                                            {rpcResult.tz1BalanceMutez !== undefined ? (
                                                <span style={{ color: "var(--fg)", fontWeight: 600 }}>
                                                    {formatXtz(rpcResult.tz1BalanceMutez, 6)} ꜩ ({formatNumber(rpcResult.tz1BalanceMutez)} mutez)
                                                </span>
                                            ) : (
                                                <span style={{ color: "var(--fg-muted)" }}>
                                                    Account not funded or has zero balance on this node
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Raw JSON Toggle */}
                                <div style={{ marginTop: "0.8rem", paddingTop: "0.5rem", borderTop: "1px solid var(--border)" }}>
                                    <button
                                        type="button"
                                        onClick={() => setShowRawRpcJson((v) => !v)}
                                        style={{
                                            background: "transparent",
                                            border: "none",
                                            color: "var(--fg-muted)",
                                            fontFamily: "var(--font-mono)",
                                            fontSize: "0.7rem",
                                            cursor: "pointer",
                                            padding: 0,
                                        }}
                                    >
                                        {showRawRpcJson ? "Hide raw JSON" : "Show raw JSON"}
                                    </button>
                                    {showRawRpcJson && (
                                        <pre
                                            style={{
                                                marginTop: "0.5rem",
                                                background: "var(--bg-2)",
                                                padding: "0.6rem",
                                                fontSize: "0.7rem",
                                                overflowX: "auto",
                                                color: "var(--fg)",
                                                border: "1px solid var(--border)",
                                            }}
                                        >
                                            {JSON.stringify(rpcResult, null, 2)}
                                        </pre>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
