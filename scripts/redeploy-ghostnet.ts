#!/usr/bin/env npx tsx
/**
 * Deploy HackTezRegistrar v2 to ghostnet.
 *
 * v2 changes: owner=sp.sender, no registered_labels, max_per_wallet=1
 * Uses locally compiled SmartPy Michelson (not fetched from old contract).
 *
 * Usage:
 *   # Compile contract first:
 *   SMARTPY_OUTPUT_DIR=contract/output python3 contract/hack_tez_registrar.py
 *
 *   # Then deploy:
 *   source .env && npx tsx scripts/redeploy-ghostnet.ts
 *
 * After deployment:
 *   1. Add the NEW contract as operator on hack.gho NFT from tz1Qi77... wallet
 *   2. Update src/config/tezos.ts with the new KT1 address
 *   3. Run: npx tsx scripts/test-ghostnet.ts --check-only
 */

import { TezosToolkit, MichelsonMap } from "@taquito/taquito";
import { InMemorySigner } from "@taquito/signer";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ─── Config ──────────────────────────────────────────────────────────
const RPC_URL = "https://rpc.ghostnet.teztnets.com";
const SET_CHILD_RECORD_PROXY = "KT1HpddfW7rX5aT2cTdsDaQZnH46bU7jQSTU";

// Path to compiled Michelson JSON from SmartPy (any test dir has the contract)
const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTRACT_JSON = resolve(__dirname, "../contract/output/Commit/step_001_cont_0_contract.json");

async function main() {
    // ─── Setup signer ────────────────────────────────────────────
    const secretKey = process.env.TEZOS_WALLET_PUB_KEY; // name is swapped in .env
    if (!secretKey) {
        console.error("❌ Set TEZOS_WALLET_PUB_KEY env var (the edsk secret key)");
        process.exit(1);
    }

    const tezos = new TezosToolkit(RPC_URL);
    const signer = new InMemorySigner(secretKey);
    tezos.setSignerProvider(signer);
    const adminAddress = await signer.publicKeyHash();

    console.log(`\n🔑 Deployer/Admin: ${adminAddress}`);
    console.log(`📡 RPC: ${RPC_URL}`);

    // ─── Load compiled Michelson ─────────────────────────────────
    console.log(`\n📦 Loading compiled Michelson from ${CONTRACT_JSON}...`);
    const code = JSON.parse(readFileSync(CONTRACT_JSON, "utf-8"));
    console.log(`  ✅ Contract code loaded (${JSON.stringify(code).length} chars)`);

    // ─── Build initial storage ───────────────────────────────────
    // Storage field order (SmartPy alphabetical, right-combed pair):
    //   admin_address, commitments, max_commit_age, max_label_length,
    //   max_per_wallet, metadata, min_commit_age, min_label_length,
    //   name_registry, parent_name, paused, proposed_admin,
    //   registrations, whitelist, whitelist_enabled

    // TZIP-016 metadata pointing to on-chain metadata
    const metadata = new MichelsonMap<string, string>();
    const metadataJson = JSON.stringify({
        name: "HackTezRegistrar",
        version: "2.0.0",
        description: "Free sub-domain registrar for hack.gho on ghostnet. Owner=sender model.",
        interfaces: ["TZIP-016"],
    });
    metadata.set("", Buffer.from("tezos-storage:content").toString("hex"));
    metadata.set("content", Buffer.from(metadataJson).toString("hex"));

    const storage = {
        admin_address: adminAddress,
        commitments: new MichelsonMap(),
        max_commit_age: 86400,        // 24 hours
        max_label_length: 64,
        max_per_wallet: 1,
        metadata: metadata,
        min_commit_age: 30,            // 30s for ghostnet testing
        min_label_length: 3,
        name_registry: SET_CHILD_RECORD_PROXY,
        parent_name: "6861636b2e67686f",  // "hack.gho" in hex
        paused: false,
        pending_commitments: new MichelsonMap(),
        proposed_admin: null,
        registrations: new MichelsonMap(),
        whitelist: new MichelsonMap(),
        whitelist_enabled: false,
    };

    console.log(`\n📝 Initial storage:`);
    console.log(`  admin_address: ${storage.admin_address}`);
    console.log(`  name_registry: ${storage.name_registry}`);
    console.log(`  parent_name: hack.gho (${storage.parent_name})`);
    console.log(`  min_commit_age: ${storage.min_commit_age}s`);
    console.log(`  max_commit_age: ${storage.max_commit_age}s`);
    console.log(`  max_per_wallet: ${storage.max_per_wallet}`);

    // ─── Originate ───────────────────────────────────────────────
    console.log(`\n🚀 Originating contract...`);
    const op = await tezos.contract.originate({
        code: code,
        storage: storage,
        storageLimit: 20000,
    });

    console.log(`  Tx hash: ${op.hash}`);
    console.log(`  Waiting for confirmation...`);
    await op.confirmation(1);
    const contractAddress = (await op.contract()).address;

    console.log(`\n✅ Contract deployed!`);
    console.log(`  Address: ${contractAddress}`);
    console.log(`  Explorer: https://ghostnet.tzkt.io/${contractAddress}`);
    console.log(`  BCD: https://better-call.dev/ghostnet/${contractAddress}`);

    console.log(`\n📋 Next steps:`);
    console.log(`  1. From tz1Qi77... wallet, add ${contractAddress} as operator on hack.gho NFT:`);
    console.log(`     → NameRegistry: KT1REqKBXwULnmU6RpZxnRBUgcBmESnXhCWs`);
    console.log(`     → update_operators → add_operator(owner=tz1Qi77..., operator=${contractAddress}, token_id=3577)`);
    console.log(`  2. Update src/config/tezos.ts: registrarAddress = "${contractAddress}"`);
    console.log(`  3. Run: npx tsx scripts/test-ghostnet.ts --check-only`);
    console.log(`  4. Run: npx tsx scripts/test-ghostnet.ts --label testfoo`);
}

main().catch((err) => {
    console.error("\n💥 Error:", err.message || err);
    if (err.errors) console.error("   Details:", JSON.stringify(err.errors, null, 2));
    process.exit(1);
});
