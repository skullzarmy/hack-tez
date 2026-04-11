import type { D1Database } from "@cloudflare/workers-types";
import { SignJWT, jwtVerify } from "jose";
import { verifyTezosSignature, getOwnedDomains } from "./auth/verify.js";

interface Env {
  DB: D1Database;
  CHAT_JWT_SECRET: string;
  TEZOS_NETWORK?: string;
  INTERNAL_SECRET?: string;
  KLIPY_API_KEY?: string;
}

interface JwtPayload {
  address: string;
  domains: string[];
  activeDomain: string;
}

// Per-isolate rate limiting for auth endpoint.
// NOTE: This is per-isolate only (CF Workers are stateless across isolates).
// For global enforcement, add CF Rate Limiting rules in the Cloudflare dashboard.
const AUTH_RATE_LIMIT = new Map<string, { count: number; resetAt: number }>();
const AUTH_RATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const AUTH_RATE_MAX = 5;

function checkAuthRateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const entry = AUTH_RATE_LIMIT.get(ip);
  if (!entry || now > entry.resetAt) {
    AUTH_RATE_LIMIT.set(ip, { count: 1, resetAt: now + AUTH_RATE_WINDOW_MS });
    return { allowed: true, retryAfterSec: 0 };
  }
  entry.count++;
  if (entry.count > AUTH_RATE_MAX) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

const ALLOWED_ORIGINS = [
  "https://hacktez.com",
  "https://www.hacktez.com",
  "https://hack-tez.netlify.app",
  "http://localhost:5173",
  "http://localhost:8888",
];

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Netlify deploy previews: deploy-preview-*--hacktez.netlify.app
  if (/^https:\/\/[a-z0-9-]+--hacktez\.netlify\.app$/.test(origin)) return true;
  return false;
}

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  const allowedOrigin = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Active-Domain",
    "Access-Control-Max-Age": "86400",
  };
}

function corsResponse(request: Request, body: string | null, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json", ...getCorsHeaders(request) },
  });
}

function errorResponse(request: Request, error: string, code: string, status: number): Response {
  return corsResponse(request, JSON.stringify({ error, code }), status);
}

async function verifyJwt(request: Request, env: Env): Promise<JwtPayload | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  try {
    const secret = new TextEncoder().encode(env.CHAT_JWT_SECRET);
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    const claims = payload as unknown as JwtPayload;

    // Allow identity override via X-Active-Domain header (must be in JWT's domains)
    const domainOverride = request.headers.get("X-Active-Domain");
    if (domainOverride && claims.domains.includes(domainOverride)) {
      claims.activeDomain = domainOverride;
    }

    return claims;
  } catch {
    return null;
  }
}

function computeDmRoomId(domainA: string, domainB: string): string {
  const sorted = [domainA, domainB].sort();
  return `dm:${sorted[0]}+${sorted[1]}`;
}

function getNetworkTld(env: Env): "tez" | "gho" {
  return env.TEZOS_NETWORK === "mainnet" ? "tez" : "gho";
}

function isAdmin(jwt: JwtPayload, env: Env): boolean {
  const tld = getNetworkTld(env);
  const adminDomain = `admin.hack.${tld}`;
  return jwt.domains.includes(adminDomain);
}

/** Format a message row from D1, handling soft-deleted messages */
function formatMessageRow(r: Record<string, unknown>) {
  const base: Record<string, unknown> = {
    id: r.id as string,
    sender: r.sender_domain as string,
    timestamp: r.created_at as string,
  };
  if (r.media) {
    try { base.media = JSON.parse(r.media as string); } catch { /* ignore bad JSON */ }
  }
  if (r.reply_to) base.replyTo = r.reply_to as string;
  if (r.edited_at) base.editedAt = r.edited_at as string;
  if (r.deleted_at) {
    return {
      ...base,
      content: null,
      deleted: true,
      deletedBy: r.deleted_by as string,
      deleteReason: r.delete_reason as string,
    };
  }
  return { ...base, content: r.content as string };
}

const MESSAGE_COLS = "id, sender_domain, content, created_at, deleted_at, deleted_by, delete_reason, delete_visible, media, reply_to, edited_at";
const VISIBLE_FILTER = "(deleted_at IS NULL OR delete_visible = 1)";

function normalizeDmTargetDomain(input: string, tld: "tez" | "gho"): { ok: true; domain: string } | { ok: false; error: string } {
  const raw = input.trim().toLowerCase();
  if (!raw) return { ok: false, error: "targetDomain is required" };
  if (raw.length > 80) return { ok: false, error: "Domain is too long" };

  const labelPattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

  // Full form: label.hack.<tld>
  const fullMatch = raw.match(new RegExp(`^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\\.hack\\.${tld}$`));
  if (fullMatch) {
    return { ok: true, domain: raw };
  }

  // Label-only form
  if (raw.includes(".")) {
    return { ok: false, error: `Domain must be a label or end with .hack.${tld}` };
  }

  if (raw.length < 1 || raw.length > 63 || !labelPattern.test(raw)) {
    return { ok: false, error: "Invalid label format" };
  }

  return { ok: true, domain: `${raw}.hack.${tld}` };
}

interface AuthRequestBody {
  address: string;
  publicKey: string;
  signature: string;
  timestamp: number;
  nonce: string;
}

function isValidAuthBody(body: unknown): body is AuthRequestBody {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.address === "string" &&
    typeof b.publicKey === "string" &&
    typeof b.signature === "string" &&
    typeof b.timestamp === "number" &&
    typeof b.nonce === "string"
  );
}

