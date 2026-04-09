#!/usr/bin/env npx tsx
/**
 * Deploy HackTezRegistrar to Tezos mainnet.
 *
 * Strategy for existing hack.tez subdomains:
 *   A) Pre-populate `registrations` and `claimed_labels` big_maps at origination
 *      by querying TED GraphQL.
 *   B) After deploy, re-query TED and call set_registration_count for any owners
 *      that slipped through between the pre-deploy query and block confirmation.
 *
 * Usage:
 *   # Compile contract first:
 *   SMARTPY_OUTPUT_DIR=contract/output python3 contract/hack_tez_registrar.py
 *
 *   # Then deploy:
 *   source .env && npx tsx scripts/deploy-mainnet.ts
 *
 *   # Dry run (no origination, no on-chain writes):
 *   source .env && npx tsx scripts/deploy-mainnet.ts --dry-run
 *
 * After deployment:
 *   1. Add the NEW contract as operator on hack.tez NFT from admin wallet
 *      → NameRegistry (FA2): KT1GBZmSxmnKJXGMdMLbugPfLyUPmuLSMwKS (or current mainnet registry)
 *      → update_operators → add_operator(owner=<admin>, operator=<newContract>, token_id=<hack.tez token_id>)
 *   2. Update src/config/tezos.ts: registrarAddress = "<newContract>"
 *   3. Update VITE_REGISTRAR_ADDRESS in Netlify env vars
 */

import { TezosToolkit, MichelsonMap } from "@taquito/taquito";
import { InMemorySigner } from "@taquito/signer";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ─── Config ──────────────────────────────────────────────────────────────────
const RPC_URL = "https://rpc.tzkt.io/mainnet";
const TZKT_API = "https://api.tzkt.io";
const TED_GRAPHQL = "https://api.tezos.domains/graphql";
const TED_CHECK_ADDRESS = "KT1F7JKNqwaoLzRsMio1MQC7zv3jG9dHcDdJ";
const TED_SET_CHILD_RECORD_PROXY = "KT1QHLk1EMUA8BPH3FvRUeUmbTspmAhb7kpd";
const PARENT_NAME_HEX = "6861636b2e74657a"; // "hack.tez"
const PARENT_SUFFIX = ".hack.tez";
const PAGE_SIZE = 50;
const MIN_COMMIT_AGE = 60; // seconds — higher than ghostnet for mainnet safety
const MAX_COMMIT_AGE = 86400; // 24 hours

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTRACT_JSON = resolve(__dirname, "../contract/output/Commit/step_001_cont_0_contract.json");

// ─── TED GraphQL helpers ──────────────────────────────────────────────────────

interface DomainItem {
    name: string;
    owner: string;
}

interface TedResolvedContracts {
    nameRegistry: string;
    setChildRecord: string;
}

interface SetRegistrationCountContract {
    methods: {
        set_registration_count: (
            wallet: string,
            count: number,
        ) => {
            send: () => Promise<{
                hash: string;
                confirmation: (confirmations?: number) => Promise<number>;
            }>;
        };
    };
}

async function resolveTedContracts(): Promise<TedResolvedContracts> {
    console.log("\n🔎 Resolving TED NameRegistry from CheckAddress...");
    const checkRes = await fetch(`${TZKT_API}/v1/contracts/${TED_CHECK_ADDRESS}/storage`);
    if (!checkRes.ok) {
        throw new Error(`Failed to fetch TED CheckAddress storage: HTTP ${checkRes.status}`);
    }
    const checkStorage = (await checkRes.json()) as { contract?: string };
    const nameRegistry = checkStorage.contract ?? "";
    if (!nameRegistry) {
        throw new Error("TED NameRegistry not found in CheckAddress storage");
    }

    console.log(`  ✅ NameRegistry:   ${nameRegistry}`);
    console.log(`  ✅ SetChildRecord: ${TED_SET_CHILD_RECORD_PROXY}`);
    return { nameRegistry, setChildRecord: TED_SET_CHILD_RECORD_PROXY };
}

