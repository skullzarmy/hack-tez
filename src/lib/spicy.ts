/**
 * SpicySwap LP discovery and "break liquidity" op builder.
 *
 * SpicySwap is mainnet-only. All addresses + tzkt URLs here are mainnet —
 * do not parameterize by config. The page that uses this gates on
 * config.name === "mainnet" and explains the requirement to the user.
 *
 * How "remove liquidity" actually works on a Spicy pair:
 *   1. FA2 transfer your LP tokens FROM you TO the pair contract itself.
 *   2. Call `remove_liquidity(<your_address>)` on the same pair.
 *      Internally the pair reads its own LP balance, computes your share
 *      of token0/token1 reserves, runs `finalize_burn_liq`, and transfers
 *      both underlying tokens to <your_address>.
 *
 * If you call `remove_liquidity` without step 1 in the same op group, the
 * pair has 0 LP to burn and fails with "not enough burned". So coldmilk
 * always submits both ops together.
 */
import type { DAppClient, MichelineMichelsonV1Expression, TezosOperationType } from "@tezos-x/octez.connect-sdk";

/** SpicySwap Router v1 — originator of every Spicy pair contract on mainnet. */
export const SPICY_ROUTER = "KT1PwoZxyv4XkPEGnTqWYvjA1UYiPTgAGyqL";

/** Hardcoded mainnet TzKT — coldmilk is mainnet-only. */
export const SPICY_TZKT = "https://api.tzkt.io";

/** Known Spicy pair code hashes — v1 and v2 ("SpicyPro"). Kept for reference;
 *  the scanner filters by creator alone since both versions expose the same
 *  transfer + remove_liquidity flow. */
export const SPICY_PAIR_CODE_HASHES = [-1797525020, -1411290358] as const;

/** WTZ FA2 token contract (mainnet). token_id is 0. */
export const WTZ_FA2 = "KT1PnUZCp3u2KzWr93pn4DD7HAJnm3rWVrgn";

/** WTZ swap proxy — exposes unwrap(nat, address) and wrap(address). The proxy
 *  is the admin of the WTZ FA2 so unwrap calls just burn from the caller's
 *  balance directly; no operator setup or transfer-to-proxy required. */
export const WTZ_PROXY = "KT1SJPWa6g8CFGBhLk8aMnQZuFNFts1zTHvV";

const TZKT_IN_CHUNK_SIZE = 80;

export interface SpicyPair {
    address: string;
    alias: string;
}

export interface TokenRef {
    contract: string;
    tokenId: string;
    /** Symbol from FA2 metadata. Falls back to "?" if missing. */
    symbol: string;
    /** Decimals from FA2 metadata. 0 if missing — most FA1.2 / NFT tokens are 0. */
    decimals: number;
}

export interface SpicyPairDetails {
    token0: TokenRef;
    token1: TokenRef;
    /** Raw reserve nats from pair storage. */
    reserve0: string;
    reserve1: string;
    /** Total supply of LP tokens (raw nat) — used to compute redemption share. */
    totalSupply: string;
}

export interface SpicyLPBalance {
    pair: SpicyPair;
    /** Raw balance of the SSLP token (token_id 0). Always a positive nat as a string. */
    balance: string;
    /** Enriched pair details — undefined while loading or if enrichment failed. */
    details?: SpicyPairDetails;
}

interface TzktContractRow {
    address: string;
    alias?: string;
}

interface TzktTokenBalanceRow {
    token: {
        contract: { address: string; alias?: string };
        tokenId: string;
        totalSupply?: string;
    };
    balance: string;
}

interface TzktTokenRow {
    contract: { address: string };
    tokenId: string;
    metadata?: { symbol?: string; name?: string; decimals?: string };
}

interface TzktPairStorage {
    token0: { token_id: string; fa2_address: string };
    token1: { token_id: string; fa2_address: string };
    reserve0: string;
    reserve1: string;
}

