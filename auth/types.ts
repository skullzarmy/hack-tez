/**
 * hack.tez shared auth — types & constants.
 *
 * This module is runtime-agnostic: it only uses Web Crypto + jose, so it works
 * unchanged in Cloudflare Workers, PartyKit, Netlify Functions, and the browser.
 *
 * Owned by the whole app, not chat. Chat is just one consumer.
 */

/**
 * Bump this when you make a breaking change to the JWT shape, the challenge
 * format, or the auth contract in a way that older sessions cannot tolerate.
 * Verify will reject any token where `v < AUTH_VERSION`, forcing re-auth.
 */
export const AUTH_VERSION = 2;

export type Network = "ghostnet" | "mainnet";

/**
 * The shape we put inside every JWT issued after AUTH_VERSION = 2.
 *
 * - `sub` is the Tezos address (canonical user id).
 * - `v` is the auth contract version this token was issued under.
 * - `sid` is a per-session UUID; we store it server-side so individual
 *   sessions can be revoked without rotating secrets.
 * - `domains` is the set of hack.tez domains owned at issue time.
 * - `activeDomain` is the currently selected identity (subset of `domains`).
 * - `primary` is the owner's designated primary domain at issue time.
 *   Optional: tokens issued before the feature omit it, and adding it did NOT
 *   bump AUTH_VERSION, so those tokens keep verifying and refreshing normally.
 *
 * `iat` and `exp` are managed by jose; we keep TTL short (2h) and rely on
 * rolling refresh while the user is active.
 */
export interface JwtClaims {
  sub: string;
  v: number;
  sid: string;
  domains: string[];
  activeDomain: string | null;
  primary?: string | null;
  iat: number;
  exp: number;
}

/** Result of a successful sign call. */
export interface IssuedToken {
  token: string;
  claims: JwtClaims;
}

/**
 * Map of `kid` -> raw secret bytes. Verify accepts any kid present in the map;
 * sign always uses the kid the caller passes. This is how we rotate the
 * signing secret without invalidating in-flight sessions.
 */
export type SecretMap = Record<string, Uint8Array>;

/**
 * Optional async hook called during verify to check whether the session
 * (identified by `sid`) has been explicitly revoked. Returning `true` causes
 * verify to fail with REVOKED.
 *
 * Implementations should be cheap (cache aggressively) — verify is on the hot
 * path of every authenticated request.
 */
export type RevocationChecker = (sid: string) => Promise<boolean>;

/** Discriminated error type returned by verifyJwt on failure. */
export type AuthError =
  | { code: "MALFORMED"; message: string }
  | { code: "BAD_SIGNATURE"; message: string }
  | { code: "EXPIRED"; message: string }
  | { code: "UNKNOWN_KID"; message: string }
  | { code: "VERSION_TOO_OLD"; message: string }
  | { code: "REVOKED"; message: string };

/** Result of verifyJwt: either claims or a structured error. */
export type VerifyResult =
  | { ok: true; claims: JwtClaims; expired: boolean }
  | { ok: false; error: AuthError };
