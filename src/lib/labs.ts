export type LabStatus = "alpha" | "beta" | "production";

export interface LabMeta {
    slug: string;
    title: string;
    summary: string;
    status: LabStatus;
    version: string;
    kind: string;
    repo?: string;
    privacy?: string;
    chromeStore?: string;
    mozillaStore?: string;
    /** Lucide icon name (lowercase) for the labs grid — see LAB_ICONS in Labs.tsx. */
    icon?: string;
    /** Optional — interactive labs (in-app tools) have no downloadable file. */
    file: string;
    browsers: string[];
    wallets: string[];
    updated?: string;
    /** Interactive labs render their own route (e.g. /labs/coldmilk) instead of the
     *  default markdown + download detail page. */
    interactive: boolean;
    raw: string;
}

const modules = import.meta.glob("../labs/*.md", { query: "?raw", import: "default", eager: true }) as Record<
    string,
    string
>;

function slugFromPath(filePath: string): string {
    return filePath.replace(/^.*\//, "").replace(/\.md$/, "");
}

function parseFrontmatter(raw: string): { data: Record<string, string | string[]>; content: string } {
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) return { data: {}, content: raw };
    const data: Record<string, string | string[]> = {};
    for (const line of match[1].split("\n")) {
        const m = line.match(/^(\w+):\s*(.+)$/);
        if (!m) continue;
        const key = m[1];
        let val: string | string[] = m[2].trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        else if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        if (typeof val === "string" && val.startsWith("[") && val.endsWith("]")) {
            val = val
                .slice(1, -1)
                .split(",")
                .map((s) => s.trim().replace(/^["']|["']$/g, ""))
                .filter(Boolean);
        }
        data[key] = val;
    }
    return { data, content: match[2] };
}

const STATUS_ORDER: Record<LabStatus, number> = { production: 0, beta: 1, alpha: 2 };

function parseLab(filePath: string, raw: string): LabMeta {
    const { data, content } = parseFrontmatter(raw);
    const slug = (typeof data.slug === "string" ? data.slug : undefined) ?? slugFromPath(filePath);
    const statusRaw = (typeof data.status === "string" ? data.status : "alpha") as LabStatus;
    const status: LabStatus = statusRaw in STATUS_ORDER ? statusRaw : "alpha";
    return {
        slug,
        title: (data.title as string | undefined) ?? slug,
        summary: (data.summary as string | undefined) ?? "",
        status,
        version: (data.version as string | undefined) ?? "0.0.0",
        kind: (data.kind as string | undefined) ?? "extension",
        repo: data.repo as string | undefined,
        privacy: data.privacy as string | undefined,
        chromeStore: data.chromeStore as string | undefined,
        mozillaStore: data.mozillaStore as string | undefined,
        icon: data.icon as string | undefined,
        file: (data.file as string | undefined) ?? "",
        browsers: Array.isArray(data.browsers) ? data.browsers : [],
        wallets: Array.isArray(data.wallets) ? data.wallets : [],
        updated: data.updated as string | undefined,
        interactive: typeof data.interactive === "string" ? data.interactive === "true" : false,
        raw: content,
    };
}

export const labs: LabMeta[] = Object.entries(modules)
    .map(([path, raw]) => parseLab(path, raw))
    .sort((a, b) => a.title.localeCompare(b.title));

export function getLab(slug: string): LabMeta | undefined {
    return labs.find((l) => l.slug === slug);
}
