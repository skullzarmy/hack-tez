/**
 * FA2 multi-asset token deployer.
 *
 * A revival of KStasi/fa2-deployer (dead since ~2021): the original used the
 * legacy @airgap/beacon-sdk + Taquito's `wallet.originate`. This port runs on
 * hack.tez's stack — octez.connect DAppClient + raw `requestOperation`
 * origination.
 *
 * Network selection at runtime: a single DAppClient is bound to one network, so
 * to offer a network dropdown we use TWO clients:
 *   - When the picked network is the SITE network (config.name), we reuse the
 *     global wallet client from TezosContext — no second client, no reconnect.
 *   - For any OTHER network, we use a dedicated deployer client bound to it.
 *     Switching the global client's network would corrupt the rest of the site
 *     (chat, registration, other labs all assume config.name), so the deployer
 *     keeps its own client for off-site networks.
 *
 * The two FA2 contracts (Basic = MultiAsset, Granular = GranularMultiAsset)
 * are standard Michelson and originate identically on every network — Tezlink
 * (the Michelson side of Tezos X) runs L1 Michelson as-is.
 */
import type { DAppClient, TezosOperationType } from "@tezos-x/octez.connect-sdk";
import config from "../config/tezos";
import multiAsset from "./fa2/MultiAsset.json";
import granularMultiAsset from "./fa2/GranularMultiAsset.json";

export type SupplyType = "Basic" | "Granular";

export interface DeployNetwork {
    /** Stable id (matches config.name for the site network). */
    id: string;
    label: string;
    /** Michelson RPC endpoint. */
    rpcUrl: string;
    /** TzKT UI base (no trailing slash) for op/contract links. */
    tzktUrl: string;
    /** Faucet URL for testnets. */
    faucet?: string;
    /** True → octez.connect MAINNET network type; false → CUSTOM with rpcUrl. */
    isMainnet: boolean;
    /** Short note shown under the picker. */
    note?: string;
}

const FAUCETS: Record<string, string | undefined> = {
    shadownet: "https://faucet.shadownet.teztnets.com",
    tezosx: "https://faucet.previewnet.tezosx.nomadic-labs.com/",
    ghostnet: "https://faucet.ghostnet.teztnets.com",
};

const NETWORK_LABEL: Record<string, string> = {
    mainnet: "Mainnet",
    shadownet: "Shadownet",
    tezosx: "Tezos X (Previewnet)",
    ghostnet: "Ghostnet",
};

/** The runtime-selectable deploy targets. "Tezos X" = Previewnet (Tezlink
 *  Shadownet was shut down 2026-05-18). "Shadownet" is the classic L1 testnet. */
const BASE_NETWORKS: DeployNetwork[] = [
    {
        id: "tezosx",
        label: "Tezos X (Previewnet)",
        rpcUrl: "https://michelson.previewnet.tezosx.nomadic-labs.com",
        tzktUrl: "https://tzkt.previewnet.tezosx.nomadic-labs.com",
        faucet: FAUCETS.tezosx,
        isMainnet: false,
        note: "Tezos X previewnet — Michelson (Tezlink) runtime. Experimental.",
    },
    {
        id: "shadownet",
        label: "Shadownet",
        rpcUrl: "https://rpc.shadownet.teztnets.com",
        tzktUrl: "https://shadownet.tzkt.io",
        faucet: FAUCETS.shadownet,
        isMainnet: false,
        note: "Classic L1 pre-production testnet.",
    },
    {
        id: "mainnet",
        label: "Mainnet",
        rpcUrl: "https://mainnet.tezos.marigold.dev",
        tzktUrl: "https://tzkt.io",
        isMainnet: true,
        note: "Real tez. Originations cost a deposit + fee.",
    },
];

/** Build an entry for whatever network the site itself runs on (so the global
 *  wallet is always a usable, no-extra-client deploy target — incl. dev ghostnet). */
function siteNetworkEntry(): DeployNetwork {
    return {
        id: config.name,
        label: NETWORK_LABEL[config.name] ?? config.name,
        rpcUrl: config.rpcUrl,
        tzktUrl: config.tzktApi.replace("api.", ""),
        faucet: FAUCETS[config.name],
        isMainnet: config.name === "mainnet",
    };
}

/** Selectable networks — the three targets, plus the site network if it isn't
 *  already one of them (e.g. a ghostnet dev build). */
export const DEPLOY_NETWORKS: DeployNetwork[] = BASE_NETWORKS.some((n) => n.id === config.name)
    ? BASE_NETWORKS
    : [siteNetworkEntry(), ...BASE_NETWORKS];

/** Default to the site network so the deployer opens already using the global wallet. */
export function defaultNetworkId(): string {
    return config.name;
}

export function getNetwork(id: string): DeployNetwork {
    return DEPLOY_NETWORKS.find((n) => n.id === id) ?? DEPLOY_NETWORKS[0];
}

/** True when the picked network is the one the site runs on → use the global client. */
export function isSiteNetwork(id: string): boolean {
    return id === config.name;
}

