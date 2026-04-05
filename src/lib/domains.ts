/**
 * GraphQL queries and helpers for Tezos Domains
 */
import config from "../config/tezos";
import type { HackProfile } from "../types/profile";
import { parseProfileFromData } from "../types/profile";

const GRAPHQL_URL = config.domainsGraphql;

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await fetch(GRAPHQL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0].message);
    return json.data;
}

// ── Bulk fetch all hack.tez subdomains with profile data ────────────

export interface SubdomainWithProfile {
    label: string;
    name: string;
    address: string | null;
    owner: string;
    data: Array<{ key: string; value: unknown }>;
    profile: HackProfile;
}

/** Fetch subdomains under hack.{tld} (up to 50) with profile data */
export async function getAllSubdomains(): Promise<SubdomainWithProfile[]> {
    const parent = `hack.${config.tld}`;
    const data = await gql<{
        domains: {
            items: Array<{
                name: string;
                address: string | null;
                owner: string;
                data: Array<{ key: string; value: unknown }>;
            }>;
        };
    }>(
        `query AllSubdomains($parent: String!) {
      domains(where: { name: { endsWith: $parent } }, first: 50) {
        items {
          name
          address
          owner
          data { key value }
        }
      }
    }`,
        { parent: `.${parent}` },
    );
    return data.domains.items.flatMap((d) => {
        const label = d.name.replace(`.${parent}`, "");
        if (label.includes(".")) return [];
        return [{
            label,
            name: d.name,
            address: d.address,
            owner: d.owner,
            data: d.data,
            profile: parseProfileFromData(d.data),
        }];
    });
}

/** Check if a subdomain of hack.tez is available */
export async function checkAvailability(label: string): Promise<boolean> {
    const name = `${label}.hack.${config.tld}`;
    const data = await gql<{ domain: { name: string } | null }>(
        `query CheckDomain($name: String!) {
      domain(name: $name) {
        name
        data { key value }
      }
    }`,
        { name },
    );
    return data.domain === null;
}

export interface SubdomainRecord {
    name: string;
    address: string | null;
    owner: string;
    data: Array<{ key: string; value: unknown }>;
    profile: HackProfile;
}

/** Domain record with profile data — used by profile pages */
export interface DomainRecord {
    name: string;
    owner: string;
    address: string | null;
    data: Array<{ key: string; value: unknown }>;
    profile: HackProfile;
    /** Raw gravatar hash from TED data (if set) */
    gravatar: string | null;
}

/** Fetch a full domain record by name, including owner and profile */
export async function getDomainRecord(name: string): Promise<DomainRecord | null> {
    const data = await gql<{
        domain: {
            name: string;
            owner: string;
            address: string | null;
            data: Array<{ key: string; value: unknown }>;
        } | null;
    }>(
        `query DomainRecord($name: String!) {
      domain(name: $name) {
        name
        owner
        address
        data { key value }
      }
    }`,
        { name },
    );
    if (data.domain === null) return null;
    const gravatar = data.domain.data.find((d) => d.key === "gravatar:hash")?.value;
    return {
        name: data.domain.name,
        owner: data.domain.owner,
        address: data.domain.address,
        data: data.domain.data,
        profile: parseProfileFromData(data.domain.data),
        gravatar: typeof gravatar === "string" ? gravatar : null,
    };
}
export async function getSubdomainsByOwner(ownerAddress: string): Promise<SubdomainRecord[]> {
    const data = await gql<{
        domains: {
            items: Array<{
                name: string;
                address: string | null;
                owner: string;
                data: Array<{ key: string; value: unknown }>;
            }>;
        };
    }>(
        `query OwnerDomains($owner: Address!, $parent: String!) {
      domains(where: { owner: { equalTo: $owner }, name: { endsWith: $parent } }) {
        items {
          name
          address
          owner
          data { key value }
        }
      }
    }`,
        { owner: ownerAddress, parent: `.hack.${config.tld}` },
    );
    return data.domains.items.map((d) => ({
        name: d.name,
        address: d.address,
        owner: d.owner,
        data: d.data,
        profile: parseProfileFromData(d.data),
    }));
}

