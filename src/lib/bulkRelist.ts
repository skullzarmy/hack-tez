/**
 * Bulk relist — pulls every active listing for a seller from objkt's GraphQL
 * (which indexes both objkt and teia), normalizes them through a marketplace
 * adapter interface, and prepares them for bulk re-pricing / cancellation.
 *
 * Architecture:
 *  - GraphQL fetcher returns raw listings.
 *  - Each row resolves to a MarketplaceAdapter that knows how to cancel /
 *    recreate the listing on its native contract.
 *  - The page composes a batch of TransactionOperations from the adapters
 *    and submits via client.requestOperation, chunking by gas budget.
 *
 * MVP scope (v0.1.0):
 *  - Mainnet only.
 *  - xtz-denominated listings only.
 *  - Adapters present: objkt (asks), teia (hen v2 swap).
 *  - Contract builders are stubbed — the data + UI layer ships first.
 */
import {
    buildTeiaCancelOp,
    buildTeiaCreateSwapOp,
    buildTeiaTargetAddOperatorsOp,
    fetchExistingTeiaTargetOperators,
    fetchTeiaSourceSwaps,
    isTeiaMarketplace,
    TEIA_CONTRACTS,
    teiaTargetFor,
} from "./marketplaces/teia";
import {
    buildObjktCancelOp,
    buildObjktCreateAskOp,
    buildObjktTargetAddOperatorsOp,
    fetchExistingObjktTargetOperators,
    fetchObjktSourceListings,
    isObjktMarketplace,
    OBJKT_TARGET,
} from "./marketplaces/objkt";

/** Our tool's tip recipient — opt-in revenue share on supported listings. */
export const TIP_RECIPIENT = "tz1ZzSmVcnVaWNZKJradtrDnjSjzTp6qjTEW";

export const OBJKT_GRAPHQL = "https://data.objkt.com/v3/graphql";

/**
 * Marketplace identity is derived from objkt's `listing.marketplace.group`
 * field (verified via introspection of data.objkt.com):
 *   - "hen"      → KT1HbQepzV1nVGg8QVznG7z4RcHseD5kwqBn (hen v2, used by teia)
 *   - "teia"     → KT1PHubm9HtyQEJ4BBpMTVomq6mhbfNZ9z5w (teia v1)
 *   - "objktcom" → multiple contracts (v1, v4, v6, v6.1, v6.2, fixed-pricing handlers)
 * We classify "hen" and "teia" groups both as MarketplaceId "teia" for UX
 * purposes, and "objktcom" as "objkt". Anything else stays unknown and the
 * row is excluded.
 */
export type MarketplaceId = "objkt" | "teia";

/** All listings in objkt's `listing` table are fixed-price asks (auctions
 *  and OEs live in `english_auction` / `dutch_auction` / `open_edition`
 *  tables — out of scope for v0.1). */
export type ListingType = "ask";

export type ListingState =
    /** Eligible for bulk reprice (cancel + recreate). */
    | "relistable"
    /** Auction with active bids — can be ended but not repriced. */
    | "cancel_only"
    /** Non-xtz currency, expired, or otherwise outside MVP scope. */
    | "locked";

export interface ListingToken {
    fa2: string;
    tokenId: string;
    name: string;
    /** Best-available thumbnail (ipfs:// will be rewired through a gateway in the UI). */
    thumbnailUri: string | null;
    /** Display uri — preferred for grid thumbnails when present (objkt usually has these on cdn). */
    displayUri: string | null;
    /** Mime hint from FA2 metadata, used to pick rendering strategy. */
    mime: string | null;
    /** Collection / contract display name. */
    collectionName: string | null;
}

export interface Listing {
    /** Stable id: `${marketplaceContract}:${bigmap_key}` so it survives refetches. */
    id: string;
    marketplace: MarketplaceId;
    marketplaceContract: string;
    type: ListingType;
    state: ListingState;
    /** Reason text for state — shown in the UI when state !== relistable. */
    stateReason?: string;

    token: ListingToken;
    /** Price in mutez. For auctions, the current/starting price. */
    priceMutez: string;
    /** Editions remaining at this listing. */
    amount: number;
    /** Currency contract address; null = native xtz. MVP filters to native only. */
    currencyContract: string | null;
    /** ISO timestamp when this listing was created on chain. */
    createdAt: string;

