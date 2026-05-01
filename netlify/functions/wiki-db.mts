import { neon } from "@neondatabase/serverless";
import { buildSecretMap, verifyJwt as verifyJwtCore } from "../../auth/index.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "";
const JWT_SECRET = process.env.CHAT_JWT_SECRET ?? "";
const JWT_KID = process.env.CHAT_JWT_KID ?? "v1";
const JWT_SECRET_PREV = process.env.CHAT_JWT_SECRET_PREV;
const JWT_KID_PREV = process.env.CHAT_JWT_KID_PREV;

/**
 * Worker URL for revocation checks. We call /auth/check-session on every
 * verifyJwt to honor logouts; results are cached in-process for 60s.
 *
 * If HACKCHAT_INTERNAL_URL or INTERNAL_SECRET is unset, we skip revocation
 * checks (signature + expiry only). This keeps local dev and unit tests
 * functional without the worker — but PRODUCTION MUST SET BOTH.
 */
const HACKCHAT_INTERNAL_URL = process.env.HACKCHAT_INTERNAL_URL ?? process.env.VITE_HACKCHAT_URL ?? "";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? "";

export const sql = neon(DATABASE_URL);

export interface JwtPayload {
  address: string;
  sid: string;
  domains: string[];
  activeDomain: string | null;
}

const SECRETS = buildSecretMap({
  currentKid: JWT_KID,
  currentSecret: JWT_SECRET,
  previousKid: JWT_KID_PREV,
  previousSecret: JWT_SECRET_PREV,
});

const REVOCATION_CACHE = new Map<string, { revoked: boolean; expiresAt: number }>();
const REVOCATION_TTL_MS = 60_000;

/** Check session revocation by calling the worker. Cached 60s per Netlify isolate. */
async function checkRevoked(sid: string): Promise<boolean> {
  if (!HACKCHAT_INTERNAL_URL || !INTERNAL_SECRET) return false;
  const now = Date.now();
  const cached = REVOCATION_CACHE.get(sid);
  if (cached && cached.expiresAt > now) return cached.revoked;
  try {
    const url = `${HACKCHAT_INTERNAL_URL.replace(/\/$/, "")}/auth/check-session?sid=${encodeURIComponent(sid)}`;
    const res = await fetch(url, {
      headers: { "X-Internal-Secret": INTERNAL_SECRET },
      // 2s timeout via AbortSignal — don't hang the wiki request on a slow worker.
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) {
      // Don't fail closed on 5xx — that would brick the wiki if the worker is down.
      // Auth is still HMAC-verified; at worst we let a logged-out token through
      // until it expires (max 2h with new TTL).
      return false;
    }
    const data = (await res.json()) as { revoked?: boolean };
    const revoked = data.revoked === true;
    REVOCATION_CACHE.set(sid, { revoked, expiresAt: now + REVOCATION_TTL_MS });
    return revoked;
  } catch {
    return false;
  }
}

export async function verifyJwt(req: Request): Promise<JwtPayload | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const result = await verifyJwtCore(auth.slice(7), {
    secrets: SECRETS,
    checkRevoked,
  });
  if (!result.ok) return null;
  const claims = result.claims;
  let activeDomain = claims.activeDomain;
  const override = req.headers.get("x-active-domain");
  if (override && claims.domains.includes(override)) activeDomain = override;
  return {
    address: claims.sub,
    sid: claims.sid,
    domains: claims.domains,
    activeDomain,
  };
}

export function getDomain(user: JwtPayload): string { return user.activeDomain!; }

const NETWORK = process.env.VITE_TEZOS_NETWORK ?? "ghostnet";
export function isAdmin(jwt: JwtPayload): boolean {
  const tld = NETWORK === "mainnet" ? "tez" : "gho";
  return jwt.domains.includes(`admin.hack.${tld}`);
}

export async function isModerator(domain: string): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM wiki_moderators WHERE domain = ${domain}`;
  return rows.length > 0;
}

export async function isBanned(domain: string): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM wiki_bans WHERE domain = ${domain} AND (expires_at IS NULL OR expires_at > NOW())`;
  return rows.length > 0;
}

export function slugify(text: string): string {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 128);
}

export async function auditLog(action: string, target: string, actor: string, details?: unknown): Promise<void> {
  await sql`INSERT INTO wiki_audit_log (action, target, actor, details) VALUES (${action}, ${target}, ${actor}, ${details ? JSON.stringify(details) : null})`;
}
