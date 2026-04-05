import type { D1Database } from "@cloudflare/workers-types";
import { SignJWT } from "jose";
import { verifyTezosSignature, getOwnedDomains } from "./auth/verify.js";

interface Env {
  DB: D1Database;
  CHAT_JWT_SECRET: string;
  TEZOS_NETWORK?: string;
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
      return handleAuth(request, env);
    }

    if (path === "/history" && request.method === "GET") {
      return handleHistory(request, env);
    }

    return errorResponse(request, "Not found", "NOT_FOUND", 404);
  },
};
