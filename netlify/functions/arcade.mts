/**
 * Hackcade — Arcade API (Netlify Function v2)
 *
 * Routes (all under /api/v1/arcade):
 *   GET  /games                            — list active games
 *   GET  /games/:slug                      — game details + mini leaderboard
 *   POST /submit                  [JWT]    — upload zip, pin to IPFS, mark pending
 *   POST /games/:slug/update      [JWT]    — upload new zip, queue new pending version
 *   POST /games/:slug/edit        [JWT]    — edit metadata (creator+admin); zip swap allowed on pending
 *   POST /games/:slug/rescind     [JWT]    — creator deletes their own pending submission
 *   POST /session                 [JWT]    — start play session, returns sessionId
 *   POST /score                   [JWT]    — submit final score (sessionId required)
 *   GET  /leaderboard/:slug                — top 100 best-per-player
 *   GET  /champions                        — global leaderboard (top players)
 *   GET  /player/:domain                   — player stats + recent scores
 *   GET  /recent                           — recent score events
 *   POST /games/:slug/flag        [JWT]    — flag a game
 *   GET  /pending                 [Admin]  — pending submissions
 *   GET  /pending-updates         [Admin]  — pending version updates
 *   POST /games/:slug/approve     [Admin]
 *   POST /games/:slug/reject      [Admin]
 *   POST /games/:slug/approve-update [Admin]
 *   POST /games/:slug/remove      [Admin]
 *
 * Auth contract:
 *   - JWT verification ALWAYS goes through wiki-db.mts `verifyJwt` so that we
 *     reuse the unified auth layer (HMAC + kid rotation + revocation cache).
 *   - Admin checks ALWAYS go through `isAdmin(jwt)`.
 *   - Audit every admin mutation via `arcadeAudit()`.
 */
import type { Config, Context } from "@netlify/functions";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sql, verifyJwt, isAdmin, slugify, type JwtPayload } from "./wiki-db.mts";
import { validateAndExtractGameZip } from "./arcade-zip.mts";
import { storeGameBundle, deleteBundle, storeCover, deleteCover, COVER_MAX_BYTES, COVER_ALLOWED_TYPES } from "./arcade-storage.mts";

const HERE = dirname(fileURLToPath(import.meta.url));

/** The canonical SDK file shipped into every game bundle. */
let CANONICAL_SDK_BYTES: Uint8Array | null = null;
function loadCanonicalSdk(): Uint8Array {
    if (CANONICAL_SDK_BYTES) return CANONICAL_SDK_BYTES;
    // Try repo path first (dev), then bundled-with-function path.
    const candidates = [
        resolve(HERE, "../../hackcade/sdk/hackcade-sdk.js"),
        resolve(HERE, "./hackcade-sdk.js"),
        resolve(process.cwd(), "hackcade/sdk/hackcade-sdk.js"),
        resolve(process.cwd(), "../hackcade/sdk/hackcade-sdk.js"),
        resolve(process.cwd(), "../../hackcade/sdk/hackcade-sdk.js"),
    ];
    const tried: string[] = [];
    for (const p of candidates) {
        tried.push(p);
        try {
            CANONICAL_SDK_BYTES = new Uint8Array(readFileSync(p));
            return CANONICAL_SDK_BYTES;
        } catch {
            /* try next */
        }
    }
    throw new Error(
        `Canonical hackcade-sdk.js not found. HERE=${HERE} cwd=${process.cwd()} tried=${tried.join(" | ")}`,
    );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
}

function err(message: string, code: string, status: number): Response {
    return json({ error: message, code }, status);
}

function nanoid(n = 21): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let id = "";
    for (let i = 0; i < n; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
}

/** Per-arcade audit log (separate from wiki_audit_log). */
async function arcadeAudit(action: string, target: string, actor: string, details?: unknown): Promise<void> {
    await sql`INSERT INTO arcade_audit_log (action, target, actor, details)
              VALUES (${action}, ${target}, ${actor}, ${details ? JSON.stringify(details) : null})`;
}

/** Verify JWT and require an active hack.tez domain (i.e. authenticated as a domain holder). */
async function requireDomainHolder(req: Request): Promise<JwtPayload | Response> {
    const user = await verifyJwt(req);
    if (!user) return err("Unauthorized", "AUTH_REQUIRED", 401);
    if (!user.activeDomain) return err("Active hack.tez domain required", "DOMAIN_REQUIRED", 403);
    return user;
}

async function requireAdmin(req: Request): Promise<JwtPayload | Response> {
    const user = await requireDomainHolder(req);
    if (user instanceof Response) return user;
    if (!isAdmin(user)) return err("Admin only", "FORBIDDEN", 403);
    return user;
}

// ---------------------------------------------------------------------------
// Public read handlers
// ---------------------------------------------------------------------------

async function listGames(url: URL): Promise<Response> {
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 60), 200);
    const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);
    const category = url.searchParams.get("category");

    const rows = category
        ? await sql`SELECT slug,title,description,category,builder_domain,builder_label,
                           builder_address,ipfs_cid,version,play_count,player_count,
                           cover_key,created_at,updated_at
                    FROM arcade_games
                    WHERE status='active' AND category=${category}
                    ORDER BY play_count DESC, updated_at DESC
                    LIMIT ${limit} OFFSET ${offset}`
        : await sql`SELECT slug,title,description,category,builder_domain,builder_label,
                           builder_address,ipfs_cid,version,play_count,player_count,
                           cover_key,created_at,updated_at
                    FROM arcade_games
                    WHERE status='active'
                    ORDER BY play_count DESC, updated_at DESC
                    LIMIT ${limit} OFFSET ${offset}`;

    return json({ games: rows.map(toGameSummary), limit, offset });
}

async function getGame(slug: string): Promise<Response> {
    const rows = await sql`SELECT * FROM arcade_games WHERE slug=${slug}`;
    if (!rows.length) return err("Game not found", "NOT_FOUND", 404);
    const g = rows[0] as GameRow;
    if (g.status !== "active" && g.status !== "flagged") {
        return err("Game not available", "NOT_FOUND", 404);
    }

    const top = await sql`
        SELECT player_domain, player_label, MAX(score) AS best_score, MAX(created_at) AS last_played
        FROM arcade_scores
        WHERE game_id=${g.id}
        GROUP BY player_domain, player_label
        ORDER BY best_score DESC
        LIMIT 10`;

    return json({
        game: toGameDetail(g),
        leaderboard: top.map((r: any) => ({
            domain: r.player_domain,
            label: r.player_label,
            score: Number(r.best_score),
            lastPlayed: r.last_played,
        })),
    });
}

