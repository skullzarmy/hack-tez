/**
 * Network configuration — env-toggled Mainnet / Ghostnet / Shadownet
 *
 * TLD varies by network:
 *   mainnet  → .tez
 *   ghostnet → .gho
 *   shadownet → TED not officially deployed (testing only)
 *
 * TED proxy contracts are stable addresses and are hardcoded per network.
 * Only the NameRegistry underlying implementation is resolved dynamically
 * from CheckAddress storage.
 */

export type TezosNetwork = "mainnet" | "ghostnet" | "shadownet";

const network = (import.meta.env.VITE_TEZOS_NETWORK || "ghostnet") as TezosNetwork;

/** Website base URL for this registrar — used wherever we need an absolute profile/share URL */
export const siteUrl: string =
    (import.meta.env.VITE_SITE_URL || "").trim().replace(/\/+$/, "") || "https://hacktez.com";

/** hackchat worker URL — used by all chat components for API requests */
export const hackchatUrl: string =
    (import.meta.env.VITE_HACKCHAT_URL || "").trim().replace(/\/+$/, "") || "http://localhost:8787";

export const partykitHost: string =
    (import.meta.env.VITE_PARTYKIT_HOST || "").trim() || "localhost:1999";

/** VAPID public key for Web Push subscriptions (set at build time or fetched from server) */
export const vapidPublicKey: string =
    (import.meta.env.VITE_VAPID_PUBLIC_KEY || "").trim();

interface NetworkConfig {
    name: TezosNetwork;
    tld: string;
    rpcUrl: string;
    tzktApi: string;
    domainsGraphql: string;
    registrarAddress: string;
    /** TED dApp URL for this network */
    tedAppUrl: string;
    /** TED NameRegistry.CheckAddress — the single hardcoded TED anchor per network.
     *  NameRegistry underlying is resolved from this at runtime. */
    tedCheckAddress: string;
    /** TED SetChildRecord proxy (stable contract address). */
    tedSetChildRecord: string;
    /** TED UpdateRecord proxy (stable contract address). */
    tedUpdateRecord: string;
}

const configs: Record<TezosNetwork, NetworkConfig> = {
    ghostnet: {
        name: "ghostnet",
        tld: "gho",
        rpcUrl: "https://rpc.ghostnet.teztnets.com",
        tzktApi: "https://api.ghostnet.tzkt.io",
        domainsGraphql: "https://ghostnet-api.tezos.domains/graphql",
        registrarAddress: import.meta.env.VITE_REGISTRAR_ADDRESS,
        tedAppUrl: "https://ghostnet.tezos.domains",
        tedCheckAddress: "KT1B3j3At2XMF5P8bVoPD2WeJbZ9eaPiu3pD",
        tedSetChildRecord: "KT1HpddfW7rX5aT2cTdsDaQZnH46bU7jQSTU",
        tedUpdateRecord: "KT1Ln4t64RdCG1bK8zkH6Xi4nNQVxz7qNgyj",
    },
    shadownet: {
        name: "shadownet",
        tld: "shd",
        rpcUrl: "https://rpc.shadownet.teztnets.com",
        tzktApi: "https://api.shadownet.tzkt.io",
        domainsGraphql: "",
        registrarAddress: import.meta.env.VITE_REGISTRAR_ADDRESS,
        tedAppUrl: "https://shadownet.tezos.domains",
        tedCheckAddress: "",
        tedSetChildRecord: "",
        tedUpdateRecord: "",
    },
    mainnet: {
        name: "mainnet",
        tld: "tez",
        rpcUrl: "https://mainnet.tezos.marigold.dev",
        tzktApi: "https://api.tzkt.io",
        domainsGraphql: "https://api.tezos.domains/graphql",
        registrarAddress: import.meta.env.VITE_REGISTRAR_ADDRESS,
        tedAppUrl: "https://app.tezos.domains",
        tedCheckAddress: "KT1F7JKNqwaoLzRsMio1MQC7zv3jG9dHcDdJ",
        tedSetChildRecord: "KT1QHLk1EMUA8BPH3FvRUeUmbTspmAhb7kpd",
        tedUpdateRecord: "KT1H1MqmUM4aK9i1833EBmYCCEfkbt6ZdSBc",
    },
};

export const config = configs[network];
export default config;

// ---------------------------------------------------------------------------
// Runtime TED contract discovery — cached per session
// ---------------------------------------------------------------------------

export interface TedContracts {
    nameRegistry: string;
    setChildRecord: string;
    updateRecord: string;
}

let _cache: TedContracts | null = null;
let _pending: Promise<TedContracts> | null = null;

/**
 * Discover TED contracts from stable proxies + CheckAddress:
 *   CheckAddress.storage.contract → NameRegistry underlying
 *   SetChildRecord/UpdateRecord proxies → hardcoded stable addresses
 * Cached for the session lifetime.
 */
export async function getTedContracts(): Promise<TedContracts> {
    if (_cache) return _cache;
    if (_pending) return _pending;
    _pending = discover().then((r) => { _cache = r; _pending = null; return r; });
    return _pending;
}

async function discover(): Promise<TedContracts> {
    if (!config.tedCheckAddress) {
        return { nameRegistry: "", setChildRecord: "", updateRecord: "" };
    }

    // Step 1: CheckAddress → NameRegistry
    const checkRes = await fetch(
        `${config.tzktApi}/v1/contracts/${config.tedCheckAddress}/storage`,
    );
    if (!checkRes.ok) throw new Error("Failed to fetch TED CheckAddress storage");
    const checkStorage: { contract?: string } = await checkRes.json();
    const nameRegistry = checkStorage.contract ?? "";
    if (!nameRegistry) throw new Error("NameRegistry not found in CheckAddress storage");

    return {
        nameRegistry,
        setChildRecord: config.tedSetChildRecord,
        updateRecord: config.tedUpdateRecord,
    };
}
