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
    /** Expected TED NameRegistry.SetChildRecord address for this network.
     *  Used to detect if name_registry storage has been tampered with. */
    expectedNameRegistry: string;
}

const configs: Record<TezosNetwork, NetworkConfig> = {
    ghostnet: {
        name: "ghostnet",
        tld: "gho",
        rpcUrl: "https://rpc.ghostnet.teztnets.com",
        tzktApi: "https://api.ghostnet.tzkt.io",
        domainsGraphql: "https://ghostnet-api.tezos.domains/graphql",
        registrarAddress: import.meta.env.VITE_REGISTRAR_ADDRESS,
        expectedNameRegistry: "KT1HpddfW7rX5aT2cTdsDaQZnH46bU7jQSTU",
    },
    shadownet: {
        name: "shadownet",
        tld: "shd",
        rpcUrl: "https://rpc.shadownet.teztnets.com",
        tzktApi: "https://api.shadownet.tzkt.io",
        domainsGraphql: "",
        registrarAddress: import.meta.env.VITE_REGISTRAR_ADDRESS,
        expectedNameRegistry: "", // TED not deployed on shadownet
    },
    mainnet: {
        name: "mainnet",
        tld: "tez",
        rpcUrl: "https://mainnet.tezos.marigold.dev",
        tzktApi: "https://api.tzkt.io",
        domainsGraphql: "https://api.tezos.domains/graphql",
        registrarAddress: import.meta.env.VITE_REGISTRAR_ADDRESS,
        expectedNameRegistry: "KT1QHLk1EMUA8BPH3FvRUeUmbTspmAhb7kpd",
    },
};

export const config = configs[network];
export default config;
