import type { Bot } from "grammy";
import type { ClaimEvent, CommitEvent } from "../types/index.ts";
import { NETWORK } from "../config.ts";

// ── Formatters ────────────────────────────────────────────────────────────────

const tzktTxUrl = (hash: string) =>
    NETWORK.name === "mainnet"
        ? `https://tzkt.io/${hash}`
        : `https://${NETWORK.name}.tzkt.io/${hash}`;

function formatTimestamp(iso: string): string {
    return new Date(iso).toUTCString().replace(" GMT", " UTC");
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

export function formatClaimMessage(ev: ClaimEvent): string {
    const domain = `${ev.label}.hack.${ev.tld}`;
    const txUrl = tzktTxUrl(ev.txHash);
    return [
        `🎯 <b>New Claim — ${escapeHtml(domain)}</b>`,
        ``,
        `┣ 🏷  <b>Label:</b> <code>${escapeHtml(ev.label)}</code>`,
        `┣ 👤 <b>Owner:</b> <code>${escapeHtml(ev.owner)}</code>`,
        `┣ 🎯 <b>Target:</b> <code>${escapeHtml(ev.targetAddress)}</code>`,
        `┣ ⛓  <b>Network:</b> ${ev.network}`,
        `┣ 🕐 <b>Time:</b> ${formatTimestamp(ev.timestamp)}`,
        `┗ 🔗 <a href="${txUrl}">View on TzKT</a>`,
    ].join("\n");
}

export function formatCommitMessage(ev: CommitEvent): string {
    const txUrl = tzktTxUrl(ev.txHash);
    const shortHash = ev.commitmentHash.slice(0, 18) + "…";
    return [
        `🔐 <b>New Commitment</b>`,
        ``,
        `┣ #️⃣  <b>Hash:</b> <code>${escapeHtml(shortHash)}</code>`,
        `┣ 👤 <b>Sender:</b> <code>${escapeHtml(ev.sender)}</code>`,
        `┣ ⛓  <b>Network:</b> ${ev.network}`,
        `┣ 🕐 <b>Time:</b> ${formatTimestamp(ev.timestamp)}`,
        `┗ 🔗 <a href="${txUrl}">View on TzKT</a>`,
    ].join("\n");
}

// ── Sender ────────────────────────────────────────────────────────────────────

type BotInstance = Bot<never>;

let _bot: BotInstance | null = null;

export function initNotifier(bot: BotInstance): void {
    _bot = bot;
}

function getBot(): BotInstance {
    if (!_bot) throw new Error("Notifier not initialised — call initNotifier first");
    return _bot;
}

export async function sendToChat(chatId: number, html: string): Promise<void> {
    await getBot().api.sendMessage(chatId, html, {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
    });
}

export async function broadcastClaim(chatIds: number[], ev: ClaimEvent): Promise<void> {
    const msg = formatClaimMessage(ev);
    await Promise.allSettled(chatIds.map((id) => sendToChat(id, msg)));
}

export async function broadcastCommit(chatIds: number[], ev: CommitEvent): Promise<void> {
    const msg = formatCommitMessage(ev);
    await Promise.allSettled(chatIds.map((id) => sendToChat(id, msg)));
}
