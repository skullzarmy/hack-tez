/**
 * Short-lived WebSocket connection tickets.
 *
 * A WS ticket is a tightly-scoped JWT (60s TTL by default) that the client
 * presents in the WebSocket connect URL instead of its long-lived bearer
 * token. This avoids leaking the bearer via referrer headers, server logs,
 * or browser history.
 *
 * Tickets carry the same `sid` as the bearer they were minted from, so
 * revoking the parent session also makes future tickets unmintable. Tickets
 * have a different `purpose` claim than session tokens, so a leaked bearer
 * can't be used as a ws ticket and vice-versa.
 */

import { SignJWT, jwtVerify, decodeProtectedHeader, errors as joseErrors } from "jose";
import type { JwtClaims, SecretMap, VerifyResult } from "./types.js";
import { AUTH_VERSION } from "./types.js";

export const TICKET_PURPOSE = "ws-ticket" as const;
export const SESSION_PURPOSE = "session" as const;
export const DEFAULT_TICKET_TTL_SEC = 60;

/**
 * Mint a single-use(-ish) WS ticket from an already-verified session JWT's
 * claims. PartyKit verifies the ticket on `onConnect`.
 */
export async function signWsTicket(params: {
  secret: Uint8Array;
  kid: string;
  /** Source session claims (sub, sid, domains, activeDomain). */
  session: Pick<JwtClaims, "sub" | "sid" | "domains" | "activeDomain">;
  ttlSec?: number;
}): Promise<{ ticket: string; exp: number }> {
  const ttl = params.ttlSec ?? DEFAULT_TICKET_TTL_SEC;
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttl;
  const ticket = await new SignJWT({
    sub: params.session.sub,
    v: AUTH_VERSION,
    sid: params.session.sid,
    domains: params.session.domains,
    activeDomain: params.session.activeDomain,
    purpose: TICKET_PURPOSE,
  })
    .setProtectedHeader({ alg: "HS256", kid: params.kid })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setSubject(params.session.sub)
    .sign(params.secret);
  return { ticket, exp };
}

/**
 * Verify a WS ticket. Returns the inner session claims (or an error).
 *
 * Unlike `verifyJwt`, this enforces `purpose === "ws-ticket"`. PartyKit
 * should call this on every onConnect; the runtime cost is one HMAC.
 */
export async function verifyWsTicket(
  ticket: string,
  params: { secrets: SecretMap; clockToleranceSec?: number },
): Promise<VerifyResult> {
  let header: { kid?: string };
  try {
    header = decodeProtectedHeader(ticket) as { kid?: string };
  } catch (err) {
    return { ok: false, error: { code: "MALFORMED", message: errMsg(err) } };
  }
  const kid = header.kid;
  if (!kid) return { ok: false, error: { code: "MALFORMED", message: "missing kid" } };
  const secret = params.secrets[kid];
  if (!secret) return { ok: false, error: { code: "UNKNOWN_KID", message: `unknown kid: ${kid}` } };

  let payload: Record<string, unknown>;
  try {
    const verified = await jwtVerify(ticket, secret, {
      algorithms: ["HS256"],
      clockTolerance: params.clockToleranceSec ?? 5,
    });
    payload = verified.payload as Record<string, unknown>;
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) {
      return { ok: false, error: { code: "EXPIRED", message: "ticket expired" } };
    }
    return { ok: false, error: { code: "BAD_SIGNATURE", message: errMsg(err) } };
  }

  if (payload.purpose !== TICKET_PURPOSE) {
    return { ok: false, error: { code: "MALFORMED", message: "not a ws ticket" } };
  }
  const claims = payload as unknown as JwtClaims;
  if (typeof claims.v !== "number" || claims.v < AUTH_VERSION) {
    return { ok: false, error: { code: "VERSION_TOO_OLD", message: "ticket version too old" } };
  }
  if (typeof claims.sid !== "string" || !claims.sid) {
    return { ok: false, error: { code: "MALFORMED", message: "missing sid" } };
  }
  return { ok: true, claims, expired: false };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
