/**
 * ICO Commitments library for Tezos mainnet.
 * Interfaces, data fetching from TzKT v1 API, client-side caching,
 * fund flow analysis (stayed / to exchange / to other wallets),
 * USD & EUR quotes at time of claim, and direct Tezos node RPC verification.
 */

const TZKT_API = "https://api.tzkt.io/v1";
export const DEFAULT_MAINNET_RPC = "https://rpc.tzkt.io/mainnet";

export const EXCHANGE_REGEX =
    /\b(binance|coinbase|kraken|okx|okex|gate\.io|kucoin|bitfinex|huobi|htx|bybit|mexc|mxc|upbit|crypto\.com|bithumb|gemini|bitstamp|bitrue|poloniex)\b/i;

export interface OutgoingTransfer {
    amountMutez: number;
    amountXtz: number;
    targetAddress: string;
    targetAlias?: string;
    isExchange: boolean;
    exchangeName?: string;
    hash: string;
    timestamp: string;
}

export interface IcoCommitment {
    address: string;
    balance: number;
    activated: boolean;
    activationLevel?: number;
    activationTime?: string;
    activatedAccount?: { address: string };
    opHash?: string;
    quote?: { usd?: number; eur?: number };
    currentBalance?: number;
    toExchange?: number;
    exchangeName?: string;
    toWallet?: number;
    topRecipient?: string;
    disposition?: "stayed" | "exchange" | "wallet" | "split";
}

export interface IcoStats {
    totalCount: number;
    claimedCount: number;
    unclaimedCount: number;
    unclaimedMutez: bigint;
    unclaimedXtz: number;
    over10kCount: number;
}

export type CheckVerdictStatus = "activation" | "unclaimed" | "not_ico" | "invalid";

export interface IcoCheckResult {
    status: CheckVerdictStatus;
    verdict: string;
    explanation: string;
    input: string;
    detectedType: "operation" | "account" | "blinded" | "other";
    amountMutez?: number;
    amountXtz?: number;
    date?: string;
    level?: number;
    blindedAddress?: string;
    accountAddress?: string;
    opHash?: string;
    tzktUrl?: string;
    opType?: string;
    quote?: { usd?: number; eur?: number };
    currentBalanceMutez?: number;
    currentBalanceXtz?: number;
    toExchangeMutez?: number;
    toExchangeXtz?: number;
    exchangeName?: string;
    toWalletMutez?: number;
    toWalletXtz?: number;
    outgoingTransfers?: OutgoingTransfer[];
}

export interface NodeRpcVerification {
    rpcUrl: string;
    headLevel: number;
    headHash: string;
    headTime: string;
    btz1: string;
    commitmentExists: boolean;
    commitmentMutez?: string;
    commitmentXtz?: number;
    tz1?: string;
    tz1BalanceMutez?: string;
    tz1BalanceXtz?: number;
    error?: string;
}

// Module-level cache for unclaimed commitments to avoid re-fetching 390KB on tab switches.
let cachedUnclaimed: IcoCommitment[] | null = null;
let cachedStats: IcoStats | null = null;

/**
 * Format mutez (1e-6 XTZ) into a clean, human-friendly XTZ string.
 */
export function formatXtz(mutez: number | bigint | string, maxDecimals = 2): string {
    const rawBig = typeof mutez === "string" ? BigInt(mutez || "0") : mutez;
    const xtz = typeof rawBig === "bigint" ? Number(rawBig) / 1e6 : rawBig / 1e6;
    return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: maxDecimals,
    }).format(xtz);
}

/**
 * Format fiat amounts (USD or EUR).
 */
export function formatFiat(amount: number, currency: "USD" | "EUR"): string {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
}

/**
 * Format integer numbers with standard comma separators.
 */
export function formatNumber(n: number | bigint | string): string {
    const val = typeof n === "string" ? BigInt(n || "0") : n;
    return new Intl.NumberFormat("en-US").format(val);
}

/**
 * Format ISO date string into readable UTC timestamp.
 */
export function formatDate(isoString?: string): string {
    if (!isoString) return "";
    try {
        const d = new Date(isoString);
        return d.toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "UTC",
            timeZoneName: "short",
        });
    } catch {
        return isoString;
    }
}

/**
 * Shorten an address or hash for compact display.
 */
