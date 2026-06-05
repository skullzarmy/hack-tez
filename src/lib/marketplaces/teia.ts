/**
 * Teia-family adapter — bulk relist strategy.
 *
 * Two source contracts surface as group "hen" or "teia" in objkt's `listing`
 * table:
 *
 *   ┌──────────────────────────────────────┬────────┬─────────────────────────┐
 *   │ contract                             │ alias  │ swap param shape        │
 *   ├──────────────────────────────────────┼────────┼─────────────────────────┤
 *   │ KT1HbQepzV1nVGg8QVznG7z4RcHseD5kwqBn │ HENV2  │ fa2 hardcoded (HEN_FA2) │  ← target (for HEN tokens)
 *   │ KT1PHubm9HtyQEJ4BBpMTVomq6mhbfNZ9z5w │ TEIAV1 │ fa2 explicit            │  ← target (for non-HEN)
 *   └──────────────────────────────────────┴────────┴─────────────────────────┘
 *
 * Relist target: hen v2 only accepts the HEN OBJKT FA2 (hardcoded). Teia v1
 * accepts any allowlisted FA2. We pick the target per-listing:
 *  - FA2 == HEN_FA2 → recreate on hen v2 (the canonical teia marketplace today)
 *  - FA2 != HEN_FA2 → recreate on teia v1 (the only contract that takes it)
 *
 * Cancel always uses the source contract the listing currently lives on.
 *
 * Both contracts escrow tokens, so operator state is sticky across cancel +
 * recreate. Operator preflight is per (fa2, token_id, target).
 *
 * Royalty handling: single nat per-mille (denom 1000). Preserved verbatim on
 * relist. Neither contract supports embedding a tool tip — that's objkt-only.
 */
import type { Listing, PreparedOp } from "../bulkRelist";

const TZKT = "https://api.tzkt.io";

export const TEIA_CONTRACTS = {
    HENV2:  "KT1HbQepzV1nVGg8QVznG7z4RcHseD5kwqBn",
    TEIAV1: "KT1PHubm9HtyQEJ4BBpMTVomq6mhbfNZ9z5w",
} as const;

/** Hen v2 hardcodes this FA2 in storage — every hen v2 listing/relist is against it. */
export const HEN_FA2 = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";

const SOURCE_SET = new Set<string>(Object.values(TEIA_CONTRACTS));

export function isTeiaMarketplace(addr: string): boolean {
    return SOURCE_SET.has(addr);
}

/** Pick the target marketplace contract for a given fa2. */
export function teiaTargetFor(fa2: string): "HENV2" | "TEIAV1" {
    return fa2 === HEN_FA2 ? "HENV2" : "TEIAV1";
}

// ---------------------------------------------------------------------------
// Source-listing storage fetch
// ---------------------------------------------------------------------------

const SWAPS_BIGMAP: Record<string, number> = {
    [TEIA_CONTRACTS.HENV2]:  6072,
    [TEIA_CONTRACTS.TEIAV1]: 90366,
};

export interface TeiaSourceSwap {
    onchainId: string;
    marketplaceContract: string;
    fa2: string;
    tokenId: string;
    creator: string;
    /** Royalties as nat per-mille (denom 1000). 100 = 10%. */
    royalties: string;
    objktAmount: string;
}

interface RawSwapValue {
    issuer: string;
    creator: string;
    objkt_id: string;
    royalties: string;
    objkt_amount: string;
    xtz_per_objkt: string;
    fa2?: string;
}

export async function fetchTeiaSourceSwaps(
    refs: Array<{ marketplaceContract: string; onchainId: string }>,
): Promise<Map<string, TeiaSourceSwap>> {
    const out = new Map<string, TeiaSourceSwap>();
    const byContract = new Map<string, string[]>();
    for (const r of refs) {
        if (r.onchainId === null || r.onchainId === undefined || String(r.onchainId).length === 0) continue;
        const arr = byContract.get(r.marketplaceContract) ?? [];
        arr.push(String(r.onchainId));
        byContract.set(r.marketplaceContract, arr);
    }
    for (const [contract, ids] of byContract) {
        const bigmap = SWAPS_BIGMAP[contract];
        if (!bigmap) continue;
        for (let i = 0; i < ids.length; i += 50) {
            const chunk = ids.slice(i, i + 50);
            const rows = (await fetchBigmapKeys(bigmap, chunk)) as Array<{ key: string; value: RawSwapValue }>;
            for (const r of rows) {
                const fa2 = contract === TEIA_CONTRACTS.HENV2 ? HEN_FA2 : (r.value.fa2 ?? "");
                if (!fa2) continue;
                out.set(`${contract}:${r.key}`, {
                    onchainId: r.key,
                    marketplaceContract: contract,
                    fa2,
                    tokenId: r.value.objkt_id,
                    creator: r.value.creator,
                    royalties: r.value.royalties,
                    objktAmount: r.value.objkt_amount,
                });
            }
        }
    }
    return out;
}

/** Same bullet-proof fetcher as objkt's — TzKT `key.in` rejects 0- or
 *  1-element CSVs. Dispatch to `key.eq` for single keys. */
