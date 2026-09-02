/** biome-ignore-all lint/suspicious/noCommentText: <intentional inline tone> */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronDown, Grid3x3, List, Lock, Percent, RefreshCw } from "lucide-react";
import { getLab } from "../../lib/labs";
import { useTezos } from "../../context/TezosContext";
import { usePageMeta } from "../../hooks/usePageMeta";
import ConnectWallet from "../../components/ConnectWallet";
import config from "../../config/tezos";
import {
    fetchSellerListings,
    gatewayUri,
    mutezToTez,
    parseSourceShares,
    planBulkCancel,
    planBulkRelist,
    submitBatch,
    tezToMutez,
    TIP_RECIPIENT,
    type BulkRelistPlan,
    type Listing,
    type ListingState,
    type MarketplaceId,
    type PlannedBatch,
} from "../../lib/bulkRelist";

type ViewMode = "grid" | "list";
type SortKey = "price-asc" | "price-desc" | "created-desc" | "created-asc";
type MarketFilter = "all" | MarketplaceId;
type StateFilter = "all" | ListingState;
type PriceMode = "flat" | "percent";

/** Compute new price in mutez given the current mode + input. Returns null
 *  when the input is empty or invalid. Percent semantics: 100 = unchanged,
 *  125 = +25%, 75 = -25% (input is "new price as % of original"). */
function computeNewPriceMutez(
    oldMutez: string,
    mode: PriceMode,
    flatTez: string,
    percentStr: string,
): string | null {
    if (mode === "flat") {
        return tezToMutez(flatTez);
    }
    const pct = Number(percentStr);
    if (!Number.isFinite(pct) || pct <= 0) return null;
    // Integer math via BigInt — multiply by basis-points-of-percent (×100) so
    // 125.5% stays precise, then divide by 10_000.
    const bps = BigInt(Math.round(pct * 100));
    const old = BigInt(oldMutez || "0");
    return ((old * bps) / 10_000n).toString();
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

const STATE_BADGES: Record<ListingState, { label: string; fg: string; bg: string; border: string }> = {
    relistable: { label: "relistable", fg: "var(--ok)", bg: "transparent", border: "var(--ok)" },
    cancel_only: { label: "cancel only", fg: "var(--warn)", bg: "transparent", border: "var(--warn)" },
    locked: { label: "locked", fg: "var(--fg-muted)", bg: "transparent", border: "var(--border)" },
};

function StateChip({ state, reason }: { state: ListingState; reason?: string }) {
    const cfg = STATE_BADGES[state];
    return (
        <span
            title={reason}
            style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.6rem",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                padding: "0.12em 0.45em",
                color: cfg.fg,
                background: cfg.bg,
                border: `1px solid ${cfg.border}`,
                whiteSpace: "nowrap",
            }}
        >
            {cfg.label}
        </span>
    );
}

function Thumb({ listing, size }: { listing: Listing; size: number }) {
    const src = gatewayUri(listing.token.displayUri) ?? gatewayUri(listing.token.thumbnailUri);
    if (!src) {
        return (
            <div
                style={{
                    width: size,
                    height: size,
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    flexShrink: 0,
                }}
            />
        );
    }
    return (
        <img
            src={src}
            alt={listing.token.name}
            loading="lazy"
            width={size}
            height={size}
            style={{
                width: size,
                height: size,
                objectFit: "cover",
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                flexShrink: 0,
            }}
        />
    );
}

interface SharePolicy {
    enabled: boolean;
    /** Basis points (100 = 1%). */
    bps: number;
}

const SHARE_PRESETS = [
    { bps: 100, label: "1%" },
    { bps: 200, label: "2%" },
    { bps: 500, label: "5%" },
];

/** What kind of bulk action a submit flow is running. Drives modal copy
 *  ("relist"/"cancel") without duplicating the rest of the state machine. */
type SubmitAction = "relist" | "cancel";

type SubmitState =
    | { status: "idle" }
    | { status: "planning"; action: SubmitAction }
    /** Plan computed. `batchIdx` is the index of the NEXT batch to sign; `hashes` is the
     *  ordered list of successful tx hashes so far. On entry `batchIdx=0, hashes=[]`. */
    | { status: "ready"; action: SubmitAction; plan: BulkRelistPlan; batchIdx: number; hashes: string[] }
    /** Wallet prompt is open for batch[batchIdx]. */
    | { status: "signing"; action: SubmitAction; plan: BulkRelistPlan; batchIdx: number; hashes: string[] }
    | { status: "done"; action: SubmitAction; plan: BulkRelistPlan; hashes: string[] }
    | { status: "error"; action?: SubmitAction; message: string; plan?: BulkRelistPlan; hashes?: string[] };

