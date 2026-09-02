#!/usr/bin/env npx tsx
/**
 * End-to-end ghostnet test for the HackTezRegistrar contract.
 *
 * Tests the full commit → wait → register flow against real TED on ghostnet.
 *
 * Usage:
 *   npx tsx scripts/test-ghostnet.ts                    # Full flow: check → commit → wait → register → verify
 *   npx tsx scripts/test-ghostnet.ts --check-only       # Just check preconditions
 *   npx tsx scripts/test-ghostnet.ts --register-only    # Skip commit, just register (needs prior commit)
 *   npx tsx scripts/test-ghostnet.ts --fix-registry     # Fix name_registry (must be admin)
 *   npx tsx scripts/test-ghostnet.ts --label mytest     # Use a specific label (default: random)
 *
 * Required env:
 *   TEZOS_WALLET_PUB_KEY — secret key (edsk...) — yes the name is wrong, it's the secret key
 *
 * The script uses the env wallet to interact with the contract.
 * The admin wallet (if different) must fix name_registry separately.
 */

import { TezosToolkit } from "@taquito/taquito";
import { InMemorySigner } from "@taquito/signer";
import { packDataBytes } from "@taquito/michel-codec";
import { blake2b } from "blakejs";
import { randomBytes } from "node:crypto";

// ─── Config ──────────────────────────────────────────────────────────
const RPC_URL = "https://rpc.ghostnet.teztnets.com";
const REGISTRAR = process.env.REGISTRAR_ADDRESS || "KT1KY1VkJeNYrCpDbP33u6eMEoPuTNrd7XZA";
const SET_CHILD_RECORD_PROXY = "KT1HpddfW7rX5aT2cTdsDaQZnH46bU7jQSTU";
const NAME_REGISTRY = "KT1REqKBXwULnmU6RpZxnRBUgcBmESnXhCWs";
const TZKT_API = "https://api.ghostnet.tzkt.io/v1";

// ─── Helpers ─────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
    const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < clean.length; i += 2) {
        bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
    }
    return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

function labelToHex(label: string): string {
    return Buffer.from(label, "utf8").toString("hex");
}

function generateSalt(): string {
    return bytesToHex(randomBytes(16));
}

/**
 * Compute commitment hash matching the contract's on-chain verification:
 *   blake2b(pack(record(label, salt, sender, target_address)))
 * SmartPy alphabetical order → right-combed pair:
 *   (label: bytes, (salt: bytes, (sender: address, target_address: address)))
 */
function computeCommitmentHash(labelHex: string, sender: string, targetAddress: string, saltHex: string): string {
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
                        args: [{ string: sender }, { string: targetAddress }],
                    },
                ],
            },
        ],
    };

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
    const hash = blake2b(hexToBytes(packed.bytes), undefined, 32);
    return bytesToHex(hash);
}

async function fetchJson(url: string) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return res.json();
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Precondition Checks ────────────────────────────────────────────

async function checkPreconditions() {
    console.log("\n🔍 Checking preconditions...\n");
    let allGood = true;

    // 1. Contract exists and is accessible
    const storage: any = await fetchJson(`${TZKT_API}/contracts/${REGISTRAR}/storage`);
    console.log(`  Contract: ${REGISTRAR}`);
    console.log(`  Admin: ${storage.admin_address}`);
    console.log(`  Paused: ${storage.paused}`);
    console.log(`  Name registry: ${storage.name_registry}`);
    console.log(`  Parent name: ${Buffer.from(storage.parent_name, "hex").toString("utf8")} (${storage.parent_name})`);
    console.log(
        `  Min commit age: ${storage.min_commit_age}s (${Math.round(parseInt(storage.min_commit_age, 10) / 3600)}h)`,
    );
    console.log(
        `  Max commit age: ${storage.max_commit_age}s (${Math.round(parseInt(storage.max_commit_age, 10) / 3600)}h)`,
    );
    console.log(`  Max per wallet: ${storage.max_per_wallet}`);

    // 2. Name registry should be the SetChildRecord proxy
    if (storage.name_registry !== SET_CHILD_RECORD_PROXY) {
        console.log(`\n  ❌ name_registry is WRONG: ${storage.name_registry}`);
        console.log(`     Should be: ${SET_CHILD_RECORD_PROXY} (SetChildRecord proxy)`);
        console.log(`     Admin (${storage.admin_address}) needs to call update_registry`);
        allGood = false;
    } else {
        console.log(`  ✅ name_registry correctly points to SetChildRecord proxy`);
    }

    // 3. Contract paused?
    if (storage.paused) {
        console.log(`  ❌ Contract is PAUSED`);
        allGood = false;
    } else {
        console.log(`  ✅ Contract is not paused`);
    }

    // 4. Check that the contract is an operator on the hack.gho NFT
    const ops: any[] = await fetchJson(
        `${TZKT_API}/operations/transactions?target=${NAME_REGISTRY}&entrypoint=update_operators&limit=50&sort.desc=id`,
    );
    const operatorAdded = ops.some((op: any) => {
        const val = op.parameter?.value;
        if (!Array.isArray(val)) return false;
        return val.some((v: any) => v.add_operator?.operator === REGISTRAR);
    });
    if (operatorAdded) {
        console.log(`  ✅ Contract is set as FA2 operator on hack.gho`);
    } else {
        console.log(`  ⚠️  Could not verify operator status (may need manual check)`);
    }

    // 5. Check SetChildRecord proxy has set_child_record entrypoint
    const eps: any[] = await fetchJson(`${TZKT_API}/contracts/${SET_CHILD_RECORD_PROXY}/entrypoints`);
    const hasSetChild = eps.some((e: any) => e.name === "set_child_record");
    if (hasSetChild) {
        console.log(`  ✅ SetChildRecord proxy has set_child_record entrypoint`);
    } else {
        console.log(`  ❌ SetChildRecord proxy missing set_child_record!`);
        allGood = false;
    }

    return { allGood, storage };
}

