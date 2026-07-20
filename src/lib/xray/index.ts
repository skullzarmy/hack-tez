/**
 * X-Ray — Tezos X identity inspection.
 *
 * Tezos X previewnet only. Endpoints are hardcoded (like spicy.ts is
 * mainnet-only): previewnet is the sole Tezos X network, hosted by
 * Nomadic Labs. URLs survive network resets; chain IDs and the rollup
 * address do not, so neither is hardcoded anywhere here.
 *
 * This module is isomorphic: no DOM, no Vite imports — it is shared by
 * the X-Ray lab page and the /api/v1/tezosx netlify function.
 */
export {
    classifyAddress,
    derivePair,
    evmAliasOfTezos,
    kt1AliasOfEvm,
    type AliasPair,
    type XrayInputKind,
} from "./aliases";

export const TEZOSX_EVM_RPC = "https://evm.previewnet.tezosx.nomadic-labs.com";
/** TzKT REST API for the Michelson interface. Note: the nomadic-labs "tzkt."
 *  host redirects to the TzKT UI; the API lives on the api. subdomain. */
export const TEZOSX_TZKT_API = "https://api.previewnet.tezosx.tzkt.io";
export const TEZOSX_TZKT_UI = "https://previewnet.tezosx.tzkt.io";
export const TEZOSX_BLOCKSCOUT = "https://blockscout.previewnet.tezosx.nomadic-labs.com";
export const TEZOSX_UNIFIED_EXPLORER = "https://experimental-explorer.previewnet.tezosx.nomadic-labs.com";
export const TEZOSX_FAUCET = "https://faucet.previewnet.tezosx.nomadic-labs.com";

/** On-chain state of one address on its interface. */
export interface CornerState {
    address: string;
    interface: "evm" | "michelson";
    /** Account exists on chain (balance, nonce, code, or indexed activity). */
    materialized: boolean;
    /** Raw balance: wei-of-tez (18 decimals) on EVM, mutez (6 decimals) on Michelson. */
    balance: string;
    /** True when the account carries code (EVM contract / 7702 alias, or KT1). */
    hasCode?: boolean;
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
    const res = await fetch(TEZOSX_EVM_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!res.ok) throw new Error(`xray: EVM RPC ${method} failed (${res.status})`);
    const body = (await res.json()) as { result?: T; error?: { message?: string } };
    if (body.error) throw new Error(`xray: EVM RPC ${method}: ${body.error.message ?? "error"}`);
    return body.result as T;
}

/** Query the EVM interface for an address's state. */
export async function getEvmCorner(address: string): Promise<CornerState> {
    const addr = address.toLowerCase();
    const [balanceHex, nonceHex, code] = await Promise.all([
        rpc<string>("eth_getBalance", [addr, "latest"]),
        rpc<string>("eth_getTransactionCount", [addr, "latest"]),
        rpc<string>("eth_getCode", [addr, "latest"]),
    ]);
    const balance = BigInt(balanceHex ?? "0x0").toString();
    const hasCode = !!code && code !== "0x";
    return {
        address: addr,
        interface: "evm",
        balance,
        hasCode,
        materialized: balance !== "0" || BigInt(nonceHex ?? "0x0") > 0n || hasCode,
    };
}

interface TzktAccount {
    type: string;
    balance?: number;
}

/** Query the Michelson interface (previewnet TzKT) for an address's state. */
export async function getMichelsonCorner(address: string): Promise<CornerState> {
    const res = await fetch(`${TEZOSX_TZKT_API}/v1/accounts/${address}`);
    if (!res.ok && res.status !== 404) throw new Error(`xray: TzKT lookup failed (${res.status})`);
    const account = res.status === 404 ? null : ((await res.json()) as TzktAccount | null);
    // TzKT returns type "empty" for addresses it has never seen.
    const materialized = !!account && account.type !== "empty";
    return {
        address,
        interface: "michelson",
        balance: String(account?.balance ?? 0),
        hasCode: account?.type === "contract",
        materialized,
    };
}

/** Format a raw balance for its interface: mutez (6) or wei-of-tez (18).
 *  Both render as tez, which is the point — one economic space. */
export function formatXtz(raw: string, iface: "evm" | "michelson", maxFractionDigits = 6): string {
    if (!/^\d+$/.test(raw)) return raw;
    const decimals = iface === "evm" ? 18 : 6;
    const padded = raw.padStart(decimals + 1, "0");
    const whole = padded.slice(0, -decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const frac = padded.slice(-decimals).replace(/0+$/, "");
    return frac ? `${whole}.${frac.slice(0, maxFractionDigits)}` : whole;
}

/** True when an EVM wei-of-tez amount cannot be represented in mutez without
 *  truncation (not a multiple of 10^12). Cross-interface transfers truncate. */
export function truncatesInMutez(weiRaw: string): boolean {
    if (!/^\d+$/.test(weiRaw)) return false;
    return BigInt(weiRaw) % 10n ** 12n !== 0n;
}
