/**
 * Network configuration — env-toggled Mainnet / Ghostnet / Shadownet
 *
 * TLD varies by network:
 *   mainnet  → .tez
 *   ghostnet → .gho
 *   shadownet → TED not officially deployed (testing only)
 *
 * Only the TED CheckAddress proxy is hardcoded per network (TED's stable anchor).
 * All other TED contracts (NameRegistry, SetChildRecord, UpdateRecord) are
 * discovered at runtime via the CheckAddress → NameRegistry → trusted_senders chain.
 */

export type TezosNetwork = "mainnet" | "ghostnet" | "shadownet";

const network = (import.meta.env.VITE_TEZOS_NETWORK || "ghostnet") as TezosNetwork;

/** Website base URL for this registrar — used wherever we need an absolute profile/share URL */
export const siteUrl: string =
    (import.meta.env.VITE_SITE_URL || "").trim().replace(/\/+$/, "") || "https://hacktez.com";

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
     *  All other TED addresses are resolved from this at runtime. */
    tedCheckAddress: string;
    /** Optional: hardcoded UpdateRecord proxy to bypass stale TED trusted_senders */
    mainnetUpdateRecordProxy?: string;
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
        /** Hardcoded mainnet UpdateRecord proxy — TED trusted_senders list has stale entries */
        mainnetUpdateRecordProxy: "KT1Ln4t64RdCG1bK8zkH6Xi4nNQVxz7qNgyj",
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
 * Discover TED contracts from the CheckAddress anchor:
 *   CheckAddress.storage.contract → NameRegistry
 *   NameRegistry.storage.trusted_senders → match by entrypoint name
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

    // Step 2: NameRegistry → trusted_senders
    const nrRes = await fetch(
        `${config.tzktApi}/v1/contracts/${nameRegistry}/storage`,
    );
    if (!nrRes.ok) throw new Error("Failed to fetch NameRegistry storage");
    const nrStorage: { trusted_senders?: string[] } = await nrRes.json();
    const senders = nrStorage.trusted_senders ?? [];

    // Step 3: Match trusted_senders by entrypoint name — take the FIRST match
    let setChildRecord = "";
    let updateRecord = "";

    for (const addr of senders) {
        try {
            const res = await fetch(`${config.tzktApi}/v1/contracts/${addr}/entrypoints`);
            if (!res.ok) continue;
            const eps: Array<{ name: string }> = await res.json();
            const epNames = eps.map((e) => e.name);

            if (!setChildRecord && epNames.includes("set_child_record")) {
                setChildRecord = addr;
            }
            if (!updateRecord && epNames.includes("update_record")) {
                updateRecord = addr;
            }

            if (setChildRecord && updateRecord) break;
        } catch {
            continue;
        }
    }

    // For mainnet, use the hardcoded UpdateRecord proxy to bypass stale TED trusted_senders
    if (config.mainnetUpdateRecordProxy) {
        updateRecord = config.mainnetUpdateRecordProxy;
    }

    return { nameRegistry, setChildRecord, updateRecord };
}