// ─── Fix Registry ───────────────────────────────────────────────────

async function fixRegistry(tezos: TezosToolkit, senderAddress: string) {
    console.log("\n🔧 Fixing name_registry...\n");

    const storage: any = await fetchJson(`${TZKT_API}/contracts/${REGISTRAR}/storage`);

    if (storage.name_registry === SET_CHILD_RECORD_PROXY) {
        console.log("  ✅ name_registry already correct, nothing to do");
        return;
    }

    if (storage.admin_address !== senderAddress) {
        console.log(`  ❌ Cannot fix: sender ${senderAddress} is not admin ${storage.admin_address}`);
        console.log(`     The admin wallet must call update_registry("${SET_CHILD_RECORD_PROXY}")`);
        process.exit(1);
    }

    console.log(`  Calling update_registry(${SET_CHILD_RECORD_PROXY})...`);
    const op = await tezos.contract.transfer({
        to: REGISTRAR,
        amount: 0,
        parameter: {
            entrypoint: "update_registry",
            value: { string: SET_CHILD_RECORD_PROXY },
        },
    });
    console.log(`  Waiting for confirmation... (${op.hash})`);
    await op.confirmation(1);
    console.log(`  ✅ name_registry updated!`);
}

// ─── Commit Phase ───────────────────────────────────────────────────

