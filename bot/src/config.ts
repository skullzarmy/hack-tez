import type { NetworkConfig, TezosNetwork } from "./types/index.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function requireEnv(key: string): string {
    const val = process.env[key];
    if (!val) throw new Error(`Missing required environment variable: ${key}`);
    return val;
}

function optionalEnv(key: string, fallback: string): string {
    return process.env[key] ?? fallback;
}

// ── Telegram ──────────────────────────────────────────────────────────────────

export const BOT_TOKEN = requireEnv("TELEGRAM_BOT_TOKEN");

/** Telegram user ID allowed to interact with the bot (admin). */
export const ADMIN_USER_ID = parseInt(requireEnv("TELEGRAM_ADMIN_USER_ID"), 10);

// ── Polling ───────────────────────────────────────────────────────────────────

export const POLL_INTERVAL_MS = parseInt(
    optionalEnv("POLL_INTERVAL_MS", "30000"),
    10
);

// ── Storage ───────────────────────────────────────────────────────────────────

export const DB_PATH = optionalEnv("DB_PATH", "./data/bot.db");

// ── Tezos network ─────────────────────────────────────────────────────────────

const NETWORK_RAW = optionalEnv("TEZOS_NETWORK", "ghostnet") as TezosNetwork;
const REGISTRAR_ADDRESS = requireEnv("REGISTRAR_ADDRESS");

const NETWORK_CONFIGS: Record<TezosNetwork, Omit<NetworkConfig, "registrarAddress">> = {
    ghostnet: {
        name: "ghostnet",
        tld: "gho",
        rpcUrl: "https://rpc.ghostnet.teztnets.com",
        tzktApi: "https://api.ghostnet.tzkt.io",
    },
    shadownet: {
        name: "shadownet",
        tld: "shd",
        rpcUrl: "https://rpc.shadownet.teztnets.com",
        tzktApi: "https://api.shadownet.tzkt.io",
    },
    mainnet: {
        name: "mainnet",
        tld: "tez",
        rpcUrl: "https://mainnet.tezos.marigold.dev",
        tzktApi: "https://api.tzkt.io",
    },
};

export const NETWORK: NetworkConfig = {
    ...NETWORK_CONFIGS[NETWORK_RAW],
    registrarAddress: REGISTRAR_ADDRESS,
};
