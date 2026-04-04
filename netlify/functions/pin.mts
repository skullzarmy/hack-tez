/**
 * hack.tez IPFS Pin Proxy — Netlify Function v2
 *
 * POST /api/v1/pin — authenticated IPFS pin via Pinata
 *
 * Accepts multipart form data:
 *   file       — image blob (≤ 4 MB, jpeg/png/gif/webp/svg+xml)
 *   address    — tz1... wallet address
 *   publicKey  — edpk... public key
 *   timestamp  — unix timestamp (seconds)
 *   nonce      — random string
 *   signature  — Tezos signature of "hack.tez — Authorize N image upload(s) · <ISO> · <nonce>"
 *   fileCount  — total files in this batch (bound into signature)
 *   fileIndex  — 0-based index of this file in the batch
 */
import type { Config, Context } from "@netlify/functions";
import { verifySignature, getPkhfromPk } from "@taquito/utils";
import { Redis } from "@upstash/redis";

// ---------------------------------------------------------------------------
// Network config (mirrors api.mts pattern — no Vite import.meta.env here)
// ---------------------------------------------------------------------------

type TezosNetwork = "mainnet" | "ghostnet";

const NETWORKS: Record<TezosNetwork, { tld: string; domainsGraphql: string }> = {
    mainnet: {
        tld: "tez",
        domainsGraphql: "https://api.tezos.domains/graphql",
    },
    ghostnet: {
        tld: "gho",
        domainsGraphql: "https://ghostnet-api.tezos.domains/graphql",
    },
};

function getNetwork() {
    const name = (process.env.VITE_TEZOS_NETWORK ?? "ghostnet") as TezosNetwork;
    return { name, ...(NETWORKS[name] ?? NETWORKS.ghostnet) };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MB
const ALLOWED_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
]);
const TIMESTAMP_WINDOW_SEC = 5 * 60; // 5 minutes
const NONCE_TTL_SEC = TIMESTAMP_WINDOW_SEC + 30; // nonce keys expire shortly after the timestamp window
const MAX_BATCH_SIZE = 10;

function getRedis(): Redis | null {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return null;
    return new Redis({ url, token });
}