    /** Marketplace-specific id used to cancel — for objkt, the `ask_id`; for
     *  teia, the `swap_id`. Stored as string so we can pass to Micheline `nat`. */
    onchainId: string;

    /** True iff this marketplace supports embedding a third-party share in the
     *  new listing. Objkt v4 ask_v3 → true. Teia → false. */
    supportsShares: boolean;

    /** Royalty config preserved verbatim when relisting. Shape is
     *  marketplace-dependent; the adapter knows how to re-encode it. */
    royalties: unknown;
}

export interface AdapterRelistInput {
    listing: Listing;
    /** New price in mutez (string for nat-safety). */
    newPriceMutez: string;
    /** Optional share to attach to new listing (only honored when
     *  listing.supportsShares is true). null = no share. */
    share: { recipient: string; basisPoints: number } | null;
}

/** A marketplace-agnostic Tezos transaction op. Mirrors the shape used by
 *  octez.connect's requestOperation. We keep it as `unknown` here to avoid
 *  importing the SDK into this lib (it's lazy-loaded). The page assembles
 *  these into the real op list at submit time. */
export interface PreparedOp {
    destination: string;
    amount: string;
    entrypoint: string;
    /** Micheline value for the entrypoint parameter. */
    value: unknown;
}

export interface MarketplaceAdapter {
    id: MarketplaceId;
    /** Whether this marketplace supports embedding a share on relist. */
    supportsShares: boolean;
    /** Build the op group to cancel the existing listing (1 or more ops). */
    buildCancelOps(listing: Listing): PreparedOp[];
    /** Build the op group to create a new listing at `newPrice` with optional share. */
    buildRelistOps(input: AdapterRelistInput): PreparedOp[];
}

// ---------------------------------------------------------------------------
// GraphQL fetcher
// ---------------------------------------------------------------------------

/**
 * Schema verified by GraphQL introspection of data.objkt.com/v3/graphql:
 *  - `listing` table only contains fixed-price asks (status: active/concluded/cancelled).
 *  - Tez is `currency.type === "tez"`. Other types are "fa2" / "fa1.2".
 *  - `shares` is jsonb — `[{ recipient: address, amount: nat-as-string }]`,
 *    units depend on marketplace (hen v2 = basis points out of 10000;
 *    objkt v4 = same scale). Preserved verbatim on relist.
 *  - `token.fa.name` exists (FA collection name).
 *  - Orderable by `timestamp`.
 */
const LISTINGS_QUERY = /* GraphQL */ `
  query SellerListings($seller: String!) {
    listing(
      where: {
        seller_address: { _eq: $seller }
        status: { _eq: "active" }
      }
      order_by: { timestamp: desc }
      limit: 500
    ) {
      id
      bigmap_key
      marketplace_contract
      marketplace {
        name
        group
      }
      price
      amount
      amount_left
      timestamp
      shares
      currency {
        id
        symbol
        type
        fa_contract
      }
      token {
        token_id
        fa_contract
        name
        display_uri
        thumbnail_uri
        mime
        fa {
          name
        }
      }
    }
  }
`;

interface RawListing {
    id: string;
    bigmap_key: string;
    marketplace_contract: string;
    marketplace: { name: string | null; group: string | null };
    price: string;
    amount: number | null;
    amount_left: number | null;
    timestamp: string;
    shares: unknown;
    currency: { id: number; symbol: string | null; type: string; fa_contract: string | null } | null;
    token: {
        token_id: string;
        fa_contract: string;
        name: string | null;
        display_uri: string | null;
        thumbnail_uri: string | null;
        mime: string | null;
        fa: { name: string | null } | null;
    } | null;
}

/** Per-listing dispatch — uses the adapter registries to determine which
 *  rows we can handle and how. Listings from groups we don't have adapters
 *  for (fxhash, versum, akaswap, 8bidou, etc.) are excluded from the result. */
function classifyListing(contract: string): {
    marketplace: MarketplaceId;
    supportsShares: boolean;
} | null {
    if (isTeiaMarketplace(contract)) {
        return { marketplace: "teia", supportsShares: false };
    }
    if (isObjktMarketplace(contract)) {
        return { marketplace: "objkt", supportsShares: true };
    }
    return null;
}