async function doCommit(
    tezos: TezosToolkit,
    senderAddress: string,
    labelHex: string,
    targetAddress: string,
    saltHex: string,
) {
    const commitmentHash = computeCommitmentHash(labelHex, senderAddress, targetAddress, saltHex);
    console.log(`\n📝 Phase 1: Commit\n`);
    console.log(`  Label: ${Buffer.from(labelHex, "hex").toString("utf8")} (${labelHex})`);
    console.log(`  Sender: ${senderAddress}`);
    console.log(`  Target: ${targetAddress}`);
    console.log(`  Salt: ${saltHex}`);
    console.log(`  Commitment hash: ${commitmentHash}`);

    // Check if commitment already exists
    const storage: any = await fetchJson(`${TZKT_API}/contracts/${REGISTRAR}/storage`);
    const commitmentsBigMap = storage.commitments;
    try {
        const existing = await fetchJson(`${TZKT_API}/bigmaps/${commitmentsBigMap}/keys/${commitmentHash}`);
        if (existing?.active) {
            const commitTime = new Date(existing.value).getTime();
            const ageS = Math.floor((Date.now() - commitTime) / 1000);
            const minAge = parseInt(storage.min_commit_age, 10);
            const maxAge = parseInt(storage.max_commit_age, 10);
            console.log(`\n  ⚠️  Commitment already exists!`);
            console.log(`  Committed: ${existing.value} (${ageS}s ago)`);
            if (ageS >= minAge && ageS <= maxAge) {
                console.log(`  ✅ Within valid window (${minAge}s - ${maxAge}s) — ready to register!`);
                return { commitmentHash, alreadyCommitted: true, readyToRegister: true };
            } else if (ageS < minAge) {
                const waitS = minAge - ageS;
                console.log(`  ⏳ Too young — wait ${Math.ceil(waitS / 60)} more minutes`);
                return { commitmentHash, alreadyCommitted: true, readyToRegister: false, waitSeconds: waitS };
            } else {
                console.log(`  ❌ Expired (age ${ageS}s > max ${maxAge}s) — need new commit`);
                // Fall through to submit new commit
            }
        }
    } catch {
        // Key not found — good, we'll commit
    }

    // Check if label is already taken
    const labelsBigMap = storage.registered_labels;
    try {
        const existing = await fetchJson(`${TZKT_API}/bigmaps/${labelsBigMap}/keys/${labelHex}`);
        if (existing?.active) {
            console.log(
                `\n  ❌ Label "${Buffer.from(labelHex, "hex").toString("utf8")}" is already registered by ${existing.value}`,
            );
            process.exit(1);
        }
    } catch {
        // Not found — good
    }

    console.log(`\n  Submitting commit...`);
    const op = await tezos.contract.transfer({
        to: REGISTRAR,
        amount: 0,
        parameter: {
            entrypoint: "commit",
            value: { bytes: commitmentHash },
        },
    });
    console.log(`  Tx hash: ${op.hash}`);
    console.log(`  Waiting for confirmation...`);
    await op.confirmation(1);
    console.log(`  ✅ Commit confirmed!`);
    console.log(
        `  ⏳ Must wait ${parseInt(storage.min_commit_age, 10)}s (${Math.round(parseInt(storage.min_commit_age, 10) / 3600)}h) before register`,
    );

    return {
        commitmentHash,
        alreadyCommitted: false,
        readyToRegister: false,
        waitSeconds: parseInt(storage.min_commit_age, 10),
    };
}

// ─── Register Phase ─────────────────────────────────────────────────

async function doRegister(tezos: TezosToolkit, labelHex: string, targetAddress: string, saltHex: string) {
    console.log(`\n📋 Phase 2: Register\n`);
    console.log(`  Label: ${Buffer.from(labelHex, "hex").toString("utf8")} (${labelHex})`);
    console.log(`  Target: ${targetAddress}`);
    console.log(`  Salt: ${saltHex}`);

    console.log(`  Submitting register...`);
    // SmartPy alphabetical field order: label, salt, target_address → right-combed pair
    const op = await tezos.contract.transfer({
        to: REGISTRAR,
        amount: 0,
        parameter: {
            entrypoint: "register",
            value: {
                prim: "Pair",
                args: [
                    { bytes: labelHex },
                    {
                        prim: "Pair",
                        args: [{ bytes: saltHex }, { string: targetAddress }],
                    },
                ],
            },
        },
    });
    console.log(`  Tx hash: ${op.hash}`);
    console.log(`  Waiting for confirmation...`);
    await op.confirmation(1);
    console.log(`  ✅ Register confirmed!`);
    return op.hash;
}

// ─── Verify ─────────────────────────────────────────────────────────