/** Fetch every Spicy pair contract address (one network round-trip, cached on the module). */
let pairsCache: SpicyPair[] | null = null;
let pairsCachePromise: Promise<SpicyPair[]> | null = null;
export async function getAllSpicyPairs(): Promise<SpicyPair[]> {
    if (pairsCache) return pairsCache;
    if (pairsCachePromise) return pairsCachePromise;
    pairsCachePromise = (async () => {
        // Don't filter by codeHash — Spicy has two pair versions in production
        // (v1 codeHash -1797525020, "SpicyPro" v2 codeHash -1411290358) and
        // both expose the same transfer + remove_liquidity flow. Filtering by
        // creator alone catches all of them.
        const url =
            `${SPICY_TZKT}/v1/contracts` +
            `?creator=${SPICY_ROUTER}` +
            `&select=address,alias&limit=1000`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`spicy: failed to list pairs (${res.status})`);
        const rows = (await res.json()) as TzktContractRow[];
        pairsCache = rows.map((r) => ({ address: r.address, alias: r.alias ?? r.address }));
        return pairsCache;
    })();
    try {
        return await pairsCachePromise;
    } finally {
        pairsCachePromise = null;
    }
}

/** Find every Spicy LP position the address currently holds (token_id 0, balance > 0).
 *  Returned positions have `balance` only; call enrichSpicyLPs to add token/reserve details. */
