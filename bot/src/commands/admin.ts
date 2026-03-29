import type { CommandContext, Context } from "grammy";
import {
    upsertSubscription,
    deleteSubscription,
    setAlertFlags,
    listAllSubscriptions,
    getSubscription,
} from "../db/index.ts";
import { fetchContractStorage } from "../services/tzkt.ts";
import { NETWORK, POLL_INTERVAL_MS, ADMIN_USER_ID } from "../config.ts";
import type { AlertType } from "../types/index.ts";

// ── /admin ────────────────────────────────────────────────────────────────────

export async function handleAdmin(ctx: CommandContext<Context>): Promise<void> {
    const args = ctx.match.trim().split(/\s+/).filter(Boolean);
    const subCmd = args[0]?.toLowerCase();

    switch (subCmd) {
        case "watch":
            await handleWatch(ctx, args.slice(1));
            break;
        case "unwatch":
            await handleUnwatch(ctx, args.slice(1));
            break;
        case "status":
            await handleStatus(ctx);
            break;
        case "subs":
            await handleAdminSubs(ctx);
            break;
        default:
            await handleAdminOverview(ctx);
    }
}

// ── Overview ──────────────────────────────────────────────────────────────────

async function handleAdminOverview(ctx: CommandContext<Context>): Promise<void> {
    const chatId = ctx.chat.id;
    const globalSub = getSubscription(chatId, null);
    const tld = NETWORK.tld;
    const allSubs = listAllSubscriptions();
    const subdomainCount = allSubs.filter((s) => s.subdomain !== null).length;

    const globalStatus = globalSub
        ? [
              globalSub.claims_enabled ? "✅ claims" : "❌ claims",
              globalSub.commits_enabled ? "✅ commits" : "❌ commits",
          ].join("  ")
        : "Not watching";

    await ctx.reply(
        [
            `🛠 <b>Admin Panel</b>`,
            ``,
            `<b>Network:</b> ${NETWORK.name}`,
            `<b>Contract:</b> <code>${NETWORK.registrarAddress}</code>`,
            `<b>Poll interval:</b> ${POLL_INTERVAL_MS / 1000}s`,
            ``,
            `<b>Global watch (all contract events):</b>`,
            `  ${globalStatus}`,
            ``,
            `<b>System subscriptions:</b>`,
            `  • ${subdomainCount} subdomain subscription(s)`,
            `  • ${allSubs.filter((s) => s.subdomain === null).length} global subscription(s)`,
            ``,
            `<b>Subcommands:</b>`,
            `/admin watch <code>claims|commits|all</code>`,
            `/admin unwatch <code>claims|commits|all</code>`,
            `/admin status`,
            `/admin subs`,
            ``,
            `Subdomain <code>hack.${tld}</code> alerts go to chats that run /sub.`,
        ].join("\n"),
        { parse_mode: "HTML" }
    );
}

// ── /admin watch ─────────────────────────────────────────────────────────────

async function handleWatch(ctx: CommandContext<Context>, args: string[]): Promise<void> {
    const alertArg = args[0]?.toLowerCase() as AlertType | undefined;

    if (!alertArg || !["claims", "commits", "all"].includes(alertArg)) {
        await ctx.reply(
            "Usage: /admin watch <code>claims|commits|all</code>",
            { parse_mode: "HTML" }
        );
        return;
    }

    const chatId = ctx.chat.id;
    const userId = ctx.from?.id ?? ADMIN_USER_ID;

    // Ensure global subscription exists
    upsertSubscription(chatId, userId, null);

    const patch = buildPatch(alertArg, 1);
    setAlertFlags(chatId, null, patch);

    const sub = getSubscription(chatId, null)!;
    const flags: string[] = [];
    if (sub.claims_enabled) flags.push("claims");
    if (sub.commits_enabled) flags.push("commits");

    await ctx.reply(
        `👁 Now watching: <b>${flags.join(" + ") || "nothing"}</b> (global — all subdomains)`,
        { parse_mode: "HTML" }
    );
}

// ── /admin unwatch ────────────────────────────────────────────────────────────

