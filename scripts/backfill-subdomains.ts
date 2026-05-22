/**
 * Backfill subdomain provisioning for all existing claimed hack.tez domains.
 *
 * Fetches the full domain list from /api/v1/domains, then POSTs to
 * /api/v1/domain/:label/provision for each one.
 *
 * Usage (from project root):
 *   npx tsx scripts/backfill-subdomains.ts
 *   npx tsx scripts/backfill-subdomains.ts --dry-run
 *   npx tsx scripts/backfill-subdomains.ts --base-url https://hacktez.com
 */

const BASE_URL = (() => {
    const flag = process.argv.find((a) => a.startsWith("--base-url="));
    return flag ? flag.slice("--base-url=".length) : "https://hacktez.com";
})();
const DRY_RUN = process.argv.includes("--dry-run");
const CONCURRENCY = 3;

async function fetchAllLabels(): Promise<string[]> {
    const res = await fetch(`${BASE_URL}/api/v1/domains?limit=1000`);
    if (!res.ok) throw new Error(`Failed to fetch domains: ${res.status}`);
    const body = (await res.json()) as { data: Array<{ label: string }> };
    return body.data.map((d) => d.label);
}

async function provision(label: string): Promise<"ok" | "skip" | "error"> {
    if (DRY_RUN) {
        console.log(`[dry-run] would provision ${label}.hacktez.com`);
        return "ok";
    }
    const res = await fetch(`${BASE_URL}/api/v1/domain/${encodeURIComponent(label)}/provision`, {
        method: "POST",
    });
    if (res.ok) return "ok";
    if (res.status === 207) {
        const body = await res.json();
        console.warn(`[partial] ${label}:`, body.data?.errors);
        return "error";
    }
    if (res.status === 404) return "skip";
    console.error(`[error] ${label}: HTTP ${res.status}`);
    return "error";
}

async function runBatch(labels: string[]): Promise<void> {
    let ok = 0, skip = 0, error = 0;
    for (let i = 0; i < labels.length; i += CONCURRENCY) {
        const batch = labels.slice(i, i + CONCURRENCY);
        const results = await Promise.all(batch.map(provision));
        for (const r of results) {
            if (r === "ok") ok++;
            else if (r === "skip") skip++;
            else error++;
        }
        console.log(`Progress: ${Math.min(i + CONCURRENCY, labels.length)}/${labels.length}`);
    }
    console.log(`\nDone. ok=${ok} skip=${skip} error=${error}`);
}

const labels = await fetchAllLabels();
console.log(`Found ${labels.length} domains. ${DRY_RUN ? "(dry-run)" : `Provisioning against ${BASE_URL}`}`);
await runBatch(labels);
