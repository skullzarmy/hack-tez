import { verifySignature, getPkhfromPk } from "@taquito/utils";

// Re-export from the Node-free module so the Worker can still import from one place
export { getOwnedDomains } from "./domains.js";

const TIMESTAMP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function packMichelineString(str: string): string {
  const bytes = new TextEncoder().encode(str);
  const lenHex = bytes.length.toString(16).padStart(8, "0");
  return (
    "0501" +
    lenHex +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

/**
 * Verify a Tezos wallet signature for hack.tez chat authentication.
 * The signed message format is: `hack.tez-chat:{timestamp}:{nonce}`
 *
 * NOTE: This module requires nodejs_compat (uses @taquito/utils).
 * Only import from the CF Worker, never from PartyKit servers.
 */
export async function verifyTezosSignature(params: {
  address: string;
  publicKey: string;
  signature: string;
  timestamp: number;
  nonce: string;
}): Promise<boolean> {
  const { address, publicKey, signature, timestamp, nonce } = params;

  // Derive address from public key and verify it matches
  const derivedAddress = getPkhfromPk(publicKey);
  if (derivedAddress !== address) return false;

  // Validate nonce format
  if (!/^[A-Fa-f0-9]{8,128}$/.test(nonce)) return false;

  // Validate timestamp — frontend sends seconds, normalize to ms
  if (!Number.isFinite(timestamp) || !Number.isInteger(timestamp) || timestamp <= 0) return false;
  const timestampMs = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
  const now = Date.now();
  if (Math.abs(now - timestampMs) > TIMESTAMP_WINDOW_MS) return false;

  // Reconstruct the signed message using the original timestamp value
  const message = `hack.tez-chat:${timestamp}:${nonce}`;
  const payloadHex = packMichelineString(message);

  return verifySignature(payloadHex, publicKey, signature);
}