/** Fetch profile data for a specific domain name */
export async function getDomainProfile(name: string): Promise<HackProfile | null> {
    const data = await gql<{
        domain: { data: Array<{ key: string; value: unknown }> } | null;
    }>(
        `query DomainProfile($name: String!) {
      domain(name: $name) {
        data { key value }
      }
    }`,
        { name },
    );
    if (data.domain === null) return null;
    return parseProfileFromData(data.domain.data);
}

/** Validate a subdomain label (lowercase alphanumeric + hyphens, 1-63 chars) */
export function validateLabel(label: string): { valid: boolean; error?: string } {
    if (label.length === 0) return { valid: false, error: "Name cannot be empty" };
    if (label.length < 3) return { valid: false, error: "Name must be at least 3 characters" };
    if (label.length > 63) return { valid: false, error: "Name must be 63 characters or fewer" };
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(label)) {
        return { valid: false, error: "Only lowercase letters, numbers, and hyphens allowed" };
    }
    return { valid: true };
}

// Reserved names that cannot be registered
const RESERVED_NAMES = new Set([
    "admin",
    "support",
    "help",
    "www",
    "mail",
    "ftp",
    "api",
    "app",
    "ns1",
    "ns2",
    "dns",
    "mx",
    "smtp",
    "imap",
    "pop",
    "ssh",
    "hack",
    "tez",
    "tezos",
    "test",
    "dev",
    "staging",
    "prod",
    "official",
    "bot",
    "system",
    "root",
    "null",
    "undefined",
]);

export function isReserved(label: string): boolean {
    return RESERVED_NAMES.has(label.toLowerCase());
}

/** Resolve a tz address to its tzkt profile alias (if any) */
export async function resolveAddressToAlias(address: string): Promise<string | null> {
    try {
        const res = await fetch(`${config.tzktApi}/v1/accounts/${address}`);
        if (!res.ok) return null;
        const data = await res.json();
        return data.alias ?? null;
    } catch {
        return null;
    }
}

/** Get the first hack.tez subdomain owned by an address (if any) */
async function getFirstHackTezSubdomain(address: string): Promise<string | null> {
    const subs = await getSubdomainsByOwner(address);
    return subs[0]?.name ?? null;
}

/**
 * Resolve the best available display name for a tz address.
 * Priority (best → fallback):
 *   1. Owned hack.tez subdomain
 *   2. Tezos Domains reverse record
 *   3. tzkt profile alias
 *   4. null (caller shows truncated address)
 */
export async function resolveDisplayName(address: string): Promise<string | null> {
    const [hackTez, domain, alias] = await Promise.allSettled([
        getFirstHackTezSubdomain(address),
        resolveAddressToDomain(address),
        resolveAddressToAlias(address),
    ]);
    const best = (r: PromiseSettledResult<string | null>) =>
        r.status === "fulfilled" ? r.value : null;
    return best(hackTez) ?? best(domain) ?? best(alias);
}
/** Fetch sub-subdomains (children) of a specific parent domain */
export async function getSubSubdomains(parentName: string): Promise<SubdomainRecord[]> {
    const data = await gql<{
        domains: {
            items: Array<{
                name: string;
                address: string | null;
                owner: string;
                data: Array<{ key: string; value: unknown }>;
            }>;
        };
    }>(
        `query SubSubdomains($parent: String!) {
      domains(where: { name: { endsWith: $parent } }, first: 50) {
        items {
          name
          address
          owner
          data { key value }
        }
      }
    }`,
        { parent: `.${parentName}` },
    );
    // Filter out the parent domain itself (endsWith matches it too)
    return data.domains.items
        .filter((d) => d.name !== parentName)
        .map((d) => ({
            name: d.name,
            address: d.address,
            owner: d.owner,
            data: d.data,
            profile: parseProfileFromData(d.data),
        }));
}

/** Reverse-resolve a tz address to its .tez domain name (if any) */
export async function resolveAddressToDomain(address: string): Promise<string | null> {
    const data = await gql<{ reverseRecord: { domain: { name: string } } | null }>(
        `query ReverseLookup($address: String!) {
      reverseRecord(address: $address) {
        domain {
          name
        }
      }
    }`,
        { address },
    );
    return data.reverseRecord?.domain?.name ?? null;
}
