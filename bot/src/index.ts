import { createBot, setupBot } from "./bot.ts";
import { initNotifier } from "./services/notifier.ts";
import { startPoller } from "./services/poller.ts";
import { NETWORK, POLL_INTERVAL_MS, ADMIN_USER_ID } from "./config.ts";

async function main(): Promise<void> {
    console.log("🤖 hack.tez Bot starting…");
    console.log(`   Network:   ${NETWORK.name}`);
    console.log(`   Contract:  ${NETWORK.registrarAddress}`);
    console.log(`   TzKT API:  ${NETWORK.tzktApi}`);
    console.log(`   Poll:      ${POLL_INTERVAL_MS / 1000}s`);
    console.log(`   Admin ID:  ${ADMIN_USER_ID}`);

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
