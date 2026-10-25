/**
 * ICO Commitments library for Tezos mainnet.
 * Interfaces, data fetching from TzKT v1 API, client-side caching,
 * and direct Tezos node RPC verification.
 */

const TZKT_API = "https://api.tzkt.io/v1";
export const DEFAULT_MAINNET_RPC = "https://rpc.tzkt.io/mainnet";

export interface IcoCommitment {
    address: string;
    balance: number;
    activated: boolean;
    activationLevel?: number;
    activationTime?: string;
    activatedAccount?: { address: string };
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

/**
 * Fetch recent activations ordered newest first by activationLevel.
 */
export async function fetchRecentActivations(limit = 25): Promise<IcoCommitment[]> {
    const res = await fetch(`${TZKT_API}/commitments?activated=true&sort.desc=activationLevel&limit=${limit}`);
    if (!res.ok) {
        throw new Error("Failed to fetch recent activations from TzKT");
    }
    return (await res.json()) as IcoCommitment[];
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
                    // It is activated! Attempt to find activation operation hash
                    let opHash: string | undefined;
                    if (item.activatedAccount?.address) {
                        try {
                            const opRes = await fetch(
                                `${TZKT_API}/operations/activations?account=${encodeURIComponent(item.activatedAccount.address)}`,
                            );
                            if (opRes.ok) {
                                const ops = await opRes.json();
                                if (Array.isArray(ops) && ops.length > 0) {
                                    opHash = ops[0].hash;
                                }
                            }
                        } catch {
                            // Non-critical, opHash remains undefined
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

            // 204 or 404 from TzKT: check local cache fallback just in case
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
            const actRes = await fetch(`${TZKT_API}/operations/activations?account=${encodeURIComponent(input)}`);
            if (actRes.ok) {
                const activations = await actRes.json();
                if (Array.isArray(activations) && activations.length > 0) {
                    const op = activations[0];
                    // Look up commitment at that activationLevel to resolve blinded address
                    let blindedAddress: string | undefined;
                    try {
                        const comRes = await fetch(`${TZKT_API}/commitments?activationLevel=${op.level}`);
                        if (comRes.ok) {
                            const coms: IcoCommitment[] = await comRes.json();
                            const match = coms.find(
                                (c) => c.activatedAccount?.address?.toLowerCase() === input.toLowerCase(),
                            );
                            if (match) {
                                blindedAddress = match.address;
                            }
                        }
                    } catch {
                        // Non-critical
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
            const opRes = await fetch(`${TZKT_API}/operations/${encodeURIComponent(input)}`);
            if (opRes.ok) {
                const ops = await opRes.json();
                if (Array.isArray(ops) && ops.length > 0) {
                    interface RawOp {
                        type: string;
                        level: number;
                        timestamp: string;
                        hash: string;
                        balance?: number;
                        account?: { address: string };
                    }
                    const activationOp = (ops as RawOp[]).find((o) => o.type === "activation");
                    if (activationOp) {
                        let blindedAddress: string | undefined;
                        try {
                            const comRes = await fetch(`${TZKT_API}/commitments?activationLevel=${activationOp.level}`);
                            if (comRes.ok) {
                                const coms: IcoCommitment[] = await comRes.json();
                                const targetAccount = activationOp.account?.address?.toLowerCase();
                                const match = coms.find(
                                    (c) => c.activatedAccount?.address?.toLowerCase() === targetAccount,
                                );
                                if (match) blindedAddress = match.address;
                            }
                        } catch {
                            // Non-critical
                        }

                        const bal = activationOp.balance ?? 0;
                        return {
                            status: "activation",
                            verdict: "Matches an ICO commitment — activated",
                            explanation: `Operation is a legitimate ICO activation at block #${activationOp.level.toLocaleString()} moving ${formatXtz(bal)} ꜩ to ${activationOp.account?.address}.`,
                            input,
                            detectedType: "operation",
                            amountMutez: bal,
                            amountXtz: bal / 1e6,
                            date: activationOp.timestamp,
                            level: activationOp.level,
                            blindedAddress,
                            accountAddress: activationOp.account?.address,
                            opHash: activationOp.hash,
                            tzktUrl: `https://tzkt.io/${activationOp.hash}`,
                        };
                    }

                    // Operation exists, but not an activation
                    const firstOp = ops[0] as RawOp;
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
 * Useful for bakers and advanced users to independently verify node context.
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
