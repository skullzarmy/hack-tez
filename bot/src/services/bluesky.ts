import { BSKY_IDENTIFIER, BSKY_APP_PASSWORD } from "../config.ts";
import type { ClaimEvent } from "../types/index.ts";

// ── Announcement templates ─────────────────────────────────────────────────────
// Warm, welcoming, thankful. Not needy, not formulaic.

const TEMPLATES: Array<(label: string, tld: string) => string> = [
    (l)       => `welcome to hack.tez, ${l} 👾 your corner of tezos is live.`,
    (l)       => `${l}.hack.tez just landed ✨ one more builder in the wild.`,
    (l)       => `fresh claim on hack.tez 🏴 ${l} just staked their ground.`,
    (l, tld)  => `${l} just made it official — ${l}.hack.${tld} is live.`,
    (l)       => `the ${l} era begins 🚀 welcome to hack.tez.`,
    (l)       => `one more corner of tezos, claimed. welcome, ${l} 🤝`,
    (l)       => `glad you're here, ${l} 👋 build something good.`,
    (l, tld)  => `${l}.hack.${tld} just touched down 🛸 welcome aboard.`,
    (l)       => `claim confirmed ✓ ${l} is now officially a hacker on hack.tez.`,
    (l)       => `${l} just joined hack.tez 🌱 make it yours.`,
];

function pickTemplate(label: string, tld: string): string {
    const idx = Math.floor(Math.random() * TEMPLATES.length);
    return TEMPLATES[idx](label, tld);
}

// ── AT Protocol helpers ────────────────────────────────────────────────────────

export interface BskySession {
    accessJwt: string;
    did: string;
    handle: string;
}

/** Authenticate and return a Bluesky session. Returns null if credentials missing or auth fails. */
export async function createBskySession(): Promise<BskySession | null> {
    if (!BSKY_IDENTIFIER || !BSKY_APP_PASSWORD) return null;
    try {
        const res = await fetch(
            "https://bsky.social/xrpc/com.atproto.server.createSession",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ identifier: BSKY_IDENTIFIER, password: BSKY_APP_PASSWORD }),
            },
        );
        if (!res.ok) {
            console.error(`[bluesky] Auth failed: ${res.status}`);
            return null;
        }
        const body = (await res.json()) as { accessJwt: string; did: string; handle: string };
        return { accessJwt: body.accessJwt, did: body.did, handle: body.handle };
    } catch (err) {
        console.error("[bluesky] Auth error:", err);
        return null;
    }
}

interface BskyFacet {
    index: { byteStart: number; byteEnd: number };
    features: Array<{ $type: string; uri: string }>;
}

/** Build AT Protocol link facets using UTF-8 byte offsets. */
function buildLinkFacets(text: string): BskyFacet[] {
    const enc = new TextEncoder();
    const urlRe = /https?:\/\/[^\s]+/g;
    const facets: BskyFacet[] = [];
    let match = urlRe.exec(text);
    while (match !== null) {
        const byteStart = enc.encode(text.slice(0, match.index)).length;
        const byteEnd = byteStart + enc.encode(match[0]).length;
        facets.push({
            index: { byteStart, byteEnd },
            features: [{ $type: "app.bsky.richtext.facet#link", uri: match[0] }],
        });
        match = urlRe.exec(text);
    }
    return facets;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Post a claim announcement to Bluesky. No-op if credentials are not configured. */
export async function announceClaim(ev: ClaimEvent): Promise<void> {
    if (!BSKY_IDENTIFIER || !BSKY_APP_PASSWORD) return;

    const profileUrl = `https://hacktez.com/u/${encodeURIComponent(ev.label)}`;
    const message = pickTemplate(ev.label, ev.tld);
    const text = `${message}\n${profileUrl}`;
    const facets = buildLinkFacets(text);

    const session = await createBskySession();
    if (!session) return;

    try {
        const postRes = await fetch(
            "https://bsky.social/xrpc/com.atproto.repo.createRecord",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session.accessJwt}`,
                },
                body: JSON.stringify({
                    repo: session.did,
                    collection: "app.bsky.feed.post",
                    record: {
                        $type: "app.bsky.feed.post",
                        text,
                        facets,
                        createdAt: new Date().toISOString(),
                    },
                }),
            },
        );
        if (!postRes.ok) {
            console.error(`[bluesky] Post failed: ${postRes.status}`);
        }
    } catch (err) {
        console.error("[bluesky] Post error:", err);
    }
}
