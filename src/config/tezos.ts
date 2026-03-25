/**
 * Network configuration — env-toggled Mainnet / Ghostnet
 */

export type TezosNetwork = "mainnet" | "ghostnet";

const network = (import.meta.env.VITE_TEZOS_NETWORK || "ghostnet") as TezosNetwork;

interface NetworkConfig {
    name: TezosNetwork;
    rpcUrl: string;
    tzktApi: string;
    domainsGraphql: string;
    registrarAddress: string;
    nameRegistrySetChild: string;
    nameRegistryUpdateRecord: string;
}

const configs: Record<TezosNetwork, NetworkConfig> = {
    ghostnet: {
        name: "ghostnet",
        rpcUrl: "https://rpc.ghostnet.teztnets.com",
        tzktApi: "https://api.ghostnet.tzkt.io",
        domainsGraphql: "https://api.ghostnet.tezos.domains/graphql",
        registrarAddress: import.meta.env.VITE_REGISTRAR_ADDRESS || "",
        nameRegistrySetChild: "KT1HpddfW7rX5aT2cTdsDaQZnH46bU7jQSTU",
        nameRegistryUpdateRecord: "KT1Ln4t64RdCG1bK8zkH6Xi4nNQVxz7qNgyj",
    },
    mainnet: {
        name: "mainnet",
        rpcUrl: "https://mainnet.tezos.marigold.dev",
        tzktApi: "https://api.tzkt.io",
        domainsGraphql: "https://api.tezos.domains/graphql",
        registrarAddress: import.meta.env.VITE_REGISTRAR_ADDRESS || "",
        nameRegistrySetChild: "KT1QHLk1EMUA8BPH3FvRUeUmbTspmAhb7kpd",
        nameRegistryUpdateRecord: "KT1H1MqmUM4aK9i1833EBmYCCEfkbt6ZdSBc",
    },
};

export const config = configs[network];
export default config;
