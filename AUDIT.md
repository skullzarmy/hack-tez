# hack.tez — Full-Stack Adversarial Security Audit

**Date:** 2026-03-27 (supersedes contract-only audit from 2026-03-26)
**Scope:** Smart contract, frontend React app, Netlify functions, edge functions, infrastructure
**Methodology:** Adversarial — assumes motivated attacker with Tezos knowledge

---

## Executive Summary

hack.tez is a free Tezos subdomain registrar: a SmartPy contract + React/Vite SPA + Netlify serverless/edge functions. The contract uses commit-reveal with on-chain anti-gaming. The contract retains TED-level ownership of all subdomains (`owner=sp.self_address()`), ensuring zero desync.

**Full-stack audit (2026-03-27)** found **2 critical, 1 high, 4 medium, 6 low, 1 informational** findings across the entire stack. The smart contract is solid. The critical issues are in the Netlify functions layer.

---

## 🔴 CRITICAL — Must Fix Before Any Public Launch

### C-1: Redirect endpoint has ZERO authentication

**Location:** `netlify/functions/set-redirect.ts` lines 39-43
**Severity:** CRITICAL

The wallet signature is collected from the client but **never verified server-side**. Anyone can overwrite any subdomain's redirect URL by POSTing with any address. An attacker can:
1. Set `alice.hack.tez.page` → phishing site without owning alice.hack.tez
2. Hijack any subdomain redirect silently
3. No ownership verification against Tezos Domains GraphQL

**Fix:** Verify the wallet signature server-side using `@taquito/utils` `verifySignature()`, AND verify subdomain ownership via Tezos Domains GraphQL query. The server-side `verifyEligibility()` in `_shared/tzkt.ts` already exists but is unused.

---

### C-2: Edge function XSS via subdomain interpolation

**Location:** `netlify/edge-functions/redirect.ts` line 46
**Severity:** CRITICAL
**Code:** `` `<h1><span class="domain">${subdomain}.hack.tez</span></h1>` ``

The subdomain extracted from the hostname is interpolated directly into HTML. While the contract validates labels on-chain (a-z, 0-9, hyphen), the edge function extracts from the **hostname** via regex `^([^.]+)\.hack\.tez\.page$` — which captures whatever the hostname contains. A crafted request or DNS entry could inject HTML/JS.

**Fix:** HTML-escape the subdomain before interpolation:
```ts
const safe = subdomain.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
```

---

## 🟠 HIGH — Should Fix Before Launch

### H-1: `transfer_subdomain` doesn't enforce `max_per_wallet` on recipient

**Location:** `contract/hack_tez_registrar.py` lines 300-338
**Severity:** HIGH

Transfer increments the receiver's registration count without checking if it exceeds `max_per_wallet`. Combined with the existing two-wallet bypass (M-1 from prior audit), this means:
1. Alice registers 5 (max), transfers all to Bob (Bob now has 5+)
2. Alice registers 5 more, transfers again
3. Bob accumulates unlimited subdomains

**Fix:** Add assertion before incrementing receiver:
```python
assert receiver_count < self.data.max_per_wallet, "RECIPIENT_MAX_REACHED"
```

**Note:** This was identified in the prior contract audit as M-1 and accepted as "theater." The full-stack context makes it higher severity since the UI now exposes transfer functionality to all users.

---

## 🟡 MEDIUM — Should Fix

### M-1: No rate limiting on Netlify functions

**Location:** `netlify/functions/set-redirect.ts`, `netlify/functions/get-redirect.ts`
**Severity:** MEDIUM

No IP-based or signature-based rate limiting. Attacker can:
- Spam `set-redirect` to exhaust Netlify Blobs storage quota
- Spam `get-redirect` to exhaust function invocations
- DoS the redirect service

**Fix:** Add per-address rate limiting (e.g., max 10 redirects/hour per address stored in Blobs metadata) or use Netlify's built-in rate limiting.

---

### M-2: `useContractConfig` caches indefinitely

**Location:** `src/hooks/useContractConfig.ts` line 19
**Severity:** MEDIUM