async function getLeaderboard(url: URL, slug: string): Promise<Response> {
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 200);
    const games = await sql`SELECT id FROM arcade_games WHERE slug=${slug} AND status IN ('active','flagged')`;
    if (!games.length) return err("Game not found", "NOT_FOUND", 404);
    const gameId = (games[0] as any).id as string;
    const rows = await sql`
        SELECT player_domain, player_label, MAX(score) AS best_score, MAX(created_at) AS last_played
        FROM arcade_scores
        WHERE game_id=${gameId}
        GROUP BY player_domain, player_label
        ORDER BY best_score DESC
        LIMIT ${limit}`;
    return json({
        slug,
        leaderboard: rows.map((r: any, i: number) => ({
            rank: i + 1,
            domain: r.player_domain,
            label: r.player_label,
            score: Number(r.best_score),
            lastPlayed: r.last_played,
        })),
    });
}

async function getChampions(url: URL): Promise<Response> {
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
    const rows = await sql`
        SELECT domain, label, total_plays, games_played, total_score, first_place_count
        FROM arcade_player_stats
        ORDER BY total_score DESC
        LIMIT ${limit}`;
    return json({
        champions: rows.map((r: any, i: number) => ({
            rank: i + 1,
            domain: r.domain,
            label: r.label,
            totalPlays: Number(r.total_plays),
            gamesPlayed: Number(r.games_played),
            totalScore: Number(r.total_score),
            firstPlaceCount: Number(r.first_place_count),
        })),
    });
}

async function getPlayer(domain: string): Promise<Response> {
    const stats = await sql`SELECT * FROM arcade_player_stats WHERE domain=${domain}`;
    const recent = await sql`
        SELECT s.score, s.created_at, g.slug, g.title
        FROM arcade_scores s
        JOIN arcade_games g ON g.id = s.game_id
        WHERE s.player_domain=${domain} AND g.status='active'
        ORDER BY s.created_at DESC
        LIMIT 20`;
    return json({
        domain,
        stats: stats.length
            ? {
                  label: (stats[0] as any).label,
                  totalPlays: Number((stats[0] as any).total_plays),
                  gamesPlayed: Number((stats[0] as any).games_played),
                  totalScore: Number((stats[0] as any).total_score),
                  firstPlaceCount: Number((stats[0] as any).first_place_count),
              }
            : null,
        recent: recent.map((r: any) => ({
            slug: r.slug,
            title: r.title,
            score: Number(r.score),
            playedAt: r.created_at,
        })),
    });
}

async function getRecent(url: URL): Promise<Response> {
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 30), 100);
    const rows = await sql`
        SELECT s.player_domain, s.player_label, s.score, s.created_at, g.slug, g.title
        FROM arcade_scores s
        JOIN arcade_games g ON g.id = s.game_id
        WHERE g.status='active'
        ORDER BY s.created_at DESC
        LIMIT ${limit}`;
    return json({
        recent: rows.map((r: any) => ({
            domain: r.player_domain,
            label: r.player_label,
            score: Number(r.score),
            slug: r.slug,
            title: r.title,
            playedAt: r.created_at,
        })),
    });
}

async function listMyGames(req: Request): Promise<Response> {
    const user = await requireDomainHolder(req);
    if (user instanceof Response) return user;
    const rows = await sql`
        SELECT slug,title,description,category,source_url,status,ipfs_cid,version,play_count,player_count,
               max_possible_score,max_score_per_second,cover_key,
               rejected_reason,flagged_reason,created_at,updated_at
        FROM arcade_games
        WHERE builder_domain=${user.activeDomain}
        ORDER BY updated_at DESC`;
    const ids = rows.map((r: any) => r.slug);
    const pendingUpdates = ids.length
        ? await sql`
            SELECT g.slug, v.version, v.created_at, v.scores_reset
            FROM arcade_game_versions v
            JOIN arcade_games g ON g.id = v.game_id
            WHERE g.builder_domain=${user.activeDomain} AND v.status='pending'`
        : [];
    const pendingMap = new Map<string, any>();
    for (const r of pendingUpdates) pendingMap.set((r as any).slug, r);

    return json({
        games: rows.map((r: any) => ({
            slug: r.slug,
            title: r.title,
            description: r.description,
            category: r.category,
            status: r.status,
            ipfsCid: r.ipfs_cid,
            version: r.version,
            playCount: Number(r.play_count),
            playerCount: Number(r.player_count),
            sourceUrl: r.source_url,
            maxPossibleScore: r.max_possible_score,
            maxScorePerSecond: r.max_score_per_second,
            coverKey: r.cover_key ?? null,
            rejectedReason: r.rejected_reason,
            flaggedReason: r.flagged_reason,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
            pendingUpdate: pendingMap.has(r.slug)
                ? {
                      version: Number(pendingMap.get(r.slug).version),
                      scoresReset: !!pendingMap.get(r.slug).scores_reset,
                      submittedAt: pendingMap.get(r.slug).created_at,
                  }
                : null,
        })),
    });
}

// ---------------------------------------------------------------------------
// Session + score
// ---------------------------------------------------------------------------

async function startSession(req: Request): Promise<Response> {
    const user = await requireDomainHolder(req);
    if (user instanceof Response) return user;
    const body = (await req.json().catch(() => null)) as { slug?: string } | null;
    if (!body?.slug) return err("Missing slug", "INVALID_INPUT", 400);

    const games = await sql`SELECT id FROM arcade_games WHERE slug=${body.slug} AND status IN ('active','flagged')`;
    if (!games.length) return err("Game not found", "NOT_FOUND", 404);
    const gameId = (games[0] as any).id as string;

    // Invalidate any prior unsubmitted active session for this player+game.
    await sql`
        UPDATE arcade_sessions
        SET ended_at = NOW(), score_submitted = TRUE
        WHERE game_id=${gameId} AND player_domain=${user.activeDomain}
          AND score_submitted=FALSE AND expires_at > NOW()`;

    const id = nanoid(24);
    await sql`
        INSERT INTO arcade_sessions (id, game_id, player_domain, player_address)
        VALUES (${id}, ${gameId}, ${user.activeDomain}, ${user.address})`;

    return json({ sessionId: id, gameId, ttlSeconds: 2 * 60 * 60 });
}