function normalize(rows: RawListing[]): Listing[] {
    const out: Listing[] = [];
    for (const r of rows) {
        if (!r.token) continue;
        const cls = classifyListing(r.marketplace_contract);
        if (!cls) continue;
        const marketplace = cls.marketplace;

        const isTez = r.currency?.type === "tez";
        const currencyContract = isTez ? null : r.currency?.fa_contract ?? null;

        let state: ListingState = "relistable";
        let stateReason: string | undefined;
        if (!isTez) {
            state = "locked";
            stateReason = `${r.currency?.symbol ?? "non-xtz"} listings not supported yet`;
        }

        const supportsShares = cls.supportsShares && state === "relistable";

        out.push({
            id: `${r.marketplace_contract}:${r.bigmap_key}`,
            marketplace,
            marketplaceContract: r.marketplace_contract,
            type: "ask",
            state,
            stateReason,
            token: {
                fa2: r.token.fa_contract,
                tokenId: r.token.token_id,
                name: r.token.name ?? `#${r.token.token_id}`,
                thumbnailUri: r.token.thumbnail_uri,
                displayUri: r.token.display_uri,
                mime: r.token.mime,
                collectionName: r.token.fa?.name ?? null,
            },
            priceMutez: r.price,
            amount: r.amount_left ?? r.amount ?? 1,
            currencyContract,
            createdAt: r.timestamp,
            onchainId: r.bigmap_key,
            supportsShares,
            royalties: r.shares ?? null,
        });
    }
    return out;
}

export async function fetchSellerListings(sellerAddress: string): Promise<Listing[]> {
    const res = await fetch(OBJKT_GRAPHQL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: LISTINGS_QUERY, variables: { seller: sellerAddress } }),
    });
    if (!res.ok) throw new Error(`objkt graphql ${res.status}`);
    const body = (await res.json()) as { data?: { listing: RawListing[] }; errors?: unknown };
    if (body.errors) {
        throw new Error(`objkt graphql error: ${JSON.stringify(body.errors)}`);
    }
    return normalize(body.data?.listing ?? []);
}

// ---------------------------------------------------------------------------
// Planner + submitter
// ---------------------------------------------------------------------------

export interface PriceTarget {
    /** New price in mutez. */
    newPriceMutez: string;
}

export interface PlannedBatch {
    /** Display label e.g. "teia · 12 relists". */
    label: string;
    ops: PreparedOp[];
    /** Listings included in this batch (for the UI's per-batch breakdown). */
    listings: Listing[];
}

export interface BulkRelistPlan {
    batches: PlannedBatch[];
    /** Total per-listing op count (cancel + swap = 2 per relist). */
    totalOps: number;
    /** Notes the UI shows above the sign list — operator pre-ops, skipped rows, etc. */
    notes: string[];
    /** Tip share that was actually embedded — null if user opted out OR no
     *  objkt listings were in the batch (teia doesn't support tip share). */
    tipApplied: { recipient: string; basisPoints: number; objktAskCount: number } | null;
}

/**
 * Conservative op-budget per batch. Each relist = 2 ops (cancel + create).
 * 20 pairs = 40 ops sits well under typical mainnet gas caps. Tunable.
 */
const PAIRS_PER_BATCH = 20;

export interface PlanInputs {
    seller: string;
    listings: Listing[];
    priceFor: (l: Listing) => string;
    /** Tip share to embed on objkt relists. null = no tip. */
    tip: { recipient: string; basisPoints: number } | null;
    /** When true (default), the new objkt ask preserves the source listing's
     *  shares verbatim (artist royalty, gallery splits, collab shares, etc.).
     *  When false, the new ask has NO shares except the optional tip — the
     *  seller keeps everything minus marketplace fee. Destructive option. */
    preserveExistingShares: boolean;
}

interface RelistPair {
    listing: Listing;
    cancel: PreparedOp;
    create: PreparedOp;
    /** Resolved target marketplace contract for the create op. */
    target: string;
    /** Resolved (fa2, token_id) the operator must be set on for target. */
    fa2: string;
    tokenId: string;
}

