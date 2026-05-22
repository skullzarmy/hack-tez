/**
 * hack.tez Public API — Netlify Function v2
 *
 * Routes:
 *   GET /api/v1/domain/:name        — domain record by full name or label
 *   GET /api/v1/profile/:name       — domain record + parsed profile data
 *   GET /api/v1/availability/:label — check if a label is free to register
 *   GET /api/v1/owner/:address      — all hack.tez domains owned by a wallet
 *   GET /api/v1/resolve/:address    — reverse-resolve wallet → primary domain
 *   GET /api/v1/config              — contract config (commit age, max, paused)
 *   GET /api/v1/activity            — recent on-chain claim + commit events
 *   GET /api/v1/hackatar/:label     — generated avatar GIF (?static=1 for single frame)
 */
import type { Config, Context } from "@netlify/functions";
import { Resvg } from "@resvg/resvg-js";
import { getStore } from "@netlify/blobs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pinHandler from "./pin.mts";
// @ts-expect-error — gifenc is CJS, no proper ESM types
import gifenc from "gifenc";
import {
    formatShareStatus,
    getDefaultProfileShareState,
    getProfileShareUrl,
    PROFILE_SHARE_SIZES,
    PROFILE_SHARE_PRESETS,
} from "../../src/lib/profileShare.ts";
import {
    seedFromHash,
    createPrng,
    selectTraits,
    renderFrames,
    renderSingleFrame,
} from "../../src/lib/hackatar/index.ts";
import { textToPath } from "./textToPath.ts";
import { Redis } from "@upstash/redis";
import {
    createAtprotoRecord,
    deleteAtprotoRecord,
    getAtprotoRecord,
    findRecordByDid,
} from "./netlifyDns.ts";
import { verifySignature, getPkhfromPk } from "@taquito/utils";
// ---------------------------------------------------------------------------
// Network config (mirrors src/config/tezos.ts without Vite import.meta.env)
// ---------------------------------------------------------------------------

type TezosNetwork = "mainnet" | "ghostnet";

interface NetworkConfig {
    tld: "tez" | "gho";
    tzktApi: string;
    domainsGraphql: string;
    registrarAddress: string;
}

const NETWORKS: Record<TezosNetwork, NetworkConfig> = {
    mainnet: {
        tld: "tez",
        tzktApi: "https://api.tzkt.io",
        domainsGraphql: "https://api.tezos.domains/graphql",
        registrarAddress: process.env.VITE_REGISTRAR_ADDRESS ?? "",
    },
    ghostnet: {
        tld: "gho",
        tzktApi: "https://api.ghostnet.tzkt.io",
        domainsGraphql: "https://ghostnet-api.tezos.domains/graphql",
        registrarAddress: process.env.VITE_REGISTRAR_ADDRESS ?? "",
    },
};

function getNetwork(): NetworkConfig & { name: TezosNetwork } {
    const name = (process.env.VITE_TEZOS_NETWORK ?? "ghostnet") as TezosNetwork;
    return { name, ...(NETWORKS[name] ?? NETWORKS.ghostnet) };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

const SHARE_CARD_DEBUG_VERSION = "share-card-debug-2026-04-10-v1";

// ---------------------------------------------------------------------------
// Upstash Redis — shared cache across serverless invocations
// ---------------------------------------------------------------------------

function getRedis(): Redis | null {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return null;
    return new Redis({ url, token });
}

/** SWR cache entry stored in Redis */
interface RedisCacheEntry {
    json: string;
    builtAt: number;
}

/** Soft freshness window — serve cached if within this age (seconds) */
const DOMAINS_CACHE_FRESH_SEC = 60;
/** Hard TTL in Redis — auto-expire after this (seconds) */
const DOMAINS_CACHE_TTL_SEC = 600;

/**
 * Convert a typed array (Uint8Array, Buffer, etc.) to a clean ArrayBuffer.
 *
 * TS 5.7+ widened `TypedArray.buffer` to `ArrayBufferLike` (= ArrayBuffer |
 * SharedArrayBuffer).  At runtime, views created by gifenc / Resvg / Node
 * Buffer are never backed by SharedArrayBuffer, but the type system doesn't
 * know that.  One cast here eliminates the mismatch at every Response / Blob /
 * store.set boundary.
 */
function toArrayBuffer(data: Uint8Array): ArrayBuffer {
    const { buffer, byteOffset, byteLength } = data;
    return (buffer as ArrayBuffer).slice(byteOffset, byteOffset + byteLength);
}

function json(body: unknown, status = 200, extra?: HeadersInit): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
            ...extra,
        },
    });
}

function err(message: string, code: string, status = 400): Response {
    return json({ error: message, code }, status);
}

const LABEL_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const TZ_ADDRESS_RE = /^(tz[123][1-9A-HJ-NP-Za-km-z]{33}|KT1[1-9A-HJ-NP-Za-km-z]{33})$/;

function validateLabel(label: string): string | null {
    if (!label || label.length === 0) return "Label is required";
    if (label.length > 63) return "Label must be 63 characters or fewer";
    if (!LABEL_RE.test(label)) return "Label must be lowercase alphanumeric with hyphens";
    return null;
}

function normalizeLabel(nameOrLabel: string, tld: "tez" | "gho"): string {
    const value = nameOrLabel.trim().toLowerCase();
    const suffix = `.hack.${tld}`;
    if (value.endsWith(suffix)) return value.slice(0, -suffix.length);
    return value;
}

// Directory reference for path resolution
const _fnDir = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Share card SVG builder using vector paths (no font rendering required)
// ---------------------------------------------------------------------------

import type { ProfileShareSvgOptions } from "../../src/lib/profileShare.ts";

function escapeXml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function truncateSvgWord(word: string, maxChars: number): string {
    if (word.length <= maxChars) return word;
    if (maxChars <= 1) return "…";
    return `${word.slice(0, maxChars - 1)}…`;
}

function wrapSvgText(text: string, maxChars: number, maxLines: number): string[] {
    if (maxChars <= 0 || maxLines <= 0) return [];
    const words = text
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => truncateSvgWord(word, maxChars));
    if (words.length === 0) return [];
    const lines: string[] = [];
    let current = "";
    let consumedWords = 0;
    for (const word of words) {
        const next = current ? `${current} ${word}` : word;
        if (next.length <= maxChars) {
            current = next;
            consumedWords += 1;
            continue;
        }
        if (current) {
            lines.push(current);
            if (lines.length === maxLines) break;
        }
        current = word;
        consumedWords += 1;
    }
    if (lines.length < maxLines && current) lines.push(current);
    const didOverflow = consumedWords < words.length;
    if (didOverflow && lines.length > 0) {
        const lastIndex = Math.min(lines.length, maxLines) - 1;
        const last = lines[lastIndex] ?? "";
        if (last.endsWith("…")) {
            lines[lastIndex] = last;
        } else if (last.length > 1) {
            lines[lastIndex] = `${last.slice(0, Math.max(1, last.length - 1))}…`;
        } else {
            lines[lastIndex] = "…";
        }
    }
    return lines.slice(0, maxLines);
}