async function handleAuth(request: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(request, "Invalid JSON body", "INVALID_JSON", 400);
  }

  if (!isValidAuthBody(body)) {
    return errorResponse(
      request,
      "Missing required fields: address, publicKey, signature, timestamp, nonce",
      "INVALID_BODY",
      400,
    );
  }

  const { address, publicKey, signature, timestamp, nonce } = body;

  // Verify wallet signature
  let valid: boolean;
  try {
    valid = await verifyTezosSignature({ address, publicKey, signature, timestamp, nonce });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("Signature verification threw:", detail);
    return errorResponse(request, `Signature verification failed: ${detail}`, "SIG_VERIFY_ERROR", 400);
  }

  if (!valid) {
    return errorResponse(request, "Invalid signature or expired timestamp", "INVALID_SIGNATURE", 401);
  }

  // Look up owned domains
  const network = (env.TEZOS_NETWORK === "mainnet" ? "mainnet" : "ghostnet") as "ghostnet" | "mainnet";
  let domains: string[];
  try {
    domains = await getOwnedDomains(address, network);
  } catch {
    return errorResponse(request, "Failed to query domain ownership", "DOMAIN_LOOKUP_ERROR", 502);
  }

  if (domains.length === 0) {
    return errorResponse(request, "No hack.tez domain found for this wallet", "NO_DOMAIN", 403);
  }

  const activeDomain = domains[0];

  // Issue JWT
  const secret = new TextEncoder().encode(env.CHAT_JWT_SECRET);
  const token = await new SignJWT({ address, domains, activeDomain })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secret);

  return corsResponse(request, JSON.stringify({ token, domains, activeDomain }));
}

async function handleRefresh(request: Request, env: Env): Promise<Response> {
  const user = await verifyJwt(request, env);
  if (!user) return errorResponse(request, "Token invalid or expired", "AUTH_REQUIRED", 401);

  // Re-verify domain ownership before issuing a new token
  const network = (env.TEZOS_NETWORK === "mainnet" ? "mainnet" : "ghostnet") as "ghostnet" | "mainnet";
  let domains: string[];
  try {
    domains = await getOwnedDomains(user.address, network);
  } catch {
    return errorResponse(request, "Failed to verify domain ownership", "DOMAIN_LOOKUP_ERROR", 502);
  }

  if (domains.length === 0) {
    return errorResponse(request, "No hack.tez domain found — ownership may have changed", "NO_DOMAIN", 403);
  }

  // Keep current active domain if still owned, otherwise pick first
  const activeDomain = domains.includes(user.activeDomain) ? user.activeDomain : domains[0];

  const secret = new TextEncoder().encode(env.CHAT_JWT_SECRET);
  const token = await new SignJWT({ address: user.address, domains, activeDomain })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secret);

  return corsResponse(request, JSON.stringify({ token, domains, activeDomain }));
}

async function handleHistory(request: Request, env: Env): Promise<Response> {
  const user = await verifyJwt(request, env);
  if (!user) return errorResponse(request, "Unauthorized", "AUTH_REQUIRED", 401);

  const url = new URL(request.url);
  const before = url.searchParams.get("before") ?? undefined;
  const limitParam = url.searchParams.get("limit");
  const limit = Math.min(Math.max(Number(limitParam) || 50, 1), 100);

  try {
    let result: { results: Array<Record<string, unknown>> };
    if (before) {
      result = await env.DB
        .prepare(
          `SELECT ${MESSAGE_COLS} FROM chat_messages WHERE room_id = 'global' AND ${VISIBLE_FILTER} AND created_at < ? ORDER BY created_at DESC LIMIT ?`,
        )
        .bind(before, limit + 1)
        .all();
    } else {
      result = await env.DB
        .prepare(
          `SELECT ${MESSAGE_COLS} FROM chat_messages WHERE room_id = 'global' AND ${VISIBLE_FILTER} ORDER BY created_at DESC LIMIT ?`,
        )
        .bind(limit + 1)
        .all();
    }

    const rows = result.results;
    const hasMore = rows.length > limit;
    const messages = rows.slice(0, limit).map(formatMessageRow);

    return corsResponse(request, JSON.stringify({ messages, hasMore }));
  } catch {
    return errorResponse(request, "Failed to load history", "HISTORY_ERROR", 500);
  }
}

async function handleDmCreate(request: Request, env: Env): Promise<Response> {
  const user = await verifyJwt(request, env);
  if (!user) return errorResponse(request, "Unauthorized", "AUTH_REQUIRED", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(request, "Invalid JSON body", "INVALID_JSON", 400);
  }

  const b = body as Record<string, unknown>;
  const targetDomain = b.targetDomain;
  if (!targetDomain || typeof targetDomain !== "string") {
    return errorResponse(request, "targetDomain is required", "INVALID_BODY", 400);
  }

  const normalized = normalizeDmTargetDomain(targetDomain, getNetworkTld(env));
  if (!normalized.ok) {
    return errorResponse(request, normalized.error, "INVALID_DOMAIN", 400);
  }

  const normalizedTargetDomain = normalized.domain;

  if (normalizedTargetDomain === user.activeDomain) {
    return errorResponse(request, "Cannot DM yourself", "SELF_DM", 400);
  }

  const roomId = computeDmRoomId(user.activeDomain, normalizedTargetDomain);

  try {
    await env.DB
      .prepare("INSERT OR IGNORE INTO chat_rooms (id, type) VALUES (?, 'dm')")
      .bind(roomId)
      .run();

    await env.DB
      .prepare("INSERT OR IGNORE INTO chat_room_members (room_id, domain) VALUES (?, ?)")
      .bind(roomId, user.activeDomain)
      .run();

    await env.DB
      .prepare("INSERT OR IGNORE INTO chat_room_members (room_id, domain) VALUES (?, ?)")
      .bind(roomId, normalizedTargetDomain)
      .run();

    return corsResponse(request, JSON.stringify({ roomId, targetDomain: normalizedTargetDomain }));
  } catch {
    return errorResponse(request, "Failed to create DM room", "DM_CREATE_ERROR", 500);
  }
}

