import { neon } from "@neondatabase/serverless";
import { jwtVerify } from "jose";

const DATABASE_URL = process.env.DATABASE_URL ?? "";
const JWT_SECRET = process.env.CHAT_JWT_SECRET ?? "";

export const sql = neon(DATABASE_URL);

export interface JwtPayload {
  address: string;
  domains: string[];
  activeDomain: string | null;
}

export async function verifyJwt(req: Request): Promise<JwtPayload | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(auth.slice(7), secret, { algorithms: ["HS256"] });
    const claims = payload as unknown as JwtPayload;
    const override = req.headers.get("x-active-domain");
    if (override && claims.domains?.includes(override)) claims.activeDomain = override;
    return claims;
  } catch { return null; }
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