`cachedConfig` is a module-level singleton that never expires. If admin pauses the contract or changes settings, users won't see the change until hard-refresh or new tab. A user could attempt to commit while the contract is paused and get an unhelpful wallet error instead of the paused banner.

**Fix:** Add a TTL (e.g., 5 minutes):
```ts
let cacheTime = 0;
const CACHE_TTL = 300_000;
// In useEffect: if (cachedConfig && Date.now() - cacheTime < CACHE_TTL) return;
```

---

### M-3: Redirect URL accepts dangerous schemes

**Location:** `netlify/functions/set-redirect.ts` line 31
**Severity:** MEDIUM

Only checks `new URL(redirectUrl)` which accepts `javascript:`, `data:`, `file:` schemes. While modern browsers won't execute JS from a 302 redirect Location header, some clients/crawlers might follow `javascript:` URLs.

**Fix:** Validate scheme is `http:` or `https:` only:
```ts
const parsed = new URL(redirectUrl);
if (!['http:', 'https:'].includes(parsed.protocol)) {
    return new Response(JSON.stringify({ error: "Only http/https URLs allowed" }), { status: 400 });
}
```

---

### M-4: Expired commits show as "Ready to register" in UI

**Location:** `src/components/SubdomainSearch.tsx`
**Severity:** MEDIUM

The client stores commits in localStorage indefinitely. If a user commits, closes the browser for 25+ hours (past `max_commit_age=86400s`), returns — the UI shows "✓ Ready to register!" but the on-chain tx will fail with `COMMITMENT_EXPIRED`. Bad UX.

**Fix:** Check `maxCommitAgeMs` when restoring pending commits:
```ts
const elapsed = Date.now() - existing.commitTime;
if (elapsed > contractConfig.maxCommitAgeSec * 1000) {
    removePendingCommit(existing.label);
    return; // Don't restore — it's expired
}
```

---

## 🔵 LOW — Nice to Fix

### L-1: Frontend label min-length doesn't match contract

**Location:** `src/lib/domains.ts` line 68 vs contract `min_label_length=3`
**Severity:** LOW

Frontend allows 1-char labels (`label.length === 0` is the only check). Contract rejects anything under 3 bytes. User gets a confusing contract error instead of a friendly validation message.

**Fix:** Sync: `if (label.length < 3) return { valid: false, error: "Name must be at least 3 characters" };` — or better, read from contract config.

---

### L-2: No CORS restrictions on Netlify functions

**Location:** `netlify/functions/set-redirect.ts`, `get-redirect.ts`
**Severity:** LOW (HIGH when combined with C-1)

Any website can call the Netlify functions. Combined with C-1 (no auth verification), a malicious site could set redirects without the user visiting hack.tez.

**Fix:** Add `Access-Control-Allow-Origin` headers restricted to your domains.

---

### L-3: No CSP (Content Security Policy) header

**Location:** `netlify.toml`
**Severity:** LOW

Security headers include X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy — but no CSP. Adding it would protect against XSS in the main SPA.

**Fix:** Add to netlify.toml headers.

---

### L-4: Edge function Blob import uses CDN URL with loose version pin

**Location:** `netlify/edge-functions/redirect.ts` line 7
**Code:** `import { getStore } from "https://esm.sh/@netlify/blobs@10";`
**Severity:** LOW

Pinned to major version `@10` from esm.sh CDN. If esm.sh is compromised, the edge function inherits the compromise. Netlify Deno edge functions require URL imports, so this is standard practice.

**Fix:** Pin to exact version: `@netlify/blobs@10.7.4`

---

### L-5: Unused server-side helpers

**Location:** `netlify/functions/_shared/tzkt.ts`
**Severity:** LOW

`verifyEligibility()` exists but is never called from any function. Should be used in `set-redirect.ts` once C-1 is fixed.

---

### L-6: Empty stub files

**Location:** `netlify/functions/permit.ts`, `netlify/functions/_shared/permit-signer.ts`
**Severity:** LOW

Empty 1-line files. Either implement or remove to avoid confusion.

---

### ℹ️ INFO-1: Mempool commitment griefing (known, unfixable)

