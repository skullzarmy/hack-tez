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
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
    return payload as unknown as JwtPayload;
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
    // Get all DM rooms for this user
    const roomsResult = await env.DB
      .prepare(
        `SELECT r.id as room_id, r.created_at as room_created_at, m.last_read
         FROM chat_room_members m
         JOIN chat_rooms r ON r.id = m.room_id
         WHERE m.domain = ? AND r.type = 'dm'
         ORDER BY r.created_at DESC`,
      )
      .bind(user.activeDomain)
      .all();

    const conversations: Array<{
      roomId: string;
      peerDomain: string;
      lastMessage: string | null;
      lastMessageAt: string | null;
      unreadCount: number;
    }> = [];

    for (const row of roomsResult.results) {
      const roomId = row.room_id as string;
      const lastRead = row.last_read as string | null;

      // Extract peer domain from room ID
      const parts = roomId.slice(3).split("+");
      const peerDomain = parts[0] === user.activeDomain ? parts[1] : parts[0];

      // Get latest message
      const lastMsgResult = await env.DB
        .prepare(
          "SELECT content, created_at FROM chat_messages WHERE room_id = ? ORDER BY created_at DESC LIMIT 1",
        )
        .bind(roomId)
        .all();

      const lastMsg = lastMsgResult.results[0];
      const lastMessage = lastMsg ? (lastMsg.content as string) : null;
      const lastMessageAt = lastMsg ? (lastMsg.created_at as string) : null;

      // Get unread count
      let unreadCount = 0;
      if (lastRead) {
        const unreadResult = await env.DB
          .prepare(
            "SELECT COUNT(*) as cnt FROM chat_messages WHERE room_id = ? AND created_at > ? AND sender_domain != ?",
          )
          .bind(roomId, lastRead, user.activeDomain)
          .all();
        unreadCount = (unreadResult.results[0]?.cnt as number) ?? 0;
      } else if (lastMsg) {
        const unreadResult = await env.DB
          .prepare(
            "SELECT COUNT(*) as cnt FROM chat_messages WHERE room_id = ? AND sender_domain != ?",
          )
          .bind(roomId, user.activeDomain)
          .all();
        unreadCount = (unreadResult.results[0]?.cnt as number) ?? 0;
      }

      conversations.push({ roomId, peerDomain, lastMessage, lastMessageAt, unreadCount });
    }

    // Sort by lastMessageAt DESC (rooms with messages first, then by room creation)
    conversations.sort((a, b) => {
      const aTime = a.lastMessageAt ?? "";
      const bTime = b.lastMessageAt ?? "";
      return bTime.localeCompare(aTime);
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
