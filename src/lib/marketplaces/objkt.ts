/**
 * Objkt.com marketplace adapter — bulk relist strategy.
 *
 * **Insight that drives this design:** relisting = cancel on whatever
 * marketplace the listing currently sits on + recreate on the current
 * canonical marketplace. Every objkt frontend works this way; old
 * marketplaces are retained only so the cancel entrypoint stays callable.
 *
 *   ┌──────────────────────────────────────┬──────┬──────────────────┐
 *   │ contract                             │ kind │ cancel entrypoint│
 *   ├──────────────────────────────────────┼──────┼──────────────────┤
 *   │ KT1FvqJwEDWb1Gwc55Jd1jjTHRVWbYKUUpyq │ V1   │ retract_ask      │
 *   │ KT1WvzYHCNBvDSdwafTHv7nJ1dWmZ8GCYuuC │ V4   │ retract_ask      │
 *   │ KT1CePTyk6fk4cFr6fasY5YXPGks6ttjSLp4 │ V6   │ retract_ask      │
 *   │ KT1Xjap1TwmDR1d8yEd8ErkraAj2mbdMrPZY │ V61  │ retract_ask      │
 *   │ KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X │ V62  │ retract_ask      │  ← target
 *   │ KT1NiZkkW82wsTKP95x8FefdiseDyU9vX66W │ FX1  │ unlist           │
 *   │ KT1UwGGfWS91Z76Z6yq7WyDKWBVzWAcmhpnK │ FX11 │ unlist           │
 *   └──────────────────────────────────────┴──────┴──────────────────┘
 *
 * All recreate ops go to **OBJKT_TARGET = v6.2** using its `ask` entrypoint.
 * Operator preflight is against v6.2 only.
 *
 * Shares denom: basis-points out of 10000. The tip embeds as one extra
 * shares-map entry on every recreated ask.
 *
 * Currency: tez only (locked rows for fa12/fa2 are filtered upstream).
 */
import type { Listing, PreparedOp } from "../bulkRelist";

const TZKT = "https://api.tzkt.io";

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

/** Current canonical objkt marketplace — every new ask is created here. */
export const OBJKT_TARGET = "KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X";

export const OBJKT_SOURCE_CONTRACTS = {
    V1:   "KT1FvqJwEDWb1Gwc55Jd1jjTHRVWbYKUUpyq",
    V4:   "KT1WvzYHCNBvDSdwafTHv7nJ1dWmZ8GCYuuC",
    V6:   "KT1CePTyk6fk4cFr6fasY5YXPGks6ttjSLp4",
    V61:  "KT1Xjap1TwmDR1d8yEd8ErkraAj2mbdMrPZY",
    V62:  "KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X",
    FX1:  "KT1NiZkkW82wsTKP95x8FefdiseDyU9vX66W",
    FX11: "KT1UwGGfWS91Z76Z6yq7WyDKWBVzWAcmhpnK",
} as const;

const SOURCE_SET = new Set<string>(Object.values(OBJKT_SOURCE_CONTRACTS));

const FIXED_PRICING_SET = new Set<string>([
    OBJKT_SOURCE_CONTRACTS.FX1,
    OBJKT_SOURCE_CONTRACTS.FX11,
]);

export function isObjktMarketplace(addr: string): boolean {
    return SOURCE_SET.has(addr);
}

/** Cancel entrypoint name for the contract the listing currently sits on. */
function cancelEntrypoint(contract: string): "retract_ask" | "unlist" {
    return FIXED_PRICING_SET.has(contract) ? "unlist" : "retract_ask";
}

// ---------------------------------------------------------------------------
// Operator preflight (v6.2 only — the target contract)
// ---------------------------------------------------------------------------

/** Returns the set of `${fa2}:${tokenId}` keys that already have v6.2 as
 *  operator for `seller`. Caller subtracts to find what needs adding. */
