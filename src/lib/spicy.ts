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

/** All Spicy pair contracts share this code hash — useful as a cheap filter. */
export const SPICY_PAIR_CODE_HASH = -1797525020;

const TZKT_IN_CHUNK_SIZE = 80;

export interface SpicyPair {
    address: string;
    alias: string;
}

export interface SpicyLPBalance {
    pair: SpicyPair;
    /** Raw balance of the SSLP token (token_id 0). Always a positive nat as a string. */
    balance: string;
    /** SSLP token metadata decimals — for display formatting. */
    decimals: number;
}

interface TzktContractRow {
    address: string;
    alias?: string;
}

interface TzktTokenBalanceRow {
    token: {
        contract: { address: string; alias?: string };
        tokenId: string;
        metadata?: { name?: string; symbol?: string; decimals?: string };
    };
    balance: string;
}

/** Fetch every Spicy pair contract address (one network round-trip, cached on the module). */
let pairsCache: SpicyPair[] | null = null;
let pairsCachePromise: Promise<SpicyPair[]> | null = null;
export async function getAllSpicyPairs(): Promise<SpicyPair[]> {
    if (pairsCache) return pairsCache;
    if (pairsCachePromise) return pairsCachePromise;
    pairsCachePromise = (async () => {
        const url =
            `${SPICY_TZKT}/v1/contracts` +
            `?creator=${SPICY_ROUTER}` +
            `&codeHash=${SPICY_PAIR_CODE_HASH}` +
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

/** Find every Spicy LP position the address currently holds (token_id 0, balance > 0). */
export async function findUserSpicyLPs(address: string): Promise<SpicyLPBalance[]> {
    const pairs = await getAllSpicyPairs();
    const pairByAddress = new Map(pairs.map((p) => [p.address, p]));
    const addresses = pairs.map((p) => p.address);

    const results: SpicyLPBalance[] = [];
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
            const decRaw = row.token.metadata?.decimals;
            const decimals = decRaw ? Number.parseInt(decRaw, 10) || 0 : 0;
            results.push({ pair, balance: row.balance, decimals });
        }
    }
    results.sort((a, b) => a.pair.alias.localeCompare(b.pair.alias));
    return results;
}

/** Format a raw nat balance using the given decimals — display-only. */
export function formatBalance(raw: string, decimals: number, maxFractionDigits = 4): string {
    if (!/^\d+$/.test(raw)) return raw;
    if (decimals <= 0) return raw;
    const padded = raw.padStart(decimals + 1, "0");
    const whole = padded.slice(0, -decimals);
    const frac = padded.slice(-decimals).replace(/0+$/, "");
    if (!frac) return whole;
    return `${whole}.${frac.slice(0, maxFractionDigits)}`;
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
