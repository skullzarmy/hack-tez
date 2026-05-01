/**
 * Sign-in challenge construction.
 *
 * We use a SIWE-aligned (EIP-4361) human-readable format so:
 *   - users see a meaningful prompt in their wallet (not opaque hex)
 *   - the message itself proves which app, which network, which nonce, when
 *   - we don't have to invent our own canonicalization
 *
 * Format:
 *   {domain} wants you to sign in with your Tezos account:
 *   {address}
 *
 *   {statement}
 *
 *   URI: {uri}
 *   Version: 1
 *   Chain ID: {chainId}
 *   Nonce: {nonce}
 *   Issued At: {issuedAt}
 *
 * Tezos chain IDs:
 *   - Mainnet:  NetXdQprcVkpaWU
 *   - Ghostnet: NetXnHfVqm9iesp
 */

import type { Network } from "./types.js";

export const TEZOS_CHAIN_IDS: Record<Network, string> = {
  mainnet: "NetXdQprcVkpaWU",
  ghostnet: "NetXnHfVqm9iesp",
};

export const DEFAULT_STATEMENT =
  "Sign in to hack.tez. This signature proves you control this wallet. It is free and does not authorize any transaction.";

export interface ChallengeParams {
  /** App domain shown to the user (e.g. "hacktez.com" or "localhost:5173"). */
  domain: string;
  /** Full URL the user is signing in from. */
  uri: string;
  /** Tezos network being authenticated against. */
  network: Network;
  /** Tezos address (tz1.../tz2.../tz3...). */
  address: string;
  /** Random hex nonce, 8-128 hex chars. */
  nonce: string;
  /** ISO-8601 UTC timestamp of when the challenge was issued. */
  issuedAt: string;
  /** Optional override for the statement line. */
  statement?: string;
}

/** Build the canonical challenge string the user signs. */
export function buildChallenge(p: ChallengeParams): string {
  const statement = p.statement ?? DEFAULT_STATEMENT;
  return [
    `${p.domain} wants you to sign in with your Tezos account:`,
    p.address,
    "",
    statement,
    "",
    `URI: ${p.uri}`,
    `Version: 1`,
    `Chain ID: ${TEZOS_CHAIN_IDS[p.network]}`,
    `Nonce: ${p.nonce}`,
    `Issued At: ${p.issuedAt}`,
  ].join("\n");
}

/**
 * Parse a challenge string back into its fields. Returns null if the message
 * does not match the expected format. Used by the worker when verifying:
 * the client sends the full message + sig, the worker re-parses to pull out
 * nonce/issuedAt/address/network and validate them.
 */
export function parseChallenge(message: string): ChallengeParams | null {
  const lines = message.split("\n");
  if (lines.length < 10) return null;
  const headerMatch = lines[0].match(/^(.+) wants you to sign in with your Tezos account:$/);
  if (!headerMatch) return null;
  const domain = headerMatch[1];
  const address = lines[1];
  if (lines[2] !== "") return null;
  const statement = lines[3];
  if (lines[4] !== "") return null;
  const uri = stripPrefix(lines[5], "URI: ");
  const version = stripPrefix(lines[6], "Version: ");
  const chainId = stripPrefix(lines[7], "Chain ID: ");
  const nonce = stripPrefix(lines[8], "Nonce: ");
  const issuedAt = stripPrefix(lines[9], "Issued At: ");
  if (uri == null || version == null || chainId == null || nonce == null || issuedAt == null) return null;
  if (version !== "1") return null;

  let network: Network | null = null;
  for (const k of Object.keys(TEZOS_CHAIN_IDS) as Network[]) {
    if (TEZOS_CHAIN_IDS[k] === chainId) {
      network = k;
      break;
    }
  }
  if (!network) return null;

  return { domain, uri, network, address, nonce, issuedAt, statement };
}

function stripPrefix(line: string, prefix: string): string | null {
  return line.startsWith(prefix) ? line.slice(prefix.length) : null;
}

/**
 * Validate that a parsed challenge is fresh and well-formed. Caller should
 * have already verified the signature; this checks semantic validity.
 *
 * - nonce must be 8-128 hex chars
 * - issuedAt must be within `windowMs` of now
 * - address must match the publicKey-derived address (caller does that)
 */
export function validateChallenge(c: ChallengeParams, opts: {
  now?: number;
  windowMs?: number;
  expectedDomain?: string;
  expectedNetwork?: Network;
}): { ok: true } | { ok: false; reason: string } {
  if (!/^[A-Fa-f0-9]{8,128}$/.test(c.nonce)) {
    return { ok: false, reason: "invalid nonce format" };
  }
  const issuedMs = Date.parse(c.issuedAt);
  if (!Number.isFinite(issuedMs)) {
    return { ok: false, reason: "invalid issuedAt" };
  }
  const now = opts.now ?? Date.now();
  const window = opts.windowMs ?? 5 * 60 * 1000;
  if (Math.abs(now - issuedMs) > window) {
    return { ok: false, reason: "challenge expired or in the future" };
  }
  if (opts.expectedDomain && c.domain !== opts.expectedDomain) {
    return { ok: false, reason: `wrong domain (got ${c.domain})` };
  }
  if (opts.expectedNetwork && c.network !== opts.expectedNetwork) {
    return { ok: false, reason: `wrong network (got ${c.network})` };
  }
  return { ok: true };
}
