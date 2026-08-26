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
import { PROFILE_KEY_MAP, profileToDataEntries } from "../types/profile";
import config, { getTedContracts } from "../config/tezos";

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
 * Fetch the raw data map for a domain record from TzKT bigmap.
 * Returns a Map<string, string> of key → hex bytes, preserving
 * every entry byte-for-byte (no JSON roundtrip through TED GraphQL).
 */
async function fetchRawDataMap(
    nameRegistry: string,
    fullName: string,
): Promise<{ data: Map<string, string>; owner: string; address: string | null }> {
    const nameHex = labelToHexBytes(fullName);
    const url = `${config.tzktApi}/v1/contracts/${nameRegistry}/bigmaps/store.records/keys/${nameHex}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch raw record for ${fullName}`);
    const item: {
        value: {
            owner: string;
            address: string | null;
            data: Record<string, string>;
        };
    } = await res.json();
    const data = new Map<string, string>();
    for (const [key, hexVal] of Object.entries(item.value.data)) {
        data.set(key, hexVal);
    }
    return { data, owner: item.value.owner, address: item.value.address };
}

/**
 * Update a domain's profile data via the TED UpdateRecord proxy.
 *
 * Safe merge: reads the raw on-chain data map from TzKT (hex bytes),
 * applies only the keys the profile update touches, and preserves
 * all other keys byte-for-byte — no lossy JSON roundtrip.
 *
 * Null values in the profile signal deletion of the corresponding data key.
 */
export async function submitProfileUpdate(
    label: string,
    profile: Partial<HackProfile>,
    client: DAppClient,
): Promise<string> {
    const ted = await getTedContracts();
    const proxyAddress = ted.updateRecord;
    if (!proxyAddress) {
        throw new Error(`UpdateRecord proxy not found for ${config.name}`);
    }

    const fullName = `${label}.hack.${config.tld}`;

    // Only the keys the editor touched; every other key is preserved
    // byte-for-byte by buildUpdateRecordOp.
    const changes = new Map<string, string | null>(
        profileToDataEntries(profile).map(({ key, value }) => [key, value]),
    );

    const op = await buildUpdateRecordOp(
        fullName,
        changes,
        proxyAddress,
        ted.nameRegistry,
    );
    const result = await client.requestOperation({ operationDetails: [op] });

    return result.transactionHash;
}

/**
 * Build one `update_record` operation that merges `changes` into a domain's
 * TED data map. Extracted from submitProfileUpdate so several domains can be
 * changed inside a single wallet confirmation.
 *
 * `changes` values are already-JSON-encoded strings, or null to delete the key.
 * Every other key is preserved byte-for-byte.
 */
async function buildUpdateRecordOp(
    fullName: string,
    changes: Map<string, string | null>,
    proxyAddress: string,
    nameRegistry: string,
) {
    const raw = await fetchRawDataMap(nameRegistry, fullName);
    const mergedHex = new Map(raw.data);
    for (const [key, value] of changes) {
        if (value === null) mergedHex.delete(key);
        else mergedHex.set(key, stringToHex(value));
    }

    const dataMap = Array.from(mergedHex.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, hexValue]) => ({
            prim: "Elt" as const,
            args: [{ string: key }, { bytes: hexValue }],
        }));

    const addressArg = raw.address
        ? { prim: "Some" as const, args: [{ string: raw.address }] }
        : { prim: "None" as const };

    // `as const` on the prims is load-bearing: inlined in requestOperation the
    // literals were contextually typed, but extracted they widen to `string`
    // and no longer satisfy MichelineMichelsonV1Expression.
    return {
        kind: "transaction" as TezosOperationType.TRANSACTION,
        destination: proxyAddress,
        amount: "0",
        parameters: {
            entrypoint: "update_record",
            value: {
                prim: "Pair" as const,
                args: [
                    { bytes: labelToHexBytes(fullName) },
                    {
                        prim: "Pair" as const,
                        args: [
                            addressArg,
                            {
                                prim: "Pair" as const,
                                args: [{ string: raw.owner }, dataMap],
                            },
                        ],
                    },
                ],
            },
        },
    };
}

/** Cap on how many stale markers we clear in one batch, to bound gas. */
const MAX_PRIMARY_CLEARS = 4;

/**
 * Set `label` as the wallet's primary hack.tez domain.
 *
 * Batches the clear of every currently-marked domain together with the set,
 * so the whole switch is ONE wallet confirmation. Without the clear, two live
 * markers would fall to the lexicographic tie-break and the user's newest
 * choice could lose to alphabetical order.
 *
 * The marker value is the owner's own address, so it stops counting the moment
 * the domain is transferred (see `resolvePrimary`).
 */
export async function submitSetPrimary(
    label: string,
    clearLabels: string[],
    client: DAppClient,
): Promise<string> {
    const ted = await getTedContracts();
    const proxyAddress = ted.updateRecord;
    if (!proxyAddress) {
        throw new Error(`UpdateRecord proxy not found for ${config.name}`);
    }

    const account = await client.getActiveAccount();
    if (!account?.address) throw new Error("No active wallet account");
    const owner = account.address;

    const key = PROFILE_KEY_MAP.primaryFor;
    const suffix = `.hack.${config.tld}`;

    const targets: Array<{ name: string; changes: Map<string, string | null> }> = [
        ...clearLabels
            .filter((l) => l !== label)
            .slice(0, MAX_PRIMARY_CLEARS)
            .map((l) => ({
                name: `${l}${suffix}`,
                changes: new Map<string, string | null>([[key, null]]),
            })),
        {
            name: `${label}${suffix}`,
            changes: new Map<string, string | null>([
                [key, JSON.stringify(owner)],
            ]),
        },
    ];

    const operationDetails = await Promise.all(
        targets.map((t) =>
            buildUpdateRecordOp(t.name, t.changes, proxyAddress, ted.nameRegistry),
        ),
    );

    const result = await client.requestOperation({ operationDetails });
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
    targetAddress?: string,
): Promise<string> {
    const ted = await getTedContracts();
    if (!ted.setChildRecord) {
        throw new Error(`SetChildRecord proxy not found for ${config.name}`);
    }

    const account = await client.getActiveAccount();
    if (!account?.address) {
        throw new Error("No active wallet account");
    }
    const owner = account.address;
    const resolveAddress = targetAddress || owner;

    const parentDomain = `${parentLabel}.hack.${config.tld}`;
    const labelHex = labelToHexBytes(childLabel);
    const parentHex = labelToHexBytes(parentDomain);

    const result = await client.requestOperation({
        operationDetails: [
            {
                kind: "transaction" as TezosOperationType.TRANSACTION,
                destination: ted.setChildRecord,
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
                                            { prim: "Some", args: [{ string: resolveAddress }] },
                                            {
                                                prim: "Pair",
                                                args: [
                                                    { string: owner },
                                                    {
                                                        prim: "Pair",
                                                        args: [
                                                            [],
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
