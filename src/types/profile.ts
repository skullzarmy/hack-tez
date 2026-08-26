/**
 * Profile schema, parsing and validation.
 *
 * Runtime-agnostic on purpose: this module has NO imports, so it can be shared
 * verbatim by the Vite client and the Netlify Functions runtime (which has no
 * `import.meta.env`). Do not import `config`, `lib/domains`, or anything that
 * reaches them — that would force the API to fork a second copy of this parser.
 */

// ── Types ────────────────────────────────────────────────────────────

export type BuilderStatus = "building" | "open-to-collab" | "available" | "hiring";

export interface ProjectEntry {
  name: string;
  desc: string;
  url?: string;
  repo?: string;
  environment?: "web" | "tezos" | "etherlink" | "tezlink" | "other";
  address?: string;
  subdomain?: string;
  status?: "live" | "wip" | "archived" | "open-source";
  logo?: string;
  /** Per-project tip jar. Independent of the profile-level jar. */
  tips?: TipJar;
}

/**
 * URL slug for a project, used at /u/:label/p/:slug.
 * Lowercased, non-alphanumerics collapsed to single dashes.
 */
export function projectSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Find a project by its URL slug. Returns null when nothing matches. */
export function findProjectBySlug(
  projects: ProjectEntry[] | undefined,
  slug: string,
): ProjectEntry | null {
  if (!projects) return null;
  const target = slug.toLowerCase();
  return projects.find((p) => projectSlug(p.name) === target) ?? null;
}

/** FA standards we can build a transfer for: TZIP-7 (FA1.2) and TZIP-12 (FA2). */
export type FaStandard = "fa1.2" | "fa2";

/** A fungible token a builder accepts tips in, resolved from on-chain metadata. */
export interface TipToken {
  /** FA contract address (KT1…) */
  contract: string;
  /** Token id — always "0" for FA1.2 */
  tokenId: string;
  standard: FaStandard;
  symbol: string;
  name?: string;
  /** TZIP-12 decimals — needed to convert display amounts to raw units */
  decimals: number;
  /** ipfs:// or https:// icon from token metadata */
  thumbnail?: string;
  /** Preset amounts in display units (decimal strings), up to MAX_TIP_AMOUNTS */
  amounts?: string[];
}

/**
 * Tip jar config. Opt-in — absent or `enabled: false` means no jar is shown.
 * hack.tez takes no cut: the UI only prepares a wallet transaction sent
 * directly from the tipper to the domain's address.
 */
export interface TipJar {
  enabled: boolean;
  title?: string;
  desc?: string;
  /** Preset tez amounts (decimal strings), up to MAX_TIP_AMOUNTS */
  amounts?: string[];
  /** Show a free-form tez amount input */
  customAmount?: boolean;
  tokens?: TipToken[];
  /**
   * Optional recipient override. Defaults to the domain's resolved address.
   * Lets a project route tips to its own treasury.
   */
  payTo?: string;
}

export interface HackProfile {
  // TED native keys
  name?: string;
  nickname?: string;
  website?: string;
  picture?: string;
  github?: string;
  twitter?: string;
  bluesky?: string;
  repositoryUrl?: string;

  // hack.tez keys
  bio?: string;
  location?: string;
  status?: BuilderStatus;
  skills?: string[];
  projects?: ProjectEntry[];
  tips?: TipJar;

  /**
   * Raw `hack:primary` marker: the owner address this domain was marked
   * primary for. Only counts while it equals the domain's current owner, so
   * the mark self-invalidates on transfer. Use `isPrimaryFor` / `resolvePrimary`
   * rather than reading this directly.
   */
  primaryFor?: string;

  // hack.tez social keys — one per platform, ecosystem-safe
  mastodon?: string;
  farcaster?: string;
  telegram?: string;
  discord?: string;
  instagram?: string;
  youtube?: string;
  twitch?: string;
}

// ── Key Mapping ──────────────────────────────────────────────────────

export const PROFILE_KEY_MAP = {
  name: "openid:name",
  nickname: "openid:nickname",
  website: "openid:website",
  picture: "openid:picture",
  github: "github:username",
  twitter: "twitter:handle",
  bluesky: "bluesky:did",
  repositoryUrl: "project:repository_url",
  bio: "hack:bio",
  location: "hack:location",
  status: "hack:status",
  skills: "hack:skills",
  projects: "hack:projects",
  tips: "hack:tips",
  primaryFor: "hack:primary",
  mastodon: "hack:mastodon",
  farcaster: "hack:farcaster",
  telegram: "hack:telegram",
  discord: "hack:discord",
  instagram: "hack:instagram",
  youtube: "hack:youtube",
  twitch: "hack:twitch",
} as const satisfies Record<keyof HackProfile, string>;