/**
 * Unified planner. Each listing decomposes into:
 *   - cancel op on the listing's current source contract
 *   - create op on the canonical target contract for its marketplace family
 *     (objkt → v6.2; teia → hen v2 for HEN FA2, teia v1 otherwise)
 *
 * Pipeline per marketplace family:
 *   1. Fetch authoritative on-chain storage from each source contract's bigmap
 *   2. Drop stale rows (sold / cancelled since UI loaded) + non-tez rows
 *   3. Resolve target marketplace + (fa2, token_id) for each survivor
 *   4. Operator preflight against the resolved target — emit one
 *      update_operators op per (fa2, target) pair containing all missing
 *      token_ids; prepend to the first batch
 *   5. Chunk into batches of PAIRS_PER_BATCH cancel+create pairs
 *
 * Batches are ordered: teia first, then objkt.
 */
export async function planBulkRelist(input: PlanInputs): Promise<BulkRelistPlan> {
    const notes: string[] = [];
    const batches: PlannedBatch[] = [];
    let objktAsksWithTip = 0;

    const teiaSel = input.listings.filter((l) => l.marketplace === "teia");
    const objktSel = input.listings.filter((l) => l.marketplace === "objkt");

    // ------------------------------------------------------------ teia
    if (teiaSel.length > 0) {
        const swaps = await fetchTeiaSourceSwaps(
            teiaSel.map((l) => ({ marketplaceContract: l.marketplaceContract, onchainId: l.onchainId })),
        );

        const pairs: RelistPair[] = [];
        let stale = 0;
        const targetCounts: Record<string, number> = {};
        for (const l of teiaSel) {
            const src = swaps.get(`${l.marketplaceContract}:${l.onchainId}`);
            if (!src) { stale++; continue; }
            const targetKey = teiaTargetFor(src.fa2);
            const target = TEIA_CONTRACTS[targetKey];
            pairs.push({
                listing: l,
                cancel: buildTeiaCancelOp(l),
                create: buildTeiaCreateSwapOp({ source: src, target, newPriceMutez: input.priceFor(l) }),
                target,
                fa2: src.fa2,
                tokenId: src.tokenId,
            });
            targetCounts[targetKey] = (targetCounts[targetKey] ?? 0) + 1;
        }
        if (stale > 0) notes.push(`teia: ${stale} listing${stale === 1 ? "" : "s"} dropped (sold or cancelled on chain).`);
        for (const [k, n] of Object.entries(targetCounts)) {
            notes.push(`teia: ${n} listing${n === 1 ? "" : "s"} will be created on ${k === "HENV2" ? "hen v2" : "teia v1"}.`);
        }

        // Operator preflight per (fa2, target)
        const operatorItems = pairs.map((p) => ({ fa2: p.fa2, tokenId: p.tokenId, target: p.target }));
        const have = await fetchExistingTeiaTargetOperators(input.seller, operatorItems);
        // Group missing by (fa2, target).
        const missingByGroup = new Map<string, { fa2: string; target: string; tokenIds: Set<string> }>();
        for (const p of pairs) {
            if (have.has(`${p.fa2}:${p.tokenId}:${p.target}`)) continue;
            const k = `${p.fa2}::${p.target}`;
            const g = missingByGroup.get(k) ?? { fa2: p.fa2, target: p.target, tokenIds: new Set() };
            g.tokenIds.add(p.tokenId);
            missingByGroup.set(k, g);
        }
        const operatorOps: PreparedOp[] = [];
        let opCount = 0;
        for (const g of missingByGroup.values()) {
            operatorOps.push(buildTeiaTargetAddOperatorsOp(g.fa2, input.seller, g.target, Array.from(g.tokenIds)));
            opCount += g.tokenIds.size;
        }
        if (opCount > 0) {
            notes.push(`teia: granting marketplace operator on ${opCount} (fa2, token) pair${opCount === 1 ? "" : "s"}.`);
        }

        let cursor = 0;
        let bIdx = 0;
        while (cursor < pairs.length) {
            const slice = pairs.slice(cursor, cursor + PAIRS_PER_BATCH);
            let ops: PreparedOp[] = slice.flatMap((p) => [p.cancel, p.create]);
            if (bIdx === 0 && operatorOps.length > 0) ops = [...operatorOps, ...ops];
            batches.push({
                label: `teia · ${slice.length} relist${slice.length === 1 ? "" : "s"}`,
                ops,
                listings: slice.map((p) => p.listing),
            });
            cursor += slice.length;
            bIdx++;
        }
    }

    // ----------------------------------------------------------- objkt
    if (objktSel.length > 0) {
        const sources = await fetchObjktSourceListings(
            objktSel.map((l) => ({ marketplaceContract: l.marketplaceContract, onchainId: l.onchainId })),
        );

        const pairs: RelistPair[] = [];
        let stale = 0;
        let nonTez = 0;
        let unknownFa2 = 0;
        for (const l of objktSel) {
            const src = sources.get(`${l.marketplaceContract}:${l.onchainId}`);
            if (!src) { stale++; continue; }
            if (src.currencyKind !== "tez") { nonTez++; continue; }
            if (!src.fa2) { unknownFa2++; continue; }
            if (input.tip && input.tip.basisPoints > 0) objktAsksWithTip++;
            pairs.push({
                listing: l,
                cancel: buildObjktCancelOp(l),
                create: buildObjktCreateAskOp({
                    listing: l,
                    fa2: src.fa2,
                    tokenId: src.tokenId,
                    editions: src.editions,
                    sourceShares: input.preserveExistingShares ? src.shares : [],
                    newPriceMutez: input.priceFor(l),
                    tip: input.tip,
                }),
                target: OBJKT_TARGET,
                fa2: src.fa2,
                tokenId: src.tokenId,
            });
        }
        if (stale > 0) notes.push(`objkt: ${stale} listing${stale === 1 ? "" : "s"} dropped (sold or cancelled on chain).`);
        if (nonTez > 0) notes.push(`objkt: ${nonTez} non-tez listing${nonTez === 1 ? "" : "s"} skipped.`);
        if (unknownFa2 > 0) notes.push(`objkt: ${unknownFa2} listing${unknownFa2 === 1 ? "" : "s"} skipped (couldn't resolve token from contract).`);
        notes.push(`objkt: all new asks created on v6.2 (${OBJKT_TARGET.slice(0, 6)}…${OBJKT_TARGET.slice(-4)}).`);

        const operatorItems = pairs.map((p) => ({ fa2: p.fa2, tokenId: p.tokenId }));
        const have = await fetchExistingObjktTargetOperators(input.seller, operatorItems);
        const missingByFa2 = new Map<string, Set<string>>();
        let missingCount = 0;
        for (const p of pairs) {
            if (have.has(`${p.fa2}:${p.tokenId}`)) continue;
            const s = missingByFa2.get(p.fa2) ?? new Set<string>();
            s.add(p.tokenId);
            missingByFa2.set(p.fa2, s);
            missingCount++;
        }
        const operatorOps: PreparedOp[] = [];
        for (const [fa2, tids] of missingByFa2) {
            operatorOps.push(buildObjktTargetAddOperatorsOp(fa2, input.seller, Array.from(tids)));
        }
        if (missingCount > 0) {
            notes.push(
                `objkt: granting v6.2 operator on ${missingCount} (fa2, token) pair${missingCount === 1 ? "" : "s"} across ${missingByFa2.size} collection${missingByFa2.size === 1 ? "" : "s"}.`,
            );
        }
        if (!input.preserveExistingShares) {
            notes.push(
                `objkt: existing splits ARE NOT being carried over — new asks have no royalty splits (artist receives nothing on sale).`,
            );
        }
        if (input.tip) {
            notes.push(
                `objkt: tip ${(input.tip.basisPoints / 100).toFixed(2)}% to ${input.tip.recipient.slice(0, 6)}…${input.tip.recipient.slice(-4)} appended to each new ask's shares map. (Thank You!!)`,
            );
        }

        let cursor = 0;
        let bIdx = 0;
        while (cursor < pairs.length) {
            const slice = pairs.slice(cursor, cursor + PAIRS_PER_BATCH);
            let ops: PreparedOp[] = slice.flatMap((p) => [p.cancel, p.create]);
            if (bIdx === 0 && operatorOps.length > 0) ops = [...operatorOps, ...ops];
            batches.push({
                label: `objkt · ${slice.length} relist${slice.length === 1 ? "" : "s"}`,
                ops,
                listings: slice.map((p) => p.listing),
            });
            cursor += slice.length;
            bIdx++;
        }
    }

    const totalOps = batches.reduce((sum, b) => sum + b.ops.length, 0);
    const tipApplied =
        input.tip && input.tip.basisPoints > 0 && objktAsksWithTip > 0
            ? { recipient: input.tip.recipient, basisPoints: input.tip.basisPoints, objktAskCount: objktAsksWithTip }
            : null;
    return { batches, totalOps, notes, tipApplied };
}