**Issue:** Attacker monitors mempool, sees `commit(H)`, front-runs with their own `commit(H)`. Alice's tx fails with `COMMITMENT_EXISTS`. She must re-commit with new salt.

**Impact:** Annoying but uneconomical (attacker pays gas for every grief). Fundamental limitation of commit-reveal — ENS has the same issue.

**Status:** Documented and accepted.

---

### ℹ️ INFO-2: Eligibility checks are client-side only

**Location:** `src/hooks/useEligibility.ts` — not enforced on-chain
**Severity:** Informational

The 4-hour account age and revealed checks only exist in frontend JS. A user can call the contract directly with a fresh wallet. The commit-reveal wait + gas cost provides the real sybil resistance. The `max_per_wallet` limit helps but is per-wallet.

**Status:** By design — on-chain eligibility would require an oracle (expensive, complex).

---

### ℹ️ INFO-3: `admin_lambda` is all-powerful

**Location:** `contract/hack_tez_registrar.py` lines 580-589

Admin can execute arbitrary storage mutations — change ownership, bypass limits, etc. This is documented and intentional as a future-proofing escape hatch. For higher trust, consider timelocked admin or multisig.

**Status:** Accepted by design for a free community project.

---

## Smart Contract Verified Secure ✅

| Area | Status | Notes |
|---|---|---|
| Reentrancy | ✅ Safe | Tezos executes operations post-entrypoint |
| Integer overflow | ✅ Safe | Arbitrary precision in Michelson |
| Timestamp manipulation | ✅ Safe | Baker ±30s leeway negligible vs 4hr min age |
| Label validation | ✅ Correct | Byte-by-byte, correct ASCII ranges, leading/trailing hyphen rejection |
| Access control | ✅ Correct | Whitelist checked on commit/register/update/transfer |
| Two-step admin transfer | ✅ Correct | propose → accept pattern |
| Tez rejection | ✅ All entrypoints | `assert sp.amount == sp.mutez(0)` |
| TED ownership model | ✅ Zero desync | Always `owner=sp.self_address()` |
| Commitment binding | ✅ Unstealable | `sp.sender` baked into hash |
| Label uniqueness | ✅ Enforced | `registered_labels` checked before TED call |
| Nat underflow | ✅ Guarded | `sp.as_nat()` with `if count > 0` guards |
| Config cross-validation | ✅ Enforced | min ≤ max for labels and commit ages |
| Commitment expiry | ✅ Enforced | min_age ≤ age ≤ max_age window |
| Lambda upgrade | ✅ Admin-only | `admin_lambda(storage -> storage)` |
| Registration counts | ✅ Consistent | Adjusted on register, transfer, and unregister |
| Salt entropy | ✅ 128-bit | `crypto.getRandomValues` — brute force infeasible |
| Commitment hash | ✅ Includes sender | Cannot steal another user's reveal |

---

## Frontend Verified Secure ✅

| Area | Status | Notes |
|---|---|---|
| Wallet connection | ✅ | Beacon DAppClient, session restore, event subscription |
| Commitment hash match | ✅ | Client blake2b(pack()) matches contract exactly |
| Michelson encoding | ✅ | Right-combed pairs, correct SmartPy alphabetical order |
| Label sanitization | ✅ | Input filtered to `[a-z0-9-]` on keystroke |
| localStorage persistence | ✅ | Commits survive page reload |
| Transaction amounts | ✅ | All operations send `amount: "0"` |
| GraphQL injection | ✅ Safe | Variables passed via `variables` param, not string interpolation |
| No hardcoded secrets | ✅ | All config via env vars |

---

## Threat Model Summary

| Threat | Mitigation | Residual Risk |
|---|---|---|
| Name squatting | max_per_wallet=5, gas costs, commit-reveal wait | Multiple wallets bypass limit |
| Front-running | Commit-reveal with 4h wait + 128-bit salt | Effectively zero |
| **Phishing via redirect** | **NONE — C-1 is unprotected** | **CRITICAL** |
| **XSS via edge function** | **NONE — C-2 unescaped** | **CRITICAL** |
| Admin rugpull | 2-step admin transfer, admin_lambda | Admin has full control (by design) |
| Subdomain name spoofing | Label validation (a-z, 0-9, hyphen) | Homoglyph limited to ASCII |
| Commitment griefing | Permissionless expired cleanup, admin batch clear | Attacker wastes own gas |
| Storage exhaustion | Per-byte cost on Tezos, Blobs per-site on Netlify | Netlify Blobs has quotas |
| Replay attacks | Commitment deleted after registration | None |
| Smart contract reentrancy | No callbacks, no tez transfers | None |

