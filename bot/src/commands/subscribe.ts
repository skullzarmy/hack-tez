import type { CommandContext, Context } from "grammy";
import {
    upsertSubscription,
    deleteSubscription,
    setAlertFlags,
    listSubscriptions,
    getSubscription,
} from "../db/index.ts";
import { NETWORK } from "../config.ts";
import type { AlertType, ToggleAction } from "../types/index.ts";

const VALID_LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i;

function normaliseLabel(raw: string): string {
    return raw.toLowerCase().trim();
}

function validateLabel(label: string): string | null {
    if (!VALID_LABEL.test(label)) return "Invalid subdomain label.";
    if (label.length < 1) return "Label too short.";
    if (label.length > 63) return "Label too long (max 63 chars).";
    return null;
}

function subLine(chatId: number, subdomain: string | null): string {
    const tld = NETWORK.tld;
    const name = subdomain ? `${subdomain}.hack.${tld}` : "🌐 Global (all subdomains)";
    const sub = getSubscription(chatId, subdomain);
    if (!sub) return `  • ${name} — <i>not subscribed</i>`;
    const flags: string[] = [];
    if (sub.claims_enabled) flags.push("claims");
    if (sub.commits_enabled) flags.push("commits");
    return `  • <code>${name}</code> — ${flags.length ? flags.join(" + ") : "paused"}`;
}

// ── /sub ─────────────────────────────────────────────────────────────────────

export async function handleSub(ctx: CommandContext<Context>): Promise<void> {
    const args = ctx.match.trim().split(/\s+/).filter(Boolean);
    const rawLabel = args[0];
    const alertArg = args[1]?.toLowerCase() as AlertType | undefined;

    if (!rawLabel) {
        await ctx.reply(
            "Usage: /sub <code>&lt;label&gt;</code> [claims|commits|all]\n" +
            "Example: /sub <code>alice</code>",
            { parse_mode: "HTML" }
        );
        return;
    }

    const label = normaliseLabel(rawLabel);
    const err = validateLabel(label);
    if (err) {
        await ctx.reply(`❌ ${err}`);
        return;
    }

    const chatId = ctx.chat.id;
    const userId = ctx.from?.id ?? chatId;
    const tld = NETWORK.tld;

    upsertSubscription(chatId, userId, label);

    if (alertArg && alertArg !== "all") {
        const isClaims = alertArg === "claims";
        setAlertFlags(chatId, label, {
            claims_enabled: isClaims ? 1 : 0,
            commits_enabled: isClaims ? 0 : 1,
        });
    }

    const sub = getSubscription(chatId, label)!;
    const flags: string[] = [];
    if (sub.claims_enabled) flags.push("claims");
    if (sub.commits_enabled) flags.push("commits");

    await ctx.reply(
        `✅ Subscribed to <b>${label}.hack.${tld}</b>\n` +
        `Active alerts: ${flags.join(" + ") || "none"}`,
        { parse_mode: "HTML" }
    );
}

// ── /unsub ────────────────────────────────────────────────────────────────────

export async function handleUnsub(ctx: CommandContext<Context>): Promise<void> {
    const rawLabel = ctx.match.trim().split(/\s+/)[0];

    if (!rawLabel) {
        await ctx.reply(
            "Usage: /unsub <code>&lt;label&gt;</code>\nExample: /unsub <code>alice</code>",
            { parse_mode: "HTML" }
        );
        return;
    }

    const label = normaliseLabel(rawLabel);
    const err = validateLabel(label);
    if (err) {
        await ctx.reply(`❌ ${err}`);
        return;
    }

    const deleted = deleteSubscription(ctx.chat.id, label);
    if (deleted) {
        await ctx.reply(`🗑 Unsubscribed from <b>${label}.hack.${NETWORK.tld}</b>`, {
            parse_mode: "HTML",
        });
    } else {
        await ctx.reply(`ℹ️ No active subscription for <b>${label}.hack.${NETWORK.tld}</b>`, {
            parse_mode: "HTML",
        });
    }
}

// ── /subs ─────────────────────────────────────────────────────────────────────

export async function handleSubs(ctx: CommandContext<Context>): Promise<void> {
    const subs = listSubscriptions(ctx.chat.id);

    if (subs.length === 0) {
        await ctx.reply(
            "You have no active subscriptions.\n\nUse /sub <code>&lt;label&gt;</code> to subscribe.",
            { parse_mode: "HTML" }
        );
        return;
    }

    const lines = subs.map((s) => subLine(ctx.chat.id, s.subdomain));
    await ctx.reply(
        `📋 <b>Your subscriptions</b>\n\n${lines.join("\n")}`,
        { parse_mode: "HTML" }
    );
}

// ── /claims ───────────────────────────────────────────────────────────────────

export async function handleClaims(ctx: CommandContext<Context>): Promise<void> {
    await handleToggle(ctx, "claims");
}

// ── /commits ──────────────────────────────────────────────────────────────────

export async function handleCommits(ctx: CommandContext<Context>): Promise<void> {
    await handleToggle(ctx, "commits");
}

// ── Shared toggle logic ───────────────────────────────────────────────────────

async function handleToggle(ctx: CommandContext<Context>, alertKind: "claims" | "commits"): Promise<void> {
    const args = ctx.match.trim().split(/\s+/).filter(Boolean);
    const action = args[0]?.toLowerCase() as ToggleAction | undefined;
    const rawLabel = args[1];

    if (!action || !["on", "off"].includes(action) || !rawLabel) {
        await ctx.reply(
            `Usage: /${alertKind} <code>on|off &lt;label&gt;</code>\n` +
            `Example: /${alertKind} <code>on alice</code>`,
            { parse_mode: "HTML" }
        );
        return;
    }

    const label = normaliseLabel(rawLabel);
    const err = validateLabel(label);
    if (err) {
        await ctx.reply(`❌ ${err}`);
        return;
    }

    const chatId = ctx.chat.id;
    const userId = ctx.from?.id ?? chatId;
    const flag = action === "on" ? 1 : 0;

    // Ensure subscription exists before toggling
    upsertSubscription(chatId, userId, label);

    const patch =
        alertKind === "claims"
            ? { claims_enabled: flag as 0 | 1 }
            : { commits_enabled: flag as 0 | 1 };
    setAlertFlags(chatId, label, patch);

    const tld = NETWORK.tld;
    const statusEmoji = action === "on" ? "🔔" : "🔕";
    await ctx.reply(
        `${statusEmoji} ${alertKind[0].toUpperCase() + alertKind.slice(1)} alerts ` +
        `<b>${action}</b> for <code>${label}.hack.${tld}</code>`,
        { parse_mode: "HTML" }
    );
}
