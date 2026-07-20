/**
 * Vendored Keccak-256 (the pre-NIST "original" padding used by Ethereum).
 *
 * Why vendored: the only thing X-Ray needs from the EVM crypto stack is a
 * single keccak256 over short inputs, and adding an npm dependency for that
 * is not worth the supply-chain surface. BigInt lanes keep the code small
 * and obviously-correct; performance is irrelevant at our call sites (one
 * hash per address derivation).
 *
 * Verified against the standard test vectors — see src/lib/xray/aliases.ts
 * doc comment and scripts in the PR that introduced this file:
 *   keccak256("")    = c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470
 *   keccak256("abc") = 4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45
 */

const MASK64 = (1n << 64n) - 1n;

const RC: bigint[] = [
    0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
    0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
    0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
    0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
    0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
    0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

/** Rotation offsets r[x][y] for lane (x, y), state layout s[x + 5y]. */
const ROT: bigint[][] = [
    [0n, 36n, 3n, 41n, 18n],
    [1n, 44n, 10n, 45n, 2n],
    [62n, 6n, 43n, 15n, 61n],
    [28n, 55n, 25n, 21n, 56n],
    [27n, 20n, 39n, 8n, 14n],
];

function rotl(v: bigint, n: bigint): bigint {
    if (n === 0n) return v;
    return ((v << n) | (v >> (64n - n))) & MASK64;
}

function keccakF(s: bigint[]): void {
    for (let round = 0; round < 24; round++) {
        // theta
        const c = new Array<bigint>(5);
        for (let x = 0; x < 5; x++) c[x] = s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20];
        for (let x = 0; x < 5; x++) {
            const d = c[(x + 4) % 5] ^ rotl(c[(x + 1) % 5], 1n);
            for (let y = 0; y < 25; y += 5) s[x + y] ^= d;
        }
        // rho + pi
        const b = new Array<bigint>(25).fill(0n);
        for (let x = 0; x < 5; x++) {
            for (let y = 0; y < 5; y++) {
                b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(s[x + 5 * y], ROT[x][y]);
            }
        }
        // chi
        for (let y = 0; y < 25; y += 5) {
            for (let x = 0; x < 5; x++) {
                s[x + y] = b[x + y] ^ (~b[((x + 1) % 5) + y] & b[((x + 2) % 5) + y] & MASK64);
            }
        }
        // iota
        s[0] ^= RC[round];
    }
}

const RATE = 136; // bytes, for capacity 512 (Keccak-256)

/** Keccak-256 of raw bytes. Returns 32 bytes. */
export function keccak256(input: Uint8Array): Uint8Array {
    // Multi-rate padding: 0x01 ... 0x80 (original Keccak, as used by Ethereum).
    const padded = new Uint8Array(Math.floor(input.length / RATE) * RATE + RATE);
    padded.set(input);
    padded[input.length] = 0x01;
    padded[padded.length - 1] |= 0x80;

    const s = new Array<bigint>(25).fill(0n);
    for (let block = 0; block < padded.length; block += RATE) {
        for (let i = 0; i < RATE / 8; i++) {
            let lane = 0n;
            for (let byte = 7; byte >= 0; byte--) {
                lane = (lane << 8n) | BigInt(padded[block + i * 8 + byte]);
            }
            s[i] ^= lane;
        }
        keccakF(s);
    }

    const out = new Uint8Array(32);
    for (let i = 0; i < 4; i++) {
        let lane = s[i];
        for (let byte = 0; byte < 8; byte++) {
            out[i * 8 + byte] = Number(lane & 0xffn);
            lane >>= 8n;
        }
    }
    return out;
}

/** Keccak-256 of a UTF-8 string. */
export function keccak256Utf8(input: string): Uint8Array {
    return keccak256(new TextEncoder().encode(input));
}
