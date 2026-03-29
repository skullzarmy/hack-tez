// ── Shared TypeScript types ──────────────────────────────────────────────────

export type TezosNetwork = "mainnet" | "ghostnet" | "shadownet";

export interface NetworkConfig {
    name: TezosNetwork;
    /** Top-level domain suffix (tez / gho / shd) */
    tld: string;
    rpcUrl: string;
    tzktApi: string;
    registrarAddress: string;
}

// ── Database types ────────────────────────────────────────────────────────────

export interface Subscription {
    id: number;
    chat_id: number;
    user_id: number;
    /** null = global (admin-only) subscription covering all subdomains */
    subdomain: string | null;
    claims_enabled: 0 | 1;
    commits_enabled: 0 | 1;
    created_at: number;
    updated_at: number;
}

// ── TzKT API types ────────────────────────────────────────────────────────────

export interface TzktOperation {
    id: number;
    hash: string;
    sender: { address: string };
    timestamp: string;
    status: string;
    parameter: TzktParameter;
}

export interface TzktParameter {
    entrypoint: string;
    /** For `register`: { label: string; salt: string; target_address: string }
     *  For `commit`:   raw bytes string */
    value: RegisterParams | string;
}

export interface RegisterParams {
    label: string;
    salt: string;
    target_address: string;
}

// ── Bot event types ───────────────────────────────────────────────────────────

export interface ClaimEvent {
    type: "claim";
    label: string;
    owner: string;
    targetAddress: string;
    txHash: string;
    timestamp: string;
    network: TezosNetwork;
    tld: string;
}

export interface CommitEvent {
    type: "commit";
    commitmentHash: string;
    sender: string;
    txHash: string;
    timestamp: string;
    network: TezosNetwork;
}

export type ContractEvent = ClaimEvent | CommitEvent;

// ── Command argument types ────────────────────────────────────────────────────

export type AlertType = "claims" | "commits" | "all";
export type ToggleAction = "on" | "off";