async function submitScore(req: Request): Promise<Response> {
    const user = await requireDomainHolder(req);
    if (user instanceof Response) return user;

    const body = (await req.json().catch(() => null)) as
        | {
              sessionId?: string;
              score?: number;
              durationMs?: number;
              durationSeconds?: number;
              metadata?: Record<string, unknown>;
          }
        | null;
    if (!body?.sessionId || typeof body.score !== "number" || !isFinite(body.score)) {
        return err("Missing sessionId or score", "INVALID_INPUT", 400);
    }
    const score = Math.max(0, Math.floor(body.score));
    // Accept either durationMs (legacy) or durationSeconds (current SDK).
    let durationMs: number | null = null;
    if (typeof body.durationMs === "number" && body.durationMs > 0) {
        durationMs = Math.floor(body.durationMs);
    } else if (typeof body.durationSeconds === "number" && body.durationSeconds > 0) {
        durationMs = Math.floor(body.durationSeconds * 1000);
    }

    const sessions = await sql`
        SELECT id, game_id, player_domain, expires_at, score_submitted
        FROM arcade_sessions WHERE id=${body.sessionId}`;
    if (!sessions.length) return err("Session not found", "SESSION_NOT_FOUND", 404);
    const session = sessions[0] as any;

    if (session.player_domain !== user.activeDomain) {
        return err("Session does not belong to this player", "FORBIDDEN", 403);
    }
    if (session.score_submitted) return err("Score already submitted for this session", "ALREADY_SUBMITTED", 409);
    if (new Date(session.expires_at) <= new Date()) return err("Session expired", "SESSION_EXPIRED", 410);

    const games = await sql`SELECT id, slug, max_possible_score, max_score_per_second
                            FROM arcade_games WHERE id=${session.game_id}`;
    if (!games.length) return err("Game not found", "NOT_FOUND", 404);
    const game = games[0] as any;

    if (game.max_possible_score != null && score > Number(game.max_possible_score)) {
        return err("Score exceeds max possible", "SCORE_TOO_HIGH", 422);
    }
    if (game.max_score_per_second != null && durationMs != null) {
        const seconds = durationMs / 1000;
        const cap = Number(game.max_score_per_second) * seconds;
        if (score > Math.ceil(cap) + 5) {
            return err("Score impossibly high for play duration", "SCORE_TOO_FAST", 422);
        }
    }

    const label = (user.activeDomain as string).split(".")[0];
    const scoreId = nanoid(24);

    // Capture previous best BEFORE inserting so we can report personal-best delta.
    const prevBestRow = await sql`SELECT MAX(score)::int AS best FROM arcade_scores
                                  WHERE game_id=${game.id} AND player_domain=${user.activeDomain}`;
    const prevBest = ((prevBestRow[0] as any)?.best as number | null) ?? 0;

    await sql`
        INSERT INTO arcade_scores (id, game_id, player_domain, player_label, player_address, score, duration_ms, metadata, session_id)
        VALUES (${scoreId}, ${game.id}, ${user.activeDomain}, ${label}, ${user.address},
                ${score}, ${durationMs}, ${body.metadata ? JSON.stringify(body.metadata) : null}, ${session.id})`;

    await sql`
        UPDATE arcade_sessions
        SET ended_at = NOW(), score_submitted = TRUE
        WHERE id=${session.id}`;

    // First play of this game by this player?
    const priorPlays = await sql`
        SELECT COUNT(*)::int AS c FROM arcade_scores
        WHERE game_id=${game.id} AND player_domain=${user.activeDomain} AND id<>${scoreId}`;
    const isNewPlayer = ((priorPlays[0] as any).c as number) === 0;

    await sql`
        UPDATE arcade_games
        SET play_count = play_count + 1,
            player_count = player_count + ${isNewPlayer ? 1 : 0},
            updated_at = NOW()
        WHERE id=${game.id}`;

    // Best score for this player on this game (used for total_score sum).
    const bestRow = await sql`SELECT MAX(score)::int AS best FROM arcade_scores
                              WHERE game_id=${game.id} AND player_domain=${user.activeDomain}`;
    const best = ((bestRow[0] as any).best as number) ?? score;

    await sql`
        INSERT INTO arcade_player_stats (domain, label, total_plays, games_played, total_score, updated_at)
        VALUES (${user.activeDomain}, ${label}, 1, ${isNewPlayer ? 1 : 0}, ${best}, NOW())
        ON CONFLICT (domain) DO UPDATE SET
            total_plays = arcade_player_stats.total_plays + 1,
            games_played = arcade_player_stats.games_played + ${isNewPlayer ? 1 : 0},
            total_score = arcade_player_stats.total_score
                          + (${best} - COALESCE((
                              SELECT MAX(s2.score) FROM arcade_scores s2
                              WHERE s2.game_id=${game.id} AND s2.player_domain=${user.activeDomain}
                                AND s2.id<>${scoreId}
                          ), 0)),
            label = EXCLUDED.label,
            updated_at = NOW()`;

    // Compute rank for this score.
    const rankRow = await sql`
        SELECT 1 + COUNT(DISTINCT player_domain) AS rank
        FROM arcade_scores
        WHERE game_id=${game.id} AND score > ${best}`;
    const rank = Number((rankRow[0] as any).rank);

    const isPersonalBest = score > prevBest;
    return json({
        ok: true,
        scoreId,
        rank,
        bestScore: best,
        previousBest: prevBest,
        isFirstScore: prevBest === 0,
        isPersonalBest,
        // Legacy alias kept for any older client.
        isNewHighScore: isPersonalBest,
    });
}

// ---------------------------------------------------------------------------
// Submit / update / moderation — implemented in subsequent tasks.
// Stubbed here so the router compiles end-to-end during the skeleton phase.
// ---------------------------------------------------------------------------

/** Read multipart form, returning fields + the single zip file. */
async function readSubmitForm(req: Request): Promise<
    | {
          ok: true;
          fields: Record<string, string>;
          zipBytes: Uint8Array;
          cover: { bytes: Uint8Array; contentType: string } | null;
      }
    | { ok: false; res: Response }
