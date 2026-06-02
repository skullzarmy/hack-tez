/**
 * Find and displace stuck Tezos operations.
 *
 * A "stuck" op is one a node's mempool holds for our address while no baker
 * will include it — usually because it (or one of its internal txs) is
 * underpriced. While it sits there the node's prefilter blocks any new op at
 * the same counter unless the replacement pays enough to displace it ("fee
 * replacement"). Different nodes have independent mempools, so a phantom on
 * one node doesn't pin you on another — but if your wallet's RPC is the
 * pinned one, every dApp going through it fails.
 *
 * Detection: poll multiple public RPCs' /chains/main/mempool/pending_operations
 * and filter to ops whose source matches our address.
 *
 * Displacement (best-effort): submit a 1-mutez self-transfer with explicit
 * fee ≥ required and ask the wallet to sign + inject. Wallets vary:
 *   - Kukai / Umami: usually honor explicit fee.
 *   - Temple: often re-estimates fee; user may need to manually bump fee in
 *     Temple's confirmation dialog before signing.
 * So treat this as a *try* — surface the required values to the user clearly.
 */
import type { DAppClient, TezosOperationType } from "@tezos-x/octez.connect-sdk";

export interface RpcTarget {
    label: string;
    /** Base URL — no trailing slash. */
    url: string;
}

/** Public mainnet RPCs we probe. Read endpoints (mempool, head) are accessible
 *  without auth on all of these. Some require auth for write endpoints — that's
 *  irrelevant here; we're read-only against these RPCs. */
export const MAINNET_RPCS: RpcTarget[] = [
    { label: "smartpy", url: "https://mainnet.smartpy.io" },
    { label: "tzkt", url: "https://rpc.tzkt.io/mainnet" },
    { label: "tcinfra", url: "https://prod.tcinfra.net/rpc/mainnet" },
    { label: "tzbeta", url: "https://rpc.tzbeta.net" },
];

export type StuckBucket =
    | "validated"
    | "refused"
    | "branch_refused"
    | "branch_delayed"
    | "outdated"
    | "unprocessed";

/** All mempool buckets we surface — an op for our address in ANY of these pins
 *  our counter. `validated` ops that linger (e.g. multi-op groups where internal
 *  txs have fee=0 — common 3route failure mode) are the most insidious because
 *  they look healthy to the node but bakers won't include them. */
const STUCK_BUCKETS: StuckBucket[] = [
    "validated",
    "refused",
    "branch_refused",
    "branch_delayed",
    "outdated",
    "unprocessed",
];

export interface StuckOpContent {
    kind?: string;
    source?: string;
    counter?: string;
    fee?: string;
    gas_limit?: string;
    storage_limit?: string;
    destination?: string;
    amount?: string;
    parameters?: { entrypoint?: string; value?: unknown };
}

export interface StuckOp {
    rpc: RpcTarget;
    bucket: StuckBucket;
    hash: string;
    branch?: string;
    /** Operation contents — usually 1 entry but op groups can have more. */
    contents: StuckOpContent[];
    /** Node-reported error array, if any. */
    error?: Array<{ kind?: string; id?: string; msg?: string }>;
    /** Convenience: the counter of the first content with our source address. */
    counter: string;
    /** Convenience: sum of fees across the op group. */
    totalFeeMutez: number;
    /** Convenience: human reason if known. */
    reason: string;
    /** True iff this op's counter is ≤ the current on-chain counter — it's
     *  already been displaced and is just mempool residue. Not actionable. */
    isDead: boolean;
}

interface RawMempoolOp {
    hash: string;
    branch?: string;
    contents: StuckOpContent[];
    error?: Array<{ kind?: string; id?: string; msg?: string }>;
}

type RawMempool = Partial<Record<StuckBucket | "applied", RawMempoolOp[]>>;

function summarizeReason(err?: Array<{ id?: string; msg?: string }>): string {
    if (!err || err.length === 0) return "no reason given";
    // Find the most informative entry — prefer one with msg, else the last id.
    const withMsg = err.find((e) => e.msg && e.msg.trim().length > 0);
    if (withMsg?.msg) {
        const m = withMsg.msg.match(/total fee of at least (\d+)\s*mutez/i);
        if (m) return `fee replacement needs ≥${m[1]} mutez`;
        return withMsg.msg.split("\n")[0].slice(0, 120);
    }
    const id = err[err.length - 1].id ?? err[0].id;
    if (!id) return "unknown";
    // proto.024-PtTALLiN.prefilter.fees_too_low → fees_too_low
    return id.replace(/^proto\.[^.]+\./, "").replace(/^prefilter\./, "");
}

export interface RpcScanResult {
    rpc: RpcTarget;
    ok: boolean;
    error?: string;
    stuck: StuckOp[];
}