async function handleUnwatch(ctx: CommandContext<Context>, args: string[]): Promise<void> {
    const alertArg = args[0]?.toLowerCase() as AlertType | undefined;

    if (!alertArg || !["claims", "commits", "all"].includes(alertArg)) {
        await ctx.reply(
            "Usage: /admin unwatch <code>claims|commits|all</code>",
            { parse_mode: "HTML" }
        );
        return;
    }

    const chatId = ctx.chat.id;

    if (alertArg === "all") {
        const deleted = deleteSubscription(chatId, null);
        if (deleted) {
            await ctx.reply("🔕 Global watch fully removed.");
        } else {
            await ctx.reply("ℹ️ No global subscription active.");
        }
        return;
    }

    const sub = getSubscription(chatId, null);
    if (!sub) {
        await ctx.reply("ℹ️ No global subscription active.");
        return;
    }

    const patch = buildPatch(alertArg, 0);
    setAlertFlags(chatId, null, patch);

    const updated = getSubscription(chatId, null)!;
    if (!updated.claims_enabled && !updated.commits_enabled) {
        deleteSubscription(chatId, null);
        await ctx.reply("🔕 Global watch disabled (no active alert types remain — subscription removed).");
    } else {
        const remaining: string[] = [];
        if (updated.claims_enabled) remaining.push("claims");
        if (updated.commits_enabled) remaining.push("commits");
        await ctx.reply(
            `🔕 <b>${alertArg}</b> alerts off. Still watching: ${remaining.join(" + ")}`,
            { parse_mode: "HTML" }
        );
    }
}

// ── /admin status ─────────────────────────────────────────────────────────────

async function handleStatus(ctx: CommandContext<Context>): Promise<void> {
    const waitMsg = await ctx.reply("⏳ Fetching contract state…");

    try {
        const storage = await fetchContractStorage();
        const paused = storage["paused"] ? "⛔ Paused" : "✅ Active";
        const maxPerWallet = storage["max_per_wallet"] ?? "?";
        const minLen = storage["min_label_length"] ?? "?";
        const maxLen = storage["max_label_length"] ?? "?";
        const whitelistEnabled = storage["whitelist_enabled"] ? "🔒 Enabled" : "🔓 Disabled";

        await ctx.api.editMessageText(
            waitMsg.chat.id,
            waitMsg.message_id,
            [
                `📊 <b>Contract Status</b>`,
                ``,
                `<b>Network:</b> ${NETWORK.name}`,
                `<b>Address:</b> <code>${NETWORK.registrarAddress}</code>`,
                `<b>TLD:</b> .hack.${NETWORK.tld}`,
                ``,
                `<b>Registration:</b> ${paused}`,
                `<b>Max per wallet:</b> ${maxPerWallet}`,
                `<b>Label length:</b> ${minLen}–${maxLen} chars`,
                `<b>Whitelist:</b> ${whitelistEnabled}`,
            ].join("\n"),
            { parse_mode: "HTML" }
        );
    } catch (err) {
        await ctx.api.editMessageText(
            waitMsg.chat.id,
            waitMsg.message_id,
            `❌ Failed to fetch contract state: ${String(err)}`
        );
    }
}

// ── /admin subs ───────────────────────────────────────────────────────────────

async function handleAdminSubs(ctx: CommandContext<Context>): Promise<void> {
    const allSubs = listAllSubscriptions();
    const tld = NETWORK.tld;

    if (allSubs.length === 0) {
        await ctx.reply("📋 No subscriptions in the system.");
        return;
    }

    const lines = allSubs.map((s) => {
        const name = s.subdomain ? `${s.subdomain}.hack.${tld}` : "🌐 global";
        const flags: string[] = [];
        if (s.claims_enabled) flags.push("claims");
        if (s.commits_enabled) flags.push("commits");
        return `  • chat <code>${s.chat_id}</code> → <code>${name}</code> [${flags.join("+") || "paused"}]`;
    });

    const chunks = chunkLines(lines, 40);
    for (const chunk of chunks) {
        await ctx.reply(
            `📋 <b>All subscriptions</b>\n\n${chunk.join("\n")}`,
            { parse_mode: "HTML" }
        );
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildPatch(
    alertArg: AlertType,
    value: 0 | 1
): { claims_enabled?: 0 | 1; commits_enabled?: 0 | 1 } {
    if (alertArg === "all") return { claims_enabled: value, commits_enabled: value };
    if (alertArg === "claims") return { claims_enabled: value };
    return { commits_enabled: value };
}

function chunkLines(lines: string[], size: number): string[][] {
    const chunks: string[][] = [];
    for (let i = 0; i < lines.length; i += size) {
        chunks.push(lines.slice(i, i + size));
    }
    return chunks;
}