> {
    const ct = req.headers.get("content-type") ?? "";
    if (!ct.toLowerCase().includes("multipart/form-data")) {
        return { ok: false, res: err("multipart/form-data required", "INVALID_INPUT", 400) };
    }
    let form: FormData;
    try {
        form = await req.formData();
    } catch (e) {
        const msg = e instanceof Error ? e.message : "form parse failed";
        return { ok: false, res: err(`Invalid multipart body: ${msg}`, "INVALID_INPUT", 400) };
    }
    const file = form.get("zip");
    if (!(file instanceof File)) {
        return { ok: false, res: err("Missing zip field", "INVALID_INPUT", 400) };
    }
    const fields: Record<string, string> = {};
    for (const [k, v] of form.entries()) {
        if (typeof v === "string") fields[k] = v;
    }
    const zipBytes = new Uint8Array(await file.arrayBuffer());

    let cover: { bytes: Uint8Array; contentType: string } | null = null;
    const coverField = form.get("cover");
    if (coverField instanceof File && coverField.size > 0) {
        const t = coverField.type || "application/octet-stream";
        if (!COVER_ALLOWED_TYPES.has(t)) {
            return { ok: false, res: err(`Cover must be PNG, JPEG, WebP, or GIF (got ${t})`, "INVALID_INPUT", 400) };
        }
        if (coverField.size > COVER_MAX_BYTES) {
            return { ok: false, res: err(`Cover image is too large (max ${COVER_MAX_BYTES / 1024 / 1024} MB)`, "INVALID_INPUT", 400) };
        }
        cover = { bytes: new Uint8Array(await coverField.arrayBuffer()), contentType: t };
    }

    return { ok: true, fields, zipBytes, cover };
}

function clampStr(s: unknown, max: number): string {
    if (typeof s !== "string") return "";
    return s.trim().slice(0, max);
}

function parseOptionalNumber(s: string | undefined, max: number): number | null {
    if (!s) return null;
    const n = Number(s);
    if (!isFinite(n) || n < 0) return null;
    return Math.min(n, max);
}

const ALLOWED_CATEGORIES = new Set(["action", "puzzle", "arcade", "rpg", "shooter", "platform", "other"]);

async function submitGame(req: Request): Promise<Response> {
    const user = await requireDomainHolder(req);
    if (user instanceof Response) return user;

    const parsed = await readSubmitForm(req);
    if (!parsed.ok) return parsed.res;
    const { fields, zipBytes, cover } = parsed;

    const title = clampStr(fields.title, 80);
    const description = clampStr(fields.description, 600);
    const categoryRaw = clampStr(fields.category || "other", 24).toLowerCase();
    const category = ALLOWED_CATEGORIES.has(categoryRaw) ? categoryRaw : "other";
    const sourceUrl = clampStr(fields.sourceUrl, 500) || null;
    const maxPossibleScore = parseOptionalNumber(fields.maxPossibleScore, 1_000_000_000);
    const maxScorePerSecond = parseOptionalNumber(fields.maxScorePerSecond, 100_000);

    if (!title) return err("title is required", "INVALID_INPUT", 400);
    if (!cover) return err("cover image is required", "INVALID_INPUT", 400);

    // Validate + extract zip.
    const sdkBytes = loadCanonicalSdk();
    const validation = validateAndExtractGameZip(zipBytes, sdkBytes);
    if (!validation.ok) return err(validation.error.message, validation.error.code, 422);

    // Slug + collision suffix (max 5 attempts, then bail).
    let slug = slugify(title);
    if (!slug) return err("Title produced an empty slug", "INVALID_INPUT", 400);
    for (let i = 0; i < 5; i++) {
        const existing = await sql`SELECT 1 FROM arcade_games WHERE slug=${slug}`;
        if (!existing.length) break;
        slug = `${slugify(title)}-${nanoid(4).toLowerCase()}`;
    }

    const builderLabel = (user.activeDomain as string).split(".")[0];
    const id = nanoid(24);

    // Store bundle to Netlify Blobs under <gameId>/v1.
    let stored;
    try {
        stored = await storeGameBundle(id, 1, validation.files);
    } catch (e) {
        const msg = e instanceof Error ? e.message : "storage failed";
        return err(msg, "STORAGE_ERROR", 502);
    }

    // Store cover under <gameId>/cover (no version — survives version bumps).
    let coverStored;
    try {
        coverStored = await storeCover(id, cover.bytes, cover.contentType);
    } catch (e) {
        // Roll back the bundle to keep things clean.
        await deleteBundle(id, 1).catch(() => {});
        const msg = e instanceof Error ? e.message : "cover storage failed";
        return err(msg, "STORAGE_ERROR", 502);
    }

    await sql`
        INSERT INTO arcade_games
            (id, slug, title, description, category, source_url,
             builder_domain, builder_label, builder_address,
             ipfs_cid, version, max_possible_score, max_score_per_second, status, cover_key)
        VALUES (${id}, ${slug}, ${title}, ${description}, ${category}, ${sourceUrl},
                ${user.activeDomain}, ${builderLabel}, ${user.address},
                ${stored.key}, 1, ${maxPossibleScore}, ${maxScorePerSecond}, 'pending', ${coverStored.key})`;
    // NOTE: no arcade_game_versions row yet — v1 is only created on approval.
    // Keeping it out avoids the pending submission also showing up as a "pending update".

    await arcadeAudit("game_submit", slug, user.activeDomain!, {
        bundleKey: stored.key,
        coverKey: coverStored.key,
        coverContentType: coverStored.contentType,
        coverBytes: coverStored.bytes,
        files: stored.fileCount,
        bytes: stored.totalBytes,
        injectedSdk: validation.injectedSdk,
    });

    return json({ ok: true, slug, ipfsCid: stored.key, coverKey: coverStored.key, status: "pending", injectedSdk: validation.injectedSdk });
}