/** Submit a planned batch via the connected wallet client. Returns the op
 *  hash. Throws on signing rejection or rpc error.
 *
 *  The client param is typed loosely so this lib stays free of a hard
 *  octez.connect SDK dependency (it's lazy-loaded at the app boundary).
 *  We cast through `unknown` at the boundary; the runtime contract is
 *  exactly the SDK's DAppClient.requestOperation. */
export async function submitBatch(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: { requestOperation: (req: any) => Promise<{ transactionHash: string }> },
    batch: PlannedBatch,
): Promise<{ transactionHash: string }> {
    if (batch.ops.length === 0) throw new Error("empty batch");
    const operationDetails = batch.ops.map((op) => ({
        kind: "transaction",
        destination: op.destination,
        amount: op.amount,
        parameters: { entrypoint: op.entrypoint, value: op.value },
    }));
    return client.requestOperation({ operationDetails });
}

// ---------------------------------------------------------------------------
// Display / formatting helpers
// ---------------------------------------------------------------------------

/** mutez → tez as a string with up to 6 decimals, trimmed. */
export function mutezToTez(mutez: string): string {
    const n = BigInt(mutez || "0");
    const whole = n / 1_000_000n;
    const frac = n % 1_000_000n;
    if (frac === 0n) return whole.toString();
    const fracStr = frac.toString().padStart(6, "0").replace(/0+$/, "");
    return `${whole}.${fracStr}`;
}

