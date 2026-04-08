import { NETWORK } from "../config.ts";
import type { TzktOperation, RegisterParams } from "../types/index.ts";

const BASE = NETWORK.tzktApi;
const CONTRACT = NETWORK.registrarAddress;

const DEFAULT_LIMIT = 50;

async function fetchLatestOpId(entrypoint: "register" | "commit"): Promise<number> {
    const url = new URL(`${BASE}/v1/operations/transactions`);
    url.searchParams.set("target", CONTRACT);
    url.searchParams.set("entrypoint", entrypoint);
    url.searchParams.set("status", "applied");
    url.searchParams.set("sort.desc", "id");
    url.searchParams.set("limit", "1");

    const res = await fetch(url.toString());
    if (!res.ok) {
        throw new Error(`TzKT error ${res.status}: ${await res.text()}`);
    }

    const ops = (await res.json()) as TzktOperation[];
    return ops.length > 0 ? ops[0].id : 0;
}

async function fetchOps(entrypoint: string, afterId: number): Promise<TzktOperation[]> {
    const url = new URL(`${BASE}/v1/operations/transactions`);
    url.searchParams.set("target", CONTRACT);
    url.searchParams.set("entrypoint", entrypoint);
    url.searchParams.set("status", "applied");
    url.searchParams.set("sort.asc", "id");
    url.searchParams.set("limit", String(DEFAULT_LIMIT));
    if (afterId > 0) url.searchParams.set("id.gt", String(afterId));

    const res = await fetch(url.toString());
    if (!res.ok) {
        throw new Error(`TzKT error ${res.status}: ${await res.text()}`);
    }
    return res.json() as Promise<TzktOperation[]>;
}

export async function fetchNewClaims(afterId: number): Promise<TzktOperation[]> {
    return fetchOps("register", afterId);
}

export async function fetchNewCommits(afterId: number): Promise<TzktOperation[]> {
    return fetchOps("commit", afterId);
}

export async function fetchLatestClaimId(): Promise<number> {
    return fetchLatestOpId("register");
}

export async function fetchLatestCommitId(): Promise<number> {
    return fetchLatestOpId("commit");
}

/** Decode a hex-encoded bytes string to UTF-8 (handles optional 0x prefix). */
export function decodeHexLabel(hex: string): string {
    const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
    return Buffer.from(clean, "hex").toString("utf8");
}

export function parseRegisterParams(op: TzktOperation): RegisterParams {
    const val = op.parameter.value;
    if (typeof val === "string") {
        throw new Error(`Unexpected scalar value for register op ${op.id}`);
    }
    return val as RegisterParams;
}

export function parseCommitHash(op: TzktOperation): string {
    const val = op.parameter.value;
    return typeof val === "string" ? val : JSON.stringify(val);
}

/** Fetch current contract storage for status display. */
export async function fetchContractStorage(): Promise<Record<string, unknown>> {
    const url = `${BASE}/v1/contracts/${CONTRACT}/storage`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TzKT error ${res.status}`);
    return res.json() as Promise<Record<string, unknown>>;
}
