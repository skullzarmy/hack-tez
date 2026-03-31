/**
 * hack.tez Public API — Netlify Function v2
 *
 * Routes:
 *   GET /api/domain/:name        — domain record by full name or label
 *   GET /api/availability/:label — check if a label is free to register
 *   GET /api/owner/:address      — all hack.tez domains owned by a wallet
 *   GET /api/resolve/:address    — reverse-resolve wallet → primary domain
 *   GET /api/config              — contract config (commit age, max, paused)
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
// Handlers
// ---------------------------------------------------------------------------

/** GET /api/domain/:name — domain record by label or full name */
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
            expiresAtUtc: string | null;
        } | null;
    }>(
        net.domainsGraphql,
        `query GetDomain($name: String!) {
          domain(name: $name) {
            name
            address
            owner
            expiresAtUtc
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
                expiresAt: data.domain.expiresAtUtc,
            },
            available: false,
            network: net.name,
        },
        200,
        { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    );
}

/** GET /api/availability/:label */
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

/** GET /api/owner/:address */
async function handleOwner(address: string, net: ReturnType<typeof getNetwork>): Promise<Response> {
    if (!TZ_ADDRESS_RE.test(address)) return err("Invalid Tezos address", "INVALID_INPUT");

    const data = await tedGql<{
        domains: {
            items: Array<{
                name: string;
                address: string | null;
                owner: string;
                expiresAtUtc: string | null;
            }>;
        };
    }>(
        net.domainsGraphql,
        `query OwnerDomains($owner: Address!, $parent: String!) {
          domains(where: { owner: { equalTo: $owner }, name: { endsWith: $parent } }) {
            items { name address owner expiresAtUtc }
          }
        }`,
        { owner: address, parent: `.hack.${net.tld}` },
    );

    const domains = data.domains.items.map((d) => ({
        name: d.name,
        label: d.name.replace(`.hack.${net.tld}`, ""),
        address: d.address,
        owner: d.owner,
        expiresAt: d.expiresAtUtc,
    }));

    return json({ data: domains, count: domains.length, network: net.name }, 200, {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
    });
}

/** GET /api/resolve/:address — reverse-resolve address → primary domain name */
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

/** GET /api/domains?limit=50&offset=0 — paginated list of all hack.tez registrations */
async function handleDomains(url: URL, net: ReturnType<typeof getNetwork>): Promise<Response> {
    if (!net.registrarAddress) {
        return err("Registrar address not configured for this network", "UPSTREAM_ERROR", 503);
    }

    const rawLimit = parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
    const rawOffset = parseInt(url.searchParams.get("offset") ?? "0", 10);

    if (isNaN(rawLimit) || rawLimit < 1) return err("limit must be a positive integer", "INVALID_INPUT");
    if (isNaN(rawOffset) || rawOffset < 0) return err("offset must be a non-negative integer", "INVALID_INPUT");

    const limit = Math.min(rawLimit, MAX_LIMIT);
    const offset = rawOffset;

    const tzktUrl =
        `${net.tzktApi}/v1/operations/transactions` +
        `?target=${net.registrarAddress}` +
        `&entrypoint=register` +
        `&status=applied` +
        `&limit=${limit}` +
        `&offset=${offset}` +
        `&sort.desc=id`;

    const res = await fetch(tzktUrl);
    if (!res.ok) return err("Failed to fetch from TzKT", "UPSTREAM_ERROR", 502);

    const ops: Array<{
        hash: string;
        sender: { address: string };
        timestamp: string;
        parameter?: { value?: { label?: string } };
    }> = await res.json();

    const seen = new Set<string>();
    const domains: Array<{
        name: string;
        label: string;
        owner: string;
        registeredAt: string;
        opHash: string;
    }> = [];

    for (const op of ops) {
        const rawLabel = op.parameter?.value?.label ?? null;
        if (!rawLabel) continue;
        const label = hexToUtf8(rawLabel);
        const name = `${label}.hack.${net.tld}`;
        if (seen.has(name)) continue;
        seen.add(name);
        domains.push({
            name,
            label,
            owner: op.sender.address,
            registeredAt: op.timestamp,
            opHash: op.hash,
        });
    }

    return json(
        {
            data: domains,
            count: domains.length,
            limit,
            offset,
            network: net.name,
        },
        200,
        { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
    );
}

/** GET /api/config — contract storage config */
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
        if (resource === "availability" && param) return await handleAvailability(decodeURIComponent(param), net);
        if (resource === "owner" && param) return await handleOwner(decodeURIComponent(param), net);
        if (resource === "resolve" && param) return await handleResolve(decodeURIComponent(param), net);
        if (resource === "config") return await handleConfig(net);

        return json(
            {
                api: "hack.tez",
                version: "1",
                network: net.name,
                endpoints: [
                    `/api/domains?limit=50&offset=0`,
                    `/api/domain/:name`,
                    `/api/availability/:label`,
                    `/api/owner/:address`,
                    `/api/resolve/:address`,
                    `/api/config`,
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
    path: "/api/:route*",
};