export default function BulkRelist() {
    const lab = getLab("bulk-relist");
    const { client, address, domain, restoring } = useTezos();

    const [listings, setListings] = useState<Listing[]>([]);
    const [loading, setLoading] = useState(false);
    const [scanError, setScanError] = useState<string | null>(null);
    const [hasScanned, setHasScanned] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const [view, setView] = useState<ViewMode>("grid");
    const [sort, setSort] = useState<SortKey>("created-desc");
    const [search, setSearch] = useState("");
    const [marketFilter, setMarketFilter] = useState<MarketFilter>("all");
    const [stateFilter, setStateFilter] = useState<StateFilter>("all");

    const [priceMode, setPriceMode] = useState<PriceMode>("flat");
    const [flatTez, setFlatTez] = useState("");
    const [percent, setPercent] = useState("");

    const [share, setShare] = useState<SharePolicy>({ enabled: false, bps: 200 });
    const [shareCustom, setShareCustom] = useState("");
    const [preserveSplits, setPreserveSplits] = useState(true);

    const [submit, setSubmit] = useState<SubmitState>({ status: "idle" });

    usePageMeta({
        title: "Bulk Relist — objkt + teia bulk reprice — Labs — hack.tez",
        description: "Bulk reprice every objkt and teia listing in one batched flow.",
        path: "/labs/bulk-relist",
    });

    const isMainnet = config.name === "mainnet";
    const showTool = !restoring && !!domain && isMainnet && !!address;

    const scan = useCallback(async () => {
        if (!address) return;
        setLoading(true);
        setScanError(null);
        try {
            const rows = await fetchSellerListings(address);
            setListings(rows);
            // Drop selected ids that no longer exist after refetch.
            setSelected((prev) => {
                const valid = new Set(rows.map((r) => r.id));
                const next = new Set<string>();
                for (const id of prev) if (valid.has(id)) next.add(id);
                return next;
            });
        } catch (err) {
            setScanError(err instanceof Error ? err.message : "scan failed");
        } finally {
            // Flip in finally so a failed scan doesn't re-trigger the
            // auto-scan effect on every render — loop city otherwise.
            setHasScanned(true);
            setLoading(false);
        }
    }, [address]);

    useEffect(() => {
        if (showTool && !hasScanned && !loading) void scan();
    }, [showTool, hasScanned, loading, scan]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const rows = listings.filter((l) => {
            if (marketFilter !== "all" && l.marketplace !== marketFilter) return false;
            if (stateFilter !== "all" && l.state !== stateFilter) return false;
            if (q) {
                const hay = `${l.token.name} ${l.token.collectionName ?? ""} ${l.token.tokenId}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
        rows.sort((a, b) => {
            switch (sort) {
                case "price-asc": {
                    // Compare BigInts directly — Number(BigInt - BigInt) would
                    // lose precision (or throw) for large mutez values.
                    const ap = BigInt(a.priceMutez || "0");
                    const bp = BigInt(b.priceMutez || "0");
                    return ap < bp ? -1 : ap > bp ? 1 : 0;
                }
                case "price-desc": {
                    const ap = BigInt(a.priceMutez || "0");
                    const bp = BigInt(b.priceMutez || "0");
                    return bp < ap ? -1 : bp > ap ? 1 : 0;
                }
                case "created-asc":
                    return a.createdAt.localeCompare(b.createdAt);
                default:
                    return b.createdAt.localeCompare(a.createdAt);
            }
        });
        return rows;
    }, [listings, search, marketFilter, stateFilter, sort]);

    const counts = useMemo(() => {
        const byMarket: Record<MarketplaceId, number> = { objkt: 0, teia: 0 };
        const byState: Record<ListingState, number> = { relistable: 0, cancel_only: 0, locked: 0 };
        for (const l of listings) {
            byMarket[l.marketplace]++;
            byState[l.state]++;
        }
        return { byMarket, byState, total: listings.length };
    }, [listings]);

    function toggle(id: string) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function selectAllVisible() {
        setSelected((prev) => {
            const next = new Set(prev);
            for (const l of filtered) if (l.state !== "locked") next.add(l.id);
            return next;
        });
    }

    function clearSelection() {
        setSelected(new Set());
    }

    function invertVisible() {
        setSelected((prev) => {
            const next = new Set(prev);
            for (const l of filtered) {
                if (l.state === "locked") continue;
                if (next.has(l.id)) next.delete(l.id);
                else next.add(l.id);
            }
            return next;
        });
    }

    const selectedListings = useMemo(
        () => listings.filter((l) => selected.has(l.id)),
        [listings, selected],
    );

    // Derive what would actually happen if user signed right now.
    const plan = useMemo(() => {
        const relist: Listing[] = [];
        const cancelOnly: Listing[] = [];
        for (const l of selectedListings) {
            if (l.state === "relistable") relist.push(l);
            else if (l.state === "cancel_only") cancelOnly.push(l);
        }
        const objktCount = selectedListings.filter((l) => l.marketplace === "objkt").length;
        const teiaCount = selectedListings.filter((l) => l.marketplace === "teia").length;
        return { relist, cancelOnly, objktCount, teiaCount };
    }, [selectedListings]);

    const effectiveShareBps = share.enabled ? share.bps : 0;

    const priceFor = useCallback(
        (l: Listing): string => {
            return computeNewPriceMutez(l.priceMutez, priceMode, flatTez, percent) ?? l.priceMutez;
        },
        [priceMode, flatTez, percent],
    );

    const openPreview = useCallback(async () => {
        if (!address) return;
        if (plan.relist.length === 0) {
            setSubmit({ status: "error", action: "relist", message: "nothing to relist." });
            return;
        }
        setSubmit({ status: "planning", action: "relist" });
        try {
            const built = await planBulkRelist({
                seller: address,
                listings: plan.relist,
                priceFor,
                tip: share.enabled
                    ? { recipient: TIP_RECIPIENT, basisPoints: effectiveShareBps }
                    : null,
                preserveExistingShares: preserveSplits,
            });
            if (built.batches.length === 0) {
                setSubmit({
                    status: "error",
                    action: "relist",
                    message: "nothing to relist after on-chain recheck — everything was sold, cancelled, or unsupported.",
                });
                return;
            }
            setSubmit({ status: "ready", action: "relist", plan: built, batchIdx: 0, hashes: [] });
        } catch (err) {
            setSubmit({ status: "error", action: "relist", message: err instanceof Error ? err.message : "planner failed" });
        }
    }, [address, plan.relist, priceFor, share.enabled, effectiveShareBps, preserveSplits]);

    /** Open the bulk-cancel preview. Uses the same modal/state machine as
     *  reprice but with a stripped planner — cancel only, no recreate. */
    const openCancelPreview = useCallback(async () => {
        if (!address) return;
        // Anything selected that has an on-chain listing is cancellable —
        // both relistable and cancel_only rows. (Locked rows aren't selectable.)
        const cancellable = selectedListings.filter((l) => l.state !== "locked");
        if (cancellable.length === 0) {
            setSubmit({ status: "error", action: "cancel", message: "nothing to cancel." });
            return;
        }
        setSubmit({ status: "planning", action: "cancel" });
        try {
            const built = await planBulkCancel({ listings: cancellable });
            if (built.batches.length === 0) {
                setSubmit({
                    status: "error",
                    action: "cancel",
                    message: "nothing to cancel — selection wasn't on a supported marketplace.",
                });
                return;
            }
            setSubmit({ status: "ready", action: "cancel", plan: built, batchIdx: 0, hashes: [] });
        } catch (err) {
            setSubmit({ status: "error", action: "cancel", message: err instanceof Error ? err.message : "planner failed" });
        }
    }, [address, selectedListings]);

    /** Sign one batch. On success advances to next batch (status returns to
     *  "ready" so user re-clicks for batch 2 → 2 wallet prompts), or marks
     *  done if this was the last. We never auto-chain wallet prompts. */
    const signBatch = useCallback(
        async (action: SubmitAction, built: BulkRelistPlan, batchIdx: number, hashes: string[]) => {
            if (!client) return;
            const batch = built.batches[batchIdx];
            if (!batch) return;
            setSubmit({ status: "signing", action, plan: built, batchIdx, hashes });
            try {
                const { transactionHash } = await submitBatch(client, batch);
                const nextHashes = [...hashes, transactionHash];
                if (batchIdx + 1 >= built.batches.length) {
                    setSubmit({ status: "done", action, plan: built, hashes: nextHashes });
                } else {
                    setSubmit({
                        status: "ready",
                        action,
                        plan: built,
                        batchIdx: batchIdx + 1,
                        hashes: nextHashes,
                    });
                }
            } catch (err) {
                setSubmit({
                    status: "error",
                    action,
                    message: err instanceof Error ? err.message : "signing failed",
                    plan: built,
                    hashes,
                });
            }
        },
        [client],
    );

    const closeSubmit = useCallback(() => {
        setSubmit({ status: "idle" });
        // If anything succeeded, rescan to refresh listing state.
        if (submit.status === "done" || (submit.status === "error" && (submit.hashes?.length ?? 0) > 0)) {
            void scan();
        }
    }, [submit, scan]);

    return (
        <div className="container" style={{ paddingBlock: "3rem", maxWidth: "1080px" }}>
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
                            {lab?.title ?? "Bulk Relist"}
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
                    <ControlsBar
                        loading={loading}
                        onRescan={() => void scan()}
                        view={view}
                        onView={setView}
                        search={search}
                        onSearch={setSearch}
                        sort={sort}
                        onSort={setSort}
                        marketFilter={marketFilter}
                        onMarketFilter={setMarketFilter}
                        stateFilter={stateFilter}
                        onStateFilter={setStateFilter}
                        counts={counts}
                    />

                    {scanError && (
                        <p
                            role="alert"
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.75rem",
                                color: "var(--err, #ff6b6b)",
                                marginTop: "0.75rem",
                            }}
                        >
                            // {scanError}
                        </p>
                    )}

                    {!hasScanned && loading && (
                        <p style={mutedNote}>// fetching listings…</p>
                    )}

                    {hasScanned && listings.length === 0 && !loading && (
                        <p style={mutedNote}>// no active listings found on objkt or teia for this wallet.</p>
                    )}

                    {filtered.length > 0 && (
                        <SelectionBar
                            visibleCount={filtered.length}
                            totalCount={listings.length}
                            selectedCount={selected.size}
                            onSelectAll={selectAllVisible}
                            onInvert={invertVisible}
                            onClear={clearSelection}
                        />
                    )}

                    {filtered.length > 0 &&
                        (view === "grid" ? (
                            <ListingGrid
                                listings={filtered}
                                selected={selected}
                                onToggle={toggle}
                            />
                        ) : (
                            <ListingList
                                listings={filtered}
                                selected={selected}
                                onToggle={toggle}
                            />
                        ))}

                    {selected.size > 0 && (
                        <ActionPanel
                            plan={plan}
                            priceMode={priceMode}
                            onPriceMode={setPriceMode}
                            flatTez={flatTez}
                            onFlatTez={setFlatTez}
                            percent={percent}
                            onPercent={setPercent}
                            firstRelistable={plan.relist[0]}
                            share={share}
                            onShare={setShare}
                            shareCustom={shareCustom}
                            onShareCustom={setShareCustom}
                            effectiveShareBps={effectiveShareBps}
                            preserveSplits={preserveSplits}
                            onPreserveSplits={setPreserveSplits}
                            firstObjkt={plan.relist.find((l) => l.marketplace === "objkt")}
                            onPreview={() => void openPreview()}
                            onPreviewCancel={() => void openCancelPreview()}
                            cancellableCount={
                                selectedListings.filter((l) => l.state !== "locked").length
                            }
                        />
                    )}

                    {submit.status !== "idle" && (
                        <SubmitModal
                            state={submit}
                            priceFor={priceFor}
                            onClose={closeSubmit}
                            onSign={(action, b, i, h) => void signBatch(action, b, i, h)}
                        />
                    )}
                </>
            )}
        </div>
    );
}

// ===========================================================================
// Sub-components
// ===========================================================================

const mutedNote: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    color: "var(--fg-muted)",
    fontSize: "0.78rem",
    marginTop: "1rem",
};

const ctrlBtn: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
    fontFamily: "var(--font-mono)",
    fontSize: "0.72rem",
    padding: "0.3rem 0.55rem",
    border: "1px solid var(--border)",
    background: "var(--bg-card)",
    color: "var(--fg)",
    cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "0.78rem",
    padding: "0.35rem 0.6rem",
    border: "1px solid var(--border)",
    background: "var(--bg-card)",
    color: "var(--fg)",
};

interface ControlsBarProps {
    loading: boolean;
    onRescan: () => void;
    view: ViewMode;
    onView: (v: ViewMode) => void;
    search: string;
    onSearch: (s: string) => void;
    sort: SortKey;
    onSort: (s: SortKey) => void;
    marketFilter: MarketFilter;
    onMarketFilter: (m: MarketFilter) => void;
    stateFilter: StateFilter;
    onStateFilter: (s: StateFilter) => void;
    counts: {
        byMarket: Record<MarketplaceId, number>;
        byState: Record<ListingState, number>;
        total: number;
    };
}

function ControlsBar(p: ControlsBarProps) {
    return (
        <div
            style={{
                marginTop: "1.5rem",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "0.5rem",
            }}
        >
            <input
                type="search"
                placeholder="search name / collection / id"
                value={p.search}
                onChange={(e) => p.onSearch(e.target.value)}
                style={{ ...inputStyle, flex: "1 1 220px", minWidth: 0 }}
            />
            <select
                value={p.marketFilter}
                onChange={(e) => p.onMarketFilter(e.target.value as MarketFilter)}
                style={inputStyle}
                aria-label="filter by marketplace"
            >
                <option value="all">all markets ({p.counts.total})</option>
                <option value="objkt">objkt ({p.counts.byMarket.objkt})</option>
                <option value="teia">teia ({p.counts.byMarket.teia})</option>
            </select>
            <select
                value={p.stateFilter}
                onChange={(e) => p.onStateFilter(e.target.value as StateFilter)}
                style={inputStyle}
                aria-label="filter by state"
            >
                <option value="all">any state</option>
                <option value="relistable">relistable ({p.counts.byState.relistable})</option>
                <option value="cancel_only">cancel only ({p.counts.byState.cancel_only})</option>
                <option value="locked">locked ({p.counts.byState.locked})</option>
            </select>
            <select
                value={p.sort}
                onChange={(e) => p.onSort(e.target.value as SortKey)}
                style={inputStyle}
                aria-label="sort listings"
            >
                <option value="created-desc">newest</option>
                <option value="created-asc">oldest</option>
                <option value="price-desc">price ↓</option>
                <option value="price-asc">price ↑</option>
            </select>
            <div style={{ display: "inline-flex", border: "1px solid var(--border)" }}>
                <button
                    type="button"
                    onClick={() => p.onView("grid")}
                    style={{
                        ...ctrlBtn,
                        border: "none",
                        background: p.view === "grid" ? "var(--bg)" : "var(--bg-card)",
                    }}
                    aria-pressed={p.view === "grid"}
                    aria-label="grid view"
                >
                    <Grid3x3 size={12} aria-hidden="true" />
                </button>
                <button
                    type="button"
                    onClick={() => p.onView("list")}
                    style={{
                        ...ctrlBtn,
                        border: "none",
                        borderLeft: "1px solid var(--border)",
                        background: p.view === "list" ? "var(--bg)" : "var(--bg-card)",
                    }}
                    aria-pressed={p.view === "list"}
                    aria-label="list view"
                >
                    <List size={12} aria-hidden="true" />
                </button>
            </div>
            <button
                type="button"
                onClick={p.onRescan}
                disabled={p.loading}
                style={{ ...ctrlBtn, cursor: p.loading ? "wait" : "pointer" }}
            >
                <RefreshCw size={12} aria-hidden="true" />
                {p.loading ? "…" : "rescan"}
            </button>
        </div>
    );
}

interface SelectionBarProps {
    visibleCount: number;
    totalCount: number;
    selectedCount: number;
    onSelectAll: () => void;
    onInvert: () => void;
    onClear: () => void;
}

function SelectionBar(p: SelectionBarProps) {
    return (
        <div
            style={{
                marginTop: "0.85rem",
                padding: "0.5rem 0.75rem",
                border: "1px solid var(--border)",
                background: "var(--bg-card)",
                display: "flex",
                flexWrap: "wrap",
                gap: "0.5rem",
                alignItems: "center",
                justifyContent: "space-between",
                fontFamily: "var(--font-mono)",
                fontSize: "0.72rem",
                color: "var(--fg-muted)",
            }}
        >
            <span>
                showing {p.visibleCount} of {p.totalCount} · selected {p.selectedCount}
            </span>
            <span style={{ display: "inline-flex", gap: "0.4rem" }}>
                <button type="button" onClick={p.onSelectAll} style={ctrlBtn}>
                    select all visible
                </button>
                <button type="button" onClick={p.onInvert} style={ctrlBtn}>
                    invert
                </button>
                <button type="button" onClick={p.onClear} style={ctrlBtn}>
                    clear
                </button>
            </span>
        </div>
    );
}

// --- grid / list ----------------------------------------------------------

interface ListingViewProps {
    listings: Listing[];
    selected: Set<string>;
    onToggle: (id: string) => void;
}

function ListingGrid({ listings, selected, onToggle }: ListingViewProps) {
    return (
        <ul
            style={{
                listStyle: "none",
                padding: 0,
                margin: "0.75rem 0 0 0",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                gap: "0.6rem",
            }}
        >
            {listings.map((l) => {
                const isSel = selected.has(l.id);
                const locked = l.state === "locked";
                return (
                    <li
                        key={l.id}
                        style={{
                            border: `1px solid ${isSel ? "var(--accent, var(--ok))" : "var(--border)"}`,
                            background: "var(--bg-card)",
                            padding: "0.5rem",
                            opacity: locked ? 0.55 : 1,
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.4rem",
                            position: "relative",
                        }}
                    >
                        <label
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.4rem",
                                cursor: locked ? "not-allowed" : "pointer",
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={isSel}
                                disabled={locked}
                                onChange={() => onToggle(l.id)}
                                aria-label={`select ${l.token.name}`}
                            />
                            <span
                                style={{
                                    fontFamily: "var(--font-mono)",
                                    fontSize: "0.62rem",
                                    color: "var(--fg-muted)",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.06em",
                                }}
                            >
                                {l.marketplace}
                            </span>
                        </label>
                        <Thumb listing={l} size={140} />
                        <span
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.72rem",
                                color: "var(--fg)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                            title={l.token.name}
                        >
                            {l.token.name}
                        </span>
                        <span
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.72rem",
                                color: "var(--ok)",
                            }}
                        >
                            {mutezToTez(l.priceMutez)} ꜩ
                            {l.amount > 1 ? <span style={{ color: "var(--fg-muted)" }}> · ×{l.amount}</span> : null}
                        </span>
                        <StateChip state={l.state} reason={l.stateReason} />
                    </li>
                );
            })}
        </ul>
    );
}

function ListingList({ listings, selected, onToggle }: ListingViewProps) {
    return (
        <ul
            style={{
                listStyle: "none",
                padding: 0,
                margin: "0.75rem 0 0 0",
                display: "flex",
                flexDirection: "column",
                gap: "0.4rem",
            }}
        >
            {listings.map((l) => {
                const isSel = selected.has(l.id);
                const locked = l.state === "locked";
                return (
                    <li
                        key={l.id}
                        style={{
                            border: `1px solid ${isSel ? "var(--accent, var(--ok))" : "var(--border)"}`,
                            background: "var(--bg-card)",
                            padding: "0.55rem 0.75rem",
                            opacity: locked ? 0.55 : 1,
                            display: "flex",
                            gap: "0.7rem",
                            alignItems: "center",
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={isSel}
                            disabled={locked}
                            onChange={() => onToggle(l.id)}
                            aria-label={`select ${l.token.name}`}
                        />
                        <Thumb listing={l} size={44} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <div
                                style={{
                                    fontFamily: "var(--font-mono)",
                                    fontSize: "0.78rem",
                                    color: "var(--fg)",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}
                                title={l.token.name}
                            >
                                {l.token.name}
                            </div>
                            <div
                                style={{
                                    fontFamily: "var(--font-mono)",
                                    fontSize: "0.65rem",
                                    color: "var(--fg-muted)",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {l.token.collectionName ?? l.token.fa2}
                            </div>
                        </div>
                        <span
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.62rem",
                                color: "var(--fg-muted)",
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {l.marketplace}
                        </span>
                        <span
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.78rem",
                                color: "var(--ok)",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {mutezToTez(l.priceMutez)} ꜩ
                        </span>
                        {l.amount > 1 && (
                            <span
                                style={{
                                    fontFamily: "var(--font-mono)",
                                    fontSize: "0.7rem",
                                    color: "var(--fg-muted)",
                                }}
                            >
                                ×{l.amount}
                            </span>
                        )}
                        <StateChip state={l.state} reason={l.stateReason} />
                    </li>
                );
            })}
        </ul>
    );
}

// --- action panel ---------------------------------------------------------

interface ActionPanelProps {
    plan: { relist: Listing[]; cancelOnly: Listing[]; objktCount: number; teiaCount: number };
    priceMode: PriceMode;
    onPriceMode: (m: PriceMode) => void;
    flatTez: string;
    onFlatTez: (s: string) => void;
    percent: string;
    onPercent: (s: string) => void;
    firstRelistable: Listing | undefined;
    share: SharePolicy;
    onShare: (s: SharePolicy) => void;
    shareCustom: string;
    onShareCustom: (s: string) => void;
    effectiveShareBps: number;
    preserveSplits: boolean;
    onPreserveSplits: (b: boolean) => void;
    firstObjkt: Listing | undefined;
    onPreview: () => void;
    onPreviewCancel: () => void;
    /** Listings eligible for cancel — everything selected that isn't locked. */
    cancellableCount: number;
}

function ActionPanel(p: ActionPanelProps) {
    const validFlat = p.priceMode === "flat" ? tezToMutez(p.flatTez) !== null : true;
    const pctNum = Number(p.percent);
    const validPct = p.priceMode === "percent" ? Number.isFinite(pctNum) && pctNum > 0 : true;
    const priceValid =
        (p.priceMode === "flat" && p.flatTez.trim() !== "" && validFlat) ||
        (p.priceMode === "percent" && p.percent.trim() !== "" && validPct);

    const objktSharedCount = p.share.enabled ? p.plan.relist.filter((l) => l.supportsShares).length : 0;
    const teiaInRelist = p.plan.relist.filter((l) => l.marketplace === "teia").length;

    // Collapsed by default — the drawer was eating half the viewport on
    // smaller screens. The summary row stays visible as the accordion
    // header so users see what's queued at a glance.
    const [expanded, setExpanded] = useState(false);

    return (
        <div
            style={{
                position: "sticky",
                bottom: "0.75rem",
                marginTop: "1.5rem",
                border: "1px solid var(--border)",
                background: "var(--bg)",
                boxShadow: "0 4px 18px rgba(0,0,0,0.18)",
                display: "flex",
                flexDirection: "column",
            }}
        >
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                style={{
                    appearance: "none",
                    background: "transparent",
                    border: "none",
                    width: "100%",
                    textAlign: "left",
                    padding: "0.85rem 1rem",
                    cursor: "pointer",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.78rem",
                    color: "var(--fg)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                }}
            >
                <span
                    style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "0.4rem 1rem",
                        alignItems: "center",
                        flex: "1 1 auto",
                        minWidth: 0,
                    }}
                >
                    <span>
                        <strong>{p.plan.relist.length}</strong> will be relisted
                    </span>
                    {p.plan.cancelOnly.length > 0 && (
                        <span style={{ color: "var(--warn)" }}>
                            <strong>{p.plan.cancelOnly.length}</strong> cancel-only (no reprice)
                        </span>
                    )}
                    <span style={{ color: "var(--fg-muted)" }}>
                        {p.plan.objktCount} objkt · {p.plan.teiaCount} teia
                    </span>
                </span>
                <span
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        flexShrink: 0,
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.72rem",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        padding: "0.3rem 0.6rem",
                        border: `1px solid ${expanded ? "var(--border)" : "var(--ok)"}`,
                        color: expanded ? "var(--fg-muted)" : "var(--ok)",
                        background: expanded ? "transparent" : "var(--bg-card)",
                        transition: "color 180ms ease, border-color 180ms ease, background 180ms ease",
                    }}
                >
                    {expanded ? "collapse" : "reprice or cancel"}
                    <ChevronDown
                        size={14}
                        aria-hidden="true"
                        style={{
                            transition: "transform 180ms ease",
                            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                        }}
                    />
                </span>
            </button>
            <div
                style={{
                    display: "grid",
                    gridTemplateRows: expanded ? "1fr" : "0fr",
                    transition: "grid-template-rows 220ms ease",
                }}
            >
                <div
                    style={{
                        // min-height 0 lets the grid track collapse fully
                        // when row is 0fr. overflowY auto only when expanded
                        // so content >65vh becomes scrollable.
                        minHeight: 0,
                        overflowY: expanded ? "auto" : "hidden",
                        maxHeight: "65vh",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.9rem",
                            padding: "0 1rem 1rem 1rem",
                            borderTop: "1px solid var(--border)",
                            paddingTop: "0.9rem",
                        }}
                    >

            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                <span
                    style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.72rem",
                        color: "var(--fg-muted)",
                    }}
                >
                    new price
                </span>
                <div style={{ display: "inline-flex", border: "1px solid var(--border)" }}>
                    <button
                        type="button"
                        onClick={() => p.onPriceMode("flat")}
                        style={{
                            ...ctrlBtn,
                            border: "none",
                            background: p.priceMode === "flat" ? "var(--bg)" : "var(--bg-card)",
                        }}
                        aria-pressed={p.priceMode === "flat"}
                    >
                        flat
                    </button>
                    <button
                        type="button"
                        onClick={() => p.onPriceMode("percent")}
                        style={{
                            ...ctrlBtn,
                            border: "none",
                            borderLeft: "1px solid var(--border)",
                            background: p.priceMode === "percent" ? "var(--bg)" : "var(--bg-card)",
                        }}
                        aria-pressed={p.priceMode === "percent"}
                        aria-label="percent"
                    >
                        <Percent size={12} aria-hidden="true" />
                    </button>
                </div>
                {p.priceMode === "flat" ? (
                    <input
                        type="text"
                        inputMode="decimal"
                        placeholder="set all to (ꜩ)"
                        value={p.flatTez}
                        onChange={(e) => p.onFlatTez(e.target.value)}
                        style={{ ...inputStyle, width: "10rem" }}
                        aria-invalid={!validFlat}
                    />
                ) : (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                        <input
                            type="text"
                            inputMode="decimal"
                            placeholder="100 = same · 125 = +25%"
                            value={p.percent}
                            onChange={(e) => p.onPercent(e.target.value)}
                            style={{ ...inputStyle, width: "12rem" }}
                            aria-invalid={!validPct}
                        />
                        <span
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.78rem",
                                color: "var(--fg-muted)",
                            }}
                        >
                            %
                        </span>
                    </div>
                )}
            </div>

            {priceValid && p.firstRelistable && (
                <PricePreview
                    listing={p.firstRelistable}
                    newPriceMutez={
                        computeNewPriceMutez(p.firstRelistable.priceMutez, p.priceMode, p.flatTez, p.percent) ?? "0"
                    }
                    selectedCount={p.plan.relist.length}
                />
            )}

            <SharePanel
                share={p.share}
                onShare={p.onShare}
                shareCustom={p.shareCustom}
                onShareCustom={p.onShareCustom}
                objktSharedCount={objktSharedCount}
                teiaInRelist={teiaInRelist}
                effectiveShareBps={p.effectiveShareBps}
            />

            {p.firstObjkt && (
                <SplitsPreview
                    listing={p.firstObjkt}
                    preserveSplits={p.preserveSplits}
                    onPreserveSplits={p.onPreserveSplits}
                    tipBps={p.share.enabled ? p.effectiveShareBps : 0}
                />
            )}

            <div
                style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                }}
            >
                <button
                    type="button"
                    onClick={p.onPreviewCancel}
                    disabled={p.cancellableCount === 0}
                    title="cancel the selected listings (no reprice)"
                    style={{
                        ...ctrlBtn,
                        padding: "0.55rem 1.1rem",
                        fontSize: "0.78rem",
                        borderColor: "var(--warn)",
                        color: "var(--warn)",
                        cursor: p.cancellableCount > 0 ? "pointer" : "not-allowed",
                    }}
                >
                    cancel{p.cancellableCount > 0 ? ` ${p.cancellableCount}` : ""} →
                </button>
                <button
                    type="button"
                    onClick={p.onPreview}
                    disabled={!priceValid || p.plan.relist.length === 0}
                    title="cancel + recreate at the new price"
                    style={{
                        ...ctrlBtn,
                        padding: "0.55rem 1.1rem",
                        fontSize: "0.78rem",
                        borderColor: "var(--ok)",
                        color: "var(--ok)",
                        cursor: priceValid ? "pointer" : "not-allowed",
                    }}
                >
                    reprice & sign →
                </button>
            </div>
            <p
                style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.65rem",
                    color: "var(--fg-muted)",
                    margin: 0,
                }}
            >
                // alpha · objkt + teia, xtz listings, share opt-in (objkt only)
            </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function PricePreview({
    listing,
    newPriceMutez,
    selectedCount,
}: {
    listing: Listing;
    newPriceMutez: string;
    selectedCount: number;
}) {
    const oldBig = BigInt(listing.priceMutez || "0");
    const newBig = BigInt(newPriceMutez || "0");
    const direction: "up" | "down" | "flat" =
        newBig > oldBig ? "up" : newBig < oldBig ? "down" : "flat";
    const color =
        direction === "up" ? "var(--ok)" : direction === "down" ? "var(--err, #ff6b6b)" : "var(--fg-muted)";
    const arrow = direction === "up" ? "↑" : direction === "down" ? "↓" : "→";
    // Percent delta, signed, 1 decimal. Computed against raw mutez for accuracy.
    let deltaLabel = "0%";
    if (oldBig > 0n) {
        // tenths of percent for one-decimal display
        const tenths = Number(((newBig - oldBig) * 1000n) / oldBig);
        const sign = tenths > 0 ? "+" : tenths < 0 ? "" : "±";
        deltaLabel = `${sign}${(tenths / 10).toFixed(1)}%`;
    }
    return (
        <div
            style={{
                border: "1px solid var(--border)",
                background: "var(--bg-card)",
                padding: "0.55rem 0.75rem",
                display: "flex",
                alignItems: "center",
                gap: "0.7rem",
                flexWrap: "wrap",
            }}
        >
            <Thumb listing={listing} size={36} />
            <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                <div
                    style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.62rem",
                        color: "var(--fg-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                    }}
                >
                    preview · first of {selectedCount}
                </div>
                <div
                    style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.78rem",
                        color: "var(--fg)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                    }}
                    title={listing.token.name}
                >
                    {listing.token.name}
                </div>
            </div>
            <div
                style={{
                    display: "inline-flex",
                    alignItems: "baseline",
                    gap: "0.45rem",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.82rem",
                }}
            >
                <span style={{ color: "var(--fg-muted)", textDecoration: "line-through" }}>
                    {mutezToTez(listing.priceMutez)} ꜩ
                </span>
                <span style={{ color, fontSize: "0.95rem" }} aria-hidden="true">
                    {arrow}
                </span>
                <span style={{ color, fontWeight: 600 }}>
                    {mutezToTez(newPriceMutez)} ꜩ
                </span>
                <span style={{ color, fontSize: "0.72rem" }}>({deltaLabel})</span>
            </div>
        </div>
    );
}

interface SharePanelProps {
    share: SharePolicy;
    onShare: (s: SharePolicy) => void;
    shareCustom: string;
    onShareCustom: (s: string) => void;
    objktSharedCount: number;
    teiaInRelist: number;
    effectiveShareBps: number;
}

function SharePanel(p: SharePanelProps) {
    return (
        <div
            style={{
                border: "1px solid var(--warn)",
                background: "var(--warn-bg)",
                padding: "0.75rem 0.9rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.45rem",
            }}
        >
            <label
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.8rem",
                    color: "var(--fg)",
                    cursor: "pointer",
                }}
            >
                <input
                    type="checkbox"
                    checked={p.share.enabled}
                    onChange={(e) => p.onShare({ ...p.share, enabled: e.target.checked })}
                />
                <strong>support the tool</strong> — add a small share to new objkt listings
            </label>
            <div
                style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.35rem",
                    alignItems: "center",
                    opacity: p.share.enabled ? 1 : 0.55,
                }}
            >
                {SHARE_PRESETS.map((preset) => (
                    <button
                        key={preset.bps}
                        type="button"
                        onClick={() => p.onShare({ enabled: true, bps: preset.bps })}
                        style={{
                            ...ctrlBtn,
                            borderColor: p.share.bps === preset.bps && p.share.enabled ? "var(--ok)" : "var(--border)",
                            color: p.share.bps === preset.bps && p.share.enabled ? "var(--ok)" : "var(--fg)",
                        }}
                        aria-pressed={p.share.bps === preset.bps && p.share.enabled}
                    >
                        {preset.label}
                    </button>
                ))}
                <input
                    type="text"
                    inputMode="decimal"
                    placeholder="custom %"
                    value={p.shareCustom}
                    onChange={(e) => {
                        const v = e.target.value;
                        p.onShareCustom(v);
                        const n = Number(v);
                        if (Number.isFinite(n) && n > 0 && n <= 50) {
                            p.onShare({ enabled: true, bps: Math.round(n * 100) });
                        }
                    }}
                    style={{ ...inputStyle, width: "6rem" }}
                />
            </div>
            <p
                style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.65rem",
                    color: "var(--fg-muted)",
                    margin: 0,
                }}
            >
                {p.share.enabled
                    ? `${(p.effectiveShareBps / 100).toFixed(2)}% on ${p.objktSharedCount} objkt listing${p.objktSharedCount === 1 ? "" : "s"}` +
                      (p.teiaInRelist > 0
                          ? ` · teia (${p.teiaInRelist}) doesn't support listing shares — no share applied there.`
                          : "")
                    : "off by default · applies to objkt only (teia's marketplace contract doesn't support split listings)"}
            </p>
        </div>
    );
}

// --- splits preview ------------------------------------------------------

interface SplitsPreviewProps {
    listing: Listing;
    preserveSplits: boolean;
    onPreserveSplits: (b: boolean) => void;
    /** Tip basis points (10000-denom). 0 = no tip. */
    tipBps: number;
}

function SplitsPreview(p: SplitsPreviewProps) {
    // Use the graphql-cached shares from the source ask (Listing.royalties).
    const sourceShares = parseSourceShares(p.listing.royalties);
    const willKeep = p.preserveSplits ? sourceShares : [];
    const tipEntry: Array<[string, number, "tip"]> =
        p.tipBps > 0 ? [[TIP_RECIPIENT, p.tipBps, "tip"]] : [];

    // Coalesce: if tip recipient is already in willKeep, sum it.
    const combined: Array<[string, number, "source" | "tip"]> = [];
    for (const [addr, bps] of willKeep) combined.push([addr, bps, "source"]);
    for (const [addr, bps, tag] of tipEntry) {
        const existing = combined.find(([a]) => a === addr);
        if (existing) existing[1] += bps;
        else combined.push([addr, bps, tag]);
    }
    const totalShareBps = combined.reduce((s, [, b]) => s + b, 0);
    const sellerBps = Math.max(0, 10000 - totalShareBps);
    const droppingArtist = !p.preserveSplits && sourceShares.length > 0;

    return (
        <div
            style={{
                border: `1px solid ${droppingArtist ? "var(--err, #ff6b6b)" : "var(--border)"}`,
                background: "var(--bg-card)",
                padding: "0.75rem 0.9rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.5rem",
                }}
            >
                <span
                    style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.7rem",
                        color: "var(--fg-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                    }}
                >
                    splits on new objkt ask · preview from first selected
                </span>
                <label
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.35rem",
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.72rem",
                        color: "var(--fg)",
                        cursor: "pointer",
                    }}
                >
                    <input
                        type="checkbox"
                        checked={p.preserveSplits}
                        onChange={(e) => p.onPreserveSplits(e.target.checked)}
                    />
                    keep existing splits
                </label>
            </div>

            <ul
                style={{
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.2rem",
                }}
            >
                {combined.length === 0 && (
                    <li
                        style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.72rem",
                            color: "var(--fg-muted)",
                        }}
                    >
                        // no splits — seller receives everything (minus marketplace fee)
                    </li>
                )}
                {combined.map(([addr, bps, tag]) => (
                    <li
                        key={addr}
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "0.75rem",
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.72rem",
                            color: tag === "tip" ? "var(--ok)" : "var(--fg)",
                        }}
                    >
                        <span
                            style={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                minWidth: 0,
                                flex: "1 1 auto",
                            }}
                            title={addr}
                        >
                            {addr.slice(0, 8)}…{addr.slice(-4)}
                            <span
                                style={{
                                    color: tag === "tip" ? "var(--ok)" : "var(--fg-muted)",
                                }}
                            >
                                {tag === "tip" ? "  [tip]" : "  [royalty]"}
                            </span>
                        </span>
                        <span>{(bps / 100).toFixed(2)}%</span>
                    </li>
                ))}
                <li
                    style={{
                        borderTop: "1px dashed var(--border)",
                        marginTop: "0.15rem",
                        paddingTop: "0.2rem",
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "0.75rem",
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.72rem",
                        color: "var(--fg-muted)",
                    }}
                >
                    <span>you (seller)</span>
                    <span>{(sellerBps / 100).toFixed(2)}%</span>
                </li>
            </ul>

            {droppingArtist && (
                <div
                    style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.65rem",
                        color: "var(--err, #ff6b6b)",
                    }}
                >
                    ⚠ keep-existing-splits is OFF — original royalty recipients (
                    {sourceShares.length}) will not receive anything on sale.
                </div>
            )}
            <div
                style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.62rem",
                    color: "var(--fg-muted)",
                }}
            >
                // marketplace platform fee (~2.5%) applies on top of the above and is not shown
            </div>
        </div>
    );
}

