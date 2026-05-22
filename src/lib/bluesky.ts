import type { DAppClient } from "@tezos-x/octez.connect-sdk";
import { signMessage } from "./signing";

const BSKY_RESOLVE_URL = "https://bsky.social/xrpc/com.atproto.identity.resolveHandle";
const DID_RE = /^did:(plc|web):[a-zA-Z0-9._:%-]+$/;

export function isValidDid(did: string): boolean {
    return DID_RE.test(did);
}

export async function resolveBlueskyHandle(handle: string): Promise<string | null> {
    // Accept "did=did:plc:..." (copy-paste format from DNS TXT record), bare DID, or a handle
    const stripped = handle.trim().replace(/^did=/, "").replace(/^@/, "");
    if (DID_RE.test(stripped)) return stripped;
    try {
        const res = await fetch(`${BSKY_RESOLVE_URL}?handle=${encodeURIComponent(stripped)}`);
        if (!res.ok) return null;
        const data = (await res.json()) as { did?: string };
        return data.did ?? null;
    } catch {
        return null;
    }
}

export interface BlueskyStatus {
    linked: boolean;
    did?: string;
    handle?: string;
}

export async function getBlueskyStatus(label: string): Promise<BlueskyStatus> {
    const res = await fetch(`/api/v1/bluesky/${encodeURIComponent(label)}`);
    if (!res.ok) return { linked: false };
    const body = (await res.json()) as { data?: BlueskyStatus };
    return body.data ?? { linked: false };
}

function buildBlueskyChallenge(action: string, label: string, timestamp: string, nonce: string): string {
    return `hack.tez — Bluesky ${action} · ${label}.hacktez.com · ${timestamp} · ${nonce}`;
}

async function buildBlueskyPayload(
    action: string,
    label: string,
    client: DAppClient,
): Promise<{
    address: string;
    publicKey: string;
    signature: string;
    timestamp: string;
    nonce: string;
}> {
    const account = await client.getActiveAccount();
    if (!account?.address) throw new Error("No active account");

    const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
    const nonce = Array.from(nonceBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    const timestamp = new Date().toISOString();

    const message = buildBlueskyChallenge(action, label, timestamp, nonce);
    const { signature, publicKey } = await signMessage(client, message);

    return { address: account.address, publicKey, signature, timestamp, nonce };
}

export async function linkBlueskyHandle(params: {
    label: string;
    did: string;
    client: DAppClient;
}): Promise<Response> {
    const { label, did, client } = params;
    const payload = await buildBlueskyPayload("link", label, client);

    return fetch("/api/v1/bluesky/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, did, ...payload }),
    });
}

export async function unlinkBlueskyHandle(params: {
    label: string;
    client: DAppClient;
}): Promise<Response> {
    const { label, client } = params;
    const payload = await buildBlueskyPayload("unlink", label, client);

    return fetch("/api/v1/bluesky/unlink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, ...payload }),
    });
}
