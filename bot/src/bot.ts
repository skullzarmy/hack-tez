import { Bot, GrammyError, HttpError } from "grammy";
import type { Context } from "grammy";
import { BOT_TOKEN, ADMIN_USER_ID } from "./config.ts";
import { registerCommands } from "./commands/index.ts";

export function createBot(): Bot<Context> {
    const bot = new Bot<Context>(BOT_TOKEN);

    // ── Auth middleware ───────────────────────────────────────────────────────
    // Only the admin user is permitted. Gracefully notify and halt others.
    bot.use(async (ctx, next) => {
        const userId = ctx.from?.id;

        if (!userId || userId !== ADMIN_USER_ID) {
            // Only reply if there is something to reply to
            if (ctx.message || ctx.callbackQuery) {
                await ctx.reply("🚫 Access denied. This bot is in private mode.");
            }
            return;
        }

        await next();
    });

    // ── Error handler ─────────────────────────────────────────────────────────
    bot.catch((err) => {
        const { ctx } = err;
        console.error(`[bot] Error handling update ${ctx.update.update_id}:`);

        if (err.error instanceof GrammyError) {
            console.error("[bot] Telegram API error:", err.error.description);
        } else if (err.error instanceof HttpError) {
            console.error("[bot] HTTP error:", err.error);
        } else {
            console.error("[bot] Unknown error:", err.error);
        }
    });

    return bot;
}

export async function setupBot(bot: Bot<Context>): Promise<void> {
    await registerCommands(bot);
}
