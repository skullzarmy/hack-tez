import type { CommandContext, Context } from "grammy";
import { NETWORK } from "../config.ts";

export async function handleStart(ctx: CommandContext<Context>): Promise<void> {
    const tld = NETWORK.tld;
    const network = NETWORK.name;

    await ctx.reply(
        [
            `👾 <b>hack.tez Bot</b>`,
            ``,
            `Monitor subdomain events on the <b>hack.${tld}</b> registrar (${network}).`,
            ``,
            `<b>What I can do:</b>`,
            `• Alert you when a specific subdomain is claimed`,
            `• Alert you when a new commitment is made on the contract`,
            `• Keep tabs on the contract's live activity`,
            ``,
            `Use /help to see all available commands.`,
        ].join("\n"),
        { parse_mode: "HTML" }
    );
}
