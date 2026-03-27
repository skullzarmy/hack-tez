/**
 * Deploy HackTezRegistrar to Ghostnet (or Mainnet) via Taquito.
 *
 * Usage:
 *   npx tsx contract/deploy.ts --code contract/hack_tez_registrar.tz --storage contract/hack_tez_registrar_storage.tz
 *
 * Required env vars:
 *   DEPLOYER_SK  — secret key (edsk...) for the deploying wallet (admin)
 *
 * Optional env vars:
 *   TEZOS_RPC    — RPC endpoint (default: https://rpc.ghostnet.teztnets.com)
 *   STORAGE_LIMIT — storage limit for origination (default: 20000)
 *
 * Steps before running:
 *   1. Compile in SmartPy IDE → Download Michelson (.tz) files
 *   2. Place code file and storage file in contract/
 *   3. Fund your ghostnet wallet: https://faucet.ghostnet.teztnets.com/
 *   4. Export DEPLOYER_SK=edsk... (your ghostnet private key)
 *   5. npx tsx contract/deploy.ts --code <path> --storage <path>
 *
 * The script sets storageLimit=20000 by default to avoid
 * the "storage_exhausted" error from SmartPy IDE's tight defaults.
 */

import { TezosToolkit } from "@taquito/taquito";
import { InMemorySigner } from "@taquito/signer";
import { readFileSync } from "fs";
import { parseArgs } from "util";

const { values } = parseArgs({
    options: {
        code: { type: "string" },
        storage: { type: "string" },
        rpc: { type: "string", default: process.env.TEZOS_RPC || "https://rpc.ghostnet.teztnets.com" },
        "storage-limit": { type: "string", default: process.env.STORAGE_LIMIT || "20000" },
    },
});

async function main() {
    const secretKey = process.env.DEPLOYER_SK;
    if (!secretKey) {
        console.error("❌ Set DEPLOYER_SK env var to your deployer secret key (edsk...)");
        process.exit(1);
    }
    if (!values.code || !values.storage) {
        console.error("❌ Usage: npx tsx contract/deploy.ts --code <file.tz> --storage <file.tz>");
        process.exit(1);
    }

    const rpcUrl = values.rpc!;
    const storageLimit = parseInt(values["storage-limit"]!, 10);
    const code = readFileSync(values.code, "utf-8");
    const init = readFileSync(values.storage, "utf-8");

    console.log(`🌐 RPC: ${rpcUrl}`);
    console.log(`📦 Storage limit: ${storageLimit}`);
    console.log(`📄 Code file: ${values.code} (${code.length} chars)`);
    console.log(`📄 Storage file: ${values.storage} (${init.length} chars)`);

    const tezos = new TezosToolkit(rpcUrl);
    tezos.setProvider({ signer: new InMemorySigner(secretKey) });

    const pkh = await tezos.signer.publicKeyHash();
    const balance = await tezos.tz.getBalance(pkh);
    console.log(`👛 Deployer: ${pkh}`);
    console.log(`💰 Balance: ${balance.toNumber() / 1_000_000} ꜩ`);

    if (balance.toNumber() < 2_000_000) {
        console.error("⚠️  Low balance. Origination needs ~2-5 ꜩ for storage burn.");
        console.error("   Faucet: https://faucet.ghostnet.teztnets.com/");
    }

    console.log("\n🚀 Originating contract...");

    try {
        const op = await tezos.contract.originate({
            code,
            init,
            storageLimit,
        });

        console.log(`⏳ Waiting for confirmation... (op hash: ${op.hash})`);
        const contract = await op.contract();

        console.log(`\n✅ Contract originated!`);
        console.log(`   Address: ${contract.address}`);
        console.log(`   Op hash: ${op.hash}`);
        console.log(`\n📋 Next steps:`);
        console.log(`   1. Set VITE_REGISTRAR_ADDRESS=${contract.address} in your .env`);
        console.log(`   2. Verify on TzKT: https://ghostnet.tzkt.io/${contract.address}`);
        console.log(`   3. Transfer hack.gho ownership to ${contract.address} via TED`);
    } catch (err: unknown) {
        console.error("\n❌ Origination failed:");
        if (err instanceof Error) {
            console.error(err.message);
            if (err.message.includes("storage_exhausted")) {
                console.error("\n💡 Try increasing --storage-limit (current: " + storageLimit + ")");
                console.error("   Example: --storage-limit 40000");
            }
            if (err.message.includes("balance_too_low")) {
                console.error("\n💡 Need more ꜩ. Faucet: https://faucet.ghostnet.teztnets.com/");
            }
        } else {
            console.error(err);
        }
        process.exit(1);
    }
}

main();
