/**
 * JWT sign + verify with kid-based secret rotation, version pinning,
 * and optional session revocation.
 *
 * Algorithm: HS256 (symmetric). All consumers (worker, partykit, netlify,
 * client) share `CHAT_JWT_SECRET`. We never put secrets on the client; the
 * client only ever holds the token jose produces.
 */

import { SignJWT, jwtVerify, decodeProtectedHeader, errors as joseErrors } from "jose";
import {
  AUTH_VERSION,
  type JwtClaims,
  type IssuedToken,
  type SecretMap,
  type RevocationChecker,
  type VerifyResult,
} from "./types.js";

/** Default token lifetime: 30 days. Long-lived by user request — UX over strict rotation. */
export const DEFAULT_TTL_SEC = 30 * 24 * 60 * 60;

/**
 * Generate a fresh session id. Uses Web Crypto's randomUUID, which is
 * available in every runtime we target (workers, partykit, browser, node 20+).
 */
export function newSessionId(): string {
  return crypto.randomUUID();
}

export interface SignParams {
  secret: Uint8Array;
  kid: string;
  /** Claims to embed. `iat`/`exp`/`v`/`sid` are filled in if missing. */
  claims: Omit<JwtClaims, "iat" | "exp" | "v"> & { iat?: number; exp?: number; v?: number };
  ttlSec?: number;
}

/**
 * Sign a JWT with HS256 and the given kid in the protected header.
 *
 * Always sets `v` to AUTH_VERSION on the way out. If the caller passes a
 * different `v`, we trust it (e.g. for tests), otherwise we stamp the current
 * version so refreshes naturally upgrade old sessions.
 */
export async function signJwt(params: SignParams): Promise<IssuedToken> {
  const ttl = params.ttlSec ?? DEFAULT_TTL_SEC;
  const now = Math.floor(Date.now() / 1000);
  const iat = params.claims.iat ?? now;
  const exp = params.claims.exp ?? iat + ttl;
  const claims: JwtClaims = {
    sub: params.claims.sub,
    v: params.claims.v ?? AUTH_VERSION,
    sid: params.claims.sid,
    domains: params.claims.domains,
    activeDomain: params.claims.activeDomain,
    iat,
    exp,
  };
  const token = await new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256", kid: params.kid })
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .setSubject(claims.sub)
    .sign(params.secret);
  return { token, claims };
}

export interface VerifyParams {
  /** Map of kid -> secret. Must contain at least one entry. */
  secrets: SecretMap;
  /** Minimum acceptable AUTH_VERSION. Defaults to current AUTH_VERSION. */
  minVersion?: number;
  /** Optional revocation hook. Called with claims.sid. */
  checkRevoked?: RevocationChecker;
  /** Allow `clockTolerance` seconds of skew (default 30). */
  clockToleranceSec?: number;
  /**
   * If true, accept tokens past their `exp` (signature, kid, version, sid,
   * revocation are still enforced). Used by /auth/refresh's grace-window path
   * so users coming back after >TTL idle don't have to re-sign with the wallet.
   * Callers MUST gate the resulting `expired: true` claims on their own
   * server-side window (e.g. last_seen_at within N days, exp_at within N days).
   */
  allowExpired?: boolean;
}

/**
 * Verify a JWT. Returns a discriminated result rather than throwing so callers
 * can branch on the error code (e.g. EXPIRED vs REVOKED produce different UX).
 */
export async function verifyJwt(token: string, params: VerifyParams): Promise<VerifyResult> {
  let header: { kid?: string };
  try {
    header = decodeProtectedHeader(token) as { kid?: string };
  } catch (err) {
    return { ok: false, error: { code: "MALFORMED", message: errMsg(err) } };
  }

  const kid = header.kid;
  if (!kid) {
    return { ok: false, error: { code: "MALFORMED", message: "missing kid header" } };
  }
  const secret = params.secrets[kid];
  if (!secret) {
    return { ok: false, error: { code: "UNKNOWN_KID", message: `unknown kid: ${kid}` } };
  }

  let payload: Record<string, unknown>;
  let expired = false;
  try {
    const verified = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
      clockTolerance: params.clockToleranceSec ?? 30,
    });
    payload = verified.payload as Record<string, unknown>;
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) {
      if (!params.allowExpired) {
        return { ok: false, error: { code: "EXPIRED", message: "token expired" } };
      }
      // Re-verify with effectively unbounded clock tolerance to extract claims.
      // Signature is still required to validate; we only suppress the exp check.
      try {
        const verified = await jwtVerify(token, secret, {
          algorithms: ["HS256"],
          clockTolerance: Number.MAX_SAFE_INTEGER,
        });
        payload = verified.payload as Record<string, unknown>;
        expired = true;
      } catch (err2) {
        return { ok: false, error: { code: "BAD_SIGNATURE", message: errMsg(err2) } };
      }
    } else {
      return { ok: false, error: { code: "BAD_SIGNATURE", message: errMsg(err) } };
    }
  }

  const claims = payload as unknown as JwtClaims;
  const minV = params.minVersion ?? AUTH_VERSION;
  if (typeof claims.v !== "number" || claims.v < minV) {
    return {
      ok: false,
      error: { code: "VERSION_TOO_OLD", message: `requires v>=${minV}, got v=${claims.v ?? "missing"}` },
    };
  }
  if (typeof claims.sid !== "string" || !claims.sid) {
    return { ok: false, error: { code: "MALFORMED", message: "missing sid" } };
  }
  if (typeof claims.sub !== "string" || !claims.sub) {
    return { ok: false, error: { code: "MALFORMED", message: "missing sub" } };
  }
  if (!Array.isArray(claims.domains)) {
    return { ok: false, error: { code: "MALFORMED", message: "missing domains" } };
  }

  if (params.checkRevoked) {
    let revoked: boolean;
    try {
      revoked = await params.checkRevoked(claims.sid);
    } catch {
      // Fail closed on revocation check errors.
      return { ok: false, error: { code: "REVOKED", message: "revocation check failed" } };
    }
    if (revoked) {
      return { ok: false, error: { code: "REVOKED", message: "session revoked" } };
    }
  }

  return { ok: true, claims, expired };
}

/**
 * Build a SecretMap from environment. Pass `current` (required) and `previous`
 * (optional, used during rotation). Returns a map keyed by kid.
 *
 * During rotation:
 *   - bump CURRENT_KID + CHAT_JWT_SECRET to new values
 *   - keep PREV_KID + CHAT_JWT_SECRET_PREV for the grace period
 *   - existing tokens signed with PREV continue to verify
 *   - new tokens signed with CURRENT
 *   - after grace period, drop PREV entirely
 */
export function buildSecretMap(opts: {
  currentKid: string;
  currentSecret: string;
  previousKid?: string;
  previousSecret?: string;
}): SecretMap {
  const enc = new TextEncoder();
  const map: SecretMap = { [opts.currentKid]: enc.encode(opts.currentSecret) };
  if (opts.previousKid && opts.previousSecret) {
    map[opts.previousKid] = enc.encode(opts.previousSecret);
  }
  return map;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
