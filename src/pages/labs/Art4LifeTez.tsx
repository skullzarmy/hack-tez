/** biome-ignore-all lint/suspicious/noCommentText: <I said so> */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, RefreshCw, Search, ExternalLink, ChevronUp, ChevronDown } from "lucide-react";
import { getLab } from "../../lib/labs";
import { usePageMeta } from "../../hooks/usePageMeta";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HEN_CONTRACT = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
const TZKT_API = "https://api.tzkt.io";
const OBJKT_API = "https://data.objkt.com/v3/graphql";
/** Tags to match — the index is case-sensitive, so we query common variants. */
const TAG_VARIANTS = [
    "Art4LifeTez",
    "art4lifetez",
    "ART4LIFETEZ",
    "#art4lifetez",
    "#Art4LifeTez",
    "#ART4LIFETEZ",
    "@ART4LIFETEZ",
    "@Art4LifeTez",
    "@art4lifetez",
];
const PAGE_SIZE = 100;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ObjktToken {
    token_id: string;
    name: string | null;
    /** Circulating supply — objkt already excludes burn-address holdings. */
    supply: number;
    timestamp: string;
    creators: { creator_address: string }[];
}

interface TokenRow {
    tokenId: string;
    name: string;
    salesXtz: number;
    mintDate: string;
    mintDateRaw: number;
    wallet: string;
}

type SortKey = "name" | "salesXtz" | "mintDate" | "wallet";
type SortDir = "asc" | "desc";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateAddress(addr: string): string {
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatDate(iso: string): string {
    try {
        const d = new Date(iso);
        return d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
    } catch {
        return iso;
    }
}

/** Trim float noise from a tez amount for display (e.g. 1.2999999 → "1.3"). */
function formatXtz(n: number): string {
    return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

/**
 * Discover the event's tokens from objkt's indexer. We use objkt here rather
 * than TzKT because objkt resolves freshly-minted IPFS metadata (and its tag
 * index) far faster — TzKT can lag minutes to days, which would hide brand-new
 * mints from the scan. `supply > 0` also drops burned re-mint originals for
 * free: objkt excludes burn-address holdings from supply, so no separate burn
 * lookup is needed.
 */
async function fetchTaggedTokens(): Promise<ObjktToken[]> {
    const query = `query Art4Life($fa: String!, $tags: [String!]!) {
      token(
        where: {
          fa_contract: { _eq: $fa }
          supply: { _gt: 0 }
          tags: { tag: { name: { _in: $tags } } }
        }
        limit: 500
      ) {
        token_id
        name
        supply
        timestamp
        creators { creator_address }
      }
    }`;
    const res = await fetch(OBJKT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: { fa: HEN_CONTRACT, tags: TAG_VARIANTS } }),
    });
    if (!res.ok) throw new Error(`objkt API returned ${res.status}`);
    const json = (await res.json()) as { data?: { token?: ObjktToken[] }; errors?: { message: string }[] };
    if (json.errors?.length) throw new Error(json.errors[0].message);
    return json.data?.token ?? [];
}

interface TransferRow {
    "token.tokenId": string;
    "from.address": string | null;
    "to.address": string | null;
    transactionId: number;
}

/** One marketplace collect, carrying the *internal* FA2 transfer op id. */
interface CollectRef {
    tokenId: string;
    opId: number;
    /** The KT1 marketplace contract that released the token (transfer's `from`). */
    marketplace: string;
}

/**
 * Find every transfer that looks like a marketplace collect: FROM a KT1
 * contract TO a tz address that isn't the swap's original issuer (a transfer
 * back to the issuer is a cancel/return, not a sale). Each ref keeps the
 * transfer's `transactionId` — the id of the *internal* FA2 transfer op — so
 * we can resolve the price paid in a later step.
 */
