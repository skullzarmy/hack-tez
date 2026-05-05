import type { DAppClient } from "@tezos-x/octez.connect-sdk";
import { buildPinMessage, signMessage } from "./signing";

export const IPFS_GATEWAY_BASE = "https://ipfs.fileship.xyz/ipfs/";
const PIN_ENDPOINTS = ["/api/v1/pin", "/.netlify/functions/pin"] as const;

/** Convert an `ipfs://<CID>` URI to a gateway URL. Non-ipfs:// strings pass through unchanged. */
export function ipfsUriToGatewayUrl(uri: string): string {
    if (uri.startsWith("ipfs://")) {
        return IPFS_GATEWAY_BASE + uri.slice("ipfs://".length);
    }
    return uri;
}

/** Upload a file to the IPFS pin endpoint with wallet signature authentication. */
export async function pinFile(file: File, client: DAppClient): Promise<{ cid: string; gatewayUrl: string }> {
    const results = await pinFiles([file], client);
    return results[0];
}

/** Upload multiple files with a single wallet signature. */
export async function pinFiles(files: File[], client: DAppClient): Promise<{ cid: string; gatewayUrl: string }[]> {
    if (files.length === 0) return [];

    // Sign once for the whole batch — fileCount is bound into the signature
    const nonceBytes = new Uint8Array(16);
    crypto.getRandomValues(nonceBytes);
    const nonce = Array.from(nonceBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

    const timestamp = Math.floor(Date.now() / 1000);
    const message = buildPinMessage(timestamp, nonce, files.length);
    const { signature, publicKey } = await signMessage(client, message);

    const account = await client.getActiveAccount();
    if (!account?.address) {
        throw new Error("No active account");
    }

    // Upload each file with the same auth + its batch index
    const results: { cid: string; gatewayUrl: string }[] = [];
    for (let i = 0; i < files.length; i++) {
        const form = new FormData();
        form.append("file", files[i]);
        form.append("address", account.address);
        form.append("publicKey", publicKey);
        form.append("timestamp", String(timestamp));
        form.append("nonce", nonce);
        form.append("signature", signature);
        form.append("fileCount", String(files.length));
        form.append("fileIndex", String(i));

        let lastError = "Pin request failed";
        let cid: string | null = null;

        for (const endpoint of PIN_ENDPOINTS) {
            const res = await fetch(endpoint, { method: "POST", body: form });
            const body: { cid?: string; error?: string } = await res.json();

            if (res.ok && body.cid) {
                cid = body.cid;
                break;
            }

            if (body.error) {
                lastError = body.error;
            }

            // Retry on the fallback path only when the route is missing or method-mismatched.
            if (res.status !== 404 && res.status !== 405) {
                break;
            }
        }

        if (!cid) {
            throw new Error(lastError);
        }

        results.push({ cid, gatewayUrl: IPFS_GATEWAY_BASE + cid });
    }

    return results;
}
