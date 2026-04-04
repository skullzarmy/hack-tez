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
 */
import type { Config, Context } from "@netlify/functions";

// ---------------------------------------------------------------------------
// Network config (mirrors src/config/tezos.ts without Vite import.meta.env)
// ---------------------------------------------------------------------------

type TezosNetwork = "mainnet" | "ghostnet";

interface NetworkConfig {
    tld: string;
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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

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
    if (!label || label.length < 3) return "Label must be at least 3 characters";
    if (label.length > 63) return "Label must be 63 characters or fewer";
    if (!LABEL_RE.test(label)) return "Label must be lowercase alphanumeric with hyphens";
    return null;
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
// Profile parsing (inlined — Netlify Functions can't import from src/)
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
                                typeof v === "object" && v !== null && typeof v.name === "string" && typeof v.desc === "string",
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

    const result = await tedGql<{
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
    );

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

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** GET /api/v1/domains?limit=50&offset=0 — paginated list of all hack.tez registrations */
async function handleDomains(url: URL, net: ReturnType<typeof getNetwork>): Promise<Response> {
    const parent = `hack.${net.tld}`;

    const rawLimit = parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
    if (isNaN(rawLimit) || rawLimit < 1) return err("limit must be a positive integer", "INVALID_INPUT");
    const limit = Math.min(rawLimit, 50); // TED GraphQL caps first at 50

    const data = await tedGql<{
        domains: {
            items: Array<{
                name: string;
                owner: string;
                address: string | null;
                data: Array<{ key: string; value: unknown }>;
            }>;
        };
    }>(
        net.domainsGraphql,
        `query AllDomains($parent: String!, $first: Int!) {
          domains(where: { name: { endsWith: $parent } }, first: $first) {
            items {
              name
              owner
              address
              data { key value }
            }
          }
        }`,
        { parent: `.${parent}`, first: limit },
    );

    const domains = data.domains.items.map((d) => {
        const label = d.name.replace(`.${parent}`, "");
        return {
            name: d.name,
            label,
            owner: d.owner,
            address: d.address,
        };
    });

    return json(
        {
            data: domains,
            count: domains.length,
            limit,
            network: net.name,
        },
        200,
        { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
    );
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
    if (isNaN(rawLimit) || rawLimit < 1) return err("limit must be a positive integer", "INVALID_INPUT");
    const limit = Math.min(rawLimit, 100);

    // Fan out queries to all registrar contracts (current + legacy)
    const fetches: Promise<Response>[] = [];
    for (const addr of registrars) {
        const base =
            `${net.tzktApi}/v1/operations/transactions` +
            `?target=${addr}` +
            `&status=applied` +
            `&sort.desc=id`;
        fetches.push(fetch(`${base}&entrypoint=register&limit=${limit}`));
        fetches.push(fetch(`${base}&entrypoint=commit&limit=${Math.min(limit, 50)}`));
    }

    const responses = await Promise.all(fetches);
    if (responses.some((r) => !r.ok)) return err("Failed to fetch from TzKT", "UPSTREAM_ERROR", 502);

    type TzKTOp = {
        hash: string;
        sender: { address: string };
        timestamp: string;
        parameter?: { value?: { label?: string } };
    };

    // Results arrive in pairs: [claims0, commits0, claims1, commits1, ...]
    const allClaims: TzKTOp[] = [];
    const allCommits: TzKTOp[] = [];
    for (let i = 0; i < responses.length; i += 2) {
        const claimOps: TzKTOp[] = await responses[i].json();
        const commitOps: TzKTOp[] = await responses[i + 1].json();
        allClaims.push(...claimOps);
        allCommits.push(...commitOps);
    }

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
        return err("Registrar address not configured for this network", "UPSTREAM_ERROR", 503);
    }

    const res = await fetch(`${net.tzktApi}/v1/contracts/${net.registrarAddress}/storage`);
    if (!res.ok) return err("Failed to fetch contract storage", "UPSTREAM_ERROR", 502);
    const storage = await res.json();

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
// Entry point
// ---------------------------------------------------------------------------

export default async function handler(req: Request, ctx: Context): Promise<Response> {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (req.method !== "GET") {
        return err("Method not allowed", "METHOD_NOT_ALLOWED", 405);
    }

    const net = getNetwork();
    const { params } = ctx;
    const route = params["route"] ?? "";
    const segments = route.split("/").filter(Boolean);
    const [resource, param] = segments;

    try {
        if (resource === "domains") return await handleDomains(new URL(req.url), net);
        if (resource === "domain" && param) return await handleDomain(decodeURIComponent(param), net);
        if (resource === "profile" && param) return await handleProfile(decodeURIComponent(param), net);
        if (resource === "availability" && param) return await handleAvailability(decodeURIComponent(param), net);
        if (resource === "owner" && param) return await handleOwner(decodeURIComponent(param), net);
        if (resource === "resolve" && param) return await handleResolve(decodeURIComponent(param), net);
        if (resource === "config") return await handleConfig(net);
        if (resource === "activity") return await handleActivity(new URL(req.url), net);

        return json(
            {
                api: "hack.tez",
                version: "1",
                network: net.name,
                endpoints: [
                    `/api/v1/domains?limit=50&offset=0`,
                    `/api/v1/domain/:name`,
                    `/api/v1/profile/:name`,
                    `/api/v1/availability/:label`,
                    `/api/v1/owner/:address`,
                    `/api/v1/resolve/:address`,
                    `/api/v1/config`,
                    `/api/v1/activity?limit=30`,
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