async function updateGame(req: Request, slug: string): Promise<Response> {
    const user = await requireDomainHolder(req);
    if (user instanceof Response) return user;

    const games = await sql`SELECT id, version, builder_domain FROM arcade_games WHERE slug=${slug}`;
    if (!games.length) return err("Game not found", "NOT_FOUND", 404);
    const game = games[0] as any;

    const isCreator = game.builder_domain === user.activeDomain;
    if (!isCreator && !isAdmin(user)) return err("Not the creator", "FORBIDDEN", 403);

    // Reject if there's already a pending version awaiting approval.
    const existingPending = await sql`
        SELECT 1 FROM arcade_game_versions WHERE game_id=${game.id} AND status='pending'`;
    if (existingPending.length) return err("Update already pending review", "PENDING_EXISTS", 409);

    const parsed = await readSubmitForm(req);
    if (!parsed.ok) return parsed.res;
    const { fields, zipBytes } = parsed;
    const scoresReset = clampStr(fields.scoresReset, 5).toLowerCase() === "true";

    const sdkBytes = loadCanonicalSdk();
    const validation = validateAndExtractGameZip(zipBytes, sdkBytes);
    if (!validation.ok) return err(validation.error.message, validation.error.code, 422);

    const newVersion = Number(game.version) + 1;
    let stored;
    try {
        stored = await storeGameBundle(game.id, newVersion, validation.files);
    } catch (e) {
        const msg = e instanceof Error ? e.message : "storage failed";
        return err(msg, "STORAGE_ERROR", 502);
    }

    await sql`
        INSERT INTO arcade_game_versions (game_id, version, ipfs_cid, uploaded_by, scores_reset, status)
        VALUES (${game.id}, ${newVersion}, ${stored.key}, ${user.activeDomain}, ${scoresReset}, 'pending')`;

    await arcadeAudit("game_update_submit", slug, user.activeDomain!, {
        bundleKey: stored.key,
        version: newVersion,
        scoresReset,
        injectedSdk: validation.injectedSdk,
    });

    return json({ ok: true, slug, ipfsCid: stored.key, version: newVersion, status: "pending" });
}

/**
 * Edit a submission's metadata (and optionally swap the zip on a pending one).
 *
 * Allowed by:
 *   - The original creator (matched via builder_domain) for any status.
 *   - Admins, for any status.
 *
 * Behavior:
 *   - Metadata fields (title, description, category, sourceUrl, maxPossibleScore,
 *     maxScorePerSecond) update in place when provided. Title is immutable —
 *     changing it would break the slug + leaderboard URL.
 *   - If a `zip` part is included AND the game is currently `pending`, we
 *     re-validate, re-pin, replace the IPFS CID on the row + the v1 version
 *     row. This is in-place — no new version row, no version bump. (Approved
 *     games must use the /update flow which queues a new version for review.)
 */
async function editGame(req: Request, slug: string): Promise<Response> {
    const user = await requireDomainHolder(req);
    if (user instanceof Response) return user;

    const games = await sql`SELECT id, version, status, builder_domain FROM arcade_games WHERE slug=${slug}`;
    if (!games.length) return err("Game not found", "NOT_FOUND", 404);
    const game = games[0] as any;

    const isCreator = game.builder_domain === user.activeDomain;
    if (!isCreator && !isAdmin(user)) return err("Not the creator", "FORBIDDEN", 403);

    const ct = req.headers.get("content-type") ?? "";
    let fields: Record<string, string> = {};
    let zipBytes: Uint8Array | null = null;
    let coverSwap: { bytes: Uint8Array; contentType: string } | null = null;

    if (ct.toLowerCase().includes("multipart/form-data")) {
        let form: FormData;
        try {
            form = await req.formData();
        } catch (e) {
            const msg = e instanceof Error ? e.message : "form parse failed";
            return err(`Invalid multipart body: ${msg}`, "INVALID_INPUT", 400);
        }
        for (const [k, v] of form.entries()) {
            if (typeof v === "string") fields[k] = v;
        }
        const zipField = form.get("zip");
        if (zipField instanceof File && zipField.size > 0) {
            zipBytes = new Uint8Array(await zipField.arrayBuffer());
        }
        const coverField = form.get("cover");
        if (coverField instanceof File && coverField.size > 0) {
            const t = coverField.type || "application/octet-stream";
            if (!COVER_ALLOWED_TYPES.has(t)) {
                return err(`Cover must be PNG, JPEG, WebP, or GIF (got ${t})`, "INVALID_INPUT", 400);
            }
            if (coverField.size > COVER_MAX_BYTES) {
                return err(
                    `Cover image is too large (max ${COVER_MAX_BYTES / 1024 / 1024} MB)`,
                    "INVALID_INPUT",
                    400,
                );
            }
            coverSwap = { bytes: new Uint8Array(await coverField.arrayBuffer()), contentType: t };
        }
    } else if (ct.toLowerCase().includes("application/json")) {
        const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body) return err("Invalid JSON body", "INVALID_INPUT", 400);
        for (const [k, v] of Object.entries(body)) {
            if (typeof v === "string") fields[k] = v;
            else if (typeof v === "number") fields[k] = String(v);
        }
    } else {
        return err("multipart/form-data or application/json required", "INVALID_INPUT", 400);
    }

    // Build update set (only include fields that were actually provided)
    const updates: Record<string, string | number | null> = {};
    if ("description" in fields) updates.description = clampStr(fields.description, 600);
    if ("category" in fields) {
        const cat = clampStr(fields.category, 24).toLowerCase();
        updates.category = ALLOWED_CATEGORIES.has(cat) ? cat : "other";
    }
    if ("sourceUrl" in fields) updates.source_url = clampStr(fields.sourceUrl, 500) || null;
    if ("maxPossibleScore" in fields)
        updates.max_possible_score = parseOptionalNumber(fields.maxPossibleScore, 1_000_000_000);
    if ("maxScorePerSecond" in fields)
        updates.max_score_per_second = parseOptionalNumber(fields.maxScorePerSecond, 100_000);

    let newCid: string | null = null;
    let injectedSdk = false;

    if (zipBytes) {
        if (game.status !== "pending") {
            return err("Zip swap only allowed on pending submissions; use the update flow", "NOT_PENDING", 409);
        }

        const sdkBytes = loadCanonicalSdk();
        const validation = validateAndExtractGameZip(zipBytes, sdkBytes);
        if (!validation.ok) return err(validation.error.message, validation.error.code, 422);
        injectedSdk = validation.injectedSdk;

        try {
            // storeGameBundle wipes prior files at this prefix before writing the new ones.
            const stored = await storeGameBundle(game.id, game.version, validation.files);
            newCid = stored.key;
        } catch (e) {
            const msg = e instanceof Error ? e.message : "storage failed";
            return err(msg, "STORAGE_ERROR", 502);
        }
        updates.ipfs_cid = newCid;
    }

    let coverReplaced = false;
    if (coverSwap) {
        try {
            const stored = await storeCover(game.id, coverSwap.bytes, coverSwap.contentType);
            updates.cover_key = stored.key;
            coverReplaced = true;
        } catch (e) {
            const msg = e instanceof Error ? e.message : "cover storage failed";
            return err(msg, "STORAGE_ERROR", 502);
        }
    }

    if (!Object.keys(updates).length) return err("No editable fields provided", "INVALID_INPUT", 400);

    // Build dynamic UPDATE — neon's tagged template can't compose so use sql.unsafe pattern via a single statement.
    // Each field is a separate UPDATE to keep things simple + parameterized safely.
    for (const [col, val] of Object.entries(updates)) {
        switch (col) {
            case "description":
                await sql`UPDATE arcade_games SET description=${val as string}, updated_at=NOW() WHERE slug=${slug}`;
                break;
            case "category":
                await sql`UPDATE arcade_games SET category=${val as string}, updated_at=NOW() WHERE slug=${slug}`;
                break;
            case "source_url":
                await sql`UPDATE arcade_games SET source_url=${val as string | null}, updated_at=NOW() WHERE slug=${slug}`;
                break;
            case "max_possible_score":
                await sql`UPDATE arcade_games SET max_possible_score=${val as number | null}, updated_at=NOW() WHERE slug=${slug}`;
                break;
            case "max_score_per_second":
                await sql`UPDATE arcade_games SET max_score_per_second=${val as number | null}, updated_at=NOW() WHERE slug=${slug}`;
                break;
            case "cover_key":
                await sql`UPDATE arcade_games SET cover_key=${val as string}, updated_at=NOW() WHERE slug=${slug}`;
                break;
            case "ipfs_cid":
                await sql`UPDATE arcade_games SET ipfs_cid=${val as string}, updated_at=NOW() WHERE slug=${slug}`;
                await sql`UPDATE arcade_game_versions SET ipfs_cid=${val as string} WHERE game_id=${game.id} AND version=${game.version}`;
                break;
        }
    }

    await arcadeAudit("game_edit", slug, user.activeDomain!, {
        fields: Object.keys(updates),
        zipReplaced: !!newCid,
        coverReplaced,
        injectedSdk,
        actorIsAdmin: !isCreator,
    });

    return json({ ok: true, slug, ipfsCid: newCid ?? undefined, coverReplaced });
}