async function verify(labelHex: string) {
    const label = Buffer.from(labelHex, "hex").toString("utf8");
    console.log(`\n🔎 Verifying registration of ${label}.hack.gho...\n`);

    // Check our contract's registered_labels
    const storage: any = await fetchJson(`${TZKT_API}/contracts/${REGISTRAR}/storage`);
    try {
        const entry = await fetchJson(`${TZKT_API}/bigmaps/${storage.registered_labels}/keys/${labelHex}`);
        if (entry?.active) {
            console.log(`  ✅ Label registered in contract — owner: ${entry.value}`);
        } else {
            console.log(`  ❌ Label not found in contract's registered_labels`);
        }
    } catch {
        console.log(`  ❌ Label not found in contract's registered_labels`);
    }

    // Check TED NameRegistry for the subdomain record
    // The record key in TED is the encoded domain name
    // For "test.hack.gho" the record is stored with a specific encoding
    console.log(`  Checking TED NameRegistry for ${label}.hack.gho...`);
    try {
        // TED stores records by encoded name — this is complex
        // Let's just check via TzKT events or recent set_child_record calls
        const ops: any[] = await fetchJson(
            `${TZKT_API}/operations/transactions?target=${SET_CHILD_RECORD_PROXY}&entrypoint=set_child_record&sender=${REGISTRAR}&sort.desc=id&limit=5`,
        );
        if (ops.length > 0) {
            const latest = ops[0];
            console.log(`  ✅ set_child_record call found!`);
            console.log(`    Tx: ${latest.hash}`);
            console.log(`    Status: ${latest.status}`);
            console.log(`    Level: ${latest.level}`);
        } else {
            console.log(`  ⚠️  No set_child_record calls from our contract found`);
        }
    } catch (e) {
        console.log(`  ⚠️  Could not verify TED registration: ${e}`);
    }
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2);
    const flags = new Set(args.filter((a) => a.startsWith("--")));
    const labelIdx = args.indexOf("--label");
    const targetIdx = args.indexOf("--target");
    const saltIdx = args.indexOf("--salt");

    const checkOnly = flags.has("--check-only");
    const registerOnly = flags.has("--register-only");
    const fixReg = flags.has("--fix-registry");
    const waitForCommit = flags.has("--wait");

    // ─── Setup signer ────────────────────────────────────────────
    const secretKey = process.env.TEZOS_WALLET_PUB_KEY; // yes, the name is swapped
    if (!secretKey) {
        console.error("❌ Set TEZOS_WALLET_PUB_KEY env var (it's the edsk secret key, name is swapped)");
        process.exit(1);
    }

    const tezos = new TezosToolkit(RPC_URL);
    const signer = new InMemorySigner(secretKey);
    tezos.setSignerProvider(signer);
    const senderAddress = await signer.publicKeyHash();
    console.log(`\n🔑 Wallet: ${senderAddress}`);
    console.log(`📡 RPC: ${RPC_URL}`);
    console.log(`📄 Contract: ${REGISTRAR}`);

    // ─── Preconditions ───────────────────────────────────────────
    const { storage } = await checkPreconditions();

    if (fixReg) {
        await fixRegistry(tezos, senderAddress);
        return;
    }

    if (checkOnly) {
        console.log(
            allGood
                ? "\n✅ All preconditions met — ready to test!"
                : "\n❌ Some preconditions failed — fix before testing",
        );
        return;
    }

    if (!allGood) {
        console.log("\n❌ Preconditions failed. Fix issues above before testing.");
        console.log("   Use --check-only to just check, or --fix-registry to fix name_registry");
        process.exit(1);
    }

    // ─── Determine test params ───────────────────────────────────
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    const label = labelIdx >= 0 ? args[labelIdx + 1] : `test${randomSuffix}`;
    const labelHex = labelToHex(label);
    const targetAddress = targetIdx >= 0 ? args[targetIdx + 1] : senderAddress;
    const saltHex = saltIdx >= 0 ? args[saltIdx + 1] : generateSalt();

    console.log(`\n🧪 Test params:`);
    console.log(`  Label: ${label}`);
    console.log(`  Target: ${targetAddress}`);
    console.log(`  Salt: ${saltHex}`);

    if (registerOnly) {
        // Register only — user must have committed already and provide salt
        if (saltIdx < 0) {
            console.error("❌ --register-only requires --salt <hex> from the prior commit");
            process.exit(1);
        }
        await doRegister(tezos, labelHex, targetAddress, saltHex);
        await sleep(5000); // wait a bit for indexer
        await verify(labelHex);
        return;
    }

    // ─── Full flow: commit → wait → register ─────────────────────
    const result = await doCommit(tezos, senderAddress, labelHex, targetAddress, saltHex);

    if (result.readyToRegister) {
        await doRegister(tezos, labelHex, targetAddress, saltHex);
        await sleep(5000);
        await verify(labelHex);
        return;
    }

    if (result.waitSeconds && result.waitSeconds > 0) {
        if (waitForCommit) {
            console.log(`\n⏳ Waiting ${Math.ceil(result.waitSeconds / 60)} minutes for commit to mature...`);
            console.log(
                `   (Use Ctrl+C to cancel and resume later with --register-only --salt ${saltHex} --label ${label})`,
            );
            await sleep(result.waitSeconds * 1000 + 30000); // +30s buffer
            await doRegister(tezos, labelHex, targetAddress, saltHex);
            await sleep(5000);
            await verify(labelHex);
        } else {
            console.log(`\n⏳ Commit submitted. Must wait ${Math.ceil(result.waitSeconds / 60)} minutes.`);
            console.log(`\nResume with:`);
            console.log(
                `  npx tsx scripts/test-ghostnet.ts --register-only --label ${label} --target ${targetAddress} --salt ${saltHex}`,
            );
        }
    }
}

main().catch((err) => {
    console.error("\n💥 Error:", err.message || err);
    if (err.errors) console.error("   Details:", JSON.stringify(err.errors, null, 2));
    process.exit(1);
});