---

## Priority Action Items

| # | Finding | Severity | Action |
|---|---|---|---|
| 1 | C-1: Redirect auth bypass | 🔴 Critical | Implement server-side sig verification + ownership check |
| 2 | C-2: Edge function XSS | 🔴 Critical | HTML-escape subdomain in fallback page |
| 3 | H-1: Transfer bypasses max_per_wallet | 🟠 High | Add recipient limit check |
| 4 | M-1: No rate limiting | 🟡 Medium | Add per-address rate limiting |
| 5 | M-2: Config cache never expires | 🟡 Medium | Add 5-minute TTL |
| 6 | M-3: Dangerous URL schemes | 🟡 Medium | Restrict to http/https |
| 7 | M-4: Expired commits show ready | 🟡 Medium | Check max_commit_age in client |
| 8 | L-1: Label min-length mismatch | 🔵 Low | Sync to 3 chars |
| 9 | L-2: No CORS on functions | 🔵 Low | Add origin restrictions |
| 10 | L-3: No CSP header | 🔵 Low | Add to netlify.toml |

---

## Decision Log

| # | Finding | Severity | Decision | Date |
|---|---|---|---|---|
| M-1 (old) | `max_per_wallet` bypass via transfer | 🟡 Medium | Accepted — limit is theater by design | 2026-03-26 |
| L-1 (old) | Stale commitment storage bloat | 🔵 Low | Fixed — added `clear_expired_commitment` | 2026-03-26 |
| L-2 (old) | `reset_registrations` desync | 🔵 Low | Fixed — renamed to `set_registration_count` | 2026-03-26 |
| I-1 | Mempool griefing | ℹ️ Info | Accepted — fundamental to commit-reveal | 2026-03-26 |
| C-1 | Redirect auth bypass | 🔴 Critical | ☐ Pending | 2026-03-27 |
| C-2 | Edge function XSS | 🔴 Critical | ☐ Pending | 2026-03-27 |
| H-1 | Transfer max_per_wallet | 🟠 High | ☐ Pending | 2026-03-27 |

---

## Test Coverage (19 SmartPy tests)

| Test | What it covers |
|---|---|
| `test_initial_state` | Storage defaults correct |
| `test_commit` | Hash stored, duplicate rejected |
| `test_commit_rejects_tez` | Tez rejection |
| `test_commit_paused` | Pause blocks commit |
| `test_register_no_commitment` | No commitment → fail |
| `test_register_too_young` | Before min_commit_age → fail |
| `test_register_label_too_short` | Below min_label_length → fail |
| `test_register_duplicate_label` | Already-taken label → fail |
| `test_paused_blocks_registration` | Pause blocks register |
| `test_wrong_sender_cannot_reveal` | Different sender can't steal reveal |
| `test_whitelist` | Whitelist blocks/allows correctly |
| `test_admin_functions` | All admin setters, cross-validation, propose/accept, batch ops, lambda |
| `test_label_too_long` | Above max_label_length → fail |
| `test_label_invalid_chars` | Uppercase/special chars → fail |
| `test_label_valid_chars` | a-z, 0-9, hyphen → pass |
| `test_update_subdomain` | Owner check, non-existent, tez rejection, pause |
| `test_transfer_subdomain` | Owner check, count adjustment, tez rejection, pause |
| `test_label_leading_trailing_hyphen` | Leading/trailing hyphens → fail, middle → pass |
| `test_clear_expired_commitment` | Permissionless cleanup: boundary, expired, non-existent, tez rejected |

---

*Full-stack adversarial audit. All findings enumerated — verdicts are the admin's to give.*