async function fetchCollectRefs(tokenIds: string[], minters: Map<string, string>): Promise<CollectRef[]> {
    if (tokenIds.length === 0) return [];
    const refs: CollectRef[] = [];
    let offset = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const url =
            `${TZKT_API}/v1/tokens/transfers?token.contract=${HEN_CONTRACT}` +
            `&token.tokenId.in=${tokenIds.join(",")}` +
            `&limit=${PAGE_SIZE}&offset=${offset}` +
            `&select=token.tokenId,from.address,to.address,transactionId` +
            `&sort.asc=id`;
        const res = await fetch(url);
        if (!res.ok) break;
        const batch: TransferRow[] = await res.json();
        for (const t of batch) {
            const from = t["from.address"];
            const to = t["to.address"];
            const tid = t["token.tokenId"];
            if (from && from.startsWith("KT1") && to && to.startsWith("tz") && to !== minters.get(tid)) {
                refs.push({ tokenId: tid, opId: t.transactionId, marketplace: from });
            }
        }
        if (batch.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
    }
    return refs;
}

interface OpRef {
    hash: string;
    counter: number;
    level: number;
}

/**
 * The transfer's `transactionId` points at the *internal* FA2 transfer, which
 * carries no tez (amount is always 0). The price the buyer paid lives on the
 * top-level marketplace op in the same operation group. Resolve each internal
 * op to its {hash, counter, level} so we can find that top-level op in bulk.
 *
 * NB: dotted selects (e.g. `target.address`) come back null for these ops, so
 * we only select top-level scalar fields here.
 */
async function resolveOpRefs(opIds: number[]): Promise<Map<number, OpRef>> {
    const map = new Map<number, OpRef>();
    const CHUNK = 50;
    for (let i = 0; i < opIds.length; i += CHUNK) {
        const chunk = opIds.slice(i, i + CHUNK);
        const url = `${TZKT_API}/v1/operations/transactions?id.in=${chunk.join(",")}&select=id,hash,counter,level`;
        const res = await fetch(url);
        if (!res.ok) continue;
        const rows: { id: number; hash: string; counter: number; level: number }[] = await res.json();
        for (const r of rows) map.set(r.id, { hash: r.hash, counter: r.counter, level: r.level });
    }
    return map;
}

interface SaleOp {
    hash: string;
    counter: number;
    nonce?: number | null;
    amount: number;
}

/**
 * Look up the price of every collect in bulk. A collect's top-level sale op
 * lives in the *same block* and targets the *same marketplace* as the token
 * transfer, so one query over `level.in` + `target.in` pulls them all — far
 * faster than fetching each operation group by hash. We index the top-level
 * ops (the buyer's, identified by an absent/null `nonce`) by `hash:counter`,
 * which uniquely identifies the buyer's op even within a batched purchase.
 *
 * (TzKT's `?hash=` filter is silently ignored on this endpoint, but `level.in`
 * and `target.in` work — hence this shape.)
 */
async function fetchSalePrices(levels: number[], marketplaces: string[]): Promise<Map<string, number>> {
    const prices = new Map<string, number>();
    if (levels.length === 0 || marketplaces.length === 0) return prices;
    const targets = marketplaces.join(",");
    const CHUNK = 50;
    for (let i = 0; i < levels.length; i += CHUNK) {
        const chunk = levels.slice(i, i + CHUNK);
        const url =
            `${TZKT_API}/v1/operations/transactions?level.in=${chunk.join(",")}` +
            `&target.in=${targets}&select=hash,counter,nonce,amount&limit=10000`;
        const res = await fetch(url);
        if (!res.ok) continue;
        const rows: SaleOp[] = await res.json();
        for (const r of rows) {
            if (r.nonce == null) prices.set(`${r.hash}:${r.counter}`, r.amount);
        }
    }
    return prices;
}