function buildProfileShareSvgWithPaths(options: ProfileShareSvgOptions): string {
    const palette = PROFILE_SHARE_PRESETS[options.preset];
    const isWide = options.width > options.height;
    const titleLines = wrapSvgText(options.title, isWide ? 22 : 20, isWide ? 2 : 3);
    const subtitleLines = wrapSvgText(options.subtitle, isWide ? 44 : 30, 3);
    const accentTwo = options.preset === "scanline-glitch" ? "#59f4ff" : palette.accent;
    const status = options.statusLabel ? escapeXml(options.statusLabel.toUpperCase()) : null;
    const statusLine = status ? `// ${status}` : null;
    const frameX = 56;
    const frameY = 56;
    const frameWidth = options.width - frameX * 2;
    const frameHeight = options.height - frameY * 2;
    const titleY = statusLine ? 246 : 212;
    const subtitleY = titleY + (isWide ? 184 : 238);
    const ctaY = options.height - 118;
    const fullNameY = options.height - 78;

    // Convert all text to vector paths
    const headerPath = textToPath({
        text: "HACK.TEZ PROFILE",
        x: options.width - 96,
        y: 114,
        fontSize: 19,
        fill: palette.text,
        fillOpacity: 0.54,
        fontWeight: 400,
        letterSpacing: 1.2,
        textAnchor: "end",
    });

    const statusPath = statusLine
        ? textToPath({
              text: statusLine,
              x: 110,
              y: 156,
              fontSize: 22,
              fill: palette.accent,
              fontWeight: 700,
              letterSpacing: 0.9,
              textAnchor: "start",
          })
        : "";

    // Title lines (multiple with line height)
    const titlePaths = titleLines
        .map((line, index) =>
            textToPath({
                text: line,
                x: 110,
                y: titleY + index * 86,
                fontSize: 72,
                fill: palette.text,
                fontWeight: 700,
                letterSpacing: -1.9,
                textAnchor: "start",
            }),
        )
        .join("\n    ");

    // Subtitle lines
    const subtitlePaths = subtitleLines
        .map((line, index) =>
            textToPath({
                text: line,
                x: 110,
                y: subtitleY + index * 38,
                fontSize: 31,
                fill: palette.muted,
                fontWeight: 400,
                textAnchor: "start",
            }),
        )
        .join("\n    ");

    const ctaPath = textToPath({
        text: options.cta,
        x: 110,
        y: ctaY,
        fontSize: 30,
        fill: palette.accent,
        fontWeight: 700,
        textAnchor: "start",
    });

    const fullNamePath = textToPath({
        text: `// ${options.fullName}`,
        x: 110,
        y: fullNameY,
        fontSize: 24,
        fill: palette.text,
        fillOpacity: 0.72,
        fontWeight: 400,
        textAnchor: "start",
    });

    const profileUrlPath = textToPath({
        text: options.profileUrl,
        x: options.width - 96,
        y: fullNameY,
        fontSize: 21,
        fill: palette.text,
        fillOpacity: 0.52,
        fontWeight: 400,
        textAnchor: "end",
    });

    return `
<svg width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="${options.width}" y2="${options.height}" gradientUnits="userSpaceOnUse">
      <stop stop-color="${palette.background}"/>
      <stop offset="1" stop-color="${palette.panel}"/>
    </linearGradient>
    <radialGradient id="orb-a" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(${options.width - 240} 104) rotate(90) scale(220 310)">
      <stop stop-color="${palette.accent}" stop-opacity="0.48"/>
      <stop offset="1" stop-color="${palette.accent}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="orb-b" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(120 ${options.height - 110}) rotate(90) scale(140 210)">
      <stop stop-color="${accentTwo}" stop-opacity="0.28"/>
      <stop offset="1" stop-color="${accentTwo}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="panel" x1="${frameX}" y1="${frameY}" x2="${options.width - frameX}" y2="${options.height - frameY}" gradientUnits="userSpaceOnUse">
      <stop stop-color="${palette.panel}" stop-opacity="0.92"/>
      <stop offset="1" stop-color="${palette.background}" stop-opacity="0.74"/>
    </linearGradient>
    <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
      <path d="M28 0H0V28" stroke="${palette.muted}" stroke-opacity="0.1"/>
    </pattern>
    <pattern id="dots" width="14" height="14" patternUnits="userSpaceOnUse">
      <circle cx="1.5" cy="1.5" r="1.1" fill="${palette.muted}" fill-opacity="0.14"/>
    </pattern>
  </defs>
  <rect width="${options.width}" height="${options.height}" fill="url(#bg)"/>
  <rect width="${options.width}" height="${options.height}" fill="url(#dots)"/>
  <rect width="${options.width}" height="${options.height}" fill="url(#orb-a)"/>
  <rect width="${options.width}" height="${options.height}" fill="url(#orb-b)"/>
  <rect width="${options.width}" height="${options.height}" fill="url(#grid)"/>
  <path d="M0 0H${options.width}" stroke="${palette.accent}" stroke-opacity="0.42" stroke-width="10"/>
  <path d="M${options.width - 250} 0V${options.height}" stroke="${accentTwo}" stroke-opacity="0.22" stroke-width="2"/>
  <path d="M${options.width - 312} 0V${options.height}" stroke="${palette.accent}" stroke-opacity="0.16" stroke-width="2"/>
  <rect x="${frameX}" y="${frameY}" width="${frameWidth}" height="${frameHeight}" rx="30" fill="url(#panel)" stroke="${palette.muted}" stroke-opacity="0.28"/>
  <rect x="${frameX + 18}" y="${frameY + 18}" width="${frameWidth - 36}" height="${frameHeight - 36}" rx="22" stroke="${palette.muted}" stroke-opacity="0.18"/>
  <rect x="${frameX + 26}" y="${frameY + 24}" width="8" height="${frameHeight - 48}" rx="4" fill="${palette.accent}" fill-opacity="0.82"/>
  ${headerPath}
  ${statusPath}
  ${titlePaths}
  ${subtitlePaths}
  <path d="M110 ${ctaY - 22}H${options.width - 110}" stroke="${palette.muted}" stroke-opacity="0.24" stroke-width="2"/>
  ${ctaPath}
  ${fullNamePath}
  ${profileUrlPath}
</svg>`;
}

async function tedGql<T>(graphqlUrl: string, query: string, variables: Record<string, unknown>): Promise<T> {
    const res = await fetch(graphqlUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`TED GraphQL HTTP ${res.status}`);
    const data = await res.json();
    if (data.errors?.length) throw new Error(data.errors[0].message);
    return data.data as T;
}

