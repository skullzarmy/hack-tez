import { SigningType } from "@tezos-x/octez.connect-sdk";
import type { DAppClient } from "@tezos-x/octez.connect-sdk";

/** Convert a UTF-8 string to its hex representation. */
export function stringToHex(str: string): string {
  return Array.from(new TextEncoder().encode(str))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Pack a string as a Micheline expression: 05 01 <4-byte-big-endian-length> <utf8-bytes>.
 * Without the length prefix, wallets misinterpret the first 4 chars as the length field.
 */
export function packMichelineString(str: string): string {
  const bytes = new TextEncoder().encode(str);
  const lenHex = bytes.length.toString(16).padStart(8, "0");
  return "0501" + lenHex + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Build the human-readable message shown in the wallet approval dialog. */
export function buildPinMessage(timestamp: number, nonce: string, fileCount: number): string {
  const date = new Date(timestamp * 1000).toISOString();
  return `hack.tez — Authorize ${fileCount} image upload${fileCount > 1 ? "s" : ""} · ${date} · ${nonce}`;
}

/** Sign an arbitrary message via Beacon wallet and return the signature + signer public key. */
export async function signMessage(
  client: DAppClient,
  message: string,
): Promise<{ signature: string; publicKey: string }> {
  const payloadBytes = packMichelineString(message);

  const result = await client.requestSignPayload({
    signingType: SigningType.MICHELINE,
    payload: payloadBytes,
  });

  // The sign response doesn't include the signer's public key directly —
  // retrieve it from the active account instead.
  const account = await client.getActiveAccount();
  if (!account?.publicKey) {
    throw new Error("No active account or public key unavailable after signing");
  }

  return { signature: result.signature, publicKey: account.publicKey };
}