async function fetchArt4LifeTokens(): Promise<TokenRow[]> {
    // 1. Discover the event's tokens from objkt (fast metadata, burn-aware).
    const tokens = await fetchTaggedTokens();

    // 2. De-duplicate by token id (objkt returns unique, but be safe).
    const seen = new Set<string>();
    const unique: ObjktToken[] = [];
    for (const t of tokens) {
        if (seen.has(t.token_id)) continue;
        seen.add(t.token_id);
        unique.push(t);
    }

    // 3. Build minter map for collect detection (a transfer back to the creator
    //    is a cancel/return, not a sale).
    const minters = new Map<string, string>();
    for (const t of unique) {
        const creator = t.creators[0]?.creator_address;
        if (creator) minters.set(t.token_id, creator);
    }

    // 4. Resolve sales: collect transfers → internal op {hash, counter, level}
    //    → top-level op price. The transfer's own transaction has amount 0; the
    //    tez is on the buyer's top-level collect in the same operation group,
    //    which we fetch for every collect in one bulk query (by block + market).
    const tokenIds = unique.map((t) => t.token_id);
    const collects = await fetchCollectRefs(tokenIds, minters);
    const opRefs = await resolveOpRefs(collects.map((c) => c.opId));
    const refs = [...opRefs.values()];
    const levels = [...new Set(refs.map((r) => r.level))];
    const marketplaces = [...new Set(collects.map((c) => c.marketplace))];
    const prices = await fetchSalePrices(levels, marketplaces);

    // 5. Sum mutez paid per token.
    const salesByToken = new Map<string, number>();
    for (const c of collects) {
        const ref = opRefs.get(c.opId);
        if (!ref) continue;
        const mutez = prices.get(`${ref.hash}:${ref.counter}`) ?? 0;
        salesByToken.set(c.tokenId, (salesByToken.get(c.tokenId) ?? 0) + mutez);
    }

    // 6. Build rows (mutez → tez).
    return unique.map((t) => {
        const mutez = salesByToken.get(t.token_id) ?? 0;
        return {
            tokenId: t.token_id,
            name: t.name?.trim() || `OBJKT#${t.token_id}`,
            salesXtz: Math.round(mutez) / 1_000_000,
            mintDate: formatDate(t.timestamp),
            mintDateRaw: new Date(t.timestamp).getTime(),
            wallet: t.creators[0]?.creator_address ?? "",
        };
    });
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function csvCell(s: string): string {
    return `"${s.replace(/"/g, '""')}"`;
}

function toCsv(rows: TokenRow[]): string {
    const header = "artwork,token id,sales (xtz),date,wallet";
    const lines = rows.map((r) =>
        [csvCell(r.name), `OBJKT#${r.tokenId}`, r.salesXtz, csvCell(r.mintDate), r.wallet].join(","),
    );
    return [header, ...lines].join("\n");
}

function downloadCsv(rows: TokenRow[]) {
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `art4lifetez-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

function sortRows(rows: TokenRow[], key: SortKey, dir: SortDir): TokenRow[] {
    const sorted = [...rows];
    sorted.sort((a, b) => {
        let cmp = 0;
        switch (key) {
            case "name":
                cmp = a.name.localeCompare(b.name);
                break;
            case "salesXtz":
                cmp = a.salesXtz - b.salesXtz;
                break;
            case "mintDate":
                cmp = a.mintDateRaw - b.mintDateRaw;
                break;
            case "wallet":
                cmp = a.wallet.localeCompare(b.wallet);
                break;
        }
        return dir === "asc" ? cmp : -cmp;
    });
    return sorted;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
    const color =
        status === "production" ? "var(--success)" : status === "beta" ? "var(--info)" : "var(--warn)";
    const bg =
        status === "production" ? "var(--success-bg)" : status === "beta" ? "var(--info-bg)" : "var(--warn-bg)";
    return (
        <span
            style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.62rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                padding: "0.18em 0.55em",
                color,
                background: bg,
                border: `1px solid ${color}`,
                whiteSpace: "nowrap",
            }}
        >
            {status}
        </span>
    );
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
    if (!active) return null;
    return dir === "asc" ? (
        <ChevronUp size={12} aria-hidden="true" style={{ verticalAlign: "middle" }} />
    ) : (
        <ChevronDown size={12} aria-hidden="true" style={{ verticalAlign: "middle" }} />
    );
}

function ThHeader({
    label,
    sortKey,
    currentKey,
    currentDir,
    onSort,
    style,
}: {
    label: string;
    sortKey: SortKey;
    currentKey: SortKey;
    currentDir: SortDir;
    onSort: (k: SortKey) => void;
    style?: React.CSSProperties;
}) {
    return (
        <th
            onClick={() => onSort(sortKey)}
            style={{
                cursor: "pointer",
                userSelect: "none",
                padding: "0.55rem 0.6rem",
                textAlign: "left",
                fontFamily: "var(--font-mono)",
                fontSize: "0.68rem",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: currentKey === sortKey ? "#ff1493" : "var(--fg-muted)",
                borderBottom: "2px solid",
                borderBottomColor: currentKey === sortKey ? "#ff1493" : "var(--border)",
                whiteSpace: "nowrap",
                background: "var(--bg-card)",
                position: "sticky",
                top: 0,
                zIndex: 2,
                ...style,
            }}
        >
            {label} <SortIcon active={currentKey === sortKey} dir={currentDir} />
        </th>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Art4LifeTez() {
    const lab = getLab("art4lifetez");
    const [rows, setRows] = useState<TokenRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState("");
    const [sortKey, setSortKey] = useState<SortKey>("salesXtz");
    const [sortDir, setSortDir] = useState<SortDir>("desc");
    const hasFetched = useRef(false);

    usePageMeta({
        title: "Art4LifeTez Scanner — Labs — hack.tez",
        description:
            "Scan HEN v2 for tokens tagged #Art4LifeTez. Table view and CSV export for the Art4LifeTez blood donation event.",
        path: "/labs/art4lifetez",
    });

    const doFetch = useCallback(async () => {
        // First load shows the full-page "scanning" state; later refreshes keep
        // the table on screen and just spin the refresh button.
        if (hasFetched.current) setRefreshing(true);
        else setLoading(true);
        setError(null);
        try {
            const data = await fetchArt4LifeTokens();
            setRows(data);
            hasFetched.current = true;
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to fetch tokens");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        void doFetch();
    }, [doFetch]);

    function handleSort(key: SortKey) {
        if (key === sortKey) {
            setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        } else {
            setSortKey(key);
            setSortDir("asc");
        }
    }

    const lc = filter.toLowerCase();
    const filtered = lc
        ? rows.filter(
              (r) =>
                  r.tokenId.includes(lc) ||
                  r.name.toLowerCase().includes(lc) ||
                  r.wallet.toLowerCase().includes(lc),
          )
        : rows;
    const sorted = sortRows(filtered, sortKey, sortDir);

    const totalSalesXtz = rows.reduce((s, r) => s + r.salesXtz, 0);
    const busy = loading || refreshing;

    return (
        <div className="container" style={{ paddingBlock: "3rem", maxWidth: "960px" }}>
            {/* Back link */}
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

            {/* Header */}
            <div
                style={{
                    paddingBottom: "1.25rem",
                    borderBottom: "1px solid var(--border)",
                }}
            >
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
                        <span style={{ color: "#ff1493" }}>Art4Life</span>Tez
                    </h1>
                    <StatusBadge status={lab?.status ?? "alpha"} />
                    {lab && (
                        <span
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.75rem",
                                color: "var(--fg-muted)",
                            }}
                        >
                            v{lab.version}
                        </span>
                    )}
                </div>
                <p style={{ color: "var(--fg-muted)", fontSize: "0.85rem", maxWidth: "60ch" }}>
                    Tag scanner for{" "}
                    <span style={{ color: "#ff1493", fontWeight: 600 }}>#Art4LifeTez</span>{" "}
                    blood donation event. Scans the{" "}
                    <a
                        href={`https://tzkt.io/${HEN_CONTRACT}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "var(--fg)", textDecoration: "none" }}
                    >
                        HEN v2 contract{" "}
                        <ExternalLink size={10} aria-hidden="true" style={{ verticalAlign: "middle" }} />
                    </a>{" "}
                    for tagged tokens and exports to CSV.
                </p>
            </div>

            {/* Summary bar */}
            {!loading && rows.length > 0 && (
                <div
                    style={{
                        display: "flex",
                        gap: "2rem",
                        paddingBlock: "0.75rem",
                        borderBottom: "1px solid var(--border)",
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.78rem",
                    }}
                >
                    <span style={{ color: "var(--fg-muted)" }}>
                        tokens: <span style={{ color: "#ff1493", fontWeight: 600 }}>{rows.length}</span>
                    </span>
                    <span style={{ color: "var(--fg-muted)" }}>
                        total sales: <span style={{ color: "#ff1493", fontWeight: 600 }}>{formatXtz(totalSalesXtz)} ꜩ</span>
                    </span>
                </div>
            )}

            {/* Toolbar */}
            <div
                style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.75rem",
                    alignItems: "center",
                    marginTop: "1rem",
                    marginBottom: "1rem",
                }}
            >
                <div
                    style={{
                        flex: "1 1 180px",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        border: "1px solid var(--border)",
                        background: "var(--bg-card)",
                        padding: "0.45rem 0.65rem",
                    }}
                >
                    <Search size={14} style={{ color: "var(--fg-muted)", flexShrink: 0 }} aria-hidden="true" />
                    <input
                        type="text"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder="filter by token id or wallet…"
                        style={{
                            flex: 1,
                            background: "transparent",
                            border: "none",
                            outline: "none",
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.8rem",
                            color: "var(--fg)",
                        }}
                    />
                </div>

                <button
                    type="button"
                    onClick={() => void doFetch()}
                    disabled={busy}
                    title="Refresh"
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.78rem",
                        padding: "0.45rem 0.85rem",
                        border: "1px solid var(--border)",
                        background: "var(--bg-card)",
                        color: "var(--fg)",
                        cursor: busy ? "wait" : "pointer",
                    }}
                >
                    <RefreshCw
                        size={13}
                        aria-hidden="true"
                        style={busy ? { animation: "spin 1s linear infinite" } : undefined}
                    />
                    refresh
                </button>

                <button
                    type="button"
                    onClick={() => downloadCsv(sorted)}
                    disabled={sorted.length === 0}
                    title="Download CSV"
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.78rem",
                        padding: "0.45rem 0.85rem",
                        border: "1px solid #ff1493",
                        background: "#ff1493",
                        color: "#fff",
                        cursor: sorted.length === 0 ? "not-allowed" : "pointer",
                        opacity: sorted.length === 0 ? 0.5 : 1,
                    }}
                >
                    <Download size={13} aria-hidden="true" />
                    CSV ({sorted.length})
                </button>
            </div>

            {/* Loading */}
            {loading && rows.length === 0 && (
                <p
                    style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.85rem",
                        color: "var(--fg-muted)",
                        marginTop: "2rem",
                        textAlign: "center",
                    }}
                >
                    // scanning HEN v2 for #Art4LifeTez…
                </p>
            )}

            {/* Error */}
            {error && (
                <p
                    role="alert"
                    style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.78rem",
                        color: "var(--err, #ff6b6b)",
                        marginTop: "1rem",
                    }}
                >
                    // error: {error}
                </p>
            )}

            {/* Table — 4 columns */}
            {sorted.length > 0 && (
                <div
                    style={{
                        overflowX: "auto",
                        border: "1px solid var(--border)",
                        background: "var(--bg-card)",
                    }}
                >
                    <table
                        style={{
                            width: "100%",
                            borderCollapse: "collapse",
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.8rem",
                        }}
                    >
                        <thead>
                            <tr>
                                <ThHeader
                                    label="artwork"
                                    sortKey="name"
                                    currentKey={sortKey}
                                    currentDir={sortDir}
                                    onSort={handleSort}
                                />
                                <ThHeader
                                    label="sales (ꜩ)"
                                    sortKey="salesXtz"
                                    currentKey={sortKey}
                                    currentDir={sortDir}
                                    onSort={handleSort}
                                    style={{ textAlign: "right" }}
                                />
                                <ThHeader
                                    label="date"
                                    sortKey="mintDate"
                                    currentKey={sortKey}
                                    currentDir={sortDir}
                                    onSort={handleSort}
                                />
                                <ThHeader
                                    label="wallet"
                                    sortKey="wallet"
                                    currentKey={sortKey}
                                    currentDir={sortDir}
                                    onSort={handleSort}
                                />
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((r) => (
                                <tr
                                    key={r.tokenId}
                                    style={{ borderBottom: "1px solid var(--border)" }}
                                    onMouseEnter={(e) => {
                                        (e.currentTarget as HTMLElement).style.background =
                                            "rgba(255,20,147,0.04)";
                                    }}
                                    onMouseLeave={(e) => {
                                        (e.currentTarget as HTMLElement).style.background = "";
                                    }}
                                >
                                    <td style={{ padding: "0.5rem 0.6rem", minWidth: "200px" }}>
                                        <a
                                            href={`https://teia.art/objkt/${r.tokenId}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ color: "var(--fg)", textDecoration: "none" }}
                                        >
                                            {r.name}
                                        </a>
                                        <a
                                            href={`https://teia.art/objkt/${r.tokenId}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{
                                                display: "block",
                                                color: "#ff1493",
                                                textDecoration: "none",
                                                fontSize: "0.7rem",
                                                marginTop: "0.15rem",
                                            }}
                                        >
                                            OBJKT#{r.tokenId}{" "}
                                            <ExternalLink
                                                size={9}
                                                aria-hidden="true"
                                                style={{ verticalAlign: "middle", opacity: 0.6 }}
                                            />
                                        </a>
                                    </td>
                                    <td
                                        style={{
                                            padding: "0.5rem 0.6rem",
                                            textAlign: "right",
                                            whiteSpace: "nowrap",
                                            color: "var(--fg)",
                                        }}
                                    >
                                        {formatXtz(r.salesXtz)} ꜩ
                                    </td>
                                    <td
                                        style={{
                                            padding: "0.5rem 0.6rem",
                                            whiteSpace: "nowrap",
                                            color: "var(--fg-muted)",
                                        }}
                                    >
                                        {r.mintDate}
                                    </td>
                                    <td style={{ padding: "0.5rem 0.6rem", whiteSpace: "nowrap" }}>
                                        <a
                                            href={`https://tzkt.io/${r.wallet}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{
                                                color: "var(--fg-muted)",
                                                textDecoration: "none",
                                                fontSize: "0.75rem",
                                            }}
                                        >
                                            {truncateAddress(r.wallet)}{" "}
                                            <ExternalLink
                                                size={9}
                                                aria-hidden="true"
                                                style={{ verticalAlign: "middle", opacity: 0.5 }}
                                            />
                                        </a>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Empty states */}
            {!loading && rows.length === 0 && !error && (
                <p
                    style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.85rem",
                        color: "var(--fg-muted)",
                        marginTop: "2rem",
                        textAlign: "center",
                    }}
                >
                    // no tokens found with #Art4LifeTez tag
                </p>
            )}
            {!loading && rows.length > 0 && sorted.length === 0 && filter && (
                <p
                    style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.82rem",
                        color: "var(--fg-muted)",
                        marginTop: "1rem",
                        textAlign: "center",
                    }}
                >
                    // no matches for "{filter}"
                </p>
            )}

            {/* Footer */}
            <p
                style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.68rem",
                    color: "var(--fg-muted)",
                    marginTop: "1.5rem",
                    lineHeight: 1.6,
                }}
            >
                // tokens from{" "}
                <a href="https://objkt.com" target="_blank" rel="noopener noreferrer" style={{ color: "var(--fg-muted)" }}>
                    objkt
                </a>
                , sales from{" "}
                <a href="https://tzkt.io" target="_blank" rel="noopener noreferrer" style={{ color: "var(--fg-muted)" }}>
                    TzKT
                </a>
                . sales = total ꜩ from marketplace collects. built for{" "}
                <span style={{ color: "#ff1493" }}>paraxenod</span> ♥
            </p>
        </div>
    );
}
