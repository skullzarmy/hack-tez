/**
 * Commitment hash computation for the commit-reveal registration flow.
 *
 * Must produce the exact same bytes as the contract's:
 *   sp.blake2b(sp.pack(sp.record(
 *       label=label, sender=sender, target_address=target, salt=salt
 *   )))
 *
 * SmartPy sorts record fields alphabetically, producing a right-combed pair:
 *   (label: bytes, (salt: bytes, (sender: address, target_address: address)))
 */
import { packDataBytes } from "@taquito/michel-codec";
import { blake2b } from "blakejs";

/**
 * Compute the commitment hash that matches the contract's on-chain verification.
 *
 * @param labelHex  - hex-encoded label bytes (no 0x prefix)
 * @param sender    - tz1/tz2/tz3 address of the committer
 * @param targetAddress - tz1/tz2/tz3 address to point the subdomain at
 * @param saltHex   - hex-encoded random salt (no 0x prefix)
 * @returns hex-encoded blake2b hash (no 0x prefix)
 */
export function computeCommitmentHash(
    labelHex: string,
    sender: string,
    targetAddress: string,
    saltHex: string,
): string {
    // Micheline data: right-combed pair matching SmartPy alphabetical field order
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {
        prim: "Pair",
        args: [
            { bytes: labelHex },
            {
                prim: "Pair",
                args: [
                    { bytes: saltHex },
                    {
                        prim: "Pair",
                        args: [
                            { string: sender },
                            { string: targetAddress },
                        ],
                    },
                ],
            },
        ],
    };

    // Michelson type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const type: any = {
        prim: "pair",
        args: [
            { prim: "bytes" },
            {
                prim: "pair",
                args: [
                    { prim: "bytes" },
                    {
                        prim: "pair",
                        args: [{ prim: "address" }, { prim: "address" }],
                    },
                ],
            },
        ],
    };

    const packed = packDataBytes(data, type);
    // packed.bytes is hex string (no 0x prefix)
    const packedBytes = hexToUint8Array(packed.bytes);
    const hash = blake2b(packedBytes, undefined, 32);
    return uint8ArrayToHex(hash);
}

function hexToUint8Array(hex: string): Uint8Array {
    const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < clean.length; i += 2) {
        bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
    }
    return bytes;
}

function uint8ArrayToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}
