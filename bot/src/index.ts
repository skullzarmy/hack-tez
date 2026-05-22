import { createBot, setupBot } from "./bot.ts";
import { initNotifier } from "./services/notifier.ts";
import { startPoller } from "./services/poller.ts";
import { NETWORK, POLL_INTERVAL_MS, ADMIN_USER_ID, BSKY_IDENTIFIER, BSKY_APP_PASSWORD } from "./config.ts";
import { hasPollCursor, setPollCursor } from "./db/index.ts";
import { fetchLatestClaimId, fetchLatestCommitId } from "./services/tzkt.ts";

const args = new Set(process.argv.slice(2));
const BOOTSTRAP_LATEST = args.has("--bootstrap-latest");
const ALLOW_COLD_START =
    args.has("--allow-cold-start") ||
    process.env.BOT_ALLOW_COLD_START === "1" ||
    process.env.BOT_ALLOW_COLD_START === "true";

async function bootstrapLatestCursors(): Promise<void> {
    console.log("🧭 Bootstrapping poll cursors to latest chain head...");
    const [latestClaimId, latestCommitId] = await Promise.all([fetchLatestClaimId(), fetchLatestCommitId()]);

    setPollCursor("last_claim_id", latestClaimId);
    setPollCursor("last_commit_id", latestCommitId);

    console.log(`  ✅ last_claim_id  = ${latestClaimId}`);
    console.log(`  ✅ last_commit_id = ${latestCommitId}`);
    console.log("  Done. Start bot normally to begin forward-only polling.");
}

async function main(): Promise<void> {
    if (BOOTSTRAP_LATEST) {
        await bootstrapLatestCursors();
        return;
    }

    console.log("🤖 hack.tez Bot starting…");
    console.log(`   Network:   ${NETWORK.name}`);
    console.log(`   Contract:  ${NETWORK.registrarAddress}`);
    console.log(`   TzKT API:  ${NETWORK.tzktApi}`);
    console.log(`   Poll:      ${POLL_INTERVAL_MS / 1000}s`);
    console.log(`   Admin ID:  ${ADMIN_USER_ID}`);
    if (BSKY_IDENTIFIER && BSKY_APP_PASSWORD) {
        console.log(`   Bluesky:   @${BSKY_IDENTIFIER} ✓`);
    } else {
        console.log(`   Bluesky:   not configured (set BSKY_IDENTIFIER + BSKY_APP_PASSWORD to enable)`);
    }

    const hasClaimCursor = hasPollCursor("last_claim_id");
    const hasCommitCursor = hasPollCursor("last_commit_id");
    if (!ALLOW_COLD_START && (!hasClaimCursor || !hasCommitCursor)) {
        console.error("❌ Poll cursors are not initialized.");
        console.error("   Run once: bun run src/index.ts --bootstrap-latest");
        console.error("   Override (not recommended): --allow-cold-start or BOT_ALLOW_COLD_START=1");
        process.exit(1);
    }

    const bot = createBot();

    // Wire the notifier so the poller can send messages
    initNotifier(bot as never);

    // Register commands + BotFather metadata (requires network call)
    await setupBot(bot);

    // Start the TzKT event poller (non-blocking — runs in background)
    startPoller().catch((err) => {
        console.error("[poller] Fatal error:", err);
        process.exit(1);
    });

    // ── Graceful shutdown ─────────────────────────────────────────────────────
    const shutdown = async (signal: string): Promise<void> => {
        console.log(`\n${signal} received — shutting down gracefully…`);
        await bot.stop();
        process.exit(0);
    };

    process.once("SIGINT", () => void shutdown("SIGINT"));
    process.once("SIGTERM", () => void shutdown("SIGTERM"));

    // Start receiving Telegram updates (long-polling)
    console.log("✅ Bot is running — press Ctrl+C to stop.");
    await bot.start({
        onStart: (info) => console.log(`   Logged in as @${info.username} (id: ${info.id})`),
    });
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