export async function findUserSpicyLPs(address: string): Promise<Array<SpicyLPBalance & { totalSupply: string }>> {
    const pairs = await getAllSpicyPairs();
    const pairByAddress = new Map(pairs.map((p) => [p.address, p]));
    const addresses = pairs.map((p) => p.address);

    const results: Array<SpicyLPBalance & { totalSupply: string }> = [];
    for (let i = 0; i < addresses.length; i += TZKT_IN_CHUNK_SIZE) {
        const chunk = addresses.slice(i, i + TZKT_IN_CHUNK_SIZE);
        const url =
            `${SPICY_TZKT}/v1/tokens/balances` +
            `?account=${encodeURIComponent(address)}` +
            `&balance.gt=0` +
            `&token.contract.in=${chunk.join(",")}` +
            `&limit=${chunk.length}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`spicy: balance lookup failed (${res.status})`);
        const rows = (await res.json()) as TzktTokenBalanceRow[];
        for (const row of rows) {
            // Spicy pair LP is always token_id 0; ignore anything else just in case.
            if (row.token.tokenId !== "0") continue;
            const pair = pairByAddress.get(row.token.contract.address);
            if (!pair) continue;
            results.push({
                pair,
                balance: row.balance,
                totalSupply: row.token.totalSupply ?? "0",
            });
        }
    }
    results.sort((a, b) => a.pair.alias.localeCompare(b.pair.alias));
    return results;
}

/** Fetch pair storage + underlying token metadata for the given positions, in
 *  parallel. Mutates is non-destructive — returns a new array with `details`
 *  populated where possible. Failures per-pair are tolerated; that pair just
 *  has `details: undefined`. */
export async function enrichSpicyLPs(
    positions: Array<SpicyLPBalance & { totalSupply: string }>,
): Promise<SpicyLPBalance[]> {
    if (positions.length === 0) return positions;

    // Step 1: fetch storage for each pair in parallel.
    const storageResults = await Promise.all(
        positions.map(async (p) => {
            try {
                const res = await fetch(`${SPICY_TZKT}/v1/contracts/${p.pair.address}/storage`);
                if (!res.ok) return null;
                return (await res.json()) as TzktPairStorage;
            } catch {
                return null;
            }
        }),
    );

    // Step 2: collect unique (contract, tokenId) pairs across all underlying tokens.
    const tokenKeys = new Set<string>();
    for (const s of storageResults) {
        if (!s) continue;
        tokenKeys.add(`${s.token0.fa2_address}|${s.token0.token_id}`);
        tokenKeys.add(`${s.token1.fa2_address}|${s.token1.token_id}`);
    }

    // Step 3: batch-fetch metadata. Group token IDs by contract to minimize requests.
    const tokenMeta = new Map<string, TokenRef>();
    const byContract = new Map<string, Set<string>>();
    for (const key of tokenKeys) {
        const [contract, id] = key.split("|");
        if (!byContract.has(contract)) byContract.set(contract, new Set());
        byContract.get(contract)?.add(id);
    }
    await Promise.all(
        Array.from(byContract.entries()).map(async ([contract, ids]) => {
            try {
                const idList = Array.from(ids).join(",");
                const res = await fetch(
                    `${SPICY_TZKT}/v1/tokens?contract=${contract}&tokenId.in=${idList}&limit=${ids.size}`,
                );
                if (!res.ok) return;
                const rows = (await res.json()) as TzktTokenRow[];
                for (const r of rows) {
                    const key = `${r.contract.address}|${r.tokenId}`;
                    const decRaw = r.metadata?.decimals;
                    tokenMeta.set(key, {
                        contract: r.contract.address,
                        tokenId: r.tokenId,
                        symbol: r.metadata?.symbol ?? r.metadata?.name ?? "?",
                        decimals: decRaw ? Number.parseInt(decRaw, 10) || 0 : 0,
                    });
                }
            } catch {
                /* per-contract failure is tolerated */
            }
        }),
    );

    // Step 4: stitch storage + metadata back onto each position.
    return positions.map((p, i) => {
        const storage = storageResults[i];
        if (!storage) return p;
        const k0 = `${storage.token0.fa2_address}|${storage.token0.token_id}`;
        const k1 = `${storage.token1.fa2_address}|${storage.token1.token_id}`;
        const token0: TokenRef = tokenMeta.get(k0) ?? {
            contract: storage.token0.fa2_address,
            tokenId: storage.token0.token_id,
            symbol: "?",
            decimals: 0,
        };
        const token1: TokenRef = tokenMeta.get(k1) ?? {
            contract: storage.token1.fa2_address,
            tokenId: storage.token1.token_id,
            symbol: "?",
            decimals: 0,
        };
        return {
            ...p,
            details: {
                token0,
                token1,
                reserve0: storage.reserve0,
                reserve1: storage.reserve1,
                totalSupply: p.totalSupply,
            },
        };
    });
}

/** Compute the user's underlying token share when they burn `lpBalance` LP.
 *  Returns raw nats (not decimal-adjusted) as strings. Uses BigInt for precision. */
export function computeRedemption(
    lpBalance: string,
    details: SpicyPairDetails,
): { amount0: string; amount1: string } {
    try {
        const bal = BigInt(lpBalance);
        const supply = BigInt(details.totalSupply);
        if (supply === 0n) return { amount0: "0", amount1: "0" };
        const r0 = BigInt(details.reserve0);
        const r1 = BigInt(details.reserve1);
        return {
            amount0: ((bal * r0) / supply).toString(),
            amount1: ((bal * r1) / supply).toString(),
        };
    } catch {
        return { amount0: "0", amount1: "0" };
    }
}

export type Breakability =
    | { ok: true }
    /** reason "pending": details not loaded yet, breakability unknown.
     *  reason "dust": burn would pay out 0 on at least one side. */
    | { ok: false; reason: "pending" | "dust" };

/** Decide whether a position can actually be broken.
 *
 *  A Spicy pair's `finalize_burn_liq` rejects with `NOT_ENOUGH_BURNED` any burn
 *  that would transfer 0 tokens on a side. That happens when the LP balance is
 *  dust relative to the pool: `balance * reserve / totalSupply` floors to 0 on
 *  the smaller-reserve side. We can only tell once `details` are enriched; until
 *  then the answer is "pending". */
export function checkBreakable(pos: SpicyLPBalance): Breakability {
    if (!pos.details) return { ok: false, reason: "pending" };
    const { amount0, amount1 } = computeRedemption(pos.balance, pos.details);
    if (amount0 === "0" || amount1 === "0") return { ok: false, reason: "dust" };
    return { ok: true };
}

/** Map a raw chain/wallet error into something a user can act on. */
export function friendlyBreakError(raw: string): string {
    if (/NOT_ENOUGH_BURNED/i.test(raw)) {
        return "too small to break — this position redeems to zero on one side";
    }
    if (/UserAbort|Aborted|rejected|denied/i.test(raw)) return "signature cancelled";
    return raw;
}

/** Format a raw nat balance using the given token decimals (max 4 fraction digits). */
export function formatTokenAmount(raw: string, decimals: number, maxFractionDigits = 4): string {
    if (!/^\d+$/.test(raw)) return raw;
    if (decimals <= 0) return formatBalance(raw);
    const padded = raw.padStart(decimals + 1, "0");
    const whole = padded.slice(0, -decimals);
    const frac = padded.slice(-decimals).replace(/0+$/, "");
    const wholeFmt = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    if (!frac) return wholeFmt;
    return `${wholeFmt}.${frac.slice(0, maxFractionDigits)}`;
}

/** Group a raw integer string with thousands separators. Spicy LP is a raw nat;
 *  the on-chain token metadata's `decimals` field is unreliable so we don't use it. */
export function formatBalance(raw: string): string {
    if (!/^\d+$/.test(raw)) return raw;
    return raw.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Format a mutez-style nat as a tez decimal (6 places, trailing zeros trimmed).
 *  WTZ is 1:1 with tez at 6 decimals so this is the right formatter for it. */
export function formatTez(rawMutez: string): string {
    if (!/^\d+$/.test(rawMutez)) return rawMutez;
    const padded = rawMutez.padStart(7, "0");
    const whole = padded.slice(0, -6);
    const frac = padded.slice(-6).replace(/0+$/, "");
    return frac ? `${whole}.${frac}` : whole;
}

interface MichelineTransferTx {
    prim: "Pair";
    args: [
        { string: string },
        { prim: "Pair"; args: [{ int: string }, { int: string }] },
    ];
}

interface MichelineTransferEntry {
    prim: "Pair";
    args: [{ string: string }, MichelineTransferTx[]];
}

/** Build the two-op batch that breaks a single LP position. */
export function buildBreakLPOps(params: {
    pairAddress: string;
    /** Wallet that holds the LP and will receive the underlying tokens. */
    owner: string;
    /** Raw LP amount to burn (string of digits). */
    lpAmount: string;
}): Array<{
    kind: TezosOperationType.TRANSACTION;
    destination: string;
    amount: string;
    parameters: { entrypoint: string; value: MichelineMichelsonV1Expression };
}> {
    const { pairAddress, owner, lpAmount } = params;

    // FA2 transfer parameter:
    //   list (pair address (list (pair address (pair nat nat))))
    //   = [ Pair from_ [ Pair to_ (Pair token_id amount) ] ]
    const transferValue: MichelineTransferEntry[] = [
        {
            prim: "Pair",
            args: [
                { string: owner },
                [
                    {
                        prim: "Pair",
                        args: [
                            { string: pairAddress },
                            {
                                prim: "Pair",
                                args: [{ int: "0" }, { int: lpAmount }],
                            },
                        ],
                    },
                ],
            ],
        },
    ];

    return [
        {
            kind: "transaction" as TezosOperationType.TRANSACTION,
            destination: pairAddress,
            amount: "0",
            parameters: { entrypoint: "transfer", value: transferValue },
        },
        {
            kind: "transaction" as TezosOperationType.TRANSACTION,
            destination: pairAddress,
            amount: "0",
            parameters: {
                entrypoint: "remove_liquidity",
                value: { string: owner },
            },
        },
    ];
}

/** Fetch the connected wallet's WTZ balance (raw mutez-equivalent nat string).
 *  Returns "0" if no balance row exists. */
export async function getWTZBalance(address: string): Promise<string> {
    const url =
        `${SPICY_TZKT}/v1/tokens/balances` +
        `?account=${encodeURIComponent(address)}` +
        `&token.contract=${WTZ_FA2}` +
        `&token.tokenId=0` +
        `&limit=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`spicy: WTZ balance lookup failed (${res.status})`);
    const rows = (await res.json()) as TzktTokenBalanceRow[];
    return rows[0]?.balance ?? "0";
}

