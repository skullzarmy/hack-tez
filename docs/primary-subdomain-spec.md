# Primary subdomain — end-to-end spec

**Status:** Draft for review (2026-08-26)
**Scope:** Let a wallet designate one of its `*.hack.tez` subdomains as *primary*, and make every part of the system that currently guesses "the first one" use that designation instead.
**Constraint:** The public API is in the wild and in use. Every change is either a **new additive field** or a **better value for an existing field under its documented contract**. No field is removed, renamed, or retyped. No default response shape changes.

---

## 1. The problem

A wallet can own more than one hack.tez subdomain (transfers, multiple claims across wallets, admin holdings). Nothing in the system records which one *is* the person. Six places pick one, and they all pick differently:

| Where | Code | Picks |
| --- | --- | --- |
| Chat sign-in | `chat/src/worker.ts:350` | `domains[0]` |
| Token refresh | `chat/src/worker.ts:450` | `domains[0]` |
| Client session seed | `src/context/TezosContext.tsx:246` | `seed.domains[0]` |
| Home dashboard hero | `src/pages/Home.tsx:69` | `subdomains[0]` |
| Onboarding "finish your profile" | `src/context/OnboardingContext.tsx:104` | `subdomains[0].profile` |
| Display-name resolution | `src/lib/domains.ts:263` | `subs[0].name` |
| Arcade submit / my games | `MyGames.tsx:26`, `GameSubmit.tsx:22` | `chatDomains[0]` |

**`[0]` is not stable.** Neither owner query orders its results:

- `src/lib/domains.ts:163` — `domains(where: { owner: …, name: { endsWith: … } })`, no `order:`
- `auth/domains.ts:69` — same, no `order:`

TED is free to return those in any order, and does not guarantee stability across calls. So a wallet with two domains can have its chat identity, its dashboard hero and its displayed name flip between page loads. That is a live bug today, independent of this feature.

Separately, `/api/v1/members` returns one row per *registration*. A person with three subdomains is three members in the directory, with no way for a consumer to tell that they are one human.

---

## 2. Design

### 2.1 Where the flag lives

A new TED data-map key on the domain itself:

```
hack:primary   →   "tz1AbcOwnerAddress…"      (JSON-encoded string)
```

The value is **the owner address the mark was set for**, not `true`.

Why owner-scoped rather than boolean: TED records are transferable, and this repo already treats a domain as a portable identity ("Domain = chat identity. Transferring a domain transfers the chat identity", `AGENTS.md`). If the marker were a bare `true`, then selling `alice.hack.tez` to Bob would silently make it Bob's primary the moment it lands, overriding whatever Bob already chose and switching his chat identity out from under him. Scoping the value to the owner makes the marker **self-invalidating on transfer**: the new owner's address does not match, the marker is ignored, and their own choice stands.

Parsing rule, deliberately strict:

> `hack:primary` counts only when its value is a string that is a valid Tezos address **and** equals the domain's current `owner`. Anything else (`true`, `1`, an object, a stale address) is ignored, and the domain falls through to the normal resolution order.

A bare `true` is **not** honoured. We control the writer, and a strict rule means one line of parsing and no sentinel values leaking into the public API.

Why not the TED reverse record: it is address-keyed rather than owner-keyed, it is global across all `.tez` names rather than scoped to hack.tez, it cannot express "my `.tez` name is my public identity but *this* hack.tez name is my hack identity", and setting it needs a reverse-registry entrypoint we have not wired. It plays no part in resolution.

Writes reuse `submitProfileUpdate()` (`src/lib/contract.ts:183`) with no changes to that function. It safe-merges by key, so setting `hack:primary` preserves every other key byte-for-byte, and conversely the profile editor never clobbers `hack:primary` because `profileToDataEntries()` only emits keys present in the partial (`src/types/profile.ts:495`).

### 2.2 Resolution order

Given a wallet address `owner` and the set of top-level hack.tez domains it owns:

