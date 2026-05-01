# `auth/` — shared session auth

App-level auth module. Lives at the repo root because it is consumed by every
runtime in the monorepo:

| Consumer                       | What it imports                                    |
| ------------------------------ | -------------------------------------------------- |
| `chat/src/worker.ts`           | everything (issues + verifies JWTs)                |
| `chat/src/party/*.ts`          | `verifyJwt`, `buildSecretMap` (no tezos.ts)        |
| `netlify/functions/*.mts`      | `verifyJwt`, `buildSecretMap` (no tezos.ts)        |
| `src/lib/authedFetch.ts`       | types only (`JwtClaims`, `AUTH_VERSION`)           |
| `src/lib/signing.ts`           | `buildChallenge`, `TEZOS_CHAIN_IDS`                |

## Files

- `types.ts` — `JwtClaims`, `AUTH_VERSION`, `Network`, error types
- `jwt.ts` — `signJwt`, `verifyJwt`, `buildSecretMap`, `newSessionId`
- `challenge.ts` — SIWE-style challenge build/parse/validate
- `tezos.ts` — `verifyTezosSignature` (worker-only; needs `nodejs_compat`)
- `domains.ts` — `getOwnedDomains` via TED GraphQL (no Node deps)
- `index.ts` — barrel export

## Why no `package.json`?

To keep this dead simple, `auth/` is not a workspace package. Consumers import
it via relative paths (`../../auth/index.js`) and provide the `jose` /
`@taquito/utils` peer deps themselves (they all already have them).

## Versioning

Bump `AUTH_VERSION` in `types.ts` whenever you make a breaking change to the
JWT shape, challenge format, or auth contract. `verifyJwt` rejects tokens with
`v < AUTH_VERSION`, forcing clients to re-auth. There is no in-place migration —
sign-in is cheap and free, so we just make people sign again.

## Secret rotation

Configure `CHAT_JWT_SECRET` (current) and optionally `CHAT_JWT_SECRET_PREV`
(grace period) plus `CHAT_JWT_KID` / `CHAT_JWT_KID_PREV`. Build the
`SecretMap` with `buildSecretMap()` and pass it to `verifyJwt`. New tokens are
signed with the current kid; old tokens with previous kids continue to verify
until you drop them from the env.

## Revocation

Pass a `checkRevoked: (sid) => Promise<boolean>` to `verifyJwt`. The worker
checks the D1 `auth_sessions` table (cached 60s in-isolate). PartyKit and
Netlify call the worker's `/auth/check-session?sid=…` endpoint to check.