// --- submit modal --------------------------------------------------------

const TZKT_OP = "https://tzkt.io";

interface SubmitModalProps {
    state: SubmitState;
    priceFor: (l: Listing) => string;
    onClose: () => void;
    onSign: (action: SubmitAction, plan: BulkRelistPlan, batchIdx: number, hashes: string[]) => void;
}

function SubmitModal({ state, priceFor, onClose, onSign }: SubmitModalProps) {
    return (
        <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.55)",
                zIndex: 60,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "1rem",
            }}
        >
            <div
                style={{
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    width: "100%",
                    maxWidth: "640px",
                    maxHeight: "calc(100vh - 2rem)",
                    overflow: "auto",
                    padding: "1.25rem",
                    fontFamily: "var(--font-mono)",
                }}
            >
                <SubmitModalBody state={state} priceFor={priceFor} onSign={onSign} onClose={onClose} />
            </div>
        </div>
    );
}

function SubmitModalBody({
    state,
    priceFor,
    onSign,
    onClose,
}: {
    state: SubmitState;
    priceFor: (l: Listing) => string;
    onSign: (action: SubmitAction, plan: BulkRelistPlan, batchIdx: number, hashes: string[]) => void;
    onClose: () => void;
}) {
    // Parent only mounts this when status !== "idle", but TS doesn't know
    // that — so handle it here for narrowing.
    if (state.status === "idle") return null;
    if (state.status === "planning") {
        return <p style={{ fontSize: "0.85rem", color: "var(--fg-muted)" }}>// preparing batches…</p>;
    }
    if (state.status === "error" && !state.plan) {
        return (
            <>
                <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "0.95rem", color: "var(--err, #ff6b6b)" }}>
                    // {state.message}
                </h3>
                <button type="button" onClick={onClose} style={{ ...ctrlBtn, marginTop: "0.5rem" }}>
                    close
                </button>
            </>
        );
    }
    // After planning/idle/error-without-plan are filtered, the remaining
    // states all carry a plan (ready / signing / done / error-with-plan).
    // The non-null assertion is safe but won't narrow `state` itself, so the
    // implicit-any maps below are typed via explicit annotations.
    const plan: BulkRelistPlan = state.plan!;
    const hashes = "hashes" in state && state.hashes ? state.hashes : [];
    const currentIdx = state.status === "signing" || state.status === "ready" ? state.batchIdx : hashes.length;
    const totalBatches = plan.batches.length;
    const done = state.status === "done";
    const errored = state.status === "error";
    const signing = state.status === "signing";
    const action: SubmitAction = ("action" in state && state.action) || "relist";
    const verb = action === "cancel" ? "cancel" : "sign";
    const titleVerb = action === "cancel" ? "cancelling" : "relisting";

    return (
        <>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.5rem",
                    marginBottom: "0.75rem",
                }}
            >
                <h3 style={{ margin: 0, fontSize: "0.95rem" }}>
                    {done
                        ? `// ${titleVerb} — all batches signed`
                        : errored
                          ? `// ${titleVerb} — signing failed`
                          : `// ${titleVerb} · batch ${currentIdx + 1} of ${totalBatches}`}
                </h3>
                <button type="button" onClick={onClose} style={ctrlBtn}>
                    close
                </button>
            </div>

            {plan.notes.length > 0 && (
                <ul
                    style={{
                        listStyle: "none",
                        padding: 0,
                        margin: "0 0 0.75rem 0",
                        fontSize: "0.7rem",
                        color: "var(--fg-muted)",
                    }}
                >
                    {plan.notes.map((n: string) => (
                        <li key={n}>// {n}</li>
                    ))}
                </ul>
            )}

            <div style={{ fontSize: "0.72rem", color: "var(--fg-muted)", marginBottom: "0.5rem" }}>
                total ops {plan.totalOps} · {totalBatches} signature{totalBatches === 1 ? "" : "s"} required
            </div>

            {/* Batch list. Mark prior batches done, current pending, future queued. */}
            <ol
                style={{
                    listStyle: "none",
                    padding: 0,
                    margin: "0 0 1rem 0",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                }}
            >
                {plan.batches.map((b: PlannedBatch, i: number) => {
                    const isDone = i < hashes.length;
                    const isCurrent = i === currentIdx && !done;
                    const hash = hashes[i];
                    return (
                        <li
                            // biome-ignore lint/suspicious/noArrayIndexKey: i is the batch number itself, compared against hashes.length and currentIdx just above
                            key={i}
                            style={{
                                border: `1px solid ${isCurrent ? "var(--ok)" : "var(--border)"}`,
                                background: "var(--bg-card)",
                                padding: "0.55rem 0.75rem",
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: "0.5rem",
                                    fontSize: "0.78rem",
                                }}
                            >
                                <span>
                                    <span style={{ color: "var(--fg-muted)" }}>#{i + 1}</span>{" "}
                                    {b.label} · {b.ops.length} ops
                                </span>
                                <span
                                    style={{
                                        fontSize: "0.65rem",
                                        color: isDone ? "var(--ok)" : isCurrent ? "var(--warn)" : "var(--fg-muted)",
                                    }}
                                >
                                    {isDone ? "signed" : isCurrent ? (signing ? "signing…" : "ready") : "queued"}
                                </span>
                            </div>
                            {/* Per-listing diff preview */}
                            <ul
                                style={{
                                    listStyle: "none",
                                    padding: "0.4rem 0 0 0",
                                    margin: 0,
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "0.15rem",
                                    fontSize: "0.66rem",
                                    color: "var(--fg-muted)",
                                }}
                            >
                                {b.listings.slice(0, 6).map((l: Listing) => {
                                    if (action === "cancel") {
                                        return (
                                            <li
                                                key={l.id}
                                                style={{
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    gap: "0.5rem",
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        whiteSpace: "nowrap",
                                                        flex: 1,
                                                    }}
                                                    title={l.token.name}
                                                >
                                                    {l.token.name}
                                                </span>
                                                <span style={{ color: "var(--fg-muted)" }}>
                                                    {mutezToTez(l.priceMutez)} ꜩ · cancel
                                                </span>
                                            </li>
                                        );
                                    }
                                    const oldP = BigInt(l.priceMutez || "0");
                                    const newP = BigInt(priceFor(l));
                                    const dir = newP > oldP ? "up" : newP < oldP ? "down" : "flat";
                                    const c =
                                        dir === "up"
                                            ? "var(--ok)"
                                            : dir === "down"
                                              ? "var(--err, #ff6b6b)"
                                              : "var(--fg-muted)";
                                    return (
                                        <li
                                            key={l.id}
                                            style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                gap: "0.5rem",
                                            }}
                                        >
                                            <span
                                                style={{
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                    flex: 1,
                                                }}
                                                title={l.token.name}
                                            >
                                                {l.token.name}
                                            </span>
                                            <span style={{ color: c }}>
                                                {mutezToTez(l.priceMutez)} → {mutezToTez(priceFor(l))} ꜩ
                                            </span>
                                        </li>
                                    );
                                })}
                                {b.listings.length > 6 && (
                                    <li>// +{b.listings.length - 6} more</li>
                                )}
                            </ul>
                            {hash && (
                                <a
                                    href={`${TZKT_OP}/${hash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        fontSize: "0.64rem",
                                        color: "var(--ok)",
                                        display: "inline-block",
                                        marginTop: "0.35rem",
                                    }}
                                >
                                    view on tzkt ↗
                                </a>
                            )}
                        </li>
                    );
                })}
            </ol>

            {errored && (
                <p
                    style={{
                        fontSize: "0.75rem",
                        color: "var(--err, #ff6b6b)",
                        margin: "0 0 0.75rem 0",
                    }}
                >
                    // {state.message}
                </p>
            )}

            {!done && !errored && (
                <button
                    type="button"
                    onClick={() => onSign(action, plan, currentIdx, hashes)}
                    disabled={signing}
                    style={{
                        ...ctrlBtn,
                        padding: "0.55rem 1.1rem",
                        fontSize: "0.78rem",
                        borderColor: "var(--ok)",
                        color: "var(--ok)",
                        cursor: signing ? "wait" : "pointer",
                    }}
                >
                    {signing
                        ? "// awaiting wallet…"
                        : `${verb} batch ${currentIdx + 1} →`}
                </button>
            )}

            {done && (
                <button
                    type="button"
                    onClick={onClose}
                    style={{
                        ...ctrlBtn,
                        padding: "0.55rem 1.1rem",
                        fontSize: "0.78rem",
                        borderColor: "var(--ok)",
                        color: "var(--ok)",
                    }}
                >
                    done · rescan listings
                </button>
            )}
        </>
    );
}
