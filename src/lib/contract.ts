/**
 * HackTezRegistrar contract interaction helpers
 * Following BCD pattern: DAppClient.requestOperation() with raw Michelson
 *
 * Two-phase commit-reveal registration:
 *   1. commit(hash) — submit blake2b(pack(label, sender, target, salt))
 *   2. wait ≥ min_commit_age
 *   3. register(label, target_address, salt) — reveal and register
 *
 * After registration, user owns the TED record and manages it via Tezos Domains.
 */
import { DAppClient, TezosOperationType } from "@tezos-x/octez.connect-sdk";
import { computeCommitmentHash } from "./commitment";
import config from "../config/tezos";

/**
 * Convert a string label to hex bytes for the contract.
 */
export function labelToHexBytes(label: string): string {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(label);
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * Generate a random salt (16 bytes, hex-encoded).
 */
export function generateSalt(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * Phase 1: Compute commitment hash and submit it to the contract.
 * Returns the hash and operation result so the caller can store the salt.
 */
export async function submitCommit(
    client: DAppClient,
    params: { labelHex: string; sender: string; targetAddress: string; saltHex: string },
) {
    const commitmentHash = computeCommitmentHash(params.labelHex, params.sender, params.targetAddress, params.saltHex);

    const result = await client.requestOperation({
        operationDetails: [
            {
                kind: TezosOperationType.TRANSACTION,
                destination: config.registrarAddress,
                amount: "0",
                parameters: {
                    entrypoint: "commit",
                    value: { bytes: commitmentHash },
                },
            },
        ],
    });
    return { ...result, commitmentHash };
}

/**
 * Phase 2: Reveal and register after the commit waiting period.
 * SmartPy alphabetical field order: (label, (salt, target_address))
 */
export async function submitRegister(
    client: DAppClient,
    params: { label: string; targetAddress: string; salt: string },
) {
    const result = await client.requestOperation({
        operationDetails: [
            {
                kind: TezosOperationType.TRANSACTION,
                destination: config.registrarAddress,
                amount: "0",
                parameters: {
                    entrypoint: "register",
                    value: {
                        prim: "Pair",
                        args: [
                            { bytes: params.label },
                            {
                                prim: "Pair",
                                args: [{ bytes: params.salt }, { string: params.targetAddress }],
                            },
                        ],
                    },
                },
            },
        ],
    });
    return result;
}

export async function submitReleaseCommitment(client: DAppClient) {
    const result = await client.requestOperation({
        operationDetails: [
            {
                kind: TezosOperationType.TRANSACTION,
                destination: config.registrarAddress,
                amount: "0",
                parameters: {
                    entrypoint: "release_commitment",
                    value: { prim: "Unit" },
                },
            },
        ],
    });
    return result;
}
