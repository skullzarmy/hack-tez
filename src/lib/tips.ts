/**
 * Tip jar — token metadata lookup and transfer op building.
 *
 * hack.tez is never in the path of a tip. We resolve the recipient's address
 * from their TED record, build the transfer operation locally, and hand it to
 * the tipper's own wallet. No fee, no intermediary contract, no custody.
 *
 * Two fungible standards are supported:
 *   FA1.2 (TZIP-7)  transfer :: (pair %from address (pair %to address (nat %value)))
 *   FA2   (TZIP-12) transfer :: list (pair %from_ address (list %txs (pair %to_ address (pair %token_id nat (nat %amount)))))
 *
 * Amounts are stored and displayed in human units (e.g. "1.5") and converted
 * to raw on-chain units with the token's TZIP-12 `decimals` only at send time,
 * so a profile stays readable and decimals-agnostic.
 */
import type {
    DAppClient,
    MichelineMichelsonV1Expression,
    TezosOperationType,
} from "@tezos-x/octez.connect-sdk";
import config from "../config/tezos";
import type { FaStandard, TipToken } from "../types/profile";
import { isContractAddress } from "../types/profile";

/** Tez has 6 decimals — 1 tez = 1_000_000 mutez. */
export const TEZ_DECIMALS = 6;

// ── Unit conversion ──────────────────────────────────────────────────

/**
 * Display units → raw integer units, exactly (no float math).
 * Returns null if `amount` is not a positive decimal that fits `decimals`.
 */
export function toRawUnits(amount: string, decimals: number): string | null {
    const t = amount.trim();
    if (!/^\d+(\.\d+)?$/.test(t)) return null;

    const [whole, frac = ""] = t.split(".");
    if (frac.length > decimals) return null;

    const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
    const raw = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || "0");
    if (raw <= 0n) return null;
    return raw.toString();
}

// ── Token metadata lookup ────────────────────────────────────────────

interface TzktToken {
    contract?: { address?: string };
    tokenId?: string;
    standard?: string;
    totalSupply?: string;
    metadata?: {
        name?: string;
        symbol?: string;
        decimals?: string | number;
        thumbnailUri?: string;
        icon?: string;
        displayUri?: string;
        artifactUri?: string;
    };
}

export class TokenLookupError extends Error {}

function firstImage(meta: TzktToken["metadata"]): string | undefined {
    const raw = meta?.thumbnailUri || meta?.icon || meta?.displayUri;
    if (typeof raw !== "string") return undefined;
    const t = raw.trim();
    if (!t) return undefined;
    if (!t.startsWith("ipfs://") && !t.startsWith("https://")) return undefined;
    return t.slice(0, 200);
}

/**
 * Resolve a token's TZIP-12/16 metadata from the indexer.
 *
 * Throws TokenLookupError with a user-facing message when the token is not
 * indexed, is not a supported FA standard, or looks like an NFT rather than a
 * fungible token.
 */
export async function lookupToken(
    contract: string,
    tokenId: string,
): Promise<TipToken> {
    const address = contract.trim();
    if (!isContractAddress(address)) {
        throw new TokenLookupError("Not a valid contract address (must start with KT1).");
    }
    const id = tokenId.trim() || "0";
    if (!/^\d+$/.test(id)) {
        throw new TokenLookupError("Token ID must be a whole number.");
    }

    const url =
        `${config.tzktApi}/v1/tokens` +
        `?contract=${encodeURIComponent(address)}&tokenId=${encodeURIComponent(id)}&limit=1`;

    let rows: TzktToken[];
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        rows = await res.json();
    } catch {
        throw new TokenLookupError("Could not reach the indexer. Try again.");
    }

    const row = Array.isArray(rows) ? rows[0] : undefined;
    if (!row) {
        throw new TokenLookupError(
            `No token ${id} found at that contract on ${config.name}.`,
        );
    }

    const standard = row.standard;
    if (standard !== "fa1.2" && standard !== "fa2") {
        throw new TokenLookupError(
            "Only FA1.2 (TZIP-7) and FA2 (TZIP-12) tokens are supported.",
        );
    }

    const meta = row.metadata;
    const decimalsRaw = meta?.decimals;
    const decimals =
        typeof decimalsRaw === "number"
            ? decimalsRaw
            : typeof decimalsRaw === "string" && /^\d+$/.test(decimalsRaw)
              ? Number(decimalsRaw)
              : null;

    if (decimals === null || decimals > 30) {
        throw new TokenLookupError(
            "This token has no readable TZIP-12 decimals — it can't be used for tips.",
        );
    }

    // Fungibility check: decimals 0 + supply 1 is the canonical NFT shape.
    if (decimals === 0 && row.totalSupply === "1") {
        throw new TokenLookupError(
            "That looks like an NFT, not a fungible token. Tips need a fungible FA token.",
        );
    }

    const symbol = (meta?.symbol || meta?.name || "").trim().slice(0, 16);
    if (!symbol) {
        throw new TokenLookupError("This token has no symbol or name in its metadata.");
    }

    const token: TipToken = {
        contract: address,
        tokenId: standard === "fa1.2" ? "0" : id,
        standard: standard as FaStandard,
        symbol,
        decimals,
    };
    const name = meta?.name?.trim();
    if (name && name !== symbol) token.name = name.slice(0, 60);
    const thumb = firstImage(meta);
    if (thumb) token.thumbnail = thumb;

    return token;
}

