import { validateLabel } from "../lib/domains.ts";

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
}

export interface HackProfile {
  // TED native keys
  name?: string;
  nickname?: string;
  website?: string;
  picture?: string;
  github?: string;
  twitter?: string;
  repositoryUrl?: string;

  // hack.tez keys
  bio?: string;
  location?: string;
  status?: BuilderStatus;
  skills?: string[];
  projects?: ProjectEntry[];
}

// ── Key Mapping ──────────────────────────────────────────────────────

export const PROFILE_KEY_MAP = {
  name: "openid:name",
  nickname: "openid:nickname",
  website: "openid:website",
  picture: "openid:picture",
  github: "github:username",
  twitter: "twitter:handle",
  repositoryUrl: "project:repository_url",
  bio: "hack:bio",
  location: "hack:location",
  status: "hack:status",
  skills: "hack:skills",
  projects: "hack:projects",
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

export function isValidLabel(label: string): boolean {
  return validateLabel(label).valid;
}

// ── Parsing ──────────────────────────────────────────────────────────

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

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
  const items = v.filter(isProjectEntry);
  return items.length > 0 ? items : undefined;
}

/**
 * Parse a TED GraphQL `data` array into a HackProfile.
 * Malformed JSON in hack:* values is silently skipped.
 */
export function parseProfileFromData(
  data: Array<{ key: string; value: string }>,
): HackProfile {
  const profile: HackProfile = {};

  for (const { key, value } of data) {
    const field = REVERSE_KEY_MAP.get(key);
    if (field === undefined) continue;

    if (isHackKey(key)) {
      const parsed = tryParseJson(value);
      if (parsed === undefined) continue;

      switch (field) {
        case "bio":
          if (typeof parsed === "string") profile.bio = parsed.slice(0, 160);
          break;
        case "location":
          if (typeof parsed === "string") profile.location = parsed.slice(0, 60);
          break;
        case "status":
          if (isBuilderStatus(parsed)) profile.status = parsed;
          break;
        case "skills":
          profile.skills = parseStringArray(parsed, 10);
          break;
        case "projects":
          profile.projects = parseProjects(parsed);
          break;
      }
    } else {
      // TED native keys — raw string values
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
        case "repositoryUrl":
          profile.repositoryUrl = value;
          break;
      }
    }
  }

  return profile;
}

// ── Serialization ────────────────────────────────────────────────────

/**
 * Convert a partial profile update to TED data entries.
 * hack:* values are JSON-encoded; TED native keys are raw strings.
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

    if (isHackKey(tedKey)) {
      entries.push({ key: tedKey, value: JSON.stringify(raw) });
    } else {
      entries.push({ key: tedKey, value: String(raw) });
    }
  }

  return entries;
}