/** Submit an unwrap of the given WTZ amount to the given recipient. The proxy
 *  burns the WTZ from the caller's balance and sends raw tez to recipient. */
export async function submitUnwrapWTZ(
    client: DAppClient,
    recipient: string,
    amount: string,
): Promise<{ transactionHash: string }> {
    if (amount === "0" || amount === "") throw new Error("nothing to unwrap");
    const result = await client.requestOperation({
        operationDetails: [
            {
                kind: "transaction" as TezosOperationType.TRANSACTION,
                destination: WTZ_PROXY,
                amount: "0",
                parameters: {
                    entrypoint: "unwrap",
                    value: {
                        prim: "Pair",
                        args: [{ int: amount }, { string: recipient }],
                    },
                },
            },
        ],
    });
    return { transactionHash: (result as { transactionHash: string }).transactionHash };
}

/** Submit a break for one or more LP positions in a single op group. */
export async function submitBreakLPs(
    client: DAppClient,
    owner: string,
    positions: Array<{ pairAddress: string; lpAmount: string }>,
): Promise<{ transactionHash: string }> {
    if (positions.length === 0) throw new Error("nothing to break");
    const ops = positions.flatMap((p) =>
        buildBreakLPOps({ pairAddress: p.pairAddress, owner, lpAmount: p.lpAmount }),
    );
    const result = await client.requestOperation({ operationDetails: ops });
    return { transactionHash: (result as { transactionHash: string }).transactionHash };
}
