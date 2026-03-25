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
    const name = `${label}.hack.tez`;
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
    expiresAt: string | null;
}

/** Get all subdomains of hack.tez owned by a specific address */
export async function getSubdomainsByOwner(ownerAddress: string): Promise<SubdomainRecord[]> {
    const data = await gql<{
        domains: { items: Array<{ name: string; address: string | null; owner: string; expiresAtUtc: string | null }> };
    }>(
        `query OwnerDomains($owner: String!, $parent: String!) {
      domains(where: { owner: { equalTo: $owner }, name: { endsWith: $parent } }) {
        items {
          name
          address
          owner
          expiresAtUtc
        }
      }
    }`,
        { owner: ownerAddress, parent: ".hack.tez" },
    );
    return data.domains.items.map((d) => ({
        name: d.name,
        address: d.address,
        owner: d.owner,
        expiresAt: d.expiresAtUtc,
    }));
}

/** Validate a subdomain label (lowercase alphanumeric + hyphens, 1-63 chars) */
export function validateLabel(label: string): { valid: boolean; error?: string } {
    if (label.length === 0) return { valid: false, error: "Name cannot be empty" };
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

/** Convert a string label to bytes (hex-encoded UTF-8) for on-chain use */
export function labelToBytes(label: string): string {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(label);
    return (
        "0x" +
        Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("")
    );
}