// ── Operation building ───────────────────────────────────────────────

export interface TipOperation {
    kind: TezosOperationType.TRANSACTION;
    destination: string;
    amount: string;
    parameters?: {
        entrypoint: string;
        value: MichelineMichelsonV1Expression;
    };
}

/**
 * Build the transfer op for a tip.
 *
 * `amount` is in display units. `token` omitted means a plain tez transfer.
 * `from` is the tipper's address (required by both FA standards).
 */
export function buildTipOperation(params: {
    from: string;
    to: string;
    amount: string;
    token?: TipToken;
}): TipOperation {
    const { from, to, amount, token } = params;

    if (!token) {
        const mutez = toRawUnits(amount, TEZ_DECIMALS);
        if (!mutez) throw new Error("Invalid tez amount.");
        return {
            kind: "transaction" as TezosOperationType.TRANSACTION,
            destination: to,
            amount: mutez,
        };
    }

    const raw = toRawUnits(amount, token.decimals);
    if (!raw) throw new Error(`Invalid ${token.symbol} amount.`);

    if (token.standard === "fa1.2") {
        // Pair from (Pair to value)
        return {
            kind: "transaction" as TezosOperationType.TRANSACTION,
            destination: token.contract,
            amount: "0",
            parameters: {
                entrypoint: "transfer",
                value: {
                    prim: "Pair",
                    args: [
                        { string: from },
                        { prim: "Pair", args: [{ string: to }, { int: raw }] },
                    ],
                },
            },
        };
    }

    // FA2: [ Pair from_ [ Pair to_ (Pair token_id amount) ] ]
    return {
        kind: "transaction" as TezosOperationType.TRANSACTION,
        destination: token.contract,
        amount: "0",
        parameters: {
            entrypoint: "transfer",
            value: [
                {
                    prim: "Pair",
                    args: [
                        { string: from },
                        [
                            {
                                prim: "Pair",
                                args: [
                                    { string: to },
                                    {
                                        prim: "Pair",
                                        args: [{ int: token.tokenId }, { int: raw }],
                                    },
                                ],
                            },
                        ],
                    ],
                },
            ],
        },
    };
}

/** Prepare and submit the tip for the tipper to sign. Returns the op hash. */
export async function sendTip(
    client: DAppClient,
    params: { from: string; to: string; amount: string; token?: TipToken },
): Promise<string> {
    const op = buildTipOperation(params);
    const result = await client.requestOperation({ operationDetails: [op] });
    return (result as { transactionHash: string }).transactionHash;
}

// ── Counters ─────────────────────────────────────────────────────────

export interface TipAssetTotal {
    asset: string;
    symbol: string;
    /** Display units, e.g. "42.5" */
    total: string;
}

export interface TipCounters {
    count: number;
    totals: TipAssetTotal[];
    projects: Array<{ slug: string; count: number; totals: TipAssetTotal[] }>;
}

/**
 * Report a tip so it lands in the public counters.
 *
 * Waits for the operation to be indexed first — the server verifies it against
 * TzKT and will reject anything it can't see yet. Fire-and-forget on purpose:
 * a counter is not worth blocking or interrupting the share flow for, and the
 * server dedupes on the op hash so a retry is harmless.
 */
export async function reportTip(params: {
    opHash: string;
    label: string;
    projectSlug?: string;
}): Promise<void> {
    try {
        const { waitForOperation } = await import("./contract");
        await waitForOperation(params.opHash);
        await fetch("/api/v1/tips/report", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                opHash: params.opHash,
                label: params.label,
                project: params.projectSlug,
            }),
        });
    } catch {
        // Counters are best-effort — never surface this to the tipper.
    }
}

/** Read a domain's public tip counters. Returns null if unavailable. */
export async function getTipCounters(label: string): Promise<TipCounters | null> {
    try {
        const res = await fetch(`/api/v1/tips/${encodeURIComponent(label)}`);
        if (!res.ok) return null;
        const body: { data?: TipCounters } = await res.json();
        if (!body.data) return null;
        return {
            count: body.data.count ?? 0,
            totals: body.data.totals ?? [],
            projects: body.data.projects ?? [],
        };
    } catch {
        return null;
    }
}

/** Explorer link for a submitted tip — the TzKT UI host for the active network. */
export function opExplorerUrl(opHash: string): string {
    // config.tzktApi is the REST host (api.tzkt.io); the UI lives on the same
    // domain without the `api.` prefix.
    const uiHost = config.tzktApi.replace("://api.", "://");
    return `${uiHost}/${opHash}`;
}
