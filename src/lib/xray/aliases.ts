/**
 * Tezos X alias derivation — the "shared resolution" math.
 *
 * Per https://x.tezos.com/docs/overview/accounts-and-aliases (verified
 * 2026-07-20, previewnet kernel v0.7):
 *
 *   evm_alias = keccak256(utf8(tz_address_base58check))[0:20]
 *   kt1_alias = KT1(blake2b_160(evm_address_bytes))
 *
 * Both directions are deterministic and computable off-chain. An alias may
 * be *derived* (address computable, no account on chain yet) or
 * *materialized* (account exists). Derivation says nothing about
 * materialization — check the chain (see index.ts queries).
 *
 * If a kernel release ever changes these formulas, this file and the
 * tezos-x skill are the two places to update.
 */
import { b58Encode, PrefixV2, validateAddress, ValidationResult } from "@taquito/utils";
import { blake2b } from "blakejs";
import { keccak256Utf8 } from "./keccak";

export type XrayInputKind = "tz" | "kt1" | "evm" | "invalid";

/** Classify a pasted string: implicit tz account, originated KT1, EVM 0x, or invalid. */
export function classifyAddress(raw: string): XrayInputKind {
    const s = raw.trim();
    if (/^0x[0-9a-fA-F]{40}$/.test(s)) return "evm";
    if (validateAddress(s) === ValidationResult.VALID) {
        return s.startsWith("KT1") ? "kt1" : "tz";
    }
    return "invalid";
}

function toHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

function fromHex(hex: string): Uint8Array {
    const clean = hex.replace(/^0x/, "");
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
}

/** EVM alias of a Tezos address (tz1/tz2/tz3 or KT1): first 20 bytes of the
 *  keccak256 of the base58check string form. Returns a lowercase 0x address. */
export function evmAliasOfTezos(tzAddress: string): string {
    const kind = classifyAddress(tzAddress);
    if (kind !== "tz" && kind !== "kt1") throw new Error(`not a Tezos address: ${tzAddress}`);
    return `0x${toHex(keccak256Utf8(tzAddress.trim()).slice(0, 20))}`;
}

/** Michelson (KT1) alias of an EVM address: blake2b-160 over the raw 20
 *  address bytes, base58check-encoded with the KT1 prefix. */
export function kt1AliasOfEvm(evmAddress: string): string {
    if (classifyAddress(evmAddress) !== "evm") throw new Error(`not an EVM address: ${evmAddress}`);
    const digest = blake2b(fromHex(evmAddress.trim()), undefined, 20);
    return b58Encode(digest, PrefixV2.ContractHash);
}

/** The identity pair for one native address: itself plus its alias on the
 *  other interface. A full four-corner "square" is two pairs (one per
 *  native address a user controls). */
export interface AliasPair {
    kind: "tz" | "kt1" | "evm";
    native: string;
    alias: string;
    /** Which interface the alias lives on. */
    aliasInterface: "evm" | "michelson";
}

export function derivePair(address: string): AliasPair {
    const kind = classifyAddress(address);
    if (kind === "invalid") throw new Error(`unrecognized address: ${address}`);
    if (kind === "evm") {
        return {
            kind,
            native: address.trim().toLowerCase(),
            alias: kt1AliasOfEvm(address),
            aliasInterface: "michelson",
        };
    }
    return { kind, native: address.trim(), alias: evmAliasOfTezos(address), aliasInterface: "evm" };
}