async function fetchBigmapKeys(
    bigmap: number,
    keys: string[],
): Promise<Array<{ key: string; value: unknown }>> {
    if (keys.length === 0) return [];
    const base = `${TZKT}/v1/bigmaps/${bigmap}/keys?active=true&select=key,value&limit=${keys.length}`;
    const url =
        keys.length === 1
            ? `${base}&key.eq=${encodeURIComponent(keys[0])}`
            : `${base}&key.in=${keys.map(encodeURIComponent).join(",")}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`tzkt: bigmap ${bigmap} lookup failed (${res.status})`);
    return (await res.json()) as Array<{ key: string; value: unknown }>;
}

// ---------------------------------------------------------------------------
// Operator preflight (per target)
// ---------------------------------------------------------------------------

/** Returns set of `${fa2}:${tokenId}:${target}` keys already with target as
 *  operator for seller. `target` is the resolved teia marketplace contract
 *  the recreate is going to. */
export async function fetchExistingTeiaTargetOperators(
    seller: string,
    items: Array<{ fa2: string; tokenId: string; target: string }>,
): Promise<Set<string>> {
    const have = new Set<string>();
    const groups = new Map<string, { fa2: string; mp: string; tokenIds: string[] }>();
    for (const it of items) {
        const k = `${it.fa2}::${it.target}`;
        const g = groups.get(k) ?? { fa2: it.fa2, mp: it.target, tokenIds: [] };
        g.tokenIds.push(it.tokenId);
        groups.set(k, g);
    }
    for (const { fa2, mp, tokenIds } of groups.values()) {
        for (let i = 0; i < tokenIds.length; i += 50) {
            const chunk = tokenIds.slice(i, i + 50);
            const tidParam =
                chunk.length === 1
                    ? `key.token_id.eq=${encodeURIComponent(chunk[0])}`
                    : `key.token_id.in=${chunk.map(encodeURIComponent).join(",")}`;
            const url =
                `${TZKT}/v1/contracts/${fa2}/bigmaps/operators/keys` +
                `?key.owner=${encodeURIComponent(seller)}` +
                `&key.operator=${encodeURIComponent(mp)}` +
                `&${tidParam}` +
                `&active=true&select=key&limit=${chunk.length}`;
            const res = await fetch(url);
            if (!res.ok) continue;
            const rows = (await res.json()) as Array<{ token_id?: string; key?: { token_id: string } }>;
            for (const r of rows) {
                const tid = r.token_id ?? r.key?.token_id;
                if (tid !== undefined) have.add(`${fa2}:${tid}:${mp}`);
            }
        }
    }
    return have;
}

export function buildTeiaTargetAddOperatorsOp(
    fa2: string,
    seller: string,
    target: string,
    tokenIds: string[],
): PreparedOp {
    return {
        destination: fa2,
        amount: "0",
        entrypoint: "update_operators",
        value: tokenIds.map((tid) => ({
            prim: "Left",
            args: [
                {
                    prim: "Pair",
                    args: [
                        { string: seller },
                        {
                            prim: "Pair",
                            args: [{ string: target }, { int: String(tid) }],
                        },
                    ],
                },
            ],
        })),
    };
}

// ---------------------------------------------------------------------------
// Op builders
// ---------------------------------------------------------------------------

/** cancel_swap on whatever source contract the listing currently sits on. */
export function buildTeiaCancelOp(listing: Listing): PreparedOp {
    return {
        destination: listing.marketplaceContract,
        amount: "0",
        entrypoint: "cancel_swap",
        value: { int: String(listing.onchainId) },
    };
}

/** Create swap on the chosen target. Encodes per-target field order verified
 *  via TzKT micheline introspection:
 *
 *  HENV2 swap (no fa2 — hardcoded in contract):
 *    Pair (Pair creator objkt_amount) (Pair objkt_id (Pair royalties xtz_per_objkt))
 *
 *  TEIAV1 swap (fa2 explicit):
 *    Pair fa2 (Pair objkt_id (Pair objkt_amount (Pair xtz_per_objkt (Pair royalties creator))))
 */
export function buildTeiaCreateSwapOp(args: {
    source: TeiaSourceSwap;
    target: string;
    newPriceMutez: string;
}): PreparedOp {
    const { source: s, target, newPriceMutez } = args;
    // Taquito requires every Micheline `int` value to be a string. Stringify
    // once and reuse, regardless of whether the source value came in as a
    // number (graphql) or a string (tzkt bigmap).
    const intTok = String(s.tokenId);
    const intAmt = String(s.objktAmount);
    const intRoy = String(s.royalties);
    const intPx = String(newPriceMutez);
    if (target === TEIA_CONTRACTS.HENV2) {
        return {
            destination: target,
            amount: "0",
            entrypoint: "swap",
            value: {
                prim: "Pair",
                args: [
                    {
                        prim: "Pair",
                        args: [{ string: s.creator }, { int: intAmt }],
                    },
                    {
                        prim: "Pair",
                        args: [
                            { int: intTok },
                            {
                                prim: "Pair",
                                args: [{ int: intRoy }, { int: intPx }],
                            },
                        ],
                    },
                ],
            },
        };
    }
    // TEIAV1
    return {
        destination: target,
        amount: "0",
        entrypoint: "swap",
        value: {
            prim: "Pair",
            args: [
                { string: s.fa2 },
                {
                    prim: "Pair",
                    args: [
                        { int: intTok },
                        {
                            prim: "Pair",
                            args: [
                                { int: intAmt },
                                {
                                    prim: "Pair",
                                    args: [
                                        { int: intPx },
                                        {
                                            prim: "Pair",
                                            args: [{ int: intRoy }, { string: s.creator }],
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    };
}