async function handleDmList(request: Request, env: Env): Promise<Response> {
  const user = await verifyJwt(request, env);
  if (!user) return errorResponse(request, "Unauthorized", "AUTH_REQUIRED", 401);

  try {
    const domains = user.domains;
    if (domains.length === 0) {
      return corsResponse(request, JSON.stringify({ conversations: [] }));
    }

    const placeholders = domains.map(() => "?").join(", ");

    // Single CTE query replaces N+1 per-room queries
    const result = await env.DB
      .prepare(
        `WITH user_rooms AS (
           SELECT r.id AS room_id, r.created_at AS room_created_at, m.last_read, m.domain AS user_domain
           FROM chat_room_members m
           JOIN chat_rooms r ON r.id = m.room_id
           WHERE m.domain IN (${placeholders}) AND r.type = 'dm'
         ),
         latest_msgs AS (
           SELECT room_id, content, created_at, sender_domain,
                  ROW_NUMBER() OVER (PARTITION BY room_id ORDER BY created_at DESC) AS rn
           FROM chat_messages
           WHERE room_id IN (SELECT room_id FROM user_rooms)
         ),
         unread_counts AS (
           SELECT cm.room_id,
                  COUNT(*) AS cnt
           FROM chat_messages cm
           JOIN user_rooms ur ON ur.room_id = cm.room_id
           WHERE cm.sender_domain != ur.user_domain
             AND (ur.last_read IS NULL OR cm.created_at > ur.last_read)
           GROUP BY cm.room_id
         )
         SELECT ur.room_id,
                ur.room_created_at,
                lm.content AS last_message,
                lm.created_at AS last_message_at,
                COALESCE(uc.cnt, 0) AS unread_count,
                ur.user_domain AS user_domain
         FROM user_rooms ur
         LEFT JOIN latest_msgs lm ON lm.room_id = ur.room_id AND lm.rn = 1
         LEFT JOIN unread_counts uc ON uc.room_id = ur.room_id
         ORDER BY COALESCE(lm.created_at, ur.room_created_at) DESC`,
      )
      .bind(...domains)
      .all();

    const conversations = result.results.map((row) => {
      const roomId = row.room_id as string;
      const ownDomain = row.user_domain as string;
      const parts = roomId.slice(3).split("+");
      const peerDomain = parts[0] === ownDomain ? parts[1] : parts[0];
      return {
        roomId,
        ownDomain,
        peerDomain,
        lastMessage: (row.last_message as string | null) ?? null,
        lastMessageAt: (row.last_message_at as string | null) ?? null,
        unreadCount: (row.unread_count as number) ?? 0,
      };
    });

    return corsResponse(request, JSON.stringify({ conversations }));
  } catch {
    return errorResponse(request, "Failed to list DM conversations", "DM_LIST_ERROR", 500);
  }
}

async function handleDmHistory(request: Request, env: Env, roomId: string): Promise<Response> {
  const user = await verifyJwt(request, env);
  if (!user) return errorResponse(request, "Unauthorized", "AUTH_REQUIRED", 401);

  // Verify user is a member of this room
  const memberResult = await env.DB
    .prepare("SELECT 1 FROM chat_room_members WHERE room_id = ? AND domain = ?")
    .bind(roomId, user.activeDomain)
    .all();

  if (memberResult.results.length === 0) {
    return errorResponse(request, "Not a member of this room", "NOT_MEMBER", 403);
  }

  const url = new URL(request.url);
  const before = url.searchParams.get("before") ?? undefined;
  const limitParam = url.searchParams.get("limit");
  const limit = Math.min(Math.max(Number(limitParam) || 50, 1), 100);

  try {
    let result: { results: Array<Record<string, unknown>> };
    if (before) {
      result = await env.DB
        .prepare(
          `SELECT ${MESSAGE_COLS} FROM chat_messages WHERE room_id = ? AND ${VISIBLE_FILTER} AND created_at < ? ORDER BY created_at DESC LIMIT ?`,
        )
        .bind(roomId, before, limit + 1)
        .all();
    } else {
      result = await env.DB
        .prepare(
          `SELECT ${MESSAGE_COLS} FROM chat_messages WHERE room_id = ? AND ${VISIBLE_FILTER} ORDER BY created_at DESC LIMIT ?`,
        )
        .bind(roomId, limit + 1)
        .all();
    }

    const rows = result.results;
    const hasMore = rows.length > limit;
    const messages = rows.slice(0, limit).map(formatMessageRow);

    return corsResponse(request, JSON.stringify({ messages, hasMore }));
  } catch {
    return errorResponse(request, "Failed to load DM history", "DM_HISTORY_ERROR", 500);
  }
}

// --- Internal API (PartyKit → Worker, secured by shared secret) ---

function verifyInternalSecret(request: Request, env: Env): boolean {
  const secret = env.INTERNAL_SECRET;
  if (!secret) return false;
  return request.headers.get("X-Internal-Secret") === secret;
}

