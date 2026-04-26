export type CategorySlug =
  | "tezos"
  | "smart-contracts"
  | "wallets"
  | "tooling"
  | "data"
  | "domains"
  | "network"
  | "hacktez"
  | "meta";

export const ALLOWED_CATEGORIES: readonly CategorySlug[] = [
  "tezos",
  "smart-contracts",
  "wallets",
  "tooling",
  "data",
  "domains",
  "network",
  "hacktez",
  "meta",
];

export interface Frontmatter {
  title: string;
  slug?: string;
  summary?: string | null;
  category: CategorySlug;
  tags?: string[];
  author?: string; // domain, e.g. admin.hack.tez
  status?: "draft" | "published";
  links?: Record<string, string>;
}

export interface ParsedMarkdown {
  fm: Frontmatter;
  markdown: string;
}

export function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function parseFrontmatter(raw: string): ParsedMarkdown {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const data: Record<string, unknown> = {};
  let md = raw.trim();
  if (m) {
    for (const line of m[1].split("\n")) {
      const mm = line.match(/^(\w+):\s*(.+)$/);
      if (!mm) continue;
      const key = mm[1];
      let val: string | string[] = mm[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (typeof val === "string" && val.startsWith("[") && val.endsWith("]")) {
        val = val
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
      data[key] = val;
    }
    md = m[2].trim();
  }

  const title = (data.title as string | undefined)?.trim();
  const cat = (data.category as string | undefined)?.trim() as CategorySlug | undefined;
  if (!title) throw new Error("title is required");
  if (title.length > 120) throw new Error("title too long (max 120)");
  if (!cat || !ALLOWED_CATEGORIES.includes(cat)) throw new Error(`category must be one of: ${ALLOWED_CATEGORIES.join(", ")}`);

  const fm: Frontmatter = {
    title,
    slug: (data.slug as string | undefined)?.trim(),
    summary: (data.summary as string | undefined)?.trim()?.slice(0, 300) ?? null,
    category: cat,
    tags: Array.isArray(data.tags) ? (data.tags as string[]).map((t) => t.trim()).filter(Boolean).slice(0, 10) : undefined,
    author: (data.author as string | undefined)?.trim(),
    status: (data.status as string | undefined) === "published" ? "published" : "draft",
    links: (typeof data.links === "object" && data.links !== null) ? (data.links as Record<string, string>) : undefined,
  };

  return { fm, markdown: md };
}

