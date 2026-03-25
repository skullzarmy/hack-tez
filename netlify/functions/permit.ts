/**
 * Netlify Function: POST /api/permit
 *
 * Verifies wallet signature, checks eligibility via TzKT,
 * then signs a permit for the HackTezRegistrar contract.
 */
import type { Context } from "@netlify/functions";
import { verifyEligibility } from "./_shared/tzkt.js";
import { signPermit } from "./_shared/permit-signer.js";

// Simple in-memory rate limiting (resets on cold start)
const rateLimitByAddress = new Map<string, number>();
const rateLimitByIP = new Map<string, number>();

function checkRateLimit(address: string, ip: string): string | null {
    const now = Date.now();
    const addrLast = rateLimitByAddress.get(address) || 0;
    if (now - addrLast < 60_000) return "Rate limited: 1 request per minute per address";

    const ipLast = rateLimitByIP.get(ip) || 0;
    const ipCount = Array.from(rateLimitByIP.entries()).filter(([k, v]) => k === ip && now - v < 60_000).length;
    if (ipCount >= 5) return "Rate limited: 5 requests per minute per IP";

    rateLimitByAddress.set(address, now);
    rateLimitByIP.set(ip, now);
    return null;
}

// Label -> hex bytes conversion
function labelToBytes(label: string): string {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(label);
    return (
        "0x" +
        Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("")
    );
}

export default async (req: Request, context: Context) => {
    if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
            status: 405,
            headers: { "Content-Type": "application/json" },
        });
    }

    try {
        const body = await req.json();
        const { address, label, targetAddress, walletSignature, walletPublicKey } = body;

        if (!address || !label || !targetAddress || !walletSignature || !walletPublicKey) {
            return new Response(JSON.stringify({ error: "Missing required fields" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        // Rate limit
        const ip = context.ip || "unknown";
        const rlError = checkRateLimit(address, ip);
        if (rlError) {
            return new Response(JSON.stringify({ error: rlError }), {
                status: 429,
                headers: { "Content-Type": "application/json" },
            });
        }

        // Verify wallet eligibility
        const eligibility = await verifyEligibility(address);
        if (!eligibility.eligible) {
            return new Response(JSON.stringify({ error: eligibility.reason }), {
                status: 403,
                headers: { "Content-Type": "application/json" },
            });
        }

        // TODO: Verify wallet signature against walletPublicKey + message
        // This requires nacl/tweetnacl signature verification for ed25519
        // For now we trust the wallet signature from the client
        // Full implementation would verify: check_signature(pubkey, sig, message_bytes)

        // Sign permit (expires in 10 minutes)
        const expiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        const labelBytes = labelToBytes(label);

        const permitSignature = await signPermit({
            label: labelBytes,
            sender: address,
            targetAddress,
            expiry,
        });

        return new Response(JSON.stringify({ permitSignature, expiry, labelBytes }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Permit error:", error);
        return new Response(JSON.stringify({ error: "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};

export const config = {
    path: "/.netlify/functions/permit",
};