type ProfileField = keyof typeof PROFILE_KEY_MAP;

const REVERSE_KEY_MAP = new Map<string, ProfileField>(
  (Object.entries(PROFILE_KEY_MAP) as Array<[ProfileField, string]>).map(
    ([field, tedKey]) => [tedKey, field],
  ),
);

const HACK_PREFIX = "hack:";

function isHackKey(key: string): boolean {
  return key.startsWith(HACK_PREFIX);
}

// ── Validation Helpers ───────────────────────────────────────────────

const VALID_STATUSES: readonly string[] = [
  "building",
  "open-to-collab",
  "available",
  "hiring",
];

export function isValidUrl(url: string): boolean {
  return url.startsWith("https://") || url.startsWith("ipfs://");
}

// ── Parsing ──────────────────────────────────────────────────────────

function isBuilderStatus(v: unknown): v is BuilderStatus {
  return typeof v === "string" && VALID_STATUSES.includes(v);
}

function parseStringArray(v: unknown, max: number): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const items = v.filter((i): i is string => typeof i === "string").slice(0, max);
  return items.length > 0 ? items : undefined;
}

function isProjectEntry(v: unknown): v is ProjectEntry {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.name === "string" && typeof obj.desc === "string";
}

function parseProjects(v: unknown): ProjectEntry[] | undefined {
  if (!Array.isArray(v)) return undefined;
  // Unknown fields are preserved as-is (forward compatibility); only the tip
  // jar sub-object is normalized, since we build transactions from it.
  const items = v.filter(isProjectEntry).map((p) => {
    const tips = parseTipJar((p as { tips?: unknown }).tips);
    if (!tips) {
      const { tips: _drop, ...rest } = p as ProjectEntry;
      return rest as ProjectEntry;
    }
    return { ...p, tips };
  });
  return items.length > 0 ? items : undefined;
}

// ── Tip Jar ──────────────────────────────────────────────────────────

export const MAX_TIP_AMOUNTS = 3;
export const MAX_TIP_TOKENS = 6;
export const TIP_TITLE_MAX = 40;
export const TIP_DESC_MAX = 140;

export const DEFAULT_TIP_TITLE = "Tip your dev";
export const DEFAULT_PROJECT_TIP_TITLE = "Support this project";

/** Suggested titles offered in the editor — the first is the default. */
export const TIP_TITLE_SUGGESTIONS: readonly string[] = [
  DEFAULT_TIP_TITLE,
  "Buy me a coffee",
  "Fuel the build",
  "Support my work",
];

export const DEFAULT_TIP_AMOUNTS: readonly string[] = ["1", "5", "10"];

const KT1_RE = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;
const ADDRESS_RE = /^(tz[123]|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/;

export function isContractAddress(v: string): boolean {
  return KT1_RE.test(v.trim());
}

/** Any Tezos address — implicit (tz1/tz2/tz3) or originated (KT1). */
export function isTezosAddress(v: string): boolean {
  return ADDRESS_RE.test(v.trim());
}

/**
 * A tip amount is a positive decimal with at most `decimals` fraction digits.
 * Rejects 0, negatives, exponents and thousands separators.
 */
export function isValidTipAmount(v: string, decimals = 6): boolean {
  const t = v.trim();
  if (!t) return false;
  const re = new RegExp(
    decimals > 0 ? `^\\d+(\\.\\d{1,${decimals}})?$` : "^\\d+$",
  );
  if (!re.test(t)) return false;
  return Number(t) > 0;
}

function parseTipAmounts(v: unknown, decimals: number): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const items = v
    .filter((i): i is string => typeof i === "string")
    .filter((i) => isValidTipAmount(i, decimals))
    .slice(0, MAX_TIP_AMOUNTS);
  return items.length > 0 ? items : undefined;
}