/**
 * Rescind a pending submission entirely.
 *
 * Creator-only; admins should use /reject (which keeps an audit trail with a
 * reason). Hard-deletes the game row + cascades the v1 version row. Scores
 * shouldn't exist yet (game was pending, not playable) but we cascade those
 * too via the schema FK.
 */
async function rescindGame(req: Request, slug: string): Promise<Response> {
    const user = await requireDomainHolder(req);
    if (user instanceof Response) return user;

    const games = await sql`SELECT id, status, builder_domain FROM arcade_games WHERE slug=${slug}`;
    if (!games.length) return err("Game not found", "NOT_FOUND", 404);
    const game = games[0] as any;

    if (game.builder_domain !== user.activeDomain) return err("Not the creator", "FORBIDDEN", 403);
    if (game.status !== "pending") {
        return err("Only pending submissions can be rescinded", "NOT_PENDING", 409);
    }

    await sql`DELETE FROM arcade_games WHERE id=${game.id}`;
    // Best-effort blob cleanup — failures shouldn't block the rescind.
    await deleteBundle(game.id, 1).catch(() => {});
    await deleteCover(game.id).catch(() => {});
    await arcadeAudit("game_rescind", slug, user.activeDomain!);
    return json({ ok: true });
}

async function flagGame(req: Request, slug: string): Promise<Response> {
    const user = await requireDomainHolder(req);
    if (user instanceof Response) return user;
    const body = (await req.json().catch(() => null)) as { reason?: string } | null;
    const reason = body?.reason?.trim() ?? "";
    if (!reason || reason.length > 500) return err("Reason required (≤500 chars)", "INVALID_INPUT", 400);

    const rows = await sql`SELECT id, status FROM arcade_games WHERE slug=${slug}`;
    if (!rows.length) return err("Game not found", "NOT_FOUND", 404);
    await sql`UPDATE arcade_games SET status='flagged', flagged_reason=${reason}, updated_at=NOW()
              WHERE slug=${slug} AND status='active'`;
    await arcadeAudit("game_flag", slug, user.activeDomain!, { reason });
    return json({ ok: true });
}

async function listPending(req: Request): Promise<Response> {
    const user = await requireAdmin(req);
    if (user instanceof Response) return user;
    const rows = await sql`
        SELECT * FROM arcade_games
        WHERE status='pending'
        ORDER BY created_at ASC`;
    return json({ pending: rows.map((r) => toGameDetail(r as GameRow)) });
}

async function listPendingUpdates(req: Request): Promise<Response> {
    const user = await requireAdmin(req);
    if (user instanceof Response) return user;
    const rows = await sql`
        SELECT g.slug, g.title, g.description, g.category, g.builder_domain, g.cover_key,
               g.ipfs_cid AS current_cid, g.version AS current_version,
               v.id AS version_id, v.version AS new_version, v.ipfs_cid AS new_cid,
               v.uploaded_by, v.scores_reset, v.created_at
        FROM arcade_game_versions v
        JOIN arcade_games g ON g.id = v.game_id
        WHERE v.status='pending'
        ORDER BY v.created_at ASC`;
    const pendingUpdates = rows.map((r: any) => ({
        id: r.version_id,
        versionId: r.version_id,
        slug: r.slug,
        title: r.title,
        description: r.description,
        category: r.category,
        builderDomain: r.builder_domain,
        coverKey: r.cover_key ?? null,
        currentCid: r.current_cid,
        currentVersion: Number(r.current_version),
        newCid: r.new_cid,
        newVersion: Number(r.new_version),
        ipfsCid: r.new_cid,
        version: Number(r.new_version),
        uploadedBy: r.uploaded_by,
        scoresReset: !!r.scores_reset,
        createdAt: r.created_at,
    }));
    return json({ pendingUpdates });
}

async function approveGame(req: Request, slug: string): Promise<Response> {
    const user = await requireAdmin(req);
    if (user instanceof Response) return user;
    const rows = await sql`UPDATE arcade_games
        SET status='active', approved_by=${user.activeDomain}, approved_at=NOW(), updated_at=NOW()
        WHERE slug=${slug} AND status='pending'
        RETURNING id, ipfs_cid, version, builder_domain`;
    if (!rows.length) return err("Game not found or not pending", "NOT_FOUND", 404);
    const g = rows[0] as { id: string; ipfs_cid: string; version: number; builder_domain: string };
    // First-approval: create the v1 version row now that it's actually live.
    // Idempotent — second approval (shouldn't happen, but safe) is a no-op.
    await sql`
        INSERT INTO arcade_game_versions (game_id, version, ipfs_cid, uploaded_by, scores_reset, status, approved_by, approved_at)
        VALUES (${g.id}, ${g.version}, ${g.ipfs_cid}, ${g.builder_domain}, FALSE, 'approved', ${user.activeDomain}, NOW())
        ON CONFLICT (game_id, version) DO NOTHING`;
    await arcadeAudit("game_approve", slug, user.activeDomain!);
    return json({ ok: true });
}