async function handleInternalStoreMessage(request: Request, env: Env): Promise<Response> {
  if (!verifyInternalSecret(request, env)) {
    return new Response("Forbidden", { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const id = b.id as string;
  const roomId = b.roomId as string;
  const senderDomain = b.senderDomain as string;
  const content = b.content as string;
  const media = b.media ? JSON.stringify(b.media) : null;
  const replyTo = (b.replyTo as string) || null;

  if (!id || !roomId || !senderDomain || (content === undefined && !media)) {
    return new Response("Missing fields", { status: 400 });
  }

  try {
    await env.DB
      .prepare("INSERT INTO chat_messages (id, room_id, sender_domain, content, media, reply_to) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, roomId, senderDomain, content, media, replyTo)
      .run();
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Internal store error:", err);
    return new Response(JSON.stringify({ error: "Store failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

async function handleInternalHistory(request: Request, env: Env): Promise<Response> {
  if (!verifyInternalSecret(request, env)) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const roomId = url.searchParams.get("roomId") ?? "global";
  const before = url.searchParams.get("before") ?? undefined;
  const limitParam = url.searchParams.get("limit");
  const limit = Math.min(Math.max(Number(limitParam) || 50, 1), 100);

  try {
    let result: { results: Array<Record<string, unknown>> };
    if (before) {
      result = await env.DB
        .prepare(
          `SELECT ${MESSAGE_COLS} FROM chat_messages WHERE room_id = ? AND ${VISIBLE_FILTER} AND created_at < ? ORDER BY created_at DESC LIMIT ?`,
        )
        .bind(roomId, before, limit + 1)
        .all();
    } else {
      result = await env.DB
        .prepare(
          `SELECT ${MESSAGE_COLS} FROM chat_messages WHERE room_id = ? AND ${VISIBLE_FILTER} ORDER BY created_at DESC LIMIT ?`,
        )
        .bind(roomId, limit + 1)
        .all();
    }

    const rows = result.results;
    const hasMore = rows.length > limit;
    const messages = rows.slice(0, limit).map(formatMessageRow);

    return new Response(JSON.stringify({ messages, hasMore }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Internal history error:", err);
    return new Response(JSON.stringify({ error: "History failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

async function handleInternalUnread(request: Request, env: Env): Promise<Response> {
  if (!verifyInternalSecret(request, env)) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const roomId = url.searchParams.get("roomId");
  const domain = url.searchParams.get("domain");
  if (!roomId || !domain) {
    return new Response("Missing roomId or domain", { status: 400 });
  }

  try {
    const memberResult = await env.DB
      .prepare("SELECT last_read FROM chat_room_members WHERE room_id = ? AND domain = ?")
      .bind(roomId, domain)
      .all();
    const lastRead = memberResult.results[0]?.last_read as string | null;

    let unreadResult: { results: Array<Record<string, unknown>> };
    if (lastRead) {
      unreadResult = await env.DB
        .prepare("SELECT COUNT(*) as cnt FROM chat_messages WHERE room_id = ? AND created_at > ? AND sender_domain != ?")
        .bind(roomId, lastRead, domain)
        .all();
    } else {
      unreadResult = await env.DB
        .prepare("SELECT COUNT(*) as cnt FROM chat_messages WHERE room_id = ? AND sender_domain != ?")
        .bind(roomId, domain)
        .all();
    }
    const count = (unreadResult.results[0]?.cnt as number) ?? 0;
    return new Response(JSON.stringify({ count }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Internal unread error:", err);
    return new Response(JSON.stringify({ error: "Unread check failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

async function handleInternalMarkRead(request: Request, env: Env): Promise<Response> {
  if (!verifyInternalSecret(request, env)) {
    return new Response("Forbidden", { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const roomId = b.roomId as string;
  const domain = b.domain as string;
  if (!roomId || !domain) {
    return new Response("Missing fields", { status: 400 });
  }

  const now = new Date().toISOString();
  try {
    await env.DB
      .prepare("UPDATE chat_room_members SET last_read = ? WHERE room_id = ? AND domain = ?")
      .bind(now, roomId, domain)
      .run();
    return new Response(JSON.stringify({ ok: true, timestamp: now }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Internal mark-read error:", err);
    return new Response(JSON.stringify({ error: "Mark read failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

// --- Internal message editing + reactions (PartyKit → Worker) ---

async function handleInternalEditMessage(request: Request, env: Env): Promise<Response> {
  if (!verifyInternalSecret(request, env)) {
    return new Response("Forbidden", { status: 403 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const messageId = b.messageId as string;
  const senderDomain = b.senderDomain as string;
  const content = b.content as string;

  if (!messageId || !senderDomain || !content) {
    return new Response("Missing fields", { status: 400 });
  }

  const trimmed = content.trim();
  if (trimmed.length === 0 || trimmed.length > 4000) {
    return new Response("Content must be 1-4000 characters", { status: 400 });
  }

  try {
    // Verify sender owns the message and it's not deleted
    const msg = await env.DB
      .prepare("SELECT sender_domain FROM chat_messages WHERE id = ? AND deleted_at IS NULL")
      .bind(messageId)
      .first();

    if (!msg) {
      return new Response(JSON.stringify({ error: "Message not found" }), {
        status: 404, headers: { "Content-Type": "application/json" },
      });
    }

    if (msg.sender_domain !== senderDomain) {
      return new Response(JSON.stringify({ error: "Can only edit your own messages" }), {
        status: 403, headers: { "Content-Type": "application/json" },
      });
    }

    const now = new Date().toISOString();
    await env.DB
      .prepare("UPDATE chat_messages SET content = ?, edited_at = ? WHERE id = ?")
      .bind(trimmed, now, messageId)
      .run();

    return new Response(JSON.stringify({ ok: true, editedAt: now }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Internal edit-message error:", err);
    return new Response(JSON.stringify({ error: "Edit failed" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
}

async function handleInternalReact(request: Request, env: Env): Promise<Response> {
  if (!verifyInternalSecret(request, env)) {
    return new Response("Forbidden", { status: 403 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const messageId = b.messageId as string;
  const domain = b.domain as string;
  const emoji = b.emoji as string;

  if (!messageId || !domain || !emoji) {
    return new Response("Missing fields", { status: 400 });
  }

  // Limit emoji to a reasonable length (single emoji or short code)
  if (emoji.length > 32) {
    return new Response("Emoji too long", { status: 400 });
  }

  try {
    // Toggle: try to delete first, if no rows deleted then insert
    const del = await env.DB
      .prepare("DELETE FROM chat_reactions WHERE message_id = ? AND domain = ? AND emoji = ?")
      .bind(messageId, domain, emoji)
      .run();

    let action: "add" | "remove";
    if (del.meta.changes && del.meta.changes > 0) {
      action = "remove";
    } else {
      await env.DB
        .prepare("INSERT INTO chat_reactions (message_id, domain, emoji) VALUES (?, ?, ?)")
        .bind(messageId, domain, emoji)
        .run();
      action = "add";
    }

    // Get updated reaction counts for this message
    const counts = await env.DB
      .prepare("SELECT emoji, COUNT(*) as count FROM chat_reactions WHERE message_id = ? GROUP BY emoji")
      .bind(messageId)
      .all();

    const reactions = counts.results.map((r) => ({
      emoji: r.emoji as string,
      count: r.count as number,
    }));

    return new Response(JSON.stringify({ ok: true, action, reactions }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Internal react error:", err);
    return new Response(JSON.stringify({ error: "React failed" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
}

async function handleInternalGetReactions(request: Request, env: Env): Promise<Response> {
  if (!verifyInternalSecret(request, env)) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const messageId = url.searchParams.get("messageId");

  if (!messageId) {
    return new Response("Missing messageId", { status: 400 });
  }

  try {
    const result = await env.DB
      .prepare("SELECT emoji, domain FROM chat_reactions WHERE message_id = ? ORDER BY created_at")
      .bind(messageId)
      .all();

    // Group by emoji
    const grouped: Record<string, string[]> = {};
    for (const r of result.results) {
      const em = r.emoji as string;
      if (!grouped[em]) grouped[em] = [];
      grouped[em].push(r.domain as string);
    }

    const reactions = Object.entries(grouped).map(([emoji, domains]) => ({
      emoji,
      count: domains.length,
      domains,
    }));

    return new Response(JSON.stringify({ reactions }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Internal get-reactions error:", err);
    return new Response(JSON.stringify({ error: "Failed to get reactions" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
}

async function handleInternalGetReplyContext(request: Request, env: Env): Promise<Response> {
  if (!verifyInternalSecret(request, env)) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const messageId = url.searchParams.get("messageId");

  if (!messageId) {
    return new Response("Missing messageId", { status: 400 });
  }

  try {
    const msg = await env.DB
      .prepare("SELECT id, sender_domain, content, deleted_at FROM chat_messages WHERE id = ?")
      .bind(messageId)
      .first();

    if (!msg) {
      return new Response(JSON.stringify({ found: false }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      found: true,
      message: {
        id: msg.id,
        sender: msg.sender_domain,
        content: msg.deleted_at ? null : (msg.content as string)?.slice(0, 200),
        deleted: !!msg.deleted_at,
      },
    }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Internal get-reply-context error:", err);
    return new Response(JSON.stringify({ found: false }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
}

// --- Internal admin endpoints (PartyKit → Worker, secured by shared secret) ---

async function handleInternalDeleteMessage(request: Request, env: Env): Promise<Response> {
  if (!verifyInternalSecret(request, env)) {
    return new Response("Forbidden", { status: 403 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const messageId = b.messageId as string;
  const adminDomain = b.adminDomain as string;
  const reason = b.reason as string;
  const visible = b.visible !== false;

  if (!messageId || !adminDomain || !reason) {
    return new Response("Missing fields", { status: 400 });
  }

  const now = new Date().toISOString();
  try {
    // Get message details before soft-delete (for audit log)
    const msg = await env.DB
      .prepare("SELECT sender_domain, content FROM chat_messages WHERE id = ? AND deleted_at IS NULL")
      .bind(messageId)
      .first();

    if (!msg) {
      return new Response(JSON.stringify({ error: "Message not found or already deleted" }), {
        status: 404, headers: { "Content-Type": "application/json" },
      });
    }

    await env.DB
      .prepare("UPDATE chat_messages SET deleted_at = ?, deleted_by = ?, delete_reason = ?, delete_visible = ? WHERE id = ?")
      .bind(now, adminDomain, reason, visible ? 1 : 0, messageId)
      .run();

    await env.DB
      .prepare("INSERT INTO chat_audit_log (action, target_domain, admin_domain, reason, details) VALUES (?, ?, ?, ?, ?)")
      .bind("message_delete", msg.sender_domain as string, adminDomain, reason,
        JSON.stringify({ messageId, visible, originalContent: msg.content }))
      .run();

    return new Response(JSON.stringify({ ok: true, targetDomain: msg.sender_domain }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Internal delete-message error:", err);
    return new Response(JSON.stringify({ error: "Delete failed" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
}

async function handleInternalBan(request: Request, env: Env): Promise<Response> {
  if (!verifyInternalSecret(request, env)) {
    return new Response("Forbidden", { status: 403 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const domain = b.domain as string;
  const type = b.type as string;
  const scope = (b.scope as string) || "global";
  const reason = b.reason as string;
  const adminDomain = b.adminDomain as string;
  const duration = b.duration as number | undefined;
  const notes = (b.notes as string) || null;
  const address = (b.address as string) || null;

  if (!domain || !type || !reason || !adminDomain) {
    return new Response("Missing fields", { status: 400 });
  }
  if (type !== "soft" && type !== "hard") {
    return new Response("type must be 'soft' or 'hard'", { status: 400 });
  }
  if (scope !== "global" && scope !== "platform") {
    return new Response("scope must be 'global' or 'platform'", { status: 400 });
  }

  const now = new Date().toISOString();
  const expiresAt = type === "soft" && duration
    ? new Date(Date.now() + duration * 1000).toISOString()
    : null;

  try {
    await env.DB
      .prepare(`INSERT OR REPLACE INTO chat_bans (domain, type, scope, reason, admin_domain, address, created_at, expires_at, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(domain, type, scope, reason, adminDomain, address, now, expiresAt, notes)
      .run();

    const auditAction = type === "soft" ? "ban_soft" : "ban_hard";
    await env.DB
      .prepare("INSERT INTO chat_audit_log (action, target_domain, admin_domain, reason, details) VALUES (?, ?, ?, ?, ?)")
      .bind(auditAction, domain, adminDomain, reason,
        JSON.stringify({ type, scope, duration: duration ?? null, address, expiresAt }))
      .run();

    return new Response(JSON.stringify({
      ok: true, ban: { domain, type, scope, reason, adminDomain: adminDomain, expiresAt },
    }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Internal ban error:", err);
    return new Response(JSON.stringify({ error: "Ban failed" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
}

async function handleInternalUnban(request: Request, env: Env): Promise<Response> {
  if (!verifyInternalSecret(request, env)) {
    return new Response("Forbidden", { status: 403 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const domain = b.domain as string;
  const adminDomain = b.adminDomain as string;
  const reason = (b.reason as string) || "Unbanned by admin";

  if (!domain || !adminDomain) {
    return new Response("Missing fields", { status: 400 });
  }

  try {
    const result = await env.DB
      .prepare("DELETE FROM chat_bans WHERE domain = ?")
      .bind(domain)
      .run();

    if (!result.meta.changes) {
      return new Response(JSON.stringify({ error: "No active ban found" }), {
        status: 404, headers: { "Content-Type": "application/json" },
      });
    }

    await env.DB
      .prepare("INSERT INTO chat_audit_log (action, target_domain, admin_domain, reason) VALUES (?, ?, ?, ?)")
      .bind("unban", domain, adminDomain, reason)
      .run();

    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Internal unban error:", err);
    return new Response(JSON.stringify({ error: "Unban failed" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
}

async function handleInternalBanCheck(request: Request, env: Env): Promise<Response> {
  if (!verifyInternalSecret(request, env)) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const domain = url.searchParams.get("domain");
  const address = url.searchParams.get("address");
  const context = url.searchParams.get("context") ?? "global";

  if (!domain) {
    return new Response("Missing domain", { status: 400 });
  }

  try {
    // Clean up expired soft bans opportunistically
    await env.DB
      .prepare("DELETE FROM chat_bans WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')")
      .run();

    const scopeCondition = context === "global"
      ? "AND (scope = 'global' OR scope = 'platform')"
      : "AND scope = 'platform'";

    let ban: Record<string, unknown> | null = null;

    // Check by domain first
    const domainResult = await env.DB
      .prepare(`SELECT domain, type, scope, reason, admin_domain, expires_at, created_at FROM chat_bans WHERE domain = ? ${scopeCondition}`)
      .bind(domain)
      .first();

    if (domainResult) {
      ban = domainResult;
    }

    // Check by wallet address if provided and no domain ban found
    if (!ban && address) {
      const addrResult = await env.DB
        .prepare(`SELECT domain, type, scope, reason, admin_domain, expires_at, created_at FROM chat_bans WHERE address = ? ${scopeCondition}`)
        .bind(address)
        .first();
      if (addrResult) {
        ban = addrResult;
      }
    }

    if (ban) {
      return new Response(JSON.stringify({
        banned: true,
        ban: {
          domain: ban.domain,
          type: ban.type,
          scope: ban.scope,
          reason: ban.reason,
          adminDomain: ban.admin_domain,
          expiresAt: ban.expires_at,
          createdAt: ban.created_at,
        },
      }), { headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ banned: false }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Internal ban-check error:", err);
    return new Response(JSON.stringify({ banned: false }), {
      headers: { "Content-Type": "application/json" },
    });
  }
}

// --- Public moderation endpoints (no auth required) ---

async function handleModerationBans(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = Math.min(Math.max(Number(limitParam) || 50, 1), 100);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

  try {
    // Clean up expired bans
    await env.DB.prepare("DELETE FROM chat_bans WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')").run();

    const result = await env.DB
      .prepare("SELECT domain, type, scope, reason, admin_domain, created_at, expires_at FROM chat_bans ORDER BY created_at DESC LIMIT ? OFFSET ?")
      .bind(limit, offset)
      .all();

    const bans = result.results.map((r) => ({
      domain: r.domain,
      type: r.type,
      scope: r.scope,
      reason: r.reason,
      adminDomain: r.admin_domain,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    }));

    return corsResponse(request, JSON.stringify({ bans }));
  } catch {
    return errorResponse(request, "Failed to load bans", "BANS_ERROR", 500);
  }
}

async function handleModerationAuditLog(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = Math.min(Math.max(Number(limitParam) || 50, 1), 100);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
  const target = url.searchParams.get("target");
  const action = url.searchParams.get("action");

  try {
    let query = "SELECT id, action, target_domain, admin_domain, reason, details, created_at FROM chat_audit_log";
    const conditions: string[] = [];
    const binds: unknown[] = [];

    if (target) { conditions.push("target_domain = ?"); binds.push(target); }
    if (action) { conditions.push("action = ?"); binds.push(action); }
    if (conditions.length) query += " WHERE " + conditions.join(" AND ");
    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    binds.push(limit, offset);

    const result = await env.DB.prepare(query).bind(...binds).all();

    const entries = result.results.map((r) => ({
      id: r.id,
      action: r.action,
      targetDomain: r.target_domain,
      adminDomain: r.admin_domain,
      reason: r.reason,
      details: r.details ? JSON.parse(r.details as string) : null,
      createdAt: r.created_at,
    }));

    return corsResponse(request, JSON.stringify({ entries }));
  } catch {
    return errorResponse(request, "Failed to load audit log", "AUDIT_LOG_ERROR", 500);
  }
}

// --- Admin REST endpoints (JWT + admin domain required) ---

async function handleAdminUnban(request: Request, env: Env, targetDomain: string): Promise<Response> {
  const user = await verifyJwt(request, env);
  if (!user) return errorResponse(request, "Unauthorized", "AUTH_REQUIRED", 401);
  if (!isAdmin(user, env)) return errorResponse(request, "Admin access required", "FORBIDDEN", 403);

  let reason = "Unbanned by admin";
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.reason && typeof body.reason === "string") reason = body.reason;
  } catch { /* body is optional for DELETE */ }

  try {
    const result = await env.DB.prepare("DELETE FROM chat_bans WHERE domain = ?").bind(targetDomain).run();
    if (!result.meta.changes) {
      return errorResponse(request, "No active ban found", "NOT_FOUND", 404);
    }

    await env.DB
      .prepare("INSERT INTO chat_audit_log (action, target_domain, admin_domain, reason) VALUES (?, ?, ?, ?)")
      .bind("unban", targetDomain, user.activeDomain, reason)
      .run();

    return corsResponse(request, JSON.stringify({ ok: true }));
  } catch {
    return errorResponse(request, "Failed to unban", "UNBAN_ERROR", 500);
  }
}

async function handleAdminUpdateBan(request: Request, env: Env, targetDomain: string): Promise<Response> {
  const user = await verifyJwt(request, env);
  if (!user) return errorResponse(request, "Unauthorized", "AUTH_REQUIRED", 401);
  if (!isAdmin(user, env)) return errorResponse(request, "Admin access required", "FORBIDDEN", 403);

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch {
    return errorResponse(request, "Invalid JSON", "INVALID_JSON", 400);
  }

  try {
    const existing = await env.DB.prepare("SELECT * FROM chat_bans WHERE domain = ?").bind(targetDomain).first();
    if (!existing) return errorResponse(request, "No active ban found", "NOT_FOUND", 404);

    const updates: string[] = [];
    const binds: unknown[] = [];

    if (body.type && (body.type === "soft" || body.type === "hard")) {
      updates.push("type = ?"); binds.push(body.type);
    }
    if (body.scope && (body.scope === "global" || body.scope === "platform")) {
      updates.push("scope = ?"); binds.push(body.scope);
    }
    if (body.reason && typeof body.reason === "string") {
      updates.push("reason = ?"); binds.push(body.reason);
    }
    if (body.notes !== undefined) {
      updates.push("notes = ?"); binds.push(body.notes ?? null);
    }
    if (body.expiresAt !== undefined) {
      updates.push("expires_at = ?"); binds.push(body.expiresAt ?? null);
    }

    if (updates.length === 0) {
      return errorResponse(request, "No fields to update", "INVALID_BODY", 400);
    }

    binds.push(targetDomain);
    await env.DB.prepare(`UPDATE chat_bans SET ${updates.join(", ")} WHERE domain = ?`).bind(...binds).run();

    await env.DB
      .prepare("INSERT INTO chat_audit_log (action, target_domain, admin_domain, reason, details) VALUES (?, ?, ?, ?, ?)")
      .bind("ban_update", targetDomain, user.activeDomain, (body.reason as string) ?? "Ban updated",
        JSON.stringify(body))
      .run();

    return corsResponse(request, JSON.stringify({ ok: true }));
  } catch {
    return errorResponse(request, "Failed to update ban", "UPDATE_ERROR", 500);
  }
}

// --- KLIPY GIF search proxy ---
async function handleGifSearch(request: Request, env: Env): Promise<Response> {
  const apiKey = env.KLIPY_API_KEY;
  if (!apiKey) {
    return errorResponse(request, "GIF search not configured", "GIF_DISABLED", 503);
  }

  // Require valid JWT
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse(request, "Unauthorized", "UNAUTHORIZED", 401);
  }
  const token = authHeader.slice(7);
  try {
    await jwtVerify(new TextEncoder().encode(token), new TextEncoder().encode(env.CHAT_JWT_SECRET));
  } catch {
    return errorResponse(request, "Invalid token", "INVALID_TOKEN", 401);
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "20"), 50);
  const pos = url.searchParams.get("pos") ?? "";

  const endpoint = q.trim()
    ? "https://api.klipy.com/v2/search"
    : "https://api.klipy.com/v2/featured";

  const klipyUrl = new URL(endpoint);
  klipyUrl.searchParams.set("key", apiKey);
  klipyUrl.searchParams.set("client_key", "hackchat");
  klipyUrl.searchParams.set("limit", String(limit));
  klipyUrl.searchParams.set("media_filter", "gif,tinygif");
  klipyUrl.searchParams.set("contentfilter", "medium");
  if (q.trim()) klipyUrl.searchParams.set("q", q.trim());
  if (pos) klipyUrl.searchParams.set("pos", pos);

  try {
    const resp = await fetch(klipyUrl.toString());
    if (!resp.ok) {
      return errorResponse(request, "KLIPY API error", "GIF_API_ERROR", 502);
    }
    const data = await resp.json() as {
      results?: Array<{
        id: string;
        title: string;
        media_formats: Record<string, { url: string; dims: number[] }>;
      }>;
      next?: string;
    };

    const gifs = (data.results ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      url: r.media_formats?.gif?.url ?? "",
      preview: r.media_formats?.tinygif?.url ?? r.media_formats?.gif?.url ?? "",
      width: r.media_formats?.gif?.dims?.[0] ?? 0,
      height: r.media_formats?.gif?.dims?.[1] ?? 0,
    }));

    return corsResponse(request, JSON.stringify({ gifs, next: data.next ?? null }));
  } catch {
    return errorResponse(request, "GIF search failed", "GIF_FETCH_ERROR", 500);
  }
}

// --- OG metadata proxy for link previews ---

const OG_ALLOWLIST = /^https?:\/\//;
const OG_MAX_BODY = 64 * 1024; // 64 KB of HTML is enough for <head>

interface OgData {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  url?: string;
}

function extractOgTags(html: string): OgData {
  const og: OgData = {};
  // Extract meta tags from <head> only
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const head = headMatch?.[1] ?? html.slice(0, 32000);

  const metaRegex = /<meta\s+([^>]*?)>/gi;
  let match: RegExpExecArray | null;
  while ((match = metaRegex.exec(head)) !== null) {
    const attrs = match[1];
    const propMatch = attrs.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i);
    const contentMatch = attrs.match(/content\s*=\s*["']([^"']*?)["']/i);
    if (!propMatch || !contentMatch) continue;

    const prop = propMatch[1].toLowerCase();
    const content = contentMatch[1];

    switch (prop) {
      case "og:title": og.title = content; break;
      case "og:description": og.description = content; break;
      case "og:image": og.image = content; break;
      case "og:site_name": og.siteName = content; break;
      case "og:url": og.url = content; break;
      case "twitter:title": if (!og.title) og.title = content; break;
      case "twitter:description": if (!og.description) og.description = content; break;
      case "twitter:image": if (!og.image) og.image = content; break;
    }
  }

  // Fallback: <title> tag
  if (!og.title) {
    const titleMatch = head.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) og.title = titleMatch[1].trim();
  }

  // Fallback: meta description
  if (!og.description) {
    const descMatch = head.match(/<meta\s+name\s*=\s*["']description["']\s+content\s*=\s*["']([^"']*?)["']/i);
    if (descMatch) og.description = descMatch[1];
  }

  return og;
}

async function handleOgMeta(request: Request, env: Env): Promise<Response> {
  // Require valid JWT
  const jwt = await verifyJwt(request, env);
  if (!jwt) return errorResponse(request, "Unauthorized", "UNAUTHORIZED", 401);

  const url = new URL(request.url);
  const targetUrl = url.searchParams.get("url");
  if (!targetUrl || !OG_ALLOWLIST.test(targetUrl)) {
    return errorResponse(request, "Invalid URL", "INVALID_URL", 400);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const resp = await fetch(targetUrl, {
      headers: {
        "User-Agent": "hackchat-link-preview/1.0 (compatible; bot)",
        "Accept": "text/html",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const contentType = resp.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return corsResponse(request, JSON.stringify({ og: null }));
    }

    // Read only first 64KB to get <head> tags
    const reader = resp.body?.getReader();
    if (!reader) return corsResponse(request, JSON.stringify({ og: null }));

    let html = "";
    const decoder = new TextDecoder();
    while (html.length < OG_MAX_BODY) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    reader.cancel().catch(() => {});

    const og = extractOgTags(html);
    if (!og.title && !og.description && !og.image) {
      return corsResponse(request, JSON.stringify({ og: null }));
    }

    return new Response(JSON.stringify({ og }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...getCorsHeaders(request),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return corsResponse(request, JSON.stringify({ og: null }));
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: getCorsHeaders(request) });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/health") {
      return corsResponse(request, JSON.stringify({ status: "ok", service: "hackchat" }));
    }

    // --- Internal API (PartyKit → Worker) ---
    if (path.startsWith("/internal/")) {
      if (path === "/internal/store-message" && request.method === "POST") {
        return handleInternalStoreMessage(request, env);
      }
      if (path === "/internal/history" && request.method === "GET") {
        return handleInternalHistory(request, env);
      }
      if (path === "/internal/unread" && request.method === "GET") {
        return handleInternalUnread(request, env);
      }
      if (path === "/internal/mark-read" && request.method === "POST") {
        return handleInternalMarkRead(request, env);
      }
      if (path === "/internal/edit-message" && request.method === "POST") {
        return handleInternalEditMessage(request, env);
      }
      if (path === "/internal/react" && request.method === "POST") {
        return handleInternalReact(request, env);
      }
      if (path === "/internal/reactions" && request.method === "GET") {
        return handleInternalGetReactions(request, env);
      }
      if (path === "/internal/reply-context" && request.method === "GET") {
        return handleInternalGetReplyContext(request, env);
      }
      if (path === "/internal/delete-message" && request.method === "POST") {
        return handleInternalDeleteMessage(request, env);
      }
      if (path === "/internal/ban" && request.method === "POST") {
        return handleInternalBan(request, env);
      }
      if (path === "/internal/unban" && request.method === "POST") {
        return handleInternalUnban(request, env);
      }
      if (path === "/internal/ban-check" && request.method === "GET") {
        return handleInternalBanCheck(request, env);
      }
      return new Response("Not found", { status: 404 });
    }

    // --- Public moderation endpoints (no auth) ---
    if (path === "/moderation/bans" && request.method === "GET") {
      return handleModerationBans(request, env);
    }
    if (path === "/moderation/audit-log" && request.method === "GET") {
      return handleModerationAuditLog(request, env);
    }

    // --- Admin REST endpoints ---
    if (path.startsWith("/admin/ban/") && (request.method === "DELETE" || request.method === "PATCH")) {
      const targetDomain = decodeURIComponent(path.slice("/admin/ban/".length));
      if (!targetDomain) return errorResponse(request, "Domain required", "MISSING_DOMAIN", 400);
      if (request.method === "DELETE") return handleAdminUnban(request, env, targetDomain);
      return handleAdminUpdateBan(request, env, targetDomain);
    }

    if (path === "/auth" && request.method === "POST") {
      const ip = request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For") ?? "unknown";
      const rateCheck = checkAuthRateLimit(ip);
      if (!rateCheck.allowed) {
        return new Response(JSON.stringify({ error: "Too many auth attempts", code: "RATE_LIMITED" }), {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(rateCheck.retryAfterSec),
            ...getCorsHeaders(request),
          },
        });
      }
      return handleAuth(request, env);
    }

    if (path === "/auth/refresh" && request.method === "POST") {
      return handleRefresh(request, env);
    }

    if (path === "/gif/search" && request.method === "GET") {
      return handleGifSearch(request, env);
    }

    if (path === "/history" && request.method === "GET") {
      return handleHistory(request, env);
    }

    // DM endpoints
    if (path === "/dm/create" && request.method === "POST") {
      return handleDmCreate(request, env);
    }

    if (path === "/dm/list" && request.method === "GET") {
      return handleDmList(request, env);
    }

    if (path.startsWith("/dm/history/") && request.method === "GET") {
      const roomId = decodeURIComponent(path.slice("/dm/history/".length));
      if (!roomId) return errorResponse(request, "Room ID required", "MISSING_ROOM_ID", 400);
      return handleDmHistory(request, env, roomId);
    }

    if (path === "/og" && request.method === "GET") {
      return handleOgMeta(request, env);
    }

    return errorResponse(request, "Not found", "NOT_FOUND", 404);
  },
};
