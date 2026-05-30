// Bluesky starter pack reconciler.
//
// Maintains a `app.bsky.graph.list` (curate list) of all hack.tez hackers who
// have linked a Bluesky DID to their on-chain profile, and an
// `app.bsky.graph.starterpack` referencing that list. Both records live in the
// bot account's repo and are bootstrapped on first run.
//
// On each tick we:
//   1. Fetch the canonical set of DIDs from /api/v1/domains.
//   2. List existing listitem records that reference our list.
//   3. Add records for newly-linked DIDs; delete records for unlinked DIDs.

import {
    BSKY_STARTER_PACK_NAME,
    BSKY_STARTER_PACK_DESC,
    HACKTEZ_API_BASE,
} from "../config.ts";
import { getMeta, setMeta } from "../db/index.ts";
import { createBskySession, type BskySession } from "./bluesky.ts";

const LIST_URI_KEY = "bsky_list_uri";
const PACK_URI_KEY = "bsky_starter_pack_uri";
const PACK_URL_KEY = "bsky_starter_pack_url";

const PDS = "https://bsky.social";

// ── AT Protocol record helpers ────────────────────────────────────────────────

interface RepoRecord<T> {
    uri: string;
    cid: string;
    value: T;
}

interface ListitemValue {
    $type: "app.bsky.graph.listitem";
    list: string;
    subject: string;
    createdAt: string;
}

async function atFetch<T>(
    session: BskySession,
    path: string,
    init?: RequestInit,
): Promise<T> {
    const res = await fetch(`${PDS}${path}`, {
        ...init,
        headers: {
            ...(init?.headers ?? {}),
            Authorization: `Bearer ${session.accessJwt}`,
            "Content-Type": "application/json",
        },
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`AT proto ${path} → ${res.status}: ${body}`);
    }
    return (await res.json()) as T;
}

async function createRecord(
    session: BskySession,
    collection: string,
    record: Record<string, unknown>,
): Promise<{ uri: string; cid: string }> {
    return atFetch<{ uri: string; cid: string }>(
        session,
        "/xrpc/com.atproto.repo.createRecord",
        {
            method: "POST",
            body: JSON.stringify({ repo: session.did, collection, record }),
        },
    );
}

async function deleteRecord(
    session: BskySession,
    collection: string,
    rkey: string,
): Promise<void> {
    await atFetch(session, "/xrpc/com.atproto.repo.deleteRecord", {
        method: "POST",
        body: JSON.stringify({ repo: session.did, collection, rkey }),
    });
}

async function listRecords<T>(
    session: BskySession,
    collection: string,
): Promise<RepoRecord<T>[]> {
    const out: RepoRecord<T>[] = [];
    let cursor: string | undefined;
    do {
        const params = new URLSearchParams({
            repo: session.did,
            collection,
            limit: "100",
        });
        if (cursor) params.set("cursor", cursor);
        const page = await atFetch<{ records: RepoRecord<T>[]; cursor?: string }>(
            session,
            `/xrpc/com.atproto.repo.listRecords?${params.toString()}`,
        );
        out.push(...page.records);
        cursor = page.cursor;
    } while (cursor);
    return out;
}

// ── Bootstrap: create the list + starter pack if they don't exist yet ────────

async function bootstrapStarterPack(session: BskySession): Promise<{
    listUri: string;
    packUri: string;
    packUrl: string;
}> {
    let listUri = getMeta(LIST_URI_KEY);
    let packUri = getMeta(PACK_URI_KEY);
    let packUrl = getMeta(PACK_URL_KEY);

    if (!listUri) {
        const created = await createRecord(session, "app.bsky.graph.list", {
            $type: "app.bsky.graph.list",
            purpose: "app.bsky.graph.defs#curatelist",
            name: BSKY_STARTER_PACK_NAME,
            description: BSKY_STARTER_PACK_DESC,
            createdAt: new Date().toISOString(),
        });
        listUri = created.uri;
        setMeta(LIST_URI_KEY, listUri);
        console.log(`[starter-pack] Created list: ${listUri}`);
    }

    if (!packUri) {
        const created = await createRecord(session, "app.bsky.graph.starterpack", {
            $type: "app.bsky.graph.starterpack",
            name: BSKY_STARTER_PACK_NAME,
            description: BSKY_STARTER_PACK_DESC,
            list: listUri,
            createdAt: new Date().toISOString(),
        });
        packUri = created.uri;
        setMeta(PACK_URI_KEY, packUri);

        // bsky.app URL format: https://bsky.app/starter-pack/<handle>/<rkey>
        const rkey = packUri.split("/").pop() ?? "";
        packUrl = `https://bsky.app/starter-pack/${session.handle}/${rkey}`;
        setMeta(PACK_URL_KEY, packUrl);
        console.log(`[starter-pack] Created starter pack: ${packUrl}`);
        console.log("[starter-pack] ☝️  set BSKY_STARTER_PACK_URL in Netlify env to surface on the site");
    }

    return {
        listUri,
        packUri,
        packUrl: packUrl ?? "",
    };
}