/** tez (user input) → mutez nat string. Returns null if invalid. */
export function tezToMutez(tez: string): string | null {
    const trimmed = tez.trim();
    if (!trimmed) return null;
    if (!/^\d+(\.\d{0,6})?$/.test(trimmed)) return null;
    const [whole, frac = ""] = trimmed.split(".");
    const padded = (frac + "000000").slice(0, 6);
    const big = BigInt(whole) * 1_000_000n + BigInt(padded || "0");
    return big.toString();
}

/** Parse the heterogeneous `shares` jsonb that objkt's GraphQL returns into
 *  a uniform [recipient, basisPoints] list. Handles both shapes seen in the
 *  wild:
 *    - v4 listing.shares  → array `[{ amount, recipient }]`
 *    - v6+ listing.shares → object `{ "tz1...": "1000", ... }`
 *  Both encode amounts as basis points (denom 10000). */
export function parseSourceShares(raw: unknown): Array<[recipient: string, basisPoints: number]> {
    if (!raw) return [];
    if (Array.isArray(raw)) {
        const out: Array<[string, number]> = [];
        for (const row of raw) {
            if (!row || typeof row !== "object") continue;
            const r = row as { recipient?: string; amount?: string | number };
            if (typeof r.recipient === "string" && r.amount !== undefined) {
                out.push([r.recipient, Number(r.amount)]);
            }
        }
        return out;
    }
    if (typeof raw === "object") {
        return Object.entries(raw as Record<string, string | number>).map(
            ([addr, amt]) => [addr, Number(amt)] as [string, number],
        );
    }
    return [];
}

/** Rewrite ipfs:// uri to a public gateway. Falls through any non-ipfs uri. */
export function gatewayUri(uri: string | null): string | null {
    if (!uri) return null;
    if (uri.startsWith("ipfs://")) {
        // Strip ipfs:// and any ?query/#frag — ipfs gateways don't take those.
        const path = uri.slice(7);
        return `https://ipfs.io/ipfs/${path}`;
    }
    return uri;
}
