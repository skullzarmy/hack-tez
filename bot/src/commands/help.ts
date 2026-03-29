import type { CommandContext, Context } from "grammy";
import { NETWORK } from "../config.ts";

export async function handleHelp(ctx: CommandContext<Context>): Promise<void> {
    const tld = NETWORK.tld;

    await ctx.reply(
        [
            `📖 <b>hack.tez Bot — Command Reference</b>`,
            ``,
            `<b>Subscription management</b>`,
            `/sub <code>&lt;label&gt;</code> — Subscribe to all alerts for a subdomain`,
            `/sub <code>&lt;label&gt; claims</code> — Subscribe to claim alerts only`,
            `/sub <code>&lt;label&gt; commits</code> — Subscribe to commitment alerts only`,
            `/unsub <code>&lt;label&gt;</code> — Unsubscribe from all alerts for a subdomain`,
            `/subs — List your active subscriptions`,
            ``,
            `<b>Fine-grained toggles</b>`,
            `/claims <code>on|off &lt;label&gt;</code> — Toggle claim alerts for a subdomain`,
            `/commits <code>on|off &lt;label&gt;</code> — Toggle commitment alerts for a subdomain`,
            ``,
            `<b>Admin commands</b>`,
            `/admin — Show admin overview`,
            `/admin watch <code>claims|commits|all</code> — Watch all contract events`,
            `/admin unwatch <code>claims|commits|all</code> — Stop watching events`,
            `/admin status — Contract &amp; bot status`,
            `/admin subs — All subscriptions in the system`,
            ``,
            `<b>Notes</b>`,
            `• Labels are the subdomain prefix (e.g. <code>alice</code> for <code>alice.hack.${tld}</code>)`,
            `• Commitment alerts are contract-wide (the label is hidden until claim)`,
        ].join("\n"),
        { parse_mode: "HTML" }
    );
}
