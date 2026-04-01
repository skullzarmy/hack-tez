/**
 * GraphQL queries and helpers for Tezos Domains
 */
import config from "../config/tezos";

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

/** Check if a subdomain of hack.tez is available */
export async function checkAvailability(label: string): Promise<boolean> {
    const name = `${label}.hack.${config.tld}`;
    const data = await gql<{ domain: { name: string } | null }>(
        `query CheckDomain($name: String!) {
      domain(name: $name) {
        name
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
}

/** Get all subdomains of hack.tez owned by a specific address */
export async function getSubdomainsByOwner(ownerAddress: string): Promise<SubdomainRecord[]> {
    const data = await gql<{
        domains: { items: Array<{ name: string; address: string | null; owner: string }> };
    }>(
        `query OwnerDomains($owner: Address!, $parent: String!) {
      domains(where: { owner: { equalTo: $owner }, name: { endsWith: $parent } }) {
        items {
          name
          address
          owner
        }
      }
    }`,
        { owner: ownerAddress, parent: `.hack.${config.tld}` },
    );
    return data.domains.items.map((d) => ({
        name: d.name,
        address: d.address,
        owner: d.owner,
    }));
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
