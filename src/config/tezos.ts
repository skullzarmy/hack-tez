/**
 * Network configuration — env-toggled Mainnet / Ghostnet / Shadownet
 *
 * TLD varies by network:
 *   mainnet  → .tez
 *   ghostnet → .gho
 *   shadownet → TED not officially deployed (testing only)
 */

export type TezosNetwork = "mainnet" | "ghostnet" | "shadownet";

const network = (import.meta.env.VITE_TEZOS_NETWORK || "ghostnet") as TezosNetwork;

interface NetworkConfig {
    name: TezosNetwork;
    tld: string;
    rpcUrl: string;
    tzktApi: string;
    domainsGraphql: string;
    registrarAddress: string;
}

const configs: Record<TezosNetwork, NetworkConfig> = {
    ghostnet: {
        name: "ghostnet",
        tld: "gho",
        rpcUrl: "https://rpc.ghostnet.teztnets.com",
        tzktApi: "https://api.ghostnet.tzkt.io",
        domainsGraphql: "https://ghostnet-api.tezos.domains/graphql",
        registrarAddress: import.meta.env.VITE_REGISTRAR_ADDRESS || "KT1X2ZbjZBaeRnnkzLyaZ3FtGp7wKuaimbzg",
    },
    shadownet: {
        name: "shadownet",
        tld: "shd",
        rpcUrl: "https://rpc.shadownet.teztnets.com",
        tzktApi: "https://api.shadownet.tzkt.io",
        domainsGraphql: "",
        registrarAddress: import.meta.env.VITE_REGISTRAR_ADDRESS || "KT1XgZbjNVuRrJsKLHqh2cFLAzUTqjZ3tuub",
    },
    mainnet: {
        name: "mainnet",
        tld: "tez",
        rpcUrl: "https://mainnet.tezos.marigold.dev",
        tzktApi: "https://api.tzkt.io",
        domainsGraphql: "https://api.tezos.domains/graphql",
        registrarAddress: import.meta.env.VITE_REGISTRAR_ADDRESS || "",
    },
};

export const config = configs[network];
export default config;