// ---------------------------------------------------------------------------
// Dedicated deployer client (used ONLY for off-site networks)
// ---------------------------------------------------------------------------

type SDKModule = typeof import("@tezos-x/octez.connect-sdk");
let sdkPromise: Promise<SDKModule> | null = null;
function loadSDK(): Promise<SDKModule> {
    if (!sdkPromise) sdkPromise = import("@tezos-x/octez.connect-sdk");
    return sdkPromise;
}

let deployerClient: DAppClient | null = null;
let deployerNetworkId: string | null = null;

// Isolated storage namespace — keeps the deployer's accounts/active-account out
// of the site's Beacon storage entirely. Without this, connecting on an off-site
// network would overwrite the SHARED active account and silently switch the whole
// site to that network. With its own prefix, the deployer never disturbs the
// global wallet session.
const DEPLOYER_STORAGE_PREFIX = "fa2deployer";

function buildBeaconNetwork(sdk: SDKModule, net: DeployNetwork) {
    if (net.isMainnet) return { type: sdk.NetworkType.MAINNET };
    // CUSTOM for every non-mainnet network — wallets reject unknown named network
    // types with an opaque PARAMETERS_INVALID_ERROR. See octez-connect skill.
    return { type: sdk.NetworkType.CUSTOM, name: net.label, rpcUrl: net.rpcUrl };
}

/** Get (or rebuild) the dedicated client for an off-site network. */
async function getDeployerClient(net: DeployNetwork): Promise<DAppClient> {
    const sdk = await loadSDK();
    if (deployerClient && deployerNetworkId === net.id) return deployerClient;
    if (deployerClient) {
        try {
            await deployerClient.destroy();
        } catch { /* may already be gone */ }
        deployerClient = null;
    }
    deployerClient = new sdk.DAppClient({
        name: "FA2 Deployer — hack.tez",
        network: buildBeaconNetwork(sdk, net),
        storage: new sdk.LocalStorage(DEPLOYER_STORAGE_PREFIX),
    });
    deployerNetworkId = net.id;
    return deployerClient;
}

/** Return the already-connected address for `net` without prompting, or null. */
export async function peekDeployerAddress(net: DeployNetwork): Promise<string | null> {
    const c = await getDeployerClient(net);
    const account = await c.getActiveAccount();
    return account?.address ?? null;
}

/** Connect a wallet on `net` (prompts if not already permissioned). */
export async function connectDeployer(net: DeployNetwork): Promise<string> {
    const sdk = await loadSDK();
    const c = await getDeployerClient(net);
    const existing = await c.getActiveAccount();
    if (existing) return existing.address;
    await c.requestPermissions({ scopes: [sdk.PermissionScope.OPERATION_REQUEST] });
    const account = await c.getActiveAccount();
    if (!account) throw new Error("Wallet connection was cancelled.");
    return account.address;
}

/** Tear down the dedicated deployer client. */
export async function disconnectDeployer(): Promise<void> {
    if (!deployerClient) return;
    try {
        await deployerClient.clearActiveAccount();
    } catch { /* noop */ }
    try {
        await deployerClient.destroy();
    } catch { /* noop */ }
    deployerClient = null;
    deployerNetworkId = null;
}

// ---------------------------------------------------------------------------
// Storage construction
// ---------------------------------------------------------------------------

export interface TokenInput {
    name: string;
    symbol: string;
    /** Integer string. */
    decimals: string;
    /** Integer string — human units; scaled by 10^decimals on chain. */
    supply: string;
    description: string;
    /** URI for thumbnailUri (e.g. ipfs:// or https://). */
    icon: string;
}

const toHex = (s: string): string => {
    const bytes = new TextEncoder().encode(s);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

/** human supply × 10^decimals as a decimal string, via BigInt (no float). */
function scaleSupply(supply: string, decimals: string): string {
    const s = BigInt(supply.trim() || "0");
    const d = BigInt(decimals.trim() || "0");
    return (s * 10n ** d).toString();
}

// --- Micheline builders -----------------------------------------------------
// We hand-build the storage Micheline rather than using @taquito/michelson-encoder:
// that library crashes when Vite pre-bundles it for the browser. The storage type
// is fixed and known, so direct construction is deterministic and dependency-free.

type Mich = { prim: string; args?: Mich[]; annots?: string[] } | { int: string } | { string: string } | { bytes: string } | Mich[];

const int = (n: string | number): Mich => ({ int: String(n) });
const str = (s: string): Mich => ({ string: s });
const bytes = (h: string): Mich => ({ bytes: h });
const pair = (a: Mich, b: Mich): Mich => ({ prim: "Pair", args: [a, b] });
const elt = (k: Mich, v: Mich): Mich => ({ prim: "Elt", args: [k, v] });

/** A map/big_map literal is a sequence of Elt sorted by key. The protocol's
 *  origination typecheck rejects unsorted or duplicate keys. */
function sortedStringMap(entries: Array<[string, Mich]>): Mich {
    return entries
        .slice()
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => elt(str(k), v));
}

