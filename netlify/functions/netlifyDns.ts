const BASE = "https://api.netlify.com/api/v1";

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
