/**
 * Friends API (Netlify Function v2) — one-way follows between wallets.
 *
 * Routes (all under /api/v1/friends, all [JWT]):
 *   GET    /                — the signed-in wallet's follows: { following: address[] }
 *   PUT    /:address        — follow a hack.tez owner (idempotent)
 *   DELETE /:address        — unfollow (idempotent)
 *
 * Design:
 *   - Both ends are wallet addresses, never domains (see migrations/friends_001_init.sql).
 *   - Private in v1: you can only read your own list. Nothing here exposes who
 *     follows whom, so opening it up later is a product choice, not a migration.
 *   - Stored off-chain on purpose: account-level data shouldn't live on a
 *     single transferable domain's TED record.
 *
 * Auth contract: same as arcade — JWT verification goes through wiki-db.mts
 * `verifyJwt` (HMAC + kid rotation + revocation cache), and the session must
 * hold an active hack.tez domain.
 */
import type { Config, Context } from "@netlify/functions";
import { getOwnedDomains } from "../../auth/domains.js";
import type { Network } from "../../auth/types.js";
import { sql, verifyJwt, type JwtPayload } from "./wiki-db.mts";

/** Follows are people, and people are implicit accounts — no KT1s. */
const TZ_ACCOUNT_RE = /^tz[1234][1-9A-HJ-NP-Za-km-z]{33}$/;
/** Generous for a friends list; stops a script filling the table. */
const MAX_FOLLOWS = 500;
const NETWORK: Network = process.env.VITE_TEZOS_NETWORK === "mainnet" ? "mainnet" : "ghostnet";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
    });
}

function err(message: string, code: string, status: number): Response {
    return json({ error: message, code }, status);
}

async function requireDomainHolder(req: Request): Promise<JwtPayload | Response> {
    const user = await verifyJwt(req);
    if (!user) return err("Unauthorized", "AUTH_REQUIRED", 401);
    if (!user.activeDomain) return err("Active hack.tez domain required", "DOMAIN_REQUIRED", 403);
    return user;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function listFollowing(user: JwtPayload): Promise<Response> {
    const rows = (await sql`SELECT followee FROM friend_follows
                            WHERE follower = ${user.address}
                            ORDER BY created_at DESC`) as Array<{ followee: string }>;
    return json({ data: { following: rows.map((r) => r.followee) } });
}

async function follow(user: JwtPayload, followee: string): Promise<Response> {
    if (followee === user.address) return err("You can't follow yourself", "INVALID_INPUT", 400);

    const existing = await sql`SELECT 1 FROM friend_follows
                               WHERE follower = ${user.address} AND followee = ${followee}`;
    if (existing.length > 0) return json({ data: { following: true } });

    const [{ n }] = (await sql`SELECT COUNT(*)::int AS n FROM friend_follows
                               WHERE follower = ${user.address}`) as Array<{ n: number }>;
    if (n >= MAX_FOLLOWS) return err(`Follow limit reached (${MAX_FOLLOWS})`, "LIMIT_REACHED", 409);

    // Only hack.tez owners can be followed — checked live against TED, so a
    // wallet that has since sold every domain isn't followable any more.
    let owned: string[];
    try {
        owned = await getOwnedDomains(followee, NETWORK);
    } catch {
        return err("Couldn't verify that wallet right now", "UPSTREAM_ERROR", 502);
    }
    if (owned.length === 0) return err("That wallet doesn't own a hack.tez name", "NOT_A_MEMBER", 404);

    await sql`INSERT INTO friend_follows (follower, followee)
              VALUES (${user.address}, ${followee})
              ON CONFLICT DO NOTHING`;
    return json({ data: { following: true } });
}

async function unfollow(user: JwtPayload, followee: string): Promise<Response> {
    await sql`DELETE FROM friend_follows WHERE follower = ${user.address} AND followee = ${followee}`;
    return json({ data: { following: false } });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export default async function handler(req: Request, _ctx: Context): Promise<Response> {
    if (req.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Active-Domain",
                "Access-Control-Max-Age": "600",
            },
        });
    }

    const path = new URL(req.url).pathname.replace(/^\/api\/v1\/friends/, "");
    const segments = path.split("/").filter(Boolean);

    try {
        const user = await requireDomainHolder(req);
        if (user instanceof Response) return user;

        if (segments.length === 0 && req.method === "GET") return await listFollowing(user);

        if (segments.length === 1) {
            const target = decodeURIComponent(segments[0]);
            if (!TZ_ACCOUNT_RE.test(target)) return err("Not a Tezos wallet address", "INVALID_INPUT", 400);
            if (req.method === "PUT") return await follow(user, target);
            if (req.method === "DELETE") return await unfollow(user, target);
        }

        return err("Not found", "NOT_FOUND", 404);
    } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        console.error("Friends API error:", message);
        return err("Server error", "SERVER_ERROR", 500);
    }
}

export const config: Config = { path: ["/api/v1/friends", "/api/v1/friends/*"] };