async function rejectGame(req: Request, slug: string): Promise<Response> {
    const user = await requireAdmin(req);
    if (user instanceof Response) return user;
    const body = (await req.json().catch(() => null)) as { reason?: string } | null;
    const reason = body?.reason?.trim() ?? "";
    if (!reason) return err("Reason required", "INVALID_INPUT", 400);
    const rows = await sql`UPDATE arcade_games
        SET status='rejected', rejected_reason=${reason}, approved_by=${user.activeDomain}, approved_at=NOW(),
            updated_at=NOW()
        WHERE slug=${slug} AND status='pending'
        RETURNING id`;
    if (!rows.length) return err("Game not found or not pending", "NOT_FOUND", 404);
    await arcadeAudit("game_reject", slug, user.activeDomain!, { reason });
    return json({ ok: true });
}

/** Recompute denormalized stats for the given player domains. */
async function recomputePlayerStats(domains: string[]): Promise<void> {
    if (!domains.length) return;
    await sql`
        WITH per_game AS (
            SELECT s.player_domain, s.game_id, MAX(s.score) AS best
            FROM arcade_scores s
            JOIN arcade_games g ON g.id = s.game_id AND g.status='active'
            WHERE s.player_domain = ANY(${domains})
            GROUP BY s.player_domain, s.game_id
        ),
        agg AS (
            SELECT s.player_domain AS domain,
                   MAX(s.player_label) AS label,
                   COUNT(*)::int AS total_plays,
                   COUNT(DISTINCT s.game_id)::int AS games_played,
                   COALESCE(SUM(pg.best), 0)::bigint AS total_score
            FROM arcade_scores s
            JOIN arcade_games g ON g.id = s.game_id AND g.status='active'
            LEFT JOIN per_game pg ON pg.player_domain = s.player_domain AND pg.game_id = s.game_id
            WHERE s.player_domain = ANY(${domains})
            GROUP BY s.player_domain
        )
        INSERT INTO arcade_player_stats (domain, label, total_plays, games_played, total_score, updated_at)
        SELECT domain, label, total_plays, games_played, total_score, NOW() FROM agg
        ON CONFLICT (domain) DO UPDATE SET
            label = EXCLUDED.label,
            total_plays = EXCLUDED.total_plays,
            games_played = EXCLUDED.games_played,
            total_score = EXCLUDED.total_score,
            updated_at = NOW()`;

    // Wipe stats for players who no longer have any active scores.
    await sql`
        DELETE FROM arcade_player_stats
        WHERE domain = ANY(${domains})
          AND NOT EXISTS (
              SELECT 1 FROM arcade_scores s
              JOIN arcade_games g ON g.id = s.game_id AND g.status='active'
              WHERE s.player_domain = arcade_player_stats.domain
          )`;
}

async function approveUpdate(req: Request, slug: string): Promise<Response> {
    const user = await requireAdmin(req);
    if (user instanceof Response) return user;

    const games = await sql`SELECT id FROM arcade_games WHERE slug=${slug}`;
    if (!games.length) return err("Game not found", "NOT_FOUND", 404);
    const gameId = (games[0] as any).id as string;

    const pending = await sql`
        SELECT id, version, ipfs_cid, scores_reset
        FROM arcade_game_versions
        WHERE game_id=${gameId} AND status='pending'
        ORDER BY version DESC LIMIT 1`;
    if (!pending.length) return err("No pending update", "NOT_FOUND", 404);
    const v = pending[0] as any;

    let affectedDomains: string[] = [];
    if (v.scores_reset) {
        const before = await sql`SELECT DISTINCT player_domain FROM arcade_scores WHERE game_id=${gameId}`;
        affectedDomains = (before as any[]).map((r) => r.player_domain as string);
        await sql`DELETE FROM arcade_scores WHERE game_id=${gameId}`;
        await sql`UPDATE arcade_games SET play_count=0, player_count=0, updated_at=NOW() WHERE id=${gameId}`;
    }

    await sql`
        UPDATE arcade_game_versions
        SET status='approved', approved_by=${user.activeDomain}, approved_at=NOW()
        WHERE id=${v.id}`;

    await sql`
        UPDATE arcade_games
        SET ipfs_cid=${v.ipfs_cid}, version=${v.version}, updated_at=NOW()
        WHERE id=${gameId}`;

    if (affectedDomains.length) await recomputePlayerStats(affectedDomains);

    await arcadeAudit("game_update_approve", slug, user.activeDomain!, {
        version: Number(v.version),
        cid: v.ipfs_cid,
        scoresReset: !!v.scores_reset,
        affectedPlayers: affectedDomains.length,
    });

    return json({ ok: true, version: Number(v.version), ipfsCid: v.ipfs_cid });
}

async function rejectUpdate(req: Request, slug: string): Promise<Response> {
    const user = await requireAdmin(req);
    if (user instanceof Response) return user;
    const body = (await req.json().catch(() => null)) as { reason?: string } | null;
    const reason = body?.reason?.trim() ?? "";
    if (!reason) return err("Reason required", "INVALID_INPUT", 400);

    const games = await sql`SELECT id FROM arcade_games WHERE slug=${slug}`;
    if (!games.length) return err("Game not found", "NOT_FOUND", 404);
    const gameId = (games[0] as any).id as string;

    const rows = await sql`
        UPDATE arcade_game_versions
        SET status='rejected', rejected_reason=${reason}, approved_by=${user.activeDomain}, approved_at=NOW()
        WHERE game_id=${gameId} AND status='pending'
        RETURNING id, version`;
    if (!rows.length) return err("No pending update", "NOT_FOUND", 404);

    // Best-effort blob cleanup for the rejected version's bundle.
    const rejectedVersion = Number((rows[0] as any).version);
    await deleteBundle(gameId, rejectedVersion).catch(() => {});

    await arcadeAudit("game_update_reject", slug, user.activeDomain!, { reason, version: rejectedVersion });
    return json({ ok: true });
}

