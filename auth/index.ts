/**
 * hack.tez shared auth — barrel export.
 *
 * Public API consumed by:
 *   - chat/src/worker.ts        (CF Worker: /auth, /auth/refresh, ws-ticket)
 *   - chat/src/party/*.ts       (PartyKit: verify only, no sig check)
 *   - netlify/functions/*.mts   (wiki, pin, profile)
 *   - src/lib/authedFetch.ts    (browser: never imports tezos.ts)
 *
 * This module is intentionally small. If you find yourself adding a function
 * that only one consumer needs, put it in that consumer instead.
 */

export {
  AUTH_VERSION,
  type Network,
  type JwtClaims,
  type IssuedToken,
  type SecretMap,
  type RevocationChecker,
  type AuthError,
  type VerifyResult,
} from "./types.js";

export {
  signJwt,
  verifyJwt,
  buildSecretMap,
  newSessionId,
  DEFAULT_TTL_SEC,
  type SignParams,
  type VerifyParams,
} from "./jwt.js";

export {
  buildChallenge,
  parseChallenge,
  validateChallenge,
  TEZOS_CHAIN_IDS,
  DEFAULT_STATEMENT,
  type ChallengeParams,
} from "./challenge.js";

export { getOwnedDomains, getOwnedDomainsWithPrimary } from "./domains.js";
export { verifyTezosSignature, packMichelineString } from "./tezos.js";

export {
  signWsTicket,
  verifyWsTicket,
  TICKET_PURPOSE,
  SESSION_PURPOSE,
  DEFAULT_TICKET_TTL_SEC,
} from "./ticket.js";
