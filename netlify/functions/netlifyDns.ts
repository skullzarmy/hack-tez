const BASE = "https://api.netlify.com/api/v1";
const SITE_ID = process.env.NETLIFY_SITE_ID ?? "dbfc0e10-e21d-4e08-ad37-cf7e51de7a4c";

function zoneId(): string {
    const id = process.env.NETLIFY_DNS_ZONE_ID;
    if (!id) throw new Error("NETLIFY_DNS_ZONE_ID is not set");
    return id;
}

function token(): string {
    const t = process.env.NETLIFY_DNS_TOKEN;
    if (!t) throw new Error("NETLIFY_DNS_TOKEN is not set");
    return t;
}

function authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" };
}

function hostname(label: string): string {
    return `_atproto.${label}.hacktez.com`;
}

interface DnsRecord {
    id: string;
    hostname: string;
    value: string;
    type: string;
}

async function listRecords(): Promise<DnsRecord[]> {
    const res = await fetch(`${BASE}/dns_zones/${zoneId()}/dns_records`, {
        headers: authHeaders(),
    });
    if (!res.ok) throw new Error(`Netlify DNS list failed: ${res.status}`);
    return res.json() as Promise<DnsRecord[]>;
}

export async function createAtprotoRecord(label: string, did: string): Promise<{ id: string }> {
    const res = await fetch(`${BASE}/dns_zones/${zoneId()}/dns_records`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
            type: "TXT",
            hostname: hostname(label),
            value: `did=${did}`,
            ttl: 300,
        }),
    });
    if (!res.ok) throw new Error(`Netlify DNS create failed: ${res.status}`);
    const record = (await res.json()) as { id: string };
    return { id: record.id };
}

export async function deleteAtprotoRecord(label: string): Promise<void> {
    const records = await listRecords();
    const target = records.find(
        (r) => r.type === "TXT" && r.hostname === hostname(label),
    );
    if (!target) return;
    const res = await fetch(`${BASE}/dns_zones/${zoneId()}/dns_records/${target.id}`, {
        method: "DELETE",
        headers: authHeaders(),
    });
    if (!res.ok && res.status !== 404) {
        throw new Error(`Netlify DNS delete failed: ${res.status}`);
    }
}

export async function getAtprotoRecord(
    label: string,
): Promise<{ id: string; value: string } | null> {
    const records = await listRecords();
    const target = records.find(
        (r) => r.type === "TXT" && r.hostname === hostname(label),
    );
    if (!target) return null;
    return { id: target.id, value: target.value };
}

export async function findRecordByDid(
    did: string,
): Promise<{ hostname: string } | null> {
    const records = await listRecords();
    const target = records.find(
        (r) =>
            r.type === "TXT" &&
            r.hostname.startsWith("_atproto.") &&
            r.hostname.endsWith(".hacktez.com") &&
            r.value === `did=${did}`,
    );
    if (!target) return null;
    return { hostname: target.hostname };
}

export async function createSubdomainCname(label: string): Promise<void> {
    const hostnameValue = `${label}.hacktez.com`;
    const records = await listRecords();
    const existing = records.find((r) => r.type === "CNAME" && r.hostname === hostnameValue);
    if (existing) return;
    const res = await fetch(`${BASE}/dns_zones/${zoneId()}/dns_records`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
            type: "CNAME",
            hostname: hostnameValue,
            value: "hacktez.netlify.app",
            ttl: 3600,
        }),
    });
    if (!res.ok) throw new Error(`Netlify DNS CNAME create failed: ${res.status}`);
}

export async function ensureDomainAlias(label: string): Promise<void> {
    const alias = `${label}.hacktez.com`;
    const siteRes = await fetch(`${BASE}/sites/${SITE_ID}`, { headers: authHeaders() });
    if (!siteRes.ok) throw new Error(`Netlify site fetch failed: ${siteRes.status}`);
    const site = (await siteRes.json()) as { domain_aliases?: string[] };
    const existing = site.domain_aliases ?? [];
    if (existing.includes(alias)) return;
    const patchRes = await fetch(`${BASE}/sites/${SITE_ID}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ domain_aliases: [...existing, alias] }),
    });
    if (!patchRes.ok) throw new Error(`Netlify domain alias update failed: ${patchRes.status}`);
}