/**
 * Build the FA2 storage as Micheline. Layout matches both contracts' storage
 * type exactly:
 *   pair (pair (pair %admin (pair admin paused) pending_admin)
 *              (pair %assets (pair ledger operators) (pair token_metadata token_total_supply)))
 *        metadata
 * `Basic` paused is a bool (False); `Granular` paused is an empty big_map ([]).
 */
function buildStorageMicheline(
    admin: string,
    contractName: string,
    contractDescription: string,
    tokens: TokenInput[],
    type: SupplyType,
): Mich {
    const contents = toHex(
        JSON.stringify({
            version: "v0.0.1",
            name: contractName,
            description: contractDescription,
            authors: ["FA2 Deployer — hack.tez"],
            source: { tools: ["Ligo"] },
            interfaces: ["TZIP-012", "TZIP-016"],
        }),
    );
    const metadata = sortedStringMap([
        ["", bytes(toHex("tezos-storage:contents"))],
        ["contents", bytes(contents)],
    ]);

    // Tokens are emitted in ascending id order, so the nat-keyed maps are sorted.
    // The ledger shares a single admin address, so nat-id order keeps it sorted too.
    const ledger: Mich = tokens.map((t, i) =>
        elt(pair(str(admin), int(i)), int(scaleSupply(t.supply, t.decimals))),
    );
    const tokenTotalSupply: Mich = tokens.map((t, i) => elt(int(i), int(scaleSupply(t.supply, t.decimals))));
    const tokenMetadata: Mich = tokens.map((t, i) => {
        const tokenInfo = sortedStringMap([
            ["symbol", bytes(toHex(t.symbol))],
            ["name", bytes(toHex(t.name))],
            ["decimals", bytes(toHex(t.decimals))],
            ["shouldPreferSymbol", bytes(toHex("true"))],
            ["description", bytes(toHex(t.description))],
            ["thumbnailUri", bytes(toHex(t.icon))],
        ]);
        return elt(int(i), pair(int(i), tokenInfo));
    });

    const paused: Mich = type === "Basic" ? { prim: "False" } : [];
    const operators: Mich = [];
    const pendingAdmin: Mich = { prim: "None" };

    const adminPart = pair(pair(str(admin), paused), pendingAdmin);
    const assetsPart = pair(pair(ledger, operators), pair(tokenMetadata, tokenTotalSupply));

    return pair(pair(adminPart, assetsPart), metadata);
}

/** Michelson program array for the chosen contract type. */
function contractCode(type: SupplyType): unknown[] {
    return (type === "Basic" ? multiAsset : granularMultiAsset) as unknown[];
}

export interface DeployParams {
    admin: string;
    contractName: string;
    contractDescription: string;
    tokens: TokenInput[];
    type: SupplyType;
}

export interface DeployResult {
    /** Origination operation hash. */
    opHash: string;
    /** TzKT link to the operation. */
    opUrl: string;
}

/**
 * Originate the FA2 contract on `net`. Builds the storage Micheline locally,
 * then submits a raw origination (octez.connect requestOperation).
 *
 * `externalClient` is the global wallet client, passed when deploying to the
 * site network; omit it for off-site networks (uses the dedicated client).
 */
export async function deployFa2(
    net: DeployNetwork,
    params: DeployParams,
    externalClient?: DAppClient | null,
): Promise<DeployResult> {
    const { admin, contractName, contractDescription, tokens, type } = params;

    const client = externalClient ?? (await getDeployerClient(net));

    const storage = buildStorageMicheline(admin, contractName, contractDescription, tokens, type);
    const code = contractCode(type);

    const result = await client.requestOperation({
        operationDetails: [
            {
                kind: "origination" as TezosOperationType.ORIGINATION,
                balance: "0",
                script: { code, storage },
            },
        ],
    });

    const opHash = (result as { transactionHash: string }).transactionHash;
    return { opHash, opUrl: `${net.tzktUrl}/${opHash}` };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateDeploy(
    admin: string,
    contractName: string,
    contractDescription: string,
    tokens: TokenInput[],
): string | null {
    if (!admin.trim()) return "Admin address is required.";
    if (!/^(tz1|tz2|tz3|tz4|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/.test(admin.trim())) {
        return "Admin must be a valid Tezos address (tz1…/KT1…).";
    }
    if (!contractName.trim()) return "Contract name is required.";
    if (!contractDescription.trim()) return "Contract description is required.";
    if (tokens.length === 0) return "Add at least one asset.";
    for (const [i, t] of tokens.entries()) {
        if (!t.name.trim() || !t.symbol.trim()) return `Asset ${i}: name and symbol are required.`;
        if (!/^\d+$/.test(t.supply.trim())) return `Asset ${i}: supply must be a whole number.`;
        if (!/^\d+$/.test(t.decimals.trim())) return `Asset ${i}: decimals must be a whole number.`;
    }
    return null;
}

export function emptyToken(): TokenInput {
    return { name: "", symbol: "", decimals: "0", supply: "", description: "", icon: "" };
}