/** Fetch and filter one RPC's mempool for our address. */
async function scanOneRpc(
    rpc: RpcTarget,
    address: string,
    onchainCounter: bigint | null,
    signal?: AbortSignal,
): Promise<RpcScanResult> {
    try {
        const res = await fetch(`${rpc.url}/chains/main/mempool/pending_operations`, { signal });
        if (!res.ok) return { rpc, ok: false, error: `HTTP ${res.status}`, stuck: [] };
        const mp = (await res.json()) as RawMempool;
        const stuck: StuckOp[] = [];
        for (const bucket of STUCK_BUCKETS) {
            const ops = mp[bucket] ?? [];
            for (const op of ops) {
                const match = op.contents.find((c) => c.source === address);
                if (!match) continue;
                const totalFee = op.contents.reduce((acc, c) => acc + Number.parseInt(c.fee ?? "0", 10), 0);
                const counterStr = match.counter ?? "?";
                // An op whose counter has been used on-chain is dead — the chain
                // has moved past it and it can never apply. It's residue.
                const isDead =
                    onchainCounter !== null &&
                    /^\d+$/.test(counterStr) &&
                    BigInt(counterStr) <= onchainCounter;
                stuck.push({
                    rpc,
                    bucket,
                    hash: op.hash,
                    branch: op.branch,
                    contents: op.contents,
                    error: op.error,
                    counter: counterStr,
                    totalFeeMutez: totalFee,
                    reason: summarizeReason(op.error),
                    isDead,
                });
            }
        }
        return { rpc, ok: true, stuck };
    } catch (err) {
        return { rpc, ok: false, error: err instanceof Error ? err.message : "scan failed", stuck: [] };
    }
}

/** Scan every configured RPC's mempool in parallel for stuck ops at this address.
 *  Also fetches the on-chain counter so ops can be flagged dead-vs-live. */
export async function scanForStuckOps(address: string, signal?: AbortSignal): Promise<RpcScanResult[]> {
    // Counter is account-level chain state, identical across RPCs. Fetch once
    // from the first RPC that responds (tzkt is reliable in-browser).
    let onchainCounter: bigint | null = null;
    for (const rpc of MAINNET_RPCS) {
        const c = await getOnchainCounter(address, rpc.url, signal);
        if (c && /^\d+$/.test(c)) {
            onchainCounter = BigInt(c);
            break;
        }
    }
    return Promise.all(MAINNET_RPCS.map((rpc) => scanOneRpc(rpc, address, onchainCounter, signal)));
}

/** Fetch the latest *applied* counter for an address from a given RPC.
 *  This is the counter from chain state — i.e. the next op should use this + 1. */
export async function getOnchainCounter(address: string, rpcUrl: string, signal?: AbortSignal): Promise<string | null> {
    try {
        const res = await fetch(
            `${rpcUrl}/chains/main/blocks/head/context/contracts/${encodeURIComponent(address)}/counter`,
            { signal },
        );
        if (!res.ok) return null;
        const txt = (await res.text()).trim();
        // Strip surrounding quotes if returned as a JSON string.
        return txt.replace(/^"|"$/g, "");
    } catch {
        return null;
    }
}

/** Build a near-no-op (1 mutez self-transfer) with explicit fee.
 *
 *  Amount is 1 mutez, not 0 — the protocol refuses 0-amount transactions to a
 *  tz1 with no entrypoint call (`contract.empty_transaction`). 1 mutez to self
 *  is a no-op that costs nothing and satisfies the non-empty rule.
 *
 *  We deliberately do NOT set counter — most wallets (notably Temple) recompute
 *  counter from chain state and ignore dApp-provided values. By letting the
 *  wallet pick counter and only forcing the fee, we maximize the chance the
 *  op lands at the contested counter slot with enough fee to displace the
 *  phantom. The wallet's natural choice (on-chain counter + 1) is the same
 *  slot the phantom occupies. */
export async function submitDisplaceOp(
    client: DAppClient,
    params: {
        owner: string;
        feeMutez: number;
        gasLimit?: number;
        storageLimit?: number;
    },
): Promise<{ transactionHash: string }> {
    const result = await client.requestOperation({
        operationDetails: [
            {
                kind: "transaction" as TezosOperationType.TRANSACTION,
                destination: params.owner,
                amount: "1",
                fee: String(params.feeMutez),
                gas_limit: String(params.gasLimit ?? 1000),
                storage_limit: String(params.storageLimit ?? 0),
            },
        ],
    });
    return { transactionHash: (result as { transactionHash: string }).transactionHash };
}

/** Parse the "would need a total fee of at least N mutez" hint out of an
 *  injection error and return N, or null if not present. */
export function parseRequiredReplacementFee(errMsg: string): number | null {
    const m = errMsg.match(/total fee of at least (\d+)\s*mutez/i);
    return m ? Number.parseInt(m[1], 10) : null;
}

/** Format a mutez int as a tez decimal (6 places, trailing zeros trimmed). */
export function formatTezFromMutez(mutez: number): string {
    if (!Number.isFinite(mutez) || mutez < 0) return String(mutez);
    const s = String(Math.floor(mutez));
    const padded = s.padStart(7, "0");
    const whole = padded.slice(0, -6);
    const frac = padded.slice(-6).replace(/0+$/, "");
    return frac ? `${whole}.${frac}` : whole;
}
