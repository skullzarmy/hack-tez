/**
 * Server-side permit signing logic.
 *
 * Uses the PERMIT_PRIVATE_KEY env var (ed25519 secret key in base58)
 * to sign permit payloads that the HackTezRegistrar contract will verify.
 */
import { InMemorySigner } from "@taquito/signer";

let signer: InMemorySigner | null = null;

function getSigner(): InMemorySigner {
    if (!signer) {
        const key = process.env.PERMIT_PRIVATE_KEY;
        if (!key) throw new Error("PERMIT_PRIVATE_KEY not configured");
        signer = new InMemorySigner(key);
    }
    return signer;
}

export interface PermitPayload {
    label: string; // hex bytes
    sender: string; // tz address
    targetAddress: string; // tz address
    expiry: string; // ISO timestamp
}

/**
 * Sign a permit payload. Returns the signature as a base58-encoded string.
 */
export async function signPermit(payload: PermitPayload): Promise<string> {
    const s = getSigner();

    // Pack the payload the same way the contract does:
    // sp.pack(sp.record(label=label, sender=sender, target_address=target_address, expiry=expiry))
    // For now we sign the JSON-serialized payload as bytes.
    // The contract and this code must agree on the packing format.
    const packed = new TextEncoder().encode(JSON.stringify(payload));
    const hexPayload = Array.from(packed)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

    const { prefixSig } = await s.sign(hexPayload);
    return prefixSig;
}

export async function getPublicKey(): Promise<string> {
    return getSigner().publicKey();
}