function parseTipToken(v: unknown): TipToken | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;

  if (typeof o.contract !== "string" || !isContractAddress(o.contract)) return null;
  if (o.standard !== "fa1.2" && o.standard !== "fa2") return null;

  const tokenId =
    typeof o.tokenId === "string" && /^\d+$/.test(o.tokenId) ? o.tokenId : "0";

  const decimals =
    typeof o.decimals === "number" && Number.isInteger(o.decimals) &&
    o.decimals >= 0 && o.decimals <= 30
      ? o.decimals
      : null;
  if (decimals === null) return null;

  if (typeof o.symbol !== "string" || !o.symbol.trim()) return null;

  const token: TipToken = {
    contract: o.contract.trim(),
    tokenId: o.standard === "fa1.2" ? "0" : tokenId,
    standard: o.standard,
    symbol: o.symbol.trim().slice(0, 16),
    decimals,
  };
  if (typeof o.name === "string" && o.name.trim()) {
    token.name = o.name.trim().slice(0, 60);
  }
  if (typeof o.thumbnail === "string" && o.thumbnail.trim()) {
    token.thumbnail = o.thumbnail.trim().slice(0, 200);
  }
  const amounts = parseTipAmounts(o.amounts, decimals);
  if (amounts) token.amounts = amounts;

  return token;
}

function parseTipJar(v: unknown): TipJar | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const o = v as Record<string, unknown>;

  const jar: TipJar = { enabled: o.enabled === true };

  if (typeof o.title === "string" && o.title.trim()) {
    jar.title = o.title.trim().slice(0, TIP_TITLE_MAX);
  }
  if (typeof o.desc === "string" && o.desc.trim()) {
    jar.desc = o.desc.trim().slice(0, TIP_DESC_MAX);
  }
  const amounts = parseTipAmounts(o.amounts, 6);
  if (amounts) jar.amounts = amounts;
  if (o.customAmount === true) jar.customAmount = true;
  if (typeof o.payTo === "string" && isTezosAddress(o.payTo)) {
    jar.payTo = o.payTo.trim();
  }

  if (Array.isArray(o.tokens)) {
    const tokens = o.tokens
      .map(parseTipToken)
      .filter((t): t is TipToken => t !== null)
      .slice(0, MAX_TIP_TOKENS);
    if (tokens.length > 0) jar.tokens = tokens;
  }

  return jar;
}

/**
 * Normalize a jar for writing on-chain: drop blank/invalid preset amounts
 * (the editor keeps empty slots), trim text, and collapse a jar that is both
 * off and unconfigured to `undefined` so the TED key gets deleted.
 */
export function sanitizeTipJar(jar: TipJar | undefined): TipJar | undefined {
  if (!jar) return undefined;

  const clean = (amounts: string[] | undefined, decimals: number) => {
    const kept = (amounts ?? [])
      .map((a) => a.trim())
      .filter((a) => isValidTipAmount(a, decimals))
      .slice(0, MAX_TIP_AMOUNTS);
    return kept.length > 0 ? kept : undefined;
  };

  const out: TipJar = { enabled: jar.enabled === true };

  const title = jar.title?.trim();
  if (title) out.title = title.slice(0, TIP_TITLE_MAX);
  const desc = jar.desc?.trim();
  if (desc) out.desc = desc.slice(0, TIP_DESC_MAX);

  const amounts = clean(jar.amounts, 6);
  if (amounts) out.amounts = amounts;
  if (jar.customAmount === true) out.customAmount = true;
  const payTo = jar.payTo?.trim();
  if (payTo && isTezosAddress(payTo)) out.payTo = payTo;

  const tokens = (jar.tokens ?? []).slice(0, MAX_TIP_TOKENS).map((t) => {
    const token: TipToken = {
      contract: t.contract,
      tokenId: t.tokenId,
      standard: t.standard,
      symbol: t.symbol,
      decimals: t.decimals,
    };
    if (t.name) token.name = t.name;
    if (t.thumbnail) token.thumbnail = t.thumbnail;
    const tokenAmounts = clean(t.amounts, t.decimals);
    if (tokenAmounts) token.amounts = tokenAmounts;
    return token;
  });
  if (tokens.length > 0) out.tokens = tokens;

  // Never persist an empty, disabled jar — delete the key instead.
  if (
    !out.enabled &&
    !out.title &&
    !out.desc &&
    !out.amounts &&
    !out.tokens &&
    !out.payTo
  ) {
    return undefined;
  }
  return out;
}

/** True when the jar is on and offers at least one way to tip. */
export function tipJarIsLive(jar: TipJar | undefined): jar is TipJar {
  if (!jar?.enabled) return false;
  return (
    (jar.amounts?.length ?? 0) > 0 ||
    jar.customAmount === true ||
    (jar.tokens?.length ?? 0) > 0
  );
}

// Simple string hack: fields (single-value social platforms)
const HACK_STRING_FIELDS = new Set<ProfileField>([
  "mastodon", "farcaster", "telegram", "discord", "instagram", "youtube", "twitch",
]);

/**
 * Parse a TED GraphQL `data` array into a HackProfile.
 * TED GraphQL returns values already JSON-parsed (strings, arrays, etc.).
 * Null values (failed decode) are skipped.
 */
