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

// ── Bluesky ───────────────────────────────────────────────────────────────────

/** Handle or DID for the @hacktez.com Bluesky account (optional). */
export const BSKY_IDENTIFIER = process.env.BSKY_IDENTIFIER ?? "";

/** Bluesky app password (Settings → Privacy → App Passwords). */
export const BSKY_APP_PASSWORD = process.env.BSKY_APP_PASSWORD ?? "";

/** Display name for the auto-managed starter pack list. */
export const BSKY_STARTER_PACK_NAME = optionalEnv("BSKY_STARTER_PACK_NAME", "hack.tez hackers");

/** Description for the starter pack. */
export const BSKY_STARTER_PACK_DESC = optionalEnv(
    "BSKY_STARTER_PACK_DESC",
    "Builders on hack.tez — Tezos subdomains linked to their Bluesky.",
);

/** Base URL of the hack.tez API used to discover linked DIDs. */
export const HACKTEZ_API_BASE = optionalEnv("HACKTEZ_API_BASE", "https://hacktez.com");

/** Run the starter-pack reconciler every N polling ticks (default: 60 → every ~30 min at 30s polls). */
export const RECONCILE_EVERY_N_TICKS = parseInt(
    optionalEnv("RECONCILE_EVERY_N_TICKS", "60"),
    10,
);