1. **Marker.** Domains whose parsed `hack:primary` equals `owner`. If more than one (possible if the user wrote markers directly through TED's own UI), take the lexicographically smallest full name.
2. **Fallback.** Lexicographically smallest full name among the owned domains.
3. **None.** `null` when the wallet owns no top-level hack.tez domain.

Step 2 is the replacement for today's `[0]`. It is available in every runtime with no extra call, it is stable across sessions, and it is the same rule everywhere.

Deeper subdomains (`myproject.alice.hack.tez`) are **never** candidates. They belong to a member, they are not one. This matches the existing filter at `api.mts:1195` and `domains.ts:75`.

### 2.3 Cost

Zero extra round trips anywhere. Both steps read data the owner query already returns.

---

## 3. Shared code

### 3.1 `src/types/profile.ts` (the zero-import shared module)

Additive only:

```ts
export interface HackProfile {
  …
  /** Raw `hack:primary` marker: the owner address this domain was marked primary for. */
  primaryFor?: string;
}

export const PROFILE_KEY_MAP = {
  …
  primaryFor: "hack:primary",
} as const satisfies Record<keyof HackProfile, string>;
```

Parse rule inside `parseProfileFromData`, in the `isHackKey` branch:

```ts
case "primaryFor":
  if (typeof value === "string" && isTezosAddress(value)) profile.primaryFor = value.trim();
  break;
```

`isTezosAddress` already exists in this file (line 235), so the zero-imports invariant holds.

Two new pure exports in the same file:

```ts
/** True when this domain carries a valid primary marker for `owner`. */
export function isPrimaryFor(profile: HackProfile, owner: string): boolean;

/**
 * Resolve one owner's primary domain. Pure — callers supply the candidates.
 * Order: marker → lexicographic. See spec §2.2.
 */
export function resolvePrimary(
  owner: string,
  candidates: Array<{ name: string; owner: string; profile: HackProfile }>,
): string | null;
```

`resolvePrimary` lives here rather than in `auth/` because `src/types/profile.ts` is already the cross-runtime home for "what does this domain's data mean" and is already imported directly by `netlify/functions/api.mts`. Putting it anywhere else forces a second copy of the marker-reading logic, which is exactly the drift the module's header warns about.

**Required build change:** `auth/domains.ts` will import from `../src/types/profile.js`, so `chat/tsconfig.json` must extend its `include` from `["src/**/*.ts", "../auth/**/*.ts"]` to also cover `"../src/types/profile.ts"`. Wrangler and PartyKit bundle the import fine; only the typecheck needs the hint. If that proves awkward in practice, the fallback is to move `src/types/profile.ts` to a root-level `shared/profile.ts` and re-export it from its current path, but do not fork the logic.

### 3.2 `auth/domains.ts`

`getOwnedDomains()` keeps its exact signature and return type (`Promise<string[]>`) so nothing that calls it breaks. Two internal fixes plus one new export:

- add `order: { field: NAME, direction: ASC }` to the query (determinism, fixes the ordering bug in §1)
- select `owner` and `data { key value }` alongside `name`

```ts
/** Owned domains plus the resolved primary. No extra round trip. */
export async function getOwnedDomainsWithPrimary(
  address: string,
  network: Network = "ghostnet",
): Promise<{ domains: string[]; primary: string | null }>;
```

`getOwnedDomains` becomes a thin wrapper returning `.domains`.

---

## 4. Auth and session ("the default we log them into")

### 4.1 JWT claims — `auth/types.ts`

```ts
export interface JwtClaims {
  …
  /** Owner's primary domain at issue time. Optional: tokens issued before this feature omit it. */
  primary?: string | null;
}
```

**Do not bump `AUTH_VERSION`.** It is 2 today, and `verifyJwt` rejects `v < AUTH_VERSION`. Bumping would force every active session on the site to re-sign with their wallet for a purely additive claim. The field is optional, old tokens verify unchanged, and the claim appears on the next natural refresh (2 h TTL, rolling).

`auth/jwt.ts:56` and `auth/ticket.ts:42` pass the field through when present.

### 4.2 `chat/src/worker.ts`

| Line | Handler | Change |
| --- | --- | --- |
| 344–350 | `handleAuth` | `getOwnedDomains` → `getOwnedDomainsWithPrimary`; `activeDomain = primary` instead of `domains[0]` |
| 379 | `handleAuth` response | add `primary` to the JSON body |
| 434–450 | `handleRefresh` | fallback chain becomes `X-Active-Domain` → previous `claims.activeDomain` (if still owned) → **`primary`** → `null` |
| 476 | `handleRefresh` response | add `primary` |
| 498 | `/auth/ws-ticket` | pass `primary` through into the WS ticket |

The previous `activeDomain` deliberately stays *ahead* of `primary` in the refresh chain: a rolling refresh must never yank a live session onto a different identity. Changing your primary takes effect through the picker path instead, which is immediate (§6.2), and on the next fresh sign-in.

### 4.3 `src/context/TezosContext.tsx`

```ts
interface AuthSession {
  token: string;
  domains: string[];
  activeDomain: string | null;
  primary?: string | null;   // optional: sessions stored before this feature lack it
}
```

`loadAuthSession()` (line 137) must tolerate the missing field. It already `JSON.parse`s into the type without validating keys, so `undefined` flows through safely as long as every read uses `?? null`. **Do not** bump `MIN_TOKEN_VERSION` for this.

- line 246: `seed?.activeDomain ?? seed?.domains[0] ?? null` → `seed?.activeDomain ?? seed?.primary ?? seed?.domains[0] ?? null`. The array fallback stays for pre-existing seeds.
- `applySession` carries `primary` through to storage and state.
- context gains `primaryDomain: string | null`.

`src/lib/authedFetch.ts` gains one optional field. `SessionSnapshot` exists to build the `X-Active-Domain` header and does not read `primary` itself, but `RefreshResult.session` is typed as `SessionSnapshot & { token: string }`, so the field has to exist there for a refresh to carry it back to the context.

Cross-tab adoption reads `primary` back off `localStorage` rather than the broadcast snapshot, since the snapshot is deliberately minimal.

---

## 5. Public API

Every entry below is additive unless marked otherwise. Existing keys keep their names, types and meanings.

### 5.1 `GET /api/v1/members` — new fields, new params, same default shape

Each row gains:

```jsonc
{
  "…": "all existing fields unchanged",
  "primary": true,                       // is this the owner's primary domain
  "hacker": {                            // the person this membership belongs to
    "owner": "tz1…",
    "primary": "alice.hack.tez",         // null if the owner has none resolvable
    "domains": ["alice.hack.tez", "al.hack.tez"]
  }
}
```

New query params:

| Param | Value | Effect |
| --- | --- | --- |
| `owner` | `tz1…` | Only this owner's members |
| `primary` | `1` | Only rows that are their owner's primary. Deduplicates the directory to one row per person with a one-character diff. |

Existing params, sorting, paging, caching and `tipCounters` behaviour are untouched. Default response with no params is byte-compatible with today apart from the two added keys.

### 5.2 `GET /api/v1/hackers` — new endpoint, the people-level directory

The owner-collapsed view, so consumers who want people rather than registrations get it by default and nothing about `/members` has to change. Same snapshot, same cache, same filters.

One row per owner. The row **is** the primary domain's member object, so any code written against `/members` works on it unchanged, plus:

```jsonc
{
  "…": "the primary domain's full member object",
  "primary": true,
  "hacker": { "owner": "tz1…", "primary": "alice.hack.tez", "domains": ["alice.hack.tez", "al.hack.tez"] },
  "alternates": [ /* the owner's other domains, each a full member object */ ]
}
```

The collapsed shape is a strict superset of the list shape. Filters (`q`, `skill`, `status`, `hasProjects`) match if **any** of the owner's domains match, and the returned row is still the primary. `total` counts owners, `count` counts rows in the page.

**Naming.** `members` and `users` would have been two words for the same thing, which is why this is `hackers`. The vocabulary the API settles on:

| Noun | Row is | Endpoint |
| --- | --- | --- |
| **domain** | a registration, registry facts only | `/api/v1/domains` |
| **member** | a membership: one domain with its full profile | `/api/v1/members` |
| **hacker** | a person: one wallet, keyed by its primary domain | `/api/v1/hackers` |

`member` keeps meaning exactly what it means today, so nothing in the wild shifts under anyone. `hacker` is already the site's own word for a person (the `/hackers` page, `Hackers.tsx`, `useHackerProfiles`), so the API adopts established vocabulary rather than inventing a synonym. The knock-on is that the block added to every member row in §5.1 is `hacker`, not `user`, so the same key means the same thing on both endpoints.

### 5.3 `GET /api/v1/members/:name` — new fields

Adds the same `primary` and `hacker` keys. This handler reads through to TED rather than the snapshot (deliberately, so profile edits show immediately, `api.mts:1498`), so it needs the owner's other domains to compute `primary`. That is one extra TED query issued in the same `Promise.all` as the existing two. Latency is unchanged.

### 5.4 `GET /api/v1/owner/:address` — new fields

Each row gains `primary: boolean`. The response gains a top-level `primary: string | null`.

### 5.5 `GET /api/v1/resolve/:address` — improved fallback, unchanged precedence

Today (`api.mts:771`):

```
primary = reverseRecord?.domain?.name ?? hackTezDomains[0] ?? null
```

The `hackTezDomains[0]` leg is the arbitrary, unordered pick. Replace **only that leg** with `resolvePrimary()`. The reverse record keeps winning overall, so a wallet whose reverse record is `alice.tez` still resolves to `alice.tez` and nothing in the wild shifts.

```jsonc
{
  "address": "tz1…",
  "primary": "alice.tez",              // unchanged contract, better fallback
  "hackTez": ["alice.hack.tez", "al.hack.tez"],
  "hackTezPrimary": "al.hack.tez",     // NEW: this wallet's hack.tez identity
  "network": "mainnet"
}
```

`hackTezPrimary` is the field anything hack.tez-scoped should read going forward. Document `primary` as "best display name for this address, any TLD" and `hackTezPrimary` as "this wallet's hack.tez identity".

### 5.6 `GET /api/v1/domains` — new field

Registry rows gain `primary: boolean`. The snapshot already holds every owner, so this is a grouping pass with no new upstream calls.

### 5.7 `GET /api/v1/profile/:name` — new field, no code change

Returns `HackProfile` verbatim, so it picks up `primaryFor` automatically. Document it as the **raw marker** (an owner address) rather than a resolved boolean, and point readers at `/members/:name` for `primary`.

### 5.8 `GET /api/v1/projects` — new fields

Each row's `member` block gains `primary: boolean` and `primaryDomain: string | null`, so a project can link to its author's canonical identity rather than whichever domain happened to hold the project entry.

### 5.9 `GET /api/v1` index

Register `/api/v1/hackers` in the route list at `api.mts:2622`.

### 5.10 Cache key bump — required

`MemberRecord` gains fields, so `members:v1:${net.name}` must become `members:v2:${net.name}` (`api.mts:1231`). Without the bump, a warm Redis entry keeps serving rows with no `primary` for up to `MEMBERS_CACHE_TTL_SEC` (10 minutes) after deploy.

---

## 6. UI

### 6.1 Where you set it

**`src/components/DomainTile.tsx`** is the home for this. It is the only screen that shows all of a wallet's domains side by side, which is the only context where "which of these is you?" is a meaningful question.

**The entire control is conditional on `topLevel.length > 1`.** For a single-domain wallet the concept does not exist: there is nothing to choose between, the resolver returns that one domain either way, and a `PRIMARY` badge on a lone tile is noise on the screen almost every user sees. Single-domain wallets should never learn this feature exists.

When the wallet holds more than one:

- a `PRIMARY` badge in `domain-tile-header` on the resolved primary
- a `Make primary` action in `domain-tile-actions`, on the other tiles only
- `src/components/HomeDashboard.tsx` sorts the primary tile first in `topLevel`

`HomeDashboard` already computes `topLevel` (line 111) and already branches on `topLevel.length === 1` for its grid class, so the condition costs nothing new. Pass it into `DomainTile` as a prop rather than having the tile recount.

The profile editor (`ProfileEditForm.tsx`) deliberately does **not** get a control. Two writers for one key is how the two drift. It is already safe from clobbering (§2.1).

The same rule applies to the `ConnectWallet` picker (§6.3): it only renders a domain list when there is more than one, so the primary marker there is free.

### 6.2 The write

Marking B primary should also clear A's marker, or resolution falls back to the lexicographic tie-break and the user's most recent choice loses to alphabetical order.

`client.requestOperation({ operationDetails: [...] })` takes an array, so both go in **one wallet confirmation**:

```ts
/**
 * Set `label` as the wallet's primary hack.tez domain.
 * Batches: clear the marker on every currently-marked domain, set it on `label`.
 * One signature, atomic.
 */
export async function submitSetPrimary(
  label: string,
  clearLabels: string[],
  client: DAppClient,
): Promise<string>;
```

Each op is an `update_record` built exactly like `submitProfileUpdate` (fetch the raw hex data map from TzKT, merge one key, re-encode), so the safe-merge guarantee holds per domain. Cap `clearLabels` at 4 to bound gas; the lexicographic tie-break covers anything beyond that and anything set out-of-band through TED's UI.

After the op confirms, the UI calls `setActiveDomain(newPrimary)`, which pushes `X-Active-Domain` on the next refresh. That is why changing your primary takes effect immediately in the live session despite §4.2's ordering.

### 6.3 Where it is consumed

| File | Line | Change |
| --- | --- | --- |
| `src/hooks/useSubdomains.ts` | 46 | return `{ subdomains, primary, … }`; `primary` is the resolved record or `null` |
| `src/lib/domains.ts` | 163 | add `order: { field: NAME, direction: ASC }` to `getSubdomainsByOwner` |
| `src/lib/domains.ts` | 261 | `getFirstHackTezSubdomain` → `getPrimaryHackTezSubdomain`, using §2.2. Changes what `resolveDisplayName` shows for multi-domain wallets, which is the point. |
| `src/pages/Home.tsx` | 69 | `primary ?? subdomains[0] ?? claimedSubdomain` |
| `src/context/OnboardingContext.tsx` | 104 | check the primary's profile, so "finish your profile" points at the domain they actually use |
| `src/components/arcade/MyGames.tsx` | 26 | `activeDomain ?? primaryDomain ?? chatDomains[0]` |
| `src/components/arcade/GameSubmit.tsx` | 22 | same |
| `src/components/ConnectWallet.tsx` | 128 | mark the primary in the wallet-menu domain picker |

Inherit the fix with no edit: `src/pages/LabDetail.tsx:96`, `src/pages/Arcade.tsx:120`, `src/components/arcade/AdminReview.tsx:333`, `src/components/chat/ChatLayout.tsx`, all `useChat`/`useDM` paths. They read `activeDomain`, which is now primary-seeded.

`src/components/chat/ChatPage.tsx` needs no change but should be verified: `hack-tez-chat-identity` in `localStorage` is an explicit user pick and must keep beating primary. It is already validated against `chatDomains` (line 44), so a stale pick for a sold domain falls through to `contextActiveDomain`, which is now the primary.

### 6.4 No change

- `netlify/edge-functions/subdomain-handler.ts` — per-domain redirect, `alice.hacktez.com` → `/u/alice`. Correct as-is.
- `netlify/functions/profile-page.mts` — per-domain OG page.
- `scripts/prerender.ts`, `src/lib/staticRouteMeta.ts` — no owner concept.
- `bot/` — subscriptions are keyed by subdomain by design.
- `src/pages/Profile.tsx` — the edit gate is `walletAddress === owner` (line 436), which is per-domain and correct. Every domain stays independently editable.

### 6.5 Follow-on, not in this change

`src/pages/Hackers.tsx` / `useHackerProfiles` read `/api/v1/domains` and will get `primary` on every row for free. Deduplicating the gallery to one tile per person is a separate UX decision.

---

## 7. Backwards compatibility

"Additive" and "no disruption" are not the same claim, so they are separated here. §7.1 is the part with a zero delta. §7.2 is the complete list of everything in this spec that changes an observable behaviour, with nothing folded into a table cell.

### 7.1 Additive, zero delta

| Surface | Change | Handling |
| --- | --- | --- |
| `/members`, `/members/:name`, `/projects`, `/domains`, `/owner/:address` | New keys appear | No key removed, renamed or retyped. Default shapes, paging, sorting and caching unchanged. |
| `/profile/:name` | `primaryFor` appears | Already documented as "keys the member never set are absent", so consumers must already tolerate optional keys. |
| `/hackers`, `?owner=`, `?primary=1` | New endpoint, new params | Nothing reaches them unless asked for by name. |
| Existing JWTs | Missing `primary` claim | Optional claim, no `AUTH_VERSION` bump, no forced re-auth. |
| Stored browser sessions | Missing `primary` | Optional field, `?? null` at every read, no `MIN_TOKEN_VERSION` bump. |
| Profile editing | `primaryFor` now rides in `HackProfile` | **Verified safe.** `enterEditMode` deep-clones the parsed profile into `form` and submit sends `{...form}`, so the marker round-trips untouched. `profileToDataEntries` only emits keys present in the partial, so no form control can delete it. |
| Warm Redis snapshot | Rows lack new fields | Cache key bumped to `members:v2:` (§5.10). One cold rebuild. |
| Wallets that never set a marker | None | Falls through to lexicographic. No wallet op, no gas, nothing to migrate. |
| Single-domain wallets, the overwhelming majority | None | Every rule collapses to the same one domain. |

### 7.2 The three behaviour changes

**1. Which domain a multi-domain wallet signs in as.** This is the requested feature, so it cannot be additive. Today `domains[0]`, tomorrow the resolved primary. Contained by two guards that are already in the design, not added defensively after the fact:

- `ChatPage`'s `hack-tez-chat-identity` pick is an explicit user choice and still wins (§6.3).
- `/auth/refresh` keeps a live session's existing `activeDomain` ahead of `primary` (§4.2), so no session in flight is ever re-pointed.

What remains is a fresh sign-in by a multi-domain wallet that has never used the picker. That lands on the primary rather than on an arbitrary draw. There is no stable prior behaviour being replaced, because `domains[0]` is unordered (§1).

**2. `/api/v1/resolve/:address` → `primary`.** A reverse record still wins outright, so anyone whose `primary` is a `.tez` name is unaffected. Only the `hackTezDomains[0]` fallback leg changes, which is nondeterministic today (no `ORDER BY`, §1).

**3. `resolveDisplayName()`** returns the primary rather than an arbitrary owned domain for multi-domain wallets (`src/lib/domains.ts:261`). Client-side display only, no API surface, no stored value.

### 7.3 Not a behaviour change, a bug fix

Adding `order: { field: NAME, direction: ASC }` to the two owner queries (§3.2, §6.3) replaces undefined behaviour with defined behaviour. Every `[0]` in §1 is unstable today and can differ between two calls in the same session. This lands first (§9 step 1) and is worth shipping whether or not the rest of this spec does.

---

## 8. Edge cases

- **Two markers.** Possible via TED's own UI. Lexicographically smallest wins; `submitSetPrimary` prevents it from our UI.
- **Transferred domain.** Marker no longer matches the new owner, so it is ignored and their own choice stands (§2.1).
- **Self-transfer between your own wallets.** Marker invalidates, falls back to lexicographic. Re-mark to fix. Documented, accepted.
- **Marker on a sub-subdomain.** Never a candidate.
- **Marker written with a garbage value.** Strict parse ignores it (§2.1).
- **Owner is a KT1 (multisig, DAO).** Works unchanged. `owner` is compared as an opaque string.
- **Profile edit vs snapshot lag.** A newly set marker takes up to 10 minutes to reach `/members` and `/hackers`; `/members/:name` reads through and shows it immediately. Same as every other profile field today.
- **Gas.** One `update_record` per set, or two when clearing a previous marker, batched into one signature. No new contract, no new entrypoint, no registrar change.
- **Privacy.** The marker is public on-chain, same as every other profile key. It reveals that two domains share an owner, which the `owner` field already reveals.

---

## 9. Rollout order

Each step is independently deployable and safe to stop after.

1. **Determinism first.** Add `order: NAME ASC` to `auth/domains.ts:69` and `src/lib/domains.ts:163`. Fixes the flip-flop bug on its own, no new concepts.
2. **Shared parse + resolver.** `src/types/profile.ts` field, key map, parse rule, `isPrimaryFor`, `resolvePrimary`. Plus the `chat/tsconfig.json` include.
3. **API additive fields.** `primary` / `hacker` on `/members`, `/members/:name`, `/domains`, `/projects`, `/owner`; `hackTezPrimary` on `/resolve`; cache key bump. Ship before the UI so consumers can read the flag as soon as anyone sets one.
4. **`/api/v1/hackers` + `?owner=` + `?primary=1`.**
5. **Auth.** `getOwnedDomainsWithPrimary`, worker handlers, JWT claim, client session.
6. **Client consumption.** `useSubdomains`, Home, Onboarding, arcade, display-name resolution.
7. **UI to set it.** `submitSetPrimary`, DomainTile badge and action, HomeDashboard ordering, ConnectWallet picker marker.
8. **Docs.** §10.

---

## 10. Docs to update

- `AGENTS.md` — a new "Architecture Decisions" bullet for the marker and resolution order; a row for `/api/v1/hackers` in the Public REST API table; the domain / member / hacker vocabulary from §5.2, since it is the thing a reader is most likely to get wrong; a note that `auth/` may import `src/types/profile.ts` in that direction only.
- `public/hack-tez-api.md`, `src/skills/hack-tez-api.md`, `public/skills/hack-tez-api.md` — **three byte-identical copies today** (verified). All three must move together or the skill drifts from the published doc. Worth a check in CI.
- `src/pages/Developers.tsx` — the human-facing docs page. Note the sample auth payload at line 2940 that shows `activeDomain`.
- `.github/copilot-instructions.md` — mentions subdomains; check whether the new key belongs there.

---

## 11. Test plan

**Resolver (pure, unit):** no domains; one domain no marker; one domain with marker; two domains no marker (lexicographic); two domains one marker; two domains two markers (lexicographic tie-break); marker whose value is a different address (ignored); marker value `true` (ignored).

**Compatibility (integration):**
- Diff a full `/api/v1/members` response before and after: the only difference is added keys.
- Verify a JWT issued before the change still verifies and refreshes without re-signing.
- Verify a `localStorage` auth session captured before the change hydrates without error.
- Verify `/resolve/:address` returns an unchanged `primary` for a wallet with a reverse record.

**End to end:** wallet with two domains signs in, lands on the lexicographically first; marks the second primary in one wallet confirmation; the chat identity, dashboard hero, arcade submit identity and `/hackers` row all follow; sign out and back in and the choice persists with no further wallet op.

---

## 12. Decisions taken

| Question | Decision | Why |
| --- | --- | --- |
| Storage | `hack:primary` TED data key, valued with the owner address | Fits the no-server architecture, reuses `submitProfileUpdate`, self-invalidates on transfer |
| Boolean `true` accepted? | No | Strict rule, one line of parsing, no sentinel in the public API |
| Reverse record involved at all? | No | Address-keyed, global across TLDs, needs an unwired entrypoint. `/resolve`'s existing use of it is untouched. |
| Fallback when nothing is set | Lexicographic by full name | Stable, free, available in every runtime, one rule everywhere |
| Collapse `/members` by owner? | No. New `/api/v1/hackers` instead | `/members` is in the wild; a new endpoint gets the better default at zero compat cost |
| Name for the people-level endpoint | `hackers`, not `users` | `members`/`users` are synonyms; `domain`/`member`/`hacker` are three distinct things, and `hacker` is already the site's word for a person |
| Bump `AUTH_VERSION`? | No | Would force every live session to re-sign for an additive claim |
| Where to set it in the UI | `DomainTile` only | Single writer; the only screen showing all your domains at once |
| Clearing the old marker | Batched into the same wallet confirmation | Otherwise the most recent choice loses to alphabetical order |
