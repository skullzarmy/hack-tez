import type { D1Database } from "@cloudflare/workers-types";
import { SignJWT, jwtVerify } from "jose";
import { verifyTezosSignature, getOwnedDomains } from "./auth/verify.js";

interface Env {
  DB: D1Database;
  CHAT_JWT_SECRET: string;
  TEZOS_NETWORK?: string;
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
  "https://hack.tez",
  "https://hack-tez.netlify.app",
  "http://localhost:5173",
  "http://localhost:8888",
];

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
  } catch {
    return errorResponse(request, "Signature verification failed", "SIG_VERIFY_ERROR", 400);
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
    .setExpirationTime("1h")
    .sign(secret);

  return corsResponse(request, JSON.stringify({ token, domains, activeDomain }));
}

async function handleHistory(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const before = url.searchParams.get("before") ?? undefined;
  const limitParam = url.searchParams.get("limit");
  const limit = Math.min(Math.max(Number(limitParam) || 50, 1), 100);

  try {
    let result: { results: Array<Record<string, unknown>> };
    if (before) {
      result = await env.DB
        .prepare(
          "SELECT id, sender_domain, content, created_at FROM chat_messages WHERE room_id = 'global' AND created_at < ? ORDER BY created_at DESC LIMIT ?",
        )
        .bind(before, limit + 1)
        .all();
    } else {
      result = await env.DB
        .prepare(
          "SELECT id, sender_domain, content, created_at FROM chat_messages WHERE room_id = 'global' ORDER BY created_at DESC LIMIT ?",
        )
        .bind(limit + 1)
        .all();
    }

    const rows = result.results;
    const hasMore = rows.length > limit;
    const messages = rows.slice(0, limit).map((r) => ({
      id: r.id as string,
      sender: r.sender_domain as string,
      content: r.content as string,
      timestamp: r.created_at as string,
    }));

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

  if (targetDomain === user.activeDomain) {
    return errorResponse(request, "Cannot DM yourself", "SELF_DM", 400);
  }

  const roomId = computeDmRoomId(user.activeDomain, targetDomain);

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
      .bind(roomId, targetDomain)
      .run();

    return corsResponse(request, JSON.stringify({ roomId, targetDomain }));
  } catch {
    return errorResponse(request, "Failed to create DM room", "DM_CREATE_ERROR", 500);
  }
}

async function handleDmList(request: Request, env: Env): Promise<Response> {
  const user = await verifyJwt(request, env);
  if (!user) return errorResponse(request, "Unauthorized", "AUTH_REQUIRED", 401);

  try {
    // Single CTE query replaces N+1 per-room queries
    const result = await env.DB
      .prepare(
        `WITH user_rooms AS (
           SELECT r.id AS room_id, r.created_at AS room_created_at, m.last_read, m.domain AS user_domain
           FROM chat_room_members m
           JOIN chat_rooms r ON r.id = m.room_id
           WHERE m.domain = ? AND r.type = 'dm'
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
                COALESCE(uc.cnt, 0) AS unread_count
         FROM user_rooms ur
         LEFT JOIN latest_msgs lm ON lm.room_id = ur.room_id AND lm.rn = 1
         LEFT JOIN unread_counts uc ON uc.room_id = ur.room_id
         ORDER BY COALESCE(lm.created_at, ur.room_created_at) DESC`,
      )
      .bind(user.activeDomain)
      .all();

    const conversations = result.results.map((row) => {
      const roomId = row.room_id as string;
      const parts = roomId.slice(3).split("+");
      const peerDomain = parts[0] === user.activeDomain ? parts[1] : parts[0];
      return {
        roomId,
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
          "SELECT id, sender_domain, content, created_at FROM chat_messages WHERE room_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?",
        )
        .bind(roomId, before, limit + 1)
        .all();
    } else {
      result = await env.DB
        .prepare(
          "SELECT id, sender_domain, content, created_at FROM chat_messages WHERE room_id = ? ORDER BY created_at DESC LIMIT ?",
        )
        .bind(roomId, limit + 1)
        .all();
    }

    const rows = result.results;
    const hasMore = rows.length > limit;
    const messages = rows.slice(0, limit).map((r) => ({
      id: r.id as string,
      sender: r.sender_domain as string,
      content: r.content as string,
      timestamp: r.created_at as string,
    }));

    return corsResponse(request, JSON.stringify({ messages, hasMore }));
  } catch {
    return errorResponse(request, "Failed to load DM history", "DM_HISTORY_ERROR", 500);
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

    return errorResponse(request, "Not found", "NOT_FOUND", 404);
  },
};
