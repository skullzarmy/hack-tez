/**
 * Share text + intent URLs for a tip that just landed.
 *
 * Tags the recipient on each network when their profile lists a handle, and
 * falls back to their hack.tez domain name when it doesn't — so the post
 * always names someone, just not always with an @.
 */
import { siteUrl } from "../config/tezos";
import { buildTezCityShareIntentUrl } from "./tezcity";
export { buildTezCityShareIntentUrl } from "./tezcity";

export interface TipShareContext {
    /** Display units, e.g. "2.5" */
    amount: string;
    /** "tez" or a token symbol */
    unit: string;
    /** Domain label — `joe` in joe.hack.tez */
    label: string;
    /** Full domain name, used when no social handle is available */
    fullName: string;
    /** Profile display name */
    displayName: string;
    /** X/Twitter handle from the recipient's profile */
    twitter?: string;
    /** Resolved Bluesky handle (not the DID) */
    blueskyHandle?: string;
    /** TezCity handle or domain from the recipient's profile */
    tezcity?: string;
    /** Set when the tip went to a project rather than the profile */
    projectName?: string;
    projectSlug?: string;
}

export type SharePlatform = "x" | "bsky" | "tezcity";

/** Strip a leading @ and any URL wrapper a user may have pasted into their profile. */
function normalizeHandle(raw: string | undefined): string | null {
    if (!raw) return null;
    const h = raw
        .trim()
        .replace(/^https?:\/\/(x\.com|twitter\.com|bsky\.app\/profile|tezcity\.com\/u)\//i, "")
        .replace(/^@+/, "")
        .replace(/\/+$/, "");
    return h || null;
}

/** Canonical hack.tez URL for whatever was tipped. */
export function tipShareUrl(ctx: TipShareContext): string {
    return ctx.projectSlug
        ? `${siteUrl}/u/${ctx.label}/p/${ctx.projectSlug}`
        : `${siteUrl}/u/${ctx.label}`;
}

/** How the recipient is addressed in the post on a given platform. */
export function tipShareMention(
    ctx: TipShareContext,
    platform: SharePlatform,
): string {
    const handle = normalizeHandle(
        platform === "x"
            ? ctx.twitter
            : platform === "bsky"
              ? ctx.blueskyHandle
              : ctx.tezcity,
    );
    if (handle) return `@${handle}`;
    return ctx.displayName || ctx.fullName;
}

export function buildTipShareText(
    ctx: TipShareContext,
    platform: SharePlatform,
): string {
    const mention = tipShareMention(ctx, platform);
    const what = ctx.projectName ? ` for ${ctx.projectName}` : "";
    const headline = `Just tipped ${mention} ${ctx.amount} ${ctx.unit}${what} ⚡`;
    const tail = ctx.projectName
        ? "Support the builders you use — no fees, straight wallet to wallet on #Tezos."
        : "Tip the builders you use — no fees, straight wallet to wallet on #Tezos.";
    return `${headline}\n\n${tail}\n\n${tipShareUrl(ctx)}`;
}

export function shareIntentUrl(text: string, platform: SharePlatform): string {
    if (platform === "tezcity") {
        const match = text.match(/\s*(https?:\/\/[^\s]+)\s*$/);
        if (match) {
            const url = match[1];
            const body = text.slice(0, match.index).trim();
            return buildTezCityShareIntentUrl({ text: body, url });
        }
        return buildTezCityShareIntentUrl({ text: text.trim() });
    }
    const encoded = encodeURIComponent(text);
    return platform === "x"
        ? `https://x.com/intent/post?text=${encoded}`
        : `https://bsky.app/intent/compose?text=${encoded}`;
}

/** Open a compose window for the given platform. */
export function openShareIntent(text: string, platform: SharePlatform): void {
    window.open(
        shareIntentUrl(text, platform),
        "_blank",
        "noopener,noreferrer",
    );
}