/** Pack a string as a Micheline expression: 05 01 <4-byte-big-endian-length> <utf8-bytes> */
function packMichelineString(str: string): string {
    const bytes = new TextEncoder().encode(str);
    const lenHex = bytes.length.toString(16).padStart(8, "0");
    return "0501" + lenHex + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const CORS_HEADERS: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

// ---------------------------------------------------------------------------
// Magic byte validation — verify file content matches claimed MIME type
// ---------------------------------------------------------------------------

function isAllowedImageMagic(header: Uint8Array, claimedType: string): boolean {
    if (header.length < 4) return false;

    // JPEG: FF D8 FF
    if (claimedType === "image/jpeg") {
        return header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF;
    }
    // PNG: 89 50 4E 47
    if (claimedType === "image/png") {
        return header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47;
    }
    // GIF: 47 49 46 38 (GIF8)
    if (claimedType === "image/gif") {
        return header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x38;
    }
    // WebP: RIFF....WEBP (bytes 0-3 = RIFF, bytes 8-11 = WEBP)
    if (claimedType === "image/webp") {
        return header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46
            && header.length >= 12
            && header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50;
    }
    // SVG: starts with '<' (0x3C) or UTF-8 BOM + '<'
    if (claimedType === "image/svg+xml") {
        const firstByte = header[0];
        // Direct '<' or UTF-8 BOM (EF BB BF) followed by '<'
        return firstByte === 0x3C
            || (firstByte === 0xEF && header[1] === 0xBB && header[2] === 0xBF && header[3] === 0x3C);
    }

    return false;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
}

function err(message: string, code: string, status = 400): Response {
    return json({ error: message, code }, status);
}

async function tedGql<T>(graphqlUrl: string, query: string, variables: Record<string, unknown>): Promise<T> {
    const res = await fetch(graphqlUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`TED GraphQL HTTP ${res.status}`);
    const body = await res.json();
    if (body.errors?.length) throw new Error(body.errors[0].message);
    return body.data as T;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(req: Request, _ctx: Context): Promise<Response> {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (req.method !== "POST") {
        return err("Method not allowed", "METHOD_NOT_ALLOWED", 405);
    }

    const pinataJwt = process.env.PINATA_JWT;
    if (!pinataJwt) {
        return err("IPFS pinning not configured", "SERVER_ERROR", 503);
    }

    // --- Parse multipart form data ---
    let form: FormData;
    try {
        form = await req.formData();
    } catch {
        return err("Invalid multipart form data", "BAD_REQUEST");
    }

    const file = form.get("file");
    const address = form.get("address");
    const publicKey = form.get("publicKey");
    const timestampStr = form.get("timestamp");
    const nonce = form.get("nonce");
    const signature = form.get("signature");
    const fileCountStr = form.get("fileCount");
    const fileIndexStr = form.get("fileIndex");

    // --- Validate required fields ---
    if (!(file instanceof File)) return err("Missing or invalid 'file' field", "BAD_REQUEST");
    if (typeof address !== "string" || !address) return err("Missing 'address' field", "BAD_REQUEST");
    if (typeof publicKey !== "string" || !publicKey) return err("Missing 'publicKey' field", "BAD_REQUEST");
    if (typeof timestampStr !== "string" || !timestampStr) return err("Missing 'timestamp' field", "BAD_REQUEST");
    if (typeof nonce !== "string" || !nonce) return err("Missing 'nonce' field", "BAD_REQUEST");
    if (typeof signature !== "string" || !signature) return err("Missing 'signature' field", "BAD_REQUEST");
    if (typeof fileCountStr !== "string" || !fileCountStr) return err("Missing 'fileCount' field", "BAD_REQUEST");
    if (typeof fileIndexStr !== "string" || !fileIndexStr) return err("Missing 'fileIndex' field", "BAD_REQUEST");

    const fileCount = parseInt(fileCountStr, 10);
    const fileIndex = parseInt(fileIndexStr, 10);
    if (isNaN(fileCount) || fileCount < 1 || fileCount > MAX_BATCH_SIZE) {
        return err(`fileCount must be 1-${MAX_BATCH_SIZE}`, "BAD_REQUEST");
    }
    if (isNaN(fileIndex) || fileIndex < 0 || fileIndex >= fileCount) {
        return err("fileIndex out of range", "BAD_REQUEST");
    }

    // --- Validate file ---
    if (file.size > MAX_FILE_SIZE) {
        return err(
            `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB, max 4 MB)`,
            "FILE_TOO_LARGE",
            413,
        );
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
        return err(`Unsupported file type: ${file.type}`, "INVALID_MIME_TYPE");
    }

    // Verify actual file content via magic bytes (don't trust Content-Type header)
    const headerBytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    if (!isAllowedImageMagic(headerBytes, file.type)) {
        return err("File content does not match an allowed image format", "INVALID_FILE_CONTENT");
    }

    // --- Validate timestamp (replay protection) ---
    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) return err("Invalid timestamp", "BAD_REQUEST");
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > TIMESTAMP_WINDOW_SEC) {
        return err("Timestamp expired or too far in the future", "TIMESTAMP_INVALID", 401);
    }

    // --- Verify publicKey hashes to address ---
    let derivedAddress: string;
    try {
        derivedAddress = getPkhfromPk(publicKey);
    } catch {
        return err("Invalid public key", "INVALID_PUBLIC_KEY", 401);
    }
    if (derivedAddress !== address) {
        return err("Public key does not match address", "KEY_MISMATCH", 401);
    }

    // --- Verify signature (same format as src/lib/signing.ts) ---
    const date = new Date(timestamp * 1000).toISOString();
    const message = `hack.tez — Authorize ${fileCount} image upload${fileCount > 1 ? "s" : ""} · ${date} · ${nonce}`;
    const payloadHex = packMichelineString(message);
    let sigValid: boolean;
    try {
        sigValid = verifySignature(payloadHex, publicKey, signature);
    } catch {
        return err("Signature verification failed", "INVALID_SIGNATURE", 401);
    }
    if (!sigValid) {
        return err("Invalid signature", "INVALID_SIGNATURE", 401);
    }

    // --- Replay protection via Upstash Redis ---
    const redis = getRedis();
    if (redis) {
        const nonceKey = `pin:nonce:${address}:${nonce}:${fileIndex}`;
        // SET NX = only set if not exists; EX = expire after TTL
        const wasSet = await redis.set(nonceKey, "1", { nx: true, ex: NONCE_TTL_SEC });
        if (!wasSet) {
            return err("Nonce already used (replay rejected)", "REPLAY_DETECTED", 401);
        }
    }

    // --- Verify domain ownership via TED GraphQL ---
    const net = getNetwork();
    let ownsDomain: boolean;
    try {
        const data = await tedGql<{
            domains: { items: Array<{ name: string }> };
        }>(
            net.domainsGraphql,
            `query OwnerDomains($owner: Address!, $parent: String!) {
              domains(where: { owner: { equalTo: $owner }, name: { endsWith: $parent } }) {
                items { name }
              }
            }`,
            { owner: address, parent: `.hack.${net.tld}` },
        );
        ownsDomain = data.domains.items.length > 0;
    } catch {
        return err("Failed to verify domain ownership", "UPSTREAM_ERROR", 502);
    }
    if (!ownsDomain) {
        return err("Address does not own a *.hack.tez domain", "NO_DOMAIN", 401);
    }

    // --- Forward file to Pinata ---
    const pinataForm = new FormData();
    pinataForm.append("file", file, file.name || "upload");

    let pinataRes: Response;
    try {
        pinataRes = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
            method: "POST",
            headers: { Authorization: `Bearer ${pinataJwt}` },
            body: pinataForm,
        });
    } catch {
        return err("Failed to connect to IPFS pinning service", "PINATA_ERROR", 502);
    }

    if (!pinataRes.ok) {
        return err(`IPFS pinning failed (HTTP ${pinataRes.status})`, "PINATA_ERROR", 502);
    }

    const pinataData: { IpfsHash?: string } = await pinataRes.json();
    if (!pinataData.IpfsHash) {
        return err("IPFS pinning returned no CID", "PINATA_ERROR", 502);
    }

    return json({ cid: pinataData.IpfsHash });
}

export const config: Config = {
    path: "/api/v1/pin",
};