export async function fetchExistingObjktTargetOperators(
    seller: string,
    items: Array<{ fa2: string; tokenId: string }>,
): Promise<Set<string>> {
    const have = new Set<string>();
    const byFa2 = new Map<string, string[]>();
    for (const it of items) {
        const arr = byFa2.get(it.fa2) ?? [];
        arr.push(it.tokenId);
        byFa2.set(it.fa2, arr);
    }
    for (const [fa2, tokenIds] of byFa2) {
        for (let i = 0; i < tokenIds.length; i += 50) {
            const chunk = tokenIds.slice(i, i + 50);
            const tidParam =
                chunk.length === 1
                    ? `key.token_id.eq=${encodeURIComponent(chunk[0])}`
                    : `key.token_id.in=${chunk.map(encodeURIComponent).join(",")}`;
            const url =
                `${TZKT}/v1/contracts/${fa2}/bigmaps/operators/keys` +
                `?key.owner=${encodeURIComponent(seller)}` +
                `&key.operator=${encodeURIComponent(OBJKT_TARGET)}` +
                `&${tidParam}` +
                `&active=true&select=key&limit=${chunk.length}`;
            const res = await fetch(url);
            if (!res.ok) continue; // fail-open
            const rows = (await res.json()) as Array<{ token_id?: string; key?: { token_id: string } }>;
            for (const r of rows) {
                const tid = r.token_id ?? r.key?.token_id;
                if (tid !== undefined) have.add(`${fa2}:${tid}`);
            }
        }
    }
    return have;
}

export function buildObjktTargetAddOperatorsOp(
    fa2: string,
    seller: string,
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
                            args: [{ string: OBJKT_TARGET }, { int: String(tid) }],
                        },
                    ],
                },
            ],
        })),
    };
}

// ---------------------------------------------------------------------------
// Cancel op (per-source contract)
// ---------------------------------------------------------------------------

export function buildObjktCancelOp(listing: Listing): PreparedOp {
    return {
        destination: listing.marketplaceContract,
        amount: "0",
        entrypoint: cancelEntrypoint(listing.marketplaceContract),
        value: { int: String(listing.onchainId) },
    };
}

// ---------------------------------------------------------------------------
// Create ask op (always v6.2)
// ---------------------------------------------------------------------------

/** v6.2 ask schema (verified via TzKT entrypoint micheline introspection):
 *
 *   Pair token
 *        (Pair currency
 *              (Pair amount
 *                    (Pair editions
 *                          (Pair shares
 *                                (Pair start_time
 *                                      (Pair expiry_time
 *                                            (Pair referral_bonus condition)))))))
 *
 *   shares : map address nat (sorted Elt entries, basis-points denom 10000)
 *   currency : or fa12 (or fa2 tez) — tez = Right(Right Unit)
 */
const TEZ_CURRENCY = {
    prim: "Right",
    args: [{ prim: "Right", args: [{ prim: "Unit" }] }],
};
const NONE = { prim: "None" };

/** Royalty source for a relist. We preserve whatever shares the original
 *  ask carried so the artist keeps getting paid. `shares` is the on-chain
 *  shares from the source listing, normalized as [recipient, amountBpsStr]. */
export interface ObjktRelistInputs {
    listing: Listing;
    fa2: string;
    tokenId: string;
    editions: string;
    /** Royalty shares from the source listing — preserved verbatim. */
    sourceShares: Array<[recipient: string, amountBps: string]>;
    newPriceMutez: string;
    /** Optional tool tip — appended to shares map as one extra entry. */
    tip: { recipient: string; basisPoints: number } | null;
}