export function shortAddress(addr: string, head = 8, tail = 6): string {
    if (!addr || addr.length <= head + tail) return addr;
    return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export const KNOWN_EXCHANGE_ADDRESSES: Record<string, string> = {
    // Binance
    tz2WDATNYnp7FdsmuZDYSidioZqeoLNZqXvE: "Binance",
    tz1ch7nvDDAchbAPfTio3yBsdvN1SZJZj1wY: "Binance",
    tz2HuFb9Pk2xBLEr7qawQ9JxU7xyNQix82CD: "Binance",
    tz2Ex1GRf2C8k1jXPiyxrwXqWishfePKKMLf: "Binance",
    tz1YfmputBQz6zku8HJV22XPrPZimmYYU1Pw: "Binance",
    tz1S8MNvuFEUsWgjHvi3AxibRBf388NhT1q2: "Binance",
    tz1SiPXX4MYGNJNDsRc7n8hkvUqFzg8xqF9m: "Binance",
    // Coinbase
    tz1TmBz5CkiMrrcpxATTg1nDtd1CUoBd17DC: "Coinbase",
    tz1NcoDFXMAfB26mpBhVrdSHmppyTeccT6Fi: "Coinbase",
    tz1Z7eWGw18LqUgRqmDqNZFQx7f8GEHXRfT8: "Coinbase",
    tz1bDhCGNZLQw1QXgf6MCzo6EtAVSGkqEB11: "Coinbase",
    tz1MXjdb684ByEP5qUn5J7EMub7Sr8eBziDe: "Coinbase",
    tz1irJKkXS2DBWkU1NnmFQx1c1L7pbGg4yhk: "Coinbase",
    tz1ZM7q2CPKEiJ1wuv2TeCkR12t2eiwWqe6F: "Coinbase",
    // Kraken
    tz1bDXD6nNSrebqmAnnKKwnX1QdePSMCj4MX: "Kraken",
    tz1NH4A2kRyFQUYhyi9aL8jrrySQUrCgNsX9: "Kraken",
    tz1YpWsMwc4gSyjtxEF3JbmN6YrGiDidaSmg: "Kraken",
    tz1cgJLxcS8ZTgq5dXPtojJJR7Bp8fKDyxPK: "Kraken",
    tz1e9ZH87proooFwLidjvE8fhusWfeDf3bgk: "Kraken",
    tz1RCFbB9GpALpsZtu6J58sb74dm8qe6XBzv: "Kraken",
    // OKX
    tz1bP2D7nvbmpf8N9gPqgpFRirsDL4syNTig: "OKX",
    tz1RjoHc98dBoqaH2jawF62XNKh7YsHwbkEv: "OKX",
    tz1UuQ4HWDu3ALNRgAq94dX9MhqhQhnuY3gC: "OKX",
    // Gate.io
    tz1hjem5Rpf4KAVbwMLJet75TDb8HjAKnTYk: "Gate.io",
    tz1NpWrAyDL9k2Lmnyxcgr9xuJakbBxdq7FB: "Gate.io",
    // Bybit
    tz1PpZctTPYj3GjY1B9wtWJh4hgd3XMo1t3R: "Bybit",
    // MEXC
    tz1fWQgef75HrhvpcmPr4VKKhe3SDLGGKjts: "MEXC",
    tz1UaicmU7G4HSo3NBDUNqkeuHGMPtYWK52Y: "MEXC",
    // Upbit
    tz1cYfMsbsGhxPqDovmaQHDByTeqiRTygEpc: "Upbit",
    tz1VoBhbndhXrPTGgPtA6xHza9LnVPC8x6mV: "Upbit",
    tz1Zt3uRxGFF7MyJUhVEFa4iGrc6tqfG8o7Y: "Upbit",
    tz1beW9AVJjE9QpTGYVPdtZCF5w1NPknMJ3T: "Upbit",
    // Crypto.com
    tz1azZRMCfzLRjbuJFZkTRv9mDTgaEYZxYfD: "Crypto.com",
    tz1RM5vXeUmastvs1H7pJrs7fe21rMHyKYN9: "Crypto.com",
    tz1ZQqRYMAwswy3pHSrpCoAyFin9wvk9togY: "Crypto.com",
    tz1WyndeaAx36WExobV9hBknyoCn89D3HVWT: "Crypto.com",
    tz1Pm31zkj5tryYwhuqE7hhzYnULzrA5g5cf: "Crypto.com",
    // Huobi
    tz1ZsK9mPA8XwUSw5kNqoJG3pXJ2f: "Huobi",
    // Bithumb
    tz1MqUjLpkCXMXMqg5A7KNWYaL98Ysm8qnZ9: "Bithumb",
};

/**
 * Extract clean exchange name from TzKT alias or known exchange address.
 */
export function extractExchangeName(
    alias?: string | null,
    address?: string | null,
): string | undefined {
    if (address && KNOWN_EXCHANGE_ADDRESSES[address]) {
        return KNOWN_EXCHANGE_ADDRESSES[address];
    }
    if (!alias) return undefined;
    const m = alias.match(EXCHANGE_REGEX);
    if (!m) return undefined;
    const raw = m[0].toLowerCase();
    if (raw.includes("binance")) return "Binance";
    if (raw.includes("coinbase")) return "Coinbase";
    if (raw.includes("kraken")) return "Kraken";
    if (raw.includes("okx") || raw.includes("okex")) return "OKX";
    if (raw.includes("gate")) return "Gate.io";
    if (raw.includes("kucoin")) return "KuCoin";
    if (raw.includes("bitfinex")) return "Bitfinex";
    if (raw.includes("huobi") || raw.includes("htx")) return "Huobi";
    if (raw.includes("bybit")) return "Bybit";
    if (raw.includes("mexc") || raw.includes("mxc")) return "MEXC";
    if (raw.includes("upbit")) return "Upbit";
    if (raw.includes("crypto.com")) return "Crypto.com";
    if (raw.includes("bithumb")) return "Bithumb";
    if (raw.includes("gemini")) return "Gemini";
    if (raw.includes("bitstamp")) return "Bitstamp";
    if (raw.includes("poloniex")) return "Poloniex";
    return alias;
}

/**
 * Detect input type by prefix:
 * - o... : operation hash
 * - tz1... : account address
 * - btz1... : blinded address
 * - other : other address or unknown
 */
export function detectInputType(raw: string): "operation" | "account" | "blinded" | "other" {
    const val = raw.trim();
    if (val.startsWith("btz1")) return "blinded";
    if (val.startsWith("tz1")) return "account";
    if (val.startsWith("o") && val.length >= 50 && val.length <= 54) return "operation";
    return "other";
}

/**
 * Fetch total counts and calculate summary metrics.
 */
export async function fetchIcoStats(): Promise<{ stats: IcoStats; unclaimed: IcoCommitment[] }> {
    if (cachedStats && cachedUnclaimed) {
        return { stats: cachedStats, unclaimed: cachedUnclaimed };
    }

    const [totalRes, claimedRes, unclaimedRes, unclaimedListRes] = await Promise.all([
        fetch(`${TZKT_API}/commitments/count`),
        fetch(`${TZKT_API}/commitments/count?activated=true`),
        fetch(`${TZKT_API}/commitments/count?activated=false`),
        fetch(`${TZKT_API}/commitments?activated=false&limit=10000`),
    ]);

    if (!totalRes.ok || !claimedRes.ok || !unclaimedRes.ok || !unclaimedListRes.ok) {
        throw new Error("Failed to load ICO commitment statistics from TzKT");
    }

    const totalCount = Number(await totalRes.text());
    const claimedCount = Number(await claimedRes.text());
    const unclaimedCount = Number(await unclaimedRes.text());
    const unclaimed: IcoCommitment[] = await unclaimedListRes.json();

    let unclaimedMutez = 0n;
    let over10kCount = 0;
    const thresholdMutez = 10_000_000_000n; // 10,000 XTZ in mutez

    for (const item of unclaimed) {
        const bal = BigInt(item.balance);
        unclaimedMutez += bal;
        if (bal >= thresholdMutez) {
            over10kCount++;
        }
    }

    const stats: IcoStats = {
        totalCount,
        claimedCount,
        unclaimedCount,
        unclaimedMutez,
        unclaimedXtz: Number(unclaimedMutez / 1_000_000n),
        over10kCount,
    };

    cachedStats = stats;
    cachedUnclaimed = unclaimed;

    return { stats, unclaimed };
}

interface RawActivationOp {
    type: string;
    id: number;
    level: number;
    timestamp: string;
    hash: string;
    account: { address: string };
    balance: number;
    quote?: { usd?: number; eur?: number };
}

interface RawAccountSummary {
    address: string;
    balance: number;
    numTransactions: number;
}

interface RawTx {
    sender: { address: string };
    target?: { address: string; alias?: string | null };
    amount: number;
    hash: string;
    timestamp: string;
}

/**
 * Fetch recent activations ordered newest first by level, enriched with:
 * - USD and EUR quote at the time of claim
 * - Current account balance (Stayed)
 * - Outgoing amount to major exchanges (Binance, Coinbase, Kraken, etc.)
 * - Outgoing amount to other private wallets
 */
export async function fetchRecentActivations(limit = 25): Promise<IcoCommitment[]> {
    // 1. Fetch newest activation operations with USD & EUR quotes
    const opsRes = await fetch(
        `${TZKT_API}/operations/activations?quote=usd,eur&sort.desc=level&limit=${limit}`,
    );
    if (!opsRes.ok) {
        throw new Error("Failed to fetch recent activations from TzKT");
    }
    const ops: RawActivationOp[] = await opsRes.json();
    if (ops.length === 0) return [];

    const levels = ops.map((o) => o.level);
    const addrs = ops.map((o) => o.account.address);

    // 2. Fetch commitments (for btz1) and current balances
    const [comsRes, accsRes] = await Promise.all([
        fetch(`${TZKT_API}/commitments?activationLevel.in=${levels.join(",")}`),
        fetch(`${TZKT_API}/accounts?address.in=${addrs.join(",")}&select=address,balance,numTransactions`),
    ]);

    const coms: IcoCommitment[] = comsRes.ok ? await comsRes.json() : [];
    const accs: RawAccountSummary[] = accsRes.ok ? await accsRes.json() : [];

    // Filter accounts that have outgoing transactions
    const activeAddrs = accs.filter((a) => a.numTransactions > 0).map((a) => a.address);

    // Fetch outgoing transactions in small chunks of 4 to prevent TzKT 504 Gateway Timeout
    const txMap = new Map<string, RawTx[]>();
    const CHUNK_SIZE = 4;
    for (let i = 0; i < activeAddrs.length; i += CHUNK_SIZE) {
        const chunk = activeAddrs.slice(i, i + CHUNK_SIZE);
        try {
            const txsRes = await fetch(
                `${TZKT_API}/operations/transactions?sender.in=${chunk.join(",")}&status=applied&limit=200&select=sender,target,amount,hash,timestamp`,
            );
            if (txsRes.ok) {
                const chunkTxs: RawTx[] = await txsRes.json();
                for (const tx of chunkTxs) {
                    const s = tx.sender.address.toLowerCase();
                    if (!txMap.has(s)) txMap.set(s, []);
                    txMap.get(s)!.push(tx);
                }
            }
        } catch {
            // Non-critical: continue to next chunk
        }
    }

    // Map commitments by account address
    const comMap = new Map<string, string>();
    for (const c of coms) {
        if (c.activatedAccount?.address) {
            comMap.set(c.activatedAccount.address.toLowerCase(), c.address);
        }
    }

    // Map account balances
    const accMap = new Map<string, number>();
    for (const a of accs) {
        accMap.set(a.address.toLowerCase(), a.balance);
    }

    // Assemble enriched activations
    return ops.map((op) => {
        const addrLower = op.account.address.toLowerCase();
        const btz1 = comMap.get(addrLower) || "";
        const curBalMutez = accMap.get(addrLower) ?? op.balance;
        const senderTxs = txMap.get(addrLower) || [];

        let toExchangeMutez = 0;
        let toWalletMutez = 0;
        let exchangeName: string | undefined;
        let topRecipient: string | undefined;

        for (const tx of senderTxs) {
            const alias = tx.target?.alias;
            const exName = extractExchangeName(alias, tx.target?.address);
            if (exName) {
                toExchangeMutez += tx.amount;
                if (!exchangeName) exchangeName = exName;
            } else {
                toWalletMutez += tx.amount;
                if (!topRecipient && tx.target?.address) {
                    topRecipient = tx.target.address;
                }
            }
        }

        // Determine disposition
        let disposition: "stayed" | "exchange" | "wallet" | "split" = "stayed";
        if (op.balance > 0) {
            const stayRatio = curBalMutez / op.balance;
            const exRatio = toExchangeMutez / op.balance;
            const wallRatio = toWalletMutez / op.balance;

            if (stayRatio >= 0.8) {
                disposition = "stayed";
            } else if (exRatio >= 0.5) {
                disposition = "exchange";
            } else if (wallRatio >= 0.5) {
                disposition = "wallet";
            } else {
                disposition = "split";
            }
        }

        return {
            address: btz1,
            balance: op.balance,
            activated: true,
            activationLevel: op.level,
            activationTime: op.timestamp,
            activatedAccount: { address: op.account.address },
            opHash: op.hash,
            quote: op.quote,
            currentBalance: curBalMutez,
            toExchange: toExchangeMutez,
            exchangeName,
            toWallet: toWalletMutez,
            topRecipient,
            disposition,
        };
    });
}

/**
 * Fetch live fund flow and outgoing transfers for an activated account.
 */
async function fetchAccountFlow(accountAddress: string): Promise<{
    currentBalanceMutez: number;
    toExchangeMutez: number;
    toWalletMutez: number;
    exchangeName?: string;
    transfers: OutgoingTransfer[];
}> {
    const [accRes, txsRes] = await Promise.all([
        fetch(`${TZKT_API}/accounts/${encodeURIComponent(accountAddress)}`),
        fetch(
            `${TZKT_API}/operations/transactions?sender=${encodeURIComponent(accountAddress)}&status=applied&limit=25&select=target,amount,hash,timestamp`,
        ),
    ]);

    let currentBalanceMutez = 0;
    if (accRes.ok) {
        const acc = await accRes.json();
        currentBalanceMutez = acc.balance ?? 0;
    }

    let toExchangeMutez = 0;
    let toWalletMutez = 0;
    let exchangeName: string | undefined;
    const transfers: OutgoingTransfer[] = [];

    if (txsRes.ok) {
        interface RawSingleTx {
            target?: { address: string; alias?: string | null };
            amount: number;
            hash: string;
            timestamp: string;
        }
        const txList: RawSingleTx[] = await txsRes.json();
        for (const t of txList) {
            const alias = t.target?.alias;
            const ex = extractExchangeName(alias, t.target?.address);
            const isEx = !!ex;
            if (isEx) {
                toExchangeMutez += t.amount;
                if (!exchangeName) exchangeName = ex;
            } else {
                toWalletMutez += t.amount;
            }
            transfers.push({
                amountMutez: t.amount,
                amountXtz: t.amount / 1e6,
                targetAddress: t.target?.address || "",
                targetAlias: alias || undefined,
                isExchange: isEx,
                exchangeName: ex,
                hash: t.hash,
                timestamp: t.timestamp,
            });
        }
    }

    return {
        currentBalanceMutez,
        toExchangeMutez,
        toWalletMutez,
        exchangeName,
        transfers,
    };
}

/**
 * Check an input string against Tezos ICO data sources.
 */
export async function checkIcoInput(
    rawInput: string,
    unclaimedList?: IcoCommitment[],
): Promise<IcoCheckResult> {
    const input = rawInput.trim();
    if (!input) {
        return {
            status: "invalid",
            verdict: "Please enter an address or operation hash",
            explanation: "Enter a blinded address (btz1…), an account address (tz1…), or an operation hash (o…).",
            input: "",
            detectedType: "other",
        };
    }

    const detectedType = detectInputType(input);

    // 1. Blinded address (btz1...)
    if (detectedType === "blinded") {
        try {
            const res = await fetch(`${TZKT_API}/commitments/${encodeURIComponent(input)}`);
            if (res.status === 200) {
                const item = (await res.json()) as IcoCommitment;
                if (item.activated) {
                    let opHash: string | undefined;
                    let quote: { usd?: number; eur?: number } | undefined;
                    let flowData: {
                        currentBalanceMutez: number;
                        toExchangeMutez: number;
                        toWalletMutez: number;
                        exchangeName?: string;
                        transfers: OutgoingTransfer[];
                    } = {
                        currentBalanceMutez: 0,
                        toExchangeMutez: 0,
                        toWalletMutez: 0,
                        transfers: [],
                    };

                    if (item.activatedAccount?.address) {
                        try {
                            const [opRes, flow] = await Promise.all([
                                fetch(
                                    `${TZKT_API}/operations/activations?account=${encodeURIComponent(item.activatedAccount.address)}&quote=usd,eur`,
                                ),
                                fetchAccountFlow(item.activatedAccount.address),
                            ]);
                            if (opRes.ok) {
                                const ops = await opRes.json();
                                if (Array.isArray(ops) && ops.length > 0) {
                                    opHash = ops[0].hash;
                                    quote = ops[0].quote;
                                }
                            }
                            flowData = flow;
                        } catch {
                            // Non-critical
                        }
                    }

                    return {
                        status: "activation",
                        verdict: "Matches an ICO commitment — activated",
                        explanation: `This blinded address is a genesis commitment activated in block #${item.activationLevel?.toLocaleString() ?? ""}, moving ${formatXtz(item.balance)} ꜩ to ${item.activatedAccount?.address}.`,
                        input,
                        detectedType: "blinded",
                        amountMutez: item.balance,
                        amountXtz: item.balance / 1e6,
                        date: item.activationTime,
                        level: item.activationLevel,
                        blindedAddress: item.address,
                        accountAddress: item.activatedAccount?.address,
                        opHash,
                        quote,
                        currentBalanceMutez: flowData.currentBalanceMutez,
                        currentBalanceXtz: flowData.currentBalanceMutez / 1e6,
                        toExchangeMutez: flowData.toExchangeMutez,
                        toExchangeXtz: flowData.toExchangeMutez / 1e6,
                        exchangeName: flowData.exchangeName,
                        toWalletMutez: flowData.toWalletMutez,
                        toWalletXtz: flowData.toWalletMutez / 1e6,
                        outgoingTransfers: flowData.transfers,
                        tzktUrl: opHash ? `https://tzkt.io/${opHash}` : `https://tzkt.io/${item.address}`,
                    };
                }

                // Not activated -> Unclaimed commitment
                return {
                    status: "unclaimed",
                    verdict: "Unclaimed commitment",
                    explanation: `This blinded address is a valid genesis commitment holding ${formatXtz(item.balance)} ꜩ that has not yet been activated.`,
                    input,
                    detectedType: "blinded",
                    amountMutez: item.balance,
                    amountXtz: item.balance / 1e6,
                    blindedAddress: item.address,
                    tzktUrl: `https://tzkt.io/${item.address}`,
                };
            }

            // Fallback to local cache
            if (unclaimedList) {
                const found = unclaimedList.find((c) => c.address.toLowerCase() === input.toLowerCase());
                if (found) {
                    return {
                        status: "unclaimed",
                        verdict: "Unclaimed commitment",
                        explanation: `This blinded address is an unclaimed genesis commitment holding ${formatXtz(found.balance)} ꜩ.`,
                        input,
                        detectedType: "blinded",
                        amountMutez: found.balance,
                        amountXtz: found.balance / 1e6,
                        blindedAddress: found.address,
                        tzktUrl: `https://tzkt.io/${found.address}`,
                    };
                }
            }

            return {
                status: "not_ico",
                verdict: "Not an ICO commitment / no match",
                explanation: "No genesis fundraiser commitment exists for this blinded address.",
                input,
                detectedType: "blinded",
                tzktUrl: `https://tzkt.io/${input}`,
            };
        } catch {
            return {
                status: "not_ico",
                verdict: "Unable to verify commitment",
                explanation: "Network lookup failed while querying TzKT for this blinded address.",
                input,
                detectedType: "blinded",
            };
        }
    }

    // 2. Account address (tz1...)
    if (detectedType === "account") {
        try {
            const actRes = await fetch(
                `${TZKT_API}/operations/activations?account=${encodeURIComponent(input)}&quote=usd,eur`,
            );
            if (actRes.ok) {
                const activations = await actRes.json();
                if (Array.isArray(activations) && activations.length > 0) {
                    const op = activations[0];

                    const [comRes, flow] = await Promise.all([
                        fetch(`${TZKT_API}/commitments?activationLevel=${op.level}`),
                        fetchAccountFlow(input),
                    ]);

                    let blindedAddress: string | undefined;
                    if (comRes.ok) {
                        const coms: IcoCommitment[] = await comRes.json();
                        const match = coms.find(
                            (c) => c.activatedAccount?.address?.toLowerCase() === input.toLowerCase(),
                        );
                        if (match) blindedAddress = match.address;
                    }

                    return {
                        status: "activation",
                        verdict: "Matches an ICO commitment — activated",
                        explanation: `This account was activated on ${formatDate(op.timestamp)} at block #${op.level.toLocaleString()} from genesis commitment ${blindedAddress ? shortAddress(blindedAddress) : "ICO"}, receiving ${formatXtz(op.balance)} ꜩ.`,
                        input,
                        detectedType: "account",
                        amountMutez: op.balance,
                        amountXtz: op.balance / 1e6,
                        date: op.timestamp,
                        level: op.level,
                        blindedAddress,
                        accountAddress: op.account?.address || input,
                        opHash: op.hash,
                        quote: op.quote,
                        currentBalanceMutez: flow.currentBalanceMutez,
                        currentBalanceXtz: flow.currentBalanceMutez / 1e6,
                        toExchangeMutez: flow.toExchangeMutez,
                        toExchangeXtz: flow.toExchangeMutez / 1e6,
                        exchangeName: flow.exchangeName,
                        toWalletMutez: flow.toWalletMutez,
                        toWalletXtz: flow.toWalletMutez / 1e6,
                        outgoingTransfers: flow.transfers,
                        tzktUrl: `https://tzkt.io/${op.hash}`,
                    };
                }
            }

            // Not an activation. Check if account exists on chain
            let existsOnChain = false;
            try {
                const accRes = await fetch(`${TZKT_API}/accounts/${encodeURIComponent(input)}`);
                if (accRes.ok && accRes.status === 200) {
                    existsOnChain = true;
                }
            } catch {
                // Ignore
            }

            return {
                status: "not_ico",
                verdict: "Not an ICO activation / no match",
                explanation: existsOnChain
                    ? "This tz1 account exists on Tezos, but was not created or activated from an ICO fundraiser commitment."
                    : "This address has no activation records and no on-chain activity on Tezos mainnet.",
                input,
                detectedType: "account",
                tzktUrl: `https://tzkt.io/${input}`,
            };
        } catch {
            return {
                status: "not_ico",
                verdict: "Unable to verify address",
                explanation: "Network lookup failed while querying TzKT for this account.",
                input,
                detectedType: "account",
            };
        }
    }

    // 3. Operation hash (o...)
    if (detectedType === "operation") {
        try {
            const opRes = await fetch(
                `${TZKT_API}/operations/${encodeURIComponent(input)}?quote=usd,eur`,
            );
            if (opRes.ok) {
                const ops = await opRes.json();
                if (Array.isArray(ops) && ops.length > 0) {
                    interface RawOpDetail {
                        type: string;
                        level: number;
                        timestamp: string;
                        hash: string;
                        balance?: number;
                        account?: { address: string };
                        quote?: { usd?: number; eur?: number };
                    }
                    const activationOp = (ops as RawOpDetail[]).find((o) => o.type === "activation");
                    if (activationOp && activationOp.account?.address) {
                        const targetAddr = activationOp.account.address;
                        const [comRes, flow] = await Promise.all([
                            fetch(`${TZKT_API}/commitments?activationLevel=${activationOp.level}`),
                            fetchAccountFlow(targetAddr),
                        ]);

                        let blindedAddress: string | undefined;
                        if (comRes.ok) {
                            const coms: IcoCommitment[] = await comRes.json();
                            const match = coms.find(
                                (c) => c.activatedAccount?.address?.toLowerCase() === targetAddr.toLowerCase(),
                            );
                            if (match) blindedAddress = match.address;
                        }

                        const bal = activationOp.balance ?? 0;
                        return {
                            status: "activation",
                            verdict: "Matches an ICO commitment — activated",
                            explanation: `Operation is a legitimate ICO activation at block #${activationOp.level.toLocaleString()} moving ${formatXtz(bal)} ꜩ to ${targetAddr}.`,
                            input,
                            detectedType: "operation",
                            amountMutez: bal,
                            amountXtz: bal / 1e6,
                            date: activationOp.timestamp,
                            level: activationOp.level,
                            blindedAddress,
                            accountAddress: targetAddr,
                            opHash: activationOp.hash,
                            quote: activationOp.quote,
                            currentBalanceMutez: flow.currentBalanceMutez,
                            currentBalanceXtz: flow.currentBalanceMutez / 1e6,
                            toExchangeMutez: flow.toExchangeMutez,
                            toExchangeXtz: flow.toExchangeMutez / 1e6,
                            exchangeName: flow.exchangeName,
                            toWalletMutez: flow.toWalletMutez,
                            toWalletXtz: flow.toWalletMutez / 1e6,
                            outgoingTransfers: flow.transfers,
                            tzktUrl: `https://tzkt.io/${activationOp.hash}`,
                        };
                    }

                    // Operation exists, but not an activation
                    const firstOp = ops[0] as RawOpDetail;
                    return {
                        status: "not_ico",
                        verdict: "Not an ICO activation / no match",
                        explanation: `This operation is a "${firstOp.type || "standard"}" operation on Tezos, not an ICO fundraiser activation.`,
                        input,
                        detectedType: "operation",
                        opType: firstOp.type,
                        tzktUrl: `https://tzkt.io/${input}`,
                    };
                }
            }

            return {
                status: "not_ico",
                verdict: "Not an ICO activation / no match",
                explanation: "No operation found with this hash on Tezos mainnet.",
                input,
                detectedType: "operation",
            };
        } catch {
            return {
                status: "not_ico",
                verdict: "Unable to verify operation",
                explanation: "Network lookup failed while querying TzKT for this operation hash.",
                input,
                detectedType: "operation",
            };
        }
    }

    // 4. Other address types (tz2, tz3, tz4, KT1)
    if (
        input.startsWith("tz2") ||
        input.startsWith("tz3") ||
        input.startsWith("tz4") ||
        input.startsWith("KT1")
    ) {
        return {
            status: "not_ico",
            verdict: "Not an ICO activation / no match",
            explanation: `Tezos fundraiser commitments activate exclusively into tz1 (Ed25519) accounts. "${input.slice(0, 3)}" addresses cannot be ICO activations.`,
            input,
            detectedType: "other",
            tzktUrl: `https://tzkt.io/${input}`,
        };
    }

    // 5. Unrecognized input format
    return {
        status: "invalid",
        verdict: "Unrecognized format",
        explanation: "Please enter an operation hash starting with 'o', a blinded address starting with 'btz1', or an account address starting with 'tz1'.",
        input,
        detectedType: "other",
    };
}

/**
 * Verify commitment and account balance directly against a Tezos Node RPC.
 */
export async function verifyOnNodeRpc(
    rpcUrl: string,
    btz1: string,
    tz1?: string,
): Promise<NodeRpcVerification> {
    const cleanRpc = rpcUrl.trim().replace(/\/+$/, "");

    // 1. Query block head header
    const headRes = await fetch(`${cleanRpc}/chains/main/blocks/head/header`);
    if (!headRes.ok) {
        throw new Error(`Failed to query block header from node RPC at ${cleanRpc}`);
    }
    const head = (await headRes.json()) as { level: number; hash: string; timestamp: string };

    // 2. Query raw commitments context
    let commitmentExists = false;
    let commitmentMutez: string | undefined;
    let commitmentXtz: number | undefined;

    const commitRes = await fetch(
        `${cleanRpc}/chains/main/blocks/head/context/raw/json/commitments/${encodeURIComponent(btz1)}`,
    );

    if (commitRes.status === 200) {
        const rawBody = await commitRes.text();
        const cleaned = rawBody.trim().replace(/^"|"$/g, "");
        if (/^\d+$/.test(cleaned)) {
            commitmentExists = true;
            commitmentMutez = cleaned;
            commitmentXtz = Number(BigInt(cleaned)) / 1e6;
        }
    } else if (commitRes.status === 404) {
        commitmentExists = false;
    }

    // 3. Query tz1 balance if provided
    let tz1BalanceMutez: string | undefined;
    let tz1BalanceXtz: number | undefined;

    if (tz1 && tz1.trim()) {
        const cleanTz1 = tz1.trim();
        const balRes = await fetch(
            `${cleanRpc}/chains/main/blocks/head/context/contracts/${encodeURIComponent(cleanTz1)}/balance`,
        );
        if (balRes.ok) {
            const rawBal = (await balRes.text()).trim().replace(/^"|"$/g, "");
            if (/^\d+$/.test(rawBal)) {
                tz1BalanceMutez = rawBal;
                tz1BalanceXtz = Number(BigInt(rawBal)) / 1e6;
            }
        }
    }

    return {
        rpcUrl: cleanRpc,
        headLevel: head.level,
        headHash: head.hash,
        headTime: head.timestamp,
        btz1,
        commitmentExists,
        commitmentMutez,
        commitmentXtz,
        tz1: tz1?.trim() || undefined,
        tz1BalanceMutez,
        tz1BalanceXtz,
    };
}

/**
 * Generate and trigger download of CSV for unclaimed commitments.
 */
export function exportUnclaimedCsv(items: IcoCommitment[]): void {
    const headers = ["Blinded Address (btz1)", "Balance (XTZ)", "Balance (mutez)"];
    const rows = items.map((c) => [
        c.address,
        (c.balance / 1e6).toFixed(6),
        c.balance.toString(),
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute("href", url);
    link.setAttribute("download", `tezos-ico-unclaimed-commitments-${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