async function removeGame(req: Request, slug: string): Promise<Response> {
    const user = await requireAdmin(req);
    if (user instanceof Response) return user;
    const body = (await req.json().catch(() => null)) as { reason?: string } | null;
    const reason = body?.reason?.trim() ?? "";

    const games = await sql`SELECT id FROM arcade_games WHERE slug=${slug}`;
    if (!games.length) return err("Game not found", "NOT_FOUND", 404);
    const gameId = (games[0] as any).id as string;

    // Snapshot affected players before flipping the game's status (the recompute
    // query filters on status='active' so the rows we want to fix become invisible).
    const before = await sql`SELECT DISTINCT player_domain FROM arcade_scores WHERE game_id=${gameId}`;
    const affected = (before as any[]).map((r) => r.player_domain as string);

    await sql`UPDATE arcade_games
        SET status='removed', flagged_reason=${reason || null}, updated_at=NOW()
        WHERE id=${gameId}`;

    if (affected.length) await recomputePlayerStats(affected);

    await arcadeAudit("game_remove", slug, user.activeDomain!, { reason, affectedPlayers: affected.length });
    return json({ ok: true });
}

async function unflagGame(req: Request, slug: string): Promise<Response> {
    const user = await requireAdmin(req);
    if (user instanceof Response) return user;
    const rows = await sql`
        UPDATE arcade_games SET status='active', flagged_reason=NULL, updated_at=NOW()
        WHERE slug=${slug} AND status='flagged' RETURNING id`;
    if (!rows.length) return err("Game not flagged", "NOT_FOUND", 404);
    await arcadeAudit("game_unflag", slug, user.activeDomain!);
    return json({ ok: true });
}

async function listFlagged(req: Request): Promise<Response> {
    const user = await requireAdmin(req);
    if (user instanceof Response) return user;
    const rows = await sql`
        SELECT * FROM arcade_games WHERE status='flagged' ORDER BY updated_at DESC`;
    return json({ flagged: rows.map((r) => ({ ...toGameDetail(r as GameRow), flaggedReason: r.flagged_reason })) });
}

// ---------------------------------------------------------------------------
// Row → API shape
// ---------------------------------------------------------------------------

interface GameRow {
    id: string;
    slug: string;
    title: string;
    description: string;
    category: string;
    source_url: string | null;
    builder_domain: string;
    builder_label: string;
    builder_address: string;
    ipfs_cid: string;
    version: number;
    play_count: number;
    player_count: number;
    max_possible_score: number | null;
    max_score_per_second: number | null;
    cover_key: string | null;
    status: string;
    rejected_reason: string | null;
    flagged_reason: string | null;
    created_at: string;
    updated_at: string;
}

function toGameSummary(r: any) {
    return {
        slug: r.slug,
        title: r.title,
        description: r.description,
        category: r.category,
        builder: { domain: r.builder_domain, label: r.builder_label, address: r.builder_address },
        ipfsCid: r.ipfs_cid,
        coverKey: r.cover_key ?? null,
        version: Number(r.version),
        playCount: Number(r.play_count),
        playerCount: Number(r.player_count),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
    };
}

function toGameDetail(r: GameRow) {
    return {
        ...toGameSummary(r),
        sourceUrl: r.source_url,
        maxPossibleScore: r.max_possible_score,
        maxScorePerSecond: r.max_score_per_second,
        status: r.status,
    };
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
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Active-Domain",
                "Access-Control-Max-Age": "600",
            },
        });
    }

    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/api\/v1\/arcade/, "") || "/";
    const segments = path.split("/").filter(Boolean);
    const method = req.method;

    try {
        // Public reads
        if (method === "GET" && path === "/games") return await listGames(url);
        if (method === "GET" && segments[0] === "games" && segments.length === 2)
            return await getGame(decodeURIComponent(segments[1]));
        if (method === "GET" && segments[0] === "leaderboard" && segments.length === 2)
            return await getLeaderboard(url, decodeURIComponent(segments[1]));
        if (method === "GET" && path === "/champions") return await getChampions(url);
        if (method === "GET" && segments[0] === "player" && segments.length === 2)
            return await getPlayer(decodeURIComponent(segments[1]));
        if (method === "GET" && path === "/recent") return await getRecent(url);

        // Authenticated
        if (method === "POST" && path === "/session") return await startSession(req);
        if (method === "POST" && path === "/score") return await submitScore(req);
        if (method === "POST" && path === "/submit") return await submitGame(req);
        if (method === "GET" && path === "/my-games") return await listMyGames(req);
        if (method === "POST" && segments[0] === "games" && segments[2] === "update")
            return await updateGame(req, decodeURIComponent(segments[1]));
        if (method === "POST" && segments[0] === "games" && segments[2] === "edit")
            return await editGame(req, decodeURIComponent(segments[1]));
        if (method === "POST" && segments[0] === "games" && segments[2] === "rescind")
            return await rescindGame(req, decodeURIComponent(segments[1]));
        if (method === "POST" && segments[0] === "games" && segments[2] === "flag")
            return await flagGame(req, decodeURIComponent(segments[1]));

        // Admin
        if (method === "GET" && path === "/pending") return await listPending(req);
        if (method === "GET" && path === "/pending-updates") return await listPendingUpdates(req);
        if (method === "POST" && segments[0] === "games" && segments[2] === "approve")
            return await approveGame(req, decodeURIComponent(segments[1]));
        if (method === "POST" && segments[0] === "games" && segments[2] === "reject")
            return await rejectGame(req, decodeURIComponent(segments[1]));
        if (method === "POST" && segments[0] === "games" && segments[2] === "approve-update")
            return await approveUpdate(req, decodeURIComponent(segments[1]));
        if (method === "POST" && segments[0] === "games" && segments[2] === "reject-update")
            return await rejectUpdate(req, decodeURIComponent(segments[1]));
        if (method === "POST" && segments[0] === "games" && segments[2] === "remove")
            return await removeGame(req, decodeURIComponent(segments[1]));
        if (method === "POST" && segments[0] === "games" && segments[2] === "unflag")
            return await unflagGame(req, decodeURIComponent(segments[1]));
        if (method === "GET" && path === "/flagged") return await listFlagged(req);

        return err("Not found", "NOT_FOUND", 404);
    } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        console.error("Arcade API error:", message);
        return err(message, "SERVER_ERROR", 500);
    }
}

export const config: Config = { path: "/api/v1/arcade/*" };
