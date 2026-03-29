import type { Bot, Context } from "grammy";
import { handleStart } from "./start.ts";
import { handleHelp } from "./help.ts";
import { handleSub, handleUnsub, handleSubs, handleClaims, handleCommits } from "./subscribe.ts";
import { handleAdmin } from "./admin.ts";

/** Register all command handlers and set BotFather command metadata. */
export async function registerCommands(bot: Bot<Context>): Promise<void> {
    // ── Handlers ──────────────────────────────────────────────────────────────
    bot.command("start", handleStart);
    bot.command("help", handleHelp);
    bot.command("sub", handleSub);
    bot.command("unsub", handleUnsub);
    bot.command("subs", handleSubs);
    bot.command("claims", handleClaims);
    bot.command("commits", handleCommits);
    bot.command("admin", handleAdmin);

    // ── BotFather metadata ────────────────────────────────────────────────────
    // User-visible commands (shown in all chats)
    const userCommands = [
        { command: "start", description: "Start the bot & see welcome message" },
        { command: "help", description: "Show command reference" },
        { command: "sub", description: "Subscribe to alerts for a subdomain" },
        { command: "unsub", description: "Unsubscribe from a subdomain" },
        { command: "subs", description: "List your active subscriptions" },
        { command: "claims", description: "Toggle claim alerts (on/off <label>)" },
        { command: "commits", description: "Toggle commitment alerts (on/off <label>)" },
    ];

    // Admin-visible extras (shown only in the admin's private chat)
    const adminCommands = [
        ...userCommands,
        { command: "admin", description: "Admin panel (watch / unwatch / status / subs)" },
    ];

    await bot.api.setMyCommands(userCommands, { scope: { type: "default" } });

    // Attempt to set admin-specific scope (gracefully ignore if unsupported)
    try {
        await bot.api.setMyCommands(adminCommands, {
            scope: { type: "all_private_chats" },
        });
    } catch {
        // Fallback: set globally if scoped call fails
        await bot.api.setMyCommands(adminCommands);
    }
}