export function buildObjktCreateAskOp(input: ObjktRelistInputs): PreparedOp {
    const shares: Array<[string, string]> = input.sourceShares.map(
        ([r, a]) => [r, String(a)] as [string, string],
    );
    if (input.tip && input.tip.basisPoints > 0) {
        // If the tip recipient already appears in shares, add to it instead
        // of duplicating the key (Michelson map keys must be unique).
        const existing = shares.find(([r]) => r === input.tip!.recipient);
        if (existing) {
            // BigInt-safe addition — share amounts are nats and can in principle
            // be arbitrary precision. Avoid Number() coercion which would risk
            // NaN or precision loss on malformed/large source values.
            existing[1] = (BigInt(existing[1] || "0") + BigInt(input.tip.basisPoints)).toString();
        } else {
            shares.push([input.tip.recipient, String(input.tip.basisPoints)]);
        }
    }
    return {
        destination: OBJKT_TARGET,
        amount: "0",
        entrypoint: "ask",
        value: {
            prim: "Pair",
            args: [
                { prim: "Pair", args: [{ string: input.fa2 }, { int: String(input.tokenId) }] },
                {
                    prim: "Pair",
                    args: [
                        TEZ_CURRENCY,
                        {
                            prim: "Pair",
                            args: [
                                { int: String(input.newPriceMutez) },
                                {
                                    prim: "Pair",
                                    args: [
                                        { int: String(input.editions) },
                                        {
                                            prim: "Pair",
                                            args: [
                                                sharesMap(shares),
                                                {
                                                    prim: "Pair",
                                                    args: [
                                                        NONE, // start_time
                                                        {
                                                            prim: "Pair",
                                                            args: [
                                                                NONE, // expiry_time
                                                                {
                                                                    prim: "Pair",
                                                                    args: [
                                                                        { int: "0" }, // referral_bonus
                                                                        NONE,         // condition
                                                                    ],
                                                                },
                                                            ],
                                                        },
                                                    ],
                                                },
                                            ],
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

/** Michelson map literal — sorted Elt entries by packed address bytes.
 *
 *  Michelson `address` is packed as: 1-byte type tag + 1-byte sub-tag (for
 *  implicit accounts) + 20-byte hash. Implicit accounts (tz1/tz2/tz3/tz4) use
 *  tag 0x00 with sub-tags 0x00/0x01/0x02/0x03. Contracts (KT1) use tag 0x01.
 *  So in packed-byte order: tz1 < tz2 < tz3 < tz4 < KT1.
 *
 *  Within the same prefix, base58 alphabetical order coincides with the
 *  underlying hash byte order (the base58 alphabet is monotonic by digit
 *  value across digits → uppercase → lowercase), so plain string sort works.
 *
 *  Map keys MUST be sorted by Michelson byte order or the contract rejects
 *  the call as an unordered map. */
function addressSortKey(addr: string): string {
    if (addr.startsWith("tz1")) return `0${addr}`;
    if (addr.startsWith("tz2")) return `1${addr}`;
    if (addr.startsWith("tz3")) return `2${addr}`;
    if (addr.startsWith("tz4")) return `3${addr}`;
    if (addr.startsWith("KT1")) return `4${addr}`;
    return `9${addr}`; // unknown prefix — sort last, defensive
}

function sharesMap(entries: Array<[string, string]>): unknown {
    const sorted = [...entries].sort(([a], [b]) => {
        const ka = addressSortKey(a);
        const kb = addressSortKey(b);
        return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    return sorted.map(([addr, amount]) => ({
        prim: "Elt",
        args: [{ string: addr }, { int: String(amount) }],
    }));
}

// ---------------------------------------------------------------------------
// Source-listing storage fetch (per source contract bigmap)
// ---------------------------------------------------------------------------

const BIGMAP_BY_SOURCE: Record<string, number> = {
    [OBJKT_SOURCE_CONTRACTS.V1]:   5909,
    [OBJKT_SOURCE_CONTRACTS.V4]:   103258,
    [OBJKT_SOURCE_CONTRACTS.V6]:   574013,
    [OBJKT_SOURCE_CONTRACTS.V61]:  591024,
    [OBJKT_SOURCE_CONTRACTS.V62]:  684371,
    [OBJKT_SOURCE_CONTRACTS.FX1]:  649169,
    [OBJKT_SOURCE_CONTRACTS.FX11]: 718969,
};

export interface ObjktSourceListing {
    onchainId: string;
    marketplaceContract: string;
    fa2: string;
    tokenId: string;
    editions: string;
    /** Normalized shares from the source ask — used to preserve royalties on relist. */
    shares: Array<[string, string]>;
    currencyKind: "tez" | "fa12" | "fa2";
}

interface RawV4 {
    token: { address: string; token_id: string };
    editions: string;
    shares: Array<{ amount: string; recipient: string }>;
    currency: { tez?: object; fa12?: string; fa2?: object };
}
interface RawV6Map {
    token: { address: string; token_id: string };
    editions: string;
    shares: Record<string, string>;
    currency: { tez?: object; fa12?: string; fa2?: object };
}
interface RawV1 {
    fa2: string;
    objkt_id: string;
    artist: string;
    royalties: string;
}
interface RawFixedSale {
    fa2?: { address: string; token_id?: string };
    token?: { address: string; token_id: string };
}

function detectCurrency(c: { tez?: object; fa12?: string; fa2?: object } | undefined): ObjktSourceListing["currencyKind"] {
    if (!c) return "tez";
    if (c.tez !== undefined) return "tez";
    if (c.fa12 !== undefined) return "fa12";
    return "fa2";
}

function parseSource(contract: string, key: string, value: unknown): ObjktSourceListing | null {
    // V1: { fa2, objkt_id, artist, royalties, amount, creator, issuer }
    if (contract === OBJKT_SOURCE_CONTRACTS.V1) {
        const v = value as RawV1;
        if (!v?.fa2) return null;
        return {
            onchainId: key,
            marketplaceContract: contract,
            fa2: v.fa2,
            tokenId: v.objkt_id,
            editions: "1",
            // v1 has a single royalties nat. The "shares" we preserve = artist receives royalties/1000.
            // Convert to bps for the v6.2 target (royalties/1000 = pct, *100 = bps): bps = royalties * 10.
            // royalties is per-mille (1000-denom). bps (10000-denom) = royalties * 10.
            shares: v.artist && v.royalties
                ? [[v.artist, String(Number(v.royalties) * 10)]]
                : [],
            currencyKind: "tez",
        };
    }
    // V4: shares is a list of {recipient, amount}
    if (contract === OBJKT_SOURCE_CONTRACTS.V4) {
        const v = value as RawV4;
        if (!v?.token) return null;
        return {
            onchainId: key,
            marketplaceContract: contract,
            fa2: v.token.address,
            tokenId: v.token.token_id,
            editions: v.editions,
            shares: (v.shares ?? []).map((s) => [s.recipient, s.amount] as [string, string]),
            currencyKind: detectCurrency(v.currency),
        };
    }
    // V6 / V61 / V62: shares is a map
    if (
        contract === OBJKT_SOURCE_CONTRACTS.V6 ||
        contract === OBJKT_SOURCE_CONTRACTS.V61 ||
        contract === OBJKT_SOURCE_CONTRACTS.V62
    ) {
        const v = value as RawV6Map;
        if (!v?.token) return null;
        return {
            onchainId: key,
            marketplaceContract: contract,
            fa2: v.token.address,
            tokenId: v.token.token_id,
            editions: v.editions,
            shares: Object.entries(v.shares ?? {}).map(([a, b]) => [a, b] as [string, string]),
            currencyKind: detectCurrency(v.currency),
        };
    }
    // Fixed-pricing: opaque pricing_settings means we can't reconstruct a sensible relist
    // → fall through with empty shares, recreate uses the listing's name + price as best-effort.
    const v = value as RawFixedSale;
    const tokenAddr = v.fa2?.address ?? v.token?.address ?? "";
    const tokenId = v.fa2?.token_id ?? v.token?.token_id ?? "";
    if (!tokenAddr) return null;
    return {
        onchainId: key,
        marketplaceContract: contract,
        fa2: tokenAddr,
        tokenId: String(tokenId),
        editions: "1",
        shares: [],
        currencyKind: "tez",
    };
}

export async function fetchObjktSourceListings(
    refs: Array<{ marketplaceContract: string; onchainId: string }>,
): Promise<Map<string, ObjktSourceListing>> {
    const out = new Map<string, ObjktSourceListing>();
    const byContract = new Map<string, string[]>();
    for (const r of refs) {
        // Defensive filter — graphql `bigmap_key` is nullable; drop anything
        // null/empty so it never reaches the URL.
        if (r.onchainId === null || r.onchainId === undefined || String(r.onchainId).length === 0) continue;
        const arr = byContract.get(r.marketplaceContract) ?? [];
        arr.push(String(r.onchainId));
        byContract.set(r.marketplaceContract, arr);
    }
    for (const [contract, ids] of byContract) {
        const bigmap = BIGMAP_BY_SOURCE[contract];
        if (!bigmap) continue;
        for (let i = 0; i < ids.length; i += 50) {
            const chunk = ids.slice(i, i + 50);
            const rows = await fetchBigmapKeys(bigmap, chunk);
            for (const r of rows) {
                const parsed = parseSource(contract, r.key, r.value);
                if (parsed) out.set(`${contract}:${r.key}`, parsed);
            }
        }
    }
    return out;
}

/**
 * Bulletproof bigmap-key fetcher. TzKT's `key.in` filter rejects 0- or
 * 1-element CSVs with `400 "JSON array must contain at least two items."`,
 * so dispatch to `key.eq` for a single key and `key.in` for ≥2. Throws on
 * non-2xx so callers can surface a useful error.
 */
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
    if (!res.ok) {
        throw new Error(`tzkt: bigmap ${bigmap} lookup failed (${res.status})`);
    }
    return (await res.json()) as Array<{ key: string; value: unknown }>;
}
