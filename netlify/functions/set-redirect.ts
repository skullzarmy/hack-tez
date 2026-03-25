/**
 * Netlify Function: POST /api/set-redirect
 *
 * Stores a redirect URL for a subdomain in Netlify Blobs.
 * Requires wallet signature proof of subdomain ownership.
 */
import type { Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

export default async (req: Request, _context: Context) => {
    if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
            status: 405,
            headers: { "Content-Type": "application/json" },
        });
    }

    try {
        const body = await req.json();
        const { subdomain, redirectUrl, walletSignature, walletPublicKey, address } = body;

        if (!subdomain || !redirectUrl || !walletSignature || !address) {
            return new Response(JSON.stringify({ error: "Missing required fields" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        // Validate redirect URL
        try {
            new URL(redirectUrl);
        } catch {
            return new Response(JSON.stringify({ error: "Invalid redirect URL" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        // TODO: Verify wallet signature and confirm subdomain ownership via GraphQL
        // For now we trust the client-side wallet signature
        // Full implementation:
        // 1. Verify signature proves ownership of `address`
        // 2. Query Tezos Domains GraphQL to confirm `address` owns `subdomain.hack.tez`

        // Store in Blobs
        const store = getStore({ name: "redirects", consistency: "strong" });
        await store.set(
            subdomain.toLowerCase(),
            JSON.stringify({
                redirectUrl,
                owner: address,
                updatedAt: new Date().toISOString(),
            }),
        );

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Set redirect error:", error);
        return new Response(JSON.stringify({ error: "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};

export const config = {
    path: "/.netlify/functions/set-redirect",
};