export function parseProfileFromData(
  data: Array<{ key: string; value: unknown }>,
): HackProfile {
  const profile: HackProfile = {};

  for (const { key, value } of data) {
    if (value === null || value === undefined) continue;

    const field = REVERSE_KEY_MAP.get(key);
    if (field === undefined) continue;

    if (isHackKey(key)) {
      // TED already JSON-parsed these — use values directly
      if (HACK_STRING_FIELDS.has(field)) {
        if (typeof value === "string") (profile as Record<string, unknown>)[field] = value;
        continue;
      }
      switch (field) {
        case "bio":
          if (typeof value === "string") profile.bio = value.slice(0, 160);
          break;
        case "location":
          if (typeof value === "string") profile.location = value.slice(0, 60);
          break;
        case "status":
          if (isBuilderStatus(value)) profile.status = value;
          break;
        case "skills":
          profile.skills = parseStringArray(value, 10);
          break;
        case "projects":
          profile.projects = parseProjects(value);
          break;
        case "tips":
          profile.tips = parseTipJar(value);
          break;
        case "primaryFor":
          // Strict: only an address counts. `true` and anything else is ignored.
          if (typeof value === "string" && isTezosAddress(value)) {
            profile.primaryFor = value.trim();
          }
          break;
      }
    } else {
      // TED native keys — values are already decoded strings
      if (typeof value !== "string") continue;
      switch (field) {
        case "name":
          profile.name = value;
          break;
        case "nickname":
          profile.nickname = value;
          break;
        case "website":
          profile.website = value;
          break;
        case "picture":
          profile.picture = value;
          break;
        case "github":
          profile.github = value;
          break;
        case "twitter":
          profile.twitter = value;
          break;
        case "bluesky":
          profile.bluesky = value;
          break;
        case "repositoryUrl":
          profile.repositoryUrl = value;
          break;
      }
    }
  }

  return profile;
}

// ── Primary domain ───────────────────────────────────────────────────

/**
 * A domain considered when resolving an owner's primary. Deliberately the
 * smallest shape every caller already has (TED GraphQL, the API snapshot, the
 * client's SubdomainRecord all satisfy it).
 */
export interface PrimaryCandidate {
  name: string;
  owner: string;
  profile: HackProfile;
}

/**
 * True when this domain carries a valid `hack:primary` marker for `owner`.
 * The marker must name the CURRENT owner, so a transferred domain never
 * arrives pre-marked for whoever receives it.
 */
export function isPrimaryFor(profile: HackProfile, owner: string): boolean {
  return profile.primaryFor !== undefined && profile.primaryFor === owner;
}

/**
 * Resolve one owner's primary hack.tez domain.
 *
 * Order:
 *   1. Marker — domains whose `hack:primary` names `owner`. Lexicographically
 *      smallest wins if several are marked (possible when set out-of-band
 *      through TED's own UI).
 *   2. Fallback — lexicographically smallest owned domain. Deterministic, so
 *      an unmarked wallet resolves the same way on every call.
 *   3. null when the wallet owns nothing.
 *
 * Candidates must already be filtered to top-level domains the wallet owns;
 * this function does no I/O.
 */
export function resolvePrimary(
  owner: string,
  candidates: PrimaryCandidate[],
): string | null {
  let marked: string | null = null;
  let first: string | null = null;

  for (const c of candidates) {
    if (c.owner !== owner) continue;
    if (first === null || c.name < first) first = c.name;
    if (isPrimaryFor(c.profile, owner)) {
      if (marked === null || c.name < marked) marked = c.name;
    }
  }

  return marked ?? first;
}

// ── Serialization ────────────────────────────────────────────────────

/**
 * Convert a partial profile update to TED data entries.
 * ALL values are JSON-encoded — TED's GraphQL JSON-parses data map bytes.
 * A null value signals deletion of that key.
 */
export function profileToDataEntries(
  profile: Partial<HackProfile>,
): Array<{ key: string; value: string | null }> {
  const entries: Array<{ key: string; value: string | null }> = [];

  for (const [field, tedKey] of Object.entries(PROFILE_KEY_MAP) as Array<
    [ProfileField, string]
  >) {
    if (!(field in profile)) continue;

    const raw = profile[field];

    if (raw === undefined || raw === null) {
      entries.push({ key: tedKey, value: null });
      continue;
    }

    // JSON.stringify all values — TED expects JSON-encoded bytes
    entries.push({ key: tedKey, value: JSON.stringify(raw) });
  }

  return entries;
}