async function fetchAllHackTezDomains(): Promise<{
    ownerCounts: Map<string, number>;
    claimedLabels: Map<string, string>;
    totalDomains: number;
}> {
    console.log("  Querying TED GraphQL for all current *.hack.tez domains...");
    const ownerCounts = new Map<string, number>();
    const claimedLabels = new Map<string, string>();
    let totalDomains = 0;
    let cursor: string | null = null;

    while (true) {
        const res = await fetch(TED_GRAPHQL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                query: `query HackTezOwners($suffix: String!, $first: Int!, $after: String) {
                    domains(
                        where: { name: { endsWith: $suffix } }
                        first: $first
                        after: $after
                    ) {
                        items { name owner }
                        pageInfo { hasNextPage endCursor }
                    }
                }`,
                variables: { suffix: PARENT_SUFFIX, first: PAGE_SIZE, after: cursor },
            }),
        });
        const json = (await res.json()) as {
            data?: {
                domains: {
                    items: DomainItem[];
                    pageInfo: { hasNextPage: boolean; endCursor: string | null };
                };
            };
            errors?: Array<{ message: string }>;
        };
        if (json.errors?.length) throw new Error(json.errors[0].message);
        if (!json.data) throw new Error("TED GraphQL returned no data");

        const items = json.data.domains.items;
        for (const { name, owner } of items) {
            const label = name.endsWith(PARENT_SUFFIX) ? name.slice(0, -PARENT_SUFFIX.length) : "";
            if (!label || label.includes(".")) continue;
            const labelHex = "0x" + Buffer.from(label, "utf8").toString("hex");
            claimedLabels.set(labelHex, owner);
            ownerCounts.set(owner, (ownerCounts.get(owner) ?? 0) + 1);
            totalDomains++;
        }

        const pageInfo = json.data.domains.pageInfo;
        console.log(`    Page after=${cursor ?? "<start>"}: fetched ${items.length} records`);
        if (!pageInfo.hasNextPage) break;
        cursor = pageInfo.endCursor;
    }

    console.log(`  Found ${ownerCounts.size} unique owner(s) across ${totalDomains} domain(s).`);
    return { ownerCounts, claimedLabels, totalDomains };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const args = new Set(process.argv.slice(2));
    const dryRun = args.has("--dry-run");

    const secretKey = process.env.TEZOS_WALLET_PUB_KEY;
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
    console.log(`🌐 Network: mainnet (hack.tez)`);
    console.log(`🧪 Mode: ${dryRun ? "DRY RUN (no origination)" : "LIVE DEPLOY"}`);

    const tedContracts = await resolveTedContracts();

    // ─── Load compiled Michelson ─────────────────────────────────────────
    console.log(`\n📦 Loading compiled Michelson from ${CONTRACT_JSON}...`);
    const code = JSON.parse(readFileSync(CONTRACT_JSON, "utf-8")) as unknown;
    console.log(`  ✅ Contract code loaded`);

    // ─── Step A: Pre-populate registrations + claimed_labels from TED ───
    console.log(`\n🔍 Step A: Fetching existing hack.tez snapshot from TED...`);
    const preDeploySnapshot = await fetchAllHackTezDomains();
    const preDeployOwners = preDeploySnapshot.ownerCounts;

    const registrations = new MichelsonMap<string, number>();
    for (const [owner, count] of preDeployOwners) {
        registrations.set(owner, count);
    }
    const claimedLabels = new MichelsonMap<string, string>();
    for (const [labelHex, owner] of preDeploySnapshot.claimedLabels) {
        claimedLabels.set(labelHex, owner);
    }
    console.log(`  ✅ Pre-populated registrations with ${preDeployOwners.size} wallet(s)`);
    console.log(`  ✅ Pre-populated claimed_labels with ${claimedLabels.size} label(s)`);

    // ─── Build storage ───────────────────────────────────────────────────
    const metadata = new MichelsonMap<string, string>();
    const metadataJson = JSON.stringify({
        name: "HackTezRegistrar",
        version: "3.0.0",
        description: "Free sub-domain registrar for hack.tez on mainnet.",
        interfaces: ["TZIP-016"],
    });
    metadata.set("", Buffer.from("tezos-storage:content").toString("hex"));
    metadata.set("content", Buffer.from(metadataJson).toString("hex"));

    const storage = {
        admin_address: adminAddress,
        claimed_labels: claimedLabels,
        commitments: new MichelsonMap(),
        max_commit_age: MAX_COMMIT_AGE,
        max_label_length: 64,
        max_per_wallet: 1,
        metadata,
        min_commit_age: MIN_COMMIT_AGE,
        min_label_length: 3,
        name_registry: tedContracts.setChildRecord,
        parent_name: PARENT_NAME_HEX,
        paused: false,
        pending_commitments: new MichelsonMap(),
        proposed_admin: null,
        registrations,
        whitelist: new MichelsonMap(),
        whitelist_enabled: false,
    };

    console.log(`\n📝 Initial storage:`);
    console.log(`  admin_address:  ${storage.admin_address}`);
    console.log(`  name_registry:  ${storage.name_registry}`);
    console.log(`  name_registry source: TED SetChildRecord proxy (stable)`);
    console.log(`  parent_name:    hack.tez (${storage.parent_name})`);
    console.log(`  min_commit_age: ${storage.min_commit_age}s`);
    console.log(`  max_commit_age: ${storage.max_commit_age}s`);
    console.log(`  max_per_wallet: ${storage.max_per_wallet}`);
    console.log(`  registrations:  ${preDeployOwners.size} pre-populated entries`);
    console.log(`  claimed_labels: ${claimedLabels.size} pre-populated entries`);

    if (dryRun) {
        console.log("\n🧪 Dry run complete.");
        console.log("  ✅ Signer loaded");
        console.log("  ✅ TED contracts resolved");
        console.log("  ✅ Contract code loaded");
        console.log("  ✅ Snapshot + storage prepared");
        console.log("  No origination was performed.");
        return;
    }

    // ─── Originate ───────────────────────────────────────────────────────
    console.log(`\n🚀 Originating contract...`);
    const op = await tezos.contract.originate({
        code: code as Parameters<typeof tezos.contract.originate>[0]["code"],
        storage,
        storageLimit: 60000,
    });

    console.log(`  Tx hash: ${op.hash}`);
    console.log(`  Waiting for confirmation...`);
    await op.confirmation(2); // 2 confirmations for mainnet safety
    const contractAddress = (await op.contract()).address;

    console.log(`\n✅ Contract deployed!`);
    console.log(`  Address:  ${contractAddress}`);
    console.log(`  Explorer: https://tzkt.io/${contractAddress}`);
    console.log(`  BCD:      https://better-call.dev/mainnet/${contractAddress}`);

    // ─── Step B: Safety sweep — catch owners who registered during deploy ─
    console.log(`\n🔍 Step B: Re-querying TED for any new owners since pre-deploy snapshot...`);
    const postDeploySnapshot = await fetchAllHackTezDomains();
    const postDeployOwners = postDeploySnapshot.ownerCounts;

    const newOwners: Array<{ address: string; count: number }> = [];
    for (const [owner, count] of postDeployOwners) {
        const pre = preDeployOwners.get(owner) ?? 0;
        if (count > pre) {
            newOwners.push({ address: owner, count });
        }
    }

    if (newOwners.length === 0) {
        console.log(`  ✅ No new owners detected — registrations big_map is fully up to date.`);
    } else {
        console.log(`  ⚠  ${newOwners.length} new owner(s) detected. Calling set_registration_count...`);
        const contract = (await tezos.contract.at(contractAddress)) as unknown as SetRegistrationCountContract;

        for (const { address: wallet, count } of newOwners) {
            console.log(`    → ${wallet} (count=${count})`);
            const updateOp = await contract.methods.set_registration_count(wallet, count).send();
            console.log(`      Tx: ${updateOp.hash} — waiting...`);
            await updateOp.confirmation(1);
            console.log(`      ✅ Done`);
        }

        console.log(`  ✅ Safety sweep complete — all ${newOwners.length} new owner(s) recorded.`);
    }

    // ─── Next steps ──────────────────────────────────────────────────────
    console.log(`\n📋 Next steps:`);
    console.log(`  1. Add ${contractAddress} as operator on the hack.tez NFT:`);
    console.log(`     → NameRegistry FA2 (check TED docs for current mainnet address)`);
    console.log(
        `     → update_operators → add_operator(owner=<admin>, operator=${contractAddress}, token_id=<hack.tez token_id>)`,
    );
    console.log(`  2. Update VITE_REGISTRAR_ADDRESS in Netlify env vars: "${contractAddress}"`);
    console.log(`  3. Update src/config/tezos.ts if registrarAddress is hardcoded`);
    console.log(`  4. Redeploy frontend`);
}

main().catch((err) => {
    console.error("\n💥 Error:", err.message || err);
    if ((err as { errors?: unknown }).errors)
        console.error("   Details:", JSON.stringify((err as { errors: unknown }).errors, null, 2));
    process.exit(1);
});