// ---------------------------------------------------------------------------
// Profile parsing (inlined — avoids a circular dependency with src/types)
// ---------------------------------------------------------------------------

interface ProfileProject {
    name: string;
    desc: string;
    url?: string;
    repo?: string;
    environment?: string;
    address?: string;
    subdomain?: string;
    status?: string;
    logo?: string;
}

interface HackProfile {
    name?: string;
    nickname?: string;
    website?: string;
    picture?: string;
    github?: string;
    twitter?: string;
    repositoryUrl?: string;
    bio?: string;
    location?: string;
    status?: string;
    skills?: string[];
    projects?: ProfileProject[];
}

const PROFILE_KEY_MAP: Record<string, string> = {
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
};

const REVERSE_PROFILE_KEY_MAP = new Map<string, string>(
    Object.entries(PROFILE_KEY_MAP).map(([field, tedKey]) => [tedKey, field]),
);

const VALID_STATUSES = ["building", "open-to-collab", "available", "hiring"];

function parseProfileFromData(data: Array<{ key: string; value: unknown }>): HackProfile {
    const profile: HackProfile = {};

    for (const { key, value } of data) {
        if (value === null || value === undefined) continue;

        const field = REVERSE_PROFILE_KEY_MAP.get(key);
        if (field === undefined) continue;

        if (key.startsWith("hack:")) {
            // TED already JSON-parsed these — use values directly
            switch (field) {
                case "bio":
                    if (typeof value === "string") profile.bio = value.slice(0, 160);
                    break;
                case "location":
                    if (typeof value === "string") profile.location = value.slice(0, 60);
                    break;
                case "status":
                    if (typeof value === "string" && VALID_STATUSES.includes(value)) profile.status = value;
                    break;
                case "skills":
                    if (Array.isArray(value)) {
                        const items = value.filter((i): i is string => typeof i === "string").slice(0, 10);
                        if (items.length > 0) profile.skills = items;
                    }
                    break;
                case "projects":
                    if (Array.isArray(value)) {
                        const items = value.filter(
                            (v): v is ProfileProject =>
                                typeof v === "object" &&
                                v !== null &&
                                typeof v.name === "string" &&
                                typeof v.desc === "string",
                        );
                        if (items.length > 0) profile.projects = items;
                    }
                    break;
            }
        } else {
            // TED native keys — values are already decoded strings
            if (typeof value === "string") {
                (profile as Record<string, unknown>)[field] = value;
            }
        }
    }

    return profile;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/** GET /api/v1/domain/:name — domain record by label or full name */
async function handleDomain(name: string, net: ReturnType<typeof getNetwork>): Promise<Response> {
    const label = name.endsWith(`.hack.${net.tld}`) ? name.replace(`.hack.${net.tld}`, "") : name;
    const labelErr = validateLabel(label);
    if (labelErr) return err(labelErr, "INVALID_INPUT");

    const fullName = `${label}.hack.${net.tld}`;

    const data = await tedGql<{
        domain: {
            name: string;
            address: string | null;
            owner: string;
        } | null;
    }>(
        net.domainsGraphql,
        `query GetDomain($name: String!) {
          domain(name: $name) {
            name
            address
            owner
          }
        }`,
        { name: fullName },
    );

    if (!data.domain) {
        return json({ data: null, available: true, network: net.name }, 200, {
            "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        });
    }

    return json(
        {
            data: {
                name: data.domain.name,
                label,
                address: data.domain.address,
                owner: data.domain.owner,
            },
            available: false,
            network: net.name,
        },
        200,
        { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    );
}

/** GET /api/v1/profile/:name — domain record + parsed profile data */
async function handleProfile(name: string, net: ReturnType<typeof getNetwork>): Promise<Response> {
    const label = name.endsWith(`.hack.${net.tld}`) ? name.replace(`.hack.${net.tld}`, "") : name;
    const labelErr = validateLabel(label);
    if (labelErr) return err(labelErr, "INVALID_INPUT");

    const fullName = `${label}.hack.${net.tld}`;

    const [result, regInfo] = await Promise.all([
        tedGql<{
            domain: {
                name: string;
                address: string | null;
                owner: string;
                data: Array<{ key: string; value: unknown }>;
            } | null;
        }>(
            net.domainsGraphql,
            `query GetProfile($name: String!) {
              domain(name: $name) {
                name
                address
                owner
                data { key value }
              }
            }`,
            { name: fullName },
        ),
        getRegistrationHash(label, net),
    ]);

    if (!result.domain) {
        return json({ error: "not found" }, 404, {
            "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        });
    }

    const profile = parseProfileFromData(result.domain.data ?? []);

    return json(
        {
            data: {
                name: result.domain.name,
                owner: result.domain.owner,
                address: result.domain.address,
                profile,
                registrationHash: regInfo?.hash ?? null,
                registeredAt: regInfo?.timestamp ?? null,
            },
            network: net.name,
        },
        200,
        { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    );
}

/** GET /api/v1/availability/:label */
async function handleAvailability(label: string, net: ReturnType<typeof getNetwork>): Promise<Response> {
    const labelErr = validateLabel(label);
    if (labelErr) return err(labelErr, "INVALID_INPUT");

    const fullName = `${label}.hack.${net.tld}`;
    const data = await tedGql<{ domain: { name: string } | null }>(
        net.domainsGraphql,
        `query CheckDomain($name: String!) {
          domain(name: $name) { name }
        }`,
        { name: fullName },
    );

    return json({ label, available: data.domain === null, network: net.name }, 200, {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
    });
}

/** GET /api/v1/owner/:address */
async function handleOwner(address: string, net: ReturnType<typeof getNetwork>): Promise<Response> {
    if (!TZ_ADDRESS_RE.test(address)) return err("Invalid Tezos address", "INVALID_INPUT");

    const data = await tedGql<{
        domains: {
            items: Array<{
                name: string;
                address: string | null;
                owner: string;
            }>;
        };
    }>(
        net.domainsGraphql,
        `query OwnerDomains($owner: Address!, $parent: String!) {
          domains(where: { owner: { equalTo: $owner }, name: { endsWith: $parent } }) {
            items { name address owner }
          }
        }`,
        { owner: address, parent: `.hack.${net.tld}` },
    );

    const domains = data.domains.items.map((d) => ({
        name: d.name,
        label: d.name.replace(`.hack.${net.tld}`, ""),
        address: d.address,
        owner: d.owner,
    }));

    return json({ data: domains, count: domains.length, network: net.name }, 200, {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
    });
}

/** GET /api/v1/resolve/:address — reverse-resolve address → primary domain name */
async function handleResolve(address: string, net: ReturnType<typeof getNetwork>): Promise<Response> {
    if (!TZ_ADDRESS_RE.test(address)) return err("Invalid Tezos address", "INVALID_INPUT");

    // Run both queries in parallel
    const [ownerData, reverseData] = await Promise.all([
        tedGql<{
            domains: { items: Array<{ name: string }> };
        }>(
            net.domainsGraphql,
            `query OwnerDomains($owner: Address!, $parent: String!) {
              domains(where: { owner: { equalTo: $owner }, name: { endsWith: $parent } }) {
                items { name }
              }
            }`,
            { owner: address, parent: `.hack.${net.tld}` },
        ),
        tedGql<{
            reverseRecord: { domain: { name: string } } | null;
        }>(
            net.domainsGraphql,
            `query ReverseLookup($address: String!) {
              reverseRecord(address: $address) {
                domain { name }
              }
            }`,
            { address },
        ),
    ]);

    const hackTezDomains = ownerData.domains.items.map((d) => d.name);
    // TED reverse record if set, else first owned hack.tez domain, else null
    const primary = reverseData.reverseRecord?.domain?.name ?? hackTezDomains[0] ?? null;

    return json(
        {
            address,
            primary,
            hackTez: hackTezDomains,
            network: net.name,
        },
        200,
        { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    );
}

/** Decode a hex string (TzKT Michelson bytes) to UTF-8 */
function hexToUtf8(hex: string): string {
    try {
        const bytes = new Uint8Array((hex.match(/.{1,2}/g) ?? []).map((b) => parseInt(b, 16)));
        return new TextDecoder().decode(bytes);
    } catch {
        return hex;
    }
}

/** Encode a UTF-8 string to hex bytes (for TzKT parameter filtering) */
function utf8ToHex(str: string): string {
    return Array.from(new TextEncoder().encode(str))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * Fetch the registration opHash for a single label from TzKT.
 * Returns { hash, timestamp } or null if not found.
 */
async function getRegistrationHash(
    label: string,
    net: ReturnType<typeof getNetwork>,
): Promise<{ hash: string; timestamp: string } | null> {
    const registrars = getRegistrarAddresses(net);
    const hexLabel = utf8ToHex(label);

    for (const addr of registrars) {
        try {
            const url =
                `${net.tzktApi}/v1/operations/transactions` +
                `?target=${addr}` +
                `&entrypoint=register` +
                `&parameter.value.label=${hexLabel}` +
                `&status=applied` +
                `&limit=1` +
                `&select=hash,timestamp`;
            const res = await fetch(url);
            if (!res.ok) continue;
            const ops: Array<{ hash: string; timestamp: string }> = await res.json();
            if (ops.length > 0) return ops[0];
        } catch {
            continue;
        }
    }
    return null;
}

/**
 * Batch-fetch registration opHashes for all register operations.
 * Returns a map of UTF-8 label → { hash, timestamp }.
 * Results are cached in-memory for 5 minutes to avoid repeated large TzKT fetches.
 */

const REGISTRATION_HASHES_TTL_MS = 5 * 60 * 1000;
const registrationHashesCache = new Map<
    string,
    { expiresAt: number; value: Map<string, { hash: string; timestamp: string }> }
>();
const registrationHashesInflight = new Map<string, Promise<Map<string, { hash: string; timestamp: string }>>>();

async function getAllRegistrationHashes(
    net: ReturnType<typeof getNetwork>,
): Promise<Map<string, { hash: string; timestamp: string }>> {
    const cacheKey = net.tzktApi;
    const now = Date.now();
    const cached = registrationHashesCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
        return new Map(cached.value);
    }

    const inflight = registrationHashesInflight.get(cacheKey);
    if (inflight) {
        return new Map(await inflight);
    }

    type TzKTRegOp = {
        hash: string;
        timestamp: string;
        parameter: { value: { label: string } };
    };

    const loadPromise = (async () => {
        const registrars = getRegistrarAddresses(net);
        const map = new Map<string, { hash: string; timestamp: string }>();

        await Promise.all(
            registrars.map(async (addr) => {
                try {
                    const url =
                        `${net.tzktApi}/v1/operations/transactions` +
                        `?target=${addr}` +
                        `&entrypoint=register` +
                        `&status=applied` +
                        `&select=hash,timestamp,parameter` +
                        `&sort.asc=id` +
                        `&limit=10000`;
                    const res = await fetch(url);
                    if (!res.ok) return;
                    const ops: TzKTRegOp[] = await res.json();
                    for (const op of ops) {
                        const rawLabel = op.parameter?.value?.label;
                        if (!rawLabel) continue;
                        const label = hexToUtf8(rawLabel);
                        // Keep first match (earliest registration — TzKT sorted ascending by id)
                        if (!map.has(label)) {
                            map.set(label, { hash: op.hash, timestamp: op.timestamp });
                        }
                    }
                } catch {
                    // skip failing contracts
                }
            }),
        );

        registrationHashesCache.set(cacheKey, { expiresAt: now + REGISTRATION_HASHES_TTL_MS, value: map });
        return map;
    })();

    registrationHashesInflight.set(cacheKey, loadPromise);
    try {
        return new Map(await loadPromise);
    } finally {
        registrationHashesInflight.delete(cacheKey);
    }
}

/** Type alias for the paginated TED domains response — extracted to break
 *  circular type inference when `page` and `after` reference each other. */
interface TedDomainsPage {
    domains: {
        items: Array<{
            name: string;
            owner: string;
            address: string | null;
            data: Array<{ key: string; value: unknown }>;
        }>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 1000; // safety cap on internal pagination

/** GET /api/v1/domains?limit=50 — list all hack.tez registrations */
async function handleDomains(url: URL, net: ReturnType<typeof getNetwork>): Promise<Response> {
    const parent = `hack.${net.tld}`;

    const rawLimit = parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
    if (Number.isNaN(rawLimit) || rawLimit < 1) return err("limit must be a positive integer", "INVALID_INPUT");
    const limit = Math.min(rawLimit, MAX_LIMIT);

    // ---------------------------------------------------------------------------
    // Redis SWR cache — only for the default full-list request
    // ---------------------------------------------------------------------------
    const redis = getRedis();
    const cacheKey = `hackers:v1:${net.name}:${limit}`;

    if (redis) {
        try {
            const cached = await redis.get<RedisCacheEntry>(cacheKey);
            if (cached?.json && cached?.builtAt) {
                const ageSeconds = (Date.now() - cached.builtAt) / 1000;
                if (ageSeconds < DOMAINS_CACHE_FRESH_SEC) {
                    // Fresh — serve directly from Redis
                    return new Response(cached.json, {
                        status: 200,
                        headers: {
                            "Content-Type": "application/json",
                            ...CORS_HEADERS,
                            "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
                            "X-Cache": "HIT",
                        },
                    });
                }
                // Stale — serve immediately, then revalidate in background
                const staleResponse = new Response(cached.json, {
                    status: 200,
                    headers: {
                        "Content-Type": "application/json",
                        ...CORS_HEADERS,
                        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
                        "X-Cache": "STALE",
                    },
                });
                // Fire-and-forget: rebuild and update cache
                buildDomainsAndCache(parent, limit, net, redis, cacheKey).catch(() => {});
                return staleResponse;
            }
        } catch {
            // Redis unavailable — fall through to live build
        }
    }

    // Cache miss or Redis unavailable — build from upstream
    const responseBody = await buildDomainsResponse(parent, limit, net);

    // Write to Redis (fire-and-forget)
    if (redis) {
        const entry: RedisCacheEntry = { json: JSON.stringify(responseBody), builtAt: Date.now() };
        redis.set(cacheKey, entry, { ex: DOMAINS_CACHE_TTL_SEC }).catch(() => {});
    }

    return json(
        responseBody,
        200,
        {
            "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
            "X-Cache": "MISS",
        },
    );
}

/** Build the full domains response payload from upstream APIs */
async function buildDomainsResponse(
    parent: string,
    limit: number,
    net: ReturnType<typeof getNetwork>,
): Promise<{ data: unknown[]; count: number; limit: number; network: string }> {
    // TED GraphQL caps `first` at 50 — paginate via cursor to satisfy larger limits.
    const items: TedDomainsPage["domains"]["items"] = [];
    let after: string | null = null;
    const fetchAll = (async () => {
        while (items.length < limit) {
            const pageSize = Math.min(50, limit - items.length);
            const page: TedDomainsPage = await tedGql(
                net.domainsGraphql,
                `query AllDomains($parent: String!, $first: Int!, $after: String) {
                  domains(where: { name: { endsWith: $parent } }, first: $first, after: $after, order: { field: NAME, direction: ASC }) {
                    items {
                      name
                      owner
                      address
                      data { key value }
                    }
                    pageInfo { hasNextPage endCursor }
                  }
                }`,
                { parent: `.${parent}`, first: pageSize, after },
            );
            items.push(...page.domains.items);
            if (!page.domains.pageInfo.hasNextPage || !page.domains.pageInfo.endCursor) break;
            after = page.domains.pageInfo.endCursor;
        }
    })();

    const [, regHashes] = await Promise.all([fetchAll, getAllRegistrationHashes(net)]);

    const domains = items.flatMap((d) => {
        const label = d.name.replace(`.${parent}`, "");
        if (label.includes(".")) return [];
        const reg = regHashes.get(label);
        return [
            {
                name: d.name,
                label,
                owner: d.owner,
                address: d.address,
                registeredAt: reg?.timestamp ?? null,
                opHash: reg?.hash ?? null,
                profile: parseProfileFromData(d.data ?? []),
            },
        ];
    });

    return {
        data: domains,
        count: domains.length,
        limit,
        network: net.name,
    };
}

/** Background revalidation — build fresh data and write to Redis */
async function buildDomainsAndCache(
    parent: string,
    limit: number,
    net: ReturnType<typeof getNetwork>,
    redis: Redis,
    cacheKey: string,
): Promise<void> {
    const responseBody = await buildDomainsResponse(parent, limit, net);
    const entry: RedisCacheEntry = { json: JSON.stringify(responseBody), builtAt: Date.now() };
    await redis.set(cacheKey, entry, { ex: DOMAINS_CACHE_TTL_SEC });
}

/** All registrar addresses: current + any legacy contracts (env: comma-separated) */
function getRegistrarAddresses(net: ReturnType<typeof getNetwork>): string[] {
    const addrs: string[] = [];
    if (net.registrarAddress) addrs.push(net.registrarAddress);
    const legacy = process.env.LEGACY_REGISTRARS;
    if (legacy) {
        for (const a of legacy.split(",")) {
            const trimmed = a.trim();
            if (trimmed && !addrs.includes(trimmed)) addrs.push(trimmed);
        }
    }
    return addrs;
}

/** GET /api/v1/activity?limit=30 — recent claim (register) and commit events */
async function handleActivity(url: URL, net: ReturnType<typeof getNetwork>): Promise<Response> {
    const registrars = getRegistrarAddresses(net);
    if (registrars.length === 0) {
        return err("Registrar address not configured for this network", "UPSTREAM_ERROR", 503);
    }

    const rawLimit = parseInt(url.searchParams.get("limit") ?? "30", 10);
    if (Number.isNaN(rawLimit) || rawLimit < 1) return err("limit must be a positive integer", "INVALID_INPUT");
    const limit = Math.min(rawLimit, 100);

    // Fan out queries to all registrar contracts (current + legacy).
    // Individual fetch failures are treated as empty results — a contract
    // that doesn't exist on this network shouldn't take down the whole endpoint.
    type TzKTOp = {
        hash: string;
        sender: { address: string };
        timestamp: string;
        parameter?: { value?: { label?: string } };
    };

    const allClaims: TzKTOp[] = [];
    const allCommits: TzKTOp[] = [];

    await Promise.all(
        registrars.map(async (addr) => {
            const base =
                `${net.tzktApi}/v1/operations/transactions` + `?target=${addr}` + `&status=applied` + `&sort.desc=id`;
            try {
                const [claimRes, commitRes] = await Promise.all([
                    fetch(`${base}&entrypoint=register&limit=${limit}`),
                    fetch(`${base}&entrypoint=commit&limit=${Math.min(limit, 50)}`),
                ]);
                if (claimRes.ok) allClaims.push(...(await claimRes.json()));
                if (commitRes.ok) allCommits.push(...(await commitRes.json()));
            } catch {
                // Contract may not exist on this network — skip silently
            }
        }),
    );

    const claims = allClaims.map((op) => {
        const rawLabel = op.parameter?.value?.label ?? null;
        const label = rawLabel ? hexToUtf8(rawLabel) : null;
        return {
            type: "claimed" as const,
            address: op.sender.address,
            name: label ? `${label}.hack.${net.tld}` : null,
            timestamp: op.timestamp,
            opHash: op.hash,
        };
    });

    const commits = allCommits.map((op) => ({
        type: "committed" as const,
        address: op.sender.address,
        name: null, // commitment hash is not recoverable
        timestamp: op.timestamp,
        opHash: op.hash,
    }));

    // Merge, sort descending, deduplicate by opHash
    const seen = new Set<string>();
    const events = [...claims, ...commits]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .filter((e) => {
            if (seen.has(e.opHash)) return false;
            seen.add(e.opHash);
            return true;
        })
        .slice(0, limit);

    return json({ data: events, count: events.length, limit, network: net.name }, 200, {
        "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40",
    });
}

/** GET /api/v1/config — contract storage config */
async function handleConfig(net: ReturnType<typeof getNetwork>): Promise<Response> {
    if (!net.registrarAddress) {
        return json(
            {
                data: { minCommitAgeSec: 0, maxCommitAgeSec: 0, maxPerWallet: 1, paused: true, registrarAddress: "" },
                network: net.name,
            },
            200,
            { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
        );
    }

    let storage: Record<string, unknown> = {};
    try {
        const res = await fetch(`${net.tzktApi}/v1/contracts/${net.registrarAddress}/storage`);
        if (res.ok) storage = await res.json();
    } catch {
        // Contract may not exist on this network
    }

    return json(
        {
            data: {
                minCommitAgeSec: Number(storage.min_commit_age ?? 0),
                maxCommitAgeSec: Number(storage.max_commit_age ?? 0),
                maxPerWallet: Number(storage.max_per_wallet ?? 1),
                paused: Boolean(storage.paused),
                registrarAddress: net.registrarAddress,
            },
            network: net.name,
        },
        200,
        { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
    );
}

// ---------------------------------------------------------------------------
// Hackatar — generative avatar GIF
// ---------------------------------------------------------------------------

const { GIFEncoder, quantize, applyPalette } = gifenc;
const HACKATAR_SIZE = 192;

function encodeGif(frames: Uint8ClampedArray[], w: number, h: number, delayMs: number): ArrayBuffer {
    const gif = GIFEncoder();
    for (const frame of frames) {
        const palette = quantize(frame, 256, { format: "rgba4444" });
        const indexed = applyPalette(frame, palette, "rgba4444");
        gif.writeFrame(indexed, w, h, { palette, delay: delayMs, transparent: true, transparentIndex: 0 });
    }
    gif.finish();
    return toArrayBuffer(gif.bytes());
}

async function handleHackatar(label: string, url: URL, net: ReturnType<typeof getNetwork>): Promise<Response> {
    const labelErr = validateLabel(label);
    if (labelErr) return err(labelErr, "INVALID_INPUT");

    const isStatic = url.searchParams.has("static");

    // Try blob cache first
    const blobKey = isStatic ? `${label}-static.gif` : `${label}.gif`;
    try {
        const store = getStore("hackatars");
        const cached = await store.get(blobKey, { type: "arrayBuffer" });
        if (cached) {
            return new Response(cached, {
                headers: {
                    "Content-Type": "image/gif",
                    "Cache-Control": "public, max-age=31536000, immutable",
                    ...CORS_HEADERS,
                },
            });
        }
    } catch {
        // Blob store unavailable — generate on the fly
    }

    // Verify domain is registered (TED lookup)
    const fullName = `${label}.hack.${net.tld}`;
    const domainRecord = await tedGql<{ domain: { name: string } | null }>(
        net.domainsGraphql,
        `query($name:String!){domain(name:$name){name}}`,
        { name: fullName },
    );
    if (!domainRecord?.domain) {
        return err("Domain not registered", "NOT_FOUND", 404);
    }

    // Phase 1 seed: salted domain name (deterministic, no opHash required)
    const HACKATAR_SALT = "ReggieRocksFAFO4life";
    const seedStr = `${HACKATAR_SALT}:a7f3c9e2b1d4f805:${label}`;
    const seed = seedFromHash(seedStr);
    const prng = createPrng(seed);
    const traits = selectTraits(prng);

    let rendered: { imageBytes: ArrayBuffer; altBlobKey: string; altImageBytes: ArrayBuffer };
    try {
        if (isStatic) {
            const frame = renderSingleFrame(traits, HACKATAR_SIZE);
            const animResult = renderFrames(traits, HACKATAR_SIZE);
            rendered = {
                imageBytes: encodeGif([frame], HACKATAR_SIZE, HACKATAR_SIZE, 0),
                altBlobKey: `${label}.gif`,
                altImageBytes: encodeGif(animResult.frames, HACKATAR_SIZE, HACKATAR_SIZE, animResult.frameDelayMs),
            };
        } else {
            const result = renderFrames(traits, HACKATAR_SIZE);
            const staticFrame = renderSingleFrame(traits, HACKATAR_SIZE);
            rendered = {
                imageBytes: encodeGif(result.frames, HACKATAR_SIZE, HACKATAR_SIZE, result.frameDelayMs),
                altBlobKey: `${label}-static.gif`,
                altImageBytes: encodeGif([staticFrame], HACKATAR_SIZE, HACKATAR_SIZE, 0),
            };
        }
    } catch {
        return err("Failed to generate hackatar", "GENERATION_FAILED", 500);
    }

    const { imageBytes, altBlobKey, altImageBytes } = rendered;

    // Cache both variants
    try {
        const store = getStore("hackatars");
        await store.set(blobKey, imageBytes);
        await store.set(altBlobKey, altImageBytes);
    } catch {
        // Cache write failed — that's OK
    }

    return new Response(imageBytes, {
        headers: {
            "Content-Type": "image/gif",
            "Cache-Control": "public, max-age=31536000, immutable",
            ...CORS_HEADERS,
        },
    });
}

async function handleAvatar(label: string, reqUrl: URL, net: ReturnType<typeof getNetwork>): Promise<Response> {
    const normalizedLabel = normalizeLabel(label, net.tld);
    const labelErr = validateLabel(normalizedLabel);
    if (labelErr) return err(labelErr, "INVALID_INPUT");

    const fullName = `${normalizedLabel}.hack.${net.tld}`;
    const result = await tedGql<{
        domain: {
            data: Array<{ key: string; value: unknown }>;
        } | null;
    }>(
        net.domainsGraphql,
        `query GetAvatar($name: String!) {
          domain(name: $name) {
            data { key value }
          }
        }`,
        { name: fullName },
    );

    if (!result.domain) {
        return err("Domain not registered", "NOT_FOUND", 404);
    }

    const data = result.domain.data ?? [];
    const profile = parseProfileFromData(data);
    const gravatar = data.find((entry) => entry.key === "gravatar:hash")?.value;

    let sourceUrl: string | null = null;
    if (profile.picture?.startsWith("ipfs://")) {
        const cid = profile.picture.replace("ipfs://", "");
        sourceUrl = `https://ipfs.fileship.xyz/ipfs/${cid}`;
    } else if (profile.picture?.startsWith("https://")) {
        sourceUrl = profile.picture;
    } else if (typeof gravatar === "string" && gravatar.trim().length > 0) {
        sourceUrl = `https://www.gravatar.com/avatar/${gravatar}?s=400&d=identicon`;
    }

    if (!sourceUrl) {
        const staticHackatarUrl = new URL(reqUrl);
        staticHackatarUrl.searchParams.set("static", "1");
        return await handleHackatar(normalizedLabel, staticHackatarUrl, net);
    }

    try {
        const upstream = await fetch(sourceUrl, {
            headers: { Accept: "image/*" },
            redirect: "follow",
        });
        if (!upstream.ok) throw new Error(`Avatar upstream returned ${upstream.status}`);

        const contentType = upstream.headers.get("Content-Type")?.toLowerCase() ?? "";
        if (!contentType.startsWith("image/")) throw new Error("Avatar upstream did not return an image");

        const bytes = await upstream.arrayBuffer();
        return new Response(bytes, {
            headers: {
                "Content-Type": contentType,
                "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
                ...CORS_HEADERS,
            },
        });
    } catch {
        const staticHackatarUrl = new URL(reqUrl);
        staticHackatarUrl.searchParams.set("static", "1");
        return await handleHackatar(normalizedLabel, staticHackatarUrl, net);
    }
}

async function handleShareCard(label: string, reqUrl: URL, net: ReturnType<typeof getNetwork>): Promise<Response> {
    const normalizedLabel = normalizeLabel(label, net.tld);
    const labelErr = validateLabel(normalizedLabel);
    if (labelErr) return err(labelErr, "INVALID_INPUT");

    const fullName = `${normalizedLabel}.hack.${net.tld}`;
    const result = await tedGql<{
        domain: {
            name: string;
            owner: string;
            address: string | null;
            data: Array<{ key: string; value: unknown }>;
        } | null;
    }>(
        net.domainsGraphql,
        `query GetShareCard($name: String!) {
          domain(name: $name) {
            name
            owner
            address
            data { key value }
          }
        }`,
        { name: fullName },
    );

    if (!result.domain) {
        return err("Domain not registered", "NOT_FOUND", 404);
    }

    const profile = parseProfileFromData(result.domain.data ?? []);
    const displayName = profile.name || profile.nickname || label;
    const siteUrl = reqUrl.origin;
    const defaults = getDefaultProfileShareState({
        label: normalizedLabel,
        tld: net.tld,
        fullName,
        displayName,
        bio: profile.bio,
        status: profile.status,
        siteUrl,
    });
    const profileUrl = getProfileShareUrl(normalizedLabel, siteUrl);
    const svg = buildProfileShareSvgWithPaths({
        ...PROFILE_SHARE_SIZES.og,
        preset: defaults.preset,
        title: defaults.title,
        subtitle: defaults.subtitle,
        cta: defaults.cta,
        fullName,
        profileUrl,
        statusLabel: formatShareStatus(profile.status),
    });
    // With vector paths, no font rendering needed - count paths instead
    const pathNodeCount = (svg.match(/<path\b/g) ?? []).length;

    console.info("[share-card] render (vector paths)", {
        version: SHARE_CARD_DEBUG_VERSION,
        label: normalizedLabel,
        network: net.name,
        pathNodeCount,
        cwd: process.cwd(),
        fnDir: _fnDir,
    });

    // No font loading needed - text is pre-converted to vector paths
    const pngData = toArrayBuffer(
        new Resvg(svg, {
            fitTo: { mode: "width", value: PROFILE_SHARE_SIZES.og.width },
        })
            .render()
            .asPng(),
    );

    return new Response(pngData, {
        headers: {
            "Content-Type": "image/png",
            // Temporary debug mode: force function execution on every request.
            "Cache-Control": "no-store, max-age=0",
            "X-Share-Card-Version": SHARE_CARD_DEBUG_VERSION,
            "X-Share-Card-Label": normalizedLabel,
            "X-Share-Card-Path-Count": String(pathNodeCount),
            "X-Share-Card-Mode": "vector-paths",
            ...CORS_HEADERS,
        },
    });
}

// ---------------------------------------------------------------------------
// Bluesky handle linking handlers
// ---------------------------------------------------------------------------

const DID_RE = /^did:(plc|web):[a-zA-Z0-9._:%-]+$/;
const BLUESKY_TIMESTAMP_WINDOW_SEC = 5 * 60;

/** Pack a string as a Micheline expression: 05 01 <4-byte-big-endian-length> <utf8-bytes> */
function packMichelineStringBsky(str: string): string {
    const bytes = new TextEncoder().encode(str);
    const lenHex = bytes.length.toString(16).padStart(8, "0");
    return (
        "0501" +
        lenHex +
        Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("")
    );
}

function buildBlueskyChallenge(action: string, label: string, timestamp: string, nonce: string): string {
    return `hack.tez — Bluesky ${action} · ${label}.hacktez.com · ${timestamp} · ${nonce}`;
}

async function verifyBlueskyAuth(
    body: Record<string, unknown>,
    action: string,
    label: string,
): Promise<{ address: string } | Response> {
    const { address, publicKey, signature, timestamp, nonce } = body as {
        address?: string;
        publicKey?: string;
        signature?: string;
        timestamp?: string;
        nonce?: string;
    };

    if (!address || !publicKey || !signature || !timestamp || !nonce) {
        return err("Missing auth fields", "BAD_REQUEST");
    }

    // Validate timestamp window
    const ts = new Date(timestamp).getTime();
    if (isNaN(ts)) return err("Invalid timestamp", "BAD_REQUEST");
    const nowMs = Date.now();
    if (Math.abs(nowMs - ts) > BLUESKY_TIMESTAMP_WINDOW_SEC * 1000) {
        return err("Timestamp expired", "TIMESTAMP_INVALID", 401);
    }

    // Verify publicKey hashes to address
    let derivedAddress: string;
    try {
        derivedAddress = getPkhfromPk(publicKey);
    } catch {
        return err("Invalid public key", "INVALID_PUBLIC_KEY", 401);
    }
    if (derivedAddress !== address) {
        return err("Public key does not match address", "KEY_MISMATCH", 401);
    }

    // Verify signature
    const message = buildBlueskyChallenge(action, label, timestamp, nonce);
    const payloadHex = packMichelineStringBsky(message);
    let sigValid: boolean;
    try {
        sigValid = verifySignature(payloadHex, publicKey, signature);
    } catch {
        return err("Signature verification failed", "INVALID_SIGNATURE", 401);
    }
    if (!sigValid) return err("Invalid signature", "INVALID_SIGNATURE", 401);

    return { address };
}

async function verifyLabelOwnership(
    label: string,
    address: string,
    net: NetworkConfig & { name: TezosNetwork },
): Promise<boolean> {
    const fullName = `${label}.hack.${net.tld}`;
    const data = await tedGql<{ domain: { owner: string } | null }>(
        net.domainsGraphql,
        `query DomainOwner($name: String!) {
          domain(name: $name) { owner }
        }`,
        { name: fullName },
    );
    return data.domain?.owner === address;
}

async function handleBlueskyLink(req: Request, net: NetworkConfig & { name: TezosNetwork }): Promise<Response> {
    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return err("Invalid JSON body", "BAD_REQUEST");
    }

    const label = body.label as string | undefined;
    if (!label) return err("Missing label", "BAD_REQUEST");
    const labelErr = validateLabel(label);
    if (labelErr) return err(labelErr, "INVALID_LABEL");

    const authResult = await verifyBlueskyAuth(body, "link", label);
    if (authResult instanceof Response) return authResult;
    const { address } = authResult;

    const did = body.did as string | undefined;
    if (!did || !DID_RE.test(did)) {
        return err("Invalid or missing DID", "INVALID_DID");
    }

    // Verify label ownership
    let ownsLabel: boolean;
    try {
        ownsLabel = await verifyLabelOwnership(label, address, net);
    } catch {
        return err("Failed to verify domain ownership", "UPSTREAM_ERROR", 502);
    }
    if (!ownsLabel) {
        return err(`Address does not own ${label}.hack.${net.tld}`, "NOT_OWNER", 403);
    }

    // DID uniqueness — ensure this DID isn't already linked to a different label
    let existingDid: { hostname: string } | null;
    try {
        existingDid = await findRecordByDid(did);
    } catch {
        return err("Failed to check DID uniqueness", "UPSTREAM_ERROR", 502);
    }
    if (existingDid) {
        const existingLabel = existingDid.hostname
            .replace("_atproto.", "")
            .replace(".hacktez.com", "");
        if (existingLabel !== label) {
            return err(
                `DID is already linked to ${existingLabel}.hacktez.com`,
                "DID_CONFLICT",
                409,
            );
        }
    }

    // Delete any existing record for this label before creating a new one
    try {
        await deleteAtprotoRecord(label);
    } catch {
        // Non-fatal — proceed to create
    }

    let record: { id: string };
    try {
        record = await createAtprotoRecord(label, did);
    } catch {
        return err("Failed to create DNS record", "DNS_ERROR", 502);
    }

    return json({
        data: {
            label,
            did,
            hostname: `_atproto.${label}.hacktez.com`,
            recordId: record.id,
            status: "created",
        },
    });
}

async function handleBlueskyUnlink(req: Request, net: NetworkConfig & { name: TezosNetwork }): Promise<Response> {
    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return err("Invalid JSON body", "BAD_REQUEST");
    }

    const label = body.label as string | undefined;
    if (!label) return err("Missing label", "BAD_REQUEST");
    const labelErr = validateLabel(label);
    if (labelErr) return err(labelErr, "INVALID_LABEL");

    const authResult = await verifyBlueskyAuth(body, "unlink", label);
    if (authResult instanceof Response) return authResult;
    const { address } = authResult;

    let ownsLabel: boolean;
    try {
        ownsLabel = await verifyLabelOwnership(label, address, net);
    } catch {
        return err("Failed to verify domain ownership", "UPSTREAM_ERROR", 502);
    }
    if (!ownsLabel) {
        return err(`Address does not own ${label}.hack.${net.tld}`, "NOT_OWNER", 403);
    }

    try {
        await deleteAtprotoRecord(label);
    } catch {
        return err("Failed to remove DNS record", "DNS_ERROR", 502);
    }

    return json({ data: { label, status: "removed" } });
}

async function handleBlueskyStatus(label: string): Promise<Response> {
    const labelErr = validateLabel(label);
    if (labelErr) return err(labelErr, "INVALID_LABEL");

    let record: { id: string; value: string } | null;
    try {
        record = await getAtprotoRecord(label);
    } catch {
        return err("Failed to check DNS record", "DNS_ERROR", 502);
    }

    if (!record) {
        return json({ data: { label, linked: false } });
    }

    const did = record.value.replace(/^did=/, "");
    return json({
        data: {
            label,
            linked: true,
            did,
            handle: `${label}.hacktez.com`,
        },
    });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export default async function handler(req: Request, ctx: Context): Promise<Response> {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const route = ctx.params?.["route"] ?? "";
    const segments = route.split("/").filter(Boolean);
    const [resource, param] = segments;

    // Keep pin uploads addressable at /api/v1/pin even when this catch-all route matches first.
    if (req.method === "POST" && resource === "pin") {
        return pinHandler(req, ctx);
    }

    // Delegate ALL /api/v1/wiki/* requests (any method) to the wiki function
    if (resource === "wiki") {
        const wiki = await import("./wiki.mts");
        return wiki.default(req, ctx);
    }

    // Delegate ALL /api/v1/arcade/* requests (any method) to the arcade function
    if (resource === "arcade") {
        const arcade = await import("./arcade.mts");
        return arcade.default(req, ctx);
    }

    // Bluesky handle linking
    //   POST /api/v1/bluesky/link    — label in request body
    //   POST /api/v1/bluesky/unlink  — label in request body
    //   GET  /api/v1/bluesky/:label  — check status
    if (resource === "bluesky") {
        const net = getNetwork();
        if (req.method === "POST" && param === "link") return handleBlueskyLink(req, net);
        if (req.method === "POST" && param === "unlink") return handleBlueskyUnlink(req, net);
        if (req.method === "GET" && param) return handleBlueskyStatus(decodeURIComponent(param));
        if (req.method === "POST") return err("Unknown bluesky action", "NOT_FOUND", 404);
        return err("Method not allowed", "METHOD_NOT_ALLOWED", 405);
    }

    if (req.method !== "GET") {
        return err("Method not allowed", "METHOD_NOT_ALLOWED", 405);
    }

    const net = getNetwork();

    try {
        if (resource === "domains") return await handleDomains(new URL(req.url), net);
        if (resource === "domain" && param) return await handleDomain(decodeURIComponent(param), net);
        if (resource === "profile" && param) return await handleProfile(decodeURIComponent(param), net);
        if (resource === "availability" && param) return await handleAvailability(decodeURIComponent(param), net);
        if (resource === "owner" && param) return await handleOwner(decodeURIComponent(param), net);
        if (resource === "resolve" && param) return await handleResolve(decodeURIComponent(param), net);
        if (resource === "config") return await handleConfig(net);
        if (resource === "activity") return await handleActivity(new URL(req.url), net);
        if (resource === "hackatar" && param)
            return await handleHackatar(decodeURIComponent(param), new URL(req.url), net);
        if (resource === "avatar" && param) return await handleAvatar(decodeURIComponent(param), new URL(req.url), net);
        if (resource === "share-card" && param)
            return await handleShareCard(decodeURIComponent(param), new URL(req.url), net);

        return json(
            {
                api: "hack.tez",
                version: "1",
                network: net.name,
                endpoints: [
                    `/api/v1/domains?limit=50`,
                    `/api/v1/domain/:name`,
                    `/api/v1/profile/:name`,
                    `/api/v1/availability/:label`,
                    `/api/v1/owner/:address`,
                    `/api/v1/resolve/:address`,
                    `/api/v1/config`,
                    `/api/v1/activity?limit=30`,
                    `/api/v1/hackatar/:label`,
                    `/api/v1/avatar/:label`,
                    `/api/v1/share-card/:label`,
                ],
                docs: "/developers",
            },
            200,
        );
    } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        return err(message, "UPSTREAM_ERROR", 502);
    }
}

export const config: Config = {
    path: "/api/v1/:route*",
};
