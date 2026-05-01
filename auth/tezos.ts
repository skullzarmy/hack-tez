/**
 * Tezos signature verification.
 *
 * IMPORTANT: This module imports `@taquito/utils`, which currently requires
 * the Cloudflare Worker `nodejs_compat` flag. **Never import this from
 * PartyKit servers** (they don't have nodejs_compat). PartyKit uses JWTs
 * issued by the worker; signature verification only happens during /auth.
 */

import { verifySignature, getPkhfromPk } from "@taquito/utils";

/**
 * Pack a UTF-8 string into Tezos Micheline `string` payload bytes (the
 * `05 01 <len> <utf8>` pattern). This matches what wallets sign when given
 * `signingType: micheline`.
 */
export function packMichelineString(str: string): string {
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

export interface VerifyTezosSigParams {
  /** Tezos address (tz1.../tz2.../tz3...) — must match the public key. */
  address: string;
  /** Public key from the wallet (edpk.../sppk.../p2pk...). */
  publicKey: string;
  /** Wallet-produced signature (edsig.../spsig.../p2sig...). */
  signature: string;
  /** The exact human-readable message that was signed. */
  message: string;
}

/**
 * Verify a wallet signature over a Micheline-packed string message.
 *
 * Returns true iff:
 *   1. The address derived from `publicKey` matches `address`.
 *   2. The signature verifies against the Micheline-packed `message`.
 *
 * This function is message-format-agnostic: callers build the canonical
 * message themselves (see `auth/challenge.ts`) and pass it in. That keeps
 * this module reusable beyond chat.
 */
export async function verifyTezosSignature(p: VerifyTezosSigParams): Promise<boolean> {
  const derivedAddress = getPkhfromPk(p.publicKey);
  if (derivedAddress !== p.address) return false;
  const payloadHex = packMichelineString(p.message);
  return verifySignature(payloadHex, p.publicKey, p.signature);
}
