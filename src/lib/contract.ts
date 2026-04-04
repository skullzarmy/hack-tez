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
import type { DAppClient, TezosOperationType } from "@tezos-x/octez.connect-sdk";
import type { HackProfile } from "../types/profile";
import { profileToDataEntries } from "../types/profile";
import { getDomainRecord } from "./domains";
import config from "../config/tezos";

/**
 * Poll TzKT until an operation is confirmed on-chain.
 * Returns once the operation hash is indexed (included in a block).
 * Throws after `timeoutMs` if not confirmed.
 */
export async function waitForOperation(
    opHash: string,
    { pollMs = 3000, timeoutMs = 90_000 } = {},
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const res = await fetch(`${config.tzktApi}/v1/operations/${encodeURIComponent(opHash)}`);
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) return;
        }
        await new Promise((r) => setTimeout(r, pollMs));
    }
    throw new Error("Operation not confirmed within timeout");
}

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
    const { computeCommitmentHash } = await import("./commitment");
    const commitmentHash = computeCommitmentHash(params.labelHex, params.sender, params.targetAddress, params.saltHex);

    const result = await client.requestOperation({
        operationDetails: [
            {
                kind: "transaction" as TezosOperationType.TRANSACTION,
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
                kind: "transaction" as TezosOperationType.TRANSACTION,
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
                kind: "transaction" as TezosOperationType.TRANSACTION,
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

/**
 * Encode a UTF-8 string as hex bytes.
 * Reusable for domain names, data map values, etc.
 */
function stringToHex(str: string): string {
    const bytes = new TextEncoder().encode(str);
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * Update a domain's profile data via the TED UpdateRecord proxy.
 *
 * Safe merge: reads the current on-chain data map, applies only the keys
 * the profile update touches, and preserves all other keys byte-for-byte.
 *
 * Null values in the profile signal deletion of the corresponding data key.
 */
export async function submitProfileUpdate(
    label: string,
    profile: Partial<HackProfile>,
    client: DAppClient,
): Promise<string> {
    const proxyAddress = config.updateRecordProxy;
    if (!proxyAddress) {
        throw new Error(`No UpdateRecord proxy configured for ${config.name}`);
    }

    const fullName = `${label}.hack.${config.tld}`;

    // 1. Fetch current domain record (data map, address, owner)
    const record = await getDomainRecord(fullName);
    if (!record) {
        throw new Error(`Domain ${fullName} not found`);
    }

    // 2. Build existing data map from GraphQL
    //    TED returns JSON-parsed values — re-stringify for byte encoding
    const mergedData = new Map<string, string>();
    for (const { key, value } of record.data) {
        if (value != null) {
            mergedData.set(key, JSON.stringify(value));
        }
    }

    // 3. Safe merge: apply only the keys the profile editor touched
    const entries = profileToDataEntries(profile);
    for (const { key, value } of entries) {
        if (value === null) {
            mergedData.delete(key);
        } else {
            mergedData.set(key, value);
        }
    }

    // 4. Encode merged data as Michelson map (sorted by key for deterministic ordering)
    const dataMap = Array.from(mergedData.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => ({
            prim: "Elt" as const,
            args: [{ string: key }, { bytes: stringToHex(value) }],
        }));

    // 5. Build address option (preserve the current resolution address)
    const addressArg = record.address
        ? { prim: "Some" as const, args: [{ string: record.address }] }
        : { prim: "None" as const };

    // 6. Submit update_record to the TED UpdateRecord proxy
    //    Parameter type: pair bytes (pair (option address) (pair address (map string bytes)))
    const result = await client.requestOperation({
        operationDetails: [
            {
                kind: "transaction" as TezosOperationType.TRANSACTION,
                destination: proxyAddress,
                amount: "0",
                parameters: {
                    entrypoint: "update_record",
                    value: {
                        prim: "Pair",
                        args: [
                            { bytes: labelToHexBytes(fullName) },
                            {
                                prim: "Pair",
                                args: [
                                    addressArg,
                                    {
                                        prim: "Pair",
                                        args: [
                                            { string: record.owner },
                                            dataMap,
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                },
            },
        ],
    });

    return result.transactionHash;
}

/**
 * Create a sub-subdomain (e.g. myproject.joe.hack.tez).
 * Calls the TED SetChildRecord proxy — caller must own the parent domain.
 *
 * Layout: ("label", ("parent", ("address", ("owner", ("data", "expiry")))))
 */
export async function submitCreateSubdomain(
    parentLabel: string,
    childLabel: string,
    client: DAppClient,
    redirectUrl?: string,
): Promise<string> {
    const account = await client.getActiveAccount();
    if (!account?.address) {
        throw new Error("No active wallet account");
    }
    const owner = account.address;

    const parentDomain = `${parentLabel}.hack.${config.tld}`;
    const labelHex = labelToHexBytes(childLabel);
    const parentHex = labelToHexBytes(parentDomain);

    // Build data map entries (Michelson map = sorted list of Elt pairs)
    const dataEntries: { prim: "Elt"; args: [{ string: string }, { bytes: string }] }[] = [];
    if (redirectUrl) {
        dataEntries.push({
            prim: "Elt",
            args: [{ string: "web:redirect_url" }, { bytes: labelToHexBytes(redirectUrl) }],
        });
    }

    const result = await client.requestOperation({
        operationDetails: [
            {
                kind: "transaction" as TezosOperationType.TRANSACTION,
                destination: config.setChildRecordProxy,
                amount: "0",
                parameters: {
                    entrypoint: "set_child_record",
                    value: {
                        prim: "Pair",
                        args: [
                            { bytes: labelHex },
                            {
                                prim: "Pair",
                                args: [
                                    { bytes: parentHex },
                                    {
                                        prim: "Pair",
                                        args: [
                                            { prim: "Some", args: [{ string: owner }] },
                                            {
                                                prim: "Pair",
                                                args: [
                                                    { string: owner },
                                                    {
                                                        prim: "Pair",
                                                        args: [
                                                            dataEntries,
                                                            { prim: "None" },
                                                        ],
                                                    },
                                                ],
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                },
            },
        ],
    });
    return (result as { transactionHash: string }).transactionHash;
}