// ── Fetch DIDs from the hack.tez API ─────────────────────────────────────────

interface DomainsResponse {
    data: Array<{
        label: string;
        profile?: { bluesky?: string };
    }>;
}

async function fetchHackerDids(): Promise<Map<string, string>> {
    // Map: did → label (for nicer logging on add)
    const out = new Map<string, string>();
    const res = await fetch(`${HACKTEZ_API_BASE}/api/v1/domains?limit=1000`);
    if (!res.ok) {
        throw new Error(`Failed to fetch domains: ${res.status}`);
    }
    const body = (await res.json()) as DomainsResponse;
    for (const d of body.data ?? []) {
        const did = d.profile?.bluesky;
        if (did && did.startsWith("did:")) {
            // Last-write wins if multiple labels somehow share a DID — shouldn't
            // happen post-DID_CONFLICT check, but keep deterministic anyway.
            out.set(did, d.label);
        }
    }
    return out;
}

// ── Reconcile ────────────────────────────────────────────────────────────────

let reconciling = false;

export async function reconcileStarterPack(): Promise<void> {
    if (reconciling) return; // overlap guard
    reconciling = true;
    try {
        const session = await createBskySession();
        if (!session) return;

        const { listUri } = await bootstrapStarterPack(session);

        const [desired, existing] = await Promise.all([
            fetchHackerDids(),
            listRecords<ListitemValue>(session, "app.bsky.graph.listitem"),
        ]);

        // Index existing listitems that belong to our list.
        const existingBySubject = new Map<string, string>(); // subject did → rkey
        for (const rec of existing) {
            if (rec.value.list !== listUri) continue;
            const rkey = rec.uri.split("/").pop();
            if (!rkey) continue;
            existingBySubject.set(rec.value.subject, rkey);
        }

        const toAdd: string[] = [];
        for (const did of desired.keys()) {
            if (did === session.did) continue; // never add the bot to its own pack
            if (!existingBySubject.has(did)) toAdd.push(did);
        }
        const toRemove: Array<{ did: string; rkey: string }> = [];
        for (const [did, rkey] of existingBySubject) {
            if (!desired.has(did)) toRemove.push({ did, rkey });
        }

        if (toAdd.length === 0 && toRemove.length === 0) {
            return; // quiet on no-op
        }

        for (const did of toAdd) {
            try {
                await createRecord(session, "app.bsky.graph.listitem", {
                    $type: "app.bsky.graph.listitem",
                    list: listUri,
                    subject: did,
                    createdAt: new Date().toISOString(),
                });
                console.log(`[starter-pack] + ${desired.get(did)} (${did})`);
            } catch (err) {
                console.error(`[starter-pack] Failed to add ${did}:`, err);
            }
        }

        for (const { did, rkey } of toRemove) {
            try {
                await deleteRecord(session, "app.bsky.graph.listitem", rkey);
                console.log(`[starter-pack] - ${did}`);
            } catch (err) {
                console.error(`[starter-pack] Failed to remove ${did}:`, err);
            }
        }
    } catch (err) {
        console.error("[starter-pack] Reconcile failed:", err);
    } finally {
        reconciling = false;
    }
}

export function getStarterPackUrl(): string | null {
    return getMeta(PACK_URL_KEY);
}
